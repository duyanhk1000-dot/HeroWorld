extends Node

# M2 - Colyseus 0.15 client cho Godot (khong dung thu vien ngoai).
#
# Giao thuc day (xac minh bang probe truc tiep server local 21/11/2026,
# doc tu colyseus.js 0.15.28 + @colyseus/core 0.15.57):
#  1. POST /queue {playerId, mode, ...} -> poll GET /queue/:playerId den khi
#     {status:"matched", roomId}.
#  2. POST /matchmake/joinById/:roomId {protocol_version:1, playerId|token}
#     -> {room:{processId, roomId}, sessionId}. (Khong co reconnectionToken
#     o buoc nay — token nam trong JOIN_ROOM.)
#  3. WS ws://host/:port/:processId/:roomId?sessionId=... Server gui code 10
#     (JOIN_ROOM): [10, len1, reconnectionToken, len2, "schema", handshake].
#     Client gui lai [10] (1 byte) de ack; server moi gui ROOM_STATE (14).
#  4. Message: [13, msgpack-str type, msgpack payload] = ROOM_DATA (s2c_*);
#     gui len: [13, msgpack-str type, msgpack payload] (c2s_*).
#     [14] = ROOM_STATE (full), [15] = ROOM_STATE_PATCH, [11] = ERROR
#     (msgpack number + msgpack string), [12] = LEAVE_ROOM.
#  5. State schema duoc giai bang online_schema.gd (Reflection handshake).
#
# GIOI HAN DA XAC MINH: server hien tai gui ROOM_STATE RONG (xem
# online_schema.gd / docs/m2-client-notes.md) nen shop chi doc duoc khi
# server sua xong. Trong luc cho, client dung che do "mua mu" (blind-buy):
# gui c2s_buy_shop theo o (0-4), server tra board_snapshot khi mua duoc,
# s2c_error khi o trong/het vang — giong cach test e2e.ts cua server.
# Ket qua tran LUON lay tu server (khong dung sim local de quyet dinh).

signal queue_status(text: String)
signal queue_matched(room_id: String)
signal queue_failed(reason: String)
signal room_joined()
signal room_state_received(msg: Dictionary)
signal board_snapshot_received(msg: Dictionary)
signal combat_events_received(msg: Dictionary)
signal round_result_received(msg: Dictionary)
signal game_over_received(msg: Dictionary)
signal server_error(code: String, message: String)
signal connection_lost(will_retry: bool)
signal reconnected()

const Msgpack = preload("res://scripts/online_msgpack.gd")
const OnlineSchema = preload("res://scripts/online_schema.gd")

const PROTOCOL_VERSION := 1
const COL_JOIN_ROOM := 10
const COL_ERROR := 11
const COL_LEAVE_ROOM := 12
const COL_ROOM_DATA := 13
const COL_ROOM_STATE := 14
const COL_ROOM_STATE_PATCH := 15
const COL_ROOM_DATA_BYTES := 17

const ST_IDLE := 0
const ST_QUEUEING := 1
const ST_MATCHED := 2
const ST_JOINING := 3
const ST_CONNECTED := 4

const MAX_RECONNECT_ATTEMPTS := 5

var server_url := "http://127.0.0.1:2568"
var player_id := ""
var display_name := ""
var is_guest := true
var token := ""
var mode := "CASUAL"
var room_id := ""
var session_id := ""
var reconnection_token := ""
var state := ST_IDLE
var phase := ""
var round_id := 0
var countdown_sec := 0
var last_snapshot := {}
var last_room_state := {}
var schema = null  # OnlineSchema
var schema_state_available := false

var _ws: WebSocketPeer = null
var _http: HTTPRequest = null
var _http_queue: Array = []
var _http_busy := false
var _poll_timer := 0.0
var _reconnect_timer := -1.0
var _reconnect_attempts := 0
var _joined_once := false
var _intentional_leave := false
var _ws_open := false

func _ready() -> void:
	schema = OnlineSchema.new()
	_ws = WebSocketPeer.new()
	_http = HTTPRequest.new()
	_http.name = "OnlineClientHTTP"
	add_child(_http)
	_http.request_completed.connect(_on_http_done)

func configure(p_server_url: String) -> void:
	server_url = p_server_url.trim_suffix("/")

func ws_base() -> String:
	if server_url.begins_with("https://"):
		return "wss://" + server_url.substr(8)
	if server_url.begins_with("http://"):
		return "ws://" + server_url.substr(7)
	return server_url

# ------------------------------------------------------------------ HTTP

