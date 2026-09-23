const CACHE = 'blazing-shell-v8';
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

// Try the network (bounded wait); on failure or timeout use the cached copy.
function networkFirst(request, timeoutMs = 3000) {
  return caches.open(CACHE).then(async cache => {
    const network = fetch(request).then(res => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    });
    const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (_) { /* offline — fall through to cache */ }
    const cached = await cache.match(request);
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

  // Data JSON (characters.json 2.5MB, cards.json 1.5MB, …) — CACHE-FIRST.
  // These are large and change only on deploy, so we must NOT re-download them
  // in the background on every navigation: after the tab has been idle the
  // connection is cold, and kicking multi-MB background fetches on each click
  // makes navigation crawl. Serve straight from cache; fresh data ships when
  // the CACHE version is bumped (which clears the old cache on activate).
  if (rel.startsWith('data/')) {
    const key = new Request(url.origin + url.pathname);
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(key);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      })
    );
    return;
  }

  // HTML / CSS / JS — network-first with a short timeout, falling back to
  // cache. Stale-while-revalidate served the previous deploy's HTML with the
  // new deploy's CSS on the first visit after an update (mixed, broken pages).
  e.respondWith(networkFirst(e.request));
});
