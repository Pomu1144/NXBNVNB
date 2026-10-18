// js/battle/battle-scars.js — jutsu leave marks on the battlefield.
//
// In the original game a technique looks like it tears up the ground, then
// the field is spotless again. Here every jutsu, ultimate and secret
// technique that lands leaves a mark on the map at the feet of each unit it
// hit: scorch marks for fire, burns and branching scars for lightning,
// cracks and craters for earth and heavy blows, frost for ice, wet ground for
// water, gouges for wind and blades, roots for wood, spilled sand, and
// purple-black scorch for dark chakra. Fresh marks glow (embers, sparks,
// frost light) and cool down over a few seconds; the mark stays for the
// rest of the stage and the field is cleared when the next stage loads.
//
// Purely visual: nothing here changes combat. The kind of mark comes from
// keywords in the skill's name and description (natureOf). Marks are
// painted procedurally on small canvases in a layer under the units.
//
// Hooks (installed once BattleCombat / BattleMissions exist):
//   BattleCombat.performJutsu / performUltimate / performMultiJutsu /
//   performSpriteSkill / performSecret  -> mark the technique as active
//   BattleCombat.calculateDamage        -> a landed hit marks the target
//   BattleMissions.loadStage            -> clear the field
(function () {
  'use strict';

  const OFF_KEY = 'battle_scars_off';
  const MAX_SCARS = 28;
  const GLOW_MS = 2600;           // fresh glow cools over this long
  const SIZE = { jutsu: 0.10, ultimate: 0.15, secret: 0.19, centre: 0.2 }; // share of scene width
  const ACTIVE_MS = 12000;        // safety: a technique that never reports done stops marking

  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const enabled = () => { try { return localStorage.getItem(OFF_KEY) !== '1'; } catch (e) { return true; } };
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ------------------------------------------------------------------
   * Nature of a technique, from its name and description.
   * ------------------------------------------------------------------ */
  const NATURES = [
    ['blackfire', /amaterasu|black flame|blaze release|enton/],
    ['lightning', /lightning|chidori|raikiri|kirin|thunder|raiton|electric|storm release|lariat/],
    ['ice', /\bice\b|crystal|snow|frost|hyoton|freez/],
    ['sand', /\bsand\b|gold dust|iron sand/],
    ['wood', /wood|mokuton|tree|root|forest|flower|deep forest/],
    ['water', /water|suiton|wave|shark|rain|torrent|mist|bubble|boil/],
    ['explosion', /explo|bomb|clay|detonat|tailed beast ball|tailed beast bomb|c[0-4]\b/],
    ['fire', /fire|flame|katon|blaze|burn|ember|phoenix|inferno|magma|lava|ash|heat|sun\b/],
    ['wind', /wind|futon|gale|vacuum|cyclone|tornado|rasen ?shuriken|air|whirl/],
    ['dark', /susano|rinnegan|truth[- ]seeking|chakra rod|planetary|shinra|almighty|bijuu|six paths|kamui|genjutsu|tsukuyomi/],
    ['blade', /sword|blade|slash|cut|kenjutsu|kunai|katana|scythe|claw|fang|kusanagi/],
    ['earth', /earth|doton|stone|rock|boulder|quake|mud|mountain|golem|crush|meteor/],
    ['impact', /rasengan|fist|punch|kick|strength|gate|lotus|smash|slam|hammer|drop|leaf hurricane|taijutsu/],
  ];
  function natureOf(text, kind) {
    const t = String(text || '').toLowerCase();
    for (const [n, re] of NATURES) if (re.test(t)) return n;
    return kind === 'jutsu' ? 'cracks' : 'impact';
  }
  function skillText(unit, kind) {
    const C = window.BattleCombat;
    let s = null;
    try { s = C && C.getUnitSkills ? C.getUnitSkills(unit)[kind] : null; } catch (e) { s = null; }
    const own = unit && unit.skills && unit.skills[kind];
    return [s && s.meta && s.meta.name, s && s.data && s.data.description,
      own && own.name, own && own.description].filter(Boolean).join(' · ');
  }

  /* ------------------------------------------------------------------
   * Painters. Each draws on a square canvas of size S, centred, and gets a
   * second canvas for the fresh glow. The layer squashes them flat so they
   * lie on the ground.
   * ------------------------------------------------------------------ */
  function blotch(g, S, r, stops, n = 9, jitter = 0.28) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const d = r * rand(0, 0.45);
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      const rr = r * rand(1 - jitter, 1 + jitter) * 0.62;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  }
  function branch(g, x, y, ang, len, w, depth, style) {
    if (depth <= 0 || len < 2) return;
    const segs = 4;
    g.lineCap = 'round'; g.lineJoin = 'round';
    let cx = x, cy = y, a = ang;
    g.beginPath(); g.moveTo(cx, cy);
    for (let i = 0; i < segs; i++) {
      a += rand(-0.45, 0.45);
      cx += Math.cos(a) * len / segs; cy += Math.sin(a) * len / segs;
      g.lineTo(cx, cy);
      if (Math.random() < 0.35) branch(g, cx, cy, a + rand(-1, 1), len * 0.5, w * 0.6, depth - 1, style);
    }
    g.strokeStyle = style; g.lineWidth = w; g.stroke();
  }
  function cracks(g, S, r, n, style, w) {
    for (let i = 0; i < n; i++) branch(g, S / 2 + rand(-r, r) * 0.15, S / 2 + rand(-r, r) * 0.15, (i / n) * Math.PI * 2 + rand(-0.3, 0.3), r * rand(0.6, 1), w, 3, style);
  }
  function crater(g, S, r, tint = '40,28,20') {
    blotch(g, S, r * 0.95, [[0, `rgba(${tint},.85)`], [0.6, `rgba(${tint},.5)`], [1, `rgba(${tint},0)`]], 7, 0.15);
    // lit rim on the far side
    g.save(); g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(230,210,180,.28)'; g.lineWidth = r * 0.07;
    g.beginPath(); g.arc(S / 2, S / 2 + r * 0.05, r * 0.66, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.restore();
  }
  function hotspots(g, S, r, n, rgb, size = 0.18) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = r * rand(0, 0.8);
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, rr = r * rand(size * 0.4, size);
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  }

  const PAINT = {
    fire(m, gl, S, r) {
      blotch(m, S, r, [[0, 'rgba(20,10,6,.92)'], [0.55, 'rgba(45,22,10,.6)'], [1, 'rgba(60,30,12,0)']], 11);
      cracks(m, S, r * 0.8, 5, 'rgba(15,8,4,.55)', r * 0.03);
      hotspots(gl, S, r * 0.8, 14, '255,140,40', 0.22);
      hotspots(gl, S, r * 0.5, 6, '255,220,120', 0.12);
    },
    blackfire(m, gl, S, r) {
      blotch(m, S, r, [[0, 'rgba(6,2,10,.95)'], [0.6, 'rgba(20,6,26,.6)'], [1, 'rgba(20,6,26,0)']], 12);
      hotspots(gl, S, r * 0.8, 12, '120,40,170', 0.22);
      hotspots(gl, S, r * 0.5, 5, '210,120,255', 0.1);
    },
    lightning(m, gl, S, r) {
      blotch(m, S, r * 0.7, [[0, 'rgba(14,12,22,.95)'], [0.5, 'rgba(24,20,34,.6)'], [1, 'rgba(24,20,34,0)']], 7);
      cracks(m, S, r, 8, 'rgba(12,10,20,.85)', r * 0.04);
      cracks(m, S, r * 0.8, 5, 'rgba(150,170,210,.35)', r * 0.012);
      gl.shadowColor = 'rgba(120,200,255,1)'; gl.shadowBlur = r * 0.12;
      cracks(gl, S, r * 0.95, 7, 'rgba(200,240,255,1)', r * 0.022);
      hotspots(gl, S, r * 0.3, 4, '160,220,255', 0.3);
    },
    ice(m, gl, S, r) {
      blotch(m, S, r * 0.85, [[0, 'rgba(214,232,248,.8)'], [0.65, 'rgba(180,212,238,.45)'], [1, 'rgba(180,212,238,0)']], 10, 0.35);
      // shards: short wedges pointing out, with a lit edge
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2), d = r * rand(0.1, 0.55), len = r * rand(0.18, 0.4), w = len * rand(0.18, 0.3);
        const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
        m.save(); m.translate(x, y); m.rotate(a);
        m.fillStyle = 'rgba(235,246,255,.9)';
        m.beginPath(); m.moveTo(0, -w / 2); m.lineTo(len, 0); m.lineTo(0, w / 2); m.closePath(); m.fill();
        m.fillStyle = 'rgba(120,170,215,.55)';
        m.beginPath(); m.moveTo(0, 0); m.lineTo(len, 0); m.lineTo(0, w / 2); m.closePath(); m.fill();
        m.restore();
      }
      hotspots(gl, S, r * 0.6, 6, '170,230,255', 0.16);
    },
    water(m, gl, S, r) {
      blotch(m, S, r * 0.9, [[0, 'rgba(20,35,50,.6)'], [0.75, 'rgba(25,45,65,.35)'], [1, 'rgba(25,45,65,0)']], 9, 0.35);
      for (let i = 0; i < 5; i++) {
        const x = S / 2 + rand(-r, r) * 0.5, y = S / 2 + rand(-r, r) * 0.4;
        m.strokeStyle = 'rgba(200,230,255,.35)'; m.lineWidth = r * 0.025;
        m.beginPath(); m.ellipse(x, y, r * rand(0.08, 0.2), r * rand(0.05, 0.1), 0, Math.PI * 1.1, Math.PI * 1.8); m.stroke();
      }
      hotspots(gl, S, r * 0.6, 4, '140,200,255', 0.2);
    },
    wind(m, gl, S, r) {
      const a0 = rand(-0.4, 0.4);
      blotch(m, S, r * 0.6, [[0, 'rgba(40,32,24,.35)'], [1, 'rgba(40,32,24,0)']], 5);
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * r * 0.2, rr = r * rand(0.75, 1);
        m.lineCap = 'round';
        m.strokeStyle = 'rgba(24,18,12,.9)'; m.lineWidth = r * 0.09;
        m.beginPath(); m.ellipse(S / 2, S / 2 + off, rr, rr * 0.38, a0, Math.PI * 1.05, Math.PI * 1.9); m.stroke();
        m.strokeStyle = 'rgba(225,215,195,.35)'; m.lineWidth = r * 0.025;
        m.beginPath(); m.ellipse(S / 2, S / 2 + off - r * 0.045, rr, rr * 0.38, a0, Math.PI * 1.05, Math.PI * 1.9); m.stroke();
      }
      hotspots(gl, S, r * 0.6, 5, '210,245,230', 0.18);
    },
    blade(m, gl, S, r) {
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const a = rand(-0.6, 0.6) + (i % 2 ? Math.PI / 2.4 : 0), len = r * rand(1.4, 1.9);
        const x = S / 2 + rand(-r, r) * 0.2, y = S / 2 + rand(-r, r) * 0.2;
        const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
        m.lineCap = 'round';
        m.strokeStyle = 'rgba(25,18,14,.8)'; m.lineWidth = r * 0.07;
        m.beginPath(); m.moveTo(x - dx, y - dy); m.lineTo(x + dx, y + dy); m.stroke();
        m.strokeStyle = 'rgba(235,225,205,.3)'; m.lineWidth = r * 0.02;
        m.beginPath(); m.moveTo(x - dx, y - dy - r * 0.04); m.lineTo(x + dx, y + dy - r * 0.04); m.stroke();
        gl.strokeStyle = 'rgba(255,255,255,.9)'; gl.lineWidth = r * 0.025; gl.lineCap = 'round';
        gl.beginPath(); gl.moveTo(x - dx, y - dy); gl.lineTo(x + dx, y + dy); gl.stroke();
      }
    },
    wood(m, gl, S, r) {
      blotch(m, S, r * 0.5, [[0, 'rgba(40,26,14,.6)'], [1, 'rgba(40,26,14,0)']], 5);
      for (let i = 0; i < 7; i++) branch(m, S / 2, S / 2, (i / 7) * Math.PI * 2 + rand(-0.3, 0.3), r * rand(0.6, 1), r * 0.07, 3, 'rgba(92,62,32,.95)');
      for (let i = 0; i < 7; i++) branch(m, S / 2, S / 2, (i / 7) * Math.PI * 2 + rand(-0.3, 0.3), r * rand(0.4, 0.7), r * 0.025, 2, 'rgba(160,120,70,.6)');
      hotspots(gl, S, r * 0.7, 6, '140,230,110', 0.16);
    },
    sand(m, gl, S, r) {
      blotch(m, S, r * 0.9, [[0, 'rgba(196,160,98,.8)'], [0.7, 'rgba(180,145,85,.45)'], [1, 'rgba(180,145,85,0)']], 10, 0.4);
      for (let i = 0; i < 120; i++) {
        const a = rand(0, Math.PI * 2), d = r * Math.sqrt(Math.random()) * 0.95;
        m.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,50,.5)' : 'rgba(235,210,150,.55)';
        m.fillRect(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r * 0.02, r * 0.02);
      }
    },
    explosion(m, gl, S, r) {
      crater(m, S, r, '30,22,18');
      blotch(m, S, r * 1.1, [[0, 'rgba(15,12,10,.0)'], [0.6, 'rgba(15,12,10,.35)'], [1, 'rgba(15,12,10,0)']], 9);
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2), d = r * rand(0.7, 1.1);
        m.fillStyle = 'rgba(35,26,20,.75)';
        m.beginPath(); m.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r * rand(0.015, 0.04), 0, Math.PI * 2); m.fill();
      }
      hotspots(gl, S, r * 0.7, 10, '255,170,70', 0.22);
    },
    earth(m, gl, S, r) {
      crater(m, S, r * 0.8);
      cracks(m, S, r, 8, 'rgba(25,18,12,.75)', r * 0.035);
      for (let i = 0; i < 10; i++) {
        const a = rand(0, Math.PI * 2), d = r * rand(0.6, 1);
        m.fillStyle = 'rgba(110,90,70,.8)';
        m.fillRect(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r * rand(0.03, 0.07), r * rand(0.02, 0.05));
      }
    },
    impact(m, gl, S, r) {
      crater(m, S, r * 0.75);
      cracks(m, S, r * 0.9, 6, 'rgba(25,18,12,.7)', r * 0.03);
      hotspots(gl, S, r * 0.4, 4, '255,240,210', 0.25);
    },
    cracks(m, gl, S, r) {
      cracks(m, S, r * 0.8, 5, 'rgba(25,18,12,.7)', r * 0.03);
      blotch(m, S, r * 0.35, [[0, 'rgba(30,22,16,.5)'], [1, 'rgba(30,22,16,0)']], 4);
    },
    dark(m, gl, S, r) {
      crater(m, S, r * 0.8, '28,10,36');
      cracks(m, S, r, 6, 'rgba(30,8,40,.75)', r * 0.03);
      gl.shadowColor = 'rgba(170,90,255,1)'; gl.shadowBlur = r * 0.1;
      cracks(gl, S, r * 0.85, 5, 'rgba(210,150,255,.85)', r * 0.015);
      hotspots(gl, S, r * 0.6, 6, '150,70,230', 0.22);
    },
  };
  // Light marks sit on the ground normally; dark ones multiply into it.
  const LIGHT = new Set(['ice', 'sand', 'water']);

  /* ------------------------------------------------------------------
   * The layer.
   * ------------------------------------------------------------------ */
  let layer = null;
  let scars = [];

  function scene() { return window.BattleManager?.dom?.scene || document.getElementById('battle-scene'); }
  function ensureLayer() {
    const sc = scene();
    if (!sc) return null;
    if (layer && layer.isConnected && layer.parentNode === sc) return layer;
    layer = document.createElement('div');
    layer.className = 'battle-scars';
    layer.setAttribute('aria-hidden', 'true');
    sc.insertBefore(layer, sc.firstChild);
    return layer;
  }

  /** Where a unit stands (its feet), in % of the scene. */
  function feetOf(unit) {
    const sc = scene();
    if (!sc || !unit) return null;
    const el = sc.querySelector(`.battle-unit[data-unit-id="${CSS.escape(String(unit.id))}"]`);
    const sr = sc.getBoundingClientRect();
    if (!sr.width || !sr.height) return null;
    if (el) {
      const body = el.querySelector('.unit-sprite') || el;
      const r = body.getBoundingClientRect();
      if (r.width && r.height) {
        return { x: ((r.left + r.width / 2) - sr.left) / sr.width * 100, y: ((r.bottom - r.height * 0.06) - sr.top) / sr.height * 100 };
      }
    }
    if (unit.pos) return { x: unit.pos.x, y: unit.pos.y + 6 };
    return null;
  }

  /**
   * Leave a mark of `nature` at (x%, y%) of the scene. size: share of scene width.
   * Returns the element, or null when marks are off / there's no scene.
   */
  function stamp(nature, x, y, size = SIZE.jutsu) {
    if (!enabled()) return null;
    const L = ensureLayer();
    if (!L || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const paint = PAINT[nature] || PAINT.impact;
    const sw = L.clientWidth || scene().clientWidth || 800;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.max(48, Math.round(sw * size * dpr));
    const r = S * 0.46;

    const el = document.createElement('div');
    el.className = `battle-scar is-${nature}`;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.width = `${size * 100}%`;
    el.style.setProperty('--tilt', `${rand(-8, 8).toFixed(1)}deg`);
    const mark = document.createElement('canvas');
    mark.width = mark.height = S;
    mark.className = `battle-scar-mark${LIGHT.has(nature) ? ' is-light' : ''}`;
    const glow = document.createElement('canvas');
    glow.width = glow.height = S;
    glow.className = 'battle-scar-glow';
    try { paint(mark.getContext('2d'), glow.getContext('2d'), S, r); } catch (e) { return null; }
    el.append(mark, glow);
    L.appendChild(el);

    const s = { el, nature, at: Date.now() };
    scars.push(s);
    // fresh: the mark grows in and glows, then cools
    requestAnimationFrame(() => {
      el.classList.add('is-in');
      if (!reduced()) setTimeout(() => el.classList.add('is-cool'), 60);
      else el.classList.add('is-cool');
    });
    while (scars.length > MAX_SCARS) fade(scars.shift());
    return el;
  }

  function fade(s) {
    if (!s || !s.el) return;
    s.el.classList.add('is-out');
    setTimeout(() => s.el.remove(), 900);
  }
  function clear() {
    const old = scars;
    scars = [];
    old.forEach(fade);
  }

  /* ------------------------------------------------------------------
   * Hooks.
   * ------------------------------------------------------------------ */
  const active = new Map(); // attacker id -> { kind, nature, hit: Set, at, pts: [] }

  function begin(attacker, kind) {
    if (!attacker) return null;
    const entry = { kind, nature: natureOf(skillText(attacker, kind), kind), hit: new Set(), at: Date.now(), pts: [] };
    active.set(attacker.id, entry);
    return entry;
  }
  function end(attacker) {
    const e = attacker && active.get(attacker.id);
    if (!e) return;
    active.delete(attacker.id);
    // A wide ultimate / secret that hit several units also scars the middle of the blast
    if (e.kind !== 'jutsu' && e.pts.length >= 3) {
      const cx = e.pts.reduce((n, p) => n + p.x, 0) / e.pts.length;
      const cy = e.pts.reduce((n, p) => n + p.y, 0) / e.pts.length;
      stamp(e.nature, cx, cy, SIZE.centre);
    }
  }
  function onHit(attacker, defender, result) {
    const e = attacker && active.get(attacker.id);
    if (!e || !defender || !result || result.dodged || !(result.damage > 0)) return;
    if (Date.now() - e.at > ACTIVE_MS) { active.delete(attacker.id); return; }
    if (e.hit.has(defender.id)) return;
    e.hit.add(defender.id);
    const p = feetOf(defender);
    if (!p) return;
    e.pts.push(p);
    stamp(e.nature, p.x + rand(-1.5, 1.5), p.y + rand(-1, 1), SIZE[e.kind] || SIZE.jutsu);
  }

  function wrapDone(fn, attacker) {
    let done = false;
    const finish = () => { if (!done) { done = true; end(attacker); } };
    setTimeout(finish, ACTIVE_MS);
    return function (...args) { finish(); return typeof fn === 'function' ? fn.apply(this, args) : undefined; };
  }

  function install() {
    const C = window.BattleCombat;
    const M = window.BattleMissions;
    if (!C || C.__scars) return !!(C && C.__scars);
    C.__scars = true;

    const origDamage = C.calculateDamage;
    C.calculateDamage = function (attacker, defender, ...rest) {
      const r = origDamage.call(this, attacker, defender, ...rest);
      try { onHit(attacker, defender, r); } catch (e) { /* visual only */ }
      return r;
    };

    // (attacker, target(s), core, onDone)
    [['performJutsu', 'jutsu'], ['performUltimate', 'ultimate'], ['performMultiJutsu', 'jutsu']].forEach(([name, kind]) => {
      const orig = C[name];
      if (typeof orig !== 'function') return;
      C[name] = function (attacker, targets, core, onDone, ...rest) {
        begin(attacker, kind);
        return orig.call(this, attacker, targets, core, wrapDone(onDone, attacker), ...rest);
      };
    });
    // (attacker, kind, skill, targets, core, onDone)
    if (typeof C.performSpriteSkill === 'function') {
      const orig = C.performSpriteSkill;
      C.performSpriteSkill = function (attacker, kind, skill, targets, core, onDone, ...rest) {
        if (kind === 'jutsu' || kind === 'ultimate' || kind === 'secret') begin(attacker, kind);
        return orig.call(this, attacker, kind, skill, targets, core, wrapDone(onDone, attacker), ...rest);
      };
    }
    // (caster, core, onDone)
    if (typeof C.performSecret === 'function') {
      const orig = C.performSecret;
      C.performSecret = function (caster, core, onDone, ...rest) {
        begin(caster, 'secret');
        return orig.call(this, caster, core, wrapDone(onDone, caster), ...rest);
      };
    }
    if (M && typeof M.loadStage === 'function' && !M.__scars) {
      M.__scars = true;
      const orig = M.loadStage;
      M.loadStage = function (...args) { clear(); return orig.apply(this, args); };
    }
    return true;
  }

  // Battle modules load deferred; hook in once they're all there.
  function tryInstall(n = 0) {
    if (install()) return;
    if (n < 100) setTimeout(() => tryInstall(n + 1), 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tryInstall());
  else tryInstall();

  window.BattleScars = {
    natureOf, stamp, clear, install,
    count: () => scars.length,
    setEnabled(on) { try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch (e) {} if (!on) clear(); },
    isEnabled: enabled,
    NATURES: NATURES.map(n => n[0]).concat(['cracks', 'impact']),
  };
})();