func _http_do(method: int, url: String, body: String, cb: Callable) -> void:
	_http_queue.append({"method": method, "url": url, "body": body, "cb": cb})

func _on_http_done(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_http_busy = false
	if _http_queue.is_empty():
		return
	var req: Dictionary = _http_queue.pop_front()
	var cb: Callable = req.get("cb", Callable())
	if cb.is_valid():
		cb.call(code, body)

func _process_http_queue() -> void:
	if _http_busy or _http_queue.is_empty():
		return
	var req: Dictionary = _http_queue[0]
	_http_busy = true
	var headers := PackedStringArray(["Content-Type: application/json"])
	var err := _http.request(String(req["url"]), headers, int(req["method"]), String(req["body"]))
	if err != OK:
		_http_busy = false
		_http_queue.pop_front()
		var cb: Callable = req.get("cb", Callable())
		if cb.is_valid():
			cb.call(0, PackedByteArray())

# ------------------------------------------------------------------ queue

func join_queue(p_mode: String, p_player_id: String, p_display_name: String, p_is_guest: bool, p_token: String = "") -> void:
	if state != ST_IDLE:
		return
	mode = p_mode
	player_id = p_player_id
	display_name = p_display_name
	is_guest = p_is_guest
	token = p_token
	state = ST_QUEUEING
	_reconnect_attempts = 0
	_intentional_leave = false
	queue_status.emit("Đang vào hàng chờ (%s)..." % mode)
	var body := JSON.stringify({
		"playerId": player_id, "displayName": display_name,
		"mmr": 1000, "matchesPlayed": 0, "mode": mode,
		"platform": "WEB", "isGuest": is_guest,
	})
	_http_do(HTTPClient.METHOD_POST, server_url + "/queue", body, _on_queue_posted)

func _on_queue_posted(code: int, body: PackedByteArray) -> void:
	if code != 200:
		var msg := _http_error_text(code, body)
		state = ST_IDLE
		queue_failed.emit(msg)
		return
	_poll_timer = 0.0

func _poll_queue() -> void:
	_http_do(HTTPClient.METHOD_GET, server_url + "/queue/" + player_id, "", _on_queue_polled)

func _on_queue_polled(code: int, body: PackedByteArray) -> void:
	if state != ST_QUEUEING:
		return
	if code == 404:
		# Chua co trong hang (server chua thay) — tiep tuc poll.
		return
	if code != 200:
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var d: Dictionary = parsed
	if String(d.get("status", "")) == "matched" and String(d.get("roomId", "")) != "":
		state = ST_MATCHED
		room_id = String(d["roomId"])
		queue_status.emit("Đã ghép trận — vào phòng...")
		queue_matched.emit(room_id)
		join_room(room_id)

func leave_queue() -> void:
	if state == ST_QUEUEING:
		_http_do(HTTPClient.METHOD_DELETE, server_url + "/queue/" + player_id, "", Callable())
	state = ST_IDLE

func _http_error_text(code: int, body: PackedByteArray) -> String:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) == TYPE_DICTIONARY:
		var e := String((parsed as Dictionary).get("error", ""))
		if e != "":
			return e
	return "HTTP %d" % code

# ------------------------------------------------------------------ join room

func join_room(p_room_id: String) -> void:
	room_id = p_room_id
	state = ST_JOINING
	var opts := {"protocol_version": PROTOCOL_VERSION}
	if token != "":
		opts["token"] = token
	else:
		opts["playerId"] = player_id
	_http_do(HTTPClient.METHOD_POST,
		server_url + "/matchmake/joinById/" + room_id,
		JSON.stringify(opts), _on_matchmake_done)

func _on_matchmake_done(code: int, body: PackedByteArray) -> void:
	if code != 200:
		var msg := _http_error_text(code, body)
		state = ST_IDLE
		queue_failed.emit("Không vào được phòng: " + msg)
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		state = ST_IDLE
		queue_failed.emit("Server trả về matchmake không hợp lệ.")
		return
	var d: Dictionary = parsed
	var room: Dictionary = d.get("room", {})
	session_id = String(d.get("sessionId", ""))
	var process_id := String(room.get("processId", ""))
	var rid := String(room.get("roomId", room_id))
	if session_id == "" or process_id == "" or rid == "":
		state = ST_IDLE
		queue_failed.emit("Server trả về matchmake thiếu session/processId.")
		return
	var ws_url := "%s/%s/%s?sessionId=%s" % [ws_base(), process_id, rid, session_id]
	var err := _ws.connect_to_url(ws_url)
	if err != OK:
		state = ST_IDLE
		queue_failed.emit("Không kết nối được WebSocket (%s)." % error_string(err))
		return
	queue_status.emit("Đang kết nối phòng...")

