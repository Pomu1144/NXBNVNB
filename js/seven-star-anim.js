// seven-star-anim.js
// ---------------------------------------------------------------------------
// Full layered 7-star art animation for units that carry an `fx7` block in
// data/characters.json:
//   "fx7": { "aura": ".../fx_aura.webp", "glow": ".../fx_glow.webp",
//            "particles": ".../fx_particles.webp", "color": "#c9b6ff" }
//
// Used by ONE big card at a time (character detail modal, summon result
// reveal). Styles live in css/seven-star-anim.css. Everything animates with
// CSS transform/opacity only; this file just builds the layer stack once on
// mount and removes it on unmount (no rAF loop, no video, no canvas).
//
//   SevenStarAnim.has(character)                 -> bool
//   SevenStarAnim.mount(host, character, opts)   -> the .a7 element | null
//        opts.full       art url (default character.full)
//        opts.particles  particle count (default 14; 0 under reduced motion)
//   SevenStarAnim.unmount(host)                  removes any .a7 in host
//   SevenStarAnim.unmountAll(root)               removes every .a7 in root
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const esc = (s) => String(s == null ? "" : s).replace(/"/g, "&quot;");

  function has(c) {
    return !!(c && c.fx7 && c.fx7.glow && c.fx7.aura);
  }

  // Deterministic per-unit particle layout (same look every open).
  function particlesHTML(seedStr, n) {
    let seed = 7;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 2147483647;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let h = "";
    for (let i = 0; i < n; i++) {
      const d = i % 2 ? 5 : 2.5;                         // both divide the 5 s loop
      const s = 3.2 + rnd() * 4.2;                       // % of the card
      // travel expressed in particle widths so it scales with the card
      const dx = ((rnd() - 0.5) * 800).toFixed(0) + "%";
      const dy = (-(500 + rnd() * 800)).toFixed(0) + "%";
      h += `<i style="--x:${(8 + rnd() * 84).toFixed(1)}%;--y:${(40 + rnd() * 55).toFixed(1)}%;--s:${s.toFixed(1)}%;` +
           `--k:${i % 8};--d:${d}s;--dl:${(-rnd() * d).toFixed(2)}s;--dx:${dx};--dy:${dy};--r:${((rnd() - 0.5) * 240).toFixed(0)}deg"></i>`;
    }
    return h;
  }

  function mount(host, c, opts) {
    if (!host || !has(c)) return null;
    unmount(host);
    opts = opts || {};
    const fx = c.fx7;
    const full = opts.full || c.full;
    const still = reduced();
    const n = still ? 0 : (opts.particles == null ? 14 : opts.particles);
    const el = document.createElement("div");
    el.className = "a7";
    el.setAttribute("aria-hidden", "true");
    if (fx.particles) el.style.setProperty("--a7-sheet", `url("${esc(fx.particles)}")`);
    if (fx.color) el.style.setProperty("--fx7c", fx.color);
    el.innerHTML =
      `<img class="a7-base" src="${esc(full)}" alt="" decoding="async">` +
      `<img class="a7-aura" src="${esc(fx.aura)}" alt="" decoding="async">` +
      `<img class="a7-breath" src="${esc(full)}" alt="" decoding="async">` +
      `<img class="a7-glow" src="${esc(fx.glow)}" alt="" decoding="async">` +
      (still ? "" :
        `<img class="a7-lick" src="${esc(fx.glow)}" alt="" decoding="async">` +
        `<img class="a7-lick b" src="${esc(fx.glow)}" alt="" decoding="async">`) +
      (n && fx.particles ? `<div class="a7-pp">${particlesHTML(c.id || "", n)}</div>` : "") +
      `<div class="a7-sweep"></div>`;
    host.appendChild(el);
    host.classList.add("has-a7");
    return el;
  }

  function unmount(host) {
    if (!host) return;
    host.querySelectorAll(":scope > .a7").forEach((el) => el.remove());
    host.classList.remove("has-a7");
  }

  function unmountAll(root) {
    (root || document).querySelectorAll(".a7").forEach((el) => {
      el.parentElement && el.parentElement.classList.remove("has-a7");
      el.remove();
    });
  }

  window.SevenStarAnim = { has, mount, unmount, unmountAll };
})();
