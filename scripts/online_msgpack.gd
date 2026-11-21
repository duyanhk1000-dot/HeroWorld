extends RefCounted

# M2 - MsgPack codec tối thiểu cho Colyseus 0.15 (colyseus.js dùng
# notepack/msgpack chuẩn; server giải mã bằng msgpackr).
# Chỉ hỗ trợ các kiểu mà protocol dùng: nil, bool, int, float64, string
# (UTF-8), array, map (key string), bin (PackedByteArray).
# Số nguyên/float trong msgpack là BIG-endian (khác với encode_* của
# PackedByteArray là little-endian nên phải đảo byte tay).
# API: encode(value) -> PackedByteArray; decode(bytes, offset) -> [value, new_offset].

static func encode(value) -> PackedByteArray:
	var out := PackedByteArray()
	_encode_into(out, value)
	return out

static func _encode_into(out: PackedByteArray, value) -> void:
	match typeof(value):
		TYPE_NIL:
			out.append(0xc0)
		TYPE_BOOL:
			out.append(0xc3 if value else 0xc2)
		TYPE_INT:
			_encode_int(out, int(value))
		TYPE_FLOAT:
			out.append(0xcb)
			_append_f64be(out, float(value))
		TYPE_STRING:
			_encode_str(out, String(value))
		TYPE_PACKED_BYTE_ARRAY:
			_encode_bin(out, value)
		TYPE_ARRAY:
			var arr: Array = value
			if arr.size() < 16:
				out.append(0x90 | arr.size())
			elif arr.size() < 65536:
				out.append(0xdc)
				_append_u16be(out, arr.size())
			else:
				out.append(0xdd)
				_append_u32be(out, arr.size())
			for item in arr:
				_encode_into(out, item)
		TYPE_DICTIONARY:
			var d: Dictionary = value
			var keys := d.keys()
			if keys.size() < 16:
				out.append(0x80 | keys.size())
			elif keys.size() < 65536:
				out.append(0xde)
				_append_u16be(out, keys.size())
			else:
				out.append(0xdf)
				_append_u32be(out, keys.size())
			for k in keys:
				_encode_str(out, String(k))
				_encode_into(out, d[k])
		_:
			push_error("OnlineMsgpack: cannot encode type %d" % typeof(value))
			out.append(0xc0)

static func _encode_int(out: PackedByteArray, v: int) -> void:
	if v >= 0:
		if v < 0x80:
			out.append(v)
		elif v < 0x100:
			out.append(0xcc)
			out.append(v)
		elif v < 0x10000:
			out.append(0xcd)
			_append_u16be(out, v)
		elif v < 0x100000000:
			out.append(0xce)
			_append_u32be(out, v)
		else:
			out.append(0xcf)
			_append_u64be(out, v)
	else:
		if v >= -32:
			out.append(v & 0xff)
		elif v >= -128:
			out.append(0xd0)
			out.append(v & 0xff)
		elif v >= -32768:
			out.append(0xd1)
			_append_u16be(out, v & 0xffff)
		elif v >= -2147483648:
			out.append(0xd2)
			_append_u32be(out, v & 0xffffffff)
		else:
			out.append(0xd3)
			_append_u64be(out, v)

static func _encode_str(out: PackedByteArray, s: String) -> void:
	var b := s.to_utf8_buffer()
	if b.size() < 32:
		out.append(0xa0 | b.size())
	elif b.size() < 256:
		out.append(0xd9)
		out.append(b.size())
	elif b.size() < 65536:
		out.append(0xda)
		_append_u16be(out, b.size())
	else:
		out.append(0xdb)
		_append_u32be(out, b.size())
	out.append_array(b)

static func _encode_bin(out: PackedByteArray, b: PackedByteArray) -> void:
	if b.size() < 256:
		out.append(0xc4)
		out.append(b.size())
	elif b.size() < 65536:
		out.append(0xc5)
		_append_u16be(out, b.size())
	else:
		out.append(0xc6)
		_append_u32be(out, b.size())
	out.append_array(b)

static func _append_u16be(out: PackedByteArray, v: int) -> void:
	out.append((v >> 8) & 0xff)
	out.append(v & 0xff)

static func _append_u32be(out: PackedByteArray, v: int) -> void:
	out.append((v >> 24) & 0xff)
	out.append((v >> 16) & 0xff)
	out.append((v >> 8) & 0xff)
	out.append(v & 0xff)

static func _append_u64be(out: PackedByteArray, v: int) -> void:
	for shift in [56, 48, 40, 32, 24, 16, 8, 0]:
		out.append((v >> shift) & 0xff)

static func _append_f64be(out: PackedByteArray, v: float) -> void:
	var tmp := PackedByteArray()
	tmp.resize(8)
	tmp.encode_double(0, v)  # little-endian -> dao lai thanh big-endian
	for i in range(7, -1, -1):
		out.append(tmp[i])

