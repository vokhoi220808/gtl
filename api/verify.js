'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_VERSION = '15.0.0-business-integrity';
const REGISTRY_VERSION = 'PFSP-VERIFY-REGISTRY-v6';
const SCHEMA_VERSION = 6;
const BUSINESS_POLICY_VERSION = 'PFSP-BUSINESS-POLICY-v1';
const SIGNATURE_VERSION = 'PFSP-SERVER-SIGNED-CERT-v6';
const LEGACY_SIGNATURE_VERSIONS = ['PFSP-SERVER-SIGNED-CERT-v5', 'PFSP-SERVER-SIGNED-CERT-v4', 'PFSP-SERVER-SIGNED-CERT-v3'];
const LOCAL_REGISTRY_PATH = path.join(process.cwd(), 'data', 'verify-registry.json');
const MAX_BODY = numberEnv('PFSP_VERIFY_MAX_BODY', 1024 * 1024, 1024, 8 * 1024 * 1024);
const MAX_AUDIT = numberEnv('PFSP_VERIFY_MAX_AUDIT', 2000, 100, 10000);
const MAX_HISTORY = numberEnv('PFSP_VERIFY_MAX_HISTORY', 100, 10, 500);
const MAX_BATCH = numberEnv('PFSP_VERIFY_MAX_BATCH', 100, 1, 500);
const MAX_BULK = numberEnv('PFSP_VERIFY_MAX_BULK_REGISTER', 200, 1, 1000);
const MAX_PUBLIC_SEARCH = numberEnv('PFSP_VERIFY_PORTAL_SEARCH_LIMIT', 80, 1, 500);
const MAX_PUBLIC_RECORDS = numberEnv('PFSP_VERIFY_MAX_RECORDS_PUBLIC', 5000, 1, 20000);
const MAX_FILE_SIZE = numberEnv('PFSP_VERIFY_MAX_FILE_SIZE', 20 * 1024 * 1024 * 1024, 1, Number.MAX_SAFE_INTEGER);
const RATE_LIMIT_WINDOW_MS = numberEnv('PFSP_VERIFY_RATE_LIMIT_WINDOW_MS', 60 * 1000, 1000, 24 * 60 * 60 * 1000);
const PUBLIC_RATE_LIMIT = numberEnv('PFSP_VERIFY_PUBLIC_RATE_LIMIT', 240, 0, 100000);
const ADMIN_RATE_LIMIT = numberEnv('PFSP_VERIFY_ADMIN_RATE_LIMIT', 90, 0, 100000);
const AUTO_REGISTER_DAILY_LIMIT = numberEnv('PFSP_AUTO_REGISTER_DAILY_LIMIT', 120, 0, 100000);
const rateBuckets = new Map();

const VALID_STATUSES = new Set(['draft', 'active', 'suspended', 'revoked', 'archived']);
const VALID_VISIBILITY = new Set(['public-metadata', 'unlisted', 'private']);
const MUTATING_ACTIONS = new Set([
  'auto-register', 'autoregister', 'register', 'bulk-register', 'register-bulk',
  'revoke', 'restore', 'suspend', 'hold', 'activate', 'unsuspend', 'archive', 'unarchive',
  'expiry', 'update-expiry', 'set-expiry', 'clear-expiry',
  'update-note', 'note', 'metadata', 'repair', 'resign', 'bulk-action', 'bulk-status', 'migrate'
]);

