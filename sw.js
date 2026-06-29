const CACHE = 'venus-card-v1';
const PRECACHE = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request).then(r => {
        const c = r.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, c));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(nr => {
      const c = nr.clone();
      caches.open(CACHE).then(cache => cache.put(e.request, c));
      return nr;
    }))
  );
});
