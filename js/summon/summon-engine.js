// js/summon/summon-engine.js - Double Fibonacci Summoning System
// Implementation of Gold Chance + Featured Chance Fibonacci sequences

/**
 * Double Fibonacci Summoning Engine
 *
 * SYSTEM OVERVIEW:
 * - Gold Chance Sequence (GCS): Determines if pull is Gold rarity
 * - Featured Chance Sequence (FCS): If Gold, determines if it's Featured
 * - Both sequences use Fibonacci-derived probability curves
 *
 * SEQUENCES:
 * - GCS: [0.01, 0.015, 0.045, 0.060, 0.100, 0.145, 0.21, 0.355]
 * - FCS: [0.10, 0.15, 0.35, 0.50, 0.80, 1.05, 1.70, 2.75]
 */

class DoubleFibonacciSummonEngine {
  constructor() {
    // Gold Chance Sequence (Primary Tier) — per-pull chance of ANY gold unit.
    // Realistic gacha soft-pity: starts ~3%, ramps gently to ~6% as the
    // player racks up multis, then RESETS when a featured gold is pulled
    // (see performSingleSummon). The old curve topped out at 35.5% and
    // never reset, so after ~8 multis every pull flooded golds.
    this.goldChanceSequence = [
      0.030,  // Multi #1: 3.0%
      0.032,  // Multi #2: 3.2%
      0.035,  // Multi #3: 3.5%
      0.040,  // Multi #4: 4.0%
      0.045,  // Multi #5: 4.5%
      0.050,  // Multi #6: 5.0%
      0.055,  // Multi #7: 5.5%
      0.060   // Multi #8: 6.0%
    ];

    // Featured Chance Sequence (Secondary Tier) — if a pull is gold, chance
    // it's the FEATURED unit rather than a general gold. Capped well under
    // 1.0 so goldsare not auto-featured; the last steps just improve odds.
    this.featuredChanceSequence = [
      0.20,   // Gold #1: 20%
      0.25,   // Gold #2: 25%
      0.30,   // Gold #3: 30%
      0.35,   // Gold #4: 35%
      0.40,   // Gold #5: 40%
      0.45,   // Gold #6: 45%
      0.50,   // Gold #7: 50%
      0.55    // Gold #8: 55%
    ];

    // Base rates for non-Gold units
    this.baseRates = {
      bronze: 0.70,  // 70%
      silver: 0.30   // 30%
    };

    // Session state tracking
    this.currentMultiStep = 0;     // Which multi summon we're on (0-7)
    this.goldsThisMulti = 0;       // How many golds pulled in current multi
    this.totalMultisCompleted = 0; // Total multis done in session

    // Statistics
    this.stats = {
      totalPulls: 0,
      totalGolds: 0,
      totalFeatured: 0,
      bronzePulls: 0,
      silverPulls: 0
    };

    this.STORAGE_KEY_BASE = 'blazing_summon_state_v1';
    this.STORAGE_KEY = this.STORAGE_KEY_BASE;
    this.loadState();
  }

  /**
   * Switch pity/step-up tracking to a specific banner.
   * Each banner keeps its own persisted progression.
   */
  setActiveBanner(bannerId) {
    const key = bannerId
      ? `${this.STORAGE_KEY_BASE}:${bannerId}`
      : this.STORAGE_KEY_BASE;
    if (key === this.STORAGE_KEY) return;

    this.STORAGE_KEY = key;
    this.currentMultiStep = 0;
    this.goldsThisMulti = 0;
    this.totalMultisCompleted = 0;
    this.stats = {
      totalPulls: 0,
      totalGolds: 0,
      totalFeatured: 0,
      bronzePulls: 0,
      silverPulls: 0
    };
    this.loadState();
  }

  /**
   * Back-compat shim: older callers passed pools to the engine; pools now
   * live on CharacterSelector, so this only forwards them.
   */
  setPool(characterPool, featuredPool) {
    if (window.CharacterSelector) {
      window.CharacterSelector.updatePools(characterPool || [], featuredPool || []);
    }
  }

