/**
 * BattleRoom — one 8-player match (SRS §9.1).
 *
 *   WAITING_PLAYERS → PREP_PHASE (30 s) → COMBAT_PHASE (≤45 s, 20 Hz tick)
 *   → ROUND_RESOLVE → PREP_PHASE … → GAME_OVER (one player left)
 *
 * Rules enforced here (server-authoritative, SRS §5/§9/§10):
 *  - Pairing: 4 pairs per round; with an odd number of survivors the
 *    leftover player fights a "ghost" — a copy of the last eliminated
 *    player's board (SRS §3.3; no elimination yet → PvE monsters).
 *  - Every round gets a fresh round_seed (src/rng.ts). No Math.random()
 *    anywhere in the sim path.
 *  - Combat is the M1 sim ported to TypeScript (src/sim.ts): same formulas,
 *    same draw order, same events. Each pair runs its own PairCombat,
 *    stepped once per 20 Hz room tick; events go ONLY to that pair's two
 *    players (SRS §2.3, ≤5 KB/s/client).
 *  - Prep actions mutate real economy state (src/economy.ts, same rules as
 *    M1): buy/sell/reroll/lock/XP/move. Invalid actions change nothing and
 *    get an s2c_error (SRS §10.2).
 *  - Bots run the M1 Medium bot (src/bot.ts) at prep start, same rules/pool
 *    as players (SRS §11.1).
 *  - Reconnect (§10.3): a client rejoining with its session token gets the
 *    latest s2c_room_state + s2c_board_snapshot and the last 2 s of events
 *    of ITS OWN pair only. Old events are never replayed in full.
 *  - PvE rounds (§9.2): stage 1 rounds 1, 4 and every stage's round 6 are
 *    PvE/boss; stage ≥2 round 4 is PvE. PvE loss damage is halved (§9.3).
 *  - Auth: joining requires a Supabase JWT (verified in onAuth) or a
 *    guest: device id. When Supabase is not configured (dev/test only),
 *    a plain playerId in options is accepted and loudly warned about.
 */
import { Client, Room } from "colyseus";
import type { BalanceConfig } from "../config";
import { loadBalanceConfig, loadEnv } from "../config";
import { loadGameData, type GameData } from "../data";
import { loserDamage, roundKind } from "../combat";
import { mmrDeltaForPlacement } from "../matchmaking";
import { makeRoundSeed, SeededRng } from "../rng";
import type { CombatEvent, S2CMessage } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";
import { createSupabaseClients, recordMatchResult, type SupabaseClients } from "../supabase";
import { guestIdentity, verifyPlayerToken, type PlayerIdentity } from "../auth";
import { getMatchEvents, trackEvent } from "../telemetry";
import { activeBonds } from "../bonds";
import {
  PlayerAntiCheat,
  RATE_LIMIT_MAX_VIOLATIONS,
  RATE_LIMIT_OTHER_PER_SEC,
  RATE_LIMIT_PREP_PER_SEC,
} from "../rateLimit";
import {
  validateActionId,
  validateRoundId,
  validateSellTarget,
  validateShopSlot,
  validateZoneIndex,
} from "../validate";
import {
  liveResultOf,
  verifyRoundReplay,
  type LiveRoundResult,
  type RoundReplayInput,
} from "../replay";
import { getMatchReplays, recordRoundReplay } from "../replayStore";
import { BattleRoomState, PlayerState } from "./BattleRoomState";
import {
  boardCount,
  boardUnits,
  buyShopSlotDetailed,
  buyXp,
  computeIncome,
  gainRoundXp,
  moveUnit,
  newPlayerEconomy,
  newPool,
  returnUnitsToPool,
  rollShop,
  sellUnit,
  setStreak,
  type BoardUnit,
  type PlayerEconomy,
  type SharedPool,
  type Zone,
} from "../economy";
import { unitById } from "../data";
import { takePrepTurn } from "../bot";
import { rivalryPair as rivalryPairBoards } from "../bonds";
import {
  buildGhostCombatants,
  buildPveCombatants,
  buildSideCombatants,
  PairCombat,
  type BoardSlot,
  type SimEvent,
} from "../sim";

const TICK_MS = 50; // 20 Hz, SRS §5.1
const MAX_PLAYERS = 8;
const MAX_ROUNDS = 60; // M1 cap (SRS §9.4)
const RECONNECT_EVENT_WINDOW_MS = 2_000; // SRS §10.3: last 2 s of events only
const START_FALLBACK_MS = 30_000; // start even if a human never joins
const FAST_PREP_SECONDS = 3;
const FAST_COMBAT_SECONDS = 12;

interface RoomOptions {
  mode: "RANKED" | "CASUAL";
  /** [{ playerId, displayName, isBot }] — 8 seats, filled by matchmaking. */
  seats: { playerId: string; displayName: string; isBot: boolean }[];
}

interface Pairing {
  a: string;
  b: string;
  ghost: boolean; // b is a ghost copy of an earlier lineup
}

interface ActivePair {
  key: string;
  kind: "PVP" | "PVE" | "GHOST";
  combat: PairCombat;
  /** Real players who receive this pair's events (1 for PvE/ghost, 2 for PvP). */
  players: string[];
  uidByIid: Map<number, string>;
  finished: boolean;
}

interface PairOutcome {
  won: boolean;
  foeSurvivors: number;
  isPve: boolean;
  ghost: boolean;
  draw: boolean;
}

export class BattleRoom extends Room<BattleRoomState> {
  maxClients = MAX_PLAYERS;

  private cfg: BalanceConfig = loadBalanceConfig();
  private env = loadEnv();
  private supabase: SupabaseClients = createSupabaseClients(this.env);
  private gameData: GameData | null = null;
  private mode: "RANKED" | "CASUAL" = "CASUAL";
  private seats: RoomOptions["seats"] = [];
  private rng: SeededRng = new SeededRng(1);
  private roundSeed = 0;
  private phaseTimer: NodeJS.Timeout | null = null;
  private combatInterval: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private pairings: Pairing[] = [];
  private roundEvents: CombatEvent[] = [];
  private roundSeeds: number[] = [];
  /** Per-pair event log, for the 2 s reconnect window (only the own pair is re-sent). */
  private eventLog: { at: number; roundId: number; tick: number; pairKey: string; events: CombatEvent[] }[] = [];
  private eliminated: string[] = [];
  private matchFinished = false;
  private iidCounter = 0;

  /** Per-player economy (board/bench/shop/gold/level/streak). */
  private economies = new Map<string, PlayerEconomy>();
  private pool: SharedPool = {};
  /** Last eliminated player's board, for the ghost rule (SRS §3.3). */
  private ghostBoard: BoardSlot[] = [];
  private ghostOwnerId = "";
  private activePairs = new Map<string, ActivePair>();
  private pairOfPlayer = new Map<string, string>();
  private pairOutcomes = new Map<string, PairOutcome>();

