/* J.A.R.V.I.S. service worker — installable app shell.
   Same-origin assets: stale-while-revalidate (fast loads, silent updates).
   Pinned CDN libs (three.js, MediaPipe): cache-first (immutable versions).
   API calls (weather, quotes, news): never cached here — always network. */
const CACHE = 'jarvis-v4';
const CORE = [
  './', './index.html', './css/base.css', './css/gestures.css', './css/premium.css',
  './js/main.js', './js/store.js', './js/demo-data.js', './js/api.js', './js/ui.js',
  './js/reactor.js', './js/background.js', './js/gestures.js', './js/gesture-core.js', './js/voice.js', './js/premium.js',
  './js/widgets/today.js', './js/widgets/tasks.js', './js/widgets/gym.js',
  './js/widgets/calendar.js', './js/widgets/news.js', './js/widgets/markets.js',
  './js/widgets/settings.js', './js/widgets/fitness.js',
  './manifest.webmanifest', './icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // stale-while-revalidate: serve cache, refresh in the background
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // pinned versions are immutable — cache-first
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
  }
  // everything else (live APIs, fonts): straight to network
});
