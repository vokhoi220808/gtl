// PDF Fusion Smart Pro - Verify System v11 Redesign
// Serverless trusted registry API for Vercel/GitHub Pages frontend.
// No external npm dependencies. Stores only metadata, never PDF files.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_VERSION = '11.0.0-verify-redesign';
const REGISTRY_VERSION = 'PFSP-VERIFY-REGISTRY-v3';
const SIGNATURE_VERSION = 'PFSP-SERVER-SIGNED-CERT-v3';
const SIGNATURE_ALGORITHM = 'HMAC-SHA256';
const LOCAL_REGISTRY_PATH = path.join(process.cwd(), 'data', 'verify-registry.json');
const MAX_BODY = Number(process.env.PFSP_VERIFY_MAX_BODY || 1024 * 1024);
const MAX_AUDIT = Number(process.env.PFSP_VERIFY_MAX_AUDIT || 1000);
const MAX_PUBLIC_RECORDS = Number(process.env.PFSP_VERIFY_MAX_RECORDS_PUBLIC || 5000);
const AUTO_REGISTER_DAILY_LIMIT = Number(process.env.PFSP_AUTO_REGISTER_DAILY_LIMIT || 120);

function cleanString(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}
function normalizeHash(value) {
  return cleanString(value, 256).toLowerCase().replace(/[^a-f0-9]/g, '');
}
function normalizeSize(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function nowIso() {
  return new Date().toISOString();
}
function safeDate(value) {
  const raw = cleanString(value, 120);
  if (!raw) return '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off', 'disabled'].includes(String(value).toLowerCase());
}
function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}
function hmacText(secret, text) {
  return crypto.createHmac('sha256', secret).update(String(text || ''), 'utf8').digest('hex');
}
function validId(id) {
  const s = cleanString(id, 120).toUpperCase();
  return /^PFSP-\d{8}-[A-Z0-9]{6,24}$/.test(s) || /^PFSP-[A-Z0-9][A-Z0-9-]{7,90}$/.test(s);
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
  return cleanString(value, 5000).split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Verify-Admin-Secret, X-PFSP-Auto-Register');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function send(req, res, status, payload) {
  setCors(req, res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
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
    status: cleanString(record.status || 'active', 40).toLowerCase(),
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
function signRecord(record) {
  const secret = signingSecret();
  if (!secret) return '';
  return hmacText(secret, SIGNATURE_VERSION + '|' + canonicalRecord(record));
}
function verifyRecordSignature(record) {
  if (!record || !record.serverSignature) return { present: false, valid: null, reason: 'missing-signature' };
  const expected = signRecord(record);
  if (!expected) return { present: true, valid: null, reason: 'signing-secret-not-configured' };
  try {
    const a = Buffer.from(String(record.serverSignature), 'hex');
    const b = Buffer.from(expected, 'hex');
    return { present: true, valid: a.length === b.length && crypto.timingSafeEqual(a, b), algorithm: SIGNATURE_ALGORITHM, version: record.signatureVersion || SIGNATURE_VERSION };
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
    schemaVersion: 3,
    updatedAt: nowIso(),
    settings: {
      shortQr: true,
      serverSigned: true,
      auditLog: true,
      autoRegister: true,
      expirySupported: true,
      revokeReasonSupported: true,
      schema: 'v3'
    },
    records: [],
    auditLog: [],
    snapshots: []
  };
}
function normalizeRecord(record) {
  const r = record && typeof record === 'object' ? { ...record } : {};
  r.id = cleanString(r.id, 120).toUpperCase();
  r.sha256 = normalizeHash(r.sha256 || r.hash || r.h);
  r.size = normalizeSize(r.size);
  r.fileName = cleanString(r.fileName || r.name || 'document.pdf', 240);
  r.mimeType = cleanString(r.mimeType || 'application/pdf', 100);
  r.createdAt = safeDate(r.createdAt || r.ts) || cleanString(r.createdAt || r.ts || '', 120);
  r.registeredAt = safeDate(r.registeredAt) || cleanString(r.registeredAt || '', 120);
  r.updatedAt = safeDate(r.updatedAt) || cleanString(r.updatedAt || '', 120);
  r.origin = cleanString(r.origin || r.o || '', 500);
  r.app = cleanString(r.app || 'PDF Fusion Smart Pro', 120);
  r.appVersion = cleanString(r.appVersion || r.version || '', 120);
  r.sourceBundleSha256 = normalizeHash(r.sourceBundleSha256 || r.sourceHash || r.sh);
  r.checksum = cleanString(r.checksum || r.hck || '', 120);
  r.status = cleanString(r.status || 'active', 40).toLowerCase();
  r.expiresAt = safeDate(r.expiresAt);
  r.revokedAt = safeDate(r.revokedAt);
  r.restoredAt = safeDate(r.restoredAt);
  r.revokeReason = cleanString(r.revokeReason || '', 300);
  r.registrationMode = cleanString(r.registrationMode || '', 80);
  r.registeredBy = cleanString(r.registeredBy || '', 120);
  r.note = cleanString(r.note || '', 500);
  r.fingerprint = cleanString(r.fingerprint || '', 80);
  r.shortVerifyUrl = cleanString(r.shortVerifyUrl || '', 1000);
  r.verifyUrl = cleanString(r.verifyUrl || '', 1200);
  r.serverSignature = cleanString(r.serverSignature || r.certificateSignature || r.signature || '', 256);
  r.certificateSignature = r.serverSignature;
  r.signatureVersion = cleanString(r.signatureVersion || SIGNATURE_VERSION, 80);
  r.signatureAlgorithm = cleanString(r.signatureAlgorithm || SIGNATURE_ALGORITHM, 80);
  return r;
}
function normalizeRegistry(registry) {
  const base = registry && typeof registry === 'object' ? { ...registry } : emptyRegistry();
  base.version = base.version || REGISTRY_VERSION;
  base.schemaVersion = Number(base.schemaVersion || 3);
  base.updatedAt = safeDate(base.updatedAt) || base.updatedAt || nowIso();
  base.settings = { ...emptyRegistry().settings, ...(base.settings || {}) };
  base.records = Array.isArray(base.records) ? base.records.map(normalizeRecord) : [];
  base.auditLog = Array.isArray(base.auditLog) ? base.auditLog : [];
  base.snapshots = Array.isArray(base.snapshots) ? base.snapshots : [];
  return base;
}
function registryIntegrity(registry) {
  const records = Array.isArray(registry.records) ? registry.records : [];
  const seenIds = new Set();
  const seenPairs = new Set();
  const duplicateIds = [];
  const duplicateHashes = [];
  const invalidSignatureIds = [];
  let signed = 0;
  for (const record of records) {
    const id = cleanString(record.id, 120).toUpperCase();
    const hash = normalizeHash(record.sha256);
    if (seenIds.has(id)) duplicateIds.push(id);
    seenIds.add(id);
    if (hash) {
      if (seenPairs.has(hash)) duplicateHashes.push(hash);
      seenPairs.add(hash);
    }
    if (record.serverSignature) {
      signed += 1;
      const sig = verifyRecordSignature(record);
      if (sig.valid === false) invalidSignatureIds.push(id);
    }
  }
  const digestPayload = {
    version: registry.version || REGISTRY_VERSION,
    updatedAt: registry.updatedAt || '',
    records: records.map(r => ({ id: r.id, sha256: r.sha256, status: r.status, expiresAt: r.expiresAt || '', serverSignature: r.serverSignature || '' })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    auditCount: Array.isArray(registry.auditLog) ? registry.auditLog.length : 0
  };
  const problems = [
    ...invalidSignatureIds.map(id => 'invalid-signature:' + id),
    ...duplicateIds.map(id => 'duplicate-id:' + id)
  ];
  return {
    ok: problems.length === 0,
    sha256: sha256Text(stableStringify(digestPayload)),
    recordCount: records.length,
    activeCount: records.filter(r => String(r.status || 'active').toLowerCase() === 'active').length,
    revokedCount: records.filter(r => String(r.status || '').toLowerCase() === 'revoked').length,
    expiredCount: records.filter(r => r.expiresAt && Date.parse(r.expiresAt) < Date.now()).length,
    signedRecordCount: signed,
    unsignedRecordCount: records.length - signed,
    invalidSignatureIds: [...new Set(invalidSignatureIds)],
    duplicateIds: [...new Set(duplicateIds)],
    duplicateHashes: [...new Set(duplicateHashes)],
    problems,
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
    origin: cleanString(event.origin || requestOrigin(req, event), 500)
  });
  registry.auditLog = registry.auditLog.slice(0, MAX_AUDIT);
}
function addSnapshot(registry, label) {
  registry.snapshots = Array.isArray(registry.snapshots) ? registry.snapshots : [];
  registry.snapshots.unshift({ time: nowIso(), label: cleanString(label || 'snapshot', 140), integrity: registryIntegrity(registry) });
  registry.snapshots = registry.snapshots.slice(0, 30);
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
    'User-Agent': 'pdf-fusion-smart-pro-verify-v11'
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
      'User-Agent': 'pdf-fusion-smart-pro-verify-v11'
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
  registry.version = registry.version || REGISTRY_VERSION;
  registry.schemaVersion = 3;
  registry.updatedAt = nowIso();
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
    githubConfigured: !!(cfg.token && cfg.owner && cfg.repo),
    owner: cfg.owner || '',
    repo: cfg.repo || '',
    branch: cfg.branch,
    registryPath: cfg.filePath,
    signingConfigured: !!signingSecret(),
    adminConfigured: !!adminSecret(),
    autoRegisterEnabled: autoRegisterEnabled(),
    dailyAutoRegisterLimit: AUTO_REGISTER_DAILY_LIMIT,
    allowedOriginsConfigured: allow.length > 0,
    allowedOriginsCount: allow.length,
    wildcardCorsEnabled: parseBool(process.env.PFSP_ALLOW_WILDCARD_CORS, false),
    localWriteEnabled: parseBool(process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE, false)
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
    id: cert.id,
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
    status: cert.status || 'active',
    expiresAt: cert.expiresAt || input.expiresAt || '',
    registeredBy: input.registeredBy || cert.registeredBy || (mode === 'auto' ? 'auto-qr-export' : 'admin'),
    registrationMode: mode === 'auto' ? 'auto-qr-export' : 'manual-admin',
    note: input.note || cert.note || '',
    signatureVersion: SIGNATURE_VERSION,
    signatureAlgorithm: SIGNATURE_ALGORITHM
  });
  record.fingerprint = record.fingerprint || sha256Text([record.id, record.sha256, record.size ?? '', record.createdAt, record.origin].join('|')).slice(0, 32).toUpperCase();
  record.shortVerifyUrl = shortVerifyUrl(req, record);
  record.verifyUrl = verifyUrlWithHash(req, record);
  record.serverSignature = signRecord(record);
  record.certificateSignature = record.serverSignature;
  if (mode === 'auto') {
    record.clientIpHash = clientIpHash(req);
    record.userAgentHash = userAgentHash(req);
  }
  return record;
}
function signedCertificate(record) {
  return {
    certificateVersion: 'PFSP-TRUSTED-CERT-v3',
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
    status: record.status,
    expiresAt: record.expiresAt || '',
    revokedAt: record.revokedAt || '',
    revokeReason: record.revokeReason || '',
    shortVerifyUrl: record.shortVerifyUrl,
    verifyUrl: record.verifyUrl,
    fingerprint: record.fingerprint,
    serverSignature: record.serverSignature,
    certificateSignature: record.certificateSignature,
    signatureVersion: record.signatureVersion || SIGNATURE_VERSION,
    signatureAlgorithm: record.signatureAlgorithm || SIGNATURE_ALGORITHM
  };
}
function findRecord(registry, id) {
  const target = cleanString(id, 120).toUpperCase();
  return (registry.records || []).find(r => cleanString(r.id, 120).toUpperCase() === target) || null;
}
function evaluate(registry, query = {}) {
  const id = cleanString(query.id || query.verifyId, 120).toUpperCase();
  const inputHash = normalizeHash(query.sha256 || query.hash || query.h);
  const inputSize = normalizeSize(query.size);
  if (!id) return { ok: false, verdict: 'NO_ID', level: 'bad', message: 'Missing verify ID.' };
  const record = findRecord(registry, id);
  if (!record) return { ok: false, verdict: 'UNKNOWN', level: 'warn', message: 'Verify ID is not registered in the trusted registry.', id, registryVersion: registry.version || REGISTRY_VERSION };
  const signature = verifyRecordSignature(record);
  const expired = record.expiresAt && Date.parse(record.expiresAt) && Date.parse(record.expiresAt) < Date.now();
  if (signature.present && signature.valid === false) return { ok: false, verdict: 'REGISTRY_TAMPERED', level: 'bad', message: 'Registry record signature is invalid. Treat this record as unsafe.', record, signature };
  if (String(record.status || 'active').toLowerCase() === 'revoked') return { ok: false, verdict: 'REVOKED', level: 'bad', message: record.revokeReason ? `Verify ID is revoked: ${record.revokeReason}` : 'Verify ID is registered but revoked.', record, signature };
  if (expired) return { ok: false, verdict: 'EXPIRED', level: 'bad', message: 'Verify ID is registered but expired.', record, signature };
  if (!inputHash) return { ok: false, verdict: 'REGISTERED_NEEDS_FILE', level: 'warn', message: 'Verify ID exists. Upload/provide the PDF hash to confirm the actual file.', record, signature };
  if (normalizeHash(record.sha256) !== inputHash) return { ok: false, verdict: 'FAKE_OR_MODIFIED', level: 'bad', message: 'Verify ID exists, but the uploaded/provided PDF hash does not match the registered original.', record, providedHash: inputHash, signature };
  const sizeMismatch = inputSize !== null && record.size !== null && String(inputSize) !== String(record.size);
  if (sizeMismatch) return { ok: true, verdict: 'HASH_MATCH_SIZE_WARNING', level: 'warn', message: 'Hash matches the trusted record, but the size metadata differs.', record, providedHash: inputHash, signature, certificate: signedCertificate(record) };
  return { ok: true, verdict: 'GENUINE', level: 'good', message: 'Verify ID and PDF SHA-256 match the server-signed trusted registry record.', record, providedHash: inputHash, signature, certificate: signedCertificate(record) };
}
function tooManyAutoRegisters(registry, req) {
  const ip = clientIpHash(req);
  if (!ip || !AUTO_REGISTER_DAILY_LIMIT) return false;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const count = (registry.auditLog || []).filter(x => x.action === 'auto-register' && x.clientIpHash === ip && Date.parse(x.time || '') > since).length;
  return count >= AUTO_REGISTER_DAILY_LIMIT;
}
function publicRecord(record) {
  const r = { ...record };
  delete r.clientIpHash;
  delete r.userAgentHash;
  return r;
}

