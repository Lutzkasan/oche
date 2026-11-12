// Service Worker: hält die App offline verfügbar.
// VERSION und FILES setzt tools/build.mjs beim Deploy aus Inhalt und Verzeichnis. Nicht von Hand pflegen.
// Die Werte hier gelten nur, wenn die Seite ungebaut lokal läuft. Ungebaut kann FILES unvollständig sein.
const VERSION = 'oche-dev';
const FILES = [
  './', './index.html', './app.css', './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
