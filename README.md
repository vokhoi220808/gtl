# PDF Fusion Smart Pro

> **All-in-one browser-based PDF toolkit with trusted QR verification, document hash checking, batch processing, PWA support, and a final-grade Verify Registry system.**

**PDF Fusion Smart Pro** là bộ công cụ PDF chạy trực tiếp trên trình duyệt, tập trung vào tốc độ, quyền riêng tư và xác minh tài liệu. Ứng dụng hỗ trợ gộp PDF, tách PDF, nén PDF, watermark, ký/đóng dấu, OCR, QR Verify, batch ZIP export, preview editor và hệ thống **Trusted Verify Registry Final BIG** để kiểm tra tài liệu thật / giả / bị chỉnh sửa.

---

## Live Demo

```txt
https://gtl-roan.vercel.app
```

> Nếu bạn fork project này, hãy thay URL trên bằng domain của bạn.

---

## Điểm nổi bật

* Chạy trực tiếp trên trình duyệt
* Không cần backend cho các thao tác PDF cơ bản
* Hỗ trợ PWA / offline mode
* Gộp PDF nhiều file
* Tách PDF theo trang
* Nén PDF
* Watermark / Stamp
* Chữ ký / Logo tự động
* QR Verification ID
* Document Hash Verify bằng SHA-256
* Trusted Verify Registry có API
* Auto-register khi xuất PDF có QR Verify
* Admin Verify Dashboard
* Audit log
* Revoke / Restore Verify ID
* Expiry / No-expiry certificate
* Batch ZIP Export
* PDF Preview Editor
* Hỗ trợ Tiếng Việt / English
* Tối ưu SEO cho các trang công cụ PDF

---

## Tính năng PDF

### Gộp PDF

Cho phép chọn nhiều file PDF, sắp xếp thứ tự và xuất thành một file PDF duy nhất.

### Tách PDF

Hỗ trợ tách PDF theo trang hoặc xuất nhiều trang thành các file riêng.

### Nén PDF

Hỗ trợ nén PDF với nhiều chế độ:

* Nén an toàn
* Nén mạnh cho PDF scan / ảnh
* Giữ nội dung text/vector tốt hơn khi có thể

### Watermark / Stamp

Cho phép thêm watermark hoặc dấu lên PDF:

* Text watermark
* Logo watermark
* Tùy chỉnh vị trí
* Tùy chỉnh độ mờ
* Áp dụng hàng loạt

### QR Verify

Có thể gắn QR Verify vào PDF để người nhận quét và kiểm tra trạng thái tài liệu.

### OCR

Hỗ trợ OCR trên trình duyệt bằng Tesseract.js cho PDF scan hoặc ảnh chứa chữ.

### Batch ZIP Export

Hỗ trợ xử lý nhiều file cùng lúc và tải về dưới dạng ZIP:

* Nén nhiều PDF → ZIP
* Watermark nhiều PDF → ZIP
* Tách PDF thành nhiều file → ZIP
* Xuất batch kết quả nhanh hơn

### PDF Preview Editor

Cho phép xem trước và chỉnh trang PDF:

* Xem từng trang
* Kéo thả đổi thứ tự trang
* Xóa / khôi phục trang
* Xoay trang
* Chọn trang để xuất PDF mới

---

## Verify System Final BIG

Phiên bản này có hệ thống xác minh tài liệu nâng cấp toàn diện.

### Mục tiêu

Verify System giúp kiểm tra:

* Tài liệu có phải bản đã đăng ký không
* PDF có bị chỉnh sửa sau khi xuất không
* Verify ID có tồn tại trong registry không
* ID có bị thu hồi không
* ID có hết hạn không
* Registry có bị chỉnh sửa trái phép không

---

## Các trạng thái Verify

| Trạng thái          | Ý nghĩa                                              |
| ------------------- | ---------------------------------------------------- |
| `GENUINE`           | Tài liệu hợp lệ, hash khớp registry                  |
| `FAKE_OR_MODIFIED`  | ID tồn tại nhưng file PDF không khớp hash đã đăng ký |
| `UNKNOWN`           | ID chưa có trong registry                            |
| `REVOKED`           | Verify ID đã bị thu hồi                              |
| `EXPIRED`           | Certificate / Verify ID đã hết hạn                   |
| `REGISTRY_TAMPERED` | Registry hoặc certificate có dấu hiệu bị can thiệp   |
| `ID_COLLISION`      | ID bị trùng nhưng hash khác                          |
| `RATE_LIMITED`      | Auto-register bị giới hạn do quá nhiều request       |

---

## Cách Verify hoạt động

### 1. Khi xuất PDF có QR Verify

Ứng dụng sẽ:

1. Tạo Verify ID
2. Xuất PDF
3. Tính SHA-256 hash của PDF đầu ra
4. Tạo certificate metadata
5. Ký certificate bằng server secret
6. Tự động đăng ký vào Verify Registry
7. Gắn QR ngắn vào PDF

QR có thể ở dạng:

