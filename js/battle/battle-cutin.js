// js/battle/battle-cutin.js - Skill cut-in (Naruto Blazing style)
(() => {
  "use strict";

  /**
   * BattleCutin — a short full-screen cut-in before a jutsu / ultimate /
   * secret technique: the battlefield dims, an ink-splash band in the skill
   * colour sweeps in with the unit's full art inside it, the skill name sits
   * on a torn brush banner at the top, then it all sweeps out and the attack
   * (plus the BattleAttackNames callout band) carries on.
   *
   *   await BattleCutin.play(unit, kind, skillName)   // kind: jutsu|ultimate|secret
   *   await BattleCutin.play(unit, kind, skillName, { force: true, host })
   *     force: ignore the off switch / player-only rule (character-screen preview)
   *     host:  element to mount into instead of #battle-scene
   *
   * Resolves when the cut-in is gone (≤ ~1.3s), immediately when cut-ins are
   * off or not wanted for this unit. Tap / click anywhere skips it.
   * Player skills always get one; enemies only for their ultimate.
   *
   * Off switch: localStorage 'battle_cutins_v1' = '0' (dev panel toggle).
   * Styles: css/battle-cutin.css, art: assets/ui/cutin/*.webp
   */
  const STORE_KEY = 'battle_cutins_v1';
  const IN_MS = 260;
  const OUT_MS = 200;
  const HOLD_MS = { jutsu: 720, ultimate: 820, secret: 820 };
  const ART_WAIT_MS = 280;          // max wait for an unloaded full art
  const KICKER = { jutsu: 'Jutsu', ultimate: 'Ultimate', secret: 'Secret Technique' };
  const SILHOUETTE = 'assets/characters/common/silhouette.png';

  const reducedMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };

  const BattleCutin = {
    current: null,
    _cache: new Map(),

    isEnabled() {
      try { return localStorage.getItem(STORE_KEY) !== '0'; } catch { return true; }
    },
    setEnabled(on) {
      try { localStorage.setItem(STORE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
    },

    /** Full art for the unit's tier (the 1200px .webp), else its portrait. */
    artFor(unit) {
      const ref = unit?._ref;
      const base = ref?.base;
      const tier = ref?.tier || ref?.inst?.tierCode || base?.starMinCode;
      const byTier = base?.artByTier?.[tier];
      return byTier?.full || base?.full || unit?.full || unit?.portrait || SILHOUETTE;
    },

    preload(src) {
      if (!src) return null;
      let img = this._cache.get(src);
      if (!img) {
        img = new Image();
        img.decoding = 'async';
        img.src = src;
        this._cache.set(src, img);
      }
      return img;
    },

    /** Warm the cache for every player unit's full art (called once units exist). */
    preloadTeam(core) {
      const units = [...(core?.activeTeam || []), ...(core?.benchTeam || [])].filter(Boolean);
      units.forEach(u => this.preload(this.artFor(u)));
      ['ink_splash', 'ink_band', 'ink_splatter', 'name_banner']
        .forEach(n => this.preload(`assets/ui/cutin/${n}.webp`));
    },

    wants(unit, kind) {
      if (!this.isEnabled() || !unit || !KICKER[kind]) return false;
      if (document.hidden) return false;
      return !!unit.isPlayer || kind === 'ultimate';
    },

    play(unit, kind, skillName, opts = {}) {
      const ok = opts.force ? !!(unit && KICKER[kind]) : this.wants(unit, kind);
      if (!ok) return Promise.resolve(false);
      this.cancel();

      const host = opts.host || document.getElementById('battle-scene') || document.body;
      const art = this.artFor(unit);
      const img = this.preload(art);
      const name = String(skillName || KICKER[kind]).trim().replace(/!+$/, '');
      const hold = HOLD_MS[kind] || HOLD_MS.jutsu;
      const rm = reducedMotion();

      const el = document.createElement('div');
      el.className = `battle-cutin ci-${kind}${unit.isPlayer ? '' : ' ci-enemy'}${rm ? ' ci-rm' : ''}`;
      el.setAttribute('role', 'presentation');
      el.innerHTML = `
        <div class="ci-dim"></div>
        <div class="ci-stage">
          <div class="ci-streak"></div>
          <div class="ci-splash"></div>
          <div class="ci-splatter"></div>
          <div class="ci-rim"></div>
          <div class="ci-art"><img alt="" draggable="false"><div class="ci-tint"></div></div>
        </div>
        <div class="ci-banner"><div class="ci-banner-bg"></div><span class="ci-name"></span></div>
        <div class="ci-skip">Tap to skip</div>`;
      const pic = el.querySelector('.ci-art img');
      pic.src = art;
      pic.onerror = () => { pic.onerror = null; pic.src = unit.portrait || SILHOUETTE; };
      el.querySelector('.ci-name').textContent = name;
      if (host === document.body) el.style.position = 'fixed';

      return new Promise(resolve => {
        const state = { el, resolve, timers: [], done: false };
        this.current = state;

        const finish = () => {
          if (state.done) return;
          state.done = true;
          state.timers.forEach(clearTimeout);
          el.classList.remove('is-in');
          el.classList.add('is-out');
          setTimeout(() => {
            el.remove();
            if (this.current === state) this.current = null;
            resolve(true);
          }, OUT_MS);
        };
        state.finish = finish;

        // Tap / click skips; keep the tap away from the battlefield handlers.
        const skip = e => { e.stopPropagation(); e.preventDefault?.(); finish(); };
        el.addEventListener('pointerdown', skip);
        ['mousedown', 'touchstart', 'click', 'mouseup', 'touchend', 'pointerup']
          .forEach(t => el.addEventListener(t, e => e.stopPropagation(), { passive: t.startsWith('touch') }));

        const start = () => {
          if (state.done) return;
          // Prompts like "Ultimate ready — drag or tap an enemy" are done with.
          document.querySelectorAll('.battle-narration').forEach(n => n.remove());
          host.appendChild(el);
          this._fitName(el);
          document.fonts?.ready?.then(() => { if (!state.done) this._fitName(el); });
          requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
          state.timers.push(setTimeout(finish, IN_MS + hold));
        };

        // Give an uncached full art a moment to arrive, never more than ART_WAIT_MS.
        if (img && !img.complete) {
          let started = false;
          const go = () => { if (!started) { started = true; start(); } };
          img.addEventListener('load', go, { once: true });
          img.addEventListener('error', go, { once: true });
          state.timers.push(setTimeout(go, ART_WAIT_MS));
        } else {
          start();
        }
      });
    },

    /** Drop any running cut-in at once (a new one replaces it). */
    cancel() {
      const s = this.current;
      if (!s) return;
      s.timers.forEach(clearTimeout);
      s.done = true;
      s.el.remove();
      this.current = null;
      s.resolve(false);
    },

    /** Name: up to 2 lines, shrink until it fits the banner. */
    _fitName(el) {
      const banner = el.querySelector('.ci-banner');
      const name = el.querySelector('.ci-name');
      if (!banner || !name) return;
      const cs = getComputedStyle(banner);
      let size = parseFloat(cs.getPropertyValue('--ci-font')) || 30;
      const min = Math.max(11, size * 0.5);
      const fits = () => {
        const lh = parseFloat(getComputedStyle(name).lineHeight) || size * 1.15;
        // allow for the font's tall ascenders/descenders past the line box
        return name.scrollWidth <= name.clientWidth + 1 && name.scrollHeight <= lh * 2.4;
      };
      name.style.fontSize = `${size}px`;
      while (!fits() && size > min) {
        size -= 1;
        name.style.fontSize = `${size}px`;
      }
    }
  };

  // Warm the art cache once the battle has its teams.
  let tries = 0;
  const warm = setInterval(() => {
    const bm = window.BattleManager;
    if ((bm?.activeTeam || []).length) {
      clearInterval(warm);
      try { BattleCutin.preloadTeam(bm); } catch { /* non-fatal */ }
    } else if (++tries > 60) {
      clearInterval(warm);
    }
  }, 500);

  window.BattleCutin = BattleCutin;
  console.log('[BattleCutin] Module loaded ✅');
})();
