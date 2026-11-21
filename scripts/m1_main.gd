extends Node2D

# M1 - Đấu Trường Nhân Quả, vertical slice (SRS v2.1 section 14).
# M3: 49 heroes VN/CN/JP/FR/US/AZ/UK, 1 human vs 7 Medium bots, offline
# deterministic sim. Data-driven: data/units.json + data/balance_config.json
# + data/pve.json + data/karma_bonds.json.
# Legacy Fantasy demo is kept in scripts/main.gd + legacy_main.tscn.
const M1Data = preload("res://scripts/m1_data.gd")
const M1Synergy = preload("res://scripts/m1_synergy.gd")
const M1Bonds = preload("res://scripts/m1_bonds.gd")
const M1Economy = preload("res://scripts/m1_economy.gd")
const M1Sim = preload("res://scripts/m1_sim.gd")
const M1Match = preload("res://scripts/m1_match.gd")
const M1View = preload("res://scripts/m1_view.gd")
const M1CombatView = preload("res://scripts/m1_combat_view.gd")

var data: Dictionary = {}
var status_label: Label
var log_label: Label
# Set by scripts/m1_gui.gd when it reuses the legacy checks: the GUI runs
# them itself in its own headless order, so this instance must not quit.
var skip_auto_headless := false

func _ready() -> void:
	data = M1Data.load_all()
	_build_ui()
	_refresh_ui("M1 san sang: 49 tuong 7 nuoc, 1 nguoi vs 7 bot Trung binh.")
	print("M1_READY units=%d" % (data.get("units", {}) as Dictionary).get("units", []).size())
	if DisplayServer.get_name() == "headless" and not skip_auto_headless:
		_run_headless_test()

func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "UI"
	add_child(canvas)
	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 8)
	canvas.add_child(root)
	status_label = Label.new()
	status_label.add_theme_font_size_override("font_size", 26)
	root.add_child(status_label)
	var btn_row := HBoxContainer.new()
	root.add_child(btn_row)
	var run_btn := Button.new()
	run_btn.text = "Chạy trận tự động M1 (8 người)"
	run_btn.pressed.connect(_on_run_match_pressed)
	btn_row.add_child(run_btn)
	var replay_btn := Button.new()
	replay_btn.text = "Kiểm tra replay (deterministic)"
	replay_btn.pressed.connect(_on_replay_pressed)
	btn_row.add_child(replay_btn)
	var view_btn := Button.new()
	view_btn.text = "Xem combat mẫu 3v3 (di chuyển + skill)"
	view_btn.pressed.connect(_on_view_pressed)
	btn_row.add_child(view_btn)
	log_label = Label.new()
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(log_label)

func _refresh_ui(msg: String) -> void:
	if status_label != null:
		status_label.text = "Đấu Trường Nhân Quả — M1 Vertical Slice"
	if log_label != null:
		log_label.text = msg

func _on_run_match_pressed() -> void:
	var result := _run_match(20261121)
	_refresh_ui(result)

func _on_replay_pressed() -> void:
	var ok := _replay_check()
	_refresh_ui("Replay check: %s" % ("KHOP (deterministic)" if ok else "KHONG KHOP - LOI"))

func _on_view_pressed() -> void:
	var parts := _fixed_combat_parts(777)
	var view = M1CombatView.new()
	add_child(view)
	var all: Array = []
	all.append_array(parts.get("defs_a", []))
	all.append_array(parts.get("defs_b", []))
	view.play_combat(all, parts.get("result", {}), parts.get("casters", {}))
	_refresh_ui("Đang chiếu combat mẫu 3v3: tướng di chuyển theo ô lục giác, đánh, tung chiêu có popup + hiệu ứng + âm thanh skill.")

func _run_match(match_seed: int) -> String:
	var m = M1Match.new(match_seed, data)
	var result: Dictionary = m.run_match()
	for line in result.get("log", []):
		print("[M1] ", line)
	var ranking: Array = result.get("ranking", [])
	var rank_str := ""
	for r in ranking:
		rank_str += "#%d %s  " % [int(r.get("rank", 0)), r.get("name", "?")]
	print("M1_MATCH_OK top1=%s rounds=%d ranking=[%s]" % [result.get("top1", {}).get("name", "?"), int(result.get("rounds", 0)), rank_str])
	return "Top 1: %s sau %d vong.\n%s" % [result.get("top1", {}).get("name", "?"), int(result.get("rounds", 0)), rank_str]

