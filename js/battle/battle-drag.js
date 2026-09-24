// js/battle/battle-drag.js - Drag & Drop Targeting System
(() => {
  "use strict";

  /**
   * BattleDrag Module
   * Handles drag & drop mechanics for positioning and targeting
   *
   * Features:
   * - Active unit dragging
   * - Targeting overlay visualization
   * - Multi-target area attacks
   * - Drag-to-cast mechanics
   * - Position updates
   * - Visual targeting markers
   * - Proximity combo detection
   */
  const BattleDrag = {
    // ===== State =====
    draggingUnit: null,
    dragStartPos: null,
    dragAction: null,
    isDragging: false,
    currentTargets: [], // Track currently targeted units
    targetMarkers: new Map(), // Store target marker elements
    lastUpdateTime: 0, // For throttling drag updates
    throttleDelay: 16, // ~60fps update rate
    DEBUG_DRAG: false, // Debug logging flag (disable for performance)

    /* ===== Targeting Markers =====
     * Units inside the range get the .is-range-target class (a red-gold glow,
     * see the style block at the bottom) and a ground ring + chevron drawn by
     * the range overlay, so the player sees exactly who the drop will hit.
     */

    createTargetMarker(unit, core, combo = false) {
      const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!unitEl) return null;
      unitEl.classList.add(combo ? 'is-range-combo' : 'is-range-target');
      unitEl.classList.remove(combo ? 'is-range-target' : 'is-range-combo');
      this.targetMarkers.set(unit.id, unitEl);
      return unitEl;
    },

    removeTargetMarker(unit) {
      const el = this.targetMarkers.get(unit.id);
      if (el) {
        el.classList.remove('is-range-target', 'is-range-combo');
        this.targetMarkers.delete(unit.id);
      }
    },

    clearAllTargetMarkers() {
      this.targetMarkers.forEach(el => el.classList.remove('is-range-target', 'is-range-combo'));
      this.targetMarkers.clear();
      this.currentTargets = [];
    },

    /** Sync the glow classes with a prediction from predictRange(). */
    applyTargetMarkers(pred, core) {
      const next = new Map();
      pred.main.forEach(u => next.set(u.id, [u, false]));
      pred.combo.forEach(u => { if (!next.has(u.id)) next.set(u.id, [u, true]); });
      [...this.targetMarkers.keys()].forEach(id => {
        if (!next.has(id)) this.removeTargetMarker({ id });
      });
      next.forEach(([u, combo]) => this.createTargetMarker(u, core, combo));
      this.currentTargets = pred.main.slice();
    },

    /** Back-compat wrapper (older callers pass scene-relative x/y). */
    updateTargetMarkers(x, y, core, actionType = null) {
      if (!this.isDragging || !this.draggingUnit) return;
      const r = core.dom.scene.getBoundingClientRect();
      this.applyTargetMarkers(this.predictRange(actionType || this.dragAction, r.left + x, r.top + y, core), core);
    },

    /* ===== Range overlay =====
     * One canvas over the scene. While a drag is live it redraws every frame
     * (rotating tick ring, marching dashes, pulse); it is idle otherwise.
     * Everything is drawn on the ground plane: the range is flattened by
     * RANGE_FLAT vertically, centred on the dragged unit's feet, and
     * predictRange() tests enemies' feet in exactly the same space.
     */
    makeOverlay(root) {
      /* Two layers so the range reads as painted on the ground:
       *  - ground (#battle-targeting-ground, z 4): range fill/rim/ticks,
       *    seal, whole-map frame + tethers, enemy ground rings. It sits
       *    under #battlefield-grid (z 5), the stacking context that holds
       *    every unit, so all sprites/tiles - including a dragged or
       *    attacking unit whose own z-index is raised inside the grid -
       *    are drawn over it. The scene background is the scene's own
       *    background image, so it stays underneath.
       *  - top (#battle-targeting, z 100): only what floats above heads -
       *    target chevrons and the "ATTACK ×n" label. */
      const layer = (id, z) => {
        let c = document.getElementById(id);
        if (!c) {
          c = document.createElement("canvas");
          c.id = id;
          c.setAttribute("aria-hidden", "true");
          Object.assign(c.style, {
            position: "absolute", inset: "0", width: "100%", height: "100%",
            pointerEvents: "none", zIndex: String(z),
          });
          root.appendChild(c);
        }
        return c;
      };
      const groundCanvas = layer("battle-targeting-ground", 4);
      const canvas = layer("battle-targeting", 100);
      const gctx = groundCanvas.getContext("2d");
      const ctx = canvas.getContext("2d");
      let cssW = 0, cssH = 0, dpr = 1;
      const fit = () => {
        const r = root.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        for (const c of [groundCanvas, canvas]) {
          if (Math.round(r.width * dpr) !== c.width || Math.round(r.height * dpr) !== c.height) {
            c.width = Math.round(r.width * dpr);
            c.height = Math.round(r.height * dpr);
          }
        }
        cssW = r.width; cssH = r.height;
      };
      const wipe = () => {
        for (const [c, x] of [[groundCanvas, gctx], [canvas, ctx]]) {
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, c.width, c.height);
        }
      };
      fit();
      this.resizeListener = fit;
      window.addEventListener("resize", fit);

      const drag = this;
      const reduce = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let state = null, raf = 0, t0 = performance.now();

      const frame = now => {
        raf = 0;
        if (!state) return;
        fit();
        wipe();
        gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const still = reduce();
        drag.drawRange(gctx, state, still ? 0 : (now - t0) / 1000, still, cssW, cssH, ctx);
        if (!still) raf = requestAnimationFrame(frame);
      };

      return {
        canvas,
        groundCanvas,
        clear() {
          state = null;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          wipe();
        },
        /** Show / update a prediction from predictRange(). */
        show(pred) {
          if (!state) t0 = performance.now();
          state = pred;
          if (!raf) raf = requestAnimationFrame(frame);
          if (reduce()) frame(performance.now()); // static: draw once, now
        },
        /** Legacy API: shape + scene-relative origin, no targets. */
        draw(shape, color, args, origin) {
          this.show({
            origin, dir: 1, k: 1, kind: color === "ultimate" ? "ultimate" : color === "attack" ? "attack" : "jutsu",
            area: { shape, args: args || {}, all: false }, main: [], combo: [], marks: [],
          });
        },
      };
    },

    RANGE_FLAT: 0.46,          // ground-plane squash (ellipse height / width)
    ATTACK_RANGE_RADIUS: 170,  // basic attack radius, reference px (1440x810 scene)

    PALETTES: {
      attack:   { rim: "#e9c46a", hi: "#fff3cf", glow: "rgba(233,196,106,0.85)", core: "rgba(45,107,115,0.04)", edge: "rgba(45,107,115,0.42)", tick: "#f1d98a", label: "ATTACK" },
      jutsu:    { rim: "#6cc6ff", hi: "#e3f5ff", glow: "rgba(88,183,255,0.95)",  core: "rgba(24,96,170,0.04)",  edge: "rgba(36,128,214,0.40)", tick: "#f1d98a", label: "JUTSU" },
      ultimate: { rim: "#ff6450", hi: "#ffe3cf", glow: "rgba(255,77,77,0.95)",   core: "rgba(150,16,16,0.05)",  edge: "rgba(196,30,30,0.42)",  tick: "#f1d98a", label: "ULTIMATE" },
    },

    /** Trace a range shape in local reference coords (facing +x). */
    traceShape(ctx, shape, a) {
      switch (shape) {
        case "rect": ctx.rect(-a.w / 2, -a.h / 2, a.w, a.h); break;
        case "line": ctx.rect(0, -a.width / 2, a.length, a.width); break;
        case "sector": {
          const half = (a.angleDeg * Math.PI) / 360;
          if (a.angleDeg >= 359) { ctx.arc(0, 0, a.radius, 0, Math.PI * 2); break; }
          ctx.moveTo(0, 0); ctx.arc(0, 0, a.radius, -half, half); ctx.closePath(); break;
        }
        case "cross": {
          const L = a.length / 2, W = a.width / 2, rot = (a.rotDeg || 0) * Math.PI / 180;
          const pts = [[W, -L], [W, -W], [L, -W], [L, W], [W, W], [W, L], [-W, L], [-W, W], [-L, W], [-L, -W], [-W, -W], [-W, -L]];
          const c = Math.cos(rot), s = Math.sin(rot);
          pts.forEach(([x, y], i) => { const X = x * c - y * s, Y = x * s + y * c; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
          ctx.closePath(); break;
        }
        default: ctx.arc(0, 0, a.radius, 0, Math.PI * 2);
      }
    },

    /** Farthest extent of a shape from its origin (reference px). */
    shapeExtent(shape, a) {
      switch (shape) {
        case "rect": return Math.hypot(a.w / 2, a.h / 2);
        case "line": return a.length;
        case "cross": return a.length / 2;
        default: return a.radius;
      }
    },

    /** Lowest local y of a shape (reference px), for placing its label. */
    shapeBottom(shape, a) {
      switch (shape) {
        case "rect": return a.h / 2;
        case "line": return a.width / 2;
        case "cross": {
          const r = ((a.rotDeg || 0) * Math.PI) / 180;
          return (a.length / 2) * Math.abs(Math.cos(r)) + (a.width / 2) * Math.abs(Math.sin(r));
        }
        case "sector": return a.radius * Math.sin(Math.min(Math.PI / 2, (a.angleDeg * Math.PI) / 360));
        default: return a.radius;
      }
    },

    /**
     * Draw one frame of the range indicator (CSS px, scene-relative).
     * `ctx` is the ground layer (under the units); `top` the layer above
     * them, used only for the chevrons and the label.
     */
    drawRange(ctx, st, t, still, W, H, top = ctx) {
      const P = this.PALETTES[st.kind] || this.PALETTES.attack;
      const FL = this.RANGE_FLAT;
      const { origin: o, dir = 1, k = 1 } = st;
      const shape = st.area.shape, a = st.area.args;
      const R = this.shapeExtent(shape, a);
      const local = (fn, s = 1) => {        // run fn in the ground-plane frame
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(dir * k * s, FL * k * s);
        fn();
        ctx.restore();
      };
      const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3.2);

      if (st.area.all) {
        // Whole-map skill: frame the field, draw a seal ring at the caster
        // and a gold tether to every enemy it will hit.
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.25 * pulse;
        ctx.lineWidth = 3; ctx.strokeStyle = P.rim; ctx.shadowColor = P.glow; ctx.shadowBlur = 22;
        ctx.strokeRect(5, 5, W - 10, H - 10);
        ctx.shadowBlur = 0; ctx.lineWidth = 1.2; ctx.strokeStyle = P.tick; ctx.globalAlpha = 0.75;
        ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 30;
        ctx.strokeRect(13, 13, W - 26, H - 26);
        ctx.restore();
        (st.marks || []).forEach(m => {
          if (m.combo) return;
          const mx = (o.x + m.x) / 2, my = Math.min(o.y, m.y) - 40 * k - Math.abs(m.x - o.x) * 0.08;
          ctx.save();
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(mx, my, m.x, m.y);
          ctx.strokeStyle = P.rim; ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.shadowColor = P.glow; ctx.shadowBlur = 10; ctx.stroke();
          ctx.shadowBlur = 0; ctx.strokeStyle = P.tick; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.3;
          ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 40; ctx.stroke();
          ctx.restore();
        });
      }

      {
        const shape = st.area.all ? "circle" : st.area.shape;
        const a = st.area.all ? { radius: 110 } : st.area.args;
        const R = this.shapeExtent(shape, a);
        // 1. soft inner fill (transparent centre -> tinted rim)
        local(() => {
          ctx.beginPath(); this.traceShape(ctx, shape, a);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
          g.addColorStop(0, P.core); g.addColorStop(0.6, P.core); g.addColorStop(0.92, P.edge); g.addColorStop(1, P.edge);
          ctx.fillStyle = g; ctx.globalAlpha = 0.85 + 0.15 * pulse; ctx.fill();
        });
        // 2. crisp rim with glow (path built in the squashed frame, stroked
        //    in screen space so the line width stays even)
        local(() => { ctx.beginPath(); this.traceShape(ctx, shape, a); });
        ctx.save();
        ctx.lineJoin = "round";
        ctx.shadowColor = P.glow; ctx.shadowBlur = 10 + 8 * pulse;
        ctx.strokeStyle = P.rim; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = P.hi; ctx.lineWidth = 1; ctx.globalAlpha = 0.9; ctx.stroke();
        // gold marching dashes riding the rim
        ctx.strokeStyle = P.tick; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 9]); ctx.lineDashOffset = -t * 24; ctx.stroke();
        ctx.restore();

        // 3. rotating tick ring + counter-rotating arc segments (round shapes)
        if (shape === "circle" || shape === "sector") {
          const rot = t * 0.35;
          local(() => {
            ctx.beginPath();
            const n = 60;
            for (let i = 0; i < n; i++) {
              const ang = rot + (i / n) * Math.PI * 2;
              if (shape === "sector") {
                const half = (a.angleDeg * Math.PI) / 360;
                let d = Math.atan2(Math.sin(ang), Math.cos(ang));
                if (a.angleDeg < 359 && Math.abs(d) > half) continue;
              }
              const r0 = R * (i % 5 === 0 ? 0.84 : 0.87), r1 = R * 0.9;
              ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
              ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
            }
          });
          ctx.save(); ctx.strokeStyle = P.tick; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore();
          if (shape === "circle") {
            local(() => {
              ctx.beginPath();
              for (let i = 0; i < 3; i++) {
                const s0 = -t * 0.55 + (i * Math.PI * 2) / 3;
                ctx.moveTo(Math.cos(s0) * R * 1.07, Math.sin(s0) * R * 1.07);
                ctx.arc(0, 0, R * 1.07, s0, s0 + 1.1);
              }
            });
            ctx.save(); ctx.strokeStyle = P.rim; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke(); ctx.restore();
          }
        }

        // 4. pulse: the outline expanding from the feet, fading out
        if (!still) {
          const p = (t % 1.8) / 1.8;
          local(() => { ctx.beginPath(); this.traceShape(ctx, shape, a); }, 0.2 + 0.8 * p);
          ctx.save(); ctx.strokeStyle = P.hi; ctx.globalAlpha = 0.45 * (1 - p); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        }
      }

      // Soft gap where the caster stands: the far side of the rim / ticks
      // fade out behind the body instead of meeting the legs in a hard line.
      if (Number.isFinite(o.headY) && o.y - o.headY > 10) {
        const bodyH = o.y - o.headY, rx = 30 * k, cy = o.y - bodyH * 0.42;
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.translate(o.x, cy);
        ctx.scale(1, (bodyH * 0.62) / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, "rgba(0,0,0,0.9)"); g.addColorStop(0.55, "rgba(0,0,0,0.7)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // 5. seal under the caster's feet
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.beginPath(); ctx.ellipse(0, 0, 18 * k, 18 * k * FL, 0, 0, Math.PI * 2);
      ctx.strokeStyle = P.tick; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9; ctx.stroke();
      ctx.scale(1, FL);
      ctx.rotate(still ? 0 : t * 0.8);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4, r = (i % 2 ? 5 : 12) * k;
        ctx[i ? "lineTo" : "moveTo"](Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath(); ctx.fillStyle = P.rim; ctx.globalAlpha = 0.85; ctx.fill();
      ctx.restore();

      // 6. target markers on everyone the drop will hit (combo hits dimmer)
      const mark = (m, strong) => {
        // Portrait tiles cover their feet: widen the ring so it shows around the tile.
        const rx = Math.max(30 * k, (m.w || 0) * 0.68), ry = rx * FL;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = strong ? "rgba(255,70,50,0.22)" : "rgba(241,217,138,0.14)"; ctx.fill();
        ctx.strokeStyle = strong ? "#ff5a3c" : P.tick; ctx.lineWidth = 2; ctx.shadowColor = strong ? "rgba(255,70,50,0.9)" : "transparent"; ctx.shadowBlur = strong ? 10 : 0;
        if (!strong) ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.setLineDash([]); ctx.shadowBlur = 0;
        // four gold brackets turning around the ring
        const spin = still ? 0 : t * 1.4;
        ctx.strokeStyle = "#f1d98a"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
        for (let i = 0; i < 4; i++) {
          const s0 = spin + (i * Math.PI) / 2 - 0.35;
          ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.28, ry * 1.28, 0, s0, s0 + 0.7); ctx.stroke();
        }
        ctx.restore();
        if (strong && Number.isFinite(m.headY)) {
          // chevron above the head, bobbing
          const bob = still ? 0 : Math.sin(t * 5) * 3;
          const y = m.headY - 8 + bob, s = 7 * Math.max(0.7, k);
          top.save();
          top.beginPath();
          top.moveTo(m.x - s, y - s); top.lineTo(m.x, y); top.lineTo(m.x + s, y - s);
          top.lineTo(m.x + s, y - s - 4); top.lineTo(m.x, y - 4); top.lineTo(m.x - s, y - s - 4); top.closePath();
          top.fillStyle = "#ff5a3c"; top.shadowColor = "rgba(255,70,50,0.9)"; top.shadowBlur = 8; top.fill();
          top.shadowBlur = 0; top.strokeStyle = "#f1d98a"; top.lineWidth = 1; top.stroke();
          top.restore();
        }
      };
      (st.marks || []).forEach(m => mark(m, !m.combo));

      // 7. label: skill kind + how many will be hit
      const n = (st.main || []).length;
      const label = st.area.all ? `${P.label} · WHOLE MAP` : P.label;
      top.save();
      const fs = Math.round(11 * Math.max(0.8, k));
      top.font = `700 ${fs}px 'Kaisei Tokumin', 'Times New Roman', serif`;
      top.textAlign = "center"; top.textBaseline = "middle";
      const ly = o.y + (st.area.all ? 110 : this.shapeBottom(shape, a)) * FL * k + 14 * k;
      const txt = n ? `${label}  ×${n}` : label;
      top.lineWidth = 3; top.strokeStyle = "rgba(7,20,24,0.85)"; top.strokeText(txt, o.x, ly);
      top.fillStyle = n ? P.hi : "rgba(236,230,214,0.7)"; top.fillText(txt, o.x, ly);
      top.restore();
    },

    /* ===== Drag Handlers ===== */

    /**
     * Handle drag start for active unit
     */
    handleActiveDragStart(e, unit, core) {
      // Only allow drag if it's this unit's turn
      if (core.turns && core.turns.currentUnit !== unit) return;

      this.beginDrag(unit, core);

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", unit.id);
      e.currentTarget.style.opacity = "0.7";

      if (this.DEBUG_DRAG) console.log(`[Drag] Dragging ${unit.name}, action: ${this.dragAction}`);
    },

    /** Shared drag-start state for HTML5 and sprite pointer drags. */
    beginDrag(unit, core) {
      this.draggingUnit = unit;
      this.dragStartPos = { ...unit.pos };
      this.isDragging = true;

      // Determine action based on queued action
      if (core.queuedAction === "attack") {
        this.dragAction = "attack";
      } else if (core.queuedAction === "jutsu") {
        this.dragAction = "jutsu";
      } else if (core.queuedAction === "ultimate") {
        this.dragAction = "ultimate";
      } else {
        this.dragAction = "move";
      }
    },

    /* ===== Sprite pointer-drag =====
     * Units with an animated sprite (unit._sprite) are dragged with pointer
     * events instead of HTML5 DnD: the unit element itself follows the
     * pointer (no ghost image, works on touch), playing 'run' while the
     * pointer moves and 'idle' once it rests. Targeting and the drop reuse
     * dragOverAt()/dropAt(), the same paths as the HTML5 handlers.
     */
    SPRITE_DRAG_THRESHOLD: 6,   // px of travel before a press becomes a drag
    SPRITE_RUN_MIN_SPEED: 0.04, // px/ms; slower than this doesn't count as moving
    SPRITE_IDLE_AFTER: 120,     // ms without movement before switching to idle
    SPRITE_LEAN_DEG: 6,         // forward lean while running
    SPRITE_ATTACK_GAP_PX: 90,   // stand this far beside an enemy dropped on
    spriteDrag: null,           // active pointer session

    handleSpritePointerDown(e, unit, core, unitEl) {
      if (!unit._sprite || this.isDragging || this.spriteDrag) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!e.isPrimary) return;
      if (core.turns && core.turns.currentUnit !== unit) return;
      if (unit.stats && unit.stats.hp <= 0) return;

      e.preventDefault(); // no text selection / native image drag
      const sd = this.spriteDrag = {
        unit, core, el: unitEl, pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp,
        active: false, idleTimer: null, facingLeft: false,
      };
      try { unitEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }

      sd.onMove = ev => this.spriteDragMove(ev);
      sd.onUp = ev => this.spriteDragUp(ev);
      sd.onCancel = ev => { if (!ev.pointerId || ev.pointerId === sd.pointerId) this.spriteDragCancel(); };
      sd.onKey = ev => { if (ev.key === "Escape") this.spriteDragCancel(); };
      unitEl.addEventListener("pointermove", sd.onMove);
      unitEl.addEventListener("pointerup", sd.onUp);
      unitEl.addEventListener("pointercancel", sd.onCancel);
      unitEl.addEventListener("lostpointercapture", sd.onCancel);
      window.addEventListener("keydown", sd.onKey);
    },

    spriteDragActivate(sd) {
      const { unit, core, el } = sd;
      sd.active = true;
      // Mirror HTML5 DnD, which pointer-cancels the 2-stage input manager.
      const im = window.BattleInputManager;
      if (im && im.currentState === im.STATES?.DRAGGING) im.cancelDrag();
      // A skill armed by tapping the holder card (input manager) carries
      // over to this sprite drag instead of being dropped for a plain move.
      if (im && im.selectedUnit === unit && im.currentState === im.STATES?.READY_TO_DRAG) {
        const t = im.selectedAttackType;
        if (t === "jutsu" || t === "ultimate") core.queuedAction = t;
        im.resetState();
      }

      core.units?.stopRun?.(unit); // stop any in-flight run-to
      this.beginDrag(unit, core);
      sd.facingLeft = !unit.isPlayer;
      el.classList.add("is-sprite-dragging");
      if (this.DEBUG_DRAG) console.log(`[Drag] Sprite-dragging ${unit.name}, action: ${this.dragAction}`);
    },

    /** Place the unit element's centre at the pointer (scene %, clamped). */
    spriteDragPlace(sd, clientX, clientY) {
      const rect = sd.core.dom.scene.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
      sd.el.style.left = `${x}%`;
      sd.el.style.top = `${y}%`;
    },

    spriteDragMove(ev) {
      const sd = this.spriteDrag;
      if (!sd || ev.pointerId !== sd.pointerId) return;
      if (!sd.active) {
        if (Math.hypot(ev.clientX - sd.startX, ev.clientY - sd.startY) < this.SPRITE_DRAG_THRESHOLD) return;
        this.spriteDragActivate(sd);
      }
      const { unit, core } = sd;
      const sprite = unit._sprite;

      const dx = ev.clientX - sd.lastX;
      const dy = ev.clientY - sd.lastY;
      const dt = Math.max(1, ev.timeStamp - sd.lastT);
      const dist = Math.hypot(dx, dy);
      sd.lastX = ev.clientX; sd.lastY = ev.clientY; sd.lastT = ev.timeStamp;

      this.spriteDragPlace(sd, ev.clientX, ev.clientY);

      if (sprite && dist >= 1 && dist / dt >= this.SPRITE_RUN_MIN_SPEED) {
        if (Math.abs(dx) >= 1) sd.facingLeft = dx < 0;
        core.units?.setSpriteFacing?.(unit, sd.facingLeft, this.SPRITE_LEAN_DEG);
        sprite.setState("run"); // no-op while already running
        clearTimeout(sd.idleTimer);
        sd.idleTimer = setTimeout(() => {
          if (this.spriteDrag !== sd || !unit._sprite) return;
          core.units?.setSpriteFacing?.(unit, sd.facingLeft, 0);
          unit._sprite.setState("idle");
        }, this.SPRITE_IDLE_AFTER);
      }

      // Targeting preview / markers (pointermove is already frame-aligned).
      this.lastUpdateTime = 0;
      this.dragOverAt(ev.clientX, ev.clientY, core);
    },

    /** Detach the pointer session's listeners; returns the session. */
    spriteDragTeardown() {
      const sd = this.spriteDrag;
      if (!sd) return null;
      this.spriteDrag = null;
      clearTimeout(sd.idleTimer);
      sd.el.removeEventListener("pointermove", sd.onMove);
      sd.el.removeEventListener("pointerup", sd.onUp);
      sd.el.removeEventListener("pointercancel", sd.onCancel);
      sd.el.removeEventListener("lostpointercapture", sd.onCancel);
      window.removeEventListener("keydown", sd.onKey);
      try { sd.el.releasePointerCapture(sd.pointerId); } catch (_) { /* ignore */ }
      sd.el.classList.remove("is-sprite-dragging");
      if (sd.active) {
        // Swallow the click that follows the release so it isn't treated as
        // a unit tap (chakra / input-manager click handlers).
        const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
        sd.el.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => sd.el.removeEventListener("click", swallow, { capture: true }), 350);
      }
      return sd;
    },

    spriteDragUp(ev) {
      const cur = this.spriteDrag;
      if (!cur || ev.pointerId !== cur.pointerId) return;
      const sd = this.spriteDragTeardown();
      if (!sd.active) return; // a plain tap: let the click handler run

      const { unit, core } = sd;
      const rect = core.dom.scene.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right &&
                     ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (!inside) {
        this.spriteDragRestore(sd);
        return;
      }

      // The sprite is already standing at the drop point: settle to idle
      // there, then resolve the drop (move/attack/jutsu/ultimate). A plain
      // move's updateUnitPosition() finds it already in place, so there is
      // no second run.
      this.spriteDragPlace(sd, ev.clientX, ev.clientY);
      core.units?.settleSprite?.(unit);
      const hit = this.findUnitAtPosition(ev.clientX - rect.left, ev.clientY - rect.top, false, core);
      const startX = this.dragStartPos ? this.dragStartPos.x : unit.pos.x;
      this.dropAt(ev.clientX, ev.clientY, core);

      // Dropped right on top of an enemy: step to its side instead of
      // standing inside it (a short hop, then idle).
      if (hit && hit.pos && unit.stats.hp > 0) {
        const side = startX <= hit.pos.x ? -1 : 1;
        const gap = (this.SPRITE_ATTACK_GAP_PX / rect.width) * 100;
        unit.pos = { x: Math.max(0, Math.min(100, hit.pos.x + side * gap)), y: hit.pos.y };
        window.BattleSeparation?.resolve(core, { fixed: unit });
        core.units?.updateUnitPosition(unit, core);
      }
      this.handleDragEnd(ev, core);
    },

    spriteDragCancel() {
      const sd = this.spriteDragTeardown();
      if (sd && sd.active) this.spriteDragRestore(sd);
    },

    /** Cancelled/out-of-bounds drop: run back to where the drag started. */
    spriteDragRestore(sd) {
      const { unit, core } = sd;
      if (this.dragStartPos) unit.pos = { ...this.dragStartPos };
      this.handleDragEnd(null, core);
      core.units?.updateUnitPosition(unit, core); // runs back, then idles
    },

    /**
     * Handle scene drag over (throttled for performance)
     */
    handleSceneDragOver(e, core) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      if (!this.isDragging || !this.draggingUnit) return;
      this.dragOverAt(e.clientX, e.clientY, core);
    },

    /**
     * Targeting preview for a pointer at (clientX, clientY). Shared by the
     * HTML5 dragover handler and the sprite pointer-drag. The range is shown
     * for every drag (a plain move attacks whatever ends up inside it), and
     * it is computed by predictRange() — the same call dropAt() uses — so
     * the highlighted enemies are exactly the ones the drop hits.
     */
    dragOverAt(clientX, clientY, core) {
      if (!this.isDragging || !this.draggingUnit) return;

      const now = performance.now();
      const delay = Math.max(1, this.throttleDelay || 16);
      if (now - this.lastUpdateTime < delay) return;
      this.lastUpdateTime = now;

      if (!core.dom || !core.dom.scene) return;
      this.lastPointer = { x: clientX, y: clientY };
      const pred = this.predictRange(this.dragAction, clientX, clientY, core);
      this.lastPrediction = pred;
      core.overlay?.show?.(pred);
      this.applyTargetMarkers(pred, core);
    },

    /**
     * Handle scene drop
     */
    handleSceneDrop(e, core) {
      e.preventDefault();

      if (!this.isDragging || !this.draggingUnit) return;
      this.dropAt(e.clientX, e.clientY, core);
      this.handleDragEnd(e, core);
    },

    /**
     * Resolve a drop at (clientX, clientY): reposition, attack, jutsu or
     * ultimate. Shared by the HTML5 drop handler and the sprite pointer-drag.
     * The caller runs handleDragEnd() afterwards.
     */
    dropAt(clientX, clientY, core) {
      // The queued action is consumed by this drop (a stale "jutsu" left in
      // core.queuedAction let a later enemy tap cast it a second time).
      core.queuedAction = null;
      window.BattleChakra?.clearEnemyHighlights?.(core);
      const rect = core.dom.scene.getBoundingClientRect();
      const unit = this.draggingUnit;

      // Same prediction the preview showed, taken before the unit moves.
      const pred = this.predictRange(this.dragAction, clientX, clientY, core);

      unit.pos = {
        x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
      };
      // Don't stand inside another unit: nudge the others aside (or snap
      // this one to the nearest free spot) before it becomes the home the
      // attack dashes back to.
      window.BattleSeparation?.resolve(core, { fixed: unit });

      const action = pred.action; // "move" when nothing is in range
      const targets = pred.main.slice();
      targets.fromRange = true;   // BattleCombat: hit these, don't add others
      const combo = pred.combo;
      const doEndTurn = () => {
        if (core.turns?.currentUnit === unit) core.turns.endTurn(core);
      };
      const justMove = () => {
        core.units?.updateUnitPosition(unit, core);
        doEndTurn();
      };
      if (this.DEBUG_DRAG) console.log(`[Drag] drop ${action}: ${targets.map(t => t.name).join(", ") || "no targets"}`);

      if (!targets.length || !window.BattleCombat) return justMove();
      const C = window.BattleCombat;

      if (action === "ultimate") {
        if (C.performUltimate(unit, targets, core, doEndTurn) === false) justMove();
        return;
      }
      if (action === "jutsu") {
        if (combo.length) {
          if (C.performMultiJutsu(unit, targets, core) === false) return justMove();
          setTimeout(() => C.performProximityCombo(unit, combo, core, doEndTurn), 600);
        } else if (C.performMultiJutsu(unit, targets, core, doEndTurn) === false) {
          justMove();
        }
        return;
      }
      // basic attack (armed or a plain drag with enemies in range)
      if (combo.length) {
        C.performMultiAttack(unit, targets, core);
        setTimeout(() => C.performProximityCombo(unit, combo, core, doEndTurn), 400);
      } else {
        C.performMultiAttack(unit, targets, core, doEndTurn);
      }
    },

    /**
     * Handle drag end
     */
    handleDragEnd(e, core) {
      this.isDragging = false;
      this.draggingUnit = null;
      this.dragAction = null;
      this.dragStartPos = null;

      // Clear all targeting markers
      this.clearAllTargetMarkers();

      // Bug #20: Clear overlay canvas
      if (core.overlay) core.overlay.clear();
      if (core.units) core.units.resetOpacity(core);
    },

    /**
     * Cleanup method for battle end (Bug #6 & #20)
     */
    cleanup(core) {
      this.spriteDragTeardown();

      // Remove resize listener
      if (this.resizeListener) {
        window.removeEventListener("resize", this.resizeListener);
        this.resizeListener = null;
      }

      // Clear overlay
      if (core && core.overlay) {
        core.overlay.clear();
      }

      // Clear all markers
      this.clearAllTargetMarkers();

      // Reset state
      this.isDragging = false;
      this.draggingUnit = null;
      this.dragAction = null;
      this.dragStartPos = null;
    },

    /**
     * Handle drag over (for drop zones)
     */
    handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },

    /**
     * Handle drop on unit (for swapping)
     */
    handleDrop(e, targetUnit, core) {
      e.preventDefault();
      e.stopPropagation();

      if (!this.isDragging) return;

      const draggedId = e.dataTransfer.getData("text/plain");

      // Check if swapping with bench unit
      const benchUnit = core.benchTeam.find(u => u.id === draggedId);

      if (benchUnit && targetUnit.isPlayer && !targetUnit.isBench && core.swap) {
        core.swap.swapActiveWithBench(targetUnit, benchUnit, core);
      }

      this.handleDragEnd(e, core);
    },

    /* ===== Targeting System =====
     * Ranges live on the ground plane. The origin is the dragged unit's feet
     * with its centre on the pointer (sprite drags put the element's centre
     * there; HTML5 drops place unit.pos there), an enemy counts when its feet
     * are inside the shape, and y distances are divided by RANGE_FLAT so a
     * circle becomes the flattened ellipse the overlay draws. Shape sizes are
     * reference px for a 1440x810 scene, scaled with the scene.
     */

    /** Scene scale for reference-px range sizes. */
    rangeScale(sceneRect) {
      const s = Math.min(sceneRect.width / 1440, sceneRect.height / 810);
      return Math.max(0.5, Math.min(1.5, s || 1));
    },

    /** Feet (ground contact) and head top of a unit, scene-relative px. */
    groundPoint(unit, core, sceneRect) {
      const el = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!el) return null;
      return this.groundPointOfEl(el, sceneRect);
    },

    groundPointOfEl(el, sceneRect) {
      const r = el.getBoundingClientRect();
      const slot = el.querySelector(".unit-sprite");
      const s = slot ? slot.getBoundingClientRect() : r;
      const body = el.querySelector(".sprite-player")?.getBoundingClientRect() || s;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return {
        x: cx - sceneRect.left,
        y: Math.max(cy, s.bottom) - sceneRect.top,
        headY: Math.min(r.top, body.top) - sceneRect.top,
        w: slot && !slot.classList.contains("unit-sprite--anim") ? s.width : 0, // portrait tile width
        cx: cx - sceneRect.left,
        cy: cy - sceneRect.top,
      };
    },

    /** Area of an action for a unit: { shape, args, all, limit, kind }. */
    actionArea(unit, action) {
      const kind = action === "jutsu" || action === "ultimate" ? action : "attack";
      if (kind !== "attack") {
        const skills = window.BattleCombat?.getUnitSkills(unit);
        const entry = skills?.[kind];
        if (entry) {
          const area = this.skillArea(entry, kind);
          const limit = window.BattleCombat?.skillTargetLimit?.(entry.data) ?? null;
          return { ...area, limit, kind };
        }
      }
      return { shape: "circle", args: { radius: this.ATTACK_RANGE_RADIUS }, all: false, limit: null, kind: "attack" };
    },

    /**
     * What a drop at (clientX, clientY) would do. Used by both the preview
     * and dropAt(), so the drawn range, the highlighted enemies and the
     * damage always agree.
     * Returns { action, kind, area, origin, dir, k, main, combo, marks }.
     */
    predictRange(dragAction, clientX, clientY, core) {
      const unit = this.draggingUnit;
      const sceneRect = core.dom.scene.getBoundingClientRect();
      const k = this.rangeScale(sceneRect);
      const px = clientX - sceneRect.left, py = clientY - sceneRect.top;

      // Feet offset of the dragged unit (sprite: ~60px below its centre).
      let foot = 0, head = NaN;
      const selfEl = unit && core.dom.scene.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (selfEl) { const g = this.groundPointOfEl(selfEl, sceneRect); foot = g.y - g.cy; head = g.headY - g.cy; }
      // headY only feeds the soft gap drawn behind the caster (not hit tests).
      const origin = { x: px, y: py + foot, headY: py + head };

      const area = this.actionArea(unit, dragAction);
      const living = (core.enemyTeam || []).filter(e => e && e.stats && e.stats.hp > 0 && !e.isBench);
      const pts = new Map();
      living.forEach(e => { const g = this.groundPoint(e, core, sceneRect); if (g) pts.set(e, g); });

      // Directional shapes face the nearest enemy (right when there is none).
      let dir = 1, best = Infinity;
      pts.forEach(g => {
        const d = Math.hypot(g.x - origin.x, (g.y - origin.y) / this.RANGE_FLAT);
        if (d < best) { best = d; dir = g.x < origin.x - 1 ? -1 : 1; }
      });

      const dist = e => { const g = pts.get(e); return Math.hypot(g.x - origin.x, (g.y - origin.y) / this.RANGE_FLAT); };
      let main = [...pts.keys()]
        .filter(e => area.all || this.isGroundPointInArea(pts.get(e), origin, area, dir, k))
        .sort((a, b) => dist(a) - dist(b));
      if (Number.isFinite(area.limit) && area.limit > 0) main = main.slice(0, area.limit);

      // Proximity combo: enemies next to a main target take a follow-up hit.
      const combo = main.length && area.kind !== "ultimate" ? this.findProximityTargets(main, core) : [];

      let action = dragAction === "move" ? "attack" : dragAction;
      if (!main.length && dragAction === "move") action = "move";

      const marks = [
        ...main.map(e => ({ ...pts.get(e), combo: false })),
        ...combo.map(e => ({ ...(pts.get(e) || this.groundPoint(e, core, sceneRect)), combo: true })),
      ].filter(m => Number.isFinite(m.x));

      return { action, kind: area.kind, area, origin, dir, k, main, combo, marks };
    },

    /** Point (scene px) inside an area anchored at origin (scene px)? */
    isGroundPointInArea(pt, origin, area, dir = 1, k = 1) {
      const lx = ((pt.x - origin.x) * dir) / k;
      const ly = (pt.y - origin.y) / this.RANGE_FLAT / k;
      return this.isUnitInShape(lx, ly, 0, 0, area.shape, area.args);
    },

    /** Legacy preview entry point (scene-relative x/y). */
    showDragTargetingPreview(x, y, core, actionType = null) {
      if (!this.draggingUnit || !core.overlay) return;
      const r = core.dom.scene.getBoundingClientRect();
      core.overlay.show(this.predictRange(actionType || this.dragAction, r.left + x, r.top + y, core));
    },

    /** Enemies a drop at scene-relative (x, y) would hit. */
    findUnitsInRange(x, y, actionType, core) {
      const r = core.dom.scene.getBoundingClientRect();
      return this.predictRange(actionType, r.left + x, r.top + y, core).main;
    },

    /**
     * Targeting area for a skill entry ({ meta, data } from getUnitSkills).
     * characters.json names shapes the way the original game does
     * ("Circle", "H. Rectangle (Fat)", "Cone", "Cross (x)", ...) or uses a
     * placeholder ("—"); explicit shapeArgs win. "Whole map" / "all enemies"
     * skills hit everyone (the skill's own target count still applies).
     */
    skillArea(entry, action) {
      const d = entry?.data || {};
      const name = String(d.shape || "").toLowerCase().trim();
      let shape = "circle", args = { radius: action === "ultimate" ? 190 : 150 };
      if (/^circle|^round/.test(name)) args = { radius: 150 };
      else if (/semicircle|half.?circle/.test(name)) { shape = "sector"; args = { radius: 220, angleDeg: 180 }; }
      else if (/cone|sector|fan/.test(name)) { shape = "sector"; args = { radius: 300, angleDeg: 70 }; }
      else if (/cross/.test(name)) { shape = "cross"; args = { length: 420, width: 100, rotDeg: /x/.test(name.replace("cross", "")) ? 45 : 0 }; }
      else if (/^line/.test(name)) { shape = "line"; args = { length: 520, width: 90 }; }
      else if (/square/.test(name)) { shape = "rect"; args = { w: 260, h: 260 }; }
      else if (/^v\.? ?rect/.test(name)) { shape = "rect"; args = { w: /fat/.test(name) ? 200 : 130, h: 460 }; }
      else if (/rect/.test(name)) {
        shape = "rect";
        const h = /fat/.test(name) ? 230 : /thin/.test(name) ? 80 : 140;
        const w = /1\/3/.test(name) ? 260 : /2\/3/.test(name) ? 360 : 460;
        args = { w, h };
      } else if (["rect", "line", "sector"].includes(name)) {
        shape = name;
        args = name === "rect" ? { w: 320, h: 140 } : name === "line" ? { length: 360, width: 60 } : { radius: 260, angleDeg: 90 };
      }
      if (d.shapeArgs && typeof d.shapeArgs === "object") args = { ...args, ...d.shapeArgs };
      const text = `${d.shape || ""} ${d.range || ""} ${d.position || ""} ${d.description || ""}`;
      const all = /whole map|all enem/i.test(text);
      return { shape, args, all };
    },

    /**
     * Point in a shape. Coordinates are local to the shape's origin, facing
     * +x, in reference px with the ground squash already undone.
     */
    isUnitInShape(unitX, unitY, shapeX, shapeY, shape, args) {
      const a = args || {};
      switch (shape) {
        case "circle":
          return this.isPointInCircle(unitX, unitY, shapeX, shapeY, a.radius || 150);
        case "rect":
          return this.isPointInRect(unitX, unitY, shapeX, shapeY, a.w || 320, a.h || 140);
        case "line":
          return this.isPointInLine(unitX, unitY, shapeX, shapeY, a.length || 360, a.width || 60);
        case "sector":
          return this.isPointInSector(unitX, unitY, shapeX, shapeY, a.radius || 260, a.angleDeg || 90);
        case "cross": {
          const rot = -((a.rotDeg || 0) * Math.PI) / 180;
          const dx = unitX - shapeX, dy = unitY - shapeY;
          const u = dx * Math.cos(rot) - dy * Math.sin(rot), v = dx * Math.sin(rot) + dy * Math.cos(rot);
          const L = (a.length || 420) / 2, W = (a.width || 100) / 2;
          return (Math.abs(u) <= L && Math.abs(v) <= W) || (Math.abs(v) <= L && Math.abs(u) <= W);
        }
        default:
          return false;
      }
    },

    isPointInCircle(px, py, cx, cy, radius) {
      return Math.hypot(px - cx, py - cy) <= radius;
    },

    /** Rectangle centred on (rectX, rectY). */
    isPointInRect(px, py, rectX, rectY, width, height) {
      return Math.abs(px - rectX) <= width / 2 && Math.abs(py - rectY) <= height / 2;
    },

    /** Band running forward (+x) from (lineX, lineY). */
    isPointInLine(px, py, lineX, lineY, length, width) {
      return px >= lineX && px <= lineX + length && Math.abs(py - lineY) <= width / 2;
    },

    /** Cone facing +x from (sectorX, sectorY); 360° is a full circle. */
    isPointInSector(px, py, sectorX, sectorY, radius, angleDeg) {
      if (Math.hypot(px - sectorX, py - sectorY) > radius) return false;
      if (angleDeg >= 359) return true;
      return Math.abs(Math.atan2(py - sectorY, px - sectorX)) <= (angleDeg * Math.PI) / 360;
    },

    /**
     * Find proximity targets (enemies near the main targets)
     * These will receive basic attacks as combo damage
     */
    findProximityTargets(mainTargets, core) {
      const PROXIMITY_RADIUS = 120; // Distance to trigger proximity combo
      const proximityTargets = [];

      // For each main target, find nearby enemies
      mainTargets.forEach(mainTarget => {
        const mainEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${mainTarget.id}"]`);
        if (!mainEl) return;

        const mainRect = mainEl.getBoundingClientRect();
        const sceneRect = core.dom.scene.getBoundingClientRect();
        const mainX = mainRect.left - sceneRect.left + mainRect.width / 2;
        const mainY = mainRect.top - sceneRect.top + mainRect.height / 2;

        // Check all enemies
        core.enemyTeam.forEach(enemy => {
          // Skip if already a main target or dead
          if (mainTargets.includes(enemy) || enemy.stats.hp <= 0) return;
          // Skip if already in proximity list
          if (proximityTargets.includes(enemy)) return;

          const enemyEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${enemy.id}"]`);
          if (!enemyEl) return;

          const enemyRect = enemyEl.getBoundingClientRect();
          const enemyX = enemyRect.left - sceneRect.left + enemyRect.width / 2;
          const enemyY = enemyRect.top - sceneRect.top + enemyRect.height / 2;

          const dist = Math.sqrt((mainX - enemyX) ** 2 + (mainY - enemyY) ** 2);
          if (dist <= PROXIMITY_RADIUS) {
            proximityTargets.push(enemy);
          }
        });
      });

      return proximityTargets;
    },

    /**
     * Find unit at specific position
     */
    findUnitAtPosition(x, y, isPlayer, core) {
      const targets = isPlayer ? core.activeTeam : core.enemyTeam;
      const threshold = 60; // Hit detection radius

      for (const unit of targets) {
        if (unit.stats.hp <= 0 || unit.isBench) continue;

        const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
        if (!unitEl) continue;

        const rect = unitEl.getBoundingClientRect();
        const sceneRect = core.dom.scene.getBoundingClientRect();

        const unitCenterX = rect.left - sceneRect.left + rect.width / 2;
        const unitCenterY = rect.top - sceneRect.top + rect.height / 2;

        const dist = Math.sqrt((x - unitCenterX) ** 2 + (y - unitCenterY) ** 2);
        if (dist < threshold) return unit;
      }

      return null;
    }
  };

  // Export to window
  window.BattleDrag = BattleDrag;

  // Add CSS for target markers
  const style = document.createElement('style');
  style.textContent = `
    @keyframes targetPulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.6;
        transform: scale(1.05);
      }
    }

    .target-marker {
      animation: targetPulse 1s ease-in-out infinite;
    }

    /* Enemies inside the drag range (the overlay draws their ground ring). */
    .battle-unit.is-range-target .unit-sprite {
      filter: drop-shadow(0 0 3px rgba(255, 90, 60, 0.95)) drop-shadow(0 0 10px rgba(241, 217, 138, 0.55));
    }
    .battle-unit.is-range-combo .unit-sprite {
      filter: drop-shadow(0 0 4px rgba(241, 217, 138, 0.7));
    }
  `;
  document.head.appendChild(style);

  console.log("[BattleDrag] Module loaded ✅ (with targeting markers & proximity detection)");
})();
