/**
 * Matchmaking — SRS §11.2.
 *
 * - MMR starts at 1000. Placement deltas: 1st +40, 2nd +25, 3rd +12, 4th +4,
 *   5th -6, 6th -14, 7th -24, 8th -36 (× BOT_FILL_MMR_FACTOR 0.5 when the
 *   room had bot fill).
 * - Queue window: max MMR gap 150 for the first 20 s, 300 after 40 s.
 * - Bot fill: after 60 s (casual) or 90 s (ranked).
 * - New players (<10 matches) queue in their own pool; their first 3
 *   matches are at least half bots.
 *
 * NOTE: this is the in-process queue used by the first Render instance.
 * When a second Render instance exists, the queue must move to a shared
 * store (Supabase Postgres table `match_queue`, or Redis if it is ever
 * added back). The interface below is deliberately store-shaped so that
 * swap is a one-file change.
 */
import { BOT_FILL_MMR_FACTOR, MMR_DELTAS, MMR_START } from "./config";

export type QueueMode = "RANKED" | "CASUAL";

export interface QueuedPlayer {
  playerId: string;
  mmr: number;
  matchesPlayed: number;
  mode: QueueMode;
  platform: "WEB" | "ANDROID" | "IOS";
  enqueuedAt: number;
  isGuest: boolean;
}

export interface MatchGroup {
  players: QueuedPlayer[];
  botCount: number;
  botFill: boolean;
}

export function mmrDeltaForPlacement(placement: number, botFill: boolean): number {
  const base = MMR_DELTAS[placement - 1] ?? 0;
  return botFill ? Math.round(base * BOT_FILL_MMR_FACTOR) : base;
}

/** Max MMR spread allowed at a given queue age (ms), SRS §11.2. */
export function maxMmrGap(queueAgeMs: number): number {
  if (queueAgeMs < 20_000) return 150;
  if (queueAgeMs < 40_000) return 150; // gap stays 150 until 40 s, then widens
  return 300;
}

export function botFillAfterMs(mode: QueueMode): number {
  return mode === "RANKED" ? 90_000 : 60_000;
}

export class MatchQueue {
  private queue: QueuedPlayer[] = [];

  enqueue(player: QueuedPlayer): void {
    if (player.isGuest && player.mode === "RANKED") {
      throw new Error("guests cannot join ranked (SRS §11.3)");
    }
    this.queue = this.queue.filter((q) => q.playerId !== player.playerId);
    this.queue.push(player);
  }

  leave(playerId: string): void {
    this.queue = this.queue.filter((q) => q.playerId !== playerId);
  }

  get size(): number {
    return this.queue.length;
  }

  /**
   * Try to form one 8-player match. Returns null while the queue is not
   * ready; the caller re-checks on a timer. New players (<10 matches) are
   * only grouped with other new players while enough are waiting.
   */
  tryFormMatch(now: number): MatchGroup | null {
    const ROOM_SIZE = 8;
    const sorted = [...this.queue].sort((a, b) => a.mmr - b.mmr);
    for (let i = 0; i < sorted.length; i++) {
      const anchor = sorted[i];
      const age = now - anchor.enqueuedAt;
      const gap = maxMmrGap(age);
      const sameMode = sorted.filter(
        (q) => q.mode === anchor.mode && Math.abs(q.mmr - anchor.mmr) <= gap,
      );
      // Keep the new-player pool separate while it can fill on its own.
      const pool = anchor.matchesPlayed < 10
        ? sameMode.filter((q) => q.matchesPlayed < 10)
        : sameMode;
      if (pool.length >= ROOM_SIZE) {
        const players = pool.slice(0, ROOM_SIZE);
        this.removePlayers(players);
        return { players, botCount: 0, botFill: false };
      }
      // Bot fill once the anchor has waited long enough.
      if (age >= botFillAfterMs(anchor.mode) && pool.length >= 1) {
        const players = pool.slice(0, ROOM_SIZE);
        const botCount = ROOM_SIZE - players.length;
        this.removePlayers(players);
        return { players, botCount, botFill: true };
      }
    }
    return null;
  }

  private removePlayers(players: QueuedPlayer[]): void {
    const ids = new Set(players.map((p) => p.playerId));
    this.queue = this.queue.filter((q) => !ids.has(q.playerId));
  }
}

export { MMR_START };
