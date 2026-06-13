#!/usr/bin/env node
/* PDF Fusion Verify System v14 E2E smoke tests - no external dependencies. */
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

process.env.PFSP_VERIFY_SIGNING_SECRET = process.env.PFSP_VERIFY_SIGNING_SECRET || 'local-e2e-signing-secret-change-me';
process.env.PFSP_VERIFY_ADMIN_SECRET = process.env.PFSP_VERIFY_ADMIN_SECRET || 'local-e2e-admin-secret-change-me';
process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE = 'true';
process.env.PFSP_VERIFY_ALLOWED_ORIGINS = process.env.PFSP_VERIFY_ALLOWED_ORIGINS || 'https://example.test';
process.env.PFSP_PUBLIC_BASE_URL = process.env.PFSP_PUBLIC_BASE_URL || 'https://example.test';

const handler = require('../api/verify.js');
const registryPath = path.join(process.cwd(), 'data', 'verify-registry.json');
const originalRegistry = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : '';

function makeReq(method, url, body, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { origin: 'https://example.test', 'user-agent': 'pfsp-e2e', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  process.nextTick(() => {
    if (body != null) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}
function call(method, url, body, headers = {}) {
  return new Promise(resolve => {
    const req = makeReq(method, url, body, headers);
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(text) { resolve({ statusCode: this.statusCode || 200, headers: this.headers, body: JSON.parse(text || '{}') }); },
      set statusCode(v) { this._status = v; },
      get statusCode() { return this._status || 200; }
    };
    handler(req, res);
  });
}
function assert(ok, message, detail) {
  if (!ok) {
    console.error('FAIL:', message);
    if (detail) console.error(JSON.stringify(detail, null, 2));
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log('PASS:', message);
}
(async () => {
  try {
    const health = await call('GET', '/api/verify?action=health');
    assert(health.body.ok && health.body.env.apiVersion.includes('14.4.0'), 'health endpoint reports v14');

    const gen = await call('GET', '/api/verify?action=generate-id');
    assert(/^PFSP-/.test(gen.body.id || ''), 'generate-id returns PFSP ID', gen.body);

    const sha = 'a'.repeat(64);
    const register = await call('POST', '/api/verify', {
      action: 'register',
      adminSecret: process.env.PFSP_VERIFY_ADMIN_SECRET,
      id: gen.body.id,
      sha256: sha,
      fileName: 'enterprise-document.pdf',
      size: 12345,
      origin: 'https://example.test',
      documentInfo: {
        title: 'Enterprise E2E Document',
        documentType: 'Test Certificate',
        documentNumber: 'E2E-001',
        customFields: [{ label: 'Workflow', value: 'Automated smoke test' }]
      },
      userInfo: { fullName: 'E2E User', organization: 'PDF Fusion Lab', role: 'Tester' },
      extraInfo: { workflow: 'Approved' }
    });
    assert(['REGISTERED', 'MANUAL_REGISTRY_PATCH_REQUIRED'].includes(register.body.verdict), 'register accepts Document Information', register.body);
    assert(register.body.record?.documentInfo?.title === 'Enterprise E2E Document', 'record keeps documentInfo.title', register.body.record);
    assert(register.body.record?.userInfo?.fullName === 'E2E User', 'record keeps userInfo.fullName', register.body.record);

    const verify = await call('GET', `/api/verify?id=${encodeURIComponent(gen.body.id)}&sha256=${sha}&size=12345`);
    assert(verify.body.verdict === 'GENUINE', 'verify confirms ID + SHA-256', verify.body);
    assert(verify.body.record?.documentInfo?.documentNumber === 'E2E-001', 'verify returns full Document Information', verify.body.record);

    const cert = await call('GET', `/api/verify?action=printable-certificate&id=${encodeURIComponent(gen.body.id)}`);
    assert(cert.body.certificate?.documentInfo?.title === 'Enterprise E2E Document', 'printable certificate includes Document Information', cert.body.certificate);

    const analytics = await call('POST', '/api/verify', { action: 'analytics', adminSecret: process.env.PFSP_VERIFY_ADMIN_SECRET });
    assert(analytics.body.verdict === 'ANALYTICS', 'admin analytics endpoint works', analytics.body);

    const bulk = await call('POST', '/api/verify', { action: 'bulk-action', operation: 'suspend', ids: [gen.body.id], dryRun: true, adminSecret: process.env.PFSP_VERIFY_ADMIN_SECRET });
    assert(bulk.body.verdict === 'BULK_ACTION_DRY_RUN', 'bulk-action dry run works', bulk.body);
  } finally {
    if (originalRegistry) fs.writeFileSync(registryPath, originalRegistry, 'utf8');
  }
})().catch(err => {
  if (originalRegistry) fs.writeFileSync(registryPath, originalRegistry, 'utf8');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
