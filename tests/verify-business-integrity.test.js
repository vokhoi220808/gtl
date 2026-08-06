'use strict';
const assert = require('assert');
const crypto = require('crypto');
process.env.NODE_ENV = 'test';
process.env.PFSP_VERIFY_SIGNING_SECRET = 'business-test-secret';
const handler = require('../api/verify.js');
const api = handler._internals;

const hash = 'a'.repeat(64);
const base = api.normalizeRecord({
  id: 'PFSP-20260806-AAAAAA', sha256: hash, size: 123, fileName: 'business.pdf',
  status: 'draft', revision: 1, policy: { visibility: 'public-metadata' },
  userInfo: { fullName: 'Alice', email: 'alice@example.test', phone: '0900', identifier: 'PRIVATE-ID', address: 'Private address' }
});

let result = api.evaluate({ records: [base] }, { id: base.id, sha256: hash });
assert.equal(result.verdict, 'DRAFT_NOT_TRUSTED');
assert.equal(result.ok, false);

const redacted = api.publicRecord(base);
assert.equal(redacted.userInfo.fullName, 'Alice');
assert.equal(redacted.userInfo.email, undefined);
assert.equal(redacted.userInfo.phone, undefined);
assert.equal(redacted.userInfo.identifier, undefined);
assert.equal(redacted.userInfo.address, undefined);

const privateRecord = api.normalizeRecord({ ...base, status: 'active', policy: { visibility: 'private' } });
assert.equal(api.canReadRecord(privateRecord, false, true), false);
assert.equal(api.canReadRecord(privateRecord, true, true), true);

let transition = api.transition(base, 'activate', 'approved');
assert.equal(transition.ok, true);
assert.equal(base.status, 'active');
transition = api.transition(base, 'revoke', 'policy violation');
assert.equal(transition.ok, true);
assert.equal(base.status, 'revoked');
transition = api.transition(base, 'activate', 'bypass attempt');
assert.equal(transition.ok, false);
assert.equal(transition.verdict, 'INVALID_STATE_TRANSITION');
transition = api.transition(base, 'restore', 'reviewed');
assert.equal(transition.ok, true);
assert.equal(base.status, 'active');
assert.equal(base.revokeReason, '');

assert.equal(api.checkConcurrency(base, { expectedRevision: 999 }).verdict, 'STALE_RECORD');
assert.equal(api.checkConcurrency(base, { expectedRevision: base.revision }).ok, true);

const registry = api.normalizeRegistry({ records: [base] });
assert.equal(registry.schemaVersion, 6);
assert.equal(registry.version, 'PFSP-VERIFY-REGISTRY-v6');
const next = api.prepareRegistryForWrite(registry, 7);
assert.equal(next.registryRevision, 8);

const hmacSigned = { ...base, status: 'active', revision: 2 };
const signed = api.signRecord(hmacSigned);
hmacSigned.serverSignature = signed.signature;
hmacSigned.signatureVersion = signed.version;
hmacSigned.signatureAlgorithm = signed.algorithm;
hmacSigned.keyId = signed.keyId;
assert.equal(api.verifyRecordSignature(hmacSigned).valid, true);

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.PFSP_VERIFY_SIGNING_SECRET = '';
process.env.PFSP_VERIFY_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.PFSP_VERIFY_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
process.env.PFSP_VERIFY_KEY_ID = 'rsa-business-test';
process.env.PFSP_VERIFY_KEY_ALGORITHM = 'RSA-SHA256';
const rsaRecord = api.normalizeRecord({ ...base, id: 'PFSP-20260806-RSAAAA', status: 'active', revision: 3 });
const rsa = api.signRecord(rsaRecord);
rsaRecord.serverSignature = rsa.signature;
rsaRecord.signatureVersion = rsa.version;
rsaRecord.signatureAlgorithm = rsa.algorithm;
rsaRecord.keyId = rsa.keyId;
assert.ok(rsaRecord.serverSignature.length > 160, 'RSA signature must not be truncated');
assert.equal(api.verifyRecordSignature(rsaRecord).valid, true);
const unknownKey = api.verifyRecordSignature({ ...rsaRecord, keyId: 'unknown-key' });
assert.equal(unknownKey.valid, null);
assert.equal(unknownKey.reason, 'key-id-not-configured');

console.log('PASS Verify v15 business integrity tests');
