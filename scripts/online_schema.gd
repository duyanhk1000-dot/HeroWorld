extends RefCounted

# M2 - Giai ma @colyseus/schema state (Colyseus 0.15) cho client Godot.
#
# Vi sao can: shop chi co trong schema state (PlayerState.shopJson); cac
# message kieu s2c_board_snapshot / s2c_room_state KHONG co shop. Khong giai
# duoc state thi GUI online khong thay duoc shop de mua.
#
# Dinh dang (doc tu @colyseus/schema src/Schema.ts + src/encoding/*):
# - JOIN_ROOM (code 10) kem handshake = Reflection.encodeAll(): mo ta bang
#   kieu (type id -> danh sach field {name, type, referencedType}).
# - ROOM_STATE (14) = full state; ROOM_STATE_PATCH (15) = thay doi rieng le.
#   Ca hai deu la mot dong byte: [SWITCH_TO_STRUCTURE(255) + refId] de doi
#   doi tuong dang giai, roi moi thay doi la (fieldIndex | operation) + gia
#   tri. Schema: operation = byte>>6<<6 (ADD 128 / REPLACE 0 / DELETE 64 /
#   DELETE_AND_ADD 192), fieldIndex = byte % (op || 255). Collection (map/
#   array): operation la byte tho (CLEAR 10), fieldIndex la msgpack number,
#   ADD kem theo key string (map). Gia tri nguyen thuy: string/number dung
#   msgpack, boolean la 1 byte tho (0/1). Gia tri schema/collection: msgpack
#   number = refId, co the kem TYPE_ID(213) + typeId khi kieu thuc khac kieu
#   khai bao (khong xay ra voi state cua game nay).
# - Thu tu field trong stream la thu tu "cham" lan dau (change order), KHONG
#   phai thu tu khai bao — decoder phai doc fieldIndex tu moi byte, khong
#   duoc doan thu tu.
#
# GIOI HAN DA XAC MINH (21/11/2026, probe server local): server hien tai gui
# ROOM_STATE RONG (chi 1 byte 0x0e) va khong bao gio gui PATCH, vi tsconfig
# target ES2022 bat useDefineForClassFields=true lam vo setter @type cua
# schema (xem docs/m2-client-notes.md). Decoder nay giai dung handshake
# (da kiem chung bang byte that) va san sang giai state ngay khi server sua
# xong (them "useDefineForClassFields": false vao server/tsconfig.json).
# Khi state rong, client dung che do mua "mu" (blind-buy, xem online_client.gd).

const Msgpack = preload("res://scripts/online_msgpack.gd")

const SWITCH_TO_STRUCTURE := 255
const TYPE_ID := 213
const OP_ADD := 128
const OP_REPLACE := 0
const OP_DELETE := 64
const OP_DELETE_AND_ADD := 192
const OP_CLEAR := 10

# Bang kieu cung cho Reflection (handshake). Type id am la id noi bo.
const REFLECTION_TYPES := {
	-100: {"fields": [
		{"name": "types", "type": "array", "ref": -101},
		{"name": "rootType", "type": "number", "ref": -1},
	]},
	-101: {"fields": [
		{"name": "id", "type": "number", "ref": -1},
		{"name": "fields", "type": "array", "ref": -102},
	]},
	-102: {"fields": [
		{"name": "name", "type": "string", "ref": -1},
		{"name": "type", "type": "string", "ref": -1},
		{"name": "referencedType", "type": "number", "ref": -1},
	]},
}

var types := {}       # typeId -> {"fields": [{name, type, ref}]} (tu reflection)
var root_type := -1   # typeId cua BattleRoomState (tu reflection.rootType)
var refs := {}        # refId -> {"typeid": int, "kind": String, "fields"/"entries"/"items"}
var error := ""       # loi giai ma gan nhat ("" = khong loi)
var decoded_full_state := false  # da nhan duoc ROOM_STATE co noi dung hay chua

func _init() -> void:
	refs[0] = _make_ref(-100, "schema")

func _make_ref(typeid: int, kind: String) -> Dictionary:
	var r := {"typeid": typeid, "kind": kind}
	if kind == "schema":
		r["fields"] = {}
	elif kind == "map":
		r["entries"] = {}
		r["index_to_key"] = {}
	else:
		r["items"] = []
	return r

