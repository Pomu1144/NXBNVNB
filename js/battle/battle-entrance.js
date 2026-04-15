// js/battle/battle-entrance.js - Battle Entrance Animations
(() => {
  "use strict";

  /**
   * BattleEntrance Module
   * Handles dramatic character entrances and camera effects at battle start
   *
   * Features:
   * - Character jump/teleport onto battlefield
   * - Special effects for high-tier characters (6S+)
   * - Camera pan across team
   * - Boss dramatic entrance
   * - Staggered entrance timing
   */
  const BattleEntrance = {

    /**
     * Play full battle entrance sequence
     */
    async playEntranceSequence(core) {
      console.log("[Entrance] Starting battle entrance sequence");

      // Pause battle during entrance
      core.isPaused = true;

      // Hide units initially
      this.hideAllUnits(core);

      // Play entrance animations
      await this.entrancePlayerTeam(core);
      await this.delay(500);
      await this.entranceEnemyTeam(core);

      // Make sure all units are unpaused after entrance
      core.combatants.forEach(unit => {
        unit.isPaused = false;
      });

      // Resume battle
      core.isPaused = false;

      console.log("[Entrance] Entrance sequence complete, all units active");
    },

    /**
     * Animate player team entrance
     */
    async entrancePlayerTeam(core) {
      console.log("[Entrance] Player team entering...");

      const playerUnits = core.activeTeam.filter(u => u.stats.hp > 0);

      for (let i = 0; i < playerUnits.length; i++) {
        const unit = playerUnits[i];
        await this.animateUnitEntrance(unit, core, 'player', i);
        await this.delay(150); // Stagger each unit
      }
    },

    /**
     * Animate enemy team entrance
     */
    async entranceEnemyTeam(core) {
      console.log("[Entrance] Enemy team entering...");

      const enemyUnits = core.enemyTeam.filter(u => u.stats.hp > 0);

      // Check if any enemy is a boss (high HP)
      const hasBoss = enemyUnits.some(u => u.stats.hp > 2000);

      for (let i = 0; i < enemyUnits.length; i++) {
        const unit = enemyUnits[i];
        const isBoss = unit.stats.hp > 2000;

        if (isBoss && hasBoss) {
          // Dramatic boss entrance
          await this.animateBossEntrance(unit, core, i);
        } else {
          await this.animateUnitEntrance(unit, core, 'enemy', i);
        }

        await this.delay(150);
      }
    },

    /**
     * Animate single unit entrance
     */
    async animateUnitEntrance(unit, core, side, index) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      // Get tier for special effects
      const tier = this.getUnitTier(unit);
      const isHighTier = ['6S', '6SB', '7S', '7SL', '8S', '8SM', '9S', '9ST', '10SO'].includes(tier);

      // Starting position (off-screen)
      const startX = side === 'player' ? -100 : 200;

      unitEl.style.transform = `translateX(${startX}%) scale(0)`;
      unitEl.style.opacity = '0';
      unitEl.style.display = 'block';

      // Animate entrance
      await this.animateElement(unitEl, {
        transform: 'translateX(0%) scale(1)',
        opacity: '1'
      }, 400);

      // Add special effects for high-tier units
      if (isHighTier) {
        this.createEntranceAura(unit, core);
      }

      // Create dust cloud on landing
      if (window.BattleParticles && unit.pos) {
        window.BattleParticles.createDustCloud(unit.pos.x, unit.pos.y, core.dom.scene);
      }
    },

    /**
     * Animate dramatic boss entrance
     */
    async animateBossEntrance(unit, core, index) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      console.log(`[Entrance] Boss entrance for ${unit.name}`);

      // Screen flash
      this.createScreenFlash(core);

      // Start from center, large scale
      unitEl.style.transform = 'translateX(0%) scale(3)';
      unitEl.style.opacity = '0';
      unitEl.style.filter = 'brightness(2)';
      unitEl.style.display = 'block';

      // Zoom in effect
      await this.animateElement(unitEl, {
        transform: 'translateX(0%) scale(1)',
        opacity: '1',
        filter: 'brightness(1)'
      }, 800);

      // Screen shake
      if (window.BattleParticles) {
        window.BattleParticles.screenShake(core.dom.scene, 8, 400);
      }

      // Dramatic aura
      this.createBossAura(unit, core);

      // Dust explosion
      if (window.BattleParticles && unit.pos) {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const offsetX = unit.pos.x + (Math.random() - 0.5) * 20;
            const offsetY = unit.pos.y + (Math.random() - 0.5) * 20;
            window.BattleParticles.createDustCloud(offsetX, offsetY, core.dom.scene);
          }, i * 100);
        }
      }
    },

    /**
     * Create entrance aura for high-tier characters
     */
    createEntranceAura(unit, core) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const aura = document.createElement('div');
      aura.className = 'entrance-aura';

      aura.style.cssText = `
        position: absolute;
        top: -20%;
        left: -20%;
        right: -20%;
        bottom: -20%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 215, 0, 0.4), transparent 70%);
        pointer-events: none;
        z-index: -1;
        animation: entranceAuraPulse 1s ease-out;
      `;

      unitEl.appendChild(aura);
      setTimeout(() => aura.remove(), 1000);
    },

    /**
     * Create boss entrance aura
     */
    createBossAura(unit, core) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const aura = document.createElement('div');
      aura.className = 'boss-aura';

      aura.style.cssText = `
        position: absolute;
        top: -30%;
        left: -30%;
        right: -30%;
        bottom: -30%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 0, 0, 0.5), rgba(139, 0, 0, 0.3), transparent);
        box-shadow:
          0 0 40px rgba(255, 0, 0, 0.6),
          inset 0 0 40px rgba(255, 0, 0, 0.4);
        pointer-events: none;
        z-index: -1;
        animation: bossAuraPulse 2s ease-in-out infinite;
      `;

      unitEl.appendChild(aura);
    },

    /**
     * Create screen flash effect
     */
    createScreenFlash(core) {
      if (!core.dom.scene) return;

      const flash = document.createElement('div');
      flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        pointer-events: none;
        z-index: 9999;
        animation: screenFlash 0.5s ease-out;
      `;

      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 500);
    },

    /**
     * Hide all units initially
     */
    hideAllUnits(core) {
      core.dom.scene?.querySelectorAll('.battle-unit').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'scale(0)';
      });
    },

    /**
     * Get unit tier code
     */
    getUnitTier(unit) {
      return unit._ref?.inst?.tierCode || unit._ref?.base?.starMinCode || "3S";
    },

    /**
     * Animate element with CSS transitions
     */
    animateElement(element, properties, duration) {
      return new Promise((resolve) => {
        element.style.transition = `all ${duration}ms ease-out`;

        Object.assign(element.style, properties);

        setTimeout(() => {
          element.style.transition = '';
          resolve();
        }, duration);
      });
    },

    /**
     * Delay helper
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Initialize entrance animation styles
     */
    initializeStyles() {
      if (document.getElementById('entrance-styles')) return;

      const style = document.createElement('style');
      style.id = 'entrance-styles';
      style.textContent = `
        @keyframes entranceAuraPulse {
          0% { transform: scale(0); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }

        @keyframes bossAuraPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 0.9; }
        }

        @keyframes screenFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        .battle-unit {
          transition: all 0.4s ease-out;
        }
      `;

      document.head.appendChild(style);
      console.log("[Entrance] Styles initialized");
    }
  };

  // Initialize styles on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BattleEntrance.initializeStyles());
  } else {
    BattleEntrance.initializeStyles();
  }

  // Export globally
  window.BattleEntrance = BattleEntrance;
})();
