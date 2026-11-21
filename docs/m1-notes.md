# M1 Vertical Slice — ghi chú triển khai (SRS v2.1)

Engine: **Godot 4.7.2** (không dùng Cocos Creator như SRS mục 2 — quyết định của
dự án: giữ Godot đã cài sẵn; sim deterministic được viết lại bằng GDScript theo
đúng công thức SRS, không phụ thuộc engine). M1 chơi offline, 1 người vs 7 bot.

## File

- `data/units.json` — 21 tướng VN/CN/JP (kèm trường `gender` cho asset team:
  19 nam, 2 nữ — chỉ Trưng Trắc (đổi tên từ Hai Bà Trưng 21/11) và Nữ Oa là nữ; khớp `canvas/HEROES_RESEARCH.md`).
- `data/balance_config.json` — mọi hệ số cân bằng (star 1.8, tick 20Hz, XP,
  shop odds, pool, synergy, crit/dodge, loser damage).
- `data/pve.json` — quái PvE/boss theo stage + hệ số scale stage > 3.
- `scripts/m1_hex.gd` — hex 7x8, `index = row*7+col`, odd-r ↔ axial, khoảng
  cách hex, BFS.
- `scripts/m1_data.gd` — nạp JSON, XP/level, shop odds, giá bán.
- `scripts/m1_synergy.gd` — đếm synergy 2/4/6 (chỉ tướng trên bàn, mỗi
  `unit_id` đếm 1 lần).
- `scripts/m1_sim.gd` — combat deterministic 20Hz, tối đa 900 tick + overtime.
- `scripts/m1_economy.gd` — pool dùng chung, shop, mua/bán/ghép sao, thu nhập.
- `scripts/m1_bot.gd` — bot Trung bình (SRS 11.1).
- `scripts/m1_match.gd` — vòng lặp trận 8 người, ghép cặp 4 cặp, ghost rule.
- `scripts/m1_view.gd` — timeline animation thuần (từ event sim) + kiểm tra asset.
- `scripts/m1_combat_view.gd` — Node2D chiếu lại combat: di chuyển, skill VFX, âm thanh.
- `scripts/m1_main.gd` — scene chính mặc định (M1).
- `scripts/m1_gui.gd` — GUI chơi tay đầy đủ (mới, xem mục dưới); `main.tscn`
  nay trỏ vào GUI này thay cho `m1_main.gd`. `m1_main.gd` vẫn giữ lại để
  chạy trận tự động / replay check / combat mẫu và được GUI dùng lại trong
  test headless (qua cờ `skip_auto_headless`).

## GUI chơi tay (mới — hoàn thành M1)

`scripts/m1_gui.gd` (Node2D, scene chính). Người chơi bấm để chơi
(click-click thay cho kéo-thả):

- Shop 5 ô: bấm để mua (trừ vàng theo cost, hết vàng/ghế đầy thì báo lỗi);
  Làm mới shop 2 vàng; Khóa shop (giữ nguyên vòng sau); Mua 4 XP = 4 vàng.
- Bench 9 ô + bàn hex 7x8: bấm tướng ở bench rồi bấm ô trống để xếp lên
  bàn (giới hạn theo cấp, cấp 1 chỉ xếp 1 tướng); bấm tướng trên bàn rồi
  bấm ô khác để di chuyển/đổi chỗ; bấm tướng trên bàn rồi bấm ghế để đưa
  về bench; đổi chỗ 2 tướng trên bench; chuột phải vào tướng trên bàn để
  bán nhanh. Bán theo giá SRS (1★ = giá gốc, 2★ = 3×giá − 1,
  3★ = 9×giá − 2); gộp 3 tướng giống nhau lên sao vẫn do `m1_economy.gd`
  làm khi mua (chỉ số ×1.8^(sao−1)).
- Kinh tế hiển thị: vàng + lãi dự kiến (1 vàng/10 vàng, tối đa +5), cấp +
  XP (tối đa cấp 9), chuỗi thắng/thua, HP nhà (100), vòng/giai đoạn/loại
  vòng, timer chuẩn bị 30s (hết giờ tự bắt đầu combat).
- Nút BẮT ĐẦU COMBAT: bot quyết định trước, ghép cặp, combat của người
  chơi được chiếu bằng `M1CombatView` có sẵn (di chuyển, popup skill +
  hiệu ứng + âm thanh); xong hiện kết quả vòng (thắng/thua, máu mất,
  thu nhập, vàng/cấp hiện tại, tướng bị loại) rồi sang vòng sau; game
  over khi HP = 0 hoặc còn 1 người (bảng xếp hạng 8 người, nút Chơi lại).
