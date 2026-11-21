/**
 * In-memory store of recorded round replays — M4 anti-cheat (SRS §13.2).
 *
 * BattleRoom records every pair's replay input + live result here when a
 * round resolves. Verification re-runs from these records, never from
 * live room state, so it can happen after the match (or on demand via
 * GET /debug/replay/:matchId).
 *
 * Bounds (this is a debug/verification store, not a database): the last
 * 20 matches, up to 60 rounds each. Oldest matches are dropped first.
 * For durable, public replays (SRS §13.2 "replay công khai sau trận"),
 * persist records to Supabase `matches.round_seeds` + a replay table —
 * out of scope for M4; the store is the in-process step toward it.
 */
import type { BalanceConfig } from "./config";
import type { GameData } from "./data";
import {
  verifyRoundReplay,
  type ReplayVerification,
  type RoundReplayInput,
  type RoundReplayRecord,
} from "./replay";

const MAX_MATCHES = 20;
const MAX_ROUNDS_PER_MATCH = 60;

const store = new Map<string, RoundReplayRecord[]>();

export function recordRoundReplay(
  input: RoundReplayInput,
  live: RoundReplayRecord["live"],
): RoundReplayRecord {
  const record: RoundReplayRecord = { ...input, live, recordedAt: Date.now() };
  const list = store.get(input.matchId) ?? [];
  list.push(record);
  if (list.length > MAX_ROUNDS_PER_MATCH) list.splice(0, list.length - MAX_ROUNDS_PER_MATCH);
  store.set(input.matchId, list);
  if (store.size > MAX_MATCHES) {
    const oldest = store.keys().next().value as string;
    store.delete(oldest);
  }
  return record;
}

export function getMatchReplays(matchId: string): RoundReplayRecord[] {
  return store.get(matchId) ?? [];
}

export function hasMatchReplays(matchId: string): boolean {
  return store.has(matchId);
}

export function clearReplayStore(): void {
  store.clear();
}

/** Re-verify every recorded round of a match. Pure re-computation. */
export function verifyMatchReplays(
  matchId: string,
  data: GameData,
  cfg: BalanceConfig,
): { matchId: string; rounds: ReplayVerification[]; mismatches: number } {
  const rounds = getMatchReplays(matchId).map((r) => verifyRoundReplay(r, data, cfg));
  return { matchId, rounds, mismatches: rounds.filter((r) => !r.ok).length };
}
