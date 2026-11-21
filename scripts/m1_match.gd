extends RefCounted

# M1 - Match loop: 1 human + 7 Medium bots, SRS v2.1 sections 3.3, 4, 9.
# Stages of 6 rounds: stage 1 = PvE,PvP,PvP,PvE,PvP,Boss PvE;
# stage 2+ = PvP,PvP,PvP,PvE,PvP,Boss PvE. Ghost rule for odd survivors.
# No items, no Karma Bonds in M1.
const M1Hex = preload("res://scripts/m1_hex.gd")
const M1Data = preload("res://scripts/m1_data.gd")
const M1Synergy = preload("res://scripts/m1_synergy.gd")
const M1Sim = preload("res://scripts/m1_sim.gd")
const M1Economy = preload("res://scripts/m1_economy.gd")
const M1Bot = preload("res://scripts/m1_bot.gd")

var seed: int = 20261121
var data: Dictionary = {}
var balance: Dictionary = {}
var units_data: Dictionary = {}
var pve_data: Dictionary = {}
var players: Array = []
var pool: Dictionary = {}
var rng: RandomNumberGenerator
var round_no := 0
var log: Array = []
var ranking: Array = []
var ghost_board: Array = []
var _iid_counter := 0

func _init(match_seed: int, loaded_data: Dictionary) -> void:
	seed = match_seed
	data = loaded_data
	balance = data.get("balance", {})
	units_data = data.get("units", {})
	pve_data = data.get("pve", {})
	rng = RandomNumberGenerator.new()
	rng.seed = seed
	pool = M1Economy.new_pool(units_data, balance)
	players = []
	var names: Array = ["Bạn", "Bot An", "Bot Bình", "Bot Chi", "Bot Dũng", "Bot Hà", "Bot Khang", "Bot Linh"]
	for i in range(8):
		players.append(M1Economy.new_player(i, names[i], i == 0, balance))

func alive_players() -> Array:
	var out: Array = []
	for p in players:
		if bool(p.get("alive", false)):
			out.append(p)
	return out

func _stage_of(round_n: int) -> int:
	return (round_n - 1) / 6 + 1

func _round_in_stage(round_n: int) -> int:
	return (round_n - 1) % 6 + 1

func _round_type(round_n: int) -> String:
	var stage := _stage_of(round_n)
	var ris := _round_in_stage(round_n)
	if stage == 1:
		if ris == 1 or ris == 4:
			return "PVE"
		if ris == 6:
			return "BOSS"
		return "PVP"
	if ris == 4:
		return "PVE"
	if ris == 6:
		return "BOSS"
	return "PVP"

func _mirror_index(idx: int) -> int:
	var row := M1Hex.index_to_row(idx)
	var col := M1Hex.index_to_col(idx)
	return M1Hex.rc_to_index(7 - row, col)

func _build_side(player: Dictionary, side: int) -> Array:
	var board: Array = player.get("board", [])
	var defs: Array = []
	var syn_units: Array = []
	for i in range(board.size()):
		var u = board[i]
		if u == null:
			continue
		var d := M1Data.unit_by_id(units_data, String(u.get("unit_id", "")))
		if d.is_empty():
			continue
		syn_units.append(d)
	var syn := M1Synergy.compute(syn_units, balance)
	var mods_arr: Array = syn.get("unit_mods", [])
	var k := 0
	for i in range(board.size()):
		var u = board[i]
		if u == null:
			continue
		var d := M1Data.unit_by_id(units_data, String(u.get("unit_id", "")))
		if d.is_empty():
			continue
		var idx := i if side == 0 else _mirror_index(i)
		var unit_def := {
			"unit_id": d.get("unit_id", ""), "name": d.get("name", "?"),
			"nation_id": d.get("nation_id", ""), "class_id": d.get("class_id", ""),
			"star": int(u.get("star", 1)), "stats": d.get("stats_1star", {}),
			"skill": d.get("skill", {}), "is_pve": false,
		}
		_iid_counter += 1
		defs.append(M1Sim.make_combatant(unit_def, side, idx, mods_arr[k], int(syn.get("team_armor", 0)), int(syn.get("team_mr", 0)), balance, _iid_counter))
		k += 1
	return defs

