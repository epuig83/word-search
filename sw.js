// CACHE_NAME bump forces a full cache drop on activation. With the
// stale-while-revalidate strategy below, individual asset updates converge
// without a bump; only bump when changing cache semantics or removing files
// from APP_SHELL that must no longer be served.
const CACHE_NAME = "word-search-v4";
const NAVIGATION_TIMEOUT_MS = 2500;
const APP_SHELL = [
  "./",
  "./index.html",
  "./es.html",
  "./en.html",
  "./styles.css",
  "./font-init.js",
  "./assets/fonts/andika-regular-latin.woff2",
  "./assets/fonts/andika-bold-latin.woff2",
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
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png",
  "./og-image.png",
];

function navigationShellKey(url) {
  if (url.pathname.endsWith("/es.html")) return "./es.html";
  if (url.pathname.endsWith("/en.html")) return "./en.html";
  return "./index.html";
}

async function fetchNavigationWithTimeout(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleNavigation(request, url) {
  const cache = await caches.open(CACHE_NAME);
  const shellKey = navigationShellKey(url);
  const cachedShell = await cache.match(shellKey);

  try {
    const response = await fetchNavigationWithTimeout(request);
    if (response?.ok && response.type === "basic") {
      await cache.put(shellKey, response.clone());
    }
    return response;
  } catch {
    return cachedShell || cache.match("./index.html");
  }
}

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
    // Query strings and hashes (including ?p=<shared puzzle>) resolve to one of
    // three localized shell keys. This keeps cache growth bounded and preserves
    // the requested language when the network is offline or stalls.
    event.respondWith(handleNavigation(request, url));
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
