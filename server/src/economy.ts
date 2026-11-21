/**
 * Economy / shop / pool / level — direct port of scripts/m1_economy.gd
 * (SRS §4) plus the move semantics of scripts/m1_gui.gd (bench↔board swap,
 * board↔board swap, board→bench). All numbers come from
 * balance_config.json via data.ts helpers; nothing is hard-coded here.
 * One shared pool per room (match), exactly like M1.
 */
import type { BalanceConfig } from "./config";
import type { SeededRng } from "./rng";
import { levelForXp, poolByCost, sellPrice, shopOdds, unitById, unitsByCost, type UnitDef } from "./data";

export interface BoardUnit {
  unit_id: string;
  star: number;
}

export type Zone = "BENCH" | "BOARD";

export interface PlayerEconomy {
  playerId: string;
  hp: number;
  gold: number;
  level: number;
  xpTotal: number;
  board: (BoardUnit | null)[]; // 56 cells, index = row*7+col
  bench: BoardUnit[]; // max 9
  shop: string[]; // 5 unit_ids, "" = empty slot
  shopLocked: boolean;
  streak: number;
  streakResult: "" | "W" | "L";
  wins: number;
  losses: number;
  alive: boolean;
  lastOpponent: string | null;
}

export type SharedPool = Record<string, number>;

export function newPool(units: UnitDef[], cfg: BalanceConfig): SharedPool {
  const pool: SharedPool = {};
  for (const u of units) pool[u.unit_id] = poolByCost(cfg, u.cost);
  return pool;
}

export function newPlayerEconomy(playerId: string, cfg: BalanceConfig): PlayerEconomy {
  return {
    playerId,
    hp: cfg.start_hp,
    gold: cfg.start_gold,
    level: cfg.start_level,
    xpTotal: 0,
    board: Array<BoardUnit | null>(56).fill(null),
    bench: [],
    shop: ["", "", "", "", ""],
    shopLocked: false,
    streak: 0,
    streakResult: "",
    wins: 0,
    losses: 0,
    alive: true,
    lastOpponent: null,
  };
}

export function boardUnits(p: PlayerEconomy): BoardUnit[] {
  return p.board.filter((u): u is BoardUnit => u !== null);
}

export function boardCount(p: PlayerEconomy): number {
  return boardUnits(p).length;
}

function rollOneTier(rng: SeededRng, odds: number[]): number {
  const roll = rng.nextInt(1, 100);
  let acc = 0;
  for (let i = 0; i < odds.length; i++) {
    acc += odds[i];
    if (roll <= acc) return i + 1;
  }
  return 1;
}

/** Pick a cost tier by level odds, then a random unit of that cost with pool remaining. */
function drawUnitId(units: UnitDef[], pool: SharedPool, rng: SeededRng, odds: number[]): string {
  const tier = rollOneTier(rng, odds);
  for (let attempt = 0; attempt < 5; attempt++) {
    const t = attempt === 0 ? tier : (attempt % 5) + 1;
    const cands = unitsByCost(units, t)
      .map((u) => u.unit_id)
      .filter((uid) => (pool[uid] ?? 0) > 0);
    if (cands.length > 0) return cands[rng.nextInt(0, cands.length - 1)];
  }
  return "";
}

export function rollShop(
  p: PlayerEconomy,
  units: UnitDef[],
  pool: SharedPool,
  rng: SeededRng,
  cfg: BalanceConfig,
  free: boolean,
): boolean {
  if (!free) {
    const cost = cfg.reroll_cost;
    if (p.gold < cost) return false;
    p.gold -= cost;
  }
  const odds = shopOdds(cfg, p.level);
  const shop: string[] = [];
  for (let i = 0; i < 5; i++) shop.push(drawUnitId(units, pool, rng, odds));
  p.shop = shop;
  return true;
}

export function buyShopSlot(
  p: PlayerEconomy,
  units: UnitDef[],
  pool: SharedPool,
  slot: number,
  cfg: BalanceConfig,
): boolean {
  if (slot < 0 || slot >= p.shop.length) return false;
  const uid = p.shop[slot];
  if (uid === "") return false;
  const def = unitById(units, uid);
  if (!def) return false;
  if (p.gold < def.cost) return false;
  if ((pool[uid] ?? 0) <= 0) return false;
  if (p.bench.length >= 9) return false;
  p.gold -= def.cost;
  pool[uid] = (pool[uid] ?? 0) - 1;
  p.shop[slot] = "";
  p.bench.push({ unit_id: uid, star: 1 });
  tryStarUp(p);
  return true;
}

export function buyXp(p: PlayerEconomy, cfg: BalanceConfig): boolean {
  if (p.gold < cfg.xp_buy_cost) return false;
  if (p.level >= cfg.level_cap) return false;
  p.gold -= cfg.xp_buy_cost;
  p.xpTotal += cfg.xp_buy_amount;
  p.level = levelForXp(cfg, p.xpTotal);
  return true;
}

export function gainRoundXp(p: PlayerEconomy, cfg: BalanceConfig): void {
  p.xpTotal += 2;
  p.level = levelForXp(cfg, p.xpTotal);
}

export function sellUnit(
  p: PlayerEconomy,
  pool: SharedPool,
  units: UnitDef[],
  zone: Zone,
  index: number,
): { ok: boolean; price: number } {
  let unit: BoardUnit | undefined;
  if (zone === "BENCH") {
    if (index < 0 || index >= p.bench.length) return { ok: false, price: 0 };
    unit = p.bench[index];
    p.bench.splice(index, 1);
  } else {
    if (index < 0 || index >= p.board.length || p.board[index] === null) return { ok: false, price: 0 };
    unit = p.board[index] as BoardUnit;
    p.board[index] = null;
  }
  if (!unit) return { ok: false, price: 0 };
  const def = unitById(units, unit.unit_id);
  const price = sellPrice(def?.cost ?? 1, unit.star);
  p.gold += price;
  pool[unit.unit_id] = (pool[unit.unit_id] ?? 0) + 1;
  return { ok: true, price };
}

