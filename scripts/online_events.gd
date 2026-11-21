extends RefCounted

# M2 - Dich event combat cua server (s2c_combat_events) thanh dang ma
# M1CombatView choi lai duoc (defs + result.events + casters).
#
# Dinh dang day (server/src/protocol.ts + src/sim.ts):
# - unit_uid = "<ownerId>:<unitId>:<seq>" (vd "guest:abc:vn_thanh_giong:0"),
#   quai PvE = "pve:<ten>:<ci>" (vd "pve:Sói rừng:0").
# - hex_index dung chung luoi 7x8 (server da mirror side 1 — sim.ts
#   mirrorIndex), nen dung thang M1View.hex_to_pixel.
# - Quai PvE dung dung o cac o co dinh (sim.ts buildPveCombatants):
#   (7,3),(7,2),(7,4),(6,3),(6,2),(6,4),(5,3) -> idx 52,51,53,45,44,46,38.
# - Tuong doi phuong PvP: server KHONG gui board doi thu, chi biet vi tri
#   qua event move dau tien — luc spawn dung o tam (spread), event move se
#   keo ve dung cho ngay sau do. Day la gioi han hien thi, khong anh huong
#   ket qua (ket qua lay tu server).
# - "attack" (extra shot), "heal", "cc", "karma_trigger" khong co loai
#   tuong ung trong M1View.build_timeline nen bo qua (damage event da cho
#   thay don danh trung).
# - hp_max de hien thi: stat 1 sao x 1.8^(sao-1). Tuong doi phuong khong biet
#   so sao (uid khong mang star) nen tinh nhu 1 sao — thanh HP hien thi
#   chi la uoc luong. M1View hien cung khong cap nhat thanh HP theo event
#   (build_timeline khong truyen "hp"), nen khong lech nhin thay duoc.

const M1Data = preload("res://scripts/m1_data.gd")

const PVE_CELLS := [52, 51, 53, 45, 44, 46, 38]
const OPP_FALLBACK_CELLS := [38, 39, 45, 46, 31, 32, 52, 53, 37, 44]

# events: Array wire CombatEvent cua 1 vong. my_snapshot: s2c_board_snapshot
# truoc combat. Tra ve {"defs_a","defs_b","result":{"events":[...]},"casters"}.
static func translate_round(events: Array, my_snapshot: Dictionary, my_player_id: String, units_data: Dictionary, pve_data: Dictionary, balance: Dictionary) -> Dictionary:
	var iid_by_uid := {}
	var next_iid := 1
	var defs_a: Array = []
	var defs_b: Array = []
	var casters := {}
	# --- phia minh: tu snapshot board (co ca star + o dung). ---
	var board: Dictionary = my_snapshot.get("board", {})
	var my_cells: Array = []
	for k in board.keys():
		my_cells.append(int(k))
	my_cells.sort()
	for cell in my_cells:
		var slot = board.get(cell, board.get(str(cell), {}))
		if typeof(slot) != TYPE_DICTIONARY:
			continue
		var uid_str := String(slot.get("unit_id", ""))
		if uid_str == "":
			continue
		var d := M1Data.unit_by_id(units_data, uid_str)
		if d.is_empty():
			continue
		var star := int(slot.get("star", 1))
		var stats: Dictionary = d.get("stats_1star", {})
		var hp_max := float(stats.get("hp", 500)) * M1Data.star_multiplier(balance, star)
		var iid := next_iid
		next_iid += 1
		# Khoa "mine:<cell>:<unitId>" — event cua server danh seq theo thu tu
		# board (xem _iid_for_event).
		iid_by_uid["mine:%d:%s" % [cell, uid_str]] = iid
		defs_a.append(_combatant_def(iid, d, 0, cell, star, hp_max))
		casters[iid] = _caster_info(d)
	# --- quet event: thu thap moi uid doi phuong (ca unit_uid va target_uid). ---
	var opp_uids: Array = []
	var seen_opp := {}
	for e in events:
		if typeof(e) != TYPE_DICTIONARY:
			continue
		for key in ["unit_uid", "target_uid"]:
			var u := String((e as Dictionary).get(key, ""))
			if u == "" or _is_mine(u, my_player_id):
				continue
			if not seen_opp.has(u):
				seen_opp[u] = true
				opp_uids.append(u)
	var fall_i := 0
	for u in opp_uids:
		var iid2 := next_iid
		next_iid += 1
		iid_by_uid[u] = iid2
		var def2 := _opponent_def(u, iid2, units_data, pve_data, balance, OPP_FALLBACK_CELLS[fall_i % OPP_FALLBACK_CELLS.size()])
		fall_i += 1
		defs_b.append(def2)
		if not String(def2.get("unit_id", "")).begins_with("pve_"):
			var dd := M1Data.unit_by_id(units_data, String(def2.get("unit_id", "")))
			if not dd.is_empty():
				casters[iid2] = _caster_info(dd)
	# --- dich event sang dang M1 (t/k/a/b/cell/dmg/s). ---
	var m1_events: Array = []
	for e in events:
		if typeof(e) != TYPE_DICTIONARY:
			continue
		var tick := int(e.get("tick", 0))
		var etype := String(e.get("type", ""))
		match etype:
			"move":
				var iid_m := _iid_for_event(String(e.get("unit_uid", "")), my_player_id, iid_by_uid, board)
				if iid_m > 0:
					m1_events.append({"t": tick, "k": "move", "a": iid_m, "cell": int(e.get("hex_index", 0))})
			"skill_cast":
				var iid_s := _iid_for_event(String(e.get("unit_uid", "")), my_player_id, iid_by_uid, board)
				if iid_s > 0:
					m1_events.append({"t": tick, "k": "skill_cast", "a": iid_s, "s": String(e.get("skill_id", ""))})
			"damage":
				var a := _iid_for_event(String(e.get("unit_uid", "")), my_player_id, iid_by_uid, board)
				var b := _iid_for_event(String(e.get("target_uid", "")), my_player_id, iid_by_uid, board)
				if a > 0 and b > 0:
					if bool(e.get("dodged", false)):
						m1_events.append({"t": tick, "k": "dodge", "a": a, "b": b})
					else:
						m1_events.append({"t": tick, "k": "damage", "a": a, "b": b, "dmg": int(e.get("amount", 0))})
			"death":
				var iid_d := _iid_for_event(String(e.get("unit_uid", "")), my_player_id, iid_by_uid, board)
				if iid_d > 0:
					m1_events.append({"t": tick, "k": "death", "a": iid_d})
			_:
				pass # attack/heal/cc/karma_trigger: khong co loai trong timeline M1
	m1_events.sort_custom(func(x, y): return int(x.get("t", 0)) < int(y.get("t", 0)))
	return {"defs_a": defs_a, "defs_b": defs_b, "result": {"events": m1_events}, "casters": casters}

