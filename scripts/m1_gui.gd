extends Node2D

# M1 - GUI chơi tay đầy đủ (SRS v2.1 section 4 + 14).
# Shop 5 ô, bench 9 ô, bàn hex 7x8, mua XP/lên cấp, kinh tế (lãi, chuỗi),
# timer chuẩn bị 30s, combat chiếu bằng sim + M1CombatView có sẵn, kết quả
# vòng, bảng xếp hạng 8 người. Người chơi bấm để mua / chọn / xếp tướng
# (click-click thay cho kéo-thả).
#
# GUI chỉ gọi API công khai của M1Economy / M1Match / M1Sim / M1Synergy và
# không sửa bất kỳ luật nào, nên tính deterministic và replay không đổi.
# Mọi thao tác mua/bán/làm mới/lên cấp đều đi qua đúng hàm economy đã có.
const M1Hex = preload("res://scripts/m1_hex.gd")
const M1Data = preload("res://scripts/m1_data.gd")
const M1Synergy = preload("res://scripts/m1_synergy.gd")
const M1Sim = preload("res://scripts/m1_sim.gd")
const M1Match = preload("res://scripts/m1_match.gd")
const M1Economy = preload("res://scripts/m1_economy.gd")
const M1View = preload("res://scripts/m1_view.gd")
const M1CombatView = preload("res://scripts/m1_combat_view.gd")
const M1Main = preload("res://scripts/m1_main.gd")

const PHASE_IDLE := 0
const PHASE_PREP := 1
const PHASE_COMBAT := 2
const PHASE_RESULT := 3
const PHASE_GAMEOVER := 4

var data: Dictionary = {}
var balance: Dictionary = {}
var units_data: Dictionary = {}
var mm: RefCounted = null  # M1Match
var human: Dictionary = {}
var phase := PHASE_IDLE
var prep_timer := 0.0
var selected := {"zone": "", "index": -1}
var round_info := {}
var round_summary := {}
var _sample_playing := false
var _finalized := false
var _final_ranking: Array = []
var _headless := false

# UI nodes
var hp_label: Label
var gold_label: Label
var level_label: Label
var round_label: Label
var timer_label: Label
var streak_label: Label
var synergy_label: Label
var opponents_label: Label
var msg_label: Label
var shop_btns: Array = []
var bench_btns: Array = []
var reroll_btn: Button
var lock_btn: CheckButton
var buy_xp_btn: Button
var sell_btn: Button
var deselect_btn: Button
var start_btn: Button
var result_panel: CenterContainer
var result_label: Label
var gameover_panel: CenterContainer
var gameover_title: Label
var gameover_label: Label
var tokens_root: Node2D
var combat_view: Node2D
var _tex_cache := {}
var _circle_tex: Texture2D

func _ready() -> void:
	data = M1Data.load_all()
	balance = data.get("balance", {})
	units_data = data.get("units", {})
	_headless = DisplayServer.get_name() == "headless"
	_circle_tex = _make_circle_texture(64, 30)
	_build_ui()
	tokens_root = Node2D.new()
	tokens_root.name = "Tokens"
	add_child(tokens_root)
	combat_view = M1CombatView.new()
	combat_view.visible = false
	add_child(combat_view)
	if _headless:
		_run_headless_all()
	else:
		gui_new_match(int(Time.get_unix_time_from_system()) % 100000000 + 1)

func _make_circle_texture(size: int, radius: int) -> Texture2D:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var c := size / 2
	for y in range(size):
		for x in range(size):
			var d := Vector2(x - c, y - c).length()
			if d <= float(radius):
				img.set_pixel(x, y, Color(1, 1, 1, 1.0 if d <= float(radius) - 2.0 else 0.6))
	return ImageTexture.create_from_image(img)

# ------------------------------------------------------------------ UI build

func _mk_label(text: String, font_size: int) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	return l

