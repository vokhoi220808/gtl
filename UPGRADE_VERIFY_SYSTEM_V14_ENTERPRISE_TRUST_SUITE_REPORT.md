# UPGRADE REPORT — Verify System v14 Enterprise Trust Suite + Document Information

Version: `14.4.0-enterprise-trust-suite`

## Nguyên tắc thực hiện

- Giữ nguyên hệ thống hiện tại và các backup cũ.
- Tạo backup trước khi ghi đè tại `_pre-verify-system-v14-enterprise-document-info-backup/`.
- Không xóa tùy tiện. Chỉ cập nhật các file cần thiết cho Verify System, Trust Portal, Admin Console, Document Information và CI/test.

## v14.0 — Enterprise Signing + Key Rotation

- Thêm hỗ trợ ký bất đối xứng bằng private/public key qua env:
  - `PFSP_VERIFY_PRIVATE_KEY`
  - `PFSP_VERIFY_PUBLIC_KEY`
  - `PFSP_VERIFY_KEY_ID`
  - `PFSP_VERIFY_KEYS_JSON`
- Vẫn giữ tương thích HMAC legacy bằng `PFSP_VERIFY_SIGNING_SECRET`.
- Record mới có `keyId`, `signatureAlgorithm`, `signatureVersion`.
- Verify signature tự nhận biết HMAC legacy hoặc key-based signature.

## v14.1 — Storage Adapter

- Thêm Upstash Redis REST adapter:
  - `PFSP_UPSTASH_REDIS_REST_URL`
  - `PFSP_UPSTASH_REDIS_REST_TOKEN`
  - `PFSP_REDIS_REGISTRY_KEY`
- Nếu Redis có cấu hình, Redis là storage primary.
- GitHub JSON vẫn dùng được như backup/primary legacy.
- Local write vẫn chỉ bật khi `PFSP_ALLOW_LOCAL_REGISTRY_WRITE=true`.

## v14.2 — Trust Portal nâng cấp

- Public search nhận thêm Document Information/User Information.
- Printable certificate hiển thị Document Information đầy đủ.
- Verify page hiển thị thông tin tài liệu/người dùng ngay trong kết quả xác minh.
- Certificate JSON v5 chứa `documentInfo`, `userInfo`, `extraInfo`.

## v14.3 — Admin Analytics + Bulk Action

- Thêm endpoint admin `analytics`.
- Thêm endpoint `bulk-action` cho revoke/suspend/activate/restore/archive nhiều ID.
- Không có thao tác xóa hàng loạt để tránh phá registry.
- Admin Console có khu Analytics và Bulk Action an toàn.
- Metadata editor hỗ trợ cập nhật `documentInfo` và `userInfo` bằng JSON.

## v14.4 — E2E + GitHub Actions

- Thêm `tests/verify-system-e2e.js`.
- Thêm workflow `.github/workflows/verify-system.yml`.
- Thêm npm scripts:
  - `npm run verify:e2e`
  - `npm test`
- E2E kiểm tra health, generate ID, register, verify, printable certificate, analytics và bulk action dry-run.

## Document Information tab

Đã thêm tab mới trong `index.html`:

`Document Information / Thông tin tài liệu`

Người dùng có thể điền:

- Tiêu đề tài liệu
- Loại tài liệu
- Số hiệu/mã tài liệu
- Phiên bản
- Ngôn ngữ
- Đơn vị phát hành
- Phòng ban
- Tác giả
- Chủ đề
- Mức độ bảo mật
- Ngày tạo/ngày hiệu lực/ngày hết hạn metadata
- Từ khóa
- Thông tin cá nhân/chủ tài liệu: tên, email, phone, tổ chức, bộ phận, vai trò, website, mã định danh nội bộ, địa chỉ, ghi chú
- Custom JSON metadata

Thông tin này được gắn vào certificate và record registry cùng với Verify ID + SHA-256. Trang `verify.html`, `trust-portal.html`, `verify-certificate.html` và Admin Console đều đọc/hiển thị thông tin này.

## File chính đã chỉnh

- `api/verify.js`
- `index.html`
- `verify.html`
- `trust-portal.html`
- `verify-certificate.html`
- `admin-verify.html`
- `assets/pfsp-document-hash-verify.js`
- `assets/pfsp-verify-final-page.js`
- `assets/pfsp-trust-portal.js`
- `assets/pfsp-trust-certificate.js`
- `assets/pfsp-admin-verify.js`
- `assets/pfsp-trusted-verify-registry.js`
- `assets/pfsp-verify-final-main.js`
- `assets/pfsp-verify-final.css`
- `data/verify-registry.json`
- `package.json`
- `sw.js`
- `pdf-fusion-sw.js`
- `manifest.json`, `site.webmanifest`, `pdf-fusion-manifest.json`
- `scripts/predeploy-check.js`
- `tests/verify-system-e2e.js`
- `.github/workflows/verify-system.yml`

## Kiểm tra đã chạy

```bash
npm run check:js
npm run predeploy-check
npm run verify:e2e
npm test
```

Tất cả đều pass.
