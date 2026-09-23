// js/battle/battle-team-holder.js - Team Holder UI: unit cards with chakra bars + backup mini cards
(() => {
  "use strict";

  /**
   * BattleTeamHolder Module
   * Bottom-of-screen row of unit cards (assets/ui/battle/unit_card.webp):
   * - portrait inside the card window (click = attack select, drop = swap)
   * - name + HP bar inside the window
   * - segmented chakra bar + "6/10" in the card's bottom strip, with JUTSU /
   *   ULT cost ticks and ready tags driven by the unit's real skill costs
   * - the slot's backup (back-N) as a 1/3-size mini card tucked on the
   *   card's bottom-right corner (own HP + chakra bar). Tap / click / drag it
   *   onto the card to swap: the mini grows into the slot while the active
   *   card shrinks into the corner.
   * - acting unit's card raised and glowing
   */
  const BattleTeamHolder = {
    // DOM references
    teamHolder: null,
    activeUnitsRow: null,
    benchUnitsRow: null,

    // Switch lock to prevent concurrent switches
    isSwitching: false,

    /* ===== Initialization ===== */

    /**
     * Initialize team holder
     */
    init(core) {
      this.teamHolder = document.getElementById('team-holder');

      if (!this.teamHolder) {
        console.error('[TeamHolder] Team holder element not found!');
        return false;
      }

      console.log('[TeamHolder] Initialized');
      return true;
    },

    /* ===== Rendering ===== */

    CARD_ART: 'assets/ui/battle/unit_card.webp',

    esc(v) {
      return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    },

    /**
     * Backup pairing: activeTeam[i] ↔ benchTeam[pairs[i]] (-1 = no backup).
     * Team arrays are compacted (empty slots dropped), so units pair by
     * positionId (front-N ↔ back-N), not by array index. A backup whose
     * slot has no front unit is lent to the first front unit without one.
     */
    getPairs(core) {
      const act = core.activeTeam || [];
      const bench = core.benchTeam || [];
      const pairs = act.map(() => -1);
      const used = new Set();
      act.forEach((a, i) => {
        if (!a) return;
        const j = bench.findIndex((b, k) => b && !used.has(k) && b.positionId === a.positionId);
        if (j >= 0) { pairs[i] = j; used.add(j); }
      });
      const activePos = new Set(act.filter(Boolean).map(a => a.positionId));
      bench.forEach((b, k) => {
        if (!b || used.has(k) || activePos.has(b.positionId)) return;
        const i = pairs.findIndex((p, idx) => p < 0 && act[idx]);
        if (i >= 0) { pairs[i] = k; used.add(k); }
      });
      return pairs;
    },

    /**
     * Render all player units in team holder: one card per active slot
     * (its backup nested as a mini card on the card's corner).
     */
    renderTeamHolder(core) {
      if (!this.teamHolder) {
        console.error('[TeamHolder] Not initialized - teamHolder element not found!');
        return;
      }

      const TEAM_SIZE = 4;
      const pairs = this.getPairs(core);
      this.teamHolder.innerHTML = '';
      this.teamHolder.classList.toggle('has-bench', pairs.some(p => p >= 0));

      for (let i = 0; i < TEAM_SIZE; i++) {
        const activeUnit = core.activeTeam?.[i];
        const benchUnit = pairs[i] >= 0 ? core.benchTeam[pairs[i]] : null;
        if (activeUnit) {
          this.teamHolder.insertAdjacentHTML('beforeend', this.createUnitCardHTML(activeUnit, benchUnit, i, core));
        }
      }

      this.attachAllChakraWheels(core);
      this.startSync(core);
    },

    /**
     * Card markup. Layering inside .uc-body (bottom → top):
     *   .active-portrait-container (portrait clipped to the card window,
     *   also the click / drop target covering the whole card)
     *   → .uc-art (unit_card.webp frame, pointer-events none)
     *   → slot number, name / HP inside the window, chakra bar in the
     *     bottom strip, ready tags.
     * The backup mini card (.uc-mini) is a sibling of .uc-body so it can
     * hang over the corner and be animated on its own.
     *
     * DOM order matters: external code does
     *   teamHolder.querySelector(`[data-unit-id=ID]`).querySelector('.unit-hp-fill')
     * so the card (which carries the active unit id) must contain the
     * active HP bar before the mini card's HP bar.
     */
    createUnitCardHTML(activeUnit, benchUnit, index, core = this._core || window.BattleManager) {
      const e = (v) => this.esc(v);
      const hpPct = Math.max(0, Math.min(100, (activeUnit.stats.hp / activeUnit.stats.maxHP) * 100));
      const isDead = activeUnit.stats.hp <= 0;
      const W = window.BattleChakraWheel;
      const ready = W ? W.getReadiness(activeUnit) : { jutsu: false, ult: false };
      const volt = W?.readinessFor ? W.readinessFor(activeUnit) : null;
      const gauge = W ? W.gaugeHTML(activeUnit) : '';
      const silhouette = `this.onerror=null;this.src='assets/characters/common/silhouette.png';`;
      const pos = activeUnit.positionId || index + 1;
      const acting = core?.turns?.currentUnit === activeUnit;

      let miniHTML = '';
      if (benchUnit) {
        const bHp = Math.max(0, Math.min(100, (benchUnit.stats.hp / benchUnit.stats.maxHP) * 100));
        miniHTML = `
          <div class="uc-mini bench-portrait-container${benchUnit.stats.hp <= 0 ? ' is-dead' : ''}${acting || isDead ? ' can-swap' : ''}"
               data-unit-id="${e(benchUnit.id)}" data-unit-type="bench" draggable="true"
               role="button" tabindex="0" title="Backup ${pos}: swap in ${e(benchUnit.name)}">
            <img src="${e(benchUnit.portrait)}" alt="${e(benchUnit.name)}" draggable="false" onerror="${silhouette}">
            <img class="uc-art" src="${this.CARD_ART}" alt="" draggable="false" aria-hidden="true">
            <span class="ucm-tag" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 2 1.5 5.5H4V11h2V5.5h2.5zM11 14l3.5-3.5H12V5h-2v5.5H7.5z" fill="currentColor"/></svg>${e(pos)}</span>
            <div class="ucm-bars">
              <div class="unit-hp-bar bench-hp"><div class="unit-hp-fill" style="width:${bHp}%"></div></div>
              ${W ? W.gaugeHTML(benchUnit, { mini: true }) : ''}
            </div>
          </div>`;
      }

      return `
        <div class="unit-card${benchUnit ? ' has-backup' : ''}${isDead ? ' is-dead' : ''}${acting ? ' is-acting' : ''}${ready.jutsu ? ' jutsu-ready' : ''}${ready.ult ? ' ult-ready' : ''}"
             data-card-index="${index}" data-unit-id="${e(activeUnit.id)}" data-pos="${e(pos)}" data-volt="${volt || ''}">
          <div class="uc-body">
            <div class="active-portrait-container" data-unit-id="${e(activeUnit.id)}" data-unit-type="active" data-drop-zone="true">
              <img src="${e(activeUnit.portrait)}" alt="${e(activeUnit.name)}" draggable="false" onerror="${silhouette}">
            </div>
            <img class="uc-art" src="${this.CARD_ART}" alt="" draggable="false" aria-hidden="true">
            <span class="uc-pos" aria-label="Position ${e(pos)}">${e(pos)}</span>
            <div class="uc-ready" aria-hidden="true">
              <span class="uc-tag tag-ult">ULT</span>
              <span class="uc-tag tag-jutsu">JUTSU</span>
            </div>
            <div class="unit-info">
              <div class="unit-name">${e(activeUnit.name)}</div>
              <div class="unit-hp-bar"><div class="unit-hp-fill" style="width:${hpPct}%"></div></div>
            </div>
            <div class="uc-strip">${gauge}</div>
          </div>
          ${volt ? this.voltHTML(volt) : ''}
          ${miniHTML}
        </div>
      `;
    },

    /* ===== Lightning border (chakra readiness) =====
       Blue crackle = jutsu affordable, red = ultimate affordable (red wins).
       Readiness comes from BattleChakraWheel.readinessFor(unit); the SVGs
       are only in the DOM while a card is charged. Strokes follow the card
       art's outer outline (360×515 art space) and are bent by shared
       feTurbulence + feDisplacementMap filters (#ucv-*).
       Two layers per card:
         .uc-volt-glow  static blurred halo (painted once, only its opacity
                        breathes — composited)
         .uc-volt       crackling rim + two arcs running around the edge,
                        own compositor layer, repainted by ONE shared
                        ~14 fps ticker (new noise seed, arc offsets,
                        random bright discharges) — lightning reads fine at
                        that rate and it keeps paint cost flat. */

    // unit_card.webp outer outline (chamfered TL / TR / BR corners)
    VOLT_PATH: 'M60 20L78 2L346 27L358 42L309 499L295 504L10 514L1 501Z',
    VOLT_TICK_MS: 70,

    voltHTML(state) {
      this.ensureVoltDefs();
      const d = this.VOLT_PATH;
      const p = (cls) => `<path class="${cls}" d="${d}" pathLength="1000"/>`;
      const svg = (cls, inner) =>
        `<svg class="${cls} is-${state}" viewBox="-36 -36 432 587" preserveAspectRatio="none" aria-hidden="true" focusable="false">${inner}</svg>`;
      return `
          ${svg('uc-volt-glow', `<g filter="url(#ucv-soft)">${p('ucv-glow')}</g>`)}
          ${svg('uc-volt', `
            <g filter="url(#ucv-crackle)">${p('ucv-rim')}</g>
            <g class="ucv-arcs" filter="url(#ucv-arc)">
              ${p('ucv-arc a1 c')}${p('ucv-arc a1 h')}
              ${p('ucv-arc a2 c')}${p('ucv-arc a2 h')}
              ${p('ucv-flash')}
            </g>`)}`;
    },

    /** Shared filter defs (one hidden <svg> on body, built once). */
    ensureVoltDefs() {
      if (document.getElementById('ucv-defs')) return;
      const box = 'filterUnits="userSpaceOnUse" x="-36" y="-36" width="432" height="587"';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'ucv-defs';
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      svg.innerHTML = `
        <defs>
          <filter id="ucv-soft" ${box}>
            <feGaussianBlur stdDeviation="9"/>
          </filter>
          <filter id="ucv-crackle" ${box}>
            <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="2" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" result="d"/>
            <feGaussianBlur in="d" stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="d"/></feMerge>
          </filter>
          <filter id="ucv-arc" ${box}>
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="5" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="52" xChannelSelector="G" yChannelSelector="R" result="d"/>
            <feGaussianBlur in="d" stdDeviation="6" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="d"/></feMerge>
          </filter>
        </defs>`;
      document.body.appendChild(svg);
      this._voltNoise = [...svg.querySelectorAll('feTurbulence')];
    },

    /**
     * Show / swap / remove the lightning on a card. `state` is
     * 'ult' | 'jutsu' | null (BattleChakraWheel.readinessFor). No-op when
     * unchanged, so it is safe to call on every chakra repaint.
     */
    updateVolt(card, state) {
      if (!card) return;
      const want = state === 'ult' || state === 'jutsu' ? state : '';
      const cur = card.querySelectorAll(':scope > .uc-volt, :scope > .uc-volt-glow');
      if (card.dataset.volt === want && (cur.length > 0) === !!want) return;
      card.dataset.volt = want;
      cur.forEach(el => el.remove());
      if (!want) return;
      const body = card.querySelector(':scope > .uc-body');
      if (body) body.insertAdjacentHTML('afterend', this.voltHTML(want));
      else card.insertAdjacentHTML('beforeend', this.voltHTML(want));
      this.startVoltTicker();
    },

    /** One shared animation clock for every charged card. */
    startVoltTicker() {
      if (this._voltTimer) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const t0 = performance.now();
      this._voltTimer = setInterval(() => {
        const volts = document.querySelectorAll('#team-holder .uc-volt');
        if (!volts.length) {
          clearInterval(this._voltTimer);
          this._voltTimer = null;
          return;
        }
        if (document.hidden) return;
        // fresh noise = the whole rim re-crackles
        this._voltNoise?.forEach(n => n.setAttribute('seed', 1 + Math.floor(Math.random() * 997)));
        const t = (performance.now() - t0) / 1000;
        volts.forEach((v, i) => {
          const ult = v.classList.contains('is-ult');
          const run = (ult ? 740 : 520) * t + i * 263;      // path units / s
          v.style.setProperty('--ucv-o1', `${-(run % 1000)}`);
          v.style.setProperty('--ucv-o2', `${(run * 0.7) % 1000}`);
          // random bright discharge, decaying over a few ticks
          let f = Number(v._flash || 0) * 0.45;
          if (Math.random() < (ult ? 0.07 : 0.045)) f = 0.75 + Math.random() * 0.25;
          v._flash = f < 0.05 ? 0 : f;
          v.style.setProperty('--ucv-f', v._flash.toFixed(2));
        });
      }, this.VOLT_TICK_MS);
    },

    /**
     * Wire portrait click targets and drag/drop + swap listeners
     */
    attachAllChakraWheels(core) {
      const W = window.BattleChakraWheel;

      this.teamHolder.querySelectorAll('[data-unit-type="active"]').forEach(container => {
        if (container.dataset.wired) return;
        container.dataset.wired = '1';
        const unitId = container.dataset.unitId;
        const unit = core.activeTeam.find(u => u.id === unitId);
        if (unit && W) {
          W.createChakraWheel(unit, container, false);
          W.updateChakraWheel(unit, core);
        }

        const card = container.closest('.unit-card');
        container.addEventListener('dragover', (e) => {
          if (!card?.querySelector('.uc-mini')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          card.classList.add('drag-over');
        });

        container.addEventListener('dragleave', () => {
          card?.classList.remove('drag-over');
        });

        container.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          card?.classList.remove('drag-over');
          // Only this card's own backup can be dropped on it
          const benchUnitId = e.dataTransfer.getData('text/plain');
          const mini = card?.querySelector('.uc-mini');
          if (mini && mini.dataset.unitId === benchUnitId) {
            this.switchUnits(parseInt(card.dataset.cardIndex), core);
          }
        });
      });

      this.teamHolder.querySelectorAll('[data-unit-type="bench"]').forEach(container => {
        if (container.dataset.wired) return;
        container.dataset.wired = '1';
        const unitId = container.dataset.unitId;
        const unit = core.benchTeam.find(u => u.id === unitId);
        if (unit && W) {
          W.createChakraWheel(unit, container, true);
          W.updateChakraWheel(unit, core);
        }
        const cardIndexOf = () => parseInt(container.closest('.unit-card')?.dataset.cardIndex);

        container.addEventListener('click', (e) => {
          e.stopPropagation();
          if (container._touchSwapAt && performance.now() - container._touchSwapAt < 600) return;
          this.switchUnits(cardIndexOf(), core);
        });
        container.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          this.switchUnits(cardIndexOf(), core);
        });

        // Mouse: HTML5 drag onto the card
        container.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', unitId);
          container.classList.add('is-dragging');
        });
        container.addEventListener('dragend', () => {
          container.classList.remove('is-dragging');
        });

        // Touch: HTML5 DnD does not fire, so drag with pointer events
        container.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' || !e.isPrimary) return;
          this.miniTouchDrag(e, container, cardIndexOf, core);
        });
      });

      this.syncFromCore(core, true);
    },

    /**
     * Touch drag of a mini card: it follows the finger; releasing it over
     * its own card swaps. A plain tap is left to the click handler.
     */
    miniTouchDrag(e, mini, cardIndexOf, core) {
      const card = mini.closest('.unit-card');
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      try { mini.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        moved = true;
        mini.classList.add('is-dragging');
        mini.style.translate = `${dx}px ${dy}px`;
        const r = card.querySelector('.uc-body').getBoundingClientRect();
        const over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        card.classList.toggle('drag-over', over);
      };
      const up = (ev) => {
        mini.removeEventListener('pointermove', move);
        mini.removeEventListener('pointerup', up);
        mini.removeEventListener('pointercancel', up);
        mini.classList.remove('is-dragging');
        mini.style.translate = '';
        const over = card.classList.contains('drag-over');
        card.classList.remove('drag-over');
        if (moved) {
          mini._touchSwapAt = performance.now(); // swallow the trailing click
          if (over && ev.type === 'pointerup') this.switchUnits(cardIndexOf(), core);
        }
      };
      mini.addEventListener('pointermove', move);
      mini.addEventListener('pointerup', up);
      mini.addEventListener('pointercancel', up);
    },

    /**
     * Attach chakra wheel to a unit element (legacy helper)
     */
    attachChakraWheel(unit, unitElement, isActive) {
      const container = unitElement.querySelector('.active-portrait-container, .bench-portrait-container, .portrait-container');
      if (!container || !window.BattleChakraWheel) return;
      window.BattleChakraWheel.createChakraWheel(unit, container, !isActive);
      window.BattleChakraWheel.updateChakraWheel(unit, window.BattleManager || {});
    },

    /* ===== Live sync ===== */

    /**
     * Some systems change chakra / HP / the acting unit without notifying
     * the holder (passives, buffs, turn start). A light poll keeps the
     * cards honest; it only touches the DOM when a value changed.
     */
    startSync(core) {
      this._core = core;
      if (this._syncTimer) return;
      this._syncTimer = setInterval(() => {
        if (!this.teamHolder?.isConnected) return;
        this.syncFromCore(this._core || window.BattleManager);
      }, 150);
    },

    syncFromCore(core, force = false) {
      if (!core || !this.teamHolder) return;
      const W = window.BattleChakraWheel;
      const units = [...(core.activeTeam || []), ...(core.benchTeam || [])].filter(Boolean);
      this._seen = this._seen || new Map();

      units.forEach(u => {
        const key = `${u.chakra}|${u.stats?.hp}|${u.stats?.maxHP}`;
        if (!force && this._seen.get(u.id) === key) return;
        this._seen.set(u.id, key);
        this.updateUnitHP(u);
        if (W) W.updateChakraWheel(u, core);
      });

      const acting = core.turns?.currentUnit || null;
      if (force || acting !== this._acting) {
        this._acting = acting;
        this.highlightActingUnit(acting);
      }
    },

    /* ===== Unit Switching ===== */

    SWAP_MS: 300,

    /**
     * Swap the active unit in card `cardIndex` with its backup.
     * Rules (unchanged): only during that active unit's own turn, unless
     * the active unit is down (then its backup may come in any time) or
     * `force` (auto-promote from battle-core). A downed backup can't come in.
     * INDEPENDENT of attack selection - does NOT touch input state.
     * @param {number} cardIndex - index into core.activeTeam (0-3)
     * @param {Object} core - Battle core reference
     * @param {boolean} force - skip the rules (auto-promote)
     * @param {number} [benchIndex] - explicit backup index (default: pairing)
     */
    switchUnits(cardIndex, core, force = false, benchIndex) {
      if (this.isSwitching) {
        console.warn(`[TeamHolder] Already switching, ignoring request`);
        return;
      }
      if (!Number.isInteger(cardIndex)) return;

      const bi = Number.isInteger(benchIndex) ? benchIndex : this.getPairs(core)[cardIndex];
      const activeUnit = core.activeTeam[cardIndex];
      const benchUnit = bi >= 0 ? core.benchTeam[bi] : null;

      if (!activeUnit || !benchUnit) {
        console.warn(`[TeamHolder] Cannot switch - missing unit at index ${cardIndex}`);
        return;
      }

      const card = this.teamHolder?.querySelector(`.unit-card[data-card-index="${cardIndex}"]`);
      const mini = card?.querySelector('.uc-mini');
      const deny = (msg) => {
        console.warn(`[TeamHolder] ${msg}`);
        window.BattleNarrator?.narrate?.(msg, core);
        if (mini) {
          mini.classList.remove('deny');
          void mini.offsetWidth;
          mini.classList.add('deny');
          setTimeout(() => mini.classList.remove('deny'), 450);
        }
      };

      if (!force) {
        const activeDown = activeUnit.stats.hp <= 0;
        if (benchUnit.stats.hp <= 0) return deny(`${benchUnit.name} can't fight!`);
        // CRITICAL: only on the active unit's turn (prevents speed abuse)
        if (!activeDown && core.turns && core.turns.getCurrentUnit() !== activeUnit) {
          return deny(`Can only switch during ${activeUnit.name}'s turn!`);
        }
        if (window.BattleDrag?.spriteDrag?.active || core.drag?.spriteDrag?.active) return;
      }

      console.log(`[TeamHolder] Switching ${activeUnit.name} ↔ ${benchUnit.name}`);
      this.isSwitching = true;
      window.BattleInputManager?.handleUnitSwitch?.(cardIndex);

      const body = card?.querySelector('.uc-body');
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!card || !body || !mini || reduce) {
        // No card left to animate (e.g. removed) — swap data and redraw
        this.completeSwap(cardIndex, bi, core, card);
        this.isSwitching = false;
        return;
      }

      // Field: the outgoing unit vanishes in a chakra puff
      const fieldEl = core.dom?.grid?.querySelector(`.battle-unit[data-unit-id="${String(activeUnit.id).replace(/["\\]/g, '\\$&')}"]`);
      fieldEl?.classList.add('swap-out');

      // Card: the mini grows into the slot while the active card shrinks
      // into the corner. Both are drawn as full-size ghosts (crisp at rest)
      // and scaled with transforms.
      const rb = body.getBoundingClientRect();
      const rm = mini.getBoundingClientRect();
      const out = this.makeGhost(activeUnit, rb, 'out');
      const inn = this.makeGhost(benchUnit, rb, 'in');
      card.classList.add('is-swapping');

      const s = rm.width / rb.width;
      const dx = rm.left - rb.left, dy = rm.top - rb.top;
      const small = `translate(${dx}px, ${dy}px) scale(${s})`;
      const mid = `translate(${dx * 0.45}px, ${dy * 0.45 - rb.height * 0.12}px) scale(${(1 + s) / 2}) rotate(-5deg)`;
      const opts = { duration: this.SWAP_MS, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' };
      inn.animate([
        { transform: small, filter: 'brightness(1)' },
        { transform: mid, filter: 'brightness(1.5) drop-shadow(0 0 10px rgba(74,230,230,0.9))', offset: 0.5 },
        { transform: 'none', filter: 'brightness(1)' }
      ], opts);
      out.animate([
        { transform: 'none', filter: 'brightness(1)' },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 + rb.height * 0.06}px) scale(${(1 + s) / 2}) rotate(4deg)`, filter: 'brightness(0.7)', offset: 0.5 },
        { transform: small, filter: 'brightness(0.9)' }
      ], opts);
      this.createSparkleTrail(mini);

      setTimeout(() => {
        let newCard = null;
        try {
          newCard = this.completeSwap(cardIndex, bi, core, card);
        } catch (err) {
          console.error('[TeamHolder] swap failed', err);
        }
        // New card is in place under the ghosts: drop them next frame
        requestAnimationFrame(() => {
          out.remove();
          inn.remove();
          newCard?.classList.add('swap-settle');
          setTimeout(() => newCard?.classList.remove('swap-settle'), 400);
          this.isSwitching = false;
        });
      }, this.SWAP_MS);
    },

    /** Full-size card ghost (portrait window + frame) used by the swap animation. */
    makeGhost(unit, rect, kind) {
      const g = document.createElement('div');
      g.className = `uc-ghost uc-ghost--${kind}`;
      g.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
      g.innerHTML = `
        <div class="ucg-win"><img src="${this.esc(unit.portrait)}" alt="" draggable="false"
             onerror="this.onerror=null;this.src='assets/characters/common/silhouette.png';"></div>
        <img class="ucg-art" src="${this.CARD_ART}" alt="" draggable="false">`;
      document.body.appendChild(g);
      return g;
    },

    /**
     * Data swap + redraw of one card, field units, turn owner and speed bar.
     * Returns the new card element (or null if the holder was redrawn).
     */
    completeSwap(cardIndex, bi, core, card) {
      const oldActiveUnit = core.activeTeam[cardIndex];
      const oldBenchUnit = core.benchTeam[bi];
      if (!oldActiveUnit || !oldBenchUnit) return null;

      // Incoming unit takes the outgoing unit's battlefield spot
      const savedPos = oldActiveUnit.pos ? { ...oldActiveUnit.pos } : { x: 50, y: 50 };
      oldActiveUnit.isActive = false;
      oldActiveUnit.isBench = true;
      oldBenchUnit.isActive = true;
      oldBenchUnit.isBench = false;
      oldBenchUnit.pos = savedPos;
      oldActiveUnit.pos = { x: 0, y: 0 };
      oldBenchUnit.speedGauge = 0; // reset speed gauge for incoming unit
      if (oldActiveUnit._sprite) { try { oldActiveUnit._sprite.destroy(); } catch (_) { /* ignore */ } oldActiveUnit._sprite = null; }

      core.activeTeam[cardIndex] = oldBenchUnit;
      core.benchTeam[bi] = oldActiveUnit;
      core.updateCombatants?.();
      window.BattleFieldBuddy?.onSwap?.(oldActiveUnit, oldBenchUnit, core);

      // The incoming unit inherits the turn if the outgoing unit had it
      const wasCurrentUnit = core.turns?.currentUnit === oldActiveUnit;
      if (wasCurrentUnit) {
        console.log(`[TeamHolder] Updating turn system: ${oldActiveUnit.name} → ${oldBenchUnit.name}`);
        core.turns.currentUnit = oldBenchUnit;
      }

      if (window.BattleChakraWheel) {
        window.BattleChakraWheel.removeChakraWheel(oldActiveUnit.id);
        window.BattleChakraWheel.removeChakraWheel(oldBenchUnit.id);
      }

      let newCard = null;
      if (card?.isConnected) {
        card.outerHTML = this.createUnitCardHTML(oldBenchUnit, oldActiveUnit, cardIndex, core);
        newCard = this.teamHolder.querySelector(`.unit-card[data-card-index="${cardIndex}"]`);
        this.attachAllChakraWheels(core);
      } else {
        this.renderTeamHolder(core);
      }

      // Field: redraw, incoming unit arrives with a chakra puff
      if (core.units?.renderAllUnits) {
        core.units.renderAllUnits(core);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const el = core.dom?.grid?.querySelector(`.battle-unit[data-unit-id="${String(oldBenchUnit.id).replace(/["\\]/g, '\\$&')}"]`);
          if (!el) return;
          el.classList.add('swap-in');
          setTimeout(() => el.classList.remove('swap-in'), 500);
        }));
      }

      if (core.turns) {
        if (wasCurrentUnit) core.turns.showActionPanel?.(oldBenchUnit, core);
        core.turns.updateSpeedGaugeDisplay?.(core);
      }
      this.highlightActingUnit(core.turns?.currentUnit || null);

      console.log(`[TeamHolder] ✅ Switch complete: ${oldActiveUnit.name} → bench, ${oldBenchUnit.name} → active`);
      return newCard;
    },

    /**
     * Create blue chakra sparkle trail during switch
     */
    createSparkleTrail(element) {
      const rect = element.getBoundingClientRect();
      const sparkleCount = 5;

      for (let i = 0; i < sparkleCount; i++) {
        setTimeout(() => {
          const sparkle = document.createElement('div');
          sparkle.className = 'chakra-sparkle';
          sparkle.style.left = `${rect.left + rect.width / 2}px`;
          sparkle.style.top = `${rect.top + rect.height / 2}px`;
          document.body.appendChild(sparkle);

          setTimeout(() => {
            sparkle.remove();
          }, 600);
        }, i * 60);
      }
    },

    /**
     * Auto-promote a bench survivor (called by battle-core when the whole
     * front row is down). Skips the whose-turn check.
     */
    swapBenchToActive(benchUnit, core) {
      const bi = (core.benchTeam || []).indexOf(benchUnit);
      if (bi < 0) return;
      let ai = this.getPairs(core).indexOf(bi);
      if (ai < 0) ai = (core.activeTeam || []).findIndex(u => u && u.stats.hp <= 0);
      if (ai < 0) return;
      this.switchUnits(ai, core, true, bi);
    },

    /** Data-only swap + full redraw (kept for callers of the old API). */
    swapData(cardIndex, core, rerender) {
      const bi = this.getPairs(core)[cardIndex];
      if (bi < 0) return;
      this.completeSwap(cardIndex, bi, core, rerender ? null : this.teamHolder?.querySelector(`.unit-card[data-card-index="${cardIndex}"]`));
    },

    /* ===== Updates ===== */

    /**
     * Update all units (HP, chakra, status)
     */
    updateAll(core) {
      this.syncFromCore(core, true);
    },

    /**
     * Update a unit's HP bar (active card or bench badge)
     */
    updateUnitHP(unit) {
      if (!this.teamHolder || !unit?.stats) return;
      const id = String(unit.id).replace(/["\\]/g, '\\$&');
      const hpPercent = Math.max(0, Math.min(100, (unit.stats.hp / unit.stats.maxHP) * 100));
      const dead = unit.stats.hp <= 0;

      this.teamHolder.querySelectorAll(`.unit-card[data-unit-id="${id}"]`).forEach(card => {
        const fill = card.querySelector('.unit-info .unit-hp-fill');
        if (fill) fill.style.width = `${hpPercent}%`;
        card.classList.toggle('is-dead', dead);
        card.classList.toggle('hp-low', !dead && hpPercent <= 30);
        const mini = card.querySelector('.uc-mini');
        if (mini) mini.classList.toggle('can-swap', dead || card.classList.contains('is-acting'));
      });
      this.teamHolder.querySelectorAll(`.bench-portrait-container[data-unit-id="${id}"]`).forEach(b => {
        const fill = b.querySelector('.unit-hp-fill');
        if (fill) fill.style.width = `${hpPercent}%`;
        b.classList.toggle('is-dead', dead);
      });
    },

    /**
     * Highlight the currently acting unit's card
     */
    highlightActingUnit(unit) {
      this.teamHolder?.querySelectorAll('.unit-card.is-acting').forEach(el => el.classList.remove('is-acting'));
      if (unit && unit.isPlayer !== false) {
        const card = this.findUnitElement(unit.id);
        if (card) card.classList.add('is-acting');
      }
      // A backup can come in on its partner's turn, or any time its partner is down
      this.teamHolder?.querySelectorAll('.unit-card').forEach(card => {
        const mini = card.querySelector('.uc-mini');
        if (mini) mini.classList.toggle('can-swap', card.classList.contains('is-acting') || card.classList.contains('is-dead'));
      });
    },

    /**
     * Update unit chakra gauge
     */
    updateUnitChakra(unit, core) {
      if (window.BattleChakraWheel) {
        window.BattleChakraWheel.updateChakraWheel(unit, core);
      }
    },

    /* ===== Utility ===== */

    /**
     * Find the holder card whose ACTIVE unit has this id
     */
    findUnitElement(unitId) {
      const id = String(unitId).replace(/["\\]/g, '\\$&');
      return this.teamHolder?.querySelector(`.unit-card[data-unit-id="${id}"]`);
    },

    /**
     * Clear and re-render entire team holder
     */
    refresh(core) {
      this.renderTeamHolder(core);
    }
  };

  // Export to window
  window.BattleTeamHolder = BattleTeamHolder;

  console.log("[BattleTeamHolder] Module loaded ✅");
})();
