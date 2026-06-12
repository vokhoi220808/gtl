# PDF Fusion Smart Pro - Document Hash Verify Upgrade

Version: 7.0.0-document-hash-verify

## Added

- `assets/pfsp-document-hash-verify.js`
  - Creates local SHA-256 certificates for exported PDF files.
  - Adds a Document Hash Verify panel under QR Verification ID.
  - Can calculate source bundle hashes for selected input files.
  - Can copy a hash verification link and download `.verify-certificate.json`.

- `verify.html` upgraded
  - Verifies QR ID/checksum.
  - Accepts PDF upload and computes SHA-256 locally in the browser.
  - Accepts JSON certificate upload.
  - Compares uploaded PDF hash with the link/certificate hash.
  - Supports Vietnamese and English UI.

- `document-hash-verify.html`
  - SEO/trust page explaining SHA-256 verification.

## Important security note

This is a client-side integrity verification feature. It checks whether an uploaded PDF matches a SHA-256 hash from a verification link or certificate. Because this project has no backend and no private signing key, the certificate/link must come from a trusted source. It is not a legal digital signature system.

## Files preserved

No original files were deleted. Pre-upgrade copies were added in `_pre-document-hash-verify-backup/`.