  /**
   * Persist step-up/pity progression so it survives page reloads
   */
  saveState() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        currentMultiStep: this.currentMultiStep,
        goldsThisMulti: this.goldsThisMulti,
        totalMultisCompleted: this.totalMultisCompleted,
        stats: this.stats
      }));
    } catch (err) {
      console.error('[SummonEngine] Failed to save state:', err);
    }
  }

  loadState() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const maxStep = this.goldChanceSequence.length - 1;
      this.currentMultiStep = Math.min(Math.max(0, Number(saved.currentMultiStep) || 0), maxStep);
      this.goldsThisMulti = Math.max(0, Number(saved.goldsThisMulti) || 0);
      this.totalMultisCompleted = Math.max(0, Number(saved.totalMultisCompleted) || 0);
      if (saved.stats && typeof saved.stats === 'object') {
        this.stats = { ...this.stats, ...saved.stats };
      }
    } catch (err) {
      console.error('[SummonEngine] Failed to load state:', err);
    }
  }

  /**
   * Reset multi-summon state (call when starting new multi)
   */
  resetMulti() {
    this.goldsThisMulti = 0;
    this.currentMultiStep = Math.min(this.currentMultiStep, this.goldChanceSequence.length - 1);
  }

  /**
   * Advance to next multi step
   */
  advanceMultiStep() {
    this.currentMultiStep++;
    if (this.currentMultiStep >= this.goldChanceSequence.length) {
      // Loop back but maintain benefits
      this.currentMultiStep = this.goldChanceSequence.length - 1;
    }
    this.totalMultisCompleted++;
    this.saveState();
  }

  /**
   * Reset entire session (for testing or new banner)
   */
  resetSession() {
    this.currentMultiStep = 0;
    this.goldsThisMulti = 0;
    this.totalMultisCompleted = 0;
    this.stats = {
      totalPulls: 0,
      totalGolds: 0,
      totalFeatured: 0,
      bronzePulls: 0,
      silverPulls: 0
    };
    this.saveState();
  }

  /**
   * Get current gold chance based on multi step
   */
  getCurrentGoldChance() {
    const index = Math.min(this.currentMultiStep, this.goldChanceSequence.length - 1);
    return this.goldChanceSequence[index];
  }

  /**
   * Get current featured chance based on golds pulled this multi
   */
  getCurrentFeaturedChance() {
    const index = Math.min(this.goldsThisMulti, this.featuredChanceSequence.length - 1);
    return this.featuredChanceSequence[index];
  }

  /**
   * Perform a single summon
   * @returns {Object} { rarity: 'bronze'|'silver'|'gold', isFeatured: boolean, metadata: {...} }
   */
  performSingleSummon() {
    this.stats.totalPulls++;

    // Step 1: Roll for Gold using GCS
    const goldChance = this.getCurrentGoldChance();
    const isGold = Math.random() < goldChance;

    if (isGold) {
      // We got a Gold!
      this.stats.totalGolds++;
      this.goldsThisMulti++;

      // Step 2: Roll for Featured using FCS
      const featuredChance = this.getCurrentFeaturedChance();
      const isFeatured = Math.random() < Math.min(featuredChance, 1.0);

      if (isFeatured) {
        this.stats.totalFeatured++;
        // Landing the featured unit consumes the soft-pity: the step-up
        // ramp resets so gold odds fall back to base instead of staying
        // permanently inflated.
        this.currentMultiStep = 0;
      }

      this.saveState();

      return {
        rarity: 'gold',
        isFeatured: isFeatured,
        metadata: {
          goldChance: goldChance,
          featuredChance: featuredChance,
          multiStep: this.currentMultiStep,
          goldIndex: this.goldsThisMulti - 1,
          overflow: featuredChance > 1.0 ? featuredChance - 1.0 : 0
        }
      };
    } else {
      // Not a Gold - roll Bronze vs Silver
      const silverRoll = Math.random();
      const silverThreshold = this.baseRates.silver / (this.baseRates.bronze + this.baseRates.silver);

      const rarity = silverRoll < silverThreshold ? 'silver' : 'bronze';

      if (rarity === 'silver') {
        this.stats.silverPulls++;
      } else {
        this.stats.bronzePulls++;
      }

      this.saveState();

      return {
        rarity: rarity,
        isFeatured: false,
        metadata: {
          goldChance: goldChance,
          multiStep: this.currentMultiStep
        }
      };
    }
  }

  /**
   * Perform a multi-summon (10 pulls)
   * @returns {Array} Array of summon results
   */
  performMultiSummon() {
    this.resetMulti();
    const results = [];

    for (let i = 0; i < 10; i++) {
      results.push(this.performSingleSummon());
    }

    this.advanceMultiStep();
    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentMultiStep: this.currentMultiStep,
      goldsThisMulti: this.goldsThisMulti,
      totalMultisCompleted: this.totalMultisCompleted,
      currentGoldChance: this.getCurrentGoldChance(),
      currentFeaturedChance: this.getCurrentFeaturedChance(),
      goldRate: this.stats.totalPulls > 0 ? (this.stats.totalGolds / this.stats.totalPulls) : 0,
      featuredRate: this.stats.totalGolds > 0 ? (this.stats.totalFeatured / this.stats.totalGolds) : 0
    };
  }

  /**
   * Get readable rates display
   */
  getRatesDisplay() {
    const stats = this.getStats();
    return {
      multiStep: `${this.currentMultiStep + 1} / ${this.goldChanceSequence.length}`,
      goldChance: `${(this.getCurrentGoldChance() * 100).toFixed(1)}%`,
      featuredChance: `${Math.min(this.getCurrentFeaturedChance() * 100, 100).toFixed(1)}%`,
      totalGolds: `${stats.totalGolds} / ${stats.totalPulls} (${(stats.goldRate * 100).toFixed(2)}%)`,
      featuredGolds: `${stats.totalFeatured} / ${stats.totalGolds} (${(stats.featuredRate * 100).toFixed(2)}%)`
    };
  }
}

