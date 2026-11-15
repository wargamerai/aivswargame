const CACHE='nobunaga1570-v28';
const FILES=['./','./index.html','./style.css?v=28','./app.js?v=28','./game-data.js','./territory-data.js','./assets/maps/white-map.png','./assets/maps/map-details.png','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("nobunaga1570-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      // オンラインでは最新の開始画面を開き、オフラインでは保存した画面で起動する。
      try {
        return await fetch(request, { cache: 'no-cache' });
      } catch {
        return (await cache.match(request)) || (await cache.match('./index.html'));
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});
