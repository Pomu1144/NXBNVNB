/* Hit reactions: every unit visibly reacts when it takes damage.
 *
 *  - Units with an animated sprite play their one-shot 'hit' sheet (flinch,
 *    stagger, recover) and return to idle. During multi-hit barrages the
 *    sheet is restarted at most every HIT_RESTART_MS so the unit keeps
 *    flinching instead of stuttering on frame 0. A unit that is busy with its
 *    own run / jutsu / ultimate sheet is never interrupted.
 *  - When a sprite unit's HP reaches 0 its 'ko' sheet plays on a stand-in
 *    element that holds the last (knocked-down) frame and then fades out, so
 *    the regular death cleanup (BattleUnits.updateUnitDisplay removes the
 *    unit's element after 0.5s) can run untouched.
 *  - Portrait units (no sprite) get a short knockback: white flash, push away
 *    from the enemy side, slight backward tilt, settle.
 *
 * Hooks by wrapping BattleAnimations.showDamage / showComboHit /
 * showDamageNumber and BattleUnits.updateUnitDisplay / attachSprite, so no
 * combat code has to call it. Must load after battle-animations.js and
 * battle-units.js.
 */
(() => {
  "use strict";

  const HIT_RESTART_MS = 250;  // min gap between restarts of the hit sheet
  const PORTRAIT_GAP_MS = 200; // min gap between portrait knockbacks
  const KO_HOLD_MS = 900;      // knocked-down frame stays this long before fading
  const BUSY = new Set(['run', 'jutsu', 'ultimate']);

  const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const sceneOf = () => document.querySelector('.battle-scene, #battle-scene, #battleScene') || document;
  const unitElOf = (unit, dom) =>
    (dom?.scene || sceneOf()).querySelector?.(`.battle-unit[data-unit-id="${unit.id}"]`) || null;

  /* ---------- sprite units ---------- */

  function spriteHit(unit) {
    const sp = unit._sprite;
    if (!sp || unit._noHitSheet) return false;
    const cur = sp.current;
    if (BUSY.has(cur) || cur === 'ko') return true; // mid-attack / moving: leave it alone
    const now = performance.now();
    if (cur === 'hit' && now - (unit._hitAt || 0) < HIT_RESTART_MS) return true; // keep flinching
    unit._hitAt = now;
    sp.play('hit', { then: 'idle' }).catch(() => {
      // No hit sheet for this character: remember, and fall back to idle.
      unit._noHitSheet = true;
      if (unit._sprite === sp && sp.current === 'hit') sp.play('idle').catch(() => {});
    });
    return true;
  }

  /** Short white flash on the sprite slot (the sheet itself carries the motion). */
  function spriteFlash(unitEl) {
    const slot = unitEl?.querySelector('.unit-sprite');
    if (!slot?.animate) return;
    slot.animate([
      { filter: 'brightness(2.4) saturate(0.4)' },
      { filter: 'brightness(1.4)', offset: 0.4 },
      { filter: 'none' }
    ], { duration: 160, easing: 'ease-out' });
  }

  /**
   * Knocked out: play 'ko' on a stand-in placed exactly over the unit's
   * sprite, hide the real sprite, hold the last frame, then fade out.
   */
  function spriteKO(unit, dom) {
    const sp = unit._sprite;
    if (!sp || unit._koShown || !window.SpritePlayer) return;
    const base = window.SpritePlayer.pathFor(unit.charId);
    const unitEl = unitElOf(unit, dom);
    const slot = unitEl?.querySelector('.unit-sprite');
    const host = unitEl?.parentElement;
    if (!base || !slot || !host) return;
    unit._koShown = true;

    const hostR = host.getBoundingClientRect();
    const slotR = slot.getBoundingClientRect();
    const elR = sp.el.getBoundingClientRect();
    const idleH = parseFloat(getComputedStyle(unitEl).getPropertyValue('--sprite-h'));
    const flipped = /scaleX\(\s*-1/.test(sp.el.style.transform || '');

    const stand = document.createElement('div');
    stand.className = 'battle-unit-ko';
    Object.assign(stand.style, {
      position: 'absolute',
      left: `${slotR.left + slotR.width / 2 - hostR.left}px`,
      top: `${elR.bottom - hostR.top}px`,
      width: '0', height: '0', pointerEvents: 'none',
      zIndex: getComputedStyle(unitEl).zIndex === 'auto' ? '5' : getComputedStyle(unitEl).zIndex,
    });
    const inner = document.createElement('div');
    Object.assign(inner.style, {
      position: 'absolute', left: '0', bottom: '0', width: '600px', marginLeft: '-300px',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
    });
    stand.appendChild(inner);
    host.appendChild(stand);

    const ko = window.SpritePlayer.create(inner, base, {
      height: Number.isFinite(idleH) && idleH > 0 ? Math.round(idleH) : (sp.el.offsetHeight || 101),
      flip: flipped,
    });
    let swapped = false;
    const cleanup = () => { try { ko.destroy(); } catch (_) { /* gone */ } stand.remove(); };
    ko.meta('ko').then(meta => {
      // Swap only once the sheet is ready, so there is no blank frame.
      sp.el.style.visibility = 'hidden';
      swapped = true;
      return ko.play('ko').then(() => {
        const last = meta.frames - 1; // make sure the final (down) frame is the one held
        const w = parseFloat(ko.el.style.width), h = parseFloat(ko.el.style.height);
        ko.el.style.backgroundPosition = `${-(last % meta.columns) * w}px ${-Math.floor(last / meta.columns) * h}px`;
      });
    }).then(() => new Promise(r => setTimeout(r, KO_HOLD_MS)))
      .then(() => {
        const a = stand.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
        if (a) a.onfinish = cleanup; else cleanup();
      })
      .catch(() => {
        // No ko sheet: let the regular fade handle it.
        if (!swapped) cleanup();
        else { sp.el.style.visibility = ''; cleanup(); }
      });
  }

  /* ---------- portrait units ---------- */

  function portraitKnockback(unit, unitEl, strong) {
    const body = unitEl.querySelector('.unit-sprite img') || unitEl.querySelector('.unit-sprite');
    if (!body?.animate) return;
    const now = performance.now();
    if (now - (unit._hitAt || 0) < PORTRAIT_GAP_MS) return;
    unit._hitAt = now;
    // Players stand on the left and get pushed left; enemies get pushed right.
    const dir = unit.isPlayer ? -1 : 1;
    const k = (strong ? 1.35 : 1) * (reduceMotion() ? 0.3 : 1);
    if (!body.style.transformOrigin) body.style.transformOrigin = '50% 100%';
    body.animate([
      { translate: '0 0', rotate: '0deg', filter: 'brightness(3.2) saturate(0)' },
      { translate: `${dir * 11 * k}px ${-2 * k}px`, rotate: `${dir * 7 * k}deg`, filter: 'brightness(2.2) saturate(0.4)', offset: 0.14 },
      { translate: `${dir * 8 * k}px 0`, rotate: `${dir * 5 * k}deg`, filter: 'brightness(1.3)', offset: 0.32 },
      { translate: `${-dir * 3 * k}px 0`, rotate: `${-dir * 1.5 * k}deg`, filter: 'none', offset: 0.55 },
      { translate: `${dir * 1.5 * k}px 0`, rotate: `${dir * 0.5 * k}deg`, offset: 0.78 },
      { translate: '0 0', rotate: '0deg', filter: 'none' }
    ], { duration: 400, easing: 'ease-out' });
  }

  /* ---------- entry point ---------- */

  function react(unit, dom, { strong = false } = {}) {
    try {
      if (!unit || !unit.stats) return;
      const unitEl = unitElOf(unit, dom);
      if (unit._sprite) {
        if (unit.stats.hp <= 0) { spriteKO(unit, dom); return; }
        if (spriteHit(unit)) spriteFlash(unitEl);
        return;
      }
      if (unitEl && unit.stats.hp > 0) portraitKnockback(unit, unitEl, strong);
    } catch (e) {
      console.warn('[HitReact] reaction failed (cosmetic)', e);
    }
  }

  /* ---------- hooks ---------- */

  function wrap(obj, name, after) {
    const orig = obj?.[name];
    if (typeof orig !== 'function' || orig._hitReact) return;
    const w = function (...args) {
      const r = orig.apply(this, args);
      try { after.apply(this, args); } catch (e) { console.warn('[HitReact]', e); }
      return r;
    };
    w._hitReact = true;
    obj[name] = w;
  }

  const A = window.BattleAnimations;
  wrap(A, 'showDamage', (unit, amount, isCritical, dom, isHeal) => {
    if (isHeal || !(Number(amount) > 0)) return;
    react(unit, dom, { strong: !!isCritical });
  });
  wrap(A, 'showComboHit', (unit, amount, isCritical, dom) => {
    if (!(Number(amount) > 0)) return;
    react(unit, dom, { strong: !!isCritical });
  });
  // Damage-over-time ticks (status effects) use showDamageNumber(unit, amount, isHeal, isCrit).
  wrap(A, 'showDamageNumber', (unit, amount, isHeal) => {
    if (isHeal || !(Number(amount) > 0) || !unit?.stats) return;
    react(unit, null);
  });

  const U = window.BattleUnits;
  // Death: start the KO stand-in before the regular fade/removal runs.
  if (U && typeof U.updateUnitDisplay === 'function' && !U.updateUnitDisplay._hitReact) {
    const orig = U.updateUnitDisplay;
    U.updateUnitDisplay = function (unit, core) {
      try {
        if (unit?._sprite && unit.stats && unit.stats.hp <= 0) spriteKO(unit, core?.dom);
        else if (unit && unit.stats?.hp > 0) unit._koShown = false; // revived
      } catch (e) { console.warn('[HitReact]', e); }
      return orig.apply(this, arguments);
    };
    U.updateUnitDisplay._hitReact = true;
  }
  // Warm the hit / ko sheets when a sprite is mounted so the first flinch is instant.
  wrap(U, 'attachSprite', unit => {
    const base = unit?.charId && window.SpritePlayer?.pathFor(unit.charId);
    if (!base) return;
    window.SpritePlayer.preload(base, 'hit').catch(() => {});
    window.SpritePlayer.preload(base, 'ko').catch(() => {});
  });

  window.BattleHitReact = { react, spriteKO };
})();