function numberEnv(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function cleanString(value, max = 500) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function lower(value, max = 500) { return cleanString(value, max).toLowerCase(); }
function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off', 'disabled'].includes(String(value).toLowerCase());
}
function clamp(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
function nowIso() { return new Date().toISOString(); }
function safeDate(value) {
  const raw = cleanString(value, 160);
  if (!raw) return '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
function sha256Text(value) { return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex'); }
function hmacText(secret, value) { return crypto.createHmac('sha256', secret).update(String(value || ''), 'utf8').digest('hex'); }
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
function splitList(value) {
  return cleanString(value, 12000).split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
}
function normalizeHash(value) {
  return cleanString(value, 300).toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 64);
}
function validHash(value) { return /^[a-f0-9]{64}$/i.test(String(value || '')); }
function validId(value) {
  const id = cleanString(value, 120).toUpperCase();
  return /^PFSP-\d{8}-[A-Z0-9]{6,28}$/.test(id) || /^PFSP-[A-Z0-9][A-Z0-9-]{7,90}$/.test(id);
}
function normalizeSize(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isSafeInteger(Math.round(n)) && n >= 0 && n <= MAX_FILE_SIZE ? Math.round(n) : null;
}
function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : cleanString(value, 3000).split(',');
  return [...new Set(raw.map(x => cleanString(x, 50)).filter(Boolean))].slice(0, 40);
}
function normalizeFileName(value) {
  const name = cleanString(value || 'document.pdf', 240).replace(/[\\/]+/g, '_');
  return name || 'document.pdf';
}
function normalizeMimeType(value) {
  const mime = lower(value || 'application/pdf', 100);
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime) ? mime : 'application/pdf';
}
function compactObject(input) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (Array.isArray(value)) { if (value.length) output[key] = value; continue; }
    if (value && typeof value === 'object') { const nested = compactObject(value); if (Object.keys(nested).length) output[key] = nested; continue; }
    if (value !== '' && value != null) output[key] = value;
  }
  return output;
}
function normalizeCustomFields(value) {
  const source = Array.isArray(value) ? value : value && typeof value === 'object'
    ? Object.entries(value).map(([label, fieldValue]) => ({ label, value: fieldValue })) : [];
  return source.map(item => ({
    label: cleanString(item && (item.label || item.name || item.key), 80),
    value: cleanString(item && (item.value || item.text || item.val), 600)
  })).filter(x => x.label || x.value).slice(0, 80);
}
function normalizeDocumentInfo(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return compactObject({
    title: cleanString(v.title || v.documentTitle, 260),
    description: cleanString(v.description || v.summary, 2200),
    documentType: cleanString(v.documentType || v.type || v.category, 160),
    documentNumber: cleanString(v.documentNumber || v.number || v.code, 160),
    version: cleanString(v.version, 100),
    language: cleanString(v.language, 80),
    issuer: cleanString(v.issuer, 180),
    department: cleanString(v.department, 180),
    author: cleanString(v.author, 180),
    subject: cleanString(v.subject, 240),
    keywords: normalizeTags(v.keywords || v.tags || []),
    confidentiality: cleanString(v.confidentiality || v.classification, 120),
    retention: cleanString(v.retention, 120),
    createdDate: safeDate(v.createdDate || v.documentDate) || cleanString(v.createdDate || v.documentDate, 120),
    effectiveDate: safeDate(v.effectiveDate) || cleanString(v.effectiveDate, 120),
    expiresDate: safeDate(v.expiresDate || v.expiryDate) || cleanString(v.expiresDate || v.expiryDate, 120),
    customFields: normalizeCustomFields(v.customFields || v.extra || v.fields)
  });
}
function normalizeUserInfo(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return compactObject({
    fullName: cleanString(v.fullName || v.name, 180),
    email: cleanString(v.email, 200),
    phone: cleanString(v.phone, 80),
    organization: cleanString(v.organization || v.company, 180),
    department: cleanString(v.department, 180),
    role: cleanString(v.role || v.title, 160),
    website: cleanString(v.website, 220),
    identifier: cleanString(v.identifier || v.idNumber, 180),
    address: cleanString(v.address, 260),
    note: cleanString(v.note, 1200),
    customFields: normalizeCustomFields(v.customFields || v.extra || v.fields)
  });
}
function normalizeExtraInfo(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return compactObject({
    workflow: cleanString(v.workflow, 180),
    approvalStatus: cleanString(v.approvalStatus, 120),
    relatedIds: normalizeTags(v.relatedIds || []),
    project: cleanString(v.project, 180),
    customFields: normalizeCustomFields(v.customFields || v.extra || v.fields)
  });
}
function publicUserInfo(value, admin = false) {
  const v = normalizeUserInfo(value || {});
  if (admin) return v;
  return compactObject({
    fullName: v.fullName,
    organization: v.organization,
    department: v.department,
    role: v.role,
    website: v.website
  });
}
function normalizePolicy(value = {}) {
  const visibility = lower(value.visibility || value.access || 'public-metadata', 80);
  return {
    retention: cleanString(value.retention, 80),
    visibility: VALID_VISIBILITY.has(visibility) ? visibility : 'public-metadata'
  };
}
function signingSecret() { return process.env.PFSP_VERIFY_SIGNING_SECRET || process.env.VERIFY_SIGNING_SECRET || ''; }
function adminSecret() { return process.env.PFSP_VERIFY_ADMIN_SECRET || process.env.VERIFY_ADMIN_SECRET || ''; }
function defaultKeyId() { return cleanString(process.env.PFSP_VERIFY_KEY_ID || process.env.VERIFY_KEY_ID || 'pfsp-v15-default', 80); }
function normalizeAlgorithm(value) {
  const raw = cleanString(value || 'RSA-SHA256', 40).toUpperCase();
  if (['RSA-SHA256', 'RSA-SHA384', 'RSA-SHA512', 'ECDSA-SHA256', 'ECDSA-SHA384', 'ED25519'].includes(raw)) return raw;
  return 'RSA-SHA256';
}
function keyConfig() {
  let keys = [];
  try {
    const raw = process.env.PFSP_VERIFY_KEYS_JSON || process.env.VERIFY_KEYS_JSON || '';
    if (raw) keys = JSON.parse(raw);
  } catch { keys = []; }
  if (!Array.isArray(keys)) keys = [];
  const envKey = {
    id: defaultKeyId(),
    privateKey: process.env.PFSP_VERIFY_PRIVATE_KEY || process.env.VERIFY_PRIVATE_KEY || '',
    publicKey: process.env.PFSP_VERIFY_PUBLIC_KEY || process.env.VERIFY_PUBLIC_KEY || '',
    algorithm: process.env.PFSP_VERIFY_KEY_ALGORITHM || 'RSA-SHA256',
    active: true
  };
  if (envKey.privateKey || envKey.publicKey) keys.unshift(envKey);
  const seen = new Set();
  return keys.map(item => ({
    id: cleanString(item.id || item.keyId || defaultKeyId(), 80),
    privateKey: String(item.privateKey || '').replace(/\\n/g, '\n'),
    publicKey: String(item.publicKey || '').replace(/\\n/g, '\n'),
    algorithm: normalizeAlgorithm(item.algorithm),
    active: item.active !== false,
    revoked: !!item.revoked
  })).filter(item => item.id && !seen.has(item.id) && seen.add(item.id));
}
function activeSigningKey() { return keyConfig().find(k => k.active && !k.revoked && k.privateKey) || null; }
function signingPayload(record, version = SIGNATURE_VERSION) {
  return version + '|' + stableStringify(version === SIGNATURE_VERSION ? canonicalV6(record) : canonicalLegacy(record));
}
function canonicalLegacy(record) {
  return {
    id: cleanString(record.id, 120).toUpperCase(), sha256: normalizeHash(record.sha256), size: normalizeSize(record.size),
    fileName: normalizeFileName(record.fileName), mimeType: normalizeMimeType(record.mimeType),
    createdAt: safeDate(record.createdAt) || cleanString(record.createdAt, 120), registeredAt: safeDate(record.registeredAt) || cleanString(record.registeredAt, 120),
    updatedAt: safeDate(record.updatedAt) || cleanString(record.updatedAt, 120), origin: cleanString(record.origin, 500),
    app: cleanString(record.app || 'PDF Fusion Smart Pro', 120), appVersion: cleanString(record.appVersion || record.version, 120),
    sourceBundleSha256: normalizeHash(record.sourceBundleSha256 || record.sourceHash || record.sh), checksum: cleanString(record.checksum || record.hck, 120),
    status: lower(record.status || 'active', 40), expiresAt: safeDate(record.expiresAt), revokedAt: safeDate(record.revokedAt), restoredAt: safeDate(record.restoredAt),
    suspendReason: cleanString(record.suspendReason, 300), suspendedAt: safeDate(record.suspendedAt), revokeReason: cleanString(record.revokeReason, 300),
    registrationMode: cleanString(record.registrationMode, 80), registeredBy: cleanString(record.registeredBy, 120), owner: cleanString(record.owner, 160),
    project: cleanString(record.project, 160), documentTitle: cleanString(record.documentTitle, 240), tags: normalizeTags(record.tags), note: cleanString(record.note, 800),
    fingerprint: cleanString(record.fingerprint, 80), policy: normalizePolicy(record.policy), documentInfo: normalizeDocumentInfo(record.documentInfo),
    userInfo: normalizeUserInfo(record.userInfo || record.personInfo), extraInfo: normalizeExtraInfo(record.extraInfo)
  };
}
function canonicalV6(record) {
  return {
    ...canonicalLegacy(record),
    revision: Number(record.revision || 0),
    previousStatus: lower(record.previousStatus, 40),
    statusChangedAt: safeDate(record.statusChangedAt),
    archivedAt: safeDate(record.archivedAt),
    archivedReason: cleanString(record.archivedReason, 300),
    businessPolicyVersion: cleanString(record.businessPolicyVersion || BUSINESS_POLICY_VERSION, 80)
  };
}
function signAsymmetric(key, text) {
  if (key.algorithm === 'ED25519') return crypto.sign(null, Buffer.from(text, 'utf8'), key.privateKey).toString('base64url');
  const algorithm = key.algorithm.replace('ECDSA-', '').replace('RSA-', 'RSA-');
  return crypto.sign(algorithm, Buffer.from(text, 'utf8'), key.privateKey).toString('base64url');
}
function verifyAsymmetric(key, text, signature) {
  const sig = Buffer.from(String(signature || ''), 'base64url');
  if (key.algorithm === 'ED25519') return crypto.verify(null, Buffer.from(text, 'utf8'), key.publicKey || key.privateKey, sig);
  const algorithm = key.algorithm.replace('ECDSA-', '').replace('RSA-', 'RSA-');
  return crypto.verify(algorithm, Buffer.from(text, 'utf8'), key.publicKey || key.privateKey, sig);
}
function signRecord(record) {
  const key = activeSigningKey();
  if (key) return { signature: signAsymmetric(key, signingPayload(record)), algorithm: key.algorithm, keyId: key.id, version: SIGNATURE_VERSION };
  const secret = signingSecret();
  if (secret) return { signature: hmacText(secret, signingPayload(record)), algorithm: 'HMAC-SHA256', keyId: '', version: SIGNATURE_VERSION };
  return { signature: '', algorithm: '', keyId: '', version: SIGNATURE_VERSION };
}
function verifyRecordSignature(record) {
  if (!record || !record.serverSignature) return { present: false, valid: null, reason: 'missing-signature' };
  const algorithm = normalizeAlgorithm(record.signatureAlgorithm || (record.keyId ? 'RSA-SHA256' : 'RSA-SHA256'));
  const versionCandidates = [...new Set([record.signatureVersion, SIGNATURE_VERSION, ...LEGACY_SIGNATURE_VERSIONS].filter(Boolean))];
  if (String(record.signatureAlgorithm || '').toUpperCase().startsWith('HMAC') || (!record.keyId && /^[a-f0-9]{64}$/i.test(record.serverSignature))) {
    const secret = signingSecret();
    if (!secret) return { present: true, valid: null, reason: 'hmac-secret-not-configured', algorithm: 'HMAC-SHA256' };
    const actual = Buffer.from(String(record.serverSignature), 'hex');
    for (const version of versionCandidates) {
      const expected = Buffer.from(hmacText(secret, signingPayload(record, version)), 'hex');
      if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return { present: true, valid: true, algorithm: 'HMAC-SHA256', version };
    }
    return { present: true, valid: false, reason: 'signature-mismatch', algorithm: 'HMAC-SHA256' };
  }
  const keys = keyConfig().filter(k => !k.revoked && (k.publicKey || k.privateKey));
  const candidates = record.keyId ? keys.filter(k => k.id === record.keyId) : keys;
  if (!candidates.length) return { present: true, valid: null, reason: record.keyId ? 'key-id-not-configured' : 'public-key-not-configured', keyId: record.keyId || '', algorithm };
  for (const key of candidates) {
    for (const version of versionCandidates) {
      try {
        if (verifyAsymmetric(key, signingPayload(record, version), record.serverSignature)) return { present: true, valid: true, algorithm: key.algorithm, keyId: key.id, version };
      } catch {}
    }
  }
  return { present: true, valid: false, reason: 'signature-mismatch', algorithm, keyId: record.keyId || '' };
}
function applySignature(record) {
  const signed = signRecord(record);
  record.serverSignature = signed.signature;
  record.certificateSignature = signed.signature;
  record.signatureAlgorithm = signed.algorithm;
  record.signatureVersion = signed.version;
  record.keyId = signed.keyId;
  return record;
}
function requireSigning() { return !!(activeSigningKey() || signingSecret()); }
function normalizeHistoryItem(value = {}) {
  return {
    time: safeDate(value.time) || nowIso(), action: cleanString(value.action || 'legacy', 80), actor: cleanString(value.actor, 120),
    result: cleanString(value.result, 80), message: cleanString(value.message, 500), sha256: normalizeHash(value.sha256),
    status: lower(value.status, 40), previousStatus: lower(value.previousStatus, 40), origin: cleanString(value.origin, 500), revision: Number(value.revision || 0)
  };
}
function pushHistory(record, action, details = {}) {
  record.history = Array.isArray(record.history) ? record.history : [];
  record.history.unshift(normalizeHistoryItem({ ...details, action, time: nowIso(), revision: record.revision }));
  record.history = record.history.slice(0, MAX_HISTORY);
}
function normalizeRecord(value = {}) {
  const r = value && typeof value === 'object' ? { ...value } : {};
  r.id = cleanString(r.id || r.verifyId, 120).toUpperCase();
  r.sha256 = normalizeHash(r.sha256 || r.hash || r.h);
  r.size = normalizeSize(r.size);
  r.fileName = normalizeFileName(r.fileName || r.name);
  r.mimeType = normalizeMimeType(r.mimeType);
  r.createdAt = safeDate(r.createdAt || r.ts) || cleanString(r.createdAt || r.ts, 160);
  r.registeredAt = safeDate(r.registeredAt) || cleanString(r.registeredAt, 160);
  r.updatedAt = safeDate(r.updatedAt) || cleanString(r.updatedAt, 160);
  r.origin = cleanString(r.origin || r.o, 500).replace(/\/$/, '');
  r.app = cleanString(r.app || 'PDF Fusion Smart Pro', 120);
  r.appVersion = cleanString(r.appVersion || r.version, 120);
  r.sourceBundleSha256 = normalizeHash(r.sourceBundleSha256 || r.sourceHash || r.sh);
  r.checksum = cleanString(r.checksum || r.hck, 120);
  const rawStatus = lower(r.status || 'active', 40);
  r.status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'invalid';
  r.previousStatus = lower(r.previousStatus, 40);
  r.statusChangedAt = safeDate(r.statusChangedAt);
  r.expiresAt = safeDate(r.expiresAt);
  r.revokedAt = safeDate(r.revokedAt); r.restoredAt = safeDate(r.restoredAt); r.suspendedAt = safeDate(r.suspendedAt); r.archivedAt = safeDate(r.archivedAt);
  r.revokeReason = cleanString(r.revokeReason, 300); r.suspendReason = cleanString(r.suspendReason, 300); r.archivedReason = cleanString(r.archivedReason, 300);
  r.registrationMode = cleanString(r.registrationMode, 80); r.registeredBy = cleanString(r.registeredBy, 120);
  r.owner = cleanString(r.owner, 160); r.project = cleanString(r.project, 160); r.documentTitle = cleanString(r.documentTitle, 240);
  r.tags = normalizeTags(r.tags); r.note = cleanString(r.note, 800);
  r.policy = normalizePolicy(r.policy || { retention: r.retention, visibility: r.visibility });
  r.documentInfo = normalizeDocumentInfo(r.documentInfo || { title: r.documentTitle, description: r.note, keywords: r.tags });
  r.userInfo = normalizeUserInfo(r.userInfo || r.personInfo || { fullName: r.owner });
  r.extraInfo = normalizeExtraInfo(r.extraInfo);
  r.fingerprint = cleanString(r.fingerprint, 80); r.shortVerifyUrl = cleanString(r.shortVerifyUrl, 500); r.verifyUrl = cleanString(r.verifyUrl, 800);
  r.serverSignature = cleanString(r.serverSignature || r.certificateSignature, 4096);
  r.certificateSignature = cleanString(r.certificateSignature || r.serverSignature, 4096);
  r.signatureVersion = cleanString(r.signatureVersion || (r.serverSignature ? 'PFSP-SERVER-SIGNED-CERT-v5' : SIGNATURE_VERSION), 80);
  r.signatureAlgorithm = cleanString(r.signatureAlgorithm || (r.keyId ? 'RSA-SHA256' : 'HMAC-SHA256'), 80);
  r.keyId = cleanString(r.keyId, 80);
  r.revision = Math.max(0, Math.floor(Number(r.revision || 0)));
  r.businessPolicyVersion = cleanString(r.businessPolicyVersion || BUSINESS_POLICY_VERSION, 80);
  r.history = Array.isArray(r.history) ? r.history.map(normalizeHistoryItem).slice(0, MAX_HISTORY) : [];
  return r;
}
function emptyRegistry() {
  return {
    version: REGISTRY_VERSION, schemaVersion: SCHEMA_VERSION, registryRevision: 0, updatedAt: nowIso(), businessPolicyVersion: BUSINESS_POLICY_VERSION,
    settings: { serverSigned: true, auditLog: true, autoRegister: true, expirySupported: true, historySupported: true, batchVerifySupported: true,
      publicTrustPortal: true, publicSearchSupported: true, keyRotationSupported: true, adapterStorageSupported: true, analyticsSupported: true,
      bulkActionsSupported: true, documentInformationSupported: true, privacyPolicySupported: true, optimisticConcurrencySupported: true,
      idempotencySupported: true, stateMachineSupported: true, schema: 'v6' },
    records: [], auditLog: [], snapshots: [], operations: [], integrity: null
  };
}
function normalizeRegistry(value = {}) {
  const base = emptyRegistry();
  const src = value && typeof value === 'object' ? value : {};
  base.version = REGISTRY_VERSION;
  base.schemaVersion = SCHEMA_VERSION;
  base.registryRevision = Math.max(0, Math.floor(Number(src.registryRevision || src.revision || 0)));
  base.updatedAt = safeDate(src.updatedAt) || nowIso();
  base.businessPolicyVersion = BUSINESS_POLICY_VERSION;
  base.settings = { ...base.settings, ...(src.settings || {}), schema: 'v6' };
  base.records = Array.isArray(src.records) ? src.records.map(normalizeRecord) : [];
  base.auditLog = Array.isArray(src.auditLog) ? src.auditLog.slice(0, MAX_AUDIT) : [];
  base.snapshots = Array.isArray(src.snapshots) ? src.snapshots.slice(0, 50) : [];
  base.operations = Array.isArray(src.operations) ? src.operations.slice(0, 500) : [];
  base.integrity = src.integrity || null;
  return base;
}
function allowedOrigins() {
  return [...new Set([...splitList(process.env.PFSP_VERIFY_ALLOWED_ORIGINS), ...splitList(process.env.PFSP_CORS_ORIGIN)])];
}
function requestOrigin(req, body = {}) {
  return cleanString((req.headers && req.headers.origin) || body.origin || body.certificate?.origin || body.record?.origin, 500).replace(/\/$/, '');
}
function baseUrl(req, record = {}) {
  const env = cleanString(process.env.PFSP_PUBLIC_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL, 300);
  if (env) return /^https?:\/\//i.test(env) ? env.replace(/\/$/, '') : 'https://' + env.replace(/\/$/, '');
  const origin = cleanString(record.origin || (req.headers && req.headers.origin), 300);
  if (/^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  const host = cleanString(req.headers && req.headers.host, 200);
  return host ? 'https://' + host : '';
}
function generateVerifyId(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(9).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12);
  return `PFSP-${ymd}-${random}`;
}
function ensureRequestId(req) {
  if (!req.headers) req.headers = {};
  const supplied = cleanString(req.headers['x-pfsp-request-id'], 120);
  const id = supplied || 'PFSP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  req.headers['x-pfsp-request-id'] = id;
  return id;
}
function clientIp(req) {
  return cleanString(String((req.headers && (req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'])) || '').split(',')[0] || (req.socket && req.socket.remoteAddress), 160);
}
function clientIpHash(req) { const ip = clientIp(req); return ip ? sha256Text(ip).slice(0, 24).toUpperCase() : ''; }
function userAgentHash(req) { return req.headers && req.headers['user-agent'] ? sha256Text(req.headers['user-agent']).slice(0, 24).toUpperCase() : ''; }
function setCors(req, res) {
  const origin = cleanString(req.headers && req.headers.origin, 500).replace(/\/$/, '');
  const allow = allowedOrigins();
  let reflected = '';
  if (origin && allow.includes(origin)) reflected = origin;
  else if (!allow.length && parseBool(process.env.PFSP_ALLOW_WILDCARD_CORS, false)) reflected = '*';
  else if (!allow.length && process.env.NODE_ENV !== 'production') reflected = origin || '*';
  if (reflected) res.setHeader('Access-Control-Allow-Origin', reflected);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Verify-Admin-Secret, X-PFSP-Request-Id, Idempotency-Key, X-PFSP-Idempotency-Key');
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
  res.setHeader('X-PFSP-Request-Id', ensureRequestId(req));
  res.end(JSON.stringify({ apiVersion: API_VERSION, businessPolicyVersion: BUSINESS_POLICY_VERSION, ...payload }, null, 2));
}
function hasAdmin(req, body = {}) {
  const expected = adminSecret();
  if (!expected) return false;
  const header = (req.headers && req.headers['x-verify-admin-secret']) || '';
  const bearer = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
  const bodySecret = parseBool(process.env.PFSP_ALLOW_BODY_ADMIN_SECRET, false) ? (body.adminSecret || body.secret || '') : '';
  const supplied = cleanString(header || bearer || bodySecret, 2000);
  if (!supplied) return false;
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function idempotencyKey(req, body = {}) {
  return cleanString((req.headers && (req.headers['idempotency-key'] || req.headers['x-pfsp-idempotency-key'])) || body.idempotencyKey, 200);
}
function checkRateLimit(req, scope) {
  const limit = scope === 'admin' ? ADMIN_RATE_LIMIT : PUBLIC_RATE_LIMIT;
  if (!limit) return { ok: true, limit: 0, remaining: null, resetAt: '' };
  const now = Date.now();
  const key = `${scope}:${clientIpHash(req) || 'unknown'}`;
  const bucket = rateBuckets.get(key) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
  if (now >= bucket.reset) { bucket.count = 0; bucket.reset = now + RATE_LIMIT_WINDOW_MS; }
  bucket.count += 1; rateBuckets.set(key, bucket);
  if (rateBuckets.size > 5000) for (const [k, v] of rateBuckets) if (now >= v.reset) rateBuckets.delete(k);
  return { ok: bucket.count <= limit, limit, remaining: Math.max(0, limit - bucket.count), resetAt: new Date(bucket.reset).toISOString(), scope };
}
function applyRateLimit(req, res, scope) {
  const info = checkRateLimit(req, scope);
  if (info.limit) { res.setHeader('X-RateLimit-Limit', String(info.limit)); res.setHeader('X-RateLimit-Remaining', String(info.remaining)); res.setHeader('X-RateLimit-Reset', info.resetAt); }
  if (info.ok) return true;
  send(req, res, 429, { ok: false, verdict: 'RATE_LIMITED', level: 'bad', message: 'Too many requests. Please wait and try again.', rateLimit: info });
  return false;
}
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0; const chunks = []; let done = false;
    req.on('data', chunk => {
      if (done) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_BODY) { done = true; reject(Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' })); return; }
      chunks.push(buffer);
    });
    req.on('end', () => {
      if (done) return;
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { code: 'BAD_JSON' })); }
    });
    req.on('error', reject);
  });
}
async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.message || json.error || `Fetch failed ${response.status}`), { status: response.status, response: json });
  return json;
}
function githubConfig() {
  return { token: process.env.PFSP_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '', owner: process.env.PFSP_GITHUB_OWNER || process.env.GITHUB_OWNER || '',
    repo: process.env.PFSP_GITHUB_REPO || process.env.GITHUB_REPO || '', branch: process.env.PFSP_GITHUB_BRANCH || process.env.GITHUB_BRANCH || 'main',
    filePath: process.env.PFSP_REGISTRY_PATH || 'data/verify-registry.json' };
}
function redisConfig() {
  return { url: process.env.PFSP_UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || '', token: process.env.PFSP_UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
    key: process.env.PFSP_REDIS_REGISTRY_KEY || 'pfsp:verify:registry:v6' };
}
async function loadGithub() {
  const cfg = githubConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) return null;
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.filePath}?ref=${encodeURIComponent(cfg.branch)}`;
  const meta = await fetchJson(url, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'pdf-fusion-smart-pro-verify-v15' } });
  const raw = Buffer.from(String(meta.content || ''), 'base64').toString('utf8');
  return { registry: normalizeRegistry(JSON.parse(raw)), backend: 'github', token: meta.sha, config: cfg };
}
async function loadRedis() {
  const cfg = redisConfig();
  if (!cfg.url || !cfg.token) return null;
  const payload = await fetchJson(cfg.url.replace(/\/$/, '') + '/get/' + encodeURIComponent(cfg.key), { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (payload.result == null) return { registry: emptyRegistry(), backend: 'redis', token: 0, config: cfg };
  const raw = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result);
  const registry = normalizeRegistry(JSON.parse(raw));
  return { registry, backend: 'redis', token: registry.registryRevision, config: cfg };
}
async function loadLocal() {
  try {
    const registry = normalizeRegistry(JSON.parse(fs.readFileSync(LOCAL_REGISTRY_PATH, 'utf8')));
    return { registry, backend: 'local', token: registry.registryRevision, config: {} };
  } catch { return { registry: emptyRegistry(), backend: 'local', token: 0, config: {} }; }
}
async function loadRegistry() {
  if (process.env.PFSP_REGISTRY_URL) {
    const registry = normalizeRegistry(await fetchJson(process.env.PFSP_REGISTRY_URL));
    return { registry, backend: 'remote-readonly', token: registry.registryRevision, config: {} };
  }
  const redis = redisConfig();
  if (redis.url || redis.token) {
    if (!(redis.url && redis.token)) throw Object.assign(new Error('Redis registry configuration is incomplete.'), { code: 'STORAGE_CONFIG_ERROR' });
    try { return await loadRedis(); }
    catch (error) {
      if (!parseBool(process.env.PFSP_STORAGE_FAILOVER_READ, false)) throw Object.assign(error, { code: 'PRIMARY_STORAGE_UNAVAILABLE' });
    }
  }
  const gh = githubConfig();
  if (gh.token || gh.owner || gh.repo) {
    if (!(gh.token && gh.owner && gh.repo)) throw Object.assign(new Error('GitHub registry configuration is incomplete.'), { code: 'STORAGE_CONFIG_ERROR' });
    try { return await loadGithub(); }
    catch (error) {
      if (!parseBool(process.env.PFSP_STORAGE_FAILOVER_READ, false)) throw Object.assign(error, { code: 'PRIMARY_STORAGE_UNAVAILABLE' });
    }
  }
  return loadLocal();
}
function prepareRegistryForWrite(registry, baseRevision) {
  const output = normalizeRegistry(registry);
  output.registryRevision = Number(baseRevision || 0) + 1;
  output.updatedAt = nowIso();
  output.integrity = registryIntegrity(output);
  return output;
}
async function persistGithub(loaded, registry, message) {
  const cfg = loaded.config;
  const output = prepareRegistryForWrite(registry, loaded.registry.registryRevision);
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.filePath}`;
  const body = { message: cleanString(message, 240) || 'Update PFSP verify registry', branch: cfg.branch,
    content: Buffer.from(JSON.stringify(output, null, 2) + '\n', 'utf8').toString('base64'), sha: loaded.token };
  try {
    const response = await fetchJson(url, { method: 'PUT', headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'pdf-fusion-smart-pro-verify-v15' }, body: JSON.stringify(body) });
    return { registry: output, backend: 'github', commit: response.commit || null };
  } catch (error) {
    if ([409, 422].includes(error.status)) throw Object.assign(new Error('Registry changed while this request was being processed.'), { code: 'REVISION_CONFLICT' });
    throw error;
  }
}
async function persistRedis(loaded, registry) {
  const cfg = loaded.config;
  const output = prepareRegistryForWrite(registry, loaded.registry.registryRevision);
  const script = "local current=redis.call('GET',KEYS[1]); local expected=tonumber(ARGV[1]); if current then local ok,obj=pcall(cjson.decode,current); if not ok then return redis.error_reply('CORRUPT_REGISTRY') end; local rev=tonumber(obj.registryRevision or 0); if rev~=expected then return redis.error_reply('REVISION_CONFLICT') end elseif expected~=0 then return redis.error_reply('REVISION_CONFLICT') end; redis.call('SET',KEYS[1],ARGV[2]); return tostring(expected+1)";
  const response = await fetch(cfg.url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', script, '1', cfg.key, String(loaded.registry.registryRevision || 0), JSON.stringify(output)]) });
  const json = await response.json().catch(() => ({}));
  const error = json.error || (!response.ok && `Redis write failed ${response.status}`);
  if (error) {
    if (/REVISION_CONFLICT/i.test(String(error))) throw Object.assign(new Error('Registry changed while this request was being processed.'), { code: 'REVISION_CONFLICT' });
    throw new Error(String(error));
  }
  return { registry: output, backend: 'redis', redis: true };
}
async function persistLocal(loaded, registry) {
  if (!parseBool(process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE, false) && process.env.NODE_ENV === 'production') throw Object.assign(new Error('Local registry write is disabled.'), { code: 'READ_ONLY_STORAGE' });
  const current = await loadLocal();
  if (Number(current.registry.registryRevision || 0) !== Number(loaded.registry.registryRevision || 0)) throw Object.assign(new Error('Registry changed while this request was being processed.'), { code: 'REVISION_CONFLICT' });
  const output = prepareRegistryForWrite(registry, loaded.registry.registryRevision);
  fs.mkdirSync(path.dirname(LOCAL_REGISTRY_PATH), { recursive: true });
  const tmp = LOCAL_REGISTRY_PATH + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(output, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, LOCAL_REGISTRY_PATH);
  return { registry: output, backend: 'local', local: true };
}
async function persistRegistry(loaded, registry, message) {
  if (loaded.backend === 'github') return persistGithub(loaded, registry, message);
  if (loaded.backend === 'redis') return persistRedis(loaded, registry);
  if (loaded.backend === 'local') return persistLocal(loaded, registry);
  throw Object.assign(new Error('Configured registry source is read-only.'), { code: 'READ_ONLY_STORAGE' });
}
function addAudit(registry, req, event) {
  registry.auditLog = Array.isArray(registry.auditLog) ? registry.auditLog : [];
  registry.auditLog.unshift({ time: nowIso(), action: cleanString(event.action, 80), id: cleanString(event.id, 120).toUpperCase(), sha256: normalizeHash(event.sha256),
    result: cleanString(event.result || event.verdict, 80), ok: !!event.ok, message: cleanString(event.message, 500), actor: cleanString(event.actor, 120),
    previousStatus: lower(event.previousStatus, 40), status: lower(event.status, 40), revision: Number(event.revision || 0),
    clientIpHash: clientIpHash(req), userAgentHash: userAgentHash(req), requestId: ensureRequestId(req), origin: cleanString(event.origin || requestOrigin(req, event), 500) });
  registry.auditLog = registry.auditLog.slice(0, MAX_AUDIT);
}
function addSnapshot(registry, label) {
  registry.snapshots = Array.isArray(registry.snapshots) ? registry.snapshots : [];
  registry.snapshots.unshift({ time: nowIso(), label: cleanString(label || 'snapshot', 140), registryRevision: registry.registryRevision, integrity: registryIntegrity(registry) });
  registry.snapshots = registry.snapshots.slice(0, 50);
}
function operationHash(key) { return key ? sha256Text(key).slice(0, 40) : ''; }
function previousOperation(registry, key, action) {
  const hash = operationHash(key);
  return hash ? (registry.operations || []).find(op => op.keyHash === hash && op.action === action) : null;
}
function rememberOperation(registry, key, action, result) {
  if (!key) return;
  registry.operations = Array.isArray(registry.operations) ? registry.operations : [];
  registry.operations.unshift({ keyHash: operationHash(key), action, id: cleanString(result.id || result.record?.id, 120), verdict: cleanString(result.verdict, 80), createdAt: nowIso() });
  registry.operations = registry.operations.slice(0, 500);
}
function findRecord(registry, id) {
  const target = cleanString(id, 120).toUpperCase();
  return (registry.records || []).find(record => cleanString(record.id, 120).toUpperCase() === target) || null;
}
function recordsByHash(registry, hash) { const h = normalizeHash(hash); return validHash(h) ? (registry.records || []).filter(r => r.sha256 === h) : []; }
function visibility(record) { return normalizePolicy(record.policy).visibility; }
function canReadRecord(record, admin, exact = false) {
  if (admin) return true;
  const v = visibility(record);
  if (v === 'private') return false;
  return v === 'public-metadata' || (v === 'unlisted' && exact);
}
function publicRecord(record, options = {}) {
  const admin = !!options.admin;
  const r = normalizeRecord(record);
  const output = { ...r, userInfo: publicUserInfo(r.userInfo, admin), documentInfo: normalizeDocumentInfo(r.documentInfo), extraInfo: normalizeExtraInfo(r.extraInfo) };
  delete output.clientIpHash; delete output.userAgentHash;
  if (!admin) { delete output.adminNote; if (!options.includeHistory) delete output.history; }
  if (!options.includeHistory) delete output.history;
  return output;
}
function sanitizeIntegrity(integrity, admin) {
  if (admin) return integrity;
  return {
    ok: integrity.ok,
    sha256: integrity.sha256,
    recordCount: integrity.recordCount,
    activeCount: integrity.activeCount,
    revokedCount: integrity.revokedCount,
    suspendedCount: integrity.suspendedCount,
    archivedCount: integrity.archivedCount,
    draftCount: integrity.draftCount,
    expiredCount: integrity.expiredCount,
    signedRecordCount: integrity.signedRecordCount,
    unsignedRecordCount: integrity.unsignedRecordCount,
    problemCount: Array.isArray(integrity.problems) ? integrity.problems.length : 0,
    warningCount: Array.isArray(integrity.warnings) ? integrity.warnings.length : 0,
    checkedAt: integrity.checkedAt
  };
}
function registryIntegrity(registry) {
  const records = Array.isArray(registry.records) ? registry.records : [];
  const ids = new Set(); const duplicateIds = []; const invalidSignatureIds = []; const unsignedIds = []; const invalidStatusIds = []; const invalidDateIds = [];
  let active = 0; let revoked = 0; let suspended = 0; let archived = 0; let draft = 0; let expired = 0;
  for (const record of records) {
    if (ids.has(record.id)) duplicateIds.push(record.id); ids.add(record.id);
    if (!VALID_STATUSES.has(record.status)) invalidStatusIds.push(record.id);
    if (record.expiresAt && !safeDate(record.expiresAt)) invalidDateIds.push(record.id);
    if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) expired += 1;
    if (record.status === 'active') active += 1; if (record.status === 'revoked') revoked += 1; if (record.status === 'suspended') suspended += 1;
    if (record.status === 'archived') archived += 1; if (record.status === 'draft') draft += 1;
    if (!record.serverSignature) unsignedIds.push(record.id); else if (verifyRecordSignature(record).valid === false) invalidSignatureIds.push(record.id);
  }
  const problems = [...duplicateIds.map(id => 'duplicate-id:' + id), ...invalidSignatureIds.map(id => 'invalid-signature:' + id),
    ...invalidStatusIds.map(id => 'invalid-status:' + id), ...invalidDateIds.map(id => 'invalid-date:' + id)];
  return { ok: problems.length === 0, sha256: sha256Text(stableStringify({ registryRevision: registry.registryRevision, records: records.map(r => ({ id: r.id, revision: r.revision, sha256: r.sha256, status: r.status, updatedAt: r.updatedAt, signature: r.serverSignature })).sort((a, b) => a.id.localeCompare(b.id)) })),
    recordCount: records.length, activeCount: active, revokedCount: revoked, suspendedCount: suspended, archivedCount: archived, draftCount: draft, expiredCount: expired,
    signedRecordCount: records.length - unsignedIds.length, unsignedRecordCount: unsignedIds.length, invalidSignatureIds, unsignedIds, duplicateIds, invalidStatusIds, invalidDateIds,
    problems, warnings: unsignedIds.map(id => 'unsigned:' + id), checkedAt: nowIso() };
}
function transition(record, operation, reason) {
  const current = record.status;
  const now = nowIso();
  const op = operation === 'hold' ? 'suspend' : operation === 'unsuspend' ? 'activate' : operation;
  const allowed = {
    revoke: new Set(['draft', 'active', 'suspended', 'revoked']), restore: new Set(['revoked', 'suspended', 'active']),
    suspend: new Set(['draft', 'active', 'suspended']), activate: new Set(['draft', 'suspended', 'active']),
    archive: new Set(['draft', 'active', 'suspended', 'revoked', 'archived']), unarchive: new Set(['archived'])
  };
  if (!allowed[op] || !allowed[op].has(current)) return { ok: false, verdict: 'INVALID_STATE_TRANSITION', message: `Cannot ${op} a ${current} record.` };
  if (op === 'activate' && current === 'revoked') return { ok: false, verdict: 'RESTORE_REQUIRED', message: 'Revoked records must use restore, not activate.' };
  const target = op === 'revoke' ? 'revoked' : op === 'suspend' ? 'suspended' : op === 'archive' ? 'archived' : 'active';
  if (current === target) return { ok: true, idempotent: true, previousStatus: current, status: target };
  record.previousStatus = current;
  record.status = target;
  record.statusChangedAt = now;
  if (target === 'revoked') { record.revokedAt = now; record.revokeReason = cleanString(reason || 'revoked by admin', 300); record.suspendedAt = ''; record.suspendReason = ''; record.restoredAt = ''; }
  if (target === 'suspended') { record.suspendedAt = now; record.suspendReason = cleanString(reason || 'suspended by admin', 300); record.restoredAt = ''; }
  if (target === 'archived') { record.archivedAt = now; record.archivedReason = cleanString(reason || 'archived by admin', 300); }
  if (target === 'active') {
    record.restoredAt = now; record.revokedAt = ''; record.revokeReason = ''; record.suspendedAt = ''; record.suspendReason = '';
    if (op === 'unarchive') { record.archivedAt = ''; record.archivedReason = ''; }
  }
  return { ok: true, idempotent: false, previousStatus: current, status: target };
}
function recordFromInput(input, req, mode) {
  const cert = input.certificate || input.cert || input.record || input;
  const now = nowIso();
  const record = normalizeRecord({
    id: cert.id || cert.verifyId || ((input.autoGenerateId || input.generateId) ? generateVerifyId() : ''), sha256: cert.sha256 || cert.hash || cert.h,
    size: cert.size, fileName: cert.fileName || cert.name, mimeType: cert.mimeType, createdAt: cert.createdAt || cert.ts || now,
    registeredAt: cert.registeredAt || now, updatedAt: now, origin: cert.origin || cert.o || requestOrigin(req, cert), app: cert.app || 'PDF Fusion Smart Pro',
    appVersion: cert.appVersion || cert.version || API_VERSION, sourceBundleSha256: cert.sourceBundleSha256 || cert.sourceHash || cert.sh,
    checksum: cert.checksum || cert.hck, status: mode === 'auto' ? 'active' : (cert.status || input.status || 'active'), expiresAt: cert.expiresAt || input.expiresAt,
    registeredBy: input.registeredBy || cert.registeredBy || (mode === 'auto' ? 'auto-qr-export' : 'admin'), registrationMode: mode === 'auto' ? 'auto-qr-export' : 'manual-admin',
    owner: input.owner || cert.owner || cert.userInfo?.fullName || cert.userInfo?.organization, project: input.project || cert.project || cert.extraInfo?.project || cert.documentInfo?.department,
    documentTitle: input.documentTitle || cert.documentTitle || cert.title || cert.documentInfo?.title, tags: input.tags || cert.tags, note: input.note || cert.note,
    policy: cert.policy || input.policy || { retention: input.retention, visibility: input.visibility || 'public-metadata' },
    documentInfo: cert.documentInfo || input.documentInfo, userInfo: cert.userInfo || cert.personInfo || input.userInfo || input.personInfo, extraInfo: cert.extraInfo || input.extraInfo,
    revision: 1, businessPolicyVersion: BUSINESS_POLICY_VERSION
  });
  record.fingerprint = record.fingerprint || sha256Text([record.id, record.sha256, record.size ?? '', record.createdAt, record.origin].join('|')).slice(0, 32).toUpperCase();
  const base = baseUrl(req, record);
  record.shortVerifyUrl = (base || '.') + '/verify.html?id=' + encodeURIComponent(record.id);
  const query = new URLSearchParams({ id: record.id, sha256: record.sha256 }); if (record.size != null) query.set('size', String(record.size));
  record.verifyUrl = (base || '.') + '/verify.html?' + query.toString();
  pushHistory(record, mode === 'auto' ? 'auto-register' : 'manual-register', { actor: record.registeredBy, result: 'REGISTERED', sha256: record.sha256, status: record.status, origin: record.origin });
  return applySignature(record);
}
function validateRecord(record, mode) {
  if (!validId(record.id)) return { ok: false, verdict: 'BAD_ID', message: 'Invalid PFSP verify ID.' };
  if (!validHash(record.sha256)) return { ok: false, verdict: 'BAD_HASH', message: 'Invalid SHA-256 hash.' };
  if (record.size === null) return { ok: false, verdict: 'BAD_SIZE', message: 'File size must be a non-negative integer within the configured maximum.' };
  const allowedMime = splitList(process.env.PFSP_VERIFY_ALLOWED_MIME_TYPES || 'application/pdf');
  if (allowedMime.length && !allowedMime.includes(record.mimeType)) return { ok: false, verdict: 'BAD_MIME_TYPE', message: `Unsupported MIME type: ${record.mimeType}.` };
  if (!VALID_STATUSES.has(record.status)) return { ok: false, verdict: 'BAD_STATUS', message: 'Unsupported record status.' };
  if (record.expiresAt && !safeDate(record.expiresAt)) return { ok: false, verdict: 'BAD_EXPIRY', message: 'Invalid expiry date.' };
  if (mode === 'auto' && !parseBool(process.env.PFSP_AUTO_REGISTER_ALLOW_PII, false)) {
    const user = normalizeUserInfo(record.userInfo);
    if (user.email || user.phone || user.identifier || user.address || user.note) return { ok: false, verdict: 'AUTO_REGISTER_PII_BLOCKED', message: 'Public auto-register cannot store sensitive personal fields.' };
  }
  return { ok: true };
}
function originPolicy(req, record) {
  const allow = allowedOrigins();
  let refererOrigin = '';
  try { refererOrigin = new URL(cleanString(req.headers && req.headers.referer, 800)).origin; } catch {}
  const candidates = [cleanString(req.headers && req.headers.origin, 500), refererOrigin].map(x => cleanString(x, 500).replace(/\/$/, '')).filter(Boolean);
  if (!allow.length) {
    const enabledWithoutAllowlist = parseBool(process.env.PFSP_AUTO_REGISTER_ALLOW_UNLISTED_ORIGINS, process.env.NODE_ENV !== 'production');
    return { ok: enabledWithoutAllowlist, reason: enabledWithoutAllowlist ? 'development-no-allowlist' : 'allowlist-required', candidates };
  }
  const ok = candidates.some(x => allow.includes(x));
  return { ok, reason: ok ? 'origin-allowed' : 'origin-not-allowed', candidates };
}
function checkConcurrency(record, body) {
  if (body.expectedRevision != null && Number(body.expectedRevision) !== Number(record.revision || 0)) return { ok: false, verdict: 'STALE_RECORD', message: 'Record revision changed. Reload before retrying.', currentRevision: record.revision };
  if (body.expectedUpdatedAt && safeDate(body.expectedUpdatedAt) !== safeDate(record.updatedAt)) return { ok: false, verdict: 'STALE_RECORD', message: 'Record timestamp changed. Reload before retrying.', currentUpdatedAt: record.updatedAt };
  return { ok: true };
}
function bumpRecord(record, action, details = {}) {
  record.revision = Math.max(0, Number(record.revision || 0)) + 1;
  record.updatedAt = nowIso();
  record.businessPolicyVersion = BUSINESS_POLICY_VERSION;
  pushHistory(record, action, { ...details, revision: record.revision });
  applySignature(record);
}
function trustSummary(record, signature, input = {}) {
  const checks = []; let score = 100;
  const add = (name, ok, weight, message) => { checks.push({ name, ok, weight, message }); if (!ok) score -= weight; };
  add('registered', !!record, 40, record ? 'Verify ID exists in registry.' : 'Verify ID is not registered.');
  if (!record) return { trustScore: 0, trustLevel: 'unknown', checks };
  add('serverSignature', signature.valid === true, signature.valid === false ? 70 : 30, signature.valid === true ? 'Server signature is valid.' : signature.reason || 'Signature cannot be confirmed.');
  add('statusActive', record.status === 'active', ['revoked', 'suspended', 'invalid'].includes(record.status) ? 90 : 55, 'Current status: ' + record.status);
  const expired = !!(record.expiresAt && Date.parse(record.expiresAt) < Date.now()); add('notExpired', !expired, 60, expired ? 'Record is expired.' : 'Record is not expired.');
  const hash = normalizeHash(input.sha256 || input.hash || input.h);
  if (hash) add('hashMatch', record.sha256 === hash, 90, record.sha256 === hash ? 'PDF SHA-256 matches.' : 'PDF SHA-256 does not match.');
  else { score -= 30; checks.push({ name: 'hashProvided', ok: false, weight: 30, message: 'No PDF hash was provided.' }); }
  const size = normalizeSize(input.size); if (size !== null && record.size !== null) add('sizeMatch', size === record.size, 10, size === record.size ? 'File size matches.' : 'File size metadata differs.');
  score = clamp(score, 0, 100);
  return { trustScore: score, trustLevel: score >= 90 ? 'verified' : score >= 65 ? 'probable' : score >= 35 ? 'warning' : 'blocked', checks };
}
function evaluate(registry, input, admin = false) {
  const cert = input.certificate || input.cert || input.record || input;
  const id = cleanString(cert.id || cert.verifyId || input.id || input.verifyId, 120).toUpperCase();
  const hash = normalizeHash(cert.sha256 || cert.hash || cert.h || input.sha256 || input.hash || input.h);
  const size = normalizeSize(cert.size ?? input.size);
  if (!id) return { ok: false, verdict: 'NO_ID', level: 'bad', message: 'Missing verify ID.', trustScore: 0, trustLevel: 'unknown' };
  const record = findRecord(registry, id);
  if (!record || !canReadRecord(record, admin, true)) return { ok: false, verdict: 'UNKNOWN', level: 'warn', message: 'Verify ID is not registered or is not publicly accessible.', id, trustScore: 0, trustLevel: 'unknown' };
  const signature = verifyRecordSignature(record); const trust = trustSummary(record, signature, { sha256: hash, size });
  const base = { record: publicRecord(record, { admin, includeHistory: true }), signature, ...trust };
  if (signature.valid === false) return { ok: false, verdict: 'REGISTRY_TAMPERED', level: 'bad', message: 'Registry record signature is invalid.', ...base };
  if (record.status === 'revoked') return { ok: false, verdict: 'REVOKED', level: 'bad', message: record.revokeReason || 'Verify ID is revoked.', ...base };
  if (record.status === 'suspended') return { ok: false, verdict: 'SUSPENDED', level: 'bad', message: record.suspendReason || 'Verify ID is suspended.', ...base };
  if (record.status === 'archived') return { ok: false, verdict: 'ARCHIVED', level: 'warn', message: 'Verify ID is archived.', ...base };
  if (record.status === 'draft') return { ok: false, verdict: 'DRAFT_NOT_TRUSTED', level: 'warn', message: 'Verify ID is a draft and is not trusted for production verification.', ...base };
  if (record.status === 'invalid') return { ok: false, verdict: 'INVALID_RECORD_STATE', level: 'bad', message: 'Registry record has an invalid status.', ...base };
  if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return { ok: false, verdict: 'EXPIRED', level: 'bad', message: 'Verify ID is expired.', ...base };
  if (!hash) return { ok: false, verdict: 'REGISTERED_NEEDS_FILE', level: 'warn', message: 'Verify ID exists. Provide the PDF hash to confirm the actual file.', ...base };
  if (record.sha256 !== hash) return { ok: false, verdict: 'FAKE_OR_MODIFIED', level: 'bad', message: 'The PDF hash does not match the registered original.', providedHash: hash, ...base };
  if (size !== null && record.size !== null && size !== record.size) return { ok: true, verdict: 'HASH_MATCH_SIZE_WARNING', level: 'warn', message: 'Hash matches, but stored size metadata differs.', providedHash: hash, ...base };
  return { ok: true, verdict: 'GENUINE', level: 'good', message: 'Verify ID and PDF SHA-256 match a valid trusted record.', providedHash: hash, ...base };
}
function signedCertificate(record, admin = false) {
  const r = publicRecord(record, { admin, includeHistory: false });
  return { certificateVersion: 'PFSP-TRUSTED-CERT-v6', ...r, issuedBy: 'PDF Fusion Smart Pro Verify System', issuedAt: nowIso() };
}
function summary(records) {
  const out = { total: records.length, active: 0, draft: 0, revoked: 0, suspended: 0, archived: 0, expired: 0, unsigned: 0 };
  for (const r of records) { if (out[r.status] != null) out[r.status] += 1; if (r.expiresAt && Date.parse(r.expiresAt) < Date.now()) out.expired += 1; if (!r.serverSignature) out.unsigned += 1; }
  return out;
}
function envSummary(admin = false) {
  const gh = githubConfig(); const redis = redisConfig(); const keys = keyConfig(); const origins = allowedOrigins();
  const safe = { apiVersion: API_VERSION, registryVersion: REGISTRY_VERSION, schemaVersion: SCHEMA_VERSION, businessPolicyVersion: BUSINESS_POLICY_VERSION,
    signingConfigured: requireSigning(), signatureMode: activeSigningKey() ? 'asymmetric-key' : signingSecret() ? 'hmac-secret' : 'not-configured',
    adminConfigured: !!adminSecret(), autoRegisterEnabled: autoRegisterEnabled(), allowedOriginsConfigured: origins.length > 0,
    privacyPolicySupported: true, optimisticConcurrencySupported: true, idempotencySupported: true, stateMachineSupported: true };
  if (!admin) return safe;
  return { ...safe, activeKeyId: activeSigningKey()?.id || '', configuredVerifyKeys: keys.length, storageBackend: redis.url && redis.token ? 'redis' : gh.token && gh.owner && gh.repo ? 'github' : process.env.PFSP_REGISTRY_URL ? 'remote-readonly' : 'local',
    githubConfigured: !!(gh.token && gh.owner && gh.repo), owner: gh.owner, repo: gh.repo, branch: gh.branch, registryPath: gh.filePath,
    redisConfigured: !!(redis.url && redis.token), redisRegistryKey: redis.key, rateLimitWindowMs: RATE_LIMIT_WINDOW_MS, publicRateLimit: PUBLIC_RATE_LIMIT,
    adminRateLimit: ADMIN_RATE_LIMIT, maxBatch: MAX_BATCH, maxBulkRegister: MAX_BULK, allowedOriginsCount: origins.length,
    wildcardCorsEnabled: parseBool(process.env.PFSP_ALLOW_WILDCARD_CORS, false), localWriteEnabled: parseBool(process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE, false) };
}
function autoRegisterEnabled() {
  const explicit = process.env.PFSP_AUTO_REGISTER_ENABLED ?? process.env.PFSP_VERIFY_AUTO_REGISTER;
  if (explicit != null) return parseBool(explicit, false);
  return process.env.NODE_ENV !== 'production';
}
function tooManyAutoRegisters(registry, req) {
  if (!AUTO_REGISTER_DAILY_LIMIT) return false;
  const ip = clientIpHash(req); if (!ip) return false;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return (registry.auditLog || []).filter(x => x.action === 'auto-register' && x.clientIpHash === ip && Date.parse(x.time || '') > since).length >= AUTO_REGISTER_DAILY_LIMIT;
}
function sendStorageError(req, res, error) {
  const status = error.code === 'REVISION_CONFLICT' ? 409 : error.code === 'READ_ONLY_STORAGE' ? 503 : 500;
  return send(req, res, status, { ok: false, verdict: error.code || 'STORAGE_ERROR', level: 'bad', message: error.message || 'Registry storage failed.' });
}
async function saveMutation(req, res, loaded, registry, message, response, key, action) {
  rememberOperation(registry, key, action, response);
  try {
    const saved = await persistRegistry(loaded, registry, message);
    return send(req, res, response.status || 200, { ...response, registryRevision: saved.registry.registryRevision, storageBackend: saved.backend,
      commit: saved.commit && saved.commit.html_url, localWrite: !!saved.local, redisWrite: !!saved.redis, registryIntegrity: sanitizeIntegrity(saved.registry.integrity, true) });
  } catch (error) { return sendStorageError(req, res, error); }
}
async function handleRegister(req, res, body, mode = 'manual') {
  if (mode === 'manual' && !hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (mode === 'auto' && !autoRegisterEnabled()) return send(req, res, 403, { ok: false, verdict: 'AUTO_REGISTER_DISABLED', level: 'warn', message: 'Public auto-registration is disabled.' });
  if (!requireSigning()) return send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'Signing must be configured before records can be changed.' });
  const loaded = await loadRegistry(); const registry = loaded.registry; const action = mode === 'auto' ? 'auto-register' : 'register';
  if (mode === 'auto' && tooManyAutoRegisters(registry, req)) return send(req, res, 429, { ok: false, verdict: 'AUTO_REGISTER_DAILY_LIMIT', level: 'bad', message: 'Auto-register daily limit reached.' });
  const key = idempotencyKey(req, body); const previous = previousOperation(registry, key, action);
  if (previous) return send(req, res, 200, { ok: true, verdict: 'IDEMPOTENT_REPLAY', level: 'good', message: 'This operation was already completed.', operation: previous, record: publicRecord(findRecord(registry, previous.id) || {}, { admin: mode === 'manual', includeHistory: true }) });
  const record = recordFromInput(body, req, mode);
  const validation = validateRecord(record, mode); if (!validation.ok) return send(req, res, 400, { ...validation, level: 'bad', record: publicRecord(record, { admin: mode === 'manual' }) });
  if (mode === 'auto') { const policy = originPolicy(req, record); if (!policy.ok) return send(req, res, 403, { ok: false, verdict: 'ORIGIN_NOT_ALLOWED', level: 'bad', message: 'Origin is not allowed to auto-register.', originPolicy: policy }); }
  const existing = findRecord(registry, record.id);
  if (existing) {
    if (existing.sha256 === record.sha256 && mode === 'auto') return send(req, res, 200, { ok: true, verdict: 'ALREADY_REGISTERED', level: 'good', message: 'The same ID and hash are already registered.', record: publicRecord(existing, { includeHistory: true }), certificate: signedCertificate(existing) });
    if (!body.overwrite) return send(req, res, 409, { ok: false, verdict: 'ALREADY_REGISTERED', level: 'warn', message: 'Verify ID already exists.', existing: publicRecord(existing, { admin: true, includeHistory: true }) });
    const concurrency = checkConcurrency(existing, body); if (!concurrency.ok) return send(req, res, 409, { ...concurrency, level: 'warn' });
    record.revision = Number(existing.revision || 0) + 1; record.registeredAt = existing.registeredAt || record.registeredAt;
    record.createdAt = existing.createdAt || record.createdAt; record.history = [...(existing.history || []), ...(record.history || [])].slice(0, MAX_HISTORY);
    pushHistory(record, 'overwrite-register', { actor: 'admin', result: 'OVERWRITTEN', previousStatus: existing.status, status: record.status, sha256: record.sha256, origin: record.origin });
    applySignature(record);
    registry.records[registry.records.indexOf(existing)] = record;
  } else registry.records.push(record);
  addAudit(registry, req, { action, id: record.id, sha256: record.sha256, result: existing ? 'OVERWRITTEN' : 'REGISTERED', ok: true, actor: mode === 'auto' ? 'public-auto-register' : 'admin', status: record.status, revision: record.revision, origin: record.origin });
  return saveMutation(req, res, loaded, registry, `${existing ? 'Overwrite' : 'Register'} PFSP verify ID ${record.id}`,
    { ok: true, verdict: existing ? 'OVERWRITTEN' : (mode === 'auto' ? 'AUTO_REGISTERED' : 'REGISTERED'), level: 'good', message: 'Record stored in the trusted registry.', id: record.id,
      record: publicRecord(record, { admin: mode === 'manual', includeHistory: true }), certificate: signedCertificate(record, mode === 'manual') }, key, action);
}
async function handleBulkRegister(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning()) return send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'Signing must be configured.' });
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_BULK) : [];
  if (!items.length) return send(req, res, 400, { ok: false, verdict: 'NO_ITEMS', level: 'bad', message: 'Provide items[].' });
  const loaded = await loadRegistry(); const registry = loaded.registry; const results = [];
  for (let i = 0; i < items.length; i++) {
    const record = recordFromInput({ ...items[i], registeredBy: body.registeredBy || 'bulk-admin' }, req, 'manual');
    const validation = validateRecord(record, 'manual'); if (!validation.ok) { results.push({ index: i, ok: false, ...validation }); continue; }
    const existing = findRecord(registry, record.id);
    if (existing && !body.overwrite) { results.push({ index: i, ok: false, verdict: 'ALREADY_REGISTERED', id: record.id }); continue; }
    if (existing) {
      const expected = items[i].expectedRevision ?? body.expectedRevision;
      if (expected != null && Number(expected) !== Number(existing.revision || 0)) { results.push({ index: i, ok: false, verdict: 'STALE_RECORD', id: record.id, currentRevision: existing.revision }); continue; }
      record.revision = Number(existing.revision || 0) + 1; record.createdAt = existing.createdAt; record.registeredAt = existing.registeredAt;
      record.history = [...(existing.history || []), ...(record.history || [])].slice(0, MAX_HISTORY); applySignature(record);
      registry.records[registry.records.indexOf(existing)] = record;
    } else registry.records.push(record);
    addAudit(registry, req, { action: 'bulk-register', id: record.id, sha256: record.sha256, result: existing ? 'OVERWRITTEN' : 'REGISTERED', ok: true, actor: 'admin', status: record.status, revision: record.revision });
    results.push({ index: i, ok: true, verdict: existing ? 'OVERWRITTEN' : 'REGISTERED', id: record.id, revision: record.revision });
  }
  if (body.dryRun) return send(req, res, 200, { ok: true, verdict: 'BULK_DRY_RUN', level: results.every(x => x.ok) ? 'good' : 'warn', message: 'Bulk validation completed. No write was made.', results });
  return saveMutation(req, res, loaded, registry, `Bulk register ${results.filter(x => x.ok).length} PFSP records`,
    { ok: true, verdict: 'BULK_REGISTERED', level: results.every(x => x.ok) ? 'good' : 'warn', message: 'Bulk registration completed.', results }, idempotencyKey(req, body), 'bulk-register');
}
async function handleTransition(req, res, body, action) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning()) return send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'Signing must be configured.' });
  const loaded = await loadRegistry(); const registry = loaded.registry; const id = cleanString(body.id || body.verifyId, 120).toUpperCase();
  const record = findRecord(registry, id); if (!record) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  const concurrency = checkConcurrency(record, body); if (!concurrency.ok) return send(req, res, 409, { ...concurrency, level: 'warn' });
  const key = idempotencyKey(req, body); const previous = previousOperation(registry, key, action); if (previous) return send(req, res, 200, { ok: true, verdict: 'IDEMPOTENT_REPLAY', level: 'good', operation: previous, record: publicRecord(record, { admin: true, includeHistory: true }) });
  const result = transition(record, action, body.reason || body.revokeReason || body.suspendReason || body.archivedReason);
  if (!result.ok) return send(req, res, 409, { ...result, level: 'bad', record: publicRecord(record, { admin: true, includeHistory: true }) });
  if (!result.idempotent) bumpRecord(record, action, { actor: 'admin', result: action.toUpperCase(), message: body.reason || '', previousStatus: result.previousStatus, status: result.status, sha256: record.sha256, origin: record.origin });
  addAudit(registry, req, { action, id, sha256: record.sha256, result: result.idempotent ? 'NO_CHANGE' : action.toUpperCase(), ok: true, actor: 'admin', previousStatus: result.previousStatus, status: record.status, revision: record.revision, message: body.reason || '' });
  return saveMutation(req, res, loaded, registry, `${action} PFSP verify ID ${id}`,
    { ok: true, verdict: result.idempotent ? 'NO_CHANGE' : action.toUpperCase(), level: record.status === 'active' ? 'good' : 'warn', message: result.idempotent ? 'Record was already in the requested state.' : 'Record status updated.', id,
      record: publicRecord(record, { admin: true, includeHistory: true }), certificate: signedCertificate(record, true) }, key, action);
}
async function handleMetadata(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning()) return send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'Signing must be configured.' });
  const loaded = await loadRegistry(); const registry = loaded.registry; const id = cleanString(body.id || body.verifyId, 120).toUpperCase();
  const record = findRecord(registry, id); if (!record) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  const concurrency = checkConcurrency(record, body); if (!concurrency.ok) return send(req, res, 409, { ...concurrency, level: 'warn' });
  for (const immutable of ['sha256', 'createdAt', 'registeredAt']) {
    if (body[immutable] != null && cleanString(body[immutable], 500) !== cleanString(record[immutable], 500)) return send(req, res, 409, { ok: false, verdict: 'IMMUTABLE_FIELD', level: 'bad', message: `${immutable} cannot be changed after registration.` });
  }
  if ('note' in body) record.note = cleanString(body.note, 800); if ('owner' in body) record.owner = cleanString(body.owner, 160);
  if ('project' in body) record.project = cleanString(body.project, 160); if ('documentTitle' in body) record.documentTitle = cleanString(body.documentTitle, 240);
  if ('tags' in body) record.tags = normalizeTags(body.tags); if ('documentInfo' in body) record.documentInfo = normalizeDocumentInfo(body.documentInfo);
  if ('userInfo' in body || 'personInfo' in body) record.userInfo = normalizeUserInfo(body.userInfo || body.personInfo);
  if ('extraInfo' in body) record.extraInfo = normalizeExtraInfo(body.extraInfo); if ('policy' in body || 'visibility' in body || 'retention' in body) record.policy = normalizePolicy(body.policy || { visibility: body.visibility, retention: body.retention });
  bumpRecord(record, 'update-metadata', { actor: 'admin', result: 'METADATA_UPDATED', message: body.note || '', status: record.status, sha256: record.sha256, origin: record.origin });
  addAudit(registry, req, { action: 'update-metadata', id, sha256: record.sha256, result: 'METADATA_UPDATED', ok: true, actor: 'admin', status: record.status, revision: record.revision });
  return saveMutation(req, res, loaded, registry, `Update metadata for PFSP verify ID ${id}`,
    { ok: true, verdict: 'METADATA_UPDATED', level: 'good', message: 'Record metadata updated.', id, record: publicRecord(record, { admin: true, includeHistory: true }), certificate: signedCertificate(record, true) }, idempotencyKey(req, body), 'update-metadata');
}
async function handleExpiry(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning()) return send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'Signing must be configured.' });
  const loaded = await loadRegistry(); const registry = loaded.registry; const id = cleanString(body.id || body.verifyId, 120).toUpperCase();
  const record = findRecord(registry, id); if (!record) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
  const concurrency = checkConcurrency(record, body); if (!concurrency.ok) return send(req, res, 409, { ...concurrency, level: 'warn' });
  const clear = body.clearExpiry === true || body.expiresAt === '' || body.expiresAt == null; const expiresAt = clear ? '' : safeDate(body.expiresAt);
  if (!clear && !expiresAt) return send(req, res, 400, { ok: false, verdict: 'BAD_EXPIRY', level: 'bad', message: 'Invalid expiry date.' });
  record.expiresAt = expiresAt; bumpRecord(record, 'update-expiry', { actor: 'admin', result: clear ? 'EXPIRY_CLEARED' : 'EXPIRY_UPDATED', status: record.status, sha256: record.sha256 });
  addAudit(registry, req, { action: 'update-expiry', id, sha256: record.sha256, result: clear ? 'EXPIRY_CLEARED' : 'EXPIRY_UPDATED', ok: true, actor: 'admin', status: record.status, revision: record.revision });
  return saveMutation(req, res, loaded, registry, `Update expiry for PFSP verify ID ${id}`,
    { ok: true, verdict: clear ? 'EXPIRY_CLEARED' : 'EXPIRY_UPDATED', level: 'good', message: 'Record expiry updated.', id, record: publicRecord(record, { admin: true, includeHistory: true }) }, idempotencyKey(req, body), 'update-expiry');
}
async function handleBulkAction(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning()) return send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'Signing must be configured.' });
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(x => cleanString(x, 120).toUpperCase()).filter(Boolean))].slice(0, MAX_BULK) : [];
  const operation = lower(body.operation || body.bulkOperation, 40);
  if (!ids.length) return send(req, res, 400, { ok: false, verdict: 'NO_IDS', level: 'bad', message: 'Provide ids[].' });
  if (!['revoke', 'restore', 'suspend', 'activate', 'archive', 'unarchive'].includes(operation)) return send(req, res, 400, { ok: false, verdict: 'BAD_BULK_OPERATION', level: 'bad', message: 'Unsupported bulk operation.' });
  const loaded = await loadRegistry(); const registry = loaded.registry; const results = [];
  for (const id of ids) {
    const record = findRecord(registry, id); if (!record) { results.push({ id, ok: false, verdict: 'NOT_FOUND' }); continue; }
    const result = transition(record, operation, body.reason); if (!result.ok) { results.push({ id, ok: false, verdict: result.verdict, message: result.message }); continue; }
    if (!result.idempotent) bumpRecord(record, 'bulk-' + operation, { actor: 'admin', result: operation.toUpperCase(), previousStatus: result.previousStatus, status: result.status, message: body.reason || '', sha256: record.sha256 });
    addAudit(registry, req, { action: 'bulk-' + operation, id, sha256: record.sha256, result: result.idempotent ? 'NO_CHANGE' : operation.toUpperCase(), ok: true, actor: 'admin', previousStatus: result.previousStatus, status: record.status, revision: record.revision });
    results.push({ id, ok: true, verdict: result.idempotent ? 'NO_CHANGE' : operation.toUpperCase(), revision: record.revision });
  }
  if (body.dryRun) return send(req, res, 200, { ok: true, verdict: 'BULK_ACTION_DRY_RUN', level: results.every(x => x.ok) ? 'good' : 'warn', message: 'Bulk action validated. No write was made.', results });
  return saveMutation(req, res, loaded, registry, `Bulk ${operation} ${results.filter(x => x.ok).length} PFSP records`,
    { ok: true, verdict: 'BULK_ACTION_DONE', level: results.every(x => x.ok) ? 'good' : 'warn', message: `Bulk ${operation} completed.`, results }, idempotencyKey(req, body), 'bulk-' + operation);
}
async function handleRepair(req, res, body) {
  if (!hasAdmin(req, body)) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Missing or invalid admin secret.' });
  if (!requireSigning()) return send(req, res, 503, { ok: false, verdict: 'SIGNING_NOT_CONFIGURED', level: 'bad', message: 'Signing must be configured.' });
  const loaded = await loadRegistry(); const registry = loaded.registry; addSnapshot(registry, 'pre-v15-repair'); let touched = 0;
  registry.records = registry.records.map(raw => {
    const before = JSON.stringify(raw); const record = normalizeRecord(raw);
    if (!record.fingerprint && record.id && record.sha256) record.fingerprint = sha256Text([record.id, record.sha256, record.size ?? '', record.createdAt, record.origin].join('|')).slice(0, 32).toUpperCase();
    if (!VALID_STATUSES.has(record.status)) record.status = 'draft';
    const signature = verifyRecordSignature(record);
    if (body.resign || !record.serverSignature || signature.valid === false) { record.revision += 1; record.updatedAt = nowIso(); pushHistory(record, 'repair-resign', { actor: 'admin', result: 'RESIGNED', status: record.status, sha256: record.sha256 }); applySignature(record); }
    if (JSON.stringify(record) !== before) touched += 1;
    return record;
  });
  addAudit(registry, req, { action: 'repair', result: 'REPAIRED', ok: true, actor: 'admin', message: `Repair touched ${touched} records.` });
  if (body.dryRun) return send(req, res, 200, { ok: true, verdict: 'REPAIR_DRY_RUN', level: 'good', message: `Repair preview touched ${touched} records.`, touched, registryIntegrity: sanitizeIntegrity(registryIntegrity(registry), true) });
  return saveMutation(req, res, loaded, registry, `Upgrade/repair PFSP verify registry (${touched} records)`,
    { ok: true, verdict: 'REPAIRED', level: 'good', message: `Registry upgraded and repaired. Touched ${touched} records.`, touched }, idempotencyKey(req, body), 'repair');
}
function publicPortalRecord(record, req) {
  const signature = verifyRecordSignature(record); const trust = trustSummary(record, signature, {});
  return { id: record.id, sha256: record.sha256, shortSha256: record.sha256 ? record.sha256.slice(0, 12).toUpperCase() + '...' + record.sha256.slice(-8).toUpperCase() : '',
    size: record.size, fileName: record.fileName, documentTitle: record.documentTitle || record.documentInfo?.title || record.fileName,
    documentInfo: normalizeDocumentInfo(record.documentInfo), userInfo: publicUserInfo(record.userInfo), extraInfo: normalizeExtraInfo(record.extraInfo), owner: record.owner,
    project: record.project, tags: record.tags, status: record.status, registeredAt: record.registeredAt || record.createdAt, updatedAt: record.updatedAt,
    expiresAt: record.expiresAt, trustScore: trust.trustScore, trustLevel: trust.trustLevel,
    signature: signature.present ? (signature.valid === true ? 'valid' : signature.valid === false ? 'invalid' : 'unknown') : 'missing',
    verifyUrl: (baseUrl(req, record) || '.') + '/verify.html?id=' + encodeURIComponent(record.id),
    certificateUrl: (baseUrl(req, record) || '.') + '/verify-certificate.html?id=' + encodeURIComponent(record.id), fingerprint: record.fingerprint };
}
function analyticsSummary(registry) {
  const records = registry.records || []; const top = getter => {
    const map = new Map(); for (const record of records) for (const value of (Array.isArray(getter(record)) ? getter(record) : [getter(record)])) { const key = cleanString(value, 160); if (key) map.set(key, (map.get(key) || 0) + 1); }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }));
  };
  return { byStatus: summary(records), topOwners: top(r => r.owner || r.userInfo?.fullName), topProjects: top(r => r.project), topTags: top(r => r.tags || []),
    topDocumentTypes: top(r => r.documentInfo?.documentType), generatedAt: nowIso() };
}
async function handleRead(req, res, action, input, body = {}) {
  const loaded = await loadRegistry(); const registry = loaded.registry; const admin = hasAdmin(req, body || input);
  if (action === 'health') return send(req, res, 200, { ok: true, verdict: 'HEALTHY', level: 'good', message: 'Verify API is online.', time: nowIso(), env: envSummary(admin) });
  if (['self-test', 'diagnostics'].includes(action)) {
    const integrity = registryIntegrity(registry); const env = envSummary(admin);
    const checks = [{ name: 'apiOnline', ok: true }, { name: 'signingConfigured', ok: env.signingConfigured }, { name: 'adminConfigured', ok: env.adminConfigured },
      { name: 'registryIntegrity', ok: integrity.ok }, { name: 'storageReadable', ok: !!loaded.backend }, { name: 'privacyPolicy', ok: true }, { name: 'stateMachine', ok: true }];
    return send(req, res, 200, { ok: checks.every(x => x.ok), verdict: checks.every(x => x.ok) ? 'SELF_TEST_OK' : 'SELF_TEST_WARNING', level: checks.every(x => x.ok) ? 'good' : 'warn',
      message: 'Verify System diagnostics completed.', checks, env, registryIntegrity: sanitizeIntegrity(integrity, admin) });
  }
  if (['generate-id', 'new-id'].includes(action)) return send(req, res, 200, { ok: true, verdict: 'GENERATED_ID', level: 'good', id: generateVerifyId(), time: nowIso() });
  if (['stats'].includes(action)) return send(req, res, 200, { ok: true, verdict: 'STATS', level: 'good', message: 'Public registry status loaded.', updatedAt: registry.updatedAt,
    registryRevision: registry.registryRevision, registryVersion: registry.version, summary: summary(registry.records.filter(r => visibility(r) === 'public-metadata')), registryIntegrity: sanitizeIntegrity(registryIntegrity(registry), admin), env: envSummary(admin) });
  if (['integrity'].includes(action)) { const integrity = registryIntegrity(registry); return send(req, res, 200, { ok: integrity.ok, verdict: integrity.ok ? 'INTEGRITY_OK' : 'INTEGRITY_WARNING', level: integrity.ok ? 'good' : 'warn', message: 'Registry integrity check completed.', registryIntegrity: sanitizeIntegrity(integrity, admin), updatedAt: registry.updatedAt, registryRevision: registry.registryRevision }); }
  if (['portal', 'trust-portal', 'summary'].includes(action)) {
    const records = registry.records.filter(r => visibility(r) === 'public-metadata'); const recent = records.slice().sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt))).slice(0, 12).map(r => publicPortalRecord(r, req));
    return send(req, res, 200, { ok: true, verdict: 'TRUST_PORTAL', level: 'good', message: 'Trust Portal summary loaded.', portalVersion: API_VERSION, registryVersion: registry.version,
      registryRevision: registry.registryRevision, updatedAt: registry.updatedAt, summary: summary(records), recent, registryIntegrity: sanitizeIntegrity(registryIntegrity(registry), admin) });
  }
  if (['public-search', 'portal-search', 'trust-search'].includes(action)) {
    const q = cleanString(input.query || input.q || input.id || input.sha256, 160).toUpperCase(); const status = lower(input.status, 40); const limit = Math.min(Number(input.limit || MAX_PUBLIC_SEARCH) || MAX_PUBLIC_SEARCH, MAX_PUBLIC_SEARCH);
    const records = registry.records.filter(r => visibility(r) === 'public-metadata').filter(r => (!status || r.status === status) && (!q || [r.id, r.sha256, r.fileName, r.documentTitle, r.owner, r.project, ...(r.tags || [])].join(' ').toUpperCase().includes(q))).slice(0, limit).map(r => publicPortalRecord(r, req));
    return send(req, res, 200, { ok: true, verdict: 'PUBLIC_SEARCH', level: 'good', message: records.length ? 'Public trust records loaded.' : 'No matching records found.', query: q, records, count: records.length, limit });
  }
  if (['lookup-hash', 'hash', 'find-hash'].includes(action)) {
    const hash = normalizeHash(input.sha256 || input.hash || input.h || input.q); if (!validHash(hash)) return send(req, res, 400, { ok: false, verdict: 'BAD_HASH', level: 'bad', message: 'Provide a valid SHA-256 hash.' });
    const records = recordsByHash(registry, hash).filter(r => canReadRecord(r, admin, true)).map(r => publicRecord(r, { admin, includeHistory: false }));
    return send(req, res, 200, { ok: records.length > 0, verdict: records.length ? 'HASH_FOUND' : 'HASH_NOT_FOUND', level: records.length ? 'good' : 'warn', message: records.length ? 'Hash found.' : 'Hash not found.', sha256: hash, records, count: records.length });
  }
  if (['certificate', 'cert', 'export-certificate', 'printable-certificate', 'certificate-report'].includes(action)) {
    const id = cleanString(input.id || input.verifyId, 120).toUpperCase(); const record = findRecord(registry, id);
    if (!record || !canReadRecord(record, admin, true)) return send(req, res, 404, { ok: false, verdict: 'NOT_FOUND', level: 'warn', message: 'Verify ID not found.' });
    const signature = verifyRecordSignature(record); const trust = trustSummary(record, signature, input);
    return send(req, res, 200, { ok: signature.valid !== false, verdict: action.includes('printable') || action === 'certificate-report' ? 'PRINTABLE_CERTIFICATE' : 'CERTIFICATE', level: signature.valid === false ? 'bad' : 'good',
      message: 'Server-signed certificate loaded.', record: publicRecord(record, { admin, includeHistory: true }), certificate: signedCertificate(record, admin), signature, trust, registryIntegrity: sanitizeIntegrity(registryIntegrity(registry), admin) });
  }
  if (['badge', 'verify-badge'].includes(action)) {
    const result = evaluate(registry, input, admin); const id = cleanString(input.id || input.verifyId, 120).toUpperCase();
    const map = { GENUINE: ['verified', 'Verified', '#16a34a'], HASH_MATCH_SIZE_WARNING: ['verified-warning', 'Hash verified', '#f59e0b'], REGISTERED_NEEDS_FILE: ['registered', 'Registered', '#2563eb'],
      DRAFT_NOT_TRUSTED: ['draft', 'Draft', '#64748b'], REVOKED: ['revoked', 'Revoked', '#dc2626'], SUSPENDED: ['suspended', 'Suspended', '#ea580c'], EXPIRED: ['expired', 'Expired', '#9333ea'],
      FAKE_OR_MODIFIED: ['mismatch', 'Mismatch', '#dc2626'], REGISTRY_TAMPERED: ['tampered', 'Tampered', '#991b1b'], UNKNOWN: ['unknown', 'Unknown', '#64748b'] };
    const [badgeStatus, label, color] = map[result.verdict] || ['unknown', result.verdict || 'Unknown', '#64748b']; const verifyUrl = id ? (baseUrl(req, result.record || {}) || '.') + '/verify.html?id=' + encodeURIComponent(id) : '';
    const badgeHtml = id ? `<a href="${verifyUrl}" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;background:${color};color:#fff;text-decoration:none;font:700 12px system-ui">🛡️ PDF Fusion ${label}</a>` : '';
    return send(req, res, result.verdict === 'UNKNOWN' ? 404 : 200, { ok: result.ok || result.verdict === 'REGISTERED_NEEDS_FILE', verdict: 'BADGE', level: result.level, message: 'Public verification badge generated.', id, badgeStatus, label, color, verifyUrl, badgeHtml, sourceVerdict: result.verdict, trustScore: result.trustScore, trustLevel: result.trustLevel });
  }
  if (['batch-verify', 'batch', 'verify-batch'].includes(action)) {
    const items = Array.isArray(input.items) ? input.items.slice(0, MAX_BATCH) : []; const results = items.map((item, index) => ({ index, ...evaluate(registry, typeof item === 'string' ? { id: item } : item || {}, admin) }));
    const good = results.filter(r => r.ok).length; return send(req, res, 200, { ok: true, verdict: 'BATCH_VERIFIED', level: good === results.length ? 'good' : 'warn', message: `Batch verify completed: ${good}/${results.length}.`, results, count: results.length, maxBatch: MAX_BATCH });
  }
  if (['list', 'records', 'search'].includes(action)) {
    if (!admin) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Admin authorization required.' });
    const q = cleanString(input.query || input.q, 160).toUpperCase(); const status = lower(input.status, 40); const limit = Math.min(Number(input.limit || MAX_PUBLIC_RECORDS) || MAX_PUBLIC_RECORDS, MAX_PUBLIC_RECORDS);
    const records = registry.records.filter(r => (!status || r.status === status) && (!q || stableStringify(r).toUpperCase().includes(q))).slice(0, limit).map(r => publicRecord(r, { admin: true, includeHistory: true }));
    return send(req, res, 200, { ok: true, verdict: 'LIST', level: 'good', message: 'Registry records loaded.', records, count: records.length, total: registry.records.length, registryRevision: registry.registryRevision });
  }
  if (['audit', 'audit-log'].includes(action)) {
    if (!admin) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Admin authorization required.' });
    const limit = Math.min(Number(input.limit || 150) || 150, 1000); const filter = lower(input.filterAction || input.actionFilter, 80); let rows = registry.auditLog || []; if (filter) rows = rows.filter(x => lower(x.action, 80) === filter);
    return send(req, res, 200, { ok: true, verdict: 'AUDIT', level: 'good', message: 'Audit log loaded.', auditLog: rows.slice(0, limit), count: rows.length });
  }
  if (['backup', 'snapshot', 'export'].includes(action)) {
    if (!admin) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Admin authorization required.' });
    return send(req, res, 200, { ok: true, verdict: 'BACKUP_READY', level: 'good', message: 'Registry backup JSON is ready.', registry, registryIntegrity: registryIntegrity(registry) });
  }
  if (action === 'analytics') {
    if (!admin) return send(req, res, 401, { ok: false, verdict: 'UNAUTHORIZED', level: 'bad', message: 'Admin authorization required.' });
    return send(req, res, 200, { ok: true, verdict: 'ANALYTICS', level: 'good', message: 'Enterprise analytics loaded.', analytics: analyticsSummary(registry), registryIntegrity: registryIntegrity(registry) });
  }
  const result = evaluate(registry, input, admin); return send(req, res, result.verdict === 'UNKNOWN' ? 404 : 200, { checkedAt: nowIso(), registryRevision: registry.registryRevision, registryIntegrity: sanitizeIntegrity(registryIntegrity(registry), admin), ...result });
}
async function dispatchPost(req, res, body) {
  const action = lower(body.action || 'register', 60);
  const isAutoRegister = ['auto-register', 'autoregister'].includes(action);
  if (MUTATING_ACTIONS.has(action) && !isAutoRegister && !applyRateLimit(req, res, 'admin')) return;
  if ((!MUTATING_ACTIONS.has(action) || isAutoRegister) && !applyRateLimit(req, res, 'public')) return;
  if (['auto-register', 'autoregister'].includes(action)) return handleRegister(req, res, body, 'auto');
  if (action === 'register') return handleRegister(req, res, body, 'manual');
  if (['bulk-register', 'register-bulk'].includes(action)) return handleBulkRegister(req, res, body);
  if (['revoke', 'restore', 'suspend', 'hold', 'activate', 'unsuspend', 'archive', 'unarchive'].includes(action)) return handleTransition(req, res, body, action);
  if (['expiry', 'update-expiry', 'set-expiry', 'clear-expiry'].includes(action)) return handleExpiry(req, res, body);
  if (['update-note', 'note', 'metadata'].includes(action)) return handleMetadata(req, res, body);
  if (['repair', 'resign', 'migrate'].includes(action)) return handleRepair(req, res, { ...body, resign: action === 'resign' ? true : body.resign });
  if (['bulk-action', 'bulk-status'].includes(action)) return handleBulkAction(req, res, body);
  if (['generate-id', 'new-id'].includes(action)) return send(req, res, 200, { ok: true, verdict: 'GENERATED_ID', level: 'good', id: generateVerifyId(), time: nowIso() });
  return handleRead(req, res, action, body, body);
}
async function handler(req, res) {
  ensureRequestId(req);
  if (req.method === 'OPTIONS') return send(req, res, 200, { ok: true, verdict: 'OPTIONS' });
  try {
    if (req.method === 'GET') {
      if (!applyRateLimit(req, res, 'public')) return;
      const url = new URL(req.url, 'https://local.local'); const params = Object.fromEntries(url.searchParams.entries()); const action = lower(params.action || (url.searchParams.get('health') ? 'health' : ''), 60);
      return handleRead(req, res, action || 'check', params, params);
    }
    if (req.method === 'POST') {
      const contentType = lower(req.headers && req.headers['content-type'], 100);
      if (contentType && !contentType.includes('application/json')) return send(req, res, 415, { ok: false, verdict: 'UNSUPPORTED_MEDIA_TYPE', level: 'bad', message: 'Use application/json.' });
      const body = await readJsonBody(req); return dispatchPost(req, res, body);
    }
    return send(req, res, 405, { ok: false, verdict: 'METHOD_NOT_ALLOWED', level: 'bad', message: 'Use GET, POST or OPTIONS.' });
  } catch (error) {
    if (error.code === 'BODY_TOO_LARGE') return send(req, res, 413, { ok: false, verdict: 'BODY_TOO_LARGE', level: 'bad', message: error.message });
    if (error.code === 'BAD_JSON') return send(req, res, 400, { ok: false, verdict: 'BAD_JSON', level: 'bad', message: error.message });
    if (['PRIMARY_STORAGE_UNAVAILABLE', 'STORAGE_CONFIG_ERROR'].includes(error.code)) return send(req, res, 503, { ok: false, verdict: error.code, level: 'bad', message: error.message });
    return send(req, res, 500, { ok: false, verdict: 'SERVER_ERROR', level: 'bad', message: error.message || String(error) });
  }
}

handler._internals = { normalizeRecord, normalizeRegistry, registryIntegrity, transition, evaluate, signRecord, verifyRecordSignature, recordFromInput, validateRecord,
  publicRecord, publicUserInfo, canReadRecord, checkConcurrency, prepareRegistryForWrite, BUSINESS_POLICY_VERSION, API_VERSION, SIGNATURE_VERSION, emptyRegistry };
module.exports = handler;
