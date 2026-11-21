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
import { trackEvent } from "../telemetry";
import { BattleRoomState, PlayerState } from "./BattleRoomState";
import {
  buyShopSlot,
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
    this.onMessage("c2s_reconnect", (client, msg) => {
      void msg;
      const pid = this.playerIdOf(client);
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
        const a = buildSideCombatants(boardSlots(ecoA), 0, ecoA.playerId, data.units, this.cfg, this.iidCounter, data.bonds);
        this.iidCounter = a.nextIid;
        const b = buildSideCombatants(boardSlots(ecoB), 1, ecoB.playerId, data.units, this.cfg, this.iidCounter, data.bonds);
        this.iidCounter = b.nextIid;
        const combat = new PairCombat(a.combatants, b.combatants, this.roundSeed + pairIndex * 7919, this.cfg);
        const key = `pvp:${ecoA.playerId}|${ecoB.playerId}`;
        this.pairings.push({ a: ecoA.playerId, b: ecoB.playerId, ghost: false });
        addPair(key, "PVP", combat, [ecoA.playerId, ecoB.playerId]);
        pairIndex += 1;
      }
      if (ghost) {
        const gp = buildSideCombatants(boardSlots(ghost), 0, ghost.playerId, data.units, this.cfg, this.iidCounter, data.bonds);
        this.iidCounter = gp.nextIid;
        let gh: { combatants: ReturnType<typeof buildSideCombatants>["combatants"]; nextIid: number };
        if (this.ghostBoard.length > 0) {
          gh = buildGhostCombatants(this.ghostBoard, this.ghostOwnerId, data.units, this.cfg, this.iidCounter);
        } else {
          // No one eliminated yet: ghost falls back to PvE monsters (M1).
          gh = buildPveCombatants(this.state.stage, this.state.roundInStage, data.pve, this.cfg, this.iidCounter);
        }
        this.iidCounter = gh.nextIid;
        const combat = new PairCombat(gp.combatants, gh.combatants, this.roundSeed + 555, this.cfg);
        const key = `ghost:${ghost.playerId}`;
        this.pairings.push({ a: ghost.playerId, b: this.ghostOwnerId, ghost: true });
        addPair(key, "GHOST", combat, [ghost.playerId]);
      }
    } else {
      // PvE / boss: every alive player fights monsters (no pairing).
      let playerIndex = 0;
      for (const eco of alive) {
        const a = buildSideCombatants(boardSlots(eco), 0, eco.playerId, data.units, this.cfg, this.iidCounter, data.bonds);
        this.iidCounter = a.nextIid;
        const m = buildPveCombatants(this.state.stage, this.state.roundInStage, data.pve, this.cfg, this.iidCounter);
        this.iidCounter = m.nextIid;
        const combat = new PairCombat(a.combatants, m.combatants, this.roundSeed + playerIndex * 131, this.cfg);
        addPair(`pve:${eco.playerId}`, "PVE", combat, [eco.playerId]);
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
    }
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
   * Prep-phase actions (SRS §9.1/§10.3). Every action validates first and
   * mutates only on success, using the M1 economy rules (src/economy.ts —
   * same prices, XP table, pool sizes, board cap = level as Godot).
   * Rejected actions change nothing and get an s2c_error.
   */
  private handlePrepAction(client: Client, msg: Record<string, unknown>, kind: string): void {
    if (this.state.phase !== "PREP_PHASE") {
      return this.sendError(client, "WRONG_PHASE", `action ${kind} is only allowed in PREP_PHASE`);
    }
    if (typeof msg.round_id === "number" && msg.round_id !== this.state.roundId) {
      return this.sendError(client, "STALE_ROUND", `round_id ${msg.round_id} does not match current round ${this.state.roundId}`);
    }
    const pid = this.playerIdOf(client);
    const eco = this.economies.get(pid);
    if (!eco || !eco.alive) {
      return this.sendError(client, "NOT_IN_ROOM", "no live seat for this player in the room");
    }
    if (!this.gameData) {
      return this.sendError(client, "NO_GAME_DATA", "game data failed to load");
    }
    const units = this.gameData.units;
    let ok = false;
    let telemetryName: "buy" | "sell" | "reroll" | "buy_xp" | null = null;
    switch (kind) {
      case "move": {
        const from = asZoneIndex(msg.from);
        const to = asZoneIndex(msg.to);
        if (!from || !to) return this.sendError(client, "BAD_MOVE", "from/to must be {zone: BENCH|BOARD, index: number}");
        ok = moveUnit(eco, from, to);
        if (!ok) return this.sendError(client, "INVALID_MOVE", "cannot move that unit there (board cap = level, cell occupied, or bench full)");
        break;
      }
      case "buy": {
        const slot = msg.shop_slot;
        if (typeof slot !== "number") return this.sendError(client, "BAD_BUY", "shop_slot must be a number");
        ok = buyShopSlot(eco, units, this.pool, slot, this.cfg);
        if (!ok) return this.sendError(client, "BUY_FAILED", "cannot buy that shop slot (empty slot, not enough gold, bench full, or pool empty)");
        telemetryName = "buy";
        break;
      }
      case "sell": {
        const zone = msg.zone;
        const index = msg.index;
        if ((zone !== "BENCH" && zone !== "BOARD") || typeof index !== "number") {
          return this.sendError(client, "BAD_SELL", "zone must be BENCH|BOARD and index a number");
        }
        const res = sellUnit(eco, this.pool, units, zone as Zone, index);
        if (!res.ok) return this.sendError(client, "SELL_FAILED", "no unit at that bench/board slot");
        ok = true;
        telemetryName = "sell";
        break;
      }
      case "reroll": {
        ok = rollShop(eco, units, this.pool, this.rng, this.cfg, false);
        if (!ok) return this.sendError(client, "REROLL_FAILED", "not enough gold to reroll (2 gold)");
        telemetryName = "reroll";
        break;
      }
      case "lock": {
        eco.shopLocked = !eco.shopLocked;
        ok = true;
        break;
      }
      case "xp": {
        ok = buyXp(eco, this.cfg);
        if (!ok) return this.sendError(client, "XP_FAILED", "cannot buy XP (not enough gold or level cap 9 reached)");
        telemetryName = "buy_xp";
        break;
      }
      case "equip": {
        // M1 has no items (SRS §8 lands in M2 only as data); reject honestly.
        return this.sendError(client, "NOT_SUPPORTED", "items are not in the M1 scope");
      }
      default:
        return this.sendError(client, "UNKNOWN_ACTION", `unknown prep action ${kind}`);
    }
    if (!ok) return; // unreachable: every branch returns on failure
    this.syncPlayerState(pid);
    this.sendRoomState(client);
    this.sendBoardSnapshot(client);
    if (telemetryName) {
      trackEvent(this.supabase.service, { name: telemetryName, playerId: pid, matchId: this.roomId, roundId: this.state.roundId });
    }
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

function asZoneIndex(v: unknown): { zone: Zone; index: number } | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if ((o.zone !== "BENCH" && o.zone !== "BOARD") || typeof o.index !== "number") return null;
  return { zone: o.zone as Zone, index: o.index };
}
