// js/magatama.js — Magatama (Naruto Online "Beset Magatama") core.
//
// Magatama are beset into ninja tools (js/gear.js): a tool has 1 / 2 / 3
// sockets by its stars (Gear.socketCount). Attack (ATK), Life (HP),
// Defense (DEF), Ninjutsu (+% jutsu/ultimate damage dealt) or Resistance
// (-% jutsu/ultimate damage taken) jewels, levels 1-9 as in game, each
// level its own shape (data/magatama.json). Any type fits any tool. Four of
// one level combine into one of the next; splitting reverses that.
// Magatama stay on their tool when it moves to another shinobi.
//
// Save (localStorage "blazing_magatama_v1"):
//   { bag: { "attack:3": 2, ... }, tools: { [toolId]: ["life:4", null, ...] } }
// Older saves socketed magatama per gear piece ("gear") or tool card
// ("sockets"); those go back into the bag on load.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'blazing_magatama_v1';
  const MAX_SOCKETS = 3;   // = data socketsPerTool (a 6★ / 7★ tool)
  const G = () => global.Gear;
  // Sockets a tool has (by its stars); unknown tools get none
  function socketN(toolId) {
    const it = G() && G().item ? G().item(toolId) : null;
    return it ? G().socketCount(it.stars) : 0;
  }

  // Same numbers as data/magatama.json so battle stats never wait on a fetch.
  // load() refreshes from the JSON (tests keep the two in sync).
  let DATA = {
    socketsPerTool: 3, combineCount: 4, splitCount: 4, maxLevel: 9,
    types: [
      {id: 'attack', name: 'Attack', color: '#e0563a', stat: 'atk', statLabel: 'ATK', values: [4, 10, 15, 21, 28, 36, 46, 58, 72]},
      {id: 'life', name: 'Life', color: '#3fb46a', stat: 'hp', statLabel: 'HP', values: [10, 25, 38, 53, 70, 90, 115, 145, 180]},
      {id: 'defense', name: 'Defense', color: '#e0a126', stat: 'def', statLabel: 'DEF', values: [3, 6, 9, 13, 17, 22, 28, 35, 43]},
      {id: 'ninjutsu', name: 'Ninjutsu', color: '#9d62e0', stat: 'nin', statLabel: 'Jutsu DMG', unit: '%', values: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5]},
      {id: 'resistance', name: 'Resistance', color: '#3aa6e0', stat: 'res', statLabel: 'Jutsu RES', unit: '%', values: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5]}
    ],
    caps: { nin: 60, res: 50 },
    shop: { currency: 'ryo', levels: { 1: 2000, 2: 7500, 3: 28000 } }
  };
  let typesById = {};
  const index = () => { typesById = {}; DATA.types.forEach(t => { typesById[t.id] = t; }); };
  index();

  let loadP = null;
  function load() {
    if (!loadP) {
      loadP = fetch('data/magatama.json')
        .then(r => (r.ok ? r.json() : null))
        .then(j => { if (j && Array.isArray(j.types) && j.types.length) { DATA = Object.assign({}, DATA, j); index(); } return DATA; })
        .catch(() => DATA);
    }
    return loadP;
  }

  /* ───────── Keys ───────── */
  const key = (type, level) => `${type}:${level}`;
  function parse(k) {
    if (typeof k !== 'string') return null;
    const [type, lv] = k.split(':');
    const level = Number(lv);
    if (!typesById[type] || !(level >= 1 && level <= DATA.maxLevel)) return null;
    return { type, level };
  }
  const iconFor = (type, level) => `assets/magatama/${type}_${level}.webp`;
  function valueOf(type, level) {
    const t = typesById[type];
    return t ? Number(t.values[level - 1]) || 0 : 0;
  }
  function info(k) {
    const p = parse(k);
    if (!p) return null;
    const t = typesById[p.type];
    return {
      key: k, type: p.type, level: p.level, name: t.name, color: t.color,
      stat: t.stat, statLabel: t.statLabel, unit: t.unit || '', value: valueOf(p.type, p.level),
      text: `+${valueOf(p.type, p.level)}${t.unit || ''} ${t.statLabel}`, icon: iconFor(p.type, p.level)
    };
  }

  /* ───────── State ───────── */
  let state = null;
  function read() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    const bag = {};
    // Older saves had a level 10; the game tops out at 9, so each one
    // splits back into four level 9s (socketed ones become a level 9).
    const cap = (k) => (typeof k === 'string' && /:10$/.test(k) ? k.replace(/:10$/, ':' + DATA.maxLevel) : k);
    Object.entries(s.bag || {}).forEach(([k, n]) => {
      n = Math.floor(Number(n) || 0);
      if (cap(k) !== k) { k = cap(k); n *= DATA.splitCount; }
      if (parse(k) && n > 0) bag[k] = (bag[k] || 0) + n;
    });
    // Old per-card sockets: everything goes back into the bag
    Object.values(s.sockets || {}).forEach(arr => {
      if (!Array.isArray(arr)) return;
      arr.forEach(k => { k = cap(k); if (parse(k)) bag[k] = (bag[k] || 0) + 1; });
    });
    // Old per-gear-piece sockets: back into the bag
    Object.values(s.gear || {}).forEach(pieces => Object.values(pieces || {}).forEach(arr => {
      if (!Array.isArray(arr)) return;
      arr.forEach(k => { k = cap(k); if (parse(k)) bag[k] = (bag[k] || 0) + 1; });
    }));
    const tools = {};
    Object.entries(s.tools || {}).forEach(([id, arr]) => {
      if (!Array.isArray(arr)) return;
      const r = new Array(MAX_SOCKETS).fill(null).map((_, i) => (parse(cap(arr[i])) ? cap(arr[i]) : null));
      if (r.some(Boolean)) tools[id] = r;
    });
    return { bag, tools };
  }
  function get() { if (!state) state = read(); return state; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.error('[Magatama] save failed', e); }
    try { global.dispatchEvent(new CustomEvent('magatama:change')); } catch (e) { /* old browsers */ }
  }
  function reload() { state = read(); return state; }

  const count = (k) => get().bag[k] || 0;
  function addBag(k, n) {
    const s = get();
    s.bag[k] = (s.bag[k] || 0) + n;
    if (s.bag[k] <= 0) delete s.bag[k];
  }
  // A tool's sockets (length = its socket count). Magatama on sockets the
  // tool no longer has (or on a tool that is gone) are left where they are
  // until removeAll / the tool is sold.
  function socketsOf(toolId) {
    const n = socketN(toolId);
    const r = get().tools[toolId] || [];
    return new Array(n).fill(null).map((_, i) => r[i] || null);
  }
  function setSockets(toolId, r) {
    const s = get();
    if (r.some(Boolean)) s.tools[toolId] = r.slice(); else delete s.tools[toolId];
  }

  // Any type fits any tool
  function fits() { return DATA.types.map(t => t.id); }

  /* ───────── Actions (return { ok, msg }) ───────── */
  const R = () => global.Resources;
  function priceOf(level) { return Number(DATA.shop.levels[level]) || 0; }
  function buy(type, level, qty = 1) {
    qty = Math.max(1, Math.floor(qty));
    const price = priceOf(level) * qty;
    if (!typesById[type] || !price) return { ok: false, msg: 'Not sold' };
    const res = R();
    const cur = DATA.shop.currency || 'ryo';
    if (!res || !res.has(cur, price)) return { ok: false, msg: 'Not enough Ryo' };
    res.subtract(cur, price);
    addBag(key(type, level), qty);
    save();
    return { ok: true, msg: `+${qty} ${typesById[type].name} Lv${level}` };
  }

  function beset(toolId, k, idx) {
    const p = parse(k);
    if (!toolId || !p) return { ok: false, msg: 'Pick a magatama' };
    if (count(k) < 1) return { ok: false, msg: 'None left' };
    const row = socketsOf(toolId);
    if (!row.length) return { ok: false, msg: 'This tool has no sockets' };
    if (idx == null || idx < 0) idx = row.indexOf(null);
    if (idx < 0 || idx >= row.length) return { ok: false, msg: 'All sockets are full' };
    if (row[idx]) addBag(row[idx], 1);          // swap the old one back
    row[idx] = k;
    addBag(k, -1);
    setSockets(toolId, row);
    save();
    return { ok: true, msg: `Beset ${typesById[p.type].name} Lv${p.level}` };
  }

  function remove(toolId, idx) {
    const row = socketsOf(toolId);
    const k = row[idx];
    if (!k) return { ok: false, msg: 'Empty socket' };
    row[idx] = null;
    addBag(k, 1);
    setSockets(toolId, row);
    save();
    return { ok: true, msg: 'Removed' };
  }

  // Every magatama on a tool back to the bag (also those on sockets it lost)
  function removeAll(toolId) {
    const row = get().tools[toolId] || [];
    const n = row.filter(Boolean).length;
    if (!n) return { ok: false, msg: 'No magatama beset' };
    row.forEach(k => { if (k) addBag(k, 1); });
    delete get().tools[toolId];
    save();
    return { ok: true, msg: `Removed ${n}` };
  }

  // Fill empty sockets with the highest-level magatama in the bag
  // (`type` limits it to one type).
  function oneClick(toolId, type) {
    const row = socketsOf(toolId);
    let added = 0;
    for (let i = 0; i < row.length; i++) {
      if (row[i]) continue;
      const best = Object.keys(get().bag)
        .map(parse).filter(p => p && (!type || p.type === type) && count(key(p.type, p.level)) > 0)
        .sort((a, b) => b.level - a.level)[0];
      if (!best) break;
      const k = key(best.type, best.level);
      row[i] = k; addBag(k, -1); added++;
    }
    if (!added) return { ok: false, msg: !row.length ? 'This tool has no sockets' : row.every(Boolean) ? 'All sockets are full' : 'No magatama in the bag' };
    setSockets(toolId, row);
    save();
    return { ok: true, msg: `Beset ${added}` };
  }

  function combine(k, times = 1) {
    const p = parse(k);
    const need = DATA.combineCount;
    if (!p) return { ok: false, msg: 'Pick a magatama' };
    if (p.level >= DATA.maxLevel) return { ok: false, msg: 'Already max level' };
    const n = Math.min(Math.floor(count(k) / need), times === 'all' ? Infinity : Math.max(1, times));
    if (n < 1) return { ok: false, msg: `Need ${need} to combine` };
    addBag(k, -n * need);
    addBag(key(p.type, p.level + 1), n);
    save();
    return { ok: true, msg: `+${n} ${typesById[p.type].name} Lv${p.level + 1}` };
  }

  function split(k) {
    const p = parse(k);
    if (!p) return { ok: false, msg: 'Pick a magatama' };
    if (p.level <= 1) return { ok: false, msg: 'Lv1 cannot be split' };
    if (count(k) < 1) return { ok: false, msg: 'None left' };
    addBag(k, -1);
    addBag(key(p.type, p.level - 1), DATA.splitCount);
    save();
    return { ok: true, msg: `+${DATA.splitCount} ${typesById[p.type].name} Lv${p.level - 1}` };
  }

  /* ───────── Stat bonuses ───────── */
  const zero = () => ({ hp: 0, atk: 0, def: 0, nin: 0, res: 0 });
  const STATS = ['hp', 'atk', 'def', 'nin', 'res'];
  function bonusForPiece(toolId) {
    const out = zero();
    socketsOf(toolId).forEach(k => { const i = k && info(k); if (i) out[i.stat] += i.value; });
    return out;
  }
  // Magatama on every tool the shinobi wears
  function bonusForUnit(uid) {
    const out = zero();
    if (!uid || !G() || !G().equippedIds) return out;
    G().equippedIds(uid).forEach(id => {
      const b = bonusForPiece(id);
      STATS.forEach(k => { out[k] += b[k]; });
    });
    return out;
  }
  // Adds the bonus to a battle stats object ({ hp, maxHP, atk, def }).
  // With js/gear.js loaded this is Gear.applyToStats (tools + magatama);
  // Ninjutsu / Resistance stay as percentages on stats.magatama and are
  // applied to jutsu and ultimate damage (battle-combat.js calculateDamage).
  function applyToStats(stats, instance) {
    if (global.Gear) return global.Gear.applyToStats(stats, instance);
    if (!stats || !instance || !instance.uid) return stats;
    const b = bonusForUnit(instance.uid);
    if (!STATS.some(k => b[k])) return stats;
    b.nin = Math.min(b.nin, DATA.caps?.nin ?? 60);
    b.res = Math.min(b.res, DATA.caps?.res ?? 50);
    stats.hp = (Number(stats.hp) || 0) + b.hp;
    if ('maxHP' in stats) stats.maxHP = (Number(stats.maxHP) || 0) + b.hp;
    stats.atk = (Number(stats.atk) || 0) + b.atk;
    stats.def = (Number(stats.def) || 0) + b.def;
    stats.magatama = b;
    return stats;
  }

  global.Magatama = {
    STORAGE_KEY, MAX_SOCKETS,
    load, reload, get, data: () => DATA, types: () => DATA.types.slice(),
    key, parse, info, iconFor, valueOf, priceOf, count, socketsOf, fits,
    buy, beset, remove, removeAll, oneClick, combine, split,
    bonusForPiece, bonusForUnit, applyToStats, STATS
  };
})(window);