```txt
https://your-domain.com/verify.html?id=PFSP-...
```

QR không cần chứa toàn bộ dữ liệu dài. Trang verify sẽ gọi API để lấy thông tin từ registry.

---

### 2. Khi người dùng quét QR

Trang `verify.html` sẽ:

1. Đọc Verify ID từ URL
2. Gọi API `/api/verify`
3. Lấy registry record
4. Cho người dùng upload PDF cần kiểm tra
5. Tính SHA-256 hash của file upload
6. So sánh với hash đã đăng ký
7. Hiển thị kết quả thật / giả / bị sửa / bị thu hồi / hết hạn

---

## Server-Signed Certificate

Bản Final BIG hỗ trợ certificate được ký bằng server secret:

```txt
PFSP_VERIFY_SIGNING_SECRET
```

Certificate signature giúp phát hiện registry/certificate bị sửa thủ công.

> Lưu ý: Đây là hệ thống xác minh kỹ thuật bằng SHA-256 + registry + server signature. Nó không tự động thay thế chữ ký số pháp lý theo quy định nhà nước.

---

## Auto Register

Khi bật QR Verify và xuất PDF, hệ thống sẽ tự động đăng ký record vào registry.

Không cần admin bấm thủ công.

Auto-register có kiểm tra:

* ID hợp lệ
* SHA-256 hợp lệ
* Trùng ID cùng hash
* Trùng ID khác hash
* Origin hợp lệ
* Rate limit
* Payload size
* Registry integrity

---

## Admin Verify Dashboard

Trang quản trị:

```txt
/admin-verify.html
```

Chức năng:

* Xem trạng thái API
* Tìm Verify ID
* Tìm SHA-256
* Revoke Verify ID
* Restore Verify ID
* Cập nhật expiry
* Xem registry snapshot
* Kiểm tra integrity
* Xuất backup
* Xem audit log

Admin dashboard yêu cầu:

```txt
VERIFY_ADMIN_SECRET
```

---

## API Verify

API chính:

```txt
/api/verify
```

Các action hỗ trợ:

```txt
health
lookup
verify
register
auto-register
revoke
restore
update-expiry
snapshot
audit
integrity
```

Response chuẩn:

```json
{
  "ok": true,
  "status": "GENUINE",
  "id": "PFSP-...",
  "message": "Document is genuine.",
  "record": {}
}
```

---

## Environment Variables cho Vercel

Để Verify Registry hoạt động đầy đủ trên Vercel, cần cấu hình các biến môi trường sau:

### Bắt buộc

```txt
VERIFY_ADMIN_SECRET
PFSP_VERIFY_SIGNING_SECRET
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
PFSP_REGISTRY_PATH
```

### Khuyến nghị

```txt
PFSP_PUBLIC_BASE_URL
PFSP_AUTO_REGISTER_ENABLED
PFSP_AUTO_REGISTER_DAILY_LIMIT
PFSP_VERIFY_ALLOWED_ORIGINS
```

Ví dụ:

```txt
VERIFY_ADMIN_SECRET=your-long-admin-secret
PFSP_VERIFY_SIGNING_SECRET=your-long-signing-secret
GITHUB_TOKEN=github_pat_xxx
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-repo-name
GITHUB_BRANCH=main
PFSP_REGISTRY_PATH=data/verify-registry.json

PFSP_PUBLIC_BASE_URL=https://your-domain.com
PFSP_AUTO_REGISTER_ENABLED=true
PFSP_AUTO_REGISTER_DAILY_LIMIT=80
PFSP_VERIFY_ALLOWED_ORIGINS=https://your-domain.com
```

---

## GitHub Token Permission

Nếu dùng Fine-grained GitHub Token, cần cấp quyền tối thiểu:

```txt
Repository permissions:
- Contents: Read and write
- Metadata: Read
```

Token này dùng để API trên Vercel cập nhật file registry:

```txt
data/verify-registry.json
```

---

## Cấu trúc thư mục chính

```txt
.
├── api/
│   └── verify.js
├── assets/
│   ├── pfsp-document-hash-verify.js
│   ├── pfsp-trusted-verify-registry.js
│   ├── pfsp-verify-registry-page.js
│   ├── pfsp-worker.js
│   └── pfsp-pro-ui.css
├── data/
│   ├── verify-registry.json
│   └── verify-audit-log.json
├── index.html
├── verify.html
├── verify-registry.html
├── admin-verify.html
├── privacy-center.html
├── document-hash-verify.html
├── compress-pdf.html
├── merge-pdf.html
├── split-pdf.html
├── watermark-pdf.html
├── sign-pdf.html
├── ocr-pdf.html
├── manifest.json
├── sw.js
├── sitemap.xml
└── README.md
```

---

## Deploy lên Vercel

### 1. Upload source lên GitHub

Đẩy toàn bộ project lên repo GitHub.

### 2. Import project vào Vercel

Vào Vercel:

```txt
Add New Project
→ Import Git Repository
→ Deploy
```

