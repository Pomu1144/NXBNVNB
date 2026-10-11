/* Battlefield gimmick tiles (from the original game's field gimmicks).
 *
 * A zone lies on the ground of #battlefield-grid; a unit that ENDS ITS TURN inside it
 * (its centre, unit.pos, in grid %) gets the zone's effect. Allies and enemies alike.
 *   poison       loses 8% of max HP (never KOs: leaves at least 1 HP)
 *   chakra_up    +2 chakra (max 10)
 *   chakra_down  -2 chakra
 *   swap_seal    can't swap with its bench partner while standing in it
 *
 * Zones live in #gimmick-layer, a sibling drawn just under #battlefield-grid and kept
 * matched to its box (the grid is cleared whenever units re-render).
 *
 * Art: assets/sprites/gimmicks/<type>_<shape>.webp/.json (tools/sprites/ipa_rig/build_gimmicks.py),
 * one looping sheet per shape (square / tall / wide). The json's "zone" is the footprint
 * inside the frame, so the drawn area matches the area that applies the effect.
 *
 * Mission data may place zones per wave:
 *   "gimmicks": [{ "type": "poison", "x": 50, "y": 55, "shape": "wide", "size": "l" }]
 * (x/y = zone centre in grid %, size s | m | l). Waves without that key roll random
 * zones in story missions (not arena, Ninja Road or boss battles); "gimmicks": []
 * turns them off for a wave. ?gimmicks=all forces one of each type (testing).
 */
