/**
 * Matchmaking worker — turns queued players into BattleRooms (SRS §11.2).
 *
 * Loop: every tick (default 1 s) ask MatchQueue.tryFormMatch(now). When a
 * group forms, create a "battle" room via Colyseus matchMaker with the 8
 * seats (humans + bot fill) and record playerId → roomId so clients can
 * poll GET /queue/:playerId and then joinById(roomId).
 *
 * Failure safety: if room creation throws, the human players are put back
 * in the queue with their original enqueuedAt (no silent loss). Bot seats
 * are generated here (display names Bot An…Bot Linh, M1 names) and are
 * server actors — they never join over the network.
 *
 * Single-instance queue (in-process). The MatchQueue interface is
 * store-shaped, so moving to a shared store for a second Render instance
 * is a one-file change (see matchmaking.ts).
 */
import { matchMaker } from "colyseus";
import { MatchQueue, type MatchGroup, type QueuedPlayer } from "./matchmaking";

const BOT_NAMES = ["Bot An", "Bot Bình", "Bot Chi", "Bot Dũng", "Bot Hà", "Bot Khang", "Bot Linh"];

export interface WorkerSeat {
  playerId: string;
  displayName: string;
  isBot: boolean;
}

export class MatchWorker {
  private queue: MatchQueue;
  private tickMs: number;
  private timer: NodeJS.Timeout | null = null;
  private creating = false;
  private botCounter = 0;
  /** playerId → roomId, once their match is created (polled by clients). */
  private matchedRooms = new Map<string, string>();
  /** Display names for humans (queue payload), keyed by playerId. */
  private displayNames = new Map<string, string>();

  constructor(queue: MatchQueue = new MatchQueue(), tickMs = 1000) {
    this.queue = queue;
    this.tickMs = tickMs;
  }

  get size(): number {
    return this.queue.size;
  }

  enqueue(player: QueuedPlayer, displayName?: string): void {
    if (displayName) this.displayNames.set(player.playerId, displayName);
    this.queue.enqueue(player);
  }

  leave(playerId: string): void {
    this.queue.leave(playerId);
    this.displayNames.delete(playerId);
  }

  /** Room id for a player whose match was created, if any. */
  roomFor(playerId: string): string | undefined {
    return this.matchedRooms.get(playerId);
  }

  /** True while the player is still waiting in the queue. */
  isWaiting(playerId: string): boolean {
    return this.queue.has(playerId);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    this.timer.unref?.();
    console.log(`[matchworker] started (tick ${this.tickMs} ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One queue pass. Returns the created room id, or null when no match
   * formed. Safe to call directly in tests (bypasses the timer).
   */
  async tick(now: number = Date.now()): Promise<string | null> {
    if (this.creating) return null;
    const group = this.queue.tryFormMatch(now);
    if (!group) return null;
    this.creating = true;
    try {
      const seats = this.buildSeats(group);
      const mode = group.players[0]?.mode ?? "CASUAL";
      const room = await matchMaker.createRoom("battle", { mode, seats });
      for (const s of seats) {
        if (!s.isBot) this.matchedRooms.set(s.playerId, room.roomId);
      }
      console.log(
        `[matchworker] room ${room.roomId} created mode=${mode} humans=${group.players.length} bots=${group.botCount}`,
      );
      return room.roomId;
    } catch (err) {
      // Put the humans back in the queue — a failed create must not eat them.
      console.error("[matchworker] createRoom failed, re-queueing players:", err);
      for (const p of group.players) {
        try {
          this.queue.enqueue(p);
        } catch (e) {
          console.error(`[matchworker] could not re-queue ${p.playerId}:`, e);
        }
      }
      return null;
    } finally {
      this.creating = false;
    }
  }

  private buildSeats(group: MatchGroup): WorkerSeat[] {
    const seats: WorkerSeat[] = group.players.map((p) => ({
      playerId: p.playerId,
      displayName: this.displayNames.get(p.playerId) ?? p.playerId,
      isBot: false,
    }));
    for (let i = 0; i < group.botCount; i++) {
      this.botCounter += 1;
      seats.push({
        playerId: `bot:${Date.now()}:${this.botCounter}`,
        displayName: BOT_NAMES[i % BOT_NAMES.length],
        isBot: true,
      });
    }
    return seats;
  }
}
