class_name HeroesData
extends RefCounted

# Du lieu 8 tuong theo spec co-nhan-pham-fantasy-spec.md
# Gia 1-3 vang, 3 he: Hiep Si / Phap Su / Xa Thu
static func get_heroes() -> Array:
	return [
		{"id": "hiep_si_khien", "name": "Hiệp sĩ Khiên", "cost": 1, "faction": "Hiệp Sĩ", "hp": 650, "atk": 45, "skill": "Khiên chắn", "skill_desc": "Giảm 50% sát thương 3s", "color": Color(0.75, 0.8, 0.9), "icon": "🛡️", "sound": "keng kim loại"},
		{"id": "cung_thu_elf", "name": "Cung thủ Elf", "cost": 1, "faction": "Xạ Thủ", "hp": 420, "atk": 55, "skill": "Bắn xuyên", "skill_desc": "Xuyên 2 mục tiêu", "color": Color(0.4, 0.8, 0.4), "icon": "🏹", "sound": "vút dây cung"},
		{"id": "phap_su_lua", "name": "Pháp sư Lửa", "cost": 2, "faction": "Pháp Sư", "hp": 480, "atk": 70, "skill": "Cầu lửa", "skill_desc": "Nổ diện rộng", "color": Color(0.9, 0.3, 0.2), "icon": "🔥", "sound": "bùm lửa nổ"},
		{"id": "sat_thu_bong_toi", "name": "Sát thủ Bóng tối", "cost": 2, "faction": "Xạ Thủ", "hp": 460, "atk": 80, "skill": "Nhảy sau lưng", "skill_desc": "Chí mạng x2", "color": Color(0.5, 0.3, 0.7), "icon": "🗡️", "sound": "xoẹt chém nhanh"},
		{"id": "tanker_da", "name": "Tanker Đá", "cost": 2, "faction": "Hiệp Sĩ", "hp": 900, "atk": 35, "skill": "Da đá", "skill_desc": "Bất tử 2s, hất văng", "color": Color(0.6, 0.6, 0.6), "icon": "🪨", "sound": "ầm đá nứt"},
		{"id": "healer_anh_sang", "name": "Healer Ánh sáng", "cost": 3, "faction": "Pháp Sư", "hp": 500, "atk": 40, "skill": "Hồi máu", "skill_desc": "Hồi 200 máu đồng đội thấp nhất", "color": Color(1.0, 0.9, 0.5), "icon": "✨", "sound": "ting chuông sáng"},
		{"id": "rong_con", "name": "Rồng con", "cost": 3, "faction": "Pháp Sư", "hp": 700, "atk": 85, "skill": "Hơi thở lửa", "skill_desc": "Thiêu đốt 3s", "color": Color(1.0, 0.55, 0.2), "icon": "🐉", "sound": "gầm lửa"},
		{"id": "vua_kiem_thanh", "name": "Vua Kiếm Thánh", "cost": 3, "faction": "Hiệp Sĩ", "hp": 750, "atk": 95, "skill": "Chém xoáy", "skill_desc": "Đánh lan xung quanh", "color": Color(1.0, 0.85, 0.2), "icon": "👑", "sound": "vù kiếm xoáy"},
	]

static func get_enemies_for_round(round_no: int) -> Array:
	match round_no:
		1:
			return [{"name": "Slime", "hp": 200, "atk": 20, "icon": "🟢", "sound": "bụp nhầy"}, {"name": "Slime", "hp": 200, "atk": 20, "icon": "🟢", "sound": "bụp nhầy"}]
		2:
			return [{"name": "Goblin", "hp": 250, "atk": 30, "icon": "👺", "sound": "chít"}, {"name": "Goblin", "hp": 250, "atk": 30, "icon": "👺", "sound": "chít"}, {"name": "Goblin", "hp": 250, "atk": 30, "icon": "👺", "sound": "chít"}]
		3:
			return [{"name": "Orc", "hp": 400, "atk": 45, "icon": "👹", "sound": "gầm"}, {"name": "Orc", "hp": 400, "atk": 45, "icon": "👹", "sound": "gầm"}, {"name": "Goblin", "hp": 250, "atk": 30, "icon": "👺", "sound": "chít"}]
		4:
			return [{"name": "Boss Orc", "hp": 900, "atk": 70, "icon": "👹", "sound": "gầm boss"}]
		5:
			return [{"name": "AI Hiệp sĩ", "hp": 650, "atk": 45, "icon": "🛡️", "sound": "keng"}, {"name": "AI Cung thủ", "hp": 420, "atk": 55, "icon": "🏹", "sound": "vút"}, {"name": "AI Pháp sư", "hp": 480, "atk": 70, "icon": "🔥", "sound": "bùm"}]
		_:
			return [{"name": "AI Tanker", "hp": 900, "atk": 35, "icon": "🪨", "sound": "ầm"}, {"name": "AI Rồng", "hp": 700, "atk": 85, "icon": "🐉", "sound": "gầm"}, {"name": "AI Vua Kiếm", "hp": 750, "atk": 95, "icon": "👑", "sound": "vù"}, {"name": "Boss Rồng lửa", "hp": 1200, "atk": 90, "icon": "🐲", "sound": "gầm lửa lớn"}]

static func synergy_bonus(board: Array) -> Dictionary:
	var counts := {"Hiệp Sĩ": 0, "Pháp Sư": 0, "Xạ Thủ": 0}
	var seen := {}
	for u in board:
		if u == null:
			continue
		if seen.has(u["id"]):
			continue
		seen[u["id"]] = true
		counts[u["faction"]] = counts.get(u["faction"], 0) + 1
	var armor_bonus := 0.0
	var ap_bonus := 0.0
	var aspd_bonus := 0.0
	if counts["Hiệp Sĩ"] >= 3:
		armor_bonus = 0.35
	elif counts["Hiệp Sĩ"] >= 2:
		armor_bonus = 0.20
	if counts["Pháp Sư"] >= 3:
		ap_bonus = 0.45
	elif counts["Pháp Sư"] >= 2:
		ap_bonus = 0.25
	if counts["Xạ Thủ"] >= 2:
		aspd_bonus = 0.30
	return {"counts": counts, "armor": armor_bonus, "ap": ap_bonus, "aspd": aspd_bonus}

static func star_multiplier(star: int) -> float:
	return pow(1.8, float(star - 1))
