// js/battle/battle-boss.js - Boss Battles: one giant enemy looming over the field with telegraphed attacks
(() => {
  "use strict";

  /**
   * BattleBoss
   *
   * A boss mission (data/missions.json entry with `"giant": "<id>"`, wave
   * enemy `{ "giant": "<id>" }`) fields ONE giant enemy defined in
   * data/bosses.json. It is a normal combatant (speed gauge, damage, buffs,
   * KO, victory / defeat all run through the usual modules); this module only
   * draws it huge, anchored to the right edge of the field (cropped by the
   * screen like Blazing's giant bosses), and replaces its AI turn.
   *
   * Boss turn (BattleCombat.performAITurn hands bosses to performTurn):
   *   1. unleash the attack telegraphed on its previous turn (the danger zone
   *      stayed on the field for the players' turns, so they could drag units
   *      out of it or Guard), hitting every player unit whose feet are inside;
   *   2. shift its lean (it never walks: it looms, breathes and sways);
   *   3. telegraph the next attack of the current phase's `pattern`.
   * The "Danger N" tag on its head counts the boss turns until the next
   * whole-map attack lands (from the pattern / phase data), red at 1.
   *
   * bosses.json, per boss:
   *   name, title, element, sprite (folder), placeholder ("beast" | "giant"),
   *   palette { glow, eyes, aura, tint }, aspect (width / height of the
   *   silhouette frame, used until the art exists),
   *   ranks { S: { hp, atk, def, speed } ... } (stamina, recommended power and
   *   rewards live on the mission in missions.json),
   *   sheets (optional list of the sheet names the art folder provides)
   *   loom: how the giant is framed. Boxes / points are fractions of the idle
   *   frame ([x0, y0, x1, y1] / [x, y], 0..1 from the frame's top-left):
   *     - scale [min, max]: body height (body top to the feet) in unit
   *       heights (the units' --sprite-h). The largest size in the range
   *       that keeps `keep` between the boss bar and the bottom of the screen.
   *     - body: the drawn body (hit area = its part on the field).
   *     - keep: what must stay in view (head / face, claws / blades).
   *     - keepAlign: where `keep` sits in the spare height (0 top .. 1 bottom).
   *     - cropRight: frame x that lands on the right screen edge.
   *     - core: head / chest box: the boss's element on the field (damage
   *       numbers, hit flash, tap target).
   *     - edge [[y, x], ...]: the body's front (left) edge by height; units
   *       target it and stop there when they run in.
   *     - tag [x, y]: where the BOSS / Danger tag sits (bottom centre).
   *     - sway { deg, px, ms }: breathing sway (optional).
   *   phases [{ hp, pattern, name, banner, speedMult, damageMult, aura }]
   *     - a phase starts once HP / maxHP <= its `hp`; pattern lists attack ids
   *       and loops.
   *   attacks { id: { name, kind: "area" | "map", shape, mult, sheet, warnMs,
   *                   banner, telegraphTurns } }
   *     - mult is the damage multiplier fed to BattleCombat.calculateDamage.
   *     - telegraphTurns (default 1): 0 = the attack lands right after its
   *       wind-up in the same turn.
   *     - warnMs: last-second warning before the hit (map attacks: banner).
   *   shape (one object or an array, unioned), in field %:
   *     { type: "row",    at: "target" | y, size }  horizontal band, `size` tall
   *     { type: "column", at: "target" | x, size }  vertical band, `size` wide
   *     { type: "cross",  at: "target", size }      row + column
   *     { type: "half",   side: "target" | "top" | "bottom" | "left" | "right" }
   *     { type: "circle", at: "target" | "boss", radius }  (radius: % of width)
   *     { type: "cone",   angle, range }  from the boss toward a target
   *   "target" aims at a random living player unit (each circle of an array
   *   picks a different one when it can).
   *
   * Art: sheets from <sprite>/ (idle, roar, telegraph, attack_area, attack_map,
   * hit, ko and <sheet>_fx), all sharing the idle frame's size and anchor.
   * Until idle.json + idle.webp exist a CSS / SVG silhouette stands in; the
   * folder is polled and the real sprite swaps in as soon as it lands.
   */

  const ART_POLL_MS = 5000;
  // Sheets requested for a boss unless bosses.json lists its own `sheets`
  // (only listed sheets are ever fetched, so optional ones never 404).
  const DEFAULT_SHEETS = ["idle", "roar", "telegraph", "attack_area", "attack_map", "hit", "ko", "attack_area_fx", "attack_map_fx"];
  const FLAT = 0.6;            // ground squash of circles (matches the drag ranges)
  const rt = new WeakMap();    // unit -> { el, slot, lean, host, sprite, art, poll, g (geometry) }
  // Framing when bosses.json has no `loom` block (fractions of the frame).
  const LOOM_DEFAULTS = { scale: [5.5, 7.5], body: [0.1, 0.1, 0.9, 1], keep: [0.1, 0.25, 0.6, 0.9], keepAlign: 0.4,
    cropRight: 0.75, core: [0.2, 0.3, 0.6, 0.75], edge: [[0, 0.2], [1, 0.2]], tag: [0.3, 0.3], sway: { deg: 0.8, px: 4, ms: 5200 } };
  const sheetCache = new Map(); // "<base>/<name>" -> Promise<meta|null>, probed once per battle

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /* ===== Low rumble / roar / stomp, synthesised (no audio files needed) ===== */

  const Sfx = {
    ctx: null, out: null, noise: null, ambient: null,

    volume() {
      try { return window.AudioManager?.getEffectiveVolume?.("sfx") ?? 0.8; } catch (e) { return 0.8; }
    },

    ensure() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          this.ctx = new AC();
          this.out = this.ctx.createGain();
          this.out.connect(this.ctx.destination);
          // Brown noise: the base of every rumble / impact
          const len = this.ctx.sampleRate * 2;
          const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const d = buf.getChannelData(0);
          let last = 0;
          for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
          this.noise = buf;
        }
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        this.out.gain.value = this.volume();
        return this.ctx;
      } catch (e) { return null; }
    },

    env(g, t, a, peak, hold, rel) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    },

    noiseThrough(type, freq, peak, a, hold, rel, q = 0.7) {
      const c = this.ensure(); if (!c) return;
      const t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); this.env(g, t, a, peak, hold, rel);
      src.connect(f).connect(g).connect(this.out);
      src.start(t); src.stop(t + a + hold + rel + 0.05);
    },

    tone(type, f0, f1, peak, a, hold, rel) {
      const c = this.ensure(); if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + hold + rel);
      const g = c.createGain(); this.env(g, t, a, peak, hold, rel);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + a + hold + rel + 0.05);
    },

    rumble(sec = 1.6, peak = 0.5) { this.noiseThrough("lowpass", 110, peak, 0.25, sec * 0.5, sec * 0.5); this.tone("sine", 42, 34, peak * 0.5, 0.3, sec * 0.4, sec * 0.5); },
    stomp(peak = 0.7) { this.tone("sine", 70, 28, peak, 0.005, 0.05, 0.45); this.noiseThrough("lowpass", 180, peak * 0.8, 0.005, 0.04, 0.35); },
    boom(peak = 0.9) { this.tone("sine", 60, 22, peak, 0.005, 0.15, 1.2); this.noiseThrough("lowpass", 400, peak, 0.005, 0.1, 1.1); this.noiseThrough("bandpass", 1800, peak * 0.25, 0.005, 0.02, 0.3); },
    slash(peak = 0.4) { this.noiseThrough("highpass", 2400, peak, 0.01, 0.05, 0.25); this.tone("sawtooth", 900, 200, peak * 0.2, 0.01, 0.05, 0.25); },
    roar(sec = 1.8, slow = 1) {
      const p = 1 / slow;
      this.tone("sawtooth", 120 * p, 62 * p, 0.28, 0.25, sec * 0.55, sec * 0.45);
      this.tone("sawtooth", 83 * p, 45 * p, 0.24, 0.3, sec * 0.5, sec * 0.5);
      this.noiseThrough("bandpass", 480 * p, 0.55, 0.2, sec * 0.55, sec * 0.45, 1.2);
      this.rumble(sec, 0.45);
    },
    siren() {
      const c = this.ensure(); if (!c) return;
      for (let i = 0; i < 3; i++) setTimeout(() => this.tone("square", i % 2 ? 196 : 247, i % 2 ? 190 : 240, 0.08, 0.02, 0.28, 0.08), i * 420);
    },
    startAmbient() {
      const c = this.ensure(); if (!c || this.ambient) return;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 70;
      const g = c.createGain(); g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 3);
      src.connect(f).connect(g).connect(this.out); src.start();
      this.ambient = { src, g };
    },
    stopAmbient() {
      const a = this.ambient; if (!a || !this.ctx) return;
      this.ambient = null;
      try { a.g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.5); a.src.stop(this.ctx.currentTime + 1.6); } catch (e) { /* stopped */ }
    },
  };

  /* ===== Placeholder silhouettes (until the boss sheets exist) ===== */

  function beastSvg() {
    // Crouched fox facing left, nine tails fanning up behind it.
    const tails = Array.from({ length: 9 }, (_, i) => {
      const a = -150 + i * 17;                      // fan angle (deg)
      const r = (a * Math.PI) / 180;
      const tx = 300 + Math.cos(r) * -150, ty = 190 + Math.sin(r) * 170;
      const cx = 300 + Math.cos(r) * -40 + 60, cy = 190 + Math.sin(r) * 60;
      return `<path class="bp-tail" style="--i:${i}" d="M300 196 Q${cx.toFixed(0)} ${cy.toFixed(0)} ${tx.toFixed(0)} ${ty.toFixed(0)}"/>`;
    }).join("");
    return `<svg viewBox="0 0 420 312" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g class="bp-tails">${tails}</g>
      <path class="bp-body" d="M18 300 C22 262 40 232 62 214 L52 150 L86 182 L98 128 L118 184
        C150 170 196 172 232 188 C270 166 318 172 344 212 C362 240 360 272 350 300 L312 300 L306 272
        L272 280 L266 304 L226 304 L220 278 L168 280 L160 306 L118 306 L114 280 C80 282 44 290 18 300 Z"/>
      <path class="bp-mouth" d="M30 262 L78 250 L60 270 Z"/>
      <g class="bp-eyes"><path d="M70 214 L98 204 L92 216 Z"/><path d="M104 206 L126 200 L120 212 Z"/></g>
    </svg>`;
  }

  function giantSvg() {
    // Armoured, winged giant facing left, a blade in each hand.
    return `<svg viewBox="0 0 320 320" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g class="bp-wings">
        <path d="M190 120 L318 20 L300 90 L316 100 L286 150 L304 160 L262 196 Z"/>
        <path d="M150 118 L60 10 L70 80 L50 88 L90 140 L70 150 L118 188 Z"/>
      </g>
      <path class="bp-blade" d="M96 178 L6 36 L16 32 L108 170 Z"/>
      <path class="bp-blade" d="M214 184 L312 300 L302 306 L204 194 Z"/>
      <path class="bp-body" d="M122 318 L128 236 L98 214 L92 176 L118 150 L136 150 L140 104 L130 92 L132 70
        L150 44 L170 40 L186 64 L190 92 L180 104 L184 150 L206 152 L230 180 L222 216 L194 236 L198 318 Z"/>
      <path class="bp-crest" d="M150 44 L140 10 L162 38 L176 6 L172 44 Z"/>
      <g class="bp-eyes"><path d="M142 78 L158 74 L154 82 Z"/><path d="M164 76 L178 74 L174 82 Z"/></g>
    </svg>`;
  }

  /* ===== Module ===== */

  const BattleBoss = {
    defs: {},
    core: null,
    def: null,
    bossId: null,
    unit: null,
    layers: null,
    _phaseRunning: false,

    /** Called from BattleCore.init once data is loaded. Returns true for a boss mission. */
    setup(core, data) {
      this.core = core;
      this.defs = data && typeof data === "object" ? data : {};
      const id = core.missionData?.giant;
      if (!id || !this.defs[id]) return false;
      this.bossId = id;
      this.def = this.defs[id];
      core.isBossBattle = true;
      core.isBoss = true; // battle-core plays the 'boss' music track for this
      document.body.classList.add("is-boss-battle");
      this.buildArena(core);
      // Boss sheets are big: fetch + decode them all while the battle loads.
      this.ready = this.preloadArt();
      try { window.PageLoader?.wait?.(this.ready, "boss sheets"); } catch (e) { /* optional loader */ }
      window.addEventListener("resize", () => this.layout());
      return true;
    },

    is(unit) { return !!(unit && unit.isBoss); },

    defOf(unit) { return this.defs[unit?.bossId] || this.def || {}; },

    phaseDef(unit) {
      const phases = this.defOf(unit).phases || [];
      return phases[unit.bossState?.phase || 0] || phases[0] || { pattern: [] };
    },

    /** Faster at ×2 / ×3 battle speed, never below half the authored timing. */
    ms(n) { return n / clamp(this.core?.speedMultiplier || 1, 1, 2); },
    wait(n) { return new Promise(r => setTimeout(r, this.ms(n))); },

    /* ----- unit ----- */

    /** Build the boss combatant for a wave entry `{ giant: id }`. */
    createUnit(core, bossId) {
      const def = this.defs[bossId];
      if (!def) return null;
      const rank = def.ranks?.[core.difficulty] || Object.values(def.ranks || {})[0] || {};
      const stats = {
        hp: rank.hp || 200000, maxHP: rank.hp || 200000,
        atk: rank.atk || 3000, def: rank.def || 100, speed: rank.speed || 95, chakra: 0,
      };
      const data = { uid: `boss-${bossId}`, name: def.name, portrait: this.placeholderThumb(def), isPlayer: false, stats, pos: { x: 75, y: 50 } };
      const unit = core.units ? core.units.createCombatant(data) : { ...data, id: data.uid, statusEffects: [], chakra: 0, maxChakra: 10, speedGauge: 0 };
      unit.isBoss = true;
      unit.bossId = bossId;
      unit.baseSpeed = stats.speed;
      unit.speedGauge = 650; // first turn only winds up an attack
      unit.bossState = { phase: 0, step: 0, pending: null, phasePending: null, turns: 0, dead: false };
      unit._ref = { enemy: def, base: { id: bossId, name: def.name, element: def.element } };
      unit.pos = { x: 80, y: 45 }; // placed by mount() once the field exists
      this.unit = unit;
      return unit;
    },

    placeholderThumb(def) {
      const p = def.palette || {};
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#07070b"/>` +
        `<circle cx="32" cy="36" r="26" fill="${p.aura || "#a00"}" opacity=".35"/>` +
        `<path d="M8 64 C10 40 20 26 32 24 C44 26 54 40 56 64 Z" fill="#000"/>` +
        `<path d="M20 38 L29 35 L27 40 Z M35 35 L44 38 L37 40 Z" fill="${p.eyes || "#ff0"}"/></svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    },

    /* ----- geometry (grid px unless noted; unit.pos is the element centre in grid %) ----- */

    grid() { return this.core?.dom?.grid || document.getElementById("battlefield-grid"); },

    unitHeight() {
      const probe = this.grid()?.querySelector(".battle-unit:not(.battle-unit--boss)");
      const h = probe ? parseFloat(getComputedStyle(probe).getPropertyValue("--sprite-h")) : NaN;
      return h > 0 ? h : (document.documentElement.classList.contains("is-mobile") ? 76 : 101);
    },

    /** Band units stand in (grid px): below the boss HP bar, above the team holder cards. */
    standBand() {
      const grid = this.grid();
      const gr = grid.getBoundingClientRect();
      const B = window.BattleSeparation?.fieldBounds?.(this.core, gr) || { top: 0, bottom: gr.height };
      let top = B.top;
      const hud = this.layers?.hud;
      if (hud) top = Math.max(top, hud.offsetTop + hud.offsetHeight + 14 - grid.offsetTop); // + the HP numbers under the bar
      return { top, bottom: Math.max(top + 60, B.bottom) };
    },

    loom(unit) {
      const d = this.defOf(unit).loom || {};
      return { ...LOOM_DEFAULTS, ...d, sway: { ...LOOM_DEFAULTS.sway, ...(d.sway || {}) } };
    },

    /** Idle frame metadata (the silhouette's box until the art exists). */
    frameMeta(unit) {
      const idle = this.idleMeta;
      if (idle) return { w: idle.frameWidth, h: idle.frameHeight, ax: Number(idle.anchorX) || 0.5, ay: Number(idle.anchorY) || 1, hs: Number(idle.heightScale) > 0 ? Number(idle.heightScale) : 1 };
      return { w: (this.defOf(unit).aspect || 1.2) * 512, h: 512, ax: 0.5, ay: 1, hs: 1 };
    },

    /**
     * Where the giant is drawn (grid px): the frame box, its body / core /
     * hit boxes and front edge. The largest `scale` that keeps `keep` between
     * the boss bar and the bottom of the screen; `cropRight` of the frame on
     * the right screen edge, so the rest runs off the right and top edges.
     */
    geom(unit) {
      const grid = this.grid();
      const scene = this.layers?.scene || this.core?.dom?.scene;
      const gw = grid.clientWidth, gh = grid.clientHeight;
      const L = this.loom(unit), m = this.frameMeta(unit);
      const U = this.unitHeight();
      const band = this.standBand();
      // visible screen in grid px
      const vis = { l: -grid.offsetLeft, t: -grid.offsetTop, r: (scene?.clientWidth || gw) - grid.offsetLeft, b: (scene?.clientHeight || gh) - grid.offsetTop };
      const hud = this.layers?.hud;
      const top = hud && hud.offsetHeight ? hud.offsetTop + hud.offsetHeight + 4 - grid.offsetTop : band.top;
      const bottom = vis.b - 2;
      const bodyF = Math.max(0.2, m.ay - L.body[1]);
      const keepH = Math.max(0.1, L.keep[3] - L.keep[1]);
      const [sMin, sMax] = Array.isArray(L.scale) ? L.scale : [L.scale, L.scale];
      const fit = ((bottom - top) * bodyF) / (keepH * U);
      const scale = clamp(fit, sMin, sMax);
      const FH = (scale * U) / bodyF;
      const FW = (FH * m.w) / m.h;
      const ox = vis.r - L.cropRight * FW;
      const spare = bottom - top - keepH * FH;
      const oy = top + Math.max(0, spare) * clamp(L.keepAlign, 0, 1) + Math.min(0, spare) * 0.5 - L.keep[1] * FH;
      const P = (x, y) => ({ x: ox + x * FW, y: oy + y * FH });
      const box = (f, lim) => {
        const a = P(f[0], f[1]), b = P(f[2], f[3]);
        return { l: Math.max(lim.l, a.x), t: Math.max(lim.t, a.y), r: Math.min(lim.r, b.x), b: Math.min(lim.b, b.y) };
      };
      const field = { l: 0, t: band.top, r: gw, b: band.bottom };
      const core = box(L.core, { l: 0, t: top, r: gw, b: Math.min(bottom, gh) });
      if (core.r - core.l < 60) core.l = core.r - 60;
      if (core.b - core.t < 60) core.t = core.b - 60;
      const edge = [...L.edge].sort((a, b) => a[0] - b[0]);
      return {
        U, scale, FH, FW, ox, oy, m, L, band, top, vis, gw, gh,
        body: box(L.body, field), core,
        face: P((L.keep[0] + L.keep[2]) / 2, L.keep[1] + keepH * 0.25),
        feetY: oy + m.ay * FH,
        /** Front (left) edge of the body at grid-px height y. */
        edgeX(y) {
          const f = (y - oy) / FH;
          let x = edge[0][1];
          if (f >= edge[edge.length - 1][0]) x = edge[edge.length - 1][1];
          else for (let i = 1; i < edge.length; i++) {
            if (f <= edge[i][0]) {
              const [y0, x0] = edge[i - 1], [y1, x1] = edge[i];
              x = f <= y0 ? x0 : x0 + ((x1 - x0) * (f - y0)) / Math.max(1e-6, y1 - y0);
              break;
            }
          }
          return ox + x * FW;
        },
        P,
      };
    },

    /** Cached geometry of the mounted boss (recomputed by layout()). */
    g(unit) {
      const r = rt.get(unit);
      if (r?.g) return r.g;
      return this.geom(unit);
    },

    /** Ground point in front of the boss (grid px): where cones / "boss" circles start. */
    front(unit) {
      const g = this.g(unit);
      const y = clamp(g.face.y + g.U * 1.2, g.band.top + 10, g.band.bottom - 10);
      return { x: g.edgeX(y) - g.U * 0.2, y };
    },

    /** Feet of a player unit, grid px (same ground point the drag ranges use). */
    unitFeet(u) {
      const grid = this.grid();
      const el = grid?.querySelector(`.battle-unit[data-unit-id="${u.id}"]`);
      const gr = grid.getBoundingClientRect();
      if (el && window.BattleDrag?.groundPointOfEl) {
        const g = window.BattleDrag.groundPointOfEl(el, gr);
        return { x: g.x, y: g.y };
      }
      return { x: (u.pos.x / 100) * gr.width, y: (u.pos.y / 100) * gr.height };
    },

    /** Field band units may stand in (grid %), for splitting it in halves. */
    fieldBand() {
      const grid = this.grid();
      const gr = grid.getBoundingClientRect();
      const B = window.BattleSeparation?.fieldBounds?.(this.core, gr) || { top: 0, bottom: gr.height };
      return { top: (B.top / gr.height) * 100, bottom: (B.bottom / gr.height) * 100 };
    },

    /**
     * Point of the boss's visible body nearest to `origin` (scene px) —
     * player drag targeting: its front edge at the origin's height (the whole
     * visible body counts, not just its centre).
     */
    groundPointNear(unit, origin, sceneRect) {
      const r = rt.get(unit);
      if (!r?.el) return null;
      const g = this.g(unit);
      const gr = this.grid().getBoundingClientRect();
      const dx = gr.left - sceneRect.left, dy = gr.top - sceneRect.top;
      const y = clamp(origin.y - dy, g.body.t, g.body.b);
      const x = clamp(origin.x - dx, Math.max(g.body.l, g.edgeX(y)), g.body.r);
      const c = g.core;
      return { x: x + dx, y: y + dy, headY: c.t + dy, w: 0, cx: (c.l + c.r) / 2 + dx, cy: (c.t + c.b) / 2 + dy };
    },

    /**
     * Grid-% spot an attacker runs to when striking the boss: its own height
     * (inside the boss's body span), just in front of the body's edge.
     * aW: the attacker's drawn attack-sheet width (px).
     */
    strikePoint(unit, attacker, attackerEl, aW = 100) {
      const g = this.g(unit);
      const grid = this.grid();
      const box = parseFloat(getComputedStyle(attackerEl || grid).getPropertyValue("--sprite-box")) || 110;
      const cy = ((parseFloat(attackerEl?.style.top) || attacker.pos.y) / 100) * g.gh;
      const feet = clamp(cy + box / 2 - 4, Math.max(g.body.t, g.band.top) + box * 0.4, Math.min(g.body.b, g.band.bottom));
      const x = g.edgeX(feet) - aW * 0.28 + g.U * 0.12;
      return { x: clamp((x / g.gw) * 100, 3, 97), y: clamp(((feet - box / 2 + 4) / g.gh) * 100, 5, 95) };
    },

    /**
     * A unit dropped inside the boss's body steps back to its front edge.
     * Returns the new grid-% position, or null when it already stands clear.
     */
    keepOut(u) {
      const unit = this.unit;
      if (!unit || !rt.get(unit) || unit.stats.hp <= 0 || !u?.pos) return null;
      const g = this.g(unit);
      const f = this.unitFeet(u);
      const limit = g.edgeX(f.y) - g.U * 0.25;
      if (f.x <= limit || f.y < g.body.t) return null;
      return { x: clamp(u.pos.x - ((f.x - limit) / g.gw) * 100, 2, 98), y: u.pos.y };
    },

    /** The giant stands behind every unit. */
    depth(unit) {
      const r = rt.get(unit);
      if (r?.el) r.el.style.zIndex = "1";
    },

    /* ----- arena layers ----- */

    buildArena(core) {
      const scene = core.dom.scene;
      if (!scene || this.layers) return;
      const p = this.def.palette || {};
      scene.style.setProperty("--boss-glow", p.glow || "#ff5a1f");
      scene.style.setProperty("--boss-eyes", p.eyes || "#ffd84a");
      scene.style.setProperty("--boss-aura", p.aura || "#ff2414");
      scene.style.setProperty("--boss-tint", p.tint || "rgba(40,0,0,.4)");

      const mk = (cls, parent = scene, html = "") => {
        const el = document.createElement("div");
        el.className = cls;
        el.innerHTML = html;
        parent.appendChild(el);
        return el;
      };
      const tint = mk("boss-arena-tint");
      const ground = mk("boss-ground");
      const looming = mk("boss-looming", ground);
      const shadow = mk("boss-shadow", ground);
      const svgNS = "http://www.w3.org/2000/svg";
      const zones = document.createElementNS(svgNS, "svg");
      zones.setAttribute("class", "boss-zones");
      zones.innerHTML = `<defs>
          <pattern id="bz-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
            <rect width="14" height="14" fill="rgba(255,30,20,0.16)"/><rect width="6" height="14" fill="rgba(255,60,30,0.34)"/>
          </pattern>
          <radialGradient id="bz-glow"><stop offset="0" stop-color="rgba(255,60,30,0.55)"/><stop offset="1" stop-color="rgba(200,0,0,0.12)"/></radialGradient>
        </defs><g class="bz-pending"></g>`;
      ground.appendChild(zones);
      const fx = mk("boss-fx");
      // Blazing-style boss bar: red brush "Boss" label + a long gold-framed bar
      const hud = mk("boss-hud", scene, `
        <div class="bh-label" aria-label="${esc(this.def.name)}"><span>Boss</span></div>
        <div class="bh-frame">
          <div class="bh-bar"><div class="bh-ghost"></div><div class="bh-fill"></div><div class="bh-marks"></div></div>
        </div>
        <div class="bh-side"><span class="bh-phase"></span><span class="bh-pips"></span></div>
        <div class="bh-hp"></div>`);
      const warn = mk("boss-warn");
      // "BOSS" + "Danger N" on the giant's head (N = boss turns to the next whole-map attack)
      const danger = mk("boss-danger is-hidden", scene, `
        <span class="bd-tag">Boss</span>
        <span class="bd-word">Danger</span>
        <span class="bd-n"></span>`);
      this.layers = { scene, tint, ground, looming, shadow, zones, fx, hud, warn, danger };

      // phase pips + threshold ticks on the bar
      const phases = this.def.phases || [];
      hud.querySelector(".bh-pips").innerHTML = phases.map(() => "<i></i>").join("");
      hud.querySelector(".bh-marks").innerHTML = phases.slice(1)
        .map(ph => `<i style="left:${clamp((ph.hp || 0.5) * 100, 0, 100)}%"></i>`).join("");
      this.layout();
    },

    /** Keep the ground layer on the battlefield, the HUD under the speed bar and the giant framed. */
    layout() {
      const L = this.layers;
      const grid = this.grid();
      if (!L || !grid) return;
      Object.assign(L.ground.style, {
        top: `${grid.offsetTop}px`, left: `${grid.offsetLeft}px`,
        width: `${grid.offsetWidth}px`, height: `${grid.offsetHeight}px`,
      });
      L.zones.setAttribute("viewBox", `0 0 ${grid.offsetWidth} ${grid.offsetHeight}`);
      const track = document.getElementById("speed-gauge-track");
      const sr = L.scene.getBoundingClientRect();
      const tr = track?.getBoundingClientRect();
      const top = tr && tr.height ? tr.bottom - sr.top + 2 : 40;
      L.hud.style.top = `${Math.round(top)}px`;
      L.warn.style.top = `${Math.round(top + L.hud.offsetHeight + 4)}px`;

      const unit = this.unit;
      const r = unit && rt.get(unit);
      if (r?.el) {
        this.place(unit);
        // charging warning: centred over the open field, clear of the giant's head tag
        const open = grid.offsetLeft + Math.max(0, r.g.body.l) / 2;
        L.warn.style.left = `${Math.round(Math.max(open, Math.min(L.warn.offsetWidth / 2 + 8, sr.width / 2)))}px`;
        if (unit.bossState.pending) this.drawZone(unit.bossState.pending);
      }
    },

    /* ----- rendering (called from BattleUnits.renderUnit) ----- */

    mount(unit, el) {
      const def = this.defOf(unit);
      const slot = el.querySelector(".unit-sprite");
      el.classList.add("battle-unit--boss", `boss-${def.placeholder || "beast"}`);
      el.draggable = false;
      slot.className = "unit-sprite boss-body";
      slot.innerHTML = `
        <div class="boss-lean">
          <div class="boss-aura"></div>
          <div class="boss-placeholder">${def.placeholder === "giant" ? giantSvg() : beastSvg()}</div>
          <div class="boss-sprite-host"></div>
        </div>`;
      const r = { el, slot, lean: slot.querySelector(".boss-lean"), host: slot.querySelector(".boss-sprite-host"), sprite: null, art: false, poll: 0, g: null };
      rt.set(unit, r);
      this.unit = unit;
      const sw = this.loom(unit).sway;
      el.style.setProperty("--sway-deg", `${sw.deg}deg`);
      el.style.setProperty("--sway-px", `${sw.px}px`);
      el.style.setProperty("--sway-ms", `${sw.ms}ms`);
      this.applyPhaseLook(unit);
      this.layout();
      this.updateDisplay(unit, this.core);
      this.probeArt(unit);
    },

    /**
     * Frame the giant: the element is its head / chest box (what the rest
     * of the battle code treats as "the unit"); the art is drawn around it
     * at full size and runs off the screen edges.
     */
    place(unit) {
      const r = rt.get(unit);
      if (!r?.el) return;
      const g = this.geom(unit);
      const prevFH = r.g?.FH;
      r.g = g;
      const c = g.core;
      const w = c.r - c.l, h = c.b - c.t;
      unit.pos = { x: ((c.l + w / 2) / g.gw) * 100, y: ((c.t + h / 2) / g.gh) * 100 };
      r.el.style.left = `${unit.pos.x}%`;
      r.el.style.top = `${unit.pos.y}%`;
      const set = (k, v) => r.el.style.setProperty(k, `${v.toFixed(1)}px`);
      set("--boss-w", w);
      set("--boss-h", h);
      // frame box relative to the element's top-left
      set("--frame-l", g.ox - c.l);
      set("--frame-t", g.oy - c.t);
      set("--frame-w", g.FW);
      set("--frame-h", g.FH);
      // lean / sway pivot: the feet under the body
      set("--pivot-x", g.ox + g.m.ax * g.FW - c.l);
      set("--pivot-y", g.feetY - c.t);
      // sprite host: zero-size box on the frame's anchor, bottom on the frame's bottom
      r.host.style.left = `${(g.ox + g.m.ax * g.FW - c.l).toFixed(1)}px`;
      r.host.style.top = `${(g.oy + g.FH - c.t).toFixed(1)}px`;
      r.host.style.bottom = "auto";
      if (r.sprite && prevFH && Math.abs(prevFH - g.FH) > 0.5) {
        r.sprite.destroy();
        r.sprite = null;
        this.sheet("idle").then(m => this.attachArt(unit, m));
      }
      this.placeShadow(unit);
      this.depth(unit);
      this.placeDanger(unit);
    },

    placeShadow(unit) {
      const L = this.layers, r = rt.get(unit);
      if (!L || !r?.g) return;
      const g = r.g, f = this.front(unit);
      const bw = g.body.r - g.body.l;
      L.shadow.style.left = `${g.body.l + bw * 0.55}px`;
      L.shadow.style.top = `${Math.min(g.feetY, g.band.bottom + g.U)}px`;
      L.shadow.style.width = `${bw * 1.2}px`;
      L.shadow.style.height = `${Math.max(40, bw * 0.3)}px`;
      L.looming.style.left = `${f.x + g.U}px`;
      L.looming.style.top = `${f.y - g.U * 0.5}px`;
    },

    /* ----- danger countdown ----- */

    /**
     * Boss turns until the next whole-map attack lands: 1 while one is
     * telegraphed, else the pattern steps to the next map attack + its
     * wind-up turn. null when the phase's pattern has none.
     */
    dangerTurns(unit) {
      const st = unit.bossState, atks = this.defOf(unit).attacks || {};
      if (st.pending && atks[st.pending.id]?.kind === "map") return 1;
      const pat = this.phaseDef(unit).pattern || [];
      for (let k = 0; k < pat.length; k++) {
        const a = atks[pat[(st.step + k) % pat.length]];
        if (a?.kind === "map") return k + 1 + ((a.telegraphTurns ?? 1) > 0 ? 1 : 0);
      }
      return null;
    },

    updateDanger(unit = this.unit) {
      const d = this.layers?.danger;
      if (!d || !unit) return;
      const n = unit.bossState.dead ? null : this.dangerTurns(unit);
      const hidden = n == null || !this.introDone;
      d.classList.toggle("is-hidden", hidden);
      d.classList.toggle("is-imminent", n === 1);
      const el = d.querySelector(".bd-n");
      if (el.textContent !== String(n ?? "")) {
        el.textContent = n ?? "";
        d.classList.remove("is-tick");
        void d.offsetWidth;
        d.classList.add("is-tick");
      }
      this.placeDanger(unit);
    },

    placeDanger(unit) {
      const d = this.layers?.danger, r = rt.get(unit);
      if (!d || !r?.g) return;
      const g = r.g, grid = this.grid();
      const p = g.P(g.L.tag[0], g.L.tag[1]);
      const x = clamp(p.x, 40, g.gw - 40);
      const y = Math.max(p.y, g.top + d.offsetHeight + 2);
      d.style.left = `${(grid.offsetLeft + x).toFixed(1)}px`;
      d.style.top = `${(grid.offsetTop + y).toFixed(1)}px`;
    },

    /* ----- art: real sheets when the folder exists, silhouette until then ----- */

    sheetList() { return Array.isArray(this.def?.sheets) ? this.def.sheets : DEFAULT_SHEETS; },

    /**
     * Metadata of a boss sheet (image loaded and decoded), or null when the
     * boss has no such sheet. Only sheets in the boss's list, or effect
     * sheets an attack sheet declares in its `fx` block, are requested.
     */
    sheet(name, { declared = false } = {}) {
      const base = this.def?.sprite;
      if (!base || !window.SpritePlayer) return Promise.resolve(null);
      if (!declared && !this.sheetList().includes(name)) return Promise.resolve(null);
      const key = `${base}/${name}`;
      if (!sheetCache.has(key)) sheetCache.set(key, window.SpritePlayer.preload(base, name).catch(() => null));
      return sheetCache.get(key);
    },

    /** Does the art folder exist yet? (idle.json, not cached so it can land mid-battle) */
    idleLanded() {
      const base = this.def?.sprite;
      if (!base) return Promise.resolve(false);
      return fetch(`${base}/idle.json`, { cache: "no-store" }).then(r => r.ok).catch(() => false);
    },

    /** Load every listed sheet once the art exists. Resolves (never rejects) when done. */
    async preloadArt() {
      if (!(await this.idleLanded())) return false;
      await Promise.all(this.sheetList().map(n => this.sheet(n)));
      return true;
    },

    async probeArt(unit) {
      const r = rt.get(unit);
      if (!r || r.art || r.sprite || r.probing) return;
      clearTimeout(r.poll);
      r.probing = true;
      const landed = await this.idleLanded();
      r.probing = false;
      if (r.sprite) return;
      if (landed) {
        // Art just landed (or was there from the start): load the rest too.
        if (!(await this.sheet("idle"))) sheetCache.clear();
        this.ready = this.preloadArt();
        const meta = await this.sheet("idle");
        if (meta) { this.attachArt(unit, meta); return; }
      }
      if (!unit.bossState.dead) r.poll = setTimeout(() => this.probeArt(unit), ART_POLL_MS);
    },

    /**
     * Mount the real sprite: the idle frame drawn at the framed size (its
     * heightScale only says how the other sheets relate to it), standing on
     * the sprite host at the frame's anchor.
     */
    attachArt(unit, idle) {
      const r = rt.get(unit);
      if (!r || !window.SpritePlayer || !idle) return;
      if (this.idleMeta !== idle) {
        // The art decides the frame: re-frame the giant, then mount into it.
        this.idleMeta = idle;
        this.place(unit);
      }
      if (r.sprite) { r.sprite.destroy(); r.sprite = null; }
      const hs = Number(idle.heightScale) > 0 ? Number(idle.heightScale) : 1;
      const sp = window.SpritePlayer.create(r.host, this.def.sprite, { height: r.g.FH / hs }); // art faces left: no flip
      r.sprite = sp;
      sp.play("idle").catch(() => {});
      sp.meta("idle").then(() => {
        r.art = true;
        r.el.classList.add("has-art");
        // Turn-bar icon: the boss's thumb.webp once it exists
        const thumb = new Image();
        thumb.onload = () => {
          unit.portrait = thumb.src;
          const img = document.querySelector(`#speed-gauge-track .speed-marker[data-unit-id="${unit.id}"] img`);
          if (img) img.src = unit.portrait;
        };
        thumb.src = `${this.def.sprite}/thumb.webp`;
      }).catch(() => { /* sheet failed after probing: keep the silhouette */ });
    },

    /**
     * Play a boss sheet once (then idle). Falls back to the silhouette's CSS
     * pose of the same name when the art / that sheet is missing.
     * onHit(k, n) fires on each hit frame (or once, mid-pose, for the fallback).
     */
    async play(unit, name, { speed = 1, onHit = null, onFrame = null, fallbackMs = 900, hold = false } = {}) {
      const r = rt.get(unit);
      if (!r) return;
      const meta = r.art ? await this.sheet(name) : null;
      const sp = this.core?.speedMultiplier > 1 ? Math.min(2, this.core.speedMultiplier) : 1;
      if (meta && r.sprite) {
        const hits = Array.isArray(meta.hits) && meta.hits.length ? meta.hits : null;
        let fired = 0;
        await r.sprite.play(name, {
          then: hold ? null : "idle", speed: speed * sp,
          onHit: hits && onHit ? k => { fired++; onHit(k, hits.length); } : null,
          onFrame,
        });
        if (onHit && !fired) onHit(0, 1);
        if (hold && r.sprite.current === name) {
          // keep the final frame (e.g. the collapsed boss) on screen
          const w = parseFloat(r.sprite.el.style.width), h = parseFloat(r.sprite.el.style.height), last = meta.frames - 1;
          r.sprite.el.style.backgroundPosition = `${-(last % meta.columns) * w}px ${-Math.floor(last / meta.columns) * h}px`;
        }
        return;
      }
      const dur = this.ms(fallbackMs / speed);
      r.el.style.setProperty("--pose-ms", `${dur}ms`);
      r.el.classList.remove(`ph-${name}`);
      void r.el.offsetWidth;
      r.el.classList.add(`ph-${name}`);
      if (onHit) setTimeout(() => onHit(0, 1), dur * 0.45);
      await new Promise(res => setTimeout(res, dur));
      if (!/ko$/.test(name)) r.el.classList.remove(`ph-${name}`);
    },

    /**
     * Optional transparent effect sheet (e.g. attack_area_fx) played on the
     * zone: once per zone part (max 3), standing on the part's centre, or once
     * across the whole field for whole-map attacks. `fieldWide` sheets cover
     * the whole visible screen (ground line on its bottom edge).
     * Size: `heightUnits` unit heights when given, else the zone's height.
     */
    async playFx(name, zone, declared = false) {
      const meta = rt.get(this.unit)?.art ? await this.sheet(name, { declared }) : null;
      if (!meta || !window.SpritePlayer || !this.layers || !zone) return;
      const grid = this.grid();
      const gw = grid.clientWidth, gh = grid.clientHeight;
      const unitH = this.unitHeight();
      const hs = Number(meta.heightScale) > 0 ? Number(meta.heightScale) : 1;
      const whole = meta.fieldWide || zone.some(z => z.type === "all");
      const ground = Number(meta.groundY ?? meta.anchorY) || 1;
      const sw = this.layers.scene.clientWidth, sh = this.layers.scene.clientHeight;
      const h = meta.fieldWide ? Math.max((sw * meta.frameHeight) / meta.frameWidth, sh / ground) * 1.02
        : meta.heightUnits ? unitH * meta.heightUnits
        : whole ? gh : Math.max(120, this.zoneBox(zone).h);
      const pts = meta.fieldWide ? [{ x: sw / 2 - grid.offsetLeft, y: sh - grid.offsetTop }]
        : whole ? [{ x: gw / 2, y: gh * 0.9 }] : zone.slice(0, 3).map(z => this.zoneCentre(z, gw, gh));
      await Promise.all(pts.map(pt => {
        const holder = document.createElement("div");
        holder.className = "boss-fx-sheet";
        holder.style.left = `${grid.offsetLeft + pt.x}px`;
        holder.style.top = `${grid.offsetTop + pt.y + (1 - ground) * h}px`;
        this.layers.fx.appendChild(holder);
        const sp = window.SpritePlayer.create(holder, this.def.sprite, { height: h / hs });
        return sp.play(name).catch(() => {}).then(() => { sp.destroy(); holder.remove(); });
      }));
    },

    /** Ground point (grid px) an effect of one zone part stands on. */
    zoneCentre(z, gw, gh) {
      const px = v => (v / 100) * gw, py = v => (v / 100) * gh;
      switch (z.type) {
        case "row": return { x: gw * 0.42, y: py(z.y) };
        case "col": { const b = this.fieldBand(); return { x: px(z.x), y: py((b.top + b.bottom) / 2) }; }
        case "rect": return { x: px((z.x0 + z.x1) / 2), y: py((z.y0 + z.y1) / 2) };
        case "circle": return { x: px(z.x), y: py(z.y) };
        case "cone": return { x: px(z.x) + Math.cos(z.dir) * px(z.range) * 0.55, y: py(z.y) + Math.sin(z.dir) * px(z.range) * 0.55 };
        default: return { x: gw / 2, y: gh * 0.9 };
      }
    },

    /**
     * Play an attack / telegraph sheet with its effect layers: the sheet's own
     * `fx` block ([{ sheet, startFrame }], the unit convention) when it has
     * one, else "<sheet>_fx" from the first frame when that file exists.
     */
    async playWithFx(unit, name, zone, opts = {}) {
      const meta = rt.get(unit)?.art ? await this.sheet(name) : null;
      const fx = Array.isArray(meta?.fx) && meta.fx.length ? meta.fx : [{ sheet: `${name}_fx`, startFrame: 0 }];
      const started = new Set();
      const onFrame = i => fx.forEach((f, k) => {
        if (started.has(k) || i < (Number(f.startFrame) || 0)) return;
        started.add(k);
        this.playFx(f.sheet, zone, meta ? Array.isArray(meta.fx) && meta.fx.length > 0 : false);
      });
      if (!meta) onFrame(Infinity);
      await this.play(unit, name, { ...opts, onFrame: meta ? onFrame : null });
      onFrame(Infinity);
    },

    /* ----- display (called from BattleUnits.updateUnitDisplay) ----- */

    updateDisplay(unit, core) {
      const L = this.layers;
      const max = unit.stats.maxHP || 1;
      const hp = Math.max(0, unit.stats.hp);
      const pct = clamp((hp / max) * 100, 0, 100);
      if (L) {
        L.hud.querySelector(".bh-fill").style.width = `${pct}%`;
        const ghost = L.hud.querySelector(".bh-ghost");
        clearTimeout(this._ghostT);
        this._ghostT = setTimeout(() => { ghost.style.width = `${pct}%`; }, 450);
        L.hud.querySelector(".bh-hp").textContent = `${Math.ceil(hp).toLocaleString()} / ${max.toLocaleString()}`;
        L.hud.querySelectorAll(".bh-pips i").forEach((pip, i) => pip.classList.toggle("on", i <= (unit.bossState.phase || 0)));
      }
      const st = unit.bossState;
      if (hp <= 0) {
        if (!st.dead) { st.dead = true; this.playKO(unit, core); }
        return;
      }
      // Crossing a phase threshold: the roar plays as soon as the current turn ends.
      const phases = this.defOf(unit).phases || [];
      let idx = st.phase || 0;
      phases.forEach((ph, i) => { if (i > idx && hp / max <= (ph.hp ?? 1)) idx = i; });
      if (idx > (st.phase || 0) && (st.phasePending == null || idx > st.phasePending)) st.phasePending = idx;
    },

    /** Flinch when hit (called by battle-hit-react.js instead of the portrait knockback). */
    onHit(unit) {
      const r = rt.get(unit);
      if (!r || unit.stats.hp <= 0) return;
      const now = performance.now();
      if (now - (r.hitAt || 0) < 260) return;
      r.hitAt = now;
      r.slot.animate?.([
        { filter: "brightness(2.2) saturate(0.5)", translate: "0 0" },
        { filter: "brightness(1.4)", translate: "5px 0", offset: 0.3 },
        { filter: "none", translate: "0 0" },
      ], { duration: 260, easing: "ease-out" });
      if (r.art && r.sprite && ["idle", "hit"].includes(r.sprite.current)) {
        this.sheet("hit").then(m => { if (m && r.sprite && ["idle", "hit"].includes(r.sprite.current)) r.sprite.play("hit", { then: "idle" }); });
      }
    },

    /* ----- AI turn (called from BattleCombat.performAITurn) ----- */

    performTurn(unit, core, onDone) {
      unit._actionBusy = true;
      this.runTurn(unit, core)
        .catch(err => console.error("[BattleBoss] turn failed", err))
        .then(() => {
          unit._actionBusy = false;
          core.checkBattleEnd?.();
          onDone?.();
        });
    },

    over(core) {
      const players = [...(core.activeTeam || []), ...(core.benchTeam || [])];
      return !players.some(u => u.stats.hp > 0) || !(this.unit?.stats.hp > 0);
    },

    async runTurn(unit, core) {
      const st = unit.bossState;
      if (st.phasePending != null) await this.enterPhase(unit, core, st.phasePending);
      st.turns++;
      if (st.pending) {
        const p = st.pending;
        await this.unleash(unit, core, p);
        if (st.pending === p) st.pending = null;
        if (this.over(core)) return;
      }
      this.updateDanger(unit);
      await this.shiftLean(unit);
      if (this.over(core)) return;
      await this.telegraph(unit, core);
      this.updateDanger(unit);
    },

    /* ----- looming: no walking, only breathing sway (CSS) + lean shifts ----- */

    /**
     * Lean the whole giant around its feet: deg (negative = toward the
     * units), x / y in unit heights. Resolves once the lean has settled.
     */
    lean(unit, { deg = 0, x = 0, y = 0 } = {}, ms = 1200) {
      const r = rt.get(unit);
      if (!r?.lean) return Promise.resolve();
      const U = r.g?.U || 80;
      const dur = reduceMotion() ? 0 : this.ms(ms);
      r.lean.style.transition = `rotate ${dur}ms cubic-bezier(.45,0,.3,1), translate ${dur}ms cubic-bezier(.45,0,.3,1)`;
      r.lean.style.rotate = `${deg}deg`;
      r.lean.style.translate = `${(x * U).toFixed(1)}px ${(y * U).toFixed(1)}px`;
      return new Promise(res => setTimeout(res, dur));
    },

    /** Start of a boss turn: shift its weight to another lean (a slow loom, no steps). */
    async shiftLean(unit) {
      const LEANS = [{ deg: 0, x: 0, y: 0 }, { deg: -1.4, x: -0.22, y: 0.04 }, { deg: 0.9, x: 0.14, y: -0.04 }, { deg: -0.6, x: -0.08, y: 0.1 }];
      const st = unit.bossState;
      let i = Math.floor(Math.random() * (LEANS.length - 1));
      if (i >= (st.leanIdx || 0)) i++;
      st.leanIdx = i;
      Sfx.rumble(0.9, 0.22);
      await this.lean(unit, LEANS[i], 1300);
    },

    stomp(unit, power) {
      this.shake(power, 200);
      Sfx.stomp(0.35 + power * 0.04);
      const f = this.front(unit);
      const grid = this.grid();
      const d = document.createElement("div");
      d.className = "boss-dust";
      d.style.left = `${grid.offsetLeft + f.x + (Math.random() - 0.2) * (rt.get(unit)?.g?.U || 80)}px`;
      d.style.top = `${grid.offsetTop + f.y}px`;
      this.layers?.fx.appendChild(d);
      setTimeout(() => d.remove(), 900);
    },

    /* ----- camera ----- */

    shake(px = 8, dur = 300) {
      const scene = this.layers?.scene;
      if (!scene?.animate || reduceMotion()) return;
      const frames = [];
      for (let i = 0; i < 8; i++) {
        const k = 1 - i / 8;
        frames.push({ translate: `${((Math.random() - 0.5) * 2 * px * k).toFixed(1)}px ${((Math.random() - 0.5) * 2 * px * k).toFixed(1)}px` });
      }
      frames.push({ translate: "0 0" });
      scene.animate(frames, { duration: dur, easing: "linear", composite: "replace" });
    },

    zoom(unit, scale, dur) {
      const scene = this.layers?.scene;
      if (!scene?.animate || reduceMotion()) return;
      const f = this.g(unit).face;
      const grid = this.grid();
      scene.style.transformOrigin = `${grid.offsetLeft + f.x}px ${grid.offsetTop + f.y}px`;
      scene.animate([{ scale: "1" }, { scale: String(scale), offset: 0.25 }, { scale: String(scale), offset: 0.75 }, { scale: "1" }],
        { duration: dur, easing: "ease-in-out" });
    },

    flash(color = "rgba(255,255,255,.85)", dur = 380) {
      const f = document.createElement("div");
      f.className = "boss-flash";
      f.style.background = color;
      f.style.animationDuration = `${dur}ms`;
      this.layers?.fx.appendChild(f);
      setTimeout(() => f.remove(), dur + 50);
    },

    /* ----- banners ----- */

    banner(html, cls = "", ms = 2200) {
      const L = this.layers;
      if (!L) return Promise.resolve();
      const b = document.createElement("div");
      b.className = `boss-banner ${cls}`;
      b.innerHTML = `<div class="bb-stripe"></div><div class="bb-body">${html}</div><div class="bb-stripe"></div>`;
      L.scene.appendChild(b);
      return new Promise(res => setTimeout(() => {
        b.classList.add("out");
        setTimeout(() => { b.remove(); res(); }, 320);
      }, this.ms(ms)));
    },

    setWarn(text) {
      const w = this.layers?.warn;
      if (!w) return;
      w.innerHTML = text ? `<span class="bw-icon">!</span><span>${esc(text)}</span>` : "";
      w.classList.toggle("on", !!text);
      this.layers.tint.classList.toggle("is-charging", !!text);
      if (text) this.layout();
    },

    /* ----- zones ----- */

    /** Resolve an attack shape into primitives in field % (stored on the pending attack). */
    resolveZone(unit, shape) {
      const shapes = Array.isArray(shape) ? shape : [shape || { type: "all" }];
      const grid = this.grid();
      const gw = grid.clientWidth, gh = grid.clientHeight;
      const alive = (this.core.activeTeam || []).filter(u => u.stats.hp > 0 && !u.isBench);
      const used = new Set();
      const pickTarget = () => {
        const pool = alive.filter(u => !used.has(u));
        const t = (pool.length ? pool : alive)[Math.floor(Math.random() * (pool.length || alive.length))];
        if (t) used.add(t);
        if (!t) return { x: 30, y: 60 };
        const f = this.unitFeet(t);
        return { x: (f.x / gw) * 100, y: (f.y / gh) * 100 };
      };
      const band = this.fieldBand();
      const out = [];
      shapes.forEach(s => {
        const at = s.at === "boss" ? null : (typeof s.at === "number" ? null : pickTarget());
        switch (s.type) {
          case "row": {
            const y = typeof s.at === "number" ? s.at : at.y;
            out.push({ type: "row", y: clamp(y, band.top, band.bottom), h: s.size || 30 });
            break;
          }
          case "column": {
            const x = typeof s.at === "number" ? s.at : at.x;
            out.push({ type: "col", x: clamp(x, 0, 100), w: s.size || 24 });
            break;
          }
          case "cross":
            out.push({ type: "row", y: clamp(at.y, band.top, band.bottom), h: s.size || 20 });
            out.push({ type: "col", x: clamp(at.x, 0, 100), w: s.size || 20 });
            break;
          case "half": {
            const mid = (band.top + band.bottom) / 2;
            let side = s.side || "target";
            if (side === "target") side = at.y < mid ? "top" : "bottom";
            const rect = { top: [0, 0, 100, mid], bottom: [0, mid, 100, 100], left: [0, 0, 50, 100], right: [50, 0, 100, 100] }[side]
              || [0, mid, 100, 100];
            out.push({ type: "rect", x0: rect[0], y0: rect[1], x1: rect[2], y1: rect[3] });
            break;
          }
          case "circle": {
            const c = s.at === "boss" ? this.front(unit) : null;
            const x = c ? (c.x / gw) * 100 : at.x, y = c ? (c.y / gh) * 100 : at.y;
            out.push({ type: "circle", x, y, r: s.radius || 16 });
            break;
          }
          case "cone": {
            const f = this.front(unit);
            const ox = (f.x / gw) * 100, oy = (f.y / gh) * 100;
            const dx = ((at.x - ox) / 100) * gw, dy = ((at.y - oy) / 100) * gh;
            out.push({ type: "cone", x: ox, y: oy, dir: Math.atan2(dy, dx), angle: s.angle || 50, range: s.range || 90 });
            break;
          }
          default:
            out.push({ type: "all" });
        }
      });
      return out;
    },

    /** Is a grid-px point inside a resolved zone? */
    inZone(zone, pt) {
      const grid = this.grid();
      const gw = grid.clientWidth, gh = grid.clientHeight;
      const x = (pt.x / gw) * 100, y = (pt.y / gh) * 100;
      return zone.some(z => {
        switch (z.type) {
          case "all": return true;
          case "row": return Math.abs(y - z.y) <= z.h / 2;
          case "col": return Math.abs(x - z.x) <= z.w / 2;
          case "rect": return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
          case "circle": {
            const r = (z.r / 100) * gw;
            return Math.hypot(pt.x - (z.x / 100) * gw, (pt.y - (z.y / 100) * gh) / FLAT) <= r;
          }
          case "cone": {
            const ox = (z.x / 100) * gw, oy = (z.y / 100) * gh;
            const dx = pt.x - ox, dy = pt.y - oy;
            if (Math.hypot(dx, dy) > (z.range / 100) * gw) return false;
            let d = Math.atan2(dy, dx) - z.dir;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            return Math.abs(d) <= ((z.angle / 2) * Math.PI) / 180;
          }
          default: return false;
        }
      });
    },

    /** Bounding box (grid px) of a zone, for fx sheets / labels. */
    zoneBox(zone) {
      const grid = this.grid();
      const gw = grid.clientWidth, gh = grid.clientHeight;
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      const add = (x0, y0, x1, y1) => { l = Math.min(l, x0); t = Math.min(t, y0); r = Math.max(r, x1); b = Math.max(b, y1); };
      zone.forEach(z => {
        const px = v => (v / 100) * gw, py = v => (v / 100) * gh;
        if (z.type === "all") add(0, 0, gw, gh);
        else if (z.type === "row") add(0, py(z.y - z.h / 2), gw, py(z.y + z.h / 2));
        else if (z.type === "col") add(px(z.x - z.w / 2), 0, px(z.x + z.w / 2), gh);
        else if (z.type === "rect") add(px(z.x0), py(z.y0), px(z.x1), py(z.y1));
        else if (z.type === "circle") { const rr = px(z.r); add(px(z.x) - rr, py(z.y) - rr * FLAT, px(z.x) + rr, py(z.y) + rr * FLAT); }
        else if (z.type === "cone") { const rr = px(z.range); add(px(z.x) - rr, py(z.y) - rr, px(z.x), py(z.y) + rr); }
      });
      l = Math.max(0, l); t = Math.max(0, t); r = Math.min(gw, r); b = Math.min(gh, b);
      return { x: l, y: t, w: Math.max(1, r - l), h: Math.max(1, b - t) };
    },

    drawZone(p) {
      const L = this.layers;
      if (!L) return;
      const g = L.zones.querySelector(".bz-pending");
      if (!p) {
        g.innerHTML = "";
        g.setAttribute("class", "bz-pending");
        L.fx.querySelector(".boss-zone-label")?.remove();
        return;
      }
      const grid = this.grid();
      const gw = grid.clientWidth, gh = grid.clientHeight;
      const px = v => ((v / 100) * gw).toFixed(1), py = v => ((v / 100) * gh).toFixed(1);
      const atk = this.def.attacks?.[p.id] || {};
      const parts = p.zone.map(z => {
        switch (z.type) {
          case "all": return `<rect x="0" y="0" width="${gw}" height="${gh}"/>`;
          case "row": return `<rect x="-20" y="${py(z.y - z.h / 2)}" width="${gw + 40}" height="${py(z.h)}"/>`;
          case "col": return `<rect x="${px(z.x - z.w / 2)}" y="-20" width="${px(z.w)}" height="${gh + 40}"/>`;
          case "rect": return `<rect x="${px(z.x0)}" y="${py(z.y0)}" width="${px(z.x1 - z.x0)}" height="${py(z.y1 - z.y0)}"/>`;
          case "circle": { const rr = (z.r / 100) * gw; return `<ellipse cx="${px(z.x)}" cy="${py(z.y)}" rx="${rr.toFixed(1)}" ry="${(rr * FLAT).toFixed(1)}"/>`; }
          case "cone": {
            const ox = (z.x / 100) * gw, oy = (z.y / 100) * gh, rr = (z.range / 100) * gw, h = ((z.angle / 2) * Math.PI) / 180;
            const a = [z.dir - h, z.dir + h].map(t => `${(ox + Math.cos(t) * rr).toFixed(1)} ${(oy + Math.sin(t) * rr).toFixed(1)}`);
            return `<path d="M${ox.toFixed(1)} ${oy.toFixed(1)} L${a[0]} A${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${a[1]} Z"/>`;
          }
          default: return "";
        }
      }).join("");
      const box = this.zoneBox(p.zone);
      const isMap = atk.kind === "map";
      g.setAttribute("class", `bz-pending bz-on${isMap ? " bz-map" : ""}${p.armed ? " bz-armed" : ""}`);
      const band = this.fieldBand();
      // Whole-map attacks have no zone box: the full-bleed red pulse of the
      // arena tint and the warning banner mark them (a field-sized box would
      // read as a lighter rectangle over the field).
      if (isMap) { g.innerHTML = ""; L.fx.querySelector(".boss-zone-label")?.remove(); return; }
      g.innerHTML = `<clipPath id="bz-clip"><rect x="-40" y="${py(band.top - 4)}" width="${gw + 80}" height="${py(band.bottom - band.top + 8)}"/></clipPath>` +
        `<g clip-path="url(#bz-clip)"><g class="bz-fill">${parts}</g><g class="bz-hatch">${parts}</g><g class="bz-edge">${parts}</g></g>`;
      // Attack name tag over the zone (HTML, above the units so it is never covered)
      this.layers.fx.querySelector(".boss-zone-label")?.remove();
      if (!isMap) {
        const tag = document.createElement("div");
        tag.className = `boss-zone-label${p.armed ? " is-armed" : ""}`;
        tag.innerHTML = `<span class="bw-icon">!</span>${esc(atk.name || "Danger")}`;
        // under the boss HP bar, at the zone's top edge
        const hudBottom = L.hud.getBoundingClientRect().bottom - grid.getBoundingClientRect().top + 12;
        const top = Math.min(Math.max(py(band.top), box.y, hudBottom), Math.max(box.y, box.y + box.h - 24));
        tag.style.left = `${grid.offsetLeft + clamp(box.x + box.w / 2, 70, gw - 70)}px`;
        tag.style.top = `${grid.offsetTop + top + 4}px`;
        this.layers.fx.appendChild(tag);
      }
    },

    /* ----- attacks ----- */

    async telegraph(unit, core) {
      const st = unit.bossState;
      const def = this.defOf(unit);
      const ph = this.phaseDef(unit);
      const pattern = ph.pattern || [];
      if (!pattern.length) return;
      const id = pattern[st.step % pattern.length];
      st.step++;
      const atk = def.attacks?.[id];
      if (!atk) return;
      const zone = atk.kind === "map" ? [{ type: "all" }] : this.resolveZone(unit, atk.shape);
      const p = { id, zone, turns: atk.telegraphTurns ?? 1, armed: false };
      st.pending = p;

      Sfx.rumble(1.4, 0.4);
      this.drawZone(p);
      if (atk.kind === "map") {
        this.setWarn(atk.banner || `${atk.name} charging — Guard!`);
        Sfx.siren();
      }
      this.updateDanger(unit);
      // wind-up: loom forward over the field (rear up for a whole-map attack)
      this.lean(unit, atk.kind === "map" ? { deg: 1.6, x: 0.18, y: -0.12 } : { deg: -1.8, x: -0.3, y: 0.05 }, 800);
      await this.playWithFx(unit, "telegraph", zone, { fallbackMs: 900 });

      if (!p.turns) {
        const again = st.pending;
        st.pending = null;
        await this.unleash(unit, core, again);
      }
    },

    async unleash(unit, core, p) {
      const def = this.defOf(unit);
      const atk = def.attacks?.[p.id];
      if (!atk) { this.drawZone(null); return; }
      const isMap = atk.kind === "map";
      const ph = (def.phases || [])[unit.bossState.phase || 0] || {};
      const mult = (Number(atk.mult) || 2) * (Number(ph.damageMult) || 1);

      // Last-second warning: the zone flares; map attacks get the big banner.
      p.armed = true;
      this.drawZone(p);
      if (isMap) {
        Sfx.siren();
        this.banner(`<span class="bb-kicker">Incoming</span><span class="bb-title">${esc(atk.name)}</span>`, "is-incoming", (atk.warnMs || 2000) - 200);
        this.zoom(unit, 1.05, this.ms(atk.warnMs || 2000));
        Sfx.rumble((atk.warnMs || 2000) / 1000, 0.6);
      } else {
        Sfx.rumble(0.8, 0.35);
      }
      await this.wait(atk.warnMs || (isMap ? 2000 : 700));

      // Units standing in the zone right now take the hit.
      const targets = (core.activeTeam || []).filter(u => u.stats.hp > 0 && !u.isBench && this.inZone(p.zone, this.unitFeet(u)));
      const C = window.BattleCombat;
      const plans = targets.map(t => {
        const r = C ? C.calculateDamage(unit, t, mult) : { damage: Math.round(unit.stats.atk * mult) };
        return { t, total: r.damage || 0, crit: !!r.isCritical, dodged: !!r.dodged, breakdown: r.breakdown, dealt: 0 };
      });
      this.lastHit = { attack: p.id, targets: targets.map(t => t.name), dodged: plans.filter(pl => pl.dodged).map(pl => pl.t.name) };
      console.log(`[BattleBoss] ${atk.name}: ${targets.length} unit(s) in the zone`, this.lastHit);

      window.BattleAttackNames?.showAttackName?.(atk.name, "ultimate");
      let impacted = false;
      const land = (k, n) => {
        if (!impacted) {
          impacted = true;
          this.impact(unit, p, isMap);
          this.lean(unit, isMap ? { deg: -2.4, x: -0.35, y: 0.1 } : { deg: -3, x: -0.5, y: 0.06 }, 160); // lunge into the hit
        }
        else this.shake(isMap ? 10 : 6, 220);
        plans.forEach(pl => {
          if (pl.dodged && k === 0) window.StatusEffectUI?.popup?.(pl.t, "Dodged!", "#9fe8ff", "dodge");
          if (pl.dodged || pl.t.stats.hp <= 0) return;
          const amt = k >= n - 1 ? pl.total - pl.dealt : Math.floor(pl.total / n);
          if (amt <= 0) return;
          pl.dealt += amt;
          pl.t.stats.hp = Math.max(0, pl.t.stats.hp - amt);
          const A = window.BattleAnimations;
          if (n > 1) A?.showComboHit?.(pl.t, amt, pl.crit, core.dom, k, n);
          else A?.showDamage?.(pl.t, amt, pl.crit, core.dom, false, pl.breakdown);
          core.units ? core.units.updateUnitDisplay(pl.t, core) : core.updateUnitDisplay?.(pl.t);
        });
        core.updateTeamHP?.();
      };
      await this.playWithFx(unit, atk.sheet || (isMap ? "attack_map" : "attack_area"), p.zone, { onHit: land, fallbackMs: isMap ? 1300 : 1000 });

      if (!impacted) land(0, 1);
      this.drawZone(null);
      if (isMap) this.setWarn(null);
      this.lean(unit, {}, 900);
      this.updateDanger(unit);
      await this.wait(450);
    },

    /** Impact visuals for the first hit of an attack. */
    impact(unit, p, isMap) {
      const L = this.layers;
      if (!L) return;
      Sfx.boom(isMap ? 1 : 0.75);
      Sfx.slash(0.35);
      this.shake(isMap ? 18 : 11, isMap ? 700 : 420);
      this.flash(isMap ? "rgba(255,240,220,.9)" : "rgba(255,90,60,.45)", isMap ? 520 : 300);
      const box = this.zoneBox(p.zone);
      const grid = this.grid();
      const burst = document.createElement("div");
      burst.className = `boss-impact${isMap ? " is-map" : ""}`;
      if (isMap) Object.assign(burst.style, { left: "0", top: "0", right: "0", bottom: "0" });
      else Object.assign(burst.style, {
        left: `${grid.offsetLeft + box.x}px`, top: `${grid.offsetTop + box.y}px`, width: `${box.w}px`, height: `${box.h}px`,
      });
      burst.innerHTML = "<i></i><i></i><i></i>";
      L.fx.appendChild(burst);
      setTimeout(() => burst.remove(), 1100);
      if (!isMap) L.zones.querySelector(".bz-pending").classList.add("bz-strike");
    },

    /* ----- phases ----- */

    applyPhaseLook(unit) {
      const r = rt.get(unit);
      const ph = this.phaseDef(unit);
      const idx = unit.bossState.phase || 0;
      if (r?.el) {
        r.el.classList.toggle("is-enraged", idx > 0);
        if (ph.aura) r.el.style.setProperty("--boss-aura", ph.aura);
      }
      this.layers?.tint.classList.toggle("is-enraged", idx > 0);
      const label = this.layers?.hud.querySelector(".bh-phase");
      if (label) label.textContent = idx > 0 ? (ph.name || `Phase ${idx + 1}`) : "";
    },

    async enterPhase(unit, core, idx) {
      const st = unit.bossState;
      if (this._phaseRunning || st.dead) return;
      this._phaseRunning = true;
      const wasPaused = core.isPaused;
      core.isPaused = true;
      try {
        st.phase = idx;
        st.phasePending = null;
        st.step = 0;
        const ph = this.phaseDef(unit);
        unit.stats.speed = Math.round((unit.baseSpeed || unit.stats.speed) * (Number(ph.speedMult) || 1));
        this.applyPhaseLook(unit);
        this.updateDisplay(unit, core);
        this.updateDanger(unit);
        await this.roar(unit, 2600);
        await this.banner(`<span class="bb-kicker">Phase ${idx + 1}</span><span class="bb-title">${esc(ph.banner || ph.name || "")}</span>`, "is-phase", 1500);
      } finally {
        this._phaseRunning = false;
        if (!this.over(core)) core.isPaused = wasPaused;
      }
    },

    /** Slow-motion roar: camera push-in, long shake, dark pulse. */
    async roar(unit, dur = 2400) {
      Sfx.roar(dur / 1000, 1.4);
      this.zoom(unit, 1.08, this.ms(dur));
      this.layers?.tint.classList.add("is-roaring");
      const shakes = [0, 350, 700, 1050, 1400, 1750];
      shakes.forEach((t, i) => setTimeout(() => this.shake(16 - i * 2, 380), this.ms(t)));
      await this.play(unit, "roar", { speed: 0.55, fallbackMs: dur * 0.55 });
      this.layers?.tint.classList.remove("is-roaring");
    },

    /** Runs after every turn ends (BattleTurns.endTurn): play a pending phase change now. */
    afterTurn(core) {
      const unit = this.unit;
      if (!unit || unit.bossState.phasePending == null || unit.bossState.dead || this._phaseRunning) return;
      if (core.turns?.turnLocked) return;
      this.enterPhase(unit, core, unit.bossState.phasePending);
    },

    /* ----- entrance / defeat ----- */

    /** Heavy entrance: distant stomps, cut-in with the key art, then the boss rises with a roar. */
    async playEntrance(unit, core) {
      const r = rt.get(unit);
      const def = this.defOf(unit);
      if (!r) return;
      Sfx.startAmbient();
      r.el.classList.add("is-hidden");
      this.layers.hud.classList.add("is-hidden");
      this.layers.tint.classList.add("is-intro");
      for (let i = 0; i < 3; i++) {
        this.shake(3 + i * 3, 260);
        Sfx.stomp(0.35 + i * 0.2);
        await this.wait(520);
      }

      const cut = document.createElement("div");
      cut.className = "boss-cutin";
      cut.innerHTML = `
        <div class="bc-band">
          <div class="bc-art boss-${esc(def.placeholder || "beast")}">
            <div class="boss-placeholder">${def.placeholder === "giant" ? giantSvg() : beastSvg()}</div>
            <img alt="" src="${esc(def.sprite)}/portrait.webp" onload="this.parentNode.classList.add('has-art')" onerror="this.remove()">
          </div>
          <div class="bc-text">
            <div class="bc-warning">Warning · Giant Enemy Approaching</div>
            <div class="bc-name">${esc(def.name)}</div>
            <div class="bc-title">${esc(def.title || "")}</div>
          </div>
        </div>`;
      this.layers.scene.appendChild(cut);
      Sfx.rumble(2.2, 0.5);
      await Promise.all([this.wait(2300), Promise.race([this.ready, new Promise(res => setTimeout(res, 6000))])]);
      await this.probeArt(unit);
      cut.classList.add("out");
      setTimeout(() => cut.remove(), 400);

      // BattleEntrance.hideAllUnits() zeroes every unit inline; the boss makes its own reveal
      r.el.style.opacity = "";
      r.el.style.transform = "";
      r.el.classList.remove("is-hidden");
      r.el.classList.add("is-rising");
      this.layers.tint.classList.remove("is-intro");
      this.stomp(unit, 14);
      this.flash("rgba(0,0,0,.6)", 500);
      await this.roar(unit, 2200);
      r.el.classList.remove("is-rising");
      this.layers.hud.classList.remove("is-hidden");
      this.introDone = true;
      this.layout();
      this.updateDanger(unit);
    },

    async playKO(unit, core) {
      const r = rt.get(unit);
      clearTimeout(r?.poll);
      this.drawZone(null);
      this.setWarn(null);
      this.updateDanger(unit);
      Sfx.stopAmbient();
      if (!r) return;
      this.lean(unit, {}, 400);
      r.el.dataset.dead = "true";
      r.el.style.pointerEvents = "none";
      Sfx.roar(1.6, 1.8);
      this.shake(14, 900);
      this.flash("rgba(255,255,255,.7)", 600);
      this.zoom(unit, 1.06, 1600);
      this.layers?.hud.classList.add("is-down");
      this.layers?.tint.classList.add("is-defeated");
      await this.play(unit, "ko", { speed: 0.7, fallbackMs: 1500, hold: true });
      Sfx.boom(0.8);
      this.shake(10, 500);
      r.el.classList.add("is-gone");
    },
  };

  window.BattleBoss = BattleBoss;
  console.log("[BattleBoss] Module loaded");
})();
