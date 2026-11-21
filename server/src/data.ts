/**
 * Unit + PvE data — loaded from data/units.json and data/pve.json, the same
 * files the Godot M1 client reads (SRS Appendix B). The server loads them at
 * startup so server and client can never drift apart silently; if the files
 * are missing the server refuses to create rooms (fail loud, do not guess
 * hero stats).
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { BalanceConfig } from "./config";
import type { BondsData } from "./bonds";

export interface UnitStats {
  hp: number;
  atk: number;
  ap: number;
  armor: number;
  mr: number;
  attack_speed: number;
  attack_range: number;
  start_mana: number;
  max_mana: number;
}

export interface UnitSkill {
  skill_id: string;
  name: string;
  /** "damage" | "aoe" | "shield" (M1 scope; no cc/heal skills in M1). */
  type: string;
  damage_type: "physical" | "magic" | "true";
  target_policy: string;
  base_damage: number[];
}

export interface UnitDef {
  unit_id: string;
  name: string;
  nation_id: string;
  class_id: string;
  cost: number;
  stats_1star: UnitStats;
  skill: UnitSkill;
}

export interface PveMonster {
  name: string;
  hp: number;
  atk: number;
  armor: number;
  mr: number;
  attack_speed: number;
  attack_range: number;
  count: number;
}

export interface PveData {
  config_version: string;
  pve_rounds: Record<string, { name: string; units: PveMonster[] }>;
  stage_scaling: { hp_per_stage: number; atk_per_stage: number };
}

export interface GameData {
  units: UnitDef[];
  pve: PveData;
  /** Karma Bonds (M3, SRS §7). Null only if the file is missing — the
   * server still starts, but no bond ever activates. */
  bonds: BondsData | null;
  loadedFrom: string;
}

function candidates(file: string): string[] {
  return [
    join(__dirname, "..", "..", "data", file),
    join(process.cwd(), "data", file),
    join(process.cwd(), "..", "data", file),
  ];
}

function readJson<T>(file: string): T | null {
  for (const path of candidates(file)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

export function loadGameData(): GameData {
  const unitsDoc = readJson<{ units: UnitDef[] }>("units.json");
  const pve = readJson<PveData>("pve.json");
  const bonds = readJson<BondsData>("karma_bonds.json");
  if (!unitsDoc || !Array.isArray(unitsDoc.units) || unitsDoc.units.length === 0) {
    throw new Error("[data] data/units.json not found or empty — cannot start rooms without hero data");
  }
  if (!pve) {
    throw new Error("[data] data/pve.json not found — cannot start rooms without PvE data");
  }
  if (!bonds) {
    console.warn("[data] data/karma_bonds.json not found — bonds disabled (M3 data missing)");
  }
  console.log(`[data] loaded ${unitsDoc.units.length} units, ${Object.keys(pve.pve_rounds).length} PvE rounds, ${bonds?.bonds.length ?? 0} bonds`);
  return { units: unitsDoc.units, pve, bonds: bonds ?? null, loadedFrom: "data/" };
}

export function unitById(units: UnitDef[], unitId: string): UnitDef | undefined {
  return units.find((u) => u.unit_id === unitId);
}

export function unitsByCost(units: UnitDef[], cost: number): UnitDef[] {
  return units.filter((u) => u.cost === cost);
}

/** Star scaling, SRS §5.2: HP and ATK × 1.8^(star-1). */
export function starMultiplier(cfg: BalanceConfig, star: number): number {
  return Math.pow(cfg.star_multiplier, star - 1);
}

/** XP table → level (SRS §4.3). */
export function levelForXp(cfg: BalanceConfig, xpTotal: number): number {
  const table = cfg.xp_table_cumulative;
  let level = 1;
  for (let i = 0; i < table.length; i++) {
    if (xpTotal >= table[i]) level = i + 1;
  }
  return Math.min(level, cfg.level_cap);
}

/** Shop odds for a level (SRS §4.2). */
export function shopOdds(cfg: BalanceConfig, level: number): number[] {
  const key = String(Math.min(Math.max(level, 1), 9));
  return cfg.shop_odds_by_level[key] ?? [100, 0, 0, 0, 0];
}

/** Pool size for a cost tier (SRS §4.2). */
export function poolByCost(cfg: BalanceConfig, cost: number): number {
  return cfg.pool_by_cost[String(cost)] ?? 0;
}

/** Sell price (SRS §4.1): 1★ = cost; 2★ = 3×cost−1; 3★ = 9×cost−2. */
export function sellPrice(cost: number, star: number): number {
  if (star <= 1) return cost;
  if (star === 2) return 3 * cost - 1;
  return 9 * cost - 2;
}
