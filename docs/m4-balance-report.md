# M4 — Báo cáo cân bằng theo số liệu mô phỏng (2026-11-21)

Game: Đấu Trường Nhân Quả, 49 tướng, 10 Karma Bonds, bot Medium.
Số liệu gốc: `data/balance_config.json` v2.1.0 (số khởi đầu theo SRS).

## 1. Phương pháp

Ba nguồn số liệu độc lập, vì không nguồn nào đứng một mình cũng đủ:

| Nguồn | Cách chạy | N | Đo cái gì | Điểm mù |
|---|---|---|---|---|
| **A. Batch bot-vs-bot** | `scripts/m4_batch.gd`, Godot headless, 8 ghế đều do bot Medium đánh, seed khác nhau | 120 trận | Tỉ lệ top 1 / top 4 theo tướng, tộc, class, bond trong đội hình cuối trận | Bot không bán tướng, không chuyển đội hình → xem §2.1 |
| **B. Duel 1v1** | `scripts/m4_duel.gd`, round-robin 49 tướng, 1 sao, 3 seed/cặp, 2 khoảng cách xuất phát (kề nhau và cách 5 ô) | 3528 trận/cự ly | Sức mạnh solo từng tướng, so trong cùng bậc giá | Không có tuyến trước cho Xạ Thủ, không có hậu tuyến cho Sát Thủ, AoE của Pháp Sư chỉ trúng 1 mục tiêu, không có synergy/bond |
| **C. Bond/synergy ON-vs-OFF** | cùng script, đội hình giống hệt nhau 2 bên, chỉ khác bật/tắt bond hoặc synergy | 3 seed/bond, 3 seed/synergy | Giá trị chiến đấu của từng bond / từng mốc synergy 2 | Mirror nên chỉ đo chiều (mạnh hơn hay yếu hơn), không đo độ lớn |

### Kiểm định outlier

- Batch: kỳ vọng trung lập có trọng số theo số ô tướng (slot-weighted),
  vì đội hình top 1 to hơn (7–9 tướng) nên một tướng có mặt trong đội
  hình top 1 với xác suất cao hơn 1/8 một cách cơ học. p1 = (tổng số ô
  tướng trong các đội hình hạng 1) / (tổng số ô tướng mọi đội hình),
  p4 tương tự cho top 4. z = (quan sát − kỳ vọng) / √(n·p·(1−p)).
  Gắn cờ outlier khi |z| ≥ 2 và n ≥ 20 (n < 20 = mẫu nhỏ, chỉ ghi chú).
- Duel: so tỉ lệ thắng trong cùng bậc giá với kỳ vọng 0.5,
  z = (thắng − n/2) / √(n/4), n = số duel trong bậc giá (33 cho 1g/2g/3g,
  21 cho 4g, 12 cho 5g). Gắn cờ khi |z| ≥ 2.
- Khoảng tin cậy: Wilson 95% cho tỉ lệ thắng khi có mặt.

### Quy tắc chỉnh số (đã chốt cho đợt này)

- Chỉ chỉnh SỐ: stat trong `data/units.json`, hệ số trong
  `data/balance_config.json`, độ lớn hiệu ứng trong
  `data/karma_bonds.json`. KHÔNG đổi luật, công thức, trigger, ngưỡng.
- Mỗi thay đổi ≤ ~10%, có lý do + số liệu trước kèm theo.
- Thay đổi nào cũng phải kiểm chứng lại bằng duel + batch sau chỉnh.

## 2. Phát hiện cấu trúc (quan trọng hơn mọi con số tướng lẻ)

### 2.1 Bot Medium không bao giờ chuyển đội hình lên tướng đắt tiền

Trong 5 trận hiệu chuẩn đầu: **302/305 ô tướng trên bàn cuối trận là
tướng 1 vàng, 3 ô là 2 vàng, 0 ô là 3/4/5 vàng; chỉ 15/49 tướng từng
xuất hiện; 0/40 đội hình cuối trận có bond nào kích hoạt.**

Nguyên nhân đã xác minh trong code (`scripts/m1_bot.gd`): bot không có
logic bán tướng. Ghế (bench) đầy 9 ô toàn tướng 1 vàng mua từ những vòng
đầu → `buy_shop_slot` trả false khi ghế đầy → bot không thể mua tướng
3–5 vàng dù shop đã ra và dù có đủ vàng. Đội hình đóng băng ở tướng 1
vàng từ đầu trận tới cuối trận.

