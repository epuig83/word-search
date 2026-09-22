importScripts("./offline-manifest.js");

const { revision, assets } = self.WORD_SEARCH_OFFLINE;
const scope = new URL(self.registration.scope);
const CACHE_PREFIX = `word-search-shell-${encodeURIComponent(scope.pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${revision}`;
const ASSETS = new Map(assets.map(asset => [new URL(asset.url, scope).href, asset]));

// Read only: report the installed revision's own files, never another app's cache
// or network availability. Legacy workers simply won't answer this protocol.
self.addEventListener("message", event => {
  if (event.data?.type !== "OFFLINE_STATUS" || !event.ports[0]) return;
  event.waitUntil((async () => {
    let complete = false;
    try {
      if (await caches.has(CACHE_NAME)) {
        const cache = await caches.open(CACHE_NAME);
        const keys = new Set((await cache.keys()).map(request => request.url));
        complete = [...ASSETS.keys()].every(url => keys.has(url));
      }
    } catch { /* A denied or evicted cache is not confirmed ready. */ }
    event.ports[0].postMessage({ revision, complete });
  })());
});

async function fetchVerified(asset) {
  // Fetch verifies the body against the manifest before returning it. A partially
  // deployed release or a stale CDN response cannot enter this revision's cache.
  const response = await fetch(new Request(new URL(asset.url, scope), {
    cache: "reload",
    integrity: asset.integrity,
  }));
  if (!response.ok || response.type !== "basic") throw new Error(`Offline asset unavailable: ${asset.url}`);
  return response;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const downloads = await Promise.allSettled(assets.map(async asset => {
      const response = await fetchVerified(asset);
      await cache.put(new URL(asset.url, scope), response);
    }));
    const failed = downloads.find(result => result.status === "rejected");
    if (failed) {
      // Wait for all writes before removing the candidate, so a late download
      // cannot recreate a partial cache after installation has failed.
      await caches.delete(CACHE_NAME);
      throw failed.reason;
    }
    // Wait for all old tabs to close. Never replace their worker mid-activity.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME && (
      key.startsWith(CACHE_PREFIX) || /^word-search-v\d+$/.test(key)
    )).map(key => caches.delete(key)));
    // Do not claim an already loaded page: its HTML may belong to another release.
  })());
});

async function serveAsset(asset) {
  const cache = await caches.open(CACHE_NAME);
  const key = new URL(asset.url, scope);
  const cached = await cache.match(key);
  if (cached) return cached;
  // Recover an evicted entry only if the network still has this exact revision.
  const response = await fetchVerified(asset);
  await cache.put(key, response.clone());
  return response;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin) return;
  url.search = "";
  url.hash = "";
  if (url.pathname === scope.pathname) url.pathname += "index.html";
  const asset = ASSETS.get(url.href);
  // Only known application files are handled. Crawler files and other apps on
  // the same origin use the network and never become cached HTML fallbacks.
  if (asset) event.respondWith(serveAsset(asset));
});
