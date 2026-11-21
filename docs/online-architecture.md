# Kiến trúc Online — Đấu Trường Nhân Quả (M2)

> SRS v2.1 + quyết định của bạn (21/11/2026): **Render** host server game +
> web; **Supabase** thay PostgreSQL/Redis tự dựng. M1 offline không dùng
> phần này. Tài liệu này là bản đồ duy nhất cho M2 — code nằm ở `server/`.

## 1. Sơ đồ hệ thống

```
                    ┌─────────────────────────────┐
                    │  Godot client (M1 → M2)     │
                    │  Web (export) / Android/iOS │
                    │  - render + animation       │
                    │  - KHÔNG tự tính sát thương │
                    │  - KHÔNG giữ round_seed     │
                    └──────┬──────────────┬───────┘
                           │ WSS          │ HTTPS (REST)
                           │ Colyseus     │ Auth / profile / assets
                           ▼              ▼
              ┌────────────────────┐  ┌──────────────────────────────┐
              │  RENDER (free)     │  │  SUPABASE                    │
              │  Colyseus server   │  │  ┌─ Auth (email/Google/Apple)│
              │  Node 22 + TS      │  │  ├─ Postgres: profiles,     │
              │  - BattleRoom 8p   │  │  │  matches, match_players,  │
              │  - 20 Hz tick      │  │  │  mmr_history, inventory,  │
              │  - matchmaking     │  │  │  telemetry_events         │
              │  - round_seed      │  │  ├─ Storage: portraits, audio│
              │  - /health         │  │  └─ Realtime: lobby/queue   │
              └─────────┬──────────┘  │     presence ONLY (không     │
                        │ service-role│     │     dùng cho combat)    │
                        │ key (server │     └──────────────────────────────┘
                        │ only)       │
                        └─────────────┘
```

## 2. Cái gì chạy ở đâu

| Việc | Chạy ở | Ghi chú |
|---|---|---|
| Combat sim 20 Hz, RNG, sát thương, pairing, ghost | Render — BattleRoom | Server-authoritative, SRS §5/§9. Client chỉ nội suy animation từ event |
| Shop/kinh tế/XP/pool validate | Render — BattleRoom | Số liệu từ `data/balance_config.json` (server load file này) |
| Matchmaking, MMR | Render — MatchQueue + Supabase | MMR start 1000, delta +40/+25/+12/+4/−6/−14/−24/−36, bot-fill ×0.5 |
| Tài khoản, cross-save, lịch sử trận, MMR | Supabase Postgres | Nguồn sự thật duy nhất (SRS §11.3). Client không giữ tiến trình ngoài cache hiển thị |
| Đăng nhập | Supabase Auth | Email / Google / Apple. Guest chỉ casual, device-scoped |
| Portrait / audio | Supabase Storage | Bucket `portraits`, `audio` — public read, chỉ service key upload |
| Lobby, trạng thái queue, thông báo | Supabase Realtime | Presence thôi. Combat KHÔNG qua Realtime (không đủ nhanh/ổn định cho tick 20 Hz) |
| Web game | Render static site | **Chưa có** — xem §6 |
| Bot (fill + M1 Medium) | Render — trong room | Bot dùng đúng luật/pool/shop như người (SRS §11.1), ghi rõ `is_bot` trong lịch sử |

## 3. Luồng dữ liệu

### 3.1 Đăng nhập + cross-save
1. Client mở Supabase Auth (email/Google/Apple) → nhận JWT.
2. Client join Colyseus `battle` kèm JWT → server verify qua `supabase.auth.getUser()` (`server/src/auth.ts`).
3. Server đọc `profiles` (MMR, cấp, tiền, inventory) → trận dùng dữ liệu đó.
4. Hết trận: server ghi `matches` + `match_players` + `apply_mmr_delta()` bằng **service role key**.
5. Đăng nhập ở máy khác thấy cùng dữ liệu trong ≤5 s (SRS §13) vì mọi thứ nằm ở Supabase.

