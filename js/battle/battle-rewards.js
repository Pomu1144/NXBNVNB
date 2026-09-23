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
      const rewards = stageData.rewards || this.getDefaultStageRewards(stageIndex, core?.difficulty);

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
        ${usingSprite ? `
        /* Real chest sprite: no boxy outline, just a soft drop-shadow */
        filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.55));
        ` : `
        border: 4px solid #FFD700;
        border-radius: 8px;
        box-shadow:
          0 10px 30px rgba(0, 0, 0, 0.5),
          0 0 20px rgba(255, 215, 0, 0.6),
          inset 0 -5px 15px rgba(0, 0, 0, 0.3);
        `}
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
     * Get default rewards based on stage number, scaled by mission difficulty
     */
    getDefaultStageRewards(stageIndex, difficulty = 'C') {
      const rewards = {};

      const multipliers = { D: 0.5, C: 1, B: 1.5, A: 2.5, S: 4, SS: 6 };
      const mult = multipliers[difficulty] || 1;

      // Materials get rarer with difficulty (ids from resources.js)
      const materialsByDifficulty = {
        D:  ['scroll_basic', 'scroll_body', 'scroll_skill'],
        C:  ['scroll_basic', 'awakening_stone_3', 'scroll_bravery', 'scroll_wisdom', 'scroll_heart'],
        B:  ['scroll_advanced', 'awakening_stone_3', 'awakening_stone_4', 'crystal_body', 'crystal_skill'],
        A:  ['awakening_stone_4', 'awakening_stone_5', 'crystal_heart', 'crystal_bravery', 'crystal_wisdom', 'character_stone'],
        S:  ['awakening_stone_5', 'awakening_stone_6', 'limit_break_crystal', 'book_victor_5', 'dupe_crystal'],
        SS: ['awakening_stone_6', 'limit_break_crystal', 'book_victor_5', 'book_victor_6', 'awakening_charm']
      };
      const ramenTierByDifficulty = { D: 1, C: 1, B: 2, A: 3, S: 4, SS: 5 };
      const ramenElements = ['heart', 'skill', 'body', 'bravery', 'wisdom'];

      // Base ryo reward
      rewards.ryo = Math.round((stageIndex + 1) * 500 * mult);

      // Random material every 2 stages
      if ((stageIndex + 1) % 2 === 0) {
        const materials = materialsByDifficulty[difficulty] || materialsByDifficulty.C;
        const randomMat = materials[Math.floor(Math.random() * materials.length)];
        rewards[randomMat] = 1;
      }

      // Chance for ramen (tier scales with difficulty)
      if (Math.random() < 0.3) {
        const tier = ramenTierByDifficulty[difficulty] || 1;
        const element = ramenElements[Math.floor(Math.random() * ramenElements.length)];
        rewards[`ramen_${element}_${tier}star`] = Math.floor(Math.random() * 3) + 1;
      }

      return rewards;
    },

    /**
     * Show end-of-mission results screen with chest reveals.
     * JJK theme (css/battle-results-jjk.css): ink backdrop, crimson title plate,
     * rank emblem, stage chips whose chests open in sequence, and reward tiles
     * (real icons + ×qty + readable names) that pop in and stack as chests open.
     */
    async showResultsScreen(core) {
      if (this.collectedChests.length === 0) {
        console.log("[BattleRewards] No chests to display");
        return;
      }

      console.log(`[BattleRewards] Showing results screen with ${this.collectedChests.length} chests`);
      document.getElementById('results-screen')?.remove();

      const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const RF = window.RewardFormat;
      const mission = core?.missionData || {};
      const rank = core?.difficulty || localStorage.getItem('currentDifficulty') || '';
      const clear = core?._missionResult || null;              // MissionProgress.completeMission result
      const expList = Array.isArray(core?._expResults) ? core._expResults.filter(Boolean) : [];
      const expGained = expList.reduce((sum, r) => sum + (Number(r.expGained) || 0), 0);
      const rankAfter = expList.length ? expList[expList.length - 1].rankAfter : null;
      const rankUp = expList.some(r => r.rankAfter != null && r.rankBefore != null && r.rankAfter > r.rankBefore);

      const overlay = document.createElement('div');
      overlay.id = 'results-screen';
      overlay.className = 'battle-results-screen mr-modal';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Mission Complete');

      const stageChips = this.collectedChests.map((c, i) => `
        <div class="mr-stage" data-i="${i}" style="--d:${0.45 + i * 0.12}s">
          <span class="mr-stage-chest"><img src="${this.chestSprites.closed}" alt="" draggable="false"></span>
          <span class="mr-stage-label">Stage ${esc(c.stageIndex)}</span>
        </div>`).join('');

      overlay.innerHTML = `
        <div class="mr-backdrop"></div>
        <div class="mr-burst"><div class="mr-rays"></div><div class="mr-flare"></div></div>
        <div class="mr-card">
          <div class="mr-banner"><span>Mission Complete</span></div>
          ${rank ? `<div class="mr-rank" title="${esc(rank)}-Rank"><span>${esc(rank)}</span></div>` : ''}
          <div class="mr-head">
            ${mission.name ? `<div class="mr-mission">${esc(mission.name)}</div>` : ''}
            <div class="mr-meta">
              ${rank ? `<span class="jjk-chip mr-chip">${esc(rank)}-Rank</span>` : ''}
              ${clear && clear.isFirstClear ? '<span class="jjk-chip mr-chip mr-chip--first">First Clear</span>' : ''}
            </div>
          </div>
          <div class="mr-stages">${stageChips}</div>
          <div class="mr-label"><span>Rewards Obtained</span></div>
          <div class="mr-grid" aria-live="polite"></div>
          <div class="mr-extra"></div>
          <div class="mr-actions"></div>
        </div>`;
      document.body.appendChild(overlay);

      const card = overlay.querySelector('.mr-card');
      const grid = overlay.querySelector('.mr-grid');
      const extra = overlay.querySelector('.mr-extra');
      const tiles = new Map();
      let tileCount = 0;

      const addTile = (item, isBonus) => {
        const existing = tiles.get(item.key);
        if (existing) {
          existing.qty += Number(item.qty) || 0;
          const q = existing.el.querySelector('.mr-qty');
          q.textContent = `×${RF ? RF.fmtQty(existing.qty) : existing.qty}`;
          q.classList.toggle('is-long', q.textContent.length > 6);
          existing.el.classList.remove('is-bump');
          void existing.el.offsetWidth;
          existing.el.classList.add('is-bump');
          return;
        }
        const el = document.createElement('div');
        el.className = `mr-tile${item.kind === 'character' ? ' is-char' : ''}${isBonus ? ' is-bonus' : ''}`;
        el.style.setProperty('--d', `${(tileCount % 6) * 0.08}s`);
        const fb = item.fallback || this.chestSprites.closed;
        el.innerHTML = `
          <div class="mr-tile-glow"></div>
          <div class="mr-socket">
            <img class="mr-icon" src="${esc(item.icon)}" alt="" draggable="false" onerror="this.onerror=null;this.src='${esc(fb)}'">
            <span class="mr-qty${String(item.qty).length > 4 ? ' is-long' : ''}">×${RF ? RF.fmtQty(item.qty) : esc(item.qty)}</span>
            ${isBonus ? '<span class="mr-tag">Bonus</span>' : ''}
          </div>
          <div class="mr-name">${esc(item.name)}</div>`;
        grid.appendChild(el);
        tiles.set(item.key, { el, qty: Number(item.qty) || 0 });
        tileCount++;
        card.classList.toggle('is-many', tileCount > 6);
      };

      const toItems = (rewards) => {
        if (RF) return RF.items(rewards);
        return Object.entries(rewards || {}).filter(([k]) => k !== 'characters')
          .map(([k, v]) => ({ key: k, name: this.formatRewardName(k), qty: v, icon: this.chestSprites.closed }));
      };

      // Open chests one by one; tiles pop in (and stack) as each opens
      for (let i = 0; i < this.collectedChests.length; i++) {
        const chest = this.collectedChests[i];
        const chip = overlay.querySelector(`.mr-stage[data-i="${i}"]`);
        await this.delay(i === 0 ? 700 : 380);
        if (chip) chip.classList.add('is-opening');
        await this.delay(420);
        if (chip) {
          chip.classList.remove('is-opening');
          chip.classList.add('is-open');
          const img = chip.querySelector('img');
          if (img) img.src = this.chestSprites.open;
        }
        toItems(chest.rewards).forEach(it => addTile(it, false));
        // Apply rewards to inventory
        this.applyRewardsToInventory(chest.rewards);
      }

      // Clear bonus (completion / first-clear — already granted by MissionProgress)
      if (clear && clear.rewards && Object.keys(clear.rewards).length) {
        await this.delay(300);
        toItems(clear.rewards).forEach(it => addTile({ ...it, key: 'bonus_' + it.key }, true));
      }

      // Player EXP / rank up
      if (expGained > 0 || rankUp) {
        await this.delay(250);
        extra.innerHTML = `
          ${expGained > 0 ? `<span class="mr-exp"><img src="assets/ui/jjk/star_gold.webp" alt="" draggable="false">Player EXP <b>+${expGained.toLocaleString()}</b></span>` : ''}
          ${rankUp ? `<span class="mr-rankup">Rank Up!${rankAfter != null ? ` <b>Rank ${esc(rankAfter)}</b>` : ''}</span>` : ''}`;
        extra.classList.add('is-in');
      }

      // Continue button
      await this.delay(450);
      const continueBtn = document.createElement('button');
      continueBtn.type = 'button';
      continueBtn.className = 'jjk-btn mr-continue';
      continueBtn.textContent = 'Continue';
      continueBtn.onclick = () => {
        continueBtn.disabled = true;
        this.closeResultsScreen();
      };
      overlay.querySelector('.mr-actions').appendChild(continueBtn);
    },

    /**
     * Format reward item name for display
     */
    formatRewardName(itemKey) {
      if (window.RewardFormat) return window.RewardFormat.name(itemKey);
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
      if (!rewards) return;

      for (const [item, amount] of Object.entries(rewards)) {
        // Character unlocks (e.g. Super Impact SS-rank banner units) are an
        // array of { characterId, tierCode, quantity } and are granted to the
        // character inventory, not the resource pool.
        if (item === 'characters') {
          this.grantCharacterRewards(amount);
          continue;
        }
        if (window.Resources) {
          window.Resources.add(item, amount);
          console.log(`[BattleRewards] Added ${amount}x ${item} to inventory`);
        }
      }
    },

    /**
     * Grant character unlocks. One-time per (mission + rank + character) so
     * re-clearing an SS stage does not let the player farm duplicate copies.
     */
    grantCharacterRewards(list) {
      if (!Array.isArray(list) || !window.InventoryChar) return;
      const missionId = localStorage.getItem('currentMissionId') || '';
      const rank = localStorage.getItem('currentDifficulty') || '';
      list.forEach(ch => {
        if (!ch || !ch.characterId) return;
        const onceKey = `si_unlocked_${missionId}_${rank}_${ch.characterId}`;
        if (ch.repeatable !== true && localStorage.getItem(onceKey)) {
          console.log(`[BattleRewards] ${ch.characterId} already unlocked — skipping`);
          return;
        }
        const qty = ch.quantity || 1;
        for (let i = 0; i < qty; i++) {
          window.InventoryChar.addCopy(ch.characterId, 1, ch.tierCode || '6S');
        }
        localStorage.setItem(onceKey, '1');
        console.log(`[BattleRewards] Unlocked ${qty}x ${ch.characterId} @ ${ch.tierCode || '6S'}`);
      });
    },

    /**
     * Close results screen and return to mission select
     */
    closeResultsScreen() {
      const resultsScreen = document.getElementById('results-screen');
      if (resultsScreen) {
        resultsScreen.classList.add('is-leaving');
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
