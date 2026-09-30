// js/magatama.js — Magatama (Naruto Online "Beset Magatama") core.
//
// Each tool card has 5 sockets. Magatama are Attack (ATK), Life (HP),
// Defense (DEF), Ninjutsu (+% jutsu/ultimate damage dealt) or Resistance
// (-% jutsu/ultimate damage taken) jewels, levels 1-10, each level its own
// shape (data/magatama.json). Four of one level combine into one of the
// next; splitting reverses that.
//
// Save (localStorage "blazing_magatama_v1"):
//   { bag: { "attack:3": 2, ... }, sockets: { [cardId]: ["life:4", null, ...] } }
// Socketed stats apply to any unit that has the card in a Tools slot
// (equipment1..5): tools.js stat panel, characters.js, and battle stats.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'blazing_magatama_v1';
  const TOOL_SLOTS = ['equipment1', 'equipment2', 'equipment3', 'equipment4', 'equipment5'];

  // Same numbers as data/magatama.json so battle stats never wait on a fetch.
  // load() refreshes from the JSON (tests keep the two in sync).
  let DATA = {
    socketsPerTool: 5, combineCount: 4, splitCount: 4, maxLevel: 10,
    types: [
      {id: 'attack', name: 'Attack', color: '#e0563a', stat: 'atk', statLabel: 'ATK', values: [4, 10, 15, 21, 28, 36, 46, 58, 72, 90]},
      {id: 'life', name: 'Life', color: '#3fb46a', stat: 'hp', statLabel: 'HP', values: [10, 25, 38, 53, 70, 90, 115, 145, 180, 225]},
      {id: 'defense', name: 'Defense', color: '#e0a126', stat: 'def', statLabel: 'DEF', values: [3, 6, 9, 13, 17, 22, 28, 35, 43, 54]},
      {id: 'ninjutsu', name: 'Ninjutsu', color: '#9d62e0', stat: 'nin', statLabel: 'Jutsu DMG', unit: '%', values: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]},
      {id: 'resistance', name: 'Resistance', color: '#3aa6e0', stat: 'res', statLabel: 'Jutsu RES', unit: '%', values: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]}
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
    Object.entries(s.bag || {}).forEach(([k, n]) => { n = Math.floor(Number(n) || 0); if (parse(k) && n > 0) bag[k] = n; });
    const sockets = {};
    Object.entries(s.sockets || {}).forEach(([card, arr]) => {
      if (!Array.isArray(arr)) return;
      const row = new Array(DATA.socketsPerTool).fill(null).map((_, i) => (parse(arr[i]) ? arr[i] : null));
      if (row.some(Boolean)) sockets[card] = row;
    });
    return { bag, sockets };
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
  function socketsOf(cardId) {
    const row = get().sockets[cardId];
    return row ? row.slice() : new Array(DATA.socketsPerTool).fill(null);
  }
  function setSockets(cardId, row) {
    const s = get();
    if (row.some(Boolean)) s.sockets[cardId] = row; else delete s.sockets[cardId];
  }

  /* ───────── Which types a tool accepts ─────────
     Naruto Online ties each magatama type to a gear slot. Here the card's
     type decides: Attack cards take Attack / Ninjutsu / Life, Defense cards
     Defense / Resistance / Life, Skill cards Ninjutsu / Attack / Resistance,
     others take any. */
  const FIT = {
    Attack: ['attack', 'ninjutsu', 'life'],
    Defense: ['defense', 'resistance', 'life'],
    Skill: ['ninjutsu', 'attack', 'resistance']
  };
  function fits(card) {
    const f = card && FIT[card.cardType];
    return f ? f.slice() : DATA.types.map(t => t.id);
  }

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

  function beset(cardId, k, idx, card) {
    const p = parse(k);
    if (!cardId || !p) return { ok: false, msg: 'Pick a magatama' };
    if (count(k) < 1) return { ok: false, msg: 'None left' };
    if (card && !fits(card).includes(p.type)) return { ok: false, msg: `${typesById[p.type].name} does not fit this tool` };
    const row = socketsOf(cardId);
    if (idx == null || idx < 0) idx = row.indexOf(null);
    if (idx < 0) return { ok: false, msg: 'All 5 sockets are full' };
    if (row[idx]) addBag(row[idx], 1);          // swap the old one back
    row[idx] = k;
    addBag(k, -1);
    setSockets(cardId, row);
    save();
    return { ok: true, msg: `Beset ${typesById[p.type].name} Lv${p.level}` };
  }

  function remove(cardId, idx) {
    const row = socketsOf(cardId);
    const k = row[idx];
    if (!k) return { ok: false, msg: 'Empty socket' };
    row[idx] = null;
    addBag(k, 1);
    setSockets(cardId, row);
    save();
    return { ok: true, msg: 'Removed' };
  }

  function removeAll(cardId) {
    const row = socketsOf(cardId);
    const n = row.filter(Boolean).length;
    if (!n) return { ok: false, msg: 'No magatama beset' };
    row.forEach(k => { if (k) addBag(k, 1); });
    setSockets(cardId, row.map(() => null));
    save();
    return { ok: true, msg: `Removed ${n}` };
  }

  // Fill empty sockets with the highest-level fitting magatama in the bag.
  function oneClick(cardId, card) {
    const row = socketsOf(cardId);
    const allowed = fits(card);
    let added = 0;
    for (let i = 0; i < row.length; i++) {
      if (row[i]) continue;
      const best = Object.keys(get().bag)
        .map(parse).filter(p => p && allowed.includes(p.type) && count(key(p.type, p.level)) > 0)
        .sort((a, b) => b.level - a.level || allowed.indexOf(a.type) - allowed.indexOf(b.type))[0];
      if (!best) break;
      const k = key(best.type, best.level);
      row[i] = k; addBag(k, -1); added++;
    }
    if (!added) return { ok: false, msg: row.every(Boolean) ? 'All 5 sockets are full' : 'No fitting magatama' };
    setSockets(cardId, row);
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
  function bonusForCard(cardId) {
    const out = zero();
    const row = get().sockets[cardId];
    if (!row) return out;
    row.forEach(k => { const i = k && info(k); if (i) out[i.stat] += i.value; });
    return out;
  }
  function bonusForEquipped(equippedJutsu) {
    const out = zero();
    if (!equippedJutsu) return out;
    const seen = new Set();
    TOOL_SLOTS.forEach(slot => {
      const id = equippedJutsu[slot];
      if (!id || seen.has(id)) return;
      seen.add(id);
      const b = bonusForCard(id);
      STATS.forEach(k => { out[k] += b[k]; });
    });
    return out;
  }
  // Adds the bonus to a battle stats object ({ hp, maxHP, atk, def }).
  // Ninjutsu / Resistance stay as percentages on stats.magatama and are
  // applied to jutsu and ultimate damage (battle-combat.js calculateDamage).
  function applyToStats(stats, instance) {
    if (!stats || !instance) return stats;
    const b = bonusForEquipped(instance.equippedJutsu);
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
    STORAGE_KEY, TOOL_SLOTS,
    load, reload, get, data: () => DATA, types: () => DATA.types.slice(),
    key, parse, info, iconFor, valueOf, priceOf, count, socketsOf, fits,
    buy, beset, remove, removeAll, oneClick, combine, split,
    bonusForCard, bonusForEquipped, applyToStats, STATS
  };
})(window);
