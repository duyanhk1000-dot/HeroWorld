extends Node2D

# M1 - Combat view: plays a finished deterministic combat back as animation.
# It ONLY reads sim events (M1View.build_timeline); it never feeds anything
# back into the sim, so animation cannot change results or replay.
const M1View = preload("res://scripts/m1_view.gd")
const M1Hex = preload("res://scripts/m1_hex.gd")

var speed := 4.0
var playing := false
var timeline: Array = []
var cursor := 0
var clock := 0.0
var roots := {}      # iid -> root Node2D (board position)
var visuals := {}    # iid -> fx Node2D (lunge / knockback / fade)
var sprites := {}    # iid -> Sprite2D
var hp_bars := {}    # iid -> ColorRect (fg)
var hp_max := {}     # iid -> float
var phases := {}     # iid -> float (idle bob phase)
var dead := {}
var _circle_tex: Texture2D
var _ring_tex: Texture2D
var _sfx_cache := {}

func _ready() -> void:
	_circle_tex = _make_circle_texture(64, 30)
	_ring_tex = _make_ring_texture(128, 52, 6)

func _make_circle_texture(size: int, radius: int) -> Texture2D:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var c := size / 2
	for y in range(size):
		for x in range(size):
			var d := Vector2(x - c, y - c).length()
			if d <= float(radius):
				var a := 1.0
				if d > float(radius) - 2.0:
					a = 0.6
				img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)

func _make_ring_texture(size: int, radius: int, width: int) -> Texture2D:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var c := size / 2
	for y in range(size):
		for x in range(size):
			var d := Vector2(x - c, y - c).length()
			if absf(d - float(radius)) <= float(width):
				img.set_pixel(x, y, Color(1, 1, 1, 1))
	return ImageTexture.create_from_image(img)

func play_combat(initial_combatants: Array, result: Dictionary, casters: Dictionary) -> void:
	_clear()
	timeline = M1View.build_timeline(result.get("events", []), casters)
	for c in initial_combatants:
		_spawn_unit(c)
	clock = 0.0
	cursor = 0
	playing = true
	queue_redraw()
	print("M1_VIEW_PLAY steps=%d speed=%.1fx" % [timeline.size(), speed])

func _clear() -> void:
	for k in roots.keys():
		(roots[k] as Node).queue_free()
	roots.clear()
	visuals.clear()
	sprites.clear()
	hp_bars.clear()
	hp_max.clear()
	phases.clear()
	dead.clear()
	playing = false

func _spawn_unit(c: Dictionary) -> void:
	var iid: int = int(c.get("iid", -1))
	var root := Node2D.new()
	root.position = M1View.hex_to_pixel(int(c.get("idx", 0)))
	add_child(root)
	var bob := Node2D.new()
	bob.name = "bob"
	root.add_child(bob)
	var fx := Node2D.new()
	fx.name = "fx"
	bob.add_child(fx)
	var spr := Sprite2D.new()
	var uid: String = String(c.get("unit_id", ""))
	var tex: Texture2D = _circle_tex
	var is_portrait := false
	var loaded := M1View.load_portrait_texture(uid)  # null when missing / known-wrong
	if loaded != null:
		tex = loaded
		is_portrait = true
	spr.texture = tex
	if is_portrait:
		var s := 44.0 / maxf(1.0, float(tex.get_width()))
		spr.scale = Vector2(s, s)
	else:
		spr.modulate = M1View.nation_color(String(c.get("nation", "")))
		spr.scale = Vector2(0.75, 0.75)
	fx.add_child(spr)
	# Class initial on the token.
	var tag := Label.new()
	tag.text = String(c.get("class", "?")).substr(0, 1)
	tag.add_theme_font_size_override("font_size", 15)
	tag.position = Vector2(-5, -10)
	fx.add_child(tag)
	var nm := Label.new()
	nm.text = String(c.get("name", "?"))
	nm.add_theme_font_size_override("font_size", 11)
	nm.position = Vector2(-26, 24)
	fx.add_child(nm)
	var bar_bg := ColorRect.new()
	bar_bg.color = Color(0.1, 0.1, 0.1, 0.8)
	bar_bg.position = Vector2(-20, -34)
	bar_bg.size = Vector2(40, 5)
	fx.add_child(bar_bg)
	var bar_fg := ColorRect.new()
	bar_fg.color = Color(0.3, 0.85, 0.3)
	bar_fg.position = Vector2(-20, -34)
	bar_fg.size = Vector2(40, 5)
	fx.add_child(bar_fg)
	roots[iid] = root
	visuals[iid] = fx
	sprites[iid] = spr
	hp_bars[iid] = bar_fg
	hp_max[iid] = float(c.get("hp_max", 1))
	phases[iid] = float(iid) * 0.7
	dead[iid] = false

