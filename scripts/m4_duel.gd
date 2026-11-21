extends SceneTree

# M4 — Controlled combat balance probes (SRS v2.1 §14).
# The 120-match bot batch collapses to 1-cost heroes (the Medium bot never
# sells / never transitions), so full-pool combat power is measured here
# with fixed lineups instead. Three probe kinds, all deterministic:
#   duel : 1v1 round-robin, all 49 heroes, 1 star, 3 seeds per pair.
#          Measures raw combat power per hero (no synergy, no bonds).
#   bond : same lineup both sides, bond ON vs bond OFF (identical heroes,
#          identical cells, only the bond active flag + its static mods
#          differ). Measures the bond's combat value in isolation.
#   syn  : same trio both sides, synergy mods ON vs OFF. Nation trios
#          (3 same-nation heroes) measure nation tier-2 (+8% HP);
#          class trios (3 same-class, mixed nations) measure class tier-2.
# Usage:
#   godot --headless --path . -s scripts/m4_duel.gd -- --out /tmp/m4_duel.jsonl
# No sim rule is changed; this only drives M1Sim.run_combat directly.

const M1Data = preload("res://scripts/m1_data.gd")
const M1Synergy = preload("res://scripts/m1_synergy.gd")
const M1Bonds = preload("res://scripts/m1_bonds.gd")
const M1Sim = preload("res://scripts/m1_sim.gd")

var _iid := 0

func _unit_def(units_data: Dictionary, uid: String) -> Dictionary:
	var d := M1Data.unit_by_id(units_data, uid)
	return {
		"unit_id": d.get("unit_id", ""), "name": d.get("name", "?"),
		"nation_id": d.get("nation_id", ""), "class_id": d.get("class_id", ""),
		"star": 1, "stats": d.get("stats_1star", {}), "skill": d.get("skill", {}),
		"is_pve": false, "bonds": [],
	}

func _make_side(uids: Array, cells: Array, side: int, use_synergy: bool, use_bonds: bool, data: Dictionary) -> Array:
	var units_data: Dictionary = data.get("units", {})
	var balance: Dictionary = data.get("balance", {})
	var syn_units: Array = []
	for uid in uids:
		syn_units.append(M1Data.unit_by_id(units_data, String(uid)))
	var mods_arr: Array = []
	var team_armor := 0
	var team_mr := 0
	if use_synergy:
		var syn := M1Synergy.compute(syn_units, balance)
		mods_arr = (syn.get("unit_mods", []) as Array).duplicate(true)
		team_armor = int(syn.get("team_armor", 0))
		team_mr = int(syn.get("team_mr", 0))
	else:
		for i in range(syn_units.size()):
			mods_arr.append(M1Synergy._empty_mods())
	var active: Array = []
	if use_bonds:
		active = M1Bonds.active_bonds(uids, data.get("bonds", {}))
		M1Bonds.apply_static_mods(syn_units, active, mods_arr)
	var defs: Array = []
	for k in range(uids.size()):
		var ud := _unit_def(units_data, String(uids[k]))
		ud["bonds"] = active
		_iid += 1
		defs.append(M1Sim.make_combatant(ud, side, int(cells[k]), mods_arr[k], team_armor, team_mr, balance, _iid))
	return defs

