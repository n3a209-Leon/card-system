// Moko OS Service Worker v2
// 重點修正：
// 1) 容錯式預快取——逐一快取，單一檔案缺失不會導致整批安裝失敗。
// 2) 只處理「同源」的 GET 靜態檔案，Firebase / Google 登入 / API 一律不快取，
//    避免個人化或授權回應被錯誤快取造成資料錯亂。
const CACHE = 'moko-ledger-v2';
const ASSETS = ['./', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png', './splash.jpeg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // 逐一加入，任何一個失敗只記 log，不讓整個 install reject。
      Promise.all(ASSETS.map((url) =>
        c.add(url).catch((err) => console.warn('SW precache skip:', url, err))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只處理跟本站同源的請求；跨源（Firebase、gstatic、googleapis 等）直接放行，不快取。
  if (url.origin !== self.location.origin) return;

  // 只快取靜態檔案類型；其餘（動態、查詢字串）走網路優先、不寫入快取。
  const isStatic = /\.(html|js|css|json|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)
    || url.pathname === '/' || url.pathname.endsWith('/');

  if (!isStatic) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // 只快取正常的、同源的、基本型別回應。
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
