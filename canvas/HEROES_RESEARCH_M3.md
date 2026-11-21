# HEROES_RESEARCH_M3.md — Nghiên cứu 28 tướng M3 (FR / US / AZ / UK)

> **BẮT BUỘC ĐỌC TRƯỚC KHI VẼ BẤT KỲ CHÂN DUNG M3 NÀO.** File này + `STYLE_GUIDE.md` là nguồn chân lý về giới tính, ngoại hình, trang phục, vũ khí và thời đại của từng tướng.
> Nguồn gốc: file này nối tiếp `HEROES_RESEARCH.md` (M1) và tuân đúng quy trình đã chốt sau lỗi Yết Kiêu — nghiên cứu trước, vẽ sau. Không vẽ từ trí nhớ, không đoán giới tính.
> Nguồn dữ kiện: SRS v2.1 Appendix A (tên / class / cost / skill — danh sách khóa, đổi tên hoặc đổi Hệ phải tăng version tài liệu) + SRS v2.1 §12 (pháp lý, văn hóa) + tra cứu web (Wikipedia và nguồn chuyên đề) cho giới tính, thật/huyền thoại, ngoại hình, trang phục, vũ khí.
> Lưu ý SRS §12.2: thần thoại và tín ngưỡng — đặc biệt là Aztec và các truyền thống bản địa — phải có bước tham vấn chuyên gia văn hóa ở đầu M3 cho tạo hình, chiêu thức và mô tả. **Quetzalcoatl phải qua tham vấn văn hóa trước khi khóa art.** Nhân vật lịch sử đã mất trên 100 năm được dùng theo hướng hư cấu lịch sử, không dùng hình ảnh chân dung có bản quyền, không gán phát ngôn hoặc hành vi sai sự thật gây hại.

## Bảng tổng hợp

| unit_id | Tên | Quốc gia | Class | Cost | Giới tính | Thật / Huyền thoại | Vũ khí / vật đặc trưng |
|---|---|---|---|---|---|---|---|
| fr_joan | Joan of Arc | FR | GUARDIAN | 3 | **nữ** | Người thật (1412–1431) | Cờ thánh (oriflamme), kiếm |
| fr_martel | Charles Martel | FR | WARRIOR | 2 | **nam** | Người thật (c.688–741) | Búa chiến, rìu francisca |
| fr_lupin | Arsène Lupin | FR | ASSASSIN | 2 | **nam** | Hư cấu (tiểu thuyết 1905) | Gậy, thẻ bài, khóa vạn năng |
| fr_dartagnan | D'Artagnan | FR | ARCHER | 1 | **nam** | Người thật (c.1611–1673) | Kiếm rapier, súng hỏa mai |
| fr_nostradamus | Nostradamus | FR | MAGE | 2 | **nam** | Người thật (1503–1566) | Thiên cầu, sách sấm, thước chiêm tinh |
| fr_napoleon | Napoleon Bonaparte | FR | STRATEGIST | 4 | **nam** | Người thật (1769–1821) | Đại pháo, mũ bicorne |
| fr_gevaudan | Quái vật Gévaudan | FR | DIVINE | 4 | **sinh vật (không giới tính người)** | Sinh vật bí ẩn có thật trong sử (1764–1767) | Răng nanh, vuốt, đuôi dài |
| us_bunyan | Paul Bunyan | US | GUARDIAN | 1 | **nam** | Dân gian Mỹ (truyền miệng thế kỷ 19) | Rìu khổng lồ, bò xanh Babe |
| us_washington | George Washington | US | WARRIOR | 3 | **nam** | Người thật (1732–1799) | Kiếm, thuyền vượt sông Delaware |
| us_billy | Billy the Kid | US | ASSASSIN | 2 | **nam** | Người thật (1859–1881) | Súng lục Colt |
| us_oakley | Annie Oakley | US | ARCHER | 1 | **nữ** | Người thật (1860–1926) | Súng trường Winchester |
| us_tesla | Nikola Tesla | US | MAGE | 4 | **nam** | Người thật (1856–1943) | Cuộn Tesla, tháp Wardenclyffe |
| us_lincoln | Abraham Lincoln | US | STRATEGIST | 3 | **nam** | Người thật (1809–1865) | Mũ ống khói, tuyên ngôn (bút + cuộn giấy) |
| us_mothman | Mothman | US | DIVINE | 4 | **sinh vật (không giới tính người)** | Sinh vật bí ẩn / đô thị Mỹ (1966–1967) | Cánh, mắt đỏ phát sáng |
| az_cuauhtemoc | Cuauhtémoc | AZ | GUARDIAN | 1 | **nam** | Người thật (c.1495–1525) | Khiên chim ưng, macuahuitl |
| az_jaguar | Chiến Binh Báo Đốm | AZ | WARRIOR | 1 | **nam** | Chiến binh thật (hội Báo Đốm) | Macuahuitl, vuốt báo |
| az_eagle | Chiến Binh Đại Bàng | AZ | ASSASSIN | 1 | **nam** | Chiến binh thật (hội Đại Bàng) | Macuahuitl, atlatl |
| az_xochiquetzal | Xochiquetzal | AZ | ARCHER | 2 | **nữ** | Nữ thần Aztec | Mũi tên hoa, hoa + bướm |
| az_quetzalcoatl | Quetzalcoatl (Hóa thân) | AZ | MAGE | 4 | **nam** | Nam thần Aztec (hóa thân hạ cấp) | Lông vũ quetzal, gió, mặt nạ gió |
| az_montezuma | Montezuma II | AZ | STRATEGIST | 1 | **nam** | Người thật (c.1466–1520) | Vương miện ngọc lam, lịch mặt trời |
| az_huitzilopochtli | Huitzilopochtli | AZ | DIVINE | 5 | **nam** | Nam thần Aztec | Rắn lửa Xiuhcoatl, khiên |
| uk_arthur | King Arthur | UK | GUARDIAN | 4 | **nam** | Truyền thuyết Arthur | Excalibur |
| uk_lancelot | Lancelot | UK | WARRIOR | 2 | **nam** | Truyền thuyết Arthur | Kiếm |
| uk_spring_heeled_jack | Spring-heeled Jack | UK | ASSASSIN | 3 | **nam (hình dáng đàn ông)** | Dân gian Anh thế kỷ 19 | Vuốt kim loại, lửa xanh |
| uk_robin | Robin Hood | UK | ARCHER | 2 | **nam** | Truyền thuyết dân gian Anh | Cung dài, mũ lông vũ |
| uk_morgana | Morgana | UK | MAGE | 1 | **nữ** | Truyền thuyết Arthur | Sương mù Avalon, quạ |
| uk_merlin | Merlin | UK | STRATEGIST | 5 | **nam** | Truyền thuyết Arthur | Gậy phép, sách tiên tri |
| uk_beowulf | Beowulf | UK | DIVINE | 3 | **nam** | Anh hùng sử thi (thế kỷ 8–10) | Kiếm Hrunting, khiên tròn |

**Tổng giới tính M3: 22 nam, 4 nữ (Joan of Arc, Annie Oakley, Xochiquetzal, Morgana), 2 sinh vật không có giới tính người (Quái vật Gévaudan, Mothman). Không có tướng nữ nào khác. Spring-heeled Jack có hình dáng đàn ông cao gầy — vẽ nam. Quetzalcoatl là nam thần — vẽ nam. Hai sinh vật KHÔNG được vẽ mặt người, càng không được vẽ mặt nữ.**

---

## PHÁP (FR) — xanh hoàng gia + vàng

