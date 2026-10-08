// Офлайн-кэш. При обновлении файлов поменяй VERSION.
const VERSION = 'lad-v1';
const FILES = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/store.js', 'js/chords.js', 'js/parser.js',
  'js/diagrams.js', 'js/voice.js', 'js/demo-songs.js', 'manifest.webmanifest', 'icons/icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Сначала сеть (чтобы обновления приезжали сразу), без сети — кэш
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
