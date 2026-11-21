# Style Guide — Đấu Trường Nhân Quả (M1)

SRS v2.1: 2.5D Isometric / Diorama, stylized, hex grid, age 12+, no gore, no blood.
Engine for M1 prototype: Godot 4.7. Art is 2D stylized portraits / icons / UI mockups (not 3D models — 3D models + animation are M3).

## Portrait framing (applies to every hero portrait)
- Bust portrait, 3/4 front view, hero centered, head + shoulders + signature weapon/prop visible.
- Plain dark-teal background (#0E2A2B to #123332 gradient), soft rim light.
- No text, no watermark, no logo, no UI frame inside the image.
- Stylized semi-realistic game art, clean shapes, readable at 128×128 px in the shop.
- File: `<unit_id>_portrait.png`, PNG, in `ohmygame_assets/` (staging). Sync to `assets/` only via sync.sh.

## Palette per nation
- VN — jade green (#1F8A6B) + gold (#D9A441), bamboo / lotus / bronze motifs.
- CN — crimson (#B3261E) + gold (#D9A441), dragon / jade / silk motifs.
- JP — indigo (#2B3A67) + white (#F2EFE6), sakura / katana / storm motifs.
- (M3 only) FR — royal blue + gold, US — navy + star gold, AZ — turquoise + sun gold, UK — emerald + silver.

## Class accent colors (rim light / glow / icon ring)
- GUARDIAN: steel blue #5B8DBF
- WARRIOR: red #C0392B
- ASSASSIN: purple-black #6C3483
- ARCHER: green #27AE60
- MAGE: violet #8E44AD
- STRATEGIST: amber #D68910
- DIVINE: radiant gold-white #F9E79F

## Skill icon style
- Circular, flat, high contrast, single clear symbol, no text.
- Background dark, symbol in class accent colour, thin gold ring.
- File: `<unit_id>_skill.png`, square, in `ohmygame_assets/`.

## UI style
- Dark wood (#3B2416) + gold trim (#D9A441), dark-teal panels (#122E2E), cream text (#F2EFE6).
- Readable on mobile: large buttons, minimum 44 px touch targets, high contrast.
- Files in `canvas/`: ui_main_menu.png, ui_shop.png, ui_battle.png, ui_result.png.

## Naming
- Hero IDs are the SRS unit_id, e.g. vn_thanh_giong, cn_quan_vu, jp_susanoo.
- Never invent a new hero ID. M1 = VN/CN/JP only (21 heroes). FR/US/AZ/UK are M3.
- Skill names are from SRS Appendix A (see ASSET_LIST.md).