static func _is_mine(uid: String, my_player_id: String) -> bool:
	return uid.begins_with(my_player_id + ":")

static func _combatant_def(iid: int, d: Dictionary, side: int, idx: int, star: int, hp_max: float) -> Dictionary:
	return {
		"iid": iid, "unit_id": String(d.get("unit_id", "")), "name": String(d.get("name", "?")),
		"nation": String(d.get("nation_id", "")), "class": String(d.get("class_id", "")),
		"side": side, "idx": idx, "star": star, "hp": hp_max, "hp_max": hp_max,
	}

static func _caster_info(d: Dictionary) -> Dictionary:
	var skill: Dictionary = d.get("skill", {})
	return {
		"unit_id": String(d.get("unit_id", "")),
		"skill_id": String(skill.get("skill_id", "")),
		"skill_name": String(skill.get("name", "")),
		"skill_type": String(skill.get("type", "")),
	}

static func _opponent_def(uid: String, iid: int, units_data: Dictionary, pve_data: Dictionary, balance: Dictionary, fallback_cell: int) -> Dictionary:
	if uid.begins_with("pve:"):
		var parts := uid.split(":")
		var mname := String(parts[1]) if parts.size() > 1 else "Quái"
		var ci := int(parts[2]) if parts.size() > 2 else 0
		var cell: int = PVE_CELLS[clampi(ci, 0, PVE_CELLS.size() - 1)]
		var hp := 500.0
		for entry in (pve_data.get("pve_rounds", {}) as Dictionary).values():
			for m in ((entry as Dictionary).get("units", []) as Array):
				if String((m as Dictionary).get("name", "")) == mname:
					hp = float((m as Dictionary).get("hp", 500))
		return {
			"iid": iid, "unit_id": "pve_" + mname, "name": mname,
			"nation": "", "class": "", "side": 1, "idx": cell, "star": 1,
			"hp": hp, "hp_max": hp,
		}
	var parts2 := uid.split(":")
	var unit_id := String(parts2[parts2.size() - 2]) if parts2.size() >= 2 else ""
	var d := M1Data.unit_by_id(units_data, unit_id)
	if d.is_empty():
		return {
			"iid": iid, "unit_id": unit_id, "name": unit_id,
			"nation": "", "class": "", "side": 1, "idx": fallback_cell, "star": 1,
			"hp": 500.0, "hp_max": 500.0,
		}
	var stats: Dictionary = d.get("stats_1star", {})
	var hp_max := float(stats.get("hp", 500))
	return _combatant_def(iid, d, 1, fallback_cell, 1, hp_max)

# Tim iid cho 1 uid trong event. Uid phia minh co the map qua
# "mine:<cell>:<unitId>" nho cell hien tai — nhung event move khong cho biet
# cell cu, nen map theo unit_id: lay ban sao dau tien chua duoc gan. Thuc te
# server danh seq theo thu tu board (k = 0,1,2...) nen map theo k = chi so
# trong danh sach unit cung loai tren board.
static func _iid_for_event(uid: String, my_player_id: String, iid_by_uid: Dictionary, board: Dictionary) -> int:
	if uid == "":
		return -1
	if iid_by_uid.has(uid):
		return int(iid_by_uid[uid])
	if _is_mine(uid, my_player_id):
		var parts := uid.split(":")
		var unit_id := String(parts[parts.size() - 2]) if parts.size() >= 2 else ""
		var seq := int(parts[parts.size() - 1]) if parts.size() >= 1 else 0
		# Server danh seq = thu tu cua tuong trong danh sach board sap theo
		# cell tang dan (sim.ts buildSideCombatants duyet board theo idx).
		var cells: Array = []
		for k in board.keys():
			cells.append(int(k))
		cells.sort()
		if seq >= 0 and seq < cells.size():
			var key := "mine:%d:%s" % [int(cells[seq]), unit_id]
			if iid_by_uid.has(key):
				return int(iid_by_uid[key])
		# Du phong: ban sao dau tien cua unit_id nay.
		for k in iid_by_uid.keys():
			if String(k).ends_with(":" + unit_id):
				return int(iid_by_uid[k])
	return -1
