/**
 * Telemetry report — M4 (SRS §11.4).
 *
 * Reads a JSONL telemetry log (one event per line, written when the
 * server runs with TELEMETRY_LOG_PATH set) and prints the meta report:
 * hero pick rates, round win rates by nation / class / bond, bond
 * trigger counts, rejected actions, rate-limit trips and replay
 * verification results.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/telemetry-report.ts [logfile] [--match <matchId>]
 *   npm run telemetry:report -- [logfile] [--match <matchId>]
 * Default logfile: ./telemetry.log (server cwd). Exit 1 when the file
 * cannot be read or holds no events.
 */
import { readFileSync } from "node:fs";
import { aggregateAllEvents, aggregateMatchEvents, type MatchReport } from "../telemetryAggregate";
import type { TelemetryEvent } from "../telemetry";

function fmtPct(rate: number, games: number): string {
  return games > 0 ? `${(rate * 100).toFixed(1)}% (${games})` : "—";
}

function printSection(title: string, lines: string[]): void {
  console.log(`\n== ${title} ==`);
  if (lines.length === 0) console.log("  (none)");
  else for (const l of lines) console.log(`  ${l}`);
}

function printReport(r: MatchReport): void {
  console.log(`\n########## Telemetry report — match ${r.matchId} ##########`);
  console.log(`events: ${r.totalEvents} | buys: ${r.buys} | sells: ${r.sells} | rerolls: ${r.rerolls} | xp buys: ${r.xpBuys}`);
  const topPicks = Object.entries(r.pickCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  printSection("Top hero picks (buys)", topPicks.map(([uid, n]) => `${uid}: ${n}`));
  printSection(
    "Picks by nation",
    Object.entries(r.picksByNation).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`),
  );
  printSection(
    "Round win rate by nation",
    Object.entries(r.winRateByNation).sort((a, b) => b[1].rate - a[1].rate)
      .map(([k, v]) => `${k}: ${fmtPct(v.rate, v.games)}`),
  );
  printSection(
    "Round win rate by class",
    Object.entries(r.winRateByClass).sort((a, b) => b[1].rate - a[1].rate)
      .map(([k, v]) => `${k}: ${fmtPct(v.rate, v.games)}`),
  );
  printSection(
    "Round win rate by bond",
    Object.entries(r.winRateByBond).sort((a, b) => b[1].rate - a[1].rate)
      .map(([k, v]) => `${k}: ${fmtPct(v.rate, v.games)}`),
  );
  printSection(
    "Bond triggers",
    Object.entries(r.bondTriggers).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`),
  );
  printSection(
    "Rejected actions (by code)",
    Object.entries(r.rejectedActions).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`),
  );
  console.log(`\nrate-limited: ${r.rateLimited} | rate-limit disconnects: ${r.rateLimitDisconnects}`);
  printSection(
    "Cheat suspects (by reason)",
    Object.entries(r.cheatSuspects).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`),
  );
  console.log(`\nreplay verified: ${r.replayVerified} | replay mismatches: ${r.replayMismatches}`);
  if (r.standings) {
    printSection("Standings", r.standings.map((s) => `#${s.placement} ${s.player_id}`));
  }
  console.log("");
}

function main(): void {
  const args = process.argv.slice(2);
  let file = "telemetry.log";
  let matchId: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--match" && args[i + 1]) {
      matchId = args[++i];
    } else if (!args[i].startsWith("--")) {
      file = args[i];
    }
  }
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`cannot read telemetry log ${file}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const events: TelemetryEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t) as TelemetryEvent);
    } catch {
      console.error(`skipping unparsable line in ${file}`);
    }
  }
  if (events.length === 0) {
    console.error(`no events in ${file} — run the server with TELEMETRY_LOG_PATH=${file} first`);
    process.exit(1);
  }
  const report = matchId
    ? aggregateMatchEvents(matchId, events)
    : aggregateAllEvents(events);
  printReport(report);
}

main();