func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "UI"
	add_child(canvas)
	# Top bar.
	var top := HBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_bottom = 44
	top.add_theme_constant_override("separation", 18)
	top.position = Vector2(8, 4)
	canvas.add_child(top)
	hp_label = _mk_label("Máu: 100", 20)
	top.add_child(hp_label)
	gold_label = _mk_label("Vàng: 5", 20)
	top.add_child(gold_label)
	level_label = _mk_label("Cấp 1", 20)
	top.add_child(level_label)
	round_label = _mk_label("Vòng 1", 20)
	top.add_child(round_label)
	timer_label = _mk_label("Chuẩn bị: 30s", 20)
	top.add_child(timer_label)
	streak_label = _mk_label("", 20)
	top.add_child(streak_label)
	# Left panel: synergy + opponents + messages.
	var left := VBoxContainer.new()
	left.position = Vector2(8, 52)
	left.size = Vector2(232, 420)
	left.add_theme_constant_override("separation", 6)
	canvas.add_child(left)
	left.add_child(_mk_label("Hệ đang kích:", 18))
	synergy_label = _mk_label("", 16)
	synergy_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(synergy_label)
	left.add_child(_mk_label("Đối thủ:", 18))
	opponents_label = _mk_label("", 16)
	opponents_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(opponents_label)
	msg_label = _mk_label("Chào mừng đến Đấu Trường Nhân Quả!", 16)
	msg_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(msg_label)
	# Right panel: shop + bench + actions.
	var right := VBoxContainer.new()
	right.position = Vector2(716, 52)
	right.size = Vector2(556, 430)
	right.add_theme_constant_override("separation", 4)
	canvas.add_child(right)
	right.add_child(_mk_label("SHOP — bấm để mua", 18))
	var shop_row := HBoxContainer.new()
	shop_row.add_theme_constant_override("separation", 4)
	right.add_child(shop_row)
	for i in range(5):
		var b := Button.new()
		b.custom_minimum_size = Vector2(106, 128)
		b.text = "—"
		b.pressed.connect(_on_shop_pressed.bind(i))
		shop_row.add_child(b)
		shop_btns.append(b)
	var shop_actions := HBoxContainer.new()
	shop_actions.add_theme_constant_override("separation", 8)
	right.add_child(shop_actions)
	reroll_btn = Button.new()
	reroll_btn.text = "Làm mới (2 vàng)"
	reroll_btn.pressed.connect(_on_reroll_pressed)
	shop_actions.add_child(reroll_btn)
	lock_btn = CheckButton.new()
	lock_btn.text = "Khóa shop"
	lock_btn.toggled.connect(_on_lock_toggled)
	shop_actions.add_child(lock_btn)
	buy_xp_btn = Button.new()
	buy_xp_btn.text = "Mua 4 XP (4 vàng)"
	buy_xp_btn.pressed.connect(_on_buy_xp_pressed)
	shop_actions.add_child(buy_xp_btn)
	right.add_child(_mk_label("GHẾ DỰ BỊ — bấm để chọn", 18))
	var bench_row := HBoxContainer.new()
	bench_row.add_theme_constant_override("separation", 4)
	right.add_child(bench_row)
	for i in range(9):
		var b2 := Button.new()
		b2.custom_minimum_size = Vector2(58, 58)
		b2.text = ""
		b2.pressed.connect(_on_bench_pressed.bind(i))
		bench_row.add_child(b2)
		bench_btns.append(b2)
	var act_row := HBoxContainer.new()
	act_row.add_theme_constant_override("separation", 8)
	right.add_child(act_row)
	sell_btn = Button.new()
	sell_btn.text = "Bán tướng đã chọn"
	sell_btn.pressed.connect(_on_sell_pressed)
	act_row.add_child(sell_btn)
	deselect_btn = Button.new()
	deselect_btn.text = "Bỏ chọn"
	deselect_btn.pressed.connect(_on_deselect_pressed)
	act_row.add_child(deselect_btn)
	start_btn = Button.new()
	start_btn.text = "BẮT ĐẦU COMBAT"
	start_btn.custom_minimum_size = Vector2(220, 48)
	start_btn.add_theme_font_size_override("font_size", 20)
	start_btn.pressed.connect(_on_start_combat_pressed)
	right.add_child(start_btn)
	var dbg_row := HBoxContainer.new()
	dbg_row.add_theme_constant_override("separation", 8)
	right.add_child(dbg_row)
	var auto_btn := Button.new()
	auto_btn.text = "Tự đánh (auto-match)"
	auto_btn.pressed.connect(_on_auto_match_pressed)
	dbg_row.add_child(auto_btn)
	var sample_btn := Button.new()
	sample_btn.text = "Xem combat mẫu 3v3"
	sample_btn.pressed.connect(_on_sample_pressed)
	dbg_row.add_child(sample_btn)
	# Round result panel (hidden).
	result_panel = CenterContainer.new()
	result_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	result_panel.visible = false
	canvas.add_child(result_panel)
	var rp := PanelContainer.new()
	rp.custom_minimum_size = Vector2(520, 240)
	result_panel.add_child(rp)
	var rv := VBoxContainer.new()
	rp.add_child(rv)
	rv.add_child(_mk_label("Kết quả vòng", 22))
	result_label = _mk_label("", 18)
	result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rv.add_child(result_label)
	var next_btn := Button.new()
	next_btn.text = "Sang vòng sau"
	next_btn.pressed.connect(_on_next_round_pressed)
	rv.add_child(next_btn)
	# Game over panel (hidden).
	gameover_panel = CenterContainer.new()
	gameover_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	gameover_panel.visible = false
	canvas.add_child(gameover_panel)
	var gp := PanelContainer.new()
	gp.custom_minimum_size = Vector2(520, 320)
	gameover_panel.add_child(gp)
	var gv := VBoxContainer.new()
	gp.add_child(gv)
	gameover_title = _mk_label("Kết thúc trận", 24)
	gv.add_child(gameover_title)
	gameover_label = _mk_label("", 18)
	gameover_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	gv.add_child(gameover_label)
	var again_btn := Button.new()
	again_btn.text = "Chơi lại"
	again_btn.pressed.connect(_on_play_again_pressed)
	gv.add_child(again_btn)

# ------------------------------------------------------------------ helpers

func _msg(text: String) -> void:
	msg_label.text = text
	print("[M1_GUI] ", text)

func _thumb(uid: String, kind: String) -> Texture2D:
	var key := kind + ":" + uid
	if _tex_cache.has(key):
		return _tex_cache[key]
	var tex: Texture2D = null
	if kind == "portrait":
		tex = M1View.load_portrait_texture(uid)
	else:
		tex = M1View.load_image_texture("res://assets/%s_skill.png" % uid)
	if tex == null:
		_tex_cache[key] = null
		return null
	var img := tex.get_image()
	var target := 72 if kind == "portrait" else 56
	img.resize(target, target)
	var small := ImageTexture.create_from_image(img)
	_tex_cache[key] = small
	return small

