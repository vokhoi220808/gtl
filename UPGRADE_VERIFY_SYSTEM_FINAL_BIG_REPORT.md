# PDF Fusion Smart Pro — Verify System Final BIG

Bản nâng cấp cuối cho Verify System. Giữ nguyên hiện trạng dự án, không xóa file gốc; các file quan trọng trước khi sửa được backup trong `_pre-verify-system-final-big-backup/`.

## Nâng cấp chính

- Server-signed certificate bằng HMAC SHA-256 (`PFSP_VERIFY_SIGNING_SECRET`).
- QR rút gọn: `verify.html?id=PFSP-...`; dữ liệu thật lấy từ trusted registry.
- Auto-register khi xuất PDF có QR Verify, không cần thao tác admin thủ công.
- Kiểm tra thật/giả/sửa đổi/chưa đăng ký/thu hồi/hết hạn/tampered registry.
- Rate limit auto-register theo IP hash bằng audit log.
- Allowlist origin tùy chọn qua `PFSP_VERIFY_ALLOWED_ORIGINS`.
- Admin dashboard: `admin-verify.html`.
- Audit log: register, auto-register, verify, revoke, restore, expiry.
- Thu hồi ID có lý do, khôi phục ID, cập nhật hết hạn.
- Registry backup/snapshot và integrity checker.
- API response chuẩn hóa, API health/integrity/list/backup.

## API actions

- `GET /api/verify?id=PFSP-...&sha256=...`
- `GET /api/verify?health=1`
- `GET /api/verify?integrity=1`
- `POST /api/verify { action: "auto-register", certificate }`
- `POST /api/verify { action: "register", certificate, adminSecret }`
- `POST /api/verify { action: "revoke", id, reason, adminSecret }`
- `POST /api/verify { action: "restore", id, adminSecret }`
- `POST /api/verify { action: "update-expiry", id, expiresAt, adminSecret }`
- `POST /api/verify { action: "list", adminSecret }`
- `POST /api/verify { action: "backup", adminSecret }`
- `POST /api/verify { action: "integrity" }`

## Env cần có trên Vercel

- `VERIFY_ADMIN_SECRET`
- `PFSP_VERIFY_SIGNING_SECRET`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `PFSP_REGISTRY_PATH=data/verify-registry.json`

Tùy chọn:

- `PFSP_PUBLIC_BASE_URL=https://domain-cua-ban`
- `PFSP_AUTO_REGISTER_ENABLED=true`
- `PFSP_AUTO_REGISTER_DAILY_LIMIT=80`
- `PFSP_VERIFY_ALLOWED_ORIGINS=https://domain-cua-ban`

## Lưu ý

Bản này không upload PDF lên server. Server chỉ nhận metadata: Verify ID, SHA-256, size, filename, origin và certificate metadata.