func _fixed_combat_parts(seed: int) -> Dictionary:
	var balance: Dictionary = data.get("balance", {})
	var units_data: Dictionary = data.get("units", {})
	var picks_a: Array = ["vn_thanh_giong", "vn_yet_kieu", "vn_an_duong_vuong"]
	var picks_b: Array = ["cn_quan_vu", "cn_kinh_kha", "cn_hau_nghe"]
	var cells_a: Array = [17, 18, 10]  # rows 2,2,1
	var cells_b: Array = [38, 39, 45]  # rows 5,5,6 (mirrored side)
	var defs_a: Array = []
	var defs_b: Array = []
	var casters := {}
	var syn_a_units: Array = []
	var syn_b_units: Array = []
	for uid in picks_a:
		syn_a_units.append(M1Data.unit_by_id(units_data, uid))
	for uid in picks_b:
		syn_b_units.append(M1Data.unit_by_id(units_data, uid))
	var syn_a := M1Synergy.compute(syn_a_units, balance)
	var syn_b := M1Synergy.compute(syn_b_units, balance)
	var iid := 0
	for i in range(picks_a.size()):
		var d := M1Data.unit_by_id(units_data, picks_a[i])
		iid += 1
		casters[iid] = {"unit_id": d.get("unit_id", ""), "skill_id": (d.get("skill", {}) as Dictionary).get("skill_id", ""), "skill_name": (d.get("skill", {}) as Dictionary).get("name", ""), "skill_type": (d.get("skill", {}) as Dictionary).get("type", "")}
		defs_a.append(M1Sim.make_combatant(
			{"unit_id": d.get("unit_id", ""), "name": d.get("name", ""), "nation_id": d.get("nation_id", ""), "class_id": d.get("class_id", ""), "star": 1, "stats": d.get("stats_1star", {}), "skill": d.get("skill", {}), "is_pve": false},
			0, cells_a[i], (syn_a.get("unit_mods", []) as Array)[i], int(syn_a.get("team_armor", 0)), int(syn_a.get("team_mr", 0)), balance, iid))
	for i in range(picks_b.size()):
		var d2 := M1Data.unit_by_id(units_data, picks_b[i])
		iid += 1
		casters[iid] = {"unit_id": d2.get("unit_id", ""), "skill_id": (d2.get("skill", {}) as Dictionary).get("skill_id", ""), "skill_name": (d2.get("skill", {}) as Dictionary).get("name", ""), "skill_type": (d2.get("skill", {}) as Dictionary).get("type", "")}
		defs_b.append(M1Sim.make_combatant(
			{"unit_id": d2.get("unit_id", ""), "name": d2.get("name", ""), "nation_id": d2.get("nation_id", ""), "class_id": d2.get("class_id", ""), "star": 1, "stats": d2.get("stats_1star", {}), "skill": d2.get("skill", {}), "is_pve": false},
			1, cells_b[i], (syn_b.get("unit_mods", []) as Array)[i], int(syn_b.get("team_armor", 0)), int(syn_b.get("team_mr", 0)), balance, iid))
	# Deep-copy the pre-combat state for the view (the sim mutates defs).
	var initial_a: Array = defs_a.duplicate(true)
	var initial_b: Array = defs_b.duplicate(true)
	var result := M1Sim.run_combat(defs_a, defs_b, seed, balance)
	return {"defs_a": initial_a, "defs_b": initial_b, "result": result, "casters": casters}

func _fixed_combat(seed: int) -> Dictionary:
	return _fixed_combat_parts(seed).get("result", {})

func _view_check() -> bool:
	# Headless verification of the animation layer: the timeline built from
	# sim events must contain moves, skill casts and deaths, and the asset
	# check must report exactly which skill icons / sounds are missing.
	var parts := _fixed_combat_parts(777)
	var steps := M1View.build_timeline((parts.get("result", {}) as Dictionary).get("events", []), parts.get("casters", {}))
	var stats := M1View.timeline_stats(steps)
	print("M1_VIEW_TIMELINE move=%d jump=%d hit=%d skill=%d death=%d dodge=%d" % [int(stats.get("move", 0)), int(stats.get("jump", 0)), int(stats.get("hit", 0)), int(stats.get("skill", 0)), int(stats.get("death", 0)), int(stats.get("dodge", 0))])
	var assets := M1View.check_assets(data.get("units", {}))
	print("M1_VIEW_ASSETS icons=%d/49 sfx=%d/49 portraits=%d/49 missing_icons=%s missing_sfx=%s" % [int(assets.get("present_icons", 0)), int(assets.get("present_sfx", 0)), int(assets.get("present_portraits", 0)), str(assets.get("missing_icons", [])), str(assets.get("missing_sfx", []))])
	# Direct-load checks: a portrait PNG and a skill WAV must decode without
	# the editor importer (load() reports "No loader found" headless).
	var wav := M1View.load_skill_wav("vn_yet_kieu")
	var ptex := M1View.load_portrait_texture("vn_thanh_giong")
	print("M1_VIEW_WAV %s" % ("ok rate=%d stereo=%s bytes=%d" % [int(wav.mix_rate), str(wav.stereo), (wav.data as PackedByteArray).size()] if wav != null else "FAIL"))
	print("M1_VIEW_PORTRAIT %s" % ("ok %dx%d" % [ptex.get_width(), ptex.get_height()] if ptex != null else "FAIL"))
	var ok: bool = int(stats.get("move", 0)) > 0 and int(stats.get("skill", 0)) > 0 and int(stats.get("death", 0)) > 0
	# Smoke test: actually instantiate the view headless, play the combat back
	# and step its clock manually - the timeline must advance and steps apply
	# (tweens/particles/audio run against the dummy headless drivers).
	var view = M1CombatView.new()
	add_child(view)
	var all: Array = []
	all.append_array(parts.get("defs_a", []))
	all.append_array(parts.get("defs_b", []))
	view.play_combat(all, parts.get("result", {}), parts.get("casters", {}))
	for i in range(40):
		view._process(0.25)
	print("M1_VIEW_SMOKE cursor=%d/%d playing=%s" % [view.cursor, view.timeline.size(), str(view.playing)])
	ok = ok and view.cursor >= view.timeline.size()
	view.queue_free()
	print("M1_VIEW %s" % ("OK" if ok else "FAIL"))
	return ok

