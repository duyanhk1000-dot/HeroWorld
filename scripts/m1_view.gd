extends RefCounted

# M1 - View layer (pure logic, no nodes): turns deterministic sim events
# into animation steps. The sim never sees this file; animation can never
# change a combat result. Safe to call headless.
const M1Hex = preload("res://scripts/m1_hex.gd")

const HEX_SIZE := 36.0
const ORIGIN := Vector2(260, 80)
const TICK_SECONDS := 0.05  # 20 Hz sim tick

# Flat-top axial layout for the 7x8 odd-r board.
static func hex_to_pixel(idx: int) -> Vector2:
	var ax := M1Hex.offset_to_axial(M1Hex.index_to_col(idx), M1Hex.index_to_row(idx))
	var x := HEX_SIZE * sqrt(3.0) * (float(ax.x) + float(ax.y) * 0.5)
	var y := HEX_SIZE * 1.5 * float(ax.y)
	return ORIGIN + Vector2(x, y)

static func nation_color(nation: String) -> Color:
	match nation:
		"VN":
			return Color(0.85, 0.20, 0.20)
		"CN":
			return Color(0.85, 0.62, 0.08)
		"JP":
			return Color(0.92, 0.92, 0.92)
		_:
			return Color(0.55, 0.55, 0.65)

# Per-hero signature VFX; everything else falls back to the skill type.
static func skill_vfx_kind(unit_id: String, skill_type: String) -> String:
	match unit_id:
		"vn_yet_kieu":
			return "water_swirl"
		"vn_thanh_giong":
			return "bamboo_shield"
		"jp_susanoo":
			return "storm"
		"cn_ton_ngo_khong":
			return "fire"
		"vn_son_tinh":
			return "mountain"
		"cn_nu_oa":
			return "rainbow"
		"jp_seimei":
			return "pentagram"
		_:
			pass
	match skill_type:
		"aoe":
			return "burst"
		"shield":
			return "shield_ring"
		_:
			return "slash"

static func vfx_colors(kind: String) -> Dictionary:
	match kind:
		"water_swirl":
			return {"primary": Color(0.15, 0.55, 0.95), "secondary": Color(0.55, 0.9, 1.0), "count": 36}
		"bamboo_shield":
			return {"primary": Color(0.25, 0.75, 0.3), "secondary": Color(0.95, 0.85, 0.3), "count": 28}
		"storm":
			return {"primary": Color(0.6, 0.35, 0.95), "secondary": Color(0.95, 0.95, 1.0), "count": 40}
		"fire":
			return {"primary": Color(1.0, 0.5, 0.1), "secondary": Color(1.0, 0.85, 0.25), "count": 36}
		"mountain":
			return {"primary": Color(0.55, 0.4, 0.2), "secondary": Color(0.85, 0.8, 0.6), "count": 28}
		"rainbow":
			return {"primary": Color(0.95, 0.4, 0.7), "secondary": Color(0.5, 0.8, 1.0), "count": 32}
		"pentagram":
			return {"primary": Color(0.75, 0.3, 0.9), "secondary": Color(0.4, 0.9, 0.9), "count": 32}
		"burst":
			return {"primary": Color(1.0, 0.8, 0.2), "secondary": Color(1.0, 0.4, 0.1), "count": 30}
		"shield_ring":
			return {"primary": Color(0.4, 0.8, 1.0), "secondary": Color(0.9, 0.95, 1.0), "count": 24}
		_:
			return {"primary": Color(1.0, 1.0, 1.0), "secondary": Color(0.8, 0.8, 0.9), "count": 20}

