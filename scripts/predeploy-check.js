#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const root = process.cwd();
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8').trim();
const files = ['api/verify.js','api/verify-v14-legacy.js','tests/verify-business-integrity.test.js','verify.html','admin-verify.html','verify-registry.html','trust-portal.html','verify-certificate.html','assets/pfsp-verify-final.css','assets/pfsp-verify-asset-guard.js','assets/pfsp-verify-asset-guard-v14.js','assets/pfsp-verify-business-ui.js','assets/pfsp-verify-layout.js','assets/pfsp-verify-layout.css','data/verify-registry.json','sw.js','pdf-fusion-sw.js','vercel.json'];
let failed = false;
const log = (ok,msg) => { console.log((ok?'PASS ':'FAIL ')+msg); if(!ok) failed=true; };
for (const file of files) log(fs.existsSync(path.join(root,file)), 'required file: '+file);
for (const file of ['api/verify.js','api/verify-v14-legacy.js',...fs.readdirSync(path.join(root,'assets')).filter(x=>x.endsWith('.js')).map(x=>'assets/'+x)]) {
  try { childProcess.execFileSync(process.execPath,['--check',file],{cwd:root,stdio:'pipe'}); log(true,'syntax: '+file); }
  catch (err) { log(false,'syntax: '+file+'\n'+String(err.stderr||err.message)); }
}
const api=fs.readFileSync(path.join(root,'api/verify.js'),'utf8');
log(api.includes(`const API_VERSION = '${version}'`),'API version matches VERSION.txt');
for(const marker of ['PFSP-VERIFY-REGISTRY-v6','PFSP-BUSINESS-POLICY-v1','REVISION_CONFLICT','INVALID_STATE_TRANSITION','AUTO_REGISTER_PII_BLOCKED']) log(api.includes(marker),'API control: '+marker);
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
log(pkg.version===version,'package version matches');
log(String(pkg.scripts.test).includes('test:verify-business'),'npm test includes business suite');
log(String(pkg.scripts['check:portal']).includes('pfsp-verify-layout.js'),'layout script has explicit syntax check');
const guard=fs.readFileSync(path.join(root,'assets/pfsp-verify-asset-guard.js'),'utf8');
log(guard.includes("load('pfsp-verify-layout.js'"),'asset guard loads organized layout');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const alias=fs.readFileSync(path.join(root,'pdf-fusion-sw.js'),'utf8');
log(sw===alias,'service worker aliases match');
log(sw.includes(`const VERSION = '${version}'`),'service worker version matches');
for(const asset of ['pfsp-verify-business-ui.js','pfsp-verify-asset-guard-v14.js','pfsp-verify-layout.js','pfsp-verify-layout.css']) log(sw.includes(asset),'service worker caches '+asset);
if(failed){console.error('\nPredeploy check failed.');process.exit(1);} console.log('\nPredeploy check passed.');
