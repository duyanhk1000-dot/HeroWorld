/**
 * M2 smoke tests (no test runner configured — run with:
 *   npx ts-node --transpile-only src/__tests__/smoke.ts
 * Exits 0 when every check passes, 1 otherwise.
 *
 * Covers the task's mandatory checks:
 *  - sim determinism (same seed + same boards → identical event JSON)
 *  - damage formula: 100 raw vs 40 armor = 71
 *  - star scaling: 800 HP at 3★ = 2592
 *  - loser damage: stage 4 + 3 survivors = 9; PvE halved = 4
 *  - prep economy: buy / sell / reroll / XP gold math + income
 *  - queue: 8 players form a room; 1 player bot-fills after 61 s (casual);
 *    guest + ranked is rejected
 */
import { loadBalanceConfig } from "../config";
import { loadGameData } from "../data";
import { applyMitigation, loserDamage } from "../combat";
import { SeededRng } from "../rng";
import { MatchQueue } from "../matchmaking";
import {
  buyShopSlot,
  buyXp,
  computeIncome,
  newPlayerEconomy,
  newPool,
  rollShop,
  sellUnit,
} from "../economy";
import { buildSideCombatants, makeCombatant, runCombat } from "../sim";
import { emptyMods } from "../synergy";
import { activeBonds, applyStaticMods, rivalryPair } from "../bonds";

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

// ------------------------------------------------------------------ sim

console.log("== sim ==");
{
  // Two 2v2 boards, same seed twice → identical event sequences.
  const units = data.units.filter((u) => u.cost === 1).slice(0, 2);
  const mk = (owner: string, side: 0 | 1, iidStart: number) =>
    buildSideCombatants(
      units.map((u, i) => ({ unit_id: u.unit_id, star: 1, idx: side === 0 ? i * 7 : i * 7 })),
      side, owner, data.units, cfg, iidStart,
    );
  const run = () => {
    const a = mk("p1", 0, 0);
    const b = mk("p2", 1, a.nextIid);
    return runCombat(a.combatants, b.combatants, 12345, cfg);
  };
  const r1 = run();
  const r2 = run();
  eq("sim deterministic: same seed → same events JSON", JSON.stringify(r1.events), JSON.stringify(r2.events));
  eq("sim deterministic: same winner", r1.winner, r2.winner);
  check("sim finishes with a winner (not a draw)", r1.winner !== -1, `winner=${r1.winner} ticks=${r1.ticks}`);
  check("sim emits events", r1.events.length > 0, `events=${r1.events.length}`);
}

eq("damage: 100 raw vs 40 armor = 71", applyMitigation(100, 40, "physical"), 71);
eq("damage: 100 raw vs 40 MR (magic) = 71", applyMitigation(100, 40, "magic"), 71);
eq("damage: true damage ignores armor", applyMitigation(100, 40, "true"), 100);

{
  // Star scaling: 800 HP at 3★ = 800 × 1.8^2 = 2592 (SRS §5.2).
  const u = data.units[0];
  const c = makeCombatant(
    { unit_id: u.unit_id, name: u.name, nation_id: u.nation_id, class_id: u.class_id, star: 3, stats: { ...u.stats_1star, hp: 800 }, skill: u.skill, is_pve: false },
    0, 0, emptyMods(), 0, 0, cfg, 1, "test:u:0",
  );
  eq("star-3 HP: 800 → 2592", c.hp_max, 2592);
  check(
    "star-3 ATK scales ×1.8^2",
    Math.abs(c.atk - u.stats_1star.atk * 1.8 * 1.8) < 1e-9,
    `atk=${c.atk}`,
  );
}

eq("loser damage: stage 4 + 3 survivors = 9", loserDamage(4, 3, cfg, false), 9);
eq("loser damage: PvE halved = 4", loserDamage(4, 3, cfg, true), 4);
eq("loser damage: stage 1 + 0 survivors = 0", loserDamage(1, 0, cfg, false), 0);

// ------------------------------------------------------------------ economy

