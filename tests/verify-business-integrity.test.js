'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const crypto = require('crypto');

const handlerPath = path.join(__dirname, '..', 'api', 'verify.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfsp-v15-'));
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
process.chdir(tmp);
process.env.NODE_ENV = 'test';
process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE = 'true';
process.env.PFSP_VERIFY_ADMIN_SECRET = 'admin-secret-test';
process.env.PFSP_VERIFY_SIGNING_SECRET = 'signing-secret-test';
process.env.PFSP_VERIFY_PUBLIC_RATE_LIMIT = '10000';
process.env.PFSP_VERIFY_ADMIN_RATE_LIMIT = '10000';
process.env.PFSP_AUTO_REGISTER_ENABLED = 'true';
process.env.PFSP_VERIFY_ALLOWED_ORIGINS = 'https://allowed.example';
process.env.PFSP_PUBLIC_BASE_URL = 'https://verify.example';

const handler = require(handlerPath);

function registry() {
  return JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'verify-registry.json'), 'utf8'));
}
function mockRequest({ method = 'GET', url = '/api/verify', body, headers = {} } = {}) {
  const raw = body == null ? '' : JSON.stringify(body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: 'verify.example', 'user-agent': 'pfsp-test', ...(raw ? { 'content-type': 'application/json' } : {}), ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}
function mockResponse() {
  const headers = {};
  return {
    statusCode: 200,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    end(value) { this.body = value == null ? '' : String(value); this.finished = true; },
    headers
  };
}
async function call(options) {
  const req = mockRequest(options);
  const res = mockResponse();
  await handler(req, res);
  let json = null;
  try { json = JSON.parse(res.body || '{}'); } catch {}
  return { req, res, json };
}
function adminHeaders(extra = {}) {
  return { 'x-verify-admin-secret': 'admin-secret-test', ...extra };
}

(async () => {
  const hashA = 'a'.repeat(64);
  const hashB = 'b'.repeat(64);
  const hashC = 'c'.repeat(64);

  let out = await call({
    method: 'POST',
    headers: adminHeaders({ 'idempotency-key': 'register-a' }),
    body: {
      action: 'register', id: 'PFSP-20260806-AAAAAA', sha256: hashA, size: 1234, fileName: 'a.pdf',
      userInfo: { fullName: 'Alice', email: 'alice@example.com', phone: '0900', address: 'Secret address' },
      documentInfo: { title: 'Document A' }, policy: { visibility: 'public-metadata' }
    }
  });
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.json.verdict, 'REGISTERED');
  assert.equal(out.json.record.revision, 1);
  assert.equal(out.json.record.userInfo.email, 'alice@example.com');
  assert.equal(registry().registryRevision, 1);

  out = await call({
    method: 'POST', headers: adminHeaders({ 'idempotency-key': 'register-a' }),
    body: { action: 'register', id: 'PFSP-20260806-AAAAAA', sha256: hashA, size: 1234 }
  });
  assert.equal(out.json.verdict, 'IDEMPOTENT_REPLAY');
  assert.equal(registry().registryRevision, 1);

  out = await call({ method: 'GET', url: `/api/verify?action=check&id=PFSP-20260806-AAAAAA&sha256=${hashA}` });
  assert.equal(out.json.verdict, 'GENUINE');
  assert.equal(out.json.record.userInfo.email, undefined);
  assert.equal(out.json.record.userInfo.phone, undefined);
  assert.equal(out.json.record.userInfo.address, undefined);

  out = await call({
    method: 'POST', headers: adminHeaders(),
    body: { action: 'metadata', id: 'PFSP-20260806-AAAAAA', expectedRevision: 0, policy: { visibility: 'private' } }
  });
  assert.equal(out.res.statusCode, 409);
  assert.equal(out.json.verdict, 'STALE_RECORD');

  out = await call({
    method: 'POST', headers: adminHeaders(),
    body: { action: 'metadata', id: 'PFSP-20260806-AAAAAA', expectedRevision: 1, policy: { visibility: 'private' } }
  });
  assert.equal(out.json.verdict, 'METADATA_UPDATED');
  assert.equal(out.json.record.revision, 2);

  out = await call({ method: 'GET', url: `/api/verify?action=check&id=PFSP-20260806-AAAAAA&sha256=${hashA}` });
  assert.equal(out.res.statusCode, 404);
  assert.equal(out.json.verdict, 'UNKNOWN');

  out = await call({ method: 'POST', headers: adminHeaders(), body: { action: 'list', query: 'AAAAAA' } });
  assert.equal(out.json.records.length, 1);
  assert.equal(out.json.records[0].userInfo.email, 'alice@example.com');

  out = await call({
    method: 'POST', headers: adminHeaders(),
    body: { action: 'register', id: 'PFSP-20260806-BBBBBB', sha256: hashB, size: 222, fileName: 'draft.pdf', status: 'draft' }
  });
  assert.equal(out.json.verdict, 'REGISTERED');
  out = await call({ method: 'GET', url: `/api/verify?action=check&id=PFSP-20260806-BBBBBB&sha256=${hashB}` });
  assert.equal(out.json.verdict, 'DRAFT_NOT_TRUSTED');
  assert.equal(out.json.ok, false);

  out = await call({ method: 'POST', headers: adminHeaders(), body: { action: 'revoke', id: 'PFSP-20260806-BBBBBB', expectedRevision: 1, reason: 'Policy violation' } });
  assert.equal(out.json.verdict, 'REVOKE');
  assert.equal(out.json.record.status, 'revoked');
  const revokedRevision = out.json.record.revision;

  out = await call({ method: 'POST', headers: adminHeaders(), body: { action: 'activate', id: 'PFSP-20260806-BBBBBB', expectedRevision: revokedRevision } });
  assert.equal(out.res.statusCode, 409);
  assert.equal(out.json.verdict, 'INVALID_STATE_TRANSITION');

  out = await call({ method: 'POST', headers: adminHeaders(), body: { action: 'restore', id: 'PFSP-20260806-BBBBBB', expectedRevision: revokedRevision } });
  assert.equal(out.json.verdict, 'RESTORE');
  assert.equal(out.json.record.status, 'active');
  assert.equal(out.json.record.revokeReason, '');

  out = await call({ method: 'POST', headers: adminHeaders(), body: { action: 'metadata', id: 'PFSP-20260806-BBBBBB', sha256: hashC } });
  assert.equal(out.res.statusCode, 409);
  assert.equal(out.json.verdict, 'IMMUTABLE_FIELD');

  out = await call({ method: 'POST', headers: adminHeaders(), body: { action: 'update-expiry', id: 'PFSP-20260806-BBBBBB', expiresAt: 'not-a-date' } });
  assert.equal(out.res.statusCode, 400);
  assert.equal(out.json.verdict, 'BAD_EXPIRY');

  process.env.NODE_ENV = 'production';
  delete process.env.PFSP_AUTO_REGISTER_ENABLED;
  out = await call({ method: 'POST', headers: { origin: 'https://allowed.example' }, body: { action: 'auto-register', id: 'PFSP-20260806-CCCCCC', sha256: hashC, size: 333 } });
  assert.equal(out.res.statusCode, 403);
  assert.equal(out.json.verdict, 'AUTO_REGISTER_DISABLED');

  process.env.NODE_ENV = 'test';
  process.env.PFSP_AUTO_REGISTER_ENABLED = 'true';
  out = await call({
    method: 'POST', headers: { origin: 'https://allowed.example' },
    body: { action: 'auto-register', id: 'PFSP-20260806-CCCCCC', sha256: hashC, size: 333, userInfo: { email: 'pii@example.com' } }
  });
  assert.equal(out.res.statusCode, 400);
  assert.equal(out.json.verdict, 'AUTO_REGISTER_PII_BLOCKED');

  out = await call({
    method: 'POST',
    body: { action: 'auto-register', id: 'PFSP-20260806-CCCCCC', sha256: hashC, size: 333, origin: 'https://allowed.example' }
  });
  assert.equal(out.res.statusCode, 403);
  assert.equal(out.json.verdict, 'ORIGIN_NOT_ALLOWED');

  out = await call({
    method: 'POST', headers: { origin: 'https://allowed.exampl' },
    body: { action: 'auto-register', id: 'PFSP-20260806-CCCCCC', sha256: hashC, size: 333 }
  });
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.json.verdict, 'AUTO_REGISTERED');

  out = await call({ method: 'POST', body: { action: 'register', adminSecret: 'admin-secret-test', id: 'PFSP-20260806-DDDDDD', sha256: 'd'.repeat(64), size: 1 } });
  assert.equal(out.res.statusCode, 401);

  out = await call({ method: 'GET', url: '/api/verify?action=integrity' });
  assert.equal(out.json.registryIntegrity.invalidSignatureIds, undefined);
  assert.equal(out.json.registryIntegrity.problems, undefined);
  assert.equal(typeof out.json.registryIntegrity.problemCount, 'number');

  out = await call({ method: 'GET', url: '/api/verify?action=self-test' });
  assert.equal(out.json.env.owner, undefined);
  assert.equal(out.json.env.repo, undefined);

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.PFSP_VERIFY_SIGNING_SECRET = '';
  process.env.PFSP_VERIFY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.PFSP_VERIFY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
  process.env.PFSP_VERIFY_KEY_ID = 'rsa-test-key';
  process.env.PFSP_VERIFY_KEY_ALGORITHM = 'RSA-SHA256';

  out = await call({
    method: 'POST', headers: adminHeaders(),
    body: { action: 'register', id: 'PFSP-20260806-EEEEEE', sha256: 'e'.repeat(64), size: 444, fileName: 'rsa.pdf' }
  });
  assert.equal(out.res.statusCode, 200);
  assert.ok(out.json.record.serverSignature.length > 160, 'RSA signature must not be truncated');

  out = await call({ method: 'GET', url: `/api/verify?action=check&id=PFSP-20260806-EEEEEE&sha256=${'e'.repeat(64)}` });
  assert.equal(out.json.verdict, 'GENUINE');
  assert.equal(out.json.signature.valid, true);

  const internals = handler._internals;
  const clone = { ...out.json.record, keyId: 'unknown-key' };
  const unknownKey = internals.verifyRecordSignature(clone);
  assert.equal(unknownKey.valid, null);
  assert.equal(unknownKey.reason, 'key-id-not-configured');

  console.log('PASS verify v15 business integrity tests');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