func _pve_side(stage: int, ris: int) -> Array:
	var key := "%d-%d" % [stage, ris]
	var entry: Dictionary = Dictionary(pve_data.get("pve_rounds", {})).get(key, {})
	var hp_scale := 1.0
	var atk_scale := 1.0
	if entry.is_empty():
		# Stages beyond 3 reuse the stage-3 entry, scaled (pve.json).
		var base_key := "3-%d" % ris
		entry = Dictionary(pve_data.get("pve_rounds", {})).get(base_key, {})
		var extra := stage - 3
		hp_scale = pow(float(Dictionary(pve_data.get("stage_scaling", {})).get("hp_per_stage", 1.35)), float(extra))
		atk_scale = pow(float(Dictionary(pve_data.get("stage_scaling", {})).get("atk_per_stage", 1.20)), float(extra))
	if entry.is_empty():
		return []
	var cells: Array = [
		M1Hex.rc_to_index(7, 3), M1Hex.rc_to_index(7, 2), M1Hex.rc_to_index(7, 4),
		M1Hex.rc_to_index(6, 3), M1Hex.rc_to_index(6, 2), M1Hex.rc_to_index(6, 4),
		M1Hex.rc_to_index(5, 3),
	]
	var out: Array = []
	var ci := 0
	for m in entry.get("units", []):
		for n in range(int(m.get("count", 1))):
			if ci >= cells.size():
				break
			var stats := {
				"hp": int(float(m.get("hp", 400)) * hp_scale), "atk": int(float(m.get("atk", 30)) * atk_scale),
				"ap": 0, "armor": int(m.get("armor", 10)), "mr": int(m.get("mr", 10)),
				"attack_speed": float(m.get("attack_speed", 0.7)), "attack_range": int(m.get("attack_range", 1)),
				"start_mana": 0, "max_mana": 100,
			}
			var unit_def := {
				"unit_id": "pve_" + String(m.get("name", "quai")), "name": String(m.get("name", "Quái")),
				"nation_id": "", "class_id": "", "star": 1, "stats": stats, "skill": {}, "is_pve": true,
			}
			_iid_counter += 1
			out.append(M1Sim.make_combatant(unit_def, 1, cells[ci], M1Synergy._empty_mods(), 0, 0, balance, _iid_counter))
			ci += 1
	return out

func _ghost_side() -> Array:
	var defs: Array = []
	for u in ghost_board:
		var d := M1Data.unit_by_id(units_data, String(u.get("unit_id", "")))
		if d.is_empty():
			continue
		var unit_def := {
			"unit_id": d.get("unit_id", ""), "name": d.get("name", "?"),
			"nation_id": d.get("nation_id", ""), "class_id": d.get("class_id", ""),
			"star": int(u.get("star", 1)), "stats": d.get("stats_1star", {}),
			"skill": d.get("skill", {}), "is_pve": false,
		}
		_iid_counter += 1
		defs.append(M1Sim.make_combatant(unit_def, 1, _mirror_index(int(u.get("idx", 0))), M1Synergy._empty_mods(), 0, 0, balance, _iid_counter))
	return defs

func _shuffle_pairs(alive: Array) -> Dictionary:
	# Try several shuffles, keep the one with fewest repeat matchups.
	var best: Array = []
	var best_repeats := 999
	for attempt in range(8):
		var order: Array = alive.duplicate()
		for i in range(order.size() - 1, 0, -1):
			var j := rng.randi_range(0, i)
			var tmp = order[i]
			order[i] = order[j]
			order[j] = tmp
		var repeats := 0
		for i in range(0, order.size() - 1, 2):
			if int(order[i].get("last_opponent", -1)) == int(order[i + 1].get("id", -2)):
				repeats += 1
		if repeats < best_repeats:
			best_repeats = repeats
			best = order
		if repeats == 0:
			break
	var pairs: Array = []
	var i := 0
	while i + 1 < best.size():
		pairs.append([best[i], best[i + 1]])
		i += 2
	var ghost_player: Dictionary = {}
	if i < best.size():
		ghost_player = best[i]
	return {"pairs": pairs, "ghost": ghost_player}

