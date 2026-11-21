extends RefCounted

# M1 - Economy / shop / pool / level, SRS v2.1 section 4.
# All numbers come from balance_config.json. One shared pool per room.
const M1Data = preload("res://scripts/m1_data.gd")

static func new_pool(units_data: Dictionary, balance: Dictionary) -> Dictionary:
	var pool := {}
	for u in units_data.get("units", []):
		pool[u.get("unit_id", "")] = M1Data.pool_by_cost(balance, int(u.get("cost", 1)))
	return pool

static func new_player(pid: int, pname: String, is_human: bool, balance: Dictionary) -> Dictionary:
	var board: Array = []
	board.resize(56)
	for i in range(56):
		board[i] = null
	return {
		"id": pid, "name": pname, "is_human": is_human, "alive": true,
		"hp": int(balance.get("start_hp", 100)),
		"gold": int(balance.get("start_gold", 5)),
		"level": int(balance.get("start_level", 1)), "xp_total": 0,
		"board": board, "bench": [], "shop": ["", "", "", "", ""],
		"lock_shop": false, "streak": 0, "streak_result": "",
		"wins": 0, "losses": 0, "eliminated_round": 0, "rank": 0,
		"last_opponent": -1,
	}

static func board_units(player: Dictionary) -> Array:
	var out: Array = []
	for u in player.get("board", []):
		if u != null:
			out.append(u)
	return out

static func board_count(player: Dictionary) -> int:
	return board_units(player).size()

static func _roll_one_tier(rng: RandomNumberGenerator, odds: Array) -> int:
	var roll := rng.randi_range(1, 100)
	var acc := 0
	for i in range(odds.size()):
		acc += int(odds[i])
		if roll <= acc:
			return i + 1
	return 1

# Roll one shop slot: pick a cost tier by level odds, then a random unit of
# that cost with pool remaining. Falls back to other tiers if the tier is dry.
static func _draw_unit_id(units_data: Dictionary, pool: Dictionary, rng: RandomNumberGenerator, odds: Array) -> String:
	var tier := _roll_one_tier(rng, odds)
	for attempt in range(5):
		var t := tier if attempt == 0 else (attempt % 5) + 1
		var cands: Array = []
		for u in M1Data.units_by_cost(units_data, t):
			var uid: String = u.get("unit_id", "")
			if int(pool.get(uid, 0)) > 0:
				cands.append(uid)
		if cands.size() > 0:
			return cands[rng.randi_range(0, cands.size() - 1)]
	return ""

static func roll_shop(player: Dictionary, units_data: Dictionary, pool: Dictionary, rng: RandomNumberGenerator, balance: Dictionary, free: bool) -> bool:
	if not free:
		var cost: int = int(balance.get("reroll_cost", 2))
		if int(player.get("gold", 0)) < cost:
			return false
		player["gold"] = int(player["gold"]) - cost
	var odds := M1Data.shop_odds(balance, int(player.get("level", 1)))
	var shop: Array = []
	for i in range(5):
		shop.append(_draw_unit_id(units_data, pool, rng, odds))
	player["shop"] = shop
	return true

static func buy_shop_slot(player: Dictionary, units_data: Dictionary, pool: Dictionary, slot: int, balance: Dictionary) -> bool:
	var shop: Array = player.get("shop", [])
	if slot < 0 or slot >= shop.size():
		return false
	var uid: String = shop[slot]
	if uid == "":
		return false
	var def := M1Data.unit_by_id(units_data, uid)
	if def.is_empty():
		return false
	var cost := int(def.get("cost", 1))
	if int(player.get("gold", 0)) < cost:
		return false
	if int(pool.get(uid, 0)) <= 0:
		return false
	if (player.get("bench", []) as Array).size() >= 9:
		return false
	player["gold"] = int(player["gold"]) - cost
	pool[uid] = int(pool[uid]) - 1
	shop[slot] = ""
	player["bench"].append({"unit_id": uid, "star": 1})
	try_star_up(player)
	return true

static func buy_xp(player: Dictionary, balance: Dictionary) -> bool:
	var cost: int = int(balance.get("xp_buy_cost", 4))
	if int(player.get("gold", 0)) < cost:
		return false
	if int(player.get("level", 1)) >= int(balance.get("level_cap", 9)):
		return false
	player["gold"] = int(player["gold"]) - cost
	player["xp_total"] = int(player.get("xp_total", 0)) + int(balance.get("xp_buy_amount", 4))
	player["level"] = M1Data.level_for_xp(balance, int(player["xp_total"]))
	return true

static func gain_round_xp(player: Dictionary, balance: Dictionary) -> void:
	player["xp_total"] = int(player.get("xp_total", 0)) + 2
	player["level"] = M1Data.level_for_xp(balance, int(player["xp_total"]))

