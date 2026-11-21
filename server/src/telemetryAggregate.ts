/**
 * Telemetry aggregation — M4 (SRS §11.4).
 *
 * Pure functions over recorded TelemetryEvents. One implementation feeds
 * both the live in-memory reports (GET /debug/telemetry) and the offline
 * report script (src/scripts/telemetry-report.ts reads the JSONL log).
 *
 * Meta metrics (SRS §11.4 "Dashboard meta theo tuần: tỉ lệ thắng theo
 * quốc gia, Hệ, bond và item"):
 *  - hero pick rate (buys per unit_id) + pick share by nation/class
 *  - round win rate by nation / class / bond (a round result is
 *    attributed to every nation, class and bond in that player's lineup
 *    that round — see round_result payload)
 *  - bond trigger counts
 *  - rejected actions by code, rate-limit trips/disconnects, cheat
 *    suspects by reason, replay verification results
 *
 * Win rates here are ROUND win rates (a player wins/loses many rounds
 * per match); match win rate (Top 1) needs standings from match_summary
 * and is reported separately.
 */
import type { TelemetryEvent } from "./telemetry";

export interface WinRateEntry {
  wins: number;
  games: number;
  rate: number; // wins / games, 0 when games = 0
}

export interface MatchReport {
  matchId: string;
  totalEvents: number;
  buys: number;
  sells: number;
  rerolls: number;
  xpBuys: number;
  /** unit_id → number of buys. */
  pickCounts: Record<string, number>;
  /** nation_id → number of buys. */
  picksByNation: Record<string, number>;
  /** class_id → number of buys. */
  picksByClass: Record<string, number>;
  winRateByNation: Record<string, WinRateEntry>;
  winRateByClass: Record<string, WinRateEntry>;
  winRateByBond: Record<string, WinRateEntry>;
  /** bond_id → trigger count. */
  bondTriggers: Record<string, number>;
  /** error code → rejected-action count. */
  rejectedActions: Record<string, number>;
  rateLimited: number;
  rateLimitDisconnects: number;
  /** cheat_suspect reason → count. */
  cheatSuspects: Record<string, number>;
  replayVerified: number;
  replayMismatches: number;
  /** playerId → {wins, losses} (rounds). */
  playerRounds: Record<string, { wins: number; losses: number }>;
  /** Standings from match_summary, if the match finished. */
  standings: { player_id: string; placement: number }[] | null;
}

function winRateEntry(wins: number, games: number): WinRateEntry {
  return { wins, games, rate: games > 0 ? wins / games : 0 };
}

function emptyReport(matchId: string): MatchReport {
  return {
    matchId,
    totalEvents: 0,
    buys: 0,
    sells: 0,
    rerolls: 0,
    xpBuys: 0,
    pickCounts: {},
    picksByNation: {},
    picksByClass: {},
    winRateByNation: {},
    winRateByClass: {},
    winRateByBond: {},
    bondTriggers: {},
    rejectedActions: {},
    rateLimited: 0,
    rateLimitDisconnects: 0,
    cheatSuspects: {},
    replayVerified: 0,
    replayMismatches: 0,
    playerRounds: {},
    standings: null,
  };
}

function bump(map: Record<string, number>, key: string | undefined, by = 1): void {
  if (key === undefined || key === "") return;
  map[key] = (map[key] ?? 0) + by;
}

function bumpWinRate(
  map: Record<string, { wins: number; games: number }>,
  keys: string[] | undefined,
  won: boolean,
): void {
  if (!keys) return;
  for (const k of keys) {
    const e = map[k] ?? { wins: 0, games: 0 };
    e.games += 1;
    if (won) e.wins += 1;
    map[k] = e;
  }
}

