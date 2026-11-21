# M2 — Godot Online Client (ghi chú kỹ thuật)

Client Godot nối vào server Colyseus 0.15 (Render + Supabase), xem
`docs/online-architecture.md` §5 (hook points) và `server/README.md`.

## File

| File | Việc |
|---|---|
| `scripts/online_msgpack.gd` | Codec msgpack tối thiểu (nil/bool/int/float64/str/array/map/bin), big-endian. Dùng cho ROOM_DATA và số trong schema state. |
| `scripts/online_schema.gd` | Giải mã @colyseus/schema state: Reflection handshake (JOIN_ROOM) → bảng kiểu → full state (14) + patch (15). Lấy `shopJson` của player. |
| `scripts/online_auth.gd` | Guest (`guest:<device_id>`, chỉ Casual) + login email qua Supabase Auth REST. Lưu cấu hình ở `user://online_config.json`. |
| `scripts/online_client.gd` | Colyseus client thuần bằng `WebSocketPeer`: queue HTTP → matchmake HTTP → WS handshake → ROOM_DATA. Gửi c2s, nhận s2c, reconnect. |
| `scripts/online_events.gd` | Dịch `s2c_combat_events` của server thành replay `M1CombatView` (defs + timeline M1 + casters). |
| `scripts/online_test.gd` | Test headless: unit test (msgpack + Reflection) rồi e2e 1 client (queue → join → mua 1 tướng → `ONLINE_CLIENT_OK`). |
| `scripts/m1_gui.gd` | Thêm nút "Online: Casual / Ranked" + "Rời Online"; khi online thì mọi thao tác prep/combat đi qua server. Offline không đổi. |

## Luồng

```
POST /queue {playerId, mode, ...} → poll GET /queue/:playerId
  → {status:"matched", roomId}
POST /matchmake/joinById/:roomId {protocol_version:1, playerId|token}
  → {room:{processId, roomId}, sessionId}
WS ws://host/:processId/:roomId?sessionId=...
  ← [10, len, reconnectionToken, len, "schema", handshake(Reflection)]
  → [10] (ack) → server gửi ROOM_STATE (14)
  ↔ [13, msgpack-str type, msgpack payload] (c2s_*/s2c_*)
```

Reconnect: mất WS giữa trận → join lại bằng roomId cũ (joinById) → gửi
`c2s_reconnect` → server gửi lại `room_state` + `board_snapshot` + event
2s gần nhất của cặp mình (SRS §10.3). Client khử trùng event theo
`(round_id, tick, type, unit_uid, target_uid)`.

Combat: client buffer event trong `COMBAT_PHASE`; khi `s2c_round_result`
về thì dịch sang timeline M1 và chiếu lại bằng `M1CombatView` (giống
offline). Kết quả lấy từ server, không dùng sim local.

## Phát hiện quan trọng — server gửi ROOM_STATE rỗng — ĐÃ SỬA (21/11/2026)

Probe trực tiếp server local (Colyseus 0.15.57) cho thấy:

- `ROOM_STATE` (code 14) luôn chỉ có 1 byte (`0x0e`), không có nội dung.
- Không bao giờ có `ROOM_STATE_PATCH` (code 15), dù trận đang chạy.

Nguyên nhân: `server/tsconfig.json` dùng `target: ES2022` mà không tắt
`useDefineForClassFields` (mặc định `true` ở ES2022). Class field
(`playerId = ""`, `hp = 100`, … trong `BattleRoomState.ts`) dùng
[[Define]] semantics nên **vượt qua setter** mà decorator `@type` của
`@colyseus/schema` cài để theo dõi thay đổi. Hệ quả: schema không ghi
nhận thay đổi nào → `encodeAll()` trả về `[]` → state rỗng, patch không
bao giờ có (`hasChanges` luôn false).

**Cách sửa:** đã thêm `"useDefineForClassFields": false` vào `server/tsconfig.json`, build lại, test lại 21/11/2026: `ROOM_STATE full, shop known: true` — shop đọc được từ server, không còn mua "mù".

**Ảnh hưởng trước khi sửa:** shop KHÔNG đọc được từ server nên client dùng chế độ mua "mù" (blind-buy). Sau khi sửa, client đọc shop trực tiếp từ schema state qua decoder đã viết sẵn, không cần đổi code client.

