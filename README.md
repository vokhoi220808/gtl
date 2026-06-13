# PDF Fusion Smart Pro — Verify System v14 Enterprise Trust Suite

Bản này giữ nguyên bộ công cụ PDF hiện có, tiếp tục nâng cấp Verify System theo 2 lớp: **v12.2 Stability + Production Hardening** và **v14 Enterprise Trust Suite**. Không xóa backup cũ, không thay đổi luồng xử lý PDF chính; các thay đổi tập trung vào API registry, public trust portal, printable certificate, badge, verify page, admin console, service worker cache và predeploy check.

## Verify System v14 có gì mới

- Public **Trust Portal**: `trust-portal.html`.
- Printable **Trust Certificate**: `verify-certificate.html?id=...`.
- Public search theo Verify ID, SHA-256, tên file, owner, project, tag.
- Public verification badge generator: `action=badge`.
- API summary endpoint: `action=portal`.
- Printable certificate endpoint: `action=printable-certificate`.
- Asset Guard chống lỗi mất CSS do cache/service worker: `assets/pfsp-verify-asset-guard.js`.
- Rate limit nhẹ cho API verify/admin bằng env vars.
- Predeploy checklist: `npm run predeploy-check`.
- Service Worker cache version `14.4.0-enterprise-trust-suite`.
- Vẫn giữ toàn bộ chức năng v12: trust score, timeline, batch verify, bulk register, hash lookup, certificate export, suspend/restore/revoke/expiry, audit log, backup, repair/re-sign và admin diagnostics.

## Trang chính của Verify System

```txt
verify.html                 Public verify page
trust-portal.html           Public Trust Portal v14
verify-certificate.html     Printable certificate page
verify-registry.html        Registry documentation
admin-verify.html           Admin console
```

## API public mới

```txt
/api/verify?action=portal
/api/verify?action=public-search&q=...
/api/verify?action=badge&id=PFSP-...
/api/verify?action=printable-certificate&id=PFSP-...
```

## Kiểm tra trước deploy

```bash
npm run check:js
npm run predeploy-check
npm run verify:health:local
```

---

## Legacy notes — Verify System v12 BIG UPDATE

Phần dưới là ghi chú legacy của bản v12 trước khi nâng lên v14. Bản hiện tại là `14.4.0-enterprise-trust-suite`, vẫn giữ các chức năng v12 và thêm Trust Portal.
Không xóa backup cũ, không thay đổi luồng xử lý PDF chính; các thay đổi tập trung vào API registry, verify page, admin console và bridge auto-register trong app.

## Verify System v12 có gì mới

- API `api/verify.js` nâng lên v12, registry schema `PFSP-VERIFY-REGISTRY-v4`.
- Tương thích ngược chữ ký v3 khi record cũ còn trong registry.
- Trust Score 0-100 cho từng lần xác minh.
- Trust checks chi tiết: registered, signature, status, expiry, hash, size.
- Timeline record: created, registered, updated, revoked, restored, suspended, expired.
- Public hash lookup: `action=lookup-hash`.
- Public certificate export: `action=certificate&id=...`.
- Public batch verify: `POST { action:"batch-verify", items:[...] }`.
- Admin bulk register nhiều record một lần.
- Admin dry-run cho register và bulk register.
- Admin suspend / activate ngoài revoke / restore.
- Admin metadata editor: owner, project, document title, tags, note.
- Admin repair + re-sign registry, có preview trước khi ghi.
- Self-test diagnostics cho deploy: signing, admin secret, GitHub, allowlist, integrity.
- Auto-register bridge trong app có local queue retry khi API/GitHub write lỗi.
- UI `verify.html` và `admin-verify.html` thiết kế lại, thêm batch panel, timeline, payload dump, diagnostics.

## File chính của Verify System

```txt
api/verify.js
verify.html
admin-verify.html
assets/pfsp-verify-final-page.js
assets/pfsp-admin-verify.js
assets/pfsp-trusted-verify-registry.js
assets/pfsp-verify-final-main.js
assets/pfsp-verify-final.css
data/verify-registry.json
```

## Kiểm tra nhanh

