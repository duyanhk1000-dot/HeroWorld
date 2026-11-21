/**
 * Deterministic combat sim — direct port of scripts/m1_sim.gd (SRS §5).
 *
 * The M1 Godot sim runs a whole combat in one loop; the server needs it
 * tick-by-tick (20 Hz room loop), so the same loop body lives in
 * PairCombat.step(). Formulas, draw order and event order are identical
 * to m1_sim.gd:
 *   - tick 20 Hz, max 45 s (900 ticks) then overtime (pulse every 40 ticks)
 *   - damage raw×100/(100+armor/MR), min 1; crit 25% ×1.40; dodge 0% in M1
 *     (no dodge stat exists) — the dodge RNG draw is still consumed, in the
 *     same order as Godot, so the draw sequence matches
 *   - mana +10 on hit / +7 when hit (cap 25/s from being hit), star ×1.8^(star-1)
 *   - synergy 2/4/6 from balance_config.json (see synergy.ts)
 *   - targeting = nearest hex, tie-break smallest index
 *   - ASSASSIN jumps to the backline at tick 0
 *   - round_seed per round; RNG is mulberry32 only — Math.random() is
 *     FORBIDDEN in this file
 *
 * Determinism guarantee: same seed + same lineups → same event sequence,
 * run twice on this server. Cross-engine replay vs Godot is NOT claimed:
 * Godot's RandomNumberGenerator uses a different algorithm than mulberry32,
 * so the same seed draws different numbers there (formulas and draw order
 * are the same; see src/combat.ts for the shared contract).
 */
import type { BalanceConfig } from "./config";
import type { SeededRng } from "./rng";
import { SeededRng as Rng } from "./rng";
import { applyMitigation } from "./combat";
import { bfsStepToward, hexDistance, indexToCol, indexToRow, neighbors, rcToIndex } from "./hex";
import { computeSynergy, emptyMods, type UnitMods } from "./synergy";
import { activeBonds, applyStaticMods, type ActiveBond, type BondsData } from "./bonds";
import { starMultiplier, type PveData, type UnitDef, type UnitSkill, type UnitStats } from "./data";

export interface SimUnitDef {
  unit_id: string;
  name: string;
  nation_id: string;
  class_id: string;
  star: number;
  stats: UnitStats;
  skill: UnitSkill | Record<string, never>;
  is_pve: boolean;
  /** Active bonds of this unit's side (set by buildSideCombatants). */
  bonds?: ActiveBond[];
}

export interface Combatant {
  uid: string; // stable wire id: `${ownerId}:${unitId}:${seq}`
  iid: number;
  unit_id: string;
  name: string;
  nation: string;
  class: string;
  side: 0 | 1;
  idx: number;
  star: number;
  hp: number;
  hp_max: number;
  atk: number;
  ap: number;
  armor: number;
  mr: number;
  aspd: number;
  range: number;
  mana: number;
  max_mana: number;
  alive: boolean;
  shield: number;
  skill: UnitSkill | Record<string, never>;
  skill_casts: number;
  attack_count: number;
  atk_cd: number;
  move_cd: number;
  target_iid: number;
  mods: UnitMods;
  mana_hit_amt: number;
  mana_hit_window_tick: number;
  shred_armor: number;
  shred_mr: number;
  shred_until_tick: number;
  is_pve: boolean;
  exploded: boolean;
  /** Active bonds of this combatant's side (M3, SRS §7). */
  bonds: ActiveBond[];
  // M3 Karma Bonds runtime state (values come from mods / side bonds).
  stun_until_tick: number;
  cc_immune: boolean;
  cc_immune_used: boolean;
  crit_next: boolean;
  kill_stacks: number;
  aspd_buff_pct: number;
  aspd_buff_until_tick: number;
  atk_buff_pct: number;
  atk_buff_until_tick: number;
  burn_per_sec: number;
  burn_until_tick: number;
  burn_acc: number;
  burn_source_iid: number;
}

export type SimEventKind =
  | "move"
  | "assassin_jump"
  | "damage"
  | "death"
  | "skill_cast"
  | "dodge"
  | "extra_shot"
  | "karma_trigger";

export interface SimEvent {
  t: number;
  k: SimEventKind;
  a: number;
  b?: number;
  dmg?: number;
  hp?: number;
  s?: string;
  cell?: number;
  /** Bond id for karma_trigger events. */
  bond?: string;
}

/** Per-pair bond context, passed to the damage/attack/skill helpers. */
export interface CombatCtx {
  sideA: Combatant[];
  sideB: Combatant[];
  bondsA: ActiveBond[];
  bondsB: ActiveBond[];
}

export function mirrorIndex(idx: number): number {
  return rcToIndex(7 - indexToRow(idx), indexToCol(idx));
}

