// CACHE_NAME bump forces a full cache drop on activation. With the
// stale-while-revalidate strategy below, individual asset updates converge
// without a bump; only bump when changing cache semantics or removing files
// from APP_SHELL that must no longer be served.
const CACHE_NAME = "word-search-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=3",
  "./data.js",
  "./i18n.js?v=3",
  "./core.js",
  "./app-helpers.js",
  "./app-storage.js",
  "./app-modal.js",
  "./app-board.js?v=3",
  "./app-teacher.js",
  "./app-session.js",
  "./app.js",
  "./vendor/canvas-confetti.browser.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png",
  "./og-image.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Crawler files must resolve to the real file, never the SPA shell.
  const isCrawlerFile = url.pathname.endsWith("/robots.txt") || url.pathname.endsWith("/sitemap.xml");

  const isNavigation = !isCrawlerFile && (request.mode === "navigate" ||
    (request.destination === "document") ||
    request.headers.get("accept")?.includes("text/html"));

  if (isNavigation) {
    // Every navigation resolves to the same SPA shell, so cache under a single
    // canonical key. Otherwise each shared ?p=<puzzle> link would spawn its own
    // cache entry and grow the store without bound.
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const networkPromise = fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
        return response;
      }).catch(() => cached);
      return cached || networkPromise;
    })
  );
});
