// js/lb-crystals.js
// Character Limit Break crystals (data/lb-crystals.json).
//
// Every crystal is two inventory items, <crystal id>_blue and <crystal id>_gold,
// stored in the Resources save (blazing_resources_v1) like any other material.
//
// Rules used by js/limit-break.js:
//  - A crystal counts only for units whose name is in its appliesTo list
//    (the same character, any version).
//  - Blue (5-star) crystals work at tiers 6S / 6SB; gold (6-star) crystals work
//    at every limit-break tier.
//  - A limit break still asks for N "limit_break_crystal". Matching character
//    crystals are spent first (blue before gold), and generic Limit Break
//    Crystals cover the rest, so saves that only hold generic crystals behave
//    exactly as before.
// Load after js/resources.js.

(function (global) {
  "use strict";

  const DATA_URL = "data/lb-crystals.json";
  const GENERIC_ID = "limit_break_crystal";
  const VARIANT_ORDER = ["blue", "gold"];

  let _doc = null;
  let _loading = null;
  let _items = new Map();   // itemId -> { itemId, variant, crystal }
  let _byName = new Map();  // character name -> [crystal]

  function itemName(crystal, variant, doc) {
    const v = doc.variants[variant] || {};
    const siblings = doc.crystals.filter(c => c.character === crystal.character);
    const no = siblings.length > 1 ? ` #${siblings.indexOf(crystal) + 1}` : "";
    return `${crystal.character} Crystal${no} (${v.label || variant} ${v.grade || ""}★)`.replace(" ★)", ")");
  }

  function index(doc) {
    _items = new Map();
    _byName = new Map();
    const types = {};
    for (const crystal of doc.crystals || []) {
      for (const name of crystal.appliesTo || [crystal.character]) {
        if (!_byName.has(name)) _byName.set(name, []);
        _byName.get(name).push(crystal);
      }
      for (const variant of VARIANT_ORDER) {
        if (!crystal[variant]) continue;
        const itemId = `${crystal.id}_${variant}`;
        const v = doc.variants[variant] || {};
        const entry = {
          itemId, variant, crystal,
          name: itemName(crystal, variant, doc),
          icon: crystal[variant],
          tiers: v.tiers || [],
          cost: (crystal.prices && crystal.prices[variant]) || doc.prices[variant] || {}
        };
        _items.set(itemId, entry);
        types[itemId] = {
          name: entry.name,
          desc: `Limit Break material for ${crystal.appliesTo.join(" / ")} only. ` +
                `Works at tiers ${(v.tiers || []).join(", ")}; used before generic Limit Break Crystals.`,
          icon: entry.icon,
          category: "scrolls",
          element: crystal.element.toLowerCase(),
          lbCrystal: true,
          hideWhenZero: true
        };
      }
    }
    if (global.Resources && global.Resources.registerMaterialTypes) {
      global.Resources.registerMaterialTypes(types);
    }
  }

  function load() {
    if (_doc) return Promise.resolve(_doc);
    if (_loading) return _loading;
    _loading = fetch(DATA_URL)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(doc => {
        doc.crystals = Array.isArray(doc.crystals) ? doc.crystals : [];
        doc.variants = doc.variants || {};
        doc.prices = doc.prices || {};
        _doc = doc;
        index(doc);
        global.dispatchEvent(new CustomEvent("lbcrystals:ready", { detail: { count: doc.crystals.length } }));
        return doc;
      })
      .catch(err => {
        console.error("[LBCrystals] Failed to load crystals:", err);
        _doc = { crystals: [], variants: {}, prices: {} };
        return _doc;
      })
      .finally(() => { _loading = null; });
    return _loading;
  }

  function isLBCrystal(itemId) { return _items.has(itemId); }
  function getItem(itemId) { return _items.get(itemId) || null; }
  function allItems() { return Array.from(_items.values()); }

  // Crystal items that may be spent on this character at this tier, in spend order.
  function eligibleItems(character, tier) {
    const name = character && character.name;
    const crystals = (name && _byName.get(name)) || [];
    const out = [];
    for (const variant of VARIANT_ORDER) {
      for (const crystal of crystals) {
        const it = _items.get(`${crystal.id}_${variant}`);
        if (it && it.tiers.includes(tier)) out.push(it);
      }
    }
    return out;
  }

  // Turn a cost with N generic crystals into the concrete items to spend.
  // Returns { ok, spend, specific:[{itemId,name,amount}], generic, needed, available }.
  function resolveCost(cost, character, tier) {
    const R = global.Resources;
    const spend = {};
    const needed = Number(cost && cost[GENERIC_ID]) || 0;
    for (const [id, amt] of Object.entries(cost || {})) {
      if (id !== GENERIC_ID) spend[id] = amt;
    }
    let left = needed;
    const specific = [];
    let available = 0;
    for (const it of eligibleItems(character, tier)) {
      const have = R ? R.get(it.itemId) : 0;
      available += have;
      if (left <= 0 || have <= 0) continue;
      const take = Math.min(have, left);
      spend[it.itemId] = take;
      specific.push({ itemId: it.itemId, name: it.name, amount: take });
      left -= take;
    }
    const genericHave = R ? R.get(GENERIC_ID) : 0;
    available += genericHave;
    const generic = left;
    if (generic > 0) spend[GENERIC_ID] = generic;
    const others = Object.entries(cost || {}).filter(([id]) => id !== GENERIC_ID);
    const ok = !!R && generic <= genericHave && others.every(([id, amt]) => R.has(id, amt));
    return { ok, spend, specific, generic, needed, available };
  }

  global.LBCrystals = {
    load, isLBCrystal, getItem, allItems, eligibleItems, resolveCost,
    get data() { return _doc; },
    GENERIC_ID
  };

  // Register item names/icons early so inventory and cost dialogs can label them.
  load();
})(window);
