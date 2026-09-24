// js/battle/battle-chakra-wheel.js - Segmented chakra bar + portrait click target
(() => {
  "use strict";

  /**
   * BattleChakraWheel Module (kept under its old name — other modules call
   * createChakraWheel / updateChakraWheel / getWheel / showLightningEffect).
   *
   * The old circular wheel drew chakra arcs around each portrait, where the
   * team holder covered them. It is replaced by:
   *  - a "unit ring": the clickable portrait element inside a holder card
   *    (single / double / triple click → BattleInputManager)
   *  - a segmented chakra bar (.chakra-gauge.cbar[data-gauge-for]) rendered
   *    by the team holder in each card's bottom strip (and on bench mini
   *    cards). This module paints every bar for a unit and animates fill /
   *    drain.
   *
   * Display only — chakra gain/spend rules live in battle-chakra.js.
   */
  const BattleChakraWheel = {
    CLICK_DELAY: 300, // ms between clicks to detect double/triple
    MAX_CHAKRA_SEGMENTS: 10,

    clickTracking: new Map(), // unitId → {count, timer}
    wheelCache: new Map(),    // unitId → .unit-ring element
    chakraHistory: new Map(), // kept for API compatibility

    /* ===== Costs / readiness ===== */

    getCosts(unit) {
      const C = window.BattleCombat;
      let skills = null;
      try { skills = C?.getUnitSkills?.(unit) || null; } catch (_) { skills = null; }
      const safe = (fn, fallback) => { try { const v = fn(); return v ?? fallback; } catch (_) { return fallback; } };
      return {
        jutsu: this.skillCost(unit, skills?.jutsu, 4),
        ult: this.skillCost(unit, skills?.ultimate, 8),
        secret: this.skillCost(unit, skills?.secret, 12),
        hasJutsu: !!skills?.jutsu,
        hasUlt: !!skills?.ultimate,
        hasSecret: !!skills?.secret,
        // Jutsu Sealing makes the skills unusable (same as locked for readiness)
        jutsuUnlocked: safe(() => C?.isJutsuUnlocked?.(unit) && !C?.isSkillSealed?.(unit, 'jutsu'), true),
        ultUnlocked: safe(() => C?.isUltimateUnlocked?.(unit) && !C?.isSkillSealed?.(unit, 'ultimate'), true),
        secretUnlocked: safe(() => C?.isSecretUnlocked?.(unit) && !C?.isSkillSealed?.(unit, 'secret'), false)
      };
    },

    /**
     * Effective chakra cost of one skill entry ({ meta, data } from
     * BattleCombat.getUnitSkills). Prefers the shared helper
     * window.getSkillChakraCost(unit, skillData) (handles chakraCostMax on
     * maxed units); falls back to the entry's raw chakraCost.
     */
    skillCost(unit, entry, fallback) {
      if (!entry) return fallback;
      const helper = window.getSkillChakraCost;
      if (typeof helper === 'function') {
        try {
          const v = Number(helper(unit, entry, fallback));
          if (Number.isFinite(v)) return v;
        } catch (_) { /* fall back */ }
      }
      const v = Number(entry.data?.chakraCost ?? fallback);
      return Number.isFinite(v) ? v : fallback;
    },

    /**
     * Single readiness verdict for a unit's holder card:
     *   'ult'   — chakra covers the (unlocked) ultimate
     *   'jutsu' — chakra covers the (unlocked) jutsu
     *   null    — neither (or the unit is down)
     * Drives the card's lightning border (BattleTeamHolder.updateVolt).
     */
    readinessFor(unit) {
      if (!unit) return null;
      let r;
      try { r = this.getReadiness(unit); } catch (_) { return null; }
      return r.ult ? 'ult' : r.jutsu ? 'jutsu' : null;
    },

    getReadiness(unit, costs = this.getCosts(unit)) {
      const c = Number(unit?.chakra) || 0;
      const alive = (unit?.stats?.hp ?? 1) > 0;
      return {
        jutsu: alive && costs.hasJutsu && costs.jutsuUnlocked && c >= costs.jutsu,
        ult: alive && costs.hasUlt && costs.ultUnlocked && c >= costs.ult,
        secret: alive && costs.hasSecret && costs.secretUnlocked && c >= costs.secret
      };
    },

    /* ===== Gauge markup ===== */

    /**
     * Markup for a unit's segmented chakra bar.
     *   .chakra-gauge.cbar[data-gauge-for]
     *     .cb-track > .cb-ghost (drain trail) + .cb-fill + .cb-segs
     *                 + .cb-tick.tick-jutsu / .tick-ult (cost markers)
     *     .cg-count > b + small      ("6/10", full size only)
     * `mini` renders the bar alone (bench mini cards).
     */
    gaugeHTML(unit, { mini = false } = {}) {
      const max = Math.max(1, Number(unit.maxChakra) || this.MAX_CHAKRA_SEGMENTS);
      const cur = Math.max(0, Math.min(max, Number(unit.chakra) || 0));
      const costs = this.getCosts(unit);
      const ready = this.getReadiness(unit, costs);
      const state = `${ready.jutsu ? ' jutsu-ready' : ''}${ready.ult ? ' ult-ready' : ''}${cur >= max ? ' is-max' : ''}${cur <= 0 ? ' is-empty' : ''}`;
      const id = String(unit.id).replace(/"/g, '&quot;');
      const pct = (cur / max) * 100;
      const tick = (cls, cost, has) => (has && cost > 0 && cost <= max)
        ? `<i class="cb-tick ${cls}" style="left:${(cost / max) * 100}%"></i>` : '';

      return `
        <div class="chakra-gauge cbar${mini ? ' mini' : ''}${state}" data-gauge-for="${id}" data-shown="${cur}" data-max="${max}"
             style="--segs:${max}" title="Chakra ${cur}/${max} · Jutsu ${costs.jutsu} · Ultimate ${costs.ult}">
          <div class="cb-track">
            <div class="cb-ghost" style="width:${pct}%"></div>
            <div class="cb-fill" style="width:${pct}%"></div>
            <div class="cb-segs"></div>
            ${tick('tick-jutsu', costs.jutsu, costs.hasJutsu)}
            ${tick('tick-ult', costs.ult, costs.hasUlt)}
          </div>
          ${mini ? '' : `<div class="cg-count"><b>${cur}</b><small>/${max}</small></div>`}
        </div>`;
    },

    /* ===== Portrait click target ===== */

    /**
     * Wrap the portrait <img> inside `container` in a .unit-ring element.
     * Active rings route clicks to the input manager (attack selection);
     * bench rings stay passive so the bench container's own click (swap)
     * still fires.
     */
    createChakraWheel(unit, container, isBench = false) {
      if (!unit || !container) return null;
      if (container.tagName === 'IMG') container = container.parentElement;
      if (!container) return null;

      const existing = container.querySelector(':scope > .unit-ring');
      if (existing) {
        this.wheelCache.set(unit.id, existing);
        return existing;
      }

      const portraitImg = container.querySelector(':scope > img');
      const unitRing = document.createElement('div');
      unitRing.className = `unit-ring${isBench ? ' is-bench' : ''}`;
      unitRing.dataset.unitId = unit.id;

      const portrait = portraitImg ? portraitImg : document.createElement('img');
      if (!portraitImg) {
        portrait.src = unit.portrait || 'assets/characters/common/silhouette.png';
        portrait.alt = unit.name || '';
      }
      portrait.classList.add('portrait');
      portrait.draggable = false;

      if (portraitImg) portraitImg.replaceWith(unitRing);
      else container.prepend(unitRing);
      unitRing.appendChild(portrait);

      if (!isBench) {
        unitRing.addEventListener('click', (e) => this.handleWheelClick(unit, unitRing, e));
      }

      this.wheelCache.set(unit.id, unitRing);
      if (!this.chakraHistory.has(unit.id)) this.chakraHistory.set(unit.id, new Set());
      return unitRing;
    },

    /* ===== Painting ===== */

    /**
     * Repaint every chakra bar for this unit (animated fill / drain).
     */
    updateChakraWheel(unit, core) {
      if (!unit) return;
      const max = Math.max(1, Number(unit.maxChakra) || this.MAX_CHAKRA_SEGMENTS);
      const cur = Math.max(0, Math.min(max, Number(unit.chakra) || 0));
      const costs = this.getCosts(unit);
      const ready = this.getReadiness(unit, costs);
      const sel = `[data-gauge-for="${String(unit.id).replace(/["\\]/g, '\\$&')}"]`;

      document.querySelectorAll(`.chakra-gauge${sel}`).forEach(g => this.paintGauge(g, cur, max, ready));

      // Card-level readiness classes (ready tags / glow)
      document.querySelectorAll(`#team-holder .unit-card[data-unit-id="${String(unit.id).replace(/["\\]/g, '\\$&')}"]`).forEach(card => {
        card.classList.toggle('jutsu-ready', ready.jutsu);
        card.classList.toggle('ult-ready', ready.ult);
        window.BattleTeamHolder?.updateVolt?.(card, this.readinessFor(unit));
      });

      const wheel = this.wheelCache.get(unit.id);
      if (wheel) {
        wheel.classList.toggle('ultimate-ready', ready.ult);
        wheel.classList.toggle('jutsu-ready', ready.jutsu);
      }
    },

    paintGauge(g, cur, max, ready) {
      const prev = Number(g.dataset.shown);
      const had = Number.isFinite(prev) ? prev : cur;
      g.dataset.shown = cur;
      g.title = g.title.replace(/Chakra \d+\/\d+/, `Chakra ${cur}/${max}`);
      g.classList.toggle('jutsu-ready', ready.jutsu);
      g.classList.toggle('ult-ready', ready.ult);
      g.classList.toggle('is-max', cur >= max);
      g.classList.toggle('is-empty', cur <= 0);

      const countB = g.querySelector('.cg-count b');
      if (countB && countB.textContent !== String(cur)) {
        countB.textContent = cur;
        const count = countB.parentElement;
        count.classList.remove('bump-up', 'bump-down');
        void count.offsetWidth; // restart animation
        count.classList.add(cur > had ? 'bump-up' : 'bump-down');
      }

      const pct = `${(cur / max) * 100}%`;
      const fill = g.querySelector('.cb-fill');
      const ghost = g.querySelector('.cb-ghost');
      if (cur === had || !fill) {
        if (fill) fill.style.width = pct;
        if (ghost) ghost.style.width = pct;
        return;
      }
      // Gain: the ghost jumps ahead (bright leading edge) and the fill
      // sweeps up to it. Spend: the fill snaps down and the ghost drains
      // after it, so the spent chunk reads as a fading gold trail.
      g.classList.remove('cb-gain', 'cb-spend');
      void g.offsetWidth;
      g.classList.add(cur > had ? 'cb-gain' : 'cb-spend');
      fill.style.width = pct;
      if (ghost) ghost.style.width = pct;
      clearTimeout(g._fxTimer);
      g._fxTimer = setTimeout(() => g.classList.remove('cb-gain', 'cb-spend'), 900);
    },

    /**
     * Legacy entry point: callers used to pass the gained amount and this
     * function ADDED it to unit.chakra a second time (every gain counted
     * double). Chakra is already applied by the caller; this only repaints.
     */
    animateChakraGain(unit, amount, core) {
      this.updateChakraWheel(unit, core);
    },

    checkUltimateReady(unit, wheel, core) {
      this.updateChakraWheel(unit, core);
    },

    /* ===== Click Detection (single / double / triple) ===== */

    handleWheelClick(unit, wheel, event) {
      event.stopPropagation();

      let tracking = this.clickTracking.get(unit.id);
      if (!tracking) {
        tracking = { count: 0, timer: null };
        this.clickTracking.set(unit.id, tracking);
      }
      tracking.count++;
      if (tracking.timer) clearTimeout(tracking.timer);

      tracking.timer = setTimeout(() => {
        const clickCount = tracking.count;
        tracking.count = 0;
        const IM = window.BattleInputManager;
        if (!IM) return;
        if (clickCount === 1) IM.handleSingleClick(unit);
        else if (clickCount === 2) IM.handleDoubleClick(unit);
        else IM.handleTripleClick(unit);
      }, this.CLICK_DELAY);
    },

    /* ===== Visual Effects ===== */

    /**
     * Selection flash on the unit's holder card (red = ultimate, gold = secret)
     */
    showLightningEffect(wheel, type = 'red') {
      const host = wheel?.closest?.('.unit-card') || wheel?.parentElement || wheel;
      if (!host) return;
      host.querySelector(':scope > .lightning-effect')?.remove();

      const lightning = document.createElement('div');
      lightning.className = `lightning-effect ${type}`;
      const boltCount = type === 'gold' ? 10 : 9;
      for (let i = 0; i < boltCount; i++) {
        const bolt = document.createElement('div');
        bolt.className = 'lightning-bolt';
        lightning.appendChild(bolt);
      }
      host.appendChild(lightning);
      setTimeout(() => lightning.remove(), type === 'gold' ? 1100 : 750);
    },

    /* ===== Utility ===== */

    resetChakraHistory(unitId) {
      this.chakraHistory.set(unitId, new Set());
    },

    removeChakraWheel(unitId) {
      const wheel = this.wheelCache.get(unitId);
      if (wheel) {
        wheel.remove();
        this.wheelCache.delete(unitId);
      }
      this.clickTracking.delete(unitId);
    },

    clearAll() {
      this.wheelCache.forEach(wheel => wheel.remove());
      this.wheelCache.clear();
      this.clickTracking.clear();
      this.chakraHistory.clear();
    },

    getWheel(unitId) {
      const w = this.wheelCache.get(unitId);
      if (w && !w.isConnected) {
        this.wheelCache.delete(unitId);
        return undefined;
      }
      return w;
    }
  };

  window.BattleChakraWheel = BattleChakraWheel;
  console.log("[BattleChakraWheel] Chakra bar gauge loaded ✅");
})();
