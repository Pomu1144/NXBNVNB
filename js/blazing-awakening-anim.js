// js/blazing-awakening-anim.js
// Blazing Awakening cut-in (…→6SB), after the original game's screen:
//   - the unit's art on black, framed by gold sakura bursting in along the top and bottom
//     edges over a white glow
//   - a red brush stroke sweeping across, then the "Blazing Awakening" brush logo slamming in
//     with a flash and gold paper bits, while gold petals drift down
// Sprites (assets/ui/blazing/): the logo, gold_flower and gold_petal were cut from in-game
// screenshots; flower_1-9 and petal_1-8 are Canva renders made in the same gold-leaf style.
// Same call shape as AwakeningAnimation.play, so js/characters.js can swap between them.
// Tap to skip. css/blazing-awakening-anim.css holds the look.

(function (global) {
  "use strict";

  const ASSET = "assets/ui/blazing/";
  const LOGO = ASSET + "logo.webp";
  const range = (n, name) => Array.from({ length: n }, (_, i) => `${ASSET}${name}_${i + 1}.webp`);
  const FLOWERS = [ASSET + "gold_flower.webp", ...range(9, "flower")];
  const PETALS = [ASSET + "gold_petal.webp", ...range(8, "petal")];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function preload(src) {
    return new Promise((resolve) => {
      if (!src) return resolve();
      const im = new Image();
      im.onload = im.onerror = () => resolve();
      im.src = src;
    });
  }

  function el(tag, cls, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  // gold sakura framing the top and bottom edges, as on the awakened art screen
  function spawnFrameFlowers(layer, reduced) {
    const spots = [];
    // tall screens get bigger flowers so the bands read as in the original
    const k = global.innerHeight > global.innerWidth ? 1.55 : 1;
    // [x%, y%, size vmin]: big ones in the corners, smaller ones between
    const top = [[4, 4, 34], [24, -2, 22], [44, 6, 16], [63, -1, 24], [84, 6, 30], [100, 0, 20], [34, 12, 11], [74, 14, 12]];
    const bot = [[-2, 92, 38], [20, 98, 20], [42, 90, 14], [60, 99, 26], [80, 92, 22], [98, 98, 30], [30, 84, 10], [70, 85, 11]];
    top.forEach((s) => spots.push({ x: s[0], y: s[1], size: s[2], from: -1 }));
    bot.forEach((s) => spots.push({ x: s[0], y: s[1], size: s[2], from: 1 }));

    spots.forEach((s, i) => {
      const f = el("img", "ba-flower", layer);
      f.src = FLOWERS[i % FLOWERS.length];
      f.alt = "";
      f.style.left = s.x + "%";
      f.style.top = s.y + "%";
      f.style.width = (s.size * k) + "vmin";
      f.style.filter = `brightness(${rand(0.82, 1.12).toFixed(2)})`;
      const r0 = rand(-120, 120), r1 = r0 + rand(40, 110) * (Math.random() < 0.5 ? -1 : 1);
      if (reduced) {
        f.style.transform = `translate(-50%,-50%) rotate(${r1}deg)`;
        f.style.opacity = 1;
        return;
      }
      const dy = 45 * s.from;
      f.animate([
        { transform: `translate(-50%,-50%) translateY(${dy}vh) scale(0.35) rotate(${r0}deg)`, opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { transform: `translate(-50%,-50%) translateY(0) scale(1) rotate(${r1}deg)`, opacity: 1 }
      ], { duration: rand(650, 900), delay: 120 + i * 28, easing: "cubic-bezier(0.15, 0.9, 0.3, 1)", fill: "both" })
        .finished.then(() => {
          // slow idle drift while the cut-in holds
          f.animate([
            { transform: `translate(-50%,-50%) rotate(${r1}deg)` },
            { transform: `translate(-50%,-50%) translate(${rand(-1.2, 1.2)}vmin, ${rand(-1, 1)}vmin) rotate(${r1 + rand(-14, 14)}deg)` }
          ], { duration: 2600, easing: "ease-in-out", fill: "forwards" });
        }).catch(() => {});
    });
  }

  // single petals drifting down across the screen
  function spawnPetals(layer, count) {
    for (let i = 0; i < count; i++) {
      const p = el("img", "ba-petal", layer);
      p.src = pick(PETALS);
      p.alt = "";
      const size = rand(2.2, 5.5);
      p.style.width = size + "vmin";
      p.style.left = rand(-5, 100) + "%";
      const sway = rand(-14, 14), r0 = rand(0, 360), spin = rand(180, 540) * pick([-1, 1]);
      p.animate([
        { transform: `translate(0,-12vh) rotate(${r0}deg)`, opacity: 0 },
        { opacity: rand(0.75, 1), offset: 0.12 },
        { transform: `translate(${sway}vw, 112vh) rotate(${r0 + spin}deg)`, opacity: 0.9 }
      ], { duration: rand(2600, 4200), delay: 500 + rand(0, 1800), easing: "linear", fill: "both" });
    }
  }

  // gold paper squares bursting out from the logo
  function burstBits(layer, count) {
    for (let i = 0; i < count; i++) {
      const b = el("span", "ba-bit", layer);
      const s = rand(0.9, 2.4);
      b.style.width = b.style.height = s + "vmin";
      const a = rand(0, Math.PI * 2), d = rand(18, 52);
      const tx = Math.cos(a) * d, ty = Math.sin(a) * d * 0.6 - rand(0, 6);
      const r = rand(-540, 540);
      b.animate([
        { transform: "translate(-50%,-50%) scale(0.2) rotate(0deg)", opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { transform: `translate(-50%,-50%) translate(${tx}vmin, ${ty}vmin) scale(1) rotate(${r}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(-50%,-50%) translate(${tx * 1.1}vmin, ${ty + 14}vmin) scale(0.9) rotate(${r * 1.3}deg)`, opacity: 0 }
      ], { duration: rand(1600, 2400), easing: "cubic-bezier(0.1, 0.8, 0.3, 1)", fill: "both" });
    }
  }

  /**
   * @param {string} oldName
   * @param {string} newName
   * @param {string} oldArtUrl  art shown first (the pre-awakening tier)
   * @param {string} newArtUrl  art shown from the flash on (the 6SB tier)
   * @param {Function} onComplete
   */
  async function play(oldName, newName, oldArtUrl, newArtUrl, onComplete) {
    const reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    await Promise.all([preload(oldArtUrl), preload(newArtUrl), preload(LOGO), ...FLOWERS.map(preload), ...PETALS.map(preload)]);

    const ov = el("div", "ba-overlay", document.body);
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", `${newName || oldName}: Blazing Awakening`);

    const artWrap = el("div", "ba-art", ov);
    const art = el("img", "", artWrap);
    art.src = oldArtUrl || newArtUrl;
    art.alt = "";

    el("div", "ba-glow ba-glow--top", ov);
    el("div", "ba-glow ba-glow--bot", ov);
    const flowers = el("div", "ba-flowers", ov);
    const petals = el("div", "ba-petals", ov);

    const center = el("div", "ba-center", ov);
    el("div", "ba-swoosh", center);
    el("div", "ba-streak", center);
    const bits = el("div", "ba-bits", center);
    const logo = el("img", "ba-logo", center);
    logo.src = LOGO;
    logo.alt = "Blazing Awakening";
    const flash = el("div", "ba-flash", ov);

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    let done = false;

    requestAnimationFrame(() => ov.classList.add("is-in"));
    spawnFrameFlowers(flowers, reduced);

    if (global.AudioManager && typeof global.AudioManager.playSFX === "function") {
      at(300, () => { try { global.AudioManager.playSFX("awakening"); } catch (e) { /* no sfx */ } });
    }

    const reveal = () => {
      flash.classList.add("is-on");
      if (newArtUrl) art.src = newArtUrl;
      artWrap.classList.add("is-new");
    };

    if (reduced) {
      at(200, reveal);
      at(300, () => ov.classList.add("is-logo"));
      at(2600, close);
    } else {
      at(650, () => ov.classList.add("is-swoosh"));
      at(950, () => { reveal(); ov.classList.add("is-logo"); burstBits(bits, 18); });
      at(1000, () => spawnPetals(petals, 22));
      at(4300, close);
    }

    function close() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      ov.classList.add("is-out");
      setTimeout(() => {
        ov.remove();
        if (typeof onComplete === "function") onComplete();
      }, 450);
    }

    ov.addEventListener("click", close);
  }

  global.BlazingAwakeningAnimation = { play };
})(window);