export function makeCombatant(
  def: SimUnitDef,
  side: 0 | 1,
  idx: number,
  mods: UnitMods,
  teamArmor: number,
  teamMr: number,
  cfg: BalanceConfig,
  iid: number,
  uid: string,
): Combatant {
  const stats = def.stats;
  const star = def.star;
  const mult = starMultiplier(cfg, star);
  const allPct = mods.all_pct;
  const hpMax =
    stats.hp * mult * (1 + mods.hp_pct + allPct);
  const atk = stats.atk * mult * (1 + mods.atk_pct + allPct);
  const aspd = stats.attack_speed * (1 + mods.aspd_pct + allPct);
  const ap = stats.ap * (1 + mods.ap_pct + allPct);
  const armor = stats.armor + mods.armor + teamArmor + stats.armor * allPct;
  const mr = stats.mr + mods.mr + teamMr + stats.mr * allPct;
  const mana = stats.start_mana + mods.start_mana + mods.first_skill_bonus_mana;
  const c: Combatant = {
    uid, iid,
    unit_id: def.unit_id, name: def.name, nation: def.nation_id, class: def.class_id,
    side, idx, star,
    hp: hpMax, hp_max: hpMax, atk, ap, armor, mr,
    aspd, range: stats.attack_range + mods.range_bonus,
    mana, max_mana: stats.max_mana,
    alive: true, shield: 0, skill: def.skill,
    skill_casts: 0, attack_count: 0, atk_cd: 0, move_cd: 0,
    target_iid: -1, mods,
    mana_hit_amt: 0, mana_hit_window_tick: 0,
    shred_armor: 0, shred_mr: 0, shred_until_tick: -1,
    is_pve: def.is_pve, exploded: false,
    bonds: def.bonds ?? [],
    // M3 Karma Bonds runtime state.
    stun_until_tick: -1,
    cc_immune: mods.cc_immune_first, cc_immune_used: false,
    crit_next: false, kill_stacks: 0,
    aspd_buff_pct: 0, aspd_buff_until_tick: -1,
    atk_buff_pct: 0, atk_buff_until_tick: -1,
    burn_per_sec: 0, burn_until_tick: -1, burn_acc: 0, burn_source_iid: -1,
  };
  // GUARDIAN 6 synergy: shield at battle start (self only; M1 simplification).
  if (c.class === "GUARDIAN" && mods.shield_pct_hp > 0) {
    c.shield = hpMax * mods.shield_pct_hp;
  }
  return c;
}

function effectiveArmor(c: Combatant, tick: number): number {
  return tick < c.shred_until_tick ? c.armor - c.shred_armor : c.armor;
}

function effectiveMr(c: Combatant, tick: number): number {
  return tick < c.shred_until_tick ? c.mr - c.shred_mr : c.mr;
}

// ---- M3 Karma Bonds helpers (mirror of scripts/m1_sim.gd) --------------

function sideBonds(ctx: CombatCtx, side: 0 | 1): ActiveBond[] {
  return side === 0 ? ctx.bondsA : ctx.bondsB;
}

function findGroup(
  bonds: ActiveBond[],
  trigger: string,
  key: string,
): { bond: ActiveBond; group: { trigger: string; scope: string; effect: Record<string, number | boolean> } } | null {
  for (const bond of bonds) {
    for (const g of bond.groups) {
      if (g.trigger === trigger && key in g.effect) return { bond, group: g };
    }
  }
  return null;
}

function isMember(bond: ActiveBond, unitId: string): boolean {
  return bond.membersOnBoard.includes(unitId);
}

function karmaEvent(events: SimEvent[], tick: number, bondId: string, aIid: number, bIid: number): void {
  events.push({ t: tick, k: "karma_trigger", a: aIid, b: bIid, bond: bondId });
}

function effectiveAtk(c: Combatant, tick: number): number {
  let mult = 1;
  if (tick < c.atk_buff_until_tick) mult += c.atk_buff_pct;
  mult += c.mods.kill_atk_pct * c.kill_stacks;
  return c.atk * mult;
}

function effectiveAspd(c: Combatant, tick: number): number {
  let mult = 1;
  if (tick < c.aspd_buff_until_tick) mult += c.aspd_buff_pct;
  if (c.hp < 0.5 * c.hp_max && c.mods.low_hp_aspd_pct > 0) mult += c.mods.low_hp_aspd_pct;
  return c.aspd * mult;
}

