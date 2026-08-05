#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
let failed = false;
const log = (ok, message) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + message);
  if (!ok) failed = true;
};
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

const appVersion = read('VERSION.txt').trim();
const packageVersion = JSON.parse(read('package.json')).version;
const sw = read('sw.js');
const alias = read('pdf-fusion-sw.js');

log(appVersion === packageVersion, 'VERSION.txt matches package.json');
log(sw === alias, 'service worker aliases are synchronized');
log(sw.includes(`const VERSION = '${appVersion}'`), 'service worker cache version matches app version');
log(sw.includes(`pfsp-watermark-placement-fix.js?v=${appVersion}`), 'watermark hotfix is pre-cached');
log(sw.includes('offlineAssetResponse()'), 'non-navigation requests use a non-HTML offline response');
log(sw.includes("(await caches.match(request))\n      || (await caches.match('./index.html'))"), 'navigation fallback prefers the requested cached page');

const shellPattern = /['"](\.\/[^'"\n]+)['"]/g;
let match;
while ((match = shellPattern.exec(sw))) {
  const clean = match[1].split('?')[0].split('#')[0];
  const local = clean === './' ? 'index.html' : clean.replace(/^\.\//, '');
  log(exists(local), `service worker shell file exists: ${match[1]}`);
}

if (failed) process.exit(1);
console.log('\nPWA integrity check passed.');
