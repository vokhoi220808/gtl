# PDF Fusion Smart Pro - Trusted Verify Registry Upgrade v8.0.0

## Mục tiêu

Nâng cấp Verify từ cơ chế chỉ đọc link/certificate sang cơ chế có registry đáng tin để phân biệt:

- PDF thật đã đăng ký
- PDF bị sửa sau khi đăng ký
- Link/certificate tự tạo nhưng chưa được công nhận
- Verify ID bị thu hồi
- Verify ID hết hạn
- Registry có dấu hiệu bị sửa

## File mới

- `api/verify.js` - Vercel Serverless API để kiểm tra, đăng ký và thu hồi Verify ID.
- `data/verify-registry.json` - registry công khai mặc định.
- `assets/pfsp-trusted-verify-registry.js` - panel registry trong app chính.
- `assets/pfsp-verify-registry-page.js` - registry check mở rộng cho `verify.html`.
- `verify-registry.html` - trang giải thích Trusted Verify Registry và cách cấu hình.
- `_pre-trusted-verify-registry-backup/` - backup các file trước khi nâng cấp.

## File đã cập nhật

- `index.html` - thêm script Trusted Verify Registry.
- `verify.html` - thêm script kiểm tra registry/server.
- `sw.js`, `pdf-fusion-sw.js` - cache file mới, không cache `/api/*`.
- `manifest.json`, `site.webmanifest`, `pdf-fusion-manifest.json` - version/shortcut mới.
- `sitemap.xml` - thêm `verify.html` và `verify-registry.html`.
- `package.json`, `VERSION.txt` - version 8.0.0.

## Cách hoạt động

1. App tạo PDF và Document Hash certificate SHA-256.
2. Admin đăng ký certificate vào Trusted Verify Registry.
3. Registry lưu `Verify ID + SHA-256 + size + trạng thái + thời gian + metadata`.
4. Khi người dùng mở `verify.html`, trang kiểm tra link/certificate như cũ và gọi thêm `/api/verify`.
5. Khi người dùng upload PDF cần kiểm tra, trình duyệt tính SHA-256 và gửi ID/hash tới API.
6. API trả kết luận:
   - `GENUINE`: ID tồn tại, active, hash PDF khớp registry.
   - `FAKE_OR_MODIFIED`: ID tồn tại nhưng hash PDF không khớp.
   - `UNKNOWN`: ID chưa có trong registry.
   - `REVOKED`: ID đã bị thu hồi.
   - `EXPIRED`: ID đã hết hạn.
   - `REGISTRY_TAMPERED`: chữ ký bản ghi registry không hợp lệ.

## Cấu hình Vercel khuyến nghị

Trong Vercel → Project Settings → Environment Variables:

```txt
VERIFY_ADMIN_SECRET=mat_khau_admin_manh
PFSP_VERIFY_SIGNING_SECRET=chuoi_ky_hmac_rieng
GITHUB_TOKEN=github_pat_co_quyen_contents_write
GITHUB_OWNER=ten_owner
GITHUB_REPO=ten_repo
GITHUB_BRANCH=main
PFSP_REGISTRY_PATH=data/verify-registry.json
```

Nếu chưa cấu hình GitHub token, API vẫn kiểm tra được registry tĩnh hiện có. Khi đăng ký record mới, API sẽ trả `MANUAL_REGISTRY_PATCH_REQUIRED`, bạn copy record vào `data/verify-registry.json` rồi commit.

## Lưu ý bảo mật

- Không public `VERIFY_ADMIN_SECRET` hoặc `GITHUB_TOKEN` ở frontend.
- Chỉ admin mới được đăng ký/thu hồi registry.
- Registry giúp xác thực bản gốc đã đăng ký, nhưng vẫn chưa phải chữ ký số pháp lý nhà nước.
- Muốn mức pháp lý cao hơn cần CA/digital signature/timestamp authority.
