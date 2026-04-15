// js/battle/battle-rewards.js - Mission Reward & Chest Collection System
(() => {
  "use strict";

  /**
   * BattleRewards Module
   * Handles chest drops, collection, and end-mission results screen
   *
   * Features:
   * - Chest appears on map when earned
   * - Auto-collect when advancing to next stage
   * - End result screen with chest reveal animations
   * - Supports multiple reward types (ryo, ramen, characters, materials)
   */
  const BattleRewards = {
    collectedChests: [],     // All chests collected this mission
    currentStageChest: null, // Chest for current stage (if any)
    chestSprites: {
      closed: 'assets/icons/chestunopened.png',
      open: 'assets/icons/chestopened.png'
    },

    /**
     * Initialize rewards system
     */
    init(core) {
      this.collectedChests = [];
      this.currentStageChest = null;
      this.spriteAvailability = {}; // Initialize sprite availability tracker
      this.preloadChestSprites();
      console.log("[BattleRewards] Rewards system initialized");
    },

    /**
     * Award chest for completing a stage
     * @param {Object} stageData - Stage configuration from missions.json
     * @param {number} stageIndex - Current stage index
     */
    async awardStageChest(stageData, stageIndex, core) {
      // Get rewards for this stage
      const rewards = stageData.rewards || this.getDefaultStageRewards(stageIndex);

      if (!rewards || Object.keys(rewards).length === 0) {
        console.log("[BattleRewards] No rewards for this stage");
        return;
      }

      console.log(`[BattleRewards] Awarding chest for stage ${stageIndex + 1}:`, rewards);

      // Create chest object
      const chest = {
        stageIndex: stageIndex + 1,
        rewards: rewards,
        collected: false
      };

      this.currentStageChest = chest;

      // Show chest on battlefield
      this.showChestOnMap(chest, core);

      // Wait briefly before auto-collecting
      await this.delay(800);
    },

    /**
     * Show chest visual on the battlefield
     */
    showChestOnMap(chest, core) {
      if (!core.dom.scene) return;

      // Remove any existing chest
      const existingChest = core.dom.scene.querySelector('.reward-chest');
      if (existingChest) existingChest.remove();

      // Create chest element
      const chestEl = document.createElement('div');
      chestEl.className = 'reward-chest';
      const usingSprite = this.isChestSpriteAvailable('closed');
      chestEl.style.cssText = `
        position: absolute;
        left: 50%;
        top: 40%;
        transform: translate(-50%, -50%);
        width: 80px;
        height: 80px;
        background: ${this.getChestBackground('closed')};
        border: 4px solid #FFD700;
        border-radius: 8px;
        box-shadow:
          0 10px 30px rgba(0, 0, 0, 0.5),
          0 0 20px rgba(255, 215, 0, 0.6),
          inset 0 -5px 15px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        cursor: pointer;
        animation: chestAppear 0.5s ease-out, chestFloat 2s ease-in-out infinite;
      `;

      // Add chest lid detail
      chestEl.innerHTML = usingSprite ? '' : `
        <div style="
          position: absolute;
          top: 25%;
          left: 50%;
          transform: translateX(-50%);
          width: 60%;
          height: 6px;
          background: #FFD700;
          border-radius: 3px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
        "></div>
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 20px;
          height: 12px;
          background: #FFD700;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        "></div>
      `;

      core.dom.scene.appendChild(chestEl);
      console.log("[BattleRewards] Chest displayed on map");
    },

    /**
     * Collect current stage chest (auto-triggered on stage advance)
     */
    async collectStageChest(core) {
      if (!this.currentStageChest) return;

      console.log("[BattleRewards] Collecting chest...");

      // Mark as collected
      this.currentStageChest.collected = true;
      this.collectedChests.push(this.currentStageChest);

      // Animate chest collection
      const chestEl = core.dom.scene?.querySelector('.reward-chest');
      if (chestEl) {
        // Collection animation
        chestEl.style.animation = 'chestCollect 0.6s ease-in forwards';
        await this.delay(600);
        chestEl.remove();
      }

      // Play collection sound
      if (window.AudioManager) {
        window.AudioManager.playSFX('assets/audio/sfx/chest_collect.mp3');
      }

      this.currentStageChest = null;
      console.log(`[BattleRewards] ✅ Chest collected! Total: ${this.collectedChests.length}`);
    },

    /**
     * Get default rewards based on stage number
     */
    getDefaultStageRewards(stageIndex) {
      const rewards = {};

      // Base ryo reward
      rewards.ryo = (stageIndex + 1) * 500;

      // Random material every 2 stages
      if ((stageIndex + 1) % 2 === 0) {
        const materials = ['scroll_3star', 'scroll_4star', 'scroll_body', 'scroll_skill'];
        const randomMat = materials[Math.floor(Math.random() * materials.length)];
        rewards[randomMat] = 1;
      }

      // Chance for ramen
      if (Math.random() < 0.3) {
        rewards['ramen_1star'] = Math.floor(Math.random() * 3) + 1;
      }

      return rewards;
    },

    /**
     * Show end-of-mission results screen with chest reveals
     */
    async showResultsScreen(core) {
      if (this.collectedChests.length === 0) {
        console.log("[BattleRewards] No chests to display");
        return;
      }

      console.log(`[BattleRewards] Showing results screen with ${this.collectedChests.length} chests`);

      // Create results overlay
      const resultsOverlay = document.createElement('div');
      resultsOverlay.id = 'results-screen';
      resultsOverlay.className = 'battle-results-screen';
      resultsOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-out;
      `;

      // Title
      const title = document.createElement('div');
      title.textContent = 'MISSION REWARDS';
      title.style.cssText = `
        font-family: 'Cinzel', serif;
        font-size: 3rem;
        color: #FFD700;
        text-shadow:
          0 0 20px rgba(255, 215, 0, 0.8),
          0 0 40px rgba(255, 215, 0, 0.4);
        margin-bottom: 3rem;
        letter-spacing: 0.2em;
      `;
      resultsOverlay.appendChild(title);

      // Chest container
      const chestContainer = document.createElement('div');
      chestContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 2rem;
        justify-content: center;
        max-width: 800px;
        margin-bottom: 3rem;
      `;
      resultsOverlay.appendChild(chestContainer);

      document.body.appendChild(resultsOverlay);

      // Show chests one by one with reveals
      for (let i = 0; i < this.collectedChests.length; i++) {
        await this.delay(400);
        await this.revealChest(this.collectedChests[i], chestContainer, i);
      }

      // Continue button
      await this.delay(800);
      const continueBtn = document.createElement('button');
      continueBtn.textContent = 'CONTINUE';
      continueBtn.style.cssText = `
        font-family: 'Cinzel', serif;
        font-size: 1.5rem;
        padding: 1rem 3rem;
        background: linear-gradient(135deg, #D4AF37, #FFD700);
        color: #000;
        border: 3px solid #FFD700;
        border-radius: 8px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.5);
        transition: all 0.2s;
        animation: fadeIn 0.5s ease-out;
      `;

      continueBtn.onmouseenter = () => {
        continueBtn.style.transform = 'scale(1.1)';
        continueBtn.style.boxShadow = '0 6px 25px rgba(255, 215, 0, 0.8)';
      };

      continueBtn.onmouseleave = () => {
        continueBtn.style.transform = 'scale(1)';
        continueBtn.style.boxShadow = '0 4px 15px rgba(255, 215, 0, 0.5)';
      };

      continueBtn.onclick = () => {
        this.closeResultsScreen();
      };

      resultsOverlay.appendChild(continueBtn);
    },

    /**
     * Reveal individual chest with animation
     */
    async revealChest(chest, container, index) {
      // Create chest card
      const chestCard = document.createElement('div');
      chestCard.style.cssText = `
        width: 150px;
        padding: 1.5rem;
        background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
        border: 2px solid #FFD700;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        text-align: center;
        animation: cardAppear 0.5s ease-out;
      `;

      // Stage label
      const stageLabel = document.createElement('div');
      stageLabel.textContent = `Stage ${chest.stageIndex}`;
      stageLabel.style.cssText = `
        font-family: 'Cinzel', serif;
        font-size: 0.9rem;
        color: #D4AF37;
        margin-bottom: 1rem;
      `;
      chestCard.appendChild(stageLabel);

      // Chest icon (will flash)
      const chestIcon = document.createElement('div');
      chestIcon.style.cssText = `
        width: 60px;
        height: 60px;
        margin: 0 auto 1rem;
        background: ${this.getChestBackground('closed')};
        border: 3px solid #FFD700;
        border-radius: 6px;
        box-shadow: 0 0 15px rgba(255, 215, 0, 0.6);
      `;
      chestCard.appendChild(chestIcon);

      // Rewards list (hidden initially)
      const rewardsList = document.createElement('div');
      rewardsList.style.cssText = `
        opacity: 0;
        transition: opacity 0.5s;
      `;

      for (const [item, amount] of Object.entries(chest.rewards)) {
        const rewardItem = document.createElement('div');
        rewardItem.textContent = `${this.formatRewardName(item)}: ${amount}`;
        rewardItem.style.cssText = `
          font-family: 'Cinzel', serif;
          font-size: 0.8rem;
          color: #FFF;
          margin: 0.3rem 0;
        `;
        rewardsList.appendChild(rewardItem);
      }

      chestCard.appendChild(rewardsList);
      container.appendChild(chestCard);

      // Flash chest and reveal rewards
      await this.delay(600);
      chestIcon.style.animation = 'chestFlash 0.5s ease-in-out 3';

      await this.delay(1500);
      chestIcon.style.background = this.getChestBackground('open');
      chestIcon.style.opacity = '0.3';
      rewardsList.style.opacity = '1';

      // Apply rewards to inventory
      this.applyRewardsToInventory(chest.rewards);
    },

    /**
     * Format reward item name for display
     */
    formatRewardName(itemKey) {
      const names = {
        ryo: 'Ryo',
        pearls: 'Pearls',
        ramen_1star: '1★ Ramen',
        ramen_2star: '2★ Ramen',
        ramen_3star: '3★ Ramen',
        scroll_3star: '3★ Scroll',
        scroll_4star: '4★ Scroll',
        scroll_5star: '5★ Scroll',
        scroll_body: 'Body Scroll',
        scroll_skill: 'Skill Scroll',
        scroll_bravery: 'Bravery Scroll',
        scroll_wisdom: 'Wisdom Scroll',
        scroll_heart: 'Heart Scroll',
        awakening_stone_3: '3★ Awakening',
        awakening_stone_4: '4★ Awakening',
        awakening_stone_5: '5★ Awakening',
        character_stone: 'Character Stone',
        limit_break_crystal: 'LB Crystal',
        dupe_crystal: 'Dupe Crystal'
      };

      return names[itemKey] || itemKey;
    },

    /**
     * Build chest background with sprite and gradient fallback
     */
    getChestBackground(state = 'closed') {
      const spritePath = this.chestSprites[state];
      const spriteAvailable = this.isChestSpriteAvailable(state);

      // When the PNG is present, render only the sprite. If it fails to load, fall back
      // to the original gradients so the UI still has a visible chest.
      if (spriteAvailable !== false) {
        return `center/contain no-repeat url('${spritePath}')`;
      }

      return state === 'open'
        ? 'linear-gradient(135deg, #FFD700 0%, #FFF2AE 45%, #D4AF37 100%)'
        : 'linear-gradient(135deg, #8B4513 0%, #D4AF37 50%, #8B4513 100%)';
    },

    /**
     * Preload chest sprites to detect availability for fallback handling.
     */
    preloadChestSprites() {
      Object.entries(this.chestSprites).forEach(([state, path]) => {
        const img = new Image();
        img.onload = () => {
          this.spriteAvailability[state] = true;
          console.log(`[BattleRewards] Chest sprite loaded: ${path}`);
        };
        img.onerror = () => {
          this.spriteAvailability[state] = false;
          console.warn(`[BattleRewards] Chest sprite missing, using gradient: ${path}`);
        };
        img.src = path;
      });
    },

    /**
     * Check if a given sprite is confirmed to be available.
     */
    isChestSpriteAvailable(state = 'closed') {
      return this.spriteAvailability[state] !== false;
    },

    /**
     * Apply rewards to player inventory
     */
    applyRewardsToInventory(rewards) {
      if (!window.Resources) return;

      for (const [item, amount] of Object.entries(rewards)) {
        window.Resources.add(item, amount);
        console.log(`[BattleRewards] Added ${amount}x ${item} to inventory`);
      }
    },

    /**
     * Close results screen and return to mission select
     */
    closeResultsScreen() {
      const resultsScreen = document.getElementById('results-screen');
      if (resultsScreen) {
        resultsScreen.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
          resultsScreen.remove();
          // Return to missions page
          window.location.href = 'missions.html';
        }, 300);
      }
    },

    /**
     * Delay helper
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Initialize CSS animations
     */
    initializeStyles() {
      if (document.getElementById('battle-rewards-styles')) return;

      const style = document.createElement('style');
      style.id = 'battle-rewards-styles';
      style.textContent = `
        @keyframes chestAppear {
          0% {
            transform: translate(-50%, -50%) scale(0) rotate(-180deg);
            opacity: 0;
          }
          70% {
            transform: translate(-50%, -50%) scale(1.2) rotate(10deg);
          }
          100% {
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        @keyframes chestFloat {
          0%, 100% {
            transform: translate(-50%, -50%) translateY(0px);
          }
          50% {
            transform: translate(-50%, -50%) translateY(-10px);
          }
        }

        @keyframes chestCollect {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          50% {
            transform: translate(-50%, -60%) scale(1.3);
            opacity: 0.8;
          }
          100% {
            transform: translate(-50%, -100%) scale(0);
            opacity: 0;
          }
        }

        @keyframes chestFlash {
          0%, 100% {
            box-shadow: 0 0 15px rgba(255, 215, 0, 0.6);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 40px rgba(255, 215, 0, 1), 0 0 80px rgba(255, 255, 255, 0.5);
            transform: scale(1.1);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }

        @keyframes cardAppear {
          0% {
            transform: translateY(30px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `;

      document.head.appendChild(style);
      console.log("[BattleRewards] Animation styles initialized");
    }
  };

  // Initialize styles on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BattleRewards.initializeStyles());
  } else {
    BattleRewards.initializeStyles();
  }

  // Export globally
  window.BattleRewards = BattleRewards;

  console.log("[BattleRewards] Module loaded ✅");
})();
