# UPGRADE VERIFY SYSTEM V12 BIG UPDATE REPORT

## Version

`12.0.0-verify-big-update`

## Nguyên tắc thực hiện

- Giữ nguyên các phần PDF tool hiện có.
- Không xóa backup cũ.
- Tạo backup mới trước khi ghi đè file Verify System: `_pre-verify-system-v12-big-update-backup/`.
- Chỉ thay thế các file cần thiết để nâng cấp Verify System.

## File đã nâng cấp

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
package.json
vercel.json
README.md
DEPLOY.md
VERSION.txt
```

## API mới / nâng cấp

- Registry schema `PFSP-VERIFY-REGISTRY-v4`.
- Certificate signature `PFSP-SERVER-SIGNED-CERT-v4`.
- Verify chữ ký v3 legacy khi record cũ còn tồn tại.
- Trust Score 0-100.
- Trust checks chi tiết.
- Timeline theo record.
- `lookup-hash`.
- `certificate` export.
- `batch-verify`.
- `bulk-register`.
- `suspend` / `activate`.
- `update-note` metadata.
- `repair` / `resign` có dry-run.
- `self-test` diagnostics.
- `generate-id`.

## UI mới

### verify.html

- Hero v12.
- Trust score meter.
- API health và self-test.
- Upload PDF SHA-256 local.
- Upload certificate JSON.
- Dán URL/JSON/manual.
- QR image reader nếu trình duyệt hỗ trợ BarcodeDetector.
- Batch verify.
- Trust checks.
- Timeline.
- Payload dump.
- Download certificate / payload.

### admin-verify.html

- Metrics tổng record / signed / integrity.
- Health, diagnostics, integrity, audit, backup.
- Repair preview và repair write.
- Record table có revoke/suspend/restore/expiry/cert/copy.
- Register manual có generate ID và dry-run.
- Bulk register có dry-run.
- Batch verify.
- Hash lookup.
- Certificate export.
- Metadata editor.

## App bridge

`assets/pfsp-trusted-verify-registry.js` đã nâng cấp:

- Nhận v12 API.
- Giữ tương thích secret/local records v11.
- Local queue retry khi auto-register lỗi.
- Flush queue thủ công.
- Lookup hash từ app.
- Suspend/revoke/restore từ panel app.

## Kiểm tra đã chạy

```bash
npm run check:js
```

Kết quả: toàn bộ file JavaScript qua syntax check.

## Ghi chú deploy

Sau khi push GitHub và deploy Vercel, mở:

```txt
/api/verify?action=self-test
```

Nếu còn warning về GitHub/signing/admin/origin, cần bổ sung env vars trong Vercel rồi redeploy.
