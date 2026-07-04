// js/battle/battle-swap.js - Bench/Active Swapping System
(() => {
  "use strict";

  /**
   * BattleSwap Module
   * Handles swapping units between active team and bench
   *
   * Features:
   * - Active/bench swapping
   * - Position retention
   * - Gauge reset for incoming units
   * - Drag & drop bench mechanics
   */
  const BattleSwap = {
    // ===== State =====
    isSwapping: false,

    /* ===== Swap Logic ===== */

    /**
     * Swap active unit with bench unit
     * POSITION-BASED: Only swap if position IDs match
     * P1 active <-> P1 bench, P2 active <-> P2 bench, etc.
     */
    swapActiveWithBench(activeUnit, benchUnit, core) {
      console.log(`[Swap] Attempting swap: ${activeUnit.name} (pos ${activeUnit.positionId}) <-> ${benchUnit.name} (pos ${benchUnit.positionId})`);

      // Prevent multiple simultaneous swaps
      if (this.isSwapping) {
        console.warn("[Swap] Already swapping, ignoring request");
        return;
      }

      // CRITICAL: Check if position IDs match
      if (activeUnit.positionId !== benchUnit.positionId) {
        console.warn(`[Swap] Position mismatch! P${activeUnit.positionId} cannot swap with P${benchUnit.positionId}`);

        // Show visual feedback
        if (window.BattleAnimations) {
          window.BattleAnimations.screenFlash('rgba(255, 0, 0, 0.3)', 200, core.dom);
        }

        return;
      }

      this.isSwapping = true;

      // If the outgoing unit is the one currently taking its turn, remember it
      // so we can hand the turn off cleanly after the swap — otherwise the
      // turn stays locked on a now-benched unit and the speed bar jams.
      const turns = core.turns;
      const wasActingUnit = !!(turns && turns.currentUnit === activeUnit);

      const activeIdx = core.activeTeam.indexOf(activeUnit);
      const benchIdx = core.benchTeam.indexOf(benchUnit);

      if (activeIdx === -1 || benchIdx === -1) {
        console.error("[Swap] Swap failed - units not found in arrays");
        this.isSwapping = false;
        return;
      }

      // Store battlefield position
      const savedPos = { ...activeUnit.pos };

      // Swap isActive flags (position IDs stay the same!)
      activeUnit.isActive = false;
      benchUnit.isActive = true;

      // Update bench flags for rendering
      activeUnit.isBench = true;
      benchUnit.isBench = false;

      // Transfer battlefield position to incoming unit
      benchUnit.pos = savedPos;
      activeUnit.pos = { x: 0, y: 0 };

      // Reset speed gauge for BOTH units: the incoming unit starts fresh, and
      // the outgoing unit must not keep a stale/full gauge or it would jump the
      // speed bar the next time it is swapped back in.
      benchUnit.speedGauge = 0;
      activeUnit.speedGauge = 0;
      activeUnit.isPaused = false;

      // Swap in arrays
      core.activeTeam[activeIdx] = benchUnit;
      core.benchTeam[benchIdx] = activeUnit;

      // If we just benched the acting unit, release the turn lock so the tick
      // loop can promote the next ready combatant instead of waiting on a unit
      // that is no longer on the field.
      if (wasActingUnit && turns) {
        turns.currentUnit = null;
        turns.turnLocked = false;
        core.queuedAction = null;
        if (typeof turns.hideActionPanel === "function") turns.hideActionPanel(core);
      }

      // Update combatants list
      core.updateCombatants();

      // Update field/buddy skills for the swapped units
      if (window.BattleFieldBuddy) {
        window.BattleFieldBuddy.onSwap(activeUnit, benchUnit, core);
      }

      // Re-render
      requestAnimationFrame(() => {
        if (core.units) {
          core.units.renderAllUnits(core);
          core.units.renderBenchUnits(core);
        }
        if (core.turns) {
          core.turns.updateSpeedGaugeDisplay(core);
        }

        setTimeout(() => {
          this.isSwapping = false;
          console.log(`[Swap] ✅ Complete. P${activeUnit.positionId} <-> P${benchUnit.positionId}`);
        }, 100);
      });
    },

    /* ===== Bench Drag Handlers ===== */

    /**
     * Handle drag start from bench
     */
    handleBenchDragStart(e, core) {
      const unitId = e.currentTarget.dataset.unitId;
      const unit = core.benchTeam.find(u => u.id === unitId);
      if (!unit) return;

      if (core.drag) {
        core.drag.draggingUnit = unit;
        core.drag.dragAction = "swap";
        core.drag.isDragging = true;
      }

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", unitId);
      e.currentTarget.style.opacity = "0.5";

      console.log(`[Swap] Dragging bench unit: ${unit.name} (position ${unit.positionId})`);
    },

    /* ===== Utility Functions ===== */

    /**
     * Check if unit can be swapped
     */
    canSwap(unit) {
      return !this.isSwapping && unit.stats.hp > 0;
    },

    /**
     * Get swappable bench units
     */
    getSwappableBenchUnits(core) {
      return core.benchTeam.filter(u => u.stats.hp > 0);
    }
  };

  // Export to window
  window.BattleSwap = BattleSwap;

  console.log("[BattleSwap] Module loaded ✅");
})();