static func sell_unit(player: Dictionary, pool: Dictionary, zone: String, index: int, units_data: Dictionary, balance: Dictionary) -> bool:
	var unit: Dictionary = {}
	if zone == "BENCH":
		var bench: Array = player.get("bench", [])
		if index < 0 or index >= bench.size():
			return false
		unit = bench[index]
		bench.remove_at(index)
	elif zone == "BOARD":
		var board: Array = player.get("board", [])
		if index < 0 or index >= board.size() or board[index] == null:
			return false
		unit = board[index]
		board[index] = null
	else:
		return false
	if unit.is_empty():
		return false
	var def := M1Data.unit_by_id(units_data, String(unit.get("unit_id", "")))
	var price := M1Data.sell_price(balance, int(def.get("cost", 1)), int(unit.get("star", 1)))
	player["gold"] = int(player.get("gold", 0)) + price
	pool[String(unit.get("unit_id", ""))] = int(pool.get(String(unit.get("unit_id", "")), 0)) + 1
	return true

# 3 copies of the same unit_id at the same star -> one unit of star+1.
# Prefers keeping the upgraded unit on the board when any copy was there.
static func try_star_up(player: Dictionary) -> void:
	var all: Array = []
	for u in player.get("bench", []):
		all.append({"unit": u, "zone": "BENCH", "index": -1})
	var board: Array = player.get("board", [])
	for i in range(board.size()):
		if board[i] != null:
			all.append({"unit": board[i], "zone": "BOARD", "index": i})
	var groups := {}
	for entry in all:
		var u: Dictionary = entry["unit"]
		var key := "%s_%d" % [String(u.get("unit_id", "")), int(u.get("star", 1))]
		if not groups.has(key):
			groups[key] = []
		groups[key].append(entry)
	for key in groups.keys():
		var entries: Array = groups[key]
		var star: int = int(entries[0]["unit"].get("star", 1))
		if entries.size() >= 3 and star < 3:
			var uid: String = String(entries[0]["unit"].get("unit_id", ""))
			var was_on_board := -1
			var removed := 0
			var bench: Array = player.get("bench", [])
			for i in range(bench.size() - 1, -1, -1):
				if removed < 3 and String(bench[i].get("unit_id", "")) == uid and int(bench[i].get("star", 1)) == star:
					bench.remove_at(i)
					removed += 1
			for i in range(board.size()):
				if removed < 3 and board[i] != null and String(board[i].get("unit_id", "")) == uid and int(board[i].get("star", 1)) == star:
					if was_on_board < 0:
						was_on_board = i
					board[i] = null
					removed += 1
			var upgraded := {"unit_id": uid, "star": star + 1}
			if was_on_board >= 0:
				board[was_on_board] = upgraded
			else:
				bench.append(upgraded)
			try_star_up(player)
			return

static func place_on_board(player: Dictionary, bench_index: int, board_index: int) -> bool:
	var bench: Array = player.get("bench", [])
	var board: Array = player.get("board", [])
	if bench_index < 0 or bench_index >= bench.size():
		return false
	if board_index < 0 or board_index >= board.size():
		return false
	if board[board_index] != null:
		return false
	if board_count(player) >= int(player.get("level", 1)):
		return false
	board[board_index] = bench[bench_index]
	bench.remove_at(bench_index)
	return true

static func return_units_to_pool(player: Dictionary, pool: Dictionary) -> void:
	for u in board_units(player):
		pool[String(u.get("unit_id", ""))] = int(pool.get(String(u.get("unit_id", "")), 0)) + 1
	for u in player.get("bench", []):
		pool[String(u.get("unit_id", ""))] = int(pool.get(String(u.get("unit_id", "")), 0)) + 1
	var board: Array = player.get("board", [])
	for i in range(board.size()):
		board[i] = null
	player["bench"] = []

# Income at ROUND_RESOLVE (SRS 4.4). interest is computed on gold held at
# the end of the round, before the base income is added.
static func compute_income(player: Dictionary, won_pvp: bool, balance: Dictionary) -> int:
	var gold: int = int(player.get("gold", 0))
	var interest: int = mini(int(balance.get("interest_cap", 5)), gold / 10 * int(balance.get("interest_per_10_gold", 1)))
	var streak_bonus := 0
	var streak: int = int(player.get("streak", 0))
	var table: Dictionary = balance.get("streak_bonus", {})
	if streak >= 2:
		var key := str(mini(streak, 5))
		streak_bonus = int(table.get(key, 0))
	var total: int = int(balance.get("base_gold_per_round", 5)) + interest + streak_bonus
	if won_pvp:
		total += int(balance.get("pvp_win_gold", 1))
	return total
