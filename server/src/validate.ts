/**
 * Prep-action validation helpers — M4 anti-cheat (SRS §13.2).
 *
 * The server is authoritative: every client intent is checked here
 * before any state mutates. A rejected action changes nothing and gets
 * an s2c_error. These helpers are pure (no room state) so they are
 * unit-testable; BattleRoom wires them into handlePrepAction.
 *
 * What is checked (SRS §13.2: phase, round_id, gold, unit count vs
 * level, item ownership, position):
 *  - round_id must be present, an integer, and equal to the current round
 *    (a missing round_id used to be silently accepted — no longer).
 *  - shop_slot / bench / board indices must be integers inside the legal
 *    range. NaN, floats and out-of-range values are rejected: without
 *    this, `board[NaN]` would write a junk property onto the board array.
 *  - action_id (optional, client-supplied): when present it must be a
 *    non-empty string, unique per player per round. A repeat is a
 *    duplicate/replayed action and is rejected as DUPLICATE_ACTION.
 */
import type { Zone } from "./economy";

export const BOARD_CELLS = 56; // 7x8, index = row*7+col (SRS §3.1)
export const BENCH_SLOTS = 9; // SRS §3.2
export const SHOP_SLOTS = 5; // SRS §4.2

export type ValidationError = { code: string; reason: string };

/** round_id must be an integer equal to the current round. */
export function validateRoundId(msgRoundId: unknown, currentRound: number): ValidationError | null {
  if (typeof msgRoundId !== "number" || !Number.isInteger(msgRoundId)) {
    return { code: "STALE_ROUND", reason: "round_id missing or not an integer" };
  }
  if (msgRoundId !== currentRound) {
    return { code: "STALE_ROUND", reason: `round_id ${msgRoundId} does not match current round ${currentRound}` };
  }
  return null;
}

/** shop_slot must be an integer in [0, 5). */
export function validateShopSlot(slot: unknown): ValidationError | null {
  if (typeof slot !== "number" || !Number.isInteger(slot)) {
    return { code: "BAD_BUY", reason: "shop_slot must be an integer" };
  }
  if (slot < 0 || slot >= SHOP_SLOTS) {
    return { code: "BAD_BUY", reason: `shop_slot ${slot} out of range 0..${SHOP_SLOTS - 1}` };
  }
  return null;
}

/** {zone, index} must be well-formed with an integer index in range. */
export function validateZoneIndex(v: unknown): { zone: Zone; index: number } | ValidationError {
  if (typeof v !== "object" || v === null) {
    return { code: "BAD_MOVE", reason: "from/to must be {zone: BENCH|BOARD, index: number}" };
  }
  const o = v as Record<string, unknown>;
  if (o.zone !== "BENCH" && o.zone !== "BOARD") {
    return { code: "BAD_MOVE", reason: `zone must be BENCH|BOARD, got ${String(o.zone)}` };
  }
  if (typeof o.index !== "number" || !Number.isInteger(o.index)) {
    return { code: "BAD_MOVE", reason: "index must be an integer" };
  }
  const max = o.zone === "BOARD" ? BOARD_CELLS : BENCH_SLOTS;
  if (o.index < 0 || o.index >= max) {
    return { code: "BAD_MOVE", reason: `${o.zone} index ${o.index} out of range 0..${max - 1}` };
  }
  return { zone: o.zone as Zone, index: o.index };
}

/** zone + index for sell: zone BENCH|BOARD, integer index in range. */
export function validateSellTarget(zone: unknown, index: unknown): ValidationError | null {
  if (zone !== "BENCH" && zone !== "BOARD") {
    return { code: "BAD_SELL", reason: `zone must be BENCH|BOARD, got ${String(zone)}` };
  }
  if (typeof index !== "number" || !Number.isInteger(index)) {
    return { code: "BAD_SELL", reason: "index must be an integer" };
  }
  const max = zone === "BOARD" ? BOARD_CELLS : BENCH_SLOTS;
  if (index < 0 || index >= max) {
    return { code: "BAD_SELL", reason: `${zone} index ${index} out of range 0..${max - 1}` };
  }
  return null;
}

/**
 * Optional client-supplied action_id dedupe. Returns an error when the id
 * is present but malformed, or was already seen this round (replay of an
 * earlier action). Returns null when there is no action_id (clients are
 * not required to send one yet) or the id is fresh.
 */
export function validateActionId(
  actionId: unknown,
  seenThisRound: Set<string>,
): ValidationError | null {
  if (actionId === undefined || actionId === null) return null;
  if (typeof actionId !== "string" || actionId.length === 0 || actionId.length > 128) {
    return { code: "BAD_ACTION_ID", reason: "action_id must be a non-empty string (max 128 chars)" };
  }
  if (seenThisRound.has(actionId)) {
    return { code: "DUPLICATE_ACTION", reason: `action_id ${actionId} already used this round` };
  }
  return null;
}
