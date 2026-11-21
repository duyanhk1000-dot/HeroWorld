/**
 * Combat formulas — SRS §5.2/§5.3, values from data/balance_config.json.
 *
 * ⚠️ SINGLE-SIM RULE: this file is an ADAPTER, not a second simulation.
 * The authoritative combat sim lives in the M1 Godot code
 * (scripts/m1_sim.gd + scripts/m1_synergy.gd). The server reuses the exact
 * formulas below; any formula change must land in BOTH places in the same
 * commit, and the deterministic replay check (same round_seed + same
 * lineups → same event list) must pass on both before merging.
 *
 * Shared draw order per tick (server and Godot must agree):
 *   1. movement / target selection (tie-break: smallest hex index)
 *   2. basic attacks, in unit order (lowest index first)
 *   3. crit roll, then dodge roll (basic attacks only)
 *   4. skill casts (units at max mana, in unit order), then skill damage
 *   5. item drops (PvE rounds only, from the same round_seed)
 */
import type { BalanceConfig } from "./config";

export type DamageType = "physical" | "magic" | "true";

/**
 * SRS §5.2. Raw damage → final damage after armor / MR.
 * Negative armor/MR: factor = 2 - 100 / (100 - value). Result floored, min 1.
 */
export function applyMitigation(raw: number, defense: number, type: DamageType): number {
  if (type === "true") return Math.max(1, Math.floor(raw));
  let factor: number;
  if (defense >= 0) factor = 100 / (100 + defense);
  else factor = 2 - 100 / (100 - defense);
  return Math.max(1, Math.floor(raw * factor));
}

/** Star scaling, SRS §5.2: HP and ATK × 1.8^(star-1). Armor/MR/AS/range/mana do not scale. */
export function starScale(base: number, star: number, multiplier: number): number {
  return Math.floor(base * Math.pow(multiplier, star - 1));
}

/** Crit roll: base 25% ×1.40 (SRS §5.2), before synergy/item bonuses. */
export function critMultiplier(isCrit: boolean, critDamage: number): number {
  return isCrit ? critDamage : 1;
}

/**
 * Loser damage, SRS §9.3: base_damage(stage) + surviving enemy units × 1.
 * PvE loss is halved (floor). Draw after overtime: both sides take damage
 * from the other's survivors.
 */
export function loserDamage(
  stage: number,
  enemySurvivors: number,
  cfg: BalanceConfig,
  isPve: boolean,
): number {
  const base = cfg.loser_base_damage_by_stage[String(Math.min(stage, 7))] ?? 15;
  const total = base + enemySurvivors * 1;
  return isPve ? Math.floor(total / 2) : total;
}

/** Stage structure, SRS §9.2: 6 rounds per stage. */
export function roundKind(stage: number, roundInStage: number): "PVE" | "PVP" | "BOSS_PVE" {
  if (roundInStage === 6) return "BOSS_PVE";
  if (stage === 1 && (roundInStage === 1 || roundInStage === 4)) return "PVE";
  if (stage >= 2 && roundInStage === 4) return "PVE";
  return "PVP";
}

/** Overtime, SRS §9.1: after 45 s (900 ticks at 20 Hz). */
export function isOvertime(tick: number, cfg: BalanceConfig): boolean {
  return tick >= cfg.overtime_after_ticks;
}