func _run(data: Dictionary, defs_a: Array, defs_b: Array, seed: int) -> Dictionary:
	var res := M1Sim.run_combat(defs_a, defs_b, seed, data.get("balance", {}))
	return {"winner": int(res.get("winner", -1)), "ticks": int(res.get("ticks", 0)),
		"surv_a": int(res.get("survivors_a", 0)), "surv_b": int(res.get("survivors_b", 0))}

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out := "/tmp/m4_duel.jsonl"
	var cell_a := 24
	var cell_b := 31
	var bond_seeds := 3
	var i := 0
	while i < args.size():
		if args[i] == "--out" and i + 1 < args.size():
			out = args[i + 1]
		if args[i] == "--cell-a" and i + 1 < args.size():
			cell_a = int(args[i + 1])
		if args[i] == "--cell-b" and i + 1 < args.size():
			cell_b = int(args[i + 1])
		if args[i] == "--bond-seeds" and i + 1 < args.size():
			bond_seeds = int(args[i + 1])
		i += 1
	var data: Dictionary = M1Data.load_all()
	var units_data: Dictionary = data.get("units", {})
	var units: Array = units_data.get("units", [])
	var ids: Array = []
	for u in units:
		ids.append(String(u.get("unit_id", "")))
	var f := FileAccess.open(out, FileAccess.WRITE)
	if f == null:
		printerr("M4_DUEL_FAIL cannot open %s" % out)
		quit(1)
		return
	# ---- 1) duels: 1v1 round-robin, 3 seeds ----
	var pair_idx := 0
	for a in range(ids.size()):
		for b in range(a + 1, ids.size()):
			for k in range(3):
				var seed := 500000 + pair_idx * 13 + k
				var da := _make_side([ids[a]], [cell_a], 0, false, false, data)
				var db := _make_side([ids[b]], [cell_b], 1, false, false, data)
				var r := _run(data, da, db, seed)
				f.store_line(JSON.stringify({"kind": "duel", "a": ids[a], "b": ids[b], "seed": seed,
					"winner": r["winner"], "ticks": r["ticks"]}))
			pair_idx += 1
	print("M4_DUEL duels done pairs=%d" % pair_idx)
	# ---- 2) bonds: members ON vs OFF, mirror lineups ----
	var bonds_data: Dictionary = data.get("bonds", {})
	for b in bonds_data.get("bonds", []):
		var members: Array = (b.get("members", []) as Array).duplicate()
		# Pad 2-member bonds to a 3-unit side with a neutral filler that
		# shares no bond/synergy with the members (a 1g hero of another
		# nation and class). Filler is identical on both sides.
		var filler := ""
		if members.size() == 2:
			for u in units:
				var uid := String(u.get("unit_id", ""))
				if members.has(uid):
					continue
				var d := M1Data.unit_by_id(units_data, uid)
				var shares := false
				for m in members:
					var md := M1Data.unit_by_id(units_data, String(m))
					if String(d.get("nation_id", "")) == String(md.get("nation_id", "")) or String(d.get("class_id", "")) == String(md.get("class_id", "")):
						shares = true
				if not shares and int(d.get("cost", 9)) == 1:
					filler = uid
					break
			if filler != "":
				members.append(filler)
		var cells := [17, 18, 19]
		var mcells := [38, 39, 40]
		for k in range(bond_seeds):
			var seed2 := 600000 + k * 101
			var on_a := _make_side(members, cells, 0, true, true, data)
			var off_b := _make_side(members, mcells, 1, true, false, data)
			var r2 := _run(data, on_a, off_b, seed2)
			f.store_line(JSON.stringify({"kind": "bond", "bond": String(b.get("bond_id", "")),
				"members": members, "seed": seed2, "winner": r2["winner"], "ticks": r2["ticks"],
				"surv_on": r2["surv_a"], "surv_off": r2["surv_b"]}))
	print("M4_DUEL bonds done")
	# ---- 3) synergy: trio ON vs OFF ----
	# Nation trios: first 3 heroes of each nation that share no bond.
	var by_nation := {}
	var by_class := {}
	for u in units:
		var nid := String(u.get("nation_id", ""))
		var cid := String(u.get("class_id", ""))
		if not by_nation.has(nid):
			by_nation[nid] = []
		(by_nation[nid] as Array).append(String(u.get("unit_id", "")))
		if not by_class.has(cid):
			by_class[cid] = []
		(by_class[cid] as Array).append(String(u.get("unit_id", "")))
	var bond_members := {}
	for b in bonds_data.get("bonds", []):
		for m in b.get("members", []):
			bond_members[String(m)] = true
	for nid in by_nation.keys():
		var trio: Array = []
		for uid in by_nation[nid]:
			if not bond_members.has(uid):
				trio.append(uid)
			if trio.size() == 3:
				break
		if trio.size() < 3:
			continue
		for k in range(3):
			var seed3 := 700000 + k * 103
			var on := _make_side(trio, [17, 18, 19], 0, true, false, data)
			var off := _make_side(trio, [38, 39, 40], 1, false, false, data)
			var r3 := _run(data, on, off, seed3)
			f.store_line(JSON.stringify({"kind": "syn_nation", "key": nid, "members": trio,
				"seed": seed3, "winner": r3["winner"], "ticks": r3["ticks"],
				"surv_on": r3["surv_a"], "surv_off": r3["surv_b"]}))
	for cid in by_class.keys():
		var trio2: Array = []
		var seen_nations := {}
		for uid in by_class[cid]:
			var d := M1Data.unit_by_id(units_data, uid)
			var nid2 := String(d.get("nation_id", ""))
			if seen_nations.has(nid2) or bond_members.has(uid):
				continue
			seen_nations[nid2] = true
			trio2.append(uid)
			if trio2.size() == 3:
				break
		if trio2.size() < 3:
			continue
		for k in range(3):
			var seed4 := 800000 + k * 107
			var on2 := _make_side(trio2, [17, 18, 19], 0, true, false, data)
			var off2 := _make_side(trio2, [38, 39, 40], 1, false, false, data)
			var r4 := _run(data, on2, off2, seed4)
			f.store_line(JSON.stringify({"kind": "syn_class", "key": cid, "members": trio2,
				"seed": seed4, "winner": r4["winner"], "ticks": r4["ticks"],
				"surv_on": r4["surv_a"], "surv_off": r4["surv_b"]}))
	f.close()
	print("M4_DUEL_DONE out=%s" % out)
	quit()
