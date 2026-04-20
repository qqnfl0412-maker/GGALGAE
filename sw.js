const CACHE_NAME = "badminton-bracket-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/common.css",
  "./css/scoreboard.css",
  "./js/app-config.js",
  "./js/supabase-config.js",
  "./js/app.js",
  "./js/scoreboard.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isAsset = ASSETS.some(a => url.pathname.endsWith(a.replace("./", "")));

  if (isAsset) {
    // JS/CSS는 네트워크 우선 → 실패 시 캐시
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // 나머지는 캐시 우선
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
