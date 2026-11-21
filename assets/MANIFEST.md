# Assets Manifest — M1 (VN / CN / JP, 21 heroes)

Synced 2026-11-21 from staging `ohmygame_assets/` (validated Godot output).
Source of truth for generation: `canvas/ASSET_LIST.md`, `canvas/HEROES_RESEARCH.md`.

## Portraits — 21/21 usable (1600x1600)

3 CN portraits were portrait-orientation in staging (1120x2240 / 1280x1920) and were
center-cropped to 1600x1600 square on sync: cn_quan_vu, cn_lu_bo, cn_hau_nghe.
vn_yet_kieu redrawn 2026-11-21 per user direction: 25-year-old Vietnamese male fisherman,
bare-chested, tanned muscular build, topknot, hand axe + chisel, fishing net over shoulder
(replaces the old wrong art — female + modern scuba gear, now overwritten).
Missing (generation blocked, not retried): vn_hai_ba_trung, vn_tran_hung_dao, cn_kinh_kha,
jp_hanzo, jp_nobunaga.

- cn_hau_nghe_portrait.png
- cn_khong_minh_portrait.png
- cn_lu_bo_portrait.png
- cn_nu_oa_portrait.png
- cn_quan_vu_portrait.png
- cn_ton_ngo_khong_portrait.png
- jp_honda_portrait.png
- jp_musashi_portrait.png
- jp_seimei_portrait.png
- jp_shingen_portrait.png
- jp_susanoo_portrait.png
- vn_an_duong_vuong_portrait.png
- vn_chu_dong_tu_portrait.png
- vn_son_tinh_portrait.png
- vn_thanh_giong_portrait.png
- vn_yet_kieu_portrait.png

## Skill icons — 21/21 (1600x1600, circular flat, thin gold ring)

- cn_hau_nghe_skill.png
- cn_khong_minh_skill.png
- cn_kinh_kha_skill.png
- cn_lu_bo_skill.png
- cn_nu_oa_skill.png
- cn_quan_vu_skill.png
- cn_ton_ngo_khong_skill.png
- jp_hanzo_skill.png
- jp_honda_skill.png
- jp_musashi_skill.png
- jp_nobunaga_skill.png
- jp_seimei_skill.png
- jp_shingen_skill.png
- jp_susanoo_skill.png
- vn_an_duong_vuong_skill.png
- vn_chu_dong_tu_skill.png
- vn_hai_ba_trung_skill.png
- vn_son_tinh_skill.png
- vn_thanh_giong_skill.png
- vn_tran_hung_dao_skill.png
- vn_yet_kieu_skill.png

## Audio — 52 WAV (44.1 kHz mono 16-bit)

- 21 attack + 21 skill WAVs (one per hero), 8 UI/game WAVs
  (ui_click, shop_roll, shop_buy, star_up, level_up, round_start, win, lose),
  2 BGM loops 30s (bgm_menu, bgm_battle). See ohmygame_assets/AUDIO_MANIFEST.md.

- bgm_battle.wav
- bgm_menu.wav
- cn_hau_nghe_attack.wav
- cn_hau_nghe_skill.wav
- cn_khong_minh_attack.wav
- cn_khong_minh_skill.wav
- cn_kinh_kha_attack.wav
- cn_kinh_kha_skill.wav
- cn_lu_bo_attack.wav
- cn_lu_bo_skill.wav
- cn_nu_oa_attack.wav
- cn_nu_oa_skill.wav
- cn_quan_vu_attack.wav
- cn_quan_vu_skill.wav
- cn_ton_ngo_khong_attack.wav
- cn_ton_ngo_khong_skill.wav
- jp_hanzo_attack.wav
- jp_hanzo_skill.wav
- jp_honda_attack.wav
- jp_honda_skill.wav
- jp_musashi_attack.wav
- jp_musashi_skill.wav
- jp_nobunaga_attack.wav
- jp_nobunaga_skill.wav
- jp_seimei_attack.wav
- jp_seimei_skill.wav
- jp_shingen_attack.wav
- jp_shingen_skill.wav
- jp_susanoo_attack.wav
- jp_susanoo_skill.wav
- level_up.wav
- lose.wav
- round_start.wav
- shop_buy.wav
- shop_roll.wav
- star_up.wav
- ui_click.wav
- vn_an_duong_vuong_attack.wav
- vn_an_duong_vuong_skill.wav
- vn_chu_dong_tu_attack.wav
- vn_chu_dong_tu_skill.wav
- vn_hai_ba_trung_attack.wav
- vn_hai_ba_trung_skill.wav
- vn_son_tinh_attack.wav
- vn_son_tinh_skill.wav
- vn_thanh_giong_attack.wav
- vn_thanh_giong_skill.wav
- vn_tran_hung_dao_attack.wav
- vn_tran_hung_dao_skill.wav
- vn_yet_kieu_attack.wav
- vn_yet_kieu_skill.wav
- win.wav

## NOT in assets/

- media-generation-*.json (generation metadata, stays in staging only)
- canvas/ui_*.png (UI mockups — design reference only, not runtime assets)
vn_tran_hung_dao_portrait.png
vn_hai_ba_trung_portrait.png
cn_kinh_kha_portrait.png
jp_hanzo_portrait.png
jp_nobunaga_portrait.png