func _replay_check() -> bool:
	var r1 := _fixed_combat(777)
	var r2 := _fixed_combat(777)
	var e1 := JSON.stringify(r1.get("events", []))
	var e2 := JSON.stringify(r2.get("events", []))
	# A vacuous pass (empty events) is a failure, not a match.
	var same: bool = (r1.get("events", []) as Array).size() > 0 and int(r1.get("ticks", -1)) > 0 and e1 == e2 and int(r1.get("winner", -2)) == int(r2.get("winner", -2)) and int(r1.get("ticks", -1)) == int(r2.get("ticks", -1))
	print("M1_REPLAY seed=777 winner=%d ticks=%d events=%d same=%s" % [int(r1.get("winner", -1)), int(r1.get("ticks", -1)), (r1.get("events", []) as Array).size(), str(same)])
	return same

func _sanity_checks() -> bool:
	var ok := true
	var units_data: Dictionary = data.get("units", {})
	var balance: Dictionary = data.get("balance", {})
	var units: Array = units_data.get("units", [])
	if units.size() != 49:
		print("M1_SANITY_FAIL units=%d expected 49" % units.size())
		ok = false
	# Shop odds must sum to 100 at every level.
	for lv in range(1, 10):
		var odds := M1Data.shop_odds(balance, lv)
		var s := 0
		for o in odds:
			s += int(o)
		if s != 100:
			print("M1_SANITY_FAIL shop odds level %d sum=%d" % [lv, s])
			ok = false
	# XP table must be cumulative to level 9.
	var table := M1Data.xp_table(balance)
	if table.size() != 9 or int(table[8]) != 108:
		print("M1_SANITY_FAIL xp table %s" % str(table))
		ok = false
	# Synergy smoke test: 3 VN on board -> nation tier 2.
	var test_units: Array = [
		M1Data.unit_by_id(units_data, "vn_thanh_giong"),
		M1Data.unit_by_id(units_data, "vn_yet_kieu"),
		M1Data.unit_by_id(units_data, "vn_an_duong_vuong"),
	]
	var syn := M1Synergy.compute(test_units, balance)
	if int(Dictionary(syn.get("nation_levels", {})).get("VN", 0)) != 2:
		print("M1_SANITY_FAIL synergy VN tier=%s" % str(Dictionary(syn.get("nation_levels", {})).get("VN", 0)))
		ok = false
	print("M1_SANITY %s" % ("OK" if ok else "FAIL"))
	return ok

