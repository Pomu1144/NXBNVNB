// js/battle/battle-physics.js - Physics System for Battle
(() => {
  "use strict";

  /**
   * BattlePhysics Module
   * Handles physics-based effects like knockback, movement, and collisions
   *
   * Features:
   * - Knockback physics with smooth animation
   * - Collision detection with boundaries
   * - Smooth easing for natural movement
   */
  const BattlePhysics = {
    // Active knockback animations
    activeKnockbacks: new Map(),

    /**
     * Apply knockback to a unit
     * @param {Object} target - Unit being knocked back
     * @param {Object} source - Unit causing the knockback
     * @param {number} distance - Knockback distance in pixels
     * @param {Object} core - Battle core reference
     */
    applyKnockback(target, source, distance = 50, core) {
      // Skip if already being knocked back
      if (this.activeKnockbacks.has(target.id)) {
        return;
      }

      const targetEl = core.dom.scene?.querySelector(`[data-unit-id="${target.id}"]`);
      const sourceEl = core.dom.scene?.querySelector(`[data-unit-id="${source.id}"]`);

      if (!targetEl || !sourceEl) return;

      const sceneRect = core.dom.scene.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const sourceRect = sourceEl.getBoundingClientRect();

      // Calculate direction from source to target
      const sourceX = sourceRect.left - sceneRect.left + sourceRect.width / 2;
      const sourceY = sourceRect.top - sceneRect.top + sourceRect.height / 2;
      const targetX = targetRect.left - sceneRect.left + targetRect.width / 2;
      const targetY = targetRect.top - sceneRect.top + targetRect.height / 2;

      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const magnitude = Math.sqrt(dx * dx + dy * dy) || 1;

      // Normalize direction
      const dirX = dx / magnitude;
      const dirY = dy / magnitude;

      // Calculate knockback displacement
      const knockbackX = dirX * distance;
      const knockbackY = dirY * distance;

      // Calculate new position in percentage
      const currentX = target.pos.x;
      const currentY = target.pos.y;

      const newXPixels = (currentX / 100) * sceneRect.width + knockbackX;
      const newYPixels = (currentY / 100) * sceneRect.height + knockbackY;

      // Clamp to boundaries (10% - 90%)
      let newXPercent = (newXPixels / sceneRect.width) * 100;
      let newYPercent = (newYPixels / sceneRect.height) * 100;
      newXPercent = Math.max(10, Math.min(90, newXPercent));
      newYPercent = Math.max(10, Math.min(90, newYPercent));

      // Animate the knockback
      this.animateKnockback(target, targetEl, currentX, currentY, newXPercent, newYPercent, core);

      console.log(`[Physics] Knockback: ${target.name} from (${currentX.toFixed(1)}%, ${currentY.toFixed(1)}%) to (${newXPercent.toFixed(1)}%, ${newYPercent.toFixed(1)}%)`);
    },

    /**
     * Animate knockback with easing
     */
    animateKnockback(unit, unitEl, startX, startY, endX, endY, core) {
      const duration = 300; // ms
      const startTime = Date.now();

      this.activeKnockbacks.set(unit.id, true);

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out cubic)
        const eased = 1 - Math.pow(1 - progress, 3);

        // Interpolate position
        const currentX = startX + (endX - startX) * eased;
        const currentY = startY + (endY - startY) * eased;

        // Update position
        unit.pos.x = currentX;
        unit.pos.y = currentY;
        unitEl.style.left = `${currentX}%`;
        unitEl.style.top = `${currentY}%`;

        // Add wobble effect during knockback
        if (progress < 1) {
          const wobble = Math.sin(progress * Math.PI * 4) * 3 * (1 - progress);
          unitEl.style.transform = `translate(-50%, -50%) rotate(${wobble}deg)`;
        } else {
          // Reset to base transform
          unitEl.style.transform = 'translate(-50%, -50%)';
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation complete
          this.activeKnockbacks.delete(unit.id);
        }
      };

      animate();
    },

    /**
     * Apply screen shake for heavy hits
     * @param {number} intensity - Shake intensity (1-10)
     * @param {number} duration - Duration in ms
     * @param {Object} core - Battle core reference
     */
    screenShake(intensity = 5, duration = 300, core) {
      if (!core.dom.scene) return;

      const originalTransform = core.dom.scene.style.transform || '';
      let startTime = Date.now();

      const shake = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed < duration) {
          const progress = 1 - (elapsed / duration); // Decay over time
          const currentIntensity = intensity * progress;
          const x = (Math.random() - 0.5) * currentIntensity;
          const y = (Math.random() - 0.5) * currentIntensity;
          core.dom.scene.style.transform = `${originalTransform} translate(${x}px, ${y}px)`;
          requestAnimationFrame(shake);
        } else {
          core.dom.scene.style.transform = originalTransform;
        }
      };

      shake();
    },

    /**
     * Calculate distance between two units
     */
    getUnitDistance(unit1, unit2, core) {
      const el1 = core.dom.scene?.querySelector(`[data-unit-id="${unit1.id}"]`);
      const el2 = core.dom.scene?.querySelector(`[data-unit-id="${unit2.id}"]`);

      if (!el1 || !el2) return Infinity;

      const sceneRect = core.dom.scene.getBoundingClientRect();
      const rect1 = el1.getBoundingClientRect();
      const rect2 = el2.getBoundingClientRect();

      const x1 = rect1.left - sceneRect.left + rect1.width / 2;
      const y1 = rect1.top - sceneRect.top + rect1.height / 2;
      const x2 = rect2.left - sceneRect.left + rect2.width / 2;
      const y2 = rect2.top - sceneRect.top + rect2.height / 2;

      return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    },

    /**
     * Check if a position is within battle boundaries
     */
    isInBounds(xPercent, yPercent) {
      return xPercent >= 10 && xPercent <= 90 && yPercent >= 10 && yPercent <= 90;
    }
  };

  // Export to window
  window.BattlePhysics = BattlePhysics;

  console.log("[BattlePhysics] Module loaded ✅");
})();
