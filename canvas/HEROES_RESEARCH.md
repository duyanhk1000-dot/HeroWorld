# HEROES_RESEARCH.md — Nghiên cứu 21 tướng M1 (VN / CN / JP)

> **BẮT BUỘC ĐỌC TRƯỚC KHI VẼ BẤT KỲ CHÂN DUNG NÀO.** File này + `STYLE_GUIDE.md` là nguồn chân lý về giới tính, ngoại hình, trang phục, vũ khí và thời đại của từng tướng.
> Nguồn gốc: file này được lập ra sau lỗi Yết Kiêu — chân dung đã vẽ thành **nữ** trong khi Yết Kiêu là **nam**. Nguyên nhân gốc: không có bước nghiên cứu trước khi vẽ và `data/units.json` lúc đó chưa có trường giới tính. (Lưu ý: `data/units.json` hiện **đã có** trường `gender` cho cả 21 tướng và khớp với bảng dưới đây — hãy giữ hai nơi đồng bộ.)
> Nguồn dữ kiện: SRS v2.1 Appendix A (tên / class / cost / skill) + tra cứu web (Wikipedia, Britannica, nguồn chuyên đề) cho giới tính, thật/huyền thoại, ngoại hình, trang phục, vũ khí.

## Bảng tổng hợp

| unit_id | Tên | Quốc gia | Class | Cost | Giới tính | Thật / Huyền thoại | Vũ khí / vật đặc trưng |
|---|---|---|---|---|---|---|---|
| vn_thanh_giong | Thánh Gióng | VN | GUARDIAN | 2 | **nam** | Huyền thoại (Tứ Bất Tử) | Gậy tre / roi sắt, ngựa sắt |
| vn_hai_ba_trung | Hai Bà Trưng | VN | WARRIOR | 3 | **nữ** | Người thật (40–43 SCN) | Voi chiến, kiếm |
| vn_yet_kieu | Yết Kiêu | VN | ASSASSIN | 1 | **nam** | Người thật (1242–1303) | Dao găm / đục khoan thuyền |
| vn_an_duong_vuong | An Dương Vương | VN | ARCHER | 2 | **nam** | Vua thật / bán huyền thoại (257–179 TCN) | Nỏ thần (móng rùa vàng) |
| vn_chu_dong_tu | Chử Đồng Tử | VN | MAGE | 1 | **nam** | Huyền thoại (Tứ Bất Tử) | Gậy tre, nón (của Phật Quang), sen |
| vn_tran_hung_dao | Trần Hưng Đạo | VN | STRATEGIST | 4 | **nam** | Người thật (1228–1300) | Kiếm, cọc gỗ Bạch Đằng |
| vn_son_tinh | Sơn Tinh | VN | DIVINE | 5 | **nam** | Thần thoại (Tứ Bất Tử) | Gậy / trượng núi đá pha lê |
| cn_quan_vu | Quan Vũ | CN | GUARDIAN | 3 | **nam** | Người thật (mất 220) | Thanh Long Yển Nguyệt Đao |
| cn_lu_bo | Lữ Bố | CN | WARRIOR | 4 | **nam** | Người thật (mất 199) | Phương Thiên Họa Kích, ngựa Xích Thố |
| cn_kinh_kha | Kinh Kha | CN | ASSASSIN | 1 | **nam** | Người thật (mất 227 TCN) | Đoản kiếm tẩm độc giấu trong bản đồ |
| cn_hau_nghe | Hậu Nghệ | CN | ARCHER | 1 | **nam** | Thần thoại | Cung đỏ + tên trắng, bắn 9 mặt trời |
| cn_nu_oa | Nữ Oa | CN | MAGE | 3 | **nữ** | Nữ thần sáng thế | Đá ngũ sắc, la bàn (compass) |
| cn_khong_minh | Khổng Minh | CN | STRATEGIST | 3 | **nam** | Người thật (181–234) | Quạt lông hạc trắng, khăn luân cân |
| cn_ton_ngo_khong | Tôn Ngộ Không | CN | DIVINE | 5 | **nam** | Thần thoại / tiểu thuyết (Tây Du Ký, 1592) | Gậy Như Ý Kim Cô Bổng, vòng kim cô |
| jp_honda | Honda Tadakatsu | JP | GUARDIAN | 2 | **nam** | Người thật (1548–1610) | Thương Tonbokiri, mũ sừng hươu |
| jp_musashi | Miyamoto Musashi | JP | WARRIOR | 3 | **nam** | Người thật (c.1584–1645) | Song kiếm katana + wakizashi |
| jp_hanzo | Hattori Hanzo | JP | ASSASSIN | 2 | **nam** | Người thật (1542–1596) | Thương (yari), đoản đao |
| jp_nobunaga | Oda Nobunaga | JP | ARCHER | 3 | **nam** | Người thật (1534–1582) | Súng hỏa mai tanegashima, kiếm Heshikiri Hasebe |
| jp_seimei | Abe no Seimei | JP | MAGE | 3 | **nam** | Người thật + truyền thuyết (921–1005) | Quạt xếp, bùa ofuda, sao 5 cánh Seiman |
| jp_shingen | Takeda Shingen | JP | STRATEGIST | 2 | **nam** | Người thật (1521–1573) | Quạt chiến sắt (tessen / gunbai), cờ Phong Lâm Hỏa Sơn |
| jp_susanoo | Susanoo | JP | DIVINE | 5 | **nam** | Thần (kami) | Kiếm Kusanagi (Thảo Thế Kiếm), kiếm Totsuka |

**Tổng giới tính M1: 19 nam, 2 nữ (Hai Bà Trưng, Nữ Oa). Không có tướng nữ nào khác. Tôn Ngộ Không là khỉ đực — vẽ khỉ đực, không vẽ khỉ cái. Susanoo là nam thần — không vẽ nữ thần.**

---

## VIỆT NAM

