/**
 * Seeded RNG — SRS §5.1: every random draw (shop roll, crit, dodge, target
 * tie-break, item drop) must come from the round's round_seed, in a fixed
 * tick order. Math.random() is FORBIDDEN in simulation code.
 *
 * mulberry32 is small, deterministic and identical across JS/TS runtimes.
 * The Godot M1 sim must use the same algorithm + the same draw order for a
 * replay to match; see src/combat.ts for the shared draw-order contract.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // mulberry32 requires a non-zero 32-bit state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick one element, uniformly. */
  pick<T>(items: readonly T[]): T {
    return items[this.nextInt(0, items.length - 1)];
  }
}

/** Derive a per-round seed from the match id + round number (server-side only). */
export function makeRoundSeed(matchId: string, round: number): number {
  let h = 2166136261;
  const s = `${matchId}:${round}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
