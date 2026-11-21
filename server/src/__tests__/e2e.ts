/**
 * M2 end-to-end test (no test runner configured — run with:
 *   npx ts-node --transpile-only src/__tests__/e2e.ts
 * Exits 0 when every check passes, 1 otherwise.
 *
 * Boots the real server as a child process (PORT 2568, M2_FAST=1, empty
 * Supabase env), then drives 8 real Colyseus clients through the full
 * queue → room → prep → combat flow:
 *  - GET /health returns {"ok":true,"protocol_version":1}
 *  - POST /queue ×8 → GET /queue/:playerId returns a roomId
 *  - joinById with {protocol_version: 1, playerId} (dev mode: no Supabase)
 *  - prep actions over the wire: buy a shop unit, move it bench → board
 *  - round 1 (PvE): each client receives combat events that reference ONLY
 *    its own units (uid prefix "<playerId>:") or PvE monsters ("pve:") —
 *    never another player's units
 *  - round 2 (PvP): each client sees foreign uids from AT MOST ONE other
 *    player (its pair opponent) — never events from other pairs
 *  - every client gets an s2c_round_result for round 1
 *  - M4 anti-cheat over the wire (client e2e-p8): 12 rapid prep actions
 *    in round 2 → RATE_LIMITED + actions locked for the round
 *    (ACTION_LOCKED); 3 more trips in round-2 combat → the session is
 *    dropped (5 violations); GET /debug/telemetry shows real counts and
 *    GET /debug/replay/:roomId re-verifies rounds 1–2 with 0 mismatches;
 *    the JSONL telemetry log (TELEMETRY_LOG_PATH) feeds the report
 *    script, which must print real numbers (buys ≥ 8).
 */
import { execSync, spawn, type ChildProcess } from "child_process";
import { rmSync } from "fs";
import { join } from "path";
import { Client, type Room } from "colyseus.js";

