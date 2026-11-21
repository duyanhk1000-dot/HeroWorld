extends RefCounted

# M1 - Deterministic combat sim, SRS v2.1 section 5.
# Fixed tick 20 Hz, max 45s (900 ticks) then overtime. Seeded RNG only:
# NO randf()/randi() without a seed anywhere in this file. Same seed +
# same lineups => identical event sequence (replay, SRS 5.1 / 13.1).
const M1Hex = preload("res://scripts/m1_hex.gd")
const M1Data = preload("res://scripts/m1_data.gd")

static func make_combatant(unit_def: Dictionary, side: int, idx: int, mods: Dictionary, team_armor: int, team_mr: int, balance: Dictionary, iid: int) -> Dictionary:
	var stats: Dictionary = unit_def.get("stats", {})
	var star: int = int(unit_def.get("star", 1))
	var mult := M1Data.star_multiplier(balance, star)
	var all_pct := float(mods.get("all_pct", 0.0))
	var hp_max: float = float(stats.get("hp", 500)) * mult * (1.0 + float(mods.get("hp_pct", 0.0)) + all_pct)
	var atk: float = float(stats.get("atk", 50)) * mult * (1.0 + float(mods.get("atk_pct", 0.0)) + all_pct)
	var aspd: float = float(stats.get("attack_speed", 0.7)) * (1.0 + float(mods.get("aspd_pct", 0.0)) + all_pct)
	var ap: float = float(stats.get("ap", 0)) * (1.0 + float(mods.get("ap_pct", 0.0)) + all_pct)
	var armor: float = float(stats.get("armor", 0)) + float(mods.get("armor", 0)) + float(team_armor) + float(stats.get("armor", 0)) * all_pct
	var mr: float = float(stats.get("mr", 0)) + float(mods.get("mr", 0)) + float(team_mr) + float(stats.get("mr", 0)) * all_pct
	var mana: float = float(stats.get("start_mana", 0)) + float(mods.get("start_mana", 0)) + float(mods.get("first_skill_bonus_mana", 0))
	var c := {
		"iid": iid, "unit_id": unit_def.get("unit_id", ""), "name": unit_def.get("name", "?"),
		"nation": unit_def.get("nation_id", ""), "class": unit_def.get("class_id", ""),
		"side": side, "idx": idx, "star": star,
		"hp": hp_max, "hp_max": hp_max, "atk": atk, "ap": ap, "armor": armor, "mr": mr,
		"aspd": aspd, "range": int(stats.get("attack_range", 1)) + int(mods.get("range_bonus", 0)),
		"mana": mana, "max_mana": float(stats.get("max_mana", 100)),
		"alive": true, "shield": 0.0, "skill": unit_def.get("skill", {}),
		"skill_casts": 0, "attack_count": 0, "atk_cd": 0.0, "move_cd": 0,
		"target_iid": -1, "mods": mods,
		"mana_hit_amt": 0.0, "mana_hit_window_tick": 0,
		"shred_armor": 0.0, "shred_mr": 0.0, "shred_until_tick": -1,
		"is_pve": bool(unit_def.get("is_pve", false)),
		# M3: the side's active bonds ride on every combatant so run_combat
		# can fire triggers (set by the match builder in unit_def).
		"bonds": unit_def.get("bonds", []),
		# M3 Karma Bonds runtime state (values come from mods / side bonds).
		"stun_until_tick": -1,
		"cc_immune": bool(mods.get("cc_immune_first", false)),
		"cc_immune_used": false,
		"crit_next": false, "kill_stacks": 0,
		"aspd_buff_pct": 0.0, "aspd_buff_until_tick": -1,
		"atk_buff_pct": 0.0, "atk_buff_until_tick": -1,
		"burn_per_sec": 0.0, "burn_until_tick": -1, "burn_acc": 0.0, "burn_source_iid": -1,
	}
	# GUARDIAN 6 synergy: shield at battle start (self only; front-row allies
	# share the row, see docs/m1-notes.md for the simplification).
	if String(c["class"]) == "GUARDIAN" and float(mods.get("shield_pct_hp", 0.0)) > 0.0:
		c["shield"] = hp_max * float(mods.get("shield_pct_hp", 0.0))
	return c

static func _mitigate(raw: float, defense: float) -> int:
	var dmg: float
	if defense >= 0.0:
		dmg = raw * 100.0 / (100.0 + defense)
	else:
		dmg = raw * (2.0 - 100.0 / (100.0 - defense))
	return maxi(1, int(dmg))

static func _effective_armor(c: Dictionary, tick: int) -> float:
	if tick < int(c.get("shred_until_tick", -1)):
		return float(c["armor"]) - float(c.get("shred_armor", 0.0))
	return float(c["armor"])

