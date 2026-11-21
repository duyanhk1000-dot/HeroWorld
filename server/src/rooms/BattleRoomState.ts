/**
 * Colyseus room state — synchronised to clients via @colyseus/schema.
 * Only the fields the client renders go here. Combat detail travels as
 * s2c_combat_events messages (src/protocol.ts), never as state, so the
 * client cannot reconstruct the sim from state alone (SRS §5.1).
 */
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") displayName = "";
  @type("number") hp = 100;
  @type("number") gold = 5;
  @type("number") level = 1;
  @type("number") xp = 0;
  @type("number") streak = 0;
  @type("boolean") alive = true;
  @type("boolean") isBot = false;
  @type("boolean") connected = true;
  /** JSON-encoded shop (5 unit_ids) + bench/board are sent as snapshots, not state. */
  @type("string") shopJson = "[]";
  @type("boolean") shopLocked = false;
}

export class BattleRoomState extends Schema {
  @type("string") phase: "WAITING_PLAYERS" | "PREP_PHASE" | "COMBAT_PHASE" | "ROUND_RESOLVE" | "GAME_OVER" = "WAITING_PLAYERS";
  @type("number") protocolVersion = 1;
  @type("number") roundId = 0;
  @type("number") stage = 1;
  @type("number") roundInStage = 0;
  @type("number") countdownSec = 0;
  @type("number") tick = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(["string"]) eliminatedOrder = new ArraySchema<string>();
}
