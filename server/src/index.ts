/**
 * Server entry point — Colyseus 0.15 + WebSocket transport.
 *
 * Rooms:
 *  - "battle"  → BattleRoom (8 players, SRS §9). Created by matchmaking
 *                once a queue forms a full group (see src/matchmaking.ts).
 *  - "lobby"   → not a Colyseus room: the lobby is Supabase Realtime
 *                (presence + queue status) per docs/online-architecture.md.
 *                Colyseus is used only for the match itself, never for chat
 *                or lobby presence.
 *
 * Health endpoint: GET /health returns 200 {"ok":true} — used by Render's
 * healthCheckPath (render.yaml). No game logic lives on HTTP; everything
 * realtime goes over the Colyseus WebSocket.
 */
import "dotenv/config";
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { loadBalanceConfig, loadEnv } from "./config";
import { createSupabaseClients } from "./supabase";
import { BattleRoom } from "./rooms/BattleRoom";

const env = loadEnv();
const cfg = loadBalanceConfig();
const supabase = createSupabaseClients(env);

if (!supabase.enabled) {
  console.warn("[server] starting WITHOUT Supabase persistence — see server/.env.example");
}
console.log(`[server] balance v${cfg.config_version}, protocol v${cfg.protocol_version}, tick ${cfg.tick_hz} Hz`);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, protocol_version: cfg.protocol_version }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("battle", BattleRoom);

// NOTE: there is deliberately no REST matchmaking endpoint here. Queueing
// is: client → Supabase Auth (JWT) → Colyseus "battle" join with the token
// in options, verified in BattleRoom.onJoin via src/auth.ts. A separate
// matchmaking worker that creates rooms from the queue lives in
// src/matchmaking.ts (MatchQueue) and is wired in when the first lobby is
// built — see docs/online-architecture.md §5.

gameServer.listen(env.port);
console.log(`[server] Colyseus listening on port ${env.port}`);
