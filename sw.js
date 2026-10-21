/* Wochenplan – Offline-Speicher der App-Dateien.
   Bei einer neuen Version CACHE hochzählen und die ?v=-Nummern in index.html anpassen. */
const CACHE = 'wochenplan-v2';
const ASSETS = [
  './',
  'index.html',
  'app.css?v=1',
  'core.js?v=1',
  'app.js?v=2',
  'config.js?v=1',
  'vendor/msal-browser.min.js?v=4.30.0',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/barlow-latin-400-normal.woff2',
  'fonts/barlow-latin-500-normal.woff2',
  'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-latin-700-normal.woff2',
  'fonts/barlow-condensed-latin-500-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wochenplan-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Seite und config.js: erst Netz (max. 3 s), sonst gespeicherte Version.
function networkFirst(request, fallbackKey) {
  return caches.open(CACHE).then((cache) => {
    const fromNet = fetch(request).then((res) => {
      if (res && res.ok) cache.put(fallbackKey || request, res.clone());
      return res;
    });
    const fromCache = () => cache.match(fallbackKey || request, { ignoreSearch: !!fallbackKey });
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    return Promise.race([fromNet.catch(() => null), timeout]).then((res) => {
      if (res && res.ok) return res;
      return fromCache().then((cached) => cached || fromNet);
    });
  });
}

// Alles andere (versionierte Dateien, Schriften, Symbole): erst Speicher, sonst Netz.
function cacheFirst(request) {
  return caches.open(CACHE).then((cache) =>
    cache.match(request).then((cached) => cached || fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Microsoft-Anmeldung und OneDrive nie zwischenspeichern
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, 'index.html'));
  } else if (url.pathname.endsWith('/config.js')) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
