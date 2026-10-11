/* The original game's battle effects, played from the sheets in assets/ui/original/anim
 * (tools/sprites/ipa_rig/build_ui.py):
 *
 *  - hit: sys_0020_hit_dageki, the white starburst with a spark ring, on the target of every
 *    damaging hit (direct hits, combo hits, damage-over-time ticks). The sheet holds three
 *    bursts; consecutive hits on a unit cycle through them.
 *  - death: sys_0012_kemuri_b, the white smoke puff. A dying unit vanishes inside the puff
 *    (no fade): sprite units after their knock-down ('ko') sheet, other units at once.
 *
 *   BattleUiFx.play(name, { host, x, y, height, from, to }) -> Promise (resolves when done)
 *   BattleUiFx.hit(unit, dom)       BattleUiFx.vanish(el, host[, rect]) -> Promise
 *
 * Hooks by wrapping BattleAnimations.showDamage / showComboHit / showDamageNumber.
 * Death: BattleUnits.updateUnitDisplay and BattleHitReact's KO stand-in call vanish().
 * Must load after battle-hit-react.js.
 */
(() => {
  "use strict";

  const BASE = 'assets/ui/original/anim/';
  const HIT = { name: 'sys_0020_hit_dageki', bursts: [[0, 6], [7, 11], [12, 16]] };
  const PUFF = 'sys_0012_kemuri_b';
  const PUFF_HIDE_FRAME = 1;      // the unit disappears once the puff covers it
  const HIT_GAP_MS = 60;          // per unit, so a barrage doesn't stack dozens of bursts
  const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const metas = {};
  function meta(name) {
    if (!metas[name]) {
      metas[name] = fetch(`${BASE}${name}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      const img = new Image(); img.src = `${BASE}${name}.webp`; // warm the sheet
    }
    return metas[name];
  }
  meta(HIT.name); meta(PUFF);

  /**
   * Play frames [from, to] of a sheet with its origin at (x, y) px inside host.
   * height: drawn frame height in px. onFrame(i) is called as each frame shows.
   */
  async function play(name, { host, x, y, height, from = 0, to, onFrame, blend = 'screen' } = {}) {
    const m = await meta(name);
    if (!m || !host) return;
    const last = Math.min(m.frames - 1, to == null ? m.frames - 1 : to);
    const h = height || m.frameHeight;
    const w = h * m.frameWidth / m.frameHeight;
    const rows = Math.ceil(m.frames / m.columns);
    const el = document.createElement('div');
    el.className = `battle-ui-fx battle-ui-fx--${name}`;
    Object.assign(el.style, {
      position: 'absolute', pointerEvents: 'none', zIndex: '60',
      left: `${x - m.origin[0] * w}px`, top: `${y - m.origin[1] * h}px`,
      width: `${w}px`, height: `${h}px`,
      backgroundImage: `url(${BASE}${name}.webp)`, backgroundRepeat: 'no-repeat',
      backgroundSize: `${m.columns * w}px ${rows * h}px`, mixBlendMode: blend,
    });
    host.appendChild(el);
    const show = i => {
      el.style.backgroundPosition = `${-(i % m.columns) * w}px ${-Math.floor(i / m.columns) * h}px`;
      try { onFrame?.(i); } catch (_) { /* cosmetic */ }
    };
    await new Promise(resolve => {
      const t0 = performance.now();
      let shown = -1;
      const tick = now => {
        const i = from + Math.floor((now - t0) / 1000 * m.fps);
        if (i > last || !el.isConnected) { el.remove(); resolve(); return; }
        if (i !== shown) { shown = i; show(i); }
        requestAnimationFrame(tick);
      };
      show(from); shown = from;
      requestAnimationFrame(tick);
    });
  }

  const sceneOf = dom => dom?.scene || document.querySelector('.battle-scene, #battle-scene, #battleScene');

  // centre of the unit's body inside its scene, and the body height
  function bodyOf(unit, dom) {
    const scene = sceneOf(dom);
    const el = scene?.querySelector?.(`.battle-unit[data-unit-id="${unit.id}"]`);
    const host = el?.parentElement;
    if (!el || !host) return null;
    const body = el.querySelector('.unit-sprite') || el;
    const r = body.getBoundingClientRect(), hr = host.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { host, x: r.left + r.width / 2 - hr.left, y: r.top + r.height * 0.55 - hr.top, h: r.height };
  }

  function hit(unit, dom) {
    if (!unit || reduceMotion()) return;
    const now = performance.now();
    if (now - (unit._fxHitAt || 0) < HIT_GAP_MS) return;
    unit._fxHitAt = now;
    const b = bodyOf(unit, dom);
    if (!b) return;
    const k = (unit._fxHitN = ((unit._fxHitN || 0) + 1) % HIT.bursts.length);
    const [from, to] = HIT.bursts[k];
    // the burst is centred on its origin; its core is about a third of the frame
    play(HIT.name, { host: b.host, x: b.x, y: b.y, height: Math.max(170, b.h * 2.6), from, to });
  }

  /** Smoke puff over el; el is hidden (not faded) as the puff covers it. */
  function vanish(el, host, rect) {
    host = host || el?.parentElement;
    if (!el || !host) return Promise.resolve();
    const r = rect || el.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const hide = () => { el.style.transition = 'none'; el.style.visibility = 'hidden'; };
    if (reduceMotion() || (!r.width && !r.height)) { hide(); return Promise.resolve(); }
    const h = Math.max(160, r.height * 1.9);
    return play(PUFF, {
      host, x: r.left + r.width / 2 - hr.left, y: r.bottom - hr.top - r.height * 0.05, height: h,
      blend: 'normal', onFrame: i => { if (i >= PUFF_HIDE_FRAME) hide(); },
    }).then(hide);
  }

  function wrap(obj, name, after) {
    const orig = obj?.[name];
    if (typeof orig !== 'function' || orig._uiFx) return;
    const w = function (...args) {
      const r = orig.apply(this, args);
      try { after.apply(this, args); } catch (e) { console.warn('[UiFx]', e); }
      return r;
    };
    Object.assign(w, orig); // keep markers set by earlier wrappers
    w._uiFx = true;
    obj[name] = w;
  }

  const A = window.BattleAnimations;
  wrap(A, 'showDamage', (unit, amount, isCritical, dom, isHeal) => { if (!isHeal && Number(amount) > 0) hit(unit, dom); });
  wrap(A, 'showComboHit', (unit, amount, isCritical, dom) => { if (Number(amount) > 0) hit(unit, dom); });
  wrap(A, 'showDamageNumber', (unit, amount, isHeal) => { if (!isHeal && Number(amount) > 0 && unit?.stats) hit(unit, null); });

  window.BattleUiFx = { play, hit, vanish };
})();