// Death-triggered bond effects (SRS §7.4): bond_co_sac shields/ATK-buffs
// all alive allies on ANY ally death; bond_than_va_quai heals the other
// alive members when a member dies; bond_kiem_thanh gives the killer +25%
// ATK when a member kills the other member. killer may be null
// (overtime/burn death).
function onUnitDeath(
  dead: Combatant,
  killer: Combatant | null,
  tick: number,
  events: SimEvent[],
  ctx: CombatCtx,
): void {
  const bonds = sideBonds(ctx, dead.side);
  const friends = dead.side === 0 ? ctx.sideA : ctx.sideB;
  // bond_co_sac: any ally death shields all alive allies (+ATK at tier 3).
  const g10 = findGroup(bonds, "ON_ALLY_DEATH", "death_shield_pct");
  if (g10) {
    const eff = g10.group.effect;
    for (const al of friends) {
      if (!al.alive) continue;
      al.shield += al.hp_max * (eff["death_shield_pct"] as number);
      if ((eff["death_atk_pct"] as number) > 0) {
        al.atk_buff_pct = eff["death_atk_pct"] as number;
        al.atk_buff_until_tick = tick + Math.trunc(((eff["death_atk_duration_sec"] as number) ?? 5) * 20);
      }
    }
    karmaEvent(events, tick, g10.bond.bond_id, dead.iid, -1);
  }
  // bond_than_va_quai: a member's death heals the other alive members 20%.
  const g8 = findGroup(bonds, "ON_ALLY_DEATH", "death_heal_pct");
  if (g8 && isMember(g8.bond, dead.unit_id)) {
    const eff = g8.group.effect;
    for (const al of friends) {
      if (!al.alive) continue;
      if (!isMember(g8.bond, al.unit_id)) continue;
      al.hp = Math.min(al.hp_max, al.hp + al.hp_max * (eff["death_heal_pct"] as number));
    }
    karmaEvent(events, tick, g8.bond.bond_id, dead.iid, -1);
  }
  // bond_kiem_thanh: a member killing the other member gains +25% ATK.
  if (killer) {
    const g5 = findGroup(bonds, "ON_KILL", "kill_atk_pct");
    if (g5) {
      const b5 = g5.bond;
      if (
        isMember(b5, killer.unit_id) &&
        isMember(b5, dead.unit_id) &&
        killer.unit_id !== dead.unit_id
      ) {
        killer.kill_stacks = Math.min(killer.kill_stacks + 1, killer.mods.kill_atk_max_stacks);
        karmaEvent(events, tick, b5.bond_id, killer.iid, dead.iid);
      }
    }
  }
}

function gainMana(c: Combatant, amount: number, tick: number, fromHit: boolean, cfg: BalanceConfig): void {
  const mult = 1 + c.mods.mana_regen_pct;
  if (fromHit) {
    // Cap 25 mana/sec from being hit (SRS §5.2): 20-tick window.
    const window = Math.floor(tick / 20);
    if (c.mana_hit_window_tick !== window) {
      c.mana_hit_window_tick = window;
      c.mana_hit_amt = 0;
    }
    const room = cfg.mana_on_being_hit_cap_per_sec - c.mana_hit_amt;
    if (room <= 0) return;
    amount = Math.min(amount * mult, room);
    c.mana_hit_amt += amount;
  } else {
    amount = amount * mult;
  }
  c.mana = Math.min(c.max_mana, c.mana + amount);
}

/** Apply one damage instance. Returns mitigated damage (pre-shield). */
function applyDamage(
  src: Combatant,
  dst: Combatant,
  raw: number,
  dmgType: "physical" | "magic",
  tick: number,
  events: SimEvent[],
  cfg: BalanceConfig,
  isBasic: boolean,
  ctx: CombatCtx | null = null,
  giveMana = true,
): number {
  const defense = dmgType === "physical" ? effectiveArmor(dst, tick) : effectiveMr(dst, tick);
  let dmg = applyMitigation(raw, defense, dmgType);
  // bond_than_va_quai (tier 2): below 50% HP, members take 15% less damage.
  if (dst.mods.low_hp_damage_taken_pct > 0 && dst.hp < 0.5 * dst.hp_max) {
    dmg = Math.max(1, Math.trunc(dmg * (1 - dst.mods.low_hp_damage_taken_pct)));
  }
  let dealt = dmg;
  let absorbed = 0;
  if (dst.shield > 0) {
    absorbed = Math.min(Math.trunc(dst.shield), dmg);
    dst.shield -= absorbed;
    dealt = dmg - absorbed;
  }
  dst.hp -= dealt;
  if (isBasic && src.mods.lifesteal > 0 && dealt > 0) {
    let heal = dealt * src.mods.lifesteal;
    if (tick >= cfg.overtime_after_ticks) heal *= 0.5;
    src.hp = Math.min(src.hp_max, src.hp + heal);
  }
  if (dealt > 0 && giveMana) {
    gainMana(src, cfg.mana_on_hit, tick, false, cfg);
    gainMana(dst, cfg.mana_on_being_hit, tick, true, cfg);
  }
  events.push({ t: tick, k: "damage", a: src.iid, b: dst.iid, dmg, hp: Math.trunc(Math.max(0, dst.hp)) });
  if (dst.hp <= 0 && dst.alive) {
    dst.alive = false;
    dst.hp = 0;
    events.push({ t: tick, k: "death", a: dst.iid, b: src.iid });
    if (ctx) onUnitDeath(dst, src, tick, events, ctx);
  }
  return dmg;
}

function selectTarget(att: Combatant, enemies: Combatant[]): Combatant | null {
  let best: Combatant | null = null;
  let bestDist = 999;
  let bestIdx = 999;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = hexDistance(att.idx, e.idx);
    if (d < bestDist || (d === bestDist && e.idx < bestIdx)) {
      best = e;
      bestDist = d;
      bestIdx = e.idx;
    }
  }
  return best;
}

