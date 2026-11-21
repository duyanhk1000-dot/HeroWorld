extends Node2D

const HeroesDB = preload("res://scripts/heroes_data.gd")

# Co Nhan Pham Fantasy - Godot 4.7
# Ban 4x4, shop 5 o, bat dau 5 vang, moi round +5 vang, roll 2 vang
# 3 tuong giong nhau -> 2 sao -> 3 sao, he so 1.8^(sao-1)
# Round 1-6: Slime, Goblin, Orc, Boss Orc, AI 3 tuong, AI 4 tuong + Boss Rong lua

var gold := 5
var round_no := 1
var house_hp := 20
var max_round := 6
var shop: Array = []
var bench: Array = []
var board: Array = []
var items: Array = []
var rng := RandomNumberGenerator.new()

var status_label: Label
var gold_label: Label
var shop_box: HBoxContainer
var board_grid: GridContainer
var bench_box: HBoxContainer
var log_label: Label

func _ready() -> void:
	rng.randomize()
	board.resize(16)
	for i in range(16):
		board[i] = null
	roll_shop(true)
	_build_ui()
	_refresh_ui()
	print("CO_NHAN_PHAM_GODOT_READY round=%d gold=%d heroes=%d fennara=0.4.3" % [round_no, gold, HeroesDB.get_heroes().size()])
	# Headless: chay test tu dong 6 round roi thoat, de CI / Muse kiem tra
	if DisplayServer.get_name() == "headless":
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
	status_label.text = "Cờ Nhân Phẩm Fantasy - Round 1/6"
	status_label.add_theme_font_size_override("font_size", 28)
	root.add_child(status_label)
	gold_label = Label.new()
	gold_label.add_theme_font_size_override("font_size", 20)
	root.add_child(gold_label)
	var btn_row := HBoxContainer.new()
	root.add_child(btn_row)
	var roll_btn := Button.new()
	roll_btn.text = "Roll Shop (2 vàng)"
	roll_btn.pressed.connect(_on_roll_pressed)
	btn_row.add_child(roll_btn)
	var battle_btn := Button.new()
	battle_btn.text = "⚔️ Đánh Round"
	battle_btn.pressed.connect(_on_battle_pressed)
	btn_row.add_child(battle_btn)
	var shop_title := Label.new()
	shop_title.text = "Shop - bấm để mua, bấm tướng trên bàn để bán (1 vàng)"
	root.add_child(shop_title)
	shop_box = HBoxContainer.new()
	root.add_child(shop_box)
	var board_title := Label.new()
	board_title.text = "Bàn 4x4 - bấm ô shop rồi bấm ô bàn để xếp tướng"
	root.add_child(board_title)
	board_grid = GridContainer.new()
	board_grid.columns = 4
	root.add_child(board_grid)
	for i in range(16):
		var b := Button.new()
		b.text = "·"
		b.custom_minimum_size = Vector2(120, 52)
		b.pressed.connect(_on_board_pressed.bind(i))
		board_grid.add_child(b)
	var bench_title := Label.new()
	bench_title.text = "Bench"
	root.add_child(bench_title)
	bench_box = HBoxContainer.new()
	root.add_child(bench_box)
	log_label = Label.new()
	log_label.text = "Chào duyanh! Mua tướng, xếp bàn, rồi bấm Đánh Round."
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(log_label)

func _refresh_ui() -> void:
	if gold_label == null:
		return
	gold_label.text = "Vàng: %d   |   Máu nhà: %d/20   |   Round: %d/6   |   Đồ: %s" % [gold, house_hp, round_no, ", ".join(items) if items.size() > 0 else "chưa có"]
	status_label.text = "Cờ Nhân Phẩm Fantasy - Round %d/6 - %s" % [round_no, _round_name()]
	for c in shop_box.get_children():
		c.queue_free()
	for i in range(shop.size()):
		var h = shop[i]
		var b := Button.new()
		b.text = "%s %s\n%d vàng - %s" % [h["icon"], h["name"], h["cost"], h["faction"]]
		b.custom_minimum_size = Vector2(150, 56)
		b.pressed.connect(_on_shop_pressed.bind(i))
		shop_box.add_child(b)
	for i in range(16):
		var btn = board_grid.get_child(i) as Button
		var u = board[i]
		if u == null:
			btn.text = "·"
		else:
			btn.text = "%s %s ★%d" % [u["icon"], u["name"], u["star"]]
	for c in bench_box.get_children():
		c.queue_free()
	for i in range(bench.size()):
		var u = bench[i]
		var b := Button.new()
		b.text = "%s %s ★%d" % [u["icon"], u["name"], u["star"]]
		b.pressed.connect(_on_bench_pressed.bind(i))
		bench_box.add_child(b)