  /** M4 anti-cheat: per-player rate limiter + action lock + seen action ids. */
  private antiCheat = new Map<string, PlayerAntiCheat>();
  /** M4 replay verification: inputs recorded when combat is built. */
  private replayInputs: RoundReplayInput[] = [];
  /** M4 telemetry: karma_trigger bond ids fired this round (counted). */
  private roundBondTriggers = new Map<string, number>();

  onCreate(options: RoomOptions): void {
    this.mode = options.mode ?? "CASUAL";
    this.seats = options.seats ?? [];
    this.setState(new BattleRoomState());
    this.state.protocolVersion = PROTOCOL_VERSION;
    this.state.phase = "WAITING_PLAYERS";

    try {
      this.gameData = loadGameData();
    } catch (err) {
      console.error(`[room ${this.roomId}] cannot load game data, room will never start:`, err);
      this.gameData = null;
    }
    if (this.gameData) {
      this.pool = newPool(this.gameData.units, this.cfg);
    }

    // Seats are pre-filled by matchmaking (humans + bots). Bots are server
    // actors: they run the same rules/pool/shop as players (SRS §11.1).
    for (const seat of this.seats) {
      const p = new PlayerState();
      p.playerId = seat.playerId;
      p.displayName = seat.displayName;
      p.isBot = seat.isBot;
      p.hp = this.cfg.start_hp;
      p.gold = this.cfg.start_gold;
      p.level = this.cfg.start_level;
      this.state.players.set(seat.playerId, p);
      const eco = newPlayerEconomy(seat.playerId, this.cfg);
      this.economies.set(seat.playerId, eco);
    }

    // Prep actions (SRS §10.1). Every handler validates phase + round_id
    // and answers with s2c_error instead of mutating state on bad input.
    this.onMessage("c2s_move_unit", (client, msg) => this.handlePrepAction(client, msg, "move"));
    this.onMessage("c2s_buy_shop", (client, msg) => this.handlePrepAction(client, msg, "buy"));
    this.onMessage("c2s_sell_unit", (client, msg) => this.handlePrepAction(client, msg, "sell"));
    this.onMessage("c2s_reroll_shop", (client, msg) => this.handlePrepAction(client, msg, "reroll"));
    this.onMessage("c2s_toggle_lock_shop", (client, msg) => this.handlePrepAction(client, msg, "lock"));
    this.onMessage("c2s_buy_xp", (client, msg) => this.handlePrepAction(client, msg, "xp"));
    this.onMessage("c2s_equip_item", (client, msg) => this.handlePrepAction(client, msg, "equip"));

    // Reconnect: same session token → same seat, state re-sent (SRS §10.3).
    // M4: reconnects are rate-limited like any other client message.
    this.onMessage("c2s_reconnect", (client, msg) => {
      void msg;
      const pid = this.playerIdOf(client);
      if (!this.checkRateLimit(client, pid, false)) return;
      const player = this.state.players.get(pid);
      if (!player) return this.sendError(client, "NOT_IN_ROOM", "session is not part of this room");
      player.connected = true;
      this.sendRoomState(client);
      this.sendBoardSnapshot(client);
      // Only the last 2 s of events of THIS player's pair.
      const pairKey = this.pairOfPlayer.get(pid);
      if (!pairKey) return;
      const recent = this.eventLog.filter(
        (e) => e.pairKey === pairKey && Date.now() - e.at <= RECONNECT_EVENT_WINDOW_MS,
      );
      for (const entry of recent) {
        client.send("s2c_combat_events", {
          type: "s2c_combat_events", protocol_version: PROTOCOL_VERSION,
          round_id: entry.roundId, tick: entry.tick, events: entry.events,
        } satisfies S2CMessage);
      }
      trackEvent(this.supabase.service, { name: "reconnect", playerId: pid, matchId: this.roomId, roundId: this.state.roundId });
    });

    console.log(`[room ${this.roomId}] created mode=${this.mode} seats=${this.seats.length}`);
    // The room starts once all human seats have connected (bots are already
    // in); the fallback timer starts it anyway so a missing human cannot
    // stall the room forever.
    const fallbackMs = this.env.fastMode ? 3_000 : START_FALLBACK_MS;
    this.startTimer = setTimeout(() => this.beginMatch(), fallbackMs);
    this.startTimer.unref?.();
  }

  /**
   * Join auth (SRS §11.3). Returns the identity that becomes client.auth,
   * or false to reject the join. A Supabase JWT is verified when present;
   * guests present `playerId: "guest:<deviceId>"`. With Supabase
   * unconfigured (dev/test only) a plain playerId is accepted and warned.
   */
  async onAuth(client: Client, options: { token?: string; playerId?: string; displayName?: string }): Promise<PlayerIdentity | false> {
    void client;
    if (options?.token) {
      const identity = await verifyPlayerToken(this.supabase.anon, options.token);
      return identity ?? false;
    }
    const pid = options?.playerId;
    if (typeof pid === "string" && pid.length > 0) {
      if (pid.startsWith("guest:")) return guestIdentity(pid.slice("guest:".length));
      if (!this.supabase.enabled) {
        console.warn(`[room ${this.roomId}] DEV MODE: accepting unverified playerId ${pid} (Supabase not configured)`);
        return { playerId: pid, displayName: options?.displayName ?? pid, isGuest: false };
      }
      return false;
    }
    return false;
  }

  onJoin(client: Client, options?: { protocol_version?: number; token?: string }): void {
    // protocol_version is checked by the client handshake before join;
    // a mismatch must be rejected here, never silently accepted (SRS §10.3).
    const version = Number(options?.protocol_version ?? PROTOCOL_VERSION);
    if (version !== PROTOCOL_VERSION) {
      this.sendError(client, "VERSION_MISMATCH", `protocol_version ${version} is not supported; update the client (expected ${PROTOCOL_VERSION})`);
      client.leave();
      return;
    }
    const pid = this.playerIdOf(client);
    if (!pid || !this.economies.has(pid)) {
      this.sendError(client, "NOT_A_SEAT", "this player has no seat in the room");
      client.leave();
      return;
    }
    // One account = one live match session (SRS §11.3): a second connection
    // for the same playerId disconnects the older session.
    for (const other of this.clients) {
      if (other !== client && other.auth?.playerId && other.auth.playerId === pid) {
        other.leave();
      }
    }
    const player = this.state.players.get(pid);
    if (player) player.connected = true;
    this.sendRoomState(client);
    this.sendBoardSnapshot(client);
    trackEvent(this.supabase.service, { name: "match_join", playerId: pid, matchId: this.roomId });
    // Start as soon as every human seat is connected.
    if (this.allHumansConnected()) {
      if (this.startTimer) {
        clearTimeout(this.startTimer);
        this.startTimer = null;
      }
      this.beginMatch();
    }
  }