function basicAttack(
  att: Combatant,
  tgt: Combatant,
  foes: Combatant[],
  tick: number,
  events: SimEvent[],
  rng: SeededRng,
  cfg: BalanceConfig,
  ctx: CombatCtx | null = null,
): void {
  att.attack_count += 1;
  // Dodge: basic attacks only. M3 bond_bong_dem adds dodge to member
  // Assassins (cap 0.35, SRS §5.2). The RNG draw is consumed either way.
  const dodgeRoll = rng.next();
  const dodgeChance = Math.min(cfg.dodge_cap, tgt.mods.dodge);
  if (dodgeRoll < dodgeChance) {
    events.push({ t: tick, k: "dodge", a: att.iid, b: tgt.iid });
    // bond_bong_dem (tier 3): after dodging, the next attack is a
    // guaranteed crit.
    if (tgt.mods.dodge_next_crit) {
      tgt.crit_next = true;
      if (ctx) {
        const gb = findGroup(sideBonds(ctx, tgt.side), "ON_BASIC_ATTACK", "dodge_pct");
        if (gb) karmaEvent(events, tick, gb.bond.bond_id, tgt.iid, att.iid);
      }
    }
    return;
  }
  let raw = effectiveAtk(att, tick);
  const critChance = Math.min(1, cfg.crit_chance_base + att.mods.crit);
  let isCrit = false;
  if (att.crit_next) {
    isCrit = true;
    att.crit_next = false;
  } else if (rng.next() < critChance) {
    isCrit = true;
  }
  if (isCrit) raw *= cfg.crit_damage_base + att.mods.crit_dmg;
  // ASSASSIN 6: +30% damage in the first 3 seconds.
  if (att.mods.early_seconds > 0 && tick < Math.trunc(att.mods.early_seconds * 20)) {
    raw *= 1 + att.mods.early_dmg_pct;
  }
  // WARRIOR 6: attacks deal +5% of target current HP.
  if (att.mods.max_hp_damage_pct > 0) raw += tgt.hp * att.mods.max_hp_damage_pct;
  applyDamage(att, tgt, raw, "physical", tick, events, cfg, true, ctx);
  // bond_mat_troi (tier 3): crits burn the target 2% max HP/sec for 3s.
  if (isCrit && att.mods.crit_burn_pct > 0 && tgt.alive) {
    tgt.burn_per_sec = att.mods.crit_burn_pct * tgt.hp_max;
    tgt.burn_until_tick = tick + Math.trunc(att.mods.crit_burn_duration_sec * 20);
    tgt.burn_source_iid = att.iid;
    if (ctx) {
      const gbr = findGroup(sideBonds(ctx, att.side), "ON_BATTLE_START", "crit_burn_pct");
      if (gbr) karmaEvent(events, tick, gbr.bond.bond_id, att.iid, tgt.iid);
    }
  }
  // bond_sam_set (tier 2): basic attacks chain lightning to 2 targets
  // (45% damage) and shred 15% MR for 4s.
  if (att.mods.chain_targets > 0) {
    let chained = 0;
    let remaining = foes.filter((e) => e.iid !== tgt.iid);
    while (chained < att.mods.chain_targets) {
      const nextTgt = selectTarget(att, remaining);
      if (!nextTgt) break;
      remaining = remaining.filter((e) => e.iid !== nextTgt.iid);
      applyDamage(att, nextTgt, effectiveAtk(att, tick) * att.mods.chain_damage_ratio, "physical", tick, events, cfg, false, ctx, false);
      nextTgt.shred_mr = nextTgt.mr * att.mods.mr_shred_percent / 100;
      nextTgt.shred_until_tick = tick + Math.trunc(att.mods.mr_shred_duration_sec * 20);
      chained += 1;
    }
    if (chained > 0 && ctx) {
      const gch = findGroup(sideBonds(ctx, att.side), "ON_BASIC_ATTACK", "chain_targets");
      if (gch) karmaEvent(events, tick, gch.bond.bond_id, att.iid, tgt.iid);
    }
  }
  // ARCHER 6: every 3rd attack hits an extra target in range.
  if (att.mods.extra_target_every > 0 && att.attack_count % att.mods.extra_target_every === 0) {
    events.push({ t: tick, k: "extra_shot", a: att.iid, b: tgt.iid });
  }
}

