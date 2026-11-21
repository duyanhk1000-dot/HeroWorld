extends SceneTree

# M2 - Test headless client online toi thieu.
# Chay: khoi dong server truoc (PORT 2568, M2_FAST=1, Supabase trong), roi:
#   godot --headless --path . -s scripts/online_test.gd
# Cac buoc:
#  0. Unit test (khong can server): msgpack round-trip + giai Reflection
#     handshake that (hex lay tu server that 21/11/2026).
#  1. GET /health -> ok.
#  2. Enqueue 7 dummy + guest client (de phong du 8 nguoi ngay, khoi cho
#     bot-fill 60s) -> poll queue -> matched roomId.
#  3. Join room (matchmake + WS handshake Colyseus) -> nhan board_snapshot.
#  4. Doi PREP_PHASE -> mua 1 tuong (thu cac o 0..4, server xac nhan bang
#     board_snapshot bench >= 1) -> in ONLINE_CLIENT_OK, quit(0).
# Loi/timeout -> in ONLINE_CLIENT_FAIL <ly do>, quit(1).

const OnlineAuth = preload("res://scripts/online_auth.gd")
const OnlineClient = preload("res://scripts/online_client.gd")
const OnlineMsgpack = preload("res://scripts/online_msgpack.gd")
const OnlineSchema = preload("res://scripts/online_schema.gd")

# Handshake (Reflection) that, lay tu server local 21/11/2026 (room battle,
# Colyseus 0.15.57): 511 bytes. Dung de kiem chung bo giai Reflection.
const HANDSHAKE_HEX := "80018101ff01800002800103ff0281048000ff0381058001ff0480000680010780020880030980040a80050b80060c80070d80080e80090f800a10800b11ff0580001280011380021480031580041680051780061880071980081aff0680a8706c61796572496481a6737472696e67ff0780ab646973706c61794e616d6581a6737472696e67ff0880a2687081a66e756d626572ff0980a4676f6c6481a66e756d626572ff0a80a56c6576656c81a66e756d626572ff0b80a2787081a66e756d626572ff0c80a673747265616b81a66e756d626572ff0d80a5616c69766581a7626f6f6c65616eff0e80a56973426f7481a7626f6f6c65616eff0f80a9636f6e6e656374656481a7626f6f6c65616eff1080a873686f704a736f6e81a6737472696e67ff1180aa73686f704c6f636b656481a7626f6f6c65616eff1280a5706861736581a6737472696e67ff1380af70726f746f636f6c56657273696f6e81a66e756d626572ff1480a7726f756e64496481a66e756d626572ff1580a5737461676581a66e756d626572ff1680ac726f756e64496e537461676581a66e756d626572ff1780ac636f756e74646f776e53656381a66e756d626572ff1880a47469636b81a66e756d626572ff1980a7706c6179657273820081a36d6170ff1a80af656c696d696e617465644f7264657282ff81ac61727261793a737472696e67"

const SERVER_URL := "http://127.0.0.1:2568"
const GLOBAL_TIMEOUT := 150.0

var _client: Node = null
var _auth: Node = null
var _http: HTTPRequest = null
var _http_pending := Callable()
var _state := "init"
var _elapsed := 0.0
var _step_deadline := 0.0
var _fail_reason := ""
var _phase := ""
var _buy_slot := 0
var _buy_wait := 0.0
var _self_id := ""
var _dummy_index := 0
var _kickoff := false

func _initialize() -> void:
	print("ONLINE_TEST start")
	if not _unit_tests():
		_fail("unit tests")
		return
	_auth = OnlineAuth.new()
	root.add_child(_auth)
	_client = OnlineClient.new()
	root.add_child(_client)
	_client.configure(SERVER_URL)
	_client.queue_matched.connect(_on_matched)
	_client.queue_failed.connect(_on_queue_failed)
	_client.room_joined.connect(_on_joined)
	_client.room_state_received.connect(_on_room_state)
	_client.board_snapshot_received.connect(_on_snapshot)
	_client.server_error.connect(_on_server_error)
	_http = HTTPRequest.new()
	root.add_child(_http)
	_http.request_completed.connect(_on_http_done)
	_state = "health"
	_step_deadline = 15.0
	# Kickoff o _process (tick dau): HTTPRequest can node o trong tree,
	# goi request_raw ngay trong _initialize se loi "!is_inside_tree()".
	_kickoff = true

