/* Officina Documenti mobile: service worker.
   Memorizza l'app sul telefono al primo avvio; poi funziona anche senza rete.
   Non vede né riceve i file dell'utente: gestisce solo i file dell'app stessa. */
const VERSION = '1.0.5306ed3';
const CACHE = 'officina-' + VERSION;
const FILES = [
  "./",
  "index.html",
  "config.js",
  "app.css",
  "app.js",
  "core.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "libs/jszip.min.js",
  "libs/pdf-lib.min.js",
  "libs/pdf.min.js",
  "libs/pdf.worker.min.js",
  "manifest.webmanifest"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('officina-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // nessuna risorsa esterna
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      const hit = await cache.match('./index.html');
      if (hit) return hit;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  })());
});
self.addEventListener('message', (e) => {
  if (e.data === 'version') e.source && e.source.postMessage({ version: VERSION });
});