### 3. Thêm Environment Variables

Vào:

```txt
Project Settings
→ Environment Variables
```

Thêm đầy đủ biến môi trường.

### 4. Redeploy

Sau khi thêm biến môi trường:

```txt
Deployments
→ Redeploy
```

### 5. Kiểm tra API

Mở:

```txt
https://your-domain.com/api/verify
```

Nếu API sống, nó sẽ trả JSON thay vì 404.

---

## Kiểm tra Verify System

### Test thật

1. Mở app
2. Bật QR Verify
3. Xuất PDF
4. Hệ thống tự auto-register
5. Mở `verify.html?id=PFSP-...`
6. Upload đúng PDF vừa xuất
7. Kết quả phải là:

```txt
GENUINE
```

### Test giả / bị sửa

1. Dùng PDF khác hoặc chỉnh sửa file đã xuất
2. Upload vào trang verify
3. Kết quả phải là:

```txt
FAKE_OR_MODIFIED
```

### Test ID chưa đăng ký

1. Mở link verify với ID không tồn tại
2. Kết quả phải là:

```txt
UNKNOWN
```

### Test thu hồi

1. Vào `admin-verify.html`
2. Nhập admin secret
3. Revoke ID
4. Verify lại
5. Kết quả phải là:

```txt
REVOKED
```

---

## PWA / Offline

Ứng dụng hỗ trợ PWA:

* Có `manifest.json`
* Có service worker `sw.js`
* Có `offline.html`
* Có thể cài lên thiết bị
* Một số chức năng có thể dùng offline

> Verify Registry cần API/server nên phải có mạng để kiểm tra registry thật.

---

## Privacy

PDF Fusion Smart Pro ưu tiên quyền riêng tư:

* Phần lớn xử lý PDF chạy trên trình duyệt
* Không upload file PDF lên server cho các thao tác cơ bản
* Verify chỉ lưu metadata cần thiết:

  * Verify ID
  * SHA-256 hash
  * thời gian đăng ký
  * trạng thái
  * certificate signature
* Không lưu nội dung PDF trong registry

---

## SEO Pages

Project có các landing page phục vụ SEO:

```txt
compress-pdf.html
merge-pdf.html
split-pdf.html
watermark-pdf.html
sign-pdf.html
ocr-pdf.html
document-hash-verify.html
verify-registry.html
privacy-center.html
en.html
```

Có thể mở rộng thêm các trang tiếng Việt:

```txt
nen-pdf.html
gop-pdf.html
tach-pdf.html
dong-dau-pdf.html
ky-pdf-online.html
ocr-pdf-tieng-viet.html
```

---

## Công nghệ sử dụng

* HTML / CSS / JavaScript
* pdf-lib
* PDF.js
* Tesseract.js
* SortableJS
* Mammoth.js
* qrcode-generator
* Web Worker
* Service Worker
* Vercel Serverless Function
* GitHub Contents API
* SHA-256 Web Crypto API

---

## Bảo mật

Khuyến nghị:

* Không public `VERIFY_ADMIN_SECRET`
* Không commit `.env`
* Không để lộ `GITHUB_TOKEN`
* Dùng GitHub fine-grained token
* Giới hạn quyền token ở repo cần thiết
* Bật rate limit cho auto-register
* Chỉ cho phép origin chính thức trong `PFSP_VERIFY_ALLOWED_ORIGINS`
* Backup registry định kỳ

---

## Giới hạn hiện tại

Dự án này cung cấp xác minh kỹ thuật mạnh bằng:

* Verify ID
* SHA-256
* registry
* server signature
* audit log

Tuy nhiên, đây không phải hệ thống chữ ký số pháp lý hoàn chỉnh. Để đạt mức pháp lý cao hơn, cần tích hợp:

* CA / chứng thư số
* timestamp authority
* định danh người ký
* tiêu chuẩn chữ ký số theo khu vực pháp lý
* lưu trữ chứng cứ dài hạn

---

## Roadmap đề xuất

* Domain riêng
* Trang SEO tiếng Việt chuyên sâu
* Verify public API documentation
* Export certificate PDF
* Email certificate
* Multi-tenant registry
* Account system
* Cloud backup registry
* Advanced rate limit
* Registry database thay vì JSON file
* Legal digital signature integration

---

## License

Dự án có thể dùng theo license trong file `LICENSE`.

Nếu chưa có license, nên thêm MIT License hoặc license riêng tùy mục đích sử dụng.

---

## Tác giả

Created by **Nguyen Minh**.

```txt
PDF Fusion Smart Pro
Private-first PDF toolkit with Trusted Verify Registry.
```

---

## Disclaimer
Make by AI
PDF Fusion Smart Pro xử lý và xác minh tài liệu ở mức kỹ thuật. Kết quả verify giúp phát hiện file bị thay đổi hoặc không khớp registry, nhưng không thay thế tư vấn pháp lý, chứng thực công chứng, hoặc chữ ký số hợp chuẩn pháp luật.