/** Aggregate one match's events into a report. Events of other matches are ignored. */
export function aggregateMatchEvents(matchId: string, events: TelemetryEvent[]): MatchReport {
  const report = emptyReport(matchId);
  const wrNation: Record<string, { wins: number; games: number }> = {};
  const wrClass: Record<string, { wins: number; games: number }> = {};
  const wrBond: Record<string, { wins: number; games: number }> = {};
  for (const e of events) {
    if (e.matchId !== matchId) continue;
    report.totalEvents += 1;
    const p = e.payload ?? {};
    switch (e.name) {
      case "buy":
        report.buys += 1;
        bump(report.pickCounts, p.unit_id as string | undefined);
        bump(report.picksByNation, p.nation_id as string | undefined);
        bump(report.picksByClass, p.class_id as string | undefined);
        break;
      case "sell":
        report.sells += 1;
        break;
      case "reroll":
        report.rerolls += 1;
        break;
      case "buy_xp":
        report.xpBuys += 1;
        break;
      case "bond_trigger":
        bump(report.bondTriggers, p.bond_id as string | undefined, (p.count as number | undefined) ?? 1);
        break;
      case "action_rejected":
        bump(report.rejectedActions, p.code as string | undefined);
        break;
      case "rate_limited":
        report.rateLimited += 1;
        break;
      case "rate_limit_disconnect":
        report.rateLimitDisconnects += 1;
        break;
      case "cheat_suspect":
        bump(report.cheatSuspects, p.reason as string | undefined);
        break;
      case "replay_verified":
        report.replayVerified += 1;
        break;
      case "replay_mismatch":
        report.replayMismatches += 1;
        break;
      case "round_result": {
        // Room-level round_result events (playerId "room") carry only the
        // elimination list — they are not a player's result; skip them.
        if (p.result !== "win" && p.result !== "loss" && p.result !== "draw") break;
        const won = p.result === "win";
        const pr = report.playerRounds[e.playerId] ?? { wins: 0, losses: 0 };
        if (won) pr.wins += 1;
        else pr.losses += 1;
        report.playerRounds[e.playerId] = pr;
        bumpWinRate(wrNation, p.nations as string[] | undefined, won);
        bumpWinRate(wrClass, p.classes as string[] | undefined, won);
        bumpWinRate(wrBond, p.bonds as string[] | undefined, won);
        break;
      }
      case "match_summary": {
        const st = p.standings as { player_id: string; placement: number }[] | undefined;
        if (Array.isArray(st)) report.standings = st;
        break;
      }
      default:
        break;
    }
  }
  for (const [k, v] of Object.entries(wrNation)) report.winRateByNation[k] = winRateEntry(v.wins, v.games);
  for (const [k, v] of Object.entries(wrClass)) report.winRateByClass[k] = winRateEntry(v.wins, v.games);
  for (const [k, v] of Object.entries(wrBond)) report.winRateByBond[k] = winRateEntry(v.wins, v.games);
  return report;
}

/** Aggregate across matches (global meta view). matchId is "all". */
export function aggregateAllEvents(events: TelemetryEvent[]): MatchReport {
  const ids = [...new Set(events.map((e) => e.matchId).filter((m): m is string => !!m))];
  const merged = emptyReport("all");
  for (const id of ids) {
    const one = aggregateMatchEvents(id, events);
    merged.totalEvents += one.totalEvents;
    merged.buys += one.buys;
    merged.sells += one.sells;
    merged.rerolls += one.rerolls;
    merged.xpBuys += one.xpBuys;
    merged.rateLimited += one.rateLimited;
    merged.rateLimitDisconnects += one.rateLimitDisconnects;
    merged.replayVerified += one.replayVerified;
    merged.replayMismatches += one.replayMismatches;
    for (const [k, v] of Object.entries(one.pickCounts)) merged.pickCounts[k] = (merged.pickCounts[k] ?? 0) + v;
    for (const [k, v] of Object.entries(one.picksByNation)) merged.picksByNation[k] = (merged.picksByNation[k] ?? 0) + v;
    for (const [k, v] of Object.entries(one.picksByClass)) merged.picksByClass[k] = (merged.picksByClass[k] ?? 0) + v;
    for (const [k, v] of Object.entries(one.bondTriggers)) merged.bondTriggers[k] = (merged.bondTriggers[k] ?? 0) + v;
    for (const [k, v] of Object.entries(one.rejectedActions)) merged.rejectedActions[k] = (merged.rejectedActions[k] ?? 0) + v;
    for (const [k, v] of Object.entries(one.cheatSuspects)) merged.cheatSuspects[k] = (merged.cheatSuspects[k] ?? 0) + v;
    for (const [k, v] of Object.entries(one.playerRounds)) {
      const cur = merged.playerRounds[k] ?? { wins: 0, losses: 0 };
      cur.wins += v.wins;
      cur.losses += v.losses;
      merged.playerRounds[k] = cur;
    }
    const mergeWr = (
      target: Record<string, WinRateEntry>,
      src: Record<string, WinRateEntry>,
    ): void => {
      for (const [k, v] of Object.entries(src)) {
        const cur = target[k] ?? { wins: 0, games: 0, rate: 0 };
        target[k] = winRateEntry(cur.wins + v.wins, cur.games + v.games);
      }
    };
    mergeWr(merged.winRateByNation, one.winRateByNation);
    mergeWr(merged.winRateByClass, one.winRateByClass);
    mergeWr(merged.winRateByBond, one.winRateByBond);
  }
  return merged;
}
