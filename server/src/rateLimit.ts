/**
 * Per-client rate limiting — M4 anti-cheat (SRS §13.2).
 *
 * SRS requires rate-limiting actions per account; the SRS names Redis as
 * the store, but this server runs as a single worker (Render free tier),
 * so the limiter is in-memory per process. If the server ever scales to
 * multiple workers, move this state to Redis (same sliding-window
 * algorithm, keyed by account id) — the interface below is already
 * keyed per player so the swap is mechanical.
 *
 * Limits (chosen for human play; a legit client sends at most a few
 * actions per second — a click is one message):
 *   - PREP_PHASE:  10 actions / second (burst of buys + moves + rerolls)
 *   - COMBAT_PHASE and any other phase: 2 actions / second
 *   - Lockout: when a client trips the limit, its prep actions are
 *     locked until the end of the current round (SRS §13.2: "vượt ngưỡng
 *     bị khóa thao tác tới hết vòng"), and the trip is logged.
 *   - Disconnect: 5 trips in one match → the session is dropped
 *     (rate_limit_disconnect). A real account-ban system is out of scope
 *     for M4 — see docs/online-architecture.md §9.
 */
export const RATE_LIMIT_PREP_PER_SEC = 10;
export const RATE_LIMIT_OTHER_PER_SEC = 2;
/** Trips in one match before the session is dropped. */
export const RATE_LIMIT_MAX_VIOLATIONS = 5;

/** Sliding-window limiter: at most `limit` allows per 1000 ms window. */
export class RateLimiter {
  private hits: number[] = [];

  /** True if this attempt is within the limit (and records it). */
  allow(nowMs: number, limitPerSec: number): boolean {
    const cutoff = nowMs - 1000;
    while (this.hits.length > 0 && this.hits[0] <= cutoff) this.hits.shift();
    if (this.hits.length >= limitPerSec) return false;
    this.hits.push(nowMs);
    return true;
  }

  /** Attempts recorded in the current window (for tests / telemetry). */
  countInWindow(nowMs: number): number {
    const cutoff = nowMs - 1000;
    while (this.hits.length > 0 && this.hits[0] <= cutoff) this.hits.shift();
    return this.hits.length;
  }
}

/** Per-player anti-cheat state kept by BattleRoom. */
export class PlayerAntiCheat {
  readonly limiter = new RateLimiter();
  /** Round the player is locked out of prep actions for (null = not locked). */
  lockedRound: number | null = null;
  /** Rate-limit trips this match (disconnect at RATE_LIMIT_MAX_VIOLATIONS). */
  violations = 0;
  /** Action ids already seen this round (dedupe; cleared per round). */
  seenActionIds = new Set<string>();

  /** Lock prep actions for the given round (SRS §13.2). */
  lockForRound(roundId: number): void {
    this.lockedRound = roundId;
  }

  isLockedForRound(roundId: number): boolean {
    return this.lockedRound === roundId;
  }

  /** Record a rate-limit trip; returns true when the player must be dropped. */
  recordViolation(): boolean {
    this.violations += 1;
    return this.violations >= RATE_LIMIT_MAX_VIOLATIONS;
  }

  /** Called at the start of every prep phase. */
  beginRound(): void {
    this.seenActionIds.clear();
  }
}
