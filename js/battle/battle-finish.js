// js/battle/battle-finish.js - Battle Finish Effects
(() => {
  "use strict";

  /**
   * BattleFinish Module
   * Handles dramatic finish effects when defeating final enemy with ultimate/secret
   *
   * Features:
   * - Shockwave effect
   * - Screen shake
   * - Particle explosions
   * - NO text display (removed "Ultimate Finish!" text)
   */
  const BattleFinish = {

    /**
     * Check if this should trigger finish effects (final enemy defeated by ultimate/secret)
     */
    shouldTriggerFinish(target, remainingEnemies, wasUltimate) {
      return wasUltimate && remainingEnemies <= 1 && target.stats.hp <= 0;
    },

    /**
     * Play finish effects (shockwave + screen shake, NO text)
     */
    async playFinishEffects(attacker, target, core) {
      console.log("[Finish] Final enemy defeated with ultimate/secret!");

      // Massive screen shake
      if (window.BattleParticles) {
        window.BattleParticles.screenShake(core.dom.scene, 15, 800);
      }

      // Create explosion particles
      this.createExplosionEffect(target, core);

      // Wait briefly then end battle
      await this.delay(1000);
    },

    /**
     * Create explosion particle effect
     */
    createExplosionEffect(unit, core) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const rect = unitEl.getBoundingClientRect();
      const sceneRect = core.dom.scene.getBoundingClientRect();

      const centerX = ((rect.left + rect.width / 2 - sceneRect.left) / sceneRect.width) * 100;
      const centerY = ((rect.top + rect.height / 2 - sceneRect.top) / sceneRect.height) * 100;

      // Create multiple particle bursts
      if (window.BattleParticles) {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            window.BattleParticles.createElementalParticles('fire', centerX, centerY, core.dom.scene);
          }, i * 150);
        }
      }

      // Create shockwave
      this.createShockwave(centerX, centerY, core);
    },

    /**
     * Create shockwave effect
     */
    createShockwave(x, y, core) {
      if (!core.dom.scene) return;

      const shockwave = document.createElement('div');
      shockwave.className = 'battle-shockwave-effect';

      shockwave.style.cssText = `
        position: absolute;
        left: ${x}%;
        top: ${y}%;
        transform: translate(-50%, -50%);
        width: 50px;
        height: 50px;
        border: 4px solid rgba(255, 215, 0, 0.9);
        border-radius: 50%;
        pointer-events: none;
        z-index: 100;
        box-shadow:
          0 0 20px rgba(255, 215, 0, 0.8),
          inset 0 0 20px rgba(255, 215, 0, 0.5);
        animation: shockwaveExpand 0.8s ease-out forwards;
      `;

      core.dom.scene.appendChild(shockwave);
      setTimeout(() => shockwave.remove(), 800);
    },

    /**
     * Delay helper
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Initialize finish effect styles
     */
    initializeStyles() {
      if (document.getElementById('finish-styles')) return;

      const style = document.createElement('style');
      style.id = 'finish-styles';
      style.textContent = `
        @keyframes shockwaveExpand {
          0% {
            width: 50px;
            height: 50px;
            opacity: 1;
          }
          100% {
            width: 400px;
            height: 400px;
            opacity: 0;
            border-width: 1px;
          }
        }
      `;

      document.head.appendChild(style);
      console.log("[Finish] Shockwave styles initialized");
    }
  };

  // Initialize styles on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BattleFinish.initializeStyles());
  } else {
    BattleFinish.initializeStyles();
  }

  // Export globally
  window.BattleFinish = BattleFinish;

  console.log("[BattleFinish] Module loaded (shockwave + screen shake enabled) ✅");
})();