func _process(delta: float) -> bool:
	if _kickoff:
		_kickoff = false
		_http_request(HTTPClient.METHOD_GET, SERVER_URL + "/health", "", _on_health)
	_elapsed += delta
	if _elapsed > GLOBAL_TIMEOUT:
		_fail("global timeout 150s (state=%s)" % _state)
		return true
	match _state:
		"health", "enqueue", "join_wait", "buying", "buy_wait":
			if _elapsed > _step_deadline:
				_fail("timeout in state %s" % _state)
				return true
	if _state == "buy_wait":
		_buy_wait += delta
		if _buy_wait > 2.0:
			_next_buy_slot()
	return false

func _fail(reason: String) -> void:
	_fail_reason = reason
	print("ONLINE_CLIENT_FAIL %s" % reason)
	quit(1)

func _ok() -> void:
	print("ONLINE_CLIENT_OK")
	quit(0)

# ------------------------------------------------------------------ unit tests

func _unit_tests() -> bool:
	var ok := true
	# Msgpack round-trip.
	var sample := {"type": "c2s_buy_shop", "round_id": 1, "shop_slot": 2,
		"nested": {"a": [1, 2.5, "x", true, null], "b": -33}}
	var enc := OnlineMsgpack.encode(sample)
	var dec := OnlineMsgpack.decode(enc, 0)
	if int(dec[1]) < 0:
		print("ONLINE_TEST unit FAIL msgpack decode")
		return false
	var back: Dictionary = dec[0]
	ok = ok and String(back.get("type", "")) == "c2s_buy_shop"
	ok = ok and int(back.get("round_id", 0)) == 1
	ok = ok and int(back.get("shop_slot", 0)) == 2
	ok = ok and float(((back.get("nested", {}) as Dictionary).get("a", []) as Array)[1]) == 2.5
	ok = ok and int(((back.get("nested", {}) as Dictionary).get("b", 0))) == -33
	for v in [0, 127, 128, 255, 256, 65535, 65536, -1, -32, -33, -128, -32768, -2147483648]:
		var e2 := OnlineMsgpack.encode(v)
		var d2 := OnlineMsgpack.decode(e2, 0)
		if int(d2[1]) < 0 or int(d2[0]) != v:
			print("ONLINE_TEST unit FAIL msgpack int %d" % v)
			return false
	if not ok:
		print("ONLINE_TEST unit FAIL msgpack sample")
		return false
	print("ONLINE_TEST unit msgpack OK")
	# Reflection handshake that.
	var hs := _hex_to_bytes(HANDSHAKE_HEX)
	if hs.size() != 511:
		print("ONLINE_TEST unit FAIL handshake size %d" % hs.size())
		return false
	var schema = OnlineSchema.new()
	if not schema.decode_handshake(hs):
		print("ONLINE_TEST unit FAIL handshake decode: %s" % schema.error)
		return false
	if schema.root_type != 1:
		print("ONLINE_TEST unit FAIL rootType %d" % schema.root_type)
		return false
	var t0: Array = (schema.types.get(0, {}) as Dictionary).get("fields", [])
	var t1: Array = (schema.types.get(1, {}) as Dictionary).get("fields", [])
	if t0.size() != 12 or t1.size() != 9:
		print("ONLINE_TEST unit FAIL field counts %d/%d" % [t0.size(), t1.size()])
		return false
	var names0: Array = []
	for f in t0:
		names0.append(String((f as Dictionary).get("name", "")))
	if not names0.has("shopJson") or not names0.has("shopLocked"):
		print("ONLINE_TEST unit FAIL PlayerState fields %s" % str(names0))
		return false
	var players_field: Dictionary = t1[7]
	var elim_field: Dictionary = t1[8]
	if String(players_field.get("name", "")) != "players" or String(players_field.get("type", "")) != "map" or int(players_field.get("ref", -1)) != 0:
		print("ONLINE_TEST unit FAIL players field %s" % str(players_field))
		return false
	if String(elim_field.get("name", "")) != "eliminatedOrder" or String(elim_field.get("type", "")) != "array:string":
		print("ONLINE_TEST unit FAIL eliminatedOrder field %s" % str(elim_field))
		return false
	print("ONLINE_TEST unit reflection OK (rootType=1, PlayerState 12 fields, BattleRoomState 9 fields)")
	return true

