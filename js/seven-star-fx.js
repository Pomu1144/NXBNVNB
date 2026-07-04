// seven-star-fx.js
// ---------------------------------------------------------------------------
// Keeps the 7-star lightning overlays (video.seven-star-fx) playing.
//
// Browsers pause autoplaying <video> elements when a page is put into the
// back/forward cache or the tab is backgrounded. When the user navigates away
// and comes back (e.g. Characters -> Teams -> back), the page is restored from
// bfcache WITHOUT re-running render code, so the lightning videos stay frozen
// and the effect "disappears". This module re-kicks playback on every event
// that can leave a video paused, and watches the grid so freshly rendered
// 7-star cards start playing too.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  function playAll() {
    const vids = document.querySelectorAll("video.seven-star-fx");
    vids.forEach((v) => {
      // muted + playsinline are required for autoplay to be allowed
      v.muted = true;
      if (v.paused) {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    });
  }

  // bfcache restore (back/forward), tab refocus, visibility change
  window.addEventListener("pageshow", playAll);
  window.addEventListener("focus", playAll);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) playAll();
  });

  function wire() {
    playAll();
    if (!("MutationObserver" in window)) return;
    document.querySelectorAll(".char-grid").forEach((grid) => {
      const mo = new MutationObserver(() => playAll());
      mo.observe(grid, { childList: true, subtree: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
