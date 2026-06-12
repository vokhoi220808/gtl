const VERSION = '4.0.0-plus';
const CACHE_NAME = `pdf-fusion-${VERSION}`;
const APP_SHELL = [
  './',
  './pdf-fusion-smart-pro-universal-pro-suite-plus.html',
  './pdf-fusion-manifest.json',
  './icon-192.svg',
  'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://unpkg.com/mammoth/mammoth.browser.min.js',
  'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async url => {
      try { await cache.add(url); } catch (err) { console.warn('Cache skipped:', url, err); }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./pdf-fusion-smart-pro-universal-pro-suite-plus.html')));
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
      }
      return response;
    } catch (err) {
      return new Response('Offline and resource is not cached.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
  })());
});