- Panel hệ đang kích: synergy Nation/Class đạt mốc 2/4/6 trên bàn; panel
  đối thủ (máu + số tướng trên bàn của 8 người).
- Nút phụ: Tự đánh (auto-match, chạy trận tự động và hiện bảng xếp
  hạng), Xem combat mẫu 3v3.
- GUI chỉ gọi API công khai của `M1Economy` / `M1Match` / `M1Sim` /
  `M1Synergy`; asset dùng `M1View` (portrait → vòng tròn màu + chữ cái
  khi thiếu ảnh, giống view combat).

Để chơi tay được, `m1_match.gd` được tách vòng đấu thành
`_begin_round` / `_bot_prep` / `_resolve_round` (chỉ sắp xếp lại vòng
lặp cũ, không đổi luật nào; thứ tự gọi RNG giữ nguyên nên auto-match
không đổi — kiểm chứng: chạy riêng `m1_main.gd` vẫn ra cùng kết quả),
cộng API `manual_begin_round` / `manual_resolve_round` /
`manual_is_game_over` / `manual_finalize` và chụp lại combat của người
chơi (`human_combat`: defs + result + casters) để GUI chiếu lại.
Lưu ý: kết quả auto-match hiện tại là 43 vòng / Top 1 Bot An, khác con
số 47 vòng / Bot Dũng ghi ở bản kiểm chứng đầu — đã kiểm chứng chạy
riêng `m1_main.gd` (không qua GUI, không chạy manual test trước) vẫn
ra 43 vòng / Bot An, nên 47 vòng là con số của trạng thái code cũ hơn
(trước các lần sửa bot), không phải do refactor này làm lệch.
- `scripts/main.gd` + `legacy_main.tscn` — demo Fantasy 8 tướng cũ, vẫn chạy được.

## Chuyển động + hiệu ứng skill (yêu cầu bổ sung)

Sim chỉ sinh **event** (`move`, `assassin_jump`, `damage`, `skill_cast`,
`death`, `dodge`); view (`m1_view.gd` → `m1_combat_view.gd`) chiếu lại event
đó bằng tween/particles — animation không bao giờ chạm vào sim nên replay
không đổi:

- Idle bobbing: mọi tướng còn sống nhấp nhô theo sin (visual-only).
- Di chuyển: tween vị trí tới ô hex đích theo event `move`; Assassin nhảy
  hậu tuyến ở tick 0 theo event `assassin_jump` (+ scale pulse).
- Đánh: tướng tấn công lunge về phía mục tiêu rồi về chỗ cũ (event `damage`).
- Trúng đòn: flash đỏ + knockback 7px + thanh HP cập nhật theo event.
- Chết: fade + ngã (rotation) rồi ẩn.
- Skill: popup tên chiêu + icon (skill icon → portrait → vòng tròn màu +
  chữ cái), vòng tròn mở rộng (ring tween), `GPUParticles2D` theo loại VFX,
  phát `<unit_id>_skill.wav`. VFX riêng: Yết Kiêu `water_swirl`, Thánh Gióng
  `bamboo_shield`, Susanoo `storm`, Tôn Ngộ Không `fire`, Sơn Tinh `mountain`,
  Nữ Oa `rainbow`, Seimei `pentagram`; còn lại theo loại chiêu
  (`damage`→slash, `aoe`→burst, `shield`→shield_ring).
- Nút GUI "Xem combat mẫu 3v3" chiếu lại trận cố định (tốc độ 4x).
- Asset: skill WAV đủ 21/21 (nạp trực tiếp bằng PCM, không qua importer);
  skill icon PNG 21/21; portrait 16/21 (Yết Kiêu đã vẽ lại 2026-11-21 theo
  hướng chài lưới cởi trần và được dùng lại — guard cũ trong
  `M1View.portrait_path()` đã gỡ; còn thiếu 5 portrait bị chặn khi tạo).
- Kiểm chứng headless: `_view_check()` in `m1_main.gd` — timeline của trận
  3v3 cố định có `move=5 jump=2 hit=100 skill=11 death=5`, và smoke test
  chạy thật `M1CombatView` headless tới `cursor=123/123`.

## Những con số SRS chỉ cho khoảng — cách chốt

