/**
 * Wire protocol — SRS §10. Message NAMES and FIELDS follow the SRS.
 * Wire FORMAT differs on purpose: Colyseus serialises room state with
 * @colyseus/schema (binary, diff-patched) and broadcasts combat events as
 * typed messages. The SRS's Protobuf-over-WebSocket requirement is adapted
 * here — same protocol_version (1), same round_id on every round message,
 * same event list — because Colyseus is the locked M2 server framework and
 * its schema encoding is what keeps bandwidth under the 5 KB/s/client budget
 * (SRS §2.3). A raw Protobuf migration is a later, optional change; it must
 * not change message names or semantics.
 */
export const PROTOCOL_VERSION = 1;

/** Client → server intents (SRS §10.1). Clients send intentions only — never results.
 * M4: every prep action may carry an optional `action_id` (client-chosen
 * unique string). When present, the server rejects a repeat of the same
 * id in the same round as DUPLICATE_ACTION (replay protection). */
export type C2SMessage =
  | { type: "c2s_join_queue"; mode: "RANKED" | "CASUAL"; platform: "WEB" | "ANDROID" | "IOS" }
  | { type: "c2s_move_unit"; round_id: number; action_id?: string; from: { zone: "BENCH" | "BOARD"; index: number }; to: { zone: "BENCH" | "BOARD"; index: number } }
  | { type: "c2s_buy_shop"; round_id: number; action_id?: string; shop_slot: number }
  | { type: "c2s_sell_unit"; round_id: number; action_id?: string; zone: "BENCH" | "BOARD"; index: number }
  | { type: "c2s_reroll_shop"; round_id: number; action_id?: string }
  | { type: "c2s_toggle_lock_shop"; round_id: number; action_id?: string }
  | { type: "c2s_buy_xp"; round_id: number; action_id?: string }
  | { type: "c2s_equip_item"; round_id: number; action_id?: string; item_uid: string; target_unit_uid: string };

/** Server → client (SRS §10.2). Combat is events-only: move/attack/skill_cast/damage/heal/cc/death/karma_trigger. */
export type CombatEventType = "move" | "attack" | "skill_cast" | "damage" | "heal" | "cc" | "death" | "karma_trigger";

export interface CombatEvent {
  tick: number;
  type: CombatEventType;
  /** Unit instance id on the board, or null for room-level events. */
  unit_uid?: string | null;
  target_uid?: string | null;
  /** Hex index (row*7+col, SRS §3.1) for move events. */
  hex_index?: number;
  amount?: number;
  skill_id?: string;
  crit?: boolean;
  dodged?: boolean;
}

export type S2CMessage =
  | { type: "s2c_room_state"; protocol_version: number; phase: string; countdown_sec: number; round_id: number; players: unknown[] }
  | { type: "s2c_board_snapshot"; protocol_version: number; round_id: number; player_id: string; board: unknown; bench: unknown[] }
  | { type: "s2c_combat_events"; protocol_version: number; round_id: number; tick: number; events: CombatEvent[] }
  | { type: "s2c_round_result"; protocol_version: number; round_id: number; result: "win" | "loss" | "draw"; damage_taken: number; gold_earned: number; eliminated: string[] }
  | { type: "s2c_game_over"; protocol_version: number; standings: { player_id: string; placement: number; mmr_delta: number }[] }
  | { type: "s2c_error"; protocol_version: number; code: string; message: string };
