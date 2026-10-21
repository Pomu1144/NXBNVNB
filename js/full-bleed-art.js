// js/full-bleed-art.js — which card art is painted edge to edge.
// The original cards draw the unit small on a shared backdrop, so art views
// crop or zoom toward the unit. The remade art fills the whole square and
// must be shown whole. data/full-bleed-art.json lists it (regenerate with
// tools/art/full_bleed.py). FullBleedArt.mark(el, src) toggles
// .is-full-bleed on el for src, once the list has loaded.
(function (global) {
  'use strict';

  let set = null;
  const pending = new Map();
  const norm = (s) => String(s || '').split('?')[0].replace(/^\.?\//, '');
  const apply = (el, src) => el.classList.toggle('is-full-bleed', !!set && set.has(norm(src)));

  fetch('data/full-bleed-art.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((list) => {
      set = new Set(Array.isArray(list) ? list : []);
      pending.forEach((src, el) => apply(el, src));
      pending.clear();
    });

  global.FullBleedArt = {
    mark(el, src) {
      if (!el) return;
      if (set) apply(el, src);
      else pending.set(el, src);
    },
  };
})(window);
