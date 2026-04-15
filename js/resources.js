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
    "ramen_heart_1star": { name: "1★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 500 EXP.", icon: "assets/characters/heart_915/portrait_1S.png", category: "ramen", element: "heart", exp: 500 },
    "ramen_heart_2star": { name: "2★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 1,500 EXP.", icon: "assets/characters/heart_916/portrait_2S.png", category: "ramen", element: "heart", exp: 1500 },
    "ramen_heart_3star": { name: "3★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 5,000 EXP.", icon: "assets/characters/heart_917/portrait_3S.png", category: "ramen", element: "heart", exp: 5000 },
    "ramen_heart_4star": { name: "4★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 15,000 EXP.", icon: "assets/characters/heart_967/portrait_4S.png", category: "ramen", element: "heart", exp: 15000 },
    "ramen_heart_5star": { name: "5★ Heart Ichiraku Ramen", desc: "Heart element ramen. Provides 50,000 EXP.", icon: "assets/characters/heart_1071/portrait_5S.png", category: "ramen", element: "heart", exp: 50000 },

    // Skill Ramen - using actual ramen character portraits
    "ramen_skill_1star": { name: "1★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 500 EXP.", icon: "assets/characters/skill_918/portrait_1S.png", category: "ramen", element: "skill", exp: 500 },
    "ramen_skill_2star": { name: "2★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 1,500 EXP.", icon: "assets/characters/skill_919/portrait_2S.png", category: "ramen", element: "skill", exp: 1500 },
    "ramen_skill_3star": { name: "3★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 5,000 EXP.", icon: "assets/characters/skill_920/portrait_3S.png", category: "ramen", element: "skill", exp: 5000 },
    "ramen_skill_4star": { name: "4★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 15,000 EXP.", icon: "assets/characters/skill_968/portrait_4S.png", category: "ramen", element: "skill", exp: 15000 },
    "ramen_skill_5star": { name: "5★ Skill Ichiraku Ramen", desc: "Skill element ramen. Provides 50,000 EXP.", icon: "assets/characters/skill_1074/portrait_5S.png", category: "ramen", element: "skill", exp: 50000 },

    // Body Ramen - using actual ramen character portraits
    "ramen_body_1star": { name: "1★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 500 EXP.", icon: "assets/characters/body_921/portrait_1S.png", category: "ramen", element: "body", exp: 500 },
    "ramen_body_2star": { name: "2★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 1,500 EXP.", icon: "assets/characters/body_922/portrait_2S.png", category: "ramen", element: "body", exp: 1500 },
    "ramen_body_3star": { name: "3★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 5,000 EXP.", icon: "assets/characters/body_923/portrait_3S.png", category: "ramen", element: "body", exp: 5000 },
    "ramen_body_4star": { name: "4★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 15,000 EXP.", icon: "assets/characters/body_969/portrait_4S.png", category: "ramen", element: "body", exp: 15000 },
    "ramen_body_5star": { name: "5★ Body Ichiraku Ramen", desc: "Body element ramen. Provides 50,000 EXP.", icon: "assets/characters/body_1077/portrait_5S.png", category: "ramen", element: "body", exp: 50000 },

    // Bravery Ramen - using actual ramen character portraits
    "ramen_bravery_1star": { name: "1★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 500 EXP.", icon: "assets/characters/bravery_924/portrait_1S.png", category: "ramen", element: "bravery", exp: 500 },
    "ramen_bravery_2star": { name: "2★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 1,500 EXP.", icon: "assets/characters/bravery_925/portrait_2S.png", category: "ramen", element: "bravery", exp: 1500 },
    "ramen_bravery_3star": { name: "3★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 5,000 EXP.", icon: "assets/characters/bravery_926/portrait_3S.png", category: "ramen", element: "bravery", exp: 5000 },
    "ramen_bravery_4star": { name: "4★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 15,000 EXP.", icon: "assets/characters/bravery_970/portrait_4S.png", category: "ramen", element: "bravery", exp: 15000 },
    "ramen_bravery_5star": { name: "5★ Bravery Ichiraku Ramen", desc: "Bravery element ramen. Provides 50,000 EXP.", icon: "assets/characters/bravery_1080/portrait_5S.png", category: "ramen", element: "bravery", exp: 50000 },

    // Wisdom Ramen - using actual ramen character portraits
    "ramen_wisdom_1star": { name: "1★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 500 EXP.", icon: "assets/characters/wisdom_927/portrait_1S.png", category: "ramen", element: "wisdom", exp: 500 },
    "ramen_wisdom_2star": { name: "2★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 1,500 EXP.", icon: "assets/characters/wisdom_928/portrait_2S.png", category: "ramen", element: "wisdom", exp: 1500 },
    "ramen_wisdom_3star": { name: "3★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 5,000 EXP.", icon: "assets/characters/wisdom_929/portrait_3S.png", category: "ramen", element: "wisdom", exp: 5000 },
    "ramen_wisdom_4star": { name: "4★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 15,000 EXP.", icon: "assets/characters/wisdom_971/portrait_4S.png", category: "ramen", element: "wisdom", exp: 15000 },
    "ramen_wisdom_5star": { name: "5★ Wisdom Ichiraku Ramen", desc: "Wisdom element ramen. Provides 50,000 EXP.", icon: "assets/characters/wisdom_1083/portrait_5S.png", category: "ramen", element: "wisdom", exp: 50000 },

    // ========== ENHANCEMENT ITEMS (Stat Boosts) ==========
    "health_boost": { name: "Health Boost \"Health and Endurance\"", desc: "Increases HP stat permanently by 100.", icon: "assets/items/health_boost.png", category: "enhancement", statBoost: { hp: 100 } },
    "attack_boost": { name: "Attack Boost \"Sphere of Strength\"", desc: "Increases ATK stat permanently by 50.", icon: "assets/items/attack_boost.png", category: "enhancement", statBoost: { atk: 50 } },
    "speed_boost": { name: "Speed Boost \"Sprint Sphere\"", desc: "Increases Speed stat permanently by 20.", icon: "assets/items/speed_boost.png", category: "enhancement", statBoost: { speed: 20 } },
    "speed_boost_large": { name: "Large Speed Boost \"Sprint Sphere\"", desc: "Increases Speed stat permanently by 40.", icon: "assets/items/speed_boost_large.png", category: "enhancement", statBoost: { speed: 40 } },

    // ========== AWAKENING MATERIALS ==========
    // Heart Awakening Books
    "book_heart_1": { name: "★1 Heart Book", desc: "Heart element awakening material for ★1 characters.", icon: "assets/items/book_heart_1.png", category: "awakening", element: "heart" },
    "book_heart_2": { name: "★2 Heart Book", desc: "Heart element awakening material for ★2 characters.", icon: "assets/items/book_heart_2.png", category: "awakening", element: "heart" },
    "book_heart_3": { name: "★3 Heart Book", desc: "Heart element awakening material for ★3 characters.", icon: "assets/items/book_heart_3.png", category: "awakening", element: "heart" },
    "book_heart_4": { name: "★4 Heart Book", desc: "Heart element awakening material for ★4 characters.", icon: "assets/items/book_heart_4.png", category: "awakening", element: "heart" },

    // Skill Awakening Books
    "book_skill_1": { name: "★1 Skill Book", desc: "Skill element awakening material for ★1 characters.", icon: "assets/items/book_skill_1.png", category: "awakening", element: "skill" },
    "book_skill_2": { name: "★2 Skill Book", desc: "Skill element awakening material for ★2 characters.", icon: "assets/items/book_skill_2.png", category: "awakening", element: "skill" },
    "book_skill_3": { name: "★3 Skill Book", desc: "Skill element awakening material for ★3 characters.", icon: "assets/items/book_skill_3.png", category: "awakening", element: "skill" },
    "book_skill_4": { name: "★4 Skill Book", desc: "Skill element awakening material for ★4 characters.", icon: "assets/items/book_skill_4.png", category: "awakening", element: "skill" },

    // Body Awakening Books
    "book_body_1": { name: "★1 Body Book", desc: "Body element awakening material for ★1 characters.", icon: "assets/items/book_body_1.png", category: "awakening", element: "body" },
    "book_body_2": { name: "★2 Body Book", desc: "Body element awakening material for ★2 characters.", icon: "assets/items/book_body_2.png", category: "awakening", element: "body" },
    "book_body_3": { name: "★3 Body Book", desc: "Body element awakening material for ★3 characters.", icon: "assets/items/book_body_3.png", category: "awakening", element: "body" },
    "book_body_4": { name: "★4 Body Book", desc: "Body element awakening material for ★4 characters.", icon: "assets/items/book_body_4.png", category: "awakening", element: "body" },

    // Bravery Awakening Books
    "book_bravery_1": { name: "★1 Bravery Book", desc: "Bravery element awakening material for ★1 characters.", icon: "assets/items/book_bravery_1.png", category: "awakening", element: "bravery" },
    "book_bravery_2": { name: "★2 Bravery Book", desc: "Bravery element awakening material for ★2 characters.", icon: "assets/items/book_bravery_2.png", category: "awakening", element: "bravery" },
    "book_bravery_3": { name: "★3 Bravery Book", desc: "Bravery element awakening material for ★3 characters.", icon: "assets/items/book_bravery_3.png", category: "awakening", element: "bravery" },
    "book_bravery_4": { name: "★4 Bravery Book", desc: "Bravery element awakening material for ★4 characters.", icon: "assets/items/book_bravery_4.png", category: "awakening", element: "bravery" },

    // Wisdom Awakening Books
    "book_wisdom_1": { name: "★1 Wisdom Book", desc: "Wisdom element awakening material for ★1 characters.", icon: "assets/items/book_wisdom_1.png", category: "awakening", element: "wisdom" },
    "book_wisdom_2": { name: "★2 Wisdom Book", desc: "Wisdom element awakening material for ★2 characters.", icon: "assets/items/book_wisdom_2.png", category: "awakening", element: "wisdom" },
    "book_wisdom_3": { name: "★3 Wisdom Book", desc: "Wisdom element awakening material for ★3 characters.", icon: "assets/items/book_wisdom_3.png", category: "awakening", element: "wisdom" },
    "book_wisdom_4": { name: "★4 Wisdom Book", desc: "Wisdom element awakening material for ★4 characters.", icon: "assets/items/book_wisdom_4.png", category: "awakening", element: "wisdom" },

    // Special Awakening Materials
    "book_victor_5": { name: "★5 Book of Victor", desc: "Rare awakening material for ★5 characters.", icon: "assets/items/book_victor_5.png", category: "awakening" },
    "book_victor_6": { name: "★6 Book of Victor", desc: "Ultra-rare awakening material for ★6 characters.", icon: "assets/items/book_victor_6.png", category: "awakening" },
    "awakening_charm": { name: "Awakening Charm \"Talisman of Legends\"", desc: "Legendary charm used for special awakenings.", icon: "assets/items/awakening_charm.png", category: "awakening" },

    // Legacy Awakening Materials (for compatibility)
    "awakening_stone_3": { name: "3★ Awakening Stone", desc: "Used to awaken 3★ characters", icon: "assets/items/scroll_3star.png", category: "awakening" },
    "awakening_stone_4": { name: "4★ Awakening Stone", desc: "Used to awaken 4★ characters", icon: "assets/items/scroll_4star.png", category: "awakening" },
    "awakening_stone_5": { name: "5★ Awakening Stone", desc: "Used to awaken 5★ characters", icon: "assets/items/scroll_5star.png", category: "awakening" },
    "awakening_stone_6": { name: "6★ Awakening Stone", desc: "Used to awaken 6★ characters", icon: "assets/items/scroll_6star.png", category: "awakening" },

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
    "scroll_basic": { name: "Basic Scroll", desc: "Common awakening material", icon: "assets/icons/materials/scroll_basic.png", category: "scrolls" },
    "scroll_advanced": { name: "Advanced Scroll", desc: "Rare awakening material", icon: "assets/icons/materials/scroll_advanced.png", category: "scrolls" },

    // ========== SPECIAL ITEMS ==========
    "acquisition_stone": { name: "Acquisition Stone", desc: "Can be exchanged for specific characters in the shop.", icon: "assets/items/acq_stone.png", category: "scrolls" },
    "granny_coin": { name: "Granny Cat Coin", desc: "Special currency for Granny Cat Shop.", icon: "assets/items/granny_coin.png", category: "scrolls" },
    "character_stone": { name: "Character Stone", desc: "Character-specific awakening material", icon: "assets/items/character_stone.png", category: "awakening" },

    // ========== CURRENCIES ==========
    "ryo": { name: "Ryo", desc: "Standard currency for various operations", icon: "assets/items/ryo.png", category: "currency" },
    "ninja_pearls": { name: "Ninja Pearls", desc: "Premium currency for summons and special items", icon: "assets/items/pearls.png", category: "currency" },
    "shinobites": { name: "Shinobites", desc: "Gacha currency for character summons", icon: "assets/items/shinobites.png", category: "currency" }
  };

  let _resources = {};

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

        // Legacy Awakening Materials
        "awakening_stone_3": 20, "awakening_stone_4": 15, "awakening_stone_5": 10, "awakening_stone_6": 5,

        // Limit Break Crystals
        "crystal_heart": 8, "crystal_skill": 8, "crystal_body": 8, "crystal_bravery": 8, "crystal_wisdom": 8,
        "limit_break_crystal": 5, "dupe_crystal": 10,

        // Scrolls
        "scroll_body": 15, "scroll_skill": 15, "scroll_bravery": 15, "scroll_wisdom": 15, "scroll_heart": 15,
        "scroll_basic": 20, "scroll_advanced": 10,

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
    return Number(_resources[materialId]) || 0;
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
    const current = get(materialId);
    _resources[materialId] = Math.max(0, current + (Number(amount) || 0));
    save();
    notifyTopBar(materialId);
    return _resources[materialId];
  }

  function subtract(materialId, amount = 1) {
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
    return MATERIAL_TYPES[materialId] || { name: materialId, desc: "Unknown material" };
  }

  function getAllMaterialTypes() {
    return { ...MATERIAL_TYPES };
  }

  function getItemsByCategory(category) {
    const items = [];
    for (const [id, info] of Object.entries(MATERIAL_TYPES)) {
      if (info.category === category) {
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
    return items;
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
    MATERIAL_TYPES
  };

})(window);