### 1. vn_thanh_giong — Thánh Gióng (GUARDIAN, 2g) — NAM
- **Giới tính:** nam (nguồn: truyền thuyết ghi rõ cậu bé Gióng lớn thành tráng sĩ). Nguồn: https://en.wikipedia.org/wiki/Th%C3%A1nh_Gi%C3%B3ng
- **Thật / huyền thoại:** huyền thoại, một trong Tứ Bất Tử Việt Nam; thời Hùng Vương (truyền thuyết, chống giặc Ân).
- **Ngoại hình:** cậu bé bỗng lớn vụt thành **người khổng lồ trẻ tuổi**, vạm vỡ, mặt non nhưng oai nghiêm; tóc búi.
- **Trang phục:** giáp sắt (nhà vua ban ngựa sắt, roi sắt, giáp sắt) — tông xanh ngọc + vàng (theo STYLE_GUIDE VN).
- **Vũ khí / vật:** roi sắt (gãy thì bẻ **tre** làm vũ khí — tre là dấu ấn riêng), ngựa sắt phun lửa.
- **Skill SRS — Tre Ngà Hộ Thể (shield, SELF_ADJACENT):** khiên tre/gậy tre phát sáng xanh ngọc bao quanh bản thân và đồng minh kề bên; hiệu ứng lá chắn tre đan + ánh sáng ngọc.
- **KHÔNG ĐƯỢC VẼ:** nữ; ông già; vũ khí hiện đại; áo giáp châu Âu trung cổ.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A young Vietnamese male giant warrior, strong build, topknot, jade-green and gold iron armor, holding a thick bamboo staff, woven bamboo shield glowing jade-green, iron horse motif."

### 2. vn_hai_ba_trung — Hai Bà Trưng (WARRIOR, 3g) — NỮ
- **Giới tính:** nữ — **hai chị em Trưng Trắc và Trưng Nhị** (trong game gộp thành một tướng đại diện). Nguồn: https://en.wikipedia.org/wiki/Tr%C6%B0ng_sisters
- **Thật / huyền thoại:** người thật, lãnh đạo khởi nghĩa 40–43 SCN chống nhà Hán; Trưng Trắc xưng vương.
- **Ngoại hình:** hai nữ tướng trẻ, tóc dài búi cao / đội mũ, gương mặt cương nghị; thường cưỡi **voi chiến**.
- **Trang phục:** áo dài chiến / giáp đồng cổ Việt, khăn đóng, tông xanh ngọc + vàng; trang sức vàng.
- **Vũ khí / vật:** kiếm, voi chiến (có thể hiện voi nhỏ phía sau / họa tiết voi trên giáp).
- **Skill SRS — Voi Chiến Xung Phong (aoe, HIGHEST_DPS_CLUSTER):** voi chiến xông tới, bụi đất + sóng xung kích; hiệu ứng voi vàng ngọc lao vào cụm địch.
- **KHÔNG ĐƯỢC VẼ:** nam; trang phục Trung Quốc đời Thanh / Nhật Bản; voi châu Phi; áo hiện đại.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A young Vietnamese warrior queen, female, long black hair in high bun, jade-green and gold ancient Vietnamese armor, holding a bronze sword, war-elephant motif behind her shoulder, determined expression."

### 3. vn_yet_kieu — Yết Kiêu (ASSASSIN, 1g) — NAM ⚠️ CHÂN DUNG CŨ ĐÃ SAI — ĐÃ VẼ LẠI 2026-11-21 theo hướng người dùng chọn: nam Việt 25 tuổi, nghề chài lưới, cởi trần, cơ bắp rám nắng, tóc búi, rìu + đục, lưới chài quàng vai (ảnh mới đã thay thế ảnh cũ sai)
- **Giới tính:** nam (tên thật Phạm Hữu Thế). Nguồn: https://vi.wikipedia.org/wiki/Y%E1%BA%BFt_Ki%C3%AAu — infobox ghi "Giới tính | nam".
- **Thật / huyền thoại:** người thật, tướng thủy quân nhà Trần (1242–1303), nổi tiếng **lặn giỏi, đục thủng thuyền giặc ban đêm** trong kháng chiến chống Nguyên-Mông.
- **Ngoại hình:** nam trung niên, thân hình rắn chắc, da rám nắng, tóc búi gọn; mắt sắc, thần thái lặng lẽ.
- **Trang phục:** áo vải tối màu / đồ lặn cổ (khố, áo chẽn, khăn trùm đầu), tông xanh ngọc đậm + tím đen (ASSASSIN); **không** mặc đồ lặn hiện đại.
- **Vũ khí / vật:** dao găm ngắn, đục khoan, dây thừng; bọt nước / sóng.
- **Skill SRS — Lặn Kích (damage, NEAREST):** lặn xuống nước rồi trồi lên đâm sau lưng địch; hiệu ứng xoáy nước + bọt khí + nhát dao lóe sáng.
- **KHÔNG ĐƯỢC VẼ:** nữ (lỗi đã xảy ra — xem mục Audit); đồ lặn scuba hiện đại (bình dưỡng khí, kính lặn cao su, ống thở nhựa); áo giáp nặng; kiếm dài.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A middle-aged Vietnamese male naval assassin, tanned muscular build, hair tied back, dark teal and purple-black cloth diving garb of the 13th century, holding a short dagger and a wooden drill, water swirls and bubbles around him."

### 4. vn_an_duong_vuong — An Dương Vương (ARCHER, 2g) — NAM
- **Giới tính:** nam (Thục Phán). Nguồn: https://en.wikipedia.org/wiki/Th%E1%BB%A5c_dynasty
- **Thật / huyền thoại:** vua thật / bán huyền thoại (257–179 TCN), xây thành Cổ Loa; truyền thuyết nỏ thần.
- **Ngoại hình:** vua trung niên / lớn tuổi, râu ngắn điểm bạc, gương mặt uy nghiêm, tóc búi đội mũ miện.
- **Trang phục:** long bào / giáp lễ xanh ngọc + vàng, mũ miện rồng vàng, ngọc xanh.
- **Vũ khí / vật:** **nỏ thần** — nỏ làm từ móng rùa vàng thần Kim Quy, một phát giết 300 quân; họa tiết rùa vàng + rồng.
- **Skill SRS — Nỏ Thần Liên Châu (aoe, HIGHEST_DPS_CLUSTER):** nỏ thần bắn liên châu nhiều tên sáng xanh ngọc; hiệu ứng chùm tên + mai rùa vàng lóe sáng.
- **KHÔNG ĐƯỢC VẼ:** nữ; nỏ máy hiện đại / súng; vương miện châu Âu; giáp La Mã.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. An elderly Vietnamese male king, short greying beard, golden dragon crown, jade-green and gold royal armor, holding an ornate ancient bronze crossbow with golden turtle-claw motifs, glowing jade arrows."

