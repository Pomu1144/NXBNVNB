// js/battle/battle-particles.js - Particle Effects System
(() => {
  "use strict";

  /**
   * BattleParticles Module
   * Handles all particle effects, auras, and visual feedback
   *
   * Features:
   * - Chakra auras based on mode (normal, focused, overflowing)
   * - Impact flashes on hits
   * - Dust clouds from movement
   * - Elemental particles
   * - Screen shake effects
   */
  const BattleParticles = {

    /* ===== Chakra Auras ===== */

    /**
     * Create chakra aura around a unit based on their chakra mode
     */
    createChakraAura(unit, mode, container) {
      if (!container) return;

      // Remove existing aura
      this.removeChakraAura(unit, container);

      if (mode === "NONE") return;

      const unitEl = container.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const aura = document.createElement('div');
      aura.className = `chakra-aura chakra-aura-${mode.toLowerCase()}`;
      aura.dataset.auraFor = unit.id;

      // Position aura around unit
      aura.style.cssText = `
        position: absolute;
        top: -10px;
        left: -10px;
        right: -10px;
        bottom: -10px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 0;
        animation: chakraPulse 1.5s ease-in-out infinite;
      `;

      // Mode-specific colors
      const colors = {
        NORMAL: 'rgba(100, 150, 255, 0.3)',
        FOCUSED: 'rgba(255, 215, 0, 0.4)',
        OVERFLOWING: 'rgba(255, 100, 100, 0.5)'
      };

      aura.style.boxShadow = `
        0 0 20px ${colors[mode] || colors.NORMAL},
        inset 0 0 20px ${colors[mode] || colors.NORMAL}
      `;

      unitEl.appendChild(aura);
    },

    /**
     * Remove chakra aura from unit
     */
    removeChakraAura(unit, container) {
      if (!container) return;
      const existing = container.querySelector(`[data-aura-for="${unit.id}"]`);
      if (existing) existing.remove();
    },

    /* ===== Impact Effects ===== */

    /**
     * Create impact flash effect when unit is hit
     */
    createImpactFlash(targetUnit, type, container) {
      if (!container) return;

      const unitEl = container.querySelector(`[data-unit-id="${targetUnit.id}"]`);
      if (!unitEl) return;

      const flash = document.createElement('div');
      flash.className = `impact-flash impact-${type}`;

      flash.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        pointer-events: none;
        z-index: 10;
        animation: flashImpact 0.3s ease-out;
      `;

      // Type-specific colors
      const colors = {
        normal: 'rgba(255, 255, 255, 0.6)',
        crit: 'rgba(255, 215, 0, 0.8)',
        weak: 'rgba(150, 150, 150, 0.4)',
        strong: 'rgba(255, 100, 50, 0.7)'
      };

      flash.style.background = `radial-gradient(circle, ${colors[type] || colors.normal}, transparent)`;

      unitEl.appendChild(flash);
      setTimeout(() => flash.remove(), 300);

      // Add screen shake for critical hits
      if (type === 'crit') {
        this.screenShake(container, 5, 200);
      }
    },

    /* ===== Dust Clouds ===== */

    /**
     * Create dust cloud effect when unit moves
     */
    createDustCloud(x, y, container) {
      if (!container) return;

      const dust = document.createElement('div');
      dust.className = 'dust-cloud';

      dust.style.cssText = `
        position: absolute;
        left: ${x}%;
        top: ${y}%;
        width: 30px;
        height: 30px;
        background: radial-gradient(circle, rgba(200, 180, 150, 0.4), transparent);
        border-radius: 50%;
        pointer-events: none;
        z-index: 1;
        animation: dustFade 0.8s ease-out forwards;
      `;

      container.appendChild(dust);
      setTimeout(() => dust.remove(), 800);
    },

    /* ===== Elemental Particles ===== */

    /**
     * Create elemental particles for jutsu effects
     */
    createElementalParticles(element, x, y, container) {
      if (!container) return;

      const particleCount = 10;
      const colors = {
        fire: '#ff6600',
        water: '#0099ff',
        lightning: '#ffff00',
        wind: '#99ff99',
        earth: '#996633'
      };

      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'elemental-particle';

        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 50 + Math.random() * 50;
        const endX = x + Math.cos(angle) * distance;
        const endY = y + Math.sin(angle) * distance;

        particle.style.cssText = `
          position: absolute;
          left: ${x}%;
          top: ${y}%;
          width: 6px;
          height: 6px;
          background: ${colors[element] || colors.fire};
          border-radius: 50%;
          pointer-events: none;
          z-index: 5;
          box-shadow: 0 0 10px ${colors[element] || colors.fire};
          animation: particleBurst 0.6s ease-out forwards;
          --end-x: ${endX}%;
          --end-y: ${endY}%;
        `;

        container.appendChild(particle);
        setTimeout(() => particle.remove(), 600);
      }
    },

    /* ===== Screen Effects ===== */

    /**
     * Screen shake effect
     */
    screenShake(element, intensity = 5, duration = 300) {
      if (!element) return;

      const originalTransform = element.style.transform || '';
      let startTime = null;

      const shake = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;

        if (elapsed < duration) {
          const progress = elapsed / duration;
          const currentIntensity = intensity * (1 - progress);

          const x = (Math.random() - 0.5) * currentIntensity * 2;
          const y = (Math.random() - 0.5) * currentIntensity * 2;

          element.style.transform = `${originalTransform} translate(${x}px, ${y}px)`;
          requestAnimationFrame(shake);
        } else {
          element.style.transform = originalTransform;
        }
      };

      requestAnimationFrame(shake);
    },

    /**
     * Slow motion effect
     */
    slowMotion(duration = 1000, slowFactor = 0.3) {
      const root = document.documentElement;
      root.style.setProperty('--slow-motion-factor', slowFactor);
      document.body.classList.add('slow-motion');

      setTimeout(() => {
        root.style.setProperty('--slow-motion-factor', 1);
        document.body.classList.remove('slow-motion');
      }, duration);
    },

    /* ===== Enhanced Damage Numbers ===== */

    /**
     * Show enhanced damage number with color coding
     */
    showDamageNumber(damage, type, x, y, container) {
      if (!container) return;

      const damageNum = document.createElement('div');
      damageNum.className = `damage-number damage-${type}`;

      // Type-specific styling
      const styles = {
        normal: { color: '#ffffff', size: '1.5rem', shadow: '0 0 5px rgba(0,0,0,0.5)' },
        crit: { color: '#ffd700', size: '2rem', shadow: '0 0 15px rgba(255,215,0,0.8)' },
        weak: { color: '#888888', size: '1.2rem', shadow: '0 0 3px rgba(0,0,0,0.3)' },
        resist: { color: '#4444ff', size: '1rem', shadow: '0 0 5px rgba(68,68,255,0.5)' },
        miss: { color: '#666666', size: '1.3rem', shadow: 'none' }
      };

      const style = styles[type] || styles.normal;

      damageNum.textContent = type === 'miss' ? 'MISS!' : `-${damage}`;
      damageNum.style.cssText = `
        position: absolute;
        left: ${x}%;
        top: ${y}%;
        font-size: ${style.size};
        font-weight: bold;
        color: ${style.color};
        text-shadow: ${style.shadow};
        pointer-events: none;
        z-index: 100;
        animation: damageFloat 1s ease-out forwards;
      `;

      // Add special effects for crits
      if (type === 'crit') {
        damageNum.style.animation = 'damageCritFloat 1s ease-out forwards';
        damageNum.textContent = `CRITICAL! -${damage}`;
      }

      container.appendChild(damageNum);
      setTimeout(() => damageNum.remove(), 1000);
    },

    /**
     * Show heal number
     */
    showHealNumber(amount, x, y, container) {
      if (!container) return;

      const healNum = document.createElement('div');
      healNum.className = 'heal-number';

      healNum.textContent = `+${amount}`;
      healNum.style.cssText = `
        position: absolute;
        left: ${x}%;
        top: ${y}%;
        font-size: 1.5rem;
        font-weight: bold;
        color: #5efc82;
        text-shadow: 0 0 10px rgba(94,252,130,0.8);
        pointer-events: none;
        z-index: 100;
        animation: healFloat 1s ease-out forwards;
      `;

      container.appendChild(healNum);
      setTimeout(() => healNum.remove(), 1000);
    },

    /* ===== Status Effect Icons ===== */

    /**
     * Show floating status effect icon above character
     */
    showStatusIcon(unit, effectType, container) {
      if (!container) return;

      const unitEl = container.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const icon = document.createElement('div');
      icon.className = `status-icon status-icon-${effectType}`;
      icon.dataset.statusIcon = effectType;

      // Icon symbols
      const symbols = {
        burn: '🔥',
        poison: '☠️',
        paralysis: '⚡',
        sleep: '💤',
        buff: '↑',
        debuff: '↓',
        shield: '🛡️',
        regen: '💚'
      };

      icon.textContent = symbols[effectType] || '●';
      icon.style.cssText = `
        position: absolute;
        top: -25px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 1.2rem;
        pointer-events: none;
        z-index: 20;
        animation: statusFloat 2s ease-in-out infinite;
        filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));
      `;

      unitEl.appendChild(icon);
    },

    /**
     * Remove status icon
     */
    removeStatusIcon(unit, effectType, container) {
      if (!container) return;
      const unitEl = container.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const icon = unitEl.querySelector(`[data-status-icon="${effectType}"]`);
      if (icon) icon.remove();
    },

    /* ===== Initialization ===== */

    /**
     * Add CSS animations to document
     */
    initializeStyles() {
      if (document.getElementById('particle-styles')) return;

      const style = document.createElement('style');
      style.id = 'particle-styles';
      style.textContent = `
        @keyframes chakraPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }

        @keyframes flashImpact {
          0% { opacity: 1; transform: scale(0.5); }
          100% { opacity: 0; transform: scale(2); }
        }

        @keyframes dustFade {
          0% { opacity: 0.6; transform: scale(0.5); }
          100% { opacity: 0; transform: scale(2); }
        }

        @keyframes particleBurst {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% {
            opacity: 0;
            transform: translate(
              calc(var(--end-x) - 50%),
              calc(var(--end-y) - 50%)
            ) scale(0);
          }
        }

        @keyframes damageFloat {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-50px); }
        }

        @keyframes damageCritFloat {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          20% { transform: translateY(-10px) scale(1.3); }
          100% { opacity: 0; transform: translateY(-60px) scale(1); }
        }

        @keyframes healFloat {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-40px); }
        }

        @keyframes statusFloat {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-5px); }
        }

        .slow-motion * {
          animation-duration: calc(var(--animation-duration, 1s) / var(--slow-motion-factor, 1)) !important;
          transition-duration: calc(var(--transition-duration, 0.3s) / var(--slow-motion-factor, 1)) !important;
        }
      `;

      document.head.appendChild(style);
      console.log("[Particles] Styles initialized");
    }
  };

  // Initialize styles on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BattleParticles.initializeStyles());
  } else {
    BattleParticles.initializeStyles();
  }

  // Export globally
  window.BattleParticles = BattleParticles;
})();