console.log("== economy ==");
{
  const units = data.units;
  const pool = newPool(units, cfg);
  const eco = newPlayerEconomy("p1", cfg);
  const rng = new SeededRng(42);
  eq("new player: 5 gold, level 1, 100 HP", `${eco.gold}/${eco.level}/${eco.hp}`, "5/1/100");
  check("free shop roll fills 5 slots", rollShop(eco, units, pool, rng, cfg, true) && eco.shop.length === 5, `shop=${eco.shop.length}`);
  eq("free roll costs no gold", eco.gold, 5);

  // Deterministic buy/sell: force a known cost-1 unit into slot 0.
  const cheap = units.find((u) => u.cost === 1)!;
  eco.shop = [cheap.unit_id, ...eco.shop.slice(1)];
  const poolBefore = pool[cheap.unit_id];
  check("buy shop slot 0 (cost 1)", buyShopSlot(eco, units, pool, 0, cfg), "");
  eq("buy: gold 5 → 4", eco.gold, 4);
  eq("buy: bench has the unit", eco.bench.length, 1);
  eq("buy: pool decreased by 1", pool[cheap.unit_id], poolBefore - 1);
  check("buy same (now empty) slot fails", !buyShopSlot(eco, units, pool, 0, cfg), "");
  eq("failed buy changes nothing", eco.gold, 4);

  const res = sellUnit(eco, pool, units, "BENCH", 0);
  check("sell bench unit", res.ok && res.price === 1, `price=${res.price}`);
  eq("sell: gold back to 5", eco.gold, 5);
  eq("sell: pool restored", pool[cheap.unit_id], poolBefore);
  check("sell empty bench slot fails", !sellUnit(eco, pool, units, "BENCH", 0).ok, "");

  check("reroll costs 2 gold", rollShop(eco, units, pool, rng, cfg, false) && eco.gold === 3, `gold=${eco.gold}`);
  check("reroll with 1 gold fails", (() => { eco.gold = 1; return !rollShop(eco, units, pool, rng, cfg, false); })(), "");
  eco.gold = 5;
  check("buy XP: 4 gold → +4 XP", buyXp(eco, cfg) && eco.gold === 1 && eco.xpTotal === 4, `gold=${eco.gold} xp=${eco.xpTotal}`);
  check("buy XP with 1 gold fails", !buyXp(eco, cfg), "");

  // Income: 15 gold held, streak 3 → 5 base + 1 interest + 1 streak = 7.
  const eco2 = newPlayerEconomy("p2", cfg);
  eco2.gold = 15;
  eco2.streak = 3;
  eq("income: 5 + 1 interest + 1 streak = 7", computeIncome(eco2, false, cfg), 7);
  eq("income: +1 PvP win", computeIncome(eco2, true, cfg), 8);
}

// ------------------------------------------------------------------ bonds (M3)

