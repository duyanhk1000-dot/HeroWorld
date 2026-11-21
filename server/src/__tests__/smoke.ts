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
