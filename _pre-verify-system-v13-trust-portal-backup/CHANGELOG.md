# Changelog

## 12.0.0-verify-big-update - 2026-06-13

- BIG UPDATE Verify System lên registry schema v4.
- Thêm trust score, trust checks và timeline cho verify page.
- Thêm batch verify, hash lookup, certificate export public.
- Thêm admin bulk register, dry-run, suspend/activate, metadata editor, repair/re-sign, self-test diagnostics.
- Nâng cấp bridge auto-register trong app với local queue retry.
- Thiết kế lại verify page/admin console/CSS.
- Giữ nguyên backup cũ và tạo `_pre-verify-system-v12-big-update-backup/`.

# Changelog

## 4.1.0-upgraded

- Fix PWA/service worker/manifest sai tên file.
- Add offline fallback page.
- Add QR verification landing page.
- Add deploy config for Netlify, Vercel and GitHub Pages.
- Add favicon and 512px SVG icon.
- Add project config import/export tools.
- Add cache refresh, PWA check, copy log and keyboard shortcuts.
- Add responsive/accessibility polish.
- Keep legacy alias files for backward compatibility.

## 5.0.0-ui-seo-compress - 2026-06-12

### Added
- Giao diện Pro Refresh qua `assets/pfsp-pro-ui.css`.
- Tab **Compress PDF** với 2 chế độ: tối ưu cấu trúc và raster JPEG.
- Landing pages SEO cho Compress, Merge, Split, Watermark, Sign, OCR.
- JSON-LD SoftwareApplication + FAQPage trên trang chính.
- PWA shortcuts cho Nén PDF, Gộp PDF, Tách PDF.
- Backup trước nâng cấp tại `_pre-ui-seo-compress-backup/`.

### Updated
- `sitemap.xml`, `robots.txt`, `manifest.json`, `sw.js`, `index.html`.