# Giai handshake (Reflection) tu JOIN_ROOM. Tra ve true neu lay duoc bang kieu.
func decode_handshake(bytes: PackedByteArray, offset: int = 0) -> bool:
	types = {}
	root_type = -1
	refs = {0: _make_ref(-100, "schema")}
	error = ""
	var res := _walk(bytes, offset, REFLECTION_TYPES)
	if res < 0:
		return false
	var root = _materialize_ref(0, {})
	if typeof(root) != TYPE_DICTIONARY:
		error = "handshake root is not a schema"
		return false
	var types_arr: Array = root.get("types", [])
	if types_arr.is_empty():
		error = "handshake has no types"
		return false
	for t in types_arr:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		var tid := int(t.get("id", -1))
		var fields: Array = []
		for f in (t.get("fields", []) as Array):
			if typeof(f) != TYPE_DICTIONARY:
				continue
			fields.append({
				"name": String(f.get("name", "")),
				"type": String(f.get("type", "")),
				"ref": int(f.get("referencedType", -1)),
			})
		types[tid] = {"fields": fields}
	root_type = int(root.get("rootType", -1))
	if root_type < 0 or types.is_empty():
		error = "handshake missing rootType"
		return false
	return true

# Ap dung ROOM_STATE (full=true: reset refs) hoac ROOM_STATE_PATCH.
# Tra ve true neu giai duoc (ke ca khi state rong).
func apply_bytes(bytes: PackedByteArray, offset: int, full: bool) -> bool:
	if types.is_empty() or root_type < 0:
		error = "no type table (handshake not decoded)"
		return false
	if full:
		refs = {0: _make_ref(root_type, "schema")}
		decoded_full_state = bytes.size() > offset + 1
	error = ""
	var res := _walk(bytes, offset, types)
	if res < 0:
		return false
	return true

# Luong giai ma chinh: di doc stream, cap nhat refs. Tra ve offset cuoi (>=0)
# hoac -1 khi loi (error da dat).
func _walk(bytes: PackedByteArray, offset: int, type_table: Dictionary) -> int:
	var current: Dictionary = refs[0]
	while offset < bytes.size():
		var byte: int = bytes[offset]
		offset += 1
		if byte == SWITCH_TO_STRUCTURE:
			var r := Msgpack.decode(bytes, offset)
			if int(r[1]) < 0:
				error = "bad refId after SWITCH_TO_STRUCTURE"
				return -1
			offset = int(r[1])
			var refid := int(r[0])
			if not refs.has(refid):
				error = "refId not found: %d" % refid
				return -1
			current = refs[refid]
			continue
		if String(current.get("kind", "")) == "schema":
			var op := (byte >> 6) << 6
			var divisor := op if op != 0 else 255
			var field_index := byte % divisor
			var tdef: Dictionary = type_table.get(int(current.get("typeid", -1)), {})
			var fields: Array = tdef.get("fields", [])
			if field_index < 0 or field_index >= fields.size():
				error = "definition mismatch: field %d of type %d" % [field_index, int(current.get("typeid", -1))]
				return -1
			var field: Dictionary = fields[field_index]
			if op == OP_DELETE:
				_delete_schema_field(current, String(field.get("name", "")))
				continue
			if op == OP_DELETE_AND_ADD:
				_delete_schema_field(current, String(field.get("name", "")))
			var vr := _read_value(bytes, offset, _type_desc(field), type_table)
			if int(vr[1]) < 0:
				return -1
			offset = int(vr[1])
			(current.get("fields", {}) as Dictionary)[String(field.get("name", ""))] = vr[0]
		else:
			# Collection (map / array).
			if byte == OP_CLEAR:
				if String(current.get("kind", "")) == "map":
					(current.get("entries", {}) as Dictionary).clear()
					(current.get("index_to_key", {}) as Dictionary).clear()
				else:
					(current.get("items", []) as Array).clear()
				continue
			var op2 := byte
			var ir := Msgpack.decode(bytes, offset)
			if int(ir[1]) < 0:
				error = "bad collection index"
				return -1
			offset = int(ir[1])
			var field_index2 := int(ir[0])
			var key = null
			if (op2 & OP_ADD) == OP_ADD:
				if String(current.get("kind", "")) == "map":
					var kr := Msgpack.decode(bytes, offset)
					if int(kr[1]) < 0 or typeof(kr[0]) != TYPE_STRING:
						error = "bad map key"
						return -1
					offset = int(kr[1])
					key = String(kr[0])
					(current.get("index_to_key", {}) as Dictionary)[field_index2] = key
				else:
					key = field_index2
			else:
				if String(current.get("kind", "")) == "map":
					key = (current.get("index_to_key", {}) as Dictionary).get(field_index2, field_index2)
				else:
					key = field_index2
			if op2 == OP_DELETE:
				_delete_collection_item(current, key)
				continue
			if op2 == OP_DELETE_AND_ADD:
				_delete_collection_item(current, key)
			var item_desc: Dictionary = current.get("item_desc", {})
			var vr2 := _read_value(bytes, offset, item_desc, type_table)
			if int(vr2[1]) < 0:
				return -1
			offset = int(vr2[1])
			if String(current.get("kind", "")) == "map":
				(current.get("entries", {}) as Dictionary)[key] = vr2[0]
			else:
				var items: Array = current.get("items", [])
				while items.size() <= int(key):
					items.append(null)
				items[int(key)] = vr2[0]
	return offset