func _cell_at_point(p: Vector2) -> int:
	var best := -1
	var best_d := 34.0
	for i in range(56):
		var d := p.distance_to(M1View.hex_to_pixel(i))
		if d < best_d:
			best_d = d
			best = i
	return best

func _board_unit_defs() -> Array:
	var out: Array = []
	for u in M1Economy.board_units(human):
		out.append(M1Data.unit_by_id(units_data, String(u.get("unit_id", ""))))
	return out

func _first_filled_shop_slot() -> int:
	var shop: Array = human.get("shop", [])
	for i in range(shop.size()):
		if String(shop[i]) != "":
			return i
	return -1

func _cheapest_filled_shop_slot() -> int:
	var shop: Array = human.get("shop", [])
	var best := -1
	var best_cost := 99
	for i in range(shop.size()):
		var uid := String(shop[i])
		if uid == "":
			continue
		var d := M1Data.unit_by_id(units_data, uid)
		var c := int(d.get("cost", 99))
		if c < best_cost:
			best_cost = c
			best = i
	return best

func _clear_selection() -> void:
	selected = {"zone": "", "index": -1}

# ------------------------------------------------------------------ refresh

func _draw() -> void:
	# Prep board hex outlines (visual only). Hidden during combat because
	# M1CombatView draws its own board then.
	if phase == PHASE_COMBAT:
		return
	for idx in range(56):
		var center := M1View.hex_to_pixel(idx)
		var pts := PackedVector2Array()
		for k in range(6):
			var ang := deg_to_rad(60.0 * float(k))
			pts.append(center + Vector2(cos(ang), sin(ang)) * M1View.HEX_SIZE * 0.96)
		pts.append(pts[0])
		var row := M1Hex.index_to_row(idx)
		var col := Color(1, 1, 1, 0.14)
		if row < 4:
			col = Color(0.4, 0.9, 0.5, 0.28)  # half the player can use
		draw_polyline(pts, col, 1.0)

func _refresh_board_tokens() -> void:
	for child in tokens_root.get_children():
		child.queue_free()
	if human.is_empty():
		return
	var board: Array = human.get("board", [])
	for cell in range(board.size()):
		var u = board[cell]
		if u == null:
			continue
		var d := M1Data.unit_by_id(units_data, String(u.get("unit_id", "")))
		var root := Node2D.new()
		root.position = M1View.hex_to_pixel(cell)
		tokens_root.add_child(root)
		var spr := Sprite2D.new()
		var tex := M1View.load_portrait_texture(String(u.get("unit_id", "")))
		if tex != null:
			spr.texture = tex
			var s := 44.0 / maxf(1.0, float(tex.get_width()))
			spr.scale = Vector2(s, s)
		else:
			spr.texture = _circle_tex
			spr.modulate = M1View.nation_color(String(d.get("nation_id", "")))
			spr.scale = Vector2(0.7, 0.7)
		if String(selected.get("zone", "")) == "BOARD" and int(selected.get("index", -1)) == cell:
			spr.modulate = Color(1.0, 0.9, 0.3)
		root.add_child(spr)
		var star := Label.new()
		star.text = "★".repeat(int(u.get("star", 1)))
		star.add_theme_font_size_override("font_size", 13)
		star.position = Vector2(-14, -34)
		root.add_child(star)
		var nm := Label.new()
		nm.text = String(d.get("name", "?"))
		nm.add_theme_font_size_override("font_size", 11)
		nm.position = Vector2(-26, 24)
		root.add_child(nm)