### 5. vn_chu_dong_tu — Chử Đồng Tử (MAGE, 1g) — NAM
- **Giới tính:** nam. Nguồn: https://en.wikipedia.org/wiki/Ch%E1%BB%AD_%C4%90%E1%BB%93ng_T%E1%BB%AD
- **Thật / huyền thoại:** huyền thoại, một trong Tứ Bất Tử; vốn là chàng trai chài nghèo, gặp tiên nữ Tiên Dung, được đạo sĩ Phật Quang cho **gậy và nón** thần.
- **Ngoại hình:** thanh niên trẻ, mặt hiền, tóc búi, thân hình mảnh khảnh; khí chất thoát tục.
- **Trang phục:** áo vải đơn sơ nhưng thêu sen vàng, tông xanh ngọc + vàng; không mặc giáp nặng.
- **Vũ khí / vật:** gậy tre đầu sen, nón lá thần; hoa sen, đầm nước.
- **Skill SRS — Đầm Sen Huyễn Thuật (aoe, HIGHEST_DPS_CLUSTER):** đầm sen ảo thuật nở ra, cánh sen + nước xoáy làm choáng địch; hiệu ứng sen hồng/trắng phát sáng trên mặt nước.
- **KHÔNG ĐƯỢC VẼ:** nữ; ông già râu dài; pháp sư phương Tây đội mũ chóp; đũa phép.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A young Vietnamese male immortal fisherman-mage, gentle face, hair in topknot with lotus pin, simple jade-green robe with gold lotus embroidery, holding a wooden staff topped with a blooming lotus, pink lotus flowers and water ripples around him."

### 6. vn_tran_hung_dao — Trần Hưng Đạo (STRATEGIST, 4g) — NAM
- **Giới tính:** nam (Trần Quốc Tuấn, 1228–1300). Nguồn: https://vi.wikipedia.org/wiki/Tr%E1%BA%A7n_B%E1%BA%A1ch_%C4%90%E1%BA%B1ng_(1288) (trận Bạch Đằng 1288)
- **Thật / huyền thoại:** người thật, đại tướng nhà Trần, 3 lần đánh bại quân Nguyên-Mông; nổi tiếng với **trận Bạch Đằng 1288 — bãi cọc gỗ** cắm dưới sông.
- **Ngoại hình:** nam trung niên / lớn tuổi, râu dài, gương mặt trầm tĩnh uy nghi, mắt sâu; tóc búi đội mũ quan.
- **Trang phục:** giáp tướng nhà Trần / áo gấm quan võ, tông xanh ngọc + vàng, mũ cánh chuồn hoặc mũ trụ.
- **Vũ khí / vật:** kiếm lệnh, quạt chỉ huy / cờ lệnh; cọc gỗ nhọn, sóng sông Bạch Đằng.
- **Skill SRS — Bãi Cọc Bạch Đằng (aoe, HIGHEST_DPS_CLUSTER):** cọc gỗ trồi lên từ mặt nước đâm địch; hiệu ứng sông xoáy + hàng cọc gỗ + ánh sáng ngọc.
- **KHÔNG ĐƯỢC VẼ:** nữ; giáp Nhật Bản / Trung Quốc đời Thanh; súng; trẻ tuổi.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A middle-aged Vietnamese male grand general, long beard, calm stern face, jade-green and gold Tran-dynasty general armor and mandarin hat, holding a command sword, wooden stakes rising from river waves behind him."

### 7. vn_son_tinh — Sơn Tinh (DIVINE, 5g) — NAM
- **Giới tính:** nam (thần núi Tản Viên). Nguồn: https://en.wikipedia.org/wiki/S%C6%A1n_Tinh_%E2%80%93_Th%E1%BB%A7y_Tinh
- **Thật / huyền thoại:** thần thoại, một trong Tứ Bất Tử; thần núi, cưới được Mỵ Nương nhờ lễ vật của núi rừng, hằng năm dâng núi chống lũ Thủy Tinh.
- **Ngoại hình:** nam thần trưởng thành, râu ngắn, gương mặt uy nghi nhân từ; hào quang vàng trắng.
- **Trang phục:** bạch bào / kim bào trắng + vàng (DIVINE), mũ miện hình núi, vai giáp đá.
- **Vũ khí / vật:** trượng núi — gậy đá / pha lê hình đỉnh núi, đá núi, cây thông.
- **Skill SRS — Núi Tản Viên (aoe, HIGHEST_DPS_CLUSTER):** núi đá mọc lên đè địch; hiệu ứng đỉnh núi vàng trắng + đá lở + hào quang.
- **KHÔNG ĐƯỢC VẼ:** nữ; thần núi phương Tây (toga Hy Lạp); râu trắng dài kiểu ông Bụt già.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A majestic Vietnamese male mountain god, short beard, radiant white and gold divine robes, mountain-peak crown, holding a stone staff topped with glowing crystals, misty mountains and golden light behind him."

---

## TRUNG QUỐC

### 8. cn_quan_vu — Quan Vũ (GUARDIAN, 3g) — NAM
- **Giới tính:** nam (mất 220). Nguồn: https://en.wikipedia.org/wiki/Guan_Gong
- **Thật / huyền thoại:** người thật, danh tướng cuối Đông Hán / Tam Quốc, sau được tôn làm Quan Công / Võ Thánh.
- **Ngoại hình:** cao lớn, **mặt đỏ, râu dài đen ("Mỹ Nhiêm Công" — râu đẹp)**, mắt phượng, mày tằm; đội mũ xanh.
- **Trang phục:** áo bào xanh lục + giáp đỏ, tông đỏ son + vàng (theo STYLE_GUIDE CN); mũ xanh lá có dải.
- **Vũ khí / vật:** **Thanh Long Yển Nguyệt Đao** (đao đầu rồng, chuôi dài), rồng xanh.
- **Skill SRS — Thanh Long Hộ Trận (shield, SELF_ADJACENT):** rồng xanh cuộn quanh tạo khiên; hiệu ứng long ảnh xanh lục + khiên vàng bảo vệ đồng minh kề bên.
- **KHÔNG ĐƯỢC VẼ:** nữ; mặt không đỏ; râu ngắn / không râu; kiếm thay đao; giáp Nhật Bản.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A tall Chinese male general, red-tinted face, very long black beard, phoenix eyes, green cap and crimson-gold armor, holding a long Green Dragon Crescent Blade with a dragon head, green dragon aura."