(function () {
  "use strict";

  const BASE = 'assets/sprites/gimmicks/';
  const TYPES = {
    poison:      { label: 'Poison',     color: '#c45cff', sfx: 'poison' },
    chakra_up:   { label: 'Chakra Up',  color: '#3fd0ff', sfx: 'buff' },
    chakra_down: { label: 'Chakra Down', color: '#4f7dff', sfx: 'debuff' },
    swap_seal:   { label: 'No Swap',    color: '#b7c4b0', sfx: 'seal' },
  };
  // medium zone size in grid % (width, height); shapes stretch it, sizes scale it
  const MEDIUM = { w: 16, h: 26 };
  const SHAPES = { square: [1, 1], tall: [0.6, 1.45], wide: [1.6, 0.65] };
  const SIZES = { s: 0.8, m: 1, l: 1.2 };
  const RANDOM_CHANCE = 0.35;   // story waves without explicit gimmicks
  const POISON_RATE = 0.08;
  const CHAKRA_STEP = 2;

  const metaCache = {};
  function meta(name) {
    if (!metaCache[name]) {
      metaCache[name] = fetch(`${BASE}${name}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    }
    return metaCache[name];
  }

  const BattleGimmicks = {
    zones: [],
    _raf: null,
    _grid: null,

    /** The layer under the battlefield grid, created on first use. */
    layer(grid) {
      let el = document.getElementById('gimmick-layer');
      if (!el) {
        el = document.createElement('div');
        el.id = 'gimmick-layer';
        Object.assign(el.style, { position: 'absolute', pointerEvents: 'none', overflow: 'visible' });
        grid.parentNode.insertBefore(el, grid);
      }
      this._grid = grid;
      this.syncLayer();
      return el;
    },

    syncLayer() {
      const el = document.getElementById('gimmick-layer');
      const g = this._grid;
      if (!el || !g) return;
      const z = parseInt(getComputedStyle(g).zIndex, 10);
      Object.assign(el.style, {
        left: `${g.offsetLeft}px`, top: `${g.offsetTop}px`,
        width: `${g.offsetWidth}px`, height: `${g.offsetHeight}px`,
        zIndex: String(Number.isFinite(z) ? z - 1 : 4),
      });
    },

    /** Called by BattleMissions.loadWave after the wave's units are rendered. */
    onWave(bm, waveData, waveIndex) {
      this.clear();
      const grid = bm?.dom?.grid;
      if (!grid) return;
      let list = Array.isArray(waveData?.gimmicks) ? waveData.gimmicks : null;
      if (/[?&]gimmicks=all\b/.test(location.search)) {
        list = Object.keys(TYPES).map((type, i) => ({ type, x: 30 + i * 13, y: i % 2 ? 35 : 65 }));
      } else if (!list) {
        list = this.randomZones(bm);
      }
      list.forEach(z => this.add(bm, z));
    },

    randomZones(bm) {
      if (bm.isArena || bm.isNinjaRoad || bm.isBossBattle) return [];
      if (Math.random() > RANDOM_CHANCE) return [];
      const types = Object.keys(TYPES);
      const shapes = Object.keys(SHAPES);
      const count = Math.random() < 0.25 ? 2 : 1;
      const out = [];
      for (let i = 0; i < count; i++) {
        out.push({
          type: types[Math.floor(Math.random() * types.length)],
          shape: shapes[Math.floor(Math.random() * shapes.length)],
          size: ['s', 'm', 'l'][Math.floor(Math.random() * 3)],
          // keep clear of the edges; a second zone goes to the other half of the field
          x: (count === 2 ? (i ? 62 : 38) : 50) + (Math.random() - 0.5) * 16,
          y: 30 + Math.random() * 40,
        });
      }
      return out;
    },

    /** Place one zone: { type, x, y, shape?, size? }. Returns the zone object. */
    add(bm, spec) {
      const def = TYPES[spec?.type];
      const grid = bm?.dom?.grid;
      if (!def || !grid) return null;
      const shape = SHAPES[spec.shape] ? spec.shape : 'square';
      const k = SIZES[spec.size] || 1;
      const w = MEDIUM.w * SHAPES[shape][0] * k;
      const h = MEDIUM.h * SHAPES[shape][1] * k;
      const x = Math.max(w / 2, Math.min(100 - w / 2, Number(spec.x) || 50));
      const y = Math.max(h / 2, Math.min(100 - h / 2, Number(spec.y) || 50));
      const zone = { type: spec.type, shape, x, y, w, h, el: null };

      const el = document.createElement('div');
      el.className = `battle-gimmick battle-gimmick--${spec.type}`;
      el.title = def.label;
      Object.assign(el.style, { position: 'absolute', pointerEvents: 'none', opacity: '0', transition: 'opacity .4s' });
      this.layer(grid).appendChild(el);
      zone.el = el;
      this.zones.push(zone);

      meta(`${spec.type}_${shape}`).then(m => {
        if (!m || !zone.el) return;
        // place the frame so its "zone" box covers the gameplay rectangle
        const [z0, z1, z2, z3] = m.zone;
        const fw = w / (z2 - z0), fh = h / (z3 - z1);
        const rows = Math.ceil(m.frames / m.columns);
        Object.assign(el.style, {
          left: `${x - w / 2 - z0 * fw}%`, top: `${y - h / 2 - z1 * fh}%`,
          width: `${fw}%`, height: `${fh}%`,
          backgroundImage: `url(${BASE}${spec.type}_${shape}.webp)`,
          backgroundSize: `${m.columns * 100}% ${rows * 100}%`,
          backgroundRepeat: 'no-repeat', opacity: '1',
        });
        zone.meta = m;
        zone.rows = rows;
        this.ensureLoop();
      });
      return zone;
    },

    ensureLoop() {
      if (this._raf) return;
      const t0 = performance.now();
      const tick = now => {
        if (!this.zones.length) { this._raf = null; return; }
        this.syncLayer();
        for (const z of this.zones) {
          const m = z.meta;
          if (!m || !z.el) continue;
          const f = Math.floor(((now - t0) / 1000) * m.fps) % m.frames;
          const c = f % m.columns, r = Math.floor(f / m.columns);
          const px = m.columns > 1 ? (c / (m.columns - 1)) * 100 : 0;
          const py = z.rows > 1 ? (r / (z.rows - 1)) * 100 : 0;
          z.el.style.backgroundPosition = `${px}% ${py}%`;
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    },

    clear() {
      this.zones.forEach(z => z.el?.remove());
      this.zones = [];
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
    },

    /** Zones whose rectangle contains the unit's centre. */
    zonesAt(unit) {
      const p = unit?.pos;
      if (!p) return [];
      return this.zones.filter(z => Math.abs(p.x - z.x) <= z.w / 2 && Math.abs(p.y - z.y) <= z.h / 2);
    },

    /** BattleSwap.canSwap: a unit standing in a swap seal can't swap. */
    blocksSwap(unit) {
      return this.zonesAt(unit).some(z => z.type === 'swap_seal');
    },

    /** Called by BattleTurns.endTurn for the unit whose turn just ended. */
    onTurnEnd(core, unit) {
      if (!unit || unit.stats?.hp <= 0) return;
      for (const z of this.zonesAt(unit)) {
        const def = TYPES[z.type];
        if (z.type === 'poison') {
          const dmg = Math.min(unit.stats.hp - 1, Math.max(1, Math.round(unit.stats.maxHP * POISON_RATE)));
          if (dmg > 0) {
            unit.stats.hp -= dmg;
            window.BattleAnimations?.showDamage?.(unit, dmg, false, core.dom);
          }
        } else if (z.type === 'chakra_up' || z.type === 'chakra_down') {
          const before = Number(unit.chakra) || 0;
          const after = Math.max(0, Math.min(10, before + (z.type === 'chakra_up' ? CHAKRA_STEP : -CHAKRA_STEP)));
          if (after === before) continue;
          unit.chakra = after;
        } else {
          continue; // swap_seal acts on swaps, not at turn end
        }
        window.BattleEffects?.showEffectIndicator?.(unit, def.label.toUpperCase(), def.color, core);
        window.AudioManager?.playSFX?.(def.sfx);
        if (core.units) core.units.updateUnitDisplay(unit, core); else core.updateUnitDisplay?.(unit);
      }
      if (unit.isPlayer) core.teamHolder?.updateUnitHP?.(unit);
      core.updateTeamHP?.();
    },
  };

  window.BattleGimmicks = BattleGimmicks;
})();
