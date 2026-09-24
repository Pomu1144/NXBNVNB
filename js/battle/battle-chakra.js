// js/battle/battle-chakra.js - Click-Based Chakra Activation System
(() => {
  "use strict";

  /**
   * BattleChakra Module
   * Handles multi-click chakra activation for Jutsu/Ultimate/Secret modes
   *
   * System (costs are per unit: BattleCombat.getSkillChakraCost):
   * - 1 click  + jutsu cost    = Blue mode (Jutsu ready)
   * - 2 clicks + ultimate cost = Red mode (Ultimate ready)
   * - 3 clicks + secret cost   = Purple mode (Secret Jutsu ready)
   *
   * Features:
   * - Click counter with visual feedback
   * - 400ms click window for combos
   * - Color-changing chakra bar
   * - Armed mode persists until an enemy is targeted or the turn ends
   */
  const BattleChakra = {
    // ===== State =====
    clickCount: 0,
    clickTimeout: null,
    lastClickedUnit: null,
    CLICK_WINDOW: 400, // Milliseconds for multi-click combo

    /**
     * Effective jutsu / ultimate / secret costs + unlock state for a unit
     * (BattleCombat.getSkillChakraCost: chakraCostMax when maxed).
     */
    getModeCosts(unit) {
      const C = window.BattleCombat;
      const skills = C?.getUnitSkills?.(unit) || {};
      const cost = (entry, fb) => entry
        ? (C?.getSkillChakraCost ? C.getSkillChakraCost(unit, entry, fb) : Number(entry.data?.chakraCost ?? fb))
        : Infinity;
      return {
        jutsu: cost(skills.jutsu, 4),
        ultimate: cost(skills.ultimate, 8),
        secret: cost(skills.secret, 12),
        jutsuOk: !!skills.jutsu && (C?.isJutsuUnlocked?.(unit) ?? true) && !((unit.jutsuCooldown || 0) > 0) && !C?.isSkillSealed?.(unit, 'jutsu'),
        ultOk: !!skills.ultimate && (C?.isUltimateUnlocked?.(unit) ?? true) && !((unit.ultimateCooldown || 0) > 0) && !C?.isSkillSealed?.(unit, 'ultimate'),
        secretOk: !!skills.secret && (C?.isSecretUnlocked?.(unit) ?? false) && !C?.isSkillSealed?.(unit, 'secret')
      };
    },

    /**
     * Handle unit click for chakra activation
     * @param {Object} unit - The unit being clicked
     * @param {Object} core - Reference to BattleManager
     */
    handleChakraClick(unit, core) {
      // Reset counter if clicking different unit
      if (this.lastClickedUnit !== unit) {
        this.clickCount = 0;
        this.lastClickedUnit = unit;
      }

      this.clickCount++;
      this.showClickCounter(unit, this.clickCount, core);

      // Clear previous timeout
      if (this.clickTimeout) clearTimeout(this.clickTimeout);

      // Check chakra requirements for each mode (effective per-unit costs)
      const costs = this.getModeCosts(unit);
      if (this.clickCount === 1 && costs.jutsuOk && unit.chakra >= costs.jutsu) {
        unit.chakraMode = "JUTSU";
        core.queuedAction = "jutsu";
        console.log(`[Chakra] 🔵 ${unit.name} - Blue mode (Jutsu ready, ${unit.chakra}/10 chakra)`);
      } else if (this.clickCount === 2 && costs.ultOk && unit.chakra >= costs.ultimate) {
        unit.chakraMode = "ULTIMATE";
        core.queuedAction = "ultimate";
        console.log(`[Chakra] 🔴 ${unit.name} - Red mode (Ultimate ready, ${unit.chakra}/10 chakra)`);
      } else if (this.clickCount === 3 && costs.secretOk && unit.chakra >= costs.secret) {
        unit.chakraMode = "SECRET";
        core.queuedAction = "secret";
        console.log(`[Chakra] 🟣 ${unit.name} - Secret mode (Secret Jutsu ready, ${unit.chakra}/10 chakra)`);
      } else {
        // Insufficient chakra for requested mode
        const kind = this.clickCount === 1 ? 'jutsu' : this.clickCount === 2 ? 'ultimate' : 'secret';
        const required = costs[kind];
        console.log(`[Chakra] ⚠️ ${unit.name} - ${kind} unavailable (have ${unit.chakra}, need ${required})`);
        if (this.clickCount <= 3 && Number.isFinite(required)) {
          const ok = kind === 'jutsu' ? costs.jutsuOk : kind === 'ultimate' ? costs.ultOk : costs.secretOk;
          window.BattleNarrator?.narrate?.(ok
            ? `Not enough chakra for ${kind} (need ${required}, have ${unit.chakra})`
            : `${kind[0].toUpperCase() + kind.slice(1)} unavailable`, core);
        }
        this.resetChakraMode(unit, core);
        return;
      }

      // Update visual state
      this.updateUnitChakraDisplay(unit, core);
      this.highlightEnemies(core);

      // The click window only groups taps into a 1×/2×/3× combo. The
      // selected mode stays armed until the player targets an enemy (tap or
      // drag) or the turn ends — it used to be cleared after 400 ms, so a
      // jutsu/ultimate selected by tapping the unit was lost before the
      // player could reach the enemy.
      this.clickTimeout = setTimeout(() => {
        this.clickCount = 0;
        this.lastClickedUnit = null;
      }, this.CLICK_WINDOW);
    },

    /**
     * Handle clicking enemy target after chakra mode set
     * @param {Object} targetUnit - Enemy unit clicked
     * @param {Object} core - Reference to BattleManager
     */
    handleEnemyTarget(targetUnit, core) {
      const currentUnit = core.turns?.currentUnit || core.currentUnit;
      if (!core.queuedAction || !currentUnit) return;

      // Consume the action immediately — prevents re-clicks during animation
      const action = core.queuedAction;
      core.queuedAction = null;
      this.clearEnemyHighlights(core);

      console.log(`[Chakra] 🎯 ${currentUnit.name} targets ${targetUnit.name} with ${action}`);

      if (action === "attack") {
        this.executeAttack(targetUnit, core, currentUnit);
      } else if (action === "jutsu") {
        this.executeJutsu(targetUnit, core, currentUnit);
      } else if (action === "ultimate") {
        this.executeUltimate(core, currentUnit);
      } else if (action === "secret") {
        const endIt = () => { if (core.turns?.currentUnit === currentUnit) core.turns.endTurn(core); };
        if (!window.BattleCombat?.performSecret(currentUnit, core, endIt)) {
          this.resetChakraMode(currentUnit, core);
        }
      }
    },

    /**
     * Execute basic attack
     */
    executeAttack(target, core, actingUnit) {
      const currentUnit = actingUnit || core.turns?.currentUnit || core.currentUnit;
      if (window.BattleCombat && currentUnit) {
        window.BattleCombat.performAttack(currentUnit, target, core, () => {
          // Unit-token guard: only end turn if this is still the same unit's turn
          if (core.turns?.currentUnit === currentUnit) {
            if (core.turns) core.turns.endTurn(core);
            else core.endTurn();
          }
        });
      }
    },

    /**
     * Execute jutsu attack
     */
    executeJutsu(target, core, actingUnit) {
      const currentUnit = actingUnit || core.turns?.currentUnit || core.currentUnit;
      if (window.BattleCombat && currentUnit) {
        const success = window.BattleCombat.performJutsu(currentUnit, target, core, () => {
          if (core.turns?.currentUnit === currentUnit) {
            if (core.turns) core.turns.endTurn(core);
            else core.endTurn();
          }
        });
        if (!success) {
          console.log("[Chakra] ❌ Jutsu failed (insufficient chakra)");
          this.resetChakraMode(currentUnit, core);
        }
      }
    },

    /**
     * Execute ultimate (hits all enemies)
     */
    executeUltimate(core, actingUnit) {
      const currentUnit = actingUnit || core.turns?.currentUnit || core.currentUnit;
      const targets = core.enemyTeam.filter(u => u.stats.hp > 0);

      if (window.BattleCombat && currentUnit) {
        const success = window.BattleCombat.performUltimate(currentUnit, targets, core, () => {
          if (core.turns?.currentUnit === currentUnit) {
            if (core.turns) core.turns.endTurn(core);
            else core.endTurn();
          }
        });
        if (!success) {
          console.log("[Chakra] ❌ Ultimate failed (insufficient chakra)");
          this.resetChakraMode(currentUnit, core);
        }
      }
    },

    /**
     * Reset chakra mode and clear state
     * @param {Object} unit - Unit to reset
     * @param {Object} core - Reference to BattleManager
     */
    resetChakraMode(unit, core) {
      if (!unit) return;

      unit.chakraMode = "NONE";
      this.clickCount = 0;
      this.lastClickedUnit = null;
      core.queuedAction = null;

      this.updateUnitChakraDisplay(unit, core);
      this.clearEnemyHighlights(core);

      console.log(`[Chakra] 🔄 ${unit.name} - Mode reset`);
    },

    /**
     * Get CSS class for chakra bar based on mode
     * @param {Object} unit - Unit to check
     * @returns {string} CSS class name
     */
    getChakraClass(unit) {
      if (unit.chakraMode === "SECRET") return "secret";
      if (unit.chakraMode === "ULTIMATE") return "red";
      if (unit.chakraMode === "JUTSU") return "blue";
      return "neutral";
    },

    /**
     * Show visual click counter above unit
     * @param {Object} unit - Unit being clicked
     * @param {number} count - Current click count
     * @param {Object} core - Reference to BattleManager
     */
    showClickCounter(unit, count, core) {
      const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      // Remove existing counter
      const existing = unitEl.querySelector('.click-counter');
      if (existing) existing.remove();

      // Create new counter
      const counter = document.createElement('div');
      counter.className = 'click-counter';
      counter.textContent = `${count}×`;
      unitEl.appendChild(counter);

      // Auto-remove after animation
      setTimeout(() => counter.remove(), 400);
    },

    /**
     * Update unit's chakra bar display
     * @param {Object} unit - Unit to update
     * @param {Object} core - Reference to BattleManager
     */
    updateUnitChakraDisplay(unit, core) {
      const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const chakraBar = unitEl.querySelector(".chakra-fill");
      if (chakraBar) {
        const chakraPercent = (unit.chakra / unit.maxChakra) * 100;
        chakraBar.style.width = `${chakraPercent}%`;
        chakraBar.className = `chakra-fill ${this.getChakraClass(unit)}`;
      }
    },

    /**
     * Highlight all targetable enemies
     * @param {Object} core - Reference to BattleManager
     */
    highlightEnemies(core) {
      core.dom.scene?.querySelectorAll(".battle-unit").forEach(el => {
        const unit = core.combatants.find(u => u.id === el.dataset.unitId);
        if (unit && !unit.isPlayer && unit.stats.hp > 0) {
          el.style.filter = "drop-shadow(0 0 15px rgba(255, 234, 120, 0.9))";
        }
      });
    },

    /**
     * Clear enemy highlights
     * @param {Object} core - Reference to BattleManager
     */
    clearEnemyHighlights(core) {
      core.dom.scene?.querySelectorAll(".battle-unit").forEach(el => {
        el.style.filter = "";
      });
    },

    /**
     * Update action panel chakra status display
     * @param {Object} unit - Current unit
     * @param {Object} core - Reference to BattleManager
     */
    updateActionPanelStatus(unit, core) {
      let chakraStatusEl = document.getElementById("action-chakra-status");
      if (!chakraStatusEl) {
        chakraStatusEl = document.createElement("div");
        chakraStatusEl.id = "action-chakra-status";
        core.dom.actionChakra?.parentNode?.appendChild(chakraStatusEl);
      }

      const costs = this.getModeCosts(unit);
      let statusText = costs.jutsuOk ? `Jutsu needs ${costs.jutsu} chakra` : "Click unit for Jutsu";
      let statusClass = "neutral";

      // Determine available modes based on effective costs
      if (costs.secretOk && unit.chakra >= costs.secret) {
        statusText = "3× clicks for Secret";
        statusClass = "secret";
      } else if (costs.ultOk && unit.chakra >= costs.ultimate) {
        statusText = "2× clicks for Ultimate";
        statusClass = "red";
      } else if (costs.jutsuOk && unit.chakra >= costs.jutsu) {
        statusText = "1× click for Jutsu";
        statusClass = "blue";
      }

      // Show current active mode
      if (unit.chakraMode && unit.chakraMode !== "NONE") {
        statusText = `${unit.chakraMode} MODE ACTIVE`;
        statusClass = unit.chakraMode.toLowerCase();
      }

      chakraStatusEl.textContent = statusText;
      chakraStatusEl.className = statusClass;
    },

    /**
     * Handle unit click routing (chakra vs targeting)
     * @param {Object} unit - Unit that was clicked
     * @param {Object} core - Reference to BattleManager
     */
    handleUnitClick(unit, core) {
      const isPlayerTurn = core.turns?.isPlayerTurn ?? core.isPlayerTurn;
      const currentUnit = core.turns?.currentUnit || core.currentUnit;

      // Click on own unit during own turn = chakra activation
      if (unit.isPlayer &&
          isPlayerTurn &&
          currentUnit &&
          unit.id === currentUnit.id) {
        this.handleChakraClick(unit, core);
      }
      // Click on enemy during player turn = target selection
      else if (!unit.isPlayer &&
               isPlayerTurn &&
               currentUnit &&
               unit.stats.hp > 0) {
        this.handleEnemyTarget(unit, core);
      }
    },

    /**
     * Get chakra mode info for display
     * @param {Object} unit - Unit to check
     * @returns {Object} Mode info {name, color, icon, available}
     */
    getChakraModeInfo(unit) {
      const modes = {
        NONE: {
          name: "Normal",
          color: "#888",
          icon: "",
          available: true
        },
        JUTSU: {
          name: "Jutsu",
          color: "#00BFFF",
          icon: "",
          available: unit.chakra >= this.getModeCosts(unit).jutsu
        },
        ULTIMATE: {
          name: "Ultimate",
          color: "#FF4D4D",
          icon: "",
          available: unit.chakra >= this.getModeCosts(unit).ultimate
        },
        SECRET: {
          name: "Secret Jutsu",
          color: "#C000FF",
          icon: "",
          available: unit.chakra >= this.getModeCosts(unit).secret
        }
      };

      return modes[unit.chakraMode] || modes.NONE;
    },

    /**
     * Initialize chakra system for a unit
     * @param {Object} unit - Unit to initialize
     */
    initUnit(unit) {
      unit.chakra = unit.chakra || 0;
      unit.maxChakra = 10; // Fixed max
      unit.chakraMode = "NONE";
      unit.clickCount = 0;
    },

    /**
     * Add chakra to unit (from attacks, guards, etc.)
     * @param {Object} unit - Unit receiving chakra
     * @param {number} amount - Chakra amount to add
     * @param {Object} core - Reference to BattleManager
     */
    addChakra(unit, amount, core) {
      // Chakra Recovery Sealing: no chakra gain
      if (amount > 0 && window.BattleBuffs && !window.BattleBuffs.canGainChakra(unit)) {
        console.log(`[Chakra] 🔒 ${unit.name} is chakra recovery sealed (+${amount} blocked)`);
        window.StatusEffectUI?.popup?.(unit, 'Chakra Sealed', '#7fb8ff', 'chakra_seal');
        return 0;
      }
      const before = unit.chakra;
      unit.chakra = Math.min(unit.maxChakra, unit.chakra + amount);
      const gained = unit.chakra - before;

      if (gained > 0) {
        console.log(`[Chakra] 💠 ${unit.name} gained ${gained} chakra (${unit.chakra}/${unit.maxChakra})`);
        this.updateUnitChakraDisplay(unit, core);

        // Show floating chakra gain
        if (window.BattleAnimations) {
          this.showChakraGain(unit, gained, core);
        }

        // Animate chakra wheel (blue orb flying in) and update display
        if (window.BattleChakraWheel) {
          window.BattleChakraWheel.animateChakraGain(unit, gained, core);
        }

        // Update team holder chakra display
        if (core.teamHolder) {
          core.teamHolder.updateUnitChakra(unit, core);
        }
      }

      return gained;
    },

    /**
     * Spend chakra for skill
     * @param {Object} unit - Unit spending chakra
     * @param {number} cost - Chakra cost
     * @param {Object} core - Reference to BattleManager
     * @returns {boolean} True if spent successfully
     */
    spendChakra(unit, cost, core) {
      if (unit.chakra < cost) {
        console.log(`[Chakra] ❌ ${unit.name} - Cannot spend ${cost} chakra (have ${unit.chakra})`);
        return false;
      }

      unit.chakra -= cost;
      console.log(`[Chakra] 💸 ${unit.name} spent ${cost} chakra (${unit.chakra}/${unit.maxChakra} remaining)`);
      this.updateUnitChakraDisplay(unit, core);

      // Update chakra wheel display
      if (window.BattleChakraWheel) {
        window.BattleChakraWheel.updateChakraWheel(unit, core);
      }

      return true;
    },

    /**
     * Show floating chakra gain number
     * @param {Object} unit - Unit that gained chakra
     * @param {number} amount - Amount gained
     * @param {Object} core - Reference to BattleManager
     */
    showChakraGain(unit, amount, core) {
      const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const rect = unitEl.getBoundingClientRect();
      const sceneRect = core.dom.scene?.getBoundingClientRect();

      const x = rect.left - sceneRect.left + rect.width / 2;
      const y = rect.top - sceneRect.top;

      const chakraText = document.createElement("div");
      chakraText.className = "damage-number chakra-gain";
      chakraText.textContent = `+${amount}`;
      chakraText.style.left = `${x}px`;
      chakraText.style.top = `${y}px`;
      chakraText.style.color = "#00D4FF";
      chakraText.style.textShadow = "0 0 10px rgba(0, 212, 255, 0.9)";

      core.dom.damageLayer?.appendChild(chakraText);

      setTimeout(() => chakraText.remove(), 1000);
    },

    /**
     * Get all available actions for current chakra level
     * @param {Object} unit - Unit to check
     * @returns {Array} Available action names
     */
    getAvailableActions(unit) {
      const actions = ["attack"];
      const costs = this.getModeCosts(unit);

      if (costs.jutsuOk && unit.chakra >= costs.jutsu) actions.push("jutsu");
      if (costs.ultOk && unit.chakra >= costs.ultimate) actions.push("ultimate");
      if (costs.secretOk && unit.chakra >= costs.secret) actions.push("secret");

      return actions;
    }
  };

  // Export to window
  window.BattleChakra = BattleChakra;

  console.log("[BattleChakra] Module loaded ✅");
})();