Hệ quả cho đợt M4 này:

- Batch A chỉ đo được cân bằng của **tướng 1 vàng (và một phần 2 vàng)**.
  Mọi kết luận về tướng 3–5 vàng và về bond đều phải lấy từ duel/probe
  B và C, không lấy từ batch.
- Đây cũng là vấn đề gameplay thật: người chơi biết chuyển đội hình lên
  tướng 3–5 vàng sẽ thắng bot gần như chắc chắn. **Đề xuất follow-up
  (ngoài phạm vi M4 vì task cấm sửa logic bot): dạy bot bán tướng thừa
  trên ghế và ưu tiên mua tướng đắt khi đủ vàng/cấp.**
- Số liệu batch dưới đây phải đọc với lưu ý này trong đầu.

### 2.2 Các bậc giá xếp đúng thứ tự (duel)

Tỉ lệ thắng duel trung bình theo bậc giá: 1g 0.131 → 2g 0.364 →
3g 0.608 → 4g 0.812 → 5g 0.951. Giá cao hơn thì mạnh hơn, đúng thiết kế.
Vấn đề nằm ở **độ chênh trong cùng bậc giá**, xem §3.

### 2.3 Synergy mốc 2 đo được là có lợi (đúng chiều)

Nation tier-2 (+8% HP): ON thắng 14/15 trận mirror (chỉ US 2/3).
Class tier-2: ON thắng 18/18. Mốc 2 không bị ngược chiều ở đâu cả nên
không chỉnh hệ số synergy đợt này. (VN và UK không đo được nation vì
không đủ 3 tướng không-thuộc-bond; STRATEGIST không đo được class vì
chỉ có 2 tướng không-thuộc-bond — ghi nhận là khoảng trống đo.)

## 3. Kết quả duel 1v1 (trước chỉnh)

### 3.1 Outlier trong cùng bậc giá (|z| ≥ 2)

**Quá mạnh:**

| Tướng | Bậc | Tỉ lệ thắng cùng bậc | z | Ghi chú |
|---|---|---|---|---|
| Paul Bunyan | 1g GUARDIAN | 0.97 (32/33) | +5.4 | HP 700, giáp 35 — trần khoảng 1g của SRS |
| Cuauhtémoc | 1g GUARDIAN | 0.94 (31/33) | +5.1 | HP 680, giáp 35 — cùng mẫu với Bunyan |
| Lancelot | 2g WARRIOR | 0.97 (32/33) | +5.4 | HP 820, ATK 72, tốc đánh 0.85 — cao so với bậc 2g |
| Takeda Shingen | 2g STRATEGIST | 0.91 (30/33) | +4.7 | AP 65, AoE phép 160, tầm 3 |
| Beowulf | 3g DIVINE | 0.94 (31/33) | +5.1 | HP 950 — trần khoảng 3g của SRS |
| Quái vật Gévaudan | 4g DIVINE | 1.00 (21/21) | +4.6 | HP 1050, ATK 88 |
| Susanoo | 5g DIVINE | 1.00 (12/12) | +3.5 | HP 1200 — trần khoảng 5g; mẫu nhỏ (12 duel) |
| Chiến Binh Báo Đốm | 1g WARRIOR | 0.79 (26/33) | +3.3 | |
| Quan Vũ | 3g GUARDIAN | 0.76 (25/33) | +3.0 | |
| Lữ Bố | 4g WARRIOR | 0.81 (17/21) | +2.8 | |
| Arsène Lupin | 2g ASSASSIN | 0.73 (24/33) | +2.6 | |
| Mothman | 4g DIVINE | 0.76 (16/21) | +2.4 | |
| Miyamoto Musashi | 3g WARRIOR | 0.70 (23/33) | +2.3 | |

**Quá yếu:**

