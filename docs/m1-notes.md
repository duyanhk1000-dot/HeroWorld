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

## M3 — 28 tướng FR/US/AZ/UK + 10 Karma Bonds (2026-11-21)

Scope: thêm đủ 49 tướng (cost 12/12/12/8/5, pool 22/20/17/12/9),
10 bonds SRS §7, synergy 4 tộc mới theo ngưỡng 2/4/6. Không đổi luật
M1, không đổi protocol (karma_trigger đã có sẵn trong protocol.ts).

### 28 tướng mới — data/units.json

unit_id BẮT BUỘC theo Appendix A (khớp 56 file WAV đã tạo):
FR fr_joan, fr_martel, fr_lupin, fr_dartagnan, fr_nostradamus,
fr_napoleon, fr_gevaudan; US us_bunyan, us_washington, us_billy,
us_oakley, us_tesla, us_lincoln, us_mothman; AZ az_cuauhtemoc,
az_jaguar, az_eagle, az_xochiquetzal, az_quetzalcoatl, az_montezuma,
az_huitzilopochtli; UK uk_beowulf, uk_arthur, uk_spring_heeled_jack,
uk_robin, uk_morgana, uk_merlin, uk_lancelot.
Tên hiển thị / class / cost / range / tên skill đúng Appendix A.
Stats 1 sao chọn trong khung theo cost của SRS. Skill ID snake_case
ASCII từ tên skill. Skill type theo mẫu M1: GUARDIAN → shield, còn
lại damage/aoe; MAGE/STRATEGIST/DIVINE magic, WARRIOR/ARCHER/ASSASSIN
physical. base_damage [1★,2★,3★] theo cost (1g ~150-170, 2g ~160-200,
3g ~180-220, 4g ~220-260, 5g ~300-330).
Gender: 6 nữ tổng cộng (Trưng Trắc, Nữ Oa, Joan of Arc, Annie
Oakley, Xochiquetzal, Morgana), 43 nam. Gévaudan và Mothman là quái
vật — field gender tạm để "male" làm placeholder cho art, sửa sau
nếu art team quyết định khác.

### Karma Bonds — data/karma_bonds.json

10 bonds, schema theo SRS Appendix B.2 (bond_id, bond_type, name,
members, thresholds [{count, trigger, scope, effect}]):
1 bond_cach_mang HYBRID [Trần Hưng Đạo, Washington, Napoleon] 2/3
  ON_BATTLE_START (2: +15% ATK members; 3: +10% ATK all allies +
  members miễn nhiễm CC đầu tiên)
2 bond_sam_set SYNERGY [Tesla, Quetzalcoatl, Chử Đồng Tử] 2/3
  (2: ON_BASIC_ATTACK chain lightning 2 mục tiêu 45% dmg, -15% MR
  4s; 3: ON_BATTLE_START all allies +20% AP)
3 bond_bien_va_song SYNERGY [Yết Kiêu, An Dương Vương, Robin Hood]
  2/3 ON_CAST_SKILL (2: allied Archers +20% ASPD 4s; 3: + stun 0.8s
  lên mục tiêu skill)
4 bond_hoang_de RIVALRY [Napoleon, Arthur] 2 ON_BATTLE_START SELF
  (cùng đội: cả hai +12% HP, -10% ASPD; đối đầu: bên thắng gây thêm
  +2 sát thương nhà — tính ở tầng match, không phải sim)
5 bond_kiem_thanh RIVALRY [Musashi, Lancelot] 2 ON_KILL SELF
  (member giết member kia: +25% ATK đến hết vòng, tối đa 2 stack)
6 bond_mat_troi SYNERGY [Hậu Nghệ, Huitzilopochtli, Xochiquetzal]
  2/3 ON_BATTLE_START (2: all allies +10% crit; 3: crit đốt 2% max
  HP/s trong 3s)
7 bond_bong_dem SYNERGY [Yết Kiêu, Hanzo, Spring-heeled Jack] 2/3
  ON_BASIC_ATTACK (2: member Assassins +15% dodge; 3: sau khi né,
  đòn sau chắc chắn crit)
8 bond_than_va_quai HYBRID [Susanoo, Gévaudan, Mothman] 2/3
  (2: ON_HP_BELOW_50 dưới 50% HP members +20% ASPD, -15% damage
  nhận; 3: ON_ALLY_DEATH member chết hồi 20% max HP cho các member
  còn lại)