# ------------------------------------------------------------------ WS loop

func _process(delta: float) -> void:
	_process_http_queue()
	if state == ST_QUEUEING:
		_poll_timer -= delta
		if _poll_timer <= 0.0:
			_poll_timer = 1.0
			_poll_queue()
	if _reconnect_timer >= 0.0:
		_reconnect_timer -= delta
		if _reconnect_timer <= 0.0:
			_reconnect_timer = -1.0
			_try_reconnect()
	if _ws == null:
		return
	_ws.poll()
	var rs := _ws.get_ready_state()
	if rs == WebSocketPeer.STATE_OPEN:
		if not _ws_open:
			_ws_open = true
		while _ws.get_available_packet_count() > 0:
			_on_ws_packet(_ws.get_packet())
	elif rs == WebSocketPeer.STATE_CLOSED:
		if _ws_open:
			_ws_open = false
			_on_ws_closed()

func _on_ws_packet(bytes: PackedByteArray) -> void:
	if bytes.is_empty():
		return
	var code: int = bytes[0]
	match code:
		COL_JOIN_ROOM:
			_on_join_room(bytes)
		COL_ERROR:
			var it := Msgpack.decode(bytes, 1)
			var ecode := int(it[0]) if int(it[1]) >= 0 else 0
			var emsg := ""
			if int(it[1]) >= 0:
				var it2 := Msgpack.decode(bytes, int(it[1]))
				if int(it2[1]) >= 0:
					emsg = String(it2[0])
			print("[online] server ERROR %d: %s" % [ecode, emsg])
			server_error.emit(str(ecode), emsg)
		COL_LEAVE_ROOM:
			_ws.close()
		COL_ROOM_DATA:
			var tr := Msgpack.decode(bytes, 1)
			if int(tr[1]) < 0 or typeof(tr[0]) != TYPE_STRING:
				print("[online] bad ROOM_DATA type")
				return
			var mtype := String(tr[0])
			var payload = {}
			if int(tr[1]) < bytes.size():
				var pr := Msgpack.decode(bytes, int(tr[1]))
				if int(pr[1]) >= 0:
					payload = pr[0]
			_on_room_data(mtype, payload)
		COL_ROOM_STATE:
			if schema.apply_bytes(bytes, 1, true):
				schema_state_available = schema.decoded_full_state
				print("[online] ROOM_STATE full, shop known: %s" % str(shop_known()))
			else:
				print("[online] ROOM_STATE decode failed: %s" % schema.error)
		COL_ROOM_STATE_PATCH:
			if schema.apply_bytes(bytes, 1, false):
				schema_state_available = schema.decoded_full_state
			else:
				print("[online] ROOM_STATE_PATCH decode failed: %s" % schema.error)
		COL_ROOM_DATA_BYTES:
			pass # khong dung o game nay
		_:
			print("[online] unknown colyseus code %d" % code)

func _on_join_room(bytes: PackedByteArray) -> void:
	# [10, len, reconnectionToken, len, serializerId, handshake...]
	var off := 1
	if off >= bytes.size():
		return
	var l1: int = bytes[off]
	off += 1
	reconnection_token = bytes.slice(off, off + l1).get_string_from_utf8()
	off += l1
	if off >= bytes.size():
		return
	var l2: int = bytes[off]
	off += 1
	var serializer_id := bytes.slice(off, off + l2).get_string_from_utf8()
	off += l2
	var handshake := bytes.slice(off)
	if serializer_id != "schema":
		print("[online] unexpected serializer: %s" % serializer_id)
	if handshake.size() > 0:
		if schema.decode_handshake(handshake):
			print("[online] handshake ok: rootType=%d types=%s" % [schema.root_type, str(schema.types.keys())])
		else:
			print("[online] handshake decode failed: %s" % schema.error)
	# Ack JOIN_ROOM (1 byte) — server moi gui ROOM_STATE sau buoc nay.
	var ack := PackedByteArray()
	ack.append(COL_JOIN_ROOM)
	_ws.put_packet(ack)
	var was_rejoin := _joined_once
	state = ST_CONNECTED
	_joined_once = true
	_reconnect_attempts = 0
	room_joined.emit()
	print("[online] joined room %s (session %s)" % [room_id, session_id])
	if was_rejoin:
		# Vao lai giua tran: xin server gui lai snapshot + event 2s gan nhat
		# cua cap minh (BattleRoom xu ly "c2s_reconnect", SRS 10.3).
		send_reconnect_msg()
		reconnected.emit()