| Tướng | Bậc | Tỉ lệ thắng cùng bậc | z | Ghi chú |
|---|---|---|---|---|
| Hậu Nghệ | 1g ARCHER | 0.03 (1/33) | −5.4 | Yếu nhất toàn roster |
| An Dương Vương | 2g ARCHER | 0.06 (2/33) | −5.1 | Sát thương skill [140,240,450] thấp hơn hẳn các Xạ Thủ 2g khác [170,300,560] |
| Oda Nobunaga | 3g ARCHER | 0.03 (1/33) | −5.4 | HP 760 — đáy khoảng 3g |
| Xochiquetzal | 2g ARCHER | 0.12 (4/33) | −4.4 | |
| Abe no Seimei | 3g MAGE | 0.15 (5/33) | −4.0 | HP 750 — đáy khoảng 3g |
| D'Artagnan | 1g ARCHER | 0.18 (6/33) | −3.7 | |
| Annie Oakley | 1g ARCHER | 0.18 (6/33) | −3.7 | |
| Spring-heeled Jack | 3g ASSASSIN | 0.21 (7/33) | −3.3 | |
| Quetzalcoatl | 4g MAGE | 0.14 (3/21) | −3.3 | Cùng mẫu với Tesla |
| Nostradamus | 2g MAGE | 0.24 (8/33) | −3.0 | |
| Robin Hood | 2g ARCHER | 0.27 (9/33) | −2.6 | |
| Morgana | 1g MAGE | 0.27 (9/33) | −2.6 | |
| Nikola Tesla | 4g MAGE | 0.24 (5/21) | −2.4 | Cùng mẫu với Quetzalcoatl |
| Trần Hưng Đạo | 4g STRATEGIST | 0.24 (5/21) | −2.4 | |
| Yết Kiêu | 1g ASSASSIN | 0.30 (10/33) | −2.3 | Nhảy hậu tuyến vô dụng trong 1v1 — xem §3.2 |
| Merlin | 5g STRATEGIST | 0.00 (0/12) | −3.5 | Tướng hỗ trợ, không phải đấu sĩ — KHÔNG chỉnh theo duel |

### 3.2 Xạ Thủ yếu trong duel là một phần do cách đo

Xạ Thủ trung bình chỉ thắng 0.177 duel (thấp nhất mọi class), và đổi
khoảng cách xuất phát từ kề nhau sang cách 5 ô gần như không đổi kết quả
(trung bình class 0.177 → 0.192; Hậu Nghệ 0.007 → 0.014; Nobunaga
0.451 → 0.451). Nghĩa là **không phải do tầm đánh bị vô hiệu hóa** —
Xạ Thủ thua vì chỉ số nền thấp (HP 550–660, giáp 20–25) và vì trong 1v1
không có tuyến trước che chắn, không có synergy Xạ Thủ (+tốc đánh).
Trong trận 8v8 thật, Xạ Thủ đứng sau tanker nên giá trị cao hơn duel
thể hiện. Vì vậy: buff Xạ Thủ theo duel phải **nhẹ** (đủ để không thua
trắng trong cùng bậc giá), không buff mạnh theo tỉ lệ thắng duel.
Batch §4 là thước đo chính cho Xạ Thủ.

Tương tự, Sát Thủ (nhảy hậu tuyến vô dụng khi chỉ có 1 địch) và Pháp Sư
(AoE chỉ trúng 1 mục tiêu, chết trước khi đủ mana tung chiêu) đều bị duel
đánh giá thấp hơn giá trị thật trong 8v8. Merlin (0/12) là tướng hỗ trợ
— không chỉnh.

### 3.3 Bond ON-vs-OFF (mirror, 3 seed mỗi bond)

8/10 bond thắng 3/3 khi bật: cach_mang, sam_set, bien_va_song,
mat_troi, than_va_quai, tri_thuc, co_sac, bong_dem 2/3.
**2 bond yếu:**

- **bond_hoang_de (RIVALRY, Napoleon + Arthur): ON thắng 1/3.**
  Hiệu ứng cùng đội +12% HP nhưng −10% tốc đánh — trong đội hình
  giống hệt nhau, phía bật bond thua 2/3, tức hiệu ứng ròng là âm.
  Người chơi xếp Napoleon + Arthur cùng đội đang bị phạt.
