/**
 * M4 anti-cheat tests (no test runner configured — run with:
 *   npx ts-node --transpile-only src/__tests__/anticheat.ts
 *   npm run test:anticheat
 * Exits 0 when every check passes, 1 otherwise.
 *
 * Covers:
 *  - rate limiter: 10/s PREP window, 2/s elsewhere, sliding window,
 *    lock-until-end-of-round, disconnect at 5 violations
 *  - validation helpers: round_id required + integer + current, shop
 *    slot / zone indices integer + in range (NaN/float rejected),
 *    action_id dedupe per round
 *  - buy failure reasons (empty slot / gold / bench full / pool empty)
 *  - replay verification: same seed + boards → same hash (ok); tampered
 *    board or seed → mismatch detected
 *  - telemetry aggregation: pick counts, win rates by nation/class/bond,
 *    rejected actions, cheat suspects, replay counts
 */
import { loadBalanceConfig } from "../config";
import { loadGameData } from "../data";
import { PlayerAntiCheat, RateLimiter } from "../rateLimit";
import {
  validateActionId,
  validateRoundId,
  validateSellTarget,
  validateShopSlot,
  validateZoneIndex,
} from "../validate";
import {
  buyShopSlotDetailed,
  newPlayerEconomy,
  newPool,
} from "../economy";
import { buildSideCombatants, PairCombat } from "../sim";
import { hashSimEvents, liveResultOf, verifyRoundReplay, type RoundReplayRecord } from "../replay";
import { aggregateMatchEvents } from "../telemetryAggregate";
import type { TelemetryEvent } from "../telemetry";

const cfg = loadBalanceConfig();
const data = loadGameData();

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
function eq<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

// ------------------------------------------------------------------ rate limit

console.log("== rate limit ==");
{
  const lim = new RateLimiter();
  const now = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 10; i++) if (lim.allow(now + i, 10)) allowed += 1;
  eq("PREP: 10 actions in one second allowed", allowed, 10);
  check("PREP: 11th action in the same second denied", !lim.allow(now + 10, 10), "");
  check("window slides: 1001 ms later allowed again", lim.allow(now + 1001, 10), "");
  const lim2 = new RateLimiter();
  check("COMBAT: 2/s — 1st allowed", lim2.allow(now, 2), "");
  check("COMBAT: 2/s — 2nd allowed", lim2.allow(now, 2), "");
  check("COMBAT: 2/s — 3rd denied", !lim2.allow(now, 2), "");

  const ac = new PlayerAntiCheat();
  check("no lock initially", !ac.isLockedForRound(3), "");
  ac.lockForRound(3);
  check("locked for round 3", ac.isLockedForRound(3), "");
  check("lock does not carry to round 4", !ac.isLockedForRound(4), "");
  let drop = false;
  for (let i = 0; i < 4; i++) drop = ac.recordViolation();
  check("4 violations: no disconnect yet", drop === false, "");
  drop = ac.recordViolation();
  check("5th violation: disconnect", drop === true, "");
  ac.seenActionIds.add("a1");
  ac.beginRound();
  check("beginRound clears seen action ids", ac.seenActionIds.size === 0, "");
}

// ------------------------------------------------------------------ validation

console.log("== validation ==");
{
  check("round_id: missing rejected", validateRoundId(undefined, 2) !== null, "");
  check("round_id: non-integer rejected", validateRoundId(2.5, 2) !== null, "");
  check("round_id: stale rejected", validateRoundId(1, 2) !== null, "");
  check("round_id: current accepted", validateRoundId(2, 2) === null, "");

  check("shop_slot: NaN rejected", validateShopSlot(NaN) !== null, "");
  check("shop_slot: 1.5 rejected", validateShopSlot(1.5) !== null, "");
  check("shop_slot: -1 rejected", validateShopSlot(-1) !== null, "");
  check("shop_slot: 5 rejected", validateShopSlot(5) !== null, "");
  check("shop_slot: 2 accepted", validateShopSlot(2) === null, "");

  const z1 = validateZoneIndex({ zone: "BOARD", index: NaN });
  check("zone index: NaN rejected", "code" in z1, "");
  const z2 = validateZoneIndex({ zone: "BOARD", index: 1.5 });
  check("zone index: float rejected", "code" in z2, "");
  const z3 = validateZoneIndex({ zone: "BOARD", index: 56 });
  check("zone index: 56 out of range", "code" in z3, "");
  const z4 = validateZoneIndex({ zone: "BENCH", index: 9 });
  check("zone index: bench 9 out of range", "code" in z4, "");
  const z5 = validateZoneIndex({ zone: "BOARD", index: 55 });
  check("zone index: board 55 accepted", !("code" in z5) && z5.index === 55, "");
  check("sell: bench -1 rejected", validateSellTarget("BENCH", -1) !== null, "");
  check("sell: wrong zone rejected", validateSellTarget("SHOP", 0) !== null, "");
  check("sell: bench 0 accepted", validateSellTarget("BENCH", 0) === null, "");

  const seen = new Set<string>();
  check("action_id: absent is fine", validateActionId(undefined, seen) === null, "");
  check("action_id: fresh is fine", validateActionId("a-1", seen) === null, "");
  seen.add("a-1");
  check("action_id: duplicate rejected", validateActionId("a-1", seen) !== null, "");
  check("action_id: empty string rejected", validateActionId("", seen) !== null, "");
}