console.log("== bonds ==");
{
  eq("49 units loaded", data.units.length, 49);
  eq("10 bonds loaded", data.bonds?.bonds.length, 10);
  const costs: Record<number, number> = {};
  for (const u of data.units) costs[u.cost] = (costs[u.cost] ?? 0) + 1;
  eq("cost distribution 12/12/12/8/5", JSON.stringify(costs), JSON.stringify({ 1: 12, 2: 12, 3: 12, 4: 8, 5: 5 }));
  const female = data.units.filter((u) => (u as unknown as { gender?: string }).gender === "female").length;
  eq("6 female heroes", female, 6);

  // Bond activation: 3 sam_set members on board → active at threshold 3.
  const sam = activeBonds(["us_tesla", "az_quetzalcoatl", "vn_chu_dong_tu"], data.bonds);
  check("bond_sam_set active at 3 members", sam.some((b) => b.bond_id === "bond_sam_set" && b.threshold === 3), JSON.stringify(sam.map((b) => b.bond_id)));
  const sam2 = activeBonds(["us_tesla", "az_quetzalcoatl"], data.bonds);
  check("bond_sam_set active at 2 members (threshold 2)", sam2.some((b) => b.bond_id === "bond_sam_set" && b.threshold === 2), "");
  check("no bond with 1 member", activeBonds(["us_tesla"], data.bonds).length === 0, "");

  // Static team buff: bond_mat_troi tier 2 gives ALL allies +10% crit.
  {
    const board = [
      { unit_id: "cn_hau_nghe", star: 1, idx: 17 },
      { unit_id: "az_huitzilopochtli", star: 1, idx: 18 },
    ];
    const built = buildSideCombatants(board, 0, "p1", data.units, cfg, 0, data.bonds);
    const crits = built.combatants.map((c) => c.mods.crit);
    check("bond_mat_troi: all allies +10% crit", crits.every((v) => Math.abs(v - 0.1) < 1e-9), `crits=${crits}`);
  }

  // Rivalry: Napoleon vs Arthur across a pair.
  check("rivalry: napoleon vs arthur", rivalryPair(["fr_napoleon"], ["uk_arthur"]), "");
  check("rivalry: reversed", rivalryPair(["uk_arthur"], ["fr_napoleon"]), "");
  check("rivalry: same side is not a duel", !rivalryPair(["fr_napoleon", "uk_arthur"], ["us_tesla"]), "");
  check("rivalry: neither present", !rivalryPair(["us_tesla"], ["uk_arthur"]), "");

  // Bond triggers: one fixed combat per bond; count karma_trigger events.
  const tanks = [
    { unit_id: "uk_arthur", star: 1, idx: 17 },
    { unit_id: "fr_joan", star: 1, idx: 18 },
    { unit_id: "cn_quan_vu", star: 1, idx: 19 },
  ];
  const cases: { bond: string; a: string[]; b: { unit_id: string; star: number; idx: number }[] }[] = [
    { bond: "bond_sam_set", a: ["us_tesla", "az_quetzalcoatl", "vn_chu_dong_tu"], b: tanks },
    { bond: "bond_bien_va_song", a: ["vn_yet_kieu", "vn_an_duong_vuong", "uk_robin"], b: tanks },
    { bond: "bond_co_sac", a: ["fr_joan", "us_lincoln", "vn_hai_ba_trung"], b: [
      { unit_id: "cn_ton_ngo_khong", star: 1, idx: 17 },
      { unit_id: "jp_susanoo", star: 1, idx: 18 },
      { unit_id: "vn_son_tinh", star: 1, idx: 19 },
    ] },
    { bond: "bond_tri_thuc", a: ["cn_khong_minh", "fr_nostradamus", "uk_merlin"], b: tanks },
  ];
  const fired: Record<string, number> = {};
  for (const c of cases) {
    const a = buildSideCombatants(c.a.map((uid, i) => ({ unit_id: uid, star: 1, idx: 17 + i })), 0, "p1", data.units, cfg, 0, data.bonds);
    const b = buildSideCombatants(c.b, 1, "p2", data.units, cfg, a.nextIid, data.bonds);
    const res = runCombat(a.combatants, b.combatants, 999, cfg);
    for (const e of res.events) {
      if (e.k === "karma_trigger" && e.bond) fired[e.bond] = (fired[e.bond] ?? 0) + 1;
    }
  }
  const triggers = new Set<string>();
  for (const b of data.bonds?.bonds ?? []) {
    if (fired[b.bond_id]) for (const th of b.thresholds) triggers.add(th.trigger);
  }
  console.log(`  bond triggers fired: ${JSON.stringify(fired)} triggers=${[...triggers].join(",")}`);
  check(">= 3 bonds fired", Object.keys(fired).length >= 3, `fired=${Object.keys(fired).length}`);
  check(">= 3 distinct triggers", triggers.size >= 3, `triggers=${triggers.size}`);

  // Determinism with bonds: same seed + same bond lineups → same events.
  const runBonded = () => {
    const a = buildSideCombatants(
      ["us_tesla", "az_quetzalcoatl", "vn_chu_dong_tu"].map((uid, i) => ({ unit_id: uid, star: 1, idx: 17 + i })),
      0, "p1", data.units, cfg, 0, data.bonds,
    );
    const b = buildSideCombatants(tanks, 1, "p2", data.units, cfg, a.nextIid, data.bonds);
    return runCombat(a.combatants, b.combatants, 4242, cfg);
  };
  const rb1 = runBonded();
  const rb2 = runBonded();
  eq("bonded sim deterministic: same events JSON", JSON.stringify(rb1.events), JSON.stringify(rb2.events));
  check("bonded sim emits karma_trigger", rb1.events.some((e) => e.k === "karma_trigger"), "");
}

// ------------------------------------------------------------------ queue

console.log("== queue ==");
{
  const now = Date.now();
  const q = new MatchQueue();
  for (let i = 0; i < 8; i++) {
    q.enqueue({ playerId: `p${i}`, mmr: 1000, matchesPlayed: 0, mode: "CASUAL", platform: "WEB", enqueuedAt: now, isGuest: false });
  }
  const group = q.tryFormMatch(now);
  check("8 players form a group", group !== null && group.players.length === 8, `players=${group?.players.length}`);
  eq("8 players: no bot fill", group?.botCount, 0);

  const q2 = new MatchQueue();
  q2.enqueue({ playerId: "solo", mmr: 1000, matchesPlayed: 0, mode: "CASUAL", platform: "WEB", enqueuedAt: now, isGuest: false });
  check("1 player: not ready immediately", q2.tryFormMatch(now + 30_000) === null, "");
  const filled = q2.tryFormMatch(now + 61_000);
  check("1 player: bot-fill after 61 s (casual)", filled !== null && filled.players.length === 1 && filled.botCount === 7, `bots=${filled?.botCount}`);

  const q3 = new MatchQueue();
  let threw = false;
  try {
    q3.enqueue({ playerId: "g1", mmr: 1000, matchesPlayed: 0, mode: "RANKED", platform: "WEB", enqueuedAt: now, isGuest: true });
  } catch {
    threw = true;
  }
  check("guest cannot join ranked", threw, "");
}

// ------------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
