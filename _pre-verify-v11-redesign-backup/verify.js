// PDF Fusion Smart Pro - Verify System Final BIG v10.0.0
// Trusted registry API for Vercel serverless functions.
// Features: server-signed records, short QR verification, auto-register, admin actions,
// rate limiting, revoke/restore/expiry, audit log, registry backup, integrity checks.
// No external npm dependencies.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_VERSION = '10.0.0-final-big';
const REGISTRY_VERSION = 'PFSP-VERIFY-REGISTRY-v2';
const LOCAL_REGISTRY_PATH = path.join(process.cwd(), 'data', 'verify-registry.json');
const MAX_BODY = Number(process.env.PFSP_VERIFY_MAX_BODY || 1024 * 1024);
const MAX_AUDIT = Number(process.env.PFSP_VERIFY_MAX_AUDIT || 800);
const MAX_RECORDS_PUBLIC = Number(process.env.PFSP_VERIFY_MAX_RECORDS_PUBLIC || 5000);
const AUTO_REGISTER_DAILY_LIMIT = Number(process.env.PFSP_AUTO_REGISTER_DAILY_LIMIT || 80);

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', process.env.PFSP_CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Verify-Admin-Secret, X-PFSP-Auto-Register');
  res.end(JSON.stringify({ apiVersion: API_VERSION, ...payload }, null, 2));
}

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
function nowIso() { return new Date().toISOString(); }
function validId(id) {
  return /^PFSP-\d{8}-[A-Z0-9]{6,20}$/i.test(String(id || '')) || /^PFSP-[A-Z0-9-]{8,80}$/i.test(String(id || ''));
}
function validHash(hash) { return /^[a-f0-9]{64}$/i.test(String(hash || '')); }
function sha256Text(text) { return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex'); }
function hmacText(secret, text) { return crypto.createHmac('sha256', secret).update(String(text || ''), 'utf8').digest('hex'); }
function safeDate(s) { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? new Date(t).toISOString() : ''; }
function parseBool(value, fallback=false) {
  if (value == null || value === '') return fallback;
  return !['0','false','no','off','disabled'].includes(String(value).toLowerCase());
}
function getBaseUrl(req, record) {
  const env = cleanString(process.env.PFSP_PUBLIC_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || '', 300);
  if (env) return env.startsWith('http') ? env.replace(/\/$/,'') : 'https://' + env.replace(/\/$/,'');
  const origin = cleanString(record && record.origin || req.headers.origin || '', 300);
  if (/^https?:\/\//i.test(origin)) return origin.replace(/\/$/,'');
  const host = cleanString(req.headers.host || '', 200);
  return host ? 'https://' + host : '';
}
function shortVerifyUrl(req, record) {
  const base = getBaseUrl(req, record);
  return base ? `${base}/verify.html?id=${encodeURIComponent(record.id)}` : `./verify.html?id=${encodeURIComponent(record.id)}`;
}
function verifyUrlWithHash(req, record) {
  const base = getBaseUrl(req, record);
  const q = new URLSearchParams({ id: record.id, sha256: record.sha256 });
  if (record.size != null) q.set('size', String(record.size));
  return (base ? `${base}/verify.html` : './verify.html') + '?' + q.toString();
}
function clientIp(req) {
  return cleanString(String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '', 120);
}
function clientIpHash(req) { const ip = clientIp(req); return ip ? sha256Text(ip).slice(0, 24).toUpperCase() : ''; }
function userAgentHash(req) { return req.headers['user-agent'] ? sha256Text(req.headers['user-agent']).slice(0, 24).toUpperCase() : ''; }
function requestOrigin(req, body) { return cleanString(req.headers.origin || req.headers.referer || body?.origin || body?.certificate?.origin || '', 300); }

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
function publicRecordForSignature(record) {
  const clone = { ...record };
  delete clone.serverSignature;
  delete clone.certificateSignature;
  delete clone.signature;
  delete clone.signatureVerified;
  delete clone.localOnly;
  return clone;
}
function canonicalRecord(record) {
  return stableStringify(publicRecordForSignature({
    id: cleanString(record.id, 100).toUpperCase(),
    sha256: normalizeHash(record.sha256),
    size: normalizeSize(record.size),
    fileName: cleanString(record.fileName, 240),
    mimeType: cleanString(record.mimeType || 'application/pdf', 100),
    createdAt: cleanString(record.createdAt || record.ts, 80),
    registeredAt: cleanString(record.registeredAt, 80),
    origin: cleanString(record.origin, 300),
    app: cleanString(record.app || 'PDF Fusion Smart Pro', 120),
    appVersion: cleanString(record.appVersion || record.version, 100),
    sourceBundleSha256: normalizeHash(record.sourceBundleSha256 || record.sourceHash || record.sh),
    checksum: cleanString(record.checksum || record.hck, 100),
    status: cleanString(record.status || 'active', 40).toLowerCase(),
    expiresAt: cleanString(record.expiresAt, 80),
    revokedAt: cleanString(record.revokedAt, 80),
    revokeReason: cleanString(record.revokeReason, 300),
    registrationMode: cleanString(record.registrationMode, 80),
    registeredBy: cleanString(record.registeredBy, 120),
    note: cleanString(record.note, 500),
    fingerprint: cleanString(record.fingerprint, 80)
  }));
}
function signingSecret() {
  return process.env.PFSP_VERIFY_SIGNING_SECRET || process.env.VERIFY_SIGNING_SECRET || process.env.VERIFY_ADMIN_SECRET || '';
}
function signRecord(record) {
  const secret = signingSecret();
  if (!secret) return '';
  return hmacText(secret, 'PFSP-SERVER-SIGNED-CERT-v2|' + canonicalRecord(record));
}
function verifyRecordSignature(record) {
  if (!record || !record.serverSignature) return { present: false, valid: null, reason: 'missing-signature' };
  const expected = signRecord({ ...record, serverSignature: '', certificateSignature: '' });
  if (!expected) return { present: true, valid: null, reason: 'server-signing-secret-not-configured' };
  try {
    const a = Buffer.from(String(record.serverSignature), 'hex');
    const b = Buffer.from(expected, 'hex');
    return { present: true, valid: a.length === b.length && crypto.timingSafeEqual(a, b), algorithm: 'HMAC-SHA256', version: 'PFSP-SERVER-SIGNED-CERT-v2' };
  } catch (err) {
    return { present: true, valid: false, reason: 'bad-signature-format' };
  }
}
function registryIntegrity(registry) {
  const records = Array.isArray(registry.records) ? registry.records : [];
  const audit = Array.isArray(registry.auditLog) ? registry.auditLog : [];
  const signed = records.filter(r => r.serverSignature).length;
  const invalid = records.filter(r => r.serverSignature && verifyRecordSignature(r).valid === false).map(r => r.id);
  const duplicateIds = [];
  const seen = new Set();
  for (const r of records) {
    const id = cleanString(r.id, 100).toUpperCase();
    if (seen.has(id)) duplicateIds.push(id); else seen.add(id);
  }
  const digestPayload = {
    version: registry.version || REGISTRY_VERSION,
    updatedAt: registry.updatedAt || '',
    records: records.map(r => ({ id: r.id, sha256: r.sha256, status: r.status, serverSignature: r.serverSignature || '' })).sort((a,b)=>String(a.id).localeCompare(String(b.id))),
    auditCount: audit.length
  };
  return {
    ok: invalid.length === 0 && duplicateIds.length === 0,
    sha256: sha256Text(stableStringify(digestPayload)),
    recordCount: records.length,
    signedRecordCount: signed,
    unsignedRecordCount: records.length - signed,
    invalidSignatureIds: invalid,
    duplicateIds: [...new Set(duplicateIds)],
    checkedAt: nowIso()
  };
}

function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    schemaVersion: 2,
    updatedAt: nowIso(),
    settings: { shortQr: true, serverSigned: true, auditLog: true, expirySupported: true, revokeReasonSupported: true },
    records: [],
    auditLog: [],
    snapshots: []
  };
}
function normalizeRegistry(registry) {
  const base = registry && typeof registry === 'object' ? registry : emptyRegistry();
  base.version = base.version || REGISTRY_VERSION;
  base.schemaVersion = base.schemaVersion || 2;
  base.settings = { shortQr: true, serverSigned: true, auditLog: true, expirySupported: true, revokeReasonSupported: true, ...(base.settings || {}) };
  base.records = Array.isArray(base.records) ? base.records : [];
  base.auditLog = Array.isArray(base.auditLog) ? base.auditLog : [];
  base.snapshots = Array.isArray(base.snapshots) ? base.snapshots : [];
  return base;
}
function addAudit(registry, req, event) {
  registry.auditLog = Array.isArray(registry.auditLog) ? registry.auditLog : [];
  registry.auditLog.unshift({
    time: nowIso(),
    action: cleanString(event.action, 80),
    id: cleanString(event.id, 100).toUpperCase(),
    sha256: normalizeHash(event.sha256),
    result: cleanString(event.result || event.verdict, 80),
    ok: !!event.ok,
    message: cleanString(event.message, 300),
    clientIpHash: clientIpHash(req),
    userAgentHash: userAgentHash(req),
    origin: cleanString(event.origin || requestOrigin(req, event), 300)
  });
  registry.auditLog = registry.auditLog.slice(0, MAX_AUDIT);
}
function addSnapshot(registry, label) {
  const integrity = registryIntegrity(registry);
  registry.snapshots = Array.isArray(registry.snapshots) ? registry.snapshots : [];
  registry.snapshots.unshift({ time: nowIso(), label: cleanString(label, 140), integrity });
  registry.snapshots = registry.snapshots.slice(0, 30);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let rejected = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY && !rejected) { rejected = true; reject(new Error('Request body too large')); }
    });
    req.on('end', () => {
      if (rejected) return;
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
    token: process.env.GITHUB_TOKEN || process.env.PFSP_GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || process.env.PFSP_GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || process.env.PFSP_GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || process.env.PFSP_GITHUB_BRANCH || 'main',
    filePath: process.env.PFSP_REGISTRY_PATH || 'data/verify-registry.json'
  };
}
async function readRegistryFromGithub() {
  const cfg = githubConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) return null;
  const api = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.filePath}?ref=${encodeURIComponent(cfg.branch)}`;
  const meta = await fetchJson(api, { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'pdf-fusion-smart-pro-verify-final-big' });
  const raw = Buffer.from(String(meta.content || ''), 'base64').toString('utf8');
  const registry = JSON.parse(raw);
  registry.__githubSha = meta.sha;
  return normalizeRegistry(registry);
}
async function readRegistry() {
  if (process.env.PFSP_REGISTRY_URL) {
    try { return normalizeRegistry(await fetchJson(process.env.PFSP_REGISTRY_URL)); } catch (err) {}
  }
  try { const gh = await readRegistryFromGithub(); if (gh) return gh; } catch (err) {}
  try { return normalizeRegistry(JSON.parse(fs.readFileSync(LOCAL_REGISTRY_PATH, 'utf8'))); }
  catch (err) { return emptyRegistry(); }
}
async function writeRegistryToGithub(registry, message) {
  const cfg = githubConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) { const err = new Error('GitHub registry env vars are not configured.'); err.code = 'NO_GITHUB_CONFIG'; throw err; }
  const current = await readRegistryFromGithub().catch(() => null);
  const sha = current && current.__githubSha;
  const api = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.filePath}`;
  const payload = { ...registry };
  delete payload.__githubSha;
  payload.integrity = registryIntegrity(payload);
  const body = { message, branch: cfg.branch, content: Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8').toString('base64') };
  if (sha) body.sha = sha;
  const r = await fetch(api, { method: 'PUT', headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'pdf-fusion-smart-pro-verify-final-big' }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `GitHub write failed ${r.status}`);
  return json;
}
async function persistRegistry(registry, message) {
  registry.updatedAt = nowIso();
  registry.integrity = registryIntegrity(registry);
  registry.records.sort((a,b)=>String(b.registeredAt || b.createdAt || '').localeCompare(String(a.registeredAt || a.createdAt || '')));
  const gh = await writeRegistryToGithub(registry, message);
  return gh;
}
function envSummary() {
  const cfg = githubConfig();
  return {
    githubConfigured: !!(cfg.token && cfg.owner && cfg.repo),
    owner: cfg.owner || '',
    repo: cfg.repo || '',
    branch: cfg.branch,
    registryPath: cfg.filePath,
    signingConfigured: !!signingSecret(),
    adminConfigured: !!(process.env.VERIFY_ADMIN_SECRET || process.env.PFSP_VERIFY_ADMIN_SECRET),
    autoRegisterEnabled: autoRegisterEnabled(),
    dailyAutoRegisterLimit: AUTO_REGISTER_DAILY_LIMIT,
    allowedOriginsConfigured: !!cleanString(process.env.PFSP_VERIFY_ALLOWED_ORIGINS, 1000)
  };
}
function hasAdmin(req, body) {
  const expected = process.env.VERIFY_ADMIN_SECRET || process.env.PFSP_VERIFY_ADMIN_SECRET || '';
  if (!expected) return false;
  const header = req.headers['x-verify-admin-secret'] || '';
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const supplied = cleanString(body.adminSecret || body.secret || header || auth, 1000);
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function autoRegisterEnabled() {
  return parseBool(process.env.PFSP_AUTO_REGISTER_ENABLED ?? process.env.PFSP_VERIFY_AUTO_REGISTER, true);
}
function originAllowed(req, record) {
  const raw = cleanString(process.env.PFSP_VERIFY_ALLOWED_ORIGINS, 2000);
  if (!raw) return { ok: true, reason: 'no-allowlist-configured' };
  const allow = raw.split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
  const candidates = [requestOrigin(req, record), record.origin, getBaseUrl(req, record)].map(x=>cleanString(x,300).replace(/\/$/,'')).filter(Boolean);
  const ok = candidates.some(c => allow.includes(c));
  return { ok, allow, candidates, reason: ok ? 'origin-allowed' : 'origin-not-in-allowlist' };
}
function makeRecord(input, req, mode = 'manual') {
  const cert = input.certificate || input.cert || input.record || input;
  const now = nowIso();
  const record = {
    id: cleanString(cert.id, 100).toUpperCase(),
    sha256: normalizeHash(cert.sha256 || cert.hash || cert.h),
    size: normalizeSize(cert.size),
    fileName: cleanString(cert.fileName || cert.name || 'document.pdf', 240),
    mimeType: cleanString(cert.mimeType || 'application/pdf', 100),
    createdAt: safeDate(cert.createdAt || cert.ts) || now,
    registeredAt: now,
    origin: cleanString(cert.origin || cert.o || requestOrigin(req, cert), 300),
    app: cleanString(cert.app || 'PDF Fusion Smart Pro', 120),
    appVersion: cleanString(cert.appVersion || cert.version || 'unknown', 100),
    sourceBundleSha256: normalizeHash(cert.sourceBundleSha256 || cert.sourceHash || cert.sh),
    checksum: cleanString(cert.checksum || cert.hck || '', 100),
    status: cleanString(cert.status || 'active', 40).toLowerCase(),
    expiresAt: safeDate(cert.expiresAt || input.expiresAt) || '',
    registeredBy: cleanString(input.registeredBy || cert.registeredBy || (mode === 'auto' ? 'auto-qr-export' : 'admin'), 120),
    registrationMode: mode === 'auto' ? 'auto-qr-export' : 'manual-admin',
    note: cleanString(input.note || cert.note || '', 500),
    clientIpHash: mode === 'auto' ? clientIpHash(req) : '',
    userAgentHash: mode === 'auto' ? userAgentHash(req) : '',
    signatureVersion: 'PFSP-SERVER-SIGNED-CERT-v2',
    signatureAlgorithm: 'HMAC-SHA256'
  };
  record.fingerprint = sha256Text([record.id, record.sha256, record.size ?? '', record.createdAt, record.origin].join('|')).slice(0, 32).toUpperCase();
  record.shortVerifyUrl = shortVerifyUrl(req, record);
  record.verifyUrl = verifyUrlWithHash(req, record);
  record.serverSignature = signRecord(record);
  record.certificateSignature = record.serverSignature;
  return record;
}
function signedCertificate(record) {
  return {
    certificateVersion: 'PFSP-TRUSTED-CERT-v2',
    app: record.app,
    appVersion: record.appVersion,
    id: record.id,
    sha256: record.sha256,
    size: record.size,
    fileName: record.fileName,
    mimeType: record.mimeType,
    createdAt: record.createdAt,
    registeredAt: record.registeredAt,
    origin: record.origin,
    status: record.status,
    expiresAt: record.expiresAt || '',
    shortVerifyUrl: record.shortVerifyUrl,
    verifyUrl: record.verifyUrl,
    fingerprint: record.fingerprint,
    serverSignature: record.serverSignature,
    certificateSignature: record.certificateSignature,
    signatureVersion: record.signatureVersion,
    signatureAlgorithm: record.signatureAlgorithm
  };
}
function findRecord(registry, id) {
  const target = cleanString(id, 100).toUpperCase();
  return (registry.records || []).find(r => cleanString(r.id, 100).toUpperCase() === target) || null;
}
function evaluate(registry, query) {
  const id = cleanString(query.id || query.verifyId, 100).toUpperCase();
  const inputHash = normalizeHash(query.sha256 || query.hash || query.h);
  const inputSize = normalizeSize(query.size);
  if (!id) return { ok: false, verdict: 'NO_ID', level: 'bad', message: 'Missing verify ID.' };
  const record = findRecord(registry, id);
  if (!record) return { ok: false, verdict: 'UNKNOWN', level: 'warn', message: 'Verify ID is not registered in the trusted registry.', id, registryVersion: registry.version || REGISTRY_VERSION };
  const sig = verifyRecordSignature(record);
  const now = Date.now();
  const expired = record.expiresAt && Date.parse(record.expiresAt) && Date.parse(record.expiresAt) < now;
  if (sig.present && sig.valid === false) return { ok: false, verdict: 'REGISTRY_TAMPERED', level: 'bad', message: 'Registry record signature is invalid. Treat this record as unsafe.', record, signature: sig };
  if (String(record.status || 'active').toLowerCase() === 'revoked') return { ok: false, verdict: 'REVOKED', level: 'bad', message: record.revokeReason ? `Verify ID is revoked: ${record.revokeReason}` : 'Verify ID is registered but revoked.', record, signature: sig };
  if (expired) return { ok: false, verdict: 'EXPIRED', level: 'bad', message: 'Verify ID is registered but expired.', record, signature: sig };
  if (!inputHash) return { ok: false, verdict: 'REGISTERED_NEEDS_FILE', level: 'warn', message: 'Verify ID exists. Upload/provide the PDF hash to confirm the actual file.', record, signature: sig };
  if (normalizeHash(record.sha256) !== inputHash) return { ok: false, verdict: 'FAKE_OR_MODIFIED', level: 'bad', message: 'Verify ID exists, but the uploaded/provided PDF hash does not match the registered original.', record, providedHash: inputHash, signature: sig };
  const sizeMismatch = inputSize !== null && record.size !== null && String(inputSize) !== String(record.size);
  if (sizeMismatch) return { ok: true, verdict: 'HASH_MATCH_SIZE_WARNING', level: 'warn', message: 'Hash matches the trusted record, but the size metadata differs.', record, providedHash: inputHash, signature: sig };
  return { ok: true, verdict: 'GENUINE', level: 'good', message: 'Verify ID and PDF hash match the server-signed trusted registry record.', record, providedHash: inputHash, signature: sig, certificate: signedCertificate(record) };
}
function tooManyAutoRegisters(registry, req) {
  const ip = clientIpHash(req);
  if (!ip || !AUTO_REGISTER_DAILY_LIMIT) return false;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const count = (registry.auditLog || []).filter(x => x.action === 'auto-register' && x.clientIpHash === ip && Date.parse(x.time || '') > since).length;
  return count >= AUTO_REGISTER_DAILY_LIMIT;
}
async function handleCheck(req, res, query, method='GET') {
  const registry = await readRegistry();
  const result = evaluate(registry, query);
  if (method === 'POST') addAudit(registry, req, { action: 'verify', id: query.id, sha256: query.sha256 || query.hash || query.h, result: result.verdict, ok: result.ok, message: result.message, origin: requestOrigin(req, query) });
  return send(res, result.verdict === 'UNKNOWN' ? 404 : 200, { checkedAt: nowIso(), registryIntegrity: registryIntegrity(registry), ...result });
}
async function handleAutoRegister(req, res, body) {
  if (!autoRegisterEnabled()) return send(res, 403, { ok: false, verdict: 'AUTO_REGISTER_DISABLED', level: 'warn', message: 'Public QR auto-registration is disabled on this deployment.' });
  const registry = await readRegistry();
  if (tooManyAutoRegisters(registry, req)) return send(res, 429, { ok: false, verdict: 'RATE_LIMITED', level: 'bad', message: `Auto-register limit reached for this client. Limit: ${AUTO_REGISTER_DAILY_LIMIT}/24h.` });
  const record = makeRecord(body, req, 'auto');
  if (!validId(record.id)) return send(res, 400, { ok: false, verdict: 'BAD_ID', level: 'bad', message: 'Invalid PFSP verify ID.', record });
  if (!validHash(record.sha256)) return send(res, 400, { ok: false, verdict: 'BAD_HASH', level: 'bad', message: 'Invalid SHA-256 hash.', record });
  const allow = originAllowed(req, record);
  if (!allow.ok) return send(res, 403, { ok: false, verdict: 'ORIGIN_NOT_ALLOWED', level: 'bad', message: 'This origin is not allowed to auto-register trusted records.', originPolicy: allow });
  registry.records = Array.isArray(registry.records) ? registry.records : [];
  const existing = findRecord(registry, record.id);
  if (existing) {
    if (normalizeHash(existing.sha256) === record.sha256) {
      addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'ALREADY_REGISTERED', ok: true, message: 'Same ID/hash already registered.', origin: record.origin });
      return send(res, 200, { ok: true, verdict: 'ALREADY_REGISTERED', level: 'good', message: 'This QR Verify PDF was already registered with the same SHA-256 hash.', record: existing, certificate: signedCertificate(existing), registryIntegrity: registryIntegrity(registry) });
    }
    addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'ID_COLLISION', ok: false, message: 'ID exists with a different hash.', origin: record.origin });
    return send(res, 409, { ok: false, verdict: 'ID_COLLISION', level: 'bad', message: 'This Verify ID already exists with a different SHA-256 hash. The new PDF was not registered.', existing, attempted: record });
  }
  registry.records.push(record);
  addAudit(registry, req, { action: 'auto-register', id: record.id, sha256: record.sha256, result: 'AUTO_REGISTERED', ok: true, message: 'Auto-registered on PDF export.', origin: record.origin });
  try {
    const gh = await persistRegistry(registry, `Auto-register PFSP trusted verify ID ${record.id}`);
    return send(res, 200, { ok: true, verdict: 'AUTO_REGISTERED', level: 'good', message: 'QR Verify PDF was automatically registered in the server-signed trusted registry.', record, certificate: signedCertificate(record), commit: gh.commit && gh.commit.html_url, registryIntegrity: registryIntegrity(registry) });
  } catch (err) {
    return send(res, 202, { ok: false, verdict: 'AUTO_REGISTER_PENDING_MANUAL_PATCH', level: 'warn', message: 'Auto-registration created a valid server-signed record, but durable GitHub write is not configured or failed. Commit the suggested registry JSON manually.', error: err.message, record, certificate: signedCertificate(record), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) });
  }
}
async function handleRegister(req, res, body) {
  if (!hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const registry = await readRegistry();
  const record = makeRecord(body, req, 'manual');
  if (!validId(record.id)) return send(res, 400, { ok: false, verdict: 'BAD_ID', level: 'bad', message: 'Invalid PFSP verify ID.', record });
  if (!validHash(record.sha256)) return send(res, 400, { ok: false, verdict: 'BAD_HASH', level: 'bad', message: 'Invalid SHA-256 hash.', record });
  const idx = registry.records.findIndex(r => cleanString(r.id, 100).toUpperCase() === record.id);
  if (idx >= 0 && !body.overwrite) return send(res, 409, { ok: false, verdict: 'ALREADY_REGISTERED', level: 'warn', message: 'This verify ID already exists. Use overwrite=true only if intentional.', existing: registry.records[idx] });
  if (idx >= 0) registry.records[idx] = { ...registry.records[idx], ...record, updatedAt: nowIso() }; else registry.records.push(record);
  addAudit(registry, req, { action: 'register', id: record.id, sha256: record.sha256, result: 'REGISTERED', ok: true, message: 'Manual admin registration.', origin: record.origin });
  try { const gh = await persistRegistry(registry, `Register PFSP trusted verify ID ${record.id}`); return send(res, 200, { ok: true, verdict: 'REGISTERED', level: 'good', message: 'Record registered in trusted registry via GitHub.', record, certificate: signedCertificate(record), commit: gh.commit && gh.commit.html_url, registryIntegrity: registryIntegrity(registry) }); }
  catch (err) { return send(res, 202, { ok: false, verdict: 'MANUAL_REGISTRY_PATCH_REQUIRED', level: 'warn', message: 'Record is valid, but this deployment is not configured for durable registry writes. Commit the suggested registry JSON manually or configure GitHub env vars.', error: err.message, record, certificate: signedCertificate(record), suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) }); }
}
async function handleRevoke(req, res, body, restore=false) {
  if (!hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const id = cleanString(body.id || body.verifyId, 100).toUpperCase();
  const registry = await readRegistry();
  const idx = registry.records.findIndex(r => cleanString(r.id, 100).toUpperCase() === id);
  if (idx < 0) return send(res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  if (restore) {
    registry.records[idx].status = 'active';
    registry.records[idx].restoredAt = nowIso();
    registry.records[idx].revokeReason = '';
    registry.records[idx].revokedAt = '';
  } else {
    registry.records[idx].status = 'revoked';
    registry.records[idx].revokedAt = nowIso();
    registry.records[idx].revokeReason = cleanString(body.reason || body.revokeReason || 'revoked by admin', 300);
  }
  registry.records[idx].serverSignature = signRecord(registry.records[idx]);
  registry.records[idx].certificateSignature = registry.records[idx].serverSignature;
  addAudit(registry, req, { action: restore ? 'restore' : 'revoke', id, sha256: registry.records[idx].sha256, result: restore ? 'RESTORED' : 'REVOKED', ok: true, message: restore ? 'Restored by admin.' : registry.records[idx].revokeReason, origin: registry.records[idx].origin });
  try { const gh = await persistRegistry(registry, `${restore ? 'Restore' : 'Revoke'} PFSP verify ID ${id}`); return send(res, 200, { ok: true, verdict: restore ? 'RESTORED' : 'REVOKED', level: restore ? 'good' : 'bad', message: restore ? 'Record restored in trusted registry.' : 'Record revoked in trusted registry.', record: registry.records[idx], commit: gh.commit && gh.commit.html_url, registryIntegrity: registryIntegrity(registry) }); }
  catch (err) { return send(res, 202, { ok: false, verdict: restore ? 'MANUAL_RESTORE_PATCH_REQUIRED' : 'MANUAL_REVOKE_PATCH_REQUIRED', level: 'warn', message: 'Patch is ready but durable write is not configured.', error: err.message, record: registry.records[idx], suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) }); }
}
async function handleUpdateExpiry(req, res, body) {
  if (!hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const id = cleanString(body.id || body.verifyId, 100).toUpperCase();
  const expiresAt = safeDate(body.expiresAt) || '';
  const registry = await readRegistry();
  const record = findRecord(registry, id);
  if (!record) return send(res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  record.expiresAt = expiresAt;
  record.updatedAt = nowIso();
  record.serverSignature = signRecord(record);
  record.certificateSignature = record.serverSignature;
  addAudit(registry, req, { action: 'update-expiry', id, sha256: record.sha256, result: 'EXPIRY_UPDATED', ok: true, message: expiresAt ? `Expires at ${expiresAt}` : 'No expiry', origin: record.origin });
  try { const gh = await persistRegistry(registry, `Update expiry for PFSP verify ID ${id}`); return send(res, 200, { ok: true, verdict: 'EXPIRY_UPDATED', level: 'good', message: expiresAt ? 'Expiry updated.' : 'Certificate set to no expiry.', record, commit: gh.commit && gh.commit.html_url, registryIntegrity: registryIntegrity(registry) }); }
  catch (err) { return send(res, 202, { ok: false, verdict: 'MANUAL_EXPIRY_PATCH_REQUIRED', level: 'warn', message: 'Expiry patch is ready but durable write is not configured.', error: err.message, record, suggestedRegistry: registry, registryIntegrity: registryIntegrity(registry) }); }
}
async function handleList(req, res, body) {
  if (!hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const registry = await readRegistry();
  const q = cleanString(body.query || body.q || '', 120).toUpperCase();
  let records = registry.records || [];
  if (q) records = records.filter(r => String(r.id || '').toUpperCase().includes(q) || String(r.sha256 || '').toUpperCase().includes(q) || String(r.fileName || '').toUpperCase().includes(q));
  return send(res, 200, { ok: true, verdict: 'LIST', level: 'good', message: 'Registry records loaded.', records: records.slice(0, MAX_RECORDS_PUBLIC), count: records.length, registryIntegrity: registryIntegrity(registry), updatedAt: registry.updatedAt });
}
async function handleBackup(req, res, body) {
  if (!hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const registry = await readRegistry();
  addSnapshot(registry, body.label || 'admin backup snapshot');
  return send(res, 200, { ok: true, verdict: 'BACKUP_READY', level: 'good', message: 'Registry backup JSON is ready.', registry, registryIntegrity: registryIntegrity(registry) });
}
async function handleIntegrity(req, res, body, requireAdmin=false) {
  if (requireAdmin && !hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const registry = await readRegistry();
  return send(res, 200, { ok: true, verdict: registryIntegrity(registry).ok ? 'INTEGRITY_OK' : 'INTEGRITY_WARNING', level: registryIntegrity(registry).ok ? 'good' : 'warn', message: 'Registry integrity check completed.', registryIntegrity: registryIntegrity(registry), env: envSummary() });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true, verdict: 'OPTIONS' });
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'https://local.local');
      const params = Object.fromEntries(url.searchParams.entries());
      if (url.searchParams.get('health') || url.searchParams.get('action') === 'health') return send(res, 200, { ok: true, verdict: 'HEALTHY', level: 'good', message: 'Verify API is online.', time: nowIso(), env: envSummary() });
      if (url.searchParams.get('integrity')) return handleIntegrity(req, res, {}, false);
      return handleCheck(req, res, params, 'GET');
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = cleanString(body.action || 'register', 60).toLowerCase();
      if (['verify','check'].includes(action)) return handleCheck(req, res, body, 'POST');
      if (['auto-register','autoregister'].includes(action)) return handleAutoRegister(req, res, body);
      if (action === 'register') return handleRegister(req, res, body);
      if (action === 'revoke') return handleRevoke(req, res, body, false);
      if (action === 'restore') return handleRevoke(req, res, body, true);
      if (['expiry','update-expiry','set-expiry'].includes(action)) return handleUpdateExpiry(req, res, body);
      if (['list','records','search'].includes(action)) return handleList(req, res, body);
      if (['backup','snapshot','export'].includes(action)) return handleBackup(req, res, body);
      if (['integrity','health'].includes(action)) return action === 'health' ? send(res, 200, { ok: true, verdict: 'HEALTHY', level: 'good', message: 'Verify API is online.', time: nowIso(), env: envSummary() }) : handleIntegrity(req, res, body, false);
      return send(res, 400, { ok: false, verdict: 'BAD_ACTION', level: 'bad', message: 'Unsupported action.' });
    }
    return send(res, 405, { ok: false, verdict: 'METHOD_NOT_ALLOWED', level: 'bad', message: 'Use GET or POST.' });
  } catch (err) {
    return send(res, 500, { ok: false, verdict: 'SERVER_ERROR', level: 'bad', message: err.message || String(err) });
  }
};
