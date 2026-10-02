// js/ink-lightning.js — animated lightning over an Ink dossier painting.
// InkLightning.start(canvas, img, { origin: [fx, fy] }) draws on `canvas`,
// which sits exactly over `img` (same box, object-fit: cover, object-position
// 0% 30%); `origin` is the strike centre as fractions of the painting
// (e.g. a Chidori in the hand). InkLightning.stop() ends it.
//  - forked bolts strike out from the origin every 0.3-1.1s and flicker out,
//    now and then one falls from the top of the frame;
//  - short arcs crackle round the origin all the time;
//  - big strikes add a one-frame cold flash over the painting.
// Crisp strokes only (a thin white core over a narrow blue edge), ~30fps,
// paused while the tab is hidden; nothing runs under prefers-reduced-motion.
(function () {
  "use strict";
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let raf = 0, cv = null, im = null, ctx = null, opts = null;
  let bolts = [], nextStrike = 0, lastCrackle = 0, arcs = [], flash = 0, last = 0;

  // midpoint displacement: a jagged path from a to b
  function path(ax, ay, bx, by, rough, depth) {
    let pts = [[ax, ay], [bx, by]];
    for (let d = 0; d < depth; d++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const off = (Math.random() - 0.5) * len * rough;
        const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
        out.push([(x0 + x1) / 2 + nx * off, (y0 + y1) / 2 + ny * off], pts[i]);
      }
      pts = out;
    }
    return pts;
  }

  // the painting's cover box inside the canvas (object-position 0% 30%)
  function frame() {
    const W = cv.width, H = cv.height;
    const iw = im.naturalWidth || 16, ih = im.naturalHeight || 9;
    const s = Math.max(W / iw, H / ih);
    return { x: 0, y: (H - ih * s) * 0.3, w: iw * s, h: ih * s };
  }
  function origin(f) {
    const o = (opts && opts.origin) || [0.5, 0.6];
    return [f.x + o[0] * f.w, f.y + o[1] * f.h];
  }

  function strike(f, big) {
    const [ox, oy] = origin(f);
    const r = f.w * (big ? 0.26 + Math.random() * 0.22 : 0.12 + Math.random() * 0.14);
    // mostly up and to the left, into the part of the painting in view
    const a = Math.random() < 0.8 ? Math.PI * (0.55 + Math.random() * 0.9) : Math.random() * Math.PI * 2;
    const main = path(ox, oy, ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.8, 0.55, 6);
    const branches = [];
    const n = big ? 2 + (Math.random() * 3 | 0) : Math.random() * 2 | 0;
    for (let i = 0; i < n; i++) {
      const p = main[(main.length * (0.25 + Math.random() * 0.5)) | 0];
      const b = a + (Math.random() - 0.5) * 1.6, br = r * (0.25 + Math.random() * 0.35);
      branches.push(path(p[0], p[1], p[0] + Math.cos(b) * br, p[1] + Math.sin(b) * br, 0.6, 5));
    }
    bolts.push({ lines: [main, ...branches], born: performance.now(), life: big ? 340 : 220, w: big ? 1 : 0.75 });
    if (big) flash = 1;
  }

  // a bolt from the top of the frame down into the scene
  function skyBolt(f, W) {
    const x0 = f.x + Math.random() * Math.min(W, f.w) * 0.6, y0 = Math.max(0, f.y);
    const x1 = x0 + (Math.random() - 0.5) * f.w * 0.18, y1 = y0 + f.h * (0.3 + Math.random() * 0.3);
    const main = path(x0, y0, x1, y1, 0.5, 7);
    const p = main[(main.length * 0.45) | 0];
    const fork = path(p[0], p[1], p[0] + (Math.random() - 0.5) * f.w * 0.2, p[1] + f.h * 0.18, 0.6, 5);
    bolts.push({ lines: [main, fork], born: performance.now(), life: 260, w: 0.9 });
    flash = 1;
  }

  function crackle(f) {
    const [ox, oy] = origin(f);
    arcs = [];
    const n = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = f.w * (0.03 + Math.random() * 0.07);
      const sx = ox + (Math.random() - 0.5) * f.w * 0.02, sy = oy + (Math.random() - 0.5) * f.w * 0.02;
      arcs.push(path(sx, sy, sx + Math.cos(a) * r, sy + Math.sin(a) * r, 0.7, 4));
    }
  }

  function stroke(pts, w, alpha) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(40, 90, 255, ${0.75 * alpha})`; ctx.lineWidth = 5 * w * d; ctx.stroke();
    ctx.shadowColor = "rgba(140, 190, 255, 0.9)"; ctx.shadowBlur = 4 * d;
    ctx.strokeStyle = `rgba(250, 252, 255, ${alpha})`; ctx.lineWidth = 1.8 * w * d; ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function tick(t) {
    raf = requestAnimationFrame(tick);
    if (document.hidden || t - last < 33) return;
    last = t;
    const d = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * d), H = Math.round(cv.clientHeight * d);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const f = frame();
    if (t >= nextStrike) {
      const roll = Math.random();
      if (roll < 0.15) skyBolt(f, W); else strike(f, roll < 0.55);
      nextStrike = t + 280 + Math.random() * 800;
    }
    if (t - lastCrackle > 70) { crackle(f); lastCrackle = t; }

    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (flash > 0) { ctx.fillStyle = `rgba(170, 200, 255, ${0.1 * flash})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - 0.5); }
    for (const p of arcs) stroke(p, 0.6, 0.55 + Math.random() * 0.45);
    bolts = bolts.filter((b) => t - b.born < b.life);
    for (const b of bolts) {
      const k = 1 - (t - b.born) / b.life;
      const a = k * (Math.random() < 0.25 ? 0.35 : 1);   // flicker
      b.lines.forEach((p, i) => stroke(p, i ? b.w * 0.6 : b.w, a));
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; bolts = []; arcs = [];
    if (ctx && cv) ctx.clearRect(0, 0, cv.width, cv.height);
  }

  function start(canvas, img, o) {
    if (reduced() || !canvas || !img) { stop(); return false; }
    opts = o || {};
    if (raf && cv === canvas) return true;
    stop();
    cv = canvas; im = img; ctx = cv.getContext("2d");
    nextStrike = performance.now() + 250; last = 0;
    raf = requestAnimationFrame(tick);
    return true;
  }

  window.InkLightning = { start, stop };
})();