- **bond_kiem_thanh (RIVALRY, Musashi + Lancelot): ON thắng 1/3.**
  Trigger ON_KILL chỉ kích khi một thành viên giết thành viên kia
  (địch cũng phải có một trong hai) nên hiếm khi kích hoạt, và +25%
  ATK đến muộn (sau khi đã có mạng). Bond tình huống theo thiết kế —
  ghi nhận theo dõi, chưa chỉnh vội.

## 4. Kết quả batch 120 trận (trước chỉnh)

120 trận, 960 đội hình cuối trận, trung bình 44.0 vòng/trận (38–51).
Chia ô tướng: top 1 chiếm 13.6% số ô, top 4 chiếm 53.3% — đây là
p1/p4 dùng cho kiểm định (không phải 1/8 và 1/2).

### 4.1 Tướng 1 vàng (đo được tin cậy nhất — có mặt từ vòng 1)

| Tướng | n (đội hình) | Top 1 (kỳ vọng) | z1 | Top 4 (kỳ vọng) | z4 | Kết luận |
|---|---|---|---|---|---|---|
| Cuauhtémoc | 544 | 97 (74.2) | +2.85 | 300 (290.0) | +0.86 | Mạnh — khớp duel |
| Paul Bunyan | 497 | 88 (67.8) | +2.64 | 286 (264.9) | +1.90 | Mạnh — khớp duel |
| Chiến Binh Báo Đốm | 471 | 48 (64.2) | −2.18 | 233 (251.1) | −1.67 | Yếu trong batch, MẠNH trong duel (0.79) — mâu thuẫn, không chỉnh |
| Kinh Kha | 470 | 60 (64.1) | −0.55 | 227 (250.5) | −2.18 | Top 4 thấp, top 1 bình thường |
| Yết Kiêu | 518 | 64 (70.6) | −0.85 | 250 (276.1) | −2.30 | Top 4 thấp, khớp duel yếu vừa |
| Các tướng 1g còn lại | 464–517 | — | −1.4…+0.2 | — | −1.8…+0.1 | Không có outlier top 1 |

### 4.2 Tướng 2 vàng trở lên — đọc với lưu ý nhiễu sinh tồn

Chỉ 192/960 đội hình có tướng 2 vàng, 12 đội hình có tướng 3 vàng,
0 đội hình có tướng 4–5 vàng. Tướng 2 vàng chỉ xuất hiện ở đội hình
sống lâu (ghế trống muộn, xem §2.1) nên tỉ lệ top 1/top 4 của chúng bị
thổi phồng một cách cơ học: 2g top 1 z=+6.48, top 4 z=+10.65; JP
(n=45, chỉ có tướng ≥2 vàng) top 1 z=+3.42, top 4 44/45. **Không được
đọc các số này như bằng chứng tướng 2 vàng quá mạnh.** Chỉ so sánh
TƯƠNG ĐỐI trong nhóm 2 vàng (tỉ lệ thắng khi có mặt): Billy 0.500,
Martel 0.462, Honda 0.444, Thánh Gióng 0.417, Robin 0.367, Lupin 0.346,
Lancelot 0.333, Nostradamus 0.308, Xochiquetzal 0.286, Shingen 0.250,
Hanzo 0.217, An Dương Vương 0.125 (thấp nhất nhóm — khớp duel yếu).

### 4.3 Bond trong batch

Chỉ 3/10 bond từng kích hoạt trên đội hình cuối trận: bien_va_song
(32 đội hình, top 4 30/32, z4=+4.59), mat_troi (13), bong_dem (14).
7 bond còn lại 0 lần — thành viên của chúng là tướng 3–5 vàng mà bot
không bao giờ mua (xem §2.1). Giá trị bond trong trận thật không đo
được bằng batch; dùng probe ON-vs-OFF §3.3 thay thế.

### 4.4 Ghế ngồi

Top 1 theo ghế: Bạn 22, Bot Hà 18, Bot Bình 16, Bot Linh 15, Bot An 13,
Bot Chi 13, Bot Dũng 12, Bot Khang 11 (kỳ vọng 15 mỗi ghế). Ghế "Bạn"
cao nhất (z≈+1.9) nhưng trong nhiễu với 8 ghế so sánh — không kết luận
lệch ghế, ghi nhận theo dõi.

## 5. Thay đổi đã áp dụng

