# Deploy PDF Fusion Smart Pro with Verify System v11

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Upgrade Verify System v11 redesign"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

Do not commit `.env`, tokens, admin secrets or signing secrets.

## 2. Import repo into Vercel

Use Vercel → Add New Project → Import Git Repository.

Recommended settings:

```txt
Framework Preset: Other
Build Command: empty
Output Directory: empty or .
Install Command: empty or npm install
```

The frontend is static HTML/CSS/JS. The verify API runs from `api/verify.js`.

## 3. Add Vercel environment variables

Required for production:

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

Development-only local writes:

```txt
PFSP_ALLOW_LOCAL_REGISTRY_WRITE=true
```

Do not enable local writes for normal Vercel production. Use GitHub env vars instead.

## 4. Health check

Open:

```txt
https://your-project.vercel.app/api/verify?action=health
```

You want:

```txt
githubConfigured: true
signingConfigured: true
adminConfigured: true
allowedOriginsConfigured: true
```

If `signingConfigured` is false, registration and record modifications will be blocked.

## 5. End-to-end test

1. Open the app.
2. Enable QR Verify and document hash.
3. Export a PDF.
4. Confirm auto-register returns `AUTO_REGISTERED` or `ALREADY_REGISTERED`.
5. Open the short verify link.
6. Upload the original PDF and expect `GENUINE`.
7. Upload a different/modified PDF and expect `FAKE_OR_MODIFIED`.
8. Open `admin-verify.html`.
9. Load records.
10. Revoke a test record and verify it returns `REVOKED`.
11. Restore the record and verify again.
12. Create a backup JSON from the admin console.

## 6. GitHub token notes

Use a fine-grained GitHub token scoped only to the repository that contains `data/verify-registry.json`. It needs read/write contents permission.

## 7. Production safety notes

- Keep `PFSP_VERIFY_SIGNING_SECRET` separate from `PFSP_VERIFY_ADMIN_SECRET`.
- Set `PFSP_VERIFY_ALLOWED_ORIGINS` and `PFSP_CORS_ORIGIN` to your real production domain.
- Do not expose the admin secret in code.
- Do not put admin pages in public navigation if you do not want casual discovery.
- Backup the registry before bulk edits.
