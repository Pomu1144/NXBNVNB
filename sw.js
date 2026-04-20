const CACHE = 'blazing-shell-v2';
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

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin requests
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Large binary assets — network only, no cache bloat
  const rel = url.pathname.slice(BASE.length);
  if (rel.startsWith('assets/') || rel.startsWith('data/') || rel.startsWith('animations/')) {
    return;
  }

  // HTML shell — stale-while-revalidate
  if (e.request.destination === 'document') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(r => {
          caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        });
        return cached || fresh;
      })
    );
    return;
  }

  // CSS/JS — cache first, fall back to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      });
    })
  );
});