Chỉ số, không đổi luật. Quy tắc hành động: duel cùng bậc |z| ≥ 2.9
HOẶC hai nguồn cùng chiều; bỏ qua mâu thuẫn trực tiếp giữa hai nguồn.

### 5.1 Nerf (10 tướng, `data/units.json`)

| Tướng | Thay đổi | Trước → Sau | Căn cứ |
|---|---|---|---|
| Paul Bunyan | HP | 700 → 650 (−7%) | Duel 1g 0.97 (z+5.4); batch top1 z+2.64 |
| Cuauhtémoc | HP | 680 → 630 (−7%) | Duel 1g 0.94 (z+5.1); batch top1 z+2.85 |
| Lancelot | HP rồi ATK | 820 → 760; 72 → 68 | Duel 2g 0.97 (z+5.4); batch top4 z+3.97. HP −60 không đổi duel nào (31/33 → 31/33) nên cắt thêm ATK |
| Arsène Lupin | ATK | 70 → 66 (−6%) | Duel 2g 0.73 (z+2.6); batch top1 z+3.12 |
| Beowulf | HP rồi ATK | 950 → 880; 80 → 76 | Duel 3g 0.94 (z+5.1). HP −70 không đổi duel nào nên cắt thêm ATK |
| Quái vật Gévaudan | HP | 1050 → 980 (−7%) | Duel 4g 1.00 (z+4.6) |
| Susanoo | HP | 1200 → 1120 (−7%) | Duel 5g 1.00 (z+3.5, n=12 mẫu nhỏ) |
| Takeda Shingen | AP | 65 → 58 (−11%) | Duel 2g 0.91 (z+4.7) |
| Quan Vũ | HP | 950 → 900 (−5%) | Duel 3g 0.76 (z+2.96) |
| Lữ Bố | HP | 1050 → 1000 (−5%) | Duel 4g 0.81 (z+2.84) |

### 5.2 Buff (8 tướng, `data/units.json`)

| Tướng | Thay đổi | Trước → Sau | Căn cứ |
|---|---|---|---|
| Hậu Nghệ | ATK, tốc đánh | 60 → 66 (+10%); 0.75 → 0.8 | Duel 1g 0.03 (z−5.4, yếu nhất roster); tốc đánh ngang Oakley |
| An Dương Vương | Sát thương skill | [140,240,450] → [170,300,560] | Duel 2g 0.06 (z−5.1); thấp hơn hẳn các Xạ Thủ 2g khác — ngang hàng peer |
| Oda Nobunaga | HP, ATK | 760 → 820 (+8%); 80 → 84 (+5%) | Duel 3g 0.03 (z−5.4) |
| Xochiquetzal | HP | 660 → 700 (+6%) | Duel 2g 0.12 (z−4.35) |
| Abe no Seimei | HP | 750 → 810 (+8%) | Duel 3g 0.15 (z−4.0) |
| D'Artagnan | ATK | 60 → 63 (+5%) | Duel 1g 0.18 (z−3.66); batch trung lập |
| Annie Oakley | ATK | 60 → 63 (+5%) | Duel 1g 0.18 (z−3.66); batch trung lập |
| Yết Kiêu | ATK | 58 → 62 (+7%) | Duel 1g 0.30 (z−2.26); batch top4 z−2.30 |

### 5.3 Bond (1 thay đổi, `data/karma_bonds.json`)

| Bond | Thay đổi | Trước → Sau | Căn cứ |
|---|---|---|---|
| bond_hoang_de | aspd_pct | −0.10 → −0.05 | Mirror ON thắng 1/3: hiệu ứng cùng đội (+12% HP, −10% tốc đánh) ròng là âm. Chỉ sửa độ lớn hiệu ứng, không đổi trigger/scope/ngưỡng |

### 5.4 KHÔNG chỉnh (có lý do ghi lại)

- **Chiến Binh Báo Đốm**: duel mạnh (0.79) nhưng batch top1 yếu
  (z−2.18) — mâu thuẫn, không chỉnh; sau chỉnh batch 60 trận tín hiệu
  âm biến mất (z+0.08) nên khả năng cao là nhiễu.
- **Robin Hood**: duel yếu (0.27) nhưng batch top1 mạnh (z+3.68) —
  mâu thuẫn, tin batch (trận thật) hơn duel.
