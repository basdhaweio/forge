/* Forge service worker: app shell cached, program JSON network-first. */
const VERSION = 'forge-v4';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/ui.js', './js/store.js', './js/data.js', './js/game.js', './js/timer.js', './js/player.js',
  './js/today.js', './js/train.js', './js/fuel.js', './js/body.js', './js/hero.js', './js/settings.js', './js/sync.js', './js/app.js',
  './data/exercises.json', './data/program.json',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' bypasses the HTTP cache so a new worker never installs stale files.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'clear-cache') caches.delete(VERSION);
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts etc: let the browser handle them

  if (url.pathname.includes('/data/')) {
    // Program content: network first so edits show up, cache as the offline fallback.
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Shell: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