### 3.2 Một vòng đấu (round)
1. Server sinh `round_seed`, lưu vào `matches.round_seeds`.
2. PREP 30 s: client gửi ý định (`c2s_buy_shop`, `c2s_move_unit`, …). Server validate phase + `round_id` + vàng/cấp/pool, sai thì `s2c_error`, không đổi state.
3. COMBAT ≤45 s: tick 50 ms, server gửi **chỉ event** của cặp đấu client đang xem: `move / attack / skill_cast / damage / heal / cc / death / karma_trigger`. Client nội suy vị trí + chạy animation (tướng di chuyển, popup icon skill + VFX, âm thanh chiêu).
4. ROUND_RESOLVE: sát thương người thua = `base_damage(stage) + tướng địch còn sống × 1` (PvE thua = một nửa, làm tròn xuống), cộng vàng (5 + lãi tối đa 5 + thắng PvP +1 + streak), loại người HP ≤ 0, ghi replay + telemetry.
5. Còn 1 người → GAME_OVER: xếp hạng, cộng MMR, lưu lịch sử đầy đủ kèm seed mọi vòng.

### 3.3 Reconnect (SRS §10.3)
Client mất mạng → kết nối lại bằng session token → server gửi `s2c_room_state` + `s2c_board_snapshot` mới nhất, rồi tiếp tục event từ tick hiện tại + 2 s event gần nhất để khớp animation. Không phát lại event cũ. Mục tiêu <2 s trên 4G.

## 4. Giao thức — điểm khác so với SRS (ghi rõ, không giấu)

SRS §10 chốt **Protobuf qua WebSocket**. Bản scaffold này dùng **Colyseus
(`@colyseus/schema`)** thay cho Protobuf, vì Colyseus là framework server
đã chốt cho M2 và encoding schema nhị phân của nó mới giữ được ngân sách
băng thông 5 KB/s/client (SRS §2.3).

- **Giữ nguyên:** `protocol_version = 1`, mọi message đều có `round_id`,
  tên message và trường theo SRS §10.1/§10.2 (`c2s_join_queue`,
  `c2s_move_unit`, `s2c_room_state`, `s2c_combat_events`, …), xem
  `server/src/protocol.ts`.
- **Khác:** định dạng dây (wire format) là Colyseus schema, không phải
  Protobuf. Client Godot dùng thư viện Colyseus-client, không parse `.proto`.
- **Hệ quả:** nếu sau này vẫn muốn Protobuf thuần, đó là một lần đổi
  transport riêng, không đổi tên message hay luật game. Không làm trong M2.

## 5. M1 offline → M2 online: client Godot phải đổi gì

M1 hiện tại (offline, 1 vs 7 bot) **không được sửa trong đợt này** — M1 agent
đang sở hữu `scripts/`. Các điểm móc (hook points) cho M2, để làm sau khi
M1 xong:

| Móc | File mới / sửa | Việc |
|---|---|---|
| Kết nối server | `scripts/online_client.gd` (MỚI) | Colyseus client: join room, gửi c2s, nhận s2c, reconnect bằng session token |
| Auth | `scripts/online_auth.gd` (MỚI) | Lấy JWT từ Supabase Auth (qua HTTP), đưa cho `online_client.gd`; guest mode casual |
| Combat | `scripts/m1_sim.gd` | Tách sim thành module dùng chung: M1 gọi local, M2 gọi event từ server — **không viết sim thứ hai** (xem `server/src/combat.ts`) |
| Hiển thị combat | `scripts/m1_view.gd` | Đã nhận event để animate (di chuyển, skill popup + VFX) — M2 chỉ đổi nguồn event từ local sim sang server |
| Kinh tế/shop | `scripts/m1_economy.gd` | M2: mọi thao tác gửi lên server validate, không tự áp dụng local rồi mới gửi |
| Dữ liệu | `data/units.json`, `data/balance_config.json` | Server load đúng 2 file này — đổi số ở đây là đổi cả server lẫn client |
| Asset URL | `data/units.json` → `visual.portrait_url` | M2: đổi sang URL Supabase Storage `portraits/<unit_id>.png` (xem migration 003) |
| Menu/lobby | scene mới | Màn hình đăng nhập, queue (ranked/casual), hiển thị MMR từ `profiles` |

## 6. Web export — vì sao static site đang tắt

`server/render.yaml` có block static site **đang comment**. Lý do: Godot
export templates (~1.28 GB) chưa được cài trên VM này, nên chưa có file
`.html/.wasm/.pck` nào để publish. Trình tự đúng:

1. Cài export templates Godot 4.7.2 (web).
2. Build web export từ project Godot (preset Web, threads on/off quyết định
   có cần header COOP/COEP trong `render.yaml`).
3. Bỏ comment block static site trong `render.yaml`, deploy lại Blueprint.

Không deploy static site trống — Render sẽ fail vì không có file.

