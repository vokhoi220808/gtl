# Upgrade: Auto Register Verify System v9.0.0

## Mục tiêu

Nâng cấp Verify System để khi người dùng xuất PDF có QR Verify, hệ thống tự tạo SHA-256 certificate và tự đăng ký ID + hash vào Trusted Verify Registry qua API, không cần bấm nút admin thủ công.

## Thay đổi chính

- Thêm `auto-register` action vào `api/verify.js`.
- Auto-register mặc định bật, có thể tắt bằng environment variable `PFSP_AUTO_REGISTER_ENABLED=false`.
- Auto-register không cần `VERIFY_ADMIN_SECRET`, nhưng:
  - chỉ thêm bản ghi mới;
  - không ghi đè ID đã có;
  - nếu trùng ID khác hash sẽ trả `ID_COLLISION`;
  - nếu trùng ID cùng hash sẽ trả `ALREADY_REGISTERED`.
- Khi xuất PDF có QR Verify, `pfsp-document-hash-verify.js` gọi `PFSPTrustedVerifyRegistry.autoRegisterCertificate(cert)`.
- Làm lại giao diện `Trusted Verify Registry Pro` tối, rõ chữ, có trạng thái readiness, audit cục bộ và auto-register status.
- Sửa giao diện registry trên `verify.html` sang dark contrast để không bị nền sáng chữ trắng.
- Bump service worker cache version lên `9.0.0-auto-register-verify-system`.

## Cách dùng

1. Bật `Đóng QR vào PDF`.
2. Chọn mode `Verify ID`.
3. Bật `Tự đăng ký registry khi xuất PDF có QR Verify`.
4. Xuất PDF.
5. App tự đăng ký ID + SHA-256 vào registry.
6. Mở `verify.html`, upload PDF để kiểm tra thật/giả.

## Environment Variables cần có trên Vercel

- `PFSP_VERIFY_SIGNING_SECRET`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `PFSP_REGISTRY_PATH`

`VERIFY_ADMIN_SECRET` vẫn cần cho thao tác thu hồi ID và đăng ký thủ công.

## Bảo mật thực tế

Auto-register public giúp người dùng không phải nhập admin secret. Vì đây là endpoint ghi registry công khai, nên nó có chống ghi đè và chống trùng ID khác hash, nhưng vẫn nên theo dõi registry nếu website public có nhiều người dùng. Muốn chặt hơn nữa, bước sau nên thêm CAPTCHA/rate-limit hoặc tài khoản người dùng.
