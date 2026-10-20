// js/gear.js — Gear: pieces that drop from missions, Honkai Star Rail style.
//
// Every shinobi has six slots. Missions drop gear pieces into a bag; each
// slot holds one piece. A piece has:
//   slot     helmet · weapon · armor · scroll · necklace · sandals
//   rarity   0 Green · 1 Blue · 2 Purple · 3 Orange · 4 Red · 5 Red Shiny
//   level    +0 … +cap (cap by rarity: 3 / 6 / 9 / 12 / 15 / 15), bought with Ryo
//   main     one stat, fixed for helmet (HP) and weapon (ATK), rolled from a
//            list for the other four; it grows with every level
//   subs     1–4 random substats (more at higher rarity); every 3 levels a
//            new substat is added, or a random one is rolled up once there
//            are four
// Percent stats (HP% / ATK% / DEF%) count against the unit's own base stats.
// Crit Rate / Crit DMG feed stats.critRate / critDmg in battle; Jutsu DMG /
// Jutsu RES ride on stats.magatama with the socketed magatama
// (js/magatama.js, keyed by uid + slot, capped together).
//
// Save (localStorage "blazing_gear_v2"):
//   { seq, starter, bag: { [id]: { id, slot, rarity, level, main, subs: [[stat, value], …] } },
//     equip: { [uid]: { [slot]: id } } }
// The old level-per-slot save ("blazing_gear_v1") is turned into pieces once.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'blazing_gear_v2';
  const OLD_KEY = 'blazing_gear_v1';
  const SLOTS = ['helmet', 'weapon', 'armor', 'scroll', 'necklace', 'sandals'];
  const TOOL_SLOTS = ['equipment1', 'equipment2', 'equipment3', 'equipment4', 'equipment5'];
  const MAX_LEVEL = 15;
  const BAG_MAX = 300;

  const TIERS = [
    { id: 'green',  label: 'Green',     rank: 'Genin',      cap: 3,  main: 0.30, sub: 0.40, subs: 1, art: 'green',  color: '#5dae55' },
    { id: 'blue',   label: 'Blue',      rank: 'Chunin',     cap: 6,  main: 0.45, sub: 0.55, subs: 1, art: 'blue',   color: '#4b8fe0' },
    { id: 'purple', label: 'Purple',    rank: 'Jonin',      cap: 9,  main: 0.60, sub: 0.70, subs: 2, art: 'purple', color: '#a266e0' },
    { id: 'orange', label: 'Orange',    rank: 'Kage',       cap: 12, main: 0.75, sub: 0.85, subs: 2, art: 'orange', color: '#e8902e' },
    { id: 'red',    label: 'Red',       rank: 'Super Kage', cap: 15, main: 0.90, sub: 1.00, subs: 3, art: 'red',    color: '#e0453c' },
    { id: 'shiny',  label: 'Red Shiny', rank: 'Super Kage', cap: 15, main: 1.00, sub: 1.10, subs: 3, art: 'red',    color: '#f3c552', shiny: true }
  ];

  // Every stat a piece can carry. `main` is the value at +15 on a Red Shiny
  // piece; `sub` is one substat roll on a Red piece.
  const STAT = {
    hp:       { label: 'HP',        main: 10000, sub: 280 },
    atk:      { label: 'ATK',       main: 600,   sub: 18 },
    def:      { label: 'DEF',       main: 360,   sub: 14 },
    hpPct:    { label: 'HP',        main: 25,    sub: 3,   unit: '%' },
    atkPct:   { label: 'ATK',       main: 25,    sub: 3,   unit: '%' },
    defPct:   { label: 'DEF',       main: 30,    sub: 3.6, unit: '%' },
    spd:      { label: 'SPD',       main: 14,    sub: 1.5, dp: 1 },
    critRate: { label: 'Crit Rate', main: 18,    sub: 2.4, unit: '%' },
    critDmg:  { label: 'Crit DMG',  main: 36,    sub: 4.8, unit: '%' },
    nin:      { label: 'Jutsu DMG', main: 18,    sub: 2,   unit: '%' },
    res:      { label: 'Jutsu RES', main: 15,    sub: 1.8, unit: '%' }
  };
  const SUB_POOL = Object.keys(STAT);

  const PIECES = {
    helmet:   { kind: 'Helmet',   mains: ['hp'],                                           magatama: 'life' },
    weapon:   { kind: 'Weapon',   mains: ['atk'],                                          magatama: 'attack' },
    armor:    { kind: 'Armor',    mains: ['defPct', 'hpPct', 'atkPct', 'critRate', 'critDmg'], magatama: 'defense' },
    scroll:   { kind: 'Scroll',   mains: ['nin', 'atkPct', 'hpPct', 'defPct'],             magatama: 'ninjutsu' },
    necklace: { kind: 'Necklace', mains: ['res', 'hpPct', 'atkPct', 'defPct'],             magatama: 'resistance' },
    sandals:  { kind: 'Sandals',  mains: ['spd', 'atkPct', 'hpPct', 'defPct'] }
  };
  // Item names per art set, in SLOTS order
  const NAMES = {
    green:  ['Goggles', 'Shuriken', 'Chainmail', 'Handbook', 'Jade Ring', 'Sandals'],
    blue:   ['Forehead Protector', 'Kunai', 'Chainmail Vest', 'Jutsu Handbook', 'Sapphire Ring', 'Sandals'],
    purple: ['ANBU Mask', 'Tanto', 'Flak Vest', 'Summoning Scroll', 'Amethyst Pendant', 'Tabi'],
    orange: ['Hat', 'Katana', 'Cloak', 'Forbidden Scroll', 'Magatama Necklace', 'Greaves'],
    red:    ['Oni Mask', 'War Scythe', 'War Armor', 'Sealing Scroll', 'Prayer Beads', 'War Boots']
  };
  // Mission drops: chance per stage chest and rarity weights by rank
  const DROPS = {
    D:  { chance: 0.20, w: [60, 30, 10, 0, 0, 0] },
    C:  { chance: 0.30, w: [40, 40, 17, 3, 0, 0] },
    B:  { chance: 0.35, w: [20, 40, 30, 9, 1, 0] },
    A:  { chance: 0.40, w: [5, 25, 40, 25, 5, 0] },
    S:  { chance: 0.50, w: [0, 10, 35, 38, 15, 2] },
    SS: { chance: 0.60, w: [0, 0, 20, 45, 28, 7] }
  };
  const SALVAGE = [300, 800, 2000, 5000, 12000, 25000];
  const STATS = ['hp', 'atk', 'def', 'spd', 'nin', 'res'];
  const zero = () => ({ hp: 0, atk: 0, def: 0, spd: 0, nin: 0, res: 0, critRate: 0, critDmg: 0, hpPct: 0, atkPct: 0, defPct: 0 });

  /* ───────── Numbers ───────── */
  const clampTier = (t) => Math.max(0, Math.min(TIERS.length - 1, Math.floor(Number(t) || 0)));
  const capOf = (rarity) => TIERS[clampTier(rarity)].cap;
  const round = (stat, v) => {
    const s = STAT[stat];
    if (s && s.unit) return Math.round(v * 100) / 100;
    if (s && s.dp) return Math.round(v * 10) / 10;
    return Math.round(v);
  };
  // Ryo to go from +level to +level+1
  function levelCost(level, rarity = 0) {
    const l = Math.max(0, Math.floor(Number(level) || 0));
    return Math.round(((l + 1) * 1500 * (1 + clampTier(rarity) * 0.6)) / 10) * 10;
  }
  function mainValue(stat, rarity, level) {
    const s = STAT[stat];
    if (!s) return 0;
    const lv = Math.max(0, Math.min(MAX_LEVEL, Number(level) || 0));
    return round(stat, s.main * TIERS[clampTier(rarity)].main * (0.16 + 0.84 * lv / MAX_LEVEL));
  }
  function fmtValue(stat, v) {
    const s = STAT[stat];
    if (s && s.unit) return `${Math.round((Number(v) || 0) * 100) / 100}%`;
    if (s && s.dp) return String(Math.round((Number(v) || 0) * 10) / 10);
    return Math.round(Number(v) || 0).toLocaleString();
  }
  function nameOf(slot, rarity) {
    const t = TIERS[clampTier(rarity)];
    return `${t.rank} ${NAMES[t.art][SLOTS.indexOf(slot)] || ''}`.trim();
  }
  const iconOf = (slot, rarity) => `assets/gear/${TIERS[clampTier(rarity)].art}_${slot}.webp`;
  // Painted piece without a tile frame (Equipment tab, bag, drops)
  const artOf = (slot, rarity) => `assets/gear/art/${TIERS[clampTier(rarity)].art}_${slot}.webp`;
  const scrollIcon = (id) => `assets/gear/scroll_${String(id).replace(/\D/g, '')}.webp`;

  /* ───────── Rolling ───────── */
  const rand = () => Math.random();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  function pickWeighted(w) {
    const total = w.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return w.length - 1;
  }
  const subRoll = (stat, rarity) => round(stat, STAT[stat].sub * TIERS[clampTier(rarity)].sub * pick([0.8, 0.9, 1]));
  function addSub(item) {
    const taken = new Set([item.main, ...item.subs.map(s => s[0])]);
    const open = SUB_POOL.filter(k => !taken.has(k));
    if (open.length) item.subs.push([pick(open), 0]);
    const k = item.subs[item.subs.length - 1][0];
    item.subs[item.subs.length - 1][1] = subRoll(k, item.rarity);
  }
  // A fresh +0 piece. slot / rarity / main can be fixed; the rest is random.
  function roll(opts = {}) {
    const slot = SLOTS.includes(opts.slot) ? opts.slot : pick(SLOTS);
    const rarity = opts.rarity == null ? 0 : clampTier(opts.rarity);
    const mains = PIECES[slot].mains;
    const main = mains.includes(opts.main) ? opts.main : pick(mains);
    const item = { id: null, slot, rarity, level: 0, main, subs: [] };
    let n = TIERS[rarity].subs + (rand() < 0.2 ? 1 : 0);
    n = Math.min(4, n);
    while (item.subs.length < n) addSub(item);
    return item;
  }
  // Every 3 levels: a new substat, or one of the four rolled up
  function growSubs(item, fromLevel, toLevel) {
    for (let l = fromLevel + 1; l <= toLevel; l++) {
      if (l % 3) continue;
      if (item.subs.length < 4) addSub(item);
      else {
        const s = pick(item.subs);
        s[1] = round(s[0], s[1] + subRoll(s[0], item.rarity));
      }
    }
  }

  /* ───────── State ───────── */
  let state = null;
  function clean(raw) {
    const bag = {};
    Object.values((raw && raw.bag) || {}).forEach(it => {
      if (!it || !it.id || !PIECES[it.slot]) return;
      const rarity = clampTier(it.rarity);
      const main = PIECES[it.slot].mains.includes(it.main) ? it.main : PIECES[it.slot].mains[0];
      const subs = (Array.isArray(it.subs) ? it.subs : [])
        .filter(s => Array.isArray(s) && STAT[s[0]] && s[0] !== main).slice(0, 4)
        .map(s => [s[0], Number(s[1]) || 0]);
      bag[it.id] = { id: String(it.id), slot: it.slot, rarity, level: Math.max(0, Math.min(capOf(rarity), Math.floor(Number(it.level) || 0))), main, subs };
    });
    const equip = {};
    Object.entries((raw && raw.equip) || {}).forEach(([uid, row]) => {
      const out = {};
      SLOTS.forEach(slot => { const id = row && row[slot]; if (id && bag[id] && bag[id].slot === slot) out[slot] = id; });
      if (Object.keys(out).length) equip[uid] = out;
    });
    // a piece sits on one shinobi at most
    const seen = new Set();
    Object.values(equip).forEach(row => SLOTS.forEach(slot => {
      if (!row[slot]) return;
      if (seen.has(row[slot])) delete row[slot]; else seen.add(row[slot]);
    }));
    return { seq: Math.max(0, Number(raw && raw.seq) || 0), starter: !!(raw && raw.starter), bag, equip };
  }
  function newId(s) { s.seq += 1; return `g${Date.now().toString(36)}${s.seq.toString(36)}`; }
  // Old saves: each upgraded slot becomes a piece of that rarity, level
  // scaled to the new cap, main stat the slot's old stat, equipped as before.
  function fromOld(s) {
    let old = null;
    try { old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null'); } catch (e) { old = null; }
    const OLD_CAP = [20, 40, 60, 80, 100, 120];
    const OLD_MAIN = { helmet: 'hp', weapon: 'atk', armor: 'defPct', scroll: 'nin', necklace: 'res', sandals: 'spd' };
    let n = 0;
    Object.entries((old && old.units) || {}).forEach(([uid, row]) => {
      SLOTS.forEach(slot => {
        const p = row && row[slot];
        if (!p) return;
        const rarity = clampTier(p.tier);
        const it = roll({ slot, rarity, main: OLD_MAIN[slot] });
        it.id = newId(s);
        const lv = Math.round(Math.max(1, Number(p.level) || 1) / OLD_CAP[rarity] * capOf(rarity));
        growSubs(it, 0, Math.min(capOf(rarity), lv));
        it.level = Math.min(capOf(rarity), lv);
        s.bag[it.id] = it;
        (s.equip[uid] = s.equip[uid] || {})[slot] = it.id;
        n++;
      });
    });
    return n;
  }
  function read() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { raw = null; }
    const s = clean(raw);
    if (!raw) {
      fromOld(s);
      // A Green piece for every slot so a new player has something to wear
      if (!s.starter) {
        SLOTS.forEach(slot => { const it = roll({ slot, rarity: 0 }); it.id = newId(s); s.bag[it.id] = it; });
        s.starter = true;
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    }
    return s;
  }
  function get() { if (!state) state = read(); return state; }
  function reload() { state = read(); return state; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get())); } catch (e) { console.error('[Gear] save failed', e); }
    try { global.dispatchEvent(new CustomEvent('gear:change')); } catch (e) { /* old browsers */ }
  }

  /* ───────── Bag ───────── */
  const item = (id) => get().bag[id] || null;
  function owner(id) {
    const eq = get().equip;
    for (const uid of Object.keys(eq)) for (const slot of SLOTS) if (eq[uid][slot] === id) return uid;
    return null;
  }
  const equippedId = (uid, slot) => ((get().equip[uid] || {})[slot]) || null;
  // Pieces for a slot, best first (rarity, level, then newest)
  function bagFor(slot) {
    return Object.values(get().bag).filter(it => !slot || it.slot === slot)
      .sort((a, b) => b.rarity - a.rarity || b.level - a.level || (b.id > a.id ? 1 : -1));
  }
  const bagCount = () => Object.keys(get().bag).length;
  function add(it) {
    const s = get();
    if (Object.keys(s.bag).length >= BAG_MAX) return null;
    const copy = clean({ bag: { x: Object.assign({}, it, { id: 'x' }) } }).bag.x;
    if (!copy) return null;
    copy.id = newId(s);
    s.bag[copy.id] = copy;
    save();
    return copy;
  }
  // Roll the drops for one stage chest of a mission at `rank`
  function rollDrop(rank) {
    const d = DROPS[rank] || DROPS.C;
    if (rand() >= d.chance) return [];
    return [roll({ rarity: pickWeighted(d.w) })];
  }
  function equip(uid, id) {
    const it = item(id);
    if (!uid || !it) return { ok: false, msg: 'Pick a piece' };
    const s = get();
    const prev = owner(id);
    if (prev) { delete s.equip[prev][it.slot]; if (!Object.keys(s.equip[prev]).length) delete s.equip[prev]; }
    (s.equip[uid] = s.equip[uid] || {})[it.slot] = id;
    save();
    return { ok: true, msg: `Equipped ${nameOf(it.slot, it.rarity)}`, from: prev };
  }
  function unequip(uid, slot) {
    const row = get().equip[uid];
    if (!row || !row[slot]) return { ok: false, msg: 'Nothing equipped' };
    delete row[slot];
    if (!Object.keys(row).length) delete get().equip[uid];
    save();
    return { ok: true, msg: 'Unequipped' };
  }
  function salvage(id) {
    const it = item(id);
    if (!it) return { ok: false, msg: 'Pick a piece' };
    if (owner(id)) return { ok: false, msg: 'Unequip it first' };
    const ryoBack = SALVAGE[it.rarity] + Math.round(spentOn(it) * 0.8);
    delete get().bag[id];
    if (R()) R().add('ryo', ryoBack);
    save();
    return { ok: true, ryo: ryoBack, msg: `+${ryoBack.toLocaleString()} Ryo` };
  }
  function spentOn(it) { let c = 0; for (let l = 0; l < it.level; l++) c += levelCost(l, it.rarity); return c; }

  /* ───────── Info for the UI ───────── */
  function describe(it) {
    const t = TIERS[it.rarity];
    const atCap = it.level >= t.cap;
    return {
      id: it.id, slot: it.slot, item: it, empty: false,
      tier: it.rarity, rarity: it.rarity, level: it.level, cap: t.cap, tierInfo: t, shiny: !!t.shiny,
      name: nameOf(it.slot, it.rarity), kind: PIECES[it.slot].kind,
      icon: iconOf(it.slot, it.rarity), art: artOf(it.slot, it.rarity),
      stat: it.main, statLabel: STAT[it.main].label, unit: STAT[it.main].unit || '',
      value: mainValue(it.main, it.rarity, it.level),
      next: atCap ? null : mainValue(it.main, it.rarity, it.level + 1),
      cost: atCap ? 0 : levelCost(it.level, it.rarity),
      atCap, isMax: atCap, promote: null,
      subs: it.subs.map(([k, v]) => ({ stat: k, label: STAT[k].label, unit: STAT[k].unit || '', value: v, text: fmtValue(k, v) })),
      owner: owner(it.id),
      magatama: PIECES[it.slot].magatama
    };
  }
  function itemInfo(id) { const it = item(id); return it ? describe(it) : null; }
  // What a slot of a shinobi shows: its piece, or an empty slot
  function info(uid, slot) {
    const id = equippedId(uid, slot);
    if (id && item(id)) return Object.assign(describe(item(id)), { uid });
    const t = TIERS[0];
    return {
      id: null, slot, uid, item: null, empty: true, tier: 0, rarity: 0, level: 0, cap: 0, tierInfo: t, shiny: false,
      name: `No ${PIECES[slot].kind}`, kind: PIECES[slot].kind,
      icon: iconOf(slot, 0), art: artOf(slot, 0),
      stat: PIECES[slot].mains[0], statLabel: STAT[PIECES[slot].mains[0]].label, unit: '',
      value: 0, next: null, cost: 0, atCap: true, isMax: true, promote: null, subs: [],
      owner: null, magatama: PIECES[slot].magatama
    };
  }
  function unitGear(uid) {
    const out = {};
    SLOTS.forEach(slot => { const id = equippedId(uid, slot); out[slot] = id ? Object.assign({}, item(id)) : null; });
    return out;
  }

  /* ───────── Levelling (Ryo) ───────── */
  const R = () => global.Resources;
  const ryo = () => (R() ? R().get('ryo') : 0);
  function planItem(it, max = Infinity, budget = ryo()) {
    let level = it.level, cost = 0, levels = 0;
    while (level < capOf(it.rarity) && levels < max) {
      const c = levelCost(level, it.rarity);
      if (cost + c > budget) break;
      cost += c; level++; levels++;
    }
    return { levels, cost, level };
  }
  function levelItem(id, times = 1) {
    const it = item(id);
    if (!it) return { ok: false, msg: 'Pick a piece' };
    if (it.level >= capOf(it.rarity)) return { ok: false, msg: 'Max level' };
    const pl = planItem(it, times === 'auto' ? Infinity : Math.max(1, Math.floor(times) || 1));
    if (!pl.levels) return { ok: false, msg: 'Not enough Ryo' };
    R().subtract('ryo', pl.cost);
    growSubs(it, it.level, pl.level);
    it.level = pl.level;
    save();
    return { ok: true, levels: pl.levels, spent: pl.cost, level: pl.level, msg: `${nameOf(it.slot, it.rarity)} +${pl.level}` };
  }
  function plan(uid, slot, max = Infinity, budget = ryo()) {
    const it = item(equippedId(uid, slot));
    return it ? planItem(it, max, budget) : { levels: 0, cost: 0, level: 0 };
  }
  function strengthen(uid, slot, times = 1) {
    if (!uid || !PIECES[slot]) return { ok: false, msg: 'Pick a gear piece' };
    const id = equippedId(uid, slot);
    if (!id) return { ok: false, msg: 'Nothing equipped' };
    return levelItem(id, times);
  }
  const auto = (uid, slot) => strengthen(uid, slot, 'auto');
  // Level every equipped piece evenly (lowest level first) with the Ryo on hand
  function autoAll(uid) {
    if (!uid) return { ok: false, msg: 'Pick a shinobi' };
    let spent = 0, levels = 0;
    for (;;) {
      const open = SLOTS.map(slot => item(equippedId(uid, slot))).filter(Boolean)
        .filter(it => it.level < capOf(it.rarity) && levelCost(it.level, it.rarity) <= ryo())
        .sort((a, b) => a.level - b.level);
      if (!open.length) break;
      const it = open[0];
      const c = levelCost(it.level, it.rarity);
      R().subtract('ryo', c);
      growSubs(it, it.level, it.level + 1);
      it.level += 1;
      spent += c; levels++;
    }
    if (!levels) return { ok: false, msg: 'Not enough Ryo' };
    save();
    return { ok: true, levels, spent, msg: `+${levels} Lv` };
  }
  // Rarity is fixed on a piece; a better one has to drop
  const promote = () => ({ ok: false, msg: 'Rarity is fixed: find a better drop' });

  /* ───────── Stat bonuses ───────── */
  // Sum of every equipped piece (main + substats), percents kept as percents
  function bonusFor(uid) {
    const out = zero();
    if (!uid) return out;
    SLOTS.forEach(slot => {
      const it = item(equippedId(uid, slot));
      if (!it) return;
      out[it.main] += mainValue(it.main, it.rarity, it.level);
      it.subs.forEach(([k, v]) => { out[k] += v; });
    });
    Object.keys(out).forEach(k => { out[k] = round(k, out[k]); });
    return out;
  }
  const caps = () => {
    const d = global.Magatama && global.Magatama.data ? global.Magatama.data() : null;
    return { nin: (d && d.caps && d.caps.nin) || 60, res: (d && d.caps && d.caps.res) || 50 };
  };
  // Gear + socketed magatama as flat numbers. `base` ({ hp, atk, def }) turns
  // HP% / ATK% / DEF% into flat amounts; without it they are left out.
  function totalFor(uid, base) {
    const g = bonusFor(uid);
    const m = global.Magatama && global.Magatama.bonusForUnit ? global.Magatama.bonusForUnit(uid) : {};
    const b = base || {};
    const out = {
      hp: g.hp + (m.hp || 0) + Math.round((Number(b.hp) || 0) * g.hpPct / 100),
      atk: g.atk + (m.atk || 0) + Math.round((Number(b.atk) || 0) * g.atkPct / 100),
      def: g.def + (m.def || 0) + Math.round((Number(b.def) || 0) * g.defPct / 100),
      spd: Math.round(g.spd * 10) / 10,
      nin: g.nin + (m.nin || 0), res: g.res + (m.res || 0),
      critRate: g.critRate, critDmg: g.critDmg,
      hpPct: g.hpPct, atkPct: g.atkPct, defPct: g.defPct
    };
    const c = caps();
    out.nin = Math.min(Math.round(out.nin * 100) / 100, c.nin);
    out.res = Math.min(Math.round(out.res * 100) / 100, c.res);
    return out;
  }
  // Adds gear + magatama to a battle stats object ({ hp, maxHP, atk, def, speed }).
  // Jutsu DMG / RES stay as percentages on stats.magatama, which
  // battle-combat.js calculateDamage applies to jutsu and ultimate damage.
  function applyToStats(stats, instance) {
    if (!stats || !instance || !instance.uid) return stats;
    const base = { hp: Number(stats.hp) || 0, atk: Number(stats.atk) || 0, def: Number(stats.def) || 0 };
    const t = totalFor(instance.uid, base);
    stats.hp = base.hp + t.hp;
    if ('maxHP' in stats) stats.maxHP = (Number(stats.maxHP) || 0) + t.hp;
    stats.atk = base.atk + t.atk;
    stats.def = base.def + t.def;
    if (t.spd) stats.speed = (Number(stats.speed) || 0) + t.spd;
    if (t.critRate) stats.critRate = (Number(stats.critRate) || 0) + t.critRate;
    if (t.critDmg) stats.critDmg = (Number(stats.critDmg) || 0) + t.critDmg;
    stats.magatama = { hp: t.hp, atk: t.atk, def: t.def, spd: t.spd, nin: t.nin, res: t.res };
    const g = bonusFor(instance.uid);
    stats.gear = { hp: g.hp, atk: g.atk, def: g.def, spd: g.spd, nin: g.nin, res: g.res };
    return stats;
  }

  /* ───────── Migration: Tool cards leave equipment1..5 ───────── */
  function migrateInventory() {
    const inv = global.InventoryChar;
    if (!inv || !inv.allInstances) return 0;
    let n = 0;
    inv.allInstances().forEach(inst => {
      const eq = inst && inst.equippedJutsu;
      if (!eq || !TOOL_SLOTS.some(k => eq[k])) return;
      const next = Object.assign({}, eq);
      TOOL_SLOTS.forEach(k => { next[k] = null; });
      inv.updateInstance(inst.uid, { equippedJutsu: next });
      n++;
    });
    return n;
  }
  const migrate = () => { try { migrateInventory(); } catch (e) { console.warn('[Gear] migration skipped', e); } };
  if (global.InventoryChar) migrate();
  else if (global.document) global.document.addEventListener('DOMContentLoaded', migrate, { once: true });

  global.Gear = {
    STORAGE_KEY, OLD_KEY, SLOTS, TOOL_SLOTS, TIERS, PIECES, STAT, NAMES, DROPS, MAX_LEVEL, BAG_MAX, STATS, PROMOTE: [],
    get, reload, item, itemInfo, info, unitGear, owner, equippedId, bagFor, bagCount,
    nameOf, iconOf, artOf, scrollIcon, capOf, levelCost, mainValue, fmtValue,
    // fmtStat / statValue: the main stat of a slot's equipped piece (Tools page)
    fmtStat: (slot, v) => fmtValue(PIECES[slot] ? PIECES[slot].mains[0] : 'hp', v),
    statValue: () => 0,
    roll, rollDrop, add, equip, unequip, salvage,
    plan, strengthen, auto, autoAll, promote, levelItem,
    bonusFor, totalFor, applyToStats, migrateInventory
  };
})(window);