func _refresh_ui() -> void:
	if human.is_empty():
		return
	hp_label.text = "Máu: %d/100" % int(human.get("hp", 0))
	var gold: int = int(human.get("gold", 0))
	var interest: int = mini(int(balance.get("interest_cap", 5)), gold / 10 * int(balance.get("interest_per_10_gold", 1)))
	gold_label.text = "Vàng: %d (+%d lãi)" % [gold, interest]
	var level: int = int(human.get("level", 1))
	var xp_total: int = int(human.get("xp_total", 0))
	var table: Array = M1Data.xp_table(balance)
	if level >= int(balance.get("level_cap", 9)):
		level_label.text = "Cấp %d (MAX)" % level
	else:
		level_label.text = "Cấp %d (XP %d/%d)" % [level, xp_total, int(table[level])]
	round_label.text = "Vòng %d — GĐ %d (%s)" % [int(round_info.get("round", 1)), int(round_info.get("stage", 1)), String(round_info.get("type", "?"))]
	timer_label.text = "Chuẩn bị: %ds" % int(ceil(maxf(prep_timer, 0.0))) if phase == PHASE_PREP else ("Combat" if phase == PHASE_COMBAT else "")
	var streak: int = int(human.get("streak", 0))
	var sres: String = String(human.get("streak_result", ""))
	streak_label.text = "Chuỗi %s x%d" % [("Thắng" if sres == "W" else "Thua"), streak] if streak >= 2 else ""
	# Synergy panel (board units only, tiers 2/4/6).
	var syn := M1Synergy.compute(_board_unit_defs(), balance)
	var lines: Array = []
	for k in (syn.get("nation_levels", {}) as Dictionary).keys():
		var t: int = int((syn.get("nation_levels", {}) as Dictionary).get(k, 0))
		if t >= 2:
			lines.append("%s: mốc %d" % [String(k), t])
	for k in (syn.get("class_levels", {}) as Dictionary).keys():
		var t2: int = int((syn.get("class_levels", {}) as Dictionary).get(k, 0))
		if t2 >= 2:
			lines.append("%s: mốc %d" % [String(k), t2])
	if lines.is_empty():
		lines.append("Chưa kích hệ nào (cần 2 tướng cùng nước/lớp).")
	lines.append("Bàn: %d/%d tướng" % [M1Economy.board_count(human), level])
	synergy_label.text = "\n".join(lines)
	# Opponents panel.
	var opp: Array = []
	if mm != null:
		for p in mm.players:
			opp.append("%s: %d máu, bàn %d%s" % [String(p.get("name", "?")), int(p.get("hp", 0)), M1Economy.board_count(p), "" if bool(p.get("alive", false)) else " (đã loại)"])
	opponents_label.text = "\n".join(opp)
	# Shop buttons.
	var shop: Array = human.get("shop", [])
	var bench: Array = human.get("bench", [])
	for i in range(shop_btns.size()):
		var b := shop_btns[i] as Button
		if i >= shop.size():
			b.text = "—"
			b.disabled = true
			b.icon = null
			continue
		var uid := String(shop[i])
		if uid == "":
			b.text = "(đã mua)"
			b.disabled = true
			b.icon = null
			continue
		var d := M1Data.unit_by_id(units_data, uid)
		var cost: int = int(d.get("cost", 1))
		b.text = "%s\n%d vàng" % [String(d.get("name", "?")), cost]
		b.icon = _thumb(uid, "portrait")
		b.disabled = phase != PHASE_PREP or gold < cost or bench.size() >= 9
	# Bench buttons.
	for i in range(bench_btns.size()):
		var b2 := bench_btns[i] as Button
		if i >= bench.size():
			b2.text = ""
			b2.icon = null
			b2.disabled = true
			continue
		var bu: Dictionary = bench[i]
		var bd := M1Data.unit_by_id(units_data, String(bu.get("unit_id", "")))
		b2.text = "★%d" % int(bu.get("star", 1))
		b2.icon = _thumb(String(bu.get("unit_id", "")), "portrait")
		b2.disabled = phase != PHASE_PREP
		if String(selected.get("zone", "")) == "BENCH" and int(selected.get("index", -1)) == i:
			b2.text = "★%d ✓" % int(bu.get("star", 1))
	reroll_btn.disabled = phase != PHASE_PREP or gold < int(balance.get("reroll_cost", 2))
	buy_xp_btn.disabled = phase != PHASE_PREP or gold < int(balance.get("xp_buy_cost", 4)) or level >= int(balance.get("level_cap", 9))
	lock_btn.button_pressed = bool(human.get("lock_shop", false))
	lock_btn.disabled = phase != PHASE_PREP
	sell_btn.disabled = phase != PHASE_PREP or String(selected.get("zone", "")) == ""
	deselect_btn.disabled = String(selected.get("zone", "")) == ""
	start_btn.disabled = phase != PHASE_PREP
	_refresh_board_tokens()
	queue_redraw()

# ------------------------------------------------------------------ actions
# Every action below goes through M1Economy / M1Match and then refreshes
# the UI. Buttons and the headless self-test call the same functions.

func gui_new_match(match_seed: int) -> void:
	mm = M1Match.new(match_seed, data)
	human = mm.human_player()
	_finalized = false
	_final_ranking = []
	_sample_playing = false
	result_panel.visible = false
	gameover_panel.visible = false
	combat_view.visible = false
	tokens_root.visible = true
	round_info = mm.manual_begin_round()
	phase = PHASE_PREP
	prep_timer = float(balance.get("prep_seconds", 30))
	_clear_selection()
	_msg("Trận mới bắt đầu (seed %d). Vòng 1: đánh quái PvE — mua tướng rồi bấm BẮT ĐẦU COMBAT." % match_seed)
	_refresh_ui()

func gui_buy_shop(slot: int) -> bool:
	if phase != PHASE_PREP or mm == null:
		return false
	var shop: Array = human.get("shop", [])
	if slot < 0 or slot >= shop.size() or String(shop[slot]) == "":
		_msg("Ô shop trống.")
		return false
	var d := M1Data.unit_by_id(units_data, String(shop[slot]))
	var ok := M1Economy.buy_shop_slot(human, units_data, mm.pool, slot, balance)
	if ok:
		_msg("Đã mua %s (%d vàng). Còn %d vàng." % [String(d.get("name", "?")), int(d.get("cost", 1)), int(human.get("gold", 0))])
	else:
		_msg("Không mua được (thiếu vàng hoặc ghế dự bị đầy).")
	_refresh_ui()
	return ok

func gui_reroll() -> bool:
	if phase != PHASE_PREP or mm == null:
		return false
	var ok := M1Economy.roll_shop(human, units_data, mm.pool, mm.rng, balance, false)
	if ok:
		_msg("Đã làm mới shop (-2 vàng). Còn %d vàng." % int(human.get("gold", 0)))
	else:
		_msg("Không đủ vàng làm mới shop.")
	_refresh_ui()
	return ok

func gui_buy_xp() -> bool:
	if phase != PHASE_PREP or mm == null:
		return false
	var before := int(human.get("level", 1))
	var ok := M1Economy.buy_xp(human, balance)
	if ok:
		_msg("Đã mua 4 XP (-4 vàng). Cấp %d -> %d." % [before, int(human.get("level", 1))])
	else:
		_msg("Không mua được XP (thiếu vàng hoặc đã cấp tối đa).")
	_refresh_ui()
	return ok