func _on_room_data(mtype: String, payload) -> void:
	if typeof(payload) != TYPE_DICTIONARY:
		payload = {}
	var msg: Dictionary = payload
	match mtype:
		"s2c_room_state":
			last_room_state = msg
			phase = String(msg.get("phase", ""))
			round_id = int(msg.get("round_id", 0))
			countdown_sec = int(msg.get("countdown_sec", 0))
			room_state_received.emit(msg)
		"s2c_board_snapshot":
			last_snapshot = msg
			board_snapshot_received.emit(msg)
		"s2c_combat_events":
			combat_events_received.emit(msg)
		"s2c_round_result":
			round_result_received.emit(msg)
		"s2c_game_over":
			game_over_received.emit(msg)
		"s2c_error":
			server_error.emit(String(msg.get("code", "")), String(msg.get("message", "")))
		_:
			print("[online] unhandled s2c type: %s" % mtype)

func _on_ws_closed() -> void:
	if _intentional_leave or state == ST_IDLE:
		state = ST_IDLE
		return
	# Mat ket noi giua tran: thu join lai bang roomId cu (server giu seat;
	# sau khi vao lai se gui c2s_reconnect de lay snapshot + event 2s gan nhat).
	if _reconnect_attempts < MAX_RECONNECT_ATTEMPTS:
		state = ST_JOINING
		_reconnect_attempts += 1
		_reconnect_timer = 1.0
		connection_lost.emit(true)
		print("[online] connection lost, retry %d/%d" % [_reconnect_attempts, MAX_RECONNECT_ATTEMPTS])
	else:
		state = ST_IDLE
		connection_lost.emit(false)
		print("[online] connection lost, giving up after %d attempts" % MAX_RECONNECT_ATTEMPTS)

func _try_reconnect() -> void:
	if room_id == "":
		state = ST_IDLE
		return
	join_room(room_id)

# ------------------------------------------------------------------ c2s

func _send_room_data(mtype: String, payload: Dictionary) -> bool:
	if _ws == null or _ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		print("[online] cannot send %s: ws not open" % mtype)
		return false
	var bytes := PackedByteArray()
	bytes.append(COL_ROOM_DATA)
	bytes.append_array(Msgpack.encode(mtype))
	bytes.append_array(Msgpack.encode(payload))
	_ws.put_packet(bytes)
	return true

func send_reconnect_msg() -> bool:
	return _send_room_data("c2s_reconnect", {})

func buy_shop(shop_slot: int) -> bool:
	return _send_room_data("c2s_buy_shop", {"round_id": round_id, "shop_slot": shop_slot})

func sell_unit(zone: String, index: int) -> bool:
	return _send_room_data("c2s_sell_unit", {"round_id": round_id, "zone": zone, "index": index})

func reroll_shop() -> bool:
	return _send_room_data("c2s_reroll_shop", {"round_id": round_id})

func toggle_lock_shop() -> bool:
	return _send_room_data("c2s_toggle_lock_shop", {"round_id": round_id})

func buy_xp() -> bool:
	return _send_room_data("c2s_buy_xp", {"round_id": round_id})

func move_unit(from_zone: String, from_index: int, to_zone: String, to_index: int) -> bool:
	return _send_room_data("c2s_move_unit", {
		"round_id": round_id,
		"from": {"zone": from_zone, "index": from_index},
		"to": {"zone": to_zone, "index": to_index},
	})

func leave_room() -> void:
	_intentional_leave = true
	if _ws != null and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		var b := PackedByteArray()
		b.append(COL_LEAVE_ROOM)
		_ws.put_packet(b)
		_ws.close()
	if state == ST_QUEUEING:
		leave_queue()
	state = ST_IDLE

# ------------------------------------------------------------------ truy van

func ws_connected() -> bool:
	return state == ST_CONNECTED and _ws != null and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN

func shop_known() -> bool:
	return schema_state_available and not schema.shop_for(player_id).is_empty()

func get_shop() -> Array:
	if schema_state_available:
		return schema.shop_for(player_id)
	return []

func get_room_info() -> Dictionary:
	if schema_state_available:
		return schema.room_info()
	return {"phase": phase, "round_id": round_id, "countdown_sec": countdown_sec}

func get_players() -> Array:
	if schema_state_available:
		return schema.players_list()
	var out: Array = []
	for p in (last_room_state.get("players", []) as Array):
		out.append(p)
	return out

func my_player_info() -> Dictionary:
	for p in get_players():
		if typeof(p) == TYPE_DICTIONARY and String((p as Dictionary).get("player_id", "")) == player_id:
			return p
	return {}
