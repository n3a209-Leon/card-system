/* Venus Card System Service Worker
   每次改版：把下面 CACHE_VERSION 升號（例 v2.1.2 → v2.1.3），
   瀏覽器才會偵測到 sw.js 有變、觸發更新。
   策略：
   - install 立即 skipWaiting（新版不必等舊分頁關閉就接管）
   - activate 清掉所有舊快取 + clients.claim（立刻控制頁面）
   - HTML/導覽走「網路優先」→ 線上永遠拿到最新 index.html，離線才回快取
   - 其他同源資源走「快取優先、背景更新」
   - 跨來源請求（Firebase / gstatic 等）完全不攔截
*/
const CACHE_VERSION = 'vcard-v2.1.2';
const CACHE_NAME = CACHE_VERSION;
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  // 立即接管，避免「要開兩次才更新」
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_NAME);
    // 逐一加入，單一檔案缺失不會讓整批失敗
    for (const u of CORE) {
      try { await c.add(new Request(u, { cache: 'reload' })); } catch (_) {}
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// index.html 的「立即更新」按鈕會送這個訊息
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // 跨來源（Firebase、gstatic、CDN 等）一律不攔截，交給瀏覽器原生處理
  if (url.origin !== self.location.origin) return;

  const isNav =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html');

  if (isNav) {
    // 網路優先：線上永遠拿最新 index.html；離線才回快取
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      } catch (_) {
        const cached = await caches.match(req);
        return cached || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // 其他同源資源：快取優先，背景補抓更新
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => cached);
    return cached || net;
  })());
});
