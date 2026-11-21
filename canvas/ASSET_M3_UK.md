# ASSET M3 — UK (Anh) — Trạng thái

Ngày: 2026-11-21. Nguồn: `canvas/HEROES_RESEARCH_M3.md` mục 22–28 + `canvas/STYLE_GUIDE.md`
(palette UK ngọc lục bảo + bạc; chân dung bust 3/4, nền xanh teal đậm trơn, không chữ;
icon skill tròn phẳng, viền vàng mỏng, không chữ). Tất cả file ở `ohmygame_assets/`,
PNG 1600×1600, đã kiểm tra bằng `file`. Không copy sang `assets/`, không sửa
ASSET_LIST.md / scripts / data / server, không đẩy GitHub.

## Đã xong: 7/7 chân dung + 7/7 icon skill = 14/14

| unit_id | Tên | Giới tính | Chân dung | Icon skill |
|---|---|---|---|---|
| uk_arthur | King Arthur (GUARDIAN) | NAM | `uk_arthur_portrait.png` — 1600×1600, 3.1 MB | `uk_arthur_skill.png` — 1600×1600, 2.2 MB |
| uk_lancelot | Lancelot (WARRIOR) | NAM | `uk_lancelot_portrait.png` — 1600×1600, 2.0 MB | `uk_lancelot_skill.png` — 1600×1600, 940 KB |
| uk_spring_heeled_jack | Spring-heeled Jack (ASSASSIN) | NAM | `uk_spring_heeled_jack_portrait.png` — 1600×1600, 1.6 MB | `uk_spring_heeled_jack_skill.png` — 1600×1600, 805 KB |
| uk_robin | Robin Hood (ARCHER) | NAM | `uk_robin_portrait.png` — 1600×1600, 2.5 MB | `uk_robin_skill.png` — 1600×1600, 1.4 MB |
| uk_morgana | Morgana (MAGE) | NỮ | `uk_morgana_portrait.png` — 1600×1600, 2.4 MB | `uk_morgana_skill.png` — 1600×1600, 1.2 MB |
| uk_merlin | Merlin (STRATEGIST) | NAM | `uk_merlin_portrait.png` — 1600×1600, 2.4 MB | `uk_merlin_skill.png` — 1600×1600, 910 KB |
| uk_beowulf | Beowulf (DIVINE) | NAM | `uk_beowulf_portrait.png` — 1600×1600, 2.4 MB | `uk_beowulf_skill.png` — 1600×1600, 1.2 MB |

## Kiểm tra bẫy (đã xem ảnh trực tiếp)
- **uk_arthur**: NAM, râu, vương miện vàng, chainmail ngọc lục bảo + surcoat rồng đỏ,
  cầm Excalibur phát sáng — đúng, không vẽ nữ kiểu Fate.
- **uk_spring_heeled_jack**: mũ sắt, áo trắng oilskin bó sát, áo choàng đen, mắt lửa đỏ,
  thở lửa xanh-trắng, vuốt kim loại — đúng Spring-heeled Jack; KHÔNG mũ chóp, KHÔNG dao mổ,
  KHÔNG sừng/đuôi quỷ, KHÔNG Whitechapel (không phải Jack the Ripper).

## Chưa vẽ được: 0
- Không có ảnh nào bị công cụ từ chối. Không có file .webp cần convert.
- Lưu ý nhỏ (không cần vẽ lại): banner sau lưng Arthur có họa tiết fleur-de-lis
  (kiểu Pháp) lẫn với rồng đỏ — không ảnh hưởng nhận diện tướng.

## Ghi chú
- File media-generation `*.json` kèm theo trong `ohmygame_assets/` là log của công cụ
  tạo ảnh, không phải asset game.
