extends RefCounted

# M1 - Data-driven loading. All balance numbers live in JSON, never hard-coded
# in logic (SRS v2.1 section 1.2 / Appendix B).
const M1Hex = preload("res://scripts/m1_hex.gd")

static func _load_json(path: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(path)
	if text == "":
		push_error("M1Data: cannot read " + path)
		return {}
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("M1Data: bad JSON in " + path)
		return {}
	return parsed

static func load_all() -> Dictionary:
	return {
		"units": _load_json("res://data/units.json"),
		"balance": _load_json("res://data/balance_config.json"),
		"pve": _load_json("res://data/pve.json"),
		"bonds": _load_json("res://data/karma_bonds.json"),
	}

static func unit_by_id(units_data: Dictionary, unit_id: String) -> Dictionary:
	for u in units_data.get("units", []):
		if u.get("unit_id", "") == unit_id:
			return u
	return {}

static func units_by_cost(units_data: Dictionary, cost: int) -> Array:
	var out: Array = []
	for u in units_data.get("units", []):
		if int(u.get("cost", 0)) == cost:
			out.append(u)
	return out

static func all_unit_ids(units_data: Dictionary) -> Array:
	var out: Array = []
	for u in units_data.get("units", []):
		out.append(u.get("unit_id", ""))
	return out

static func star_multiplier(balance: Dictionary, star: int) -> float:
	return pow(float(balance.get("star_multiplier", 1.8)), float(star - 1))

static func xp_table(balance: Dictionary) -> Array:
	return balance.get("xp_table_cumulative", [0, 2, 6, 10, 20, 36, 56, 80, 108])

static func level_for_xp(balance: Dictionary, xp_total: int) -> int:
	var table := xp_table(balance)
	var level := 1
	for i in range(table.size()):
		if xp_total >= int(table[i]):
			level = i + 1
	return mini(level, int(balance.get("level_cap", 9)))

static func shop_odds(balance: Dictionary, level: int) -> Array:
	var odds_map: Dictionary = balance.get("shop_odds_by_level", {})
	var key := str(clampi(level, 1, 9))
	if odds_map.has(key):
		return odds_map[key]
	return [100, 0, 0, 0, 0]

static func pool_by_cost(balance: Dictionary, cost: int) -> int:
	var m: Dictionary = balance.get("pool_by_cost", {})
	return int(m.get(str(cost), 0))

static func sell_price(balance: Dictionary, cost: int, star: int) -> int:
	# SRS 4.1: 1* = cost; 2* = 3*cost - 1; 3* = 9*cost - 2.
	if star <= 1:
		return cost
	if star == 2:
		return 3 * cost - 1
	return 9 * cost - 2
