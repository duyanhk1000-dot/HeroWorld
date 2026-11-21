/**
 * Telemetry — SRS §11.4. Event log only: match join/leave, buy/sell/roll,
 * end-of-round lineups, bond triggers, round results, FPS and reconnect
 * time. No personal data beyond an anonymised account id.
 *
 * Sinks:
 *  - Supabase table `telemetry_events` (migration 001). Writes are
 *    fire-and-forget and batched so a slow database can never stall a room.
 *  - In-memory store (M4): every event is also kept per match (bounded)
 *    so GET /debug/telemetry can serve live aggregate reports without a
 *    database round-trip.
 *  - JSONL file (M4, opt-in via TELEMETRY_LOG_PATH): one JSON object per
 *    line, read by src/scripts/telemetry-report.ts. This is how a match
 *    is audited after the server process exits.
 */
import { appendFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateAllEvents, aggregateMatchEvents, type MatchReport } from "./telemetryAggregate";

export type TelemetryEventName =
  | "match_join" | "match_leave" | "buy" | "sell" | "reroll" | "buy_xp"
  | "round_lineup" | "bond_trigger" | "round_result" | "reconnect" | "fps_report"
  // M4 anti-cheat / replay verification (SRS §13.2).
  | "action_rejected" | "cheat_suspect" | "rate_limited" | "rate_limit_disconnect"
  | "replay_verified" | "replay_mismatch" | "match_summary";

export interface TelemetryEvent {
  name: TelemetryEventName;
  playerId: string; // anonymised account id (UUID) or guest device hash
  matchId?: string;
  roundId?: number;
  payload?: Record<string, unknown>;
  /** Epoch ms, set by trackEvent. */
  ts?: number;
}

const queue: TelemetryEvent[] = [];
let timer: NodeJS.Timeout | null = null;

// ---- M4: in-memory store + JSONL file log -------------------------------

const MAX_EVENTS_PER_MATCH = 2000;
const MAX_MATCHES_STORED = 20;
const eventsByMatch = new Map<string, TelemetryEvent[]>();
let logPath: string | null = null;

/** Enable the JSONL file log (env TELEMETRY_LOG_PATH). No-op when unset. */
export function setTelemetryLogPath(path: string | null): void {
  logPath = path && path.length > 0 ? path : null;
}

export function getTelemetryLogPath(): string | null {
  return logPath;
}

/** Raw events recorded for one match (bounded, in-memory). */
export function getMatchEvents(matchId: string): TelemetryEvent[] {
  return eventsByMatch.get(matchId) ?? [];
}

export function getStoredMatchIds(): string[] {
  return [...eventsByMatch.keys()];
}

/** Aggregate report for one match (M4, SRS §11.4 meta). */
export function getMatchReport(matchId: string): MatchReport {
  return aggregateMatchEvents(matchId, getMatchEvents(matchId));
}

/** Aggregate report across all stored matches. */
export function getGlobalReport(): MatchReport {
  const all: TelemetryEvent[] = [];
  for (const list of eventsByMatch.values()) all.push(...list);
  return aggregateAllEvents(all);
}

/** Test-only: drop all stored events. */
export function clearTelemetryStore(): void {
  eventsByMatch.clear();
  queue.length = 0;
}

function storeEvent(event: TelemetryEvent): void {
  const mid = event.matchId ?? "__no_match__";
  const list = eventsByMatch.get(mid) ?? [];
  list.push(event);
  if (list.length > MAX_EVENTS_PER_MATCH) list.splice(0, list.length - MAX_EVENTS_PER_MATCH);
  eventsByMatch.set(mid, list);
  if (eventsByMatch.size > MAX_MATCHES_STORED) {
    const oldest = eventsByMatch.keys().next().value as string;
    eventsByMatch.delete(oldest);
  }
  if (logPath) {
    try {
      appendFileSync(logPath, JSON.stringify(event) + "\n", "utf8");
    } catch (err) {
      // A broken log file must never break the room; log once and stop.
      console.error("[telemetry] log write failed, disabling file log:", err instanceof Error ? err.message : String(err));
      logPath = null;
    }
  }
}

export function trackEvent(db: SupabaseClient | null, event: TelemetryEvent): void {
  const full: TelemetryEvent = { ...event, payload: event.payload ?? {}, ts: Date.now() };
  queue.push(full);
  storeEvent(full);
  if (!db) return; // still counted locally; nothing to flush to
  if (!timer) {
    timer = setTimeout(() => void flushTelemetry(db), 5_000);
    timer.unref?.();
  }
}

async function flushTelemetry(db: SupabaseClient): Promise<void> {
  timer = null;
  const batch = queue.splice(0, queue.length);
  if (batch.length === 0) return;
  const rows = batch.map((e) => ({
    event_name: e.name,
    player_id: e.playerId,
    match_id: e.matchId ?? null,
    round_id: e.roundId ?? null,
    payload: e.payload ?? {},
    created_at: new Date().toISOString(),
  }));
  const { error } = await db.from("telemetry_events").insert(rows);
  if (error) console.error("[telemetry] flush failed:", error.message);
}
