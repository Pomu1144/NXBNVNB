// js/battle/battle-units.js - Unit Management & Rendering
(() => {
  "use strict";

  /**
   * BattleUnits Module
   * Handles unit creation, rendering, stats, and visual updates
   *
   * Features:
   * - Unit creation with stats computation
   * - Tier art resolution
   * - Unit rendering on battlefield
   * - HP/chakra bar updates
   * - Bench unit display
   * - Position management
   */
  const BattleUnits = {

    /* ===== Art Resolution ===== */

    /**
     * Resolve tier-specific artwork
     * Falls back to base art if tier art not available
     */
    resolveTierArt(char, tier) {
      const fbPortrait = char?.portrait || "assets/characters/common/silhouette.png";
      const fbFull = char?.full || fbPortrait;
      const map = char?.artByTier || {};

      if (map[tier]) {
        return {
          portrait: map[tier].portrait || fbPortrait,
          full: map[tier].full || fbFull
        };
      }

      return { portrait: fbPortrait, full: fbFull };
    },

    /* ===== Stats Computation ===== */

    /**
     * Compute effective stats for unit
     * Uses Progression system if available, otherwise base stats
     */
    computeStats(char, instance) {
      if (window.Progression?.computeEffectiveStatsLoreTier) {
        const tier = instance?.tierCode || char?.starMinCode || "5S";
        const lvl = Number(instance?.level || 1);
        const result = window.Progression.computeEffectiveStatsLoreTier(
          char, lvl, tier, { normalize: true }
        );
        const s = result?.stats || {};

        return {
          hp: s.hp ?? 1000,
          maxHP: s.hp ?? 1000,
          atk: s.atk ?? 100,
          def: s.def ?? 50,
          speed: s.speed ?? 100,
          chakraBase: s.chakra ?? 10
        };
      }

      const base = char?.statsMax || char?.statsBase || {};
      return {
        hp: base.hp || 1000,
        maxHP: base.hp || 1000,
        atk: base.atk || 100,
        def: base.def || 50,
        speed: base.speed || 100,
        chakraBase: base.chakra || 10
      };
    },

    /* ===== Unit Creation ===== */

    /**
     * Create combatant unit object
     */
    createCombatant(data) {
      const isPlayer = data.isPlayer || false;

      // Give enemies a massive head start (1100-1180 gauge, almost at max 1200)
      // This ensures enemies get their first turn, then normal speed-based turns take over
      const initialGauge = isPlayer
        ? Math.floor(Math.random() * 200)  // Players: 0-200
        : 1100 + Math.floor(Math.random() * 80);  // Enemies: 1100-1180 (almost ready)

      const unit = {
        id: data.uid || `unit-${Date.now()}-${Math.random()}`,
        name: data.name || "Unknown",
        portrait: data.portrait || "assets/characters/common/silhouette.png",
        isPlayer: isPlayer,
        positionId: data.positionId || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isBench: data.isBench || false,
        pos: data.pos || { x: 50, y: 50 },
        stats: data.stats,
        chakra: 2,  // Start with 2 chakra so wheels are visible
        maxChakra: 10,
        speedGauge: initialGauge,
        isPaused: false,
        isGuarding: false,
        statusEffects: [],
        chakraMode: "NONE",
        _ref: null
      };

      // Initialize chakra system
      if (window.BattleChakra) {
        window.BattleChakra.initUnit(unit);
      }

      // Initialize passive abilities
      if (window.BattleEffects) {
        window.BattleEffects.initUnitPassives(unit);
      }

      return unit;
    },

    /* ===== Rendering ===== */

    /**
     * Render all units on battlefield
     */
    renderAllUnits(core) {
      if (!core.dom.grid) {
        console.error("[Units] No battlefield grid element found!");
        return;
      }

      console.log("[Units] Rendering all units:", core.combatants.length);
      core.dom.grid.innerHTML = "";

      requestAnimationFrame(() => {
        core.combatants.forEach(unit => {
          this.renderUnit(unit, core);
        });
      });
    },

    /**
     * Render single unit
     */
    renderUnit(unit, core) {
      if (!core.dom.grid || unit.isBench) return;

      const unitEl = document.createElement("div");
      unitEl.className = `battle-unit ${unit.isPlayer ? 'player' : 'enemy'}`;
      unitEl.dataset.unitId = unit.id;
      unitEl.dataset.positionId = unit.positionId || 0;
      unitEl.style.position = 'absolute';
      unitEl.style.left = `${unit.pos.x}%`;
      unitEl.style.top = `${unit.pos.y}%`;
      unitEl.draggable = unit.isPlayer;

      const hpPercent = (unit.stats.hp / unit.stats.maxHP) * 100;
      const chakraPercent = (unit.chakra / unit.maxChakra) * 100;

      // Get chakra class
      const chakraClass = core.chakra ?
        core.chakra.getChakraClass(unit) : 'neutral';

      // Show position ID for player units
      const positionLabel = unit.isPlayer ?
        `<div class="unit-position-label">${unit.positionId}</div>` : '';

      unitEl.innerHTML = `
        ${positionLabel}
        <div class="unit-sprite">
          <img src="${unit.portrait}" alt="${unit.name}"
               onerror="this.src='assets/characters/common/silhouette.png';">
        </div>
        <div class="unit-hp-bar">
          <div class="unit-hp-fill" style="width:${hpPercent}%"></div>
        </div>
        <div class="unit-chakra-bar">
          <div class="chakra-fill ${chakraClass}" style="width:${chakraPercent}%"></div>
        </div>
      `;

      core.dom.grid.appendChild(unitEl);

      // Add event listeners for player units
      if (unit.isPlayer && core.drag) {
        unitEl.addEventListener("dragstart", (e) => core.drag.handleActiveDragStart(e, unit, core));
        unitEl.addEventListener("dragend", (e) => core.drag.handleDragEnd(e, core));
        unitEl.addEventListener("dragover", (e) => core.drag.handleDragOver(e));
        unitEl.addEventListener("drop", (e) => core.drag.handleDrop(e, unit, core));
      }

      // Add click handler
      unitEl.addEventListener("click", () => {
        if (core.chakra) {
          core.chakra.handleUnitClick(unit, core);
        }
      });
    },

    /**
     * Update unit display (HP, chakra, status)
     */
    updateUnitDisplay(unit, core) {
      console.log(`[BattleUnits] Updating display for ${unit.name}, HP: ${unit.stats.hp}/${unit.stats.maxHP}`);

      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) {
        console.warn(`[BattleUnits] Could not find unit element for ${unit.id}`);
        return;
      }

      // Update HP bar on battlefield
      const hpBar = unitEl.querySelector(".unit-hp-fill");
      const hpPercent = Math.max(0, Math.min(100, (unit.stats.hp / unit.stats.maxHP) * 100));

      console.log(`[BattleUnits] HP%: ${hpPercent.toFixed(1)}%, HP bar element:`, !!hpBar);

      if (hpBar) {
        hpBar.style.width = `${hpPercent}%`;
        hpBar.style.transition = 'width 0.3s ease-out';
        console.log(`[BattleUnits] ✅ Updated HP bar to ${hpPercent}%`);
      }

      // Update chakra bar
      if (core.chakra) {
        core.chakra.updateUnitChakraDisplay(unit, core);
      } else {
        const chakraBar = unitEl.querySelector(".chakra-fill");
        if (chakraBar) {
          const chakraPercent = (unit.chakra / unit.maxChakra) * 100;
          chakraBar.style.width = `${chakraPercent}%`;
        }
      }

      // Also update team holder HP bar if this is a player unit
      if (unit.isPlayer && core.dom.teamHolder) {
        const teamCard = core.dom.teamHolder.querySelector(`[data-unit-id="${unit.id}"]`);
        if (teamCard) {
          const teamHpBar = teamCard.querySelector(".unit-hp-fill");
          if (teamHpBar) {
            teamHpBar.style.width = `${hpPercent}%`;
            teamHpBar.style.transition = 'width 0.3s ease-out';
            console.log(`[BattleUnits] ✅ Updated team holder HP bar to ${hpPercent}%`);
          }
        } else {
          console.warn(`[BattleUnits] Could not find team card for ${unit.id}`);
        }
      }

      // Update visual state for dead units - make them disappear
      if (unit.stats.hp <= 0) {
        console.log(`[BattleUnits] 💀 Unit ${unit.name} is dead, removing from battlefield`);
        unitEl.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        unitEl.style.opacity = "0";
        unitEl.style.transform = "scale(0.8)";
        unitEl.style.pointerEvents = "none";

        // Remove from DOM after animation
        setTimeout(() => {
          if (unitEl.parentNode) {
            unitEl.remove();
          }
        }, 500);

        // Also remove from team holder if player unit
        if (unit.isPlayer && core.dom.teamHolder) {
          const teamCard = core.dom.teamHolder.querySelector(`[data-unit-id="${unit.id}"]`);
          if (teamCard) {
            const unitCard = teamCard.closest('.unit-card');
            if (unitCard) {
              unitCard.style.transition = 'opacity 0.5s ease-out';
              unitCard.style.opacity = "0";
              setTimeout(() => {
                if (unitCard.parentNode) {
                  unitCard.remove();
                }
              }, 500);
            }
          }
        }
      }
    },

    /**
     * Update unit position on battlefield
     */
    updateUnitPosition(unit, core) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      unitEl.style.left = `${unit.pos.x}%`;
      unitEl.style.top = `${unit.pos.y}%`;
    },

    /* ===== Bench System ===== */

    /**
     * Render bench units
     */
    renderBenchUnits(core) {
      if (!core.dom.benchContainer) {
        console.warn("[Units] No bench container found!");
        return;
      }

      console.log("[Units] Rendering bench units:", core.benchTeam.length);

      core.dom.benchContainer.innerHTML = core.benchTeam.map((unit) => {
        const hpPercent = (unit.stats.hp / unit.stats.maxHP) * 100;
        return `
          <div class="bench-unit" data-unit-id="${unit.id}" data-position-id="${unit.positionId}" draggable="true">
            <img src="${unit.portrait}" alt="${unit.name}"
                 onerror="this.src='assets/characters/common/silhouette.png';">
            <div class="bench-name">${unit.name} [${unit.positionId}]</div>
            <div class="bench-hp-bar">
              <div class="bench-hp-fill" style="width: ${hpPercent}%"></div>
            </div>
          </div>
        `;
      }).join('');

      // Add drag handlers and chakra wheels
      core.dom.benchContainer.querySelectorAll(".bench-unit").forEach(el => {
        if (core.swap) {
          el.addEventListener("dragstart", (e) => core.swap.handleBenchDragStart(e, core));
          el.addEventListener("dragend", (e) => core.drag.handleDragEnd(e, core));
        }

        // Create chakra wheel for bench unit portrait
        const unitId = el.dataset.unitId;
        const unit = core.benchTeam.find(u => u.id === unitId);
        const portrait = el.querySelector('img');

        if (unit && portrait && window.BattleChakraWheel) {
          if (!window.BattleChakraWheel.getWheel(unit.id)) {
            window.BattleChakraWheel.createChakraWheel(unit, portrait, true); // true = bench unit
          }
          window.BattleChakraWheel.updateChakraWheel(unit, core);
        }
      });
    },

    /* ===== Utility Functions ===== */

    /**
     * Find unit by ID
     */
    findUnitById(id, core) {
      return core.combatants.find(u => u.id === id);
    },

    /**
     * Get all alive units
     */
    getAliveUnits(core) {
      return core.combatants.filter(u => u.stats.hp > 0);
    },

    /**
     * Get all player units (active + bench)
     */
    getAllPlayerUnits(core) {
      return [...core.activeTeam, ...core.benchTeam];
    },

    /**
     * Reset opacity for all units
     */
    resetOpacity(core) {
      core.dom.grid?.querySelectorAll(".battle-unit").forEach(el => {
        el.style.opacity = "1";
      });
      core.dom.benchContainer?.querySelectorAll(".bench-unit").forEach(el => {
        el.style.opacity = "1";
      });
    }
  };

  // Export to window
  window.BattleUnits = BattleUnits;

  console.log("[BattleUnits] Module loaded ✅");
})();