function castSkill(
  caster: Combatant,
  enemies: Combatant[],
  allies: Combatant[],
  tick: number,
  events: SimEvent[],
  cfg: BalanceConfig,
  ctx: CombatCtx | null = null,
): void {
  const skill = caster.skill as UnitSkill;
  if (!skill || !skill.skill_id) return;
  const star = caster.star;
  const baseArr = skill.base_damage ?? [100];
  const base = baseArr[Math.min(Math.max(star - 1, 0), baseArr.length - 1)];
  const stype = skill.type ?? "damage";
  const dtype = (skill.damage_type ?? "magic") as "physical" | "magic";
  let raw = base;
  if (dtype === "magic") raw = base * (1 + caster.ap / 100);
  const hitTargets: Combatant[] = [];
  if (stype === "shield") {
    let amount = base;
    if (tick >= cfg.overtime_after_ticks) amount *= 0.5;
    caster.shield += amount;
    for (const al of allies) {
      if (al.alive && al.iid !== caster.iid && hexDistance(caster.idx, al.idx) <= 1) {
        al.shield += amount;
      }
    }
    events.push({ t: tick, k: "skill_cast", a: caster.iid, s: skill.skill_id, dmg: Math.trunc(amount) });
  } else {
    const tgt = selectTarget(caster, enemies);
    if (!tgt) return; // no target: mana stays full, retry next tick (M1 behaviour)
    const targets: Combatant[] = [tgt];
    if (stype === "aoe") {
      for (const e of enemies) {
        if (e.iid !== tgt.iid && e.alive && hexDistance(tgt.idx, e.idx) <= 1) targets.push(e);
      }
    }
    for (const t2 of targets) {
      applyDamage(caster, t2, raw, dtype, tick, events, cfg, false, ctx);
      // STRATEGIST 6: skill shreds target armor/MR 20% for 4 s.
      if (caster.mods.shred_pct > 0) {
        t2.shred_armor = t2.armor * caster.mods.shred_pct;
        t2.shred_mr = t2.mr * caster.mods.shred_pct;
        t2.shred_until_tick = tick + Math.trunc(caster.mods.shred_duration_sec * 20);
      }
      hitTargets.push(t2);
    }
    events.push({ t: tick, k: "skill_cast", a: caster.iid, s: skill.skill_id, dmg: Math.trunc(raw) });
  }
  caster.mana = 0;
  caster.skill_casts += 1;
  // ---- M3 Karma Bonds on skill cast.
  if (!ctx) return;
  const bonds = sideBonds(ctx, caster.side);
  // bond_tri_thuc (tier 2): a member's cast restores 5 mana to all allies.
  const g9 = findGroup(bonds, "ON_CAST_SKILL", "cast_mana_restore");
  if (g9 && isMember(g9.bond, caster.unit_id)) {
    const restore = g9.group.effect["cast_mana_restore"] as number;
    for (const al of allies) {
      if (al.alive) gainMana(al, restore, tick, false, cfg);
    }
    karmaEvent(events, tick, g9.bond.bond_id, caster.iid, -1);
  }
  // bond_bien_va_song: a member's cast gives allied Archers +20% attack
  // speed for 4s; at tier 3 the skill's targets are also stunned 0.8s.
  const g3 = findGroup(bonds, "ON_CAST_SKILL", "archer_aspd_pct");
  if (g3 && isMember(g3.bond, caster.unit_id)) {
    const eff3 = g3.group.effect;
    for (const al of allies) {
      if (al.alive && al.class === "ARCHER") {
        al.aspd_buff_pct = eff3["archer_aspd_pct"] as number;
        al.aspd_buff_until_tick = tick + Math.trunc(((eff3["archer_aspd_duration_sec"] as number) ?? 4) * 20);
      }
    }
    if ((eff3["stun_duration_sec"] as number) > 0) {
      for (const ht of hitTargets) {
        if (!ht.alive) continue;
        // bond_cach_mang (tier 3): members are immune to the first CC.
        if (ht.cc_immune && !ht.cc_immune_used) {
          ht.cc_immune_used = true;
          continue;
        }
        ht.stun_until_tick = tick + Math.trunc((eff3["stun_duration_sec"] as number) * 20);
      }
    }
    karmaEvent(events, tick, g3.bond.bond_id, caster.iid, -1);
  }
}

export interface PairCombatResult {
  winner: number; // 0 = side A, 1 = side B, -1 = draw
  ticks: number;
  events: SimEvent[];
  survivorsA: number;
  survivorsB: number;
}

/**
 * One pair's combat, stepped one 20 Hz tick at a time by the room loop.
 * Build with buildPairCombat(); call step() once per room tick until
 * `finished` is true; read `events` for the full log.
 */
export class PairCombat {
  readonly sideA: Combatant[];
  readonly sideB: Combatant[];
  readonly order: Combatant[];
  readonly events: SimEvent[] = [];
  tick = -1;
  winner: number | null = null;
  finished = false;

  private rng: SeededRng;
  private cfg: BalanceConfig;
  private ctx: CombatCtx;
  private firstCastTick: number;

