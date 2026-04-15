// js/battle/battle-attack-names.js - Attack Name Display System
(() => {
  "use strict";

  /**
   * BattleAttackNames Module
   * Displays anime-style attack names before skills execute
   *
   * Position: Top 8%, centered
   * Duration: ~1.8 seconds total
   * Animation: Zoom + Glow + Fade Out (Storm 4 style)
   *
   * Attack Types:
   * - Ultimate: Dark red with gold stroke
   * - Secret: Gold with white glow
   * - Jutsu: Blue with light blue stroke
   * - Normal: White with black outline (optional/skip)
   */
  const BattleAttackNames = {
    currentDisplay: null,

    /**
     * Show attack name before skill executes
     * @param {string} attackName - The name of the attack (e.g., "Celestial Impact Meteor")
     * @param {string} type - Attack type: 'ultimate', 'secret', 'jutsu', 'normal'
     */
    showAttackName(attackName, type = 'jutsu') {
      // Skip if attack name is empty or normal attack
      if (!attackName || type === 'normal') {
        return;
      }

      console.log(`[AttackNames] Displaying ${type}: ${attackName}`);

      // Remove existing display if present
      if (this.currentDisplay) {
        this.currentDisplay.remove();
        this.currentDisplay = null;
      }

      // Create attack name container
      const container = document.createElement('div');
      container.className = `attack-name-display attack-name-${type}`;
      container.textContent = attackName;

      // Add to DOM
      document.body.appendChild(container);
      this.currentDisplay = container;

      // Trigger animation sequence
      this.animateAttackName(container, type);
    },

    /**
     * Anime-style animation sequence
     * Scale up → Glow pulse → Hold → Fade out with upward drift
     */
    animateAttackName(element, type) {
      // Phase 1: Scale up (0.25s)
      setTimeout(() => {
        element.classList.add('phase-scale');
      }, 10);

      // Phase 2: Glow pulse (0.15s) - starts at 0.25s
      setTimeout(() => {
        element.classList.add('phase-glow');
      }, 250);

      // Phase 3: Hold (0.8s-1.2s) - keep displaying
      // Total display time before fade: 250 + 150 + 800 = 1200ms

      // Phase 4: Fade out with upward drift (0.6s) - starts at 1.2s
      setTimeout(() => {
        element.classList.add('phase-fadeout');
      }, 1200);

      // Remove from DOM after complete (1.8s total)
      setTimeout(() => {
        element.remove();
        if (this.currentDisplay === element) {
          this.currentDisplay = null;
        }
      }, 1800);
    },

    /**
     * Get skill name from unit's skill data
     * @param {Object} unit - The unit performing the attack
     * @param {string} skillType - 'jutsu', 'ultimate', 'secret'
     * @returns {string} The skill name
     */
    getSkillName(unit, skillType) {
      const skills = window.BattleCombat?.getUnitSkills(unit);
      if (!skills || !skills[skillType]) {
        return null;
      }

      // Get skill name from data
      const skillData = skills[skillType].data;
      return skillData?.name || skillData?.skillName || `${unit.name}'s ${skillType}`;
    }
  };

  // Export to window
  window.BattleAttackNames = BattleAttackNames;

  console.log("[BattleAttackNames] Module loaded ✅");
})();