### 9. cn_lu_bo — Lữ Bố (WARRIOR, 4g) — NAM
- **Giới tính:** nam (mất 199). Nguồn: https://threekingdomsodyssey.com/en/persons/262
- **Thật / huyền thoại:** người thật, chiến tướng Tam Quốc, được xưng "chiến thần", "phi tướng".
- **Ngoại hình:** thanh niên/trung niên cực kỳ vạm vỡ, mặt dữ dằn, mắt sắc; tóc đuôi ngựa cao.
- **Trang phục:** giáp đỏ son + vàng, **mũ miện tử kim (vương miện vàng tím)**, áo gấm bách hoa, **ngựa Xích Thố** (họa tiết ngựa đỏ).
- **Vũ khí / vật:** **Phương Thiên Họa Kích** (kích dài lưỡi cong), Xích Thố.
- **Skill SRS — Vô Song Kích (aoe, HIGHEST_DPS_CLUSTER):** kích quét vòng tròn lửa đỏ; hiệu ứng lưỡi kích vàng đỏ xoay + sóng xung kích.
- **KHÔNG ĐƯỢC VẼ:** nữ; mặt hiền / thư sinh; kiếm; giáp xanh lá.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A fierce muscular Chinese male warrior, high ponytail, purple-gold crown, crimson and gold armor with dragon patterns, holding a long ornate halberd with curved blade, red warhorse motif, intense glare."

### 10. cn_kinh_kha — Kinh Kha (ASSASSIN, 1g) — NAM
- **Giới tính:** nam (mất 227 TCN). Nguồn: https://en.wikipedia.org/wiki/Jing_Ke
- **Thật / huyền thoại:** người thật, thích khách (youxia) thời Chiến Quốc; ám sát Tần vương Doanh Chính (Tần Thủy Hoàng) thất bại.
- **Ngoại hình:** nam trung niên, mặt lạnh, râu lởm chởm ngắn, tóc búi rối; thần thái liều chết, bi tráng.
- **Trang phục:** áo vải xám/tối màu du hiệp, khăn trùm đầu / mũ rơm, tông tím đen (ASSASSIN); không giáp nặng.
- **Vũ khí / vật:** **đoản kiếm tẩm độc giấu trong cuộn bản đồ Đốc Khang**, bản đồ da cuộn.
- **Skill SRS — Đoản Kiếm Dịch Thủy (damage, NEAREST):** rút đoản kiếm từ cuộn bản đồ đâm sau lưng; hiệu ứng nước sông Dịch (bi tráng) + vệt độc xanh tím.
- **KHÔNG ĐƯỢC VẼ:** nữ; ninja Nhật Bản (mặt nạ đen, phi tiêu shuriken); kiếm dài; đồ hiện đại.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A grim middle-aged Chinese male assassin, short stubbly beard, dark grey duelist robes with purple-black tones, holding a rolled leather map that conceals a short poisoned dagger, cold river mist behind him."

### 11. cn_hau_nghe — Hậu Nghệ (ARCHER, 1g) — NAM
- **Giới tính:** nam. Nguồn: https://en.wikipedia.org/wiki/Hou_Yi
- **Thật / huyền thoại:** thần thoại, xạ thủ vĩ đại; bắn rơi 9/10 mặt trời cứu nhân gian; chồng của Hằng Nga.
- **Ngoại hình:** nam trẻ/trung niên, thân hình săn chắc, mắt nhìn lên trời; tóc đuôi ngựa cao, mũ vàng hình mặt trời.
- **Trang phục:** áo đỏ son + vàng, họa tiết mặt trời, giáp vảy vàng.
- **Vũ khí / vật:** **cung đỏ + tên trắng** (theo truyền thuyết: cung đỏ, tên trắng); mặt trời / quạ ba chân.
- **Skill SRS — Xạ Nhật (aoe, HIGHEST_DPS_CLUSTER):** giương cung bắn mặt trời; hiệu ứng tên lửa sáng vàng + mặt trời rực cháy nổ tung.
- **KHÔNG ĐƯỢC VẼ:** nữ; cung hiện đại (compound bow); súng; mặt trời đen.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A strong Chinese male mythical archer, high ponytail, golden sun crown, crimson and gold armor with sun motifs, drawing a red wooden longbow aiming upward at a blazing sun, white arrows."

### 12. cn_nu_oa — Nữ Oa (MAGE, 3g) — NỮ
- **Giới tính:** nữ — nữ thần, mẹ của nhân loại. Nguồn: https://en.wikipedia.org/wiki/N%C3%BCwa
- **Thật / huyền thoại:** nữ thần sáng thế trong thần thoại Trung Quốc; nặn người từ đất vàng, **vá trời bằng đá ngũ sắc**, dùng chân rùa đội trời.
- **Ngoại hình:** nữ thần dịu dàng uy nghi; **nửa trên là người nữ, nửa dưới là đuôi rắn** (theo tranh mộ Hán) — trong chân dung bust: nữ, tóc búi cao với trâm ngọc, vảy rắn ánh ngũ sắc ở cổ/vai.
- **Trang phục:** bào trắng/ngũ sắc, ngọc bích, tông tím (MAGE) + ngũ sắc; không mặc giáp.
- **Vũ khí / vật:** **đá ngũ sắc** (5 viên đá màu bay quanh), **la bàn (compass)** — Nữ Oa cầm compa, Phục Hy cầm thước vuông trong tranh cổ.
- **Skill SRS — Ngũ Sắc Thạch (aoe, HIGHEST_DPS_CLUSTER):** đá ngũ sắc bay lên vá trời; hiệu ứng 5 luồng sáng đỏ-vàng-xanh-trắng-đen + đá quý lơ lửng.
- **KHÔNG ĐƯỢC VẼ:** nam; rắn Medusa phương Tây; nữ thần Hy Lạp mặc toga trắng; đuôi rắn quá rùng rợn.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A serene Chinese creator goddess, female, elegant face, high bun with jade pins, flowing white and five-color robes, faint serpent-scale shimmer at her shoulders, holding a brass compass, five glowing colored stones floating around her."