func _round_name() -> String:
	match round_no:
		1: return "2 Slime"
		2: return "3 Goblin"
		3: return "2 Orc + 1 Goblin"
		4: return "Boss Orc"
		5: return "Đội AI 3 tướng"
		_: return "Đội AI 4 tướng + Boss Rồng lửa"

func roll_shop(free: bool = false) -> void:
	if not free:
		if gold < 2:
			_log("Không đủ 2 vàng để roll!")
			return
		gold -= 2
	shop.clear()
	var heroes = HeroesDB.get_heroes()
	for i in range(5):
		shop.append(heroes[rng.randi_range(0, heroes.size() - 1)].duplicate())
	_refresh_ui()

func _on_roll_pressed() -> void:
	roll_shop(false)
	_log("Đã roll shop, còn %d vàng." % gold)

func _on_shop_pressed(idx: int) -> void:
	if idx >= shop.size():
		return
	var h = shop[idx]
	if gold < int(h["cost"]):
		_log("Không đủ vàng mua %s (%d vàng)." % [h["name"], int(h["cost"])])
		return
	gold -= int(h["cost"])
	shop.remove_at(idx)
	var unit = h.duplicate()
	unit["star"] = 1
	unit["cur_hp"] = int(h["hp"])
	bench.append(unit)
	_try_star_up()
	_log("Đã mua %s (%s). Âm thanh: %s" % [h["name"], h["skill"], h["sound"]])
	_refresh_ui()

func _on_bench_pressed(idx: int) -> void:
	if idx >= bench.size():
		return
	# Xep tuong bench dau tien vao o trong dau tien tren ban
	for i in range(16):
		if board[i] == null:
			board[i] = bench[idx]
			bench.remove_at(idx)
			_log("Đã xếp tướng lên bàn ô %d." % i)
			_refresh_ui()
			return
	_log("Bàn đã đầy!")

func _on_board_pressed(idx: int) -> void:
	if board[idx] == null:
		# Neu bench co tuong, xep len day
		if bench.size() > 0:
			board[idx] = bench[0]
			bench.remove_at(0)
			_refresh_ui()
		return
	# Bam lan nua = ban lay 1 vang
	var u = board[idx]
	board[idx] = null
	gold += 1
	_log("Đã bán %s, +1 vàng." % u["name"])
	_refresh_ui()

func _try_star_up() -> void:
	# 3 tuong 1 sao giong nhau -> 2 sao, 3 tuong 2 sao -> 3 sao. Chi tinh bench + board.
	var all_units: Array = []
	all_units.append_array(bench)
	for u in board:
		if u != null:
			all_units.append(u)
	var groups := {}
	for u in all_units:
		var key = "%s_%d" % [u["id"], int(u["star"])]
		if not groups.has(key):
			groups[key] = []
		groups[key].append(u)
	for key in groups.keys():
		if groups[key].size() >= 3 and int(groups[key][0]["star"]) < 3:
			var base = groups[key][0]
			var new_star = int(base["star"]) + 1
			# Xoa 3 tuong cu khoi bench/board
			var removed := 0
			for i in range(bench.size() - 1, -1, -1):
				if removed < 3 and bench[i]["id"] == base["id"] and int(bench[i]["star"]) == int(base["star"]):
					bench.remove_at(i)
					removed += 1
			for i in range(16):
				if removed < 3 and board[i] != null and board[i]["id"] == base["id"] and int(board[i]["star"]) == int(base["star"]):
					board[i] = null
					removed += 1
			var upgraded = base.duplicate()
			upgraded["star"] = new_star
			bench.append(upgraded)
			_log("LÊN SAO! %s lên ★%d (x%.2f chỉ số)" % [base["name"], new_star, HeroesDB.star_multiplier(new_star)])
			_try_star_up()
			return