# events: sim event dicts. casters: {iid: {unit_id, skill_id, skill_name,
# skill_type}}. Returns ordered animation steps (a pure function of events).
static func build_timeline(events: Array, casters: Dictionary) -> Array:
	var steps: Array = []
	for e in events:
		var tick: int = int(e.get("t", 0))
		var kind: String = String(e.get("k", ""))
		match kind:
			"move":
				steps.append({"tick": tick, "kind": "move", "iid": int(e.get("a", -1)), "cell": int(e.get("cell", -1))})
			"assassin_jump":
				steps.append({"tick": tick, "kind": "jump", "iid": int(e.get("a", -1)), "cell": int(e.get("cell", -1))})
			"damage":
				steps.append({"tick": tick, "kind": "hit", "attacker": int(e.get("a", -1)), "target": int(e.get("b", -1)), "dmg": int(e.get("dmg", 0))})
			"skill_cast":
				var iid: int = int(e.get("a", -1))
				var info: Dictionary = casters.get(iid, {})
				steps.append({"tick": tick, "kind": "skill", "iid": iid,
					"unit_id": String(info.get("unit_id", "")), "skill_id": String(info.get("skill_id", "")),
					"skill_name": String(info.get("skill_name", "?")),
					"vfx": skill_vfx_kind(String(info.get("unit_id", "")), String(info.get("skill_type", "")))})
			"death":
				steps.append({"tick": tick, "kind": "death", "iid": int(e.get("a", -1))})
			"dodge":
				steps.append({"tick": tick, "kind": "dodge", "iid": int(e.get("b", -1))})
	return steps

static func timeline_stats(steps: Array) -> Dictionary:
	var counts := {"move": 0, "jump": 0, "hit": 0, "skill": 0, "death": 0, "dodge": 0}
	for s in steps:
		var k: String = String(s.get("kind", ""))
		if counts.has(k):
			counts[k] = int(counts[k]) + 1
	return counts

# Portrait path: every hero loads res://assets/<unit_id>_portrait.png when present.
# (An earlier guard excluded vn_yet_kieu because its old portrait was wrong art —
# female + modern scuba gear. It was redrawn 2026-11-21 as a male fisherman and
# the guard was removed; see canvas/HEROES_RESEARCH.md.)
static func portrait_path(uid: String) -> String:
	var p := "res://assets/%s_portrait.png" % uid
	return p if FileAccess.file_exists(p) else ""

# Load images / audio straight from disk (Image / raw PCM) instead of
# load(), because validated assets in assets/ have no editor import
# cache on this headless VM and load() reports "No loader found".
static func load_image_texture(path: String) -> Texture2D:
	if path == "" or not FileAccess.file_exists(path):
		return null
	# Image.load_from_file is static and returns the Image itself.
	var img := Image.load_from_file(path)
	if img == null or img.is_empty():
		return null
	return ImageTexture.create_from_image(img)

static func load_portrait_texture(uid: String) -> Texture2D:
	return load_image_texture(portrait_path(uid))

static func load_skill_wav(uid: String) -> AudioStream:
	var path := "res://assets/%s_skill.wav" % uid
	if not FileAccess.file_exists(path):
		return null
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.size() < 44:
		return null
	var channels := bytes.decode_u16(22)
	var rate := bytes.decode_u32(24)
	var bits := bytes.decode_u16(34)
	# Find the "data" chunk and use only the raw PCM after it.
	var data_pos := -1
	for i in range(12, bytes.size() - 8):
		if bytes[i] == 0x64 and bytes[i + 1] == 0x61 and bytes[i + 2] == 0x74 and bytes[i + 3] == 0x61:
			data_pos = i + 8
			break
	if data_pos < 0:
		return null
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS if bits == 16 else AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = int(rate)
	wav.stereo = channels == 2
	wav.data = bytes.slice(data_pos)
	return wav

# Check which skill icons / skill sounds / portraits exist in assets/ (synced
# from ohmygame_assets/ staging; see assets/MANIFEST.md).
static func check_assets(units_data: Dictionary) -> Dictionary:
	var missing_icons: Array = []
	var missing_sfx: Array = []
	var missing_portraits: Array = []
	var present_icons := 0
	var present_sfx := 0
	var present_portraits := 0
	for u in units_data.get("units", []):
		var uid: String = u.get("unit_id", "")
		if FileAccess.file_exists("res://assets/%s_skill.png" % uid):
			present_icons += 1
		else:
			missing_icons.append(uid)
		if FileAccess.file_exists("res://assets/%s_skill.wav" % uid):
			present_sfx += 1
		else:
			missing_sfx.append(uid)
		if portrait_path(uid) != "":
			present_portraits += 1
		else:
			missing_portraits.append(uid)
	return {
		"present_icons": present_icons, "missing_icons": missing_icons,
		"present_sfx": present_sfx, "missing_sfx": missing_sfx,
		"present_portraits": present_portraits, "missing_portraits": missing_portraits,
	}
