// PDF Fusion Smart Pro - Verify System v13 Trust Portal + v12.2 Hardening
// Serverless trusted registry API for Vercel/GitHub Pages frontend.
// No external npm dependencies. Stores metadata only, never PDF files.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_VERSION = '13.0.0-trust-portal';
const REGISTRY_VERSION = 'PFSP-VERIFY-REGISTRY-v4';
const LEGACY_REGISTRY_VERSIONS = ['PFSP-VERIFY-REGISTRY-v3'];
const SIGNATURE_VERSION = 'PFSP-SERVER-SIGNED-CERT-v4';
const LEGACY_SIGNATURE_VERSIONS = ['PFSP-SERVER-SIGNED-CERT-v3'];
const SIGNATURE_ALGORITHM = 'HMAC-SHA256';
const LOCAL_REGISTRY_PATH = path.join(process.cwd(), 'data', 'verify-registry.json');
const MAX_BODY = Number(process.env.PFSP_VERIFY_MAX_BODY || 1024 * 1024);
const MAX_AUDIT = Number(process.env.PFSP_VERIFY_MAX_AUDIT || 1500);
const MAX_HISTORY = Number(process.env.PFSP_VERIFY_MAX_HISTORY || 80);
const MAX_PUBLIC_RECORDS = Number(process.env.PFSP_VERIFY_MAX_RECORDS_PUBLIC || 5000);
const MAX_BATCH = Number(process.env.PFSP_VERIFY_MAX_BATCH || 80);
const MAX_BULK_REGISTER = Number(process.env.PFSP_VERIFY_MAX_BULK_REGISTER || 150);
const AUTO_REGISTER_DAILY_LIMIT = Number(process.env.PFSP_AUTO_REGISTER_DAILY_LIMIT || 120);
const RATE_LIMIT_WINDOW_MS = Number(process.env.PFSP_VERIFY_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const PUBLIC_RATE_LIMIT = Number(process.env.PFSP_VERIFY_PUBLIC_RATE_LIMIT || 240);
const ADMIN_RATE_LIMIT = Number(process.env.PFSP_VERIFY_ADMIN_RATE_LIMIT || 90);
const MAX_PORTAL_SEARCH = Number(process.env.PFSP_VERIFY_PORTAL_SEARCH_LIMIT || 80);
const rateBuckets = new Map();

function cleanString(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}
function lower(value, max = 500) {
  return cleanString(value, max).toLowerCase();
}
function normalizeHash(value) {
  return cleanString(value, 300).toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 64);
}
function normalizeSize(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function nowIso() {
  return new Date().toISOString();
}
function safeDate(value) {
  const raw = cleanString(value, 160);
  if (!raw) return '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off', 'disabled'].includes(String(value).toLowerCase());
}
function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}
function hmacText(secret, text) {
  return crypto.createHmac('sha256', secret).update(String(text || ''), 'utf8').digest('hex');
}
function validId(id) {
  const s = cleanString(id, 120).toUpperCase();
  return /^PFSP-\d{8}-[A-Z0-9]{6,28}$/.test(s) || /^PFSP-[A-Z0-9][A-Z0-9-]{7,90}$/.test(s);
}
function validHash(hash) {
  return /^[a-f0-9]{64}$/i.test(String(hash || ''));
}
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
function splitList(value) {
  return cleanString(value, 8000).split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
}
function normalizeTags(value) {
  const arr = Array.isArray(value) ? value : cleanString(value, 1000).split(',');
  return [...new Set(arr.map(x => cleanString(x, 40)).filter(Boolean))].slice(0, 30);
}
function allowedOrigins() {
  const values = [
    ...splitList(process.env.PFSP_VERIFY_ALLOWED_ORIGINS),
    ...splitList(process.env.PFSP_CORS_ORIGIN)
  ];
  return [...new Set(values)];
}
function requestOrigin(req, body = {}) {
  return cleanString(req.headers.origin || body.origin || body?.certificate?.origin || body?.record?.origin || '', 500).replace(/\/$/, '');
}
function setCors(req, res) {
  const origin = cleanString(req.headers.origin, 500).replace(/\/$/, '');
  const allow = allowedOrigins();
  const allowWildcard = parseBool(process.env.PFSP_ALLOW_WILDCARD_CORS, false);
  let reflected = '';
  if (origin && allow.includes(origin)) reflected = origin;
  else if (!allow.length && allowWildcard) reflected = '*';
  else if (!allow.length && process.env.NODE_ENV !== 'production') reflected = origin || '*';
  if (reflected) res.setHeader('Access-Control-Allow-Origin', reflected);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Verify-Admin-Secret, X-PFSP-Auto-Register, X-PFSP-Request-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function send(req, res, status, payload) {
  setCors(req, res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-PFSP-Verify-Version', API_VERSION);
  res.setHeader('X-PFSP-Request-Id', requestId(req));
  res.end(JSON.stringify({ apiVersion: API_VERSION, ...payload }, null, 2));
}
function clientIp(req) {
  return cleanString(String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '', 160);
}
function clientIpHash(req) {
  const ip = clientIp(req);
  return ip ? sha256Text(ip).slice(0, 24).toUpperCase() : '';
}
function userAgentHash(req) {
  return req.headers['user-agent'] ? sha256Text(req.headers['user-agent']).slice(0, 24).toUpperCase() : '';
}

function requestId(req) {
  const supplied = cleanString(req.headers['x-pfsp-request-id'] || '', 120);
  return supplied || 'PFSP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}
function rateLimitKey(req, scope) {
  return [scope || 'public', clientIpHash(req) || 'unknown'].join(':');
}
function checkRateLimit(req, scope = 'public') {
  const limit = scope === 'admin' ? ADMIN_RATE_LIMIT : PUBLIC_RATE_LIMIT;
  if (!limit || limit < 1) return { ok: true, limit: 0, remaining: null, resetAt: '' };
  const now = Date.now();
  const key = rateLimitKey(req, scope);
  const bucket = rateBuckets.get(key) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now > v.reset) rateBuckets.delete(k);
  }
  return {
    ok: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: new Date(bucket.reset).toISOString(),
    scope
  };
}
function rateLimitHeaders(res, info) {
  if (!info || !info.limit) return;
  res.setHeader('X-RateLimit-Limit', String(info.limit));
  res.setHeader('X-RateLimit-Remaining', String(info.remaining));
  res.setHeader('X-RateLimit-Reset', info.resetAt);
}
function applyRateLimit(req, res, scope = 'public') {
  const info = checkRateLimit(req, scope);
  rateLimitHeaders(res, info);
  if (info.ok) return true;
  send(req, res, 429, { ok: false, verdict: 'RATE_LIMITED', level: 'bad', message: 'Too many verify requests. Please wait and try again.', rateLimit: info });
  return false;
}

function getBaseUrl(req, record = {}) {
  const env = cleanString(process.env.PFSP_PUBLIC_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || '', 300);
  if (env) return env.startsWith('http') ? env.replace(/\/$/, '') : 'https://' + env.replace(/\/$/, '');
  const origin = cleanString(record.origin || req.headers.origin || '', 300);
  if (/^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  const host = cleanString(req.headers.host || '', 200);
  return host ? 'https://' + host : '';
}
function shortVerifyUrl(req, record) {
  const base = getBaseUrl(req, record);
  return (base || '.') + '/verify.html?id=' + encodeURIComponent(record.id);
}
function verifyUrlWithHash(req, record) {
  const base = getBaseUrl(req, record);
  const q = new URLSearchParams({ id: record.id, sha256: record.sha256 });
  if (record.size != null) q.set('size', String(record.size));
  return (base || '.') + '/verify.html?' + q.toString();
}
function signingSecret() {
  return process.env.PFSP_VERIFY_SIGNING_SECRET || process.env.VERIFY_SIGNING_SECRET || '';
}
function adminSecret() {
  return process.env.PFSP_VERIFY_ADMIN_SECRET || process.env.VERIFY_ADMIN_SECRET || '';
}
function generateVerifyId(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(8).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12);
  return `PFSP-${ymd}-${random}`;
}

function legacyCanonicalRecord(record) {
  return stableStringify({
    id: cleanString(record.id, 120).toUpperCase(),
    sha256: normalizeHash(record.sha256),
    size: normalizeSize(record.size),
    fileName: cleanString(record.fileName, 240),
    mimeType: cleanString(record.mimeType || 'application/pdf', 100),
    createdAt: safeDate(record.createdAt) || cleanString(record.createdAt, 120),
    registeredAt: safeDate(record.registeredAt) || cleanString(record.registeredAt, 120),
    updatedAt: safeDate(record.updatedAt) || cleanString(record.updatedAt, 120),
    origin: cleanString(record.origin, 500),
    app: cleanString(record.app || 'PDF Fusion Smart Pro', 120),
    appVersion: cleanString(record.appVersion || record.version || '', 120),
    sourceBundleSha256: normalizeHash(record.sourceBundleSha256 || record.sourceHash || record.sh),
    checksum: cleanString(record.checksum || record.hck || '', 120),
    status: lower(record.status || 'active', 40),
    expiresAt: safeDate(record.expiresAt),
    revokedAt: safeDate(record.revokedAt),
    restoredAt: safeDate(record.restoredAt),
    revokeReason: cleanString(record.revokeReason, 300),
    registrationMode: cleanString(record.registrationMode, 80),
    registeredBy: cleanString(record.registeredBy, 120),
    note: cleanString(record.note, 500),
    fingerprint: cleanString(record.fingerprint, 80)
  });
}
function canonicalRecord(record) {
  return stableStringify({
    id: cleanString(record.id, 120).toUpperCase(),
    sha256: normalizeHash(record.sha256),
    size: normalizeSize(record.size),
    fileName: cleanString(record.fileName, 240),
    mimeType: cleanString(record.mimeType || 'application/pdf', 100),
    createdAt: safeDate(record.createdAt) || cleanString(record.createdAt, 120),
    registeredAt: safeDate(record.registeredAt) || cleanString(record.registeredAt, 120),
    updatedAt: safeDate(record.updatedAt) || cleanString(record.updatedAt, 120),
    origin: cleanString(record.origin, 500),
    app: cleanString(record.app || 'PDF Fusion Smart Pro', 120),
    appVersion: cleanString(record.appVersion || record.version || '', 120),
    sourceBundleSha256: normalizeHash(record.sourceBundleSha256 || record.sourceHash || record.sh),
    checksum: cleanString(record.checksum || record.hck || '', 120),
    status: lower(record.status || 'active', 40),
    expiresAt: safeDate(record.expiresAt),
    revokedAt: safeDate(record.revokedAt),
    restoredAt: safeDate(record.restoredAt),
    suspendReason: cleanString(record.suspendReason, 300),
    suspendedAt: safeDate(record.suspendedAt),
    revokeReason: cleanString(record.revokeReason, 300),
    registrationMode: cleanString(record.registrationMode, 80),
    registeredBy: cleanString(record.registeredBy, 120),
    owner: cleanString(record.owner, 160),
    project: cleanString(record.project, 160),
    documentTitle: cleanString(record.documentTitle, 240),
    tags: normalizeTags(record.tags),
    note: cleanString(record.note, 800),
    fingerprint: cleanString(record.fingerprint, 80),
    policy: {
      retention: cleanString(record.policy?.retention || record.retention || '', 80),
      visibility: cleanString(record.policy?.visibility || record.visibility || 'public-metadata', 80)
    }
  });
}
function signRecord(record) {
  const secret = signingSecret();
  if (!secret) return '';
  return hmacText(secret, SIGNATURE_VERSION + '|' + canonicalRecord(record));
}
function expectedSignatures(record) {
  const secret = signingSecret();
  if (!secret) return [];
  const versions = [...new Set([record.signatureVersion, SIGNATURE_VERSION, ...LEGACY_SIGNATURE_VERSIONS].filter(Boolean))];
  const canonicals = [canonicalRecord(record), legacyCanonicalRecord(record)];
  const pairs = [];
  for (const version of versions) {
    for (const canonical of canonicals) pairs.push({ version, signature: hmacText(secret, version + '|' + canonical) });
  }
  return pairs;
}
function verifyRecordSignature(record) {
  if (!record || !record.serverSignature) return { present: false, valid: null, reason: 'missing-signature' };
  const candidates = expectedSignatures(record);
  if (!candidates.length) return { present: true, valid: null, reason: 'signing-secret-not-configured' };
  try {
    const actual = Buffer.from(String(record.serverSignature), 'hex');
    for (const candidate of candidates) {
      const expected = Buffer.from(candidate.signature, 'hex');
      if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
        return { present: true, valid: true, algorithm: SIGNATURE_ALGORITHM, version: candidate.version, compatibility: candidate.version === SIGNATURE_VERSION ? 'current' : 'legacy-compatible' };
      }
    }
    return { present: true, valid: false, reason: 'signature-mismatch', algorithm: SIGNATURE_ALGORITHM, version: record.signatureVersion || SIGNATURE_VERSION };
  } catch (err) {
    return { present: true, valid: false, reason: 'bad-signature-format' };
  }
}
function requireSigning(req, res) {
  if (signingSecret()) return true;
  send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'PFSP_VERIFY_SIGNING_SECRET is required before records can be registered or modified.' });
  return false;
}