  onLeave(client: Client): void {
    const pid = this.playerIdOf(client);
    const player = this.state.players.get(pid);
    if (player) player.connected = false;
    trackEvent(this.supabase.service, { name: "match_leave", playerId: pid, matchId: this.roomId });
    // A disconnect mid-combat does not stop the sim: the player's units keep
    // fighting (server-authoritative) and the player can reconnect (§10.3).
  }

  onDispose(): void {
    this.clearTimers();
  }

  // ------------------------------------------------------------------ phases

  private beginMatch(): void {
    if (this.state.phase !== "WAITING_PLAYERS") return;
    if (!this.gameData) {
      console.error(`[room ${this.roomId}] cannot start: game data failed to load`);
      return;
    }
    this.startPrepPhase();
  }

  private allHumansConnected(): boolean {
    for (const seat of this.seats) {
      if (seat.isBot) continue;
      const p = this.state.players.get(seat.playerId);
      if (!p?.connected) return false;
    }
    return true;
  }

  private prepSeconds(): number {
    return this.env.fastMode ? FAST_PREP_SECONDS : this.cfg.prep_seconds;
  }

  private combatSeconds(): number {
    return this.env.fastMode ? FAST_COMBAT_SECONDS : this.cfg.combat_seconds;
  }

  private startPrepPhase(): void {
    if (!this.gameData) return;
    this.state.roundId += 1;
    this.state.roundInStage = ((this.state.roundId - 1) % 6) + 1;
    this.state.stage = Math.floor((this.state.roundId - 1) / 6) + 1;
    this.state.phase = "PREP_PHASE";
    this.state.countdownSec = this.prepSeconds();
    this.roundSeed = makeRoundSeed(this.roomId, this.state.roundId);
    this.roundSeeds.push(this.roundSeed);
    this.rng = new SeededRng(this.roundSeed);
    this.roundEvents = [];
    this.activePairs.clear();
    this.pairOfPlayer.clear();
    this.pairOutcomes.clear();
    // M4: fresh anti-cheat round state (action-id dedupe) and replay inputs.
    for (const ac of this.antiCheat.values()) ac.beginRound();
    this.replayInputs = [];
    this.roundBondTriggers.clear();
    // PREP: free refresh (unless locked) for every alive player, then bots
    // take their prep turn immediately (M1 order: roll shop, then bot prep).
    for (const eco of this.economies.values()) {
      if (!eco.alive) continue;
      if (!eco.shopLocked) rollShop(eco, this.gameData.units, this.pool, this.rng, this.cfg, true);
      this.syncPlayerState(eco.playerId);
    }
    for (const eco of this.economies.values()) {
      if (!eco.alive) continue;
      const seat = this.seats.find((s) => s.playerId === eco.playerId);
      if (seat?.isBot) {
        takePrepTurn(eco, this.gameData.units, this.pool, this.rng, this.cfg, this.gameData.bonds);
        this.syncPlayerState(eco.playerId);
      }
    }
    this.broadcastRoomState();
    for (const client of this.clients) this.sendBoardSnapshot(client);
    this.phaseTimer = setTimeout(() => this.startCombatPhase(), this.prepSeconds() * 1000);
    this.phaseTimer.unref?.();
  }

  private startCombatPhase(): void {
    if (!this.gameData) return;
    this.state.phase = "COMBAT_PHASE";
    this.state.countdownSec = this.combatSeconds();
    this.tickCount = 0;
    this.buildPairCombats();
    this.broadcastRoomState();
    this.combatInterval = setInterval(() => this.runCombatTick(), TICK_MS);
    this.combatInterval.unref?.();
  }

