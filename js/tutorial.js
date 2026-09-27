/* js/tutorial.js
 * ---------------------------------------------------------------------------
 * First-time tutorial engine. Steps live in js/tutorial-steps.js
 * (window.TUTORIAL); this file only plays them.
 *
 *  - Starts after the first login / guest start: js/login-overlay.js writes
 *    { status: 'pending' } and the village picks it up.
 *  - Progress is saved in localStorage (TUTORIAL.storageKey) after every step,
 *    so it resumes across pages and reloads; once 'done' or 'skipped' it never
 *    shows again, unless replayed from Settings → Account (Tutorial.replay()).
 *  - Kakashi (his battle idle sprite) speaks from an ink panel; the step's
 *    target is spotlit through a dimmed overlay with a gold kunai pointing
 *    at it.
 *  - If the player wanders to a page the current step isn't on, a small
 *    "Continue lesson" tab offers to take them back.
 *
 *   Tutorial.replay()   restart from the first step (opens its page)
 *   Tutorial.skip()     end it now
 *   Tutorial.state()    saved progress
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';
  const CFG = window.TUTORIAL;
  if (!CFG || !Array.isArray(CFG.steps) || !CFG.steps.length) return;

  const KEY = CFG.storageKey || 'blazing_tutorial_v1';
  const STEPS = CFG.steps;
  const CHIP_HIDDEN = ['battle.html']; // no "continue" tab over a fight
  let reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }

  /* ── Saved progress ─────────────────────────────────────────────────── */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save(st) {
    st.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked */ }
  }

  /* ── Pages & runs (consecutive steps on the same page) ─────────────── */
  const here = {
    path: location.pathname.split('/').pop() || 'index.html',
    params: new URLSearchParams(location.search),
  };
  function onPage(step) {
    const [path, query] = String(step.page || '').split('?');
    if (path !== here.path) return false;
    if (!query) return true;
    for (const [k, v] of new URLSearchParams(query)) if (here.params.get(k) !== v) return false;
    return true;
  }
  const indexOf = (id) => STEPS.findIndex((s) => s.id === id);
  const runStart = (i) => { while (i > 0 && STEPS[i - 1].page === STEPS[i].page) i--; return i; };
  const runEnd = (i) => { while (i < STEPS.length - 1 && STEPS[i + 1].page === STEPS[i].page) i++; return i; };

  /** Step to show on this page for saved step index i, or -1. */
  function stepForPage(i) {
    if (onPage(STEPS[i])) return i;
    const n = runEnd(i) + 1;                 // player went on to the next run's page
    if (n < STEPS.length && onPage(STEPS[n])) return n;
    for (let j = n; j < STEPS.length; j++) { // e.g. battle basics on the first battle
      if (STEPS[j].jumpIn && onPage(STEPS[j])) return j;
    }
    return -1;
  }

  /* ── Small helpers ──────────────────────────────────────────────────── */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function visible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  // Split "a, b:not(.c, .d)" on top-level commas: alternatives in priority order.
  function alternatives(sel) {
    const out = []; let depth = 0; let cur = '';
    for (const ch of String(sel)) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // The part of el actually on screen: its box cut by every scrolling /
  // clipping ancestor and the viewport.
  function clippedRect(el) {
    const r = el.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = n.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { x1 = Math.max(x1, c.left); x2 = Math.min(x2, c.right); }
      if (cs.overflowY !== 'visible') { y1 = Math.max(y1, c.top); y2 = Math.min(y2, c.bottom); }
    }
    x1 = Math.max(x1, 0); y1 = Math.max(y1, 0);
    x2 = Math.min(x2, window.innerWidth); y2 = Math.min(y2, window.innerHeight);
    return { left: x1, top: y1, right: Math.max(x1, x2), bottom: Math.max(y1, y2), full: r };
  }
  function shownFraction(el) {
    const c = clippedRect(el), r = c.full;
    const a = Math.max(1, r.width * r.height);
    return ((c.right - c.left) * (c.bottom - c.top)) / a;
  }

  function findTarget(sel) {
    for (const alt of alternatives(sel)) {
      let list = [];
      try { list = document.querySelectorAll(alt); } catch (e) { continue; }
      for (const el of list) if (visible(el)) return el;
    }
    return null;
  }
  function blocked() {
    return (CFG.blockers || []).some((sel) => {
      try { return Array.from(document.querySelectorAll(sel)).some(visible); } catch (e) { return false; }
    });
  }

  /* ── Sensei sprite (battle idle sheet, own tiny animator) ───────────── */
  const SHEET = CFG.sensei && CFG.sensei.sheet;
  let sheetMeta = null;
  const sheetReady = !SHEET ? Promise.resolve(null) : fetch(SHEET + '.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((meta) => new Promise((resolve) => {
      meta = meta || { frameWidth: 162, frameHeight: 256, frames: 48, columns: 12, fps: 24 };
      const img = new Image();
      img.onload = () => { sheetMeta = meta; resolve(meta); };
      img.onerror = () => resolve(null);
      img.src = SHEET + '.webp';
    }));

  function animateSprite(el, height, crop) {
    let timer = null;
    const m = sheetMeta;
    if (!m) return () => {};
    const s = height / m.frameHeight;
    const w = Math.round(m.frameWidth * s);
    const rows = Math.ceil(m.frames / m.columns);
    el.style.backgroundImage = `url("${SHEET}.webp")`;
    el.style.backgroundSize = `${m.columns * w}px ${rows * height}px`;
    if (!crop) { el.style.width = w + 'px'; el.style.height = height + 'px'; }
    const ox = crop ? crop.x * s : 0;
    const oy = crop ? crop.y * s : 0;
    let f = 0;
    const paint = () => {
      el.style.backgroundPosition = `${-(f % m.columns) * w - ox}px ${-Math.floor(f / m.columns) * height - oy}px`;
    };
    paint();
    if (!reduceMotion) timer = setInterval(() => { f = (f + 1) % m.frames; paint(); }, 1000 / (m.fps || 24));
    return () => clearInterval(timer);
  }

  /* ── Overlay DOM ────────────────────────────────────────────────────── */
  let ui = null;
  function buildUI() {
    if (ui) return ui;
    const root = document.createElement('div');
    root.id = 'tut';
    root.className = 'tut';
    root.hidden = true;
    root.innerHTML = `
      <div class="tut-block" data-b="t"></div><div class="tut-block" data-b="b"></div>
      <div class="tut-block" data-b="l"></div><div class="tut-block" data-b="r"></div>
      <div class="tut-block tut-hole" data-b="h"></div>
      <div class="tut-ring" aria-hidden="true"></div>
      <img class="tut-arrow" src="assets/ui/hf/arrow.webp" alt="" aria-hidden="true" draggable="false">
      <div class="tut-guide" role="dialog" aria-modal="true" aria-labelledby="tut-title" aria-describedby="tut-text">
        <div class="tut-sensei" aria-hidden="true"></div>
        <div class="tut-bubble jjk-panel">
          <div class="tut-name jjk-title-plate"></div>
          <span class="tut-count"></span>
          <h3 class="tut-title" id="tut-title"></h3>
          <p class="tut-text" id="tut-text" aria-live="polite"></p>
          <div class="tut-actions">
            <button type="button" class="tut-skip">Skip tutorial</button>
            <button type="button" class="jjk-btn tut-back">Back</button>
            <button type="button" class="jjk-btn is-primary tut-next">Next</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    ui = {
      root,
      blocks: Array.from(root.querySelectorAll('.tut-block')),
      hole: q('.tut-hole'),
      ring: q('.tut-ring'),
      arrow: q('.tut-arrow'),
      guide: q('.tut-guide'),
      sensei: q('.tut-sensei'),
      bubble: q('.tut-bubble'),
      name: q('.tut-name'),
      count: q('.tut-count'),
      title: q('.tut-title'),
      text: q('.tut-text'),
      skip: q('.tut-skip'),
      back: q('.tut-back'),
      next: q('.tut-next'),
    };
    ui.name.textContent = (CFG.sensei && CFG.sensei.name) || 'Sensei';
    ui.next.addEventListener('click', () => next());
    ui.back.addEventListener('click', () => back());
    ui.skip.addEventListener('click', () => askSkip(ui.skip));
    ui.hole.addEventListener('click', () => next()); // tapping the spotlit thing moves on
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    });
    // Swallow drags/taps on the dimmed area (battle drag, carousels…).
    ui.blocks.forEach((b) => ['pointerdown', 'touchstart', 'mousedown'].forEach((t) =>
      b.addEventListener(t, (e) => e.stopPropagation(), { passive: true })));
    return ui;
  }

  // Skip needs a second tap, so a stray tap can't end the lesson.
  function askSkip(btn) {
    if (btn.dataset.confirm === '1') { skip(); return; }
    btn.dataset.confirm = '1';
    const label = btn.textContent;
    btn.textContent = 'Tap again to skip';
    setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = label; }, 2600);
  }

  /* ── Layout ─────────────────────────────────────────────────────────── */
  let current = -1;       // index of the step on screen
  let target = null;
  let stopSensei = null;
  let followTimer = null;
  let token = 0;

  function vp() { return { w: window.innerWidth, h: window.innerHeight }; }
  function compact() { return vp().h <= 480 || vp().w <= 600; }

  function layout() {
    if (!ui || ui.root.hidden) return;
    const step = STEPS[current];
    const { w: vw, h: vh } = vp();
    const pad = step && step.pad != null ? step.pad : 8;
    let hole = null;
    if (target && target.isConnected && visible(target)) {
      const r = clippedRect(target);
      if (r.right - r.left > 2 && r.bottom - r.top > 2) {
        const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
        hole = { x, y, w: Math.min(vw - 4, r.right + pad) - x, h: Math.min(vh - 4, r.bottom + pad) - y };
      }
    }

    // Spotlight ring (its huge shadow is the dim) + click blockers around it.
    const R = ui.ring.style;
    if (hole) {
      R.left = hole.x + 'px'; R.top = hole.y + 'px'; R.width = hole.w + 'px'; R.height = hole.h + 'px';
      ui.root.classList.add('has-target');
    } else {
      R.left = vw / 2 + 'px'; R.top = vh / 2 + 'px'; R.width = '0px'; R.height = '0px';
      ui.root.classList.remove('has-target');
    }
    const h = hole || { x: vw / 2, y: vh / 2, w: 0, h: 0 };
    const set = (el, x, y, w, hh) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, hh) + 'px' });
    const [bt, bb, bl, br, bh] = ui.blocks;
    set(bt, 0, 0, vw, h.y);
    set(bb, 0, h.y + h.h, vw, vh - h.y - h.h);
    set(bl, 0, h.y, h.x, h.h);
    set(br, h.x + h.w, h.y, vw - h.x - h.w, h.h);
    set(bh, h.x, h.y, h.w, h.h);
    bh.hidden = !hole || !!(step && step.interactive);

    // Kunai pointing at the target from the roomiest side.
    let arrowBox = null;
    const A = ui.arrow.style;
    if (hole && step.arrow !== false) {
      const aw = compact() ? 52 : 68, ah = Math.round(aw * 0.82), gap = 6;
      const cx = hole.x + hole.w / 2, cy = hole.y + hole.h / 2;
      let x, y, rot;
      if (hole.y > ah + gap + 4) { x = cx; y = hole.y - gap - aw / 2; rot = 90; }                     // above, pointing down
      else if (vh - (hole.y + hole.h) > ah + gap + 4) { x = cx; y = hole.y + hole.h + gap + aw / 2; rot = -90; } // below, pointing up
      else if (hole.x > aw + gap) { x = hole.x - gap - aw / 2; y = cy; rot = 0; }                     // left, pointing right
      else { x = hole.x + hole.w + gap + aw / 2; y = cy; rot = 180; }                                  // right, pointing left
      x = Math.min(vw - aw / 2, Math.max(aw / 2, x));
      A.left = x + 'px'; A.top = y + 'px'; A.width = aw + 'px'; A.setProperty('--rot', rot + 'deg');
      ui.arrow.hidden = false;
      arrowBox = { x: x - aw / 2, y: y - aw / 2, w: aw, h: aw };
    } else {
      ui.arrow.hidden = true;
    }

    // Sensei + speech panel: the corner that covers the spotlight least.
    const g = ui.guide;
    const gw = g.offsetWidth, gh = g.offsetHeight;
    const m = compact() ? 10 : 22;
    let pos;
    if (!hole) {
      pos = { x: (vw - gw) / 2, y: Math.max(m, (vh - gh) / 2), side: 'left' };
    } else {
      const avoid = [hole, arrowBox].filter(Boolean);
      const cands = [
        { x: m, y: vh - gh - m, side: 'left' },
        { x: vw - gw - m, y: vh - gh - m, side: 'right' },
        { x: m, y: m, side: 'left' },
        { x: vw - gw - m, y: m, side: 'right' },
        { x: (vw - gw) / 2, y: vh - gh - m, side: 'left' },
        { x: (vw - gw) / 2, y: m, side: 'left' },
      ];
      const overlap = (c) => avoid.reduce((sum, b) => {
        const ox = Math.max(0, Math.min(c.x + gw, b.x + b.w) - Math.max(c.x, b.x));
        const oy = Math.max(0, Math.min(c.y + gh, b.y + b.h) - Math.max(c.y, b.y));
        return sum + ox * oy;
      }, 0);
      pos = cands.reduce((best, c) => (overlap(c) < overlap(best) ? c : best), cands[0]);
    }
    g.style.left = Math.max(4, Math.round(pos.x)) + 'px';
    g.style.top = Math.max(4, Math.round(pos.y)) + 'px';
    g.classList.toggle('is-right', pos.side === 'right');
  }

  // While a step is up: follow targets that move (battle units), and step
  // aside if a dialog opens late (login bonus, rewards) — then come back.
  function follow(on) {
    clearInterval(followTimer);
    if (!on) return;
    followTimer = setInterval(() => {
      if (current >= 0 && blocked()) { const i = current; follow(false); show(i); return; }
      const step = STEPS[current];
      if (step && step.advanceWhen && safeCall(step.advanceWhen) && current + 1 < STEPS.length) {
        follow(false); show(current + 1); return;
      }
      if (step && step.revertWhen && safeCall(step.revertWhen)) {
        const j = indexOf(step.revertTo);
        if (j >= 0) { follow(false); show(j); return; }
      }
      if (target) layout();
    }, 400);
  }
  let raf = 0;
  const relayout = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layout(); }); };
  window.addEventListener('resize', relayout);
  window.addEventListener('scroll', relayout, true);

  /* ── Showing steps ──────────────────────────────────────────────────── */
  let st = null;

  async function show(i) {
    const my = ++token;
    const step = STEPS[i];
    current = i;
    st.step = step.id; save(st);
    hideChip();
    buildUI();
    ui.root.hidden = true;

    // Wait for dialogs to close and for the step's own condition.
    const since = Date.now();
    while (my === token) {
      const cond = !step.waitUntil || safeCall(step.waitUntil) || (step.waitMax && Date.now() - since > step.waitMax);
      const ok = cond && !blocked();
      if (ok) break;
      await sleep(300);
    }
    if (my !== token) return;

    target = null;
    if (step.target) {
      for (let t = 0; t < 20 && my === token && !target; t++) {
        target = findTarget(step.target);
        if (!target) await sleep(200);
      }
      // Scrolled away (off screen or inside a scrolling column): bring it in.
      if (target && shownFraction(target) < 0.6) {
        try { target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (e) { /* ignore */ }
        await sleep(200);
      }
    }
    if (my !== token) return;
    await sheetReady;
    if (my !== token) return;

    // Fill the panel.
    ui.title.textContent = step.title || '';
    ui.title.hidden = !step.title;
    ui.text.innerHTML = step.text || '';
    ui.count.textContent = `${i + 1} / ${STEPS.length}`;
    ui.back.hidden = i <= runStart(i) || !!step.noBack;
    ui.next.hidden = step.next === false;
    ui.next.textContent = step.next || (i === STEPS.length - 1 ? 'Finish' : 'Next');
    ui.skip.hidden = i === STEPS.length - 1;
    ui.root.classList.toggle('is-interactive', !!step.interactive);
    ui.root.dataset.step = step.id;

    if (stopSensei) stopSensei();
    stopSensei = animateSprite(ui.sensei, compact() ? 132 : (vp().w >= 1200 && vp().h >= 760 ? 232 : 196));

    ui.root.hidden = false;
    ui.root.classList.remove('is-in');
    void ui.root.offsetWidth; // restart the entrance animation
    ui.root.classList.add('is-in');
    layout();
    follow(true);
    try { if (!ui.next.hidden) ui.next.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function safeCall(fn) { try { return !!fn(); } catch (e) { return false; } }

  function close() {
    token++;
    follow(false);
    if (stopSensei) { stopSensei(); stopSensei = null; }
    if (ui) ui.root.hidden = true;
    current = -1;
  }

  function goPage(page) {
    close();
    const url = String(page);
    document.body.style.transition = 'opacity .2s linear';
    document.body.style.opacity = '0';
    setTimeout(() => { window.location.href = url; }, 200);
  }

  function next() {
    if (current < 0) return;
    const i = current, step = STEPS[i];
    if (i === STEPS.length - 1) { finish('done'); return; }
    if (step.await) { close(); return; }                  // continue when they get there
    const n = i + 1;
    if (step.goto) { st.step = STEPS[n].id; save(st); goPage(step.goto); return; }
    if (onPage(STEPS[n])) { show(n); return; }
    st.step = STEPS[n].id; save(st);
    goPage(STEPS[n].page);
  }

  function back() {
    if (current <= runStart(current)) return;
    show(current - 1);
  }

  function finish(status) {
    st = st || {};
    st.status = status;
    save(st);
    close();
    hideChip();
  }
  function skip() { finish('skipped'); }

  /* ── "Continue lesson" tab (player is off the tutorial's path) ──────── */
  let chip = null;
  function showChip(i) {
    if (CHIP_HIDDEN.includes(here.path)) return;
    const step = STEPS[i];
    const resumeIdx = step.resume ? indexOf(step.resume) : -1;
    const dest = resumeIdx >= 0 ? STEPS[resumeIdx] : step;
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'tut-chip';
      chip.innerHTML = `
        <button type="button" class="tut-chip-go"><span class="tut-chip-face" aria-hidden="true"></span><span class="tut-chip-label">Continue lesson</span></button>
        <button type="button" class="tut-chip-x" aria-label="Skip tutorial">&times;</button>`;
      document.body.appendChild(chip);
      chip.querySelector('.tut-chip-x').addEventListener('click', (e) => {
        const b = e.currentTarget;
        if (b.dataset.confirm === '1') { skip(); return; }
        b.dataset.confirm = '1'; chip.classList.add('is-confirm');
        chip.querySelector('.tut-chip-label').textContent = 'Skip tutorial? Tap × again';
        setTimeout(() => { b.dataset.confirm = ''; chip.classList.remove('is-confirm'); chip.querySelector('.tut-chip-label').textContent = 'Continue lesson'; }, 2600);
      });
    }
    chip.querySelector('.tut-chip-go').onclick = () => {
      st.step = dest.id; save(st);
      goPage(dest.page);
    };
    sheetReady.then(() => {
      const face = chip && chip.querySelector('.tut-chip-face');
      // Crop the sensei's head out of the idle sheet's frames.
      if (face && sheetMeta) animateSprite(face, 84, { x: 20, y: 2 });
    });
    chip.hidden = false;
  }
  function hideChip() { if (chip) chip.hidden = true; }

  /* ── Boot ───────────────────────────────────────────────────────────── */
  async function boot() {
    st = load();
    if (!st || (st.status !== 'pending' && st.status !== 'active')) return;
    if (st.status === 'pending') { st.status = 'active'; st.step = STEPS[0].id; st.started = Date.now(); save(st); }
    if (window.PageLoader) await window.PageLoader.ready;
    await sleep(350);
    let i = indexOf(st.step);
    if (i < 0) i = 0;
    const j = stepForPage(i);
    if (j >= 0) show(j);
    else showChip(i);
  }

  window.Tutorial = {
    replay() {
      st = { status: 'active', step: STEPS[0].id, started: Date.now() };
      save(st);
      goPage(STEPS[0].page);
    },
    skip,
    state: load,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
