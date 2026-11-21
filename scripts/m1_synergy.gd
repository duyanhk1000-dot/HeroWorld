extends RefCounted

# M1 - Synergy engine, SRS v2.1 section 6.
# Counts only distinct unit_ids ON BOARD, thresholds 2/4/6 for nation and class.
# Effects are read from balance_config.json ("synergy"), not hard-coded.

static func _tier(count: int, thresholds: Array) -> int:
	var t := 0
	for th in thresholds:
		if count >= int(th):
			t = int(th)
	return t

static func _empty_mods() -> Dictionary:
	return {
		"hp_pct": 0.0, "atk_pct": 0.0, "aspd_pct": 0.0, "ap_pct": 0.0,
		"armor": 0, "mr": 0, "crit": 0.0, "crit_dmg": 0.0, "range_bonus": 0,
		"start_mana": 0, "lifesteal": 0.0, "all_pct": 0.0,
		"shield_pct_hp": 0.0, "max_hp_damage_pct": 0.0,
		"early_dmg_pct": 0.0, "early_seconds": 0.0,
		"extra_target_every": 0, "first_skill_bonus_mana": 0,
		"mana_regen_pct": 0.0, "shred_pct": 0.0, "shred_duration_sec": 0.0,
		"death_explosion_true_damage": 0,
		# M3 Karma Bonds static keys (scripts/m1_bonds.gd).
		"dodge": 0.0, "dodge_next_crit": false,
		"low_hp_aspd_pct": 0.0, "low_hp_damage_taken_pct": 0.0,
		"cc_immune_first": false,
		"kill_atk_pct": 0.0, "kill_atk_max_stacks": 0,
		"crit_burn_pct": 0.0, "crit_burn_duration_sec": 0.0,
		"chain_targets": 0, "chain_damage_ratio": 0.0,
		"mr_shred_percent": 0.0, "mr_shred_duration_sec": 0.0,
	}

# board_units: Array of unit dicts {unit_id, nation_id, class_id} on board.
# Returns {nation_levels, class_levels, unit_mods: Array aligned with board_units,
#          team_armor, team_mr}
static func compute(board_units: Array, balance: Dictionary) -> Dictionary:
	var thresholds: Array = balance.get("synergy_thresholds", [2, 4, 6])
	var syn: Dictionary = balance.get("synergy", {})
	var nation_counts := {}
	var class_counts := {}
	var seen := {}
	for u in board_units:
		var uid: String = u.get("unit_id", "")
		if uid == "" or seen.has(uid):
			continue
		seen[uid] = true
		var n: String = u.get("nation_id", "")
		var c: String = u.get("class_id", "")
		nation_counts[n] = int(nation_counts.get(n, 0)) + 1
		class_counts[c] = int(class_counts.get(c, 0)) + 1
	var nation_levels := {}
	for k in nation_counts.keys():
		nation_levels[k] = _tier(int(nation_counts[k]), thresholds)
	var class_levels := {}
	for k in class_counts.keys():
		class_levels[k] = _tier(int(class_counts[k]), thresholds)

	var team_armor := 0
	var team_mr := 0
	var nation_cfg: Dictionary = syn.get("nation", {})
	for k in nation_levels.keys():
		var t: int = nation_levels[k]
		if t <= 0:
			continue
		# Nation effects are applied per-unit below; nothing team-wide here.
		pass
	# Team-wide class effects (GUARDIAN 4: whole team +armor/MR).
	var g_cfg: Dictionary = syn.get("GUARDIAN", {})
	var g_tier: int = int(class_levels.get("GUARDIAN", 0))
	if g_tier >= 4 and g_cfg.has("4"):
		team_armor += int(g_cfg["4"].get("team_armor", 0))
		team_mr += int(g_cfg["4"].get("team_mr", 0))

	var unit_mods: Array = []
	for u in board_units:
		var m := _empty_mods()
		var n: String = u.get("nation_id", "")
		var c: String = u.get("class_id", "")
		var nt: int = int(nation_levels.get(n, 0))
		if nt > 0 and nation_cfg.has(str(nt)):
			var e: Dictionary = nation_cfg[str(nt)]
			m["hp_pct"] += float(e.get("hp_pct", 0.0))
			m["atk_pct"] += float(e.get("atk_pct", 0.0))
			m["aspd_pct"] += float(e.get("aspd_pct", 0.0))
		var ct: int = int(class_levels.get(c, 0))
		if ct > 0:
			var ccfg: Dictionary = syn.get(c, {})
			if ccfg.has(str(ct)):
				var e2: Dictionary = ccfg[str(ct)]
				m["atk_pct"] += float(e2.get("atk_pct", 0.0))
				m["aspd_pct"] += float(e2.get("aspd_pct", 0.0))
				m["ap_pct"] += float(e2.get("ap_pct", 0.0))
				m["crit"] += float(e2.get("crit_pct", 0.0))
				m["crit_dmg"] += float(e2.get("crit_dmg_pct", 0.0))
				m["range_bonus"] += int(e2.get("range_bonus", 0))
				m["start_mana"] += int(e2.get("start_mana", 0))
				m["lifesteal"] += float(e2.get("lifesteal", 0.0))
				m["all_pct"] += float(e2.get("all_pct", 0.0))
				m["shield_pct_hp"] += float(e2.get("shield_pct_hp", 0.0))
				m["max_hp_damage_pct"] += float(e2.get("max_hp_damage_pct", 0.0))
				m["early_dmg_pct"] += float(e2.get("early_dmg_pct", 0.0))
				m["early_seconds"] += float(e2.get("early_seconds", 0.0))
				m["extra_target_every"] += int(e2.get("extra_target_every", 0))
				m["first_skill_bonus_mana"] += int(e2.get("first_skill_bonus_mana", 0))
				m["mana_regen_pct"] += float(e2.get("mana_regen_pct", 0.0))
				m["shred_pct"] += float(e2.get("shred_pct", 0.0))
				m["shred_duration_sec"] += float(e2.get("shred_duration_sec", 0.0))
				m["death_explosion_true_damage"] += int(e2.get("death_explosion_true_damage", 0))
			# GUARDIAN 2: +armor/MR for Guardians themselves.
			if c == "GUARDIAN" and ct == 2 and ccfg.has("2"):
				m["armor"] += int(ccfg["2"].get("armor", 0))
				m["mr"] += int(ccfg["2"].get("mr", 0))
		unit_mods.append(m)
	return {
		"nation_levels": nation_levels,
		"class_levels": class_levels,
		"unit_mods": unit_mods,
		"team_armor": team_armor,
		"team_mr": team_mr,
	}