  /** Build one PairCombat per pair (PvP / PvE / ghost) for this round. */
  private buildPairCombats(): void {
    if (!this.gameData) return;
    const data = this.gameData;
    const kind = roundKind(this.state.stage, this.state.roundInStage);
    const alive = [...this.economies.values()].filter((e) => e.alive);
    this.pairings = [];
    const addPair = (key: string, pk: "PVP" | "PVE" | "GHOST", combat: PairCombat, players: string[]): void => {
      const uidByIid = new Map<number, string>();
      for (const c of [...combat.sideA, ...combat.sideB]) uidByIid.set(c.iid, c.uid);
      this.activePairs.set(key, { key, kind: pk, combat, players, uidByIid, finished: false });
      for (const pid of players) this.pairOfPlayer.set(pid, key);
    };
    const boardSlots = (eco: PlayerEconomy): BoardSlot[] => {
      const slots: BoardSlot[] = [];
      eco.board.forEach((u, idx) => {
        if (u !== null) slots.push({ unit_id: u.unit_id, star: u.star, idx });
      });
      return slots;
    };

    if (kind === "PVP") {
      const { pairs, ghost } = this.shufflePairs(alive);
      let pairIndex = 0;
      for (const [ecoA, ecoB] of pairs) {
        ecoA.lastOpponent = ecoB.playerId;
        ecoB.lastOpponent = ecoA.playerId;
        const slotsA = boardSlots(ecoA);
        const slotsB = boardSlots(ecoB);
        const iidStartA = this.iidCounter;
        const a = buildSideCombatants(slotsA, 0, ecoA.playerId, data.units, this.cfg, iidStartA, data.bonds);
        const iidStartB = a.nextIid;
        const b = buildSideCombatants(slotsB, 1, ecoB.playerId, data.units, this.cfg, iidStartB, data.bonds);
        this.iidCounter = b.nextIid;
        const pairSeed = this.roundSeed + pairIndex * 7919;
        const combat = new PairCombat(a.combatants, b.combatants, pairSeed, this.cfg);
        const key = `pvp:${ecoA.playerId}|${ecoB.playerId}`;
        this.pairings.push({ a: ecoA.playerId, b: ecoB.playerId, ghost: false });
        addPair(key, "PVP", combat, [ecoA.playerId, ecoB.playerId]);
        // M4 replay input: boards + seed + iid starts reproduce this combat.
        this.replayInputs.push({
          matchId: this.roomId, roundId: this.state.roundId, pairKey: key, kind: "PVP",
          seed: pairSeed, stage: this.state.stage, ris: this.state.roundInStage,
          sideA: { ownerId: ecoA.playerId, slots: slotsA, iidStart: iidStartA },
          sideB: { ownerId: ecoB.playerId, slots: slotsB, iidStart: iidStartB },
        });
        pairIndex += 1;
      }
      if (ghost) {
        const ghostSlots = boardSlots(ghost);
        const iidStartG = this.iidCounter;
        const gp = buildSideCombatants(ghostSlots, 0, ghost.playerId, data.units, this.cfg, iidStartG, data.bonds);
        const iidStartH = gp.nextIid;
        let gh: { combatants: ReturnType<typeof buildSideCombatants>["combatants"]; nextIid: number };
        if (this.ghostBoard.length > 0) {
          gh = buildGhostCombatants(this.ghostBoard, this.ghostOwnerId, data.units, this.cfg, iidStartH);
        } else {
          // No one eliminated yet: ghost falls back to PvE monsters (M1).
          gh = buildPveCombatants(this.state.stage, this.state.roundInStage, data.pve, this.cfg, iidStartH);
        }
        this.iidCounter = gh.nextIid;
        const ghostSeed = this.roundSeed + 555;
        const combat = new PairCombat(gp.combatants, gh.combatants, ghostSeed, this.cfg);
        const key = `ghost:${ghost.playerId}`;
        this.pairings.push({ a: ghost.playerId, b: this.ghostOwnerId, ghost: true });
        addPair(key, "GHOST", combat, [ghost.playerId]);
        this.replayInputs.push({
          matchId: this.roomId, roundId: this.state.roundId, pairKey: key, kind: "GHOST",
          seed: ghostSeed, stage: this.state.stage, ris: this.state.roundInStage,
          sideA: { ownerId: ghost.playerId, slots: ghostSlots, iidStart: iidStartG },
          sideB: this.ghostBoard.length > 0
            ? { ownerId: this.ghostOwnerId, slots: [...this.ghostBoard], iidStart: iidStartH }
            : { pve: true, iidStart: iidStartH },
          ghostOwnerId: this.ghostOwnerId,
        });
      }
    } else {
      // PvE / boss: every alive player fights monsters (no pairing).
      let playerIndex = 0;
      for (const eco of alive) {
        const slots = boardSlots(eco);
        const iidStartA = this.iidCounter;
        const a = buildSideCombatants(slots, 0, eco.playerId, data.units, this.cfg, iidStartA, data.bonds);
        const iidStartB = a.nextIid;
        const m = buildPveCombatants(this.state.stage, this.state.roundInStage, data.pve, this.cfg, iidStartB);
        this.iidCounter = m.nextIid;
        const pveSeed = this.roundSeed + playerIndex * 131;
        const combat = new PairCombat(a.combatants, m.combatants, pveSeed, this.cfg);
        const key = `pve:${eco.playerId}`;
        addPair(key, "PVE", combat, [eco.playerId]);
        this.replayInputs.push({
          matchId: this.roomId, roundId: this.state.roundId, pairKey: key, kind: "PVE",
          seed: pveSeed, stage: this.state.stage, ris: this.state.roundInStage,
          sideA: { ownerId: eco.playerId, slots, iidStart: iidStartA },
          sideB: { pve: true, iidStart: iidStartB },
        });
        playerIndex += 1;
      }
    }
  }

  /**
   * Pairing shuffle, ported from M1 _shuffle_pairs: try up to 8 shuffles,
   * keep the one with the fewest repeat matchups (last_opponent).
   */
  private shufflePairs(alive: PlayerEconomy[]): { pairs: [PlayerEconomy, PlayerEconomy][]; ghost: PlayerEconomy | null } {
    let best: PlayerEconomy[] = [];
    let bestRepeats = 999;
    for (let attempt = 0; attempt < 8; attempt++) {
      const order = [...alive];
      for (let i = order.length - 1; i > 0; i--) {
        const j = this.rng.nextInt(0, i);
        [order[i], order[j]] = [order[j], order[i]];
      }
      let repeats = 0;
      for (let i = 0; i + 1 < order.length; i += 2) {
        if (order[i].lastOpponent === order[i + 1].playerId) repeats += 1;
      }
      if (repeats < bestRepeats) {
        bestRepeats = repeats;
        best = order;
      }
      if (repeats === 0) break;
    }
    const pairs: [PlayerEconomy, PlayerEconomy][] = [];
    let i = 0;
    while (i + 1 < best.length) {
      pairs.push([best[i], best[i + 1]]);
      i += 2;
    }
    return { pairs, ghost: i < best.length ? best[i] : null };
  }

  /** One 20 Hz tick: step every unfinished pair combat, route events per pair. */
  private runCombatTick(): void {
    this.tickCount += 1;
    this.state.tick = this.tickCount;
    let allFinished = true;
    for (const pair of this.activePairs.values()) {
      if (pair.finished) continue;
      const simEvents = pair.combat.step();
      if (pair.combat.finished) pair.finished = true;
      else allFinished = false;
      if (simEvents.length > 0) {
        const wire = simEvents.map((e) => this.translateEvent(e, pair.uidByIid));
        this.roundEvents.push(...wire);
        this.eventLog.push({ at: Date.now(), roundId: this.state.roundId, tick: this.tickCount, pairKey: pair.key, events: wire });
        // M4 telemetry: count karma_trigger bonds fired this round.
        for (const e of wire) {
          if (e.type === "karma_trigger" && e.skill_id) {
            this.roundBondTriggers.set(e.skill_id, (this.roundBondTriggers.get(e.skill_id) ?? 0) + 1);
          }
        }
        this.sendToPair(pair, wire);
      }
    }
    if (allFinished || this.tickCount >= this.combatSeconds() * this.cfg.tick_hz) {
      // Time cap: undecided pairs fall back to the HP-fraction rule (M1).
      for (const pair of this.activePairs.values()) {
        if (!pair.finished) {
          pair.combat.forceDecideByHpFraction();
          pair.finished = true;
        }
      }
      this.endCombatPhase();
    }
  }

  /** Translate a sim event (numeric iids) to a wire CombatEvent (uids). */
  private translateEvent(ev: SimEvent, uidByIid: Map<number, string>): CombatEvent {
    const uid = (iid: number | undefined): string | undefined =>
      iid === undefined || iid < 0 ? undefined : uidByIid.get(iid);
    switch (ev.k) {
      case "move":
      case "assassin_jump":
        // Protocol has no assassin_jump type: both are "move" with a cell.
        return { tick: ev.t, type: "move", unit_uid: uid(ev.a) ?? null, hex_index: ev.cell };
      case "damage":
        return { tick: ev.t, type: "damage", unit_uid: uid(ev.a) ?? null, target_uid: uid(ev.b) ?? null, amount: ev.dmg };
      case "death":
        return { tick: ev.t, type: "death", unit_uid: uid(ev.a) ?? null };
      case "skill_cast":
        return { tick: ev.t, type: "skill_cast", unit_uid: uid(ev.a) ?? null, skill_id: ev.s, amount: ev.dmg };
      case "dodge":
        return { tick: ev.t, type: "damage", unit_uid: uid(ev.a) ?? null, target_uid: uid(ev.b) ?? null, dodged: true };
      case "extra_shot":
        return { tick: ev.t, type: "attack", unit_uid: uid(ev.a) ?? null, target_uid: uid(ev.b) ?? null };
      case "karma_trigger":
        // SRS §10.2: karma_trigger events; the bond id rides in skill_id
        // (no protocol version change — the field is a free-form string).
        return { tick: ev.t, type: "karma_trigger", unit_uid: uid(ev.a) ?? null, target_uid: uid(ev.b) ?? null, skill_id: ev.bond };
    }
  }