// Character Selection Engine
class CharacterSelectionEngine {
  constructor(characterPool, featuredPool) {
    this.updatePools(characterPool || [], featuredPool || []);
  }

  /**
   * Playable units have a computed powerRank; props/items in characters.json
   * (Deadly Beads, treasure chests, stat boosts...) have powerRank 0.
   */
  static isPlayable(c) {
    return !!c && (Number(c.powerRank) || 0) > 0;
  }

  updatePools(characterPool, featuredPool) {
    this.characterPool = (characterPool || []).filter(CharacterSelectionEngine.isPlayable);
    this.featuredPool = (featuredPool || []).filter(CharacterSelectionEngine.isPlayable);
    this.computeTierBuckets();
  }

  /**
   * The rarity/star fields in characters.json are mostly uniform, so tiers
   * are derived from powerRank percentiles matching the engine base rates:
   * bronze = bottom 60%, silver = next 30%, gold = top 10%.
   */
  computeTierBuckets() {
    const ranked = [...this.characterPool].sort((a, b) => (a.powerRank || 0) - (b.powerRank || 0));
    const n = ranked.length;
    this.buckets = { bronze: [], silver: [], gold: [] };

    if (n === 0) return;

    const silverStart = Math.floor(n * 0.60);
    const goldStart = Math.floor(n * 0.90);
    this.buckets.bronze = ranked.slice(0, silverStart);
    this.buckets.silver = ranked.slice(silverStart, goldStart);
    this.buckets.gold = ranked.slice(goldStart);

    // Tiny pools: make sure every bucket has at least one unit
    if (this.buckets.gold.length === 0) this.buckets.gold = [ranked[n - 1]];
    if (this.buckets.silver.length === 0) this.buckets.silver = this.buckets.gold;
    if (this.buckets.bronze.length === 0) this.buckets.bronze = this.buckets.silver;
  }

  /**
   * Select a character based on summon result
   * @param {Object} summonResult - Result from DoubleFibonacciSummonEngine
   * @returns {Object} Selected character
   */
  selectCharacter(summonResult) {
    const { rarity, isFeatured } = summonResult;

    if (this.characterPool.length === 0) {
      console.warn('[CharacterSelector] Empty character pool');
      return null;
    }

    // Featured golds come from the banner's featured pool
    if (rarity === 'gold' && isFeatured && this.featuredPool.length > 0) {
      return this.featuredPool[Math.floor(Math.random() * this.featuredPool.length)];
    }

    // Fall back through lower tiers so a pull is never lost
    const fallbackOrder = {
      gold: ['gold', 'silver', 'bronze'],
      silver: ['silver', 'bronze', 'gold'],
      bronze: ['bronze', 'silver', 'gold']
    };

    for (const tier of (fallbackOrder[rarity] || ['bronze'])) {
      const pool = this.buckets[tier];
      if (pool && pool.length > 0) {
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }

    return this.characterPool[Math.floor(Math.random() * this.characterPool.length)];
  }

  /**
   * Select multiple characters for multi-summon
   */
  selectCharacters(summonResults) {
    return summonResults.map(result => ({
      character: this.selectCharacter(result),
      summonData: result
    }));
  }
}

// Global instances
window.FibonacciSummonEngine = new DoubleFibonacciSummonEngine();
window.CharacterSelector = new CharacterSelectionEngine();

console.log('✅ Double Fibonacci Summon Engine loaded');
