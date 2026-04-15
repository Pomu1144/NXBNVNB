// js/battle/battle-equipped-ultimate.js
// Handles Last Stand Ultimate system in battle
// Tracks basic attack count and enables once-per-battle ultimates

(() => {
  "use strict";

  const BattleEquippedUltimate = {
    // State tracking
    basicAttackCounts: {}, // { unitId: consecutiveBasicAttacks }
    ultimatesUsed: {},     // { unitId: boolean }
    ultimateReady: {},     // { unitId: boolean }

    REQUIRED_BASIC_ATTACKS: 3,

    /**
     * Initialize Last Stand Ultimate system for battle
     */
    init(core) {
      console.log("[BattleEquippedUltimate] Initializing Last Stand Ultimate system");
      this.basicAttackCounts = {};
      this.ultimatesUsed = {};
      this.ultimateReady = {};
      this.core = core;

      // Setup button click handler
      this.setupButtonHandler();
    },

    /**
     * Setup Last Stand Ultimate button click handler
     */
    setupButtonHandler() {
      const button = document.getElementById('equipped-ultimate-btn');
      if (button) {
        button.addEventListener('click', () => this.handleButtonClick());
        console.log("[BattleEquippedUltimate] Button handler registered");
      }
    },

    /**
     * Handle Last Stand Ultimate button click
     */
    async handleButtonClick() {
      // Find the current active player unit with Last Stand Ultimate ready
      if (!this.core || !this.core.activeTeam) return;

      const readyUnit = this.core.activeTeam.find(unit =>
        this.canUseUltimate(unit.id) && this.getEquippedUltimateData(unit)
      );

      if (!readyUnit) {
        console.warn("[BattleEquippedUltimate] No ready unit found");
        return;
      }

      const ultimate = this.getEquippedUltimateData(readyUnit);
      if (!ultimate) {
        console.warn("[BattleEquippedUltimate] No Last Stand Ultimate found");
        return;
      }

      // Determine targets based on ultimate target type
      let targets = [];
      if (ultimate.target === 'all_enemies') {
        targets = this.core.enemyTeam.filter(u => u.stats.hp > 0);
      } else if (ultimate.target === 'single_enemy') {
        targets = [this.core.enemyTeam.find(u => u.stats.hp > 0)];
      } else if (ultimate.target === 'all_allies') {
        targets = this.core.activeTeam.filter(u => u.stats.hp > 0);
      }

      // Use the Last Stand Ultimate
      await this.useUltimate(readyUnit.id, ultimate, targets);

      // Update button state
      this.updateButtonUI();
    },

    /**
     * Register a unit for Last Stand Ultimate tracking
     * @param {Object} unit - Battle unit object
     */
    registerUnit(unit) {
      if (!unit || !unit.id) return;

      this.basicAttackCounts[unit.id] = 0;
      this.ultimatesUsed[unit.id] = false;
      this.ultimateReady[unit.id] = false;

      console.log(`[BattleEquippedUltimate] Registered unit: ${unit.id}`);
    },

    /**
     * Track when a unit performs a basic attack
     * @param {string} unitId - Unit identifier
     */
    onBasicAttack(unitId) {
      if (!this.basicAttackCounts.hasOwnProperty(unitId)) {
        this.basicAttackCounts[unitId] = 0;
      }

      this.basicAttackCounts[unitId]++;

      console.log(`[BattleEquippedUltimate] ${unitId} basic attack count: ${this.basicAttackCounts[unitId]}`);

      // Update progress UI
      this.updateProgressUI(unitId);

      // Check if ultimate is now ready
      if (this.basicAttackCounts[unitId] >= this.REQUIRED_BASIC_ATTACKS && !this.ultimatesUsed[unitId]) {
        this.ultimateReady[unitId] = true;
        this.notifyUltimateReady(unitId);
      }
    },

    /**
     * Update progress UI text
     */
    updateProgressUI(unitId) {
      const progressEl = document.getElementById('equipped-ultimate-progress');
      if (!progressEl) return;

      const count = this.basicAttackCounts[unitId] || 0;
      const max = this.REQUIRED_BASIC_ATTACKS;

      progressEl.textContent = `${Math.min(count, max)} / ${max} Basic Attacks`;

      if (count >= max && !this.ultimatesUsed[unitId]) {
        progressEl.classList.add('ready');
      } else {
        progressEl.classList.remove('ready');
      }
    },

    /**
     * Update button UI state
     */
    updateButtonUI() {
      const button = document.getElementById('equipped-ultimate-btn');
      if (!button) return;

      // Check if any unit is ready
      const anyReady = Object.keys(this.ultimateReady).some(id =>
        this.ultimateReady[id] && !this.ultimatesUsed[id]
      );

      const anyUsed = Object.keys(this.ultimatesUsed).some(id =>
        this.ultimatesUsed[id]
      );

      if (anyUsed) {
        button.classList.remove('ready');
        button.classList.add('used');
        button.disabled = true;
      } else if (anyReady) {
        button.classList.add('ready');
        button.classList.remove('used');
        button.disabled = false;
      } else {
        button.classList.remove('ready', 'used');
        button.disabled = true;
      }
    },

    /**
     * Track when a unit uses a ninjutsu (resets basic attack count)
     * @param {string} unitId - Unit identifier
     */
    onNinjutsuUse(unitId) {
      if (this.basicAttackCounts.hasOwnProperty(unitId)) {
        console.log(`[BattleEquippedUltimate] ${unitId} used ninjutsu - resetting basic attack count`);
        this.basicAttackCounts[unitId] = 0;
        this.ultimateReady[unitId] = false;

        // Update UI
        this.updateProgressUI(unitId);
        this.updateButtonUI();
      }
    },

    /**
     * Check if a unit can use their Last Stand Ultimate
     * @param {string} unitId - Unit identifier
     * @returns {boolean}
     */
    canUseUltimate(unitId) {
      return this.ultimateReady[unitId] === true && this.ultimatesUsed[unitId] === false;
    },

    /**
     * Get Last Stand Ultimate data for a unit
     * @param {Object} unit - Battle unit object
     * @returns {Object|null} Ultimate data or null
     */
    getEquippedUltimateData(unit) {
      if (!unit || !unit.originalId) return null;
      if (typeof window.CharacterEquip === 'undefined') return null;

      const ultimateId = window.CharacterEquip.getEquippedUltimate(unit.originalId);
      if (!ultimateId) return null;

      // Validate that this character can actually equip this ultimate
      if (!window.CharacterEquip.canCharacterEquipUltimate(unit.originalId, ultimateId)) {
        console.warn(`[BattleEquippedUltimate] ${unit.originalId} has ${ultimateId} equipped but cannot use it`);
        return null;
      }

      const ultimateData = window.CharacterEquip.getUltimateData(ultimateId);
      return ultimateData;
    },

    /**
     * Use Last Stand Ultimate
     * @param {string} unitId - Unit identifier
     * @param {Object} ultimate - Ultimate data
     * @param {Array} targets - Target units
     * @returns {Object} Result of ultimate use
     */
    async useUltimate(unitId, ultimate, targets) {
      if (!this.canUseUltimate(unitId)) {
        console.warn(`[BattleEquippedUltimate] ${unitId} cannot use ultimate yet`);
        return { success: false, reason: "Not ready or already used" };
      }

      // Mark as used
      this.ultimatesUsed[unitId] = true;
      this.ultimateReady[unitId] = false;
      this.basicAttackCounts[unitId] = 0;

      console.log(`[BattleEquippedUltimate] ${unitId} using Last Stand Ultimate: ${ultimate.name}`);

      // Show attack name (Storm 4 style)
      if (window.BattleAttackNames) {
        window.BattleAttackNames.showAttackName(ultimate.name, 'ultimate');
      }

      // Apply ultimate effects
      const result = await this.applyUltimateEffects(unitId, ultimate, targets);

      // Show notification
      this.showUltimateNotification(ultimate);

      // Update team HP and check battle end
      if (this.core) {
        setTimeout(() => {
          this.core.updateTeamHP();
          this.core.checkBattleEnd();
        }, 500);
      }

      return { success: true, result };
    },

    /**
     * Apply ultimate effects to targets
     * @param {string} userId - User ID
     * @param {Object} ultimate - Ultimate data
     * @param {Array} targets - Target units
     * @returns {Object} Effect results
     */
    async applyUltimateEffects(userId, ultimate, targets) {
      const results = {
        damage: [],
        healing: [],
        buffs: [],
        debuffs: []
      };

      // Find the attacker unit
      const attacker = this.core?.activeTeam?.find(u => u.id === userId);
      if (!attacker) {
        console.error('[BattleEquippedUltimate] Could not find attacker unit');
        return results;
      }

      for (const effect of ultimate.effects) {
        switch (effect.type) {
          case 'damage':
            // Apply damage to targets using BattleCombat
            for (const target of targets) {
              if (window.BattleCombat && this.core) {
                const { damage, isCritical } = window.BattleCombat.calculateDamage(
                  attacker,
                  target,
                  effect.multiplier || 1.0
                );

                // Apply damage directly
                target.stats.hp = Math.max(0, target.stats.hp - damage);
                results.damage.push({ target: target.id, amount: damage });

                // Show damage animation
                if (window.BattleAnimations) {
                  setTimeout(() => {
                    window.BattleAnimations.showDamage(target, damage, isCritical, this.core.dom);
                  }, 100);
                }

                // Update unit display
                if (this.core.units) {
                  this.core.units.updateUnitDisplay(target, this.core);
                }
              }
            }
            break;

          case 'multi_hit':
            // Multi-hit attack
            for (let i = 0; i < effect.hits; i++) {
              for (const target of targets) {
                if (window.BattleCombat && this.core) {
                  const { damage, isCritical } = window.BattleCombat.calculateDamage(
                    attacker,
                    target,
                    effect.multiplier || 1.0
                  );

                  // Apply damage
                  target.stats.hp = Math.max(0, target.stats.hp - damage);
                  results.damage.push({ target: target.id, amount: damage, hit: i + 1 });

                  // Show damage animation with delay
                  const delay = i * 200;
                  setTimeout(() => {
                    if (window.BattleAnimations) {
                      window.BattleAnimations.showDamage(target, damage, isCritical, this.core.dom);
                    }
                  }, delay);

                  // Update display
                  if (this.core.units) {
                    this.core.units.updateUnitDisplay(target, this.core);
                  }

                  // Wait between hits
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
            }
            break;

          case 'heal':
            // Heal targets
            for (const target of targets) {
              const maxHP = target.stats?.maxHP || target.stats?.hp || 1000;
              const healAmount = Math.floor(maxHP * (effect.percent || 0.3));
              results.healing.push({ target: target.id, amount: healAmount });

              if (target.stats) {
                target.stats.hp = Math.min(target.stats.hp + healAmount, maxHP);

                // Show heal animation
                if (window.BattleAnimations) {
                  setTimeout(() => {
                    window.BattleAnimations.showDamage(target, -healAmount, false, this.core.dom);
                  }, 100);
                }

                // Update display
                if (this.core.units) {
                  this.core.units.updateUnitDisplay(target, this.core);
                }
              }
            }
            break;

          case 'buff':
            // Apply buff
            for (const target of targets) {
              results.buffs.push({
                target: target.id,
                stat: effect.stat,
                multiplier: effect.multiplier,
                duration: effect.duration
              });

              // Apply buff if BattleBuffs is available
              if (typeof window.BattleBuffs !== 'undefined' && window.BattleBuffs.applyBuff) {
                window.BattleBuffs.applyBuff(target, effect.stat, effect.multiplier, effect.duration);
              }
            }
            break;

          case 'debuff':
            // Apply debuff
            for (const target of targets) {
              results.debuffs.push({
                target: target.id,
                status: effect.status || effect.stat,
                duration: effect.duration
              });

              // Apply debuff if BattleBuffs is available
              if (typeof window.BattleBuffs !== 'undefined' && window.BattleBuffs.applyDebuff) {
                window.BattleBuffs.applyDebuff(target, effect.status || effect.stat, effect.duration);
              }
            }
            break;

          case 'cleanse':
            // Remove debuffs
            for (const target of targets) {
              if (typeof window.BattleBuffs !== 'undefined' && window.BattleBuffs.cleanse) {
                window.BattleBuffs.cleanse(target);
              }
            }
            break;
        }
      }

      return results;
    },

    /**
     * Calculate damage for ultimate effect
     * @param {string} userId - Attacker ID
     * @param {Object} target - Target unit
     * @param {Object} effect - Effect data
     * @returns {number} Damage amount
     */
    calculateDamage(userId, target, effect) {
      // Get attacker (simplified - should fetch from BattleCore.combatants)
      const attacker = { atk: 500 }; // Placeholder - replace with actual unit lookup

      let damage = attacker.atk * (effect.multiplier || 1);

      // Apply defense reduction
      if (effect.ignoreDefense) {
        const defenseReduction = target.def ? target.def * (1 - effect.ignoreDefense) : 0;
        damage = damage - defenseReduction;
      } else {
        damage = damage - (target.def || 0);
      }

      // Guaranteed crit
      if (effect.guaranteedCrit) {
        damage *= 1.5;
      }

      return Math.max(Math.floor(damage), 1);
    },

    /**
     * Notify that ultimate is ready
     * @param {string} unitId - Unit identifier
     */
    notifyUltimateReady(unitId) {
      console.log(`[BattleEquippedUltimate] ULTIMATE READY for ${unitId}!`);

      // Show visual indicator on unit
      const unitElement = document.querySelector(`[data-unit-id="${unitId}"]`);
      if (unitElement) {
        unitElement.classList.add('ultimate-ready');

        // Add glowing effect
        const indicator = document.createElement('div');
        indicator.className = 'ultimate-ready-indicator';
        indicator.textContent = 'ULTIMATE READY!';
        unitElement.appendChild(indicator);
      }

      // Update button UI
      this.updateButtonUI();
    },

    /**
     * Show ultimate activation notification
     * @param {Object} ultimate - Ultimate data
     */
    showUltimateNotification(ultimate) {
      // Create notification element
      const notification = document.createElement('div');
      notification.className = 'equipped-ultimate-notification';
      notification.innerHTML = `
        <div class="ultimate-notification-icon">${ultimate.icon}</div>
        <div class="ultimate-notification-text">
          <div class="ultimate-notification-title">${ultimate.name}</div>
          <div class="ultimate-notification-desc">${ultimate.description}</div>
        </div>
      `;

      document.body.appendChild(notification);

      // Animate in
      setTimeout(() => notification.classList.add('show'), 100);

      // Remove after 3 seconds
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    },

    /**
     * Reset state for new battle
     */
    reset() {
      console.log("[BattleEquippedUltimate] Resetting state");
      this.basicAttackCounts = {};
      this.ultimatesUsed = {};
      this.ultimateReady = {};
    }
  };

  // Export to global
  window.BattleEquippedUltimate = BattleEquippedUltimate;
})();
