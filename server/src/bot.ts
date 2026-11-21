/**
 * Medium bot — direct port of scripts/m1_bot.gd (SRS §11.1).
 * Same rules / pool / shop as the player. Keeps gold toward the 50-gold
 * interest threshold, activates synergy 2, buys by hero value table,
 * positions by class. No items, no bonds (M1 scope).
 */
import type { BalanceConfig } from "./config";
import type { SeededRng } from "./rng";
import { rcToIndex } from "./hex";
import { boardCount, boardUnits, buyShopSlot, buyXp, placeOnBoard, type PlayerEconomy, type SharedPool } from "./economy";
import { unitById, type UnitDef } from "./data";

function ownedCounts(p: PlayerEconomy): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const u of boardUnits(p)) counts[u.unit_id] = (counts[u.unit_id] ?? 0) + 1;
  for (const u of p.bench) counts[u.unit_id] = (counts[u.unit_id] ?? 0) + 1;
  return counts;
}

export function heroValue(p: PlayerEconomy, def: UnitDef, units: UnitDef[]): number {
  let value = def.cost * 10;
  const owned = ownedCounts(p);
  if ((owned[def.unit_id] ?? 0) >= 2) value += 12; // completes a star-up
  else if ((owned[def.unit_id] ?? 0) === 1) value += 6;
  let seenN = false;
  let seenC = false;
  const check = (uid: string): void => {
    const d = unitById(units, uid);
    if (!d) return;
    if (d.nation_id === def.nation_id) seenN = true;
    if (d.class_id === def.class_id) seenC = true;
  };
  for (const u of boardUnits(p)) check(u.unit_id);
  for (const u of p.bench) check(u.unit_id);
  if (seenN) value += 5;
  if (seenC) value += 5;
  return value;
}

function targetRows(cls: string): number[] {
  if (cls === "GUARDIAN" || cls === "WARRIOR") return [3, 2];
  if (cls === "ASSASSIN") return [2, 3];
  return [0, 1];
}

function positionUnits(p: PlayerEconomy, units: UnitDef[]): void {
  let i = 0;
  while (i < p.bench.length) {
    if (boardCount(p) >= p.level) break;
    const u = p.bench[i];
    const def = unitById(units, u.unit_id);
    if (!def) {
      i += 1;
      continue;
    }
    let placed = false;
    for (const row of targetRows(def.class_id)) {
      const cols = [3, 2, 4, 1, 5, 0, 6];
      for (const col of cols) {
        const idx = rcToIndex(row, col);
        if (p.board[idx] === null) {
          if (placeOnBoard(p, i, idx)) {
            placed = true;
            break;
          }
        }
      }
      if (placed) break;
    }
    if (!placed) i += 1;
  }
}

export function takePrepTurn(
  p: PlayerEconomy,
  units: UnitDef[],
  pool: SharedPool,
  rng: SeededRng,
  cfg: BalanceConfig,
): void {
  void rng; // bot decisions are deterministic given the shop; no extra draws.
  const level = p.level;
  // Reserve stays low early so the bot actually fields a team from round 1
  // (the old 10 + 5*level reserve left the board empty for 4 rounds).
  const reserve = Math.min(30, 5 + level * 3);
  // 1) Buy from shop by value.
  let bought = true;
  let guard = 0;
  while (bought && guard < 12) {
    guard += 1;
    bought = false;
    let bestSlot = -1;
    let bestValue = 9; // only consider heroes worth >= 10
    for (let s = 0; s < p.shop.length; s++) {
      const uid = p.shop[s];
      if (uid === "") continue;
      const def = unitById(units, uid);
      if (!def) continue;
      if (p.gold < def.cost) continue;
      const value = heroValue(p, def, units);
      const keepReserve = p.gold - def.cost >= reserve;
      const urgent = boardCount(p) < p.level;
      if (value >= 10 && (keepReserve || urgent || value >= 25) && value > bestValue) {
        bestValue = value;
        bestSlot = s;
      }
    }
    if (bestSlot >= 0) {
      if (buyShopSlot(p, units, pool, bestSlot, cfg)) bought = true;
    }
  }
  // 2) Buy XP when close to levelling, gold allows, and the board is
  // already full for the current level (units first, levels second).
  const table = cfg.xp_table_cumulative;
  if (level < cfg.level_cap && boardCount(p) >= p.level) {
    const need = table[level] - p.xpTotal;
    if (need <= 4 && p.gold > reserve + 4) buyXp(p, cfg);
  }
  // 3) Position bench units by class.
  positionUnits(p, units);
}