  private endCombatPhase(): void {
    this.clearTimers();
    this.state.phase = "ROUND_RESOLVE";
    this.resolveRound();
  }

  /** bond_hoang_de (RIVALRY, SRS §7.4): Napoleon vs Arthur in a PvP pair —
   * the duel winner deals +2 player damage. Mirrors M1Match._rivalry_pair. */
  private rivalryPair(playerId: string): boolean {
    const pairing = this.pairings.find((pr) => !pr.ghost && (pr.a === playerId || pr.b === playerId));
    if (!pairing) return false;
    const otherId = pairing.a === playerId ? pairing.b : pairing.a;
    const ecoA = this.economies.get(playerId);
    const ecoB = this.economies.get(otherId);
    if (!ecoA || !ecoB) return false;
    const ids = (eco: PlayerEconomy): string[] =>
      eco.board.filter((u): u is BoardUnit => u !== null).map((u) => u.unit_id);
    return rivalryPairBoards(ids(ecoA), ids(ecoB));
  }

  /** Apply loser damage (§9.3), income (§4.4), eliminations, then next prep or game over. */
  private resolveRound(): void {
    if (!this.gameData) return;
    const kind = roundKind(this.state.stage, this.state.roundInStage);
    const isPve = kind !== "PVP";
    // Outcomes from the sim (per-pair), mirroring M1 _resolve_round.
    this.pairOutcomes.clear();
    for (const pair of this.activePairs.values()) {
      const res = pair.combat.result();
      if (pair.kind === "PVP") {
        const [aId, bId] = pair.players;
        if (res.winner === 0) {
          this.pairOutcomes.set(aId, { won: true, foeSurvivors: res.survivorsB, isPve: false, ghost: false, draw: false });
          this.pairOutcomes.set(bId, { won: false, foeSurvivors: res.survivorsA, isPve: false, ghost: false, draw: false });
        } else if (res.winner === 1) {
          this.pairOutcomes.set(bId, { won: true, foeSurvivors: res.survivorsA, isPve: false, ghost: false, draw: false });
          this.pairOutcomes.set(aId, { won: false, foeSurvivors: res.survivorsB, isPve: false, ghost: false, draw: false });
        } else {
          this.pairOutcomes.set(aId, { won: false, foeSurvivors: res.survivorsB, isPve: false, ghost: false, draw: true });
          this.pairOutcomes.set(bId, { won: false, foeSurvivors: res.survivorsA, isPve: false, ghost: false, draw: true });
        }
      } else {
        // PVE or GHOST: only the real player gets a result.
        const pid = pair.players[0];
        const won = res.winner === 0;
        this.pairOutcomes.set(pid, {
          won,
          foeSurvivors: res.survivorsB,
          isPve: pair.kind === "PVE",
          ghost: pair.kind === "GHOST",
          draw: res.winner === -1,
        });
      }
    }

    // M4 replay verification: record every pair's live result now (the
    // combats are final), then verify asynchronously so the 20 Hz loop
    // and the next prep phase are never blocked by re-simulation.
    const records: { input: RoundReplayInput; live: LiveRoundResult }[] = [];
    for (const input of this.replayInputs) {
      const pair = this.activePairs.get(input.pairKey);
      if (!pair) continue;
      const live = liveResultOf(pair.combat);
      recordRoundReplay(input, live);
      records.push({ input, live });
    }
    setImmediate(() => {
      if (!this.gameData) return;
      for (const { input } of records) {
        const stored = getMatchReplays(this.roomId).find(
          (r) => r.pairKey === input.pairKey && r.roundId === input.roundId,
        );
        if (!stored) continue;
        const v = verifyRoundReplay(stored, this.gameData, this.cfg);
        if (v.ok) {
          trackEvent(this.supabase.service, {
            name: "replay_verified", playerId: "room", matchId: this.roomId, roundId: input.roundId,
            payload: { pair: input.pairKey, hash: v.liveHash.slice(0, 12) },
          });
        } else {
          console.error(`[room ${this.roomId}] REPLAY MISMATCH round ${input.roundId} ${input.pairKey}: ${v.mismatch}`);
          trackEvent(this.supabase.service, {
            name: "replay_mismatch", playerId: "room", matchId: this.roomId, roundId: input.roundId,
            payload: { pair: input.pairKey, reason: v.mismatch },
          });
          trackEvent(this.supabase.service, {
            name: "cheat_suspect", playerId: "room", matchId: this.roomId, roundId: input.roundId,
            payload: { reason: "replay_mismatch", pair: input.pairKey, detail: v.mismatch },
          });
        }
      }
    });

    const perPlayerResult = new Map<string, { won: boolean; damage: number; income: number }>();
    for (const eco of this.economies.values()) {
      if (!eco.alive) continue;
      const outcome = this.pairOutcomes.get(eco.playerId);
      if (!outcome) continue; // defensive: every alive player fights each round
      const won = outcome.won && !outcome.draw;
      if (!outcome.isPve) setStreak(eco, won);
      if (won) eco.wins += 1;
      else eco.losses += 1;
      const income = computeIncome(eco, won && !outcome.isPve, this.cfg);
      eco.gold += income;
      gainRoundXp(eco, this.cfg);
      let damage = won ? 0 : loserDamage(this.state.stage, outcome.foeSurvivors, this.cfg, outcome.isPve);
      if (!won && !outcome.isPve && this.rivalryPair(eco.playerId)) damage += 2; // bond_hoang_de
      eco.hp = Math.max(0, eco.hp - damage);
      perPlayerResult.set(eco.playerId, { won, damage, income });
      this.syncPlayerState(eco.playerId);
    }

    const eliminatedNow: string[] = [];
    for (const eco of this.economies.values()) {
      if (!eco.alive || eco.hp > 0) continue;
      eco.alive = false;
      this.eliminated.push(eco.playerId);
      eliminatedNow.push(eco.playerId);
      // Snapshot the board for the ghost rule (SRS §3.3).
      this.ghostBoard = [];
      eco.board.forEach((u, idx) => {
        if (u !== null) this.ghostBoard.push({ unit_id: u.unit_id, star: u.star, idx });
      });
      this.ghostOwnerId = eco.playerId;
      returnUnitsToPool(eco, this.pool);
      const p = this.state.players.get(eco.playerId);
      if (p) p.alive = false;
      this.state.eliminatedOrder.push(eco.playerId);
      this.syncPlayerState(eco.playerId);
    }

    // Per-player round result (each client sees its own numbers).
    for (const client of this.clients) {
      const pid = this.playerIdOf(client);
      const r = perPlayerResult.get(pid);
      if (!r) continue;
      client.send("s2c_round_result", {
        type: "s2c_round_result", protocol_version: PROTOCOL_VERSION, round_id: this.state.roundId,
        result: r.won ? "win" : "loss", damage_taken: r.damage, gold_earned: r.income, eliminated: eliminatedNow,
      } satisfies S2CMessage);
      // M4 telemetry: per-player round result + end-of-round lineup
      // (SRS §11.4) — feeds win-rate-by-nation/class/bond aggregation.
      const eco = this.economies.get(pid);
      const lineup = eco ? this.lineupSummary(eco) : { units: [] as string[], nations: [] as string[], classes: [] as string[], bonds: [] as string[] };
      trackEvent(this.supabase.service, {
        name: "round_result", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
        payload: {
          result: r.won ? "win" : "loss", damage_taken: r.damage, gold_earned: r.income,
          nations: lineup.nations, classes: lineup.classes, bonds: lineup.bonds,
        },
      });
      trackEvent(this.supabase.service, {
        name: "round_lineup", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
        payload: { units: lineup.units, nations: lineup.nations, classes: lineup.classes, bonds: lineup.bonds },
      });
    }
    // M4 telemetry: bond triggers fired this round (counted, one event per bond).
    for (const [bondId, count] of this.roundBondTriggers) {
      trackEvent(this.supabase.service, {
        name: "bond_trigger", playerId: "room", matchId: this.roomId, roundId: this.state.roundId,
        payload: { bond_id: bondId, count },
      });
    }
    this.roundBondTriggers.clear();
    trackEvent(this.supabase.service, {
      name: "round_result", playerId: "room", matchId: this.roomId, roundId: this.state.roundId,
      payload: { eliminated: eliminatedNow },
    });
    this.broadcastRoomState();

    const aliveCount = [...this.economies.values()].filter((e) => e.alive).length;
    if (aliveCount <= 1 || this.state.roundId >= MAX_ROUNDS) {
      void this.finishMatch();
    } else {
      this.startPrepPhase();
    }
  }