### 1. fr_joan — Joan of Arc (GUARDIAN, 3g) — NỮ
- **Giới tính:** nữ — "Trinh nữ Orléans" (La Pucelle d'Orléans). Nguồn: https://en.wikipedia.org/wiki/Joan_of_Arc
- **Thật / huyền thoại:** người thật (1412–1431); cô gái nông dân Domrémy nghe tiếng gọi của Tổng lãnh thiên thần Michael, Thánh Margaret và Thánh Catherine; giải vây Orléans 1429; bị bắt ở Compiègne 1430, bị thiêu ở Rouen 1431; được phong thánh 1920.
- **Ngoại hình:** thiếu nữ trẻ khoảng 17–19 tuổi, tóc ngắn cắt kiểu con trai (nàng mặc đồ nam ra trận), gương mặt nghiêm nghị, không son phấn. **Lưu ý: không có chân dung đương thời nào còn tồn tại — mọi hình ảnh đều là tưởng tượng hậu thế, không sao chép một bức tranh nổi tiếng cụ thể nào.**
- **Trang phục:** giáp tấm trắng/bạc, áo choàng xanh hoàng gia + vàng, huy hiệu hoa lily (fleur-de-lis) vàng; cờ thánh trắng có hoa lily vàng và chữ "Jhesus Maria".
- **Vũ khí / vật:** **cờ thánh (oriflamme)** là dấu ấn riêng — nàng cầm cờ nhiều hơn cầm kiếm; kiếm đeo bên hông.
- **Skill SRS — Cờ Thánh Hộ Mệnh (shield, SELF_ADJACENT):** cờ thánh giương cao, hào quang vàng-xanh bao quanh bản thân và đồng minh kề bên; hiệu ứng lá cờ sáng + vòng khiên hoa lily.
- **KHÔNG ĐƯỢC VẼ:** nam; gợi cảm / váy công chúa / tóc dài xõa kiểu nữ thần; giáp hiện đại; áo choàng thập tự đỏ của quân Anh; mặt già.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A young French female saint-warrior, short bobbed hair, royal blue and gold plate armor with golden fleur-de-lis, holding a white holy banner with gold lilies, determined expression, golden halo glow."

### 2. fr_martel — Charles Martel (WARRIOR, 2g) — NAM
- **Giới tính:** nam (c.688–741). Nguồn: https://en.wikipedia.org/wiki/Charles_Martel
- **Thật / huyền thoại:** người thật, quan chưởng ấn (mayor of the palace) của người Frank; biệt danh "Martel" nghĩa là **"Cái Búa"**; thắng trận Tours/Poitiers 732 chặn bước tiến của quân Umayyad; ông nội của Charlemagne.
- **Ngoại hình:** nam trung niên / lớn tuổi, râu ngắn, mặt vuông, thân hình vạm vỡ; tóc dài kiểu Frank.
- **Trang phục:** áo giáp xích (hauberk) thời sơ kỳ trung cổ, khiên tròn, mũ sắt; tông xanh hoàng gia + vàng (theo STYLE_GUIDE FR); không giáp tấm.
- **Vũ khí / vật:** **búa chiến lớn** (vật bất ly thân — theo biệt danh), rìu francisca ném của người Frank làm phụ.
- **Skill SRS — Búa Martel (damage, NEAREST):** búa giáng xuống tạo sóng xung kích; hiệu ứng búa vàng-xanh + vết nứt đất.
- **KHÔNG ĐƯỢC VẼ:** nữ; giáp tấm thế kỷ 15; Viking (mũ sừng); giáp La Mã; mặt trẻ.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A powerful middle-aged Frankish male warrior, short beard, chainmail hauberk and round shield, royal blue and gold tunic, holding a massive war hammer, stern battle-hardened face."

### 3. fr_lupin — Arsène Lupin (ASSASSIN, 2g) — NAM
- **Giới tính:** nam — nhân vật hư cấu. Nguồn: https://en.wikipedia.org/wiki/Ars%C3%A8ne_Lupin
- **Thật / huyền thoại:** **hư cấu**, "siêu trộm quý ông" do Maurice Leblanc sáng tạo (1905); bậc thầy cải trang, trộm cắp và thoát hiểm; đối thủ của Sherlock Holmes trong văn học Pháp. **Không phải người thật — không vẽ Maurice Leblanc.**
- **Ngoại hình:** nam thanh lịch khoảng 30 tuổi, tóc đen chải ngược, ria mép mỏng, mắt tinh quái, nụ cười nửa miệng.
- **Trang phục:** áo đuôi tôm / vest đen, mũ chóp cao (top hat), áo choàng, găng tay trắng, khăn quàng; tông tím đen (ASSASSIN) + xanh hoàng gia.
- **Vũ khí / vật:** **gậy ba toong**, thẻ bài (calling card) có chữ "Arsène Lupin", khóa vạn năng / chìa khóa; không dùng súng làm vũ khí chính.
- **Skill SRS — Đánh Cắp Nhịp Đòn (damage, NEAREST):** trộm đòn — lướt qua địch, lấy cắp nhịp đánh; hiệu ứng bóng áo choàng + thẻ bài bay + vệt tím.
- **KHÔNG ĐƯỢC VẼ:** nữ; mặt nạ kiểu Zorro (Lupin cải trang, không đeo mặt nạ); vest hiện đại / siêu anh hùng; súng làm vũ khí chính; hề.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. An elegant French male gentleman thief, slicked dark hair, thin moustache, top hat and black tailcoat with cape and white gloves, holding a cane and a calling card, sly smile, purple-black tones."

### 4. fr_dartagnan — D'Artagnan (ARCHER, 1g) — NAM
- **Giới tính:** nam (Charles de Batz de Castelmore, c.1611–1673). Nguồn: https://en.wikipedia.org/wiki/Charles_de_Batz_de_Castelmore
- **Thật / huyền thoại:** người thật, đội trưởng Ngự Lâm Quân (Musketeers of the Guard) dưới thời Louis XIV; Alexandre Dumas tiểu thuyết hóa thành nhân vật chính *Ba Chàng Lính Ngự Lâm* (1844). Vẽ theo hình tượng lính ngự lâm, không sao chép một diễn viên cụ thể nào.
- **Ngoại hình:** nam trẻ/trung niên, ria mép + râu cằm (goatee), tóc dài, mũ rộng vành có lông vũ.
- **Trang phục:** **áo choàng xanh ngự lâm có thập tự trắng** (thập tự của Ngự Lâm Quân) khoác ngoài áo doublet thế kỷ 17; tông xanh hoàng gia + trắng.
- **Vũ khí / vật:** **kiếm rapier** + **súng hỏa mai** (class ARCHER tầm 3 — skill dùng súng, không phải cung).
- **Skill SRS — Ngự Lâm Pháo Thủ (damage, NEAREST):** lính ngự lâm nổ súng; hiệu ứng nòng súng + lửa + khói thuốc súng xanh-trắng.
- **KHÔNG ĐƯỢC VẼ:** nữ; cung tên (class ARCHER ở đây dùng súng hỏa mai); đồng phục thế kỷ 19; cướp biển; súng hiện đại.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A dashing young French male musketeer, moustache and goatee, wide-brimmed hat with feather, royal blue musketeer tabard with white cross over 17th-century doublet, holding a rapier and a matchlock musket."

### 5. fr_nostradamus — Nostradamus (MAGE, 2g) — NAM
- **Giới tính:** nam (Michel de Nostredame, 1503–1566). Nguồn: https://en.wikipedia.org/wiki/Nostradamus
- **Thật / huyền thoại:** người thật, nhà chiêm tinh, thầy thuốc, nhà tiên tri Pháp thời Phục Hưng; tác phẩm *Les Prophéties* (1555) gồm các bài thơ bốn câu (quatrain) tiên tri.
- **Ngoại hình:** nam lớn tuổi, râu dài trắng/xám, mắt sâu nhìn xa xăm; dáng học giả.
- **Trang phục:** áo choàng học giả Phục Hưng tối màu, viền lông, mũ học giả; tông tím (MAGE) + xanh hoàng gia.
- **Vũ khí / vật:** **thiên cầu / quả cầu sao**, sách sấm mở, bút lông, bản đồ sao; sao băng.
- **Skill SRS — Tiên Tri Sao Băng (aoe, HIGHEST_DPS_CLUSTER):** sao băng rơi theo lời tiên tri; hiệu ứng sao băng tím + vòng chiêm tinh + trang sách bay.
- **KHÔNG ĐƯỢC VẼ:** nữ; pháp sư đội mũ chóp nhọn kiểu phim (dùng mũ học giả Phục Hưng, không phải mũ chóp phù thủy); mặt trẻ; quả cầu pha lê làm vật chính.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. An elderly French male astrologer, long white beard, dark Renaissance scholar robe with fur trim, holding an open book of prophecies and a brass celestial globe, violet starlight and a falling meteor behind him."

### 6. fr_napoleon — Napoleon Bonaparte (STRATEGIST, 4g) — NAM
- **Giới tính:** nam (1769–1821). Nguồn: https://en.wikipedia.org/wiki/Napoleon
- **Thật / huyền thoại:** người thật, Hoàng đế Pháp; thiên tài quân sự, thắng trận Austerlitz 1805; bại ở Waterloo 1815, lưu đày Saint Helena.
- **Ngoại hình:** nam trung niên, tóc đen, dáng người tầm thước — **lưu ý: Napoleon cao khoảng 1,69m, không phải người tí hon như truyện cười**; tư thế tay đặt trong áo (iconic), ánh mắt sắc.
- **Trang phục:** **mũ bicorne** (mũ hai sừng đội ngang — dấu ấn riêng), áo quân phục xanh đậm / xanh lá của Đại tá Cận vệ với cầu vai vàng, áo khoác xám; tông hổ phách (STRATEGIST) + xanh hoàng gia.
- **Vũ khí / vật:** **đại pháo** (skill Austerlitz), kiếm đeo hông; bản đồ trận địa.
- **Skill SRS — Đại Pháo Austerlitz (aoe, HIGHEST_DPS_CLUSTER):** pháo binh khai hỏa; hiệu ứng hàng đại pháo + lửa + khói + bản đồ trận địa.
- **KHÔNG ĐƯỢC VẼ:** nữ; người tí hon / lùn một cách biếm họa; áo đỏ của quân Anh; vương miện vua kiểu trung cổ (dùng mũ bicorne); tướng hiện đại.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A stern middle-aged French male emperor-general, dark hair, black bicorne hat worn sideways, dark blue military uniform with gold epaulettes and grey greatcoat, one hand tucked in waistcoat, cannons and battle smoke behind him."

### 7. fr_gevaudan — Quái vật Gévaudan (DIVINE, 4g) — SINH VẬT (KHÔNG GIỚI TÍNH NGƯỜI)
- **Giới tính:** **không có giới tính người** — sinh vật. Nguồn: https://en.wikipedia.org/wiki/Beast_of_G%C3%A9vaudan
- **Thật / huyền thoại:** sinh vật bí ẩn có thật trong sử: khủng bố vùng Gévaudan (nay là Lozère, miền nam nước Pháp) từ 30/6/1764 đến 19/6/1767, giết hơn 100 người; danh tính đến nay chưa xác định (giả thuyết phổ biến: sói khổng lồ, sói lai chó, hoặc sư tử non trốn khỏi vườn thú).
- **Ngoại hình:** **thú bốn chân to bằng con bê/bò**, lông hung đỏ (tawny/russet) có sọc đen dọc lưng, đuôi dài hơn sói và có chùm lông ở đầu, ngực rộng, hàm dài đầy răng nanh, tai nhọn dựng đứng, vuốt lớn; có nhân chứng nói nó nhảy vọt phi thường và đi bằng hai chân sau. Vẽ **đầu + vai của quái thú**, không mặt người.
- **Trang phục:** không mặc đồ — lông thú, ánh sáng đỏ rực (DIVINE).
- **Vũ khí / vật:** răng nanh, vuốt sắc; rừng Margeride mờ phía sau.
- **Skill SRS — Cuồng Săn (aoe, HIGHEST_DPS_CLUSTER):** săn mồi điên cuồng; hiệu ứng thú lao tới + bụi đất + vệt vuốt đỏ.
- **KHÔNG ĐƯỢC VẼ:** mặt người (nam hay nữ đều cấm); người sói nữ gợi cảm; chó thường / sói thường nhỏ bé; máu me rùng rợn (game 12+); ma cà rồng.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A monstrous beast head and shoulders, quadruped predator the size of a calf, tawny-red fur with a dark stripe down its back, long tufted tail, huge fanged jaws, pointed upright ears and large claws, glowing eyes, misty French mountain forest behind it. No human face."

---

## MỸ (US) — xanh hải quân + vàng sao

### 8. us_bunyan — Paul Bunyan (GUARDIAN, 1g) — NAM
- **Giới tính:** nam — người khổng lồ trong dân gian. Nguồn: https://en.wikipedia.org/wiki/Paul_Bunyan
- **Thật / huyền thoại:** **dân gian Mỹ**, anh hùng truyền miệng của giới đốn gỗ thế kỷ 19, được in thành sách đầu thế kỷ 20; cao hơn 7 feet (2,1m) trong truyện; bạn đồng hành là **bò xanh Babe**.
- **Ngoại hình:** đàn ông khổng lồ, râu quai nón đen/râu dài, mặt hiền nhưng oai, đội mũ len.
- **Trang phục:** **áo flannel đỏ caro**, quần yếm / dây đeo, ủng da lớn; tông đỏ + xanh hải quân.
- **Vũ khí / vật:** **rìu hai lưỡi khổng lồ** (vật bất ly thân); bò xanh Babe (họa tiết phía sau).
- **Skill SRS — Rìu Đại Thụ (shield, SELF_ADJACENT):** rìu đốn cây khổng lồ tạo khiên gỗ; hiệu ứng thân cây ngã + lá chắn gỗ + vụn gỗ bay.
- **KHÔNG ĐƯỢC VẼ:** nữ; người nhỏ bình thường; cưa máy hiện đại; thợ rừng hiện đại mặc đồ bảo hộ cam.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A giant cheerful American male lumberjack, big black beard, red plaid flannel shirt and suspenders, wool cap, holding a huge double-bit axe over his shoulder, blue ox motif behind him."

### 9. us_washington — George Washington (WARRIOR, 3g) — NAM
- **Giới tính:** nam (1732–1799). Nguồn: https://en.wikipedia.org/wiki/George_Washington
- **Thật / huyền thoại:** người thật, tổng tư lệnh Lục quân Lục địa, Tổng thống đầu tiên của Hoa Kỳ (1789–1797); nổi tiếng với **cuộc vượt sông Delaware đêm Giáng sinh 1776** đánh trận Trenton.
- **Ngoại hình:** nam cao lớn, tóc bột trắng buộc đuôi ngựa, hàm vuông, gương mặt nghiêm nghị.
- **Trang phục:** **đồng phục Lục quân Lục địa xanh đậm viền vàng nhạt (buff)**, áo gi-lê trắng, mũ tricorn; tông xanh hải quân + vàng.
- **Vũ khí / vật:** kiếm đeo hông; thuyền + sông Delaware đóng băng (skill).
- **Skill SRS — Vượt Sông Delaware (damage, NEAREST):** dẫn quân vượt sông băng đánh úp; hiệu ứng thuyền + sông băng + cờ sao sọc.
- **KHÔNG ĐƯỢC VẼ:** nữ; áo đỏ quân Anh; vest hiện đại / tổng thống thời nay; vương miện (ông từ chối làm vua); tóc xõa.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A tall dignified American male general, powdered hair tied back, dark blue Continental Army uniform with buff facings and white waistcoat, tricorn hat, sword at his side, icy river and rowboat behind him."

### 10. us_billy — Billy the Kid (ASSASSIN, 2g) — NAM
- **Giới tính:** nam (Henry McCarty, 1859–1881). Nguồn: https://en.wikipedia.org/wiki/Billy_the_Kid
- **Thật / huyền thoại:** người thật, tay súng / ngoài vòng pháp luật thời Chiến tranh Hạt Lincoln, New Mexico; bị cảnh sát trưởng Pat Garrett bắn chết năm 21 tuổi. **Chỉ có một bức ảnh được xác thực duy nhất (tintype) — không sao chép y hệt bức ảnh đó.**
- **Ngoại hình:** thanh niên trẻ khoảng 20 tuổi, gầy, tóc đen dài, răng hô nhẹ (theo ảnh tintype), mắt sắc.
- **Trang phục:** đồ cao bồi thập niên 1870 — mũ rộng vành, áo vest tối màu, khăn bandana, thắt lưng súng; tông tím đen (ASSASSIN) + nâu.
- **Vũ khí / vật:** **súng lục Colt** (rút súng chớp nhoáng).
- **Skill SRS — Rút Súng Chớp Nhoáng (damage, NEAREST):** rút súng bắn nhanh; hiệu ứng vệt đạn + khói súng + tia lửa.
- **KHÔNG ĐƯỢC VẼ:** nữ; tay súng già râu rậm kiểu phim cao bồi thập niên 1960; mũ cao bồi hiện đại; súng máy; áo giáp.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A lean young American male outlaw gunslinger, early twenties, long dark hair, wide-brimmed 1870s cowboy hat, dark vest and bandana, quick-drawing a Colt revolver, gun smoke and muzzle flash."

### 11. us_oakley — Annie Oakley (ARCHER, 1g) — NỮ
- **Giới tính:** nữ (Phoebe Ann Moses, 1860–1926). Nguồn: https://en.wikipedia.org/wiki/Annie_Oakley
- **Thật / huyền thoại:** người thật, nữ xạ thủ huyền thoại; ngôi sao của đoàn xiếc Buffalo Bill's Wild West; nổi tiếng bắn trúng lá bài theo chiều cạnh, bắn đồng xu tung trên không, bắn ngược qua gương.
- **Ngoại hình:** thiếu nữ / phụ nữ trẻ, tóc đen dài, gương mặt tự tin, dáng nhỏ nhắn nhanh nhẹn.
- **Trang phục:** trang phục biểu diễn Wild West — váy/váy ngắn có tua rua, mũ cao bồi, ủng; tông xanh hải quân + vàng sao; kín đáo, không gợi cảm.
- **Vũ khí / vật:** **súng trường Winchester**; súng lục đeo hông.
- **Skill SRS — Xạ Thủ Trăm Phát (aoe, HIGHEST_DPS_CLUSTER):** bắn trăm phát trúng trăm; hiệu ứng đạn bay thành chùm + lá bài rách + đồng xu văng.
- **KHÔNG ĐƯỢC VẼ:** nam; cao bồi nữ gợi cảm / hở hang; súng hiện đại / súng bắn tỉa; đồ da bó sát kiểu phim.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A confident young American female sharpshooter, long dark hair, Wild West show costume with fringe and cowboy hat, navy blue and star-gold tones, holding a Winchester rifle, playing cards and coins flying around her."

### 12. us_tesla — Nikola Tesla (MAGE, 4g) — NAM
- **Giới tính:** nam (1856–1943). Nguồn: https://en.wikipedia.org/wiki/Nikola_Tesla
- **Thật / huyền thoại:** người thật, nhà phát minh người Serbia–Mỹ; cha đẻ dòng điện xoay chiều (AC), động cơ cảm ứng; xây **Tháp Wardenclyffe** (1901–1917, Long Island) để truyền điện không dây.
- **Ngoại hình:** nam cao gầy, xương gò má cao, tóc đen rẽ ngôi giữa, ria mép mỏng; ánh mắt tập trung.
- **Trang phục:** vest 3 mảnh tối màu lịch lãm, sơ mi trắng; có thể khoác áo lab trắng; tông tím (MAGE) + xanh hải quân.
- **Vũ khí / vật:** **cuộn Tesla (Tesla coil)** phát tia sét, tháp Wardenclyffe, bóng đèn không dây.
- **Skill SRS — Tháp Wardenclyffe (aoe, HIGHEST_DPS_CLUSTER):** tháp phát điện phóng sét; hiệu ứng tia sét xanh-trắng + tháp thép + hồ quang điện.
- **KHÔNG ĐƯỢC VẼ:** nữ; nhà khoa học điên tóc trắng xù (đó là Einstein, không phải Tesla); kính bảo hộ / đồ steampunk quá lố; bóng đèn Edison (đối thủ của ông).
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A tall lean Serbian-American male inventor, sharp cheekbones, center-parted dark hair, thin moustache, dark three-piece suit, holding a glowing Tesla coil crackling with blue-white lightning, Wardenclyffe Tower behind him."

### 13. us_lincoln — Abraham Lincoln (STRATEGIST, 3g) — NAM
- **Giới tính:** nam (1809–1865). Nguồn: https://en.wikipedia.org/wiki/Abraham_Lincoln
- **Thật / huyền thoại:** người thật, Tổng thống thứ 16 của Hoa Kỳ (1861–1865); cao 1,93m; lãnh đạo miền Bắc trong Nội chiến; ban hành **Tuyên ngôn Giải phóng Nô lệ 1863**; bị ám sát 1865.
- **Ngoại hình:** nam cao gầy, mặt dài hốc hác, **râu cằm không ria mép (chinstrap beard)**, mắt sâu trầm tư.
- **Trang phục:** **mũ ống khói (stovepipe top hat)** đen cao, vest đen, nơ cổ đen; tông hổ phách (STRATEGIST) + đen.
- **Vũ khí / vật:** **bút lông + cuộn Tuyên ngôn** (vật bất ly thân cho skill); rìu bổ củi thời trẻ làm họa tiết phụ.
- **Skill SRS — Tuyên Ngôn Đoàn Kết (aoe, HIGHEST_DPS_CLUSTER):** tuyên ngôn đoàn kết toàn quân; hiệu ứng cuộn giấy sáng + cờ sao sọc + hào quang vàng.
- **KHÔNG ĐƯỢC VẼ:** nữ; mặt cạo râu nhẵn (râu cằm là dấu ấn riêng); vest hiện đại; vương miện; súng.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A very tall gaunt American male president, long face, chinstrap beard without moustache, black stovepipe top hat and black suit with bow tie, holding a quill and a glowing proclamation scroll, stars-and-stripes motif behind him."

### 14. us_mothman — Mothman (DIVINE, 4g) — SINH VẬT (KHÔNG GIỚI TÍNH NGƯỜI)
- **Giới tính:** **không có giới tính người** — sinh vật. Nguồn: https://en.wikipedia.org/wiki/Mothman
- **Thật / huyền thoại:** sinh vật bí ẩn trong truyền thuyết đô thị Mỹ hiện đại: lần đầu được nhìn thấy 15/11/1966 ở Point Pleasant, West Virginia (khu "TNT area", nhà máy đạn cũ thời Thế chiến II); các vụ nhìn thấy kéo dài đến 12/1967, gắn với vụ sập cầu Silver Bridge; nổi tiếng qua sách *The Mothman Prophecies* (John Keel, 1975).
- **Ngoại hình:** **hình người có cánh cao khoảng 2,1m, mắt đỏ phát sáng**, thân xám bẩn / đen, **không thấy rõ mặt hay đầu** (mắt như gắn trên ngực theo một số nhân chứng), cánh trắng/xám lớn, chân cơ bắp như người, bay lượn không vỗ cánh; tiếng kêu rít như chuột. Vẽ **bóng hình có cánh với đôi mắt đỏ**, không mặt người.
- **Trang phục:** không mặc đồ — thân phủ lông/vảy xám, cánh bướm đêm lớn.
- **Vũ khí / vật:** đôi cánh + mắt đỏ; cầu Silver Bridge mờ phía sau, bầu trời đêm.
- **Skill SRS — Điềm Báo Cánh Đêm (aoe, HIGHEST_DPS_CLUSTER):** điềm báo từ màn đêm; hiệu ứng cánh đen xòe + mắt đỏ + sương đêm + tiếng rít.
- **KHÔNG ĐƯỢC VẼ:** mặt người (nam hay nữ đều cấm); người bướm nữ gợi cảm; siêu anh hùng kiểu Batman; con bướm đêm bình thường (phải là hình người có cánh); máu me.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A shadowy winged humanoid creature, about seven feet tall, large grey moth wings, two glowing red eyes with no visible face or head, dark grey furred body, night mist and a distant bridge silhouette behind it. No human face."

---

## AZTEC (AZ) — ngọc lam + vàng mặt trời

> ⚠️ **Lưu ý văn hóa (SRS §12.2):** tạo hình Aztec phải tham khảo **Codex Mendoza / Codex Borgia** (tranh khắc Aztec đương thời), không dùng mũ lông vũ của thổ dân đồng bằng Bắc Mỹ (Plains war bonnet), không nhầm với Maya hay Inca. Vũ khí đặc trưng là **macuahuitl** (gậy gỗ gắn lưỡi đá obsidian), atlatl (cần phóng lao), khiên tròn có lông vũ.

### 15. az_cuauhtemoc — Cuauhtémoc (GUARDIAN, 1g) — NAM
- **Giới tính:** nam (c.1495–1525). Nguồn: https://en.wikipedia.org/wiki/Cuauht%C3%A9moc
- **Thật / huyền thoại:** người thật, **vị hoàng đế Aztec cuối cùng** (tlatoani thứ 11); tên nghĩa là "Đại bàng Hạ xuống / Mặt trời Lặn"; kháng cự quân Cortés trong cuộc vây hãm Tenochtitlan 1521, bị bắt khi trốn bằng xuồng, bị treo cổ 1525 trong chuyến hành quân Honduras.
- **Ngoại hình:** nam trẻ khoảng 25 tuổi, thân hình rắn chắc, da nâu, mặt cương nghị; tóc đen.
- **Trang phục:** giáp bông (ichcahuipilli), áo choàng lông vũ, **mũ lông chim ưng**, trang sức ngọc bích + vàng; tông ngọc lam + vàng mặt trời.
- **Vũ khí / vật:** **khiên chim ưng** (hình chim ưng / lông vũ) + macuahuitl.
- **Skill SRS — Khiên Chim Ưng (shield, SELF_ADJACENT):** khiên chim ưng dang cánh che chở; hiệu ứng khiên lông vũ vàng-lam + chim ưng bay quanh.
- **KHÔNG ĐƯỢC VẼ:** nữ; giáp Tây Ban Nha (conquistador); mũ lông vũ đồng bằng Bắc Mỹ; trang phục Inca/Maya.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A young Aztec male emperor, resolute face, turquoise and sun-gold cotton armor, eagle-feather headdress, jade ornaments, holding a round feathered eagle shield and an obsidian-edged macuahuitl club."

### 16. az_jaguar — Chiến Binh Báo Đốm (WARRIOR, 1g) — NAM
- **Giới tính:** nam — hội chiến binh. Nguồn: https://en.wikipedia.org/wiki/Jaguar_warrior
- **Thật / huyền thoại:** **chiến binh thật** trong quân đội Aztec: hội Báo Đốm (ocēlōtl) là một trong hai hội quân sự tinh nhuệ nhất (cùng hội Đại Bàng); chỉ những người bắt được từ 4 tù binh trở lên mới được gia nhập; báo đốm là biểu tượng của đất và đêm, bảo hộ là thần Tezcatlipoca.
- **Ngoại hình:** nam chiến binh mặc **toàn bộ da báo đốm**, mũ đầu báo gầm với răng nanh, sơn cơ thể màu tối.
- **Trang phục:** da báo đốm nguyên con (đốm hoa hồng — rosette, không phải đốm tròn của báo châu Phi), khiên tròn, lông vũ; tông ngọc lam + vàng.
- **Vũ khí / vật:** **macuahuitl** + dao obsidian; **vuốt báo** (skill).
- **Skill SRS — Vuốt Báo Đốm (damage, NEAREST):** vuốt báo xé; hiệu ứng vệt vuốt vàng + đốm báo + bóng đêm.
- **KHÔNG ĐƯỢC VẼ:** nữ; một con báo thật (phải là **người** mặc da báo); báo đốm châu Phi với đốm tròn sai; đồ ngụy trang hiện đại; hổ.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A fierce Aztec male jaguar warrior, full jaguar pelt suit with snarling jaguar-head helmet, dark body paint, turquoise and sun-gold accents, holding an obsidian-edged macuahuitl club, jaguar claws slashing."

### 17. az_eagle — Chiến Binh Đại Bàng (ASSASSIN, 1g) — NAM
- **Giới tính:** nam — hội chiến binh. Nguồn: https://en.wikipedia.org/wiki/Eagle_warrior
- **Thật / huyền thoại:** **chiến binh thật** trong quân đội Aztec: hội Đại Bàng (cuāuhtli) là một trong hai hội tinh nhuệ nhất; "chiến binh của Mặt Trời" vì đại bàng là biểu tượng của Mặt Trời; cũng phải bắt từ 4 tù binh trở lên; thường dân có công đặc biệt cũng được gia nhập.
- **Ngoại hình:** nam chiến binh đội **mũ đầu đại bàng mỏ há**, áo choàng lông vũ, khiên có họa tiết mặt trời.
- **Trang phục:** mũ đại bàng + lông vũ, áo choàng lông, khiên mặt trời; tông ngọc lam + vàng.
- **Vũ khí / vật:** **macuahuitl**, **atlatl** (cần phóng lao), dao obsidian.
- **Skill SRS — Sà Xuống Săn Mồi (damage, NEAREST):** sà xuống từ trên cao như đại bàng; hiệu ứng cánh đại bàng + lao phóng + vệt nắng.
- **KHÔNG ĐƯỢC VẼ:** nữ; một con đại bàng thật (phải là **người** đội mũ đại bàng); mũ lông vũ đồng bằng Bắc Mỹ; đại bàng đầu trắng kiểu Mỹ hiện đại.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A lean Aztec male eagle warrior, eagle-head helmet with open beak, feathered cape and sun-motif shield, turquoise and sun-gold tones, holding a macuahuitl club and a spear-thrower, wings of feathers behind him."

### 18. az_xochiquetzal — Xochiquetzal (ARCHER, 2g) — NỮ
- **Giới tính:** nữ — nữ thần. Nguồn: https://en.wikipedia.org/wiki/X%C5%8Dchiquetzal
- **Thật / huyền thoại:** **nữ thần Aztec** của sắc đẹp, tình yêu, hoa, sinh sản và dệt may; tên nghĩa là "Hoa Lông Vũ Quý" (xōchitl = hoa, quetzalli = lông vũ quý); tên khác Ichpochtli nghĩa là "thiếu nữ"; trong Codex Borgia nàng luôn được vẽ là **thiếu nữ trẻ đẹp, ăn mặc lộng lẫy, gắn với hoa và bướm**.
- **Ngoại hình:** nữ thần trẻ đẹp, tóc đen dài với hoa cài, gương mặt dịu dàng; trang phục lộng lẫy.
- **Trang phục:** váy áo Aztec sặc sỡ thêu hoa, lông vũ quetzal xanh lục, trang sức vàng + ngọc; tông ngọc lam + vàng + hồng hoa; bướm và chim ruồi bay quanh.
- **Vũ khí / vật:** **mũi tên hoa** (tên gắn hoa), bó hoa, khung dệt.
- **Skill SRS — Mũi Tên Hoa (aoe, HIGHEST_DPS_CLUSTER):** mưa tên hoa; hiệu ứng cánh hoa + bướm + lông vũ quetzal bay.
- **KHÔNG ĐƯỢC VẼ:** nam; gợi cảm quá mức (game 12+ — ăn mặc lộng lẫy theo tranh codex, không hở hang); nữ thần Hy Lạp mặc toga trắng; váy hoa hiện đại.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A beautiful young Aztec goddess, female, long dark hair with flowers, richly embroidered turquoise and gold flower-patterned robes, quetzal feathers, holding a bow with flower-tipped arrows, butterflies and hummingbirds around her."

### 19. az_quetzalcoatl — Quetzalcoatl (Hóa thân) (MAGE, 4g) — NAM
- **Giới tính:** nam — nam thần. Nguồn: https://en.wikipedia.org/wiki/Quetzalcoatl
- **Thật / huyền thoại:** **nam thần Aztec** — Rắn Lông Vũ, thần gió, tri thức, nghệ thuật và học vấn; một trong bốn vị thần sáng thế. **SRS v2.1 §12 chốt: đây là "hóa thân" (incarnation) với sức mạnh đã hạ cấp cho cân bằng, và PHẢI qua tham vấn văn hóa ở M3 trước khi khóa art.** Vẽ dạng người hóa thân, không vẽ nguyên hình rắn thần.
- **Ngoại hình:** nam thần dạng người, da có vảy rắn ánh xanh lục, lông vũ quetzal xanh lục dài; có thể mang **mặt nạ gió hình mỏ vịt** (theo Codex Borgia) và vỏ ốc xà cừ (biểu tượng gió).
- **Trang phục:** áo choàng lông vũ quetzal xanh lục + vàng, trang sức vỏ ốc; tông ngọc lam + vàng.
- **Vũ khí / vật:** **lông vũ quetzal**, gió xoáy, vỏ ốc; rắn lông vũ cuộn quanh vai.
- **Skill SRS — Gió Lông Vũ (aoe, HIGHEST_DPS_CLUSTER):** gió lông vũ quét qua; hiệu ứng lốc gió + lông vũ xanh lục bay + rắn lông vũ.
- **KHÔNG ĐƯỢC VẼ:** nữ; một con rắn thật (phải là **người hóa thân**); thiên thần Kitô giáo có cánh trắng; rồng Trung Quốc; thần gió Hy Lạp.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A majestic Aztec male feathered-serpent god in human incarnation form, green quetzal feathers and faint serpent scales, wind mask motif, turquoise and sun-gold feathered robes, holding a conch shell, wind swirls and green feathers around him."

### 20. az_montezuma — Montezuma II (STRATEGIST, 1g) — NAM
- **Giới tính:** nam (Moctezuma Xocoyotzin, c.1466–1520). Nguồn: https://en.wikipedia.org/wiki/Moctezuma_II
- **Thật / huyền thoại:** người thật, **hoàng đế Aztec thứ 9** (tlatoani); trị vì khi Cortés đổ bộ 1519; chết năm 1520 trong cuộc nổi dậy La Noche Triste (nguyên nhân còn tranh cãi).
- **Ngoại hình:** nam trung niên, dáng vương giả, mặt nghiêm nghị; tóc đen.
- **Trang phục:** **vương miện khảm ngọc lam (turquoise mosaic crown)**, áo choàng lông vũ hoàng gia, trang sức vàng + ngọc bích; tông ngọc lam + vàng.
- **Vũ khí / vật:** **lịch mặt trời Aztec (đá lịch)** — vật bất ly thân cho skill; trượng hoàng gia.
- **Skill SRS — Lịch Mặt Trời (aoe, HIGHEST_DPS_CLUSTER):** lịch mặt trời xoay, định mệnh; hiệu ứng vòng đá lịch vàng + tia nắng + ký tự Aztec.
- **KHÔNG ĐƯỢC VẼ:** nữ; giáp Tây Ban Nha; chiến binh trẻ (ông là hoàng đế trung niên); vàng Inca quá lố; mũ lông vũ đồng bằng Bắc Mỹ.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A regal middle-aged Aztec male emperor, turquoise mosaic crown, royal feathered cape and gold-jade ornaments, turquoise and sun-gold tones, holding a golden Aztec sun calendar stone, solemn expression."

### 21. az_huitzilopochtli — Huitzilopochtli (DIVINE, 5g) — NAM
- **Giới tính:** nam — nam thần. Nguồn: https://en.wikipedia.org/wiki/Huitzilopochtli
- **Thật / huyền thoại:** **nam thần Aztec** của chiến tranh và mặt trời, thần bảo hộ của Tenochtitlan; tên nghĩa là "Chim Ruồi Phương Nam / Chim Ruồi Tay Trái"; theo truyền thuyết, ông dẫn dắt người Mexica tìm nơi lập Tenochtitlan (đại bàng đậu trên xương rồng ăn rắn).
- **Ngoại hình:** nam thần chiến binh, **thân sơn màu xanh lam** (theo tranh codex), đội mũ chim ruồi, mắt sắc, hào quang mặt trời.
- **Trang phục:** giáp chiến thần xanh lam + vàng, lông vũ chim ruồi, khiên mặt trời.
- **Vũ khí / vật:** **rắn lửa Xiuhcoatl** (vũ khí rắn lửa màu ngọc lam) + khiên.
- **Skill SRS — Mặt Trời Chiến Tranh (aoe, HIGHEST_DPS_CLUSTER):** mặt trời chiến tranh giáng xuống; hiệu ứng mặt trời rực + rắn lửa xanh lam + tia nắng.
- **KHÔNG ĐƯỢC VẼ:** nữ; ác quỷ đỏ có sừng; thần mặt trời Hy Lạp (Helios) đội vương miện tia nắng; chim ruồi thật (phải là **thần người** với mũ chim ruồi).
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A powerful Aztec male god of war and the sun, blue-painted skin, hummingbird headdress, blue and sun-gold divine armor, holding the turquoise fire serpent Xiuhcoatl, blazing sun disc behind him."

---

## ANH (UK) — ngọc lục bảo + bạc

### 22. uk_arthur — King Arthur (GUARDIAN, 4g) — NAM
- **Giới tính:** nam — vua truyền thuyết. Nguồn: https://en.wikipedia.org/wiki/King_Arthur
- **Thật / huyền thoại:** **truyền thuyết Arthur** (Geoffrey of Monmouth, *Historia Regum Britanniae*, c.1136; Thomas Malory, *Le Morte d'Arthur*, 1485); vua xứ Camelot, chủ nhân thanh kiếm Excalibur, thủ lĩnh các Hiệp sĩ Bàn Tròn; có thể dựa trên một thủ lĩnh người Briton thế kỷ 5–6 nhưng không có bằng chứng chắc chắn.
- **Ngoại hình:** nam trẻ/trung niên, râu ngắn hoặc cạo râu, gương mặt vương giả.
- **Trang phục:** giáp xích + áo choàng (surcoat) ngọc lục bảo có rồng đỏ Pendragon, **vương miện vàng**, áo choàng; tông ngọc lục bảo + bạc.
- **Vũ khí / vật:** **Excalibur** (kiếm trong đá / kiếm của Hồ).
- **Skill SRS — Excalibur Hộ Vương (shield, SELF_ADJACENT):** Excalibur dựng khiên vương; hiệu ứng kiếm sáng bạc + khiên rồng + hào quang.
- **KHÔNG ĐƯỢC VẼ:** nữ (lưu ý: game Fate/Grand Order có phiên bản Arthur nữ — hư cấu, KHÔNG dùng); giáp La Mã; vua hiện đại; phong cách Disney.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A noble British male king, golden crown, emerald and silver chainmail with red dragon surcoat, holding the shining sword Excalibur, radiant kingly aura, Camelot banners behind him."

### 23. uk_lancelot — Lancelot (WARRIOR, 2g) — NAM
- **Giới tính:** nam — hiệp sĩ truyền thuyết. Nguồn: https://en.wikipedia.org/wiki/Lancelot
- **Thật / huyền thoại:** **truyền thuyết Arthur**; hiệp sĩ giỏi nhất Bàn Tròn, "Hiệp sĩ của Hồ" (nuôi dưỡng bởi Tiên Hồ Viviane); yêu Guinevere; cha của Galahad. **SRS v2.1 §12 chốt: Lancelot là WARRIOR (v2.0 xếp nhầm DIVINE).**
- **Ngoại hình:** nam trẻ tuấn tú, tóc đen, gương mặt hiệp sĩ lý tưởng.
- **Trang phục:** giáp bạc + ngọc lục bảo, áo choàng có họa tiết hồ nước / hoa lily; tông ngọc lục bảo + bạc.
- **Vũ khí / vật:** **kiếm** dài (vật bất ly thân); khiên có huy hiệu.
- **Skill SRS — Kiếm Sĩ Hồ Quang (damage, NEAREST):** kiếm ánh hồ quang; hiệu ứng vệt kiếm bạc-xanh + sóng hồ.
- **KHÔNG ĐƯỢC VẼ:** nữ; giáp đen của phản diện; thần thánh phát sáng (ông là WARRIOR, không phải DIVINE); kiếm Nhật.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A handsome young British male knight of the Round Table, dark hair, silver and emerald armor with lake motifs, holding a long shining sword, calm noble gaze, faint lake light behind him."

### 24. uk_spring_heeled_jack — Spring-heeled Jack (ASSASSIN, 3g) — NAM (hình dáng đàn ông)
- **Giới tính:** nam (hình dáng đàn ông cao gầy). Nguồn: https://en.wikipedia.org/wiki/Spring-heeled_Jack
- **Thật / huyền thoại:** **nhân vật dân gian Anh thời Victoria**; lần đầu được nhìn thấy ở London tháng 9/1837, các vụ việc kéo dài đến 1877 (lần cuối được ghi nhận ở Liverpool 1904); chưa bao giờ xác định được danh tính (một giả thuyết: Hầu tước Waterford — không có bằng chứng). **KHÔNG PHẢI Jack the Ripper — hai nhân vật hoàn toàn khác nhau: Jack the Ripper là sát nhân hàng loạt có thật ở Whitechapel 1888, đã bị loại khỏi SRS v2.1 (§12); Spring-heeled Jack là nhân vật truyền thuyết đô thị, không giết người.**
- **Ngoại hình:** **đàn ông cao gầy**, mặt quỷ dữ, mắt như "quả cầu lửa đỏ", tay có vuốt kim loại, thở ra lửa xanh-trắng; đội mũ sắt, mặc áo trắng bó sát như áo dầu (oilskin) dưới áo choàng đen dài; có thể nhảy qua tường cao 2,7m, cười giọng the thé.
- **Trang phục:** áo choàng đen dài, mũ sắt, áo trắng bó sát, ủng cao gót; tông tím đen (ASSASSIN) + xanh lửa.
- **Vũ khí / vật:** **vuốt kim loại ở đầu ngón tay**, lửa xanh thở ra từ miệng.
- **Skill SRS — Nhảy Bóng Đêm (damage, NEAREST):** nhảy vọt trong bóng đêm; hiệu ứng bóng đen nhảy qua tường + lửa xanh + vuốt sáng.
- **KHÔNG ĐƯỢC VẼ:** Jack the Ripper (mũ chóp + dao + Whitechapel 1888 — CẤM); nữ; ác quỷ có sừng và đuôi; siêu anh hùng hiện đại; dao mổ.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A tall thin Victorian English male folklore figure, black cloak, iron helmet, tight white oilskin garment, red fireball eyes, sharp metallic claws, breathing blue-white flames, leaping through night fog, purple-black tones."

### 25. uk_robin — Robin Hood (ARCHER, 2g) — NAM
- **Giới tính:** nam — anh hùng dân gian. Nguồn: https://en.wikipedia.org/wiki/Robin_Hood
- **Thật / huyền thoại:** **truyền thuyết dân gian Anh** (ballad thế kỷ 14–15); thủ lĩnh nhóm Merry Men ở rừng Sherwood, Nottinghamshire; "cướp của người giàu chia cho người nghèo"; có thể dựa trên nhiều người thật nhưng không xác định được.
- **Ngoại hình:** nam trẻ, tóc nâu, gương mặt lanh lợi, nụ cười tinh quái.
- **Trang phục:** **áo choàng và mũ trùm màu xanh Lincoln (Lincoln green)**, mũ có lông vũ; tông xanh lá (ARCHER) + ngọc lục bảo.
- **Vũ khí / vật:** **cung dài (longbow)** + bao tên; dao găm; túi tiền.
- **Skill SRS — Mũi Tên Sherwood (aoe, HIGHEST_DPS_CLUSTER):** mưa tên Sherwood; hiệu ứng tên bay + lá rừng + tia sáng xanh.
- **KHÔNG ĐƯỢC VẼ:** nữ; cáo Disney (phim hoạt hình 1973 — không dùng); cung compound hiện đại; giáp của cảnh sát trưởng Nottingham; áo đỏ.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A cheerful young English male outlaw, brown hair, Lincoln green hooded cloak with feathered cap, drawing a longbow, quiver of arrows on his back, Sherwood Forest leaves and green light around him."

### 26. uk_morgana — Morgana (MAGE, 1g) — NỮ
- **Giới tính:** nữ — nữ phù thủy truyền thuyết. Nguồn: https://en.wikipedia.org/wiki/Morgan_le_Fay
- **Thật / huyền thoại:** **truyền thuyết Arthur** (còn gọi Morgan le Fay); chị cùng mẹ khác cha của Arthur, nữ chúa đảo Avalon, bậc thầy pháp thuật và chữa bệnh; trong một số bản là phản diện, trong bản khác là người chữa lành — vẽ theo hướng **nữ pháp sư bí ẩn của Avalon**, không phải ác nữ.
- **Ngoại hình:** phụ nữ đẹp, tóc đen dài, gương mặt bí ẩn, mắt sắc.
- **Trang phục:** váy dài tối màu (đen / xanh lục đậm) thêu bạc, vương miện nhỏ / vòng nguyệt quế bạc; tông tím (MAGE) + ngọc lục bảo.
- **Vũ khí / vật:** **sương mù Avalon**, quạ đen, quả táo vàng của Avalon.
- **Skill SRS — Sương Mù Avalon (aoe, HIGHEST_DPS_CLUSTER):** sương mù Avalon che phủ; hiệu ứng sương tím-xanh + quạ bay + đảo Avalon mờ.
- **KHÔNG ĐƯỢC VẼ:** nam; phù thủy gợi cảm / mũ chóp nhọn kiểu Halloween; da xanh kiểu ác nữ Disney; mặt già xấu xí.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A beautiful mysterious British female enchantress of Avalon, long dark hair, silver circlet, dark green and violet gown with silver embroidery, mist swirling around her, a black raven on her shoulder."

### 27. uk_merlin — Merlin (STRATEGIST, 5g) — NAM
- **Giới tính:** nam — pháp sư truyền thuyết. Nguồn: https://en.wikipedia.org/wiki/Merlin
- **Thật / huyền thoại:** **truyền thuyết Arthur**; pháp sư và cố vấn của vua Arthur, nhà tiên tri; trong một số bản là con của quỷ và người phàm (cambion) nhưng được rửa tội; người dựng Stonehenge (theo truyền thuyết), dạy dỗ Arthur trẻ.
- **Ngoại hình:** nam lớn tuổi, **râu trắng dài**, tóc trắng, mắt sáng nhìn xa (tiên tri).
- **Trang phục:** áo choàng dài xanh đậm / ngọc lục bảo thêu sao bạc, mũ pháp sư cao (mũ chóp là hình tượng cổ điển của Merlin — được phép dùng, nhưng giữ dáng trang nghiêm, không hoạt hình); tông hổ phách (STRATEGIST) + xanh.
- **Vũ khí / vật:** **gậy phép**, sách tiên tri, cú mèo / quạ, tinh thể.
- **Skill SRS — Tiên Tri Camelot (aoe, HIGHEST_DPS_CLUSTER):** tiên tri soi sáng tương lai; hiệu ứng sao bạc + vòng tiên tri + lâu đài Camelot.
- **KHÔNG ĐƯỢC VẼ:** nữ; thanh niên; bản sao Gandalf áo xám (giữ tông ngọc lục bảo/bạc của UK, không mặc áo xám); phù thủy hề.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A wise elderly British male wizard, long white beard, deep blue and emerald robe embroidered with silver stars, tall wizard hat, holding a wooden staff topped with a glowing crystal, silver stars and Camelot towers behind him."

### 28. uk_beowulf — Beowulf (DIVINE, 3g) — NAM
- **Giới tính:** nam — anh hùng sử thi. Nguồn: https://en.wikipedia.org/wiki/Beowulf
- **Thật / huyền thoại:** **anh hùng sử thi Anh cổ** (bản thơ *Beowulf*, khoảng thế kỷ 8–10, viết bằng tiếng Anh cổ); chiến binh người Geat (Scandinavia) đến Đan Mạch giết quái vật **Grendel** bằng tay không, sau đó giết mẹ Grendel, cuối đời giết rồng và chết vì vết thương.
- **Ngoại hình:** nam khổng lồ vạm vỡ, râu vàng/nâu, tóc dài; mặt chiến binh Bắc Âu.
- **Trang phục:** áo giáp xích, khiên tròn, **mũ có mào lợn rừng (boar-crest)** — biểu tượng bảo hộ của chiến binh Anglo-Saxon/Geat; tông ngọc lục bảo + bạc.
- **Vũ khí / vật:** **kiếm Hrunting** (kiếm mượn của Unferth) và **Nægling** (kiếm cuối đời); khiên tròn.
- **Skill SRS — Săn Quái Grendel (damage, NEAREST):** săn quái Grendel; hiệu ứng kiếm chém + bóng quái vật Grendel + đầm lầy.
- **KHÔNG ĐƯỢC VẼ:** nữ; **mũ sừng Viking** (mũ có sừng là huyền thoại hiện đại, sai lịch sử — dùng mũ mào lợn rừng); giáp tấm thế kỷ 15; rồng châu Á.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A huge muscular Anglo-Saxon male hero, long blond-brown beard, chainmail and round shield, boar-crest helmet, emerald and silver tones, holding the sword Hrunting, monstrous Grendel shadow looming behind him."

---

## Các bẫy đã biết (đọc kỹ trước khi vẽ M3)

1. **Spring-heeled Jack ≠ Jack the Ripper.** Jack the Ripper là sát nhân hàng loạt có thật (Whitechapel, London, 1888, ít nhất 5 nạn nhân, không bao giờ bị bắt) và đã bị **loại hoàn toàn khỏi SRS v2.1 (§12)**. Spring-heeled Jack là nhân vật dân gian (1837, áo choàng đen, mũ sắt, mắt lửa đỏ, thở lửa xanh, nhảy cao) — không dao mổ, không Whitechapel, không 1888. Vẽ nhầm hai người này là lỗi nghiêm trọng nhất có thể mắc ở M3.
2. **Vua Arthur nữ là hư cấu.** Game/anime nổi tiếng (Fate/Grand Order) có phiên bản Arthur nữ (Saber) — đó là hư cấu, KHÔNG được dùng làm tham chiếu. Arthur trong game này là **nam**.
3. **Quái vật Gévaudan và Mothman KHÔNG có giới tính người.** Không vẽ mặt người cho chúng, càng không vẽ mặt nữ. Gévaudan là thú bốn chân lông hung đỏ có sọc đen; Mothman là hình người có cánh, mắt đỏ, không thấy mặt.
4. **Quetzalcoatl là nam thần, dạng hóa thân.** Không vẽ nữ, không vẽ rắn thật. SRS §12 yêu cầu **tham vấn văn hóa trước khi khóa art** cho Quetzalcoatl và tạo hình Aztec nói chung.
5. **Aztec ≠ thổ dân đồng bằng Bắc Mỹ, ≠ Maya, ≠ Inca.** Không mũ lông vũ Plains war bonnet, không kim tự tháp Maya, không vàng Inca. Tham khảo Codex Mendoza / Codex Borgia. Vũ khí là macuahuitl (gậy gỗ gắn lưỡi obsidian), không phải rìu đá hay giáo sắt châu Âu.
6. **Napoleon không phải người tí hon.** Ông cao khoảng 1,69m — trung bình thời đó. Không vẽ biếm họa lùn. Dấu ấn là mũ bicorne và tay đặt trong áo.
7. **Tesla ≠ Einstein.** Tesla tóc đen rẽ ngôi giữa, ria mép mỏng, vest lịch lãm. Không vẽ tóc trắng xù, không kính bảo hộ, không bóng đèn Edison (đối thủ của ông).
8. **Lincoln có râu cằm KHÔNG ria mép.** Mặt cạo nhẵn là sai. Mũ ống khói đen cao là dấu ấn.
9. **Billy the Kid chỉ có một ảnh xác thực (tintype).** Không sao chép y hệt bức ảnh đó; vẽ theo mô tả (thanh niên 20 tuổi, gầy, tóc đen dài, đồ cao bồi 1870).
10. **Lancelot là WARRIOR, không phải DIVINE.** SRS v2.1 §12 đã xếp lại. Beowulf mới là DIVINE của UK. Không vẽ Lancelot phát sáng thần thánh.
11. **Joan of Arc không có chân dung đương thời.** Mọi hình ảnh đều là tưởng tượng hậu thế — vẽ theo mô tả (thiếu nữ 17–19 tuổi, tóc ngắn, giáp trắng/bạc, cờ thánh), không sao chép một bức tranh cụ thể có bản quyền.
12. **Morgana không phải ác nữ Disney.** Vẽ theo hướng nữ pháp sư bí ẩn của Avalon (sương mù, quạ, táo vàng) — không da xanh, không mũ chóp Halloween, không gợi cảm quá mức.
13. **Beowulf không đội mũ sừng.** Mũ sừng Viking là huyền thoại hiện đại sai lịch sử — dùng mũ mào lợn rừng.
14. **Arsène Lupin là hư cấu, không phải người thật.** Không vẽ Maurice Leblanc. Lupin không đeo mặt nạ Zorro — vũ khí của ông là cải trang, gậy và thẻ bài.
15. **Wendigo đã bị loại, Mothman thay thế (SRS §12).** Wendigo thuộc tín ngưỡng của các dân tộc bản địa Algonquian — không dùng làm tướng thương mại khi chưa có tham vấn cộng đồng. Trong M3 chỉ có Mothman, không có Wendigo.

---

## Rules for future batches (Quy tắc bắt buộc cho mọi batch vẽ M3)

1. **Đọc file này + `STYLE_GUIDE.md` (+ `HEROES_RESEARCH.md` cho mẫu M1) trước khi vẽ.** Không vẽ từ trí nhớ, không đoán giới tính.
2. **Luôn ghi rõ giới tính trong prompt.** Mở đầu prompt bằng "male" / "female" + độ tuổi. Với 2 sinh vật (Gévaudan, Mothman): ghi rõ "creature, no human face, no human gender" — cấm vẽ mặt người. Với Spring-heeled Jack: "male folklore figure". Với Quetzalcoatl: "male god in human incarnation form".
3. **Người thật thì không đổi giới tính.** Tuyệt đối không vẽ phiên bản nữ của một tướng nam có thật (và ngược lại) — kể cả khi một game/anime nổi tiếng có phiên bản giới tính khác (ví dụ: Arthur nữ trong Fate/Grand Order là hư cấu, KHÔNG được dùng làm tham chiếu).
4. **Không đồ hiện đại, không sai thời đại, không sai văn hóa.** Không súng hiện đại, không mũ sừng Viking, không mũ lông vũ đồng bằng Bắc Mỹ cho tướng Aztec, không giáp tấm thế kỷ 15 cho Charles Martel, không áo đỏ quân Anh cho Washington. Vũ khí và trang phục phải đúng thời đại + văn hóa của tướng (Pháp trung cổ / Phục Hưng / Napoleon; Mỹ thế kỷ 18–19; Aztec thế kỷ 15–16; Anh thời Arthur / Victoria).
5. **Dùng đúng vũ khí đặc trưng trong bảng.** Vũ khí là "căn cước" của tướng — sai vũ khí là sai tướng (vd: Joan phải có cờ thánh; Napoleon phải có đại pháo + mũ bicorne; Tesla phải có cuộn Tesla; Cuauhtémoc phải có khiên chim ưng; Beowulf phải có kiếm Hrunting + mũ mào lợn rừng, không mũ sừng).
6. **Định dạng thống nhất:** chân dung vuông **1600x1600 PNG**, nền dark-teal trơn, không chữ — như nhóm M1. Ảnh dọc phải cắt/chuẩn hóa trước khi sync vào `assets/`.
7. **Chân dung bị chặn:** nếu công cụ chặn (`integrity_check_failed`) — KHÔNG thử lại bằng cách diễn đạt lại cùng một yêu cầu. Chỉ vẽ lại khi người dùng chọn hướng sáng tạo khác an toàn hơn (vd: đổi phong cách/token/silhouette) hoặc đổi công cụ (vd: nhờ ChatGPT vẽ hộ như đã làm ở M1 với Trưng Trắc, Kinh Kha, Hanzo, Nobunaga).
8. **Sau mỗi batch: đối chiếu ảnh với file này** (giới tính, vũ khí, thời đại, văn hóa) và ghi kết quả vào `canvas/ASSET_LIST.md` trước khi sync. Ảnh nào sai giới tính thì đánh dấu ❌ và không được sync vào `assets/`. Riêng 2 sinh vật: ảnh nào có mặt người thì đánh dấu ❌.
9. **Skill icon:** dùng skill trong file này (cột Skill SRS) làm chủ đề icon — icon phải thể hiện được skill, không vẽ chân dung thu nhỏ.
10. **Không dùng ảnh người thật đang sống làm tham chiếu. Không sao chép tranh/chân dung có bản quyền cụ thể nào** (đặc biệt: không sao chép bức tintype duy nhất của Billy the Kid, không sao chép một bức tranh Joan of Arc nổi tiếng cụ thể nào). Mọi chân dung đều là minh họa phong cách hóa (stylized). **Quetzalcoatl: tham vấn văn hóa trước khi khóa art (SRS §12).**

---
*File nghiên cứu cho M3 — Đấu Trường Nhân Quả / HeroWorld. Lập 2026-11-21. Nguồn: SRS v2.1 Appendix A + §12 (danh sách khóa) và tra cứu web (Wikipedia). Cập nhật khi người dùng đổi thiết kế hoặc sau tham vấn văn hóa Aztec.*
