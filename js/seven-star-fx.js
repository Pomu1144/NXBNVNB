// seven-star-fx.js
// ---------------------------------------------------------------------------
// Card aura FX manager: 7-star lightning + fully-maxed dark-blue wind.
//
// PERFORMANCE: a roster with hundreds of 7-star / limit-broken units must NOT
// keep hundreds of <video> + mix-blend-mode layers (and pulsing box-shadow
// animations) alive — that destroys scroll performance even when the videos
// are paused. So the grid only renders a cheap static glow (via .is-7star /
// .is-maxed) and tags each card with data-fx. This manager uses an
// IntersectionObserver to INJECT the actual <video> overlay(s) and enable the
// pulse animation (.fx-live) ONLY while a card is on-screen, and REMOVES them
// when it scrolls away. At any moment only the handful of visible cards carry
// video/blend/animation cost.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  const CARD_SEL = ".char-slot[data-fx]";
  const SPEC = {
    "7star": { cls: "seven-star-fx", src: "assets/effects/sevenstar_lightning.mp4" },
    "maxed": { cls: "maxed-fx",      src: "assets/effects/maxed_wind.mp4" },
  };
  let io = null;

  function activate(card) {
    if (card.dataset.fxLive === "1") return;
    card.dataset.fxLive = "1";
    card.classList.add("fx-live");
    (card.dataset.fx || "").split(" ").filter(Boolean).forEach((kind) => {
      const spec = SPEC[kind];
      if (!spec || card.querySelector("video." + spec.cls)) return;
      const v = document.createElement("video");
      v.className = spec.cls;
      v.src = spec.src;
      v.loop = true; v.muted = true; v.playsInline = true;
      v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
      card.appendChild(v);
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    });
  }

  function deactivate(card) {
    if (card.dataset.fxLive !== "1") return;
    card.dataset.fxLive = "";
    card.classList.remove("fx-live");
    card.querySelectorAll("video.seven-star-fx, video.maxed-fx").forEach((v) => {
      try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {}
      v.remove();
    });
  }

  function inViewport(el) {
    const b = el.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    return b.width > 0 && b.bottom > -200 && b.top < h + 200;
  }

  function ensureObserver() {
    if (io || !("IntersectionObserver" in window)) return;
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) activate(e.target);
        else deactivate(e.target);
      }
    }, { rootMargin: "200px" });
  }

  // Deterministic pass after a (re)render — IO's first callback can race with
  // layout right after an innerHTML swap. Debounced to one rAF so repeated
  // scan() calls don't thrash layout with getBoundingClientRect.
  let reconcilePending = false;
  function reconcile() {
    reconcilePending = false;
    document.querySelectorAll(CARD_SEL).forEach((card) => {
      if (inViewport(card)) activate(card); else deactivate(card);
    });
  }
  function scheduleReconcile() {
    if (reconcilePending) return;
    reconcilePending = true;
    requestAnimationFrame(reconcile);
  }

  function scan() {
    if (!("IntersectionObserver" in window)) { scheduleReconcile(); return; }
    ensureObserver();
    document.querySelectorAll(CARD_SEL).forEach((card) => {
      if (!card.dataset.fxObserved) { card.dataset.fxObserved = "1"; io.observe(card); }
    });
    scheduleReconcile();
  }

  // Re-kick the currently-live videos after bfcache restore / tab refocus.
  function replayLive() {
    document.querySelectorAll(".char-slot.fx-live video").forEach((v) => {
      v.muted = true; const p = v.play(); if (p && typeof p.catch === "function") p.catch(() => {});
    });
  }
  window.addEventListener("pageshow", replayLive);
  window.addEventListener("focus", replayLive);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) replayLive(); });

  function wire() {
    scan();
    if (!("MutationObserver" in window)) return;
    // childList only (no subtree): catches grid rebuilds (cards are direct
    // children) but NOT our own video injections deeper in each card, avoiding
    // a mutation -> scan -> inject -> mutation feedback loop.
    document.querySelectorAll(".char-grid").forEach((grid) => {
      new MutationObserver(() => scan()).observe(grid, { childList: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