```bash
npm run check:js
npm run verify:health:local
```

## Deploy ngắn gọn

1. Push repo lên GitHub.
2. Import GitHub repo vào Vercel.
3. Set env vars trong Vercel:

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

4. Mở:

```txt
/api/verify?action=self-test
```

Khi production, cần `signingConfigured`, `adminConfigured`, `githubConfigured`, `allowedOriginsConfigured` đều OK.

---


**PDF Fusion Smart Pro** là công cụ xử lý PDF chạy trực tiếp trên trình duyệt, hỗ trợ gộp, tách, ký, watermark, OCR, QR, batch và chỉnh trang PDF mà không cần upload file lên server.

> Mục tiêu của dự án: tạo một công cụ PDF riêng tư, nhanh, dễ dùng và có thể chạy local/offline.

---

## Tính năng chính

### Gộp PDF

* Gộp nhiều file PDF thành một file duy nhất.
* Kéo thả để sắp xếp thứ tự file.
* Chọn dải trang cho từng file, ví dụ: `1-3,5,8-10`.
* Xoay từng file trước khi xuất.
* Tùy chọn thêm trang trắng sau file có số trang lẻ.
* Tự động đánh số trang.

### Tách PDF

* Tách PDF theo dải trang.
* Mỗi dải trang xuất thành một file PDF riêng.
* Ví dụ:

```txt
1-2,4-5
```

Kết quả:

```txt
file-trang-1-2.pdf
file-trang-4-5.pdf
```

* Có chế độ tách nhanh: mỗi trang thành một file PDF riêng.

### Watermark chữ

* Bật/tắt watermark chữ.
* Chỉnh nội dung watermark.
* Chỉnh cỡ chữ.
* Chỉnh góc xoay.
* Chọn màu bằng color picker.
* Chỉnh độ đậm/nhạt bằng thanh kéo.
* Chọn vị trí watermark.
* Mặc định nằm giữa trang.

### Watermark logo

* Upload logo PNG/JPG.
* Bật/tắt watermark logo.
* Chỉnh độ đậm/nhạt của logo.
* Chỉnh kích thước logo.
* Chọn vị trí mặc định.
* Preview trên một trang PDF đại diện.
* Kéo logo để di chuyển.
* Kéo góc logo để phóng to/thu nhỏ.
* Lăn chuột trên logo để zoom nhanh.
* Áp dụng logo cho tất cả trang hoặc một số trang nhất định.

Ví dụ áp dụng logo cho trang 1 đến 3 và trang 5:

```txt
1-3,5
```

Nếu để trống ô trang áp dụng, logo sẽ được áp dụng cho tất cả trang.

### Chữ ký

* Vẽ chữ ký trực tiếp bằng chuột hoặc cảm ứng.
* Chọn màu mực ký.
* Chọn độ dày nét ký.
* Undo nét ký.
* Lưu chữ ký để đóng vào PDF.
* Đóng chữ ký vào một trang hoặc tất cả trang.
* Hỗ trợ chữ ký dạng text.
* Hỗ trợ upload ảnh chữ ký/logo.

### Page Manager

* Xem thumbnail các trang PDF.
* Chọn trang.
* Xoay trang.
* Xóa trang.
* Khôi phục trang.
* Kéo thả để đổi thứ tự trang.
* Xuất riêng các trang đã chọn.

### OCR

* Nhận diện chữ trong PDF bằng Tesseract.js.
* Hỗ trợ tiếng Việt và tiếng Anh.
* Xuất kết quả OCR thành TXT.
* Tạo PDF searchable bằng cách chèn text OCR ẩn vào PDF.

### QR Code

* Tạo QR code từ link hoặc mã xác minh.
* Đóng QR vào PDF.
* Chọn vị trí QR trên trang.

### Batch Processor

* Xử lý nhiều PDF cùng lúc.
* Xuất riêng từng file PDF.
* Có thể áp dụng watermark, đánh số trang, QR và chữ ký cho từng file.

### Công cụ phụ

