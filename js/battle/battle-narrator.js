// js/battle/battle-narrator.js - Combat Action Narrator
(() => {
  "use strict";

  /**
   * BattleNarrator Module
   * Displays combat action text (e.g., "Shadow Clone Barrage!")
   *
   * Features:
   * - Character-specific skill names
   * - On-screen action text display
   * - Fade-in/out animations
   */
  const BattleNarrator = {

    /**
     * Show action text on screen
     * @param {string} text - Action description
     * @param {string} type - Action type (attack, jutsu, ultimate, secret)
     * @param {Object} dom - DOM references
     */
    showAction(text, type = 'attack', dom) {
      const container = dom.scene || document.getElementById('battle-scene');
      if (!container) return;

      // Remove existing narration
      const existing = container.querySelector('.battle-narration');
      if (existing) existing.remove();

      // Create narration element
      const narration = document.createElement('div');
      narration.className = `battle-narration ${type}`;
      narration.textContent = text;

      // Styling
      Object.assign(narration.style, {
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(0.8)',
        fontSize: type === 'ultimate' || type === 'secret' ? '2.5rem' : '2rem',
        fontWeight: '900',
        textTransform: 'uppercase',
        color: this.getColorForType(type),
        textShadow: `
          0 0 20px ${this.getGlowForType(type)},
          0 0 40px ${this.getGlowForType(type)},
          0 4px 8px rgba(0, 0, 0, 0.8)
        `,
        letterSpacing: '0.1em',
        zIndex: '1000',
        pointerEvents: 'none',
        opacity: '0',
        animation: 'narrateFadeIn 0.4s ease-out forwards'
      });

      container.appendChild(narration);

      // Animate in
      requestAnimationFrame(() => {
        narration.style.opacity = '1';
        narration.style.transform = 'translate(-50%, -50%) scale(1)';
      });

      // Fade out after duration
      const duration = type === 'ultimate' || type === 'secret' ? 2000 : 1500;
      setTimeout(() => {
        narration.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        narration.style.opacity = '0';
        narration.style.transform = 'translate(-50%, -60%) scale(0.9)';
        setTimeout(() => narration.remove(), 500);
      }, duration);
    },

    /**
     * Get color for action type
     */
    getColorForType(type) {
      const colors = {
        attack: '#ffffff',
        jutsu: '#ff9500',
        ultimate: '#ff4d4d',
        secret: '#c000ff',
        guard: '#58b7ff'
      };
      return colors[type] || '#ffffff';
    },

    /**
     * Get glow color for action type
     */
    getGlowForType(type) {
      const glows = {
        attack: 'rgba(255, 255, 255, 0.6)',
        jutsu: 'rgba(255, 149, 0, 0.8)',
        ultimate: 'rgba(255, 77, 77, 0.8)',
        secret: 'rgba(192, 0, 255, 0.8)',
        guard: 'rgba(88, 183, 255, 0.8)'
      };
      return glows[type] || 'rgba(255, 255, 255, 0.6)';
    },

    /**
     * Get skill name for character and skill type
     * @param {Object} unit - Unit object
     * @param {string} skillType - 'jutsu', 'ultimate', or 'secret'
     * @returns {string} Skill name
     */
    getSkillName(unit, skillType) {
      if (!unit._ref || !unit._ref.base) return skillType.toUpperCase();

      const skills = unit._ref.base.skills;
      if (!skills) return skillType.toUpperCase();

      const skill = skills[skillType];
      if (!skill) return skillType.toUpperCase();

      return skill.name || skillType.toUpperCase();
    },

    /**
     * Narrate basic attack
     */
    narrateAttack(attacker, target, core) {
      const text = `Attack!`;
      this.showAction(text, 'attack', core.dom);
      console.log(`[Narrator] ${text}`);
    },

    /**
     * Narrate jutsu skill
     */
    narrateJutsu(attacker, target, core) {
      const skillName = this.getSkillName(attacker, 'jutsu');
      const text = `${skillName}!`;
      this.showAction(text, 'jutsu', core.dom);
      console.log(`[Narrator] ${text}`);
    },

    /**
     * Narrate ultimate skill
     */
    narrateUltimate(attacker, targets, core) {
      const skillName = this.getSkillName(attacker, 'ultimate');
      const text = `${skillName}!`;
      this.showAction(text, 'ultimate', core.dom);
      console.log(`[Narrator] ${text}`);
    },

    /**
     * Narrate secret technique
     */
    narrateSecret(attacker, targets, core) {
      const skillName = this.getSkillName(attacker, 'secret');
      const text = `${skillName}!`;
      this.showAction(text, 'secret', core.dom);
      console.log(`[Narrator] ${text}`);
    },

    /**
     * Narrate guard action
     */
    narrateGuard(unit, core) {
      const text = `Guard!`;
      this.showAction(text, 'guard', core.dom);
      console.log(`[Narrator] ${text}`);
    }
  };

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes narrateFadeIn {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.8);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    .battle-narration {
      transition: opacity 0.4s ease-out, transform 0.4s ease-out;
    }
  `;
  document.head.appendChild(style);

  // Export to window
  window.BattleNarrator = BattleNarrator;

  console.log("[BattleNarrator] Module loaded ✅");
})();
