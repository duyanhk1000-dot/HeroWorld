/**
 * Replay verification — M4 anti-cheat (SRS §13.2/§13.3).
 *
 * The combat sim is deterministic (same seed + same lineups → same event
 * sequence, 100/100 replays per SRS §13.1), so a round can be re-run
 * after the fact and compared against what actually happened live:
 *
 *   - BattleRoom records the replay INPUT for every pair when combat is
 *     built (boards, pair seed, iid starts, kind, stage/round) and the
 *     LIVE RESULT when the round resolves (event hash, winner, ticks).
 *   - Verification re-builds both sides from the recorded boards with
 *     the recorded seed, steps the PairCombat exactly as many ticks as
 *     the live combat ran (then force-decides by HP fraction, exactly as
 *     the room does at the time cap), and hashes the resulting events.
 *   - A mismatch means the live combat diverged from the deterministic
 *     sim — a server bug, a corrupted room, or tampering — and is logged
 *     as `replay_mismatch` + `cheat_suspect` telemetry.
 *
 * Verification never runs inside the 20 Hz room loop: BattleRoom
 * schedules it with setImmediate after the round resolves, and the
 * /debug/replay/:matchId endpoint re-runs it on demand from the stored
 * inputs (SRS §13.2: "replay công khai sau trận để cộng đồng kiểm chứng").
 * The round seed stays server-side until the round ends — the input is
 * only stored after combat is built, never sent to clients.
 */
import { createHash } from "node:crypto";
import type { BalanceConfig } from "./config";
import type { GameData } from "./data";
import {
  buildGhostCombatants,
  buildPveCombatants,
  buildSideCombatants,
  PairCombat,
  type BoardSlot,
  type SimEvent,
} from "./sim";

export type ReplayPairKind = "PVP" | "PVE" | "GHOST";

export interface ReplaySideInput {
  ownerId: string;
  slots: BoardSlot[];
  iidStart: number;
}

export interface RoundReplayInput {
  matchId: string;
  roundId: number;
  pairKey: string;
  kind: ReplayPairKind;
  /** The exact pair seed used live (roundSeed + pair offset). */
  seed: number;
  stage: number;
  ris: number;
  sideA: ReplaySideInput;
  /** Side B: a player board, a ghost board, or PvE monsters. */
  sideB: ReplaySideInput | { pve: true; iidStart: number };
  /** Owner of the ghost board (GHOST pairs only). */
  ghostOwnerId?: string;
}

export interface LiveRoundResult {
  /** SHA-256 of the live SimEvent JSON (see hashSimEvents). */
  hash: string;
  winner: number;
  ticks: number;
  eventCount: number;
}

export interface RoundReplayRecord extends RoundReplayInput {
  live: LiveRoundResult;
  recordedAt: number;
}

export interface ReplayVerification {
  ok: boolean;
  matchId: string;
  roundId: number;
  pairKey: string;
  liveHash: string;
  replayHash: string;
  liveWinner: number;
  replayWinner: number;
  liveTicks: number;
  replayTicks: number;
  mismatch?: string;
}

/** SHA-256 over the canonical JSON of a SimEvent list. */
export function hashSimEvents(events: SimEvent[]): string {
  return createHash("sha256").update(JSON.stringify(events)).digest("hex");
}

/** Build the live result summary from a finished PairCombat. */
export function liveResultOf(combat: PairCombat): LiveRoundResult {
  const res = combat.result();
  return {
    hash: hashSimEvents(res.events),
    winner: res.winner,
    ticks: res.ticks,
    eventCount: res.events.length,
  };
}

function buildReplaySides(
  input: RoundReplayInput,
  data: GameData,
  cfg: BalanceConfig,
): { combat: PairCombat } {
  const a = buildSideCombatants(
    input.sideA.slots, 0, input.sideA.ownerId, data.units, cfg, input.sideA.iidStart, data.bonds,
  );
  const bIidStart = input.sideB.iidStart;
  let bCombatants;
  if ("pve" in input.sideB && input.sideB.pve) {
    bCombatants = buildPveCombatants(input.stage, input.ris, data.pve, cfg, bIidStart).combatants;
  } else if (input.kind === "GHOST") {
    const ghost = input.sideB as ReplaySideInput;
    bCombatants = buildGhostCombatants(
      ghost.slots, input.ghostOwnerId ?? ghost.ownerId, data.units, cfg, bIidStart,
    ).combatants;
  } else {
    const sideB = input.sideB as ReplaySideInput;
    bCombatants = buildSideCombatants(
      sideB.slots, 1, sideB.ownerId, data.units, cfg, bIidStart, data.bonds,
    ).combatants;
  }
  return { combat: new PairCombat(a.combatants, bCombatants, input.seed, cfg) };
}

/**
 * Re-run one recorded round and compare against the live result.
 * Steps exactly liveTicks+1 times (PairCombat.tick starts at -1, so
 * ticks = steps - 1), then force-decides by HP fraction if unfinished —
 * the same rule the room applies at the combat time cap.
 */
export function verifyRoundReplay(
  record: RoundReplayRecord,
  data: GameData,
  cfg: BalanceConfig,
): ReplayVerification {
  const base = {
    matchId: record.matchId,
    roundId: record.roundId,
    pairKey: record.pairKey,
    liveHash: record.live.hash,
    liveWinner: record.live.winner,
    liveTicks: record.live.ticks,
  };
  const fail = (mismatch: string, replayHash: string, replayWinner: number, replayTicks: number): ReplayVerification =>
    ({ ...base, ok: false, replayHash, replayWinner, replayTicks, mismatch });
  let combat: PairCombat;
  try {
    combat = buildReplaySides(record, data, cfg).combat;
  } catch (err) {
    return fail(`rebuild failed: ${err instanceof Error ? err.message : String(err)}`, "", -1, -1);
  }
  const steps = record.live.ticks + 1;
  for (let i = 0; i < steps && !combat.finished; i++) combat.step();
  if (!combat.finished) combat.forceDecideByHpFraction();
  const res = combat.result();
  const replayHash = hashSimEvents(res.events);
  if (replayHash !== record.live.hash) {
    return fail(
      `event hash mismatch (live ${res.events.length} events vs replay ${res.events.length})`,
      replayHash, res.winner, res.ticks,
    );
  }
  if (res.winner !== record.live.winner) {
    return fail(`winner mismatch: live ${record.live.winner} vs replay ${res.winner}`, replayHash, res.winner, res.ticks);
  }
  if (res.ticks !== record.live.ticks) {
    return fail(`tick count mismatch: live ${record.live.ticks} vs replay ${res.ticks}`, replayHash, res.winner, res.ticks);
  }
  return { ...base, ok: true, replayHash, replayWinner: res.winner, replayTicks: res.ticks };
}
