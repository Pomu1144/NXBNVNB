// js/battle/battle-outcome-banner.js - "Victory" / "Defeat" banner shown over
// the battlefield when a battle ends, before the results screen.
//
// Layers (css/battle-outcome-banner.css): ink brush band that sweeps in from
// the left, the brush word slamming in with a flash, gold swirls behind it and
// small CSS glints.
// Art lives in assets/ui/battle/banner_*.webp; if a file is missing the layer
// falls back to a plain placeholder so the flow never blocks on art.
// Tap / click / Enter / Esc skips. prefers-reduced-motion: plain fade.
(() => {
  "use strict";

  const ART = {
    band: "assets/ui/battle/banner_ink_band.webp",
    sparkle: "assets/ui/battle/banner_sparkle.webp",
    victory: "assets/ui/battle/banner_victory_word.webp",
    defeat: "assets/ui/battle/banner_defeat_word.webp",
  };

  // ms: when the word has landed, how long it holds, fade-out length
  const TIMING = {
    victory: { land: 600, hold: 1600, fade: 350 },
    defeat: { land: 1050, hold: 1600, fade: 550 },
    reduced: { land: 250, hold: 1400, fade: 300 },
  };

  const reducedMotion = () => {
    try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  };

  // Warm the cache so the banner is ready the moment the battle ends
  const preload = () => Object.values(ART).forEach(src => { const i = new Image(); i.src = src; });

  // <img> that swaps to a placeholder class if the art file isn't there
  const artImg = (src, cls, alt = "") => {
    const img = document.createElement("img");
    img.className = cls;
    img.alt = alt;
    img.draggable = false;
    img.decoding = "async";
    img.addEventListener("error", () => img.classList.add("is-missing"), { once: true });
    img.src = src;
    return img;
  };

  const BattleOutcomeBanner = {
    /**
     * Play the banner. Resolves once it has faded out (or was skipped).
     * @param {boolean} isVictory
     * @returns {Promise<void>}
     */
    play(isVictory) {
      return new Promise(resolve => {
        const kind = isVictory ? "victory" : "defeat";
        const reduced = reducedMotion();
        const t = reduced ? TIMING.reduced : TIMING[kind];

        document.querySelector(".ob-banner")?.remove();

        const root = document.createElement("div");
        root.className = `ob-banner is-${kind}${reduced ? " is-reduced" : ""}`;
        root.setAttribute("role", "status");
        root.setAttribute("aria-live", "assertive");

        const word = isVictory ? "Victory" : "Defeat";
        const sparks = Array.from({ length: isVictory ? 9 : 5 }, (_, i) =>
          `<span class="ob-spark" style="--i:${i};--x:${(8 + (i * 83) % 84)}%;--y:${(18 + (i * 37) % 64)}%;--s:${0.5 + ((i * 7) % 5) / 8}"></span>`
        ).join("");

        root.innerHTML = `
          <div class="ob-dim"></div>
          <div class="ob-flash"></div>
          <div class="ob-stage">
            <div class="ob-band"></div>
            <div class="ob-swirl"></div>
            <div class="ob-word"><span class="ob-word-ph">${word}</span></div>
            <div class="ob-sparks">${sparks}</div>
          </div>`;

        root.querySelector(".ob-band").appendChild(artImg(ART.band, "ob-band-img"));
        root.querySelector(".ob-swirl").appendChild(artImg(ART.sparkle, "ob-swirl-img"));
        root.querySelector(".ob-word").prepend(artImg(ART[kind], "ob-word-img", word));

        document.body.appendChild(root);

        let done = false;
        const timers = [];
        const finish = (fadeMs) => {
          if (done) return;
          done = true;
          timers.forEach(clearTimeout);
          root.removeEventListener("pointerdown", onSkip);
          document.removeEventListener("keydown", onKey, true);
          root.style.setProperty("--ob-fade", `${fadeMs}ms`);
          root.classList.add("is-out");
          setTimeout(() => { root.remove(); resolve(); }, fadeMs);
        };
        const onSkip = (e) => { e.preventDefault(); e.stopPropagation(); finish(160); };
        const onKey = (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); finish(160); }
        };

        root.addEventListener("pointerdown", onSkip);
        document.addEventListener("keydown", onKey, true);

        // Next frame so the entry animations start from their first keyframe
        requestAnimationFrame(() => root.classList.add("is-in"));
        timers.push(setTimeout(() => finish(t.fade), t.land + t.hold));
      });
    },
  };

  preload();
  window.BattleOutcomeBanner = BattleOutcomeBanner;
})();
