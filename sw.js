// Venus Card System PWA — v2.2.0
// 導覽頁採 Network First，確保部署後能立即拿到新版；離線時回退快取。
const CACHE='venus-card-v2.2.0';
const APP_SHELL=['./','./index.html'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('venus-card-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function cacheable(response){
  return response&&(response.ok||response.type==='opaque');
}

async function networkFirst(request,fallbackUrl){
  try{
    const response=await fetch(request);
    if(cacheable(response)){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  }catch{
    return (await caches.match(request))||
      (fallbackUrl?await caches.match(fallbackUrl):null)||
      new Response('Offline',{status:503,statusText:'Offline'});
  }
}

async function staleWhileRevalidate(request){
  const cached=await caches.match(request);
  const update=fetch(request).then(async response=>{
    if(cacheable(response)){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  }).catch(()=>null);
  return cached||(await update)||new Response('Offline',{status:503,statusText:'Offline'});
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  if(request.cache==='only-if-cached'&&request.mode!=='same-origin')return;

  const url=new URL(request.url);
  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,'./index.html'));
    return;
  }

  // Firebase、Google API 與試算表資料必須保持最新，不使用舊快取。
  if(/(^|\.)firebase(app)?\.com$/.test(url.hostname)||
     url.hostname.includes('firestore.googleapis.com')||
     url.hostname.includes('googleapis.com')||
     url.hostname.includes('docs.google.com')){
    event.respondWith(networkFirst(request));
    return;
  }

  // 圖示、啟動畫面、字型與程式庫：立即顯示快取，同時背景更新。
  event.respondWith(staleWhileRevalidate(request));
});