  private async finishMatch(): Promise<void> {
    this.state.phase = "GAME_OVER";
    this.matchFinished = true;
    // Standings: last alive is 1st; the rest by elimination order (latest
    // eliminated = higher placement; same-round ties by pre-round HP, §9.4).
    const alive = [...this.economies.values()].filter((e) => e.alive).map((e) => e.playerId);
    const standingsIds = [...alive, ...[...this.eliminated].reverse()];
    const botFill = this.seats.some((s) => s.isBot);
    const standings = standingsIds.map((playerId, i) => {
      const placement = i + 1;
      const p = this.state.players.get(playerId);
      return {
        playerId,
        placement,
        mmrDelta: p?.isBot ? 0 : mmrDeltaForPlacement(placement, botFill),
        isBot: p?.isBot ?? false,
        hpRemaining: p?.hp ?? 0,
      };
    });
    this.broadcast("s2c_game_over", {
      type: "s2c_game_over", protocol_version: PROTOCOL_VERSION,
      standings: standings.map((s) => ({ player_id: s.playerId, placement: s.placement, mmr_delta: s.mmrDelta })),
    } satisfies S2CMessage);
    // M4 telemetry: match summary (standings) for meta aggregation.
    trackEvent(this.supabase.service, {
      name: "match_summary", playerId: "room", matchId: this.roomId,
      payload: {
        mode: this.mode, rounds: this.state.roundId,
        standings: standings.map((s) => ({ player_id: s.playerId, placement: s.placement })),
      },
    });
    // Persist (best-effort; never blocks the room). Bots are recorded as
    // match_players with is_bot=true and are flagged in history (§11.1).
    await recordMatchResult(this.supabase, {
      matchId: this.roomId,
      mode: this.mode,
      botFill,
      roundSeeds: this.roundSeeds,
      standings,
    });
  }

  // ------------------------------------------------------------------ actions

