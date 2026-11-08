/* 消費統計 — 離線快取
   BUILD 由 build.py 每次組建自動改寫，快取名稱跟著換，舊快取在 activate 時清掉。
   HTML 走網路優先：有網一定拿到新版，沒網才回快取。圖示與 manifest 走快取優先。 */
const BUILD = '20261108-1245';
const CACHE = 'expanal-' + BUILD;
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u =>
        fetch(u, { cache: 'reload' }).then(r => c.put(u, r)).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isDocument(req) {
  return req.mode === 'navigate' ||
         (req.destination === 'document') ||
         /\.(html|webmanifest)(\?|$)/.test(new URL(req.url).pathname + new URL(req.url).search);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (isDocument(e.request)) {
    // 網路優先：拿得到就更新快取，拿不到（離線）才回快取
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // 其餘（圖示等）快取優先，背景補快取
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

