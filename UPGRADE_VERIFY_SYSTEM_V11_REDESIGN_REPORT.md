# Upgrade Report - Verify System v11 Redesign

Date: 2026-06-13
Version: 11.0.0-verify-redesign

## What changed

This upgrade redesigns the whole PDF Fusion Smart Pro Verify System around a clearer trusted-registry workflow:

- New `api/verify.js` API version `11.0.0-verify-redesign`.
- New registry schema `PFSP-VERIFY-REGISTRY-v3`.
- New signature version `PFSP-SERVER-SIGNED-CERT-v3`.
- Redesigned `verify.html` as a focused public verification page.
- Redesigned `admin-verify.html` as a full admin console.
- Rebuilt `assets/pfsp-verify-final-page.js` for URL, manual, certificate, PDF hash and QR-image verification.
- Rebuilt `assets/pfsp-admin-verify.js` for health, integrity, records, audit, backup, register, revoke, restore and expiry actions.
- Rebuilt `assets/pfsp-trusted-verify-registry.js` as the app-side bridge for auto-register and manual admin operations.
- Simplified `assets/pfsp-verify-final-main.js` into a deployment health/status strip.
- Expanded `assets/pfsp-verify-final.css` into a shared v11 design system.
- Updated `package.json`, `vercel.json`, and `data/verify-registry.json`.

## API improvements

### Security

- Removed the old signing-secret fallback to the admin secret.
- Registration/modification now requires `PFSP_VERIFY_SIGNING_SECRET`.
- Admin operations require `PFSP_VERIFY_ADMIN_SECRET` or `VERIFY_ADMIN_SECRET`.
- CORS now reflects configured origins instead of defaulting broadly in production.
- Added stricter response security headers.
- Auto-register still supports public use, but origin allowlist is strongly recommended.

### Registry actions

Supported GET actions:

- `?action=health`
- `?action=stats`
- `?action=integrity`
- `?id=PFSP-...&sha256=...&size=...`

Supported POST actions:

- `verify` / `check`
- `auto-register`
- `register`
- `revoke`
- `restore`
- `set-expiry` / `update-expiry`
- `list` / `records` / `search`
- `audit` / `audit-log`
- `backup` / `snapshot` / `export`
- `integrity`
- `health`

### Durable storage

Primary durable write target remains GitHub Contents API:

- `PFSP_GITHUB_TOKEN`
- `PFSP_GITHUB_OWNER`
- `PFSP_GITHUB_REPO`
- `PFSP_GITHUB_BRANCH`
- `PFSP_REGISTRY_PATH`

Optional local write for development:

- `PFSP_ALLOW_LOCAL_REGISTRY_WRITE=true`

## Required production environment variables

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

Optional:

```txt
PFSP_AUTO_REGISTER_ENABLED=true
PFSP_AUTO_REGISTER_DAILY_LIMIT=120
PFSP_VERIFY_MAX_AUDIT=1000
PFSP_VERIFY_MAX_RECORDS_PUBLIC=5000
```

## Test checklist

1. Run JavaScript syntax check:

```bash
npm run check:js
```

2. Deploy to Vercel staging.
3. Open:

```txt
/api/verify?action=health
```

4. Confirm:

- `githubConfigured: true`
- `signingConfigured: true`
- `adminConfigured: true`
- `allowedOriginsConfigured: true`

5. Export one PDF with QR Verify enabled.
6. Confirm auto-register creates a record in `data/verify-registry.json`.
7. Open `verify.html?id=...`.
8. Upload the original PDF and expect `GENUINE`.
9. Modify the PDF or upload another PDF and expect `FAKE_OR_MODIFIED`.
10. Open `admin-verify.html`, revoke the ID, then verify again and expect `REVOKED`.
11. Restore the ID and verify again.
12. Set expiry, then confirm expired records return `EXPIRED` after the date passes.
13. Use Backup JSON before major registry edits.

## Files backed up

Before the redesign, these files were copied into:

```txt
_pre-verify-v11-redesign-backup/
```

This makes it easy to compare or roll back the previous implementation.
