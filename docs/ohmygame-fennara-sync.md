# Đồng bộ OhMyGame + Fennara cho Cờ Nhân Phẩm

Xem bản đầy đủ ở `~/workspace/custom-skills/ohmygame-studio/references/fennara-sync.md`.

## Tóm tắt 1 phút

- OhMyGame làm art, 3D, âm thanh, canvas, playtest.
- Fennara kiểm tra Godot thật: scene, script, lỗi, screenshot, log chạy.
- Hai bên không nói chuyện trực tiếp với nhau. Chúng gặp nhau ở thư mục project chung `co-nhan-pham-godot/`.

## Luồng

1. OhMyGame tạo asset vào `ohmygame_assets/` theo tên tướng ổn định, ví dụ `hiep_si_khien_portrait.png`.
2. Kiểm tra file bằng mắt và bằng `canvas_check`.
3. Chạy `~/workspace/tools/ohmygame-fennara-sync/sync.sh` để copy file đã kiểm tra sang `assets/` và chạy test Godot headless.
4. Fennara kiểm tra script và scene đã đổi. Trên máy headless, test headless phải in ra `CO_NHAN_PHAM_GODOT_OK`.
5. Trên máy có GUI, dùng OhMyGame `game_use` để playtest thật, rồi quay lại bước 1 nếu cần sửa.

## Thư mục

- `canvas/` - OhMyGame làm chủ, design và concept art.
- `ohmygame_assets/` - Chỗ staging, file thô mới tạo.
- `assets/` - File đã kiểm tra, Godot import từ đây.
- `scripts/` - Chỉ Muse và Fennara sửa, OhMyGame không sửa trực tiếp.
- `addons/fennara/` - Được bảo vệ, không sửa.

## Giới hạn

- Trên máy headless này không có MCP live của cả hai bên, không có cửa sổ player. Dùng sync file và test headless làm cổng kiểm tra.
- Trên máy Mac/Windows của bạn có GUI thì chạy đủ vòng: OhMyGame bật MCP Server, Godot mở editor với Fennara.
