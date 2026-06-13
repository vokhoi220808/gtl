# QR Verify Fix Report

## Nội dung sửa

- Nâng cấp QR Verification payload từ `verify.html?id=...` sang `verify.html?id=...&ts=...&o=...&ck=...`.
- Thêm checksum cục bộ để phát hiện QR/link bị thiếu hoặc sai dữ liệu.
- Viết lại `verify.html` thành trang kiểm tra QR rõ ràng hơn.
- Thêm kiểm tra thủ công: dán ID hoặc link QR để xác minh.
- Thêm đọc QR từ ảnh bằng `BarcodeDetector` nếu trình duyệt hỗ trợ.
- Thêm giao diện song ngữ Tiếng Việt / English cho trang verify.
- Bump Service Worker version lên `6.1.0-qr-verify-fix` để tránh cache cũ.

## Giới hạn quan trọng

Đây là xác minh QR/ID/checksum chạy hoàn toàn trên trình duyệt. Nó không phải chữ ký số pháp lý. Muốn xác minh chống giả mạo thật sự cần backend lưu hash tài liệu, thời gian tạo, lịch sử và chữ ký số.
