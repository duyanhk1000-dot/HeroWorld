# M1 Vertical Slice — ghi chú triển khai (SRS v2.1)

Engine: **Godot 4.7.2** (không dùng Cocos Creator như SRS mục 2 — quyết định của
dự án: giữ Godot đã cài sẵn; sim deterministic được viết lại bằng GDScript theo
đúng công thức SRS, không phụ thuộc engine). M1 chơi offline, 1 người vs 7 bot.

## File

- `data/units.json` — 21 tướng VN/CN/JP (kèm trường `gender` cho asset team:
  19 nam, 2 nữ — chỉ Hai Bà Trưng và Nữ Oa là nữ; khớp `canvas/HEROES_RESEARCH.md`).
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
  skill icon PNG 0/21 → placeholder; portrait 7/21 (đếm sau khi loại
  `vn_yet_kieu_portrait.png` — art sai: nữ + đồ lặn hiện đại, xem
  `M1View.portrait_path()`).
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
- Ngoài M1: GUI chơi tay đầy đủ (hiện tại GUI chỉ có nút chạy trận tự động /
  replay check / xem combat mẫu — người chơi trong test headless do bot lái);
  export web (chưa cài export templates); hiệu ứng khống chế (stun) chưa có
  vì không chiêu M1 nào dùng CC.

## Kiểm chứng (headless, Godot 4.7.2)

```
~/workspace/tools/godot/godot --headless --path ~/workspace/co-nhan-pham-godot
M1_SANITY OK
M1_REPLAY seed=777 winner=1 ticks=648 events=123 same=true
M1_VIEW_TIMELINE move=5 jump=2 hit=100 skill=11 death=5 dodge=0
M1_VIEW_ASSETS icons=0/21 sfx=21/21 portraits=7/21
M1_VIEW_WAV ok rate=44100 stereo=false bytes=132300
M1_VIEW_PORTRAIT ok 1600x1600
M1_VIEW_SMOKE cursor=123/123 playing=false
M1_VIEW OK
M1_MATCH_OK top1=Bot Dũng rounds=47 ranking=[#1 Bot Dũng #2 Bot Hà #3 Bot An
  #4 Bạn #5 Bot Chi #6 Bot Bình #7 Bot Linh #8 Bot Khang]
M1_HEADLESS_OK
```

Legacy Fantasy demo vẫn chạy: `godot --headless --path . res://legacy_main.tscn`
→ `CO_NHAN_PHAM_GODOT_OK rounds_done=6`.
