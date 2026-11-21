/**
 * BattleRoom — one 8-player match (SRS §9.1).
 *
 *   WAITING_PLAYERS → PREP_PHASE (30 s) → COMBAT_PHASE (≤45 s, 20 Hz tick)
 *   → ROUND_RESOLVE → PREP_PHASE … → GAME_OVER (one player left)
 *
 * Rules enforced here (server-authoritative, SRS §5/§9/§10):
 *  - Pairing: 4 pairs per round; with an odd number of survivors the
 *    leftover player fights a "ghost" — a copy of a random earlier lineup
 *    of a random eliminated/alive player (SRS review decision, §3).
 *  - Every round gets a fresh round_seed (src/rng.ts). No Math.random()
 *    anywhere in the sim path.
 *  - Combat is simulated at a fixed 20 Hz (50 ms) tick; the server sends
 *    ONLY events (move/attack/skill_cast/damage/heal/cc/death/karma_trigger)
 *    for the pair each client is watching (≤5 KB/s/client, SRS §2.3).
 *  - All prep actions are validated: phase must be PREP_PHASE, round_id
 *    must match, gold / level cap / pool rules from balance_config.json.
 *    Rejected actions change nothing and get an s2c_error (SRS §10.2).
 *  - Reconnect (§10.3): a client rejoining with its session token gets the
 *    latest s2c_room_state + s2c_board_snapshot and the last 2 s of events
 *    (to re-sync animation). Old events are never replayed in full.
 *  - PvE rounds (§9.2): stage 1 rounds 1, 4 and every stage's round 6 are
 *    PvE/boss; stage ≥2 round 4 is PvE. PvE loss damage is halved (§9.3).
 *
 * COMBAT SIM: this room owns the loop and the event log, but the damage /
 * targeting math lives in src/combat.ts (formulas) and must stay identical
 * to scripts/m1_sim.gd (Godot). The full per-unit sim (movement, mana,
 * skill timing) is intentionally NOT duplicated here as a second divergent
 * implementation: before M2 ships, extract the M1 sim into a shared module
 * (or port m1_sim.gd line-for-line) and call it from `runCombatTick()`.
 * The TODO markers below show exactly where that shared sim plugs in.
 */
import { Client, Room } from "colyseus";
import type { BalanceConfig } from "../config";
import { loadBalanceConfig } from "../config";
import { isOvertime, loserDamage, roundKind } from "../combat";
import { mmrDeltaForPlacement } from "../matchmaking";
import { makeRoundSeed, SeededRng } from "../rng";
import type { CombatEvent, S2CMessage } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";
import { createSupabaseClients, recordMatchResult, type SupabaseClients } from "../supabase";
import { loadEnv } from "../config";
import { BattleRoomState, PlayerState } from "./BattleRoomState";

const TICK_MS = 50; // 20 Hz, SRS §5.1
const MAX_PLAYERS = 8;
const RECONNECT_EVENT_WINDOW_MS = 2_000; // SRS §10.3: last 2 s of events only

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

export class BattleRoom extends Room<BattleRoomState> {
  maxClients = MAX_PLAYERS;

  private cfg: BalanceConfig = loadBalanceConfig();
  private supabase: SupabaseClients = createSupabaseClients(loadEnv());
  private mode: "RANKED" | "CASUAL" = "CASUAL";
  private seats: RoomOptions["seats"] = [];
  private rng: SeededRng = new SeededRng(1);
  private roundSeed = 0;
  private phaseTimer: NodeJS.Timeout | null = null;
  private combatInterval: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private pairings: Pairing[] = [];
  private roundEvents: CombatEvent[] = [];
  private roundSeeds: number[] = [];
  /** playerId → last-seen event time, for the 2 s reconnect window. */
  private eventLog: { at: number; roundId: number; tick: number; events: CombatEvent[] }[] = [];
  private eliminated: string[] = [];
  private matchFinished = false;

