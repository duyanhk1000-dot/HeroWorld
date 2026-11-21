/**
 * Telemetry — SRS §11.4. Event log only: match join/leave, buy/sell/roll,
 * end-of-round lineups, bond triggers, round results, FPS and reconnect
 * time. No personal data beyond an anonymised account id.
 *
 * Sink: Supabase table `telemetry_events` (migration 001). Writes are
 * fire-and-forget and batched so a slow database can never stall a room.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TelemetryEventName =
  | "match_join" | "match_leave" | "buy" | "sell" | "reroll" | "buy_xp"
  | "round_lineup" | "bond_trigger" | "round_result" | "reconnect" | "fps_report";

export interface TelemetryEvent {
  name: TelemetryEventName;
  playerId: string; // anonymised account id (UUID) or guest device hash
  matchId?: string;
  roundId?: number;
  payload?: Record<string, unknown>;
}

const queue: TelemetryEvent[] = [];
let timer: NodeJS.Timeout | null = null;

export function trackEvent(db: SupabaseClient | null, event: TelemetryEvent): void {
  queue.push({ ...event, payload: event.payload ?? {} });
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
