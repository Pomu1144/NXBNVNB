// seven-star-fx.js
// ---------------------------------------------------------------------------
// Manages the card FX overlays: the 7-star lightning (video.seven-star-fx) and
// the fully-maxed dark-blue wind (video.maxed-fx).
//
// PERFORMANCE: a roster with many 7-star / limit-broken units would otherwise
// autoplay dozens of looping, screen-blended videos at once and lag hard. So
// the videos have NO `autoplay`; instead an IntersectionObserver plays only the
// ones currently on-screen and pauses the rest. Scrolling a big collection now
// only ever decodes the handful of visible cards.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  const SEL = "video.seven-star-fx, video.maxed-fx";
  const visible = new Set();
  let io = null;

  // Track intended playback with a data flag rather than the native `paused`
  // property: play() is async (and may be pending), so relying on `paused`
  // alone can leave an off-screen video running. The flag makes pause/play
  // deterministic.
  function playVid(v) {
    v.muted = true; // required for programmatic play
    if (v.dataset.fxPlaying === "1") return;
    v.dataset.fxPlaying = "1";
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }
  function pauseVid(v) {
    if (v.dataset.fxPlaying !== "1") return;
    v.dataset.fxPlaying = "";
    try { v.pause(); } catch (e) {}
  }

  function ensureObserver() {
    if (io || !("IntersectionObserver" in window)) return;
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { visible.add(e.target); playVid(e.target); }
        else { visible.delete(e.target); pauseVid(e.target); }
      }
    }, { rootMargin: "150px" });
  }

  function inViewport(v) {
    const b = v.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    return b.width > 0 && b.bottom > -150 && b.top < h + 150;
  }

  // Deterministic pass after (re)render: play the videos actually on-screen,
  // pause the rest. IntersectionObserver's first callback can race with layout
  // right after an innerHTML swap and leave off-screen videos playing, so we
  // reconcile explicitly on the next frame. IO then maintains state on scroll.
  function reconcile() {
    document.querySelectorAll(SEL).forEach((v) => {
      if (inViewport(v)) { visible.add(v); playVid(v); }
      else { visible.delete(v); pauseVid(v); }
    });
  }

  // Observe any FX videos not yet observed (idempotent — safe to call on every
  // grid re-render).
  function scan() {
    if (!("IntersectionObserver" in window)) {
      requestAnimationFrame(reconcile); // fallback: rect-based play/pause
      return;
    }
    ensureObserver();
    document.querySelectorAll(SEL).forEach((v) => {
      if (!v.dataset.fxObserved) { v.dataset.fxObserved = "1"; io.observe(v); }
    });
    requestAnimationFrame(reconcile);
  }

  // Re-kick only the on-screen videos (they pause when the tab is backgrounded
  // or the page is restored from bfcache).
  function replayVisible() { visible.forEach(playVid); }

  window.addEventListener("pageshow", replayVisible);
  window.addEventListener("focus", replayVisible);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) replayVisible(); });

  function wire() {
    scan();
    if (!("MutationObserver" in window)) return;
    document.querySelectorAll(".char-grid").forEach((grid) => {
      const mo = new MutationObserver(() => scan());
      mo.observe(grid, { childList: true, subtree: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
