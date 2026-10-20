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
// painted decal textures (assets/ui/battle-scars) in a layer under the units.
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
   * Painted decal textures (assets/ui/battle-scars/<name>.webp), one per
   * nature. Plain hits and unnamed jutsu reuse the earth cracks. For hot natures a
   * second copy of the texture, brightened and screen-blended, is the fresh glow.
   * The layer squashes them flat so they lie on the ground.
   * ------------------------------------------------------------------ */
  const TEX_DIR = 'assets/ui/battle-scars/';
  const TEXTURE = {
    fire: 'fire', blackfire: 'blackfire', lightning: 'lightning', ice: 'ice',
    water: 'water', wind: 'wind', blade: 'blade', wood: 'wood', sand: 'sand',
    explosion: 'explosion', earth: 'earth', dark: 'dark', impact: 'earth', cracks: 'earth',
  };
  const texOf = (nature) => `${TEX_DIR}${TEXTURE[nature] || 'earth'}.webp`;
  let preloaded = false;
  function preload() {
    if (preloaded) return;
    preloaded = true;
    new Set(Object.values(TEXTURE)).forEach((n) => { const i = new Image(); i.decoding = 'async'; i.src = `${TEX_DIR}${n}.webp`; });
  }
  // Light marks sit on the ground normally; dark ones multiply into it.
  const LIGHT = new Set(['ice', 'sand', 'water']);
  // Only hot / charged marks glow when fresh; dirt marks just grow in.
  const HOT = new Set(['fire', 'blackfire', 'lightning', 'ice', 'explosion', 'dark']);

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
    const el = document.createElement('div');
    el.className = `battle-scar is-${nature}`;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.width = `${(size * rand(0.92, 1.08) * 100).toFixed(2)}%`;
    el.style.setProperty('--tilt', `${rand(-8, 8).toFixed(1)}deg`);
    el.style.setProperty('--spin', `${Math.round(rand(0, 360))}deg`);
    const src = texOf(nature);
    const mark = new Image();
    mark.className = `battle-scar-mark${LIGHT.has(nature) ? ' is-light' : ''}`;
    mark.alt = '';
    mark.draggable = false;
    mark.src = src;
    el.appendChild(mark);
    if (HOT.has(nature)) {
      const glow = new Image();
      glow.className = 'battle-scar-glow';
      glow.alt = '';
      glow.draggable = false;
      glow.src = src;
      el.appendChild(glow);
    }
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
    preload();

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
