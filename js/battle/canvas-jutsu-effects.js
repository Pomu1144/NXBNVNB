// js/battle/canvas-jutsu-effects.js - Pre-built Jutsu Particle Effects
(() => {
  "use strict";

  /**
   * CanvasJutsuEffects
   * Ready-to-use particle effects for different jutsu types
   *
   * Effects:
   * - Fire Style (Katon)
   * - Lightning Style (Raiton)
   * - Water Style (Suiton)
   * - Wind Style (Futon)
   * - Earth Style (Doton)
   * - Chakra auras
   * - Impact effects
   * - Rasengan
   * - Chidori
   * - Explosions
   */
  const CanvasJutsuEffects = {

    /**
     * Fire Style - Rising flames
     */
    fireStyle(engine, x, y, duration = 2) {
      return engine.createEmitter({
        x, y,
        rate: 100,
        duration: duration,
        direction: -Math.PI / 2, // Up
        spread: Math.PI / 3,
        speed: 2,
        speedVariation: 0.5,
        particle: {
          life: 1.0,
          decay: 1.5,
          size: 4,
          endSize: 8,
          color: { r: 255, g: 150, b: 0 },
          endColor: { r: 255, g: 50, b: 0 },
          gravity: -2, // Rise up
          friction: 0.95,
          glow: true,
          shape: 'circle'
        }
      });
    },

    /**
     * Lightning Style - Electric bolts
     */
    lightningStyle(engine, x, y, targetX, targetY) {
      // Create lightning bolt path
      const particles = [];
      const steps = 20;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const boltX = x + (targetX - x) * t + (Math.random() - 0.5) * 20;
        const boltY = y + (targetY - y) * t + (Math.random() - 0.5) * 20;

        particles.push(engine.emit({
          x: boltX,
          y: boltY,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          life: 0.3,
          decay: 3,
          size: 3,
          color: { r: 150, g: 200, b: 255 },
          glow: true
        }));
      }

      // Sparks at impact
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;

        engine.emit({
          x: targetX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.5,
          decay: 2,
          size: 2,
          color: { r: 200, g: 220, b: 255 },
          gravity: 0.5,
          glow: true
        });
      }

      return particles;
    },

    /**
     * Water Style - Water droplets
     */
    waterStyle(engine, x, y, duration = 2) {
      return engine.createEmitter({
        x, y,
        rate: 80,
        duration: duration,
        direction: 0,
        spread: Math.PI * 2, // All directions
        speed: 1.5,
        speedVariation: 0.4,
        particle: {
          life: 1.5,
          decay: 0.8,
          size: 3,
          endSize: 5,
          color: { r: 100, g: 150, b: 255 },
          endColor: { r: 50, g: 100, b: 200 },
          gravity: 3,
          friction: 0.98,
          bounce: 0.5,
          shape: 'circle'
        }
      });
    },

    /**
     * Wind Style - Swirling air
     */
    windStyle(engine, x, y, direction = 0, duration = 1.5) {
      return engine.createEmitter({
        x, y,
        rate: 120,
        duration: duration,
        direction: direction,
        spread: Math.PI / 4,
        speed: 4,
        speedVariation: 0.3,
        particle: {
          life: 0.8,
          decay: 1.2,
          size: 2,
          endSize: 4,
          color: { r: 200, g: 220, b: 240 },
          endColor: { r: 150, g: 170, b: 190 },
          friction: 0.96,
          shape: 'circle'
        }
      });
    },

    /**
     * Earth Style - Rock debris
     */
    earthStyle(engine, x, y) {
      // Create rock chunks
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 1;

        engine.emit({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2, // Initial upward velocity
          life: 2.0,
          decay: 0.5,
          size: Math.random() * 6 + 3,
          color: { r: 139, g: 90, b: 43 },
          gravity: 5,
          friction: 0.95,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 5,
          shape: 'square'
        });
      }
    },

    /**
     * Rasengan - Spiraling chakra sphere
     */
    rasengan(engine, x, y, duration = 1.5) {
      const emitter = engine.createEmitter({
        x, y,
        rate: 200,
        duration: duration,
        direction: 0,
        spread: Math.PI * 2,
        speed: 0,
        particle: {
          life: 0.5,
          decay: 2,
          size: 3,
          color: { r: 100, g: 150, b: 255 },
          friction: 0.9,
          glow: true
        }
      });

      // Override emitter to create spiral pattern
      const originalEmit = emitter.emitParticle.bind(emitter);
      let spiralAngle = 0;

      emitter.emitParticle = function() {
        const radius = 30 + Math.random() * 10;
        const angle = spiralAngle;
        spiralAngle += 0.3;

        const particleX = this.x + Math.cos(angle) * radius;
        const particleY = this.y + Math.sin(angle) * radius;

        // Create particle moving in spiral
        const speed = 2;
        this.engine.emit({
          x: particleX,
          y: particleY,
          vx: -Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          life: 0.5,
          decay: 2,
          size: 3,
          color: { r: 100, g: 150, b: 255 },
          glow: true
        });
      };

      return emitter;
    },

    /**
     * Chidori - Lightning blade
     */
    chidori(engine, x, y, duration = 1.2) {
      return engine.createEmitter({
        x, y,
        rate: 250,
        duration: duration,
        direction: 0,
        spread: Math.PI * 2,
        speed: 1,
        speedVariation: 0.8,
        particle: {
          life: 0.2,
          decay: 5,
          size: 2,
          endSize: 4,
          color: { r: 200, g: 220, b: 255 },
          friction: 0.92,
          glow: true,
          shape: 'star'
        }
      });
    },

    /**
     * Explosion - Impact blast
     */
    explosion(engine, x, y, size = 1) {
      // Shockwave ring
      for (let i = 0; i < 40 * size; i++) {
        const angle = (i / (40 * size)) * Math.PI * 2;
        const speed = 4 * size;

        engine.emit({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.5,
          decay: 2,
          size: 5 * size,
          endSize: 10 * size,
          color: { r: 255, g: 150, b: 0 },
          endColor: { r: 255, g: 50, b: 0 },
          friction: 0.95,
          glow: true
        });
      }

      // Fire center
      for (let i = 0; i < 30 * size; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 * size;

        engine.emit({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          decay: 1,
          size: 8 * size,
          endSize: 2 * size,
          color: { r: 255, g: 200, b: 100 },
          endColor: { r: 100, g: 50, b: 50 },
          gravity: -1,
          friction: 0.96,
          glow: true
        });
      }

      // Smoke
      for (let i = 0; i < 20 * size; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 1 * size;

        engine.emit({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 2.0,
          decay: 0.5,
          size: 15 * size,
          endSize: 30 * size,
          color: { r: 80, g: 80, b: 80 },
          endColor: { r: 40, g: 40, b: 40 },
          gravity: -0.5,
          friction: 0.98
        });
      }
    },

    /**
     * Chakra Aura - Continuous glow around unit
     */
    chakraAura(engine, x, y, color = 'blue') {
      const colors = {
        blue: { r: 100, g: 150, b: 255 },
        red: { r: 255, g: 100, b: 100 },
        yellow: { r: 255, g: 215, b: 0 },
        green: { r: 100, g: 255, b: 150 },
        purple: { r: 200, g: 100, b: 255 }
      };

      const chosenColor = colors[color] || colors.blue;

      return engine.createEmitter({
        x, y,
        rate: 50,
        duration: -1, // Infinite
        direction: -Math.PI / 2,
        spread: Math.PI * 2,
        speed: 0.5,
        speedVariation: 0.3,
        particle: {
          life: 1.0,
          decay: 1,
          size: 4,
          endSize: 8,
          color: chosenColor,
          endColor: { r: chosenColor.r, g: chosenColor.g, b: chosenColor.b },
          gravity: -1,
          friction: 0.96,
          glow: true
        }
      });
    },

    /**
     * Impact Flash - Quick burst on hit
     */
    impactFlash(engine, x, y, color = 'white') {
      const colors = {
        white: { r: 255, g: 255, b: 255 },
        red: { r: 255, g: 100, b: 100 },
        blue: { r: 100, g: 150, b: 255 }
      };

      const chosenColor = colors[color] || colors.white;

      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const speed = 3;

        engine.emit({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.3,
          decay: 3,
          size: 4,
          endSize: 2,
          color: chosenColor,
          friction: 0.9,
          glow: true
        });
      }
    },

    /**
     * Dust Cloud - Ground impact
     */
    dustCloud(engine, x, y) {
      for (let i = 0; i < 15; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 2;
        const speed = Math.random() * 2 + 1;

        engine.emit({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.5,
          decay: 0.7,
          size: 10,
          endSize: 20,
          color: { r: 180, g: 160, b: 140 },
          endColor: { r: 120, g: 100, b: 80 },
          gravity: 0.5,
          friction: 0.95
        });
      }
    },

    /**
     * Healing Effect - Green sparkles
     */
    healingEffect(engine, x, y, duration = 2) {
      return engine.createEmitter({
        x, y,
        rate: 60,
        duration: duration,
        direction: -Math.PI / 2,
        spread: Math.PI / 4,
        speed: 1,
        speedVariation: 0.3,
        particle: {
          life: 1.5,
          decay: 0.7,
          size: 4,
          endSize: 2,
          color: { r: 100, g: 255, b: 150 },
          endColor: { r: 50, g: 200, b: 100 },
          gravity: -1,
          friction: 0.98,
          glow: true,
          shape: 'star'
        }
      });
    },

    /**
     * Shadow Clone Poof - Smoke burst
     */
    shadowClonePoof(engine, x, y) {
      for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 0.5;

        engine.emit({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          decay: 1,
          size: 15,
          endSize: 25,
          color: { r: 240, g: 240, b: 240 },
          endColor: { r: 200, g: 200, b: 200 },
          friction: 0.96
        });
      }
    }
  };

  // Export to global scope
  window.CanvasJutsuEffects = CanvasJutsuEffects;

  console.log('[CanvasJutsuEffects] Jutsu effects library loaded ✅');
})();
