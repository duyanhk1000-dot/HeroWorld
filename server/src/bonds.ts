/**
 * Karma Bonds engine — direct port of scripts/m1_bonds.gd (SRS §7).
 * Data-driven: data/karma_bonds.json. A bond activates when enough distinct
 * members stand ON BOARD (bench does not count, same as synergy).
 *
 * Merging rule (M3 interpretation of SRS §7.3, see docs/m1-notes.md): for
 * each (trigger, scope) group, the effects of all met thresholds merge
 * per key, the higher threshold winning per key. So bond_co_sac shield goes
 * 10% -> 20% at tier 3 (not 30%), while bond_sam_set keeps chain lightning
 * and gains +20% AP at tier 3.
 *
 * Static effect keys (folded into unit mods at combatant creation): see
 * STATIC_KEYS below. Runtime effect keys are read by the sim from the
 * side's active-bond groups at trigger time. rival_win_damage is
 * match-level (BattleRoom), not sim-level.
 */

export interface BondThreshold {
  count: number;
  trigger: string;
  scope: string;
  effect: Record<string, number | boolean>;
}

export interface BondDef {
  bond_id: string;
  bond_type: string;
  name: string;
  members: string[];
  thresholds: BondThreshold[];
}

export interface BondGroup {
  trigger: string;
  scope: string;
  effect: Record<string, number | boolean>;
}

export interface ActiveBond {
  bond_id: string;
  name: string;
  bond_type: string;
  count: number;
  threshold: number;
  membersOnBoard: string[];
  groups: BondGroup[];
}

export interface BondsData {
  bonds: BondDef[];
}

export const STATIC_KEYS: string[] = [
  "atk_pct", "hp_pct", "aspd_pct", "ap_pct", "all_pct", "armor", "mr",
  "dodge_pct", "low_hp_aspd_pct", "low_hp_damage_taken_pct",
  "cc_immune_first", "kill_atk_pct", "kill_atk_max_stacks",
  "crit_burn_pct", "crit_burn_duration_sec",
  "chain_targets", "chain_damage_ratio", "mr_shred_percent", "mr_shred_duration_sec",
  "dodge_next_crit",
  "team_atk_pct", "team_ap_pct", "team_crit",
];

/**
 * Active bonds for a board (distinct unit_ids only; duplicates do not
 * count twice). Mirrors M1Bonds.active_bonds.
 */
export function activeBonds(boardUnitIds: string[], bondsData: BondsData | null): ActiveBond[] {
  if (!bondsData) return [];
  const onBoard = new Set(boardUnitIds);
  const out: ActiveBond[] = [];
  for (const b of bondsData.bonds) {
    const present = b.members.filter((m) => onBoard.has(m));
    const count = present.length;
    const met = b.thresholds.filter((th) => count >= th.count);
    if (met.length === 0) continue;
    const highest = Math.max(...met.map((th) => th.count));
    // Merge met thresholds per (trigger, scope) group, per key, higher
    // threshold winning. Thresholds are listed ascending in the data.
    const groupMap = new Map<string, BondGroup>();
    for (const th of met) {
      const key = `${th.trigger}|${th.scope}`;
      let g = groupMap.get(key);
      if (!g) {
        g = { trigger: th.trigger, scope: th.scope, effect: {} };
        groupMap.set(key, g);
      }
      for (const k of Object.keys(th.effect)) g.effect[k] = th.effect[k];
    }
    out.push({
      bond_id: b.bond_id, name: b.name, bond_type: b.bond_type, count,
      threshold: highest, membersOnBoard: present, groups: [...groupMap.values()],
    });
  }
  return out;
}

export interface BoardUnitRef {
  unit_id: string;
  nation_id: string;
  class_id: string;
}

import type { UnitMods } from "./synergy";

/**
 * Fold static bond effects into unitMods (aligned with boardUnits).
 * Mirrors M1Bonds.apply_static_mods.
 */
export function applyStaticMods(boardUnits: BoardUnitRef[], active: ActiveBond[], unitMods: UnitMods[]): void {
  for (const bond of active) {
    for (const g of bond.groups) {
      const eff = g.effect;
      for (let i = 0; i < boardUnits.length; i++) {
        if (i >= unitMods.length) break;
        const u = boardUnits[i];
        let applies = false;
        if (g.scope === "ALL_ALLIES") applies = true;
        else if (g.scope === "BOND_MEMBERS" || g.scope === "SELF") applies = bond.membersOnBoard.includes(u.unit_id);
        if (!applies) continue;
        const m = unitMods[i];
        for (const k of STATIC_KEYS) {
          if (!(k in eff)) continue;
          const v = eff[k] as number;
          switch (k) {
            case "team_atk_pct":
              m.atk_pct += v as number;
              break;
            case "team_ap_pct":
              m.ap_pct += v as number;
              break;
            case "team_crit":
              m.crit += v as number;
              break;
            case "armor":
            case "mr":
            case "chain_targets":
            case "kill_atk_max_stacks":
              (m as unknown as Record<string, number>)[k] += v as number;
              break;
            case "cc_immune_first":
            case "dodge_next_crit":
              (m as unknown as Record<string, boolean>)[k] = Boolean(v);
              break;
            default:
              (m as unknown as Record<string, number>)[k] += v as number;
              break;
          }
        }
      }
    }
  }
}

/** First merged group of an active bond with this trigger ("" = any). */
export function groupForTrigger(bond: ActiveBond, trigger: string): BondGroup | null {
  for (const g of bond.groups) {
    if (trigger === "" || g.trigger === trigger) return g;
  }
  return null;
}

/** Active bond whose merged effect contains this key (first match). */
export function bondWithEffectKey(active: ActiveBond[], key: string): ActiveBond | null {
  for (const bond of active) {
    for (const g of bond.groups) {
      if (key in g.effect) return bond;
    }
  }
  return null;
}

/** Human-readable one-liners for the GUI synergy panel. */
export function describeActive(active: ActiveBond[]): string[] {
  return active.map((b) => `${b.name} (${b.count}/${b.threshold}): ${b.bond_type}`);
}

/**
 * bond_hoang_de (RIVALRY, SRS §7.4): Napoleon and Arthur face each other
 * across a PvP pair — the duel winner deals +2 player damage. Pure
 * function so the match layers (BattleRoom / M1Match) and tests share it.
 */
export function rivalryPair(boardAUnitIds: string[], boardBUnitIds: string[]): boolean {
  const a = new Set(boardAUnitIds);
  const b = new Set(boardBUnitIds);
  return (a.has("fr_napoleon") && b.has("uk_arthur")) || (a.has("uk_arthur") && b.has("fr_napoleon"));
}

/** Bonds one member short of their lowest threshold (for the GUI panel). */
export function oneAway(
  boardUnitIds: string[],
  bondsData: BondsData | null,
): { bond_id: string; name: string; count: number; need: number; missing: string }[] {
  if (!bondsData) return [];
  const onBoard = new Set(boardUnitIds);
  const out: { bond_id: string; name: string; count: number; need: number; missing: string }[] = [];
  for (const b of bondsData.bonds) {
    let present = 0;
    let missing = "";
    for (const m of b.members) {
      if (onBoard.has(m)) present += 1;
      else missing = m;
    }
    if (b.thresholds.length === 0) continue;
    const lowest = b.thresholds[0].count;
    if (present === lowest - 1 && present > 0) {
      out.push({ bond_id: b.bond_id, name: b.name, count: present, need: lowest, missing });
    }
  }
  return out;
}
