const VERSION = '6.1.0-qr-verify-fix';
const CACHE_NAME = `pdf-fusion-${VERSION}`;
const OFFLINE_URL = './offline.html';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './site.webmanifest',
  './favicon.svg',
  './icon-192.svg',
  './icon-512.svg',
  './offline.html',
  './verify.html',
  './404.html',
  './assets/pfsp-upgrade.css',
  './assets/pfsp-enhancements.js',
  './assets/pfsp-pro-ui.css',
  './assets/pfsp-compress-seo.js',
  './compress-pdf.html',
  './merge-pdf.html',
  './split-pdf.html',
  './watermark-pdf.html',
  './sign-pdf.html',
  './ocr-pdf.html',
  './privacy-center.html',
  './en.html',
  './assets/pfsp-advanced-suite.css',
  './assets/pfsp-local-analytics-i18n.js',
  './assets/pfsp-advanced-suite.js',
  './assets/pfsp-worker.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  './bao-mat.html',
  './dieu-khoan.html',
  './faq.html',
  './huong-dan-su-dung.html',
  './luu-y.html',
  './mien-tru-trach-nhiem.html',
  './pdf-fusion-smart-pro-universal-pro-suite-plus.html',
  './pdf-fusion-manifest.json',
  'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://unpkg.com/mammoth/mammoth.browser.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async url => {
      try { await cache.add(url); }
      catch (err) { console.warn('[PFSP] cache skipped:', url, err); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pdf-fusion-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PFSP_SKIP_WAITING') self.skipWaiting();
});

function shouldCache(request, response) {
  if (!response || !response.ok) return false;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return request.method === 'GET';
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (shouldCache(request, response)) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => null);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (shouldCache(request, response)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => null);
    }
    return response;
  } catch (err) {
    return (await caches.match(request)) || (await caches.match('./index.html')) || (await caches.match(OFFLINE_URL));
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request).catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)) || new Response('Offline.', {status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'}})));
    return;
  }
  event.respondWith(cacheFirst(request).catch(async () => (await caches.match(request)) || new Response('Offline and resource is not cached.', {status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'}})));
});
