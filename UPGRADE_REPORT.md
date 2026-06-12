# Báo cáo nâng cấp PDF Fusion Smart Pro

## Nguyên tắc thực hiện

- Không xóa bất kỳ file gốc nào trong thư mục root.
- Thêm bản sao file gốc vào `_original-backup/` để đối chiếu khi cần.
- Sửa các tham chiếu PWA bị lệch tên file.
- Thêm file mới phục vụ deploy, offline, xác minh QR và trải nghiệm người dùng.

## Lỗi đã xử lý

1. `index.html` đăng ký service worker sai tên: `pdf-fusion-sw.js`.
   - Đã đổi sang `sw.js`.
   - Vẫn thêm `pdf-fusion-sw.js` dạng alias để tương thích đường dẫn cũ.

2. `manifest.json` trỏ `start_url` tới file không tồn tại.
   - Đã đổi sang `./index.html`.
   - Đã thêm `id`, `shortcuts`, icon 512, favicon và thông tin PWA.

3. `sw.js` cache các file không tồn tại.
   - Đã cập nhật danh sách app shell đúng với project hiện tại.
   - Đã thêm fallback offline và chiến lược cache an toàn hơn.

4. QR verify trỏ tới `verify.html` nhưng project chưa có trang này.
   - Đã thêm `verify.html`.

## File mới đã thêm

- `assets/pfsp-upgrade.css`
- `assets/pfsp-enhancements.js`
- `offline.html`
- `verify.html`
- `404.html`
- `favicon.svg`
- `icon-512.svg`
- `pdf-fusion-sw.js`
- `pdf-fusion-manifest.json`
- `site.webmanifest`
- `pdf-fusion-smart-pro-universal-pro-suite-plus.html`
- `DEPLOY.md`
- `UPGRADE_REPORT.md`
- `LICENSE`
- `package.json`
- `.editorconfig`
- `.gitignore`
- `.nojekyll`
- `_headers`
- `_redirects`
- `netlify.toml`
- `vercel.json`
- `_original-backup/`

## Nâng cấp giao diện/chức năng phụ

- Thêm badge phiên bản, trạng thái online/offline, trạng thái PWA.
- Thêm panel “Công cụ nâng cấp” trong tab Tools.
- Thêm xuất/nhập cấu hình project dạng JSON.
- Thêm kiểm tra PWA nhanh.
- Thêm làm mới cache PDF Fusion.
- Thêm copy log.
- Thêm bảng phím tắt.
- Thêm cải thiện responsive/mobile, focus-visible, print và reduced-motion.

## Ghi chú quan trọng

App vẫn xử lý file PDF trong trình duyệt. Các thư viện CDN cần được tải ít nhất một lần khi có mạng để service worker có thể cache dùng offline.
