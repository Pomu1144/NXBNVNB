// seven-star-fx.js
// ---------------------------------------------------------------------------
// Card aura FX manager: 7-star lightning + fully-maxed dark-blue wind.
// Used by the Characters roster grid and the Teams page (roster picker +
// formation slots). A host may set data-fx-before="<selector>" to choose where
// inside it the overlay is inserted (default: appended).
//
// PERFORMANCE (rewritten — "massive lag with lots of maxed/ultimate units"):
//  * The aura used to be a looping <video> per on-screen card composited with
//    mix-blend-mode:screen, plus a box-shadow pulse and a filter pulse per card.
//    With ~150 maxed units that meant ~50 video decoders + ~100 main-thread
//    paint animations at once (idle ~40 fps, janky scroll in headless Chrome;
//    far worse on a phone).
//  * Now the overlay is a plain <i><b></b></i>: the <b> holds a still frame
//    (transparent WebP, pre-extracted from the old clip) and ONE shared CSS
//    keyframe animation flips/fades it using only transform + opacity —
//    compositor-only: no video decode, no blend mode, no per-frame paint, no
//    JS rAF loop, and a single animated layer per aura.
//  * ONE IntersectionObserver adds the overlay only to on-screen cards
//    (.fx-live) and removes it when they scroll away; off-screen cards get
//    .fx-off so any remaining infinite CSS animation stops ticking.
//  * prefers-reduced-motion: the overlay shows a single static frame.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  // Hosts that carry an FX overlay, plus plain grid cards (animation gating).
  const CARD_SEL = ".char-grid > .char-slot, [data-fx]";
  const SPEC = {
    "7star": "seven-star-fx",
    "maxed": "maxed-fx",
    // animated 7-star art units (fx7): light sweep + element pulse only
    "anim7": "anim7-fx",
  };

  /* ---------------- Per-card activation ---------------- */
  function activate(host) {
    if (host.dataset.fxLive === "1") return;
    host.dataset.fxLive = "1";
    host.classList.add("fx-live");
    const before = host.dataset.fxBefore ? host.querySelector(host.dataset.fxBefore) : null;
    (host.dataset.fx || "").split(" ").filter(Boolean).forEach((kind) => {
      const cls = SPEC[kind];
      if (!cls || host.querySelector("." + cls)) return;
      const el = document.createElement("i");
      el.className = cls + " aura-fx";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = "<b></b>";
      host.insertBefore(el, before);
    });
  }

  function deactivate(host) {
    if (host.dataset.fxLive !== "1") return;
    host.dataset.fxLive = "";
    host.classList.remove("fx-live");
    host.querySelectorAll(".aura-fx").forEach((el) => el.remove());
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

  function wire() {
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(onEntries, { rootMargin: "120px" });
    }
    scan();
    if (!("MutationObserver" in window)) return;
    // childList only (no subtree): catches grid rebuilds / team-slot
    // re-renders (direct children swapped via innerHTML) but NOT our own
    // overlay injections deeper in each card — no feedback loop.
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