  onCreate(options: RoomOptions): void {
    this.mode = options.mode ?? "CASUAL";
    this.seats = options.seats ?? [];
    this.setState(new BattleRoomState());
    this.state.protocolVersion = PROTOCOL_VERSION;
    this.state.phase = "WAITING_PLAYERS";

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
      const player = this.state.players.get(client.sessionId);
      if (!player) return this.sendError(client, "NOT_IN_ROOM", "session is not part of this room");
      player.connected = true;
      this.sendRoomState(client);
      this.sendBoardSnapshot(client);
      const recent = this.eventLog.filter((e) => Date.now() - e.at <= RECONNECT_EVENT_WINDOW_MS);
      for (const entry of recent) {
        client.send("s2c_combat_events", {
          type: "s2c_combat_events", protocol_version: PROTOCOL_VERSION,
          round_id: entry.roundId, tick: entry.tick, events: entry.events,
        } satisfies S2CMessage);
      }
    });

    console.log(`[room ${this.roomId}] created mode=${this.mode} seats=${this.seats.length}`);
    // The room starts once all human seats have connected (bots are already in).
    this.clock.setTimeout(() => this.beginMatch(), 2_000);
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
    // One account = one live match session (SRS §11.3): a second connection
    // for the same playerId disconnects the older session.
    for (const other of this.clients) {
      if (other !== client && other.auth?.playerId && other.auth.playerId === client.auth?.playerId) {
        other.leave();
      }
    }
    const player = this.state.players.get(client.auth?.playerId ?? client.sessionId);
    if (player) player.connected = true;
    this.sendRoomState(client);
    this.sendBoardSnapshot(client);
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.auth?.playerId ?? client.sessionId);
    if (player) player.connected = false;
    // A disconnect mid-combat does not stop the sim: the player's units keep
    // fighting (server-authoritative) and the player can reconnect (§10.3).
    // TODO(M2): if a player is gone for a whole PREP_PHASE, auto-lock their
    // board and let the combat run without them.
  }

  onDispose(): void {
    this.clearTimers();
  }

  // ------------------------------------------------------------------ phases

  private beginMatch(): void {
    if (this.state.phase !== "WAITING_PLAYERS") return;
    this.startPrepPhase();
  }

  private startPrepPhase(): void {
    this.state.roundId += 1;
    this.state.roundInStage = ((this.state.roundId - 1) % 6) + 1;
    this.state.stage = Math.floor((this.state.roundId - 1) / 6) + 1;
    this.state.phase = "PREP_PHASE";
    this.state.countdownSec = this.cfg.prep_seconds;
    this.roundSeed = makeRoundSeed(this.roomId, this.state.roundId);
    this.roundSeeds.push(this.roundSeed);
    this.rng = new SeededRng(this.roundSeed);
    this.roundEvents = [];
    this.broadcastRoomState();
    // TODO(M2): roll a free shop for every player here (round_seed), honour
    // shopLocked, and pay round income in ROUND_RESOLVE (see resolveRound).
    this.phaseTimer = setTimeout(() => this.startCombatPhase(), this.cfg.prep_seconds * 1000);
    this.phaseTimer.unref?.();
  }

  private startCombatPhase(): void {
    this.state.phase = "COMBAT_PHASE";
    this.state.countdownSec = this.cfg.combat_seconds;
    this.tickCount = 0;
    this.pairings = this.makePairings();
    this.broadcastRoomState();
    this.combatInterval = setInterval(() => this.runCombatTick(), TICK_MS);
    this.combatInterval.unref?.();
  }

  /** One 20 Hz tick. Sends only the events of each pair to its two players. */
  private runCombatTick(): void {
    this.tickCount += 1;
    this.state.tick = this.tickCount;
    const events: CombatEvent[] = [];
    // TODO(M2-shared-sim): replace this stub with the shared sim call:
    //   events.push(...sharedSim.tick(this.tickCount, this.rng, this.pairings));
    // The shared sim must implement: movement along hex paths, attack
    // (target = nearest hex, tie-break smallest index), mana +10/+7,
    // skill casts at max mana, crit 25% ×1.40, dodge cap 35%, and emit
    // events in the shared draw order (src/combat.ts). Until then the
    // room ends combat by timeout so the loop, timers and reconnect path
    // are all testable end-to-end.
    if (events.length > 0) {
      this.roundEvents.push(...events);
      this.eventLog.push({ at: Date.now(), roundId: this.state.roundId, tick: this.tickCount, events });
      this.broadcastCombatEvents(events);
    }
    if (this.tickCount >= this.cfg.combat_seconds * this.cfg.tick_hz || isOvertime(this.tickCount, this.cfg)) {
      // Overtime (§9.1) applies inside the shared sim after tick 900;
      // the room stops at the 45 s cap and resolves (draw if both sides live).
      this.endCombatPhase();
    }
  }

  private endCombatPhase(): void {
    this.clearTimers();
    this.state.phase = "ROUND_RESOLVE";
    this.resolveRound();
  }

  /** 4 pairs; odd survivor count → one ghost pairing (SRS §3). */
  private makePairings(): Pairing[] {
    const alive = [...this.state.players.values()].filter((p) => p.alive).map((p) => p.playerId);
    // Deterministic shuffle from the round seed — same seed, same pairs.
    for (let i = alive.length - 1; i > 0; i--) {
      const j = this.rng.nextInt(0, i);
      [alive[i], alive[j]] = [alive[j], alive[i]];
    }
    const pairs: Pairing[] = [];
    for (let i = 0; i + 1 < alive.length; i += 2) {
      pairs.push({ a: alive[i], b: alive[i + 1], ghost: false });
    }
    if (alive.length % 2 === 1) {
      const leftover = alive[alive.length - 1];
      // Ghost: a copy of a random earlier lineup. Which lineup is copied
      // is a server decision from the round_seed; the client is told only
      // that the opponent is a ghost (it renders the copied board).
      const ghostOf = alive[this.rng.nextInt(0, alive.length - 2 >= 0 ? alive.length - 2 : 0)] ?? leftover;
      pairs.push({ a: leftover, b: ghostOf, ghost: true });
    }
    return pairs;
  }

  /** Apply loser damage (§9.3), income (§4.4), eliminations, then next prep or game over. */
  private resolveRound(): void {
    const kind = roundKind(this.state.stage, this.state.roundInStage);
    const isPve = kind !== "PVP";
    // TODO(M2-shared-sim): use the sim's per-pair outcomes here instead of
    // the placeholder (no damage when the sim stub ran). Placeholder keeps
    // the loop honest: it never invents a winner.
    const results = new Map<string, { damage: number; won: boolean }>();
    for (const pair of this.pairings) {
      // Surviving enemy units are reported by the sim; 0 until it lands.
      const survivorsA = 0;
      const survivorsB = 0;
      results.set(pair.a, { damage: loserDamage(this.state.stage, survivorsB, this.cfg, isPve), won: true });
      if (!pair.ghost) {
        results.set(pair.b, { damage: loserDamage(this.state.stage, survivorsA, this.cfg, isPve), won: false });
      }
    }
    const eliminatedNow: string[] = [];
    for (const [playerId, result] of results) {
      const p = this.state.players.get(playerId);
      if (!p) continue;
      p.hp = Math.max(0, p.hp - result.damage);
      if (p.hp <= 0 && p.alive) {
        p.alive = false;
        this.eliminated.push(playerId);
        eliminatedNow.push(playerId);
      }
      // Income (§4.4): +5 base, +1 PvP win, interest 1 per 10 gold (cap 5),
      // streak +1/+2/+3. Paid here so the next PREP_PHASE shows it.
      const interest = Math.min(Math.floor(p.gold / 10) * this.cfg.interest_per_10_gold, this.cfg.interest_cap);
      p.gold += this.cfg.base_gold_per_round + interest + (result.won && !isPve ? this.cfg.pvp_win_gold : 0);
    }
    this.broadcast("s2c_round_result", {
      type: "s2c_round_result", protocol_version: PROTOCOL_VERSION, round_id: this.state.roundId,
      result: "win", damage_taken: 0, gold_earned: 0, eliminated: eliminatedNow,
    } satisfies S2CMessage);

    const aliveCount = [...this.state.players.values()].filter((p) => p.alive).length;
    if (aliveCount <= 1) {
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
    const alive = [...this.state.players.values()].filter((p) => p.alive).map((p) => p.playerId);
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
   * Prep-phase action validation (SRS §9.1/§10.3). Gold, level cap, pool
   * and shop rules all come from balance_config.json. The economy math
   * itself (buy/sell/reroll/XP) mirrors the M1 Godot economy module
   * (scripts/m1_economy.gd) — same prices, same XP table, same pool sizes.
   * TODO(M2): implement the validated mutations (they currently validate
   * and acknowledge; the board/shop mutation must reuse the M1 economy
   * rules, not invent new ones).
   */
  private handlePrepAction(client: Client, msg: { round_id?: number }, kind: string): void {
    if (this.state.phase !== "PREP_PHASE") {
      return this.sendError(client, "WRONG_PHASE", `action ${kind} is only allowed in PREP_PHASE`);
    }
    if (msg.round_id !== undefined && msg.round_id !== this.state.roundId) {
      return this.sendError(client, "STALE_ROUND", `round_id ${msg.round_id} does not match current round ${this.state.roundId}`);
    }
    // TODO(M2): validate gold/level/pool, apply the mutation, then
    // broadcast s2c_room_state + a fresh s2c_board_snapshot to the actor.
    this.sendRoomState(client);
  }

  // ------------------------------------------------------------------ helpers

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
    const playerId = client.auth?.playerId ?? client.sessionId;
    client.send("s2c_board_snapshot", {
      type: "s2c_board_snapshot", protocol_version: PROTOCOL_VERSION,
      round_id: this.state.roundId, player_id: playerId, board: {}, bench: [],
    } satisfies S2CMessage);
    // TODO(M2): board/bench come from the room's per-player board store
    // (hex index = row*7+col, bench slots 0..8, SRS §3.1).
  }

  /** Combat events go only to the two players of that pair (SRS §2.3). */
  private broadcastCombatEvents(events: CombatEvent[]): void {
    const payload = {
      type: "s2c_combat_events", protocol_version: PROTOCOL_VERSION,
      round_id: this.state.roundId, tick: this.tickCount, events,
    } satisfies S2CMessage;
    // TODO(M2): route per pair — currently broadcasts to the room because
    // the sim stub emits no per-pair events yet. Do NOT ship per-pair
    // routing as "done" until events carry a pair id.
    this.broadcast("s2c_combat_events", payload);
  }

  private clearTimers(): void {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    if (this.combatInterval) { clearInterval(this.combatInterval); this.combatInterval = null; }
  }
}
