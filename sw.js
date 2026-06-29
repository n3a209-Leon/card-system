// 獎卡系統 Service Worker
// HTML 永遠從網路取得最新版，CDN 資源才快取
const CACHE = 'vc-cdn-v1';

self.addEventListener('install', e => {
  // 立即接管，不等舊 SW 結束
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // 立即控制所有頁面
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // index.html 和同源頁面：永遠走網路，不快取
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // CDN 資源（Firebase、SheetJS、字體）：Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
