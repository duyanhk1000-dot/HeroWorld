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
static func _apply_damage(src: Dictionary, dst: Dictionary, raw: float, dmg_type: String, tick: int, events: Array, rng: RandomNumberGenerator, balance: Dictionary, is_basic: bool) -> int:
	var defense := _effective_armor(dst, tick) if dmg_type == "physical" else _effective_mr(dst, tick)
	var dmg := _mitigate(raw, defense)
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
	if dealt > 0:
		_gain_mana(src, float(balance.get("mana_on_hit", 10)), tick, false, balance)
		_gain_mana(dst, float(balance.get("mana_on_being_hit", 7)), tick, true, balance)
	events.append({"t": tick, "k": "damage", "a": src.get("iid", -1), "b": dst.get("iid", -1), "dmg": dmg, "hp": int(maxi(0, int(dst.get("hp", 0))))})
	if float(dst.get("hp", 0)) <= 0.0 and bool(dst.get("alive", false)):
		dst["alive"] = false
		dst["hp"] = 0.0
		events.append({"t": tick, "k": "death", "a": dst.get("iid", -1), "b": src.get("iid", -1)})
		# DIVINE 6 explosion is handled by the run loop (it scans for newly
		# dead Divines each tick), not here.
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

static func _basic_attack(att: Dictionary, tgt: Dictionary, tick: int, events: Array, rng: RandomNumberGenerator, balance: Dictionary) -> void:
	att["attack_count"] = int(att.get("attack_count", 0)) + 1
	var mods: Dictionary = att.get("mods", {})
	# Dodge: basic attacks only, base 0% (SRS 5.2).
	var dodge_chance := 0.0
	if rng.randf() < dodge_chance:
		events.append({"t": tick, "k": "dodge", "a": att.get("iid", -1), "b": tgt.get("iid", -1)})
		return
	var raw: float = float(att.get("atk", 0))
	var crit_chance: float = minf(1.0, float(balance.get("crit_chance_base", 0.25)) + float(mods.get("crit", 0.0)))
	var is_crit := rng.randf() < crit_chance
	if is_crit:
		raw *= float(balance.get("crit_damage_base", 1.40)) + float(mods.get("crit_dmg", 0.0))
	# ASSASSIN 6: +30% damage in the first 3 seconds.
	var early_sec: float = float(mods.get("early_seconds", 0.0))
	if early_sec > 0.0 and tick < int(early_sec * 20.0):
		raw *= 1.0 + float(mods.get("early_dmg_pct", 0.0))
	# WARRIOR 6: attacks deal +5% of target current HP.
	if float(mods.get("max_hp_damage_pct", 0.0)) > 0.0:
		raw += float(tgt.get("hp", 0)) * float(mods["max_hp_damage_pct"])
	_apply_damage(att, tgt, raw, "physical", tick, events, rng, balance, true)
	# ARCHER 6: every 3rd attack hits an extra target in range.
	if int(mods.get("extra_target_every", 0)) > 0 and int(att.get("attack_count", 0)) % int(mods["extra_target_every"]) == 0:
		events.append({"t": tick, "k": "extra_shot", "a": att.get("iid", -1), "b": tgt.get("iid", -1)})

static func _cast_skill(caster: Dictionary, enemies: Array, allies: Array, tick: int, events: Array, rng: RandomNumberGenerator, balance: Dictionary) -> void:
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
			_apply_damage(caster, t2, raw, dtype, tick, events, rng, balance, false)
			# STRATEGIST 6: skill shreds target armor/MR 20% for 4s.
			if float(mods.get("shred_pct", 0.0)) > 0.0:
				t2["shred_armor"] = float(t2.get("armor", 0)) * float(mods["shred_pct"])
				t2["shred_mr"] = float(t2.get("mr", 0)) * float(mods["shred_pct"])
				t2["shred_until_tick"] = tick + int(float(mods.get("shred_duration_sec", 4.0)) * 20.0)
		events.append({"t": tick, "k": "skill_cast", "a": caster.get("iid", -1), "s": skill.get("skill_id", ""), "dmg": int(raw)})
	caster["mana"] = 0.0
	caster["skill_casts"] = int(caster.get("skill_casts", 0)) + 1

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
		for c in order:
			if not bool(c.get("alive", false)):
				continue
			var foes: Array = side_b if int(c.get("side", 0)) == 0 else side_a
			var friends: Array = side_a if int(c.get("side", 0)) == 0 else side_b
			# Skill first (SRS 5.2: cast at next tick before basic attack).
			if float(c.get("mana", 0)) >= float(c.get("max_mana", 100)) and not Dictionary(c.get("skill", {})).is_empty():
				_cast_skill(c, foes, friends, tick, events, rng, balance)
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
				var interval: float = float(tick_hz) / maxf(0.1, float(c.get("aspd", 0.7)))
				if overtime:
					interval *= 2.0 / 3.0
				if float(c.get("atk_cd", 0.0)) <= 0.0:
					_basic_attack(c, tgt, tick, events, rng, balance)
					c["atk_cd"] = interval
					# ARCHER 6 extra target: second nearest enemy in range.
					var mods2: Dictionary = c.get("mods", {})
					if int(mods2.get("extra_target_every", 0)) > 0 and int(c.get("attack_count", 0)) % int(mods2["extra_target_every"]) == 0:
						var second := _select_target(c, _foes_except(foes, tgt))
						if not second.is_empty() and M1Hex.hex_distance(int(c.get("idx", 0)), int(second.get("idx", 0))) <= int(c.get("range", 1)):
							_apply_damage(c, second, float(c.get("atk", 0)), "physical", tick, events, rng, balance, true)
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
