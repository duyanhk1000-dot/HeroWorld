# ASSET_M3_FR — Trạng thái asset Pháp (FR) M3

Ngày: 2026-11-21. Nguồn: `canvas/HEROES_RESEARCH_M3.md` (phần FR, mục 1–7) + `canvas/STYLE_GUIDE.md`.
Palette FR: xanh hoàng gia + vàng. Chân dung: bust 3/4, nền xanh teal đậm trơn, không chữ, PNG 1600x1600.
Icon skill: tròn phẳng, viền vàng mỏng, không chữ, PNG 1600x1600. Tất cả file trong `ohmygame_assets/`.

## Chân dung — 7/7 DONE

| unit_id | Tướng | File | Kích thước | Trạng thái |
|---|---|---|---|---|
| fr_joan | Joan of Arc (NỮ) | fr_joan_portrait.png | 1600x1600 | done — đã kiểm tra bằng mắt: nữ, tóc bob ngắn, giáp xanh hoàng gia + vàng, cờ thánh trắng hoa lily vàng, hào quang vàng, không chữ |
| fr_martel | Charles Martel (NAM) | fr_martel_portrait.png | 1600x1600 | done |
| fr_lupin | Arsène Lupin (NAM) | fr_lupin_portrait.png | 1600x1600 | done |
| fr_dartagnan | D'Artagnan (NAM) | fr_dartagnan_portrait.png | 1600x1600 | done |
| fr_nostradamus | Nostradamus (NAM) | fr_nostradamus_portrait.png | 1600x1600 | done |
| fr_napoleon | Napoleon Bonaparte (NAM) | fr_napoleon_portrait.png | 1600x1600 | done |
| fr_gevaudan | Quái vật Gévaudan (SINH VẬT, không giới tính người) | fr_gevaudan_portrait.png | 1600x1600 | done — đã kiểm tra bằng mắt: quái thú lông hung đỏ, sọc đen dọc lưng, đuôi dài có chùm lông, hàm răng nanh, tai nhọn, vuốt lớn, mắt phát sáng, KHÔNG mặt người. Lưu ý: nền là rừng núi mờ (theo prompt seed) thay vì nền trơn hoàn toàn, tông teal vẫn khớp. |

## Icon skill — 7/7 DONE

| unit_id | Skill | File | Kích thước | Trạng thái |
|---|---|---|---|---|
| fr_joan | Cờ Thánh Hộ Mệnh | fr_joan_skill.png | 1600x1600 | done |
| fr_martel | Búa Martel | fr_martel_skill.png | 1600x1600 | done |
| fr_lupin | Đánh Cắp Nhịp Đòn | fr_lupin_skill.png | 1600x1600 | done |
| fr_dartagnan | Ngự Lâm Pháo Thủ | fr_dartagnan_skill.png | 1600x1600 | done |
| fr_nostradamus | Tiên Tri Sao Băng | fr_nostradamus_skill.png | 1600x1600 | done |
| fr_napoleon | Đại Pháo Austerlitz | fr_napoleon_skill.png | 1600x1600 | done |
| fr_gevaudan | Cuồng Săn | fr_gevaudan_skill.png | 1600x1600 | done |

Ghi chú kỹ thuật: công cụ icon trả về .webp cho cả 7 icon; tất cả đã convert sang PNG 1600x1600 và file .webp đã xóa.
Công cụ tạo ảnh tự sinh thêm file JSON metadata `media-generation-fr-*.json` trong `ohmygame_assets/` (14 file) — không phải asset game, để nguyên.

## Chưa vẽ được

Không có — 0 ảnh bị từ chối. Tổng: 7/7 chân dung + 7/7 icon skill = 14/14.
