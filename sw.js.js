const CACHE_NAME = 'pdf-fusion-pro-suite-v3';
const ASSETS = [
  './pdf-fusion-smart-pro-universal-pro-suite.html',
  './pdf-fusion-manifest.json',
  'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js',
  'https://unpkg.com/@pdf-lib/fontkit/dist/fontkit.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://unpkg.com/mammoth/mammoth.browser.min.js',
  'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => null)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
    const copy = resp.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
    return resp;
  }).catch(() => cached)));
});