  constructor(sideA: Combatant[], sideB: Combatant[], seed: number, cfg: BalanceConfig) {
    this.sideA = sideA;
    this.sideB = sideB;
    this.order = [...sideA, ...sideB];
    this.cfg = cfg;
    this.rng = new Rng(seed);
    // M3 Karma Bonds: each side's combatants carry their side's active
    // bonds ("bonds" key); empty when the builder did not set them.
    const bondsA = sideA.length > 0 ? sideA[0].bonds : [];
    const bondsB = sideB.length > 0 ? sideB[0].bonds : [];
    this.ctx = { sideA, sideB, bondsA, bondsB };
    // bond_tri_thuc (tier 3): each member's first skill casts at second 5.
    this.firstCastTick = -1;
    for (const bset of [bondsA, bondsB]) {
      const gf = findGroup(bset, "ON_BATTLE_START", "first_cast_at_sec");
      if (gf) this.firstCastTick = Math.trunc(((gf.group.effect["first_cast_at_sec"] as number) ?? 5) * 20);
    }
    this.assassinJump();
  }

  /** ASSASSIN tick-0 jump to the backline (SRS §5.3). */
  private assassinJump(): void {
    for (const c of this.order) {
      if (c.class !== "ASSASSIN" || !c.alive) continue;
      const foes = c.side === 0 ? this.sideB : this.sideA;
      let far: Combatant | null = null;
      let bestScore = -999;
      for (const e of foes) {
        if (!e.alive) continue;
        const r = indexToRow(e.idx);
        const score = c.side === 0 ? r : -r;
        if (far === null || score > bestScore) {
          far = e;
          bestScore = score;
        }
      }
      if (!far) continue;
      const occupied = new Set<number>();
      for (const o of this.order) if (o.alive) occupied.add(o.idx);
      let bestCell = -1;
      for (const nb of neighbors(far.idx)) {
        if (!occupied.has(nb)) {
          bestCell = nb;
          break;
        }
      }
      if (bestCell >= 0) {
        c.idx = bestCell;
        this.events.push({ t: 0, k: "assassin_jump", a: c.iid, b: far.iid, cell: bestCell });
      }
    }
  }