// ------------------------------------------------------------------ buy reasons

console.log("== buy failure reasons ==");
{
  const units = data.units;
  const pool = newPool(units, cfg);
  const eco = newPlayerEconomy("p1", cfg);
  const cheap = units.find((u) => u.cost === 1)!;
  eco.shop = ["", "", "", "", ""];
  eq("buy empty slot → empty_slot", buyShopSlotDetailed(eco, units, pool, 0, cfg).reason, "empty_slot");
  eq("buy slot 99 → bad_slot", buyShopSlotDetailed(eco, units, pool, 99, cfg).reason, "bad_slot");
  eco.shop = [cheap.unit_id, "", "", "", ""];
  eco.gold = 0;
  eq("buy with 0 gold → insufficient_gold", buyShopSlotDetailed(eco, units, pool, 0, cfg).reason, "insufficient_gold");
  eco.gold = 5;
  pool[cheap.unit_id] = 0;
  eq("buy with empty pool → pool_empty", buyShopSlotDetailed(eco, units, pool, 0, cfg).reason, "pool_empty");
  pool[cheap.unit_id] = 22;
  for (let i = 0; i < 9; i++) eco.bench.push({ unit_id: cheap.unit_id, star: 1 });
  eq("buy with full bench → bench_full", buyShopSlotDetailed(eco, units, pool, 0, cfg).reason, "bench_full");
}

// ------------------------------------------------------------------ replay verification

console.log("== replay verification ==");
{
  const boardA = [
    { unit_id: "vn_thanh_giong", star: 1, idx: 17 },
    { unit_id: "cn_quan_vu", star: 1, idx: 18 },
    { unit_id: "jp_honda", star: 1, idx: 19 },
  ];
  const boardB = [
    { unit_id: "vn_tran_hung_dao", star: 1, idx: 17 },
    { unit_id: "cn_lu_bu", star: 1, idx: 18 },
    { unit_id: "jp_musashi", star: 1, idx: 19 },
  ];
  const seed = 987654;
  // "Live" run, exactly like the room: step until finished or 900 ticks,
  // then force-decide by HP fraction.
  const runLive = () => {
    const a = buildSideCombatants(boardA, 0, "p1", data.units, cfg, 0, data.bonds);
    const b = buildSideCombatants(boardB, 1, "p2", data.units, cfg, a.nextIid, data.bonds);
    const combat = new PairCombat(a.combatants, b.combatants, seed, cfg);
    for (let i = 0; i < 900 && !combat.finished; i++) combat.step();
    if (!combat.finished) combat.forceDecideByHpFraction();
    return { combat, iidStartB: a.nextIid };
  };
  const { combat, iidStartB } = runLive();
  const live = liveResultOf(combat);
  check("live combat produced events", live.eventCount > 0, `events=${live.eventCount}`);
  eq("hash deterministic: same events → same hash", hashSimEvents(combat.result().events), live.hash);

  const record: RoundReplayRecord = {
    matchId: "test-match",
    roundId: 2,
    pairKey: "pvp:p1|p2",
    kind: "PVP",
    seed,
    stage: 1,
    ris: 2,
    sideA: { ownerId: "p1", slots: boardA, iidStart: 0 },
    sideB: { ownerId: "p2", slots: boardB, iidStart: iidStartB },
    live,
    recordedAt: Date.now(),
  };
  const v = verifyRoundReplay(record, data, cfg);
  check("replay verifies (ok)", v.ok, v.mismatch ?? "");
  eq("replay winner matches live", v.replayWinner, live.winner);
  eq("replay ticks match live", v.replayTicks, live.ticks);

  // Tampered board (star-up a unit) → mismatch detected.
  const tamperedBoard: RoundReplayRecord = {
    ...record,
    sideA: { ownerId: "p1", slots: boardA.map((s, i) => (i === 0 ? { ...s, star: 3 } : s)), iidStart: 0 },
  };
  const v2 = verifyRoundReplay(tamperedBoard, data, cfg);
  check("tampered board → mismatch detected", !v2.ok, v2.mismatch ?? "");

  // Tampered seed → mismatch detected.
  const v3 = verifyRoundReplay({ ...record, seed: seed + 1 }, data, cfg);
  check("tampered seed → mismatch detected", !v3.ok, v3.mismatch ?? "");

  // Tampered winner (live hash kept, winner changed) → mismatch detected.
  const v4 = verifyRoundReplay({ ...record, live: { ...live, winner: live.winner === 0 ? 1 : 0 } }, data, cfg);
  check("tampered winner → mismatch detected", !v4.ok, v4.mismatch ?? "");
}

