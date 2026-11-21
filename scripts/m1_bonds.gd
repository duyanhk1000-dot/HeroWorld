extends RefCounted

# M3 - Karma Bonds engine, SRS v2.1 section 7 + Appendix B.2.
# Data-driven: data/karma_bonds.json. A bond activates when enough distinct
# members stand ON BOARD (bench does not count, same as synergy).
#
# Merging rule (M3 interpretation of SRS 7.3, see docs/m1-notes.md): for
# each (trigger, scope) group, the effects of all met thresholds merge
# per key, the higher threshold winning per key. So bond_co_sac shield goes
# 10% -> 20% at tier 3 (not 30%), while bond_sam_set keeps chain lightning
# and gains +20% AP at tier 3.
#
# Static effect keys (folded into unit mods at combatant creation):
#   atk_pct, hp_pct, aspd_pct, ap_pct, all_pct, armor, mr, dodge_pct,
#   team_atk_pct (-> atk_pct), team_ap_pct (-> ap_pct), team_crit (-> crit),
#   low_hp_aspd_pct, low_hp_damage_taken_pct, cc_immune_first,
#   kill_atk_pct, kill_atk_max_stacks,
#   crit_burn_pct, crit_burn_duration_sec,
#   chain_targets, chain_damage_ratio, mr_shred_percent, mr_shred_duration_sec,
#   dodge_next_crit.
# Runtime effect keys (read by the sim from the side's active-bond groups at
# trigger time): archer_aspd_pct, archer_aspd_duration_sec, stun_duration_sec,
# cast_mana_restore, first_cast_at_sec, death_shield_pct, death_atk_pct,
# death_atk_duration_sec, death_heal_pct. rival_win_damage is match-level
# (handled in m1_match.gd / BattleRoom), not by the sim.

const STATIC_KEYS := [
	"atk_pct", "hp_pct", "aspd_pct", "ap_pct", "all_pct", "armor", "mr",
	"dodge_pct", "low_hp_aspd_pct", "low_hp_damage_taken_pct",
	"cc_immune_first", "kill_atk_pct", "kill_atk_max_stacks",
	"crit_burn_pct", "crit_burn_duration_sec",
	"chain_targets", "chain_damage_ratio", "mr_shred_percent", "mr_shred_duration_sec",
	"dodge_next_crit",
	"team_atk_pct", "team_ap_pct", "team_crit",
]

# board_unit_ids: Array of unit_id strings on board (distinct counting is
# done here; duplicates do not count twice).
# Returns Array of active bonds:
#   {bond_id, name, bond_type, count, threshold, members_on_board,
#    groups: [{trigger, scope, effect}]}
static func active_bonds(board_unit_ids: Array, bonds_data: Dictionary) -> Array:
	var on_board := {}
	for uid in board_unit_ids:
		on_board[String(uid)] = true
	var out: Array = []
	for b in bonds_data.get("bonds", []):
		var members: Array = b.get("members", [])
		var present: Array = []
		for m in members:
			if on_board.has(String(m)):
				present.append(String(m))
		var count := present.size()
		var thresholds: Array = b.get("thresholds", [])
		var met: Array = []
		var highest := 0
		for th in thresholds:
			if count >= int(th.get("count", 99)):
				met.append(th)
				highest = maxi(highest, int(th.get("count", 0)))
		if met.is_empty():
			continue
		# Merge met thresholds per (trigger, scope) group, per key, higher
		# threshold winning. Thresholds are listed ascending in the data.
		var groups := {}
		for th in met:
			var key := "%s|%s" % [String(th.get("trigger", "")), String(th.get("scope", ""))]
			if not groups.has(key):
				groups[key] = {"trigger": String(th.get("trigger", "")), "scope": String(th.get("scope", "")), "effect": {}}
			var eff: Dictionary = th.get("effect", {})
			var merged: Dictionary = groups[key]["effect"]
			for k in eff.keys():
				merged[k] = eff[k]
		out.append({
			"bond_id": String(b.get("bond_id", "")), "name": String(b.get("name", "")),
			"bond_type": String(b.get("bond_type", "")), "count": count,
			"threshold": highest, "members_on_board": present,
			"groups": groups.values(),
		})
	return out

# Fold static bond effects into unit_mods (aligned with board_units).
# board_units: Array of unit dicts {unit_id, nation_id, class_id}.
static func apply_static_mods(board_units: Array, active: Array, unit_mods: Array) -> void:
	for bond in active:
		for g in bond.get("groups", []):
			var scope: String = String(g.get("scope", ""))
			var eff: Dictionary = g.get("effect", {})
			var members_on_board: Array = bond.get("members_on_board", [])
			for i in range(board_units.size()):
				if i >= unit_mods.size():
					break
				var u: Dictionary = board_units[i]
				var uid: String = String(u.get("unit_id", ""))
				var applies := false
				if scope == "ALL_ALLIES":
					applies = true
				elif scope == "BOND_MEMBERS" or scope == "SELF":
					applies = members_on_board.has(uid)
				if not applies:
					continue
				var m: Dictionary = unit_mods[i]
				for k in STATIC_KEYS:
					if not eff.has(k):
						continue
					var v = eff[k]
					match k:
						"team_atk_pct":
							m["atk_pct"] = float(m.get("atk_pct", 0.0)) + float(v)
						"team_ap_pct":
							m["ap_pct"] = float(m.get("ap_pct", 0.0)) + float(v)
						"team_crit":
							m["crit"] = float(m.get("crit", 0.0)) + float(v)
						"armor", "mr", "chain_targets", "kill_atk_max_stacks":
							m[k] = int(m.get(k, 0)) + int(v)
						"cc_immune_first", "dodge_next_crit":
							m[k] = bool(v)
						_:
							m[k] = float(m.get(k, 0.0)) + float(v)

# First merged group of an active bond with this trigger ("" = any).
static func group_for_trigger(bond: Dictionary, trigger: String) -> Dictionary:
	for g in bond.get("groups", []):
		if trigger == "" or String(g.get("trigger", "")) == trigger:
			return g
	return {}

# Active bond whose merged effect contains this key (first match).
static func bond_with_effect_key(active: Array, key: String) -> Dictionary:
	for bond in active:
		for g in bond.get("groups", []):
			if Dictionary(g.get("effect", {})).has(key):
				return bond
	return {}

# Human-readable one-liners for the GUI synergy panel.
static func describe_active(active: Array) -> Array:
	var lines: Array = []
	for bond in active:
		lines.append("%s (%d/%d): %s" % [
			String(bond.get("name", "?")), int(bond.get("count", 0)),
			int(bond.get("threshold", 0)), String(bond.get("bond_type", ""))])
	return lines

# Bonds one member short of their lowest threshold (for the GUI panel).
static func one_away(board_unit_ids: Array, bonds_data: Dictionary) -> Array:
	var on_board := {}
	for uid in board_unit_ids:
		on_board[String(uid)] = true
	var out: Array = []
	for b in bonds_data.get("bonds", []):
		var members: Array = b.get("members", [])
		var present := 0
		var missing := ""
		for m in members:
			if on_board.has(String(m)):
				present += 1
			else:
				missing = String(m)
		var thresholds: Array = b.get("thresholds", [])
		if thresholds.is_empty():
			continue
		var lowest := int(thresholds[0].get("count", 99))
		if present == lowest - 1 and present > 0:
			out.append({"bond_id": String(b.get("bond_id", "")), "name": String(b.get("name", "")),
				"count": present, "need": lowest, "missing": missing})
	return out