# Field dinh nghia (tu reflection) -> mo ta kieu de _read_value dung.
func _type_desc(field: Dictionary) -> Dictionary:
	var t := String(field.get("type", ""))
	var ref := int(field.get("ref", -1))
	match t:
		"string", "number", "boolean":
			return {"kind": "primitive", "type": t}
		"ref":
			return {"kind": "ref", "ref": ref}
		"map":
			if ref != -1:
				return {"kind": "collection", "collection": "map", "item": {"kind": "ref", "ref": ref}}
			return {"kind": "collection", "collection": "map", "item": {"kind": "primitive", "type": "string"}}
		"array":
			if ref != -1:
				return {"kind": "collection", "collection": "array", "item": {"kind": "ref", "ref": ref}}
			return {"kind": "collection", "collection": "array", "item": {"kind": "primitive", "type": "string"}}
		_:
			# "array:string", "map:string", ...
			if t.begins_with("array:"):
				return {"kind": "collection", "collection": "array", "item": {"kind": "primitive", "type": t.substr(6)}}
			if t.begins_with("map:"):
				return {"kind": "collection", "collection": "map", "item": {"kind": "primitive", "type": t.substr(4)}}
			return {"kind": "primitive", "type": "string"}

# Doc 1 gia tri theo mo ta kieu. Tra ve [value, new_offset] (value la gia tri
# tho, hoac {"__ref": refId} doi voi schema/collection).
func _read_value(bytes: PackedByteArray, offset: int, desc: Dictionary, type_table: Dictionary) -> Array:
	var kind := String(desc.get("kind", ""))
	if kind == "primitive":
		var t := String(desc.get("type", ""))
		if t == "boolean":
			if offset >= bytes.size():
				error = "eof reading boolean"
				return [null, -1]
			return [bytes[offset] > 0, offset + 1]
		var r := Msgpack.decode(bytes, offset)
		if int(r[1]) < 0:
			error = "bad primitive value"
			return [null, -1]
		return r
	if kind == "ref":
		var r := Msgpack.decode(bytes, offset)
		if int(r[1]) < 0:
			error = "bad schema refId"
			return [null, -1]
		offset = int(r[1])
		var refid := int(r[0])
		var typeid := int(desc.get("ref", -1))
		if offset < bytes.size() and bytes[offset] == TYPE_ID:
			var tr := Msgpack.decode(bytes, offset + 1)
			if int(tr[1]) >= 0:
				typeid = int(tr[0])
				offset = int(tr[1])
		if not refs.has(refid):
			refs[refid] = _make_ref(typeid, "schema")
		return [{"__ref": refid}, offset]
	if kind == "collection":
		var r2 := Msgpack.decode(bytes, offset)
		if int(r2[1]) < 0:
			error = "bad collection refId"
			return [null, -1]
		offset = int(r2[1])
		var refid2 := int(r2[0])
		if offset < bytes.size() and bytes[offset] == TYPE_ID:
			var tr2 := Msgpack.decode(bytes, offset + 1)
			if int(tr2[1]) >= 0:
				offset = int(tr2[1])
		if not refs.has(refid2):
			var coll := _make_ref(-1, String(desc.get("collection", "array")))
			coll["item_desc"] = desc.get("item", {})
			refs[refid2] = coll
		return [{"__ref": refid2}, offset]
	error = "unknown type desc %s" % str(desc)
	return [null, -1]

