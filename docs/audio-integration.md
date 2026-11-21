# Audio Integration — Đấu Trường Nhân Quả M1

> Doc only. No `.gd` file was edited by the audio work. The logic agent should
> implement the wiring below when it touches the audio code.

## Source files

- Generator: `~/workspace/tools/game-audio/generate_sfx.py`
  (seed 20261121, deterministic — re-running reproduces byte-identical WAVs).
  Regenerate with: `python3 ~/workspace/tools/game-audio/generate_sfx.py`
- Staging: `~/workspace/co-nhan-pham-godot/ohmygame_assets/*.wav`
  (52 files, 44.1 kHz mono 16-bit, peak -3 dB, 111.6s total).
  Full list + design intent per file: `ohmygame_assets/AUDIO_MANIFEST.md`.
- Validated Godot copies go to `res://assets/` only via the sync script
  (`~/workspace/tools/ohmygame-fennara-sync/sync.sh`). The sync script copies
  `.wav` files from staging; do not copy by hand and do not edit `assets/`
  directly from the audio side.

## File naming / mapping

| Trigger | File pattern | Example |
|---|---|---|
| Hero basic attack | `res://assets/<unit_id>_attack.wav` | `vn_son_tinh_attack.wav` |
| Hero skill cast | `res://assets/<unit_id>_skill.wav` | `jp_susanoo_skill.wav` |
| UI tap | `res://assets/ui_click.wav` | — |
| Buy from shop | `res://assets/shop_buy.wav` | — |
| Reroll shop | `res://assets/shop_roll.wav` | — |
| Level up | `res://assets/level_up.wav` | — |
| Star up (2★ / 3★) | `res://assets/star_up.wav` | — |
| Victory | `res://assets/win.wav` | — |
| Defeat | `res://assets/lose.wav` | — |
| Round start | `res://assets/round_start.wav` | — |
| Menu music | `res://assets/bgm_menu.wav` | loop, 30s |
| Battle music | `res://assets/bgm_battle.wav` | loop, 30s |

M1 heroes (21, VN/CN/JP only — see SRS v2.1 Appendix A):

- VN: `vn_thanh_giong`, `vn_hai_ba_trung`, `vn_yet_kieu`, `vn_an_duong_vuong`,
  `vn_chu_dong_tu`, `vn_tran_hung_dao`, `vn_son_tinh`
- CN: `cn_quan_vu`, `cn_lu_bo`, `cn_kinh_kha`, `cn_hau_nghe`, `cn_nu_oa`,
  `cn_khong_minh`, `cn_ton_ngo_khong`
- JP: `jp_honda`, `jp_musashi`, `jp_hanzo`, `jp_nobunaga`, `jp_seimei`,
  `jp_shingen`, `jp_susanoo`

In code, build the path from `unit_id` — do not hard-code 21 filenames:
`load("res://assets/%s_attack.wav" % unit_id)`,
`load("res://assets/%s_skill.wav" % unit_id)`.
If a file is missing at runtime, fall back to silence and log the `unit_id`
instead of crashing (Fennara addon files may be absent after a fresh clone).

## Suggested Godot wiring (for the logic agent to implement)

```gdscript
# Audio buses (Project Settings > Audio > Buses): Master, Music, SFX, UI.
# Suggested volumes: Music -12 dB, SFX -6 dB, UI -6 dB. Mute toggle flips
# AudioServer.set_bus_mute for all three and persists in user settings.
# Preload once at startup (or lazily per hero on first use):
#   var attack_sfx := {}
#   for id in HERO_IDS: attack_sfx[id] = load("res://assets/%s_attack.wav" % id)
# Play attacks/skills with a small pool of AudioStreamPlayer nodes
# (e.g. 8 players, round-robin) so overlapping attacks don't cut each other.
# Music: one AudioStreamPlayer on the Music bus, stream = bgm_menu/bgm_battle,
# play on scene change (menu -> battle at COMBAT_PHASE, back at GAME_OVER).
# Both BGM files are exactly 30s with 0.5s fades at both ends, so looping
# is click-free; set the player to loop (AudioStreamWAV loop mode) or
# restart on `finished`.
```

## Design notes

- Attack sounds are distinct per class (GUARDIAN low thud+metal, WARRIOR
  slash sweep, ASSASSIN whisper-cut, ARCHER twang+whoosh, MAGE chime/spark,
  STRATEGIST drum+horn, DIVINE shimmer) with a per-nation pitch shift
  (VN ×1.00, CN ×1.12, JP ×1.26). Skill sounds are layered per skill
  (see `AUDIO_MANIFEST.md` for the intent of each one).
- All sounds are synthesized (sine/noise envelopes, pitch sweeps, filtered
  noise) — no recorded samples. They are clear placeholders with a distinct
  identity per hero; replace any file with a studio version later by
  dropping a same-named WAV into `ohmygame_assets/` and re-running sync.
- Keep SFX short (attack 0.55s, skill 1.5s) so they never overlap the
  20 Hz deterministic combat tick audibly; the sim must never wait for audio.

## Still missing (not M1)

- FR/US/AZ/UK heroes: 28 attack + 28 skill files (M3).
- Karma Bond trigger sounds and item equip/combine sounds (M2/M3 per SRS).
- Voice lines / announcer. None are in M1 scope.
