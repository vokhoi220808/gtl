# PDF Fusion Smart Pro - Advanced Suite v6 Upgrade Report

## Phạm vi nâng cấp

Gói này nâng cấp theo yêu cầu:

- PDF Preview Editor
  - Xem trước từng trang PDF bằng PDF.js.
  - Kéo thả đổi thứ tự thumbnail bằng SortableJS.
  - Xóa/khôi phục trang bất kỳ.
  - Xoay trái/xoay phải từng trang.
  - Chọn/bỏ chọn trang rồi xuất PDF mới bằng PDF-lib.

- Web Worker
  - Thêm `assets/pfsp-worker.js` để chạy tác vụ nặng tách khỏi UI.
  - Hỗ trợ worker task: merge, split, safe compress, watermark batch.
  - OCR trong app vẫn dựa trên worker của Tesseract.js.

- Batch ZIP Export
  - Dùng JSZip CDN để gom nhiều kết quả thành một file ZIP.
  - Nén nhiều PDF rồi tải ZIP.
  - Watermark nhiều PDF rồi tải ZIP.
  - Tách PDF thành từng trang rồi tải ZIP.
  - Merge PDF bằng worker rồi tải PDF.

- Privacy Center
  - Thêm `privacy-center.html`.
  - Hiển thị cam kết xử lý trên trình duyệt.
  - Hiển thị analytics cục bộ: click, lỗi, thiết bị.
  - Có nút xuất/xóa analytics, xóa cấu hình local và xóa cache PWA.

- Analytics local
  - Thêm `assets/pfsp-local-analytics-i18n.js`.
  - Ghi nhận tool click, lỗi, thiết bị mobile/tablet/desktop.
  - Chỉ lưu trong localStorage, không gửi server.

- Tiếng Việt / English
  - Thêm nút đổi ngôn ngữ trên app.
  - Thêm trang landing tiếng Anh `en.html`.
  - Cập nhật hreflang/canonical cho trang Privacy Center và English landing.

## File mới

- `assets/pfsp-advanced-suite.css`
- `assets/pfsp-local-analytics-i18n.js`
- `assets/pfsp-advanced-suite.js`
- `assets/pfsp-worker.js`
- `privacy-center.html`
- `en.html`
- `_pre-advanced-suite-backup/`
- `UPGRADE_ADVANCED_SUITE_REPORT.md`

## File đã cập nhật

- `index.html`
- `manifest.json`
- `sw.js`
- `sitemap.xml`
- `robots.txt`
- `README.md`

## Nguyên tắc giữ file

Không xóa file gốc. Các file quan trọng trước khi sửa đã được copy vào `_pre-advanced-suite-backup/`.

## Cách test nhanh

```bash
python -m http.server 5500
```

Mở:

```txt
http://localhost:5500
```

Test các tab mới:

- `Preview Editor`
- `Worker + ZIP`
- `privacy-center.html`
- `en.html`
