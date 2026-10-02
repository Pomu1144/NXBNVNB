// art-motion.js
// ---------------------------------------------------------------------------
// Animated full art for any tier, from a `motion` block on the tier's art in
// data/characters.json:
//   "artByTier": { "6S": { "full": ".../full_6S.webp",
//     "motion": { "plate": ".../motion_6S_plate.webp",   // art without the unit
//                 "fg":    ".../motion_6S_fg.webp",      // the unit, cut out
//                 "swirl": "assets/effects/wind_swirl_gold.webp",
//                 "gust":  "assets/effects/wind_gust_gold.webp",
//                 "video": ".../motion_6S.mp4",                    // optional
//                 "videoWebm": ".../motion_6S.webm" } } }          // optional
// With `video`, the art itself is animated: a muted looping clip whose first
// and last frames are the still art (so the loop is seamless) plays over it;
// the still shows until the clip can play, and under reduced motion.
// Layers (back to front): the plate drifting slowly; a wind vortex turning
// behind the unit; the cut-out unit swaying and breathing (the movement
// layer, so it shifts against the scene without a doubled outline); a
// counter-turning vortex rim in front; gusts sweeping across; gold flecks
// blown along. Same container and placement as the 7-star animation
// (.a7, css/seven-star-anim.css), styled in css/art-motion.css. Transform
// and opacity animations only; static under prefers-reduced-motion.
//   ArtMotion.has(character, tier)                  -> bool
//   ArtMotion.mount(host, character, tier, opts)    -> element | null
//   ArtMotion.unmount(host)
// ---------------------------------------------------------------------------
(function () {
  "use strict";
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const esc = (s) => String(s == null ? "" : s).replace(/"/g, "&quot;");

  function block(c, tier) {
    const t = c && c.artByTier && c.artByTier[tier];
    const m = t && t.motion;
    return m && (m.video || (m.fg && m.plate)) ? m : null;
  }
  const has = (c, tier) => !!block(c, tier);

  // deterministic fleck layout per unit
  function flecks(seedStr, n) {
    let seed = 11;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 2147483647;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let h = "";
    for (let i = 0; i < n; i++) {
      const d = 2.2 + rnd() * 2.4;
      h += `<i style="--x:${(rnd() * 70).toFixed(1)}%;--y:${(15 + rnd() * 75).toFixed(1)}%;--s:${(0.5 + rnd() * 0.9).toFixed(2)}%;` +
           `--d:${d.toFixed(2)}s;--dl:${(-rnd() * d).toFixed(2)}s;--dx:${(700 + rnd() * 900).toFixed(0)}%;--dy:${(-(150 + rnd() * 450)).toFixed(0)}%"></i>`;
    }
    return h;
  }

  function mount(host, c, tier, opts) {
    const m = block(c, tier);
    if (!host || !m) return null;
    unmount(host);
    const still = reduced();
    if (m.video) {
      const full = (opts && opts.full) || (c.artByTier[tier] && c.artByTier[tier].full) || c.full;
      const v = document.createElement("div");
      v.className = "a7 am am-vid";
      v.setAttribute("aria-hidden", "true");
      v.innerHTML = `<img class="am-still-art" src="${esc(full)}" alt="" decoding="async">` +
        (still ? "" : `<video class="am-video" muted loop playsinline autoplay preload="auto" disablepictureinpicture>` +
          // VP9 WebM first (Chrome, Firefox, Android), H.264 MP4 for Safari
          (m.videoWebm ? `<source src="${esc(m.videoWebm)}" type="video/webm">` : "") +
          `<source src="${esc(m.video)}" type="video/mp4"></video>`);
      const vid = v.querySelector("video");
      if (vid) {
        vid.muted = true;
        vid.addEventListener("playing", () => v.classList.add("is-playing"), { once: true });
        const p = vid.play && vid.play(); if (p && p.catch) p.catch(() => {});
      }
      host.appendChild(v);
      host.classList.add("has-a7");
      return v;
    }
    const el = document.createElement("div");
    el.className = "a7 am" + (still ? " am-still" : "");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      `<img class="am-plate" src="${esc(m.plate)}" alt="" decoding="async">` +
      (m.swirl ? `<img class="am-swirl" src="${esc(m.swirl)}" alt="" decoding="async">` : "") +
      `<img class="am-fg" src="${esc(m.fg)}" alt="" decoding="async">` +
      (m.swirl && !still ? `<img class="am-swirl am-rim" src="${esc(m.swirl)}" alt="" decoding="async">` : "") +
      (m.gust && !still ? `<img class="am-gust" src="${esc(m.gust)}" alt="" decoding="async"><img class="am-gust b" src="${esc(m.gust)}" alt="" decoding="async">` : "") +
      (still ? "" : `<div class="am-pp">${flecks(c.id || "", 16)}</div>`);
    host.appendChild(el);
    host.classList.add("has-a7");
    return el;
  }

  function unmount(host) {
    if (!host) return;
    host.querySelectorAll(":scope > .a7 video").forEach((v) => { v.pause(); v.querySelectorAll("source").forEach((x) => x.remove()); v.removeAttribute("src"); v.load(); });
    host.querySelectorAll(":scope > .a7").forEach((el) => el.remove());
    host.classList.remove("has-a7");
  }

  window.ArtMotion = { has, mount, unmount };
})();