func _team_power(units: Array, is_enemy: bool) -> float:
	var total := 0.0
	var syn = HeroesDB.synergy_bonus(board) if not is_enemy else {"armor": 0.0, "ap": 0.0, "aspd": 0.0}
	for u in units:
		if u == null:
			continue
		var mult = HeroesDB.star_multiplier(int(u.get("star", 1))) if u.has("star") else 1.0
		var atk = float(u["atk"]) * mult * (1.0 + float(syn["ap"])) * (1.0 + float(syn["aspd"]))
		var hp = float(u["hp"]) * mult * (1.0 + float(syn["armor"]))
		total += atk * 2.0 + hp * 0.15
	return total

func _on_battle_pressed() -> void:
	var placed: Array = []
	for u in board:
		if u != null:
			placed.append(u)
	if placed.is_empty():
		_log("Chưa có tướng trên bàn! Mua rồi bấm tướng ở Bench để xếp lên bàn.")
		return
	_do_battle(placed)

func _do_battle(placed: Array) -> bool:
	var enemies = HeroesDB.get_enemies_for_round(round_no)
	var my_power = _team_power(placed, false)
	var enemy_power := 0.0
	for e in enemies:
		enemy_power += float(e["atk"]) * 2.0 + float(e["hp"]) * 0.15
	var win = my_power >= enemy_power
	var syn = HeroesDB.synergy_bonus(board)
	if win:
		gold += 5 + 1
		items.append(_random_item())
		_log("THẮNG Round %d! Sức mạnh %.0f vs %.0f. +6 vàng, rơi đồ: %s. Synergy: %s" % [round_no, my_power, enemy_power, items[items.size() - 1], str(syn["counts"])])
	else:
		house_hp -= 2
		gold += 5
		_log("THUA Round %d! Sức mạnh %.0f vs %.0f. -2 máu nhà, +5 vàng." % [round_no, my_power, enemy_power])
	round_no += 1
	if round_no > max_round:
		if house_hp > 0:
			_log("CHIẾN THẮNG! Bạn đã vượt qua 6 round. Máu nhà còn %d." % house_hp)
			status_label.text = "🏆 CHIẾN THẮNG! Chơi lại bằng cách chạy lại game."
		else:
			_log("THUA CUỘC! Máu nhà đã hết.")
			status_label.text = "💀 THUA CUỘC! Chơi lại bằng cách chạy lại game."
		_refresh_ui()
		return win
	roll_shop(true)
	_refresh_ui()
	return win

func _random_item() -> String:
	var pool = ["Kiếm +15 công", "Khiên +150 máu", "Trượng +20 phép"]
	return pool[rng.randi_range(0, pool.size() - 1)]

func _log(msg: String) -> void:
	print("[CoNhanPham] ", msg)
	if log_label != null:
		log_label.text = msg

func _run_headless_test() -> void:
	print("CO_NHAN_PHAM_HEADLESS_TEST start")
	# Mua 3 tuong re nhat co the, xep len ban, danh 6 round
	for r in range(6):
		# Mua het shop neu du vang
		var tries := 0
		while gold >= 1 and tries < 10:
			tries += 1
			var cheapest := -1
			var cheapest_cost := 99
			for i in range(shop.size()):
				if int(shop[i]["cost"]) < cheapest_cost and gold >= int(shop[i]["cost"]):
					cheapest = i
					cheapest_cost = int(shop[i]["cost"])
			if cheapest == -1:
				break
			_on_shop_pressed(cheapest)
		while bench.size() > 0:
			_on_bench_pressed(0)
		var placed: Array = []
		for u in board:
			if u != null:
				placed.append(u)
		if placed.is_empty():
			# Neu khong mua duoc, them tam 1 tuong de test battle
			var h = HeroesDB.get_heroes()[0].duplicate()
			h["star"] = 1
			board[0] = h
			placed.append(h)
		var win = _do_battle(placed)
		print("CO_NHAN_PHAM_ROUND %d win=%s gold=%d house_hp=%d" % [r + 1, str(win), gold, house_hp])
		if round_no > max_round:
			break
	print("CO_NHAN_PHAM_GODOT_OK rounds_done=6 fennara=0.4.3 godot=4.7.2")
	get_tree().quit()