static func _effective_mr(c: Dictionary, tick: int) -> float:
	if tick < int(c.get("shred_until_tick", -1)):
		return float(c["mr"]) - float(c.get("shred_mr", 0.0))
	return float(c["mr"])

# ---- M3 Karma Bonds helpers ------------------------------------------------
# ctx: {"side_a": Array, "side_b": Array, "bonds_a": Array, "bonds_b": Array}
# bonds_* are the active-bond arrays of that side (scripts/m1_bonds.gd),
# attached to each side's defs by the match builder ("bonds" key).

static func _side_bonds(ctx: Dictionary, side: int) -> Array:
	return ctx.get("bonds_a", []) if side == 0 else ctx.get("bonds_b", [])

static func _find_group(bonds: Array, trigger: String, key: String) -> Dictionary:
	for bond in bonds:
		for g in bond.get("groups", []):
			if String(g.get("trigger", "")) == trigger and Dictionary(g.get("effect", {})).has(key):
				return {"bond": bond, "group": g}
	return {}

static func _is_member(bond: Dictionary, unit_id: String) -> bool:
	return (bond.get("members_on_board", []) as Array).has(unit_id)

static func _karma_event(events: Array, tick: int, bond_id: String, a_iid: int, b_iid: int) -> void:
	events.append({"t": tick, "k": "karma_trigger", "a": a_iid, "b": b_iid, "bond": bond_id})

static func _effective_atk(c: Dictionary, tick: int) -> float:
	var mult := 1.0
	if tick < int(c.get("atk_buff_until_tick", -1)):
		mult += float(c.get("atk_buff_pct", 0.0))
	mult += float(Dictionary(c.get("mods", {})).get("kill_atk_pct", 0.0)) * float(c.get("kill_stacks", 0))
	return float(c.get("atk", 0)) * mult

static func _effective_aspd(c: Dictionary, tick: int) -> float:
	var mult := 1.0
	if tick < int(c.get("aspd_buff_until_tick", -1)):
		mult += float(c.get("aspd_buff_pct", 0.0))
	var mods: Dictionary = c.get("mods", {})
	if float(c.get("hp", 0)) < 0.5 * float(c.get("hp_max", 1)) and float(mods.get("low_hp_aspd_pct", 0.0)) > 0.0:
		mult += float(mods["low_hp_aspd_pct"])
	return float(c.get("aspd", 0.7)) * mult

# Death-triggered bond effects (SRS 7.4): bond_co_sac shields/ATK-buffs all
# alive allies on ANY ally death; bond_than_va_quai heals the other alive
# members when a member dies; bond_kiem_thanh gives the killer +25% ATK when
# a member kills the other member. killer may be {} (overtime/burn death).
static func _on_unit_death(dead: Dictionary, killer: Dictionary, tick: int, events: Array, ctx: Dictionary) -> void:
	if ctx.is_empty():
		return
	var side: int = int(dead.get("side", 0))
	var bonds: Array = _side_bonds(ctx, side)
	var friends: Array = ctx.get("side_a", []) if side == 0 else ctx.get("side_b", [])
	# bond_co_sac: any ally death shields all alive allies (+ATK at tier 3).
	var g10 := _find_group(bonds, "ON_ALLY_DEATH", "death_shield_pct")
	if not g10.is_empty():
		var eff10: Dictionary = Dictionary(g10["group"]).get("effect", {})
		for al in friends:
			if not bool(al.get("alive", false)):
				continue
			al["shield"] = float(al.get("shield", 0.0)) + float(al.get("hp_max", 1)) * float(eff10.get("death_shield_pct", 0.0))
			if float(eff10.get("death_atk_pct", 0.0)) > 0.0:
				al["atk_buff_pct"] = float(eff10["death_atk_pct"])
				al["atk_buff_until_tick"] = tick + int(float(eff10.get("death_atk_duration_sec", 5.0)) * 20.0)
		_karma_event(events, tick, String(Dictionary(g10["bond"]).get("bond_id", "")), int(dead.get("iid", -1)), -1)
	# bond_than_va_quai: a member's death heals the other alive members 20%.
	var g8 := _find_group(bonds, "ON_ALLY_DEATH", "death_heal_pct")
	if not g8.is_empty() and _is_member(Dictionary(g8["bond"]), String(dead.get("unit_id", ""))):
		var eff8: Dictionary = Dictionary(g8["group"]).get("effect", {})
		for al in friends:
			if not bool(al.get("alive", false)):
				continue
			if not _is_member(Dictionary(g8["bond"]), String(al.get("unit_id", ""))):
				continue
			al["hp"] = minf(float(al.get("hp_max", 1)), float(al.get("hp", 0)) + float(al.get("hp_max", 1)) * float(eff8.get("death_heal_pct", 0.0)))
		_karma_event(events, tick, String(Dictionary(g8["bond"]).get("bond_id", "")), int(dead.get("iid", -1)), -1)
	# bond_kiem_thanh: a member killing the other member gains +25% ATK.
	if not killer.is_empty():
		var g5 := _find_group(bonds, "ON_KILL", "kill_atk_pct")
		if not g5.is_empty():
			var b5: Dictionary = g5["bond"]
			var kmods: Dictionary = killer.get("mods", {})
			if _is_member(b5, String(killer.get("unit_id", ""))) and _is_member(b5, String(dead.get("unit_id", ""))) and String(killer.get("unit_id", "")) != String(dead.get("unit_id", "")):
				killer["kill_stacks"] = mini(int(killer.get("kill_stacks", 0)) + 1, int(kmods.get("kill_atk_max_stacks", 2)))
				_karma_event(events, tick, String(b5.get("bond_id", "")), int(killer.get("iid", -1)), int(dead.get("iid", -1)))