### 13. cn_khong_minh — Khổng Minh (STRATEGIST, 3g) — NAM
- **Giới tính:** nam (Gia Cát Lượng, tự Khổng Minh, 181–234). Nguồn: https://en.wikipedia.org/wiki/Chu-ko_Kung-ming
- **Thật / huyền thoại:** người thật, thừa tướng / quân sư nhà Thục Hán thời Tam Quốc; "ngọa long" — trí tuệ bậc nhất.
- **Ngoại hình:** cao ~1,84m, **mặt như ngọc, râu dài**, nho nhã; theo Tam Quốc Diễn Nghĩa: đầu đội **khăn luân cân (guanjin)**, mình mặc **áo lông hạc (hechang)**.
- **Trang phục:** đạo bào trắng/xanh nhạt, khăn luân cân, áo lông hạc; tông hổ phách (STRATEGIST) + trắng.
- **Vũ khí / vật:** **quạt lông hạc trắng** (vật bất ly thân — phe phẩy quạt chứ không phải vũ khí chém); xe lăn / xe ngựa (không cần vẽ).
- **Skill SRS — Bát Trận Đồ (aoe, HIGHEST_DPS_CLUSTER):** trận đồ bát quái xoay, đá + gió; hiệu ứng vòng bát quái + quạt lông trắng tỏa sáng.
- **KHÔNG ĐƯỢC VẼ:** nữ; kiếm/đao; giáp nặng; mũ quan nhà Thanh; mặt dữ.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A tall elegant Chinese male strategist, jade-like face, long beard, silk headscarf and white crane-feather robe, holding a white crane-feather fan, calm wise expression, faint eight-trigram diagram glowing behind him."

### 14. cn_ton_ngo_khong — Tôn Ngộ Không (DIVINE, 5g) — NAM
- **Giới tính:** nam — khỉ đực thành tinh. Nguồn: https://wiki-gateway.eudic.net/wikipedia_en/Sun_Wukong.html ; https://journeytothewestresearch.com/tag/ruyi/
- **Thật / huyền thoại:** nhân vật thần thoại / tiểu thuyết, sinh ra từ đá trên Hoa Quả Sơn, nhân vật chính *Tây Du Ký* (1592); 72 phép biến hóa, cân đẩu vân.
- **Ngoại hình:** **khỉ đực mặt khỉ**, lông vàng/nâu, mắt lửa vàng (hỏa nhãn kim tinh), răng nanh nhỏ; đội **vòng kim cô** vàng trên đầu; dáng nhanh nhẹn, tinh nghịch.
- **Trang phục:** giáp vàng (khóa tử kim giáp) / áo hổ da, khăn đỏ; tông vàng rực (DIVINE).
- **Vũ khí / vật:** **Gậy Như Ý Kim Cô Bổng** (gậy vàng co giãn), vòng kim cô, mây ngũ sắc.
- **Skill SRS — 72 Phép Biến Hóa (aoe, HIGHEST_DPS_CLUSTER):** biến hóa 72 hình — lông khỉ hóa phân thân; hiệu ứng nhiều bóng khỉ vàng + gậy xoay + mây.
- **KHÔNG ĐƯỢC VẼ:** nữ; khỉ cái; người thường không có đặc điểm khỉ (mất mặt khỉ, đuôi, lông); gậy gỗ thường; mũ phật.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A mischievous Chinese male Monkey King, simian face with golden fur, fiery golden eyes, golden headband circlet, red sash and golden armor, holding a golden extending staff, golden clouds and monkey-hair clones swirling around him."

---

## NHẬT BẢN

### 15. jp_honda — Honda Tadakatsu (GUARDIAN, 2g) — NAM
- **Giới tính:** nam (1548–1610). Nguồn: https://en.wikipedia.org/wiki/Honda_Tadakatsu
- **Thật / huyền thoại:** người thật, samurai / daimyo thời Sengoku–đầu Edo, một trong Tứ Thiên Vương của Tokugawa Ieyasu; đánh 57 trận không bị thương.
- **Ngoại hình:** nam trung niên vạm vỡ, mặt nghiêm, râu ngắn; nổi tiếng với **mũ sừng hươu**.
- **Trang phục:** **giáp đen (Kuro Ito Odoshi Dou Maru Gusoku)** + **mũ kabuto đen gắn sừng hươu lớn**, chuỗi hạt tràng hạt Phật giáo trắng đeo chéo ngực.
- **Vũ khí / vật:** **thương Tonbokiri ("Dragonfly Cutter" — chuồn chuồn đậu lên lưỡi cũng đứt đôi)**, một trong Tam Đại Thương Nhật Bản.
- **Skill SRS — Thương Tonbokiri (shield, SELF_ADJACENT):** thương dựng khiên — chuồn chuồn bay quanh lưỡi thương; hiệu ứng khiên đen + chuồn chuồn vàng.
- **KHÔNG ĐƯỢC VẼ:** nữ; giáp đỏ / giáp sáng màu; katana thay thương; mũ không có sừng hươu; ninja.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A powerful Japanese male samurai general, black lacquered armor, black kabuto helmet with large deer antlers, white Buddhist rosary beads across his chest, holding the legendary Tonbogiri spear, dragonflies circling the blade."