# decode(bytes, offset=0) -> [value, new_offset]. Loi thi tra [null, -1].
static func decode(bytes: PackedByteArray, offset: int = 0) -> Array:
	if offset < 0 or offset >= bytes.size():
		return [null, -1]
	var prefix: int = bytes[offset]
	offset += 1
	# positive fixint
	if prefix < 0x80:
		return [prefix, offset]
	# fixmap
	if prefix >= 0x80 and prefix < 0x90:
		return _decode_map(bytes, offset, prefix & 0x0f)
	# fixarray
	if prefix >= 0x90 and prefix < 0xa0:
		return _decode_array(bytes, offset, prefix & 0x0f)
	# fixstr
	if prefix >= 0xa0 and prefix < 0xc0:
		return _decode_str(bytes, offset, prefix & 0x1f)
	# negative fixint
	if prefix >= 0xe0:
		return [prefix - 256, offset]
	match prefix:
		0xc0:
			return [null, offset]
		0xc2:
			return [false, offset]
		0xc3:
			return [true, offset]
		0xc4:
			var n8 := _read_u8(bytes, offset)
			offset += 1
			return [bytes.slice(offset, offset + n8), offset + n8]
		0xc5:
			var n16 := _read_u16be(bytes, offset)
			offset += 2
			return [bytes.slice(offset, offset + n16), offset + n16]
		0xc6:
			var n32 := _read_u32be(bytes, offset)
			offset += 4
			return [bytes.slice(offset, offset + n32), offset + n32]
		0xca:
			return [_read_f32be(bytes, offset), offset + 4]
		0xcb:
			return [_read_f64be(bytes, offset), offset + 8]
		0xcc:
			return [_read_u8(bytes, offset), offset + 1]
		0xcd:
			return [_read_u16be(bytes, offset), offset + 2]
		0xce:
			return [_read_u32be(bytes, offset), offset + 4]
		0xcf:
			return [_read_u64be(bytes, offset), offset + 8]
		0xd0:
			return [_read_i8(bytes, offset), offset + 1]
		0xd1:
			return [_read_i16be(bytes, offset), offset + 2]
		0xd2:
			return [_read_i32be(bytes, offset), offset + 4]
		0xd3:
			return [_read_i64be(bytes, offset), offset + 8]
		0xd9:
			var l8 := _read_u8(bytes, offset)
			return _decode_str(bytes, offset + 1, l8)
		0xda:
			var l16 := _read_u16be(bytes, offset)
			return _decode_str(bytes, offset + 2, l16)
		0xdb:
			var l32 := _read_u32be(bytes, offset)
			return _decode_str(bytes, offset + 4, l32)
		0xdc:
			var a16 := _read_u16be(bytes, offset)
			return _decode_array(bytes, offset + 2, a16)
		0xdd:
			var a32 := _read_u32be(bytes, offset)
			return _decode_array(bytes, offset + 4, a32)
		0xde:
			var m16 := _read_u16be(bytes, offset)
			return _decode_map(bytes, offset + 2, m16)
		0xdf:
			var m32 := _read_u32be(bytes, offset)
			return _decode_map(bytes, offset + 4, m32)
	push_error("OnlineMsgpack: unknown prefix 0x%02x" % prefix)
	return [null, -1]

static func _decode_str(bytes: PackedByteArray, offset: int, length: int) -> Array:
	var s := bytes.slice(offset, offset + length).get_string_from_utf8()
	return [s, offset + length]

static func _decode_array(bytes: PackedByteArray, offset: int, count: int) -> Array:
	var out: Array = []
	for i in range(count):
		var r := decode(bytes, offset)
		if int(r[1]) < 0:
			return [null, -1]
		out.append(r[0])
		offset = int(r[1])
	return [out, offset]

static func _decode_map(bytes: PackedByteArray, offset: int, count: int) -> Array:
	var out := {}
	for i in range(count):
		var rk := decode(bytes, offset)
		if int(rk[1]) < 0:
			return [null, -1]
		offset = int(rk[1])
		var rv := decode(bytes, offset)
		if int(rv[1]) < 0:
			return [null, -1]
		offset = int(rv[1])
		out[String(rk[0])] = rv[0]
	return [out, offset]

static func _read_u8(bytes: PackedByteArray, off: int) -> int:
	return bytes[off]

static func _read_i8(bytes: PackedByteArray, off: int) -> int:
	var v: int = bytes[off]
	return v - 256 if v >= 128 else v

static func _read_u16be(bytes: PackedByteArray, off: int) -> int:
	return (int(bytes[off]) << 8) | int(bytes[off + 1])

static func _read_i16be(bytes: PackedByteArray, off: int) -> int:
	var v := _read_u16be(bytes, off)
	return v - 65536 if v >= 32768 else v

static func _read_u32be(bytes: PackedByteArray, off: int) -> int:
	return (int(bytes[off]) << 24) | (int(bytes[off + 1]) << 16) | (int(bytes[off + 2]) << 8) | int(bytes[off + 3])

static func _read_i32be(bytes: PackedByteArray, off: int) -> int:
	var v := _read_u32be(bytes, off)
	return v - 4294967296 if v >= 2147483648 else v

static func _read_u64be(bytes: PackedByteArray, off: int) -> int:
	var v := 0
	for i in range(8):
		v = (v << 8) | int(bytes[off + i])
	return v

static func _read_i64be(bytes: PackedByteArray, off: int) -> int:
	# Tich luy theo kieu unsigned roi tra thang: GDScript int la signed 64
	# bit nen gia tri co bit dau 1 tu dong la so am (two's complement).
	return _read_u64be(bytes, off)

static func _read_f32be(bytes: PackedByteArray, off: int) -> float:
	var tmp := PackedByteArray()
	tmp.resize(4)
	for i in range(4):
		tmp[3 - i] = bytes[off + i]
	return tmp.decode_float(0)

static func _read_f64be(bytes: PackedByteArray, off: int) -> float:
	var tmp := PackedByteArray()
	tmp.resize(8)
	for i in range(8):
		tmp[7 - i] = bytes[off + i]
	return tmp.decode_double(0)
