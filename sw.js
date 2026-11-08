/* 先完整下載同一版，再由使用者選擇套用更新。 */
const BUILD = '20261108-1642';
const CACHE = 'expanal-' + BUILD;
const ASSETS = ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const scope = self.registration.scope;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(new URL(path, scope), {cache:'reload'})));
    const html = await cache.match(new URL('./index.html', scope));
    if (!(await html.text()).includes("window.__BUILD='" + BUILD + "'")) {
      throw new Error('版本尚未同步');
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('expanal-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || !url.href.startsWith(scope)) return;
  const path = url.pathname.slice(new URL(scope).pathname.length);
  const asset = (path === '' || path === 'index.html') ? './index.html' : './' + path;
  if (!ASSETS.includes(asset)) return;
  event.respondWith(caches.open(CACHE).then(cache =>
    cache.match(new URL(asset, scope)).then(hit => hit || fetch(req))));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
