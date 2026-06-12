# Báo cáo nâng cấp UI/UX + SEO + Compress PDF

Phiên bản nâng cấp: `5.0.0-ui-seo-compress`
Ngày thực hiện: 2026-06-12

## Nguyên tắc thực hiện

- Không xóa file dự án gốc.
- Tạo thư mục `_pre-ui-seo-compress-backup/` để giữ bản sao các file chính trước khi nâng cấp đợt này.
- Ưu tiên thêm lớp nâng cấp qua asset mới để giảm rủi ro phá vỡ logic cũ.

## File mới được thêm

- `assets/pfsp-pro-ui.css`: lớp giao diện Pro Refresh mới.
- `assets/pfsp-compress-seo.js`: thêm tab Compress PDF, hero mới, trust cards, command bar và runtime SEO helpers.
- `compress-pdf.html`: landing page SEO cho công cụ nén PDF.
- `merge-pdf.html`: landing page SEO cho công cụ gộp PDF.
- `split-pdf.html`: landing page SEO cho công cụ tách PDF.
- `watermark-pdf.html`: landing page SEO cho watermark PDF.
- `sign-pdf.html`: landing page SEO cho ký PDF.
- `ocr-pdf.html`: landing page SEO cho OCR PDF.
- `_pre-ui-seo-compress-backup/`: bản sao dự phòng trước khi sửa.

## File được cập nhật

- `index.html`
  - Thêm meta SEO, Open Graph, Twitter Card, canonical, hreflang.
  - Thêm JSON-LD `SoftwareApplication` và `FAQPage`.
  - Nạp CSS giao diện mới và JS Compress/SEO.
- `manifest.json`
  - Cập nhật mô tả có Compress PDF.
  - Thêm shortcut PWA cho Nén PDF, Gộp PDF, Tách PDF.
- `sw.js`
  - Tăng version cache lên `5.0.0-ui-seo-compress`.
  - Cache thêm CSS/JS mới và các landing page SEO.
- `sitemap.xml`
  - Thêm các landing page SEO mới.
- `robots.txt`
  - Cho phép index các landing page mới.

## Compress PDF mới

Có 2 chế độ:

1. **Nén an toàn: tối ưu cấu trúc**
   - Dùng `pdf-lib` copy trang sang tài liệu mới.
   - Lưu bằng object streams.
   - Giữ nội dung vector/text tốt hơn, nhưng mức giảm dung lượng phụ thuộc PDF gốc.

2. **Nén mạnh: chuyển trang thành ảnh JPEG**
   - Dùng `PDF.js` render trang sang canvas.
   - Nhúng lại từng trang dưới dạng JPEG.
   - Có preset Low / Medium / High / Custom.
   - Thường hiệu quả với PDF scan, nhưng sẽ mất khả năng chọn/copy text.

## Ghi chú kiểm thử

- Đã kiểm tra cú pháp JS của `assets/pfsp-compress-seo.js` bằng Node.
- Cần test thực tế trong trình duyệt với PDF nhỏ và PDF scan để đánh giá tỉ lệ nén.
- PWA/service worker chỉ hoạt động đầy đủ trên HTTPS hoặc localhost.