static func _gain_mana(c: Dictionary, amount: float, tick: int, from_hit: bool, balance: Dictionary) -> void:
	var mult := 1.0 + float(Dictionary(c.get("mods", {})).get("mana_regen_pct", 0.0))
	if from_hit:
		# Cap 25 mana/sec from being hit (SRS 5.2): 20-tick window.
		var window := tick / 20
		if int(c.get("mana_hit_window_tick", -1)) != window:
			c["mana_hit_window_tick"] = window
			c["mana_hit_amt"] = 0.0
		var cap: float = float(balance.get("mana_on_being_hit_cap_per_sec", 25))
		var room: float = cap - float(c.get("mana_hit_amt", 0.0))
		if room <= 0.0:
			return
		amount = minf(amount * mult, room)
		c["mana_hit_amt"] = float(c.get("mana_hit_amt", 0.0)) + amount
	else:
		amount = amount * mult
	c["mana"] = minf(float(c.get("max_mana", 100)), float(c.get("mana", 0)) + amount)

# Apply one damage instance. Returns damage actually dealt to HP+shield.
# ctx carries both sides + their active bonds ({} in unit tests that do not
# need bonds); give_mana=false for chain-lightning hits (no double mana).
static func _apply_damage(src: Dictionary, dst: Dictionary, raw: float, dmg_type: String, tick: int, events: Array, rng: RandomNumberGenerator, balance: Dictionary, is_basic: bool, ctx: Dictionary = {}, give_mana: bool = true) -> int:
	var defense := _effective_armor(dst, tick) if dmg_type == "physical" else _effective_mr(dst, tick)
	var dmg := _mitigate(raw, defense)
	# bond_than_va_quai (tier 2): below 50% HP, members take 15% less damage.
	var lhp := float(Dictionary(dst.get("mods", {})).get("low_hp_damage_taken_pct", 0.0))
	if lhp > 0.0 and float(dst.get("hp", 0)) < 0.5 * float(dst.get("hp_max", 1)):
		dmg = maxi(1, int(float(dmg) * (1.0 - lhp)))
	var dealt := dmg
	var absorbed := 0
	if float(dst.get("shield", 0.0)) > 0.0:
		absorbed = mini(int(dst["shield"]), dmg)
		dst["shield"] = float(dst["shield"]) - float(absorbed)
		dealt = dmg - absorbed
	dst["hp"] = float(dst.get("hp", 0)) - float(dealt)
	var mods: Dictionary = src.get("mods", {})
	if is_basic and float(mods.get("lifesteal", 0.0)) > 0.0 and dealt > 0:
		var heal: float = float(dealt) * float(mods["lifesteal"])
		if tick >= int(balance.get("overtime_after_ticks", 900)):
			heal *= 0.5
		src["hp"] = minf(float(src.get("hp_max", 1)), float(src.get("hp", 0)) + heal)
	if dealt > 0 and give_mana:
		_gain_mana(src, float(balance.get("mana_on_hit", 10)), tick, false, balance)
		_gain_mana(dst, float(balance.get("mana_on_being_hit", 7)), tick, true, balance)
	events.append({"t": tick, "k": "damage", "a": src.get("iid", -1), "b": dst.get("iid", -1), "dmg": dmg, "hp": int(maxi(0, int(dst.get("hp", 0))))})
	if float(dst.get("hp", 0)) <= 0.0 and bool(dst.get("alive", false)):
		dst["alive"] = false
		dst["hp"] = 0.0
		events.append({"t": tick, "k": "death", "a": dst.get("iid", -1), "b": src.get("iid", -1)})
		# DIVINE 6 explosion is handled by the run loop (it scans for newly
		# dead Divines each tick), not here.
		_on_unit_death(dst, src, tick, events, ctx)
	return dmg

