extends RefCounted

# M1 - Medium bot, SRS v2.1 section 11.1.
# Same rules / pool / shop as the player. Keeps gold toward the 50-gold
# interest threshold, activates synergy 2, buys by hero value table,
# positions by class. No items (M1 scope). M3: buys toward Karma Bonds too
# (+6 value for a hero that advances a bond the bot already started).
const M1Hex = preload("res://scripts/m1_hex.gd")
const M1Data = preload("res://scripts/m1_data.gd")
const M1Economy = preload("res://scripts/m1_economy.gd")
const M1Bonds = preload("res://scripts/m1_bonds.gd")

static func _owned_counts(player: Dictionary) -> Dictionary:
	var counts := {}
	for u in M1Economy.board_units(player):
		counts[String(u.get("unit_id", ""))] = int(counts.get(String(u.get("unit_id", "")), 0)) + 1
	for u in player.get("bench", []):
		counts[String(u.get("unit_id", ""))] = int(counts.get(String(u.get("unit_id", "")), 0)) + 1
	return counts

static func hero_value(player: Dictionary, def: Dictionary, units_data: Dictionary, bonds_data: Dictionary = {}) -> int:
	var value := int(def.get("cost", 1)) * 10
	var uid: String = def.get("unit_id", "")
	var owned := _owned_counts(player)
	if int(owned.get(uid, 0)) >= 2:
		value += 12  # completes a star-up
	elif int(owned.get(uid, 0)) == 1:
		value += 6
	# M3 Karma Bonds: +6 for a hero that advances a bond the bot already
	# started (owns >= 1 other member, not yet at the bond's top threshold).
	if not bonds_data.is_empty():
		var owned_ids: Array = []
		for k in owned.keys():
			owned_ids.append(String(k))
		owned_ids.append(uid)
		var active := M1Bonds.active_bonds(owned_ids, bonds_data)
		for bond in active:
			if (bond.get("members_on_board", []) as Array).has(uid) and int(bond.get("count", 0)) >= 2:
				value += 6
				break
	# Synergy match: +5 per nation/class already present on board/bench.
	var nation: String = def.get("nation_id", "")
	var cls: String = def.get("class_id", "")
	var seen_n := false
	var seen_c := false
	for u in M1Economy.board_units(player):
		var d := M1Data.unit_by_id(units_data, String(u.get("unit_id", "")))
		if String(d.get("nation_id", "")) == nation:
			seen_n = true
		if String(d.get("class_id", "")) == cls:
			seen_c = true
	for u in player.get("bench", []):
		var d2 := M1Data.unit_by_id(units_data, String(u.get("unit_id", "")))
		if String(d2.get("nation_id", "")) == nation:
			seen_n = true
		if String(d2.get("class_id", "")) == cls:
			seen_c = true
	if seen_n:
		value += 5
	if seen_c:
		value += 5
	return value

static func _target_rows(cls: String) -> Array:
	match cls:
		"GUARDIAN", "WARRIOR":
			return [3, 2]
		"ASSASSIN":
			return [2, 3]
		_:
			return [0, 1]

static func _position_units(player: Dictionary, units_data: Dictionary) -> void:
	var board: Array = player.get("board", [])
	# Front rows first for tanks, back rows for ranged (row 3 = front).
	var bench: Array = player.get("bench", [])
	var i := 0
	while i < bench.size():
		if M1Economy.board_count(player) >= int(player.get("level", 1)):
			break
		var u: Dictionary = bench[i]
		var def := M1Data.unit_by_id(units_data, String(u.get("unit_id", "")))
		var placed := false
		for row in _target_rows(String(def.get("class_id", ""))):
			# Center columns first, then edges.
			var cols: Array = [3, 2, 4, 1, 5, 0, 6]
			for col in cols:
				var idx := M1Hex.rc_to_index(row, col)
				if board[idx] == null:
					if M1Economy.place_on_board(player, i, idx):
						placed = true
						break
			if placed:
				break
		if not placed:
			i += 1

static func take_prep_turn(player: Dictionary, units_data: Dictionary, pool: Dictionary, rng: RandomNumberGenerator, balance: Dictionary, bonds_data: Dictionary = {}) -> void:
	var level: int = int(player.get("level", 1))
	# Reserve stays low early so the bot actually fields a team from round 1
	# (the old 10 + 5*level reserve left the board empty for 4 rounds).
	# It still grows toward the 50-gold interest threshold at high level.
	var reserve: int = mini(30, 5 + level * 3)
	# 1) Buy from shop by value.
	var bought := true
	var guard := 0
	while bought and guard < 12:
		guard += 1
		bought = false
		var shop: Array = player.get("shop", [])
		var best_slot := -1
		var best_value := 9  # only consider heroes worth >= 10
		for s in range(shop.size()):
			var uid: String = shop[s]
			if uid == "":
				continue
			var def := M1Data.unit_by_id(units_data, uid)
			if def.is_empty():
				continue
			var cost := int(def.get("cost", 1))
			if int(player.get("gold", 0)) < cost:
				continue
			var value := hero_value(player, def, units_data, bonds_data)
			var keep_reserve := int(player.get("gold", 0)) - cost >= reserve
			# Urgent: the bot has fewer units on board than its level allows.
			var urgent := M1Economy.board_count(player) < int(player.get("level", 1))
			# A 1-cost hero with no synergy is worth 10; it must still be
			# bought early or the board stays empty for the first rounds.
			if value >= 10 and (keep_reserve or urgent or value >= 25) and value > best_value:
				best_value = value
				best_slot = s
		if best_slot >= 0:
			if M1Economy.buy_shop_slot(player, units_data, pool, best_slot, balance):
				bought = true
	# 2) Buy XP when close to levelling, gold allows, and the board is
	# already full for the current level (units first, levels second).
	var table := M1Data.xp_table(balance)
	if level < int(balance.get("level_cap", 9)) and M1Economy.board_count(player) >= int(player.get("level", 1)):
		var need: int = int(table[level]) - int(player.get("xp_total", 0))
		if need <= 4 and int(player.get("gold", 0)) > reserve + 4:
			M1Economy.buy_xp(player, balance)
	# 3) Position bench units by class.
	_position_units(player, units_data)
	# 4) If the board is overfull (level dropped - cannot happen in M1),
	# nothing to do; board size is capped at placement time.