func _delete_schema_field(ref: Dictionary, field_name: String) -> void:
	var fields: Dictionary = ref.get("fields", {})
	if fields.has(field_name):
		var old = fields[field_name]
		fields.erase(field_name)
		if typeof(old) == TYPE_DICTIONARY and (old as Dictionary).has("__ref"):
			refs.erase(int((old as Dictionary)["__ref"]))

func _delete_collection_item(ref: Dictionary, key) -> void:
	if String(ref.get("kind", "")) == "map":
		(ref.get("entries", {}) as Dictionary).erase(key)
	else:
		var items: Array = ref.get("items", [])
		if typeof(key) == TYPE_INT and int(key) >= 0 and int(key) < items.size():
			items[int(key)] = null

# --- truy van trang thai (materialize refs thanh Dictionary thuan) ---

func root_dict() -> Dictionary:
	var v = _materialize_ref(0, {})
	return v if typeof(v) == TYPE_DICTIONARY else {}

func _materialize_ref(refid: int, seen: Dictionary) -> Variant:
	if seen.has(refid):
		return null
	seen[refid] = true
	var ref: Dictionary = refs.get(refid, {})
	var kind := String(ref.get("kind", ""))
	if kind == "schema":
		var out := {}
		for k in (ref.get("fields", {}) as Dictionary).keys():
			out[k] = _materialize_value((ref.get("fields", {}) as Dictionary)[k], seen)
		return out
	if kind == "map":
		var out2 := {}
		for k in (ref.get("entries", {}) as Dictionary).keys():
			out2[k] = _materialize_value((ref.get("entries", {}) as Dictionary)[k], seen)
		return out2
	var out3: Array = []
	for item in (ref.get("items", []) as Array):
		out3.append(_materialize_value(item, seen))
	return out3

func _materialize_value(v, seen: Dictionary):
	if typeof(v) == TYPE_DICTIONARY and (v as Dictionary).has("__ref"):
		return _materialize_ref(int((v as Dictionary)["__ref"]), seen)
	return v

# Tien ich cho GUI: lay dict cua 1 player, thong tin phong, shop.
func player_dict(player_id: String) -> Dictionary:
	var root := root_dict()
	var players: Dictionary = root.get("players", {})
	var p = players.get(player_id, {})
	return p if typeof(p) == TYPE_DICTIONARY else {}

func room_info() -> Dictionary:
	var root := root_dict()
	return {
		"phase": String(root.get("phase", "")),
		"round_id": int(root.get("roundId", 0)),
		"stage": int(root.get("stage", 1)),
		"round_in_stage": int(root.get("roundInStage", 0)),
		"countdown_sec": int(root.get("countdownSec", 0)),
		"tick": int(root.get("tick", 0)),
	}

func players_list() -> Array:
	var root := root_dict()
	var out: Array = []
	for k in (root.get("players", {}) as Dictionary).keys():
		var p: Dictionary = (root.get("players", {}) as Dictionary)[k]
		out.append(p)
	return out

# Shop cua 1 player tu shopJson (JSON array 5 unit_id, "" = o trong).
# Tra ve [] khi state chua co shop (server gui state rong — xem ghi chu dau file).
func shop_for(player_id: String) -> Array:
	var p := player_dict(player_id)
	var raw := String(p.get("shopJson", ""))
	if raw == "":
		return []
	var parsed = JSON.parse_string(raw)
	if typeof(parsed) == TYPE_ARRAY:
		return parsed
	return []