// ------------------------------------------------------------------ telemetry aggregation

console.log("== telemetry aggregation ==");
{
  const mk = (name: TelemetryEvent["name"], playerId: string, payload: Record<string, unknown>): TelemetryEvent =>
    ({ name, playerId, matchId: "m1", roundId: 1, payload });
  const events: TelemetryEvent[] = [
    mk("buy", "p1", { unit_id: "vn_thanh_giong", nation_id: "VN", class_id: "GUARDIAN", cost: 2 }),
    mk("buy", "p1", { unit_id: "vn_thanh_giong", nation_id: "VN", class_id: "GUARDIAN", cost: 2 }),
    mk("buy", "p2", { unit_id: "cn_quan_vu", nation_id: "CN", class_id: "GUARDIAN", cost: 3 }),
    mk("sell", "p1", { unit_id: "vn_thanh_giong", star: 1, price: 2 }),
    mk("reroll", "p1", {}),
    mk("buy_xp", "p2", {}),
    mk("round_result", "p1", { result: "win", nations: ["VN"], classes: ["GUARDIAN"], bonds: ["bond_co_sac"] }),
    mk("round_result", "p2", { result: "loss", nations: ["CN"], classes: ["GUARDIAN"], bonds: [] }),
    mk("round_result", "room", { eliminated: [] }),
    mk("bond_trigger", "room", { bond_id: "bond_co_sac", count: 3 }),
    mk("action_rejected", "p2", { action: "buy", code: "BUY_FAILED", reason: "not enough gold" }),
    mk("rate_limited", "p2", { limit_per_sec: 10, violations: 1 }),
    mk("cheat_suspect", "p2", { reason: "buy_failed:insufficient_gold", action: "buy" }),
    mk("replay_verified", "room", { pair: "pvp:p1|p2" }),
    mk("replay_mismatch", "room", { pair: "pvp:p1|p2", reason: "hash" }),
    mk("match_summary", "room", { standings: [{ player_id: "p1", placement: 1 }, { player_id: "p2", placement: 2 }] }),
  ];
  const r = aggregateMatchEvents("m1", events);
  eq("buys counted", r.buys, 3);
  eq("pick count vn_thanh_giong = 2", r.pickCounts["vn_thanh_giong"], 2);
  eq("picks by nation VN = 2", r.picksByNation["VN"], 2);
  eq("picks by class GUARDIAN = 3", r.picksByClass["GUARDIAN"], 3);
  eq("sells counted", r.sells, 1);
  eq("rerolls counted", r.rerolls, 1);
  eq("xp buys counted", r.xpBuys, 1);
  eq("VN round win rate 1/1", r.winRateByNation["VN"]?.rate, 1);
  eq("CN round win rate 0/1", r.winRateByNation["CN"]?.rate, 0);
  eq("bond_co_sac win rate 1/1", r.winRateByBond["bond_co_sac"]?.rate, 1);
  eq("bond triggers counted", r.bondTriggers["bond_co_sac"], 3);
  eq("rejected actions by code", r.rejectedActions["BUY_FAILED"], 1);
  eq("rate-limited counted", r.rateLimited, 1);
  eq("cheat suspects by reason", r.cheatSuspects["buy_failed:insufficient_gold"], 1);
  eq("replay verified counted", r.replayVerified, 1);
  eq("replay mismatches counted", r.replayMismatches, 1);
  eq("room-level round_result ignored for player rounds", r.playerRounds["room"], undefined);
  eq("p1 round wins = 1", r.playerRounds["p1"]?.wins, 1);
  check("standings from match_summary", r.standings !== null && r.standings[0].placement === 1, "");
  const other = aggregateMatchEvents("m2", events);
  eq("other match id → empty report", other.totalEvents, 0);
}

// ------------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