func gui_toggle_lock(v: bool) -> void:
	if mm == null:
		return
	human["lock_shop"] = v
	_msg("Shop đã %s." % ("khóa (giữ nguyên vòng sau)" if v else "mở khóa"))
	_refresh_ui()

func gui_place_bench_to_board(bench_index: int, cell: int) -> bool:
	if phase != PHASE_PREP or mm == null:
		return false
	var ok := M1Economy.place_on_board(human, bench_index, cell)
	if ok:
		_msg("Đã xếp tướng lên bàn (ô %d)." % cell)
	else:
		_msg("Không xếp được (bàn đã đủ theo cấp, hoặc ô đã có tướng).")
	_refresh_ui()
	return ok

func gui_move_board_unit(from_cell: int, to_cell: int) -> bool:
	if phase != PHASE_PREP or mm == null:
		return false
	var board: Array = human.get("board", [])
	if from_cell < 0 or from_cell >= board.size() or to_cell < 0 or to_cell >= board.size():
		return false
	if board[from_cell] == null:
		return false
	var tmp = board[to_cell]
	board[to_cell] = board[from_cell]
	board[from_cell] = tmp
	_msg("Đã di chuyển tướng trên bàn (ô %d -> %d)." % [from_cell, to_cell])
	_refresh_ui()
	return true

func gui_return_to_bench(cell: int) -> bool:
	if phase != PHASE_PREP or mm == null:
		return false
	var board: Array = human.get("board", [])
	var bench: Array = human.get("bench", [])
	if cell < 0 or cell >= board.size() or board[cell] == null:
		return false
	if bench.size() >= 9:
		_msg("Ghế dự bị đã đầy.")
		return false
	bench.append(board[cell])
	board[cell] = null
	_msg("Đã đưa tướng về ghế dự bị.")
	_refresh_ui()
	return true

func gui_sell_selected() -> bool:
	if phase != PHASE_PREP or mm == null:
		return false
	var zone := String(selected.get("zone", ""))
	var index := int(selected.get("index", -1))
	if zone == "":
		_msg("Chưa chọn tướng nào để bán.")
		return false
	var unit: Dictionary = {}
	if zone == "BENCH":
		var bench: Array = human.get("bench", [])
		if index < 0 or index >= bench.size():
			return false
		unit = bench[index]
	elif zone == "BOARD":
		var board: Array = human.get("board", [])
		if index < 0 or index >= board.size() or board[index] == null:
			return false
		unit = board[index]
	else:
		return false
	var d := M1Data.unit_by_id(units_data, String(unit.get("unit_id", "")))
	var price := M1Data.sell_price(balance, int(d.get("cost", 1)), int(unit.get("star", 1)))
	var ok := M1Economy.sell_unit(human, mm.pool, zone, index, units_data, balance)
	if ok:
		_msg("Đã bán %s (+%d vàng)." % [String(d.get("name", "?")), price])
		_clear_selection()
	_refresh_ui()
	return ok

func gui_start_combat() -> Dictionary:
	if phase != PHASE_PREP or mm == null:
		return {}
	var summary: Dictionary = mm.manual_resolve_round()
	round_summary = summary
	var hc: Dictionary = summary.get("human_combat", {})
	if hc.is_empty():
		phase = PHASE_RESULT
		_show_result_panel()
		return summary
	var all: Array = []
	all.append_array(hc.get("defs_a", []))
	all.append_array(hc.get("defs_b", []))
	tokens_root.visible = false
	combat_view.visible = true
	combat_view.speed = 4.0
	combat_view.play_combat(all, hc.get("result", {}), hc.get("casters", {}))
	_sample_playing = false
	phase = PHASE_COMBAT
	_refresh_ui()
	return summary

func _on_combat_finished() -> void:
	if phase != PHASE_COMBAT:
		return
	combat_view.visible = false
	tokens_root.visible = true
	if _sample_playing:
		_sample_playing = false
		phase = PHASE_PREP
		_msg("Đã xem xong combat mẫu.")
		_refresh_ui()
		return
	phase = PHASE_RESULT
	_show_result_panel()

func _show_result_panel() -> void:
	var pr: Dictionary = (round_summary.get("player_results", {}) as Dictionary).get(0, {})
	var won: bool = bool(pr.get("won", false))
	var lines: Array = []
	lines.append("Vòng %d (%s) — %s" % [int(round_summary.get("round", 0)), String(round_summary.get("type", "")), "THẮNG" if won else "THUA"])
	lines.append("Mất %d máu nhà (còn %d/100). Thu nhập +%d vàng (hiện có %d)." % [int(pr.get("damage", 0)), int(human.get("hp", 0)), int(pr.get("income", 0)), int(human.get("gold", 0))])
	lines.append("Cấp %d — bàn %d tướng." % [int(human.get("level", 1)), M1Economy.board_count(human)])
	for e in round_summary.get("eliminated", []):
		lines.append("%s bị loại (hạng #%d)." % [String(e.get("name", "?")), int(e.get("rank", 0))])
	result_label.text = "\n".join(lines)
	result_panel.visible = true
	_refresh_ui()

