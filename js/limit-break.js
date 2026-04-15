// js/limit-break.js
// Limit Break System - extends character capabilities beyond normal tier caps
// Load AFTER progression.js and resources.js

(function (global) {
  "use strict";

  let _limitBreakCosts = null;

  // Maximum limit break level per tier
  // At +5 levels per LB, 10 LBs = 50 levels (100 -> 150)
  const MAX_LIMIT_BREAK_LEVELS = {
    "6S": 10,
    "6SB": 10,
    "7S": 10,
    "7SL": 10,
    "8S": 10,
    "8SM": 10,
    "9S": 10,
    "9ST": 10,
    "10SO": 10
  };

  // Stat bonuses per limit break level (percentage increase)
  const LIMIT_BREAK_BONUS_PER_LEVEL = {
    hp: 0.02,      // 2% per level
    atk: 0.025,    // 2.5% per level
    def: 0.02,     // 2% per level
    speed: 0.015   // 1.5% per level
  };

  // Load limit break costs from JSON
  async function loadCosts() {
    if (_limitBreakCosts) return _limitBreakCosts;

    try {
      const res = await fetch("data/limit-break-costs.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _limitBreakCosts = data.tierCosts || {};
      return _limitBreakCosts;
    } catch (err) {
      console.error("[LimitBreak] Failed to load costs:", err);
      // Fallback to default costs
      _limitBreakCosts = {
        "6S": { limit_break_crystal: 1, ryo: 10000 },
        "6SB": { limit_break_crystal: 1, dupe_crystal: 1, ryo: 15000 },
        "7S": { limit_break_crystal: 2, ryo: 20000 },
        "7SL": { limit_break_crystal: 2, dupe_crystal: 1, ryo: 25000 },
        "8S": { limit_break_crystal: 3, ryo: 30000 },
        "8SM": { limit_break_crystal: 3, dupe_crystal: 2, ryo: 35000 },
        "9S": { limit_break_crystal: 4, ryo: 40000 },
        "9ST": { limit_break_crystal: 4, dupe_crystal: 3, ryo: 45000 },
        "10SO": { limit_break_crystal: 5, dupe_crystal: 5, ryo: 50000 }
      };
      return _limitBreakCosts;
    }
  }

  // Material costs per limit break level
  async function getLimitBreakCost(tierCode, currentLB, character) {
    const costs = await loadCosts();
    const baseCost = costs[tierCode] || { limit_break_crystal: 1, ryo: 10000 };

    // Multiply costs by current LB level + 1
    const multiplier = (currentLB || 0) + 1;
    const finalCost = {};
    for (const [mat, amt] of Object.entries(baseCost)) {
      finalCost[mat] = amt * multiplier;
    }

    return finalCost;
  }

  // Check if character can be limit broken
  async function canLimitBreak(inst, character) {
    if (!inst || !character) return false;
    if (!global.Progression) return false;

    // Bug #13 fix: Validate getTierBounds result before accessing properties
    const bounds = global.Progression.getTierBounds(character);
    if (!bounds) return false;

    const tier = inst.tierCode || bounds.minCode;
    const maxLB = MAX_LIMIT_BREAK_LEVELS[tier];

    // Can only limit break if at a tier that supports it
    if (!maxLB) return false;

    const currentLB = inst.limitBreakLevel || 0;

    // Check if not already at max limit break
    if (currentLB >= maxLB) return false;

    // CRITICAL: Can only limit break if character CANNOT awaken
    // If there's an awakening transformation available, must awaken first
    const canAwaken = await checkCanAwaken(inst, character, tier);
    if (canAwaken) {
      console.log(`[LimitBreak] ${character.name} cannot limit break - must awaken first`);
      return false;
    }

    // Must be at max level for current limit break level
    // Use extended cap if there are existing limit breaks
    let cap = global.Progression.levelCapForCode(tier);
    if (currentLB > 0) {
      cap = getExtendedLevelCap(tier, currentLB);
    }

    const level = Number(inst.level) || 1;
    if (level < cap) return false;

    return true;
  }

  // Helper: Check if character can awaken by checking awakening-transforms.json
  async function checkCanAwaken(inst, character, tier) {
    try {
      // Load awakening transforms
      const response = await fetch('data/awakening-transforms.json');
      if (!response.ok) return false;

      const transforms = await response.json();

      // Check if there's a transform for this character at this tier
      const hasTransform = transforms.some(t =>
        t.fromId === character.id && t.tier === tier
      );

      // If there's a transform and character is at max level for tier, can awaken
      if (hasTransform && global.Progression) {
        const cap = global.Progression.levelCapForCode(tier);
        const level = Number(inst.level) || 1;
        return level >= cap;
      }

      return false;
    } catch (err) {
      console.warn('[LimitBreak] Could not check awakening transforms:', err);
      return false;
    }
  }

  // Check if player has materials for limit break
  async function canAffordLimitBreak(inst, character) {
    const canLB = await canLimitBreak(inst, character);
    if (!canLB) return false;
    if (!global.Resources) return false;

    // Bug #13 fix: Validate getTierBounds result before accessing properties
    const bounds = global.Progression?.getTierBounds(character);
    const tier = inst.tierCode || bounds?.minCode || "6S";
    const currentLB = inst.limitBreakLevel || 0;
    const cost = await getLimitBreakCost(tier, currentLB, character);

    return global.Resources.canAfford(cost);
  }

  // Perform limit break
  async function performLimitBreak(inst, character) {
    if (!inst || !character) {
      return { ok: false, reason: "INVALID_INSTANCE_OR_CHARACTER" };
    }

    const canLB = await canLimitBreak(inst, character);
    if (!canLB) {
      return { ok: false, reason: "CANNOT_LIMIT_BREAK" };
    }

    if (!global.Resources) {
      return { ok: false, reason: "RESOURCES_NOT_INITIALIZED" };
    }

    const tier = inst.tierCode;
    const currentLB = inst.limitBreakLevel || 0;
    const cost = await getLimitBreakCost(tier, currentLB, character);

    // Check and spend materials
    const spendResult = global.Resources.spend(cost);
    if (!spendResult.ok) {
      return spendResult;
    }

    // Increase limit break level
    inst.limitBreakLevel = currentLB + 1;

    // Optionally increase level cap (each LB adds +1 to level cap)
    // This is stored on the instance for per-character tracking

    return {
      ok: true,
      limitBreakLevel: inst.limitBreakLevel,
      bonusStats: computeLimitBreakBonus(inst.limitBreakLevel)
    };
  }

  // Compute stat bonuses from limit breaks
  function computeLimitBreakBonus(limitBreakLevel) {
    const lb = Number(limitBreakLevel) || 0;
    if (lb <= 0) return { hp: 0, atk: 0, def: 0, speed: 0 };

    return {
      hp: lb * LIMIT_BREAK_BONUS_PER_LEVEL.hp,
      atk: lb * LIMIT_BREAK_BONUS_PER_LEVEL.atk,
      def: lb * LIMIT_BREAK_BONUS_PER_LEVEL.def,
      speed: lb * LIMIT_BREAK_BONUS_PER_LEVEL.speed
    };
  }

  // Apply limit break bonuses to stats
  function applyLimitBreakToStats(baseStats, limitBreakLevel) {
    const lb = Number(limitBreakLevel) || 0;
    if (lb <= 0) return baseStats;

    const bonus = computeLimitBreakBonus(lb);

    return {
      hp: Math.round(baseStats.hp * (1 + bonus.hp)),
      atk: Math.round(baseStats.atk * (1 + bonus.atk)),
      def: Math.round(baseStats.def * (1 + bonus.def)),
      speed: Math.round(baseStats.speed * (1 + bonus.speed))
    };
  }

  // Get max limit break level for a tier
  function getMaxLimitBreakLevel(tierCode) {
    return MAX_LIMIT_BREAK_LEVELS[tierCode] || 0;
  }

  // Get extended level cap (base cap + limit break bonus levels)
  function getExtendedLevelCap(tierCode, limitBreakLevel) {
    if (!global.Progression) return 100;

    const baseCap = global.Progression.levelCapForCode(tierCode);
    const lb = Number(limitBreakLevel) || 0;

    // Each limit break adds +5 levels to the cap (max 150 from base 100)
    return Math.min(baseCap + (lb * 5), 150);
  }

  // Public API
  global.LimitBreak = {
    loadCosts,
    canLimitBreak,
    canAffordLimitBreak,
    performLimitBreak,
    computeLimitBreakBonus,
    applyLimitBreakToStats,
    getLimitBreakCost,
    getMaxLimitBreakLevel,
    getExtendedLevelCap,
    MAX_LIMIT_BREAK_LEVELS,
    LIMIT_BREAK_BONUS_PER_LEVEL
  };

})(window);