  /** Advance one 20 Hz tick. Returns this tick's events (empty if finished). */
  step(): SimEvent[] {
    if (this.finished) return [];
    const tick = this.tick + 1;
    this.tick = tick;
    const tickEvents: SimEvent[] = [];
    const cfg = this.cfg;
    const overtimeTick = cfg.overtime_after_ticks;

    // Win check at tick start.
    let aliveA = 0;
    let aliveB = 0;
    for (const c of this.sideA) if (c.alive) aliveA += 1;
    for (const c of this.sideB) if (c.alive) aliveB += 1;
    if (aliveA === 0 && aliveB === 0) {
      this.winner = -1;
      this.finished = true;
      return [];
    }
    if (aliveA === 0) {
      this.winner = 1;
      this.finished = true;
      return [];
    }
    if (aliveB === 0) {
      this.winner = 0;
      this.finished = true;
      return [];
    }

    const overtime = tick >= overtimeTick;
    // bond_mat_troi (tier 3): crit burn ticks (2% max HP/sec, 3s).
    for (const c of this.order) {
      if (!c.alive) continue;
      if (tick >= c.burn_until_tick || c.burn_per_sec <= 0) continue;
      c.burn_acc += c.burn_per_sec / 20;
      if (c.burn_acc >= 1) {
        const bdmg = Math.trunc(c.burn_acc);
        c.burn_acc -= bdmg;
        c.hp -= bdmg;
        tickEvents.push({ t: tick, k: "damage", a: c.burn_source_iid, b: c.iid, dmg: bdmg, hp: Math.trunc(Math.max(0, c.hp)) });
        if (c.hp <= 0) {
          c.alive = false;
          c.hp = 0;
          tickEvents.push({ t: tick, k: "death", a: c.iid, b: c.burn_source_iid });
          onUnitDeath(c, null, tick, tickEvents, this.ctx);
        }
      }
    }
    // bond_tri_thuc (tier 3): each member's first skill casts at second 5.
    if (tick === this.firstCastTick) {
      for (const c of this.order) {
        if (!c.alive || c.skill_casts > 0 || !(c.skill as UnitSkill).skill_id) continue;
        const gfc = findGroup(sideBonds(this.ctx, c.side), "ON_BATTLE_START", "first_cast_at_sec");
        if (!gfc || !isMember(gfc.bond, c.unit_id)) continue;
        c.mana = c.max_mana;
        karmaEvent(tickEvents, tick, gfc.bond.bond_id, c.iid, -1);
      }
    }
    // Overtime damage pulse every 40 ticks (SRS §9.1).
    if (overtime && tick > overtimeTick && (tick - overtimeTick) % 40 === 0) {
      const blocks = Math.floor((tick - overtimeTick) / 40);
      const pct = 0.05 + 0.01 * blocks;
      for (const c of this.order) {
        if (c.alive) {
          c.hp -= c.hp_max * pct;
          if (c.hp <= 0) {
            c.alive = false;
            c.hp = 0;
            tickEvents.push({ t: tick, k: "death", a: c.iid, b: -1 });
            onUnitDeath(c, null, tick, tickEvents, this.ctx);
          }
        }
      }
    }

    for (const c of this.order) {
      if (!c.alive) continue;
      // Stunned (bond_bien_va_song tier 3): skip the whole turn.
      if (tick < c.stun_until_tick) continue;
      const foes = c.side === 0 ? this.sideB : this.sideA;
      const friends = c.side === 0 ? this.sideA : this.sideB;
      // Skill first (SRS §5.2: cast at next tick before basic attack).
      if (c.mana >= c.max_mana && (c.skill as UnitSkill).skill_id) {
        castSkill(c, foes, friends, tick, tickEvents, cfg, this.ctx);
        continue;
      }
      let tgt: Combatant | null = null;
      if (c.target_iid >= 0) {
        for (const e of foes) {
          if (e.iid === c.target_iid && e.alive) {
            tgt = e;
            break;
          }
        }
      }
      if (!tgt) {
        tgt = selectTarget(c, foes);
        if (!tgt) continue;
        c.target_iid = tgt.iid;
      }
      const dist = hexDistance(c.idx, tgt.idx);
      if (dist <= c.range) {
        let interval = cfg.tick_hz / Math.max(0.1, effectiveAspd(c, tick));
        if (overtime) interval *= 2 / 3;
        if (c.atk_cd <= 0) {
          basicAttack(c, tgt, foes, tick, tickEvents, this.rng, cfg, this.ctx);
          c.atk_cd = interval;
          // ARCHER 6 extra target: second nearest enemy in range.
          if (c.mods.extra_target_every > 0 && c.attack_count % c.mods.extra_target_every === 0) {
            const rest = foes.filter((e) => e.iid !== tgt?.iid);
            const second = selectTarget(c, rest);
            if (second && hexDistance(c.idx, second.idx) <= c.range) {
              applyDamage(c, second, effectiveAtk(c, tick), "physical", tick, tickEvents, cfg, true, this.ctx);
            }
          }
        } else {
          c.atk_cd -= 1;
        }
      } else {
        if (c.move_cd <= 0) {
          const blocked = new Set<number>();
          for (const o of this.order) {
            if (o !== c && o.alive) blocked.add(o.idx);
          }
          const stepCell = bfsStepToward(c.idx, tgt.idx, c.range, blocked);
          if (stepCell >= 0) {
            c.idx = stepCell;
            tickEvents.push({ t: tick, k: "move", a: c.iid, cell: stepCell });
          }
          c.move_cd = cfg.move_ticks_per_hex;
        } else {
          c.move_cd -= 1;
        }
      }
    }

    // DIVINE 6: a Divine that just died explodes (300 true damage, 1 hex).
    for (const c of this.order) {
      if (!c.alive && !c.exploded && c.mods.death_explosion_true_damage > 0) {
        c.exploded = true;
        const dmg = c.mods.death_explosion_true_damage;
        const foes2 = c.side === 0 ? this.sideB : this.sideA;
        for (const e of foes2) {
          if (e.alive && hexDistance(c.idx, e.idx) <= 1) {
            e.hp -= dmg;
            tickEvents.push({ t: tick, k: "damage", a: c.iid, b: e.iid, dmg: Math.trunc(dmg), hp: Math.trunc(Math.max(0, e.hp)) });
            if (e.hp <= 0) {
              e.alive = false;
              e.hp = 0;
              tickEvents.push({ t: tick, k: "death", a: e.iid, b: c.iid });
              onUnitDeath(e, c, tick, tickEvents, this.ctx);
            }
          }
        }
      }
    }

    this.events.push(...tickEvents);
    return tickEvents;
  }

  /** M1 cap fallback: side with the higher total HP fraction wins. */
  forceDecideByHpFraction(): void {
    if (this.finished) return;
    let fa = 0;
    let fb = 0;
    for (const c of this.sideA) fa += c.hp / Math.max(1, c.hp_max);
    for (const c of this.sideB) fb += c.hp / Math.max(1, c.hp_max);
    this.winner = fa > fb ? 0 : fb > fa ? 1 : -1;
    this.finished = true;
  }

  survivors(): { a: number; b: number } {
    let a = 0;
    let b = 0;
    for (const c of this.sideA) if (c.alive) a += 1;
    for (const c of this.sideB) if (c.alive) b += 1;
    return { a, b };
  }

  result(): PairCombatResult {
    const s = this.survivors();
    return {
      winner: this.winner ?? -1,
      ticks: Math.max(0, this.tick),
      events: this.events,
      survivorsA: s.a,
      survivorsB: s.b,
    };
  }
}

/** Run a whole combat synchronously (tests / replays). Max 1500 ticks, like M1. */
export function runCombat(sideA: Combatant[], sideB: Combatant[], seed: number, cfg: BalanceConfig): PairCombatResult {
  const combat = new PairCombat(sideA, sideB, seed, cfg);
  for (let i = 0; i < 1500 && !combat.finished; i++) combat.step();
  if (!combat.finished) combat.forceDecideByHpFraction();
  return combat.result();
}

// ------------------------------------------------------------------ builders

export interface BoardSlot {
  unit_id: string;
  star: number;
  idx: number;
}

