# Đấu Trường Nhân Quả — M1 Vertical Slice (SRS v2.1)

Auto-battler 8 người: 21 tướng VN/CN/JP, 1 người chơi đấu 7 bot Trung bình,
mô phỏng deterministic 20Hz, chơi offline. Engine Godot 4.7.2 (SRS chốt
Cocos Creator cho bản chính thức, nhưng M1 dùng Godot đã có sẵn trên máy này).

## Chạy

```bash
# Mở bằng Godot 4.7.2, chạy scene main.tscn, hoặc headless test:
~/workspace/tools/godot/godot --headless --path ~/workspace/co-nhan-pham-godot
```

Headless test chạy: sanity check (21 tướng, shop odds, XP, synergy) →
replay check (cùng seed + đội hình cho cùng chuỗi event) → view check →
1 trận 8 người đầy đủ tới Top 1, rồi thoát. Kỳ vọng in ra `M1_HEADLESS_OK`.

GUI có 3 nút: **Chạy trận tự động M1**, **Kiểm tra replay**, **Xem combat mẫu
3v3** (chiếu lại combat: tướng di chuyển theo ô lục giác, lunge khi đánh,
flash/knockback khi trúng đòn, fade khi chết, popup chiêu + hiệu ứng hạt +
âm thanh skill).

## Luật M1 (theo SRS v2.1)

- Bàn hex 7x8 (`index = row*7+col`), bench 9, shop 5, tối đa tướng trên bàn = cấp.
- Kinh tế: bắt đầu 5 vàng, cấp 1, 100 HP; +5 vàng/vòng, lãi +1/10 vàng (tối đa +5),
  chuỗi thắng/thua +1/+2/+3, thắng PvP +1, roll 2 vàng, mua 4 XP = 4 vàng, +2 XP/vòng.
- Pool dùng chung: 1★ 22, 2★ 20, 3★ 17, 4★ 12, 5★ 9 mỗi tướng. Ghép sao ×1.8^(sao-1).
- Combat: tick 20Hz, tối đa 45s rồi overtime; sát thương `raw × 100/(100+armor|MR)`,
  crit 25% ×1.40, né tối đa 35% (đòn thường), mana +10 khi đánh trúng / +7 khi bị đánh.
- Synergy Quốc gia + Hệ, ngưỡng 2/4/6. Chưa có item, chưa có Karma Bond (M2/M3).
- Stage 6 vòng: stage 1 = PvE,PvP,PvP,PvE,PvP,Boss; stage 2+ = PvP,PvP,PvP,PvE,PvP,Boss.
  Thua mất `base(stage) + số tướng địch còn sống` HP; thua PvE mất một nửa.
  Ghép 4 cặp/vòng, số người lẻ thì đấu bóng ma (ghost).

## Dữ liệu (data-driven, sửa số không cần sửa code)

- `data/units.json` — 21 tướng (kèm `gender` cho team asset).
- `data/balance_config.json` — mọi hệ số cân bằng.
- `data/pve.json` — quái PvE/boss theo stage.

Chi tiết các số đã chốt từ khoảng SRS và những gì còn thiếu: xem
`docs/m1-notes.md`.

## Module

| File | Vai trò |
|---|---|
| `scripts/m1_hex.gd` | Hex grid, odd-r ↔ axial, BFS |
| `scripts/m1_data.gd` | Nạp JSON, XP/level, shop odds |
| `scripts/m1_synergy.gd` | Synergy 2/4/6 |
| `scripts/m1_sim.gd` | Combat deterministic 20Hz |
| `scripts/m1_economy.gd` | Pool, shop, mua/bán/ghép sao, thu nhập |
| `scripts/m1_bot.gd` | Bot Trung bình |
| `scripts/m1_match.gd` | Vòng lặp trận 8 người |
| `scripts/m1_view.gd` | Timeline animation từ event sim + kiểm tra asset |
| `scripts/m1_combat_view.gd` | Chiếu combat: di chuyển, skill VFX, âm thanh |
| `scripts/m1_main.gd` | Scene chính + headless test |

## Asset

- Skill WAV: đủ 21/21 trong `ohmygame_assets/` (`<unit_id>_skill.wav`).
- Skill icon PNG: 0/21 — view dùng placeholder (vòng tròn màu + tên chiêu).
- Portrait: 7/21 dùng được; `vn_yet_kieu_portrait.png` bị loại (art sai:
  nữ + đồ lặn hiện đại, Yết Kiêu là nam).

## Legacy

Demo Fantasy 8 tướng cũ vẫn chạy được: mở `legacy_main.tscn`
(`scripts/main.gd`, `scripts/heroes_data.gd` không đổi).

## Fennara

Addon Fennara 0.4.3 ở `addons/fennara/` (editor dependency, lúc export tự gỡ).
Trên máy headless chỉ dùng ở mức addon + tài liệu; trên máy có GUI thì mở dock
Fennara → Set Up Fennara để dùng live MCP/chat.