func _m3_check() -> bool:
	# M3: 10 bonds in data, shop diversity over the full 49-hero pool, and
	# bond triggers firing in fixed combats (>= 3 bonds, >= 3 triggers).
	var ok := true
	var balance: Dictionary = data.get("balance", {})
	var units_data: Dictionary = data.get("units", {})
	var bonds_data: Dictionary = data.get("bonds", {})
	var bonds: Array = bonds_data.get("bonds", [])
	if bonds.size() != 10:
		print("M3_CHECK_FAIL bonds=%d expected 10" % bonds.size())
		ok = false
	# Shop diversity: 8 players at level 9 rolling 10 rounds each.
	var rng := RandomNumberGenerator.new()
	rng.seed = 777
	var pool := M1Economy.new_pool(units_data, balance)
	var seen := {}
	for p in range(8):
		var pl := M1Economy.new_player(p, "T%d" % p, false, balance)
		pl["level"] = 9
		for r in range(10):
			M1Economy.roll_shop(pl, units_data, pool, rng, balance, true)
			for uid in pl.get("shop", []):
				if String(uid) != "":
					seen[String(uid)] = true
	print("M3_SHOP distinct=%d/49" % seen.size())
	if seen.size() < 45:
		print("M3_CHECK_FAIL shop distinct=%d < 45" % seen.size())
		ok = false
	# Bond triggers: one fixed combat per bond; count karma_trigger events.
	var tanks := ["uk_arthur", "fr_joan", "cn_quan_vu"]
	var cases := [
		{"bond": "bond_sam_set", "a": ["us_tesla", "az_quetzalcoatl", "vn_chu_dong_tu"], "b": tanks},
		{"bond": "bond_bien_va_song", "a": ["vn_yet_kieu", "vn_an_duong_vuong", "uk_robin"], "b": tanks},
		{"bond": "bond_co_sac", "a": ["fr_joan", "us_lincoln", "vn_hai_ba_trung"], "b": ["cn_ton_ngo_khong", "jp_susanoo", "vn_son_tinh"]},
		{"bond": "bond_tri_thuc", "a": ["cn_khong_minh", "fr_nostradamus", "uk_merlin"], "b": tanks},
	]
	var fired := {}
	for c in cases:
		var m = M1Match.new(424242, data)
		var pa: Dictionary = m.players[0]
		var pb: Dictionary = m.players[1]
		var cells := [17, 18, 19]
		for i in range(3):
			pa["board"][cells[i]] = {"unit_id": (c.get("a", []) as Array)[i], "star": 1}
			pb["board"][cells[i]] = {"unit_id": (c.get("b", []) as Array)[i], "star": 1}
		var defs_a := m._build_side(pa, 0)
		var defs_b := m._build_side(pb, 1)
		var res := M1Sim.run_combat(defs_a, defs_b, 999, balance)
		for e in res.get("events", []):
			if String(e.get("k", "")) == "karma_trigger":
				var bid := String(e.get("bond", ""))
				fired[bid] = int(fired.get(bid, 0)) + 1
	var triggers := {}
	for b in bonds:
		if fired.has(String(b.get("bond_id", ""))):
			for th in b.get("thresholds", []):
				triggers[String(th.get("trigger", ""))] = true
	print("M3_BONDS fired=%s triggers=%s" % [str(fired), str(triggers.keys())])
	if fired.size() < 3 or triggers.size() < 3:
		print("M3_CHECK_FAIL bonds fired=%d triggers=%d (need >=3 each)" % [fired.size(), triggers.size()])
		ok = false
	# 4) Static team buffs: bond_mat_troi tier 2 gives ALL allies +10% crit.
	var m2 = M1Match.new(515151, data)
	var p2: Dictionary = m2.players[0]
	p2["board"][17] = {"unit_id": "cn_hau_nghe", "star": 1}
	p2["board"][18] = {"unit_id": "az_huitzilopochtli", "star": 1}
	var d2 := m2._build_side(p2, 0)
	var crit_ok := false
	for c in d2:
		if float(Dictionary(c.get("mods", {})).get("crit", 0.0)) >= 0.099:
			crit_ok = true
	print("M3_BOND_STATIC mat_troi team_crit=%s" % str(crit_ok))
	if not crit_ok:
		print("M3_CHECK_FAIL static team crit not applied")
		ok = false
	# 5) Rivalry: Napoleon vs Arthur across a PvP pair.
	var m3 = M1Match.new(616161, data)
	var p3a: Dictionary = m3.players[0]
	var p3b: Dictionary = m3.players[1]
	p3a["board"][17] = {"unit_id": "fr_napoleon", "star": 1}
	p3b["board"][17] = {"unit_id": "uk_arthur", "star": 1}
	var riv_ok := m3._rivalry_pair(p3a, p3b)
	var p3c: Dictionary = m3.players[2]
	p3c["board"][17] = {"unit_id": "us_tesla", "star": 1}
	var riv_no := not m3._rivalry_pair(p3a, p3c)
	print("M3_RIVALRY napoleon-vs-arthur=%s one-sided=%s" % [str(riv_ok), str(riv_no)])
	if not riv_ok or not riv_no:
		print("M3_CHECK_FAIL rivalry pair detection")
		ok = false
	print("M3_CHECK %s" % ("OK" if ok else "FAIL"))
	return ok

func _run_headless_test() -> void:
	print("M1_HEADLESS_TEST start")
	var ok := _sanity_checks()
	ok = _replay_check() and ok
	ok = _view_check() and ok
	ok = _m3_check() and ok
	var summary := _run_match(20261121)
	print("M1_HEADLESS_SUMMARY %s" % summary.replace("\n", " | "))
	if ok:
		print("M1_HEADLESS_OK")
	else:
		print("M1_HEADLESS_FAIL")
	get_tree().quit()
