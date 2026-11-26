// Network-first, bypassing the browser HTTP cache so updates show immediately;
// the cache is only used offline. Old caches are removed on activate.
const C = 'sanzo-v20';
const F = ['./', 'index.html', 'style.css', 'app.js', 'colors.json', 'manifest.json', 'store.js', 'ratio.js', 'icon-192.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(F))); });
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
