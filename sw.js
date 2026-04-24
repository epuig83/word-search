const CACHE_NAME = "word-search-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./i18n.js",
  "./core.js",
  "./app-helpers.js",
  "./app-storage.js",
  "./app-modal.js",
  "./app-board.js",
  "./app-teacher.js",
  "./app-session.js",
  "./app.js",
  "./vendor/canvas-confetti.browser.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./og-image.svg",
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

  const isNavigation = request.mode === "navigate" ||
    (request.destination === "document") ||
    request.headers.get("accept")?.includes("text/html");

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
        return response;
      }).catch(() => cached);
    })
  );
});
