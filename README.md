# Cờ Nhân Phẩm Fantasy — Godot 4.7 + Fennara 0.4.3

Project Godot cho game cờ nhân phẩm Fantasy, theo spec `../co-nhan-pham-fantasy-spec.md`.

## Chơi thế nào
- Mở project bằng Godot 4.7.2 trở lên, chạy scene `main.tscn`.
- Bắt đầu 5 vàng, mỗi round +5 vàng, thắng +1. Roll shop 2 vàng/lần.
- Bấm tướng trong Shop để mua, bấm tướng ở Bench để xếp lên bàn 4x4.
- Bấm tướng trên bàn để bán lại +1 vàng.
- 3 tướng giống nhau tự lên 2 sao rồi 3 sao, hệ số 1.8^(sao-1).
- Bấm "Đánh Round" để đánh tự động. Round 1-6: Slime, Goblin, Orc, Boss Orc, đội AI 3 tướng, đội AI 4 tướng + Boss Rồng lửa.
- Thắng quái rơi đồ ngẫu nhiên. Thua mất 2 máu nhà, nhà có 20 máu.

## 8 tướng
Hiệp sĩ Khiên, Cung thủ Elf, Pháp sư Lửa, Sát thủ Bóng tối, Tanker Đá, Healer Ánh sáng, Rồng con, Vua Kiếm Thánh.
3 hệ: Hiệp Sĩ (+giáp), Pháp Sư (+phép), Xạ Thủ (+tốc đánh).

## Fennara đã gắn
- Addon ở `addons/fennara/`, version 0.4.3, Godot tối thiểu 4.5.
- CLI ở `~/workspace/tools/fennara/bin/fennara`, version 0.4.3.
- Hướng dẫn cho AI ở `addons/fennara/ai/guidelines.md` và `.fennara/AGENTS.md`.
- Fennara là editor dependency, lúc export game nó tự gỡ ra, không dính vào game.
- Trên máy headless này, Fennara chỉ dùng được ở mức addon + tài liệu, vì không mở được editor GUI để dùng live MCP/chat đầy đủ. Trên máy bạn có GUI thì mở Godot, bấm dock Fennara, bấm Set Up Fennara.

## Test headless
```bash
~/workspace/tools/godot/godot --headless --path ~/workspace/co-nhan-pham-godot --quit-after 5
```
Test tự động mua tướng, xếp bàn, đánh đủ 6 round, in ra `CO_NHAN_PHAM_GODOT_OK`.

## File chính
- `project.godot` — Godot 4.7, GL Compatibility
- `main.tscn` — scene chính
- `scripts/main.gd` — logic shop, bàn, battle, UI
- `scripts/heroes_data.gd` — dữ liệu 8 tướng, quái từng round, synergy