async function handleCheck(req, res, query, method = 'GET') {
  const registry = await readRegistry();
  const result = evaluate(registry, query);
  const status = result.verdict === 'UNKNOWN' ? 404 : 200;
  return send(req, res, status, { checkedAt: nowIso(), registryIntegrity: registryIntegrity(registry), ...result });
}
async function handleStats(req, res) {
  const registry = await readRegistry();
  return send(req, res, 200, { ok: true, verdict: 'STATS', level: 'good', message: 'Public registry status loaded.', updatedAt: registry.updatedAt, registryVersion: registry.version, registryIntegrity: registryIntegrity(registry), env: envSummary() });
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
      return send(req, res, 200, { ok: true, verdict: 'ALREADY_REGISTERED', level: 'good', message: 'This QR Verify PDF was already registered with the same SHA-256 hash.', record: publicRecord(existing), certificate: signedCertificate(existing), registryIntegrity: registryIntegrity(registry) });
    }
    addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'ID_COLLISION', ok: false, message: 'ID exists with a different hash.', origin: record.origin });
    return send(req, res, 409, { ok: false, verdict: 'ID_COLLISION', level: 'bad', message: 'This Verify ID already exists with a different SHA-256 hash. The new PDF was not registered.', existing: publicRecord(existing), attempted: publicRecord(record) });
  }
  registry.records.push(record);
  addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'AUTO_REGISTERED', ok: true, message: 'Auto-registered on PDF export.', origin: record.origin });
  try {
    const saved = await persistRegistry(registry, `Auto-register PFSP verify ID ${record.id}`);
    return send(req, res, 200, { ok: true, verdict: 'AUTO_REGISTERED', level: 'good', message: 'QR Verify PDF was automatically registered in the server-signed trusted registry.', record: publicRecord(record), certificate: signedCertificate(record), commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: 'AUTO_REGISTER_PENDING_MANUAL_PATCH', level: 'warn', message: 'Auto-registration created a server-signed record, but durable registry write failed. Commit the suggested registry JSON manually or fix GitHub env vars.', error: err.message, record: publicRecord(record), certificate: signedCertificate(record), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
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
  if (idx >= 0 && !body.overwrite) return send(req, res, 409, { ok: false, verdict: 'ALREADY_REGISTERED', level: 'warn', message: 'This verify ID already exists. Use overwrite=true only if intentional.', existing: publicRecord(registry.records[idx]) });
  if (idx >= 0) registry.records[idx] = { ...registry.records[idx], ...record, updatedAt: nowIso() };
  else registry.records.push(record);
  addAudit(registry, req, { action: 'register', id: record.id, sha256: record.sha256, result: 'REGISTERED', ok: true, message: 'Manual admin registration.', actor: 'admin', origin: record.origin });
  try {
    const saved = await persistRegistry(registry, `Register PFSP verify ID ${record.id}`);
    return send(req, res, 200, { ok: true, verdict: 'REGISTERED', level: 'good', message: 'Record registered in trusted registry.', record: publicRecord(record), certificate: signedCertificate(record), commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: 'MANUAL_REGISTRY_PATCH_REQUIRED', level: 'warn', message: 'Record is valid, but durable registry write failed. Commit the suggested registry JSON manually or configure GitHub env vars.', error: err.message, record: publicRecord(record), certificate: signedCertificate(record), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
async function handleRecordPatch(req, res, body, patcher, actionName, successVerdict) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning(req, res)) return;
  const id = cleanString(body.id || body.verifyId, 120).toUpperCase();
  const registry = await readRegistry();
  const record = findRecord(registry, id);
  if (!record) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  patcher(record);
  record.updatedAt = nowIso();
  record.serverSignature = signRecord(record);
  record.certificateSignature = record.serverSignature;
  addAudit(registry, req, { action: actionName, id, sha256: record.sha256, result: successVerdict, ok: true, message: body.reason || body.revokeReason || actionName, actor: 'admin', origin: record.origin });
  try {
    const saved = await persistRegistry(registry, `${successVerdict} PFSP verify ID ${id}`);
    return send(req, res, 200, { ok: true, verdict: successVerdict, level: actionName === 'revoke' ? 'bad' : 'good', message: `Record updated: ${successVerdict}.`, record: publicRecord(record), certificate: signedCertificate(record), commit: saved.commit && saved.commit.html_url, localWrite: saved.local || false, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(req, res, 202, { ok: false, verdict: `MANUAL_${successVerdict}_PATCH_REQUIRED`, level: 'warn', message: 'Patch is ready but durable write failed.', error: err.message, record: publicRecord(record), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
function listMatches(record, q, status) {
  if (status && String(record.status || 'active').toLowerCase() !== status) return false;
  if (!q) return true;
  const hay = [record.id, record.sha256, record.fileName, record.origin, record.status, record.note].join(' ').toUpperCase();
  return hay.includes(q);
}
async function handleList(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  const registry = await readRegistry();
  const q = cleanString(body.query || body.q || '', 160).toUpperCase();
  const status = cleanString(body.status || '', 40).toLowerCase();
  const limit = Math.min(Number(body.limit || MAX_PUBLIC_RECORDS) || MAX_PUBLIC_RECORDS, MAX_PUBLIC_RECORDS);
  const records = (registry.records || []).filter(r => listMatches(r, q, status)).slice(0, limit).map(publicRecord);
  return send(req, res, 200, { ok: true, verdict: 'LIST', level: 'good', message: 'Registry records loaded.', records, count: records.length, total: (registry.records || []).length, updatedAt: registry.updatedAt, registryIntegrity: registryIntegrity(registry) });
}
async function handleAudit(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  const registry = await readRegistry();
  const limit = Math.min(Number(body.limit || 100) || 100, 500);
  return send(req, res, 200, { ok: true, verdict: 'AUDIT', level: 'good', message: 'Audit log loaded.', auditLog: (registry.auditLog || []).slice(0, limit), count: (registry.auditLog || []).length, registryIntegrity: registryIntegrity(registry) });
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
  return send(req, res, 200, { ok: true, verdict: integrity.ok ? 'INTEGRITY_OK' : 'INTEGRITY_WARNING', level: integrity.ok ? 'good' : 'warn', message: 'Registry integrity check completed.', registryIntegrity: integrity, updatedAt: registry.updatedAt, env: envSummary() });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(req, res, 200, { ok: true, verdict: 'OPTIONS' });
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'https://local.local');
      const params = Object.fromEntries(url.searchParams.entries());
      const action = cleanString(params.action || '', 60).toLowerCase();
      if (action === 'health' || url.searchParams.get('health')) return send(req, res, 200, { ok: true, verdict: 'HEALTHY', level: 'good', message: 'Verify API is online.', time: nowIso(), env: envSummary() });
      if (action === 'stats' || url.searchParams.get('stats')) return handleStats(req, res);
      if (action === 'integrity' || url.searchParams.get('integrity')) return handleIntegrity(req, res, {}, false);
      return handleCheck(req, res, params, 'GET');
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = cleanString(body.action || 'register', 60).toLowerCase();
      if (['verify', 'check'].includes(action)) return handleCheck(req, res, body, 'POST');
      if (['auto-register', 'autoregister'].includes(action)) return handleAutoRegister(req, res, body);
      if (action === 'register') return handleRegister(req, res, body);
      if (action === 'revoke') return handleRecordPatch(req, res, body, record => {
        record.status = 'revoked';
        record.revokedAt = nowIso();
        record.restoredAt = '';
        record.revokeReason = cleanString(body.reason || body.revokeReason || 'revoked by admin', 300);
      }, 'revoke', 'REVOKED');
      if (action === 'restore') return handleRecordPatch(req, res, body, record => {
        record.status = 'active';
        record.restoredAt = nowIso();
        record.revokedAt = '';
        record.revokeReason = '';
      }, 'restore', 'RESTORED');
      if (['expiry', 'update-expiry', 'set-expiry'].includes(action)) return handleRecordPatch(req, res, body, record => {
        record.expiresAt = safeDate(body.expiresAt) || '';
      }, 'update-expiry', 'EXPIRY_UPDATED');
      if (['list', 'records', 'search'].includes(action)) return handleList(req, res, body);
      if (['audit', 'audit-log'].includes(action)) return handleAudit(req, res, body);
      if (['backup', 'snapshot', 'export'].includes(action)) return handleBackup(req, res, body);
      if (action === 'integrity') return handleIntegrity(req, res, body, false);
      if (action === 'health') return send(req, res, 200, { ok: true, verdict: 'HEALTHY', level: 'good', message: 'Verify API is online.', time: nowIso(), env: envSummary() });
      return send(req, res, 400, { ok: false, verdict: 'BAD_ACTION', level: 'bad', message: 'Unsupported action.' });
    }
    return send(req, res, 405, { ok: false, verdict: 'METHOD_NOT_ALLOWED', level: 'bad', message: 'Use GET, POST or OPTIONS.' });
  } catch (err) {
    return send(req, res, 500, { ok: false, verdict: 'SERVER_ERROR', level: 'bad', message: err.message || String(err) });
  }
};
