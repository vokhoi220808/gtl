# Deploy PDF Fusion Smart Pro with Verify System v12 BIG UPDATE

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Upgrade Verify System v12 big update"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

Không commit `.env`, token, admin secret hoặc signing secret.

## 2. Import repo vào Vercel

Vào Vercel → Add New Project → Import Git Repository.

Recommended settings:

```txt
Framework Preset: Other
Build Command: empty
Output Directory: empty or .
Install Command: empty or npm install
```

Frontend là HTML/CSS/JS tĩnh. Verify API chạy từ `api/verify.js`.

## 3. Environment variables bắt buộc

```txt
PFSP_VERIFY_SIGNING_SECRET=long-random-signing-secret
PFSP_VERIFY_ADMIN_SECRET=long-random-admin-secret
PFSP_PUBLIC_BASE_URL=https://your-domain.example
PFSP_VERIFY_ALLOWED_ORIGINS=https://your-domain.example
PFSP_CORS_ORIGIN=https://your-domain.example
PFSP_GITHUB_TOKEN=github-fine-grained-token
PFSP_GITHUB_OWNER=your-github-owner
PFSP_GITHUB_REPO=your-repo-name
PFSP_GITHUB_BRANCH=main
PFSP_REGISTRY_PATH=data/verify-registry.json
```

Signing secret và admin secret phải khác nhau. Không dùng token GitHub có quyền quá rộng nếu không cần.

## 4. Environment variables tùy chọn

```txt
PFSP_AUTO_REGISTER_ENABLED=true
PFSP_AUTO_REGISTER_DAILY_LIMIT=120
PFSP_VERIFY_MAX_AUDIT=1500
PFSP_VERIFY_MAX_RECORDS_PUBLIC=5000
PFSP_VERIFY_MAX_BATCH=80
PFSP_VERIFY_MAX_BULK_REGISTER=150
```

Development-only local writes:

```txt
PFSP_ALLOW_LOCAL_REGISTRY_WRITE=true
```

Không bật local write cho production Vercel thông thường. Hãy dùng GitHub registry write.

## 5. Health / diagnostics

Mở:

```txt
https://your-project.vercel.app/api/verify?action=health
https://your-project.vercel.app/api/verify?action=self-test
https://your-project.vercel.app/api/verify?action=integrity
```

Production nên đạt:

```txt
githubConfigured: true
signingConfigured: true
adminConfigured: true
allowedOriginsConfigured: true
```

Nếu `signingConfigured` false, register/revoke/restore/suspend/repair sẽ bị chặn.

## 6. End-to-end test

1. Mở app chính.
2. Bật QR Verify và document hash.
3. Export PDF.
4. Confirm auto-register trả `AUTO_REGISTERED` hoặc `ALREADY_REGISTERED`.
5. Mở short verify link.
6. Upload PDF gốc và kỳ vọng `GENUINE`.
7. Upload PDF khác hoặc file đã sửa và kỳ vọng `FAKE_OR_MODIFIED`.
8. Mở `admin-verify.html`.
9. Load records.
10. Export certificate.
11. Suspend record và verify trả `SUSPENDED`.
12. Restore record và verify lại.
13. Revoke record và verify trả `REVOKED`.
14. Restore record.
15. Chạy backup JSON.
16. Chạy repair preview trước, chỉ repair write khi thật sự cần.

## 7. API v12 quick reference

Public GET:

```txt
/api/verify?id=PFSP-...
/api/verify?id=PFSP-...&sha256=...
/api/verify?action=health
/api/verify?action=self-test
/api/verify?action=integrity
/api/verify?action=stats
/api/verify?action=lookup-hash&sha256=...
/api/verify?action=certificate&id=PFSP-...
/api/verify?action=generate-id
```

Public POST:

```json
{ "action": "batch-verify", "items": [{ "id": "PFSP-...", "sha256": "..." }] }
{ "action": "auto-register", "certificate": { "id": "PFSP-...", "sha256": "..." } }
```

Admin POST:

```json
{ "action": "register", "id": "PFSP-...", "sha256": "..." }
{ "action": "bulk-register", "items": [] }
{ "action": "revoke", "id": "PFSP-...", "reason": "..." }
{ "action": "suspend", "id": "PFSP-...", "reason": "..." }
{ "action": "restore", "id": "PFSP-..." }
{ "action": "set-expiry", "id": "PFSP-...", "expiresAt": "2026-12-31T00:00:00.000Z" }
{ "action": "update-note", "id": "PFSP-...", "owner": "...", "project": "...", "tags": ["..."] }
{ "action": "repair", "resign": true, "dryRun": true }
{ "action": "backup" }
{ "action": "list" }
{ "action": "audit" }
```

Admin secret có thể gửi qua header:

```txt
X-Verify-Admin-Secret: your-admin-secret
```

hoặc body `adminSecret` khi dùng admin console.

## 8. Không xóa tùy tiện

Bản v12 đã tạo backup tại:

```txt
_pre-verify-system-v12-big-update-backup/
```

Các backup cũ vẫn được giữ nguyên. Khi deploy production có thể loại backup khỏi branch deploy nếu muốn nhẹ hơn, nhưng bản source này không tự xóa chúng.
