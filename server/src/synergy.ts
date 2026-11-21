/**
 * Synergy engine — direct port of scripts/m1_synergy.gd (SRS §6).
 * Counts only distinct unit_ids ON BOARD, thresholds 2/4/6 for nation and
 * class. Effects are read from balance_config.json ("synergy"), never
 * hard-coded here.
 *
 * Faithful quirks of the M1 port (do NOT "fix" without changing Godot too):
 *  - GUARDIAN 2 (+20 armor/MR for Guardians) applies only when the tier is
 *    exactly 2; at tier 4+ the team-wide +15 armor/MR (GUARDIAN 4) applies
 *    instead, via team_armor/team_mr.
 *  - Only the current tier's entry applies (tiers do not stack).
 */
import type { BalanceConfig } from "./config";

export interface UnitMods {
  hp_pct: number;
  atk_pct: number;
  aspd_pct: number;
  ap_pct: number;
  armor: number;
  mr: number;
  crit: number;
  crit_dmg: number;
  range_bonus: number;
  start_mana: number;
  lifesteal: number;
  all_pct: number;
  shield_pct_hp: number;
  max_hp_damage_pct: number;
  early_dmg_pct: number;
  early_seconds: number;
  extra_target_every: number;
  first_skill_bonus_mana: number;
  mana_regen_pct: number;
  shred_pct: number;
  shred_duration_sec: number;
  death_explosion_true_damage: number;
  // M3 Karma Bonds static keys (see bonds.ts).
  dodge: number;
  dodge_next_crit: boolean;
  low_hp_aspd_pct: number;
  low_hp_damage_taken_pct: number;
  cc_immune_first: boolean;
  kill_atk_pct: number;
  kill_atk_max_stacks: number;
  crit_burn_pct: number;
  crit_burn_duration_sec: number;
  chain_targets: number;
  chain_damage_ratio: number;
  mr_shred_percent: number;
  mr_shred_duration_sec: number;
}

export function emptyMods(): UnitMods {
  return {
    hp_pct: 0, atk_pct: 0, aspd_pct: 0, ap_pct: 0,
    armor: 0, mr: 0, crit: 0, crit_dmg: 0, range_bonus: 0,
    start_mana: 0, lifesteal: 0, all_pct: 0,
    shield_pct_hp: 0, max_hp_damage_pct: 0,
    early_dmg_pct: 0, early_seconds: 0,
    extra_target_every: 0, first_skill_bonus_mana: 0,
    mana_regen_pct: 0, shred_pct: 0, shred_duration_sec: 0,
    death_explosion_true_damage: 0,
    // M3 Karma Bonds static keys (see bonds.ts).
    dodge: 0, dodge_next_crit: false,
    low_hp_aspd_pct: 0, low_hp_damage_taken_pct: 0,
    cc_immune_first: false,
    kill_atk_pct: 0, kill_atk_max_stacks: 0,
    crit_burn_pct: 0, crit_burn_duration_sec: 0,
    chain_targets: 0, chain_damage_ratio: 0,
    mr_shred_percent: 0, mr_shred_duration_sec: 0,
  };
}

export interface BoardUnitRef {
  unit_id: string;
  nation_id: string;
  class_id: string;
}

export interface SynergyResult {
  nationLevels: Record<string, number>;
  classLevels: Record<string, number>;
  /** Aligned with the input boardUnits array, same order. */
  unitMods: UnitMods[];
  teamArmor: number;
  teamMr: number;
}

function tier(count: number, thresholds: number[]): number {
  let t = 0;
  for (const th of thresholds) if (count >= th) t = th;
  return t;
}

export function computeSynergy(boardUnits: BoardUnitRef[], cfg: BalanceConfig): SynergyResult {
  const thresholds = cfg.synergy_thresholds ?? [2, 4, 6];
  const syn = cfg.synergy ?? { nation: {} };
  const nationCounts: Record<string, number> = {};
  const classCounts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const u of boardUnits) {
    if (!u.unit_id || seen.has(u.unit_id)) continue;
    seen.add(u.unit_id);
    nationCounts[u.nation_id] = (nationCounts[u.nation_id] ?? 0) + 1;
    classCounts[u.class_id] = (classCounts[u.class_id] ?? 0) + 1;
  }
  const nationLevels: Record<string, number> = {};
  for (const k of Object.keys(nationCounts)) nationLevels[k] = tier(nationCounts[k], thresholds);
  const classLevels: Record<string, number> = {};
  for (const k of Object.keys(classCounts)) classLevels[k] = tier(classCounts[k], thresholds);

  let teamArmor = 0;
  let teamMr = 0;
  const gCfg = syn["GUARDIAN"] ?? {};
  const gTier = classLevels["GUARDIAN"] ?? 0;
  if (gTier >= 4 && gCfg["4"]) {
    teamArmor += gCfg["4"]["team_armor"] ?? 0;
    teamMr += gCfg["4"]["team_mr"] ?? 0;
  }

  const nationCfg = syn["nation"] ?? {};
  const unitMods: UnitMods[] = [];
  for (const u of boardUnits) {
    const m = emptyMods();
    const nt = nationLevels[u.nation_id] ?? 0;
    if (nt > 0 && nationCfg[String(nt)]) {
      const e = nationCfg[String(nt)];
      m.hp_pct += e["hp_pct"] ?? 0;
      m.atk_pct += e["atk_pct"] ?? 0;
      m.aspd_pct += e["aspd_pct"] ?? 0;
    }
    const ct = classLevels[u.class_id] ?? 0;
    if (ct > 0) {
      const ccfg = syn[u.class_id] ?? {};
      if (ccfg[String(ct)]) {
        const e2 = ccfg[String(ct)];
        m.atk_pct += e2["atk_pct"] ?? 0;
        m.aspd_pct += e2["aspd_pct"] ?? 0;
        m.ap_pct += e2["ap_pct"] ?? 0;
        m.crit += e2["crit_pct"] ?? 0;
        m.crit_dmg += e2["crit_dmg_pct"] ?? 0;
        m.range_bonus += e2["range_bonus"] ?? 0;
        m.start_mana += e2["start_mana"] ?? 0;
        m.lifesteal += e2["lifesteal"] ?? 0;
        m.all_pct += e2["all_pct"] ?? 0;
        m.shield_pct_hp += e2["shield_pct_hp"] ?? 0;
        m.max_hp_damage_pct += e2["max_hp_damage_pct"] ?? 0;
        m.early_dmg_pct += e2["early_dmg_pct"] ?? 0;
        m.early_seconds += e2["early_seconds"] ?? 0;
        m.extra_target_every += e2["extra_target_every"] ?? 0;
        m.first_skill_bonus_mana += e2["first_skill_bonus_mana"] ?? 0;
        m.mana_regen_pct += e2["mana_regen_pct"] ?? 0;
        m.shred_pct += e2["shred_pct"] ?? 0;
        m.shred_duration_sec += e2["shred_duration_sec"] ?? 0;
        m.death_explosion_true_damage += e2["death_explosion_true_damage"] ?? 0;
      }
      // GUARDIAN 2: +armor/MR for Guardians themselves (exact tier 2 only).
      if (u.class_id === "GUARDIAN" && ct === 2 && ccfg["2"]) {
        m.armor += ccfg["2"]["armor"] ?? 0;
        m.mr += ccfg["2"]["mr"] ?? 0;
      }
    }
    unitMods.push(m);
  }
  return { nationLevels, classLevels, unitMods, teamArmor, teamMr };
}
