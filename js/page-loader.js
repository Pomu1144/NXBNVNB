/* js/page-loader.js
 * ---------------------------------------------------------------------------
 * Shared page loader. Loaded synchronously near the top of <head> on every
 * page (after css/page-loader.css), so it covers the page from the very first
 * paint. It lifts once the page is really ready:
 *
 *   - DOM parsed (DOMContentLoaded)
 *   - fonts (document.fonts.ready + the two theme faces)
 *   - every <img>, <video> and CSS background image in the first screen,
 *     and images the page's scripts load up front (new Image(), src = …)
 *   - same-origin fetch() calls made before the reveal (data JSON; the
 *     service worker serves data/ cache-first, so this is quick after the
 *     first visit)
 *   - sprite sheets asked for before the reveal (js/sprite-player.js tracks
 *     its own loads here)
 *   - anything a page registers itself:
 *       PageLoader.wait(promise[, label])   → returns the promise
 *       const done = PageLoader.hold(label); … done();
 *
 * Progress is shown as a gold chakra bar + percentage. A 15 s safety timeout
 * reveals anyway. A page that is ready at once is shown after a short minimum
 * (MIN_MS) so the loader never flashes, and never feels sluggish.
 *
 *   PageLoader.ready       Promise, resolves when the reveal starts
 *   PageLoader.revealed    true once revealed
 *   window 'pageloader:reveal' event fires at the same moment
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (window.PageLoader) return;

  var MIN_MS = 280;       // from navigation start; hides a flash on cached pages
  var MAX_MS = 15000;     // safety timeout
  var LEAVE_MS = 520;     // ink-wipe length (css/page-loader.css)
  var SETTLE_ROUNDS = 10; // rescans for work started by the page's own loaders

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }

  var TIPS = [
    'Drag a ninja onto an enemy to <b>attack</b>.',
    'Tap a portrait once for <b>Jutsu</b>, twice for the <b>Ultimate</b>.',
    'Attacks build <b>chakra</b> — spend it on jutsu.',
    'The <b>turn bar</b> shows who moves next. Speed decides.',
    'Claim starter gifts in the <b>Present Box</b>.',
    'Save <b>Ninja Pearls</b> for featured summon banners.',
    '<b>Skins</b> change a ninja\'s look, never their stats.',
    'Swap in a <b>backup</b> ninja by tapping its mini card.',
    'Duplicates power up your shinobi in <b>Fusion</b>.',
    'A shinobi who never gives up is never truly beaten.'
  ];

  // ── Build the overlay (body doesn't exist yet: hang it on <html>) ─────────
  // Page name from the <title>: the part that isn't the game's name
  // ("Blazing — Summon", "Settings - Naruto Blazing").
  var title = (doc.title || '').split(/\s+[—–-]\s+/).filter(function (t) { return !/blazing/i.test(t); })[0] || '';
  title = title.replace(/\s+HUD$/i, '');
  if (!title || /^sign in$/i.test(title)) title = 'Hidden Leaf';
  var el = doc.createElement('div');
  el.id = 'page-loader';
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-label', 'Loading ' + title);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.setAttribute('aria-valuenow', '0');
  el.innerHTML =
    '<div class="pl-panel">' +
      '<div class="pl-stage">' +
        '<div class="pl-emblem"><img src="assets/ui/jjk/medal_gold.webp" alt="" draggable="false"></div>' +
        '<div class="pl-kicker">Entering</div>' +
        '<div class="pl-title"></div>' +
        '<div class="pl-bar"><div class="pl-track"></div><div class="pl-fill"></div><div class="pl-runner"></div></div>' +
        '<div class="pl-meta"><p class="pl-tip"></p><span class="pl-pct">0%</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="pl-brush" aria-hidden="true"></div>';
  el.querySelector('.pl-title').textContent = title;
  root.classList.add('pl-active');
  root.appendChild(el);

  // Ask for the loader's own art first, ahead of the page's (cached after
  // the first visit, so later pages show it on the first frame).
  ['assets/ui/jjk/medal_gold.webp', 'assets/ui/cutin/name_banner.webp', 'assets/ui/jjk/ink_bg.webp'].forEach(function (src) {
    var im = new Image();
    try { im.fetchPriority = 'high'; } catch (e) { /* unsupported */ }
    im.src = src;
  });

  var pctEl = el.querySelector('.pl-pct');
  var tipEl = el.querySelector('.pl-tip');
  var runner = el.querySelector('.pl-runner');

  // ── Tip line (rotates) ────────────────────────────────────────────────────
  var tipIdx = Math.floor(Math.random() * TIPS.length);
  tipEl.innerHTML = TIPS[tipIdx];
  var tipTimer = setInterval(function () {
    tipIdx = (tipIdx + 1) % TIPS.length;
    if (reduceMotion) { tipEl.innerHTML = TIPS[tipIdx]; return; }
    tipEl.classList.add('is-swapping');
    setTimeout(function () { tipEl.innerHTML = TIPS[tipIdx]; tipEl.classList.remove('is-swapping'); }, 350);
  }, 2800);

  // ── Runner: small 8×2 sheet cut from assets/sprites/naruto_2115/run ──────
  var RUN = { src: 'assets/ui/loader/runner.webp', w: 49, h: 64, cols: 8, frames: 16, fps: 24 };
  var runTimer = null;
  (function () {
    var img = new Image();
    try { img.fetchPriority = 'low'; } catch (e) { /* unsupported */ }
    img.onload = function () {
      if (revealed) return;
      runner.style.backgroundImage = 'url("' + RUN.src + '")';
      runner.classList.add('is-ready');
      var f = 0;
      var paint = function () {
        runner.style.backgroundPosition = (-(f % RUN.cols) * RUN.w) + 'px ' + (-Math.floor(f / RUN.cols) * RUN.h) + 'px';
      };
      paint();
      if (!reduceMotion) runTimer = setInterval(function () { f = (f + 1) % RUN.frames; paint(); }, 1000 / RUN.fps);
    };
    img.src = RUN.src;
  })();

  // ── Tracking ──────────────────────────────────────────────────────────────
  var items = [];          // { label, done, weight }
  var pending = [];        // promises still out
  var seen = new Set();    // urls / elements already tracked
  var revealed = false;
  var shown = 0;           // displayed progress 0..1 (never goes back)

  // item.frac (0..1) lets a big download show partial progress.
  function add(label, promise, weight, item) {
    if (revealed) return Promise.resolve(promise).then(function () {}, function () {});
    item = item || {};
    item.label = label; item.done = false; item.weight = weight || 1; item.at = 0; item.frac = item.frac || 0;
    items.push(item);
    var p = Promise.resolve(promise).then(function () {}, function () {}).then(function () {
      item.done = true;
      item.at = performance.now();
      render();
    });
    pending.push(p);
    render();
    return p;
  }

  function render() {
    var total = 0, done = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      total += it.weight;
      done += it.done ? it.weight : it.weight * Math.min(1, it.frac || 0);
    }
    var p = total ? done / total : 0;
    if (!revealed) p = Math.min(p, 0.96);
    if (p > shown) shown = p;
    el.style.setProperty('--pl-p', shown.toFixed(3));
    var pct = Math.round(shown * 100);
    pctEl.textContent = pct + '%';
    el.setAttribute('aria-valuenow', String(pct));
  }

  function inFirstScreen(node) {
    if (!node.getClientRects || !node.getClientRects().length) return false; // display:none
    var r = node.getBoundingClientRect();
    var vh = window.innerHeight || root.clientHeight;
    var vw = window.innerWidth || root.clientWidth;
    return r.bottom >= 0 && r.right >= 0 && r.top <= vh * 1.05 && r.left <= vw * 1.05;
  }

  function mediaPromise(node, isVideo) {
    return new Promise(function (resolve) {
      var ok = function () { cleanup(); resolve(); };
      var cleanup = function () {
        node.removeEventListener(isVideo ? 'loadeddata' : 'load', ok);
        node.removeEventListener('error', ok, true);
      };
      node.addEventListener(isVideo ? 'loadeddata' : 'load', ok);
      // Capture: a <video>'s <source> reports its own (non-bubbling) error.
      node.addEventListener('error', ok, true);
      if (isVideo) {
        if (node.networkState === 3) ok(); // NETWORK_NO_SOURCE: nothing playable
        // A video that never buffers (autoplay blocked, codec) must not hold the page.
        setTimeout(ok, 5000);
      }
    });
  }

  function scanMedia() {
    var imgs = doc.images;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (seen.has(img) || el.contains(img)) continue;
      if (img.complete) { if (img.currentSrc || img.src) seen.add(img); continue; }
      if (!inFirstScreen(img)) continue;
      seen.add(img);
      add('img ' + (img.getAttribute('src') || ''), mediaPromise(img, false));
    }
    var vids = doc.getElementsByTagName('video');
    for (var j = 0; j < vids.length; j++) {
      var v = vids[j];
      if (seen.has(v)) continue;
      seen.add(v);
      if (v.readyState >= 2 || !inFirstScreen(v) || v.preload === 'none') continue;
      add('video ' + (v.currentSrc || ''), mediaPromise(v, true));
    }
  }

  var URL_RE = /url\((['"]?)(.*?)\1\)/g;
  function scanBackgrounds() {
    if (!doc.body) return;
    var nodes = doc.body.getElementsByTagName('*');
    var n = Math.min(nodes.length, 4000);
    var list = [doc.body];
    for (var i = 0; i < n; i++) list.push(nodes[i]);
    for (var k = 0; k < list.length; k++) {
      var node = list[k];
      if (el.contains(node)) continue;
      var bg = '';
      try { bg = getComputedStyle(node).backgroundImage; } catch (e) { continue; }
      if (!bg || bg === 'none' || bg.indexOf('url(') < 0) continue;
      if (!inFirstScreen(node)) continue;
      URL_RE.lastIndex = 0;
      var m;
      while ((m = URL_RE.exec(bg))) {
        var url = m[2];
        if (!url || url.indexOf('data:') === 0 || seen.has(url)) continue;
        seen.add(url);
        add('bg ' + url, new Promise(function (resolve) {
          var im = new Image();
          im.onload = im.onerror = function () { resolve(); };
          im.src = url;
        }));
      }
    }
  }

  // Images the page loads from script before the reveal (new Image() probes,
  // carousels, sprite sheets): hook the src setter until the reveal.
  // Lazy images are left to scanMedia (they only load once in view).
  var srcDesc = window.HTMLImageElement && Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  var srcHooked = false;
  if (srcDesc && srcDesc.set && srcDesc.configurable) {
    try {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: srcDesc.enumerable,
        get: srcDesc.get,
        set: function (v) {
          srcDesc.set.call(this, v);
          if (revealed || seen.has(this) || this.loading === 'lazy' || !v || String(v).indexOf('data:') === 0) return;
          seen.add(this);
          add('img ' + v, mediaPromise(this, false));
        }
      });
      srcHooked = true;
    } catch (e) { /* locked prototype: rely on scanning */ }
  }
  function unhookSrc() {
    if (!srcHooked) return;
    srcHooked = false;
    try { Object.defineProperty(HTMLImageElement.prototype, 'src', srcDesc); } catch (e) { /* ignore */ }
  }

  // Read a clone of the response to the end, reporting how far it got.
  function readBody(r, item) {
    if (!r || !r.clone) return null;
    var c = r.clone();
    var total = Number(r.headers.get('content-length')) || 0;
    if (!total || !c.body || !c.body.getReader) return c.arrayBuffer();
    var reader = c.body.getReader();
    var got = 0;
    var pump = function () {
      return reader.read().then(function (x) {
        if (x.done) return;
        got += x.value.length;
        item.frac = got / total;
        render();
        return pump();
      });
    };
    return pump();
  }

  // Same-origin fetches started before the reveal (data JSON the page renders
  // from). The body is read from a clone so the page's own .json() is untouched.
  if (window.fetch) {
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      var p = nativeFetch.apply(window, arguments);
      if (!revealed) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          var method = (init && init.method) || (input && input.method) || 'GET';
          var same = new URL(url, location.href).origin === location.origin;
          if (same && String(method).toUpperCase() === 'GET') {
            var item = {};
            add('fetch ' + url, p.then(function (r) { return readBody(r, item); }), 3, item);
          }
        } catch (e) { /* never break the page's fetch */ }
      }
      return p;
    };
  }

  // Fonts: the theme faces + whatever the first layout asked for.
  function trackFonts() {
    if (!doc.fonts) return;
    try {
      add('font Kaisei', doc.fonts.load('700 16px "Kaisei Tokumin"'));
      add('font Shojumaru', doc.fonts.load('16px "Shojumaru"'));
      // Other faces the first layout asked for; capped, a late swap is harmless.
      add('fonts ready', Promise.race([doc.fonts.ready, sleep(4000)]));
    } catch (e) { /* ignore */ }
  }

  var domReady = new Promise(function (resolve) {
    if (doc.readyState !== 'loading') resolve();
    else doc.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
  add('dom', domReady, 2);

  // While the page is still parsing, pick up images as they arrive.
  var scanTimer = setInterval(function () { if (!revealed) scanMedia(); }, 150);

  var frame = function () {
    return new Promise(function (r) {
      var done = false;
      var go = function () { if (!done) { done = true; r(); } };
      if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(go); });
      setTimeout(go, 120); // rAF is paused in background tabs
    });
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function settle() {
    await domReady;
    trackFonts();
    for (var round = 0; round < SETTLE_ROUNDS && !revealed; round++) {
      scanMedia();
      if (round === 0 || round === 2 || round === SETTLE_ROUNDS - 1) scanBackgrounds();
      var count = pending.length;
      await Promise.all(pending.slice());
      // Give the page's own handlers a moment to start follow-up work
      // (render after data arrives, sprite sheets after units spawn…).
      await frame();
      await sleep(40);
      scanMedia();
      if (round < 3) scanBackgrounds();
      if (pending.length === count && items.every(function (it) { return it.done; })) break;
    }
  }

  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  function reveal(reason) {
    if (revealed) return;
    revealed = true;
    unhookSrc();
    clearInterval(scanTimer);
    clearInterval(tipTimer);
    shown = 1; render();
    if (reason === 'timeout') {
      var left = items.filter(function (it) { return !it.done; }).map(function (it) { return it.label; });
      console.warn('[PageLoader] safety timeout — revealing with', left.length, 'item(s) still loading', left.slice(0, 12));
    }
    root.classList.remove('pl-active');
    root.classList.add('pl-revealed');
    el.classList.add('is-leaving');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(function () {
      if (runTimer) clearInterval(runTimer);
      if (el.parentNode) el.parentNode.removeChild(el);
    }, reduceMotion ? 260 : LEAVE_MS + 40);
    var last = items.reduce(function (m, it) { return Math.max(m, it.at); }, 0);
    readyResolve({ reason: reason, ms: Math.round(performance.now()), lastLoaded: Math.round(last) });
    try { window.dispatchEvent(new CustomEvent('pageloader:reveal', { detail: { reason: reason } })); } catch (e) { /* old browser */ }
  }

  settle().then(function () {
    var wait = Math.max(0, MIN_MS - performance.now());
    setTimeout(function () { reveal('ready'); }, wait);
  });
  setTimeout(function () { reveal('timeout'); }, Math.max(1000, MAX_MS - performance.now()));

  // Back/forward cache restores a page that was already revealed.
  window.addEventListener('pageshow', function (e) { if (e.persisted) reveal('bfcache'); });

  window.PageLoader = {
    ready: ready,
    get revealed() { return revealed; },
    get progress() { return shown; },
    /** Labels of what is still loading (debugging a slow page). */
    pending: function () { return items.filter(function (it) { return !it.done; }).map(function (it) { return it.label; }); },
    /** Keep the loader up until `promise` settles (rejections count as done). */
    wait: function (promise, label) {
      if (!revealed) add(label || 'page', promise);
      return promise;
    },
    /** Same as wait(); used by js/sprite-player.js for sheet loads. */
    track: function (promise, label) {
      if (!revealed) add(label || 'sprite', promise);
      return promise;
    },
    /** Hold the loader until the returned function is called. */
    hold: function (label) {
      var release;
      var p = new Promise(function (r) { release = r; });
      if (!revealed) add(label || 'hold', p, 2);
      return function () { release(); };
    },
    /** Lift the loader now. */
    reveal: function () { reveal('manual'); }
  };
})();
