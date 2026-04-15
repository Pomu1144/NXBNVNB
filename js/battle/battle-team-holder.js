// js/battle/battle-team-holder.js - Team Holder UI with Chakra Wheels
(() => {
  "use strict";

  /**
   * BattleTeamHolder Module
   * Renders the team holder UI at bottom of screen showing all player units
   * Each unit displays with portrait and chakra wheel
   *
   * Features:
   * - Active units (larger portraits, 80px)
   * - Bench units (smaller portraits, 60px)
   * - Chakra wheels attached to each portrait
   * - HP bars under each unit
   * - Acting unit highlighted
   */
  const BattleTeamHolder = {
    // DOM references
    teamHolder: null,
    activeUnitsRow: null,
    benchUnitsRow: null,

    // Switch lock to prevent concurrent switches
    isSwitching: false,

    /* ===== Initialization ===== */

    /**
     * Initialize team holder
     */
    init(core) {
      this.teamHolder = document.getElementById('team-holder');

      if (!this.teamHolder) {
        console.error('[TeamHolder] Team holder element not found!');
        return false;
      }

      console.log('[TeamHolder] Initialized');
      return true;
    },

    /* ===== Rendering ===== */

    /**
     * Render all player units in team holder
     * ALWAYS creates 4 unit cards (4 active + 4 bench), each with nested active+bench portraits
     */
    renderTeamHolder(core) {
      if (!this.teamHolder) {
        console.error('[TeamHolder] Not initialized - teamHolder element not found!');
        return;
      }

      console.log('[TeamHolder] ========== RENDERING TEAM HOLDER ==========');
      console.log('[TeamHolder] Active team:', core.activeTeam?.length || 0, 'units');
      console.log('[TeamHolder] Bench team:', core.benchTeam?.length || 0, 'units');

      // ALWAYS render exactly 4 unit cards (4 active + 4 bench)
      const TEAM_SIZE = 4;

      this.teamHolder.innerHTML = '';

      for (let i = 0; i < TEAM_SIZE; i++) {
        const activeUnit = core.activeTeam?.[i];
        const benchUnit = core.benchTeam?.[i];

        // Create card even if unit is missing (will show placeholder)
        if (activeUnit) {
          const cardHTML = this.createUnitCardHTML(activeUnit, benchUnit, i);
          this.teamHolder.insertAdjacentHTML('beforeend', cardHTML);
        }
      }

      // Attach chakra wheels to all portraits
      this.attachAllChakraWheels(core);

      console.log('[TeamHolder] ========== TEAM HOLDER RENDERED (4 active + 4 bench) ==========');
    },

    /**
     * Create HTML for a unit card (active + bench nested)
     */
    createUnitCardHTML(activeUnit, benchUnit, index) {
      const activeHpPercent = Math.max(0, (activeUnit.stats.hp / activeUnit.stats.maxHP) * 100);
      const isDead = activeUnit.stats.hp <= 0;

      let benchHTML = '';
      if (benchUnit) {
        benchHTML = `
          <div class="bench-portrait-container" data-unit-id="${benchUnit.id}" data-unit-type="bench" draggable="true">
            <img src="${benchUnit.portrait}" alt="${benchUnit.name}" draggable="false"
                 onerror="this.src='assets/characters/common/silhouette.png';">
          </div>
        `;
      }

      return `
        <div class="unit-card ${isDead ? 'is-dead' : ''}" data-card-index="${index}">
          <div class="active-portrait-container" data-unit-id="${activeUnit.id}" data-unit-type="active" data-drop-zone="true">
            <img src="${activeUnit.portrait}" alt="${activeUnit.name}" draggable="false"
                 onerror="this.src='assets/characters/common/silhouette.png';">
            ${benchHTML}
          </div>
          <div class="unit-info">
            <div class="unit-name">${activeUnit.name}</div>
            <div class="unit-hp-bar">
              <div class="unit-hp-fill" style="width: ${activeHpPercent}%"></div>
            </div>
          </div>
        </div>
      `;
    },

    /**
     * Attach chakra wheels to all unit portraits and add switch listeners
     */
    attachAllChakraWheels(core) {
      // Attach to active portraits
      this.teamHolder.querySelectorAll('[data-unit-type="active"]').forEach(container => {
        const unitId = container.dataset.unitId;
        const unit = core.activeTeam.find(u => u.id === unitId);
        if (unit && window.BattleChakraWheel) {
          if (!window.BattleChakraWheel.getWheel(unit.id)) {
            console.log(`[TeamHolder] Creating chakra wheel for active unit: ${unit.name}`);
            window.BattleChakraWheel.createChakraWheel(unit, container, false);
          }
          window.BattleChakraWheel.updateChakraWheel(unit, core);
        }

        // Add drag over and drop listeners to active containers
        container.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          container.classList.add('drag-over');
        });

        container.addEventListener('dragleave', (e) => {
          container.classList.remove('drag-over');
        });

        container.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          container.classList.remove('drag-over');

          const benchUnitId = e.dataTransfer.getData('text/plain');
          const benchUnit = core.benchTeam.find(u => u.id === benchUnitId);
          const activeUnit = core.activeTeam.find(u => u.id === unitId);

          if (benchUnit && activeUnit) {
            const cardIndex = container.closest('.unit-card').dataset.cardIndex;
            this.switchUnits(parseInt(cardIndex), core);
          }
        });
      });

      // Attach to bench portraits and add click listeners + drag listeners for switching
      this.teamHolder.querySelectorAll('[data-unit-type="bench"]').forEach(container => {
        const unitId = container.dataset.unitId;
        const unit = core.benchTeam.find(u => u.id === unitId);
        if (unit && window.BattleChakraWheel) {
          if (!window.BattleChakraWheel.getWheel(unit.id)) {
            console.log(`[TeamHolder] Creating chakra wheel for bench unit: ${unit.name}`);
            window.BattleChakraWheel.createChakraWheel(unit, container, true);
          }
          window.BattleChakraWheel.updateChakraWheel(unit, core);
        }

        // Add click listener for switching
        container.addEventListener('click', (e) => {
          e.stopPropagation();
          const cardIndex = container.closest('.unit-card').dataset.cardIndex;
          this.switchUnits(parseInt(cardIndex), core);
        });

        // Add drag start listener for drag-and-drop switching
        container.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', unitId);
          container.style.opacity = '0.5';
          console.log(`[TeamHolder] Dragging bench unit: ${unit.name}`);
        });

        container.addEventListener('dragend', (e) => {
          container.style.opacity = '1';
        });
      });
    },

    /**
     * Attach chakra wheel to a unit element
     */
    attachChakraWheel(unit, unitElement, isActive) {
      const portraitContainer = unitElement.querySelector('.portrait-container');
      if (!portraitContainer) {
        console.warn(`[TeamHolder] No portrait container for ${unit.name}`);
        return;
      }

      // Create chakra wheel using BattleChakraWheel module
      if (window.BattleChakraWheel) {
        const portrait = portraitContainer.querySelector('img');
        if (portrait) {
          // Check if wheel already exists
          if (!window.BattleChakraWheel.getWheel(unit.id)) {
            console.log(`[TeamHolder] Creating chakra wheel for ${unit.name} (${isActive ? 'active' : 'bench'})`);
            window.BattleChakraWheel.createChakraWheel(unit, portraitContainer, !isActive);
          }
          // Update wheel display
          window.BattleChakraWheel.updateChakraWheel(unit, window.BattleManager || {});
        }
      }
    },

    /* ===== Unit Switching ===== */

    /**
     * Switch active and bench units with animation
     * INDEPENDENT of attack selection - does NOT interfere with input state
     * @param {number} cardIndex - Index of the unit card (0-3)
     * @param {Object} core - Battle core reference
     */
    switchUnits(cardIndex, core) {
      // Prevent concurrent switches
      if (this.isSwitching) {
        console.warn(`[TeamHolder] Already switching, ignoring request`);
        return;
      }

      const activeUnit = core.activeTeam[cardIndex];
      const benchUnit = core.benchTeam[cardIndex];

      if (!activeUnit || !benchUnit) {
        console.warn(`[TeamHolder] Cannot switch - missing unit at index ${cardIndex}`);
        return;
      }

      // CRITICAL: Only allow switching during the active unit's turn (prevents speed abuse)
      if (core.turns && core.turns.getCurrentUnit() !== activeUnit) {
        console.warn(`[TeamHolder] Cannot switch - not ${activeUnit.name}'s turn (currently ${core.turns.getCurrentUnit()?.name || 'none'})`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`Can only switch during ${activeUnit.name}'s turn!`, core);
        }
        return;
      }

      console.log(`[TeamHolder] Switching ${activeUnit.name} ↔ ${benchUnit.name}`);

      // Lock switching
      this.isSwitching = true;

      // Notify input manager (for tracking only, doesn't affect attack state)
      if (window.BattleInputManager) {
        window.BattleInputManager.handleUnitSwitch(cardIndex);
      }

      // Get the card element
      const card = this.teamHolder.querySelector(`[data-card-index="${cardIndex}"]`);
      if (!card) {
        this.isSwitching = false; // Unlock if card not found
        return;
      }

      const activeContainer = card.querySelector('.active-portrait-container');
      const benchContainer = card.querySelector('.bench-portrait-container');

      if (!activeContainer || !benchContainer) {
        this.isSwitching = false; // Unlock if containers not found
        return;
      }

      // Add switching animation classes
      activeContainer.classList.add('switching');
      benchContainer.classList.add('switching');

      // Create sparkle trail effects
      this.createSparkleTrail(benchContainer);

      // Perform the swap after animation starts
      setTimeout(() => {
        // Update unit flags BEFORE swapping
        const oldActiveUnit = core.activeTeam[cardIndex];
        const oldBenchUnit = core.benchTeam[cardIndex];

        // Store the battlefield position from the active unit
        const savedPos = oldActiveUnit.pos ? { ...oldActiveUnit.pos } : { x: 50, y: 50 };

        // Update unit flags
        oldActiveUnit.isActive = false;
        oldActiveUnit.isBench = true;
        oldBenchUnit.isActive = true;
        oldBenchUnit.isBench = false;

        // Transfer battlefield position to incoming unit (CRITICAL: prevents unit from disappearing)
        oldBenchUnit.pos = savedPos;
        oldActiveUnit.pos = { x: 0, y: 0 }; // Clear position for bench unit

        // Reset speed gauge for incoming unit
        oldBenchUnit.speedGauge = 0;

        // Swap units in the team arrays
        [core.activeTeam[cardIndex], core.benchTeam[cardIndex]] =
          [oldBenchUnit, oldActiveUnit];

        // Update combatants list to reflect the swap on battlefield
        if (core.updateCombatants) {
          core.updateCombatants();
        }

        // Update field/buddy skills for the swapped units
        if (window.BattleFieldBuddy) {
          window.BattleFieldBuddy.onSwap(oldActiveUnit, oldBenchUnit, core);
        }

        // Remove old chakra wheels (they'll be recreated with proper context)
        if (window.BattleChakraWheel) {
          window.BattleChakraWheel.removeChakraWheel(oldActiveUnit.id);
          window.BattleChakraWheel.removeChakraWheel(oldBenchUnit.id);
        }

        // Re-render the specific card with swapped units
        const newCardHTML = this.createUnitCardHTML(
          core.activeTeam[cardIndex],
          core.benchTeam[cardIndex],
          cardIndex
        );
        card.outerHTML = newCardHTML;

        // Re-attach chakra wheels and listeners
        setTimeout(() => {
          this.attachAllChakraWheels(core);

          // Update battlefield rendering to show the new active unit
          if (core.units) {
            core.units.renderAllUnits(core);
          }

          // CRITICAL: Update turn system's currentUnit to the new active unit
          // This ensures abilities, speed, and all turn logic use the new unit
          if (core.turns) {
            const wasCurrentUnit = core.turns.currentUnit === oldActiveUnit;
            if (wasCurrentUnit) {
              console.log(`[TeamHolder] Updating turn system: ${oldActiveUnit.name} → ${oldBenchUnit.name}`);
              core.turns.currentUnit = oldBenchUnit;

              // Refresh action panel to show new active unit's abilities
              core.turns.showActionPanel(oldBenchUnit, core);
            }

            // Update speed gauge display
            core.turns.updateSpeedGaugeDisplay(core);
          }

          console.log(`[TeamHolder] ✅ Switch complete: ${oldActiveUnit.name} → bench, ${oldBenchUnit.name} → active`);
        }, 50);

      }, 200); // Half-way through the animation

      // Remove animation classes after animation completes and unlock switching
      setTimeout(() => {
        activeContainer.classList.remove('switching');
        benchContainer.classList.remove('switching');

        // Unlock switching after animation completes
        this.isSwitching = false;
      }, 400);
    },

    /**
     * Create blue chakra sparkle trail during switch
     */
    createSparkleTrail(element) {
      const rect = element.getBoundingClientRect();
      const sparkleCount = 5;

      for (let i = 0; i < sparkleCount; i++) {
        setTimeout(() => {
          const sparkle = document.createElement('div');
          sparkle.className = 'chakra-sparkle';
          sparkle.style.left = `${rect.left + rect.width / 2}px`;
          sparkle.style.top = `${rect.top + rect.height / 2}px`;
          document.body.appendChild(sparkle);

          setTimeout(() => {
            sparkle.remove();
          }, 600);
        }, i * 80);
      }
    },

    /* ===== Updates ===== */

    /**
     * Update all units (HP, chakra, status)
     */
    updateAll(core) {
      // Update HP bars
      core.activeTeam.forEach(unit => this.updateUnitHP(unit));
      core.benchTeam.forEach(unit => this.updateUnitHP(unit));

      // Update chakra wheels
      if (window.BattleChakraWheel) {
        core.activeTeam.forEach(unit => {
          window.BattleChakraWheel.updateChakraWheel(unit, core);
        });
        core.benchTeam.forEach(unit => {
          window.BattleChakraWheel.updateChakraWheel(unit, core);
        });
      }
    },

    /**
     * Update single unit's HP bar
     */
    updateUnitHP(unit) {
      const unitEl = this.findUnitElement(unit.id);
      if (!unitEl) return;

      const hpBar = unitEl.querySelector('.unit-hp-fill');
      if (hpBar) {
        const hpPercent = Math.max(0, (unit.stats.hp / unit.stats.maxHP) * 100);
        hpBar.style.width = `${hpPercent}%`;
      }

      // Update dead state
      if (unit.stats.hp <= 0) {
        unitEl.classList.add('is-dead');
      } else {
        unitEl.classList.remove('is-dead');
      }
    },

    /**
     * Highlight the currently acting unit
     */
    highlightActingUnit(unit) {
      // Remove all previous highlights
      this.teamHolder?.querySelectorAll('.team-unit').forEach(el => {
        el.classList.remove('is-acting');
      });

      // Add highlight to current unit
      if (unit) {
        const unitEl = this.findUnitElement(unit.id);
        if (unitEl) {
          unitEl.classList.add('is-acting');
        }
      }
    },

    /**
     * Update unit chakra wheel
     */
    updateUnitChakra(unit, core) {
      if (window.BattleChakraWheel) {
        window.BattleChakraWheel.updateChakraWheel(unit, core);
      }
    },

    /* ===== Utility ===== */

    /**
     * Find unit element by ID
     */
    findUnitElement(unitId) {
      return this.teamHolder?.querySelector(`.team-unit[data-unit-id="${unitId}"]`);
    },

    /**
     * Clear and re-render entire team holder
     */
    refresh(core) {
      this.renderTeamHolder(core);
    }
  };

  // Export to window
  window.BattleTeamHolder = BattleTeamHolder;

  console.log("[BattleTeamHolder] Module loaded ✅");
})();
