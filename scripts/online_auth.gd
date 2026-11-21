extends Node

# M2 - Auth online (Supabase Auth + guest).
# - Guest (mac dinh khi chua cau hinh Supabase): player_id "guest:<device_id>",
#   chi choi CASUAL (server tu choi guest + RANKED, SRS 11.3). Device id luu
#   on dinh o user://online_device_id.txt de doi ten khach khong doi moi lan mo.
# - Dang nhap email: POST {supabase_url}/auth/v1/token?grant_type=password,
#   header apikey (anon key). Server verify JWT qua supabase.auth.getUser()
#   (server/src/auth.ts). KHONG bao gio dung service_role key o client.
# - Khi Supabase chua cau hinh (URL/key trong) thi chi guest chay duoc
#   (dev-mode, khop server khi SUPABASE_URL trong).
# Luu cau hinh o user://online_config.json (server_url, supabase_url,
# supabase_anon_key). Anon key la public theo thiet ke Supabase; khong luu
# service_role key, khong luu mat khau.

signal login_ok(info: Dictionary)
signal login_failed(reason: String)

const CONFIG_PATH := "user://online_config.json"
const DEVICE_PATH := "user://online_device_id.txt"

var server_url := "http://127.0.0.1:2568"
var supabase_url := ""
var supabase_anon_key := ""

var player_id := ""
var display_name := ""
var token := ""        # Supabase JWT ("" = guest)
var refresh_token := ""
var _is_guest := true

var _http: HTTPRequest = null
var _pending: Callable = Callable()

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.name = "OnlineAuthHTTP"
	add_child(_http)
	_http.request_completed.connect(_on_http_done)
	load_config()

func load_config() -> void:
	if not FileAccess.file_exists(CONFIG_PATH):
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(CONFIG_PATH))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	server_url = String((parsed as Dictionary).get("server_url", server_url))
	supabase_url = String((parsed as Dictionary).get("supabase_url", ""))
	supabase_anon_key = String((parsed as Dictionary).get("supabase_anon_key", ""))

func save_config() -> void:
	var f := FileAccess.open(CONFIG_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({
			"server_url": server_url,
			"supabase_url": supabase_url,
			"supabase_anon_key": supabase_anon_key,
		}))

func is_configured() -> bool:
	return supabase_url != "" and supabase_anon_key != ""

func is_guest() -> bool:
	return _is_guest

func get_player_id() -> String:
	return player_id

func get_display_name() -> String:
	return display_name

func get_token() -> String:
	return token

func device_id() -> String:
	if FileAccess.file_exists(DEVICE_PATH):
		var saved := FileAccess.get_file_as_string(DEVICE_PATH).strip_edges()
		if saved != "":
			return saved
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var alphabet := "abcdefghijklmnopqrstuvwxyz0123456789"
	var id := ""
	for i in range(16):
		id += alphabet[rng.randi_range(0, alphabet.length() - 1)]
	var f := FileAccess.open(DEVICE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(id)
	return id

# Guest: khong can mang, tra ngay.
func login_guest() -> Dictionary:
	_is_guest = true
	token = ""
	refresh_token = ""
	player_id = "guest:" + device_id()
	display_name = "Khách"
	var info := {"player_id": player_id, "display_name": display_name, "is_guest": true, "token": ""}
	login_ok.emit(info)
	return info

# Dang nhap email/password qua Supabase Auth REST.
func login_email(email: String, password: String) -> void:
	if not is_configured():
		login_failed.emit("Supabase chưa cấu hình (URL/key trống) — chỉ chơi guest được.")
		return
	var url := supabase_url.trim_suffix("/") + "/auth/v1/token?grant_type=password"
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"apikey: " + supabase_anon_key,
	])
	var body := JSON.stringify({"email": email, "password": password})
	_pending = _on_login_email_result
	_http.request(url, headers, HTTPClient.METHOD_POST, body)

func _on_login_email_result(code: int, body: PackedByteArray) -> void:
	if code != 200:
		login_failed.emit("Đăng nhập thất bại (HTTP %d) — kiểm tra email/mật khẩu." % code)
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		login_failed.emit("Đăng nhập thất bại (server trả về không hợp lệ).")
		return
	var d: Dictionary = parsed
	var user: Dictionary = d.get("user", {})
	if String(d.get("access_token", "")) == "" or user.is_empty():
		login_failed.emit("Đăng nhập thất bại (thiếu token).")
		return
	_is_guest = false
	token = String(d.get("access_token", ""))
	refresh_token = String(d.get("refresh_token", ""))
	player_id = String(user.get("id", ""))
	var meta: Dictionary = user.get("user_metadata", {})
	display_name = String(meta.get("display_name", String(user.get("email", "Player")).split("@")[0]))
	login_ok.emit({"player_id": player_id, "display_name": display_name, "is_guest": false, "token": token})

func _on_http_done(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if _pending.is_valid():
		var cb := _pending
		_pending = Callable()
		cb.call(code, body)
