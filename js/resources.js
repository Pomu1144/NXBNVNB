// js/resources.js
// Materials and Resources Inventory System
// Manages awakening materials, limit break materials, and other consumable items

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_resources_v1";

  // Material types and their default quantities
  const MATERIAL_TYPES = {
    // ========== RAMEN (EXP Items) - 25 Types (5 Elements × 5 Tiers) ==========
    // Heart Ramen - using actual ramen character portraits
    "ramen_heart_1star": { name: "1★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 500 EXP.", icon: "assets/characters/heart_915/portrait_1S.webp", category: "ramen", element: "heart", exp: 500 },
    "ramen_heart_2star": { name: "2★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 1,500 EXP.", icon: "assets/characters/heart_916/portrait_2S.webp", category: "ramen", element: "heart", exp: 1500 },
    "ramen_heart_3star": { name: "3★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 5,000 EXP.", icon: "assets/characters/heart_917/portrait_3S.webp", category: "ramen", element: "heart", exp: 5000 },
    "ramen_heart_4star": { name: "4★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 15,000 EXP.", icon: "assets/characters/heart_967/portrait_4S.webp", category: "ramen", element: "heart", exp: 15000 },
    "ramen_heart_5star": { name: "5★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 50,000 EXP.", icon: "assets/characters/heart_1071/portrait_5S.webp", category: "ramen", element: "heart", exp: 50000 },

    // Skill Ramen - using actual ramen character portraits
    "ramen_skill_1star": { name: "1★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 500 EXP.", icon: "assets/characters/skill_918/portrait_1S.webp", category: "ramen", element: "skill", exp: 500 },
    "ramen_skill_2star": { name: "2★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 1,500 EXP.", icon: "assets/characters/skill_919/portrait_2S.webp", category: "ramen", element: "skill", exp: 1500 },
    "ramen_skill_3star": { name: "3★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 5,000 EXP.", icon: "assets/characters/skill_920/portrait_3S.webp", category: "ramen", element: "skill", exp: 5000 },
    "ramen_skill_4star": { name: "4★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 15,000 EXP.", icon: "assets/characters/skill_968/portrait_4S.webp", category: "ramen", element: "skill", exp: 15000 },
    "ramen_skill_5star": { name: "5★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 50,000 EXP.", icon: "assets/characters/skill_1074/portrait_5S.webp", category: "ramen", element: "skill", exp: 50000 },

    // Body Ramen - using actual ramen character portraits
    "ramen_body_1star": { name: "1★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 500 EXP.", icon: "assets/characters/body_921/portrait_1S.webp", category: "ramen", element: "body", exp: 500 },
    "ramen_body_2star": { name: "2★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 1,500 EXP.", icon: "assets/characters/body_922/portrait_2S.webp", category: "ramen", element: "body", exp: 1500 },
    "ramen_body_3star": { name: "3★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 5,000 EXP.", icon: "assets/characters/body_923/portrait_3S.webp", category: "ramen", element: "body", exp: 5000 },
    "ramen_body_4star": { name: "4★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 15,000 EXP.", icon: "assets/characters/body_969/portrait_4S.webp", category: "ramen", element: "body", exp: 15000 },
    "ramen_body_5star": { name: "5★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 50,000 EXP.", icon: "assets/characters/body_1077/portrait_5S.webp", category: "ramen", element: "body", exp: 50000 },

    // Bravery Ramen - using actual ramen character portraits
    "ramen_bravery_1star": { name: "1★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 500 EXP.", icon: "assets/characters/bravery_924/portrait_1S.webp", category: "ramen", element: "bravery", exp: 500 },
    "ramen_bravery_2star": { name: "2★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 1,500 EXP.", icon: "assets/characters/bravery_925/portrait_2S.webp", category: "ramen", element: "bravery", exp: 1500 },
    "ramen_bravery_3star": { name: "3★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 5,000 EXP.", icon: "assets/characters/bravery_926/portrait_3S.webp", category: "ramen", element: "bravery", exp: 5000 },
    "ramen_bravery_4star": { name: "4★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 15,000 EXP.", icon: "assets/characters/bravery_970/portrait_4S.webp", category: "ramen", element: "bravery", exp: 15000 },
    "ramen_bravery_5star": { name: "5★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 50,000 EXP.", icon: "assets/characters/bravery_1080/portrait_5S.webp", category: "ramen", element: "bravery", exp: 50000 },

    // Wisdom Ramen - using actual ramen character portraits
    "ramen_wisdom_1star": { name: "1★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 500 EXP.", icon: "assets/characters/wisdom_927/portrait_1S.webp", category: "ramen", element: "wisdom", exp: 500 },
    "ramen_wisdom_2star": { name: "2★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 1,500 EXP.", icon: "assets/characters/wisdom_928/portrait_2S.webp", category: "ramen", element: "wisdom", exp: 1500 },
    "ramen_wisdom_3star": { name: "3★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 5,000 EXP.", icon: "assets/characters/wisdom_929/portrait_3S.webp", category: "ramen", element: "wisdom", exp: 5000 },
    "ramen_wisdom_4star": { name: "4★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 15,000 EXP.", icon: "assets/characters/wisdom_971/portrait_4S.webp", category: "ramen", element: "wisdom", exp: 15000 },
    "ramen_wisdom_5star": { name: "5★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 50,000 EXP.", icon: "assets/characters/wisdom_1083/portrait_5S.webp", category: "ramen", element: "wisdom", exp: 50000 },

    // ========== ENHANCEMENT ITEMS (Stat Boosts) ==========
    "health_boost": { name: "Health Boost \"Health and Endurance\"", desc: "Increases HP stat permanently by 100.", icon: "assets/items/health_boost.png", category: "enhancement", statBoost: { hp: 100 } },
    "attack_boost": { name: "Attack Boost \"Sphere of Strength\"", desc: "Increases ATK stat permanently by 50.", icon: "assets/items/attack_boost.png", category: "enhancement", statBoost: { atk: 50 } },
    "speed_boost": { name: "Speed Boost \"Sprint Sphere\"", desc: "Increases Speed stat permanently by 20.", icon: "assets/items/speed_boost.png", category: "enhancement", statBoost: { speed: 20 } },
    "speed_boost_large": { name: "Large Speed Boost \"Sprint Sphere\"", desc: "Increases Speed stat permanently by 40.", icon: "assets/items/speed_boost_large.png", category: "enhancement", statBoost: { speed: 40 } },

    // ========== AWAKENING MATERIALS ==========
    // The real Naruto Blazing awakening materials (element scrolls ★1-★4,
    // Blazing Awakening beads ★4/★5, Book of Victor, Awakening Charm, special
    // tools and character beads) are loaded from data/materials.json at
    // startup (see loadCatalog) and merged in here with category "awakening".

    // 7★+ awakening materials (the 6SB→7S… tier table still uses these)
    "awakening_stone_6": { name: "6★ Awakening Stone", desc: "Generic material for ★7 and higher awakenings.", icon: "assets/items/scroll_6star.png", category: "awakening" },

    // Retired generic materials: saved quantities are converted to element
    // scrolls on load and new grants are converted on add (see LEGACY_CONVERT).
    "awakening_stone_3": { name: "3★ Awakening Stone", desc: "Retired: converted to ★2 element Awakening Scrolls.", icon: "assets/items/scroll_3star.png", category: "legacy" },
    "awakening_stone_4": { name: "4★ Awakening Stone", desc: "Retired: converted to ★3 element Awakening Scrolls.", icon: "assets/items/scroll_4star.png", category: "legacy" },
    "awakening_stone_5": { name: "5★ Awakening Stone", desc: "Retired: converted to ★4 element Awakening Scrolls.", icon: "assets/items/scroll_5star.png", category: "legacy" },

    // ========== LIMIT BREAK MATERIALS ==========
    // Element Crystals
    "crystal_heart": { name: "Heart Crystal", desc: "Heart element limit break material.", icon: "assets/items/crystal_heart.png", category: "scrolls", element: "heart" },
    "crystal_skill": { name: "Skill Crystal", desc: "Skill element limit break material.", icon: "assets/items/crystal_skill.png", category: "scrolls", element: "skill" },
    "crystal_body": { name: "Body Crystal", desc: "Body element limit break material.", icon: "assets/items/crystal_body.png", category: "scrolls", element: "body" },
    "crystal_bravery": { name: "Bravery Crystal", desc: "Bravery element limit break material.", icon: "assets/items/crystal_bravery.png", category: "scrolls", element: "bravery" },
    "crystal_wisdom": { name: "Wisdom Crystal", desc: "Wisdom element limit break material.", icon: "assets/items/crystal_wisdom.png", category: "scrolls", element: "wisdom" },

    "limit_break_crystal": { name: "Limit Break Crystal", desc: "Breaks level limits for max-tier characters", icon: "assets/items/lb_crystal.png", category: "scrolls" },
    "dupe_crystal": { name: "Dupe Crystal", desc: "Obtained from duplicate characters", icon: "assets/items/dupe_crystal.png", category: "scrolls" },

    // ========== SCROLLS ==========
    "scroll_body": { name: "Body Scroll", desc: "Body element awakening material", icon: "assets/items/scroll_body.png", category: "scrolls", element: "body" },
    "scroll_skill": { name: "Skill Scroll", desc: "Skill element awakening material", icon: "assets/items/scroll_skill.png", category: "scrolls", element: "skill" },
    "scroll_bravery": { name: "Bravery Scroll", desc: "Bravery element awakening material", icon: "assets/items/scroll_bravery.png", category: "scrolls", element: "bravery" },
    "scroll_wisdom": { name: "Wisdom Scroll", desc: "Wisdom element awakening material", icon: "assets/items/scroll_wisdom.png", category: "scrolls", element: "wisdom" },
    "scroll_heart": { name: "Heart Scroll", desc: "Heart element awakening material", icon: "assets/items/scroll_heart.png", category: "scrolls", element: "heart" },
    "scroll_basic": { name: "Basic Scroll", desc: "Retired: converted to ★1 element Awakening Scrolls.", icon: "assets/icons/materials/scroll_basic.png", category: "legacy" },
    "scroll_advanced": { name: "Advanced Scroll", desc: "Retired: converted to ★2 element Awakening Scrolls.", icon: "assets/icons/materials/scroll_advanced.png", category: "legacy" },

    // ========== SPECIAL ITEMS ==========
    "acquisition_stone": { name: "Acquisition Stone", desc: "Can be exchanged for specific characters in the shop.", icon: "assets/items/acq_stone.png", category: "scrolls" },
    "granny_coin": { name: "Granny Cat Coin", desc: "Special currency for Granny Cat Shop.", icon: "assets/items/granny_coin.png", category: "scrolls" },
    "character_stone": { name: "Character Stone", desc: "Generic material for ★7 and higher awakenings.", icon: "assets/items/character_stone.png", category: "awakening" },

    // ========== CURRENCIES ==========
    "ryo": { name: "Ryo", desc: "Standard currency for various operations", icon: "assets/items/ryo.png", category: "currency" },
    "ninja_pearls": { name: "Ninja Pearls", desc: "Premium currency for summons and special items", icon: "assets/items/pearls.png", category: "currency" },
    "shinobites": { name: "Shinobites", desc: "Gacha currency for character summons", icon: "assets/items/shinobites.png", category: "currency" }
  };

  let _resources = {};

  // Legacy/alias material ids used by older data files → canonical ids
  const ID_ALIASES = {
    "pearls": "ninja_pearls",
    "ramen_1star": "ramen_heart_1star",
    "ramen_2star": "ramen_heart_2star",
    "ramen_3star": "ramen_heart_3star",
    "scroll_3star": "awakening_stone_3",
    "scroll_4star": "awakening_stone_4",
    "scroll_5star": "awakening_stone_5",
    "scroll_6star": "awakening_stone_6"
  };

  // Retired generic (element-less) awakening materials → the real element
  // Awakening Scroll of this rarity. Saved balances are split evenly across the
  // five elements once; later grants (shop, gift codes, old mail) rotate the
  // element so every element keeps getting scrolls.
  const ELEMENTS = ["heart", "skill", "body", "bravery", "wisdom"];
  const LEGACY_CONVERT = {
    "scroll_basic": 1,
    "scroll_1star": 1,
    "scroll_2star": 1,
    "scroll_advanced": 2,
    "awakening_stone_3": 2,
    "awakening_stone_4": 3,
    "awakening_stone_5": 4
  };
  const ROTATE_KEY = "blazing_resources_legacy_rotation";

  function normalizeId(materialId) {
    return ID_ALIASES[materialId] || materialId;
  }

  function nextRotatedElement() {
    let i = 0;
    try { i = Number(localStorage.getItem(ROTATE_KEY)) || 0; } catch (_) { /* ignore */ }
    try { localStorage.setItem(ROTATE_KEY, String(i + 1)); } catch (_) { /* ignore */ }
    return ELEMENTS[((i % ELEMENTS.length) + ELEMENTS.length) % ELEMENTS.length];
  }

  // Split `qty` of a retired material into { book_<el>_<rarity>: n }
  function convertLegacy(id, qty, rotate) {
    const rarity = LEGACY_CONVERT[id];
    const out = {};
    if (!rarity || !(qty > 0)) return out;
    if (rotate) {
      for (let k = 0; k < qty; k++) {
        const key = `book_${nextRotatedElement()}_${rarity}`;
        out[key] = (out[key] || 0) + 1;
      }
      return out;
    }
    const each = Math.floor(qty / ELEMENTS.length);
    let rest = qty - each * ELEMENTS.length;
    ELEMENTS.forEach(el => {
      const n = each + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      if (n > 0) out[`book_${el}_${rarity}`] = n;
    });
    return out;
  }

  // ---------- Persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = JSON.parse(raw);
      _resources = (data && typeof data === 'object') ? data : {};
    } catch {
      _resources = {};
    }
    // Initialize default quantities if not present
    initializeDefaults();
    migrateAliases();
    migrateLegacyMaterials();
  }

  // Old saves: convert retired generic materials into element scrolls
  function migrateLegacyMaterials() {
    let changed = false;
    for (const id of Object.keys(LEGACY_CONVERT)) {
      if (!(id in _resources)) continue;
      const qty = Number(_resources[id]) || 0;
      for (const [to, n] of Object.entries(convertLegacy(id, qty, false))) {
        _resources[to] = (Number(_resources[to]) || 0) + n;
      }
      delete _resources[id];
      changed = true;
    }
    if (changed) save();
  }

  // Credit any balances stored under legacy ids to their canonical id
  function migrateAliases() {
    let changed = false;
    for (const [legacy, canonical] of Object.entries(ID_ALIASES)) {
      if (legacy in _resources) {
        const qty = Number(_resources[legacy]) || 0;
        if (qty > 0) {
          _resources[canonical] = (Number(_resources[canonical]) || 0) + qty;
        }
        delete _resources[legacy];
        changed = true;
      }
    }
    if (changed) save();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_resources));
    } catch (err) {
      console.error("[Resources] Failed to save:", err);
    }
  }

  function initializeDefaults() {
    // Give starter materials if this is first load
    if (Object.keys(_resources).length === 0) {
      _resources = {
        // Ramen - Heart
        "ramen_heart_1star": 5, "ramen_heart_2star": 3, "ramen_heart_3star": 2, "ramen_heart_4star": 1, "ramen_heart_5star": 0,
        // Ramen - Skill
        "ramen_skill_1star": 5, "ramen_skill_2star": 3, "ramen_skill_3star": 2, "ramen_skill_4star": 1, "ramen_skill_5star": 0,
        // Ramen - Body
        "ramen_body_1star": 5, "ramen_body_2star": 3, "ramen_body_3star": 2, "ramen_body_4star": 1, "ramen_body_5star": 0,
        // Ramen - Bravery
        "ramen_bravery_1star": 5, "ramen_bravery_2star": 3, "ramen_bravery_3star": 2, "ramen_bravery_4star": 1, "ramen_bravery_5star": 0,
        // Ramen - Wisdom
        "ramen_wisdom_1star": 5, "ramen_wisdom_2star": 3, "ramen_wisdom_3star": 2, "ramen_wisdom_4star": 1, "ramen_wisdom_5star": 0,

        // Enhancement Items
        "health_boost": 3, "attack_boost": 3, "speed_boost": 2, "speed_boost_large": 1,

        // Awakening Books - Heart
        "book_heart_1": 10, "book_heart_2": 8, "book_heart_3": 5, "book_heart_4": 3,
        // Awakening Books - Skill
        "book_skill_1": 10, "book_skill_2": 8, "book_skill_3": 5, "book_skill_4": 3,
        // Awakening Books - Body
        "book_body_1": 10, "book_body_2": 8, "book_body_3": 5, "book_body_4": 3,
        // Awakening Books - Bravery
        "book_bravery_1": 10, "book_bravery_2": 8, "book_bravery_3": 5, "book_bravery_4": 3,
        // Awakening Books - Wisdom
        "book_wisdom_1": 10, "book_wisdom_2": 8, "book_wisdom_3": 5, "book_wisdom_4": 3,

        // Special Awakening Materials
        "book_victor_5": 2, "book_victor_6": 1, "awakening_charm": 1,

        // Blazing Awakening beads (★4 / ★5 roped)
        "beads_heart_4": 3, "beads_skill_4": 3, "beads_body_4": 3, "beads_bravery_4": 3, "beads_wisdom_4": 3,
        "beads_heart_5": 1, "beads_skill_5": 1, "beads_body_5": 1, "beads_bravery_5": 1, "beads_wisdom_5": 1,

        // 7★+ awakening materials
        "awakening_stone_6": 5,

        // Limit Break Crystals
        "crystal_heart": 8, "crystal_skill": 8, "crystal_body": 8, "crystal_bravery": 8, "crystal_wisdom": 8,
        "limit_break_crystal": 5, "dupe_crystal": 10,

        // Scrolls
        "scroll_body": 15, "scroll_skill": 15, "scroll_bravery": 15, "scroll_wisdom": 15, "scroll_heart": 15,

        // Special Items
        "acquisition_stone": 2, "granny_coin": 10, "character_stone": 15,

        // Currencies
        "ryo": 0, "ninja_pearls": 0, "shinobites": 0
      };
      save();
    }
  }

  // ---------- Read ----------
  function get(materialId) {
    return Number(_resources[normalizeId(materialId)]) || 0;
  }

  function getAll() {
    return { ..._resources };
  }

  function has(materialId, amount = 1) {
    return get(materialId) >= amount;
  }

  function canAfford(costs) {
    // costs = { materialId: amount, ... }
    if (!costs || typeof costs !== 'object') return true;
    for (const [id, amt] of Object.entries(costs)) {
      if (!has(id, amt)) return false;
    }
    return true;
  }

  // ---------- Write ----------
  function add(materialId, amount = 1) {
    materialId = normalizeId(materialId);
    if (LEGACY_CONVERT[materialId] && Number(amount) > 0) {
      let last = 0;
      for (const [to, n] of Object.entries(convertLegacy(materialId, Math.floor(Number(amount)), true))) {
        last = add(to, n);
      }
      return last;
    }
    const current = get(materialId);
    _resources[materialId] = Math.max(0, current + (Number(amount) || 0));
    save();
    notifyTopBar(materialId);
    return _resources[materialId];
  }

  function subtract(materialId, amount = 1) {
    materialId = normalizeId(materialId);
    const current = get(materialId);
    const newAmount = Math.max(0, current - (Number(amount) || 0));
    _resources[materialId] = newAmount;
    save();
    notifyTopBar(materialId);
    return newAmount;
  }

  function spend(costs) {
    // costs = { materialId: amount, ... }
    if (!canAfford(costs)) {
      return { ok: false, reason: "INSUFFICIENT_MATERIALS" };
    }

    for (const [id, amt] of Object.entries(costs)) {
      subtract(id, amt);
    }

    return { ok: true };
  }

  function set(materialId, amount) {
    materialId = normalizeId(materialId);
    _resources[materialId] = Math.max(0, Number(amount) || 0);
    save();
    notifyTopBar(materialId);
    return _resources[materialId];
  }

  // ---------- TopBar Integration ----------
  function notifyTopBar(materialId) {
    // Auto-refresh TopBar when currencies change
    if (['ryo', 'ninja_pearls', 'shinobites'].includes(materialId)) {
      if (global.TopBar && typeof global.TopBar.refresh === 'function') {
        global.TopBar.refresh();
      }
    }
  }

  // ---------- Material Info ----------
  function getMaterialInfo(materialId) {
    return MATERIAL_TYPES[normalizeId(materialId)] || { name: materialId, desc: "Unknown material" };
  }

  // ---------- Awakening material catalog (data/materials.json) ----------
  const CATALOG_URL = "data/materials.json";
  let _catalog = [];

  function mergeCatalog(list) {
    _catalog = Array.isArray(list) ? list : [];
    _catalog.forEach((m, i) => {
      if (!m || !m.id) return;
      MATERIAL_TYPES[m.id] = {
        name: m.shortName || m.name,
        fullName: m.name,
        desc: m.description || "",
        obtain: m.obtain || null,
        icon: m.icon,
        category: "awakening",
        group: m.kind,
        element: m.element || null,
        orb: m.orb || null,
        rarity: m.rarity || null,
        cardNo: m.cardNo || null,
        wikiTitle: m.wikiTitle || null,
        order: i
      };
    });
  }

  const ready = (typeof fetch === "function"
    ? fetch(CATALOG_URL).then(r => (r.ok ? r.json() : { materials: [] }))
    : Promise.resolve({ materials: [] }))
    .then(data => { mergeCatalog((data && data.materials) || []); return _catalog; })
    .catch(err => { console.warn("[Resources] Material catalog unavailable:", err); return _catalog; });

  function getCatalog() {
    return _catalog.slice();
  }

  function getAllMaterialTypes() {
    return { ...MATERIAL_TYPES };
  }

  // Add item types defined in data files (e.g. character Limit Break crystals
  // from data/lb-crystals.json). Existing ids are never overwritten.
  function registerMaterialTypes(types) {
    let added = 0;
    for (const [id, info] of Object.entries(types || {})) {
      if (!MATERIAL_TYPES[id]) { MATERIAL_TYPES[id] = info; added++; }
    }
    return added;
  }

  function getItemsByCategory(category) {
    const items = [];
    for (const [id, info] of Object.entries(MATERIAL_TYPES)) {
      // hideWhenZero: large data-driven sets only show once owned
      if (info.category === category && !(info.hideWhenZero && get(id) <= 0)) {
        items.push({
          id,
          name: info.name,
          icon: info.icon || 'assets/items/placeholder.png',
          description: info.desc,
          quantity: get(id),
          ...info
        });
      }
    }
    // Catalog materials first (wiki order), then the rest in definition order
    return items
      .map((it, i) => ({ it, k: Number.isFinite(it.order) ? it.order : 100000 + i }))
      .sort((a, b) => a.k - b.k)
      .map(x => x.it);
  }

  // Initialize on load
  load();

  // Public API
  global.Resources = {
    get,
    getAll,
    has,
    canAfford,
    add,
    subtract,
    spend,
    set,
    getMaterialInfo,
    getAllMaterialTypes,
    getItemsByCategory,
    getCatalog,
    ready,
    registerMaterialTypes,
    MATERIAL_TYPES
  };

})(window);