static func _foes_except(foes: Array, skip: Dictionary) -> Array:
	var out: Array = []
	var skip_iid: int = int(skip.get("iid", -1))
	for e in foes:
		if int(e.get("iid", -1)) != skip_iid:
			out.append(e)
	return out

static func _select_target(att: Dictionary, enemies: Array) -> Dictionary:
	var best: Dictionary = {}
	var best_dist := 999
	var best_idx := 999
	for e in enemies:
		if not bool(e.get("alive", false)):
			continue
		var d := M1Hex.hex_distance(int(att.get("idx", 0)), int(e.get("idx", 0)))
		var ei: int = int(e.get("idx", 0))
		if d < best_dist or (d == best_dist and ei < best_idx):
			best = e
			best_dist = d
			best_idx = ei
	return best

static func _basic_attack(att: Dictionary, tgt: Dictionary, foes: Array, tick: int, events: Array, rng: RandomNumberGenerator, balance: Dictionary, ctx: Dictionary = {}) -> void:
	att["attack_count"] = int(att.get("attack_count", 0)) + 1
	var mods: Dictionary = att.get("mods", {})
	# Dodge: basic attacks only. M3 bond_bong_dem adds dodge to member
	# Assassins (cap 0.35, SRS 5.2). The RNG draw is consumed either way.
	var dodge_chance := minf(float(balance.get("dodge_cap", 0.35)), float(Dictionary(tgt.get("mods", {})).get("dodge", 0.0)))
	if rng.randf() < dodge_chance:
		events.append({"t": tick, "k": "dodge", "a": att.get("iid", -1), "b": tgt.get("iid", -1)})
		# bond_bong_dem (tier 3): after dodging, the next attack is a
		# guaranteed crit.
		if bool(Dictionary(tgt.get("mods", {})).get("dodge_next_crit", false)):
			tgt["crit_next"] = true
			var gb := _find_group(_side_bonds(ctx, int(tgt.get("side", 0))), "ON_BASIC_ATTACK", "dodge_pct")
			if not gb.is_empty():
				_karma_event(events, tick, String(Dictionary(gb["bond"]).get("bond_id", "")), int(tgt.get("iid", -1)), int(att.get("iid", -1)))
		return
	var raw: float = _effective_atk(att, tick)
	var crit_chance: float = minf(1.0, float(balance.get("crit_chance_base", 0.25)) + float(mods.get("crit", 0.0)))
	var is_crit := false
	if bool(att.get("crit_next", false)):
		is_crit = true
		att["crit_next"] = false
	elif rng.randf() < crit_chance:
		is_crit = true
	if is_crit:
		raw *= float(balance.get("crit_damage_base", 1.40)) + float(mods.get("crit_dmg", 0.0))
	# ASSASSIN 6: +30% damage in the first 3 seconds.
	var early_sec: float = float(mods.get("early_seconds", 0.0))
	if early_sec > 0.0 and tick < int(early_sec * 20.0):
		raw *= 1.0 + float(mods.get("early_dmg_pct", 0.0))
	# WARRIOR 6: attacks deal +5% of target current HP.
	if float(mods.get("max_hp_damage_pct", 0.0)) > 0.0:
		raw += float(tgt.get("hp", 0)) * float(mods["max_hp_damage_pct"])
	_apply_damage(att, tgt, raw, "physical", tick, events, rng, balance, true, ctx)
	# bond_mat_troi (tier 3): crits burn the target 2% max HP/sec for 3s.
	if is_crit and float(mods.get("crit_burn_pct", 0.0)) > 0.0 and bool(tgt.get("alive", false)):
		tgt["burn_per_sec"] = float(mods["crit_burn_pct"]) * float(tgt.get("hp_max", 1))
		tgt["burn_until_tick"] = tick + int(float(mods.get("crit_burn_duration_sec", 3.0)) * 20.0)
		tgt["burn_source_iid"] = int(att.get("iid", -1))
		var gbr := _find_group(_side_bonds(ctx, int(att.get("side", 0))), "ON_BATTLE_START", "crit_burn_pct")
		if not gbr.is_empty():
			_karma_event(events, tick, String(Dictionary(gbr["bond"]).get("bond_id", "")), int(att.get("iid", -1)), int(tgt.get("iid", -1)))
	# bond_sam_set (tier 2): basic attacks chain lightning to 2 targets
	# (45% damage) and shred 15% MR for 4s.
	if int(mods.get("chain_targets", 0)) > 0:
		var chained := 0
		var remaining := _foes_except(foes, tgt)
		while chained < int(mods["chain_targets"]):
			var next_tgt := _select_target(att, remaining)
			if next_tgt.is_empty():
				break
			remaining = _foes_except(remaining, next_tgt)
			_apply_damage(att, next_tgt, _effective_atk(att, tick) * float(mods.get("chain_damage_ratio", 0.0)), "physical", tick, events, rng, balance, false, ctx, false)
			next_tgt["shred_mr"] = float(next_tgt.get("mr", 0)) * float(mods.get("mr_shred_percent", 0.0)) / 100.0
			next_tgt["shred_until_tick"] = tick + int(float(mods.get("mr_shred_duration_sec", 4.0)) * 20.0)
			chained += 1
		if chained > 0:
			var gch := _find_group(_side_bonds(ctx, int(att.get("side", 0))), "ON_BASIC_ATTACK", "chain_targets")
			if not gch.is_empty():
				_karma_event(events, tick, String(Dictionary(gch["bond"]).get("bond_id", "")), int(att.get("iid", -1)), int(tgt.get("iid", -1)))
	# ARCHER 6: every 3rd attack hits an extra target in range.
	if int(mods.get("extra_target_every", 0)) > 0 and int(att.get("attack_count", 0)) % int(mods["extra_target_every"]) == 0:
		events.append({"t": tick, "k": "extra_shot", "a": att.get("iid", -1), "b": tgt.get("iid", -1)})

