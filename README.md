# PDF Fusion Smart Pro Universal

> Bộ công cụ PDF đa năng chạy hoàn toàn trong trình duyệt.
>
> Gộp PDF, tách PDF, OCR tiếng Việt, chỉnh sửa trực tiếp trên trang PDF, ký điện tử, đóng dấu, watermark, quản lý trang bằng thumbnail, xuất Word, PWA Offline và lưu project bằng IndexedDB.

---

## ✨ Tính năng chính

### 📄 Xử lý PDF

* Gộp nhiều PDF thành một file
* Chọn phạm vi trang khi gộp
* Xoay trang PDF
* Thêm trang bìa
* Tạo mục lục tự động
* Thêm trang phân cách giữa các tài liệu
* Đánh số trang
* Chèn trang trắng tự động cho tài liệu có số trang lẻ

### ✂️ Tách PDF

* Tách từng trang thành file PDF riêng
* Trích xuất khoảng trang
* Chia PDF thành các cụm N trang

### 🧩 Page Manager

* Hiển thị thumbnail từng trang
* Kéo thả để đổi thứ tự trang
* Chọn nhiều trang
* Xóa trang
* Khôi phục trang
* Xoay trang riêng lẻ
* Xuất các trang được chọn

### 🔎 OCR Tiếng Việt

* OCR PDF scan bằng Tesseract.js
* Hỗ trợ:

  * Tiếng Việt
  * English
  * Tiếng Việt + English
* Xuất kết quả OCR ra TXT

### ✍️ Live PDF Editor

* Render trang PDF thật
* Thêm văn bản
* Thêm stamp
* Thêm logo
* Thêm chữ ký
* Kéo thả đối tượng trực tiếp trên trang

### 🖋️ Chữ ký điện tử

* Vẽ tay trên canvas
* Tải ảnh chữ ký PNG/JPG
* Chữ ký dạng text
* Áp dụng:

  * Tất cả trang
  * Trang đầu
  * Trang cuối
  * Phạm vi tùy chọn

### 🏷️ Watermark

* Văn bản tùy chỉnh
* Điều chỉnh:

  * Kích thước
  * Độ mờ
  * Góc xoay

### 📌 Đóng dấu hàng loạt

Hỗ trợ biến động:

* `{seq}` : số thứ tự
* `{date}` : ngày hiện tại
* `{page}` : số trang hiện tại
* `{total}` : tổng số trang

Ví dụ:

```text
Số CV: {seq}
Ngày: {date}
Mã hồ sơ: HS-{seq}
```

### 🖼️ Logo và hình ảnh

* Chèn logo PNG/JPG
* Điều chỉnh:

  * Kích thước
  * Vị trí
  * Độ mờ
  * Margin

### 📋 PDF Form

Tạo trường nhập liệu:

* Text Box
* Checkbox
* Date Field

### 📝 DOCX

* Đọc DOCX bằng Mammoth.js
* Gộp nhiều file Word
* Xuất DOCX mới
* Giữ nội dung tiếng Việt Unicode

### 🇻🇳 Hỗ trợ tiếng Việt

* Nhúng font Noto Sans Unicode
* Giữ dấu tiếng Việt khi xuất PDF
* Fallback khi không tải được font

### 💾 Lưu Project

Lưu toàn bộ:

* Danh sách file
* Cấu hình
* Page Manager
* OCR
* Editor Objects

vào IndexedDB.

### 📱 Progressive Web App (PWA)

* Cài như ứng dụng desktop/mobile
* Hỗ trợ Offline
* Service Worker Cache
* Manifest chuẩn

---

## 🛠 Công nghệ sử dụng

| Thư viện       | Chức năng          |
| -------------- | ------------------ |
| pdf-lib        | Xử lý PDF          |
| pdf.js         | Render PDF         |
| Tesseract.js   | OCR                |
| Mammoth.js     | Đọc DOCX           |
| docx.js        | Xuất DOCX          |
| SortableJS     | Kéo thả            |
| Fontkit        | Nhúng font Unicode |
| IndexedDB      | Lưu Project        |
| Service Worker | Offline Cache      |

---

## 🚀 Chạy dự án

### Cách 1: Local Server

```bash
python -m http.server 8000
```

Sau đó mở:

```text
http://localhost:8000
```

### Cách 2: VS Code

Cài extension:

```text
Live Server
```

Sau đó:

```text
Right Click -> Open with Live Server
```

---

## 📁 Cấu trúc

```text
project/
│
├── pdf-fusion-smart-pro-universal-pro-suite.html
├── pdf-fusion-sw.js
├── pdf-fusion-manifest.json
│
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
│
└── screenshots/
    └── main.png
```

---

## ⚠️ Giới hạn hiện tại

### Mã hóa PDF

Ứng dụng hiện:

* KHÔNG mã hóa PDF thật
* KHÔNG khóa in/copy thật

Các tùy chọn mật khẩu hiện tại chỉ tạo cấu hình hoặc lệnh qpdf.

Muốn bảo mật thực sự cần:

* qpdf
* Ghostscript
* PDFium
* Backend xử lý PDF

### OCR

* Chạy hoàn toàn trong trình duyệt
* PDF lớn có thể xử lý chậm
* Tốn RAM với tài liệu nhiều trang

### DOCX

Hiện mới ưu tiên:

* Nội dung văn bản
* Unicode tiếng Việt

Chưa tái tạo hoàn toàn:

* Header/Footer
* Bảng phức tạp
* Layout nâng cao
* SmartArt

---

## 🔒 Quyền riêng tư

Mọi xử lý được thực hiện trên thiết bị người dùng.

Không có:

* Upload file lên server
* Theo dõi người dùng
* Gửi dữ liệu ra bên ngoài

Ngoại trừ việc tải thư viện và font từ CDN khi chưa có cache.

---

## 📄 Giấy phép

MIT License

Copyright (c) 2026

PDF Fusion Smart Pro Universal