### 16. jp_musashi — Miyamoto Musashi (WARRIOR, 3g) — NAM
- **Giới tính:** nam (c.1584–1645). Nguồn: https://en.wikipedia.org/wiki/Miyamoto_Musashi
- **Thật / huyền thoại:** người thật, kiếm sĩ / lãng nhân, bất bại 62 trận đấu tay đôi, sáng lập **Niten Ichi-ryū (Nhị Thiên Nhất Lưu — song kiếm)**, tác giả *Ngũ Luân Thư*.
- **Ngoại hình:** nam trung niên, tóc rối / búi không cạo đỉnh (theo truyền thuyết: không bao giờ cắt tóc, không tắm), mặt góc cạnh, râu lởm chởm; tự họa của ông cho thấy mặt gầy, mắt sâu.
- **Trang phục:** **kimono đơn giản (không giáp)** — áo vải thô, dây thắt lưng; tông đỏ (WARRIOR) + nâu; đi chân đất / dép cỏ.
- **Vũ khí / vật:** **song kiếm — katana dài + wakizashi ngắn, mỗi tay một thanh**; kiếm gỗ bokken (trận Ganryūjima dùng kiếm gỗ chém từ mái chèo).
- **Skill SRS — Nhị Thiên Nhất Lưu (damage, NEAREST):** song kiếm chém chữ thập; hiệu ứng hai vệt sáng kiếm giao nhau.
- **KHÔNG ĐƯỢC VẼ:** nữ (lưu ý: game Fate/Grand Order có phiên bản Musashi nữ — đó là hư cấu, KHÔNG dùng); giáp samurai nặng; một kiếm; kiếm châu Âu.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A rugged Japanese male ronin swordsman, unkempt tied hair, weathered face with stubble, simple worn kimono with no armor, dual-wielding a long katana in one hand and a short wakizashi in the other, calm deadly gaze."

### 17. jp_hanzo — Hattori Hanzo (ASSASSIN, 2g) — NAM
- **Giới tính:** nam (Hattori Masanari, 1542–1596). Nguồn: https://samuraimuseum.de/en/learn/hattori-hanzo/
- **Thật / huyền thoại:** người thật, samurai phục vụ Tokugawa Ieyasu, gốc Iga; nổi tiếng với **Iga-goe 1582** — đưa Ieyasu vượt núi Iga thoát nạn sau biến Honnō-ji. Biệt danh "Oni no Hanzō" (Quỷ Hanzō) vì dũng mãnh chiến đấu bằng **thương**, không phải vì nhẫn thuật huyền bí. Hình ảnh "ninja huyền thoại" phần lớn là hư cấu hậu thế.
- **Ngoại hình:** nam trung niên, mặt lạnh, râu ngắn; dáng nhanh nhẹn, kín đáo.
- **Trang phục:** samurai thời Sengoku — giáp nhẹ / áo chẽn tối màu, khăn trùm đầu, tông tím đen (ASSASSIN) + chàm; **không** mặc đồ ninja đen bó sát kiểu Hollywood (đó là hư cấu hiện đại — nhưng trong game có thể pha chút phong cách shinobi: khăn che nửa mặt, áo tối màu; phải giữ dáng samurai, không biến thành ninja phim).
- **Vũ khí / vật:** **thương (yari)** — vũ khí chính lịch sử; dao găm, phi tiêu làm phụ.
- **Skill SRS — Ám Sát Trong Bóng (damage, NEAREST):** biến mất trong bóng rồi đâm sau lưng; hiệu ứng khói đen + bóng trăng + vệt thương lóe sáng.
- **KHÔNG ĐƯỢC VẼ:** nữ; kiếm rèn (Kill Bill — hư cấu); ninja mặc đồ đen bó toàn thân kiểu phim Mỹ; mặt nạ sắt.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A lean Japanese male samurai of Iga, middle-aged, stern face, dark indigo and purple-black Sengoku garb with headcloth, holding a short spear, half his face in shadow, faint smoke and moonlight behind him."

### 18. jp_nobunaga — Oda Nobunaga (ARCHER, 3g) — NAM
- **Giới tính:** nam (1534–1582). Nguồn: https://manga-portal.com/en/read/2026-11-02-nobunaga-45bd/ (dẫn Shinchō Kōki) ; https://vectree.io/pdf/c/oda-nobunaga
- **Thật / huyền thoại:** người thật, daimyo thời Sengoku, người thống nhất Nhật Bản (dở dang); biệt danh "Ma Vương Đệ Lục Thiên" (Demon King of the Sixth Heaven), "Đại Ngốc xứ Owari" thời trẻ.
- **Ngoại hình:** theo giáo sĩ Luís Fróis (người từng gặp): **cao, gầy, râu mép mỏng, giọng cao trong**; thời trẻ tóc búi "chổi trà" buộc dây xanh nhạt, mặc áo choàng tắm cộc tay, quần da hổ/báo (theo Shinchō Kōki — hình ảnh "kẻ ngốc" nổi tiếng); tuổi trung niên: nghiêm nghị, oai phong.
- **Trang phục:** giáp **tōsei-gusoku** (giáp hiện đại chống đạn) tím-đen, áo choàng đen có gia huy Oda; tông chàm + trắng (theo STYLE_GUIDE JP).
- **Vũ khí / vật:** **súng hỏa mai tanegashima** (ông là người đầu tiên dùng súng quy mô lớn — Nagashino 1575, bắn 3 loạt luân phiên "tam đoạn thiết pháo"); kiếm Heshikiri Hasebe.
- **Skill SRS — Tam Đoạn Thiết Pháo (aoe, HIGHEST_DPS_CLUSTER):** 3 loạt súng luân phiên; hiệu ứng 3 hàng nòng súng + lửa + khói thuốc súng.
- **KHÔNG ĐƯỢC VẼ:** nữ (lưu ý: game Fate/Grand Order có Nobunaga nữ — hư cấu, KHÔNG dùng); cung tên (class ARCHER ở đây dùng súng hỏa mai, không phải cung); giáp đỏ chói.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A tall lean Japanese male warlord, thin moustache, sharp eyes, purple-black bulletproof samurai armor with black cape bearing the Oda crest, holding a long matchlock arquebus, gunpowder smoke and fire behind him."

