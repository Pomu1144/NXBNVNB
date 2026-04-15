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
    // Gold Chance Fibonacci Sequence (Primary Tier)
    // Determines probability of pulling ANY gold unit
    this.goldChanceSequence = [
      0.01,   // Multi #1: 1.0%
      0.015,  // Multi #2: 1.5%
      0.045,  // Multi #3: 4.5%
      0.060,  // Multi #4: 6.0%
      0.100,  // Multi #5: 10.0%
      0.145,  // Multi #6: 14.5%
      0.21,   // Multi #7: 21.0%
      0.355   // Multi #8: 35.5%
    ];

    // Featured Chance Fibonacci Sequence (Secondary Tier)
    // If pull is Gold, determines if it's Featured
    this.featuredChanceSequence = [
      0.10,   // Gold #1: 10%
      0.15,   // Gold #2: 15%
      0.35,   // Gold #3: 35%
      0.50,   // Gold #4: 50%
      0.80,   // Gold #5: 80%
      1.05,   // Gold #6: 105% (guaranteed featured)
      1.70,   // Gold #7: 170%
      2.75    // Gold #8: 275%
    ];

    // Base rates for non-Gold units
    this.baseRates = {
      bronze: 0.60,  // 60%
      silver: 0.30,  // 30%
      gold: 0.10     // 10% (modified by GCS)
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
      }

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
    this.characterPool = characterPool || [];
    this.featuredPool = featuredPool || [];
  }

  updatePools(characterPool, featuredPool) {
    this.characterPool = characterPool;
    this.featuredPool = featuredPool;
  }

  /**
   * Select a character based on summon result
   * @param {Object} summonResult - Result from DoubleFibonacciSummonEngine
   * @returns {Object} Selected character
   */
  selectCharacter(summonResult) {
    const { rarity, isFeatured } = summonResult;

    // Filter pool by rarity
    // Map summon rarities to character.json rarity values
    const rarityMap = {
      'bronze': 1,  // Common characters (1-4 star base)
      'silver': 3,  // Uncommon characters (3-5 star base)
      'gold': 6     // Rare characters (6 star base)
    };

    const targetRarity = rarityMap[rarity];
    const pool = this.characterPool.filter(c => c.rarity === targetRarity);

    if (pool.length === 0) {
      console.warn(`No characters found for rarity ${rarity} (mapped to ${targetRarity})`);
      return null;
    }

    // If gold and featured, use featured pool
    if (rarity === 'gold' && isFeatured && this.featuredPool.length > 0) {
      const featuredGolds = this.featuredPool.filter(c => c.rarity === 6);
      if (featuredGolds.length > 0) {
        return featuredGolds[Math.floor(Math.random() * featuredGolds.length)];
      }
    }

    // Otherwise use general pool
    return pool[Math.floor(Math.random() * pool.length)];
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