func _process(delta: float) -> void:
	var t := Time.get_ticks_msec() / 1000.0
	# Idle bobbing (visual only).
	for iid in roots.keys():
		if bool(dead.get(iid, false)):
			continue
		var root := roots[iid] as Node2D
		var bob := root.get_node("bob") as Node2D
		bob.position.y = sin(t * 2.0 + float(phases.get(iid, 0.0))) * 3.0
	if not playing:
		return
	clock += delta * speed
	while cursor < timeline.size():
		var step: Dictionary = timeline[cursor]
		if float(step.get("tick", 0)) * M1View.TICK_SECONDS > clock:
			break
		_apply_step(step)
		cursor += 1
	if cursor >= timeline.size():
		playing = false
		print("M1_VIEW_DONE steps=%d" % timeline.size())

func _apply_step(step: Dictionary) -> void:
	match String(step.get("kind", "")):
		"move", "jump":
			_step_move(step)
		"hit":
			_step_hit(step)
		"skill":
			_step_skill(step)
		"death":
			_step_death(step)
		"dodge":
			_step_dodge(step)

func _step_move(step: Dictionary) -> void:
	var iid: int = int(step.get("iid", -1))
	if not roots.has(iid) or bool(dead.get(iid, false)):
		return
	var target := M1View.hex_to_pixel(int(step.get("cell", 0)))
	var root := roots[iid] as Node2D
	var tw := create_tween()
	tw.tween_property(root, "position", target, 0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	if String(step.get("kind", "")) == "jump":
		var fx := visuals[iid] as Node2D
		var tw2 := create_tween()
		tw2.tween_property(fx, "scale", Vector2(1.25, 1.25), 0.15)
		tw2.tween_property(fx, "scale", Vector2.ONE, 0.15)

func _step_hit(step: Dictionary) -> void:
	var atk: int = int(step.get("attacker", -1))
	var tgt: int = int(step.get("target", -1))
	if roots.has(atk) and not bool(dead.get(atk, false)) and roots.has(tgt):
		# Attack lunge toward the target, then back.
		var a_root := roots[atk] as Node2D
		var t_root := roots[tgt] as Node2D
		var dir := (t_root.position - a_root.position)
		if dir.length() > 1.0:
			dir = dir.normalized() * 14.0
		var fx := visuals[atk] as Node2D
		var tw := create_tween()
		tw.tween_property(fx, "position", dir, 0.09)
		tw.tween_property(fx, "position", Vector2.ZERO, 0.14)
	if roots.has(tgt) and not bool(dead.get(tgt, false)):
		# Take-hit flash + knockback on the target.
		var fx2 := visuals[tgt] as Node2D
		var spr := sprites[tgt] as Sprite2D
		var tw2 := create_tween()
		tw2.tween_property(spr, "modulate", Color(1.0, 0.25, 0.25), 0.06)
		tw2.tween_property(spr, "modulate", Color.WHITE, 0.18)
		var a_root2 = null
		if roots.has(atk):
			a_root2 = roots[atk] as Node2D
		var t_root2 := roots[tgt] as Node2D
		if a_root2 != null:
			var away: Vector2 = (t_root2.position - (a_root2 as Node2D).position)
			if away.length() > 1.0:
				away = away.normalized() * 7.0
			var tw3 := create_tween()
			tw3.tween_property(fx2, "position", away, 0.08)
			tw3.tween_property(fx2, "position", Vector2.ZERO, 0.16)
		# HP bar follows the event's hp value.
		if hp_bars.has(tgt):
			var frac: float = clampf(float(step.get("hp", -1)) / maxf(1.0, float(hp_max.get(tgt, 1.0))), 0.0, 1.0) if step.has("hp") else -1.0
			if frac >= 0.0:
				(hp_bars[tgt] as ColorRect).size.x = 40.0 * frac

func _step_skill(step: Dictionary) -> void:
	var iid: int = int(step.get("iid", -1))
	if not roots.has(iid):
		return
	var root := roots[iid] as Node2D
	var uid: String = String(step.get("unit_id", ""))
	var skill_name: String = String(step.get("skill_name", "?"))
	var vfx: String = String(step.get("vfx", "slash"))
	var cols: Dictionary = M1View.vfx_colors(vfx)
	# Popup: skill icon (or portrait, or placeholder circle) + skill name.
	var popup := Node2D.new()
	popup.position = root.position + Vector2(0, -52)
	add_child(popup)
	var icon := Sprite2D.new()
	var icon_tex: Texture2D = M1View.load_image_texture("res://assets/%s_skill.png" % uid)
	if icon_tex == null:
		icon_tex = M1View.load_portrait_texture(uid)
	if icon_tex != null:
		icon.texture = icon_tex
		var s := 44.0 / maxf(1.0, float(icon_tex.get_width()))
		icon.scale = Vector2(s, s)
	else:
		icon.texture = _circle_tex
		icon.modulate = Color(cols.get("primary", Color.WHITE))
		icon.scale = Vector2(0.7, 0.7)
		var letter := Label.new()
		letter.text = skill_name.substr(0, 1)
		letter.add_theme_font_size_override("font_size", 16)
		letter.position = Vector2(-5, -10)
		popup.add_child(letter)
	popup.add_child(icon)
	var lbl := Label.new()
	lbl.text = skill_name
	lbl.add_theme_font_size_override("font_size", 16)
	lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3))
	lbl.position = Vector2(-40, 26)
	popup.add_child(lbl)
	var tw := create_tween()
	tw.tween_property(popup, "position:y", popup.position.y - 46.0, 1.1)
	tw.parallel().tween_property(popup, "modulate:a", 0.0, 1.1)
	tw.tween_callback(popup.queue_free)
	# Expanding ring at the caster.
	var ring := Sprite2D.new()
	ring.texture = _ring_tex
	ring.modulate = Color(cols.get("primary", Color.WHITE))
	ring.position = root.position
	ring.scale = Vector2(0.4, 0.4)
	add_child(ring)
	var twr := create_tween()
	twr.tween_property(ring, "scale", Vector2(2.1, 2.1), 0.6)
	twr.parallel().tween_property(ring, "modulate:a", 0.0, 0.6)
	twr.tween_callback(ring.queue_free)
	# Particles (GPUParticles2D, built in code).
	var p := GPUParticles2D.new()
	p.amount = int(cols.get("count", 24))
	p.lifetime = 0.8
	p.one_shot = true
	p.explosiveness = 0.9
	p.texture = _circle_tex
	p.position = root.position
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, -1, 0)
	mat.spread = 180.0
	mat.gravity = Vector3(0, 120, 0)
	mat.initial_velocity_min = 60.0
	mat.initial_velocity_max = 170.0
	mat.scale_min = 0.35
	mat.scale_max = 0.8
	mat.color = Color(cols.get("primary", Color.WHITE))
	p.process_material = mat
	add_child(p)
	p.emitting = true
	get_tree().create_timer(1.2).timeout.connect(p.queue_free)
	# Skill sound (fallback: silent + log, already listed by check_assets).
	_play_skill_sfx(uid)

