# UPGRADE REPORT — Verify System v14 Enterprise Trust Suite + v12.2 Hardening

## Mục tiêu

Nâng cấp tiếp từ v12.1.1 UI Hotfix sang bản `14.4.0-enterprise-trust-suite`, giữ nguyên hệ thống hiện tại, không xóa tùy tiện. Các file gốc trước khi ghi đè được lưu trong:

```txt
_pre-verify-system-v14-trust-portal-backup/
```

## BIG UPDATE đã thêm

### 1. v12.2 Stability + Production Hardening

- Thêm `assets/pfsp-verify-asset-guard.js` để tự phát hiện CSS/asset lỗi hoặc Service Worker cache cũ.
- Thêm fallback CSS runtime nếu trang rơi về HTML thô.
- Cache-busting đồng bộ `v=14.4.0-enterprise-trust-suite` cho Verify/Admin/Registry/App bridge.
- Service Worker bump version lên `14.4.0-enterprise-trust-suite`.
- Thêm `scripts/predeploy-check.js` và script `npm run predeploy-check`.
- API thêm in-memory rate limit:
  - `PFSP_VERIFY_PUBLIC_RATE_LIMIT`
  - `PFSP_VERIFY_ADMIN_RATE_LIMIT`
  - `PFSP_VERIFY_RATE_LIMIT_WINDOW_MS`
- API trả thêm security headers và request id.
- Self-test diagnostics kiểm tra thêm rate limit và Trust Portal endpoints.

### 2. v14 Enterprise Trust Suite

Thêm các trang public mới:

```txt
trust-portal.html
verify-certificate.html
```

Thêm frontend mới:

```txt
assets/pfsp-trust-portal.js
assets/pfsp-trust-certificate.js
```

Chức năng Trust Portal:

- Public registry summary.
- Public search theo Verify ID, SHA-256, tên file, owner, project, tag.
- Verify nhanh bằng ID + SHA-256 hoặc upload PDF để hash cục bộ.
- Recent records table.
- Public verification badge generator.
- Printable Trust Certificate page.
- Batch verify nhiều dòng.
- Download certificate JSON.

### 3. API endpoints mới

```txt
GET/POST /api/verify?action=portal
GET/POST /api/verify?action=public-search
GET/POST /api/verify?action=badge
GET/POST /api/verify?action=printable-certificate
```

Các endpoint cũ vẫn giữ:

```txt
health, stats, integrity, self-test, verify, lookup-hash, certificate,
batch-verify, auto-register, register, bulk-register, revoke, restore,
suspend, activate, expiry, metadata, repair, list, audit, backup
```

### 4. Files đã chỉnh/cập nhật

```txt
api/verify.js
verify.html
admin-verify.html
verify-registry.html
index.html
trust-portal.html
verify-certificate.html
assets/pfsp-verify-final.css
assets/pfsp-verify-asset-guard.js
assets/pfsp-trust-portal.js
assets/pfsp-trust-certificate.js
sw.js
manifest.json
site.webmanifest
pdf-fusion-manifest.json
sitemap.xml
vercel.json
package.json
README.md
DEPLOY.md
CHANGELOG.md
VERSION.txt
scripts/predeploy-check.js
```

## Test đã chạy

```bash
npm run check:js
npm run predeploy-check
```

## Ghi chú bảo toàn

- Không xóa backup cũ.
- Không xóa chức năng v12 hiện có.
- Không thay đổi luồng xử lý PDF chính.
- Registry vẫn dùng schema v4 và tương thích chữ ký v3/v4.
- Trust Portal chỉ dùng public metadata, không upload/lưu file PDF.
