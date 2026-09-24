// js/battle/battle-separation.js - keep field units from standing on each other
(() => {
  "use strict";

  /**
   * BattleSeparation
   *
   * Naruto Blazing-style body collision for units at rest. Every unit has an
   * elliptical ground footprint derived from its on-screen sprite; when two
   * footprints overlap the units are pushed apart along the line between
   * them and the nudge is animated (ease-out, ~180ms).
   *
   * Positions (unit.pos) are percentages of #battlefield-grid, so the solver
   * works in grid pixels (aspect ratio handled) and converts back.
   *
   * - resolve(core, { fixed }) : the `fixed` unit (just dropped by the
   *   player) stays put and the others move; if that can't clear it, it
   *   snaps to the nearest free spot instead.
   * - request(core)            : resolve on the next frame (debounced).
   * - A low-frequency watchdog catches anything else that ends overlapped
   *   (knockback, return from an attack, panel step-aside, swaps).
   *
   * Units mid-dash / mid-attack / being dragged / knocked back are ignored
   * (neither moved nor treated as obstacles) and picked up once at rest.
   */
  const BattleSeparation = {
    // Footprint tuning. Each unit's body is an ellipse around its visual box
    // (sprite + field HP/chakra bars): rx from the width, ry from the height.
    RX_OF_WIDTH: 0.45,      // side by side: centres >= ~0.9 sprite widths apart
    RY_OF_HEIGHT: 0.4,      // one behind the other: >= ~0.8 box heights apart (head, badge and bars stay visible)
    SIDEWAYS_BIAS: 0.6,     // scale the vertical part of a push: prefer stepping aside over stacking
    MIN_RADIUS_PX: 18,
    MAX_RADIUS_PX: 56,
    ITERATIONS: 12,
    NUDGE_MS: 180,
    WATCH_MS: 400,
    REST_EPS: 0.35,         // % between element and unit.pos that still counts as "at rest"
    EDGE_PAD_PX: 4,

    _raf: 0,
    _pendingFixed: null,
    _watch: 0,
    core: null,

    init(core) {
      this.core = core || this.core || window.BattleManager;
      this.wrapDash();
      if (!this._watch) {
        this._watch = setInterval(() => {
          const c = this.core || window.BattleManager;
          if (!c?.dom?.grid || document.hidden) return;
          this.resolve(c);
        }, this.WATCH_MS);
      }
      return this;
    },

    /** Resolve right after any attack dash lands back home. */
    wrapDash() {
      const C = window.BattleCombat;
      if (!C || typeof C.dashUnitTo !== "function" || C.dashUnitTo._separation) return;
      const orig = C.dashUnitTo;
      const self = this;
      C.dashUnitTo = function (unit, unitEl, to, core, ...rest) {
        return orig.call(this, unit, unitEl, to, core, ...rest).then(v => {
          // Returning home: the caller snaps the element to unit.pos right
          // after this resolves; resolve a frame later once it is at rest.
          if (unit?.pos && Math.abs(to.x - unit.pos.x) < 0.5 && Math.abs(to.y - unit.pos.y) < 0.5) self.request(core);
          return v;
        });
      };
      C.dashUnitTo._separation = true;
    },

    /** Debounced resolve on the next animation frame. */
    request(core, fixed = null) {
      this.core = core || this.core;
      if (fixed) this._pendingFixed = fixed;
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        const f = this._pendingFixed; this._pendingFixed = null;
        this.resolve(this.core, { fixed: f });
      });
    },

    /* ===== Geometry ===== */

    unitEl(unit, core) {
      return core.dom.grid?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`) ||
             core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
    },

    isAtRest(unit, el) {
      if (unit._actionBusy || unit._sepNudging) return false;
      if (window.BattlePhysics?.activeKnockbacks?.has(unit.id)) return false;
      const drag = window.BattleDrag || this.core?.drag;
      if (drag && (drag.draggingUnit === unit || drag.spriteDrag?.unit === unit)) return false;
      if (el.classList.contains("is-sprite-dragging") || el.classList.contains("swap-out")) return false;
      const lx = parseFloat(el.style.left), ly = parseFloat(el.style.top);
      if (!Number.isFinite(lx) || !Number.isFinite(ly)) return false;
      return Math.abs(lx - unit.pos.x) < this.REST_EPS && Math.abs(ly - unit.pos.y) < this.REST_EPS;
    },

    /**
     * Footprint of a unit in grid px: the body centre's offset from the
     * element centre (animated sprites stand with their feet well below the
     * centre) and the ellipse radii from the visual box (sprite plus, for
     * enemies, the HP / chakra bars under it).
     */
    footprint(unit, el) {
      const er = el.getBoundingClientRect();
      const parts = [el.querySelector(".unit-sprite") || el, el.querySelector(".unit-hp-bar"), el.querySelector(".unit-chakra-bar")];
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const p of parts) {
        const pr = p?.getBoundingClientRect();
        if (!pr || !pr.width || !pr.height) continue;
        l = Math.min(l, pr.left); t = Math.min(t, pr.top); r = Math.max(r, pr.right); b = Math.max(b, pr.bottom);
      }
      if (!Number.isFinite(l)) { l = er.left; t = er.top; r = er.right; b = er.bottom; }
      const w = (r - l) || 70, h = (b - t) || 70;
      const clampR = v => Math.max(this.MIN_RADIUS_PX, Math.min(this.MAX_RADIUS_PX, v));
      const cx = er.left + er.width / 2, cy = er.top + er.height / 2;
      return {
        rx: clampR(w * this.RX_OF_WIDTH),
        ry: clampR(h * this.RY_OF_HEIGHT),
        ox: (l + r) / 2 - cx,
        oy: (t + b) / 2 - cy,
        top: t - cy,     // negative: head above the element centre
        bottom: b - cy,  // feet / bars below it
      };
    },

    /** Grid-px area a moved unit may stand in (below the top HUD, above the holder cards). */
    fieldBounds(core, gr) {
      let top = 0, bottom = gr.height;
      const track = document.getElementById("speed-gauge-track") || document.getElementById("turn-icons");
      const tr = track?.getBoundingClientRect();
      if (tr && tr.height) top = Math.max(top, tr.bottom - gr.top + 2);
      const holder = document.getElementById("team-holder");
      const hr = holder?.getBoundingClientRect();
      if (hr && hr.height && hr.top > gr.top + gr.height * 0.4) bottom = Math.min(bottom, hr.top - gr.top + 6);
      return { left: 0, right: gr.width, top, bottom };
    },

    /* ===== Solver ===== */

    /**
     * Push overlapping units apart. Returns the list of units that moved.
     * opts.fixed: unit that should keep its spot (the one just dropped).
     */
    resolve(core, opts = {}) {
      core = core || this.core || window.BattleManager;
      if (!core?.dom?.grid || !Array.isArray(core.combatants)) return [];
      const gr = core.dom.grid.getBoundingClientRect();
      if (!gr.width || !gr.height) return [];
      const fixed = opts.fixed || null;
      const B = this.fieldBounds(core, gr);

      // Bodies in grid px (body centre, not the element centre).
      const bodies = [];
      for (const u of core.combatants) {
        if (!u || u.isBench || !u.pos || !(u.stats?.hp > 0)) continue;
        const el = this.unitEl(u, core);
        if (!el || el.dataset.dead === "true") continue;
        const isFixed = u === fixed;
        if (!isFixed && !this.isAtRest(u, el)) continue;
        const f = this.footprint(u, el);
        const px = (u.pos.x / 100) * gr.width, py = (u.pos.y / 100) * gr.height;
        // Allowed element-centre range; never tighter than where the unit already is.
        const minX = Math.min(px, B.left + f.rx - f.ox + this.EDGE_PAD_PX);
        const maxX = Math.max(px, B.right - f.rx - f.ox - this.EDGE_PAD_PX);
        const minY = Math.min(py, B.top - f.top);
        const maxY = Math.max(py, B.bottom - f.bottom);
        bodies.push({
          u, el, f, isFixed,
          x: px + f.ox, y: py + f.oy, x0: px + f.ox, y0: py + f.oy,
          minX: minX + f.ox, maxX: maxX + f.ox, minY: minY + f.oy, maxY: maxY + f.oy,
        });
      }
      if (bodies.length < 2 || !this.anyOverlap(bodies)) { this.depthSort(bodies); return []; }

      this.relax(bodies, fixed);

      const fb = fixed && bodies.find(b => b.isFixed);
      if (fb && this.overlapsAny(fb, bodies)) {
        // Others are pinned (walls / crowd): put everyone back and move the
        // dropped unit to the nearest free point instead.
        bodies.forEach(b => { b.x = b.x0; b.y = b.y0; });
        const spot = this.nearestFree(fb, bodies);
        if (spot) { fb.x = spot.x; fb.y = spot.y; }
        this.relax(bodies, null); // anything left over settles symmetrically
      }

      const moved = [];
      for (const b of bodies) {
        const nx = ((b.x - b.f.ox) / gr.width) * 100;
        const ny = ((b.y - b.f.oy) / gr.height) * 100;
        if (Math.abs(nx - b.u.pos.x) < 0.05 && Math.abs(ny - b.u.pos.y) < 0.05) continue;
        const from = { x: b.u.pos.x, y: b.u.pos.y };
        b.u.pos = { x: nx, y: ny };
        moved.push(b.u);
        // The dropped unit's own element is placed by its drop/run code.
        if (!b.isFixed) this.animateNudge(b.u, b.el, from, b.u.pos);
      }
      this.depthSort(bodies);
      return moved;
    },

    /** Pair overlap in the pair's normalised ellipse space (< 1 = overlapping). */
    pairDist(a, b, ax = a.x, ay = a.y) {
      return Math.hypot((b.x - ax) / (a.f.rx + b.f.rx), (b.y - ay) / (a.f.ry + b.f.ry));
    },

    anyOverlap(bodies) {
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        if (this.pairDist(bodies[i], bodies[j]) < 0.99) return true;
      }
      return false;
    },

    relax(bodies, fixed) {
      for (let it = 0; it < this.ITERATIONS; it++) {
        let any = false;
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          const Rx = a.f.rx + b.f.rx, Ry = a.f.ry + b.f.ry;
          let u = (b.x - a.x) / Rx, v = (b.y - a.y) / Ry;
          let d = Math.hypot(u, v);
          if (d >= 0.99) continue;
          any = true;
          const aFix = a.u === fixed, bFix = b.u === fixed;
          if (aFix && bFix) continue;
          if (d < 1e-3) {
            // Exactly stacked: split sideways (players to the left of enemies,
            // otherwise by list order) with a touch of depth.
            const s = a.u.isPlayer === b.u.isPlayer ? 1 : (a.u.isPlayer ? 1 : -1);
            u = 1e-3 * s; v = 3e-4 * s; d = Math.hypot(u, v);
          }
          // Push along the connecting line, leaning sideways: side-by-side
          // units stay readable, a vertical stack hides heads and badges.
          const bu = u, bv = v * this.SIDEWAYS_BIAS, bl = Math.hypot(bu, bv) || 1;
          const nu = bu / bl, nv = bv / bl;
          // Distance to travel along (nu, nv) to reach the ellipse boundary.
          const along = u * nu + v * nv;
          const t = Math.sqrt(Math.max(0, 1 - (d * d - along * along))) - along + 0.005;
          const wa = aFix ? 0 : bFix ? 1 : 0.5;
          const wb = bFix ? 0 : aFix ? 1 : 0.5;
          const px = t * nu * Rx, py = t * nv * Ry;
          this.place(a, a.x - px * wa, a.y - py * wa);
          this.place(b, b.x + px * wb, b.y + py * wb);
        }
        if (!any) break;
      }
    },

    place(b, x, y) {
      b.x = Math.max(b.minX, Math.min(b.maxX, x));
      b.y = Math.max(b.minY, Math.min(b.maxY, y));
    },

    overlapsAny(b, bodies, x = b.x, y = b.y) {
      return bodies.some(o => o !== b && this.pairDist(b, o, x, y) < 0.99);
    },

    /** Closest in-bounds point where `b` touches nobody (others where they stand). */
    nearestFree(b, bodies) {
      const step = Math.max(4, Math.min(b.f.rx, b.f.ry) / 4);
      for (let ring = 1; ring <= 60; ring++) {
        const rad = ring * step;
        const n = Math.max(12, Math.round((2 * Math.PI * rad) / step));
        let best = null, bestD = Infinity;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2;
          const x = b.x0 + Math.cos(ang) * rad, y = b.y0 + Math.sin(ang) * rad;
          if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
          if (this.overlapsAny(b, bodies, x, y)) continue;
          const d = Math.hypot(x - b.x0, (y - b.y0) / this.SIDEWAYS_BIAS); // prefer sideways
          if (d < bestD) { bestD = d; best = { x, y }; }
        }
        if (best) return best;
      }
      return null;
    },

    /** Lower on the field = drawn in front, so heads/badges stay readable. */
    depthSort(bodies) {
      for (const b of bodies) {
        const z = String(2 + Math.round(Math.max(0, Math.min(100, b.u.pos.y)) * 0.38));
        if (b.el.style.zIndex !== z && b.el.style.zIndex !== "70") b.el.style.zIndex = z;
      }
    },

    /* ===== Animation ===== */

    animateNudge(unit, el, from, to) {
      const token = (unit._runToken = (unit._runToken || 0) + 1);
      unit._sepNudging = true;
      const prevTransition = el.style.transition;
      el.style.transition = "none"; // the generic .battle-unit "transition: all" would lag behind
      const start = performance.now();
      const dur = this.NUDGE_MS;
      const finish = () => {
        unit._sepNudging = false;
        el.style.transition = prevTransition;
      };
      const step = now => {
        if (unit._runToken !== token || window.BattlePhysics?.activeKnockbacks?.has(unit.id)) return finish();
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
        el.style.left = `${from.x + (to.x - from.x) * e}%`;
        el.style.top = `${from.y + (to.y - from.y) * e}%`;
        if (t < 1) requestAnimationFrame(step);
        else {
          el.style.left = `${unit.pos.x}%`;
          el.style.top = `${unit.pos.y}%`;
          finish();
        }
      };
      requestAnimationFrame(step);
    },
  };

  window.BattleSeparation = BattleSeparation;

  // Self-start once the battle core exists (no edits to battle-core needed).
  const boot = () => {
    if (window.BattleManager?.dom?.grid) { BattleSeparation.init(window.BattleManager); return; }
    setTimeout(boot, 300);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  console.log("[BattleSeparation] Module loaded ✅");
})();