func _hex_to_bytes(hex: String) -> PackedByteArray:
	var out := PackedByteArray()
	var i := 0
	while i + 1 < hex.length():
		out.append(("0x" + hex.substr(i, 2)).hex_to_int())
		i += 2
	return out

# ------------------------------------------------------------------ http helper

func _http_request(method: int, url: String, body: String, cb: Callable) -> void:
	_http_pending = cb
	var headers := PackedStringArray(["Content-Type: application/json"])
	var err := _http.request(url, headers, method, body)
	if err != OK:
		var pending := _http_pending
		_http_pending = Callable()
		pending.call(0, PackedByteArray())

func _on_http_done(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if _http_pending.is_valid():
		var cb := _http_pending
		_http_pending = Callable()
		cb.call(code, body)

# ------------------------------------------------------------------ flow

func _on_health(code: int, body: PackedByteArray) -> void:
	if code != 200:
		_fail("GET /health -> HTTP %d (server chua chay?)" % code)
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY or not bool((parsed as Dictionary).get("ok", false)):
		_fail("GET /health -> body khong hop le")
		return
	print("ONLINE_TEST /health OK")
	_self_id = "online-test-guest"
	_state = "enqueue"
	_step_deadline = _elapsed + 30.0
	_dummy_index = 0
	_enqueue_next_dummy()

func _enqueue_next_dummy() -> void:
	if _dummy_index >= 7:
		# Du 7 dummy — gio enqueue chinh minh (guest) roi doi client poll.
		var info: Dictionary = _auth.login_guest()
		_self_id = String(info.get("player_id", ""))
		_state = "join_wait"
		_step_deadline = _elapsed + 30.0
		_client.join_queue("CASUAL", _self_id, "TestGuest", true)
		print("ONLINE_TEST queued self %s" % _self_id)
		return
	var pid := "online-test-dummy-%d" % _dummy_index
	var body := JSON.stringify({"playerId": pid, "displayName": pid, "mmr": 1000,
		"matchesPlayed": 0, "mode": "CASUAL", "platform": "WEB", "isGuest": false})
	_dummy_index += 1
	_http_request(HTTPClient.METHOD_POST, SERVER_URL + "/queue", body, _on_dummy_enqueued)

func _on_dummy_enqueued(code: int, _body: PackedByteArray) -> void:
	if code != 200:
		_fail("POST /queue dummy -> HTTP %d" % code)
		return
	_enqueue_next_dummy()

func _on_matched(_room_id: String) -> void:
	print("ONLINE_TEST matched room %s" % _room_id)
	_state = "join_wait"

func _on_queue_failed(reason: String) -> void:
	_fail("queue failed: " + reason)

func _on_joined() -> void:
	print("ONLINE_TEST joined room")
	_state = "buying"
	_step_deadline = _elapsed + 30.0

func _on_room_state(msg: Dictionary) -> void:
	_phase = String(msg.get("phase", ""))
	if _state == "buying" and _phase == "PREP_PHASE":
		_buy_slot = 0
		_try_buy()

func _on_snapshot(_msg: Dictionary) -> void:
	if _state != "buy_wait" and _state != "buying":
		return
	var bench: Array = _client.last_snapshot.get("bench", [])
	if bench.size() >= 1:
		print("ONLINE_TEST bought 1 unit, bench=%d" % bench.size())
		_ok()

func _on_server_error(code: String, message: String) -> void:
	print("ONLINE_TEST server error %s: %s" % [code, message])
	if _state == "buy_wait":
		_next_buy_slot()

func _try_buy() -> void:
	if _buy_slot > 4:
		_fail("could not buy any shop slot 0..4")
		return
	_state = "buy_wait"
	_buy_wait = 0.0
	_step_deadline = _elapsed + 20.0
	print("ONLINE_TEST trying buy slot %d" % _buy_slot)
	_client.buy_shop(_buy_slot)

func _next_buy_slot() -> void:
	_buy_slot += 1
	_try_buy()