const PORT = 2568;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const PLAYERS = Array.from({ length: 8 }, (_, i) => `e2e-p${i + 1}`);
const SERVER_DIR = join(__dirname, "..", "..");
const TELEMETRY_LOG = join(SERVER_DIR, "telemetry-e2e.log");

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(name: string, fn: () => Promise<T | null>, timeoutMs: number, intervalMs = 250): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (last !== null && last !== undefined) return last;
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for ${name} (last=${JSON.stringify(last)})`);
}

interface ClientState {
  room: Room;
  eventsR1: { unit_uid?: string | null; target_uid?: string | null }[];
  eventsR2: { unit_uid?: string | null; target_uid?: string | null }[];
  roundResultR1: boolean;
  roundResultR2: boolean;
  roundId: number;
  phase: string;
  /** s2c_error codes received (persistent collector, M4 anti-cheat). */
  errors: { code: string }[];
  /** True once the server dropped this session (rate-limit disconnect). */
  disconnected: boolean;
}

async function main(): Promise<void> {
  console.log("== build ==");
  execSync("npm run build", { cwd: SERVER_DIR, stdio: "inherit" });
  // Fresh telemetry log for this run (the report script reads it after).
  rmSync(TELEMETRY_LOG, { force: true });

  console.log("== boot server ==");
  const server: ChildProcess = spawn("node", ["dist/index.js"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      M2_FAST: "1",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      TELEMETRY_LOG_PATH: TELEMETRY_LOG,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout?.on("data", (d: Buffer) => { serverLog += d.toString(); });
  server.stderr?.on("data", (d: Buffer) => { serverLog += d.toString(); });
  const killServer = () => {
    try { server.kill("SIGTERM"); } catch { /* already dead */ }
  };

  try {
    const health = await waitFor("health", async () => {
      try {
        const r = await fetch(`${BASE}/health`);
        if (!r.ok) return null;
        return (await r.json()) as { ok: boolean; protocol_version: number };
      } catch {
        return null;
      }
    }, 15_000);
    check("GET /health → {ok:true, protocol_version:1}", health.ok === true && health.protocol_version === 1, JSON.stringify(health));

    console.log("== queue ==");
    for (const pid of PLAYERS) {
      const r = await fetch(`${BASE}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: pid, displayName: pid, mmr: 1000, matchesPlayed: 0, mode: "CASUAL", platform: "WEB", isGuest: false }),
      });
      const body = (await r.json()) as { ok: boolean; status?: string };
      if (!body.ok) throw new Error(`POST /queue ${pid} failed: ${JSON.stringify(body)}`);
    }
    check("POST /queue ×8 accepted", true);
    const roomId = await waitFor("roomId", async () => {
      const r = await fetch(`${BASE}/queue/${PLAYERS[0]}`);
      if (!r.ok) return null;
      const body = (await r.json()) as { status: string; roomId?: string };
      return body.status === "matched" && body.roomId ? body.roomId : null;
    }, 15_000);
    check("GET /queue/:playerId → matched with roomId", typeof roomId === "string" && roomId.length > 0, roomId ?? "");

    console.log("== join + prep ==");
    const colyseus = new Client(WS);
    const states = new Map<string, ClientState>();
    const joinAll = await Promise.all(PLAYERS.map(async (pid) => {
      const room = await colyseus.joinById(roomId, { protocol_version: 1, playerId: pid });
      const st: ClientState = { room, eventsR1: [], eventsR2: [], roundResultR1: false, roundResultR2: false, roundId: 0, phase: "", errors: [], disconnected: false };
      states.set(pid, st);
      room.onMessage("s2c_room_state", (m: { phase: string; round_id: number }) => {
        st.phase = m.phase;
        st.roundId = m.round_id;
      });
      room.onMessage("s2c_combat_events", (m: { round_id: number; events: ClientState["eventsR1"] }) => {
        if (m.round_id === 1) st.eventsR1.push(...m.events);
        else if (m.round_id === 2) st.eventsR2.push(...m.events);
      });
      room.onMessage("s2c_round_result", (m: { round_id: number }) => {
        if (m.round_id === 1) st.roundResultR1 = true;
        else if (m.round_id === 2) st.roundResultR2 = true;
      });
      room.onMessage("s2c_error", (m: { code: string }) => {
        st.errors.push(m);
      });
      room.onLeave(() => {
        st.disconnected = true;
      });
      return { pid, room };
    }));
    check("all 8 clients joined the room", joinAll.length === 8, "");

    // Prep (round 1, 3 s in fast mode): buy one shop unit, move it to the
    // board. The server answers each action with a board snapshot (success)
    // or s2c_error (failure — try the next shop slot).
    await Promise.all(PLAYERS.map(async (pid) => {
      const st = states.get(pid)!;
      const room = st.room;
      await waitFor(`prep phase for ${pid}`, async () => (st.phase === "PREP_PHASE" ? true : null), 10_000, 100);
      let bought = false;
      for (let slot = 0; slot < 5 && !bought; slot++) {
        const outcome = await new Promise<"ok" | "err">((resolve) => {
          const timer = setTimeout(() => resolve("err"), 1500);
          const onSnap = () => { clearTimeout(timer); resolve("ok"); };
          const onErr = () => { clearTimeout(timer); resolve("err"); };
          room.onMessage("s2c_board_snapshot", onSnap);
          room.onMessage("s2c_error", onErr);
          room.send("c2s_buy_shop", { round_id: 1, shop_slot: slot });
          // NOTE: colyseus.js 0.15 keeps all onMessage handlers registered;
          // the first snapshot/error after this send resolves the promise.
        });
        bought = outcome === "ok";
      }
      if (!bought) throw new Error(`${pid}: could not buy any shop slot`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${pid}: move timed out`)), 2000);
        room.onMessage("s2c_board_snapshot", () => { clearTimeout(timer); resolve(); });
        room.send("c2s_move_unit", { round_id: 1, from: { zone: "BENCH", index: 0 }, to: { zone: "BOARD", index: 0 } });
      });
    }));
    check("prep: all 8 bought a unit and placed it on the board", true);

    console.log("== combat round 1 (PvE) ==");
    await waitFor("round 1 results", async () => {
      const done = [...states.values()].every((s) => s.roundResultR1);
      return done ? true : null;
    }, 30_000);
    check("all 8 received s2c_round_result for round 1", true);

    let r1Ok = true;
    let r1Detail = "";
    for (const pid of PLAYERS) {
      const st = states.get(pid)!;
      if (st.eventsR1.length === 0) { r1Ok = false; r1Detail = `${pid} got 0 events`; break; }
      for (const ev of st.eventsR1) {
        for (const uid of [ev.unit_uid, ev.target_uid]) {
          if (!uid) continue;
          if (uid.startsWith(`${pid}:`) || uid.startsWith("pve:")) continue;
          r1Ok = false;
          r1Detail = `${pid} saw foreign uid ${uid}`;
          break;
        }
        if (!r1Ok) break;
      }
      if (!r1Ok) break;
    }
    check("round 1 (PvE): events reference only own units or pve monsters", r1Ok, r1Detail);

    console.log("== M4 anti-cheat: rate-limit + lock (round 2 prep, e2e-p8) ==");
    {
      const spammer = states.get("e2e-p8")!;
      // Round 2 prep is 3 s in fast mode: wait for it, then fire 12
      // lock toggles in one burst (PREP limit is 10/s).
      await waitFor("round 2 prep", async () => (spammer.phase === "PREP_PHASE" && spammer.roundId === 2 ? true : null), 10_000, 100);
      spammer.errors = [];
      for (let i = 0; i < 12; i++) spammer.room.send("c2s_toggle_lock_shop", { round_id: 2 });
      await sleep(400);
      check("rate-limit: 12 rapid actions → RATE_LIMITED", spammer.errors.some((e) => e.code === "RATE_LIMITED"),
        `errors=${JSON.stringify(spammer.errors.map((e) => e.code))}`);
      // Next window: the client is locked for the rest of round 2 (SRS §13.2).
      await sleep(1100);
      spammer.errors = [];
      spammer.room.send("c2s_toggle_lock_shop", { round_id: 2 });
      await sleep(400);
      check("rate-limit lock: next action in round 2 → ACTION_LOCKED", spammer.errors.some((e) => e.code === "ACTION_LOCKED"),
        `errors=${JSON.stringify(spammer.errors.map((e) => e.code))}`);
      // p8 already has 2 violations; 3 more trips (below) disconnect it.
    }

    console.log("== combat round 2 (PvP) ==");
    await waitFor("round 2 events", async () => {
      const got = [...states.values()].filter((s) => s.eventsR2.length > 0).length;
      return got >= 8 ? true : null;
    }, 30_000);
    let r2Ok = true;
    let r2Detail = "";
    const pairsSeen = new Set<string>();
    for (const pid of PLAYERS) {
      const st = states.get(pid)!;
      const foreign = new Set<string>();
      for (const ev of st.eventsR2) {
        for (const uid of [ev.unit_uid, ev.target_uid]) {
          if (!uid || uid.startsWith(`${pid}:`)) continue;
          foreign.add(uid.split(":")[0]);
        }
      }
      if (foreign.size > 1) { r2Ok = false; r2Detail = `${pid} saw ${foreign.size} foreign players: ${[...foreign].join(",")}`; break; }
      if (foreign.size === 1) pairsSeen.add([pid, [...foreign][0]].sort().join("|"));
    }
    check("round 2 (PvP): each client sees at most one foreign player (its pair)", r2Ok, r2Detail);
    check("round 2: at least 3 distinct pairs observed across clients", pairsSeen.size >= 3, `pairs=${pairsSeen.size}`);

    console.log("== M4 anti-cheat: rate-limit disconnect (round 2 combat, e2e-p8) ==");
    {
      // p8 already has 2 violations from the prep spam. In COMBAT the
      // limit is 2/s, so each burst of 3 buys trips it once; 3 bursts
      // (1.1 s apart) reach 5 violations and the server drops the session.
      const spammer = states.get("e2e-p8")!;
      for (let burst = 0; burst < 3 && !spammer.disconnected; burst++) {
        for (let i = 0; i < 3; i++) spammer.room.send("c2s_buy_shop", { round_id: 2, shop_slot: 0 });
        await sleep(1100);
      }
      await waitFor("p8 disconnect", async () => (spammer.disconnected ? true : null), 5000, 200);
      check("rate-limit: 5 violations → session dropped", spammer.disconnected, "");
    }

    console.log("== M4: round 2 results + debug endpoints ==");
    await waitFor("round 2 results (other 7)", async () => {
      const done = PLAYERS.filter((p) => p !== "e2e-p8").every((p) => states.get(p)!.roundResultR2);
      return done ? true : null;
    }, 30_000);
    check("other 7 clients received s2c_round_result for round 2", true);
    {
      const tr = await fetch(`${BASE}/debug/telemetry`);
      const tele = (await tr.json()) as { ok: boolean; report: { buys: number; rateLimited: number; rejectedActions: Record<string, number>; cheatSuspects: Record<string, number> } };
      check("GET /debug/telemetry: buys ≥ 8 (real data)", tele.ok && tele.report.buys >= 8, JSON.stringify(tele.report));
      check("GET /debug/telemetry: rateLimited ≥ 1", tele.report.rateLimited >= 1, `rateLimited=${tele.report.rateLimited}`);
      const rejectedTotal = Object.values(tele.report.rejectedActions).reduce((a, b) => a + b, 0);
      check("GET /debug/telemetry: rejected actions ≥ 1", rejectedTotal >= 1, `rejected=${rejectedTotal}`);
      const rr = await fetch(`${BASE}/debug/replay/${roomId}`);
      const replay = (await rr.json()) as { ok: boolean; rounds: { ok: boolean; pairKey: string }[]; mismatches: number };
      check("GET /debug/replay: rounds 1–2 re-verified", replay.ok && replay.rounds.length >= 2, `rounds=${replay.rounds.length}`);
      check("GET /debug/replay: 0 mismatches", replay.mismatches === 0, `mismatches=${replay.mismatches}`);
    }

    for (const { pid, room } of joinAll) {
      // Clients the server already dropped (rate-limit disconnect) never
      // resolve room.leave() — skip them instead of hanging the test.
      if (states.get(pid)!.disconnected) continue;
      try {
        await Promise.race([
          room.leave(),
          new Promise((r) => setTimeout(r, 3000)),
        ]);
      } catch { /* ignore */ }
    }
  } finally {
    killServer();
    await sleep(1000);
    if (server.exitCode === null) {
      try { server.kill("SIGKILL"); } catch { /* already dead */ }
      await sleep(500);
    }
    if (failed > 0) console.log("--- server log (tail) ---\n" + serverLog.slice(-3000));
  }

  console.log("== M4: telemetry report script on the JSONL log ==");
  try {
    const out = execSync(
      `npx ts-node --transpile-only src/scripts/telemetry-report.ts ${TELEMETRY_LOG}`,
      { cwd: SERVER_DIR, encoding: "utf8", timeout: 60_000 },
    );
    check("telemetry-report runs on the e2e log", true);
    check("telemetry-report: buys ≥ 8 in output", /buys: [8-9]\d*|buys: [1-9]\d\d+/.test(out), out.split("\n").slice(0, 3).join(" | "));
    check("telemetry-report: rate-limited ≥ 1 in output", /rate-limited: [1-9]/.test(out), "");
    check("telemetry-report: replay verified ≥ 1 in output", /replay verified: [1-9]/.test(out), "");
  } catch (err) {
    check("telemetry-report runs on the e2e log", false, err instanceof Error ? err.message : String(err));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err: Error) => {
  console.error("E2E FAILED:", err);
  process.exit(1);
});