- **Morgana, Tesla, Quetzalcoatl, Trần Hưng Đạo, Spring-heeled Jack,
  Merlin**: yếu trong duel nhưng là Pháp Sư/Sát Thủ/hỗ trợ — duel 1v1
  đánh giá thấp nhóm này một cách có hệ thống (§3.2); batch không đo
  được (1g thì trung lập, 3–5g thì không xuất hiện). Theo dõi, không
  chỉnh theo duel.
- **Billy the Kid, Charles Martel, Honda Tadakatsu, Thánh Gióng**:
  batch mạnh nhưng n=7–16 (mẫu nhỏ, nhiễu sinh tồn §4.2) — theo dõi.
- **Mothman**: không chỉnh đợt này; xem §6.3 (hiệu ứng waterbed).
- **Hệ số synergy**: không chỉnh — mốc 2 đo được là có lợi đúng chiều
  (§2.3).

## 6. Kiểm chứng sau chỉnh

### 6.1 Duel (chạy lại toàn bộ, 3528 trận)

Hướng thay đổi đúng cho 17/18 tướng đã chỉnh số (Beowulf và Lancelot
cần thêm vòng cắt ATK mới nhúc nhích — đã làm trong đợt này):

| Nhóm | Trước → Sau (tỉ lệ thắng cùng bậc) |
|---|---|
| Nerf (10) | Bunyan 0.97→0.88; Cuauhtémoc 0.94→0.79; Lancelot 0.97→0.88 (sau 2 vòng); Lupin 0.73→0.64; Beowulf 0.94→0.70 (sau 2 vòng); Gévaudan 1.00→0.86; Susanoo 1.00→0.83; Shingen 0.91→0.79; Quan Vũ 0.76→0.58; Lữ Bố 0.81→0.71 — **10/10 đi xuống** |
| Buff (8) | Hậu Nghệ 0.03→0.30; Seimei 0.15→0.39; Yết Kiêu 0.30→0.49; Nobunaga 0.03→0.15; Xochiquetzal 0.12→0.18; An Dương Vương 0.06→0.09; Oakley 0.18→0.18; D'Artagnan 0.18→0.12 — **6/8 đi lên** (D'Artagnan −2 duel = nhiễu) |

### 6.2 Batch 60 trận sau chỉnh (seed mới 3000000)

| Tướng 1g | Top 1 z trước → sau |
|---|---|
| Paul Bunyan | +2.64 → +0.43 — hết outlier |
| Cuauhtémoc | +2.85 → −0.77 — hết outlier |
| Chiến Binh Báo Đốm | −2.18 → +0.08 — hết outlier (khẳng định §5.4) |
| Kinh Kha (top 4) | −2.18 → +0.29 — hết outlier |
| Hậu Nghệ | +0.23 → −0.29 — trung lập |
| Yết Kiêu | top1 −0.85 → −2.21 — **xấu đi trong batch dù duel cải thiện** (xem §7) |
| An Dương Vương (2g) | top1 −0.19 → +2.76; top4 +3.52 → +3.72 (n=16, mẫu nhỏ) |
| Lancelot (2g) | top1 +2.44 → +1.30; top4 +3.97 → +3.08 (n=11, mẫu nhỏ) |
| Lupin (2g) | top1 +3.12 → +2.58 (n=6, mẫu nhỏ) |

### 6.3 Bond ON-vs-OFF với 12 seed (thay vì 3)

bond_hoang_de: ON thắng **6/12 (50% — đúng trung lập)** sau khi giảm
phạt tốc đánh, so với 1/3 trước đó. bond_kiem_thanh cũng 6/12 (trước
đó 1/3 ở n=3 là nhiễu). 8 bond còn lại: 12/12, trừ bong_dem 8/12.
Không bond nào còn thua mirror sau chỉnh.

### 6.4 Kiểm thử hồi quy — đều đạt

- Godot headless: `M1_MANUAL_OK`, `M1_SANITY OK`,
  `M1_REPLAY seed=777 same=true` (ticks 648→576, events 123→113 —
  số liệu combat đổi theo stat mới, tính deterministic giữ nguyên),
  `M3_SHOP distinct=49/49`, `M3_BONDS fired={sam_set: 23,
  bien_va_song: 4, co_sac: 3, tri_thuc: 7}`, `M3_CHECK OK`,
  `M1_MATCH_OK top1=Bot Hà rounds=39`, `M1_HEADLESS_OK`,
  assets 49/49.