static func _cast_skill(caster: Dictionary, enemies: Array, allies: Array, tick: int, events: Array, rng: RandomNumberGenerator, balance: Dictionary, ctx: Dictionary = {}) -> void:
	var skill: Dictionary = caster.get("skill", {})
	if skill.is_empty():
		return
	var star: int = int(caster.get("star", 1))
	var base_arr: Array = skill.get("base_damage", [100])
	var base: float = float(base_arr[clampi(star - 1, 0, base_arr.size() - 1)])
	var stype: String = String(skill.get("type", "damage"))
	var dtype: String = String(skill.get("damage_type", "magic"))
	var raw := base
	if dtype == "magic":
		raw = base * (1.0 + float(caster.get("ap", 0)) / 100.0)
	var mods: Dictionary = caster.get("mods", {})
	var hit_targets: Array = []
	if stype == "shield":
		var amount := base
		if tick >= int(balance.get("overtime_after_ticks", 900)):
			amount *= 0.5
		caster["shield"] = float(caster.get("shield", 0.0)) + amount
		for al in allies:
			if bool(al.get("alive", false)) and int(al.get("iid", -1)) != int(caster.get("iid", -1)) and M1Hex.hex_distance(int(caster.get("idx", 0)), int(al.get("idx", 0))) <= 1:
				al["shield"] = float(al.get("shield", 0.0)) + amount
		events.append({"t": tick, "k": "skill_cast", "a": caster.get("iid", -1), "s": skill.get("skill_id", ""), "dmg": int(amount)})
	else:
		var tgt := _select_target(caster, enemies)
		if tgt.is_empty():
			return
		var targets: Array = [tgt]
		if stype == "aoe":
			for e in enemies:
				if int(e.get("iid", -1)) != int(tgt.get("iid", -1)) and bool(e.get("alive", false)) and M1Hex.hex_distance(int(tgt.get("idx", 0)), int(e.get("idx", 0))) <= 1:
					targets.append(e)
		for t2 in targets:
			_apply_damage(caster, t2, raw, dtype, tick, events, rng, balance, false, ctx)
			# STRATEGIST 6: skill shreds target armor/MR 20% for 4s.
			if float(mods.get("shred_pct", 0.0)) > 0.0:
				t2["shred_armor"] = float(t2.get("armor", 0)) * float(mods["shred_pct"])
				t2["shred_mr"] = float(t2.get("mr", 0)) * float(mods["shred_pct"])
				t2["shred_until_tick"] = tick + int(float(mods.get("shred_duration_sec", 4.0)) * 20.0)
			hit_targets.append(t2)
		events.append({"t": tick, "k": "skill_cast", "a": caster.get("iid", -1), "s": skill.get("skill_id", ""), "dmg": int(raw)})
	caster["mana"] = 0.0
	caster["skill_casts"] = int(caster.get("skill_casts", 0)) + 1
	# ---- M3 Karma Bonds on skill cast.
	if ctx.is_empty():
		return
	var bonds: Array = _side_bonds(ctx, int(caster.get("side", 0)))
	# bond_tri_thuc (tier 2): a member's cast restores 5 mana to all allies.
	var g9 := _find_group(bonds, "ON_CAST_SKILL", "cast_mana_restore")
	if not g9.is_empty() and _is_member(Dictionary(g9["bond"]), String(caster.get("unit_id", ""))):
		var restore: float = float(Dictionary(g9["group"]).get("effect", {}).get("cast_mana_restore", 0))
		for al in allies:
			if bool(al.get("alive", false)):
				_gain_mana(al, restore, tick, false, balance)
		_karma_event(events, tick, String(Dictionary(g9["bond"]).get("bond_id", "")), int(caster.get("iid", -1)), -1)
	# bond_bien_va_song: a member's cast gives allied Archers +20% attack
	# speed for 4s; at tier 3 the skill's targets are also stunned 0.8s.
	var g3 := _find_group(bonds, "ON_CAST_SKILL", "archer_aspd_pct")
	if not g3.is_empty() and _is_member(Dictionary(g3["bond"]), String(caster.get("unit_id", ""))):
		var eff3: Dictionary = Dictionary(g3["group"]).get("effect", {})
		for al in allies:
			if bool(al.get("alive", false)) and String(al.get("class", "")) == "ARCHER":
				al["aspd_buff_pct"] = float(eff3.get("archer_aspd_pct", 0.0))
				al["aspd_buff_until_tick"] = tick + int(float(eff3.get("archer_aspd_duration_sec", 4.0)) * 20.0)
		if float(eff3.get("stun_duration_sec", 0.0)) > 0.0:
			for ht in hit_targets:
				if not bool(ht.get("alive", false)):
					continue
				# bond_cach_mang (tier 3): members are immune to the first CC.
				if bool(ht.get("cc_immune", false)) and not bool(ht.get("cc_immune_used", false)):
					ht["cc_immune_used"] = true
					continue
				ht["stun_until_tick"] = tick + int(float(eff3["stun_duration_sec"]) * 20.0)
		_karma_event(events, tick, String(Dictionary(g3["bond"]).get("bond_id", "")), int(caster.get("iid", -1)), -1)

