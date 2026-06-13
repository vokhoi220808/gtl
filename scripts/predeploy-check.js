#!/usr/bin/env node
/* PDF Fusion Verify predeploy check v14 */
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = process.cwd();
const requiredFiles = [
  'api/verify.js',
  'verify.html',
  'admin-verify.html',
  'verify-registry.html',
  'trust-portal.html',
  'verify-certificate.html',
  'assets/pfsp-verify-final.css',
  'assets/pfsp-verify-asset-guard.js',
  'assets/pfsp-trust-portal.js',
  'assets/pfsp-trust-certificate.js',
  'data/verify-registry.json',
  'sw.js',
  'vercel.json'
];
let failed = false;
function log(ok, msg){ console.log((ok ? 'PASS ' : 'FAIL ') + msg); if(!ok) failed = true; }
for (const file of requiredFiles) log(fs.existsSync(path.join(root, file)), 'required file: ' + file);
for (const file of ['api/verify.js', ...fs.readdirSync(path.join(root, 'assets')).filter(x => x.endsWith('.js')).map(x => 'assets/' + x)]) {
  try { childProcess.execFileSync(process.execPath, ['--check', file], {cwd: root, stdio: 'pipe'}); log(true, 'syntax: ' + file); }
  catch (err) { log(false, 'syntax: ' + file + '\n' + (err.stderr || err.message)); }
}
const htmlFiles = ['verify.html','admin-verify.html','verify-registry.html','trust-portal.html','verify-certificate.html'];
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  log(html.includes('pfsp-verify-final.css?v=14.4.0-enterprise-trust-suite'), file + ' cache-busted CSS');
  log(html.includes('pfsp-verify-asset-guard.js?v=14.4.0-enterprise-trust-suite'), file + ' asset guard');
}
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
for (const asset of ['trust-portal.html','verify-certificate.html','pfsp-trust-portal.js?v=14.4.0-enterprise-trust-suite','pfsp-trust-certificate.js?v=14.4.0-enterprise-trust-suite']) log(sw.includes(asset), 'service worker caches ' + asset);
try {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'data/verify-registry.json'), 'utf8'));
  log(Array.isArray(registry.records), 'registry.records is array');
  log(registry.version && String(registry.version).includes('PFSP-VERIFY-REGISTRY'), 'registry version present');
} catch (err) { log(false, 'registry JSON valid: ' + err.message); }
if (failed) { console.error('\nPredeploy check failed.'); process.exit(1); }
console.log('\nPredeploy check passed.');