  /**
   * Prep-phase actions (SRS §9.1/§10.3 + §13.2). Every action validates
   * first and mutates only on success, using the M1 economy rules
   * (src/economy.ts — same prices, XP table, pool sizes, board cap =
   * level as Godot). Rejected actions change nothing, get an s2c_error,
   * and are logged as `action_rejected` + `cheat_suspect` telemetry with
   * the exact reason (M4). A wrong action is never applied partially.
   *
   * Validation order: rate limit → action lock → phase → round_id →
   * action_id dedupe → seat/alive → per-action shape + economy rules.
   */
  private handlePrepAction(client: Client, msg: Record<string, unknown>, kind: string): void {
    const pid = this.playerIdOf(client);
    // M4 rate limit (10/s in PREP, 2/s otherwise); trips lock actions
    // until end of round and count toward disconnect (SRS §13.2).
    if (!this.checkRateLimit(client, pid, true)) return;
    const ac = this.antiCheatFor(pid);
    if (ac.isLockedForRound(this.state.roundId)) {
      return this.rejectAction(client, pid, kind, "ACTION_LOCKED",
        `prep actions locked for round ${this.state.roundId} after rate-limit`, "rate_limit_lock");
    }
    if (this.state.phase !== "PREP_PHASE") {
      return this.rejectAction(client, pid, kind, "WRONG_PHASE",
        `action ${kind} is only allowed in PREP_PHASE`, "wrong_phase");
    }
    const roundErr = validateRoundId(msg.round_id, this.state.roundId);
    if (roundErr) {
      return this.rejectAction(client, pid, kind, roundErr.code, roundErr.reason, "stale_round");
    }
    const actionErr = validateActionId(msg.action_id, ac.seenActionIds);
    if (actionErr) {
      return this.rejectAction(client, pid, kind, actionErr.code, actionErr.reason, "duplicate_action");
    }
    if (typeof msg.action_id === "string") ac.seenActionIds.add(msg.action_id);
    const eco = this.economies.get(pid);
    if (!eco || !eco.alive) {
      return this.rejectAction(client, pid, kind, "NOT_IN_ROOM",
        "no live seat for this player in the room", "not_in_room");
    }
    if (!this.gameData) {
      return this.rejectAction(client, pid, kind, "NO_GAME_DATA", "game data failed to load", "no_game_data");
    }
    const units = this.gameData.units;
    let ok = false;
    let telemetryName: "buy" | "sell" | "reroll" | "buy_xp" | null = null;
    let boughtUnitId: string | undefined;
    let soldUnit: { unit_id: string; star: number; price: number } | undefined;
    switch (kind) {
      case "move": {
        const from = validateZoneIndex(msg.from);
        if ("code" in from) {
          return this.rejectAction(client, pid, kind, from.code, from.reason, "bad_move");
        }
        const to = validateZoneIndex(msg.to);
        if ("code" in to) {
          return this.rejectAction(client, pid, kind, to.code, to.reason, "bad_move");
        }
        ok = moveUnit(eco, from, to);
        if (!ok) {
          return this.rejectAction(client, pid, kind, "INVALID_MOVE",
            "cannot move that unit there (board cap = level, cell occupied, or bench full)", "invalid_move");
        }
        break;
      }
      case "buy": {
        const slotErr = validateShopSlot(msg.shop_slot);
        if (slotErr) {
          return this.rejectAction(client, pid, kind, slotErr.code, slotErr.reason, "bad_shop_slot");
        }
        const res = buyShopSlotDetailed(eco, units, this.pool, msg.shop_slot as number, this.cfg);
        if (!res.ok) {
          const detail: Record<string, string> = {
            bad_slot: "shop slot out of range",
            empty_slot: "shop slot is empty",
            no_unit: "shop unit not found in game data",
            insufficient_gold: "not enough gold for that unit",
            pool_empty: "unit pool is empty",
            bench_full: "bench is full (9)",
          };
          return this.rejectAction(client, pid, kind, "BUY_FAILED",
            detail[res.reason ?? "empty_slot"], `buy_failed:${res.reason ?? "empty_slot"}`);
        }
        ok = true;
        telemetryName = "buy";
        boughtUnitId = res.unitId;
        break;
      }
      case "sell": {
        const sellErr = validateSellTarget(msg.zone, msg.index);
        if (sellErr) {
          return this.rejectAction(client, pid, kind, sellErr.code, sellErr.reason, "bad_sell");
        }
        const zone = msg.zone as Zone;
        const index = msg.index as number;
        const target = zone === "BENCH" ? eco.bench[index] : eco.board[index];
        const res = sellUnit(eco, this.pool, units, zone, index);
        if (!res.ok || !target) {
          return this.rejectAction(client, pid, kind, "SELL_FAILED",
            "no unit at that bench/board slot", "sell_failed");
        }
        ok = true;
        telemetryName = "sell";
        soldUnit = { unit_id: target.unit_id, star: target.star, price: res.price };
        break;
      }
      case "reroll": {
        ok = rollShop(eco, units, this.pool, this.rng, this.cfg, false);
        if (!ok) {
          return this.rejectAction(client, pid, kind, "REROLL_FAILED",
            "not enough gold to reroll (2 gold)", "reroll_failed:insufficient_gold");
        }
        telemetryName = "reroll";
        break;
      }
      case "lock": {
        eco.shopLocked = !eco.shopLocked;
        ok = true;
        break;
      }
      case "xp": {
        if (eco.level >= this.cfg.level_cap) {
          return this.rejectAction(client, pid, kind, "XP_FAILED",
            "level cap 9 reached", "xp_failed:level_cap");
        }
        ok = buyXp(eco, this.cfg);
        if (!ok) {
          return this.rejectAction(client, pid, kind, "XP_FAILED",
            "cannot buy XP (not enough gold)", "xp_failed:insufficient_gold");
        }
        telemetryName = "buy_xp";
        break;
      }
      case "equip": {
        // M1 has no items (SRS §8 lands in M2 only as data); reject honestly.
        return this.rejectAction(client, pid, kind, "NOT_SUPPORTED",
          "items are not in the M1 scope", "items_not_supported");
      }
      default:
        return this.rejectAction(client, pid, kind, "UNKNOWN_ACTION",
          `unknown prep action ${kind}`, "unknown_action");
    }
    if (!ok) return; // unreachable: every branch returns on failure
    // M4 defense-in-depth: the economy must never go negative or over
    // the board cap, whatever the client sent. A violation here is a
    // server bug or tampering — log it loudly, do not crash the room.
    this.checkEconomyInvariant(pid, eco, kind);
    this.syncPlayerState(pid);
    this.sendRoomState(client);
    this.sendBoardSnapshot(client);
    if (telemetryName === "buy" && boughtUnitId) {
      const def = unitById(units, boughtUnitId);
      trackEvent(this.supabase.service, {
        name: "buy", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
        payload: { unit_id: boughtUnitId, nation_id: def?.nation_id, class_id: def?.class_id, cost: def?.cost },
      });
    } else if (telemetryName === "sell" && soldUnit) {
      const def = unitById(units, soldUnit.unit_id);
      trackEvent(this.supabase.service, {
        name: "sell", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
        payload: { unit_id: soldUnit.unit_id, star: soldUnit.star, price: soldUnit.price, nation_id: def?.nation_id, class_id: def?.class_id },
      });
    } else if (telemetryName) {
      trackEvent(this.supabase.service, { name: telemetryName, playerId: pid, matchId: this.roomId, roundId: this.state.roundId });
    }
  }

  // ------------------------------------------------------- M4 anti-cheat

  private antiCheatFor(pid: string): PlayerAntiCheat {
    let ac = this.antiCheat.get(pid);
    if (!ac) {
      ac = new PlayerAntiCheat();
      this.antiCheat.set(pid, ac);
    }
    return ac;
  }

  /**
   * Rate-limit gate (SRS §13.2). PREP allows 10 actions/s, every other
   * phase 2/s. A trip locks the player's prep actions until the end of
   * the current round; 5 trips in one match drops the session.
   * Returns false when the message must be dropped.
   */
  private checkRateLimit(client: Client, pid: string, isPrepAction: boolean): boolean {
    if (!pid) return true; // unauthenticated: nothing to limit yet
    const ac = this.antiCheatFor(pid);
    const limit = this.state.phase === "PREP_PHASE" ? RATE_LIMIT_PREP_PER_SEC : RATE_LIMIT_OTHER_PER_SEC;
    if (ac.limiter.allow(Date.now(), limit)) return true;
    const mustDrop = ac.recordViolation();
    if (isPrepAction) ac.lockForRound(this.state.roundId);
    this.sendError(client, "RATE_LIMITED",
      `too many actions (${limit}/s in ${this.state.phase}); prep actions locked until end of round ${this.state.roundId}`);
    trackEvent(this.supabase.service, {
      name: "rate_limited", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
      payload: { limit_per_sec: limit, phase: this.state.phase, violations: ac.violations },
    });
    if (mustDrop) {
      console.warn(`[room ${this.roomId}] dropping ${pid}: ${RATE_LIMIT_MAX_VIOLATIONS} rate-limit violations`);
      trackEvent(this.supabase.service, {
        name: "rate_limit_disconnect", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
        payload: { violations: ac.violations },
      });
      trackEvent(this.supabase.service, {
        name: "cheat_suspect", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
        payload: { reason: "rate_limit_exceeded", violations: ac.violations },
      });
      client.leave();
    }
    return false;
  }

