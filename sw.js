const CACHE = 'blazing-shell-v4';
const BASE = new URL('./', self.location.href).pathname;
const SHELL = [
  'index.html',
  'village.html',
  'battle.html',
  'characters.html',
  'summon.html',
  'fusion.html',
  'shop.html',
  'missions.html',
  'teams.html',
  'inventory.html',
  'resources.html',
  'settings.html',
  'arena.html',
  'tools.html',
].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Serve `cached` immediately (if present) and refresh the cache from the
// network in the background. Repeat visits become app-instant instead of
// waiting on a full re-download.
function staleWhileRevalidate(request, cacheKey) {
  return caches.open(CACHE).then(async cache => {
    const key = cacheKey || request;
    const cached = await cache.match(key);
    const network = fetch(request).then(res => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    // If we have a cached copy, return it now and let the network update run
    // in the background; otherwise wait for the network.
    return cached || network;
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin requests
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  const rel = url.pathname.slice(BASE.length);

  // Large binary media — network only (don't bloat CacheStorage with videos /
  // multi-MB gifs). The browser's own HTTP cache still handles repeat loads.
  if (rel.startsWith('assets/') || rel.startsWith('animations/')) return;

  // Data JSON (characters.json, cards.json, …) — the app fetches these with a
  // per-load `?v=timestamp` cache-buster + `no-store`, which defeats all
  // caching and re-downloads megabytes every visit. Normalize the key to the
  // path (dropping the query) and serve stale-while-revalidate, so a repeat
  // open is instant while a background fetch keeps the data fresh.
  if (rel.startsWith('data/')) {
    const key = new Request(url.origin + url.pathname);
    e.respondWith(staleWhileRevalidate(e.request, key));
    return;
  }

  // HTML documents — stale-while-revalidate so a new tab opens instantly from
  // cache, then updates in the background (was network-first, which always
  // blocked on the network round-trip).
  if (e.request.destination === 'document') {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // CSS / JS — cache-first with background refresh. The `?v=` version tags on
  // these are meaningful, so match on the exact URL (do not strip the query).
  e.respondWith(staleWhileRevalidate(e.request));
});