## 7. Checklist setup cho bạn (làm theo thứ tự)

### Bước 1 — Supabase (https://supabase.com, free tier)
- [ ] Tạo project mới (region Singapore — gần Render `singapore` nhất).
- [ ] Lưu lại: Project URL + `anon key` + `service_role key` (Dashboard → Settings → API).
- [ ] SQL Editor → chạy lần lượt `server/supabase/migrations/001_init.sql`, `002_rls.sql`, `003_storage.sql`.
- [ ] Authentication → Providers: bật Google, Apple (email đã bật sẵn).
- [ ] Kiểm tra: Table Editor thấy 6 bảng; tạo 1 user test thấy `profiles` tự có dòng mới (trigger).

### Bước 2 — Render (https://render.com, free tier)
- [ ] Tạo tài khoản, connect repo GitHub `duyanhk1000-dot/HeroWorld`.
- [ ] New → Blueprint → chọn `server/render.yaml` trong repo.
- [ ] Render tạo service `dau-truong-nhan-qua-server`. Vào Environment, nhập:
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (lấy từ Bước 1 — **không commit key vào git, không gửi key qua chat**).
- [ ] Deploy. Mở `https://<service>.onrender.com/health` → phải trả `{"ok":true}`.

### Bước 3 — Test online đầu tiên (chưa cần client Godot)
- [ ] Dùng Colyseus client test (hoặc `wscat`) join room `battle` với 8 seat test.
- [ ] Kiểm tra: PREP 30 s → COMBAT tick 50 ms → ROUND_RESOLVE → log round_seed.
- [ ] Kiểm tra Supabase: hết trận có dòng mới trong `matches` + `match_players`, MMR đổi đúng delta.
- [ ] Kiểm tra reconnect: ngắt kết nối giữa trận, join lại, nhận đủ room_state + snapshot trong <2 s.

### Bước 4 — Nối client Godot (sau khi M1 xong)
- [ ] Làm các hook ở §5, trỏ client tới URL Render + Supabase.
- [ ] Upload portrait/audio lên Storage bucket theo đúng tên trong migration 003.
- [ ] Test 8 người thật 1 trận → đo băng thông combat ≤5 KB/s/client.

## 8. Giới hạn free tier cần để ý

| Dịch vụ | Giới hạn free | Hệ quả cho game |
|---|---|---|
| Render free web service | **Ngủ sau ~15 phút không có request** (spin down), 750 giờ/tháng | Người chơi đầu tiên sau lúc vắng sẽ chờ ~30–60 s để server tỉnh. Phòng đang chạy không bị ngủ giữa trận (có traffic), nhưng queue vắng là vấn đề. Lên Starter (~$7/tháng) để hết ngủ — nên làm trước khi mở cho người ngoài test |
| Render free | 512 MB RAM, 1 instance | SRS §13 yêu cầu 1 worker ≥25 phòng (200 người). Free instance chỉ nên test vài phòng; đo RAM trước khi nhận nhiều phòng |
| Supabase free | 500 MB database, 1 GB storage, 50.000 MAU, 2 GB bandwidth/tháng | Đủ cho test + soft launch nhỏ. Portrait (8 ảnh ~20 MB) + audio (~17 MB) vừa trong 1 GB, nhưng full 49 tướng + nhạc sẽ vượt — tính lại ở M3 |
| Supabase free | Tạm dừng sau 7 ngày không hoạt động | Project test bị pause thì phải bấm Resume trong Dashboard |
| Colyseus | Không giới hạn số phòng trong code | Giới hạn thật là RAM/CPU của Render instance — đo ở M2 acceptance |

## 9. Bảo mật — quy tắc không thỏa hiệp

- **Service role key chỉ ở Render Environment.** Không có trong git, không
  trong client Godot, không trong chat/email.
- Client không bao giờ tự ghi MMR/match: RLS chặn (migration 002), server
  là writer duy nhất.
- Mọi thao tác combat đều validate ở server; client gửi ý định, không gửi
  kết quả. Gian lận bằng client sửa số sẽ bị server từ chối (`s2c_error`).
- JWT hết hạn → client refresh qua Supabase Auth rồi join lại, không dùng
  token cũ.
- Rate-limit thao tác theo tài khoản (SRS §13) là việc của M2 hoàn thiện:
  hiện tại room chỉ từ chối sai phase/sai round; thêm rate-limit trước khi
  mở public.