  /**
   * Reject one action: s2c_error to the client + audit telemetry.
   * `cheat_suspect` is an AUDIT event, not an automatic ban — its
   * reason separates benign failures (insufficient_gold, empty_slot)
   * from abuse patterns (duplicate_action, stale_round, rate-limit).
   */
  private rejectAction(
    client: Client, pid: string, kind: string,
    code: string, reason: string, suspectReason: string,
  ): void {
    this.sendError(client, code, reason);
    trackEvent(this.supabase.service, {
      name: "action_rejected", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
      payload: { action: kind, code, reason },
    });
    trackEvent(this.supabase.service, {
      name: "cheat_suspect", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
      payload: { reason: suspectReason, action: kind, detail: reason },
    });
  }

  /** Post-action invariant: gold, bench and board must stay legal. */
  private checkEconomyInvariant(pid: string, eco: PlayerEconomy, action: string): void {
    const problems: string[] = [];
    if (eco.gold < 0) problems.push(`negative gold ${eco.gold}`);
    if (eco.bench.length > 9) problems.push(`bench overflow ${eco.bench.length}`);
    if (boardCount(eco) > eco.level) problems.push(`board ${boardCount(eco)} > level ${eco.level}`);
    if (eco.level < 1 || eco.level > this.cfg.level_cap) problems.push(`level ${eco.level} out of range`);
    if (problems.length === 0) return;
    console.error(`[room ${this.roomId}] INVARIANT VIOLATION ${pid} after ${action}: ${problems.join("; ")}`);
    trackEvent(this.supabase.service, {
      name: "cheat_suspect", playerId: pid, matchId: this.roomId, roundId: this.state.roundId,
      payload: { reason: "invariant_violation", action, detail: problems.join("; ") },
    });
  }

  /** End-of-round lineup summary for telemetry (SRS §11.4). */
  private lineupSummary(eco: PlayerEconomy): { units: string[]; nations: string[]; classes: string[]; bonds: string[] } {
    if (!this.gameData) return { units: [], nations: [], classes: [], bonds: [] };
    const units = boardUnits(eco).map((u) => u.unit_id);
    const defs = units
      .map((uid) => unitById(this.gameData!.units, uid))
      .filter((d): d is NonNullable<typeof d> => d !== undefined);
    return {
      units,
      nations: [...new Set(defs.map((d) => d.nation_id))],
      classes: [...new Set(defs.map((d) => d.class_id))],
      bonds: activeBonds(units, this.gameData.bonds).map((b) => b.bond_id),
    };
  }

  // ------------------------------------------------------------------ helpers

  private playerIdOf(client: Client): string {
    return (client.auth?.playerId as string | undefined) ?? "";
  }

  private syncPlayerState(playerId: string): void {
    const eco = this.economies.get(playerId);
    const p = this.state.players.get(playerId);
    if (!eco || !p) return;
    p.hp = eco.hp;
    p.gold = eco.gold;
    p.level = eco.level;
    p.xp = eco.xpTotal;
    p.streak = eco.streak;
    p.alive = eco.alive;
    p.shopJson = JSON.stringify(eco.shop);
    p.shopLocked = eco.shopLocked;
  }

  private sendError(client: Client, code: string, message: string): void {
    client.send("s2c_error", {
      type: "s2c_error", protocol_version: PROTOCOL_VERSION, code, message,
    } satisfies S2CMessage);
  }

  private broadcastRoomState(): void {
    this.broadcast("s2c_room_state", {
      type: "s2c_room_state", protocol_version: PROTOCOL_VERSION,
      phase: this.state.phase, countdown_sec: this.state.countdownSec,
      round_id: this.state.roundId,
      players: [...this.state.players.values()].map((p) => ({
        player_id: p.playerId, hp: p.hp, gold: p.gold, level: p.level,
        xp: p.xp, streak: p.streak, alive: p.alive, is_bot: p.isBot,
      })),
    } satisfies S2CMessage);
  }

  private sendRoomState(client: Client): void {
    client.send("s2c_room_state", {
      type: "s2c_room_state", protocol_version: PROTOCOL_VERSION,
      phase: this.state.phase, countdown_sec: this.state.countdownSec,
      round_id: this.state.roundId,
      players: [...this.state.players.values()].map((p) => ({
        player_id: p.playerId, hp: p.hp, gold: p.gold, level: p.level,
        xp: p.xp, streak: p.streak, alive: p.alive, is_bot: p.isBot,
      })),
    } satisfies S2CMessage);
  }

  /** Full board + bench for one player (join / scout / reconnect, §10.2). */
  private sendBoardSnapshot(client: Client): void {
    const playerId = this.playerIdOf(client);
    const eco = this.economies.get(playerId);
    const board: Record<number, BoardUnit> = {};
    const bench: BoardUnit[] = [];
    if (eco) {
      eco.board.forEach((u, idx) => {
        if (u !== null) board[idx] = { unit_id: u.unit_id, star: u.star };
      });
      bench.push(...eco.bench.map((u) => ({ unit_id: u.unit_id, star: u.star })));
    }
    client.send("s2c_board_snapshot", {
      type: "s2c_board_snapshot", protocol_version: PROTOCOL_VERSION,
      round_id: this.state.roundId, player_id: playerId, board, bench,
    } satisfies S2CMessage);
  }

  /** Combat events go only to the players of that pair (SRS §2.3). */
  private sendToPair(pair: ActivePair, events: CombatEvent[]): void {
    const payload = {
      type: "s2c_combat_events", protocol_version: PROTOCOL_VERSION,
      round_id: this.state.roundId, tick: this.tickCount, events,
    } satisfies S2CMessage;
    const wanted = new Set(pair.players);
    for (const client of this.clients) {
      if (wanted.has(this.playerIdOf(client))) {
        client.send("s2c_combat_events", payload);
      }
    }
  }

  private clearTimers(): void {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    if (this.combatInterval) { clearInterval(this.combatInterval); this.combatInterval = null; }
    if (this.startTimer) { clearTimeout(this.startTimer); this.startTimer = null; }
  }
}
