// js/battle/battle-drag.js - Drag & Drop Targeting System
(() => {
  "use strict";

  /**
   * BattleDrag Module
   * Handles drag & drop mechanics for positioning and targeting
   *
   * Features:
   * - Active unit dragging
   * - Targeting overlay visualization
   * - Multi-target area attacks
   * - Drag-to-cast mechanics
   * - Position updates
   * - Visual targeting markers
   * - Proximity combo detection
   */
  const BattleDrag = {
    // ===== State =====
    draggingUnit: null,
    dragStartPos: null,
    dragAction: null,
    isDragging: false,
    currentTargets: [], // Track currently targeted units
    targetMarkers: new Map(), // Store target marker elements
    lastUpdateTime: 0, // For throttling drag updates
    throttleDelay: 16, // ~60fps update rate
    DEBUG_DRAG: false, // Debug logging flag (disable for performance)

    /* ===== Targeting Markers ===== */

    /**
     * Create a targeting marker on a unit
     */
    createTargetMarker(unit, core) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return null;

      // Remove existing marker if present
      this.removeTargetMarker(unit);

      const marker = document.createElement('div');
      marker.className = 'target-marker';
      marker.style.position = 'absolute';
      marker.style.top = '-5px';
      marker.style.left = '-5px';
      marker.style.right = '-5px';
      marker.style.bottom = '-5px';
      marker.style.border = '3px solid #ff4444';
      marker.style.borderRadius = '12px';
      marker.style.boxShadow = '0 0 20px #ff4444, inset 0 0 20px rgba(255, 68, 68, 0.3)';
      marker.style.pointerEvents = 'none';
      marker.style.zIndex = '15';
      marker.style.animation = 'targetPulse 1s ease-in-out infinite';

      unitEl.appendChild(marker);
      this.targetMarkers.set(unit.id, marker);

      return marker;
    },

    /**
     * Remove targeting marker from unit
     */
    removeTargetMarker(unit) {
      const marker = this.targetMarkers.get(unit.id);
      if (marker) {
        marker.remove();
        this.targetMarkers.delete(unit.id);
      }
    },

    /**
     * Clear all target markers
     */
    clearAllTargetMarkers() {
      this.targetMarkers.forEach(marker => marker.remove());
      this.targetMarkers.clear();
      this.currentTargets = [];
    },

    /**
     * Update target markers based on current drag position
     */
    updateTargetMarkers(x, y, core, actionType = null) {
      if (!this.isDragging || !this.draggingUnit) return;

      const action = actionType || this.dragAction;
      const targets = this.findUnitsInRange(x, y, action, core);

      // Clear markers for units no longer targeted
      this.currentTargets.forEach(target => {
        if (!targets.includes(target)) {
          this.removeTargetMarker(target);
        }
      });

      // Add markers for newly targeted units
      targets.forEach(target => {
        if (!this.currentTargets.includes(target)) {
          this.createTargetMarker(target, core);
        }
      });

      this.currentTargets = targets;
    },

    /* ===== Targeting Overlay ===== */

    /**
     * Create targeting canvas overlay
     */
    makeOverlay(root) {
      let canvas = document.getElementById("battle-targeting");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = "battle-targeting";
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = "100";
        root.appendChild(canvas);
      }

      const fit = () => {
        const r = root.getBoundingClientRect();
        canvas.width = r.width;
        canvas.height = r.height;
      };
      fit();

      // Bug #6: Store resize listener reference for cleanup
      this.resizeListener = fit;
      window.addEventListener("resize", fit);

      const ctx = canvas.getContext("2d");
      return {
        clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        draw(shape, color, args, origin) {
          const c = color === "ultimate" ? "#ff4d4d" : "#58b7ff";
          ctx.save();
          ctx.lineWidth = 3;
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.9;
          ctx.shadowColor = c;
          ctx.shadowBlur = 16;
          ctx.beginPath();

          if (shape === "circle") {
            const r = args?.radius ?? 140;
            ctx.arc(origin.x, origin.y, r, 0, Math.PI * 2);
          } else if (shape === "rect") {
            const w = args?.w ?? 320, h = args?.h ?? 140;
            ctx.rect(origin.x - w / 2, origin.y - h / 2, w, h);
          } else if (shape === "line") {
            const len = args?.length ?? 360, w = args?.width ?? 28;
            ctx.rect(origin.x, origin.y - w / 2, len, w);
          } else if (shape === "sector") {
            const r = args?.radius ?? 260;
            const a = ((args?.angleDeg ?? 90) * Math.PI) / 180;
            ctx.moveTo(origin.x, origin.y);
            ctx.arc(origin.x, origin.y, r, -a / 2, a / 2);
            ctx.closePath();
          }

          ctx.stroke();
          ctx.restore();
        },
      };
    },

    /* ===== Drag Handlers ===== */

    /**
     * Handle drag start for active unit
     */
    handleActiveDragStart(e, unit, core) {
      // Only allow drag if it's this unit's turn
      if (core.turns && core.turns.currentUnit !== unit) return;

      this.draggingUnit = unit;
      this.dragStartPos = { ...unit.pos };
      this.isDragging = true;

      // Determine action based on queued action
      if (core.queuedAction === "attack") {
        this.dragAction = "attack";
      } else if (core.queuedAction === "jutsu") {
        this.dragAction = "jutsu";
      } else if (core.queuedAction === "ultimate") {
        this.dragAction = "ultimate";
      } else {
        this.dragAction = "move";
      }

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", unit.id);
      e.currentTarget.style.opacity = "0.7";

      if (this.DEBUG_DRAG) console.log(`[Drag] Dragging ${unit.name}, action: ${this.dragAction}`);
    },

    /**
     * Handle scene drag over (throttled for performance)
     */
    handleSceneDragOver(e, core) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      if (!this.isDragging || !this.draggingUnit) return;

      // Throttle updates to avoid lag (max 60fps)
      const now = performance.now();
      const delay = Math.max(1, this.throttleDelay || 16); // Bug #21: Ensure delay is at least 1
      if (now - this.lastUpdateTime < delay) return;
      this.lastUpdateTime = now;

      // Bug #13: Validate scene element exists before getBoundingClientRect
      if (!core.dom || !core.dom.scene) {
        if (this.DEBUG_DRAG) console.error("[Drag] Scene element not found");
        return;
      }

      const rect = core.dom.scene.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Determine effective action (auto-detect if dragging over enemy)
      let effectiveAction = this.dragAction;
      if (effectiveAction === "move") {
        const enemyTarget = this.findUnitAtPosition(x, y, false, core);
        // Bug #1: Validate enemy target has stats before checking hp
        if (enemyTarget && enemyTarget.stats && enemyTarget.stats.hp > 0) {
          effectiveAction = "attack";
        }
      }

      // Show targeting preview for combat actions
      if (effectiveAction === "attack" || effectiveAction === "jutsu" || effectiveAction === "ultimate") {
        this.showDragTargetingPreview(x, y, core, effectiveAction);
        this.updateTargetMarkers(x, y, core, effectiveAction);
      }
    },

    /**
     * Handle scene drop
     */
    handleSceneDrop(e, core) {
      e.preventDefault();

      if (!this.isDragging || !this.draggingUnit) return;

      const rect = core.dom.scene.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const dropY = e.clientY - rect.top;

      const dropXPercent = (dropX / rect.width) * 100;
      const dropYPercent = (dropY / rect.height) * 100;

      if (this.DEBUG_DRAG) {
        console.log(`[Drag] 🎯 Drop at (${dropXPercent.toFixed(1)}%, ${dropYPercent.toFixed(1)}%), action: ${this.dragAction}`);
        console.log(`[Drag] 🔍 DEBUGGING ENABLED - If you don't see more debug messages below, you're loading cached code!`);
      }

      // Update position
      this.draggingUnit.pos = {
        x: Math.max(0, Math.min(100, dropXPercent)),
        y: Math.max(0, Math.min(100, dropYPercent))
      };

      // If no action was queued, check if we're dropping on enemies
      let effectiveAction = this.dragAction;
      if (this.DEBUG_DRAG) console.log(`[Drag] Initial dragAction: ${this.dragAction}`);

      if (effectiveAction === "move") {
        if (this.DEBUG_DRAG) console.log(`[Drag] Checking for enemy at drop position (${dropX.toFixed(1)}, ${dropY.toFixed(1)})`);
        const enemyTarget = this.findUnitAtPosition(dropX, dropY, false, core);
        if (this.DEBUG_DRAG) console.log(`[Drag] Enemy found:`, enemyTarget ? enemyTarget.name : "none");

        // Bug #1: Validate enemy target has stats before using
        if (enemyTarget && enemyTarget.stats && enemyTarget.stats.hp > 0) {
          effectiveAction = "attack"; // Default to attack when dropping on enemy
          if (this.DEBUG_DRAG) console.log(`[Drag] ✅ Auto-detected enemy target, defaulting to attack`);
        } else {
          if (this.DEBUG_DRAG) console.log(`[Drag] ❌ No enemy detected at drop position, will just reposition`);
        }
      }

      if (this.DEBUG_DRAG) console.log(`[Drag] Effective action: ${effectiveAction}`);

      // Handle different drag actions
      if (effectiveAction === "attack" || effectiveAction === "jutsu") {
        // Find targets in range
        if (this.DEBUG_DRAG) console.log(`[Drag] Finding targets in range for ${effectiveAction}...`);
        const targets = this.findUnitsInRange(dropX, dropY, effectiveAction, core);
        if (this.DEBUG_DRAG) console.log(`[Drag] Found ${targets.length} targets:`, targets.map(t => t.name));

        if (targets.length > 0) {
          if (this.DEBUG_DRAG) console.log(`[Drag] ⚔️ Multi-hit: ${this.draggingUnit.name} hits ${targets.length} targets`);

          // Check for proximity combo attacks
          const proximityTargets = this.findProximityTargets(targets, core);

          if (effectiveAction === "jutsu" && window.BattleCombat) {
            if (this.DEBUG_DRAG) console.log(`[Drag] 🔵 Calling performMultiJutsu`);
            window.BattleCombat.performMultiJutsu(this.draggingUnit, targets, core);
            // Trigger proximity combo attacks after jutsu
            if (proximityTargets.length > 0) {
              setTimeout(() => {
                window.BattleCombat.performProximityCombo(this.draggingUnit, proximityTargets, core);
              }, 600);
            }
          } else if (window.BattleCombat) {
            if (this.DEBUG_DRAG) console.log(`[Drag] ⚔️ Calling performMultiAttack with ${targets.length} targets`);
            window.BattleCombat.performMultiAttack(this.draggingUnit, targets, core);
            // Trigger proximity combo attacks
            if (proximityTargets.length > 0) {
              setTimeout(() => {
                window.BattleCombat.performProximityCombo(this.draggingUnit, proximityTargets, core);
              }, 400);
            }
          } else {
            if (this.DEBUG_DRAG) console.log(`[Drag] ⚠️ BattleCombat not available!`);
          }

          if (core.turns) core.turns.endTurn(core);
        } else {
          // No targets hit, just reposition
          if (core.units) {
            core.units.updateUnitPosition(this.draggingUnit, core);
          }
          if (core.turns) core.turns.endTurn(core);
        }
      } else if (effectiveAction === "ultimate") {
        // Ultimate hits all enemies
        const targets = core.enemyTeam.filter(u => u.stats.hp > 0);
        if (window.BattleCombat) {
          window.BattleCombat.performUltimate(this.draggingUnit, targets, core);
        }
        if (core.turns) core.turns.endTurn(core);
      } else {
        // Just repositioning (move action)
        if (core.units) {
          core.units.updateUnitPosition(this.draggingUnit, core);
        }
        if (core.turns) core.turns.endTurn(core);
      }

      this.handleDragEnd(e, core);
    },

    /**
     * Handle drag end
     */
    handleDragEnd(e, core) {
      this.isDragging = false;
      this.draggingUnit = null;
      this.dragAction = null;
      this.dragStartPos = null;

      // Clear all targeting markers
      this.clearAllTargetMarkers();

      // Bug #20: Clear overlay canvas
      if (core.overlay) core.overlay.clear();
      if (core.units) core.units.resetOpacity(core);
    },

    /**
     * Cleanup method for battle end (Bug #6 & #20)
     */
    cleanup(core) {
      // Remove resize listener
      if (this.resizeListener) {
        window.removeEventListener("resize", this.resizeListener);
        this.resizeListener = null;
      }

      // Clear overlay
      if (core && core.overlay) {
        core.overlay.clear();
      }

      // Clear all markers
      this.clearAllTargetMarkers();

      // Reset state
      this.isDragging = false;
      this.draggingUnit = null;
      this.dragAction = null;
      this.dragStartPos = null;
    },

    /**
     * Handle drag over (for drop zones)
     */
    handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },

    /**
     * Handle drop on unit (for swapping)
     */
    handleDrop(e, targetUnit, core) {
      e.preventDefault();
      e.stopPropagation();

      if (!this.isDragging) return;

      const draggedId = e.dataTransfer.getData("text/plain");

      // Check if swapping with bench unit
      const benchUnit = core.benchTeam.find(u => u.id === draggedId);

      if (benchUnit && targetUnit.isPlayer && !targetUnit.isBench && core.swap) {
        core.swap.swapActiveWithBench(targetUnit, benchUnit, core);
      }

      this.handleDragEnd(e, core);
    },

    /* ===== Targeting System ===== */

    /**
     * Show targeting preview during drag
     */
    showDragTargetingPreview(x, y, core, actionType = null) {
      if (!this.draggingUnit || !core.overlay) return;

      const action = actionType || this.dragAction;
      const skills = window.BattleCombat?.getUnitSkills(this.draggingUnit);
      let shape, args, color;

      if (action === "ultimate" && skills?.ultimate) {
        shape = skills.ultimate.data?.shape || "sector";
        args = skills.ultimate.data?.shapeArgs || { radius: 260, angleDeg: 90 };
        color = "ultimate";
      } else if (action === "jutsu" && skills?.jutsu) {
        shape = skills.jutsu.data?.shape || "circle";
        args = skills.jutsu.data?.shapeArgs || { radius: 140 };
        color = "jutsu";
      } else {
        shape = "circle";
        args = { radius: 400 }; // Increased to 400 for much more forgiving targeting
        color = "jutsu";
      }

      core.overlay.clear();
      core.overlay.draw(shape, color, args, { x, y });
    },

    /**
     * Find units within range of drop position
     */
    findUnitsInRange(x, y, actionType, core) {
      const skills = window.BattleCombat?.getUnitSkills(this.draggingUnit);
      let shape, args;

      // Determine shape and args based on action type
      if (actionType === "jutsu" && skills?.jutsu) {
        shape = skills.jutsu.data?.shape || "circle";
        args = skills.jutsu.data?.shapeArgs || { radius: 140 };
      } else if (actionType === "ultimate" && skills?.ultimate) {
        shape = skills.ultimate.data?.shape || "sector";
        args = skills.ultimate.data?.shapeArgs || { radius: 260, angleDeg: 90 };
      } else {
        shape = "circle";
        args = { radius: 400 }; // Increased to 400 for much more forgiving targeting
      }

      if (this.DEBUG_DRAG) {
        console.log(`[Drag] findUnitsInRange: center=(${x.toFixed(1)}, ${y.toFixed(1)}), shape=${shape}, radius=${args.radius || args.w || 'N/A'}`);
      }

      const targets = [];
      for (const unit of core.enemyTeam) {
        if (unit.stats.hp <= 0) {
          if (this.DEBUG_DRAG) console.log(`[Drag]   - ${unit.name}: DEAD, skipping`);
          continue;
        }

        const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
        if (!unitEl) {
          if (this.DEBUG_DRAG) console.log(`[Drag]   - ${unit.name}: NO ELEMENT, skipping`);
          continue;
        }

        const rect = unitEl.getBoundingClientRect();
        const sceneRect = core.dom.scene.getBoundingClientRect();

        const unitCenterX = rect.left - sceneRect.left + rect.width / 2;
        const unitCenterY = rect.top - sceneRect.top + rect.height / 2;

        const dist = Math.sqrt((x - unitCenterX) ** 2 + (y - unitCenterY) ** 2);

        // Use shape-specific collision detection
        const inShape = this.isUnitInShape(unitCenterX, unitCenterY, x, y, shape, args);
        if (this.DEBUG_DRAG) {
          console.log(`[Drag]   - ${unit.name}: center=(${unitCenterX.toFixed(1)}, ${unitCenterY.toFixed(1)}), dist=${dist.toFixed(1)}, inShape=${inShape}`);
        }

        if (inShape) {
          targets.push(unit);
        }
      }

      if (this.DEBUG_DRAG) console.log(`[Drag] findUnitsInRange result: ${targets.length} targets`);
      return targets;
    },

    /**
     * Check if a point (unit position) is within a specific shape
     */
    isUnitInShape(unitX, unitY, shapeX, shapeY, shape, args) {
      switch (shape) {
        case "circle":
          return this.isPointInCircle(unitX, unitY, shapeX, shapeY, args.radius || 140);

        case "rect":
          return this.isPointInRect(unitX, unitY, shapeX, shapeY, args.w || 320, args.h || 140);

        case "line":
          return this.isPointInLine(unitX, unitY, shapeX, shapeY, args.length || 360, args.width || 28);

        case "sector":
          return this.isPointInSector(unitX, unitY, shapeX, shapeY, args.radius || 260, args.angleDeg || 90);

        default:
          return false;
      }
    },

    /**
     * Circle collision detection
     */
    isPointInCircle(px, py, cx, cy, radius) {
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      return dist <= radius;
    },

    /**
     * Rectangle collision detection (centered)
     */
    isPointInRect(px, py, rectX, rectY, width, height) {
      const left = rectX - width / 2;
      const right = rectX + width / 2;
      const top = rectY - height / 2;
      const bottom = rectY + height / 2;

      return px >= left && px <= right && py >= top && py <= bottom;
    },

    /**
     * Line collision detection (horizontal line from origin)
     */
    isPointInLine(px, py, lineX, lineY, length, width) {
      // Line extends horizontally from (lineX, lineY) to (lineX + length, lineY)
      // with width/2 above and below
      const left = lineX;
      const right = lineX + length;
      const top = lineY - width / 2;
      const bottom = lineY + width / 2;

      return px >= left && px <= right && py >= top && py <= bottom;
    },

    /**
     * Sector (cone) collision detection
     */
    isPointInSector(px, py, sectorX, sectorY, radius, angleDeg) {
      // First check if within radius
      const dist = Math.sqrt((px - sectorX) ** 2 + (py - sectorY) ** 2);
      if (dist > radius) return false;

      // Calculate angle from sector origin to point
      const angleToPoint = Math.atan2(py - sectorY, px - sectorX);

      // Convert sector angle to radians
      const sectorAngleRad = (angleDeg * Math.PI) / 180;
      const halfSectorAngle = sectorAngleRad / 2;

      // Check if point angle is within sector angle range
      // Sector is centered horizontally (facing right, 0 degrees)
      const normalizedAngle = angleToPoint;

      return Math.abs(normalizedAngle) <= halfSectorAngle;
    },

    /**
     * Find proximity targets (enemies near the main targets)
     * These will receive basic attacks as combo damage
     */
    findProximityTargets(mainTargets, core) {
      const PROXIMITY_RADIUS = 120; // Distance to trigger proximity combo
      const proximityTargets = [];

      // For each main target, find nearby enemies
      mainTargets.forEach(mainTarget => {
        const mainEl = core.dom.scene?.querySelector(`[data-unit-id="${mainTarget.id}"]`);
        if (!mainEl) return;

        const mainRect = mainEl.getBoundingClientRect();
        const sceneRect = core.dom.scene.getBoundingClientRect();
        const mainX = mainRect.left - sceneRect.left + mainRect.width / 2;
        const mainY = mainRect.top - sceneRect.top + mainRect.height / 2;

        // Check all enemies
        core.enemyTeam.forEach(enemy => {
          // Skip if already a main target or dead
          if (mainTargets.includes(enemy) || enemy.stats.hp <= 0) return;
          // Skip if already in proximity list
          if (proximityTargets.includes(enemy)) return;

          const enemyEl = core.dom.scene?.querySelector(`[data-unit-id="${enemy.id}"]`);
          if (!enemyEl) return;

          const enemyRect = enemyEl.getBoundingClientRect();
          const enemyX = enemyRect.left - sceneRect.left + enemyRect.width / 2;
          const enemyY = enemyRect.top - sceneRect.top + enemyRect.height / 2;

          const dist = Math.sqrt((mainX - enemyX) ** 2 + (mainY - enemyY) ** 2);
          if (dist <= PROXIMITY_RADIUS) {
            proximityTargets.push(enemy);
          }
        });
      });

      return proximityTargets;
    },

    /**
     * Find unit at specific position
     */
    findUnitAtPosition(x, y, isPlayer, core) {
      const targets = isPlayer ? core.activeTeam : core.enemyTeam;
      const threshold = 60; // Hit detection radius

      for (const unit of targets) {
        if (unit.stats.hp <= 0 || unit.isBench) continue;

        const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
        if (!unitEl) continue;

        const rect = unitEl.getBoundingClientRect();
        const sceneRect = core.dom.scene.getBoundingClientRect();

        const unitCenterX = rect.left - sceneRect.left + rect.width / 2;
        const unitCenterY = rect.top - sceneRect.top + rect.height / 2;

        const dist = Math.sqrt((x - unitCenterX) ** 2 + (y - unitCenterY) ** 2);
        if (dist < threshold) return unit;
      }

      return null;
    }
  };

  // Export to window
  window.BattleDrag = BattleDrag;

  // Add CSS for target markers
  const style = document.createElement('style');
  style.textContent = `
    @keyframes targetPulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.6;
        transform: scale(1.05);
      }
    }

    .target-marker {
      animation: targetPulse 1s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);

  console.log("[BattleDrag] Module loaded ✅ (with targeting markers & proximity detection)");
})();