* Extract text từ PDF sang CSV.
* So sánh text giữa hai file PDF.
* Live Editor để đặt text lên trang PDF.
* Autosave cấu hình project vào localStorage.
* Hỗ trợ PWA/service worker khi chạy qua HTTPS hoặc localhost.

---

## Quyền riêng tư

PDF Fusion Smart Pro xử lý file trực tiếp trong trình duyệt.

* File không được upload lên server.
* File không rời khỏi máy người dùng.
* Dữ liệu xử lý chủ yếu nằm trong RAM trình duyệt.
* Một số cấu hình như watermark, chữ ký, vị trí logo có thể được lưu vào `localStorage`.

Lưu ý: nếu lưu logo hoặc chữ ký dung lượng lớn vào `localStorage`, trình duyệt có thể báo đầy bộ nhớ lưu trữ.

---

## Công nghệ sử dụng

Dự án sử dụng các thư viện frontend:

* [pdf-lib](https://pdf-lib.js.org/) — tạo, chỉnh sửa, gộp và xuất PDF.
* [PDF.js](https://mozilla.github.io/pdf.js/) — render PDF để preview, thumbnail và OCR.
* [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR trong trình duyệt.
* [SortableJS](https://sortablejs.github.io/Sortable/) — kéo thả sắp xếp file/trang.
* [QRCode](https://github.com/soldair/node-qrcode) — tạo QR code.
* [Mammoth.js](https://github.com/mwilliamson/mammoth.js) — đọc text từ file `.docx`.

---

## Cách chạy local

### 1. Clone hoặc tải project

```bash
git clone https://github.com/your-username/pdf-fusion-smart-pro.git
cd pdf-fusion-smart-pro
```

Hoặc tạo thư mục thủ công:

```txt
pdf-fusion-smart-pro/
  index.html
  pdf-fusion-sw.js
  README.md
```

### 2. Chạy local server

Không nên mở trực tiếp bằng `file://`.

Dùng Python:

```bash
python -m http.server 5500
```

Sau đó mở trình duyệt:

```txt
http://localhost:5500
```

---

## Cấu trúc đề xuất

Hiện tại có thể chạy dưới dạng một file HTML duy nhất. Khi dự án lớn hơn, nên tách thành cấu trúc sau:

```txt
pdf-fusion-smart-pro/
  index.html
  README.md
  pdf-fusion-sw.js
  src/
    style.css
    app.js
    pdf-export.js
    split.js
    signature.js
    watermark.js
    ocr.js
    page-manager.js
    editor.js
    storage.js
```

---

## Service Worker mẫu

Tạo file `pdf-fusion-sw.js`:

```js
const CACHE_NAME = 'pdf-fusion-smart-pro-v1';

const ASSETS = [
  './',
  './index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

Service worker chỉ hoạt động khi chạy qua:

```txt
https://
```

hoặc:

```txt
localhost
```

---

## Cách sử dụng nhanh

### Gộp PDF

1. Kéo thả file PDF vào vùng chọn file.
2. Sắp xếp thứ tự file.
3. Chọn dải trang nếu cần.
4. Bật watermark, QR hoặc chữ ký nếu muốn.
5. Bấm **Xuất PDF**.
6. Tải file kết quả.

### Tách PDF

1. Vào tab **Tách PDF**.
2. Chọn file PDF.
3. Nhập dải trang, ví dụ:

```txt
1-3,5,8-10
```

4. Bấm **Xem trước** để kiểm tra.
5. Bấm **Tách & Tải về**.

### Thêm watermark logo

1. Vào tab **Xuất**.
2. Bật **Watermark logo**.
3. Upload logo PNG/JPG.
4. Chọn file preview và trang preview.
5. Bấm **Xem preview**.
6. Kéo logo đến vị trí mong muốn.
7. Kéo góc logo để phóng to/thu nhỏ.
8. Nhập trang áp dụng nếu chỉ muốn đóng logo lên một số trang.
9. Bấm **Xuất PDF**.

### Ký PDF

1. Vào tab **Chữ ký**.
2. Vẽ chữ ký.
3. Bấm **Lưu chữ ký**.
4. Chọn PDF cần ký.
5. Chọn trang hoặc bật ký tất cả trang.
6. Bấm **Đóng dấu ký & Xuất PDF**.

---

## Giới hạn hiện tại

* OCR phụ thuộc vào chất lượng scan và độ rõ của ảnh.
* PDF quá lớn có thể làm trình duyệt chậm hoặc treo tab.
* Chuyển `.docx` sang PDF hiện chủ yếu là extract text, chưa giữ layout phức tạp.
* PDF có mã hóa hoặc cấu trúc đặc biệt có thể không đọc được.
* Watermark logo lưu trong `localStorage` có thể bị giới hạn dung lượng nếu ảnh quá lớn.
* So sánh PDF hiện chủ yếu so sánh text, chưa so sánh hình ảnh/pixel.

---

## Roadmap

### Giai đoạn 1

* [x] Gộp PDF.
* [x] Tách PDF.
* [x] Chữ ký vẽ tay.
* [x] Watermark chữ.
* [x] Watermark logo.
* [x] QR code.
* [x] OCR cơ bản.
* [x] Page Manager.
* [x] Batch Processor.

### Giai đoạn 2

* [ ] Tách code thành nhiều module.
* [ ] Thêm manifest PWA.
* [ ] Thêm giao diện preview watermark đầy đủ.
* [ ] Thêm nút tải tất cả file dạng ZIP.
* [ ] Thêm thông báo lỗi đẹp thay cho `alert()`.
* [ ] Thêm giới hạn dung lượng file và cảnh báo trước khi xử lý.
* [ ] Thêm chế độ nén ảnh trong PDF.
* [ ] Thêm import/export cấu hình project.

### Giai đoạn 3

* [ ] Deploy demo lên GitHub Pages, Netlify hoặc Vercel.
* [ ] Thêm trang giới thiệu privacy.
* [ ] Thêm test files mẫu.
* [ ] Tối ưu hiệu năng cho PDF lớn.
* [ ] Hỗ trợ dark/light theme.
* [ ] Hỗ trợ đa ngôn ngữ.

---

## Gợi ý deploy

Có thể deploy tĩnh bằng:

* GitHub Pages
* Netlify
* Vercel
* Cloudflare Pages

Vì app chạy hoàn toàn trên frontend, không cần backend để dùng các chức năng cơ bản.

---

## Đóng góp

Pull request và issue đều được chào đón.

Khi báo lỗi, vui lòng ghi rõ:

```txt
Tính năng:
File test:
Bước thực hiện:
Kết quả mong muốn:
Kết quả thực tế:
Console error:
Trình duyệt:
Hệ điều hành:
```

---

## License

Bạn có thể sử dụng MIT License cho dự án này.

```txt
MIT License
```

Nếu dự án dùng trong môi trường nội bộ hoặc thương mại riêng, hãy kiểm tra lại license của các thư viện bên thứ ba trước khi phát hành chính thức.

---

## Ghi chú

PDF Fusion Smart Pro được thiết kế với ưu tiên:

```txt
Riêng tư · Nhanh · Không upload server · Dễ dùng · Chạy trong trình duyệt
```
Created by Artificial Intelligence. No legal responsibility or liability.

Dự án phù hợp cho cá nhân, nhóm nhỏ, văn phòng, hoặc các workflow cần xử lý PDF nhanh mà không muốn gửi tài liệu lên dịch vụ bên ngoài.

---

## Bản nâng cấp 4.1.0-upgraded

Gói này đã được nâng cấp theo hướng giữ nguyên toàn bộ file gốc và bổ sung các thành phần cần thiết để deploy ổn định hơn.

Đã thêm/sửa:

* Sửa đường dẫn PWA/service worker/manifest bị lệch tên file.
* Thêm `offline.html`, `verify.html`, `404.html`.
* Thêm cấu hình deploy cho Netlify, Vercel và GitHub Pages.
* Thêm favicon, icon 512, manifest nâng cấp và alias tương thích đường dẫn cũ.
* Thêm panel công cụ nâng cấp trong tab **Tools**: xuất/nhập cấu hình JSON, kiểm tra PWA, làm mới cache, copy log và phím tắt.
* Thêm thư mục `_original-backup/` chứa bản sao các file gốc trước khi nâng cấp.

Xem thêm:

* `UPGRADE_REPORT.md`
* `DEPLOY.md`
* `CHANGELOG.md`


## Nâng cấp v5.0 - UI/UX + SEO + Compress PDF

Bản này thêm lớp giao diện Pro Refresh, tab **Nén PDF**, các landing page SEO riêng cho từng công cụ và cập nhật PWA cache.

### Công cụ Compress PDF

- **Nén an toàn**: tối ưu cấu trúc PDF, giữ text/vector tốt hơn.
- **Nén mạnh**: render trang thành JPEG để giảm dung lượng mạnh hơn với PDF scan.
- Có chọn dải trang và preset chất lượng.

### Trang SEO mới

- `compress-pdf.html`
- `merge-pdf.html`
- `split-pdf.html`
- `watermark-pdf.html`
- `sign-pdf.html`
- `ocr-pdf.html`


## Advanced Suite v6

Đã thêm gói nâng cấp không xóa file gốc:

- PDF Preview Editor: xem trước từng trang, kéo thả đổi thứ tự, xoay trang, xóa trang, chọn trang và xuất PDF mới.
- Web Worker processing: batch merge, split, compress và watermark chạy qua `assets/pfsp-worker.js` để giảm treo giao diện.
- Batch ZIP Export: nén nhiều PDF, watermark nhiều PDF, hoặc tách trang PDF rồi tải một file ZIP.
- Privacy Trust Center: `privacy-center.html` hiển thị cam kết xử lý trên trình duyệt, analytics cục bộ, lỗi và loại thiết bị.
- Local analytics: chỉ lưu trong `localStorage`, không gửi server.
- I18N cơ bản: Tiếng Việt / English qua nút chuyển ngôn ngữ và trang `en.html`.

Không xóa file gốc. Bản trước khi nâng cấp nằm trong `_pre-advanced-suite-backup/`.

## Trusted Verify Registry v8.0.0

Bản v8 thêm registry để Verify không chỉ dựa vào link/certificate. Khi cấu hình `/api/verify`, hệ thống có thể kết luận:

- `GENUINE`: PDF thật, ID + SHA-256 khớp registry.
- `FAKE_OR_MODIFIED`: ID có thật nhưng file PDF bị sửa hoặc giả.
- `UNKNOWN`: link/certificate chưa được registry công nhận.
- `REVOKED`: ID đã bị thu hồi.
- `EXPIRED`: bản ghi đã hết hạn.

Xem chi tiết trong `verify-registry.html` và `UPGRADE_TRUSTED_VERIFY_REGISTRY_REPORT.md`.


## Verify System Final BIG (superseded by v11)

Bản cũ của hệ thống Verify: short QR, auto-register, server-signed certificate, registry audit log, revoke/restore/expiry, backup, integrity checker và `admin-verify.html`. Xem `UPGRADE_VERIFY_SYSTEM_FINAL_BIG_REPORT.md`.

---

## Verify System v11 Redesign

This project now includes **Verify System v11**, a redesigned trusted-registry flow for PDF verification.

### Core files

- `api/verify.js` - Vercel serverless API for trusted registry operations.
- `verify.html` - public verification page.
- `admin-verify.html` - private admin console.
- `assets/pfsp-verify-final-page.js` - standalone verify page logic.
- `assets/pfsp-admin-verify.js` - admin console logic.
- `assets/pfsp-trusted-verify-registry.js` - app-side auto-register bridge.
- `assets/pfsp-verify-final-main.js` - deployment health strip.
- `data/verify-registry.json` - registry data file.

### Production environment variables

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

### Quick test

```bash
npm run check:js
python -m http.server 5500
```

After deploying to Vercel, open:

```txt
/api/verify?action=health
```

The best production result is:

```txt
githubConfigured: true
signingConfigured: true
adminConfigured: true
allowedOriginsConfigured: true
```

See `UPGRADE_VERIFY_SYSTEM_V11_REDESIGN_REPORT.md` for the full test checklist.
