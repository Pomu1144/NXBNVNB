// js/ninja-rank.js
// Ninja Rank and EXP System

(function (global) {
  "use strict";

  const STORAGE_KEY_RANK = "blazing_player_rank";
  const STORAGE_KEY_EXP = "blazing_player_exp";
  const RANK_DATA_PATH = "data/ninja-ranks.json";

  /**
   * NinjaRank Module
   * Manages player rank, EXP, and progression system
   */
  const NinjaRank = {
    // Rank requirements (loaded from JSON)
    rankRequirements: {},

    // Player data
    currentRank: 1,
    currentExp: 0,
    maxRank: 100,

    // Callbacks
    onRankUp: null,
    onExpGain: null,

    /**
     * Initialize the rank system
     */
    async init() {
      console.log("[NinjaRank] Initializing...");

      // Load rank requirements from JSON
      await this.loadRankRequirements();

      // Load player data from localStorage
      this.loadPlayerData();

      console.log("[NinjaRank] Initialized ✅");
      console.log(`[NinjaRank] Current Rank: ${this.currentRank} | EXP: ${this.currentExp}/${this.getExpForNextRank()}`);
    },

    /**
     * Load rank requirements from JSON file
     */
    async loadRankRequirements() {
      try {
        const response = await fetch(RANK_DATA_PATH);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        this.rankRequirements = await response.json();
        this.maxRank = Math.max(...Object.keys(this.rankRequirements).map(Number));
        console.log(`[NinjaRank] Loaded rank data (Ranks 1-${this.maxRank})`);
      } catch (err) {
        console.error("[NinjaRank] Failed to load rank requirements:", err);
        // Fallback to basic progression
        this.rankRequirements = { "1": 0, "2": 120 };
        this.maxRank = 2;
      }
    },

    /**
     * Load player rank and EXP from localStorage
     */
    loadPlayerData() {
      try {
        const storedRank = localStorage.getItem(STORAGE_KEY_RANK);
        const storedExp = localStorage.getItem(STORAGE_KEY_EXP);

        if (storedRank) {
          this.currentRank = Math.max(1, Math.min(this.maxRank, parseInt(storedRank, 10)));
        }

        if (storedExp) {
          this.currentExp = Math.max(0, parseInt(storedExp, 10));
        }

        // Validate EXP doesn't exceed next rank requirement
        this.validateExp();
      } catch (err) {
        console.error("[NinjaRank] Failed to load player data:", err);
        this.currentRank = 1;
        this.currentExp = 0;
      }
    },

    /**
     * Save player data to localStorage
     */
    savePlayerData() {
      try {
        localStorage.setItem(STORAGE_KEY_RANK, this.currentRank.toString());
        localStorage.setItem(STORAGE_KEY_EXP, this.currentExp.toString());
      } catch (err) {
        console.error("[NinjaRank] Failed to save player data:", err);
      }
    },

    /**
     * Get EXP required for next rank
     */
    getExpForNextRank() {
      if (this.currentRank >= this.maxRank) {
        return this.rankRequirements[this.maxRank.toString()];
      }
      return this.rankRequirements[(this.currentRank + 1).toString()] || 0;
    },

    /**
     * Get EXP required for current rank
     */
    getExpForCurrentRank() {
      return this.rankRequirements[this.currentRank.toString()] || 0;
    },

    /**
     * Get current EXP progress (0-1)
     */
    getExpProgress() {
      if (this.currentRank >= this.maxRank) {
        return 1;
      }

      const currentRankExp = this.getExpForCurrentRank();
      const nextRankExp = this.getExpForNextRank();
      const expInCurrentRank = this.currentExp - currentRankExp;
      const expNeededForRank = nextRankExp - currentRankExp;

      return Math.max(0, Math.min(1, expInCurrentRank / expNeededForRank));
    },

    /**
     * Get EXP remaining until next rank
     */
    getExpToNextRank() {
      if (this.currentRank >= this.maxRank) {
        return 0;
      }
      return Math.max(0, this.getExpForNextRank() - this.currentExp);
    },

    /**
     * Validate and fix EXP if out of bounds
     */
    validateExp() {
      const nextRankExp = this.getExpForNextRank();

      // If EXP exceeds next rank requirement, level up
      while (this.currentExp >= nextRankExp && this.currentRank < this.maxRank) {
        this.currentRank++;
        this.savePlayerData();

        if (this.onRankUp) {
          this.onRankUp(this.currentRank);
        }
      }
    },

    /**
     * Add EXP and handle rank-ups
     * @param {number} amount - Amount of EXP to add
     * @returns {Object} Result with rank ups and new values
     */
    addExp(amount) {
      const expBefore = this.currentExp;
      const rankBefore = this.currentRank;

      this.currentExp += Math.max(0, parseInt(amount, 10));

      const ranksGained = [];

      // Check for rank-ups
      while (this.currentExp >= this.getExpForNextRank() && this.currentRank < this.maxRank) {
        this.currentRank++;
        ranksGained.push(this.currentRank);

        console.log(`[NinjaRank] ⭐ RANK UP! Now Rank ${this.currentRank}`);

        if (this.onRankUp) {
          this.onRankUp(this.currentRank);
        }
      }

      // Cap EXP at max rank
      if (this.currentRank >= this.maxRank) {
        const maxExp = this.rankRequirements[this.maxRank.toString()];
        this.currentExp = Math.max(this.currentExp, maxExp);
      }

      this.savePlayerData();

      if (this.onExpGain && amount > 0) {
        this.onExpGain(amount, this.currentExp);
      }

      return {
        expGained: amount,
        expBefore: expBefore,
        expAfter: this.currentExp,
        rankBefore: rankBefore,
        rankAfter: this.currentRank,
        ranksGained: ranksGained,
        didRankUp: ranksGained.length > 0
      };
    },

    /**
     * Set rank directly (for admin/testing)
     * @param {number} rank - New rank
     */
    setRank(rank) {
      this.currentRank = Math.max(1, Math.min(this.maxRank, parseInt(rank, 10)));
      this.currentExp = this.getExpForCurrentRank();
      this.savePlayerData();
      console.log(`[NinjaRank] Rank set to ${this.currentRank}`);
    },

    /**
     * Set EXP directly (for admin/testing)
     * @param {number} exp - New EXP value
     */
    setExp(exp) {
      this.currentExp = Math.max(0, parseInt(exp, 10));
      this.validateExp();
      this.savePlayerData();
      console.log(`[NinjaRank] EXP set to ${this.currentExp}`);
    },

    /**
     * Reset rank and EXP to 1/0
     */
    reset() {
      this.currentRank = 1;
      this.currentExp = 0;
      this.savePlayerData();
      console.log("[NinjaRank] Progress reset to Rank 1");
    },

    /**
     * Get current rank
     */
    getRank() {
      return this.currentRank;
    },

    /**
     * Get current EXP
     */
    getExp() {
      return this.currentExp;
    },

    /**
     * Get max rank
     */
    getMaxRank() {
      return this.maxRank;
    },

    /**
     * Check if at max rank
     */
    isMaxRank() {
      return this.currentRank >= this.maxRank;
    }
  };

  // Export to global scope
  global.NinjaRank = NinjaRank;

  console.log("[NinjaRank] Module loaded ✅");

})(window);
