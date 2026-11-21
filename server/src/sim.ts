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
}

export type SimEventKind =
  | "move"
  | "assassin_jump"
  | "damage"
  | "death"
  | "skill_cast"
  | "dodge"
  | "extra_shot";

export interface SimEvent {
  t: number;
  k: SimEventKind;
  a: number;
  b?: number;
  dmg?: number;
  hp?: number;
  s?: string;
  cell?: number;
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
): number {
  const defense = dmgType === "physical" ? effectiveArmor(dst, tick) : effectiveMr(dst, tick);
  const dmg = applyMitigation(raw, defense, dmgType);
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
  if (dealt > 0) {
    gainMana(src, cfg.mana_on_hit, tick, false, cfg);
    gainMana(dst, cfg.mana_on_being_hit, tick, true, cfg);
  }
  events.push({ t: tick, k: "damage", a: src.iid, b: dst.iid, dmg, hp: Math.trunc(Math.max(0, dst.hp)) });
  if (dst.hp <= 0 && dst.alive) {
    dst.alive = false;
    dst.hp = 0;
    events.push({ t: tick, k: "death", a: dst.iid, b: src.iid });
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
  tick: number,
  events: SimEvent[],
  rng: SeededRng,
  cfg: BalanceConfig,
): void {
  att.attack_count += 1;
  // Dodge: basic attacks only, base 0% (SRS §5.2, M1 has no dodge stat).
  // The RNG draw is still consumed, in Godot's order.
  const dodgeRoll = rng.next();
  const dodgeChance = 0;
  if (dodgeRoll < dodgeChance) {
    events.push({ t: tick, k: "dodge", a: att.iid, b: tgt.iid });
    return;
  }
  let raw = att.atk;
  const critChance = Math.min(1, cfg.crit_chance_base + att.mods.crit);
  const isCrit = rng.next() < critChance;
  if (isCrit) raw *= cfg.crit_damage_base + att.mods.crit_dmg;
  // ASSASSIN 6: +30% damage in the first 3 seconds.
  if (att.mods.early_seconds > 0 && tick < Math.trunc(att.mods.early_seconds * 20)) {
    raw *= 1 + att.mods.early_dmg_pct;
  }
  // WARRIOR 6: attacks deal +5% of target current HP.
  if (att.mods.max_hp_damage_pct > 0) raw += tgt.hp * att.mods.max_hp_damage_pct;
  applyDamage(att, tgt, raw, "physical", tick, events, cfg, true);
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
      applyDamage(caster, t2, raw, dtype, tick, events, cfg, false);
      // STRATEGIST 6: skill shreds target armor/MR 20% for 4 s.
      if (caster.mods.shred_pct > 0) {
        t2.shred_armor = t2.armor * caster.mods.shred_pct;
        t2.shred_mr = t2.mr * caster.mods.shred_pct;
        t2.shred_until_tick = tick + Math.trunc(caster.mods.shred_duration_sec * 20);
      }
    }
    events.push({ t: tick, k: "skill_cast", a: caster.iid, s: skill.skill_id, dmg: Math.trunc(raw) });
  }
  caster.mana = 0;
  caster.skill_casts += 1;
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

  constructor(sideA: Combatant[], sideB: Combatant[], seed: number, cfg: BalanceConfig) {
    this.sideA = sideA;
    this.sideB = sideB;
    this.order = [...sideA, ...sideB];
    this.cfg = cfg;
    this.rng = new Rng(seed);
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
          }
        }
      }
    }

    for (const c of this.order) {
      if (!c.alive) continue;
      const foes = c.side === 0 ? this.sideB : this.sideA;
      const friends = c.side === 0 ? this.sideA : this.sideB;
      // Skill first (SRS §5.2: cast at next tick before basic attack).
      if (c.mana >= c.max_mana && (c.skill as UnitSkill).skill_id) {
        castSkill(c, foes, friends, tick, tickEvents, cfg);
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
        let interval = cfg.tick_hz / Math.max(0.1, c.aspd);
        if (overtime) interval *= 2 / 3;
        if (c.atk_cd <= 0) {
          basicAttack(c, tgt, tick, tickEvents, this.rng, cfg);
          c.atk_cd = interval;
          // ARCHER 6 extra target: second nearest enemy in range.
          if (c.mods.extra_target_every > 0 && c.attack_count % c.mods.extra_target_every === 0) {
            const rest = foes.filter((e) => e.iid !== tgt?.iid);
            const second = selectTarget(c, rest);
            if (second && hexDistance(c.idx, second.idx) <= c.range) {
              applyDamage(c, second, c.atk, "physical", tick, tickEvents, cfg, true);
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
 */
export function buildSideCombatants(
  board: BoardSlot[],
  side: 0 | 1,
  ownerId: string,
  units: UnitDef[],
  cfg: BalanceConfig,
  iidStart: number,
): { combatants: Combatant[]; nextIid: number } {
  const synUnits = board
    .map((s) => units.find((u) => u.unit_id === s.unit_id))
    .filter((d): d is UnitDef => d !== undefined)
    .map((d) => ({ unit_id: d.unit_id, nation_id: d.nation_id, class_id: d.class_id }));
  const syn = computeSynergy(synUnits, cfg);
  const combatants: Combatant[] = [];
  let iid = iidStart;
  let k = 0;
  for (const slot of board) {
    const d = units.find((u) => u.unit_id === slot.unit_id);
    if (!d) continue;
    const idx = side === 0 ? slot.idx : mirrorIndex(slot.idx);
    const def: SimUnitDef = {
      unit_id: d.unit_id, name: d.name, nation_id: d.nation_id, class_id: d.class_id,
      star: slot.star, stats: d.stats_1star, skill: d.skill, is_pve: false,
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
