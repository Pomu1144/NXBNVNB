// js/battle/battle-chakra.js - Click-Based Chakra Activation System
(() => {
  "use strict";

  /**
   * BattleChakra Module
   * Handles multi-click chakra activation for Jutsu/Ultimate/Secret modes
   *
   * System:
   * - 1 click + 4 chakra  = Blue mode (Jutsu ready)
   * - 2 clicks + 8 chakra = Red mode (Ultimate ready)
   * - 3 clicks + 10 chakra = Purple mode (Secret Jutsu ready)
   *
   * Features:
   * - Click counter with visual feedback
   * - 400ms click window for combos
   * - Color-changing chakra bar
   * - Auto-reset on timeout
   */
  const BattleChakra = {
    // ===== State =====
    clickCount: 0,
    clickTimeout: null,
    lastClickedUnit: null,
    CLICK_WINDOW: 400, // Milliseconds for multi-click combo

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

      // Check chakra requirements for each mode
      if (this.clickCount === 1 && unit.chakra >= 4) {
        unit.chakraMode = "JUTSU";
        core.queuedAction = "jutsu";
        console.log(`[Chakra] 🔵 ${unit.name} - Blue mode (Jutsu ready, ${unit.chakra}/10 chakra)`);
      } else if (this.clickCount === 2 && unit.chakra >= 8) {
        unit.chakraMode = "ULTIMATE";
        core.queuedAction = "ultimate";
        console.log(`[Chakra] 🔴 ${unit.name} - Red mode (Ultimate ready, ${unit.chakra}/10 chakra)`);
      } else if (this.clickCount === 3 && unit.chakra >= 10) {
        unit.chakraMode = "SECRET";
        core.queuedAction = "secret";
        console.log(`[Chakra] 🟣 ${unit.name} - Secret mode (Secret Jutsu ready, ${unit.chakra}/10 chakra)`);
      } else {
        // Insufficient chakra for requested mode
        const required = this.clickCount === 1 ? 4 : this.clickCount === 2 ? 8 : 10;
        console.log(`[Chakra] ⚠️ ${unit.name} - Insufficient chakra (have ${unit.chakra}, need ${required})`);
        this.resetChakraMode(unit, core);
        return;
      }

      // Update visual state
      this.updateUnitChakraDisplay(unit, core);
      this.highlightEnemies(core);

      // Set timeout to auto-reset if no enemy clicked
      this.clickTimeout = setTimeout(() => {
        console.log(`[Chakra] ⏱️ ${unit.name} - Click window expired, resetting mode`);
        this.resetChakraMode(unit, core);
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

      console.log(`[Chakra] 🎯 ${currentUnit.name} targets ${targetUnit.name} with ${core.queuedAction}`);

      if (core.queuedAction === "attack") {
        this.executeAttack(targetUnit, core);
      } else if (core.queuedAction === "jutsu") {
        this.executeJutsu(targetUnit, core);
      } else if (core.queuedAction === "ultimate" || core.queuedAction === "secret") {
        this.executeUltimate(core);
      }
    },

    /**
     * Execute basic attack
     */
    executeAttack(target, core) {
      const currentUnit = core.turns?.currentUnit || core.currentUnit;
      if (window.BattleCombat && currentUnit) {
        window.BattleCombat.performAttack(currentUnit, target, core);
      }
      if (core.turns) {
        core.turns.endTurn(core);
      } else {
        core.endTurn();
      }
    },

    /**
     * Execute jutsu attack
     */
    executeJutsu(target, core) {
      const currentUnit = core.turns?.currentUnit || core.currentUnit;
      if (window.BattleCombat && currentUnit) {
        const success = window.BattleCombat.performJutsu(currentUnit, target, core);
        if (success) {
          if (core.turns) {
            core.turns.endTurn(core);
          } else {
            core.endTurn();
          }
        } else {
          console.log("[Chakra] ❌ Jutsu failed (insufficient chakra)");
          this.resetChakraMode(currentUnit, core);
        }
      }
    },

    /**
     * Execute ultimate (hits all enemies)
     */
    executeUltimate(core) {
      const currentUnit = core.turns?.currentUnit || core.currentUnit;
      const targets = core.enemyTeam.filter(u => u.stats.hp > 0);

      if (window.BattleCombat && currentUnit) {
        const success = window.BattleCombat.performUltimate(currentUnit, targets, core);
        if (success) {
          if (core.turns) {
            core.turns.endTurn(core);
          } else {
            core.endTurn();
          }
        } else {
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
      if (unit.chakra >= 10 && unit.chakraMode === "SECRET") return "secret";
      if (unit.chakra >= 8 && unit.chakraMode === "ULTIMATE") return "red";
      if (unit.chakra >= 4 && unit.chakraMode === "JUTSU") return "blue";
      return "neutral";
    },

    /**
     * Show visual click counter above unit
     * @param {Object} unit - Unit being clicked
     * @param {number} count - Current click count
     * @param {Object} core - Reference to BattleManager
     */
    showClickCounter(unit, count, core) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
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
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
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

      let statusText = "Click unit for Jutsu";
      let statusClass = "neutral";

      // Determine available modes based on chakra
      if (unit.chakra >= 10) {
        statusText = "3× clicks for Secret";
        statusClass = "secret";
      } else if (unit.chakra >= 8) {
        statusText = "2× clicks for Ultimate";
        statusClass = "red";
      } else if (unit.chakra >= 4) {
        statusText = "1× click for Jutsu";
        statusClass = "blue";
      }

      // Show current active mode
      if (unit.chakraMode !== "NONE") {
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
          available: unit.chakra >= 4
        },
        ULTIMATE: {
          name: "Ultimate",
          color: "#FF4D4D",
          icon: "",
          available: unit.chakra >= 8
        },
        SECRET: {
          name: "Secret Jutsu",
          color: "#C000FF",
          icon: "",
          available: unit.chakra >= 10
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
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
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

      if (unit.chakra >= 4) actions.push("jutsu");
      if (unit.chakra >= 8) actions.push("ultimate");
      if (unit.chakra >= 10) actions.push("secret");

      return actions;
    }
  };

  // Export to window
  window.BattleChakra = BattleChakra;

  console.log("[BattleChakra] Module loaded ✅");
})();