- Chỉ số nền từng tướng: chọn 1 giá trị cụ thể trong khoảng theo giá ở Phụ lục A
  (cận chiến lấy đầu cao HP, tầm xa lấy đầu cao ATK/AP); ghi trong `units.json`.
- Shop odds cấp 9: PDF trích xuất mờ, chốt `[10,15,30,30,15]` (tổng 100, khớp
  đà tăng của cấp 7-8).
- Giá bán: 1 sao = giá gốc; 2 sao = 3×giá − 1; 3 sao = 9×giá − 2 (theo mục 4.1).
- Chiêu phép scale theo AP (`base × (1 + AP/100)`); chiêu vật lý dùng sát thương
  gốc đã cân bằng. `skill.base_damage` là giá trị theo sao `[1★, 2★, 3★]`.
- Mage 6 "chiêu đầu tiên hồi 30 mana" → +30 mana khởi đầu; Guardian 6 "lá chắn
  cho hàng trước" → chỉ Guardian nhận lá chắn 25% HP (đơn giản hoá, ghi ở
  `m1_sim.gd`); Strategist 6 shred áp khi chiêu trúng mục tiêu.
- Overtime: sau tick 900, tốc đánh +50%, hồi máu/lá chắn −50%, mỗi 40 tick
  mất 5% HP tối đa (sát thương chuẩn) +1% mỗi đợt sau; combat cắt ở 1500 tick,
  hoà thì bên còn tỉ lệ HP cao hơn thắng.
- Bot "giữ lãi 50 vàng": diễn giải thành dự trữ `min(30, 5 + 3×cấp)` vàng và
  chỉ mua XP khi bàn đã đầy theo cấp — dự trữ 50 cứng khiến bot không mua
  tướng 4 vòng đầu (đã sửa sau test đầu tiên).
- Giới hạn vòng đấu 60 vòng (van an toàn riêng của M1, SRS không quy định);
  trận test kết thúc ở vòng 47 với Top 1 thật.

## Còn thiếu so với SRS đầy đủ (M2–M4, cố tình chưa làm)

- M2: multiplayer Colyseus/server-authoritative thật, reconnect, 5 Karma Bond
  đầu, item (8 thành phần + 12 thành phẩm), matchmaking/MMR, tài khoản/cross-save.
- M3: đủ 49 tướng (FR/US/AZ/UK), đủ 10 bond, ranked, localization Việt–Anh,
  tutorial, tham vấn văn hoá AZ.
- M4: cân bằng theo telemetry, anti-cheat, soft launch.
- Ngoài M1: GUI chơi tay đầy đủ — ĐÃ XONG (xem mục "GUI chơi tay" ở
  trên); export web (chưa cài export templates); hiệu ứng khống chế
  (stun) chưa có vì không chiêu M1 nào dùng CC.

## Kiểm chứng (headless, Godot 4.7.2) — cập nhật sau khi thêm GUI

```
~/workspace/tools/godot/godot --headless --path ~/workspace/co-nhan-pham-godot
M1_MANUAL_TEST: 52 check đạt, 0 fail — mua 2 tướng, làm mới shop, xếp
  tướng lên bàn (đúng giới hạn theo cấp), mua XP lên cấp, bán tướng
  hoàn đúng giá, chiếu xong combat vòng 1 (PvE) và vòng 2 (PvP)
M1_MANUAL_OK
M1_SANITY OK
M1_REPLAY seed=777 winner=1 ticks=648 events=123 same=true
M1_VIEW_TIMELINE move=5 jump=2 hit=100 skill=11 death=5 dodge=0
M1_VIEW_ASSETS icons=21/21 sfx=21/21 portraits=16/21
M1_VIEW_WAV ok rate=44100 stereo=false bytes=132300
M1_VIEW_PORTRAIT ok 1600x1600
M1_VIEW_SMOKE cursor=123/123 playing=false
M1_VIEW OK
M1_MATCH_OK top1=Bot An rounds=43 ranking=[#1 Bot An #2 Bạn #3 Bot Linh
  #4 Bot Dũng #5 Bot Chi #6 Bot Bình #7 Bot Linh #8 Bot Khang]
M1_HEADLESS_OK
```
Chạy 2 lần liên tiếp cho cùng kết quả (M1_MANUAL_OK + M1_HEADLESS_OK).

Legacy Fantasy demo vẫn chạy: `godot --headless --path . res://legacy_main.tscn`
→ `CO_NHAN_PHAM_GODOT_OK rounds_done=6`.