9 bond_tri_thuc SYNERGY [Khổng Minh, Nostradamus, Merlin] 2/3
  (2: ON_CAST_SKILL mỗi lần member tung chiêu hồi 5 mana cho all
  allies; 3: ON_BATTLE_START chiêu đầu của mỗi member tung ở giây 5)
10 bond_co_sac SYNERGY [Joan of Arc, Lincoln, Trưng Trắc] 2/3
  ON_ALLY_DEATH ALL_ALLIES (2: bất kỳ ally nào chết tạo khiên 10%
  max HP cho all allies; 3: khiên 20% + 10% ATK 5s)

Luật gộp ngưỡng (diễn giải SRS §7.3, chốt cho M3): với mỗi nhóm
(trigger, scope), hiệu ứng của các ngưỡng đã đạt gộp theo từng key,
ngưỡng cao thắng theo key — bond_co_sac khiên 10% → 20% ở tier 3
(không phải 30%), bond_sam_set giữ chain lightning và thêm +20% AP
ở tier 3. Lý do: đọc "ngưỡng cao thay thế ngưỡng thấp" sẽ làm mất
cơ chế tier-2 của nhiều bond 3 thành viên, trái với chữ "thêm"/"cộng
thêm" trong mô tả bond 1 và 3 và ý đồ thiết kế của các bond khác.

### Cài đặt Godot

- scripts/m1_bonds.gd (mới): active_bonds() chỉ đếm member phân biệt
  TRÊN BÀN, apply_static_mods() gộp hiệu ứng tĩnh vào unit mods theo
  scope, group_for_trigger(), bond_with_effect_key(),
  describe_active(), one_away(). STATIC_KEYS phải gồm cả 3 key
  team_* (team_atk_pct, team_ap_pct, team_crit) — bản đầu thiếu
  khiến bond_mat_troi tier 2, bond_sam_set tier 3, bond_cach_mang
  tier 3 bị lặng lẽ bỏ qua; đã sửa và thêm regression check.
- scripts/m1_sim.gd: combatant mang side bonds ("bonds") + state
  runtime (stun_until_tick, cc_immune/used, crit_next, kill_stacks,
  aspd/atk buff có thời hạn, burn_per_sec/until/acc/source_iid).
  Dodge của bond_bong_dem bị giới hạn bởi dodge_cap 0.35, lần rút
  RNG vẫn tiêu thụ dù dodge = 0. Chain lightning không cho mana,
  không tính là đòn cơ bản (không cộng attack_count, không kích
  extra target Archer 6). Burn tích lũy phần lẻ, flush khi >= 1.
  Death trigger qua _on_unit_death gọi từ _apply_damage, overtime
  pulse, burn death, Divine explosion death. Stun bỏ qua cả lượt.
  First-cast ở tick 100 cho bond_tri_thuc tier 3. Mọi kích hoạt bond
  phát event karma_trigger {t, k, a, b, bond}. Sim vẫn deterministic,
  không thêm RNG không seed, thứ tự rút dodge giữ nguyên.
- scripts/m1_match.gd: _build_side tính active bonds, gộp static
  mods, gắn "bonds" vào từng def; ghost side không có bond (như
  synergy). _rivalry_pair (Napoleon vs Arthur đối đầu) + +2 sát
  thương nhà trong _resolve_round. _bot_prep truyền bonds_data.
- scripts/m1_bot.gd: take_prep_turn(..., bonds_data) và
  hero_value(..., bonds_data): +6 cho tướng giúp hoàn thành bond bot
  đã bắt đầu (đang sở hữu >= 1 member khác, count >= 2).
- scripts/m1_gui.gd: panel synergy liệt kê thêm Karma Bonds đang
  kích hoạt (describe_active) và bond thiếu 1 thành viên kèm tên
  tướng còn thiếu. scripts/m1_data.gd load thêm karma_bonds.json.
  scripts/m1_synergy.gd: _empty_mods() thêm tất cả key tĩnh của bond.
  Synergy tộc không đổi code (hiệu ứng theo tier, không theo tộc).

### Cài đặt server (song song, cùng công thức)

- server/src/bonds.ts (mới): port của m1_bonds.gd (activeBonds,
  applyStaticMods, groupForTrigger, bondWithEffectKey, describeActive,
  oneAway, rivalryPair thuần). STATIC_KEYS gồm team_* keys.
