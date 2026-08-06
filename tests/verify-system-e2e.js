#!/usr/bin/env node
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.PFSP_VERIFY_SIGNING_SECRET = 'e2e-signing-secret';
process.env.PFSP_VERIFY_ADMIN_SECRET = 'e2e-admin-secret';
process.env.PFSP_ALLOW_LOCAL_REGISTRY_WRITE = 'true';
process.env.PFSP_VERIFY_ALLOWED_ORIGINS = 'https://example.test';
process.env.PFSP_PUBLIC_BASE_URL = 'https://example.test';
process.env.PFSP_VERIFY_PUBLIC_RATE_LIMIT = '10000';
process.env.PFSP_VERIFY_ADMIN_RATE_LIMIT = '10000';
const handler = require('../api/verify.js');
const file = path.join(process.cwd(), 'data', 'verify-registry.json');
const original = fs.readFileSync(file, 'utf8');
function call(method, url, body, headers = {}) {
  return new Promise(resolve => {
    const req = new EventEmitter();
    req.method = method; req.url = url;
    req.headers = { origin: 'https://example.test', 'user-agent': 'e2e', ...(body ? {'content-type':'application/json'} : {}), ...headers };
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = { headers:{}, setHeader(k,v){this.headers[k]=v;}, set statusCode(v){this._s=v;}, get statusCode(){return this._s||200;}, end(text){resolve({status:this.statusCode, body:JSON.parse(text||'{}')});} };
    handler(req,res);
    process.nextTick(() => { if (body) req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
  });
}
function ok(value, message, detail) { if (!value) throw new Error(message + '\n' + JSON.stringify(detail || {}, null, 2)); console.log('PASS:', message); }
(async () => {
  try {
    let r = await call('GET','/api/verify?action=health');
    ok(r.body.env.apiVersion === '15.0.0-business-integrity','health reports v15',r.body);
    r = await call('GET','/api/verify?action=generate-id'); const id = r.body.id; const hash = 'a'.repeat(64);
    r = await call('POST','/api/verify',{action:'register',id,sha256:hash,size:123,fileName:'e2e.pdf',documentInfo:{title:'E2E'},userInfo:{fullName:'Tester',email:'private@example.test'}},{'x-verify-admin-secret':'e2e-admin-secret','idempotency-key':'e2e-'+id});
    ok(r.body.verdict === 'REGISTERED','register works',r.body); const revision = r.body.record.revision;
    r = await call('GET',`/api/verify?id=${encodeURIComponent(id)}&sha256=${hash}&size=123`);
    ok(r.body.verdict === 'GENUINE','verify works',r.body); ok(!r.body.record.userInfo.email,'public PII is redacted',r.body.record);
    r = await call('POST','/api/verify',{action:'metadata',id,expectedRevision:revision,policy:{visibility:'private'}},{'x-verify-admin-secret':'e2e-admin-secret'});
    ok(r.body.verdict === 'METADATA_UPDATED','metadata concurrency works',r.body);
    r = await call('GET',`/api/verify?id=${encodeURIComponent(id)}&sha256=${hash}`);
    ok(r.status === 404 && r.body.verdict === 'UNKNOWN','private record is hidden',r.body);
  } finally { fs.writeFileSync(file, original, 'utf8'); }
})().catch(error => { fs.writeFileSync(file, original, 'utf8'); console.error(error.stack || error); process.exit(1); });