/** 3 copies of the same unit_id at the same star → one unit of star+1. */
export function tryStarUp(p: PlayerEconomy): void {
  type Entry = { unit: BoardUnit; zone: Zone; index: number };
  const all: Entry[] = [];
  p.bench.forEach((u) => all.push({ unit: u, zone: "BENCH", index: -1 }));
  p.board.forEach((u, i) => {
    if (u !== null) all.push({ unit: u, zone: "BOARD", index: i });
  });
  const groups = new Map<string, Entry[]>();
  for (const e of all) {
    const key = `${e.unit.unit_id}_${e.unit.star}`;
    const g = groups.get(key) ?? [];
    g.push(e);
    groups.set(key, g);
  }
  for (const entries of groups.values()) {
    const star = entries[0].unit.star;
    if (entries.length >= 3 && star < 3) {
      const uid = entries[0].unit.unit_id;
      let wasOnBoard = -1;
      let removed = 0;
      for (let i = p.bench.length - 1; i >= 0; i--) {
        if (removed < 3 && p.bench[i].unit_id === uid && p.bench[i].star === star) {
          p.bench.splice(i, 1);
          removed += 1;
        }
      }
      for (let i = 0; i < p.board.length; i++) {
        if (removed < 3 && p.board[i] !== null && p.board[i]?.unit_id === uid && p.board[i]?.star === star) {
          if (wasOnBoard < 0) wasOnBoard = i;
          p.board[i] = null;
          removed += 1;
        }
      }
      const upgraded: BoardUnit = { unit_id: uid, star: star + 1 };
      if (wasOnBoard >= 0) p.board[wasOnBoard] = upgraded;
      else p.bench.push(upgraded);
      tryStarUp(p);
      return;
    }
  }
}

/** Bench → empty board cell. Board count is capped by level (M1 rule). */
export function placeOnBoard(p: PlayerEconomy, benchIndex: number, boardIndex: number): boolean {
  if (benchIndex < 0 || benchIndex >= p.bench.length) return false;
  if (boardIndex < 0 || boardIndex >= p.board.length) return false;
  if (p.board[boardIndex] !== null) return false;
  if (boardCount(p) >= p.level) return false;
  p.board[boardIndex] = p.bench[benchIndex];
  p.bench.splice(benchIndex, 1);
  return true;
}

/**
 * General move, mirroring scripts/m1_gui.gd:
 *  - BENCH → BOARD (empty cell): place (level cap applies).
 *  - BENCH → BOARD (occupied cell): swap bench unit with board unit.
 *  - BOARD → BOARD: swap (same cell = no-op, still ok).
 *  - BOARD → BENCH: append to bench (bench must have room).
 *  - BENCH → BENCH: swap bench slots.
 */
export function moveUnit(
  p: PlayerEconomy,
  from: { zone: Zone; index: number },
  to: { zone: Zone; index: number },
): boolean {
  if (from.zone === "BENCH") {
    if (from.index < 0 || from.index >= p.bench.length) return false;
    if (to.zone === "BOARD") {
      if (to.index < 0 || to.index >= p.board.length) return false;
      if (p.board[to.index] === null) return placeOnBoard(p, from.index, to.index);
      const tmp = p.board[to.index];
      p.board[to.index] = p.bench[from.index];
      p.bench[from.index] = tmp as BoardUnit;
      return true;
    }
    // BENCH → BENCH swap.
    if (to.index < 0 || to.index >= p.bench.length) return false;
    const tmp = p.bench[to.index];
    p.bench[to.index] = p.bench[from.index];
    p.bench[from.index] = tmp;
    return true;
  }
  // from BOARD
  if (from.index < 0 || from.index >= p.board.length || p.board[from.index] === null) return false;
  if (to.zone === "BOARD") {
    if (to.index < 0 || to.index >= p.board.length) return false;
    const tmp = p.board[to.index];
    p.board[to.index] = p.board[from.index];
    p.board[from.index] = tmp;
    return true;
  }
  // BOARD → BENCH: append.
  if (p.bench.length >= 9) return false;
  p.bench.push(p.board[from.index] as BoardUnit);
  p.board[from.index] = null;
  return true;
}

export function returnUnitsToPool(p: PlayerEconomy, pool: SharedPool): void {
  for (const u of boardUnits(p)) pool[u.unit_id] = (pool[u.unit_id] ?? 0) + 1;
  for (const u of p.bench) pool[u.unit_id] = (pool[u.unit_id] ?? 0) + 1;
  p.board = Array<BoardUnit | null>(56).fill(null);
  p.bench = [];
}

/** Income at ROUND_RESOLVE (SRS §4.4). Interest is computed on gold held at the end of the round. */
export function computeIncome(p: PlayerEconomy, wonPvp: boolean, cfg: BalanceConfig): number {
  const interest = Math.min(cfg.interest_cap, Math.floor(p.gold / 10) * cfg.interest_per_10_gold);
  let streakBonus = 0;
  if (p.streak >= 2) {
    const key = String(Math.min(p.streak, 5));
    streakBonus = cfg.streak_bonus[key] ?? 0;
  }
  let total = cfg.base_gold_per_round + interest + streakBonus;
  if (wonPvp) total += cfg.pvp_win_gold;
  return total;
}

export function setStreak(p: PlayerEconomy, won: boolean): void {
  const res = won ? "W" : "L";
  if (p.streakResult === res) p.streak += 1;
  else {
    p.streak = 1;
    p.streakResult = res;
  }
}
