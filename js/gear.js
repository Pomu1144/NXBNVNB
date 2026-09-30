// js/gear.js — Gear (Naruto Online style equipment) on every shinobi.
//
// The five Tool slots are fixed gear pieces:
//   Tool 1 helmet   → HP          Tool 4 scroll   → +% jutsu / ultimate damage
//   Tool 2 weapon   → ATK         Tool 5 necklace → -% jutsu / ultimate damage taken
//   Tool 3 armor    → DEF
// Every piece has a tier (0 Green · 1 Blue · 2 Purple · 3 Orange · 4 Red ·
// 5 Red Shiny) and a level 1-120. Each tier caps the level (20/40/…/120);
// at the cap the piece is promoted with 3 upgrade scrolls (gear_scroll_2…6,
// js/resources.js) plus Ryo, which keeps the level and raises the cap.
//
// Save (localStorage "blazing_gear_v1"):
//   { units: { [uid]: { helmet: { tier, level }, … } } }
// A missing piece is Green Lv1. Magatama socketed in the pieces live in
// js/magatama.js (keyed by uid + slot); totalFor() adds both, and
// applyToStats() is what battle units and the stat panels use.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'blazing_gear_v1';
  const SLOTS = ['helmet', 'weapon', 'armor', 'scroll', 'necklace'];
  const TOOL_SLOTS = ['equipment1', 'equipment2', 'equipment3', 'equipment4', 'equipment5'];
  const MAX_LEVEL = 120;

  const TIERS = [
    { id: 'green',  label: 'Green',     rank: 'Genin',      cap: 20,  mult: 1.0, art: 'green',  color: '#5dae55' },
    { id: 'blue',   label: 'Blue',      rank: 'Chunin',     cap: 40,  mult: 1.1, art: 'blue',   color: '#4b8fe0' },
    { id: 'purple', label: 'Purple',    rank: 'Jonin',      cap: 60,  mult: 1.2, art: 'purple', color: '#a266e0' },
    { id: 'orange', label: 'Orange',    rank: 'Kage',       cap: 80,  mult: 1.3, art: 'orange', color: '#e8902e' },
    { id: 'red',    label: 'Red',       rank: 'Super Kage', cap: 100, mult: 1.4, art: 'red',    color: '#e0453c' },
    { id: 'shiny',  label: 'Red Shiny', rank: 'Super Kage', cap: 120, mult: 1.5, art: 'red',    color: '#f3c552', shiny: true }
  ];
  // Promotion out of tier i (Green→Blue is PROMOTE[0])
  const PROMOTE = [
    { scroll: 'gear_scroll_2', count: 3, ryo: 20000 },
    { scroll: 'gear_scroll_3', count: 3, ryo: 60000 },
    { scroll: 'gear_scroll_4', count: 3, ryo: 150000 },
    { scroll: 'gear_scroll_5', count: 3, ryo: 300000 },
    { scroll: 'gear_scroll_6', count: 3, ryo: 600000 }
  ];
  const PIECES = {
    helmet:   { kind: 'Helmet',   tool: 'equipment1', stat: 'hp',  label: 'HP',        per: 60,   magatama: 'life' },
    weapon:   { kind: 'Weapon',   tool: 'equipment2', stat: 'atk', label: 'ATK',       per: 3.5,  magatama: 'attack' },
    armor:    { kind: 'Armor',    tool: 'equipment3', stat: 'def', label: 'DEF',       per: 2,    magatama: 'defense' },
    scroll:   { kind: 'Scroll',   tool: 'equipment4', stat: 'nin', label: 'Jutsu DMG', per: 0.1,  magatama: 'ninjutsu',   unit: '%' },
    necklace: { kind: 'Necklace', tool: 'equipment5', stat: 'res', label: 'Jutsu RES', per: 0.08, magatama: 'resistance', unit: '%' }
  };
  // Item names per art set, in SLOTS order
  const NAMES = {
    green:  ['Goggles', 'Dart', 'Chainmail', 'Handbook', 'Finger Ring'],
    blue:   ['Forehead Protector', 'Kunai', 'Chainmail', 'Handbook', 'Finger Ring'],
    purple: ['Mask', 'Blade', 'Vest', 'Scroll', 'Necklace'],
    orange: ['Hat', 'Blade', 'Cloak', 'Scroll', 'Necklace'],
    red:    ['Mask', 'Scythe', 'Armor', 'Scroll', 'Prayer Beads']
  };
  const STATS = ['hp', 'atk', 'def', 'nin', 'res'];
  const zero = () => ({ hp: 0, atk: 0, def: 0, nin: 0, res: 0 });

  /* ───────── Numbers ───────── */
  const clampTier = (t) => Math.max(0, Math.min(TIERS.length - 1, Math.floor(Number(t) || 0)));
  const capOf = (tier) => TIERS[clampTier(tier)].cap;
  // Ryo to go from `level` to `level + 1`
  function levelCost(level) {
    const l = Math.max(1, Math.floor(Number(level) || 1));
    return Math.round((200 + 40 * Math.pow(l, 1.6)) / 10) * 10;
  }
  function statValue(slot, tier, level) {
    const p = PIECES[slot];
    if (!p) return 0;
    const raw = p.per * Math.max(0, Number(level) || 0) * TIERS[clampTier(tier)].mult;
    return p.unit ? Math.round(raw * 100) / 100 : Math.round(raw);
  }
  function fmtStat(slot, v) {
    const p = PIECES[slot];
    if (p && p.unit) return `${Math.round(v * 100) / 100}%`;
    return Math.round(Number(v) || 0).toLocaleString();
  }
  function nameOf(slot, tier) {
    const t = TIERS[clampTier(tier)];
    return `${t.rank} ${NAMES[t.art][SLOTS.indexOf(slot)] || ''}`.trim();
  }
  const iconOf = (slot, tier) => `assets/gear/${TIERS[clampTier(tier)].art}_${slot}.webp`;
  const scrollIcon = (id) => `assets/gear/scroll_${String(id).replace(/\D/g, '')}.webp`;

  /* ───────── State ───────── */
  let state = null;
  function read() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { s = null; }
    const units = {};
    Object.entries((s && s.units) || {}).forEach(([uid, g]) => {
      if (!g || typeof g !== 'object') return;
      const row = {};
      SLOTS.forEach(slot => {
        const p = g[slot];
        if (!p) return;
        const tier = clampTier(p.tier);
        const level = Math.max(1, Math.min(capOf(tier), Math.floor(Number(p.level) || 1)));
        if (tier || level > 1) row[slot] = { tier, level };
      });
      if (Object.keys(row).length) units[uid] = row;
    });
    return { units };
  }
  function get() { if (!state) state = read(); return state; }
  function reload() { state = read(); return state; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get())); } catch (e) { console.error('[Gear] save failed', e); }
    try { global.dispatchEvent(new CustomEvent('gear:change')); } catch (e) { /* old browsers */ }
  }

  function piece(uid, slot) {
    const p = (get().units[uid] || {})[slot];
    return p ? { tier: p.tier, level: p.level } : { tier: 0, level: 1 };
  }
  function setPiece(uid, slot, p) {
    const s = get();
    const row = s.units[uid] || (s.units[uid] = {});
    if (!p.tier && p.level <= 1) delete row[slot]; else row[slot] = { tier: p.tier, level: p.level };
    if (!Object.keys(row).length) delete s.units[uid];
  }
  function unitGear(uid) {
    const out = {};
    SLOTS.forEach(slot => { out[slot] = piece(uid, slot); });
    return out;
  }

  // Everything the UI shows for one piece
  function info(uid, slot) {
    const p = piece(uid, slot);
    const t = TIERS[p.tier];
    const def = PIECES[slot];
    const atCap = p.level >= t.cap;
    const isMax = atCap && p.tier >= TIERS.length - 1;
    const promo = !isMax && atCap ? PROMOTE[p.tier] : null;
    return {
      slot, uid, tier: p.tier, level: p.level, cap: t.cap, tierInfo: t, shiny: !!t.shiny,
      name: nameOf(slot, p.tier), kind: def.kind, icon: iconOf(slot, p.tier),
      stat: def.stat, statLabel: def.label, unit: def.unit || '', magatama: def.magatama,
      value: statValue(slot, p.tier, p.level),
      next: atCap ? null : statValue(slot, p.tier, p.level + 1),
      cost: atCap ? 0 : levelCost(p.level),
      atCap, isMax,
      promote: promo && {
        scroll: promo.scroll, count: promo.count, ryo: promo.ryo,
        have: R() ? R().get(promo.scroll) : 0,
        toTier: p.tier + 1, toInfo: TIERS[p.tier + 1],
        toName: nameOf(slot, p.tier + 1), toIcon: iconOf(slot, p.tier + 1)
      }
    };
  }

  /* ───────── Actions (return { ok, msg, … }) ───────── */
  const R = () => global.Resources;
  const ryo = () => (R() ? R().get('ryo') : 0);

  // How many levels `budget` Ryo buys, up to `max` levels and the tier cap
  function plan(uid, slot, max = Infinity, budget = ryo()) {
    const p = piece(uid, slot);
    const cap = capOf(p.tier);
    let level = p.level, cost = 0, levels = 0;
    while (level < cap && levels < max) {
      const c = levelCost(level);
      if (cost + c > budget) break;
      cost += c; level++; levels++;
    }
    return { levels, cost, level };
  }

  function strengthen(uid, slot, times = 1) {
    if (!uid || !PIECES[slot]) return { ok: false, msg: 'Pick a gear piece' };
    const p = piece(uid, slot);
    if (p.level >= capOf(p.tier)) {
      return { ok: false, msg: p.tier >= TIERS.length - 1 ? 'Max level' : 'Promote to raise the cap' };
    }
    const pl = plan(uid, slot, times === 'auto' ? Infinity : Math.max(1, Math.floor(times) || 1));
    if (!pl.levels) return { ok: false, msg: 'Not enough Ryo' };
    R().subtract('ryo', pl.cost);
    setPiece(uid, slot, { tier: p.tier, level: pl.level });
    save();
    return { ok: true, levels: pl.levels, spent: pl.cost, level: pl.level, msg: `${nameOf(slot, p.tier)} Lv${pl.level}` };
  }
  const auto = (uid, slot) => strengthen(uid, slot, 'auto');

  // Level every piece evenly (lowest level first) with the Ryo on hand
  function autoAll(uid) {
    if (!uid) return { ok: false, msg: 'Pick a shinobi' };
    let spent = 0, levels = 0;
    for (;;) {
      const open = SLOTS.map(slot => ({ slot, p: piece(uid, slot) }))
        .filter(x => x.p.level < capOf(x.p.tier) && levelCost(x.p.level) <= ryo())
        .sort((a, b) => a.p.level - b.p.level);
      if (!open.length) break;
      const { slot, p } = open[0];
      const c = levelCost(p.level);
      R().subtract('ryo', c);
      setPiece(uid, slot, { tier: p.tier, level: p.level + 1 });
      spent += c; levels++;
    }
    if (!levels) {
      const capped = SLOTS.every(slot => { const p = piece(uid, slot); return p.level >= capOf(p.tier); });
      return { ok: false, msg: capped ? 'All at cap' : 'Not enough Ryo' };
    }
    save();
    return { ok: true, levels, spent, msg: `+${levels} Lv` };
  }

  function promote(uid, slot) {
    if (!uid || !PIECES[slot]) return { ok: false, msg: 'Pick a gear piece' };
    const p = piece(uid, slot);
    if (p.tier >= TIERS.length - 1) return { ok: false, msg: 'Max tier' };
    if (p.level < capOf(p.tier)) return { ok: false, msg: `Reach Lv${capOf(p.tier)} first` };
    const need = PROMOTE[p.tier];
    const res = R();
    if (!res || res.get(need.scroll) < need.count) return { ok: false, msg: 'Not enough scrolls' };
    if (res.get('ryo') < need.ryo) return { ok: false, msg: 'Not enough Ryo' };
    res.subtract(need.scroll, need.count);
    res.subtract('ryo', need.ryo);
    setPiece(uid, slot, { tier: p.tier + 1, level: p.level });
    save();
    return { ok: true, tier: p.tier + 1, msg: `${nameOf(slot, p.tier + 1)}` };
  }

  /* ───────── Stat bonuses ───────── */
  function bonusFor(uid) {
    const out = zero();
    if (!uid) return out;
    SLOTS.forEach(slot => {
      const p = piece(uid, slot);
      out[PIECES[slot].stat] += statValue(slot, p.tier, p.level);
    });
    out.nin = Math.round(out.nin * 100) / 100;
    out.res = Math.round(out.res * 100) / 100;
    return out;
  }
  const caps = () => {
    const d = global.Magatama && global.Magatama.data ? global.Magatama.data() : null;
    return { nin: (d && d.caps && d.caps.nin) || 60, res: (d && d.caps && d.caps.res) || 50 };
  };
  // Gear + socketed magatama, with the Ninjutsu / Resistance caps applied
  function totalFor(uid) {
    const g = bonusFor(uid);
    const m = global.Magatama && global.Magatama.bonusForUnit ? global.Magatama.bonusForUnit(uid) : zero();
    const out = zero();
    STATS.forEach(k => { out[k] = (g[k] || 0) + (m[k] || 0); });
    const c = caps();
    out.nin = Math.min(Math.round(out.nin * 100) / 100, c.nin);
    out.res = Math.min(Math.round(out.res * 100) / 100, c.res);
    return out;
  }
  // Adds gear + magatama to a battle stats object ({ hp, maxHP, atk, def }).
  // Ninjutsu / Resistance stay as percentages on stats.magatama, which
  // battle-combat.js calculateDamage applies to jutsu and ultimate damage.
  function applyToStats(stats, instance) {
    if (!stats || !instance || !instance.uid) return stats;
    const b = totalFor(instance.uid);
    stats.hp = (Number(stats.hp) || 0) + b.hp;
    if ('maxHP' in stats) stats.maxHP = (Number(stats.maxHP) || 0) + b.hp;
    stats.atk = (Number(stats.atk) || 0) + b.atk;
    stats.def = (Number(stats.def) || 0) + b.def;
    stats.magatama = b;
    stats.gear = bonusFor(instance.uid);
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
    STORAGE_KEY, SLOTS, TOOL_SLOTS, TIERS, PROMOTE, PIECES, NAMES, MAX_LEVEL, STATS,
    get, reload, piece, unitGear, info, nameOf, iconOf, scrollIcon, capOf,
    levelCost, statValue, fmtStat, plan,
    strengthen, auto, autoAll, promote,
    bonusFor, totalFor, applyToStats, migrateInventory
  };
})(window);
