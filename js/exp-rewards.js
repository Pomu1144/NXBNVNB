// js/exp-rewards.js
// EXP Reward System - Give EXP for various game actions

(function (global) {
  "use strict";

  /**
   * ExpRewards Module
   * Centralized EXP rewards for game actions
   */
  const ExpRewards = {
    /**
     * EXP reward amounts for different actions
     * Adjust these values to balance progression
     */
    REWARDS: {
      // Mission rewards
      MISSION_EASY: 25,
      MISSION_NORMAL: 50,
      MISSION_HARD: 100,
      MISSION_EXTREME: 200,

      // Battle rewards
      BATTLE_WIN: 30,
      BATTLE_PERFECT: 50,      // No units lost
      BATTLE_FLAWLESS: 75,     // Perfect + no damage taken

      // Character actions
      CHARACTER_SUMMON_NEW: 25,
      CHARACTER_SUMMON_DUPE: 5,
      CHARACTER_AWAKEN: 50,
      CHARACTER_LIMIT_BREAK: 100,
      CHARACTER_MAX_LEVEL: 75,

      // Daily actions
      DAILY_LOGIN: 10,
      DAILY_MISSION_COMPLETE: 15,
      FIRST_WIN_OF_DAY: 50,

      // Collection milestones
      COLLECTION_10_CHARS: 100,
      COLLECTION_25_CHARS: 250,
      COLLECTION_50_CHARS: 500,
      COLLECTION_100_CHARS: 1000,

      // Team actions
      TEAM_CREATED: 20,
      TEAM_OPTIMIZED: 30,

      // Shop actions
      FIRST_PURCHASE: 50,

      // Social
      FRIEND_ADDED: 15,

      // Special events
      EVENT_PARTICIPATION: 50,
      EVENT_COMPLETION: 200,

      // Achievements
      ACHIEVEMENT_BRONZE: 50,
      ACHIEVEMENT_SILVER: 100,
      ACHIEVEMENT_GOLD: 250,
      ACHIEVEMENT_PLATINUM: 500
    },

    /**
     * Give EXP reward for an action
     * @param {string} actionType - Type of action (from REWARDS)
     * @param {number} multiplier - Optional multiplier (default 1)
     * @returns {Object} Result from NinjaRank.addExp()
     */
    giveReward(actionType, multiplier = 1) {
      if (!global.NinjaRank) {
        console.error("[ExpRewards] NinjaRank module not loaded");
        return null;
      }

      const baseReward = this.REWARDS[actionType];
      if (!baseReward) {
        console.warn(`[ExpRewards] Unknown action type: ${actionType}`);
        return null;
      }

      const expAmount = Math.floor(baseReward * multiplier);
      console.log(`[ExpRewards] ${actionType}: +${expAmount} EXP`);

      return global.NinjaRank.addExp(expAmount);
    },

    /**
     * Give custom EXP amount
     * @param {number} amount - EXP amount to give
     * @param {string} reason - Reason for EXP (for logging)
     */
    giveCustomReward(amount, reason = "Custom") {
      if (!global.NinjaRank) {
        console.error("[ExpRewards] NinjaRank module not loaded");
        return null;
      }

      console.log(`[ExpRewards] ${reason}: +${amount} EXP`);
      return global.NinjaRank.addExp(amount);
    },

    /**
     * Mission completion reward
     * @param {string} difficulty - easy, normal, hard, extreme
     */
    onMissionComplete(difficulty = 'normal') {
      const actionType = `MISSION_${difficulty.toUpperCase()}`;
      return this.giveReward(actionType);
    },

    /**
     * Battle victory reward
     * @param {Object} battleData - { unitsLost, damageTaken }
     */
    onBattleWin(battleData = {}) {
      let actionType = 'BATTLE_WIN';

      if (battleData.unitsLost === 0 && battleData.damageTaken === 0) {
        actionType = 'BATTLE_FLAWLESS';
      } else if (battleData.unitsLost === 0) {
        actionType = 'BATTLE_PERFECT';
      }

      return this.giveReward(actionType);
    },

    /**
     * Character summon reward
     * @param {boolean} isNew - True if first time summoning this character
     */
    onCharacterSummon(isNew = true) {
      const actionType = isNew ? 'CHARACTER_SUMMON_NEW' : 'CHARACTER_SUMMON_DUPE';
      return this.giveReward(actionType);
    },

    /**
     * Character awakening reward
     */
    onCharacterAwaken() {
      return this.giveReward('CHARACTER_AWAKEN');
    },

    /**
     * Character limit break reward
     */
    onCharacterLimitBreak() {
      return this.giveReward('CHARACTER_LIMIT_BREAK');
    },

    /**
     * Daily login reward
     * @param {number} consecutiveDays - Number of consecutive login days
     */
    onDailyLogin(consecutiveDays = 1) {
      const multiplier = Math.min(consecutiveDays, 7); // Cap at 7x
      return this.giveReward('DAILY_LOGIN', multiplier);
    },

    /**
     * Collection milestone reward
     * @param {number} totalCharacters - Total unique characters owned
     */
    onCollectionMilestone(totalCharacters) {
      let actionType = null;

      if (totalCharacters === 10) actionType = 'COLLECTION_10_CHARS';
      else if (totalCharacters === 25) actionType = 'COLLECTION_25_CHARS';
      else if (totalCharacters === 50) actionType = 'COLLECTION_50_CHARS';
      else if (totalCharacters === 100) actionType = 'COLLECTION_100_CHARS';

      if (actionType) {
        return this.giveReward(actionType);
      }

      return null;
    },

    /**
     * Achievement unlocked reward
     * @param {string} tier - bronze, silver, gold, platinum
     */
    onAchievementUnlock(tier = 'bronze') {
      const actionType = `ACHIEVEMENT_${tier.toUpperCase()}`;
      return this.giveReward(actionType);
    },

    /**
     * Get reward amount without giving it
     * @param {string} actionType - Type of action
     * @returns {number} EXP amount
     */
    getRewardAmount(actionType) {
      return this.REWARDS[actionType] || 0;
    },

    /**
     * Get all reward amounts
     * @returns {Object} All rewards
     */
    getAllRewards() {
      return { ...this.REWARDS };
    }
  };

  // Export to global scope
  global.ExpRewards = ExpRewards;

  console.log("[ExpRewards] Module loaded ✅");

})(window);
