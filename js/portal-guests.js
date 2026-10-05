/* js/portal-guests.js
 * ---------------------------------------------------------------------------
 * Characters imported through the Portal from OTHER games become "guest"
 * units. Each guest has a full character definition (built by
 * js/portal-port.js from a template unit of the same element) stored under
 * blazing_portal_guests_v1.
 *
 * About twenty scripts fetch data/characters.json on their own, so instead
 * of touching each one this wraps fetch() and appends the guest definitions
 * to that one response. Load it right after js/page-loader.js, before any
 * script fetches character data.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  const KEY = 'blazing_portal_guests_v1';

  function guests() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string' && c.portalGuest) : [];
    } catch (_) {
      return [];
    }
  }

  const isCharactersJson = (input) => {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      return url.origin === location.origin && /\/data\/characters\.json$/.test(url.pathname);
    } catch (_) {
      return false;
    }
  };

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    const p = nativeFetch(input, init);
    if (!isCharactersJson(input)) return p;
    return p.then(async (res) => {
      const extra = guests();
      if (!res.ok || !extra.length) return res;
      try {
        const list = await res.clone().json();
        if (!Array.isArray(list)) return res;
        const have = new Set(list.map((c) => c && c.id));
        const merged = list.concat(extra.filter((g) => !have.has(g.id)));
        return new Response(JSON.stringify(merged), {
          status: res.status,
          statusText: res.statusText,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (_) {
        return res;
      }
    });
  };

  window.PortalGuests = { KEY, all: guests };
})();