- Server: `npx tsc --noEmit` sạch; `npm test` 66/66 pass (smoke 52 +
  anticheat 14). Server đọc chung `data/units.json` +
  `data/karma_bonds.json` nên tự nhận số mới, không sửa code server.

## 7. Còn outlier sau chỉnh / theo dõi tiếp

1. **Lancelot (duel 2g 0.88, z+4.35)** và **Paul Bunyan (duel 1g
   0.88, z+4.35)** vẫn mạnh trong duel, nhưng batch sau chỉnh đã
   trung lập (Lancelot z+1.30, Bunyan z+0.43). Ưu tiên tin batch
   (trận thật) — theo dõi thêm 1 đợt batch nữa, chưa cắt tiếp.
2. **Mothman (duel 4g 0.76 → 1.00)**: mạnh lên do các tướng 4g khác
   bị nerf mà hắn không bị — hiệu ứng waterbed khi chỉ nerf một phần
   của bậc giá. Nếu đợt sau hắn vẫn đứng đầu 4g thì cắt HP 1000→950.
3. **Nobunaga (duel 0.15), An Dương Vương (0.09), Xochiquetzal
   (0.18), D'Artagnan (0.12), Oakley (0.18)**: vẫn yếu trong duel dù
   đã buff. Nhưng batch của An Dương Vương/Xochiquetzal lại mạnh
   (nhiễu sinh tồn) và D'Artagnan/Oakley trung lập trong batch — khả
   năng cao duel 1v1 đánh giá thấp Xạ Thủ một cách có hệ thống (§3.2).
   Cần số liệu trận 8v8 thật (người chơi) mới kết luận được.
4. **Yết Kiêu — tín hiệu mâu thuẫn**: duel 0.30→0.49 (tốt lên) nhưng
   batch top1 z −0.85→−2.21 (xấu đi, n=256). Giả thuyết: buff Xạ Thủ
   (+ATK Hậu Nghệ/D'Artagnan/Oakley) làm tuyến sau khó ám sát hơn.
   Chưa rõ — cần batch 120 trận nữa mới kết luận, KHÔNG chỉnh thêm
   theo 1 đợt batch 60 trận.
5. **Merlin (duel 5g 0/12), Tesla/Quetzalcoatl, Trần Hưng Đạo,
   Spring-heeled Jack**: yếu trong duel nhưng chưa có số liệu trận
   thật để xác nhận — theo dõi.
6. **7/10 bond chưa từng xuất hiện trong batch** — chỉ đo được qua
   probe mirror. Cần bot biết mua bond (follow-up §2.1) hoặc dữ liệu
   người chơi thật.
7. **Ghế "Bạn" thắng 22/120 trận pre và 10/60 trận post** — cao hơn
   kỳ vọng 15 và 7.5 nhưng trong nhiễu (z≈+1.9 và +1.0). Theo dõi;
   nếu lặp lại ở batch lớn thì kiểm tra lệch ghế trong `_shuffle_pairs`.

## 8. Giới hạn

- Bot Medium không giống người chơi thật: không bán tướng, không
  chuyển đội hình, không nhắm bond có chủ đích (xem §2.1). Mọi kết luận
  batch chỉ có giá trị cho meta tướng 1 vàng.
- Duel 1v1 không đo được giá trị của AoE trong đám đông, của tuyến
  trước/tuyến sau, của synergy/bond, của tướng hỗ trợ (Merlin).
- Mẫu: batch 120 trận (960 đội hình cuối trận); duel 3 seed/cặp
  (n=33 cùng bậc 1–3g, 21 cho 4g, 12 cho 5g — 5g là mẫu nhỏ).
- Số liệu bond là hiệu ứng chiến đấu trong mirror; giá trị bond trong
  trận thật còn phụ thuộc độ khó hoàn thành (cần 2–3 tướng cụ thể).
- Không có telemetry người chơi thật — M4 theo SRS vẫn cần số liệu
  sau soft launch để chốt cân bằng cuối.