func gui_next_round() -> void:
	result_panel.visible = false
	if mm == null:
		return
	if mm.manual_is_game_over() or not bool(human.get("alive", false)):
		_show_game_over()
		return
	round_info = mm.manual_begin_round()
	phase = PHASE_PREP
	prep_timer = float(balance.get("prep_seconds", 30))
	_clear_selection()
	_msg("Vòng %d (%s) — chuẩn bị 30s." % [int(round_info.get("round", 0)), String(round_info.get("type", ""))])
	_refresh_ui()

func _show_game_over() -> void:
	phase = PHASE_GAMEOVER
	var ranking: Array = []
	var my_rank := 0
	if mm.manual_is_game_over() and not _finalized:
		var fin: Dictionary = mm.manual_finalize()
		_finalized = true
		_final_ranking = fin.get("ranking", [])
		ranking = _final_ranking
	else:
		ranking = _final_ranking
	if ranking.is_empty():
		# Human eliminated while bots still fight: provisional standings.
		var alive: Array = mm.alive_players()
		alive.sort_custom(func(a, b): return int(a.get("hp", 0)) > int(b.get("hp", 0)))
		var done: Array = []
		for r in mm.ranking:
			done.append(r)
		var rank := done.size() + 1
		for p in alive:
			done.append({"id": p.get("id", -1), "name": p.get("name", "?"), "rank": rank})
			rank += 1
		ranking = done
	for r in ranking:
		if int(r.get("id", -1)) == 0:
			my_rank = int(r.get("rank", 0))
	if my_rank == 0:
		my_rank = 8
	var top1 := "?"
	if not ranking.is_empty():
		top1 = String(ranking[0].get("name", "?"))
	gameover_title.text = "Kết thúc trận — Bạn hạng #%d (Top 1: %s)" % [my_rank, top1]
	var lines: Array = []
	for r in ranking:
		lines.append("#%d %s" % [int(r.get("rank", 0)), String(r.get("name", "?"))])
	gameover_label.text = "\n".join(lines)
	gameover_panel.visible = true
	_refresh_ui()

# ------------------------------------------------------------------ input

func _unhandled_input(event: InputEvent) -> void:
	if phase != PHASE_PREP or mm == null:
		return
	if event is InputEventMouseButton and event.pressed:
		var cell := _cell_at_point((event as InputEventMouseButton).position)
		if cell < 0:
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			_on_board_cell_clicked(cell)
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			# Right-click a unit to sell it fast.
			var board: Array = human.get("board", [])
			if board[cell] != null:
				selected = {"zone": "BOARD", "index": cell}
				gui_sell_selected()

func _on_board_cell_clicked(cell: int) -> void:
	var board: Array = human.get("board", [])
	var bench: Array = human.get("bench", [])
	var zone := String(selected.get("zone", ""))
	var index := int(selected.get("index", -1))
	if zone == "BENCH":
		if index < 0 or index >= bench.size():
			_clear_selection()
			_refresh_ui()
			return
		if board[cell] == null:
			if gui_place_bench_to_board(index, cell):
				_clear_selection()
		else:
			# Swap bench unit with the board unit.
			var tmp = board[cell]
			board[cell] = bench[index]
			bench[index] = tmp
			_msg("Đã đổi tướng ghế dự bị với tướng trên bàn.")
			_clear_selection()
			_refresh_ui()
	elif zone == "BOARD":
		if index == cell:
			_clear_selection()
		elif index < 0 or index >= board.size() or board[index] == null:
			_clear_selection()
		else:
			gui_move_board_unit(index, cell)
			_clear_selection()
		_refresh_ui()
	else:
		if board[cell] != null:
			selected = {"zone": "BOARD", "index": cell}
			_refresh_ui()

func _on_shop_pressed(slot: int) -> void:
	gui_buy_shop(slot)

func _on_bench_pressed(index: int) -> void:
	if phase != PHASE_PREP or mm == null:
		return
	var zone := String(selected.get("zone", ""))
	var sel := int(selected.get("index", -1))
	var bench: Array = human.get("bench", [])
	if index < 0 or index >= bench.size():
		return
	if zone == "BOARD":
		# Return the selected board unit to this bench slot (append).
		gui_return_to_bench(sel)
		_clear_selection()
	elif zone == "BENCH":
		if sel == index:
			_clear_selection()
		else:
			var tmp = bench[sel]
			bench[sel] = bench[index]
			bench[index] = tmp
			_clear_selection()
			_msg("Đã đổi chỗ 2 tướng trên ghế dự bị.")
		_refresh_ui()
	else:
		selected = {"zone": "BENCH", "index": index}
		_refresh_ui()

func _on_reroll_pressed() -> void:
	gui_reroll()

func _on_lock_toggled(v: bool) -> void:
	gui_toggle_lock(v)

func _on_buy_xp_pressed() -> void:
	gui_buy_xp()

func _on_sell_pressed() -> void:
	gui_sell_selected()

func _on_deselect_pressed() -> void:
	_clear_selection()
	_refresh_ui()

func _on_start_combat_pressed() -> void:
	gui_start_combat()

func _on_next_round_pressed() -> void:
	gui_next_round()

func _on_play_again_pressed() -> void:
	gameover_panel.visible = false
	gui_new_match(int(Time.get_unix_time_from_system()) % 100000000 + 1)

