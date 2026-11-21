/**
 * Auth — SRS §11.3. Login via Supabase Auth (email / Google / Apple).
 * The game server never sees a password. The client sends its Supabase
 * access token (JWT) when joining; the server verifies it against Supabase
 * and derives the player identity. Guest play (casual only, SRS §11.3) is a
 * device-scoped id with no JWT; it can never join ranked and its data is
 * merged into a real account on sign-up (see migration 001).
 *
 * One account = one live match session: a second login disconnects the old
 * match session (SRS §11.3 / reconnect §10.3). The room tracks that via
 * `activeSessions` in BattleRoom.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlayerIdentity {
  /** Supabase auth.users id (UUID) — the profile id in Postgres. */
  playerId: string;
  displayName: string;
  isGuest: boolean;
}

export async function verifyPlayerToken(
  anon: SupabaseClient | null,
  token: string | undefined,
): Promise<PlayerIdentity | null> {
  if (!token) return null;
  if (!anon) {
    console.warn("[auth] token presented but Supabase anon client is not configured.");
    return null;
  }
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) {
    console.warn("[auth] invalid/expired token:", error?.message ?? "no user");
    return null;
  }
  return {
    playerId: data.user.id,
    displayName:
      (data.user.user_metadata?.display_name as string | undefined) ??
      data.user.email?.split("@")[0] ??
      "Player",
    isGuest: false,
  };
}

/** Guest identity for casual play only. Never accepted for ranked. */
export function guestIdentity(deviceId: string): PlayerIdentity {
  const clean = deviceId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "unknown-device";
  return { playerId: `guest:${clean}`, displayName: "Khách", isGuest: true };
}