/**
 * Build one side's combatants from a player's board (M1 _build_side).
 * Side 1 boards are mirrored (row 7-row) so both sides face each other.
 * M3: active Karma Bonds fold their static effects into unit mods and ride
 * on every def so PairCombat can fire bond triggers.
 */
export function buildSideCombatants(
  board: BoardSlot[],
  side: 0 | 1,
  ownerId: string,
  units: UnitDef[],
  cfg: BalanceConfig,
  iidStart: number,
  bondsData: BondsData | null = null,
): { combatants: Combatant[]; nextIid: number } {
  const synUnits = board
    .map((s) => units.find((u) => u.unit_id === s.unit_id))
    .filter((d): d is UnitDef => d !== undefined)
    .map((d) => ({ unit_id: d.unit_id, nation_id: d.nation_id, class_id: d.class_id }));
  const syn = computeSynergy(synUnits, cfg);
  const active = activeBonds(
    synUnits.map((u) => u.unit_id),
    bondsData,
  );
  applyStaticMods(synUnits, active, syn.unitMods);
  const combatants: Combatant[] = [];
  let iid = iidStart;
  let k = 0;
  for (const slot of board) {
    const d = units.find((u) => u.unit_id === slot.unit_id);
    if (!d) continue;
    const idx = side === 0 ? slot.idx : mirrorIndex(slot.idx);
    const def: SimUnitDef = {
      unit_id: d.unit_id, name: d.name, nation_id: d.nation_id, class_id: d.class_id,
      star: slot.star, stats: d.stats_1star, skill: d.skill, is_pve: false, bonds: active,
    };
    iid += 1;
    combatants.push(
      makeCombatant(def, side, idx, syn.unitMods[k], syn.teamArmor, syn.teamMr, cfg, iid, `${ownerId}:${d.unit_id}:${k}`),
    );
    k += 1;
  }
  return { combatants, nextIid: iid };
}

/** PvE monsters for a stage/round (M1 _pve_side). Falls back to stage 3, scaled. */
export function buildPveCombatants(
  stage: number,
  ris: number,
  pve: PveData,
  cfg: BalanceConfig,
  iidStart: number,
): { combatants: Combatant[]; nextIid: number } {
  const key = `${stage}-${ris}`;
  let entry = pve.pve_rounds[key];
  let hpScale = 1;
  let atkScale = 1;
  if (!entry) {
    entry = pve.pve_rounds[`3-${ris}`];
    const extra = stage - 3;
    hpScale = Math.pow(pve.stage_scaling.hp_per_stage, extra);
    atkScale = Math.pow(pve.stage_scaling.atk_per_stage, extra);
  }
  if (!entry) return { combatants: [], nextIid: iidStart };
  const cells = [
    rcToIndex(7, 3), rcToIndex(7, 2), rcToIndex(7, 4),
    rcToIndex(6, 3), rcToIndex(6, 2), rcToIndex(6, 4),
    rcToIndex(5, 3),
  ];
  const combatants: Combatant[] = [];
  let iid = iidStart;
  let ci = 0;
  for (const m of entry.units) {
    for (let n = 0; n < m.count; n++) {
      if (ci >= cells.length) break;
      const stats: UnitStats = {
        hp: Math.trunc(m.hp * hpScale),
        atk: Math.trunc(m.atk * atkScale),
        ap: 0,
        armor: m.armor,
        mr: m.mr,
        attack_speed: m.attack_speed,
        attack_range: m.attack_range,
        start_mana: 0,
        max_mana: 100,
      };
      const def: SimUnitDef = {
        unit_id: `pve_${m.name}`,
        name: m.name,
        nation_id: "",
        class_id: "",
        star: 1,
        stats,
        skill: {},
        is_pve: true,
      };
      iid += 1;
      combatants.push(
        makeCombatant(def, 1, cells[ci], emptyMods(), 0, 0, cfg, iid, `pve:${m.name}:${ci}`),
      );
      ci += 1;
    }
  }
  return { combatants, nextIid: iid };
}

/** Ghost copy of an eliminated player's board (M1 _ghost_side): no synergy. */
export function buildGhostCombatants(
  ghostBoard: BoardSlot[],
  ownerId: string,
  units: UnitDef[],
  cfg: BalanceConfig,
  iidStart: number,
): { combatants: Combatant[]; nextIid: number } {
  const combatants: Combatant[] = [];
  let iid = iidStart;
  let k = 0;
  for (const slot of ghostBoard) {
    const d = units.find((u) => u.unit_id === slot.unit_id);
    if (!d) continue;
    const def: SimUnitDef = {
      unit_id: d.unit_id, name: d.name, nation_id: d.nation_id, class_id: d.class_id,
      star: slot.star, stats: d.stats_1star, skill: d.skill, is_pve: false,
    };
    iid += 1;
    combatants.push(
      makeCombatant(def, 1, mirrorIndex(slot.idx), emptyMods(), 0, 0, cfg, iid, `${ownerId}:${d.unit_id}:${k}`),
    );
    k += 1;
  }
  return { combatants, nextIid: iid };
}
