// js/battle/battle-attack-names.js - Skill callout (Blazing style)
(() => {
  "use strict";

  /**
   * BattleAttackNames — the ONE on-screen callout for a jutsu, ultimate or
   * secret technique (player and enemy alike). A full-width black band with
   * gold rules sits just below the HUD / speed gauge and shows the skill name
   * exactly as written in the data. Styles: css/battle-attack-names.css.
   *
   *   showAttackName(name, type, { hold })
   *     type: 'jutsu' | 'ultimate' | 'secret' ('normal' is ignored)
   *     hold: ms before it fades out (default 1400). Pass hold: 'manual' to
   *           keep it up until hideAttackName() is called (a safety timeout
   *           still removes it after 8s).
   *   hideAttackName()  — fade the current callout out now.
   *
   * A new callout replaces the old one immediately.
   */
  const KICKER = { jutsu: 'Jutsu', ultimate: 'Ultimate', secret: 'Secret' };
  const FADE_MS = 200;
  const DEFAULT_HOLD = 1400;
  const MANUAL_MAX = 8000;

  const BattleAttackNames = {
    currentDisplay: null,
    _timers: [],

    _clearTimers() {
      this._timers.forEach(clearTimeout);
      this._timers = [];
    },

    _host() {
      return document.getElementById('battle-scene') || document.body;
    },

    /** Place the band just under the speed gauge (or the HUD). */
    _anchor(el, host) {
      const hostRect = host.getBoundingClientRect();
      let bottom = 0;
      ['#speed-gauge-track', '.battle-hud'].forEach(sel => {
        const n = document.querySelector(sel);
        if (!n) return;
        const r = n.getBoundingClientRect();
        if (r.height > 0 && getComputedStyle(n).display !== 'none') bottom = Math.max(bottom, r.bottom);
      });
      const top = bottom ? bottom - hostRect.top : hostRect.height * 0.08;
      // Clear the speed-gauge portraits, which overhang the track a little.
      const gap = document.documentElement.classList.contains('is-mobile') ? 6 : 10;
      el.style.top = `${Math.max(0, Math.round(top + gap))}px`;
    },

    /** Shrink the name until it fits between the kicker columns. */
    _fit(el) {
      const name = el.querySelector('.sc-name');
      const kicker = el.querySelector('.sc-kicker');
      const body = el.querySelector('.sc-body');
      if (!name || !body) return;
      const w = el.clientWidth;
      if (!w) return;
      let side = w * 0.06;
      if (kicker) {
        const k = kicker.getBoundingClientRect();
        const e = el.getBoundingClientRect();
        side = Math.max(side, k.right - e.left + 14);
      }
      // Keep the name centred: equal padding on both sides.
      if (w - side * 2 < w * 0.5) {        // very narrow screen: drop the kicker
        kicker?.remove();
        side = w * 0.05;
      }
      body.style.setProperty('--sc-side', `${Math.round(side)}px`);
      const avail = w - side * 2;
      const cs = getComputedStyle(el);
      let size = parseFloat(cs.getPropertyValue('--sc-font')) || 30;
      const min = Math.max(11, size * 0.5);
      name.style.fontSize = `${size}px`;
      el.style.setProperty('--sc-fit', '1');
      while (name.scrollWidth > avail && size > min) {
        size -= 1;
        name.style.fontSize = `${size}px`;
      }
      // Last resort for absurdly long names: squeeze horizontally.
      if (name.scrollWidth > avail) {
        el.style.setProperty('--sc-fit', (avail / name.scrollWidth).toFixed(3));
      }
    },

    showAttackName(attackName, type = 'jutsu', opts = {}) {
      if (!attackName || type === 'normal') return null;
      const kind = KICKER[type] ? type : 'jutsu';
      const text = String(attackName).trim().replace(/!+$/, '');

      // Replace any callout still on screen.
      this._clearTimers();
      if (this.currentDisplay) this.currentDisplay.remove();
      document.querySelectorAll('.skill-callout').forEach(n => n.remove());
      // A lingering prompt ("Jutsu ready — drag or tap an enemy") would sit
      // under the band as a second line of text; the skill has fired now.
      document.querySelectorAll('.battle-narration').forEach(n => n.remove());

      const host = this._host();
      const el = document.createElement('div');
      el.className = `skill-callout sc-${kind}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML =
        '<div class="sc-band"></div>' +
        '<div class="sc-rule top"></div><div class="sc-rule bottom"></div>' +
        '<div class="sc-body"><span class="sc-kicker"></span><span class="sc-name"></span></div>';
      el.querySelector('.sc-kicker').textContent = KICKER[kind];
      el.querySelector('.sc-name').textContent = text;
      if (host === document.body) el.style.position = 'fixed';
      host.appendChild(el);
      this.currentDisplay = el;

      this._anchor(el, host);
      this._fit(el);
      // Re-fit once the web font has loaded (metrics change).
      document.fonts?.ready?.then(() => { if (this.currentDisplay === el) this._fit(el); });

      requestAnimationFrame(() => el.classList.add('is-in'));

      const hold = opts.hold === 'manual' ? MANUAL_MAX : (Number(opts.hold) || DEFAULT_HOLD);
      this._timers.push(setTimeout(() => this.hideAttackName(el), hold));
      return el;
    },

    /** Fade the callout out (the current one, or `el` if it is still current). */
    hideAttackName(el) {
      const cur = this.currentDisplay;
      if (!cur || (el && el !== cur)) return;
      this._clearTimers();
      cur.classList.remove('is-in');
      cur.classList.add('is-out');
      this._timers.push(setTimeout(() => {
        cur.remove();
        if (this.currentDisplay === cur) this.currentDisplay = null;
      }, FADE_MS + 20));
    },

    /**
     * Get skill name from unit's skill data
     * @param {Object} unit - The unit performing the attack
     * @param {string} skillType - 'jutsu', 'ultimate', 'secret'
     * @returns {string} The skill name
     */
    getSkillName(unit, skillType) {
      const skills = window.BattleCombat?.getUnitSkills(unit);
      if (!skills || !skills[skillType]) {
        return null;
      }
      const skillData = skills[skillType].data;
      return skillData?.name || skillData?.skillName || `${unit.name}'s ${skillType}`;
    }
  };

  window.BattleAttackNames = BattleAttackNames;
  console.log("[BattleAttackNames] Module loaded ✅");
})();
