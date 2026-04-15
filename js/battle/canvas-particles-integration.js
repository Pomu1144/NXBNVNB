// js/battle/canvas-particles-integration.js - Integration with Battle System
(() => {
  "use strict";

  /**
   * BattleCanvasParticles
   * Integrates Canvas Particle Engine with existing battle system
   *
   * Usage:
   *   await window.BattleCanvasParticles.init(core);
   *   window.BattleCanvasParticles.playFireStyle(unit);
   *   window.BattleCanvasParticles.playLightning(attacker, target);
   */
  const BattleCanvasParticles = {
    engine: null,
    core: null,
    emitters: new Map(), // Track emitters by unit ID for cleanup

    /**
     * Initialize the particle system
     * @param {Object} core - Battle core reference
     */
    init(core) {
      if (!core || !core.dom || !core.dom.scene) {
        console.error('[BattleCanvasParticles] Invalid core or scene');
        return false;
      }

      this.core = core;

      // Get scene dimensions
      const scene = core.dom.scene;
      const rect = scene.getBoundingClientRect();

      // Create particle engine
      this.engine = new CanvasParticleEngine(scene, rect.width, rect.height);
      this.engine.init();

      // Handle window resize
      window.addEventListener('resize', () => this.handleResize());

      console.log('[BattleCanvasParticles] Integrated with battle system ✅');
      return true;
    },

    /**
     * Handle window resize
     */
    handleResize() {
      if (!this.core || !this.core.dom || !this.core.dom.scene) return;

      const scene = this.core.dom.scene;
      const rect = scene.getBoundingClientRect();
      this.engine.resize(rect.width, rect.height);
    },

    /**
     * Get unit position in pixels
     * @param {Object} unit - Unit object with pos {x, y} in percentages
     * @returns {Object} Position {x, y} in pixels
     */
    getUnitPixelPosition(unit) {
      if (!this.core || !this.core.dom || !this.core.dom.scene) {
        return { x: 0, y: 0 };
      }

      const scene = this.core.dom.scene;
      const rect = scene.getBoundingClientRect();

      return {
        x: (unit.pos.x / 100) * rect.width,
        y: (unit.pos.y / 100) * rect.height
      };
    },

    /**
     * Play Fire Style jutsu effect
     * @param {Object} unit - Attacking unit
     */
    playFireStyle(unit) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      const emitter = CanvasJutsuEffects.fireStyle(this.engine, pos.x, pos.y, 2);

      console.log(`[BattleCanvasParticles] Fire Style at (${pos.x}, ${pos.y})`);
      return emitter;
    },

    /**
     * Play Lightning Style jutsu effect
     * @param {Object} attacker - Attacking unit
     * @param {Object} target - Target unit
     */
    playLightningStyle(attacker, target) {
      if (!this.engine) return;

      const attackerPos = this.getUnitPixelPosition(attacker);
      const targetPos = this.getUnitPixelPosition(target);

      CanvasJutsuEffects.lightningStyle(
        this.engine,
        attackerPos.x,
        attackerPos.y,
        targetPos.x,
        targetPos.y
      );

      console.log(`[BattleCanvasParticles] Lightning from (${attackerPos.x}, ${attackerPos.y}) to (${targetPos.x}, ${targetPos.y})`);
    },

    /**
     * Play Water Style jutsu effect
     * @param {Object} unit - Attacking unit
     */
    playWaterStyle(unit) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      return CanvasJutsuEffects.waterStyle(this.engine, pos.x, pos.y, 2);
    },

    /**
     * Play Wind Style jutsu effect
     * @param {Object} unit - Attacking unit
     * @param {number} direction - Direction in radians (0 = right, PI = left)
     */
    playWindStyle(unit, direction = 0) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      return CanvasJutsuEffects.windStyle(this.engine, pos.x, pos.y, direction, 1.5);
    },

    /**
     * Play Earth Style jutsu effect
     * @param {Object} unit - Attacking unit
     */
    playEarthStyle(unit) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      CanvasJutsuEffects.earthStyle(this.engine, pos.x, pos.y);
    },

    /**
     * Play Rasengan effect
     * @param {Object} unit - Attacking unit
     */
    playRasengan(unit) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      return CanvasJutsuEffects.rasengan(this.engine, pos.x, pos.y, 1.5);
    },

    /**
     * Play Chidori effect
     * @param {Object} unit - Attacking unit
     */
    playChidori(unit) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      return CanvasJutsuEffects.chidori(this.engine, pos.x, pos.y, 1.2);
    },

    /**
     * Play Explosion effect
     * @param {Object} unit - Unit at explosion center
     * @param {number} size - Explosion size multiplier
     */
    playExplosion(unit, size = 1) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      CanvasJutsuEffects.explosion(this.engine, pos.x, pos.y, size);
    },

    /**
     * Play Impact Flash when unit is hit
     * @param {Object} unit - Unit being hit
     * @param {string} color - 'white', 'red', or 'blue'
     */
    playImpactFlash(unit, color = 'white') {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      CanvasJutsuEffects.impactFlash(this.engine, pos.x, pos.y, color);
    },

    /**
     * Play Dust Cloud effect
     * @param {Object} unit - Unit at cloud center
     */
    playDustCloud(unit) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      CanvasJutsuEffects.dustCloud(this.engine, pos.x, pos.y);
    },

    /**
     * Play Healing effect
     * @param {Object} unit - Unit being healed
     */
    playHealingEffect(unit, duration = 2) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      return CanvasJutsuEffects.healingEffect(this.engine, pos.x, pos.y, duration);
    },

    /**
     * Play Shadow Clone Poof effect
     * @param {Object} unit - Unit location
     */
    playShadowClonePoof(unit) {
      if (!this.engine) return;

      const pos = this.getUnitPixelPosition(unit);
      CanvasJutsuEffects.shadowClonePoof(this.engine, pos.x, pos.y);
    },

    /**
     * Create continuous chakra aura around a unit
     * @param {Object} unit - Unit to apply aura to
     * @param {string} color - 'blue', 'red', 'yellow', 'green', 'purple'
     */
    startChakraAura(unit, color = 'blue') {
      if (!this.engine) return;

      // Stop existing aura if any
      this.stopChakraAura(unit);

      const pos = this.getUnitPixelPosition(unit);
      const emitter = CanvasJutsuEffects.chakraAura(this.engine, pos.x, pos.y, color);

      // Store emitter for this unit
      this.emitters.set(unit.id, {
        emitter: emitter,
        unit: unit,
        type: 'aura'
      });

      // Update position every frame
      const updateLoop = () => {
        if (!this.emitters.has(unit.id)) return;

        const newPos = this.getUnitPixelPosition(unit);
        emitter.setPosition(newPos.x, newPos.y);

        requestAnimationFrame(updateLoop);
      };
      updateLoop();

      return emitter;
    },

    /**
     * Stop chakra aura for a unit
     * @param {Object} unit - Unit to stop aura for
     */
    stopChakraAura(unit) {
      if (!this.emitters.has(unit.id)) return;

      const data = this.emitters.get(unit.id);
      if (data.emitter) {
        data.emitter.stop();
      }
      this.emitters.delete(unit.id);
    },

    /**
     * Play effect based on element type
     * @param {Object} attacker - Attacking unit
     * @param {Object} target - Target unit (optional for some effects)
     * @param {string} element - Element type
     */
    playElementalEffect(attacker, target, element) {
      if (!element) return;

      const elementLower = element.toLowerCase();

      switch (elementLower) {
        case 'fire':
        case 'blaze':
          this.playFireStyle(attacker);
          if (target) this.playImpactFlash(target, 'red');
          break;

        case 'lightning':
        case 'storm':
          if (target) {
            this.playLightningStyle(attacker, target);
          } else {
            this.playChidori(attacker);
          }
          break;

        case 'water':
        case 'ice':
          this.playWaterStyle(attacker);
          if (target) this.playImpactFlash(target, 'blue');
          break;

        case 'wind':
          const direction = target
            ? Math.atan2(target.pos.y - attacker.pos.y, target.pos.x - attacker.pos.x)
            : 0;
          this.playWindStyle(attacker, direction);
          break;

        case 'earth':
          this.playEarthStyle(attacker);
          if (target) this.playDustCloud(target);
          break;

        default:
          // Generic impact
          if (target) this.playImpactFlash(target);
          break;
      }
    },

    /**
     * Clear all particles
     */
    clear() {
      if (this.engine) {
        this.engine.clear();
      }
      this.emitters.clear();
    },

    /**
     * Get particle count (for debugging)
     */
    getParticleCount() {
      return this.engine ? this.engine.getParticleCount() : 0;
    },

    /**
     * Get FPS (for debugging)
     */
    getFPS() {
      return this.engine ? this.engine.getFPS() : 0;
    },

    /**
     * Destroy the particle system
     */
    destroy() {
      this.clear();
      if (this.engine) {
        this.engine.destroy();
        this.engine = null;
      }
    }
  };

  // Export to global scope
  window.BattleCanvasParticles = BattleCanvasParticles;

  console.log('[BattleCanvasParticles] Integration module loaded ✅');
})();