function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    schemaVersion: 4,
    updatedAt: nowIso(),
    settings: {
      shortQr: true,
      serverSigned: true,
      auditLog: true,
      autoRegister: true,
      expirySupported: true,
      revokeReasonSupported: true,
      historySupported: true,
      batchVerifySupported: true,
      lookupHashSupported: true,
      bulkRegisterSupported: true,
      trustScoreSupported: true,
      publicTrustPortal: true,
      publicSearchSupported: true,
      badgeSupported: true,
      printableCertificateSupported: true,
      rateLimitSupported: true,
      schema: 'v4'
    },
    records: [],
    auditLog: [],
    snapshots: [],
    integrity: null
  };
}
function historyItem(action, details = {}) {
  return {
    time: nowIso(),
    action: cleanString(action, 80),
    actor: cleanString(details.actor || '', 120),
    result: cleanString(details.result || '', 80),
    message: cleanString(details.message || '', 500),
    sha256: normalizeHash(details.sha256),
    status: cleanString(details.status || '', 40),
    origin: cleanString(details.origin || '', 500)
  };
}
function pushHistory(record, action, details = {}) {
  record.history = Array.isArray(record.history) ? record.history : [];
  record.history.unshift(historyItem(action, details));
  record.history = record.history.slice(0, MAX_HISTORY);
}
function normalizeRecord(record) {
  const r = record && typeof record === 'object' ? { ...record } : {};
  r.id = cleanString(r.id || r.verifyId || '', 120).toUpperCase();
  r.sha256 = normalizeHash(r.sha256 || r.hash || r.h);
  r.size = normalizeSize(r.size);
  r.fileName = cleanString(r.fileName || r.name || 'document.pdf', 240);
  r.mimeType = cleanString(r.mimeType || 'application/pdf', 100);
  r.createdAt = safeDate(r.createdAt || r.ts) || cleanString(r.createdAt || r.ts || '', 160);
  r.registeredAt = safeDate(r.registeredAt) || cleanString(r.registeredAt || '', 160);
  r.updatedAt = safeDate(r.updatedAt) || cleanString(r.updatedAt || '', 160);
  r.origin = cleanString(r.origin || r.o || '', 500).replace(/\/$/, '');
  r.app = cleanString(r.app || 'PDF Fusion Smart Pro', 120);
  r.appVersion = cleanString(r.appVersion || r.version || '', 120);
  r.sourceBundleSha256 = normalizeHash(r.sourceBundleSha256 || r.sourceHash || r.sh);
  r.checksum = cleanString(r.checksum || r.hck || '', 120);
  r.status = lower(r.status || 'active', 40) || 'active';
  if (!['active', 'revoked', 'suspended', 'draft', 'archived'].includes(r.status)) r.status = 'active';
  r.expiresAt = safeDate(r.expiresAt);
  r.revokedAt = safeDate(r.revokedAt);
  r.restoredAt = safeDate(r.restoredAt);
  r.suspendedAt = safeDate(r.suspendedAt);
  r.revokeReason = cleanString(r.revokeReason || '', 300);
  r.suspendReason = cleanString(r.suspendReason || '', 300);
  r.registrationMode = cleanString(r.registrationMode || '', 80);
  r.registeredBy = cleanString(r.registeredBy || '', 120);
  r.owner = cleanString(r.owner || '', 160);
  r.project = cleanString(r.project || '', 160);
  r.documentTitle = cleanString(r.documentTitle || '', 240);
  r.tags = normalizeTags(r.tags);
  r.note = cleanString(r.note || '', 800);
  r.fingerprint = cleanString(r.fingerprint || '', 80);
  r.shortVerifyUrl = cleanString(r.shortVerifyUrl || '', 500);
  r.verifyUrl = cleanString(r.verifyUrl || '', 800);
  r.certificateSignature = cleanString(r.certificateSignature || r.serverSignature || '', 160);
  r.serverSignature = cleanString(r.serverSignature || r.certificateSignature || '', 160);
  r.signatureVersion = cleanString(r.signatureVersion || (r.serverSignature ? 'PFSP-SERVER-SIGNED-CERT-v3' : SIGNATURE_VERSION), 80);
  r.signatureAlgorithm = cleanString(r.signatureAlgorithm || SIGNATURE_ALGORITHM, 80);
  r.policy = {
    retention: cleanString(r.policy?.retention || r.retention || '', 80),
    visibility: cleanString(r.policy?.visibility || r.visibility || 'public-metadata', 80)
  };
  r.history = Array.isArray(r.history) ? r.history.map(x => historyItem(x.action || 'legacy', x)).slice(0, MAX_HISTORY) : [];
  return r;
}
function normalizeRegistry(input) {
  const base = emptyRegistry();
  const src = input && typeof input === 'object' ? input : {};
  base.version = src.version || base.version;
  base.schemaVersion = Number(src.schemaVersion || src.schema || 4) || 4;
  base.updatedAt = safeDate(src.updatedAt) || src.updatedAt || base.updatedAt;
  base.settings = { ...base.settings, ...(src.settings || {}), schema: 'v4' };
  base.records = Array.isArray(src.records) ? src.records.map(normalizeRecord) : [];
  base.auditLog = Array.isArray(src.auditLog) ? src.auditLog.slice(0, MAX_AUDIT) : [];
  base.snapshots = Array.isArray(src.snapshots) ? src.snapshots.slice(0, 50) : [];
  base.integrity = src.integrity || null;
  return base;
}
function registryIntegrity(registry) {
  const records = Array.isArray(registry.records) ? registry.records : [];
  const seenIds = new Set();
  const seenHashes = new Set();
  const duplicateIds = [];
  const duplicateHashes = [];
  const invalidSignatureIds = [];
  const unsignedIds = [];
  const expiredIds = [];
  let signed = 0;
  for (const record of records) {
    const id = cleanString(record.id, 120).toUpperCase();
    const hash = normalizeHash(record.sha256);
    if (seenIds.has(id)) duplicateIds.push(id);
    seenIds.add(id);
    if (hash) {
      if (seenHashes.has(hash)) duplicateHashes.push(hash);
      seenHashes.add(hash);
    }
    if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) expiredIds.push(id);
    if (record.serverSignature) {
      signed += 1;
      const sig = verifyRecordSignature(record);
      if (sig.valid === false) invalidSignatureIds.push(id);
    } else {
      unsignedIds.push(id);
    }
  }
  const digestPayload = {
    version: registry.version || REGISTRY_VERSION,
    schemaVersion: registry.schemaVersion || 4,
    updatedAt: registry.updatedAt || '',
    records: records.map(r => ({ id: r.id, sha256: r.sha256, status: r.status, expiresAt: r.expiresAt || '', serverSignature: r.serverSignature || '', updatedAt: r.updatedAt || '' })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    auditCount: Array.isArray(registry.auditLog) ? registry.auditLog.length : 0,
    snapshotCount: Array.isArray(registry.snapshots) ? registry.snapshots.length : 0
  };
  const problems = [
    ...invalidSignatureIds.map(id => 'invalid-signature:' + id),
    ...duplicateIds.map(id => 'duplicate-id:' + id)
  ];
  const warnings = [
    ...unsignedIds.map(id => 'unsigned:' + id),
    ...duplicateHashes.map(hash => 'duplicate-hash:' + hash)
  ];
  return {
    ok: problems.length === 0,
    sha256: sha256Text(stableStringify(digestPayload)),
    recordCount: records.length,
    activeCount: records.filter(r => String(r.status || 'active').toLowerCase() === 'active').length,
    revokedCount: records.filter(r => String(r.status || '').toLowerCase() === 'revoked').length,
    suspendedCount: records.filter(r => String(r.status || '').toLowerCase() === 'suspended').length,
    expiredCount: expiredIds.length,
    signedRecordCount: signed,
    unsignedRecordCount: records.length - signed,
    invalidSignatureIds: [...new Set(invalidSignatureIds)],
    unsignedIds: [...new Set(unsignedIds)],
    duplicateIds: [...new Set(duplicateIds)],
    duplicateHashes: [...new Set(duplicateHashes)],
    expiredIds: [...new Set(expiredIds)],
    problems,
    warnings,
    checkedAt: nowIso()
  };
}
function addAudit(registry, req, event) {
  registry.auditLog = Array.isArray(registry.auditLog) ? registry.auditLog : [];
  registry.auditLog.unshift({
    time: nowIso(),
    action: cleanString(event.action, 80),
    id: cleanString(event.id, 120).toUpperCase(),
    sha256: normalizeHash(event.sha256),
    result: cleanString(event.result || event.verdict, 80),
    ok: !!event.ok,
    message: cleanString(event.message, 500),
    actor: cleanString(event.actor || '', 120),
    clientIpHash: clientIpHash(req),
    userAgentHash: userAgentHash(req),
    requestId: cleanString(req.headers['x-pfsp-request-id'] || '', 120),
    origin: cleanString(event.origin || requestOrigin(req, event), 500)
  });
  registry.auditLog = registry.auditLog.slice(0, MAX_AUDIT);
}
function addSnapshot(registry, label) {
  registry.snapshots = Array.isArray(registry.snapshots) ? registry.snapshots : [];
  registry.snapshots.unshift({ time: nowIso(), label: cleanString(label || 'snapshot', 140), integrity: registryIntegrity(registry) });
  registry.snapshots = registry.snapshots.slice(0, 50);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let done = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY && !done) {
        done = true;
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (done) return;
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
  return r.json();
}
function githubConfig() {
  return {
    token: process.env.PFSP_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '',
    owner: process.env.PFSP_GITHUB_OWNER || process.env.GITHUB_OWNER || '',
    repo: process.env.PFSP_GITHUB_REPO || process.env.GITHUB_REPO || '',
    branch: process.env.PFSP_GITHUB_BRANCH || process.env.GITHUB_BRANCH || 'main',
    filePath: process.env.PFSP_REGISTRY_PATH || 'data/verify-registry.json'
  };
}
async function readRegistryFromGithub() {
  const cfg = githubConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) return null;
  const api = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.filePath}?ref=${encodeURIComponent(cfg.branch)}`;
  const meta = await fetchJson(api, {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pdf-fusion-smart-pro-verify-v12'
  });
  const raw = Buffer.from(String(meta.content || ''), 'base64').toString('utf8');
  const registry = normalizeRegistry(JSON.parse(raw));
  registry.__githubSha = meta.sha;
  return registry;
}
async function readRegistry() {
  if (process.env.PFSP_REGISTRY_URL) {
    try { return normalizeRegistry(await fetchJson(process.env.PFSP_REGISTRY_URL)); } catch (err) {}
  }
  try {
    const gh = await readRegistryFromGithub();
    if (gh) return gh;
  } catch (err) {}
  try { return normalizeRegistry(JSON.parse(fs.readFileSync(LOCAL_REGISTRY_PATH, 'utf8'))); }
  catch (err) { return emptyRegistry(); }
}
async function writeRegistryToGithub(registry, message) {
  const cfg = githubConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    const err = new Error('GitHub registry env vars are not configured.');
    err.code = 'NO_GITHUB_CONFIG';
    throw err;
  }
  const current = await readRegistryFromGithub().catch(() => null);
  const sha = current && current.__githubSha;
  const payload = { ...registry };
  delete payload.__githubSha;
  payload.version = REGISTRY_VERSION;
  payload.schemaVersion = 4;
  payload.integrity = registryIntegrity(payload);
  const api = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.filePath}`;
  const body = {
    message: cleanString(message, 240) || 'Update PFSP verify registry',
    branch: cfg.branch,
    content: Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8').toString('base64')
  };
  if (sha) body.sha = sha;
  const r = await fetch(api, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'pdf-fusion-smart-pro-verify-v12'
    },
    body: JSON.stringify(body)
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `GitHub write failed ${r.status}`);
  return json;
}
async function writeRegistryLocal(registry) {
  if (!parseBool(process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE, false)) return null;
  fs.mkdirSync(path.dirname(LOCAL_REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  return { local: true, path: LOCAL_REGISTRY_PATH };
}
async function persistRegistry(registry, message) {
  registry.version = REGISTRY_VERSION;
  registry.schemaVersion = 4;
  registry.updatedAt = nowIso();
  registry.settings = { ...emptyRegistry().settings, ...(registry.settings || {}), schema: 'v4' };
  registry.records = Array.isArray(registry.records) ? registry.records.map(normalizeRecord) : [];
  registry.records.sort((a, b) => String(b.registeredAt || b.createdAt || '').localeCompare(String(a.registeredAt || a.createdAt || '')));
  registry.integrity = registryIntegrity(registry);
  try { return await writeRegistryToGithub(registry, message); }
  catch (err) {
    const local = await writeRegistryLocal(registry);
    if (local) return local;
    throw err;
  }
}

function envSummary() {
  const cfg = githubConfig();
  const allow = allowedOrigins();
  return {
    apiVersion: API_VERSION,
    registryVersion: REGISTRY_VERSION,
    legacyRegistryVersions: LEGACY_REGISTRY_VERSIONS,
    githubConfigured: !!(cfg.token && cfg.owner && cfg.repo),
    owner: cfg.owner || '',
    repo: cfg.repo || '',
    branch: cfg.branch,
    registryPath: cfg.filePath,
    signingConfigured: !!signingSecret(),
    adminConfigured: !!adminSecret(),
    autoRegisterEnabled: autoRegisterEnabled(),
    dailyAutoRegisterLimit: AUTO_REGISTER_DAILY_LIMIT,
    rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
    publicRateLimit: PUBLIC_RATE_LIMIT,
    adminRateLimit: ADMIN_RATE_LIMIT,
    maxPortalSearch: MAX_PORTAL_SEARCH,
    maxBatch: MAX_BATCH,
    maxBulkRegister: MAX_BULK_REGISTER,
    allowedOriginsConfigured: allow.length > 0,
    allowedOriginsCount: allow.length,
    wildcardCorsEnabled: parseBool(process.env.PFSP_ALLOW_WILDCARD_CORS, false),
    localWriteEnabled: parseBool(process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE, false),
    registryUrlConfigured: !!process.env.PFSP_REGISTRY_URL
  };
}
function hasAdmin(req, body = {}) {
  const expected = adminSecret();
  if (!expected) return false;
  const header = req.headers['x-verify-admin-secret'] || '';
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const supplied = cleanString(body.adminSecret || body.secret || header || auth, 2000);
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function autoRegisterEnabled() {
  return parseBool(process.env.PFSP_AUTO_REGISTER_ENABLED ?? process.env.PFSP_VERIFY_AUTO_REGISTER, true);
}
function originAllowed(req, record) {
  const allow = allowedOrigins();
  if (!allow.length) return { ok: true, reason: 'allowlist-not-configured', candidates: [] };
  const candidates = [requestOrigin(req, record), record.origin, getBaseUrl(req, record)].map(x => cleanString(x, 500).replace(/\/$/, '')).filter(Boolean);
  const ok = candidates.some(candidate => allow.includes(candidate));
  return { ok, reason: ok ? 'origin-allowed' : 'origin-not-allowed', candidates };
}
function makeRecord(input, req, mode = 'manual') {
  const cert = input.certificate || input.cert || input.record || input;
  const now = nowIso();
  const record = normalizeRecord({
    id: cert.id || cert.verifyId || (input.autoGenerateId || input.generateId ? generateVerifyId() : ''),
    sha256: cert.sha256 || cert.hash || cert.h,
    size: cert.size,
    fileName: cert.fileName || cert.name || 'document.pdf',
    mimeType: cert.mimeType || 'application/pdf',
    createdAt: cert.createdAt || cert.ts || now,
    registeredAt: cert.registeredAt || now,
    updatedAt: now,
    origin: cert.origin || cert.o || requestOrigin(req, cert),
    app: cert.app || 'PDF Fusion Smart Pro',
    appVersion: cert.appVersion || cert.version || 'unknown',
    sourceBundleSha256: cert.sourceBundleSha256 || cert.sourceHash || cert.sh,
    checksum: cert.checksum || cert.hck || '',
    status: cert.status || input.status || 'active',
    expiresAt: cert.expiresAt || input.expiresAt || '',
    registeredBy: input.registeredBy || cert.registeredBy || (mode === 'auto' ? 'auto-qr-export' : 'admin'),
    registrationMode: mode === 'auto' ? 'auto-qr-export' : 'manual-admin',
    owner: input.owner || cert.owner || '',
    project: input.project || cert.project || '',
    documentTitle: input.documentTitle || cert.documentTitle || cert.title || '',
    tags: input.tags || cert.tags || [],
    note: input.note || cert.note || '',
    policy: cert.policy || { retention: input.retention || '', visibility: 'public-metadata' },
    signatureVersion: SIGNATURE_VERSION,
    signatureAlgorithm: SIGNATURE_ALGORITHM
  });
  record.fingerprint = record.fingerprint || sha256Text([record.id, record.sha256, record.size ?? '', record.createdAt, record.origin].join('|')).slice(0, 32).toUpperCase();
  record.shortVerifyUrl = shortVerifyUrl(req, record);
  record.verifyUrl = verifyUrlWithHash(req, record);
  if (!record.history.length) pushHistory(record, 'created', { actor: record.registeredBy, result: 'CREATED', sha256: record.sha256, status: record.status, origin: record.origin });
  record.serverSignature = signRecord(record);
  record.certificateSignature = record.serverSignature;
  record.signatureVersion = SIGNATURE_VERSION;
  record.signatureAlgorithm = SIGNATURE_ALGORITHM;
  if (mode === 'auto') {
    record.clientIpHash = clientIpHash(req);
    record.userAgentHash = userAgentHash(req);
  }
  return record;
}
function signedCertificate(record) {
  return {
    certificateVersion: 'PFSP-TRUSTED-CERT-v4',
    app: record.app,
    appVersion: record.appVersion,
    id: record.id,
    sha256: record.sha256,
    size: record.size,
    fileName: record.fileName,
    mimeType: record.mimeType,
    createdAt: record.createdAt,
    registeredAt: record.registeredAt,
    updatedAt: record.updatedAt || '',
    origin: record.origin,
    owner: record.owner || '',
    project: record.project || '',
    documentTitle: record.documentTitle || '',
    tags: record.tags || [],
    status: record.status,
    expiresAt: record.expiresAt || '',
    revokedAt: record.revokedAt || '',
    restoredAt: record.restoredAt || '',
    suspendedAt: record.suspendedAt || '',
    revokeReason: record.revokeReason || '',
    suspendReason: record.suspendReason || '',
    shortVerifyUrl: record.shortVerifyUrl,
    verifyUrl: record.verifyUrl,
    fingerprint: record.fingerprint,
    serverSignature: record.serverSignature,
    certificateSignature: record.certificateSignature,
    signatureVersion: record.signatureVersion || SIGNATURE_VERSION,
    signatureAlgorithm: record.signatureAlgorithm || SIGNATURE_ALGORITHM,
    issuedBy: 'PDF Fusion Smart Pro Verify System',
    issuedAt: nowIso()
  };
}
function findRecord(registry, id) {
  const target = cleanString(id, 120).toUpperCase();
  return (registry.records || []).find(r => cleanString(r.id, 120).toUpperCase() === target) || null;
}
function recordsByHash(registry, hash) {
  const h = normalizeHash(hash);
  if (!validHash(h)) return [];
  return (registry.records || []).filter(r => normalizeHash(r.sha256) === h);
}
function timeline(record) {
  const rows = [];
  if (record.createdAt) rows.push({ time: record.createdAt, action: 'created', label: 'Certificate created' });
  if (record.registeredAt) rows.push({ time: record.registeredAt, action: 'registered', label: 'Registered in trusted registry' });
  if (record.updatedAt) rows.push({ time: record.updatedAt, action: 'updated', label: 'Record updated' });
  if (record.suspendedAt) rows.push({ time: record.suspendedAt, action: 'suspended', label: record.suspendReason || 'Suspended' });
  if (record.revokedAt) rows.push({ time: record.revokedAt, action: 'revoked', label: record.revokeReason || 'Revoked' });
  if (record.restoredAt) rows.push({ time: record.restoredAt, action: 'restored', label: 'Restored' });
  if (record.expiresAt) rows.push({ time: record.expiresAt, action: 'expires', label: 'Expiry date' });
  for (const h of (record.history || []).slice(0, 12)) rows.push({ time: h.time, action: h.action, label: h.message || h.result || h.action });
  const seen = new Set();
  return rows.filter(x => x.time && !seen.has(x.time + x.action) && seen.add(x.time + x.action)).sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 18);
}
function trustSummary(record, signature, query = {}) {
  const inputHash = normalizeHash(query.sha256 || query.hash || query.h);
  const inputSize = normalizeSize(query.size);
  const checks = [];
  let score = 100;
  function check(name, ok, weight, message) {
    checks.push({ name, ok, weight, message });
    if (!ok) score -= weight;
  }
  check('registered', !!record, 40, record ? 'Verify ID exists in registry.' : 'Verify ID is not registered.');
  if (!record) return { trustScore: 0, trustLevel: 'unknown', checks };
  check('serverSignature', signature.valid === true, signature.valid === false ? 60 : 20, signature.valid === true ? 'Server signature is valid.' : signature.reason || 'Signature cannot be confirmed.');
  const status = lower(record.status || 'active', 40);
  check('statusActive', status === 'active', status === 'revoked' ? 80 : 45, 'Current status: ' + status);
  const expired = record.expiresAt && Date.parse(record.expiresAt) && Date.parse(record.expiresAt) < Date.now();
  check('notExpired', !expired, 55, expired ? 'Record is expired.' : 'Record is not expired.');
  if (inputHash) check('hashMatch', normalizeHash(record.sha256) === inputHash, 80, normalizeHash(record.sha256) === inputHash ? 'PDF SHA-256 matches.' : 'PDF SHA-256 does not match.');
  else { score -= 30; checks.push({ name: 'hashProvided', ok: false, weight: 30, message: 'No uploaded/provided PDF hash yet.' }); }
  if (inputSize !== null && record.size !== null) check('sizeMatch', String(inputSize) === String(record.size), 10, String(inputSize) === String(record.size) ? 'File size matches metadata.' : 'File size differs from metadata.');
  score = clamp(score, 0, 100);
  const trustLevel = score >= 90 ? 'verified' : score >= 65 ? 'probable' : score >= 35 ? 'warning' : 'blocked';
  return { trustScore: score, trustLevel, checks };
}
function publicRecord(record, opts = {}) {
  const r = { ...record };
  delete r.clientIpHash;
  delete r.userAgentHash;
  if (!opts.admin) delete r.adminNote;
  if (!opts.includeHistory) delete r.history;
  return r;
}
function parseCheckInput(input = {}) {
  const cert = input.certificate || input.cert || input.record || null;
  if (cert && typeof cert === 'object') {
    return {
      id: cert.id || cert.verifyId || input.id || input.verifyId || '',
      sha256: cert.sha256 || cert.hash || cert.h || input.sha256 || input.hash || input.h || '',
      size: cert.size ?? input.size ?? '',
      certificate: cert
    };
  }
  return input;
}
function evaluate(registry, query = {}) {
  const q = parseCheckInput(query);
  const id = cleanString(q.id || q.verifyId, 120).toUpperCase();
  const inputHash = normalizeHash(q.sha256 || q.hash || q.h);
  const inputSize = normalizeSize(q.size);
  if (!id) return { ok: false, verdict: 'NO_ID', level: 'bad', message: 'Missing verify ID.', trustScore: 0, trustLevel: 'unknown' };
  const record = findRecord(registry, id);
  if (!record) return { ok: false, verdict: 'UNKNOWN', level: 'warn', message: 'Verify ID is not registered in the trusted registry.', id, registryVersion: registry.version || REGISTRY_VERSION, trustScore: 0, trustLevel: 'unknown' };
  const signature = verifyRecordSignature(record);
  const trust = trustSummary(record, signature, { sha256: inputHash, size: inputSize });
  const expired = record.expiresAt && Date.parse(record.expiresAt) && Date.parse(record.expiresAt) < Date.now();
  const status = lower(record.status || 'active', 40);
  const base = { record: publicRecord(record, { includeHistory: true }), signature, timeline: timeline(record), ...trust };
  if (signature.present && signature.valid === false) return { ok: false, verdict: 'REGISTRY_TAMPERED', level: 'bad', message: 'Registry record signature is invalid. Treat this record as unsafe.', ...base };
  if (status === 'revoked') return { ok: false, verdict: 'REVOKED', level: 'bad', message: record.revokeReason ? `Verify ID is revoked: ${record.revokeReason}` : 'Verify ID is registered but revoked.', ...base };
  if (status === 'suspended') return { ok: false, verdict: 'SUSPENDED', level: 'bad', message: record.suspendReason ? `Verify ID is suspended: ${record.suspendReason}` : 'Verify ID is temporarily suspended.', ...base };
  if (status === 'archived') return { ok: false, verdict: 'ARCHIVED', level: 'warn', message: 'Verify ID is archived. Treat as historical metadata only.', ...base };
  if (expired) return { ok: false, verdict: 'EXPIRED', level: 'bad', message: 'Verify ID is registered but expired.', ...base };
  if (!inputHash) return { ok: false, verdict: 'REGISTERED_NEEDS_FILE', level: 'warn', message: 'Verify ID exists. Upload/provide the PDF hash to confirm the actual file.', ...base };
  if (normalizeHash(record.sha256) !== inputHash) return { ok: false, verdict: 'FAKE_OR_MODIFIED', level: 'bad', message: 'Verify ID exists, but the uploaded/provided PDF hash does not match the registered original.', providedHash: inputHash, ...base };
  const sizeMismatch = inputSize !== null && record.size !== null && String(inputSize) !== String(record.size);
  if (sizeMismatch) return { ok: true, verdict: 'HASH_MATCH_SIZE_WARNING', level: 'warn', message: 'Hash matches the trusted record, but the size metadata differs.', providedHash: inputHash, certificate: signedCertificate(record), ...base };
  return { ok: true, verdict: 'GENUINE', level: 'good', message: 'Verify ID and PDF SHA-256 match the server-signed trusted registry record.', providedHash: inputHash, certificate: signedCertificate(record), ...base };
}
function tooManyAutoRegisters(registry, req) {
  const ip = clientIpHash(req);
  if (!ip || !AUTO_REGISTER_DAILY_LIMIT) return false;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const count = (registry.auditLog || []).filter(x => x.action === 'auto-register' && x.clientIpHash === ip && Date.parse(x.time || '') > since).length;
  return count >= AUTO_REGISTER_DAILY_LIMIT;
}


function summarizeStatus(records) {
  const summary = { total: records.length, active: 0, revoked: 0, suspended: 0, archived: 0, expired: 0, unsigned: 0 };
  for (const r of records) {
    const status = lower(r.status || 'active', 40);
    if (summary[status] != null) summary[status] += 1;
    if (r.expiresAt && Date.parse(r.expiresAt) < Date.now()) summary.expired += 1;
    if (!r.serverSignature) summary.unsigned += 1;
  }
  return summary;
}
function publicPortalRecord(record, req) {
  const signature = verifyRecordSignature(record);
  const trust = trustSummary(record, signature, {});
  return {
    id: record.id,
    sha256: record.sha256,
    shortSha256: record.sha256 ? record.sha256.slice(0, 12).toUpperCase() + '...' + record.sha256.slice(-8).toUpperCase() : '',
    size: record.size,
    fileName: record.fileName,
    documentTitle: record.documentTitle || record.fileName,
    owner: record.owner || '',
    project: record.project || '',
    tags: record.tags || [],
    status: record.status || 'active',
    registeredAt: record.registeredAt || record.createdAt || '',
    updatedAt: record.updatedAt || '',
    expiresAt: record.expiresAt || '',
    trustScore: trust.trustScore,
    trustLevel: trust.trustLevel,
    signature: signature.present ? (signature.valid === true ? 'valid' : signature.valid === false ? 'invalid' : 'unknown') : 'missing',
    verifyUrl: shortVerifyUrl(req, record),
    certificateUrl: (getBaseUrl(req, record) || '.') + '/verify-certificate.html?id=' + encodeURIComponent(record.id),
    badgeUrl: (getBaseUrl(req, record) || '.') + '/api/verify?action=badge&id=' + encodeURIComponent(record.id),
    fingerprint: record.fingerprint || ''
  };
}
function portalMatches(record, q, status) {
  if (status && lower(record.status || 'active', 40) !== status) return false;
  if (!q) return true;
  const hay = [record.id, record.sha256, record.fileName, record.documentTitle, record.owner, record.project, record.origin, ...(record.tags || [])].join(' ').toUpperCase();
  return hay.includes(q);
}
async function handlePublicSearch(req, res, input = {}) {
  const registry = await readRegistry();
  const q = cleanString(input.query || input.q || input.id || input.sha256 || '', 160).toUpperCase();
  const status = lower(input.status || '', 40);
  const limit = Math.min(Number(input.limit || MAX_PORTAL_SEARCH) || MAX_PORTAL_SEARCH, MAX_PORTAL_SEARCH);
  const records = (registry.records || []).filter(r => portalMatches(r, q, status)).slice(0, limit).map(r => publicPortalRecord(r, req));
  return send(req, res, 200, {
    ok: true,
    verdict: 'PUBLIC_SEARCH',
    level: 'good',
    message: records.length ? 'Public trust records loaded.' : 'No matching public trust records found.',
    query: q,
    records,
    count: records.length,
    limit,
    updatedAt: registry.updatedAt,
    registryIntegrity: registryIntegrity(registry)
  });
}
async function handleTrustPortal(req, res, input = {}) {
  const registry = await readRegistry();
  const records = Array.isArray(registry.records) ? registry.records : [];
  const integrity = registryIntegrity(registry);
  const recent = records.slice().sort((a, b) => String(b.registeredAt || b.createdAt || '').localeCompare(String(a.registeredAt || a.createdAt || ''))).slice(0, Math.min(12, MAX_PORTAL_SEARCH)).map(r => publicPortalRecord(r, req));
  return send(req, res, 200, {
    ok: true,
    verdict: 'TRUST_PORTAL',
    level: integrity.ok ? 'good' : 'warn',
    message: 'Trust Portal summary loaded.',
    portalVersion: '13.0.0-trust-portal',
    registryVersion: registry.version || REGISTRY_VERSION,
    updatedAt: registry.updatedAt,
    summary: summarizeStatus(records),
    recent,
    registryIntegrity: integrity,
    env: envSummary()
  });
}
async function handleBadge(req, res, input = {}) {
  const registry = await readRegistry();
  const id = cleanString(input.id || input.verifyId, 120).toUpperCase();
  const result = evaluate(registry, input);
  const statusMap = {
    GENUINE: ['verified', 'Verified', '#16a34a'],
    HASH_MATCH_SIZE_WARNING: ['verified-warning', 'Hash verified', '#f59e0b'],
    REGISTERED_NEEDS_FILE: ['registered', 'Registered', '#2563eb'],
    REVOKED: ['revoked', 'Revoked', '#dc2626'],
    SUSPENDED: ['suspended', 'Suspended', '#ea580c'],
    EXPIRED: ['expired', 'Expired', '#9333ea'],
    FAKE_OR_MODIFIED: ['mismatch', 'Mismatch', '#dc2626'],
    REGISTRY_TAMPERED: ['tampered', 'Tampered', '#991b1b'],
    UNKNOWN: ['unknown', 'Unknown', '#64748b']
  };
  const [badgeStatus, label, color] = statusMap[result.verdict] || ['unknown', result.verdict || 'Unknown', '#64748b'];
  const base = getBaseUrl(req, result.record || {});
  const verifyUrl = id ? (base || '.') + '/verify.html?id=' + encodeURIComponent(id) : '';
  const badgeHtml = id ? `<a href="${verifyUrl}" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;background:${color};color:#fff;text-decoration:none;font:700 12px system-ui">🛡️ PDF Fusion ${label}</a>` : '';
  return send(req, res, result.verdict === 'UNKNOWN' ? 404 : 200, {
    ok: result.ok || ['REGISTERED_NEEDS_FILE'].includes(result.verdict),
    verdict: 'BADGE',
    level: result.level || 'warn',
    message: 'Public verification badge generated.',
    id,
    badgeStatus,
    label,
    color,
    verifyUrl,
    badgeHtml,
    sourceVerdict: result.verdict,
    trustScore: result.trustScore || 0,
    trustLevel: result.trustLevel || 'unknown'
  });
}
async function handlePrintableCertificate(req, res, input = {}) {
  const registry = await readRegistry();
  const id = cleanString(input.id || input.verifyId, 120).toUpperCase();
  const record = findRecord(registry, id);
  if (!record) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  const signature = verifyRecordSignature(record);
  const trust = trustSummary(record, signature, { sha256: input.sha256 || '', size: input.size || '' });
  return send(req, res, 200, {
    ok: true,
    verdict: 'PRINTABLE_CERTIFICATE',
    level: signature.valid === false ? 'bad' : 'good',
    message: 'Printable Trust Certificate data loaded.',
    record: publicRecord(record, { includeHistory: true }),
    certificate: signedCertificate(record),
    signature,
    timeline: timeline(record),
    trust,
    registryIntegrity: registryIntegrity(registry),
    portal: { version: '13.0.0-trust-portal', certificatePage: (getBaseUrl(req, record) || '.') + '/verify-certificate.html?id=' + encodeURIComponent(record.id) }
  });
}

async function handleCheck(req, res, query) {
  const registry = await readRegistry();
  const result = evaluate(registry, query);
  const status = result.verdict === 'UNKNOWN' ? 404 : 200;
  return send(req, res, status, { checkedAt: nowIso(), registryIntegrity: registryIntegrity(registry), ...result });
}
async function handleStats(req, res) {
  const registry = await readRegistry();
  return send(req, res, 200, { ok: true, verdict: 'STATS', level: 'good', message: 'Public registry status loaded.', updatedAt: registry.updatedAt, registryVersion: registry.version, registryIntegrity: registryIntegrity(registry), env: envSummary() });
}
async function handleLookupHash(req, res, input) {
  const registry = await readRegistry();
  const hash = normalizeHash(input.sha256 || input.hash || input.h || input.q);
  if (!validHash(hash)) return send(req, res, 400, { ok: false, verdict: 'BAD_HASH', level: 'bad', message: 'Provide a valid SHA-256 hash.' });
  const records = recordsByHash(registry, hash).map(r => publicRecord(r, { includeHistory: false }));
  return send(req, res, 200, { ok: records.length > 0, verdict: records.length ? 'HASH_FOUND' : 'HASH_NOT_FOUND', level: records.length ? 'good' : 'warn', message: records.length ? 'Hash found in registry.' : 'Hash not found in registry.', sha256: hash, records, count: records.length, registryIntegrity: registryIntegrity(registry) });
}
async function handleCertificate(req, res, input) {
  const registry = await readRegistry();
  const id = cleanString(input.id || input.verifyId, 120).toUpperCase();
  const record = findRecord(registry, id);
  if (!record) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  return send(req, res, 200, { ok: true, verdict: 'CERTIFICATE', level: 'good', message: 'Server-signed certificate loaded.', record: publicRecord(record, { includeHistory: true }), certificate: signedCertificate(record), signature: verifyRecordSignature(record), timeline: timeline(record) });
}
async function handleBatchVerify(req, res, body) {
  const registry = await readRegistry();
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.slice(0, MAX_BATCH);
  const results = items.map((item, index) => {
    const query = typeof item === 'string' ? { id: item } : item;
    const result = evaluate(registry, query || {});
    return { index, ...result };
  });
  const good = results.filter(r => r.ok).length;
  return send(req, res, 200, { ok: true, verdict: 'BATCH_VERIFIED', level: good === results.length ? 'good' : 'warn', message: `Batch verify completed: ${good}/${results.length} genuine or acceptable.`, results, count: results.length, maxBatch: MAX_BATCH, registryIntegrity: registryIntegrity(registry) });
}
async function handleAutoRegister(req, res, body) {
  if (!autoRegisterEnabled()) return send(req, res, 403, { ok: false, verdict: 'AUTO_REGISTER_DISABLED', level: 'warn', message: 'Public QR auto-registration is disabled on this deployment.' });
  if (!requireSigning(req, res)) return;
  const registry = await readRegistry();
  if (tooManyAutoRegisters(registry, req)) return send(req, res, 429, { ok: false, verdict: 'RATE_LIMITED', level: 'bad', message: `Auto-register limit reached for this client. Limit: ${AUTO_REGISTER_DAILY_LIMIT}/24h.` });
  const record = makeRecord(body, req, 'auto');
  if (!validId(record.id)) return send(req, res, 400, { ok: false, verdict: 'BAD_ID', level: 'bad', message: 'Invalid PFSP verify ID.', record: publicRecord(record) });
  if (!validHash(record.sha256)) return send(req, res, 400, { ok: false, verdict: 'BAD_HASH', level: 'bad', message: 'Invalid SHA-256 hash.', record: publicRecord(record) });
  const allow = originAllowed(req, record);
  if (!allow.ok) return send(req, res, 403, { ok: false, verdict: 'ORIGIN_NOT_ALLOWED', level: 'bad', message: 'This origin is not allowed to auto-register trusted records.', originPolicy: allow });
  registry.records = Array.isArray(registry.records) ? registry.records : [];
  const existing = findRecord(registry, record.id);
  if (existing) {
    if (normalizeHash(existing.sha256) === record.sha256) {
      addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'ALREADY_REGISTERED', ok: true, message: 'Same ID/hash already registered.', origin: record.origin });
      return send(req, res, 200, { ok: true, verdict: 'ALREADY_REGISTERED', level: 'good', message: 'This QR Verify PDF was already registered with the same SHA-256 hash.', record: publicRecord(existing, { includeHistory: true }), certificate: signedCertificate(existing), registryIntegrity: registryIntegrity(registry) });
    }
    addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'ID_COLLISION', ok: false, message: 'ID exists with a different hash.', origin: record.origin });
    return send(req, res, 409, { ok: false, verdict: 'ID_COLLISION', level: 'bad', message: 'This Verify ID already exists with a different SHA-256 hash. The new PDF was not registered.', existing: publicRecord(existing), attempted: publicRecord(record) });
  }
  pushHistory(record, 'auto-register', { actor: 'public-auto-register', result: 'AUTO_REGISTERED', sha256: record.sha256, status: record.status, origin: record.origin });
  registry.records.push(record);
  addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'AUTO_REGISTERED', ok: true, message: 'Auto-registered on PDF export.', origin: record.origin });
  try {
    const saved = await persistRegistry(registry, `Auto-register PFSP verify ID ${record.id}`);
    return send(req, res, 200, { ok: true, verdict: 'AUTO_REGISTERED', level: 'good', message: 'QR Verify PDF was automatically registered in the server-signed trusted registry.', record: publicRecord(record, { includeHistory: true }), certificate: signedCertificate(record), commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: 'AUTO_REGISTER_PENDING_MANUAL_PATCH', level: 'warn', message: 'Auto-registration created a server-signed record, but durable registry write failed. Commit the suggested registry JSON manually or fix GitHub env vars.', error: err.message, record: publicRecord(record, { includeHistory: true }), certificate: signedCertificate(record), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
async function handleRegister(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning(req, res)) return;
  const registry = await readRegistry();
  const record = makeRecord(body, req, 'manual');
  if (!validId(record.id)) return send(req, res, 400, { ok: false, verdict: 'BAD_ID', level: 'bad', message: 'Invalid PFSP verify ID.', record: publicRecord(record) });
  if (!validHash(record.sha256)) return send(req, res, 400, { ok: false, verdict: 'BAD_HASH', level: 'bad', message: 'Invalid SHA-256 hash.', record: publicRecord(record) });
  const idx = registry.records.findIndex(r => cleanString(r.id, 120).toUpperCase() === record.id);
  if (idx >= 0 && !body.overwrite) return send(req, res, 409, { ok: false, verdict: 'ALREADY_REGISTERED', level: 'warn', message: 'This verify ID already exists. Use overwrite=true only if intentional.', existing: publicRecord(registry.records[idx], { includeHistory: true }) });
  if (body.dryRun) return send(req, res, 200, { ok: true, verdict: 'DRY_RUN_OK', level: 'good', message: 'Record passed validation. No write was made.', record: publicRecord(record, { includeHistory: true }), certificate: signedCertificate(record), registryIntegrity: registryIntegrity(registry) });
  if (idx >= 0) {
    record.history = [...(registry.records[idx].history || []), ...(record.history || [])].slice(0, MAX_HISTORY);
    pushHistory(record, 'overwrite-register', { actor: 'admin', result: 'OVERWRITTEN', sha256: record.sha256, status: record.status, origin: record.origin });
    registry.records[idx] = { ...registry.records[idx], ...record, updatedAt: nowIso() };
  } else {
    pushHistory(record, 'manual-register', { actor: 'admin', result: 'REGISTERED', sha256: record.sha256, status: record.status, origin: record.origin });
    registry.records.push(record);
  }
  addAudit(registry, req, { action: 'register', id: record.id, sha256: record.sha256, result: 'REGISTERED', ok: true, message: 'Manual admin registration.', actor: 'admin', origin: record.origin });
  try {
    const saved = await persistRegistry(registry, `Register PFSP verify ID ${record.id}`);
    return send(req, res, 200, { ok: true, verdict: 'REGISTERED', level: 'good', message: 'Record registered in trusted registry.', record: publicRecord(record, { includeHistory: true }), certificate: signedCertificate(record), commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: 'MANUAL_REGISTRY_PATCH_REQUIRED', level: 'warn', message: 'Record is valid, but durable registry write failed. Commit the suggested registry JSON manually or configure GitHub env vars.', error: err.message, record: publicRecord(record, { includeHistory: true }), certificate: signedCertificate(record), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
async function handleBulkRegister(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning(req, res)) return;
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_BULK_REGISTER) : [];
  if (!items.length) return send(req, res, 400, { ok: false, verdict: 'NO_ITEMS', level: 'bad', message: 'Provide items[] to bulk register.' });
  const registry = await readRegistry();
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const input = { ...items[i], registeredBy: body.registeredBy || 'bulk-admin', note: items[i].note || body.note || 'Bulk registered from admin console.' };
    const record = makeRecord(input, req, 'manual');
    const conflict = findRecord(registry, record.id);
    if (!validId(record.id) || !validHash(record.sha256)) {
      results.push({ index: i, ok: false, verdict: !validId(record.id) ? 'BAD_ID' : 'BAD_HASH', record: publicRecord(record) });
      continue;
    }
    if (conflict && !body.overwrite) {
      results.push({ index: i, ok: false, verdict: 'ALREADY_REGISTERED', existing: publicRecord(conflict) });
      continue;
    }
    results.push({ index: i, ok: true, verdict: conflict ? 'WILL_OVERWRITE' : 'WILL_REGISTER', record: publicRecord(record, { includeHistory: true }) });
    if (!body.dryRun) {
      const idx = registry.records.findIndex(r => cleanString(r.id, 120).toUpperCase() === record.id);
      pushHistory(record, 'bulk-register', { actor: 'admin', result: idx >= 0 ? 'OVERWRITTEN' : 'REGISTERED', sha256: record.sha256, status: record.status, origin: record.origin });
      if (idx >= 0) registry.records[idx] = { ...registry.records[idx], ...record, updatedAt: nowIso() };
      else registry.records.push(record);
      addAudit(registry, req, { action: 'bulk-register', id: record.id, sha256: record.sha256, result: 'REGISTERED', ok: true, message: 'Bulk registration.', actor: 'admin', origin: record.origin });
    }
  }
  const okCount = results.filter(r => r.ok).length;
  if (body.dryRun) return send(req, res, 200, { ok: true, verdict: 'BULK_DRY_RUN_OK', level: okCount === results.length ? 'good' : 'warn', message: `Bulk validation completed: ${okCount}/${results.length} ready.`, results, registryIntegrity: registryIntegrity(registry) });
  try {
    const saved = await persistRegistry(registry, `Bulk register ${okCount} PFSP verify records`);
    return send(req, res, 200, { ok: true, verdict: 'BULK_REGISTERED', level: okCount === results.length ? 'good' : 'warn', message: `Bulk register completed: ${okCount}/${results.length} processed.`, results, commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: 'BULK_MANUAL_PATCH_REQUIRED', level: 'warn', message: 'Bulk records are prepared but durable write failed.', error: err.message, results, suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
async function handleRecordPatch(req, res, body, patcher, actionName, successVerdict, level = 'good') {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning(req, res)) return;
  const id = cleanString(body.id || body.verifyId, 120).toUpperCase();
  const registry = await readRegistry();
  const record = findRecord(registry, id);
  if (!record) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  patcher(record);
  record.updatedAt = nowIso();
  pushHistory(record, actionName, { actor: 'admin', result: successVerdict, message: body.reason || body.revokeReason || body.note || actionName, sha256: record.sha256, status: record.status, origin: record.origin });
  record.serverSignature = signRecord(record);
  record.certificateSignature = record.serverSignature;
  record.signatureVersion = SIGNATURE_VERSION;
  addAudit(registry, req, { action: actionName, id, sha256: record.sha256, result: successVerdict, ok: true, message: body.reason || body.revokeReason || body.note || actionName, actor: 'admin', origin: record.origin });
  try {
    const saved = await persistRegistry(registry, `${successVerdict} PFSP verify ID ${id}`);
    return send(req, res, 200, { ok: true, verdict: successVerdict, level, message: `Record updated: ${successVerdict}.`, record: publicRecord(record, { includeHistory: true }), certificate: signedCertificate(record), commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: `MANUAL_${successVerdict}_PATCH_REQUIRED`, level: 'warn', message: 'Patch is ready but durable write failed.', error: err.message, record: publicRecord(record, { includeHistory: true }), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
function listMatches(record, q, status) {
  if (status && String(record.status || 'active').toLowerCase() !== status) return false;
  if (!q) return true;
  const hay = [record.id, record.sha256, record.fileName, record.origin, record.status, record.note, record.owner, record.project, record.documentTitle, ...(record.tags || [])].join(' ').toUpperCase();
  return hay.includes(q);
}
async function handleList(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  const registry = await readRegistry();
  const q = cleanString(body.query || body.q || '', 160).toUpperCase();
  const status = lower(body.status || '', 40);
  const limit = Math.min(Number(body.limit || MAX_PUBLIC_RECORDS) || MAX_PUBLIC_RECORDS, MAX_PUBLIC_RECORDS);
  const records = (registry.records || []).filter(r => listMatches(r, q, status)).slice(0, limit).map(r => publicRecord(r, { admin: true, includeHistory: true }));
  return send(req, res, 200, { ok: true, verdict: 'LIST', level: 'good', message: 'Registry records loaded.', records, count: records.length, total: (registry.records || []).length, updatedAt: registry.updatedAt, registryIntegrity: registryIntegrity(registry) });
}
async function handleAudit(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  const registry = await readRegistry();
  const limit = Math.min(Number(body.limit || 150) || 150, 800);
  const action = lower(body.filterAction || body.actionFilter || '', 80);
  let rows = (registry.auditLog || []);
  if (action) rows = rows.filter(x => lower(x.action, 80) === action);
  return send(req, res, 200, { ok: true, verdict: 'AUDIT', level: 'good', message: 'Audit log loaded.', auditLog: rows.slice(0, limit), count: rows.length, registryIntegrity: registryIntegrity(registry) });
}
async function handleBackup(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  const registry = await readRegistry();
  addSnapshot(registry, body.label || 'admin backup snapshot');
  registry.integrity = registryIntegrity(registry);
  return send(req, res, 200, { ok: true, verdict: 'BACKUP_READY', level: 'good', message: 'Registry backup JSON is ready. Download or copy it before making large changes.', registry, registryIntegrity: registryIntegrity(registry) });
}
async function handleIntegrity(req, res, body = {}, requireAdmin = false) {
  if (requireAdmin && !hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  const registry = await readRegistry();
  const integrity = registryIntegrity(registry);
  return send(req, res, 200, { ok: true, verdict: integrity.ok ? 'INTEGRITY_OK' : 'INTEGRITY_WARNING', level: integrity.ok ? 'good' : 'warn', message: 'Registry integrity check completed.', registryIntegrity: integrity, updatedAt: registry.updatedAt, registryVersion: registry.version, env: envSummary() });
}
async function handleRepair(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning(req, res)) return;
  const registry = await readRegistry();
  addSnapshot(registry, 'pre-repair snapshot');
  let touched = 0;
  registry.records = (registry.records || []).map(record => {
    const before = JSON.stringify(record);
    const r = normalizeRecord(record);
    if (!r.fingerprint && r.id && r.sha256) r.fingerprint = sha256Text([r.id, r.sha256, r.size ?? '', r.createdAt, r.origin].join('|')).slice(0, 32).toUpperCase();
    if (!r.shortVerifyUrl) r.shortVerifyUrl = shortVerifyUrl(req, r);
    if (!r.verifyUrl) r.verifyUrl = verifyUrlWithHash(req, r);
    const sig = verifyRecordSignature(r);
    if (body.resign || !r.serverSignature || sig.valid === false) {
      pushHistory(r, 'repair-resign', { actor: 'admin', result: 'RESIGNED', sha256: r.sha256, status: r.status, origin: r.origin });
      r.updatedAt = nowIso();
      r.serverSignature = signRecord(r);
      r.certificateSignature = r.serverSignature;
      r.signatureVersion = SIGNATURE_VERSION;
    }
    if (JSON.stringify(r) !== before) touched += 1;
    return r;
  });
  addAudit(registry, req, { action: 'repair', id: '', result: 'REPAIRED', ok: true, message: `Registry repair touched ${touched} records.`, actor: 'admin' });
  if (body.dryRun) return send(req, res, 200, { ok: true, verdict: 'REPAIR_DRY_RUN', level: 'good', message: `Repair preview touched ${touched} records. No write was made.`, touched, registryIntegrity: registryIntegrity(registry), suggestedRegistry: registry });
  try {
    const saved = await persistRegistry(registry, `Repair PFSP verify registry (${touched} records)`);
    return send(req, res, 200, { ok: true, verdict: 'REPAIRED', level: 'good', message: `Registry repaired and re-signed where needed. Touched ${touched} records.`, touched, commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: 'REPAIR_MANUAL_PATCH_REQUIRED', level: 'warn', message: 'Repair is ready but durable write failed.', error: err.message, touched, suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
async function handleSelfTest(req, res) {
  const registry = await readRegistry();
  const integrity = registryIntegrity(registry);
  const env = envSummary();
  const checks = [
    { name: 'apiOnline', ok: true, message: 'API handler executed.' },
    { name: 'signingSecret', ok: env.signingConfigured, message: env.signingConfigured ? 'Signing secret configured.' : 'Missing PFSP_VERIFY_SIGNING_SECRET.' },
    { name: 'adminSecret', ok: env.adminConfigured, message: env.adminConfigured ? 'Admin secret configured.' : 'Missing PFSP_VERIFY_ADMIN_SECRET.' },
    { name: 'githubRegistry', ok: env.githubConfigured, message: env.githubConfigured ? 'GitHub registry env configured.' : 'GitHub registry env incomplete.' },
    { name: 'originAllowlist', ok: env.allowedOriginsConfigured, message: env.allowedOriginsConfigured ? 'Origin allowlist configured.' : 'Origin allowlist not configured.' },
    { name: 'rateLimit', ok: env.publicRateLimit > 0 && env.adminRateLimit > 0, message: 'Rate limit active: public=' + env.publicRateLimit + ', admin=' + env.adminRateLimit + '.' },
    { name: 'trustPortal', ok: true, message: 'Trust Portal public endpoints are available.' },
    { name: 'registryIntegrity', ok: integrity.ok, message: integrity.ok ? 'No integrity problems.' : integrity.problems.join(', ') }
  ];
  const ok = checks.every(x => x.ok);
  return send(req, res, 200, { ok, verdict: ok ? 'SELF_TEST_OK' : 'SELF_TEST_WARNING', level: ok ? 'good' : 'warn', message: ok ? 'Verify System diagnostics passed.' : 'Verify System diagnostics found warnings.', checks, env, registryIntegrity: integrity });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(req, res, 200, { ok: true, verdict: 'OPTIONS' });
  if (!applyRateLimit(req, res, 'public')) return;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'https://local.local');
      const params = Object.fromEntries(url.searchParams.entries());
      const action = lower(params.action || '', 60);
      if (action === 'health' || url.searchParams.get('health')) return send(req, res, 200, { ok: true, verdict: 'HEALTHY', level: 'good', message: 'Verify API is online.', time: nowIso(), env: envSummary() });
      if (action === 'stats' || url.searchParams.get('stats')) return handleStats(req, res);
      if (['portal', 'trust-portal', 'summary'].includes(action)) return handleTrustPortal(req, res, params);
      if (['public-search', 'portal-search', 'trust-search'].includes(action)) return handlePublicSearch(req, res, params);
      if (['badge', 'verify-badge'].includes(action)) return handleBadge(req, res, params);
      if (['printable-certificate', 'certificate-report'].includes(action)) return handlePrintableCertificate(req, res, params);
      if (action === 'integrity' || url.searchParams.get('integrity')) return handleIntegrity(req, res, {}, false);
      if (['lookup-hash', 'hash', 'find-hash'].includes(action)) return handleLookupHash(req, res, params);
      if (['certificate', 'cert', 'export-certificate'].includes(action)) return handleCertificate(req, res, params);
      if (['generate-id', 'new-id'].includes(action)) return send(req, res, 200, { ok: true, verdict: 'GENERATED_ID', level: 'good', id: generateVerifyId(), time: nowIso() });
      if (['self-test', 'diagnostics'].includes(action)) return handleSelfTest(req, res);
      return handleCheck(req, res, params);
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = lower(body.action || 'register', 60);
      const adminActions = ['auto-register','autoregister','register','bulk-register','register-bulk','revoke','restore','suspend','hold','activate','unsuspend','expiry','update-expiry','set-expiry','update-note','note','metadata','repair','resign','list','records','search','audit','audit-log','backup','snapshot','export'];
      if (adminActions.includes(action) && !applyRateLimit(req, res, 'admin')) return;
      if (['verify', 'check'].includes(action)) return handleCheck(req, res, body);
      if (['portal', 'trust-portal', 'summary'].includes(action)) return handleTrustPortal(req, res, body);
      if (['public-search', 'portal-search', 'trust-search'].includes(action)) return handlePublicSearch(req, res, body);
      if (['badge', 'verify-badge'].includes(action)) return handleBadge(req, res, body);
      if (['printable-certificate', 'certificate-report'].includes(action)) return handlePrintableCertificate(req, res, body);
      if (['batch-verify', 'batch', 'verify-batch'].includes(action)) return handleBatchVerify(req, res, body);
      if (['lookup-hash', 'hash', 'find-hash'].includes(action)) return handleLookupHash(req, res, body);
      if (['certificate', 'cert', 'export-certificate'].includes(action)) return handleCertificate(req, res, body);
      if (['auto-register', 'autoregister'].includes(action)) return handleAutoRegister(req, res, body);
      if (action === 'register') return handleRegister(req, res, body);
      if (['bulk-register', 'register-bulk'].includes(action)) return handleBulkRegister(req, res, body);
      if (action === 'revoke') return handleRecordPatch(req, res, body, record => {
        record.status = 'revoked';
        record.revokedAt = nowIso();
        record.restoredAt = '';
        record.revokeReason = cleanString(body.reason || body.revokeReason || 'revoked by admin', 300);
      }, 'revoke', 'REVOKED', 'bad');
      if (action === 'restore') return handleRecordPatch(req, res, body, record => {
        record.status = 'active';
        record.restoredAt = nowIso();
        record.revokedAt = '';
        record.suspendedAt = '';
        record.revokeReason = '';
        record.suspendReason = '';
      }, 'restore', 'RESTORED', 'good');
      if (['suspend', 'hold'].includes(action)) return handleRecordPatch(req, res, body, record => {
        record.status = 'suspended';
        record.suspendedAt = nowIso();
        record.suspendReason = cleanString(body.reason || body.suspendReason || 'suspended by admin', 300);
      }, 'suspend', 'SUSPENDED', 'bad');
      if (['activate', 'unsuspend'].includes(action)) return handleRecordPatch(req, res, body, record => {
        record.status = 'active';
        record.suspendedAt = '';
        record.suspendReason = '';
      }, 'activate', 'ACTIVATED', 'good');
      if (['expiry', 'update-expiry', 'set-expiry'].includes(action)) return handleRecordPatch(req, res, body, record => {
        record.expiresAt = safeDate(body.expiresAt) || '';
      }, 'update-expiry', 'EXPIRY_UPDATED', 'good');
      if (['update-note', 'note', 'metadata'].includes(action)) return handleRecordPatch(req, res, body, record => {
        if ('note' in body) record.note = cleanString(body.note, 800);
        if ('owner' in body) record.owner = cleanString(body.owner, 160);
        if ('project' in body) record.project = cleanString(body.project, 160);
        if ('documentTitle' in body) record.documentTitle = cleanString(body.documentTitle, 240);
        if ('tags' in body) record.tags = normalizeTags(body.tags);
      }, 'update-metadata', 'METADATA_UPDATED', 'good');
      if (['repair', 'resign'].includes(action)) return handleRepair(req, res, { ...body, resign: action === 'resign' ? true : body.resign });
      if (['list', 'records', 'search'].includes(action)) return handleList(req, res, body);
      if (['audit', 'audit-log'].includes(action)) return handleAudit(req, res, body);
      if (['backup', 'snapshot', 'export'].includes(action)) return handleBackup(req, res, body);
      if (action === 'integrity') return handleIntegrity(req, res, body, false);
      if (action === 'health') return send(req, res, 200, { ok: true, verdict: 'HEALTHY', level: 'good', message: 'Verify API is online.', time: nowIso(), env: envSummary() });
      if (['generate-id', 'new-id'].includes(action)) return send(req, res, 200, { ok: true, verdict: 'GENERATED_ID', level: 'good', id: generateVerifyId(), time: nowIso() });
      if (['self-test', 'diagnostics'].includes(action)) return handleSelfTest(req, res);
      return send(req, res, 400, { ok: false, verdict: 'BAD_ACTION', level: 'bad', message: 'Unsupported action.' });
    }
    return send(req, res, 405, { ok: false, verdict: 'METHOD_NOT_ALLOWED', level: 'bad', message: 'Use GET, POST or OPTIONS.' });
  } catch (err) {
    return send(req, res, 500, { ok: false, verdict: 'SERVER_ERROR', level: 'bad', message: err.message || String(err) });
  }
};
