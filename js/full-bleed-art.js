// js/full-bleed-art.js — how card art is framed in the art views.
// The original cards draw the unit on a shared backdrop, so art views crop
// or zoom toward the unit. The remade art fills the whole square and must be
// shown whole. data/full-bleed-art.json lists the remade art and
// data/art-framing.json gives each original's unit box [x0, y0, x1, y1] as
// fractions of the square (both from tools/art/full_bleed.py).
// FullBleedArt.mark(el, src) toggles .is-full-bleed on el for src, or
// .has-art-box with --abx/--aby (box centre) and --abw/--abh (box size),
// once the lists have loaded.
(function (global) {
  'use strict';

  let set = null;
  let boxes = null;
  const pending = new Map();
  const norm = (s) => String(s || '').split('?')[0].replace(/^\.?\//, '');
  const load = (url, empty) => fetch(url).then((r) => (r.ok ? r.json() : empty)).catch(() => empty);

  const apply = (el, src) => {
    const key = norm(src);
    el.classList.toggle('is-full-bleed', set.has(key));
    const b = !set.has(key) && boxes[key];
    el.classList.toggle('has-art-box', !!b);
    if (b) {
      el.style.setProperty('--abx', ((b[0] + b[2]) / 2).toFixed(3));
      el.style.setProperty('--aby', ((b[1] + b[3]) / 2).toFixed(3));
      el.style.setProperty('--abw', (b[2] - b[0]).toFixed(3));
      el.style.setProperty('--abh', (b[3] - b[1]).toFixed(3));
    }
  };

  Promise.all([load('data/full-bleed-art.json', []), load('data/art-framing.json', {})]).then(([list, map]) => {
    set = new Set(Array.isArray(list) ? list : []);
    boxes = map && typeof map === 'object' ? map : {};
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