func _on_auto_match_pressed() -> void:
	var auto := M1Match.new(int(Time.get_unix_time_from_system()) % 100000000 + 1, data)
	var res: Dictionary = auto.run_match()
	var lines: Array = []
	for r in res.get("ranking", []):
		lines.append("#%d %s" % [int(r.get("rank", 0)), String(r.get("name", "?"))])
	gameover_title.text = "Trận tự động — Top 1: %s (%d vòng)" % [String((res.get("top1", {}) as Dictionary).get("name", "?")), int(res.get("rounds", 0))]
	gameover_label.text = "\n".join(lines)
	gameover_panel.visible = true
	phase = PHASE_GAMEOVER
	_msg("Trận tự động xong: Top 1 %s." % String((res.get("top1", {}) as Dictionary).get("name", "?")))

func _on_sample_pressed() -> void:
	if phase != PHASE_PREP or mm == null:
		return
	var parts := _build_sample_combat(777)
	var all: Array = []
	all.append_array(parts.get("defs_a", []))
	all.append_array(parts.get("defs_b", []))
	tokens_root.visible = false
	combat_view.visible = true
	combat_view.speed = 4.0
	combat_view.play_combat(all, parts.get("result", {}), parts.get("casters", {}))
	_sample_playing = true
	phase = PHASE_COMBAT
	_refresh_ui()

# Fixed 3v3 demo combat (same lineups as the old m1_main sample).
func _build_sample_combat(combat_seed: int) -> Dictionary:
	var picks_a: Array = ["vn_thanh_giong", "vn_yet_kieu", "vn_an_duong_vuong"]
	var picks_b: Array = ["cn_quan_vu", "cn_kinh_kha", "cn_hau_nghe"]
	var cells_a: Array = [17, 18, 10]
	var cells_b: Array = [38, 39, 45]
	var casters := {}
	var defs_a: Array = []
	var defs_b: Array = []
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
	var initial_a: Array = defs_a.duplicate(true)
	var initial_b: Array = defs_b.duplicate(true)
	var result := M1Sim.run_combat(defs_a, defs_b, combat_seed, balance)
	return {"defs_a": initial_a, "defs_b": initial_b, "result": result, "casters": casters}

# ------------------------------------------------------------------ loop

func _process(delta: float) -> void:
	if phase == PHASE_PREP and not _headless:
		prep_timer -= delta
		timer_label.text = "Chuẩn bị: %ds" % int(ceil(maxf(prep_timer, 0.0)))
		if prep_timer <= 0.0:
			_msg("Hết 30s chuẩn bị — tự động bắt đầu combat.")
			gui_start_combat()
	elif phase == PHASE_COMBAT:
		if combat_view.playing == false and combat_view.cursor >= combat_view.timeline.size() and combat_view.timeline.size() > 0:
			_on_combat_finished()

# ------------------------------------------------------------------ headless

func _mcheck(ok: bool, cond: bool, label: String) -> bool:
	if cond:
		print("M1_MANUAL_CHECK ok %s" % label)
	else:
		print("M1_MANUAL_CHECK FAIL %s" % label)
	return ok and cond

func _step_combat_to_end() -> bool:
	for i in range(300):
		if combat_view.timeline.size() > 0 and not combat_view.playing and combat_view.cursor >= combat_view.timeline.size():
			return true
		combat_view._process(0.25)
	return combat_view.timeline.size() > 0 and not combat_view.playing and combat_view.cursor >= combat_view.timeline.size()

