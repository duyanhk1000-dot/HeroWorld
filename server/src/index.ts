/**
 * Server entry point — Colyseus 0.15 + WebSocket transport.
 *
 * Rooms:
 *  - "battle"  → BattleRoom (8 players, SRS §9). Created by the MatchWorker
 *                once a queue forms a full group (see src/matchWorker.ts);
 *                clients join by room id (joinById) after polling /queue.
 *  - "lobby"   → not a Colyseus room: the lobby is Supabase Realtime
 *                (presence + queue status) per docs/online-architecture.md.
 *                Colyseus is used only for the match itself, never for chat
 *                or lobby presence.
 *
 * HTTP endpoints (this process; queue polling is cheap and keeps the lobby
 * free of a separate service):
 *  - GET  /health          → 200 {"ok":true, "protocol_version":1} (Render healthCheckPath)
 *  - POST /queue           → enqueue {playerId, displayName?, mmr?, matchesPlayed?,
 *                             mode: RANKED|CASUAL, platform: WEB|ANDROID|IOS, isGuest}
 *                             400 for guest+ranked (SRS §11.3)
 *  - GET  /queue/:playerId → {status:"waiting"} | {status:"matched", roomId} | 404 unknown
 *  - DELETE /queue/:playerId → leave the queue
 *
 * Join flow: POST /queue → poll GET /queue/:playerId → joinById(roomId) with
 * options {token} (Supabase JWT) or {playerId: "guest:<deviceId>"} — the
 * token is verified in BattleRoom.onAuth, never trusted from the client.
 *
 * Debug endpoints (M4 anti-cheat; see docs/online-architecture.md §9):
 *  - GET  /debug/replay/:matchId  → re-verify every recorded round of a
 *    match from its stored replay inputs (SRS §13.2 "replay công khai sau
 *    trận"). {ok, rounds:[{pairKey, ok, liveHash, replayHash, ...}], mismatches}
 *  - GET  /debug/telemetry        → aggregate meta report across stored matches
 *  - GET  /debug/telemetry/:matchId → aggregate meta report for one match
 *  When ADMIN_TOKEN is set, these require `x-admin-token` header or
 *  `?token=`; when unset (local dev) they are open.
 */
import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { loadBalanceConfig, loadEnv } from "./config";
import { loadGameData, type GameData } from "./data";
import { createSupabaseClients } from "./supabase";
import { getGlobalReport, getMatchReport, getStoredMatchIds, setTelemetryLogPath } from "./telemetry";
import { hasMatchReplays, verifyMatchReplays } from "./replayStore";
import { BattleRoom } from "./rooms/BattleRoom";
import { MatchWorker } from "./matchWorker";

const env = loadEnv();
const cfg = loadBalanceConfig();
const supabase = createSupabaseClients(env);
setTelemetryLogPath(env.telemetryLogPath || null);
if (env.telemetryLogPath) console.log(`[server] telemetry JSONL log: ${env.telemetryLogPath}`);
if (!env.adminToken) {
  console.warn("[server] ADMIN_TOKEN is not set — /debug/* endpoints are open (local dev only)");
}

// Game data is loaded once for the /debug/replay endpoint (re-verification
// rebuilds combats from stored inputs). A missing data dir only disables
// that endpoint; rooms load their own copy in BattleRoom.onCreate.
let gameData: GameData | null = null;
try {
  gameData = loadGameData();
} catch (err) {
  console.warn("[server] game data not loaded at startup — /debug/replay will answer 503:", err instanceof Error ? err.message : String(err));
}

if (!supabase.enabled) {
  console.warn("[server] starting WITHOUT Supabase persistence — see server/.env.example");
}
console.log(`[server] balance v${cfg.config_version}, protocol v${cfg.protocol_version}, tick ${cfg.tick_hz} Hz`);

