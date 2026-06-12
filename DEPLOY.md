# Hướng dẫn deploy nhanh

## Chạy local

```bash
python -m http.server 5500
```

Mở:

```txt
http://localhost:5500
```

Không nên mở trực tiếp bằng `file://` vì service worker/PWA chỉ hoạt động trên HTTPS hoặc localhost.

## Netlify

1. Giải nén project.
2. Kéo thả thư mục `gtl-main` lên Netlify Drop.
3. Netlify sẽ tự đọc `_headers`, `_redirects` và `netlify.toml`.

## Vercel

1. Import repository hoặc kéo thả project.
2. Framework preset: Other.
3. Output directory: để trống hoặc `.`.
4. Vercel sẽ đọc `vercel.json`.

## GitHub Pages

1. Upload toàn bộ nội dung thư mục lên repository.
2. Bật Pages trong Settings.
3. File `.nojekyll` đã được thêm để GitHub Pages không bỏ qua asset tĩnh.

## Kiểm tra sau deploy

- Mở DevTools > Application > Manifest: không còn lỗi `start_url`.
- DevTools > Application > Service Workers: thấy `sw.js` đã đăng ký.
- Tắt mạng thử mở lại app: trang offline/cache hoạt động.
- Test các luồng chính: gộp PDF, tách PDF, ký, watermark, OCR, QR.
