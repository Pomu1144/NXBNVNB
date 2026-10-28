// js/gear.js — Ninja Tools: the equipment of a shinobi (window.Gear).
//
// Every shinobi has 8 tool slots (two rows of 4). Tools come from the
// catalogue in data/ninja-tools.json (name, stars, icon, who can equip it)
// and drop from missions into a bag. An owned tool has:
//   stars   1–7, from the catalogue (919 tools, icons in assets/ninja-tools,
//           imported by tools/ninja-tools/import.py)
//   stats   its slot stats; how many depends on the stars (SLOT_COUNT):
//           6★ / 7★ six, 5★ four, 4★ three, 3★ two, 2★ / 1★ one. Fixed by the
//           catalogue entry (`slots`) or rolled once from its `pool`.
//   magatama sockets (js/magatama.js, keyed by tool id): 1 / 2 / 3 by stars
// A tool sits on one shinobi at most, a shinobi wears one copy of a tool,
// and a catalogue `equip` list (charId prefixes) limits who can wear it.
// Percent stats (HP% / ATK% / DEF%) count against the unit's own base stats.
// Crit Rate / Crit DMG feed stats.critRate / critDmg in battle; Jutsu DMG /
// Jutsu RES ride on stats.magatama with the socketed magatama (capped).
//
// Save (localStorage "blazing_tools_v1"):
//   { seq, starter, bag: { [id]: { id, toolId, stars, stats: [[stat, value], …] } },
//     equip: { [uid]: [id|null × 8] } }
// The old generic gear ("blazing_gear_v2") is refunded in Ryo once.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'blazing_tools_v1';
  const OLD_KEY = 'blazing_gear_v2';
  const SLOT_N = 8;
  const SLOTS = Array.from({ length: SLOT_N }, (_, i) => i);
  const TOOL_SLOTS = ['equipment1', 'equipment2', 'equipment3', 'equipment4', 'equipment5'];
  const BAG_MAX = 300;
  const MAX_STARS = 7;

  // Slot stats per star level (index = stars)
  const SLOT_COUNT = [0, 1, 1, 2, 3, 4, 6, 6];
  const SOCKETS = [0, 1, 1, 1, 2, 2, 3, 3];
  const STAR_COLOR = [null, '#9a8f80', '#5dae55', '#4b8fe0', '#a266e0', '#e8902e', '#e0453c', '#f3c552'];
  // A slot stat on a 6★ tool is STAT[k].slot; other stars scale it
  const STAR_MULT = [0, 0.25, 0.35, 0.5, 0.65, 0.8, 1, 1.2];
  const STAT = {
    hp:       { label: 'HP',        slot: 900 },
    atk:      { label: 'ATK',       slot: 60 },
    def:      { label: 'DEF',       slot: 45 },
    hpPct:    { label: 'HP',        slot: 6,   unit: '%' },
    atkPct:   { label: 'ATK',       slot: 6,   unit: '%' },
    defPct:   { label: 'DEF',       slot: 7,   unit: '%' },
    spd:      { label: 'SPD',       slot: 3,   dp: 1 },
    critRate: { label: 'Crit Rate', slot: 5,   unit: '%' },
    critDmg:  { label: 'Crit DMG',  slot: 10,  unit: '%' },
    nin:      { label: 'Jutsu DMG', slot: 5,   unit: '%' },
    res:      { label: 'Jutsu RES', slot: 4.5, unit: '%' }
  };
  const STAT_KEYS = Object.keys(STAT);
  // Mission drops: chance per stage chest and star weights (1★…7★) by rank
  const DROPS = {
    D:  { chance: 0.20, w: [45, 40, 15, 0, 0, 0, 0] },
    C:  { chance: 0.30, w: [20, 40, 30, 10, 0, 0, 0] },
    B:  { chance: 0.35, w: [5, 25, 40, 25, 5, 0, 0] },
    A:  { chance: 0.40, w: [0, 10, 30, 35, 20, 5, 0] },
    S:  { chance: 0.50, w: [0, 0, 15, 35, 35, 14, 1] },
    SS: { chance: 0.60, w: [0, 0, 5, 25, 40, 26, 4] }
  };
  const SELL = [0, 200, 400, 900, 2000, 4500, 10000, 20000];
  const zero = () => ({ hp: 0, atk: 0, def: 0, spd: 0, nin: 0, res: 0, critRate: 0, critDmg: 0, hpPct: 0, atkPct: 0, defPct: 0 });

  /* ───────── Catalogue (data/ninja-tools.json) ───────── */
  let CATALOG = [];
  let byId = {};
  function setCatalog(list) {
    CATALOG = (Array.isArray(list) ? list : []).filter(t => t && t.id && t.name)
      .map(t => Object.assign({}, t, { stars: clampStars(t.stars) }));
    byId = {};
    CATALOG.forEach(t => { byId[t.id] = t; });
  }
  let loadP = null;
  function load() {
    if (!loadP) {
      loadP = Promise.resolve()
        .then(() => fetch('data/ninja-tools.json'))
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (j && Array.isArray(j.tools)) setCatalog(j.tools);
          try { global.dispatchEvent(new CustomEvent('gear:change')); } catch (e) { /* old browsers */ }
          return CATALOG;
        })
        .catch(() => CATALOG);
    }
    return loadP;
  }
  const tool = (toolId) => byId[toolId] || null;

  /* ───────── Numbers ───────── */
  function clampStars(s) { return Math.max(1, Math.min(MAX_STARS, Math.floor(Number(s) || 1))); }
  const slotCount = (stars) => SLOT_COUNT[clampStars(stars)];
  const socketCount = (stars) => SOCKETS[clampStars(stars)];
  const starColor = (stars) => STAR_COLOR[clampStars(stars)];
  const round = (stat, v) => {
    const s = STAT[stat];
    if (s && s.unit) return Math.round(v * 100) / 100;
    if (s && s.dp) return Math.round(v * 10) / 10;
    return Math.round(v);
  };
  function fmtValue(stat, v) {
    const s = STAT[stat];
    if (s && s.unit) return `${(Math.round((Number(v) || 0) * 100) / 100).toFixed(2)}%`;
    if (s && s.dp) return String(Math.round((Number(v) || 0) * 10) / 10);
    return Math.round(Number(v) || 0).toLocaleString();
  }
  const statLabel = (stat) => (STAT[stat] ? STAT[stat].label + (STAT[stat].unit && /Pct$/.test(stat) ? '%' : '') : stat);

  /* ───────── Rolling ───────── */
  const rand = () => Math.random();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  function pickWeighted(w) {
    const total = w.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return w.length - 1;
  }
  const slotRoll = (stat, stars) => round(stat, STAT[stat].slot * STAR_MULT[clampStars(stars)] * pick([0.8, 0.9, 1]));
  // The slot stats of a fresh copy: the catalogue's fixed slots first, the
  // rest rolled from its pool (or every stat)
  function rollStats(def) {
    const n = slotCount(def.stars);
    const fixed = (Array.isArray(def.slots) ? def.slots : [])
      .filter(s => Array.isArray(s) && STAT[s[0]]).slice(0, n).map(s => [s[0], Number(s[1]) || 0]);
    const pool = (Array.isArray(def.pool) ? def.pool : []).filter(k => STAT[k]);
    const from = pool.length ? pool : STAT_KEYS;
    while (fixed.length < n) { const k = pick(from); fixed.push([k, slotRoll(k, def.stars)]); }
    return fixed;
  }
  // A fresh copy of a catalogue tool (`toolId`), or of a random tool with
  // `stars` (nearest star level the catalogue has)
  function roll(opts = {}) {
    let def = tool(opts.toolId);
    if (!def && CATALOG.length) {
      const want = clampStars(opts.stars);
      const best = CATALOG.reduce((b, t) => Math.min(b, Math.abs(t.stars - want)), 99);
      def = pick(CATALOG.filter(t => Math.abs(t.stars - want) === best));
    }
    if (!def) return null;
    return { id: null, toolId: def.id, stars: def.stars, stats: rollStats(def) };
  }

  /* ───────── State ───────── */
  let state = null;
  function clean(raw) {
    const bag = {};
    Object.values((raw && raw.bag) || {}).forEach(it => {
      if (!it || !it.id || !it.toolId) return;
      const stars = clampStars(it.stars);
      const stats = (Array.isArray(it.stats) ? it.stats : [])
        .filter(s => Array.isArray(s) && STAT[s[0]]).slice(0, slotCount(stars))
        .map(s => [s[0], Number(s[1]) || 0]);
      bag[it.id] = { id: String(it.id), toolId: String(it.toolId), stars, stats };
    });
    const equip = {};
    const seen = new Set();
    Object.entries((raw && raw.equip) || {}).forEach(([uid, row]) => {
      if (!Array.isArray(row)) return;
      const out = SLOTS.map(i => {
        const id = row[i];
        if (!id || !bag[id] || seen.has(id)) return null;
        seen.add(id);
        return id;
      });
      if (out.some(Boolean)) equip[uid] = out;
    });
    return { seq: Math.max(0, Number(raw && raw.seq) || 0), starter: !!(raw && raw.starter), refunded: !!(raw && raw.refunded), bag, equip };
  }
  function newId(s) { s.seq += 1; return `t${Date.now().toString(36)}${s.seq.toString(36)}`; }
  // The old generic gear pieces: what was spent levelling them comes back as Ryo
  function refundOld() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null'); } catch (e) { old = null; }
    if (!old || !old.bag) return 0;
    const SAL = [300, 800, 2000, 5000, 12000, 25000];
    let ryo = 0;
    Object.values(old.bag).forEach(it => {
      const t = Math.max(0, Math.min(5, Math.floor(Number(it && it.rarity) || 0)));
      ryo += SAL[t];
      for (let l = 0; l < (Number(it && it.level) || 0); l++) ryo += Math.round(((l + 1) * 1500 * (1 + t * 0.6)) / 10) * 10;
    });
    if (ryo && global.Resources) global.Resources.add('ryo', ryo);
    return ryo;
  }
  function read() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { raw = null; }
    const s = clean(raw);
    if (!raw) {
      try { if (refundOld()) s.refunded = true; } catch (e) { /* ignore */ }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    }
    return s;
  }
  function get() { if (!state) state = read(); return state; }
  function reload() { state = read(); return state; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get())); } catch (e) { console.error('[Tools] save failed', e); }
    try { global.dispatchEvent(new CustomEvent('gear:change')); } catch (e) { /* old browsers */ }
  }
  // New players: a full row of 8 different 1★ / 2★ tools anyone can wear
  const STARTER_N = 8;
  function giveStarter() {
    const s = get();
    if (s.starter || !CATALOG.length) return;
    const pool = CATALOG.filter(t => t.stars <= 2 && !(Array.isArray(t.equip) && t.equip.length));
    for (let n = 0; n < STARTER_N && pool.length; n++) {
      const t = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      const it = roll({ toolId: t.id }); it.id = newId(s); s.bag[it.id] = it;
    }
    s.starter = true;
    save();
  }
  // Tools whose catalogue entry is gone (the placeholder set before the
  // full catalogue): sold back for Ryo, their magatama back in the bag
  function dropRetired() {
    const s = get();
    // only where magatama can be handed back too (not on missions.html)
    if (!CATALOG.length || !global.Magatama) return 0;
    const gone = Object.values(s.bag).filter(it => !byId[it.toolId]);
    gone.forEach(it => {
      Object.keys(s.equip).forEach(uid => {
        const r = s.equip[uid].map(x => (x === it.id ? null : x));
        if (r.some(Boolean)) s.equip[uid] = r; else delete s.equip[uid];
      });
      if (global.Magatama && global.Magatama.removeAll) global.Magatama.removeAll(it.id);
      if (global.Resources) global.Resources.add('ryo', SELL[it.stars]);
      delete s.bag[it.id];
    });
    if (gone.length) save();
    return gone.length;
  }

  /* ───────── Bag ───────── */
  const item = (id) => get().bag[id] || null;
  const row = (uid) => get().equip[uid] || SLOTS.map(() => null);
  function owner(id) {
    const eq = get().equip;
    for (const uid of Object.keys(eq)) if (eq[uid].includes(id)) return uid;
    return null;
  }
  const equippedId = (uid, slot) => row(uid)[slot] || null;
  const equippedIds = (uid) => row(uid).filter(Boolean);
  // Owned tools, best first (stars, then name, then newest)
  function bagList() {
    return Object.values(get().bag).sort((a, b) => b.stars - a.stars
      || nameOf(a).localeCompare(nameOf(b)) || (b.id > a.id ? 1 : -1));
  }
  const bagCount = () => Object.keys(get().bag).length;
  function add(it) {
    const s = get();
    if (!it || Object.keys(s.bag).length >= BAG_MAX) return null;
    const copy = clean({ bag: { x: Object.assign({}, it, { id: 'x' }) } }).bag.x;
    if (!copy) return null;
    copy.id = newId(s);
    s.bag[copy.id] = copy;
    save();
    return copy;
  }
  function rollDrop(rank) {
    const d = DROPS[rank] || DROPS.C;
    if (rand() >= d.chance) return [];
    const it = roll({ stars: pickWeighted(d.w) + 1 });
    return it ? [it] : [];
  }

  /* ───────── Who can equip ───────── */
  function charIdOf(uid) {
    const inst = global.InventoryChar && global.InventoryChar.getByUid ? global.InventoryChar.getByUid(uid) : null;
    return inst ? String(inst.charId || '') : '';
  }
  function canEquip(uid, toolId, charId) {
    const def = tool(toolId);
    if (!def || !Array.isArray(def.equip) || !def.equip.length) return true;
    const cid = String(charId || charIdOf(uid)).toLowerCase();
    return def.equip.some(p => cid === p || cid.startsWith(String(p).toLowerCase() + '_'));
  }
  function equip(uid, id, slot) {
    const it = item(id);
    if (!uid || !it) return { ok: false, msg: 'Pick a tool' };
    if (!canEquip(uid, it.toolId)) return { ok: false, msg: 'This shinobi cannot equip it' };
    const s = get();
    const r = row(uid).slice();
    const dupe = r.findIndex((x, i) => x && x !== id && item(x) && item(x).toolId === it.toolId && i !== slot);
    if (dupe >= 0) return { ok: false, msg: 'Already wearing that tool' };
    if (slot == null || slot < 0 || slot >= SLOT_N) slot = r.indexOf(null);
    if (slot < 0) return { ok: false, msg: 'All 8 slots are full' };
    const prev = owner(id);
    if (prev) {
      const pr = prev === uid ? r : s.equip[prev].slice();
      pr[pr.indexOf(id)] = null;
      if (prev !== uid) { if (pr.some(Boolean)) s.equip[prev] = pr; else delete s.equip[prev]; }
    }
    r[slot] = id;
    s.equip[uid] = r;
    save();
    return { ok: true, msg: `Equipped ${nameOf(it)}`, from: prev };
  }
  function unequip(uid, slot) {
    const r = row(uid).slice();
    if (!r[slot]) return { ok: false, msg: 'Nothing equipped' };
    r[slot] = null;
    if (r.some(Boolean)) get().equip[uid] = r; else delete get().equip[uid];
    save();
    return { ok: true, msg: 'Unequipped' };
  }
  function sell(id) {
    const it = item(id);
    if (!it) return { ok: false, msg: 'Pick a tool' };
    if (owner(id)) return { ok: false, msg: 'Unequip it first' };
    if (global.Magatama && global.Magatama.removeAll) global.Magatama.removeAll(id);
    const ryoBack = SELL[it.stars];
    delete get().bag[id];
    if (global.Resources) global.Resources.add('ryo', ryoBack);
    save();
    return { ok: true, ryo: ryoBack, msg: `+${ryoBack.toLocaleString()} Ryo` };
  }

  /* ───────── Info for the UI ───────── */
  function nameOf(it) { const d = it && tool(it.toolId); return d ? d.name : (it && it.toolId ? String(it.toolId).replace(/_/g, ' ') : 'Ninja Tool'); }
  const ICON_FALLBACK = 'assets/gear/art/blue_scroll.webp';
  function iconOf(it) { const d = it && tool(it.toolId); return (d && d.icon) || ICON_FALLBACK; }
  function describe(it) {
    const def = tool(it.toolId);
    return {
      id: it.id, toolId: it.toolId, item: it, empty: false,
      name: nameOf(it), icon: iconOf(it), stars: it.stars, color: starColor(it.stars),
      slots: slotCount(it.stars), sockets: socketCount(it.stars),
      stats: it.stats.map(([k, v]) => ({ stat: k, label: statLabel(k), value: v, text: `+${fmtValue(k, v)}` })),
      equip: def && Array.isArray(def.equip) ? def.equip.slice() : null,
      owner: owner(it.id)
    };
  }
  function itemInfo(id) { const it = item(id); return it ? describe(it) : null; }
  function info(uid, slot) {
    const id = equippedId(uid, slot);
    if (id && item(id)) return Object.assign(describe(item(id)), { uid, slot });
    return { id: null, uid, slot, empty: true, name: 'Empty', stats: [], stars: 0 };
  }
  // A dropped roll object as a reward tile
  function dropView(it) {
    return { name: nameOf(it), icon: iconOf(it), color: starColor(it.stars), stars: clampStars(it.stars) };
  }

  /* ───────── Stat bonuses ───────── */
  function bonusOfItem(it, out) {
    it.stats.forEach(([k, v]) => { out[k] += v; });
    return out;
  }
  // Sum of every equipped tool's slot stats, percents kept as percents
  function bonusFor(uid) {
    const out = zero();
    if (!uid) return out;
    equippedIds(uid).forEach(id => { const it = item(id); if (it) bonusOfItem(it, out); });
    Object.keys(out).forEach(k => { out[k] = round(k, out[k]); });
    return out;
  }
  const caps = () => {
    const d = global.Magatama && global.Magatama.data ? global.Magatama.data() : null;
    return { nin: (d && d.caps && d.caps.nin) || 60, res: (d && d.caps && d.caps.res) || 50 };
  };
  // Tools + socketed magatama as flat numbers. `base` ({ hp, atk, def }) turns
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
  // Adds tools + magatama to a battle stats object ({ hp, maxHP, atk, def, speed }).
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
  const migrate = () => { try { migrateInventory(); } catch (e) { console.warn('[Tools] migration skipped', e); } };
  if (global.InventoryChar) migrate();
  else if (global.document) global.document.addEventListener('DOMContentLoaded', migrate, { once: true });
  load().then(() => { dropRetired(); giveStarter(); });

  global.Gear = {
    STORAGE_KEY, OLD_KEY, SLOT_N, SLOTS, TOOL_SLOTS, STAT, DROPS, BAG_MAX, MAX_STARS,
    SLOT_COUNT, SOCKETS, STAR_COLOR, SETS: {},
    load, setCatalog, catalog: () => CATALOG.slice(), tool,
    get, reload, item, itemInfo, info, owner, equippedId, equippedIds, bagList, bagCount,
    nameOf, iconOf, dropView, slotCount, socketCount, starColor, fmtValue, statLabel,
    roll, rollDrop, add, equip, unequip, sell, canEquip,
    bonusFor, totalFor, applyToStats, migrateInventory
  };
  global.NinjaTools = global.Gear;
})(window);