### 19. jp_seimei — Abe no Seimei (MAGE, 3g) — NAM
- **Giới tính:** nam (921–1005). Nguồn: https://wiki-gateway.eudic.net/wikipedia_en/Abe_no_Seimei.html
- **Thật / huyền thoại:** người thật, **onmyōji** (âm dương sư) nổi tiếng nhất thời Heian, quan triều đình, chuyên chiêm tinh, trừ tà, địa lý phong thủy; truyền thuyết: mẹ là hồ ly trắng Kuzunoha nên ông "không hoàn toàn là người".
- **Ngoại hình:** nam thanh niên/trung niên tuấn tú (truyền thuyết và tranh Kikuchi Yōsai vẽ ông mặt thanh tú, mắt hơi giống hồ ly); tóc đen dài búi.
- **Trang phục:** **kariginu trắng** (áo săn triều đình) + **mũ eboshi đen cao**, tông tím (MAGE) + trắng; tay cầm quạt xếp / bùa ofuda.
- **Vũ khí / vật:** **ngôi sao 5 cánh Seiman (Seimei Kikyō)** — ấn riêng của ông, biểu tượng ngũ hành; bùa giấy ofuda; bóng hồ ly trắng thoắt ẩn.
- **Skill SRS — Ngũ Mang Tinh (aoe, HIGHEST_DPS_CLUSTER):** sao 5 cánh phát sáng giáng xuống; hiệu ứng ngũ mang tinh tím-trắng + bùa bay.
- **KHÔNG ĐƯỢC VẼ:** nữ; pháp sư phương Tây (mũ chóp, áo choàng sao); kiếm; ngôi sao 6 cánh / biểu tượng tôn giáo khác.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A handsome young Japanese male onmyoji court diviner, refined face with faint fox-like eyes, white kariginu robe and tall black eboshi hat, holding a folding fan and paper ofuda talisman, glowing five-pointed Seiman star behind him, faint white fox shadow at his side."

### 20. jp_shingen — Takeda Shingen (STRATEGIST, 2g) — NAM
- **Giới tính:** nam (1521–1573). Nguồn: https://en.wikipedia.org/wiki/F%C5%ABrinkazan ; https://japanworld.info/takeda-shingen/
- **Thật / huyền thoại:** người thật, daimyo xứ Kai thời Sengoku, "Hổ xứ Kai"; đối thủ truyền kiếp của Uesugi Kenshin (Kawanakajima).
- **Ngoại hình:** nam trung niên, mặt vuông, râu quai nón / râu ngắn, lông mày vẽ cao (theo chân dung Kōzan-ji), mắt nheo; từ 1559 cạo đầu, mặc áo tu (lấy pháp danh).
- **Trang phục:** áo tu / giáp đỏ thẫm, **tay cầm quạt chiến sắt (tessen/gumbai)** — vật bất ly thân trong mọi chân dung.
- **Vũ khí / vật:** **quạt chiến sắt** + **cờ Phong Lâm Hỏa Sơn** (風林火山 — "nhanh như gió, lặng như rừng, xâm lược như lửa, bất động như núi", trích Tôn Tử).
- **Skill SRS — Phong Lâm Hỏa Sơn (aoe, HIGHEST_DPS_CLUSTER):** 4 nguyên tố gió-rừng-lửa-núi; hiệu ứng quạt sắt phất ra gió + lửa + núi đá.
- **KHÔNG ĐƯỢC VẼ:** nữ; kiếm; giáp xanh lá; cờ chữ khác.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A stern middle-aged Japanese male daimyo, shaved head, heavy jaw, dark red armor and monk robe, holding an iron war fan, vertical war banner with the four characters Wind Forest Fire Mountain behind him, wind and embers swirling."

### 21. jp_susanoo — Susanoo (DIVINE, 5g) — NAM
- **Giới tính:** nam — nam thần (kami). Nguồn: https://en.wikipedia.org/wiki/Susanoo-no-Mikoto ; https://www.worldhistory.org/Susanoo/
- **Thật / huyền thoại:** thần trong thần thoại Nhật (Kojiki c.712, Nihon Shoki 720); em trai nữ thần mặt trời Amaterasu; thần biển, bão tố, đồng ruộng; giết **rắn 8 đầu Yamata no Orochi**, lấy được **kiếm Kusanagi** trong đuôi rắn.
- **Ngoại hình:** nam thần hoang dại, tóc đen dài rối bay trong gió bão, mắt sắc, cơ bắp; hào quang bão tố xanh trắng.
- **Trang phục:** giáp thần trắng/xanh bão + vàng (DIVINE), vải bay; không mặc giáp samurai thường.
- **Vũ khí / vật:** **kiếm Kusanagi (Thảo Thế Kiếm)** + kiếm Totsuka; rắn 8 đầu, sấm sét, sóng biển.
- **Skill SRS — Bão Tố Thảo Thế Kiếm (aoe, HIGHEST_DPS_CLUSTER):** bão + kiếm Kusanagi chém; hiệu ứng lốc xoáy, sấm sét, 8 đầu rắn mờ phía sau.
- **KHÔNG ĐƯỢC VẼ:** nữ; thần Hy Lạp (Zeus cầm tia sét mặc toga); râu trắng dài kiểu thần già; kiếm katana thường.
- **Prompt seed:** "Stylized 2.5D game portrait, bust, 3/4 front, dark-teal background, no text. A wild Japanese male storm god, long black windblown hair, fierce eyes, white and storm-blue divine armor with gold trim, holding the sacred Kusanagi sword, lightning and sea waves swirling around him, faint eight-headed serpent shadow behind."

---

## Audit chân dung đã vẽ (8/21, trong `ohmygame_assets/`)

Đã xem trực tiếp cả 8 file PNG. Kết quả:

