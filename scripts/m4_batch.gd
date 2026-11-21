extends SceneTree

# M4 — Batch runner: bot-vs-bot matches for balance telemetry (SRS v2.1 §14).
# Runs N full 8-player matches (all 8 seats played by the Medium bot:
# _bot_prep(false) drives the human seat too), one JSON object per match.
# Usage (headless):
#   godot --headless --path . -s scripts/m4_batch.gd -- --matches 100 --base 1000000 --out /tmp/m4_batch.jsonl
# Output per match: seed, rounds, ranking, and each player's FINAL comp
# (board snapshot taken after bot prep, before the round resolves, so an
# eliminated player's last fought lineup is kept, not the emptied board).
# No sim rule is changed here; this only drives the public match loop.

const M1Data = preload("res://scripts/m1_data.gd")
const M1Match = preload("res://scripts/m1_match.gd")
const M1Bonds = preload("res://scripts/m1_bonds.gd")

func _comp_snapshot(p: Dictionary, data: Dictionary) -> Dictionary:
	var board: Array = p.get("board", [])
	var units_data: Dictionary = data.get("units", {})
	var units: Array = []
	var ids: Array = []
	var nations := {}
	var classes := {}
	for u in board:
		if u == null:
			continue
		var uid := String(u.get("unit_id", ""))
		var d := M1Data.unit_by_id(units_data, uid)
		if d.is_empty():
			continue
		units.append({"unit_id": uid, "star": int(u.get("star", 1))})
		ids.append(uid)
		var nid := String(d.get("nation_id", ""))
		var cid := String(d.get("class_id", ""))
		nations[nid] = int(nations.get(nid, 0)) + 1
		classes[cid] = int(classes.get(cid, 0)) + 1
	var bond_ids: Array = []
	for b in M1Bonds.active_bonds(ids, data.get("bonds", {})):
		bond_ids.append(String(b.get("bond_id", "")))
	return {"units": units, "nations": nations, "classes": classes, "bonds": bond_ids}

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var n := 100
	var base := 1000000
	var out := "/tmp/m4_batch.jsonl"
	var i := 0
	while i < args.size():
		if args[i] == "--matches" and i + 1 < args.size():
			n = int(args[i + 1])
		if args[i] == "--base" and i + 1 < args.size():
			base = int(args[i + 1])
		if args[i] == "--out" and i + 1 < args.size():
			out = args[i + 1]
		i += 1
	var data: Dictionary = M1Data.load_all()
	var f := FileAccess.open(out, FileAccess.WRITE)
	if f == null:
		printerr("M4_BATCH_FAIL cannot open %s" % out)
		quit(1)
		return
	for mi in range(n):
		var seed := base + mi * 7919
		var m = M1Match.new(seed, data)
		var last_board := {}
		var elim_round := {}
		var rounds := 0
		while m.alive_players().size() > 1 and m.round_no < 60:
			var info: Dictionary = m._begin_round()
			m._bot_prep(false)
			for p in m.players:
				if bool(p.get("alive", false)):
					last_board[int(p.get("id", -1))] = _comp_snapshot(p, data)
			var res: Dictionary = m._resolve_round(info)
			rounds = int(res.get("round", 0))
			for e in res.get("eliminated", []):
				elim_round[int(e.get("id", -1))] = rounds
		var fin: Dictionary = m._finalize_game_over()
		var players_out: Array = []
		for r in fin.get("ranking", []):
			var pid := int(r.get("id", -1))
			players_out.append({
				"id": pid,
				"name": String(r.get("name", "?")),
				"rank": int(r.get("rank", 0)),
				"elim_round": int(elim_round.get(pid, rounds)),
				"comp": last_board.get(pid, {}),
			})
		var rec := {"match": mi, "seed": seed, "rounds": int(fin.get("rounds", 0)), "players": players_out}
		f.store_line(JSON.stringify(rec))
		if (mi + 1) % 10 == 0:
			print("M4_BATCH progress %d/%d" % [mi + 1, n])
	f.close()
	print("M4_BATCH_DONE matches=%d out=%s" % [n, out])
	quit()