Bộ giải mã schema đã kiểm chứng được phần handshake: 511 byte thật từ
server giải ra đúng bảng kiểu (rootType=1 BattleRoomState 9 field;
PlayerState 12 field, có `shopJson`, `players` là map→type 0). Phần
giải full state/patch theo đúng format đó, nhưng **chưa kiểm chứng
được end-to-end** vì server đang gửi state rỗng — sẽ kiểm chứng lại
sau khi server sửa (test `online_test.gd` sẽ in `shop known: true`).

## Giới hạn còn lại

- **Shop mù** (xem trên): chờ sửa server.
- **Vị trí tướng địch lúc spawn trong replay** là ước lượng (server
  không gửi board đối thủ; chỉ biết vị trí qua event `move` đầu tiên).
  Quái PvE thì biết chính xác ô (ô cố định trong `sim.ts`).
- **Số sao / HP tối đa của tướng địch** trong replay là ước lượng
  (uid không mang star; tính như 1 sao). Thanh HP trong replay hiện
  cũng không cập nhật theo event (giống offline — `build_timeline`
  không truyền `hp`).
- **Combat chiếu lại sau khi đánh xong**, chưa chiếu trực tiếp từng
  event khi đang đánh (đỡ phức tạp, giống luồng offline).
- **Ranked cần Supabase login** (JWT). Bản này GUI mặc định guest nên
  nút Ranked bị chặn; `online_auth.gd` đã có `login_email()` sẵn, chỉ
  cần thêm form đăng nhập ở GUI + bật Auth provider ở Supabase.
- **Chưa có web export** (vẫn cần export templates Godot, xem
  `docs/online-architecture.md` §6). → **ĐÃ XONG 21/11/2026 21:31**: đã tải
  export templates Godot 4.7.2 (~1.28 GB) về
  `~/.local/share/godot/export_templates/4.7.2.stable/` (35 file), thêm
  `export_presets.cfg` (preset "Web", `thread_support=false` = bản
  nothreads, chạy được trên host tĩnh thường không cần header
  COOP/COEP), export thử thành công:
  `export/web/` 310 MB (`index.html` + `index.js` + `index.wasm`
  39.5 MB + `index.pck` 284.7 MB gồm đủ 49 portraits/icons/audio).
  Lệnh export: `godot --headless --path . --export-release Web
  export/web/index.html` (lưu ý: phải `mkdir -p export/web` trước vì
  Godot không tự tạo thư mục đích). Thư mục `export/` là build output,
  KHÔNG push lên GitHub. Host tĩnh gợi ý: GitHub Pages / Cloudflare
  Pages (free, không cần thẻ). Server online vẫn chạy riêng (Colyseus);
  client web trỏ `server_url` trong `user://online_config.json`.
- **Chưa có rate-limit** phía client; server chỉ từ chối sai phase/
  sai round (xem `docs/online-architecture.md` §9).
- Cấu hình mặc định trỏ `http://127.0.0.1:2568` (local dev). Đổi sang
  Render bằng `user://online_config.json` (`server_url`) hoặc sửa
  `server_url` mặc định trong `online_auth.gd`.

## Test

```sh
# Terminal 1: server local
cd server && npm run build
PORT=2568 M2_FAST=1 SUPABASE_URL= SUPABASE_ANON_KEY= \
  SUPABASE_SERVICE_ROLE_KEY= node dist/index.js

# Terminal 2: test client (can server /health, unit test + e2e 1 client)
godot --headless --path . -s scripts/online_test.gd
# Pass: ONLINE_CLIENT_OK (unit msgpack OK, unit reflection OK, /health OK,
#       matched, joined, bought 1 unit bench>=1)
```

**Kết quả đã chạy 21/11/2026 (server local, M2_FAST=1): `ONLINE_CLIENT_OK`.**
Log thật: unit msgpack OK → unit reflection OK (rootType=1, PlayerState
12 fields, BattleRoomState 9 fields) → /health OK → queued self
`guest:j2rluycex72vjqci` → matched room `eNYmKQ5dO` → handshake ok
(rootType=1 types=[0, 1]) → joined room → `ROOM_STATE full, shop known:
false` (xác nhận server gửi state rỗng, xem trên) → trying buy slot 0 →
bought 1 unit, bench=1 → `ONLINE_CLIENT_OK`.

Test M1 offline không đổi (chạy lại 21/11/2026 sau khi sửa GUI):

```sh
godot --headless --path . --quit-after 10
# Pass: M1_HEADLESS_OK + M1_MANUAL_OK
```