func _play_skill_sfx(uid: String) -> void:
	if uid == "":
		return
	if not _sfx_cache.has(uid):
		var stream := M1View.load_skill_wav(uid)
		_sfx_cache[uid] = stream
		if stream == null:
			print("M1_VIEW_SFX_MISSING %s_skill.wav" % uid)
			return
	if _sfx_cache[uid] != null:
		var pl := AudioStreamPlayer.new()
		pl.stream = _sfx_cache[uid]
		add_child(pl)
		pl.play()
		get_tree().create_timer(3.0).timeout.connect(pl.queue_free)

func _step_death(step: Dictionary) -> void:
	var iid: int = int(step.get("iid", -1))
	if not roots.has(iid) or bool(dead.get(iid, false)):
		return
	dead[iid] = true
	var fx := visuals[iid] as Node2D
	var tw := create_tween()
	tw.tween_property(fx, "modulate:a", 0.0, 0.6)
	tw.parallel().tween_property(fx, "rotation", 1.1, 0.6)
	tw.parallel().tween_property(fx, "scale", Vector2(0.85, 0.85), 0.6)
	tw.tween_callback((roots[iid] as Node2D).hide)

func _step_dodge(step: Dictionary) -> void:
	var iid: int = int(step.get("iid", -1))
	if not roots.has(iid) or bool(dead.get(iid, false)):
		return
	var fx := visuals[iid] as Node2D
	var tw := create_tween()
	tw.tween_property(fx, "position:x", -10.0, 0.1)
	tw.tween_property(fx, "position:x", 0.0, 0.14)

func _draw() -> void:
	# Hex board outline (visual only).
	for idx in range(M1Hex.BOARD_SIZE):
		var center := M1View.hex_to_pixel(idx)
		var pts := PackedVector2Array()
		for k in range(6):
			var ang := deg_to_rad(60.0 * float(k))
			pts.append(center + Vector2(cos(ang), sin(ang)) * M1View.HEX_SIZE * 0.96)
		pts.append(pts[0])
		draw_polyline(pts, Color(1, 1, 1, 0.14), 1.0)