- server/src/synergy.ts: UnitMods + emptyMods() thêm key bond tĩnh.
- server/src/data.ts: GameData.bonds; loadGameData() đọc
  data/karma_bonds.json (thiếu file → cảnh báo, bonds tắt, game vẫn
  chạy); log báo số unit/PvE/bond.
- server/src/sim.ts: SimEventKind thêm "karma_trigger", SimEvent
  thêm bond?: string; CombatCtx {sideA, sideB, bondsA, bondsB};
  SimUnitDef.bonds; Combatant thêm bonds + state runtime như Godot;
  effectiveAtk/effectiveAspd tính buff có thời hạn + kill stacks +
  low-HP ASPD; onUnitDeath (co_sac / than_va_quai / kiem_thanh);
  applyDamage nhận ctx + giveMana (chain lightning không cho mana),
  low-HP giảm 15% damage; basicAttack nhận foes + ctx (dodge,
  crit_next, chain, burn); castSkill nhận ctx (tri_thuc +5 mana,
  bien_va_song archer ASPD + stun, tôn trọng first-CC immunity);
  PairCombat.ctx + firstCastTick (tri_thuc tier 3), burn tick,
  stun skip, death hook ở overtime/divine; buildSideCombatants
  nhận bondsData (mặc định null), tính active bonds + gộp static
  mods, gắn bonds vào def; ghost combatants vẫn không có bond.
- server/src/rooms/BattleRoom.ts: buildSideCombatants nhận
  this.gameData.bonds (PvP, ghost player, PvE); takePrepTurn nhận
  bonds; translateEvent thêm case "karma_trigger" (bond id đi trong
  skill_id — KHÔNG đổi protocol, protocol_version vẫn 1);
  rivalryPair() dùng rivalryPairBoards() thuần, +2 damage ở resolve.
- server/src/bot.ts: heroValue/takePrepTurn nhận bondsData (mặc
  định null), +6 như Godot.
- server/src/__tests__/smoke.ts: 16 test bond mới (49 unit, 10
  bond, cost 12/12/12/8/5, 6 nữ, active 2/3, không bond với 1
  member, mat_troi +10% crit toàn đội, rivalry 4 trường hợp, 4
  combat cố định → >= 3 bond kích hoạt với >= 3 trigger khác nhau,
  deterministic bonded sim, karma_trigger xuất hiện).

### Kiểm chứng M3 (2026-11-21)

Godot headless:
```
M1_MANUAL_OK
M1_SANITY OK
M1_REPLAY seed=777 winner=1 ticks=648 events=123 same=true
M3_SHOP distinct=49/49
M3_BONDS fired={bond_sam_set: 25, bond_bien_va_song: 4, bond_co_sac: 3,
  bond_tri_thuc: 7} triggers=[ON_BASIC_ATTACK, ON_BATTLE_START,
  ON_CAST_SKILL, ON_ALLY_DEATH]
M3_BOND_STATIC mat_troi team_crit=true
M3_RIVALRY napoleon-vs-arthur=true one-sided=true
M3_CHECK OK
M1_MATCH_OK top1=Bot Hà rounds=39 (đổi từ 43 vòng / Bot An trước
  M3 — do pool tăng 21 → 49 tướng, không phải lỗi)
M1_HEADLESS_OK
```
Server: npx tsc --noEmit sạch; npm test 52/52 pass (36 cũ + 16 bond
mới); npm run test:e2e 9/9 pass. Lưu ý: số karma_trigger của 4
combat cố định trùng khớp tuyệt đối giữa Godot và server
(sam_set 25, bien_va_song 4, co_sac 3, tri_thuc 7) — hai sim khớp
nhau trên cùng kịch bản.
docs/online-architecture.md KHÔNG sửa: protocol không đổi
(karma_trigger đã có trong CombatEventType, bond id đi trong
skill_id, protocol_version vẫn 1).

### Giới hạn còn lại sau M3

- 28 tướng mới chưa có portrait/skill icon trong assets/
  (M1_VIEW_ASSETS icons=21/49, portraits=21/49); 56 WAV của họ đã
  có trong ohmygame_assets/ staging, chưa sync vào assets/
  (sfx=21/49) — cần chạy sync script.
- Ghost lineup đánh không có bond (như synergy M1).
- Combat replay chưa có VFX riêng cho karma_trigger (view bỏ qua
  event kind lạ).
- Số liệu bond là giá trị khởi đầu theo SRS, chờ M4 cân bằng bằng
  telemetry.
- Mở từ M2: ranked/login form, export web, live combat replay.