func _manual_self_test() -> bool:
	var ok := true
	print("M1_MANUAL_TEST start")
	# --- Round 1 (PvE): buy 2, reroll, place 1 (cap = level 1), combat.
	gui_new_match(20261121)
	ok = _mcheck(ok, phase == PHASE_PREP, "phase PREP khi bat dau")
	ok = _mcheck(ok, int(human.get("gold", -1)) == 5, "gold khoi diem 5")
	ok = _mcheck(ok, int(human.get("level", -1)) == 1, "level 1")
	ok = _mcheck(ok, int(human.get("hp", -1)) == 100, "hp 100")
	var shop: Array = human.get("shop", [])
	ok = _mcheck(ok, shop.size() == 5, "shop 5 o")
	var filled := 0
	for s in shop:
		if String(s) != "":
			filled += 1
	ok = _mcheck(ok, filled == 5, "shop day 5 tuong vong 1")
	ok = _mcheck(ok, gui_buy_shop(0), "mua shop[0]")
	ok = _mcheck(ok, int(human.get("gold", 0)) == 4, "tru 1 vang khi mua tuong 1 vang")
	ok = _mcheck(ok, (human.get("bench", []) as Array).size() == 1, "bench 1 sau 1 lan mua")
	ok = _mcheck(ok, gui_buy_shop(1), "mua shop[1]")
	ok = _mcheck(ok, int(human.get("gold", 0)) == 3, "gold 3 sau 2 lan mua")
	ok = _mcheck(ok, (human.get("bench", []) as Array).size() == 2, "bench 2 sau 2 lan mua")
	ok = _mcheck(ok, gui_reroll(), "lam moi shop")
	ok = _mcheck(ok, int(human.get("gold", 0)) == 1, "tru 2 vang lam moi shop")
	ok = _mcheck(ok, (human.get("shop", []) as Array).size() == 5, "shop van 5 o sau lam moi")
	ok = _mcheck(ok, gui_place_bench_to_board(0, 17), "xep bench[0] len o 17")
	ok = _mcheck(ok, M1Economy.board_count(human) == 1, "ban 1 tuong")
	ok = _mcheck(ok, not gui_place_bench_to_board(0, 18), "khong xep tuong thu 2 khi cap 1 chi cho 1 tuong")
	ok = _mcheck(ok, M1Economy.board_count(human) == 1, "ban van 1 tuong")
	ok = _mcheck(ok, gui_move_board_unit(17, 18), "doi cho tuong tren ban 17->18")
	ok = _mcheck(ok, not gui_buy_xp(), "mua XP that bai khi chi co 1 vang")
	ok = _mcheck(ok, not gui_place_bench_to_board(0, 10), "xep them that bai khi ban day theo cap")
	var s1 := gui_start_combat()
	ok = _mcheck(ok, not s1.is_empty(), "start combat vong 1")
	ok = _mcheck(ok, int(s1.get("round", -1)) == 1, "summary vong 1")
	ok = _mcheck(ok, not (s1.get("human_combat", {}) as Dictionary).is_empty(), "co human_combat de chieu vong 1")
	ok = _mcheck(ok, _step_combat_to_end(), "chieu combat vong 1 xong")
	_on_combat_finished()
	ok = _mcheck(ok, phase == PHASE_RESULT, "phase RESULT sau combat vong 1")
	ok = _mcheck(ok, int(human.get("xp_total", -1)) == 2, "cong 2 XP sau vong 1")
	ok = _mcheck(ok, int(human.get("level", -1)) == 2, "len cap 2 (2 XP)")
	ok = _mcheck(ok, int(human.get("gold", -1)) == 6, "gold 1 + thu nhap 5 = 6")
	# --- Round 2 (PvP): buy XP, buy + sell, board-full check, combat.
	gui_next_round()
	ok = _mcheck(ok, phase == PHASE_PREP and int(round_info.get("round", -1)) == 2, "sang vong 2 prep")
	ok = _mcheck(ok, gui_buy_xp(), "mua XP vong 2")
	ok = _mcheck(ok, int(human.get("gold", 0)) == 2, "tru 4 vang mua XP")
	ok = _mcheck(ok, int(human.get("xp_total", 0)) == 6, "xp_total 6")
	ok = _mcheck(ok, int(human.get("level", 0)) == 3, "len cap 3 (6 XP)")
	var gb := int(human.get("gold", 0))
	var slot := _cheapest_filled_shop_slot()
	ok = _mcheck(ok, slot >= 0, "con o shop co tuong de test ban")
	var cdef := M1Data.unit_by_id(units_data, String((human.get("shop", []) as Array)[slot]))
	var ccost := int(cdef.get("cost", 1))
	ok = _mcheck(ok, gui_buy_shop(slot), "mua 1 tuong vong 2")
	ok = _mcheck(ok, int(human.get("gold", 0)) == gb - ccost, "tru dung gia mua")
	selected = {"zone": "BENCH", "index": (human.get("bench", []) as Array).size() - 1}
	ok = _mcheck(ok, gui_sell_selected(), "ban tuong vua mua")
	ok = _mcheck(ok, int(human.get("gold", 0)) == gb, "ban 1 sao hoan dung gia goc")
	ok = _mcheck(ok, gui_buy_shop(_cheapest_filled_shop_slot()), "mua them 1 tuong")
	ok = _mcheck(ok, gui_place_bench_to_board(0, 10), "xep len o 10 -> ban 2 tuong")
	ok = _mcheck(ok, M1Economy.board_count(human) == 2, "ban 2 tuong")
	if int(human.get("gold", 0)) >= 1:
		ok = _mcheck(ok, gui_buy_shop(_cheapest_filled_shop_slot()), "mua them 1 tuong nua")
		ok = _mcheck(ok, gui_place_bench_to_board(0, 11), "xep len o 11 -> ban 3 tuong")
		ok = _mcheck(ok, M1Economy.board_count(human) == 3, "ban du 3 tuong = cap 3")
		ok = _mcheck(ok, not gui_place_bench_to_board(0, 12), "khong xep them duoc khi ban day theo cap")
		selected = {"zone": "BENCH", "index": (human.get("bench", []) as Array).size() - 1}
		gui_sell_selected()
	else:
		print("M1_MANUAL_CHECK skip test tran ban (het vang)")
	_refresh_ui()
	ok = _mcheck(ok, synergy_label.text.length() > 0, "panel synergy co noi dung")
	var s2 := gui_start_combat()
	ok = _mcheck(ok, int(s2.get("round", -1)) == 2, "start combat vong 2")
	ok = _mcheck(ok, not (s2.get("human_combat", {}) as Dictionary).is_empty(), "co human_combat vong 2")
	ok = _mcheck(ok, _step_combat_to_end(), "chieu combat vong 2 xong")
	_on_combat_finished()
	ok = _mcheck(ok, phase == PHASE_RESULT, "phase RESULT sau combat vong 2")
	print("M1_MANUAL_%s" % ("OK" if ok else "FAIL"))
	return ok

func _run_headless_all() -> void:
	print("M1_HEADLESS_TEST start (GUI)")
	var ok := _manual_self_test()
	# Legacy checks, reused from m1_main (same assertions as before).
	var legacy = M1Main.new()
	legacy.skip_auto_headless = true
	add_child(legacy)
	ok = legacy._sanity_checks() and ok
	ok = legacy._replay_check() and ok
	ok = legacy._view_check() and ok
	var _sum := legacy._run_match(20261121)
	if ok:
		print("M1_HEADLESS_OK")
	else:
		print("M1_HEADLESS_FAIL")
	get_tree().quit()