const matchWorker = new MatchWorker();
matchWorker.start();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
      if (data.length > 64 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, protocol_version: cfg.protocol_version });
    return;
  }
  if (req.method === "POST" && url.pathname === "/queue") {
    readJsonBody(req)
      .then((body) => {
        const playerId = body.playerId;
        const mode = body.mode;
        const platform = body.platform;
        if (typeof playerId !== "string" || playerId.length === 0) {
          return sendJson(res, 400, { ok: false, error: "playerId is required" });
        }
        if (mode !== "RANKED" && mode !== "CASUAL") {
          return sendJson(res, 400, { ok: false, error: "mode must be RANKED or CASUAL" });
        }
        if (platform !== "WEB" && platform !== "ANDROID" && platform !== "IOS") {
          return sendJson(res, 400, { ok: false, error: "platform must be WEB, ANDROID or IOS" });
        }
        const isGuest = body.isGuest === true;
        const already = matchWorker.roomFor(playerId);
        if (already) return sendJson(res, 200, { ok: true, status: "matched", roomId: already });
        try {
          matchWorker.enqueue(
            {
              playerId,
              mmr: typeof body.mmr === "number" ? body.mmr : 1000,
              matchesPlayed: typeof body.matchesPlayed === "number" ? body.matchesPlayed : 0,
              mode,
              platform,
              enqueuedAt: Date.now(),
              isGuest,
            },
            typeof body.displayName === "string" ? body.displayName : undefined,
          );
        } catch (err) {
          // Guests cannot join ranked (SRS §11.3) — MatchQueue enforces it.
          return sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        return sendJson(res, 200, { ok: true, status: "queued" });
      })
      .catch((err: Error) => sendJson(res, 400, { ok: false, error: err.message }));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/queue/")) {
    const playerId = decodeURIComponent(url.pathname.slice("/queue/".length));
    const roomId = matchWorker.roomFor(playerId);
    if (roomId) return sendJson(res, 200, { ok: true, status: "matched", roomId });
    if (matchWorker.isWaiting(playerId)) return sendJson(res, 200, { ok: true, status: "waiting" });
    return sendJson(res, 404, { ok: false, status: "unknown" });
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/queue/")) {
    const playerId = decodeURIComponent(url.pathname.slice("/queue/".length));
    matchWorker.leave(playerId);
    return sendJson(res, 200, { ok: true, status: "left" });
  }
  // ---- M4 debug endpoints (replay verification + telemetry reports) ----
  const checkAdmin = (): boolean => {
    if (!env.adminToken) return true; // local dev: open, see warning above
    const header = req.headers["x-admin-token"];
    const query = url.searchParams.get("token");
    if (header === env.adminToken || query === env.adminToken) return true;
    sendJson(res, 403, { ok: false, error: "admin token required" });
    return false;
  };
  if (req.method === "GET" && url.pathname.startsWith("/debug/replay/")) {
    if (!checkAdmin()) return;
    const matchId = decodeURIComponent(url.pathname.slice("/debug/replay/".length));
    if (!hasMatchReplays(matchId)) return sendJson(res, 404, { ok: false, error: "no replay records for match" });
    if (!gameData) return sendJson(res, 503, { ok: false, error: "game data not loaded" });
    return sendJson(res, 200, { ok: true, ...verifyMatchReplays(matchId, gameData, cfg) });
  }
  if (req.method === "GET" && url.pathname === "/debug/telemetry") {
    if (!checkAdmin()) return;
    return sendJson(res, 200, { ok: true, matches: getStoredMatchIds(), report: getGlobalReport() });
  }
  if (req.method === "GET" && url.pathname.startsWith("/debug/telemetry/")) {
    if (!checkAdmin()) return;
    const matchId = decodeURIComponent(url.pathname.slice("/debug/telemetry/".length));
    if (!getStoredMatchIds().includes(matchId)) return sendJson(res, 404, { ok: false, error: "no telemetry for match" });
    return sendJson(res, 200, { ok: true, report: getMatchReport(matchId) });
  }
  sendJson(res, 404, { ok: false, error: "not_found" });
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("battle", BattleRoom);

gameServer.listen(env.port);
console.log(`[server] Colyseus listening on port ${env.port}`);