# side_a_defs / side_b_defs: arrays of unit def dicts as built by M1Match
# (each has stats, skill, star, idx). Returns winner 0/1/-1 (draw), ticks,
# events, survivors per side.
static func run_combat(side_a_defs: Array, side_b_defs: Array, seed: int, balance: Dictionary) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var tick_hz: int = int(balance.get("tick_hz", 20))
	var overtime_tick: int = int(balance.get("overtime_after_ticks", 900))
	var max_ticks := 1500
	var combatants: Array = []
	var iid := 0
	for d in side_a_defs:
		combatants.append(d)
	for d in side_b_defs:
		combatants.append(d)
	# combatants arrive as ready-made dicts from make_combatant (with iid set).
	var side_a: Array = []
	var side_b: Array = []
	for c in combatants:
		if int(c.get("side", 0)) == 0:
			side_a.append(c)
		else:
			side_b.append(c)
	# Fixed turn order: side A by idx, then side B by idx (deterministic).
	var order: Array = []
	order.append_array(side_a)
	order.append_array(side_b)
	var events: Array = []
	# M3 Karma Bonds: each side's defs carry its active bonds ("bonds" key,
	# set by the match builder); defs without it fight bond-free.
	var bonds_a: Array = []
	var bonds_b: Array = []
	if not side_a.is_empty():
		bonds_a = side_a[0].get("bonds", [])
	if not side_b.is_empty():
		bonds_b = side_b[0].get("bonds", [])
	var ctx := {"side_a": side_a, "side_b": side_b, "bonds_a": bonds_a, "bonds_b": bonds_b}
	# bond_tri_thuc (tier 3): each member's first skill casts at second 5.
	var first_cast_tick := -1
	for bset in [bonds_a, bonds_b]:
		var gf := _find_group(bset, "ON_BATTLE_START", "first_cast_at_sec")
		if not gf.is_empty():
			first_cast_tick = int(float(Dictionary(Dictionary(gf["group"]).get("effect", {})).get("first_cast_at_sec", 5.0)) * 20.0)
	# ASSASSIN tick-0 jump to the backline (SRS 5.3).
	for c in order:
		if String(c.get("class", "")) != "ASSASSIN" or not bool(c.get("alive", false)):
			continue
		var foes: Array = side_b if int(c.get("side", 0)) == 0 else side_a
		var far: Dictionary = {}
		var best_score := -999
		for e in foes:
			if not bool(e.get("alive", false)):
				continue
			var r := M1Hex.index_to_row(int(e.get("idx", 0)))
			# Side 0 attacks upward: farthest row is the largest row.
			# Side 1 attacks downward: farthest row is the smallest row.
			var score := r if int(c.get("side", 0)) == 0 else -r
			if far.is_empty() or score > best_score:
				far = e
				best_score = score
		if far.is_empty():
			continue
		var occupied := {}
		for o in order:
			if bool(o.get("alive", false)):
				occupied[int(o.get("idx", 0))] = true
		var best_cell := -1
		for nb in M1Hex.neighbors(int(far.get("idx", 0))):
			if not occupied.has(nb):
				best_cell = nb
				break
		if best_cell >= 0:
			c["idx"] = best_cell
			events.append({"t": 0, "k": "assassin_jump", "a": c.get("iid", -1), "b": far.get("iid", -1), "cell": best_cell})
	var winner := -1
	var ticks := 0
	for tick in range(max_ticks):
		ticks = tick
		# Win check at tick start.
		var alive_a := 0
		var alive_b := 0
		for c in side_a:
			if bool(c.get("alive", false)):
				alive_a += 1
		for c in side_b:
			if bool(c.get("alive", false)):
				alive_b += 1
		if alive_a == 0 and alive_b == 0:
			winner = -1
			break
		if alive_a == 0:
			winner = 1
			break
		if alive_b == 0:
			winner = 0
			break
		var overtime := tick >= overtime_tick
		# bond_mat_troi (tier 3): crit burn ticks (2% max HP/sec, 3s).
		for c in order:
			if not bool(c.get("alive", false)):
				continue
			if tick >= int(c.get("burn_until_tick", -1)) or float(c.get("burn_per_sec", 0.0)) <= 0.0:
				continue
			c["burn_acc"] = float(c.get("burn_acc", 0.0)) + float(c.get("burn_per_sec", 0.0)) / 20.0
			if float(c.get("burn_acc", 0.0)) >= 1.0:
				var bdmg := int(c["burn_acc"])
				c["burn_acc"] = float(c.get("burn_acc", 0.0)) - float(bdmg)
				c["hp"] = float(c.get("hp", 0)) - float(bdmg)
				events.append({"t": tick, "k": "damage", "a": int(c.get("burn_source_iid", -1)), "b": int(c.get("iid", -1)), "dmg": bdmg, "hp": int(maxi(0, int(c.get("hp", 0))))})
				if float(c.get("hp", 0)) <= 0.0:
					c["alive"] = false
					c["hp"] = 0.0
					events.append({"t": tick, "k": "death", "a": int(c.get("iid", -1)), "b": int(c.get("burn_source_iid", -1))})
					_on_unit_death(c, {}, tick, events, ctx)
		# bond_tri_thuc (tier 3): each member's first skill casts at second 5.
		if tick == first_cast_tick:
			for c in order:
				if not bool(c.get("alive", false)) or int(c.get("skill_casts", 0)) > 0 or Dictionary(c.get("skill", {})).is_empty():
					continue
				var gfc := _find_group(_side_bonds(ctx, int(c.get("side", 0))), "ON_BATTLE_START", "first_cast_at_sec")
				if gfc.is_empty() or not _is_member(Dictionary(gfc["bond"]), String(c.get("unit_id", ""))):
					continue
				c["mana"] = float(c.get("max_mana", 100))
				_karma_event(events, tick, String(Dictionary(gfc["bond"]).get("bond_id", "")), int(c.get("iid", -1)), -1)
		# Overtime damage pulse every 40 ticks (SRS 9.1).
		if overtime and tick > overtime_tick and (tick - overtime_tick) % 40 == 0:
			var blocks := (tick - overtime_tick) / 40
			var pct := 0.05 + 0.01 * float(blocks)
			for c in order:
				if bool(c.get("alive", false)):
					c["hp"] = float(c.get("hp", 0)) - float(c.get("hp_max", 1)) * pct
					if float(c.get("hp", 0)) <= 0.0:
						c["alive"] = false
						c["hp"] = 0.0
						events.append({"t": tick, "k": "death", "a": c.get("iid", -1), "b": -1})
						_on_unit_death(c, {}, tick, events, ctx)
		for c in order:
			if not bool(c.get("alive", false)):
				continue
			# Stunned (bond_bien_va_song tier 3): skip the whole turn.
			if tick < int(c.get("stun_until_tick", -1)):
				continue
			var foes: Array = side_b if int(c.get("side", 0)) == 0 else side_a
			var friends: Array = side_a if int(c.get("side", 0)) == 0 else side_b
			# Skill first (SRS 5.2: cast at next tick before basic attack).
			if float(c.get("mana", 0)) >= float(c.get("max_mana", 100)) and not Dictionary(c.get("skill", {})).is_empty():
				_cast_skill(c, foes, friends, tick, events, rng, balance, ctx)
				continue
			var tgt: Dictionary = {}
			var tid: int = int(c.get("target_iid", -1))
			if tid >= 0:
				for e in foes:
					if int(e.get("iid", -1)) == tid and bool(e.get("alive", false)):
						tgt = e
						break
			if tgt.is_empty():
				tgt = _select_target(c, foes)
				if tgt.is_empty():
					continue
				c["target_iid"] = int(tgt.get("iid", -1))
			var dist := M1Hex.hex_distance(int(c.get("idx", 0)), int(tgt.get("idx", 0)))
			if dist <= int(c.get("range", 1)):
				var interval: float = float(tick_hz) / maxf(0.1, _effective_aspd(c, tick))
				if overtime:
					interval *= 2.0 / 3.0
				if float(c.get("atk_cd", 0.0)) <= 0.0:
					_basic_attack(c, tgt, foes, tick, events, rng, balance, ctx)
					c["atk_cd"] = interval
					# ARCHER 6 extra target: second nearest enemy in range.
					var mods2: Dictionary = c.get("mods", {})
					if int(mods2.get("extra_target_every", 0)) > 0 and int(c.get("attack_count", 0)) % int(mods2["extra_target_every"]) == 0:
						var second := _select_target(c, _foes_except(foes, tgt))
						if not second.is_empty() and M1Hex.hex_distance(int(c.get("idx", 0)), int(second.get("idx", 0))) <= int(c.get("range", 1)):
							_apply_damage(c, second, _effective_atk(c, tick), "physical", tick, events, rng, balance, true, ctx)
				else:
					c["atk_cd"] = float(c.get("atk_cd", 0.0)) - 1.0
			else:
				if int(c.get("move_cd", 0)) <= 0:
					var blocked := {}
					for o in order:
						if o != c and bool(o.get("alive", false)):
							blocked[int(o.get("idx", 0))] = true
					var step := M1Hex.bfs_step_toward(int(c.get("idx", 0)), int(tgt.get("idx", 0)), int(c.get("range", 1)), blocked)
					if step >= 0:
						c["idx"] = step
						events.append({"t": tick, "k": "move", "a": c.get("iid", -1), "cell": step})
					c["move_cd"] = int(balance.get("move_ticks_per_hex", 10))
				else:
					c["move_cd"] = int(c.get("move_cd", 0)) - 1
		# DIVINE 6: a Divine that just died explodes (300 true damage, 1 hex).
		for c in order:
			if not bool(c.get("alive", false)) and not bool(c.get("exploded", false)) and float(Dictionary(c.get("mods", {})).get("death_explosion_true_damage", 0)) > 0.0:
				c["exploded"] = true
				var dmg: float = float(Dictionary(c.get("mods", {})).get("death_explosion_true_damage", 0))
				var foes2: Array = side_b if int(c.get("side", 0)) == 0 else side_a
				for e in foes2:
					if bool(e.get("alive", false)) and M1Hex.hex_distance(int(c.get("idx", 0)), int(e.get("idx", 0))) <= 1:
						e["hp"] = float(e.get("hp", 0)) - dmg
						events.append({"t": tick, "k": "damage", "a": c.get("iid", -1), "b": e.get("iid", -1), "dmg": int(dmg), "hp": int(maxi(0, int(e.get("hp", 0))))})
						if float(e.get("hp", 0)) <= 0.0:
							e["alive"] = false
							e["hp"] = 0.0
							events.append({"t": tick, "k": "death", "a": e.get("iid", -1), "b": c.get("iid", -1)})
							_on_unit_death(e, c, tick, events, ctx)
	if winner < 0:
		# Cap reached: side with the higher total HP fraction wins.
		var fa := 0.0
		var fb := 0.0
		for c in side_a:
			fa += float(c.get("hp", 0)) / maxf(1.0, float(c.get("hp_max", 1)))
		for c in side_b:
			fb += float(c.get("hp", 0)) / maxf(1.0, float(c.get("hp_max", 1)))
		if fa > fb:
			winner = 0
		elif fb > fa:
			winner = 1
		else:
			winner = -1
	var surv_a := 0
	var surv_b := 0
	for c in side_a:
		if bool(c.get("alive", false)):
			surv_a += 1
	for c in side_b:
		if bool(c.get("alive", false)):
			surv_b += 1
	return {"winner": winner, "ticks": ticks, "events": events, "survivors_a": surv_a, "survivors_b": surv_b}
