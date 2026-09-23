// seven-star-fx.js
// ---------------------------------------------------------------------------
// Card aura FX manager: 7-star lightning + fully-maxed dark-blue wind.
// Used by the Characters roster grid and the Teams page (roster picker +
// formation slots). A host may set data-fx-before="<selector>" to choose where
// inside it the overlay is inserted (default: appended).
//
// PERFORMANCE:
//  * Cards only render a cheap static glow (.is-7star / .is-maxed) and are
//    tagged with data-fx="7star maxed". ONE IntersectionObserver lights up
//    only the cards that are on-screen (.fx-live enables the pulse animation
//    and a <video> overlay is attached) and tears that down when they scroll
//    away, so only the handful of visible cards carry video/blend cost.
//  * The <video> elements are POOLED and re-used instead of being destroyed
//    (src removed + load()) on every scroll-out. Destroying them threw away
//    the buffered clip, so every card that scrolled back in re-downloaded and
//    re-demuxed it (the lightning clip is 1.3 MB with its index at the END of
//    the file) — ~150 fetches / >100 MB just scrolling a 300-unit roster once.
//  * Grid cards that scroll off-screen get .fx-off so their infinite CSS
//    animations (the ultimate-badge glow) stop ticking. On-screen cards look
//    exactly the same as before.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  // Hosts that carry an FX overlay, plus plain grid cards (animation gating).
  const CARD_SEL = ".char-grid > .char-slot, [data-fx]";
  const SPEC = {
    "7star": { cls: "seven-star-fx", src: "assets/effects/sevenstar_lightning.mp4" },
    "maxed": { cls: "maxed-fx",      src: "assets/effects/maxed_wind.mp4" },
  };

  /* ---------------- Video pool ---------------- */
  const POOL_MAX = 24;                         // idle videos kept per kind
  const pool = Object.create(null);            // kind -> [video, ...]

  function takeVideo(kind) {
    const list = pool[kind] || (pool[kind] = []);
    const v = list.pop();
    if (v) return v;
    const nv = document.createElement("video");
    nv.className = SPEC[kind].cls;
    nv.src = SPEC[kind].src;
    nv.loop = true; nv.muted = true; nv.playsInline = true; nv.preload = "auto";
    nv.setAttribute("playsinline", ""); nv.setAttribute("aria-hidden", "true");
    return nv;
  }

  function releaseVideo(kind, v) {
    try { v.pause(); } catch (e) {}
    v.remove();
    const list = pool[kind] || (pool[kind] = []);
    if (list.length < POOL_MAX) { list.push(v); return; }
    try { v.removeAttribute("src"); v.load(); } catch (e) {}   // truly drop extras
  }

  function play(v) {
    if (document.hidden) return;
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  /* ---------------- Per-card activation ---------------- */
  function activate(host) {
    if (host.dataset.fxLive === "1") return;
    host.dataset.fxLive = "1";
    host.classList.add("fx-live");
    const before = host.dataset.fxBefore ? host.querySelector(host.dataset.fxBefore) : null;
    (host.dataset.fx || "").split(" ").filter(Boolean).forEach((kind) => {
      const spec = SPEC[kind];
      if (!spec || host.querySelector("video." + spec.cls)) return;
      const v = takeVideo(kind);
      host.insertBefore(v, before);
      play(v);
    });
  }

  function deactivate(host) {
    if (host.dataset.fxLive !== "1") return;
    host.dataset.fxLive = "";
    host.classList.remove("fx-live");
    for (const kind in SPEC) {
      host.querySelectorAll("video." + SPEC[kind].cls).forEach((v) => releaseVideo(kind, v));
    }
  }

  /* ---------------- Observation ---------------- */
  let io = null;
  const observed = new Set();

  function onEntries(entries) {
    for (const e of entries) {
      const el = e.target;
      if (e.isIntersecting) {
        el.classList.remove("fx-off");
        if (el.dataset.fx) activate(el);
      } else {
        el.classList.add("fx-off");
        if (el.dataset.fx) deactivate(el);
      }
    }
  }

  function scan() {
    scanPending = false;
    // Forget cards that were removed by a grid rebuild.
    for (const el of observed) {
      if (!el.isConnected) { observed.delete(el); if (io) io.unobserve(el); deactivate(el); }
    }
    const cards = document.querySelectorAll(CARD_SEL);
    if (!io) {
      // No IntersectionObserver: everything live (old behaviour).
      cards.forEach((el) => { if (el.dataset.fx) activate(el); });
      return;
    }
    cards.forEach((el) => {
      if (!observed.has(el)) { observed.add(el); io.observe(el); }
    });
  }
  let scanPending = false;
  function scheduleScan() {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(scan);
  }

  // Re-kick the live videos after bfcache restore / tab refocus.
  function replayLive() {
    document.querySelectorAll(".fx-live > video, .fx-live video.seven-star-fx, .fx-live video.maxed-fx")
      .forEach(play);
  }
  window.addEventListener("pageshow", replayLive);
  window.addEventListener("focus", replayLive);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) replayLive(); });

  function wire() {
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(onEntries, { rootMargin: "200px" });
    }
    scan();
    if (!("MutationObserver" in window)) return;
    // childList only (no subtree): catches grid rebuilds / team-slot
    // re-renders (direct children swapped via innerHTML) but NOT our own
    // video injections deeper in each card — no feedback loop.
    const mo = new MutationObserver(scheduleScan);
    document.querySelectorAll(".char-grid, .team-slot").forEach((el) => {
      mo.observe(el, { childList: true });
    });
  }

  window.SevenStarFX = { rescan: scheduleScan };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
