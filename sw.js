/* Venus Card System Service Worker
   每次改版：把下面 CACHE_VERSION 升號，
   瀏覽器才會偵測到 sw.js 有變、觸發更新。
   策略：
   - 更新先等待使用者按「立即更新」，避免操作途中突然重載
   - activate 只清除此 App 的舊快取 + clients.claim（不影響同網域其他 App）
   - HTML/導覽走「網路優先」→ 線上永遠拿到最新 index.html，離線才回快取
   - 其他同源資源走「快取優先、背景更新」
   - 跨來源請求（Firebase / gstatic 等）完全不攔截
*/
const CACHE_VERSION = 'vcard-v2.5.0';
const CACHE_NAME = CACHE_VERSION;
const OWNED_CACHE_PREFIXES = ['vcard-', 'venus-card-'];
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  // 立即接管，新版不必等舊分頁全部關閉；配合頁面 controllerchange→reload，
  // 部署後開一次就會自動刷新到新版，不必手動重開兩次。
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
    await Promise.all(keys.filter((k) => k !== CACHE_NAME && OWNED_CACHE_PREFIXES.some((p) => k.startsWith(p))).map((k) => caches.delete(k)));
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
        const freshReq = new Request(req, { cache: 'no-store' });
        const res = await fetch(freshReq);
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
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
    }).catch(() => null);
    return cached || (await net) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