| File | Kích thước | Kết luận |
|---|---|---|
| `vn_thanh_giong_portrait.png` | 1600x1600 | ✅ ĐÚNG — nam trẻ, gậy tre + khiên tre đan, giáp xanh ngọc + vàng. Lưu ý nhỏ: vương miện trông hơi giống vua, nhưng chấp nhận được (phong cách hóa). |
| `vn_yet_kieu_portrait.png` | 1600x1600 | ❌ **SAI — PHẢI THAY** — vẽ thành **nữ** (mặt nữ, tóc dài, nét mềm) trong khi Yết Kiêu là **nam**; thêm lỗi thời đại: đồ lặn kiểu scuba hiện đại (ống thở, đồng hồ đo, dây đai nhựa) — thế kỷ 13 không có. **Không dùng làm art cuối.** |
| `vn_an_duong_vuong_portrait.png` | 1600x1600 | ✅ ĐÚNG giới tính — vua nam lớn tuổi, râu bạc, mũ miện rồng. Lưu ý nhỏ: nỏ thần vẽ hơi giống súng máy hiện đại (cơ cấu kim loại + nhiều nòng); nếu vẽ lại skill icon thì dùng nỏ cổ bằng đồng/gỗ. |
| `vn_chu_dong_tu_portrait.png` | 1600x1600 | ✅ ĐÚNG — nam trẻ, gậy sen, đầm sen, áo xanh ngọc thêu sen vàng. |
| `vn_son_tinh_portrait.png` | 1600x1600 | ✅ ĐÚNG — nam thần râu ngắn, bạch bào + vàng, trượng núi pha lê, núi mờ phía sau. |
| `cn_quan_vu_portrait.png` | 1120x2240 | ✅ ĐÚNG — nam, mặt đỏ, râu đen rất dài, Thanh Long Yển Nguyệt Đao, mũ xanh, giáp đỏ + vàng. Khớp truyền thuyết nhất trong 8 ảnh. Lưu ý: ảnh dọc 1120x2240, không vuông 1600x1600 như nhóm VN — cần chuẩn hóa khi sync. |
| `cn_lu_bo_portrait.png` | 1280x1920 | ✅ ĐÚNG — nam, mặt dữ, đuôi ngựa cao, giáp đỏ + vàng, Phương Thiên Họa Kích. Lưu ý: ảnh dọc 1280x1920, không vuông — cần chuẩn hóa khi sync. |
| `cn_hau_nghe_portrait.png` | 1120x2240 | ✅ ĐÚNG — nam, giương cung ngắm mặt trời, áo đỏ + vàng họa tiết mặt trời. Lưu ý: ảnh dọc 1120x2240, không vuông — cần chuẩn hóa khi sync. |

**Kết luận audit: chỉ 1/8 sai nội dung (Yết Kiêu). 7/8 còn lại đúng giới tính và ngoại hình chính. 3 ảnh CN sai định dạng (dọc thay vì vuông 1600x1600) — lỗi kỹ thuật, không phải lỗi nội dung.**

Chân dung chưa vẽ (13/21): Hai Bà Trưng, Trần Hưng Đạo, Kinh Kha (3 ảnh từng bị chặn bởi kiểm duyệt công cụ — xem Rules), Nữ Oa, Khổng Minh, Tôn Ngộ Không, Honda Tadakatsu, Miyamoto Musashi, Hattori Hanzo, Oda Nobunaga, Abe no Seimei, Takeda Shingen, Susanoo.

---

## Rules for future batches (Quy tắc bắt buộc cho mọi batch vẽ sau này)

1. **Đọc file này + `STYLE_GUIDE.md` trước khi vẽ.** Không vẽ từ trí nhớ, không đoán giới tính.
2. **Luôn ghi rõ giới tính trong prompt.** Mở đầu prompt bằng "male" / "female" + độ tuổi. Với tướng nam: "male warrior/general…"; với tướng nữ: "female queen/goddess…". Với Tôn Ngộ Không: "male monkey"; Susanoo: "male god"; Nữ Oa: "female goddess".
3. **Người thật thì không đổi giới tính.** Tuyệt đối không vẽ phiên bản nữ của một tướng nam có thật (và ngược lại) — kể cả khi một game/anime nổi tiếng có phiên bản giới tính khác (ví dụ: Musashi nữ và Nobunaga nữ trong Fate/Grand Order là hư cấu, KHÔNG được dùng làm tham chiếu).
4. **Không đồ hiện đại, không sai thời đại.** Không súng hiện đại, không đồ scuba, không áo giáp châu Âu, không mũ chóp phương Tây. Vũ khí và trang phục phải đúng thời đại + văn hóa của tướng (VN cổ / Tam Quốc / Sengoku / Heian).
5. **Dùng đúng vũ khí đặc trưng trong bảng.** Vũ khí là "căn cước" của tướng — sai vũ khí là sai tướng (vd: Quan Vũ phải có đao Thanh Long, không phải kiếm; Musashi phải song kiếm; Honda phải có thương Tonbokiri + mũ sừng hươu).
6. **Định dạng thống nhất:** chân dung vuông **1600x1600 PNG**, nền dark-teal trơn, không chữ — như nhóm VN. Ảnh dọc phải cắt/chuẩn hóa trước khi sync vào `assets/`.
7. **Chân dung bị chặn (Hai Bà Trưng, Trần Hưng Đạo, Kinh Kha):** các lần thử trước bị công cụ chặn (`integrity_check_failed`) — KHÔNG thử lại bằng cách diễn đạt lại cùng một yêu cầu. Chỉ vẽ lại khi người dùng chọn hướng sáng tạo khác an toàn hơn (vd: đổi phong cách/token/silhouette) hoặc đổi công cụ.
8. **Sau mỗi batch: đối chiếu ảnh với file này** (giới tính, vũ khí, thời đại) và ghi kết quả vào `canvas/ASSET_LIST.md` trước khi sync. Ảnh nào sai giới tính thì đánh dấu ❌ và không được sync vào `assets/`.
9. **Skill icon:** dùng skill trong file này (cột Skill SRS) làm chủ đề icon — icon phải thể hiện được skill, không vẽ chân dung thu nhỏ.
10. **Không dùng ảnh người thật đang sống làm tham chiếu.** Không tướng M1 nào là người đang sống; mọi chân dung đều là minh họa phong cách hóa (stylized), không sao chép tranh/chân dung có bản quyền cụ thể nào.

---
*File nghiên cứu cho M1 — Đấu Trường Nhân Quả / HeroWorld. Lập 2026-11-21. Cập nhật khi có tướng mới (M3: FR/US/AZ/UK) hoặc khi người dùng đổi thiết kế.*
