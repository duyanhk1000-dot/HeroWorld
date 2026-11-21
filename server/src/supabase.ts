/**
 * Supabase access — server side only.
 *
 * Two clients, kept strictly apart:
 *  - anon client: verifying a player's JWT (Auth). Safe to use with the
 *    anon key; it can only do what RLS allows.
 *  - service client: server-side writes that bypass RLS (match results,
 *    MMR updates, telemetry). Built ONLY from SUPABASE_SERVICE_ROLE_KEY,
 *    which must never leave the Render environment. If the key is missing,
 *    the server still boots (matchmaking + rooms work) but persistence is
 *    disabled and every skipped write is logged — no silent data loss.
 *
 * Storage (portraits/audio): buckets are created by migration 003
 * (server/supabase/migrations/003_storage.sql). The game server never
 * uploads art; it only generates short-lived signed URLs for the client.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "./config";

export interface SupabaseClients {
  anon: SupabaseClient | null;
  service: SupabaseClient | null;
  enabled: boolean;
}

export function createSupabaseClients(env: ServerEnv): SupabaseClients {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    console.warn("[supabase] SUPABASE_URL / SUPABASE_ANON_KEY missing — persistence disabled (matches will still run, results will NOT be saved).");
    return { anon: null, service: null, enabled: false };
  }
  const anon = createClient(env.supabaseUrl, env.supabaseAnonKey);
  let service: SupabaseClient | null = null;
  if (env.supabaseServiceRoleKey) {
    service = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } else {
    console.warn("[supabase] SUPABASE_SERVICE_ROLE_KEY missing — match results/MMR cannot be written.");
  }
  return { anon, service, enabled: true };
}

/** Persist one finished match (SRS §9.4/§11.2). Best-effort: never crash a room. */
export async function recordMatchResult(
  clients: SupabaseClients,
  input: {
    matchId: string;
    mode: "RANKED" | "CASUAL";
    botFill: boolean;
    roundSeeds: number[];
    standings: { playerId: string; placement: number; mmrDelta: number; isBot: boolean; hpRemaining: number }[];
  },
): Promise<void> {
  const db = clients.service;
  if (!db) {
    console.warn(`[supabase] match ${input.matchId} finished but service client unavailable — result NOT saved.`);
    return;
  }
  try {
    const { data: match, error } = await db
      .from("matches")
      .insert({
        id: input.matchId,
        mode: input.mode,
        bot_fill: input.botFill,
        round_seeds: input.roundSeeds,
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !match) throw error ?? new Error("match insert returned no row");

    const rows = input.standings.map((s) => ({
      match_id: match.id,
      player_id: s.playerId,
      placement: s.placement,
      mmr_delta: s.mmrDelta,
      is_bot: s.isBot,
      hp_remaining: s.hpRemaining,
    }));
    const { error: playersError } = await db.from("match_players").insert(rows);
    if (playersError) throw playersError;

    // MMR is applied per player; a failed single update must not lose the rest.
    for (const s of input.standings) {
      if (s.isBot) continue;
      const { error: mmrError } = await db.rpc("apply_mmr_delta", {
        p_player_id: s.playerId,
        p_delta: s.mmrDelta,
        p_match_id: match.id,
      });
      if (mmrError) console.error(`[supabase] MMR update failed for ${s.playerId}:`, mmrError.message);
    }
    console.log(`[supabase] match ${input.matchId} recorded (${input.standings.length} players).`);
  } catch (err) {
    console.error(`[supabase] recordMatchResult failed for ${input.matchId}:`, err);
  }
}