func _set_streak(player: Dictionary, won: bool) -> void:
	var res := "W" if won else "L"
	if String(player.get("streak_result", "")) == res:
		player["streak"] = int(player.get("streak", 0)) + 1
	else:
		player["streak"] = 1
		player["streak_result"] = res

func _eliminate(player: Dictionary) -> void:
	player["alive"] = false
	player["eliminated_round"] = round_no
	# Snapshot the board for the ghost rule (SRS 3.3).
	ghost_board = []
	var board: Array = player.get("board", [])
	for i in range(board.size()):
		if board[i] != null:
			var u: Dictionary = (board[i] as Dictionary).duplicate()
			u["idx"] = i
			ghost_board.append(u)
	var alive_after := alive_players().size()
	player["rank"] = alive_after + 1
	ranking.append({"id": player.get("id", -1), "name": player.get("name", "?"), "rank": player["rank"]})
	M1Economy.return_units_to_pool(player, pool)

func run_match() -> Dictionary:
	log.append("M1 match start seed=%d players=8 (1 human + 7 Medium bots)" % seed)
	while alive_players().size() > 1 and round_no < 60:
		round_no += 1
		var stage := _stage_of(round_no)
		var ris := _round_in_stage(round_no)
		var rtype := _round_type(round_no)
		var round_seed := seed + round_no * 100000
		# ---- PREP: free refresh (unless locked), then decisions.
		for p in alive_players():
			if not bool(p.get("lock_shop", false)):
				M1Economy.roll_shop(p, units_data, pool, rng, balance, true)
			M1Bot.take_prep_turn(p, units_data, pool, rng, balance)
		# ---- Pairing.
		var pairing := _shuffle_pairs(alive_players())
		var pairs: Array = pairing["pairs"]
		var ghost_player: Dictionary = pairing["ghost"]
		# ---- COMBAT (PvP rounds only; PvE rounds fight monsters below).
		var results := {}  # player id -> {won, damage_taken, survivors_foe, is_pve}
		var pair_index := 0
		if rtype != "PVP":
			pairs = []
		for pair in pairs:
			var a: Dictionary = pair[0]
			var b: Dictionary = pair[1]
			a["last_opponent"] = int(b.get("id", -1))
			b["last_opponent"] = int(a.get("id", -1))
			var side_a := _build_side(a, 0)
			var side_b := _build_side(b, 1)
			var combat_seed := round_seed + pair_index * 7919
			var res := M1Sim.run_combat(side_a, side_b, combat_seed, balance)
			var winner: int = res.get("winner", -1)
			if winner == 0:
				results[int(a.get("id", -1))] = {"won": true, "foe_survivors": int(res.get("survivors_b", 0)), "is_pve": false}
				results[int(b.get("id", -1))] = {"won": false, "foe_survivors": int(res.get("survivors_a", 0)), "is_pve": false}
			elif winner == 1:
				results[int(b.get("id", -1))] = {"won": true, "foe_survivors": int(res.get("survivors_a", 0)), "is_pve": false}
				results[int(a.get("id", -1))] = {"won": false, "foe_survivors": int(res.get("survivors_b", 0)), "is_pve": false}
			else:
				results[int(a.get("id", -1))] = {"won": false, "foe_survivors": int(res.get("survivors_b", 0)), "is_pve": false, "draw": true}
				results[int(b.get("id", -1))] = {"won": false, "foe_survivors": int(res.get("survivors_a", 0)), "is_pve": false, "draw": true}
			pair_index += 1
		# Ghost fight (odd survivors, PvP rounds only): result counts for the
		# real player only; the copied lineup's owner is unaffected (SRS 3.3).
		if rtype == "PVP" and not ghost_player.is_empty():
			var gp_side := _build_side(ghost_player, 0)
			var gh_side := _ghost_side()
			if gh_side.is_empty():
				gh_side = _pve_side(stage, ris)
			var res2 := M1Sim.run_combat(gp_side, gh_side, round_seed + 555, balance)
			var won2: bool = int(res2.get("winner", -1)) == 0
			results[int(ghost_player.get("id", -1))] = {"won": won2, "foe_survivors": int(res2.get("survivors_b", 0)), "is_pve": false, "ghost": true}
		# PvE rounds: every alive player fights monsters instead of a pair.
		if rtype == "PVE" or rtype == "BOSS":
			for p in alive_players():
				var my_side := _build_side(p, 0)
				var mon_side := _pve_side(stage, ris)
				var res3 := M1Sim.run_combat(my_side, mon_side, round_seed + int(p.get("id", 0)) * 131, balance)
				var won3: bool = int(res3.get("winner", -1)) == 0
				results[int(p.get("id", -1))] = {"won": won3, "foe_survivors": int(res3.get("survivors_b", 0)), "is_pve": true}
		# ---- ROUND RESOLVE.
		var base_dmg: int = int(Dictionary(balance.get("loser_base_damage_by_stage", {})).get(str(mini(stage, 7)), 0))
		var round_lines: Array = []
		for p in players:
			if not bool(p.get("alive", false)):
				continue
			if not results.has(int(p.get("id", -1))):
				continue
			var r: Dictionary = results[int(p.get("id", -1))]
			var won: bool = bool(r.get("won", false))
			var is_pve: bool = bool(r.get("is_pve", false))
			var foe_surv: int = int(r.get("foe_survivors", 0))
			var damage := 0
			if not won:
				damage = base_dmg + foe_surv
				if is_pve:
					damage = damage / 2  # PvE loss is half, rounded down (SRS 9.3).
			if not is_pve:
				_set_streak(p, won)
			if won:
				p["wins"] = int(p.get("wins", 0)) + 1
			else:
				p["losses"] = int(p.get("losses", 0)) + 1
			var income := M1Economy.compute_income(p, won and not is_pve, balance)
			p["gold"] = int(p.get("gold", 0)) + income
			M1Economy.gain_round_xp(p, balance)
			if damage > 0:
				p["hp"] = maxi(0, int(p.get("hp", 0)) - damage)
			round_lines.append("%s %s hp=%d gold=%d lv=%d board=%d" % [
				p.get("name", "?"), "THANG" if won else "THUA", int(p.get("hp", 0)),
				int(p.get("gold", 0)), int(p.get("level", 1)), M1Economy.board_count(p)])
		log.append("Round %d (stage %d, %s): %s" % [round_no, stage, rtype, " | ".join(round_lines)])
		# Eliminations after resolve.
		for p in players:
			if bool(p.get("alive", false)) and int(p.get("hp", 0)) <= 0:
				_eliminate(p)
				log.append("  -> %s bi loai (hang %d)" % [p.get("name", "?"), int(p.get("rank", 0))])
	# ---- GAME OVER.
	var survivors := alive_players()
	var top1: Dictionary = {}
	if survivors.size() == 1:
		top1 = survivors[0]
		top1["rank"] = 1
		ranking.append({"id": top1.get("id", -1), "name": top1.get("name", "?"), "rank": 1})
	elif survivors.size() > 1:
		# Round cap hit: rank remaining players by HP.
		survivors.sort_custom(func(a, b): return int(a.get("hp", 0)) > int(b.get("hp", 0)))
		for i in range(survivors.size()):
			survivors[i]["rank"] = i + 1
			ranking.append({"id": survivors[i].get("id", -1), "name": survivors[i].get("name", "?"), "rank": i + 1})
		top1 = survivors[0]
	ranking.sort_custom(func(a, b): return int(a.get("rank", 0)) < int(b.get("rank", 0)))
	log.append("GAME OVER rounds=%d top1=%s" % [round_no, top1.get("name", "?")])
	return {"top1": top1, "rounds": round_no, "ranking": ranking, "log": log, "seed": seed}
