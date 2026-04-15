// js/progression.js
// Tier-aware progression: level, tiers (4S..10SO), curved stat growth, lore-normalized power.
// Exposes global `Progression`.
// Load BEFORE characters.js.

(function (global) {
  "use strict";

  /* =============================
   * Tier codes and configuration
   * ============================= */
  // Order from lowest to highest
  const TIER_ORDER = [
    "1S","2S","3S","4S","5S","6S","6SB","7S","7SL","8S","8SM","9S","9ST","10SO"
  ];

  // Default level caps per tier (tune as you like)
  const TIER_CAPS = {
    "1S": 20, "2S": 30, "3S": 40, "4S": 55, "5S": 70,
    "6S": 100, "6SB": 100,
    "7S": 100, "7SL": 100,
    "8S": 110, "8SM": 120,
    "9S": 125, "9ST": 130,
    "10SO": 150
  };

  // Baseline progress (0..1) across the TOTAL spectrum (absolute),
  // used to derive a relative fraction between a character's min↔max bands.
  const TIER_PROGRESS_ABS = {
    "1S": 0.03, "2S": 0.06, "3S": 0.10, "4S": 0.25, "5S": 0.45,
    "6S": 0.70, "6SB": 0.76,
    "7S": 0.82, "7SL": 0.87,
    "8S": 0.91, "8SM": 0.94,
    "9S": 0.97, "9ST": 0.985,
    "10SO": 1.00
  };

  // Defaults if a character doesn't specify growth curves or power weights
  const DEFAULT_GROWTH = 1.0; // linear
  const DEFAULT_WEIGHTS = { hp:0.35, atk:0.35, def:0.15, speed:0.15 };

  /* ===============
   * Small helpers
   * =============== */
  const clamp = (v,min,max) => Math.max(min, Math.min(max, v));
  const idxOf = (code) => Math.max(0, TIER_ORDER.indexOf(code));
  const validCode = (code) => TIER_ORDER.includes(code) ? code : null;

  // Best-effort: infer a tier code from numeric rarity (3→"3S", etc.)
  function codeFromRarity(r) {
    const n = Number(r)||3;
    if (n <= 3) return "3S";
    if (n === 4) return "4S";
    if (n === 5) return "5S";
    if (n >= 6) return "6S";
    return "3S";
  }

  function levelCapForCode(code) {
    return TIER_CAPS[code] ?? 40;
  }

  // Curved interpolation base→max with exponent k (k>1 = slower early, faster late)
  function statAtLevel(base, max, level, cap, k = 1.0) {
    const L = clamp(level, 1, cap);
    const t = (cap <= 1) ? 1 : (L - 1) / (cap - 1); // 0..1
    const kk = Math.max(0.001, Number(k) || 1.0);
    const eased = Math.pow(t, kk);
    return Math.round(base + (max - base) * eased);
  }

  // Power proxy for lore normalization
  function computePower(stats, weights = DEFAULT_WEIGHTS) {
    const spdTerm = Math.sqrt(Math.max(0, stats.speed || 0));
    return (
      (stats.hp    || 0) * (weights.hp    ?? 0.35) +
      (stats.atk   || 0) * (weights.atk   ?? 0.35) +
      (stats.def   || 0) * (weights.def   ?? 0.15) +
      (spdTerm          ) * (weights.speed ?? 0.15) * 30
    );
  }

  // Resolve a character's min/max tier codes
  function getTierBounds(c) {
    // Prefer explicit codes if given
    let minCode = validCode(c?.starMinCode) || null;
    let maxCode = validCode(c?.starMaxCode) || null;

    // Fall back to numeric min/max if present
    if (!minCode && Number.isFinite(Number(c?.starMin))) {
      minCode = codeFromRarity(c.starMin);
    }
    if (!maxCode && Number.isFinite(Number(c?.starMax))) {
      maxCode = codeFromRarity(c.starMax);
    }

    // Fall back to rarity
    if (!minCode) minCode = codeFromRarity(c?.rarity);
    if (!maxCode) {
      // If evolvableStars is provided, push max up by that many steps
      if (Number.isFinite(Number(c?.evolvableStars))) {
        const steps = Math.max(0, Number(c.evolvableStars));
        const newIdx = clamp(idxOf(minCode) + steps, 0, TIER_ORDER.length-1);
        maxCode = TIER_ORDER[newIdx];
      } else {
        // Default: cap at 5S unless told otherwise
        maxCode = "5S";
      }
    }

    // Sanity: ensure order
    const iMin = idxOf(minCode);
    const iMax = Math.max(iMin, idxOf(maxCode));
    return { minCode, maxCode: TIER_ORDER[iMax] };
  }

  // Convert absolute progress (0..1 across all tiers) into relative 0..1 within min↔max
  function relativeProgress(code, minCode, maxCode) {
    const pMin = TIER_PROGRESS_ABS[minCode] ?? 0.0;
    const pMax = TIER_PROGRESS_ABS[maxCode] ?? 1.0;
    const pCur = TIER_PROGRESS_ABS[code]    ?? pMin;
    if (pMax <= pMin + 1e-9) return 1.0;
    return clamp((pCur - pMin) / (pMax - pMin), 0, 1);
  }

  /* ==========================================
   * Core: compute stats at (level, tierCode)
   *  - statsBase (Lv1 at min tier)
   *  - statsMax  (LvCap at max tierCode)
   *  - growthCurve (number or per-stat object)
   *  - powerRank + powerWeights (optional lore normalization)
   *  - extendedCap: optional parameter for limit break extended cap
   * ========================================== */
  function computeEffectiveStatsLoreTier(c, level, tierCode, { normalize = true, extendedCap = null } = {}) {
    const { minCode, maxCode } = getTierBounds(c);
    const tier = validCode(tierCode) || minCode;

    // Guard tier within bounds
    const i = idxOf(tier);
    const iMin = idxOf(minCode);
    const iMax = idxOf(maxCode);
    const clampedTier = TIER_ORDER[clamp(i, iMin, iMax)];

    const baseCap = levelCapForCode(clampedTier);
    const cap = extendedCap || baseCap; // Use extended cap if provided (for limit breaks)
    const base = c?.statsBase || c?.stats || {};
    const max  = c?.statsMax  || null;
    const gc   = c?.growthCurve;

    // If no max provided: treat base as fixed
    if (!max) {
      const fixed = {
        hp: base.hp|0, atk: base.atk|0, def: base.def|0,
        speed: base.speed ?? base.spd ?? 0
      };
      return { stats: fixed, power: computePower(fixed, c?.powerWeights), cap, tier: clampedTier, minCode, maxCode, scaleApplied: 1 };
    }

    // Determine how far this tier should be toward the character-specific max
    const fracToMax = relativeProgress(clampedTier, minCode, maxCode); // 0..1

    // Star target at this tier: Base → Max lerp by fracToMax
    const target = {
      hp:     Math.round((base.hp||0)     + (max.hp||0     - (base.hp||0))     * fracToMax),
      atk:    Math.round((base.atk||0)    + (max.atk||0    - (base.atk||0))    * fracToMax),
      def:    Math.round((base.def||0)    + (max.def||0    - (base.def||0))    * fracToMax),
      speed:  Math.round(((base.speed??base.spd)||0) + (((max.speed??max.spd)||0) - ((base.speed??base.spd)||0)) * fracToMax)
    };

    // Per-stat growth
    const curveFor = (prop) => (typeof gc === 'object' ? Number(gc[prop]) || DEFAULT_GROWTH : (Number(gc) || DEFAULT_GROWTH));
    const L = clamp(Number(level)||1, 1, cap);

    let eff = {
      hp:     statAtLevel(base.hp||0,     target.hp||0,     L, cap, curveFor('hp')),
      atk:    statAtLevel(base.atk||0,    target.atk||0,    L, cap, curveFor('atk')),
      def:    statAtLevel(base.def||0,    target.def||0,    L, cap, curveFor('def')),
      speed:  statAtLevel((base.speed??base.spd)||0,  target.speed||0,  L, cap, curveFor('speed'))
    };

    // Lore normalization (mild)
    const targetRank = Number(c?.powerRank) || 0;
    if (normalize && targetRank > 0) {
      // Within this tier, bias slightly late-game
      const t = (cap <= 1) ? 1 : (L - 1) / (cap - 1);
      // Adjust expectation based on absolute position of this tier (toward max)
      const absFrac = TIER_PROGRESS_ABS[clampedTier] ?? 1.0;
      const expected = targetRank * (0.5 + 0.5 * absFrac) * Math.pow(t, 1.08);

      const weights = c?.powerWeights || DEFAULT_WEIGHTS;
      const current = computePower(eff, weights);
      const scale = current > 0 ? (expected / current) : 1;
      const clampedScale = clamp(scale, 0.85, 1.15);

      eff = {
        hp:     Math.round(eff.hp     * clampedScale),
        atk:    Math.round(eff.atk    * clampedScale),
        def:    Math.round(eff.def    * clampedScale),
        speed:  Math.round(eff.speed  * clampedScale)
      };
      return { stats: eff, power: computePower(eff, weights), cap, tier: clampedTier, minCode, maxCode, scaleApplied: clampedScale };
    }

    return { stats: eff, power: computePower(eff, c?.powerWeights || DEFAULT_WEIGHTS), cap, tier: clampedTier, minCode, maxCode, scaleApplied: 1 };
  }

  /* ======================================
   * Inventory-safe tier & level operations
   * ====================================== */
  function clampInstanceToTier(inst, character) {
    // Safety check: ensure we have valid objects
    if (!inst || typeof inst !== 'object') {
      console.error('clampInstanceToTier: Invalid instance', inst);
      return inst;
    }
    if (!character || typeof character !== 'object') {
      console.error('clampInstanceToTier: Invalid character', character);
      return inst;
    }

    const { minCode, maxCode } = getTierBounds(character);
    // Prefer code stored on instance; else derive from number
    let tier = validCode(inst.tierCode) || validCode(inst.starCode);
    if (!tier && Number.isFinite(Number(inst.stars))) {
      tier = codeFromRarity(inst.stars);
    }
    if (!tier) tier = minCode;

    // Clamp tier between min and max
    const i = idxOf(tier);
    const clamped = TIER_ORDER[clamp(i, idxOf(minCode), idxOf(maxCode))];

    // Clamp level to cap for this tier
    const cap = levelCapForCode(clamped);
    const lvl = clamp(Number(inst.level)||1, 1, cap);

    inst.tierCode = clamped;
    inst.level = lvl;
    return inst;
  }

  function canPromoteTier(inst, character) {
    if (!inst || !character) return false;
    const { minCode, maxCode } = getTierBounds(character);
    const curIdx = idxOf(validCode(inst.tierCode) || minCode);
    return curIdx < idxOf(maxCode);
  }

  function promoteTier(inst, character, mode = "reset") {
    // Safety check
    if (!inst || typeof inst !== 'object') {
      console.error('promoteTier: Invalid instance', inst);
      return { ok: false, reason: "INVALID_INSTANCE" };
    }
    if (!character || typeof character !== 'object') {
      console.error('promoteTier: Invalid character', character);
      return { ok: false, reason: "INVALID_CHARACTER" };
    }

    const { minCode, maxCode } = getTierBounds(character);
    const cur = validCode(inst.tierCode) || minCode;
    const iCur = idxOf(cur);
    const iMax = idxOf(maxCode);

    if (iCur >= iMax) {
      return { ok: false, reason: "MAX_TIER_REACHED", tier: cur, cap: levelCapForCode(cur) };
    }

    const next = TIER_ORDER[iCur + 1];
    inst.tierCode = next;
    const cap = levelCapForCode(next);

    // FIXED: Default to "reset" mode (level returns to 1 on star-up)
    if (mode === "keep") {
      inst.level = clamp(Number(inst.level)||1, 1, cap);
    } else {
      inst.level = 1; // Reset to level 1 on promotion
    }

    return { ok: true, tier: next, cap, level: inst.level };
  }

  function levelUp(inst, character, amount = 1) {
    // Safety check
    if (!inst || !character) {
      console.error('levelUp: Invalid instance or character', inst, character);
      return { level: 1, cap: 40 };
    }

    clampInstanceToTier(inst, character);
    const cap = levelCapForCode(inst.tierCode);
    inst.level = clamp((Number(inst.level)||1) + (Number(amount)||0), 1, cap);
    return { level: inst.level, cap };
  }

/* ======================================
 * Awaken check (alias for canPromoteTier)
 * ====================================== */
function canAwaken(inst, character) {
  if (!inst || !character) return false;

  const tier = inst.tierCode || getTierBounds(character).minCode;
  const cap = levelCapForCode(tier);
  const level = Number(inst.level) || 1;

  // Must be at max level AND able to promote to next tier
  return level >= cap && canPromoteTier(inst, character);
}

/* ==========================================
 * Apply Fusion Legacy Bonus
 * Applies cumulative stat bonus from fusion chains
 * ========================================== */
async function applyFusionLegacyBonus(stats, instance) {
  if (!instance || !stats) return stats;
  if (!instance.fusionLegacySteps || !instance.fusionPath) return stats;

  try {
    // Load fusion data to get path configuration
    const response = await fetch('data/fusions.json');
    if (!response.ok) return stats;

    const fusionsData = await response.json();
    const pathConfig = fusionsData.fusionPaths?.[instance.fusionPath];

    if (!pathConfig) return stats;

    // Apply multiplicative bonus
    const bonusMultiplier = 1 + (instance.fusionLegacySteps * pathConfig.bonusPerStep);

    return {
      hp: Math.round(stats.hp * bonusMultiplier),
      atk: Math.round(stats.atk * bonusMultiplier),
      def: Math.round(stats.def * bonusMultiplier),
      speed: Math.round(stats.speed * bonusMultiplier)
    };
  } catch (error) {
    console.error('[Progression] Failed to apply fusion legacy bonus:', error);
    return stats;
  }
}

/* ============
 * Public API
 * ============ */
const Progression = {
  // constants
  TIER_ORDER, TIER_CAPS, TIER_PROGRESS_ABS,

  // utilities
  validCode, idxOf, levelCapForCode, getTierBounds,

  // power
  computePower,

  // compute
  computeEffectiveStatsLoreTier,
  applyFusionLegacyBonus,

  // inventory-safe ops
  clampInstanceToTier,
  canPromoteTier,
  canAwaken,  // ADD THIS LINE
  promoteTier,
  levelUp
};

global.Progression = Progression;

})(window);
