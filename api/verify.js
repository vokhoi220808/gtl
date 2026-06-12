// PDF Fusion Smart Pro - Trusted Verify Registry API v8.0.0
// Vercel Serverless Function. No external npm dependencies.
// Public GET checks whether an ID/hash is registered as genuine.
// POST register/revoke requires VERIFY_ADMIN_SECRET and, for durable writes,
// GitHub repo env vars. Without those vars it returns a manual registry patch.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REGISTRY_VERSION = 'PFSP-VERIFY-REGISTRY-v1';
const LOCAL_REGISTRY_PATH = path.join(process.cwd(), 'data', 'verify-registry.json');
const MAX_BODY = 1024 * 1024;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Verify-Admin-Secret');
  res.end(JSON.stringify(payload, null, 2));
}

function cleanString(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizeHash(value) {
  return cleanString(value, 128).toLowerCase().replace(/[^a-f0-9]/g, '');
}

function normalizeSize(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function validId(id) {
  return /^PFSP-\d{8}-[A-Z0-9]{6,16}$/i.test(String(id || '')) || /^PFSP-[A-Z0-9-]{6,64}$/i.test(String(id || ''));
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function canonicalRecord(record) {
  return [
    cleanString(record.id, 100),
    normalizeHash(record.sha256),
    String(normalizeSize(record.size) ?? ''),
    cleanString(record.createdAt || record.registeredAt, 80),
    cleanString(record.origin, 300),
    cleanString(record.status || 'active', 50),
    cleanString(record.expiresAt, 80),
    cleanString(record.appVersion, 100)
  ].join('|');
}

function signRecord(record) {
  const secret = process.env.PFSP_VERIFY_SIGNING_SECRET || process.env.VERIFY_SIGNING_SECRET || '';
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(canonicalRecord(record), 'utf8').digest('hex');
}

function verifyRecordSignature(record) {
  if (!record.serverSignature) return { present: false, valid: null };
  const expected = signRecord({ ...record, serverSignature: '' });
  if (!expected) return { present: true, valid: null };
  const a = Buffer.from(String(record.serverSignature), 'hex');
  const b = Buffer.from(expected, 'hex');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { present: true, valid };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function emptyRegistry() {
  return { version: REGISTRY_VERSION, updatedAt: new Date().toISOString(), records: [] };
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
  const meta = await fetchJson(api, {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pdf-fusion-smart-pro-verify'
  });
  const raw = Buffer.from(String(meta.content || ''), 'base64').toString('utf8');
  const registry = JSON.parse(raw);
  registry.__githubSha = meta.sha;
  return registry;
}

async function readRegistry() {
  if (process.env.PFSP_REGISTRY_URL) {
    try { return await fetchJson(process.env.PFSP_REGISTRY_URL); } catch (err) {}
  }
  try {
    const gh = await readRegistryFromGithub();
    if (gh) return gh;
  } catch (err) {}
  try {
    return JSON.parse(fs.readFileSync(LOCAL_REGISTRY_PATH, 'utf8'));
  } catch (err) {
    return emptyRegistry();
  }
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
  const api = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.filePath}`;
  const body = {
    message,
    branch: cfg.branch,
    content: Buffer.from(JSON.stringify(registry, null, 2) + '\n', 'utf8').toString('base64')
  };
  if (sha) body.sha = sha;
  const r = await fetch(api, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'pdf-fusion-smart-pro-verify'
    },
    body: JSON.stringify(body)
  });
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(payload.message || `GitHub write failed ${r.status}`);
  return payload;
}

function makeRecord(input) {
  const cert = input.certificate || input.cert || input.record || input;
  const id = cleanString(cert.id, 100).toUpperCase();
  const sha256 = normalizeHash(cert.sha256 || cert.hash || cert.h);
  const size = normalizeSize(cert.size);
  const now = new Date().toISOString();
  const record = {
    id,
    sha256,
    size,
    fileName: cleanString(cert.fileName || cert.name || 'document.pdf', 240),
    mimeType: cleanString(cert.mimeType || 'application/pdf', 100),
    createdAt: cleanString(cert.createdAt || cert.ts || now, 80),
    registeredAt: now,
    origin: cleanString(cert.origin || cert.o || '', 300),
    app: cleanString(cert.app || 'PDF Fusion Smart Pro', 100),
    appVersion: cleanString(cert.appVersion || cert.version || 'unknown', 100),
    sourceBundleSha256: normalizeHash(cert.sourceBundleSha256 || cert.sourceHash || cert.sh),
    checksum: cleanString(cert.checksum || cert.hck || '', 100),
    status: cleanString(cert.status || 'active', 40).toLowerCase(),
    expiresAt: cleanString(cert.expiresAt || '', 80),
    registeredBy: cleanString(input.registeredBy || cert.registeredBy || 'admin', 120),
    note: cleanString(input.note || cert.note || '', 500)
  };
  record.fingerprint = sha256Text(canonicalRecord(record)).slice(0, 32).toUpperCase();
  record.serverSignature = signRecord(record);
  return record;
}

function evaluate(registry, query) {
  const id = cleanString(query.id, 100).toUpperCase();
  const inputHash = normalizeHash(query.sha256 || query.hash || query.h);
  const inputSize = normalizeSize(query.size);
  const record = (registry.records || []).find(r => cleanString(r.id, 100).toUpperCase() === id);
  if (!id) return { verdict: 'NO_ID', level: 'bad', message: 'Missing verify ID.' };
  if (!record) return { verdict: 'UNKNOWN', level: 'warn', message: 'Verify ID is not registered in the trusted registry.', registryVersion: registry.version || REGISTRY_VERSION };
  const sig = verifyRecordSignature(record);
  const now = Date.now();
  const expired = record.expiresAt && Date.parse(record.expiresAt) && Date.parse(record.expiresAt) < now;
  if (sig.present && sig.valid === false) return { verdict: 'REGISTRY_TAMPERED', level: 'bad', message: 'Registry record signature is invalid.', record, signature: sig };
  if (String(record.status || 'active').toLowerCase() === 'revoked') return { verdict: 'REVOKED', level: 'bad', message: 'Verify ID is registered but revoked.', record, signature: sig };
  if (expired) return { verdict: 'EXPIRED', level: 'bad', message: 'Verify ID is registered but expired.', record, signature: sig };
  if (!inputHash) return { verdict: 'REGISTERED_NEEDS_FILE', level: 'warn', message: 'Verify ID exists. Upload/provide the PDF hash to confirm the actual file.', record, signature: sig };
  if (normalizeHash(record.sha256) !== inputHash) return { verdict: 'FAKE_OR_MODIFIED', level: 'bad', message: 'Verify ID exists, but the uploaded/provided PDF hash does not match the registered original.', record, providedHash: inputHash, signature: sig };
  const sizeMismatch = inputSize !== null && record.size !== null && String(inputSize) !== String(record.size);
  if (sizeMismatch) return { verdict: 'HASH_MATCH_SIZE_WARNING', level: 'warn', message: 'Hash matches the trusted record, but the size metadata differs.', record, providedHash: inputHash, signature: sig };
  return { verdict: 'GENUINE', level: 'good', message: 'Verify ID and PDF hash match the trusted registry record.', record, providedHash: inputHash, signature: sig };
}

function hasAdmin(req, body) {
  const expected = process.env.VERIFY_ADMIN_SECRET || process.env.PFSP_VERIFY_ADMIN_SECRET || '';
  if (!expected) return false;
  const header = req.headers['x-verify-admin-secret'] || '';
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const supplied = cleanString(body.adminSecret || body.secret || header || auth, 500);
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleRegister(req, res, body) {
  if (!hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const record = makeRecord(body);
  if (!validId(record.id)) return send(res, 400, { ok: false, verdict: 'BAD_ID', message: 'Invalid PFSP verify ID.', record });
  if (!/^[a-f0-9]{64}$/i.test(record.sha256)) return send(res, 400, { ok: false, verdict: 'BAD_HASH', message: 'Invalid SHA-256 hash.', record });
  const registry = await readRegistry();
  registry.version = registry.version || REGISTRY_VERSION;
  registry.records = Array.isArray(registry.records) ? registry.records : [];
  const idx = registry.records.findIndex(r => cleanString(r.id, 100).toUpperCase() === record.id);
  if (idx >= 0 && !body.overwrite) return send(res, 409, { ok: false, verdict: 'ALREADY_REGISTERED', message: 'This verify ID already exists. Use overwrite=true only if you know what you are doing.', existing: registry.records[idx] });
  if (idx >= 0) registry.records[idx] = { ...registry.records[idx], ...record, updatedAt: new Date().toISOString() };
  else registry.records.push(record);
  registry.updatedAt = new Date().toISOString();
  registry.records.sort((a, b) => String(b.registeredAt || '').localeCompare(String(a.registeredAt || '')));
  try {
    const gh = await writeRegistryToGithub(registry, `Register PFSP verify ID ${record.id}`);
    return send(res, 200, { ok: true, verdict: 'REGISTERED', message: 'Record registered in trusted registry via GitHub.', record, commit: gh.commit && gh.commit.html_url });
  } catch (err) {
    return send(res, 202, {
      ok: false,
      verdict: 'MANUAL_REGISTRY_PATCH_REQUIRED',
      message: 'Record is valid, but this deployment is not configured for durable registry writes. Commit the suggested record to data/verify-registry.json or configure GitHub env vars.',
      error: err.message,
      record,
      suggestedRegistry: registry
    });
  }
}

async function handleRevoke(req, res, body) {
  if (!hasAdmin(req, body)) return send(res, 401, { ok: false, verdict: 'UNAUTHORIZED', message: 'Missing or invalid VERIFY_ADMIN_SECRET.' });
  const id = cleanString(body.id, 100).toUpperCase();
  const registry = await readRegistry();
  const idx = (registry.records || []).findIndex(r => cleanString(r.id, 100).toUpperCase() === id);
  if (idx < 0) return send(res, 404, { ok: false, verdict: 'NOT_FOUND', message: 'Verify ID not found.' });
  registry.records[idx].status = 'revoked';
  registry.records[idx].revokedAt = new Date().toISOString();
  registry.records[idx].revokeReason = cleanString(body.reason || 'revoked by admin', 300);
  registry.records[idx].serverSignature = signRecord(registry.records[idx]);
  registry.updatedAt = new Date().toISOString();
  try {
    const gh = await writeRegistryToGithub(registry, `Revoke PFSP verify ID ${id}`);
    return send(res, 200, { ok: true, verdict: 'REVOKED', message: 'Record revoked in trusted registry.', record: registry.records[idx], commit: gh.commit && gh.commit.html_url });
  } catch (err) {
    return send(res, 202, { ok: false, verdict: 'MANUAL_REVOKE_PATCH_REQUIRED', message: 'Revoke patch is ready but durable write is not configured.', error: err.message, record: registry.records[idx], suggestedRegistry: registry });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'https://local.local');
      if (url.searchParams.get('health')) return send(res, 200, { ok: true, version: '8.0.0-trusted-verify-registry', time: new Date().toISOString() });
      const registry = await readRegistry();
      const result = evaluate(registry, Object.fromEntries(url.searchParams.entries()));
      return send(res, result.verdict === 'UNKNOWN' ? 404 : 200, { ok: ['GENUINE','REGISTERED_NEEDS_FILE','HASH_MATCH_SIZE_WARNING'].includes(result.verdict), checkedAt: new Date().toISOString(), ...result });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = cleanString(body.action || 'register', 40).toLowerCase();
      if (action === 'register') return handleRegister(req, res, body);
      if (action === 'revoke') return handleRevoke(req, res, body);
      return send(res, 400, { ok: false, verdict: 'BAD_ACTION', message: 'Unsupported action.' });
    }
    return send(res, 405, { ok: false, verdict: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST.' });
  } catch (err) {
    return send(res, 500, { ok: false, verdict: 'SERVER_ERROR', message: err.message || String(err) });
  }
};
