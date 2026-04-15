// js/battle/battle-field-buddy.js - Field & Buddy Skill System
(() => {
  "use strict";

  /**
   * BattleFieldBuddy Module
   * Handles Field Skills (active units) and Buddy Skills (position pairs)
   *
   * Field Skill: Applied when unit is ACTIVE
   * Buddy Skill: Applied to PAIRED unit (active ↔ bench at same position)
   */
  const BattleFieldBuddy = {

    /**
     * Initialize field/buddy skills for all units at battle start
     * @param {Object} core - BattleCore reference
     */
    init(core) {
      console.log("[FieldBuddy] Initializing field and buddy skills");
      console.log("[FieldBuddy] Active team count:", core.activeTeam?.length);
      console.log("[FieldBuddy] Bench team count:", core.benchTeam?.length);

      // Check if teams are ready
      if (!core.activeTeam || core.activeTeam.length === 0) {
        console.warn("[FieldBuddy] ⚠️ No active team yet, skipping field/buddy init");
        return;
      }

      // Apply field skills to all active units
      core.activeTeam.forEach(unit => {
        if (unit && !unit.isBench) {
          console.log("[FieldBuddy] Processing active unit:", unit.name, "Position:", unit.positionId);
          this.applyFieldSkill(unit, core);
        }
      });

      // Apply buddy skills between position pairs
      this.applyAllBuddySkills(core);

      console.log("[FieldBuddy] ✅ Field and buddy skills initialized");
    },

    /**
     * Parse field skill description to extract bonuses
     * @param {Object} fieldSkill - Field skill object from character data
     * @returns {Object} Parsed bonuses
     */
    parseFieldSkill(fieldSkill) {
      if (!fieldSkill?.description) return null;

      const desc = fieldSkill.description.toLowerCase();
      const bonuses = {};

      // Attack boost: "boosts attack by 65-130" or "boosts attack by 100"
      const atkMatch = desc.match(/boosts?\s+(?:atk|attack)\s+by\s+([\d-]+)/i);
      if (atkMatch) {
        const range = atkMatch[1].split('-');
        bonuses.atkBoost = range.length > 1 ?
          Math.floor((parseInt(range[0]) + parseInt(range[1])) / 2) :
          parseInt(range[0]);
      }

      // Defense boost: "boosts defense by 50-100"
      const defMatch = desc.match(/boosts?\s+(?:def|defense)\s+by\s+([\d-]+)/i);
      if (defMatch) {
        const range = defMatch[1].split('-');
        bonuses.defBoost = range.length > 1 ?
          Math.floor((parseInt(range[0]) + parseInt(range[1])) / 2) :
          parseInt(range[0]);
      }

      // HP boost: "boosts hp by 100-200"
      const hpMatch = desc.match(/boosts?\s+hp\s+by\s+([\d-]+)/i);
      if (hpMatch) {
        const range = hpMatch[1].split('-');
        bonuses.hpBoost = range.length > 1 ?
          Math.floor((parseInt(range[0]) + parseInt(range[1])) / 2) :
          parseInt(range[0]);
      }

      // Speed boost: "boosts speed by 10-20"
      const spdMatch = desc.match(/boosts?\s+(?:spd|speed)\s+by\s+([\d-]+)/i);
      if (spdMatch) {
        const range = spdMatch[1].split('-');
        bonuses.speedBoost = range.length > 1 ?
          Math.floor((parseInt(range[0]) + parseInt(range[1])) / 2) :
          parseInt(range[0]);
      }

      // Damage reduction: "reduces damage from [element] enemies by 15-20%"
      const dmgRedMatch = desc.match(/reduces?\s+damage.*?by\s+([\d-]+)%?/i);
      if (dmgRedMatch) {
        const range = dmgRedMatch[1].split('-');
        bonuses.damageReductionPercent = range.length > 1 ?
          Math.floor((parseInt(range[0]) + parseInt(range[1])) / 2) :
          parseInt(range[0]);
      }

      // Critical rate: "boosts critical rate by 5%"
      const critMatch = desc.match(/boosts?\s+(?:crit|critical).*?by\s+([\d-]+)%?/i);
      if (critMatch) {
        const range = critMatch[1].split('-');
        bonuses.critRatePercent = range.length > 1 ?
          Math.floor((parseInt(range[0]) + parseInt(range[1])) / 2) :
          parseInt(range[0]);
      }

      return Object.keys(bonuses).length > 0 ? bonuses : null;
    },

    /**
     * Parse buddy skill description to extract bonuses
     * @param {Object} buddySkill - Buddy skill object from character data
     * @returns {Object} Parsed bonuses
     */
    parseBuddySkill(buddySkill) {
      // Same parsing logic as field skills
      return this.parseFieldSkill(buddySkill);
    },

    /**
     * Apply field skill to active unit
     * @param {Object} unit - Unit to receive field skill
     * @param {Object} core - BattleCore reference
     */
    applyFieldSkill(unit, core) {
      if (!unit || unit.isBench) return;

      const fieldSkill = unit._ref?.base?.skills?.fieldSkill;
      if (!fieldSkill) return;

      const bonuses = this.parseFieldSkill(fieldSkill);
      if (!bonuses) return;

      // Remove any existing field skill buff first
      this.removeFieldSkill(unit);

      // Create field skill buff
      if (!unit.statusEffects) unit.statusEffects = [];

      unit.statusEffects.push({
        kind: "buff",
        tag: "fieldSkill",
        source: "fieldSkill",
        name: fieldSkill.name || "Field Skill",
        turnsRemaining: 999, // Permanent while active
        payload: bonuses,
        isFieldSkill: true
      });

      console.log(`[FieldBuddy] 🏟️ Applied field skill to ${unit.name}:`, bonuses);
    },

    /**
     * Remove field skill from unit (when switching to bench)
     * @param {Object} unit - Unit to remove field skill from
     */
    removeFieldSkill(unit) {
      if (!unit?.statusEffects) return;

      const before = unit.statusEffects.length;
      unit.statusEffects = unit.statusEffects.filter(e => !e.isFieldSkill);
      const removed = before - unit.statusEffects.length;

      if (removed > 0) {
        console.log(`[FieldBuddy] ❌ Removed field skill from ${unit.name}`);
      }
    },

    /**
     * Apply buddy skills to all position pairs
     * @param {Object} core - BattleCore reference
     */
    applyAllBuddySkills(core) {
      // Get all 4 positions (active + bench pairs)
      for (let pos = 1; pos <= 4; pos++) {
        this.applyBuddySkillsForPosition(pos, core);
      }
    },

    /**
     * Apply buddy skills for a specific position pair
     * @param {number} position - Position ID (1-4)
     * @param {Object} core - BattleCore reference
     */
    applyBuddySkillsForPosition(position, core) {
      // Find active unit at this position
      const activeUnit = core.activeTeam.find(u => u.positionId === position && !u.isBench);

      // Find bench unit at this position
      const benchUnit = core.benchTeam.find(u => u.positionId === position);

      if (!activeUnit || !benchUnit) return;

      // Active unit gets buddy buff from bench unit
      this.applyBuddySkill(activeUnit, benchUnit, core);

      // Bench unit gets buddy buff from active unit
      this.applyBuddySkill(benchUnit, activeUnit, core);
    },

    /**
     * Apply buddy skill from source to target
     * @param {Object} target - Unit receiving buddy buff
     * @param {Object} source - Unit providing buddy buff
     * @param {Object} core - BattleCore reference
     */
    applyBuddySkill(target, source, core) {
      if (!target || !source) return;

      const buddySkill = source._ref?.base?.skills?.buddySkill;
      if (!buddySkill) return;

      const bonuses = this.parseBuddySkill(buddySkill);
      if (!bonuses) return;

      // Remove any existing buddy skill buff from this position first
      this.removeBuddySkill(target, source.positionId);

      // Create buddy skill buff
      if (!target.statusEffects) target.statusEffects = [];

      target.statusEffects.push({
        kind: "buff",
        tag: `buddySkill_pos${source.positionId}`,
        source: "buddySkill",
        name: buddySkill.name || "Buddy Skill",
        turnsRemaining: 999, // Permanent while paired
        payload: bonuses,
        isBuddySkill: true,
        buddyPosition: source.positionId,
        buddyName: source.name
      });

      console.log(`[FieldBuddy] 👥 ${target.name} receives buddy buff from ${source.name} (Pos ${source.positionId}):`, bonuses);
    },

    /**
     * Remove buddy skill from specific position
     * @param {Object} unit - Unit to remove buddy skill from
     * @param {number} position - Position ID of buddy
     */
    removeBuddySkill(unit, position) {
      if (!unit?.statusEffects) return;

      const before = unit.statusEffects.length;
      unit.statusEffects = unit.statusEffects.filter(e =>
        !(e.isBuddySkill && e.buddyPosition === position)
      );
      const removed = before - unit.statusEffects.length;

      if (removed > 0) {
        console.log(`[FieldBuddy] ❌ Removed buddy skill from ${unit.name} (Pos ${position})`);
      }
    },

    /**
     * Handle swap between active and bench
     * @param {Object} activeUnit - Unit leaving active
     * @param {Object} benchUnit - Unit entering active
     * @param {Object} core - BattleCore reference
     */
    onSwap(activeUnit, benchUnit, core) {
      console.log(`[FieldBuddy] 🔄 Handling swap: ${activeUnit.name} ↔ ${benchUnit.name}`);

      const position = activeUnit.positionId;

      // Remove field skill from old active unit (now going to bench)
      this.removeFieldSkill(activeUnit);

      // Apply field skill to new active unit
      this.applyFieldSkill(benchUnit, core);

      // Re-apply buddy skills for this position
      // (the pairs have swapped, so buddy buffs need updating)
      this.reapplyBuddySkillsForPosition(position, core);

      console.log(`[FieldBuddy] ✅ Swap complete for position ${position}`);
    },

    /**
     * Re-apply buddy skills for a position after swap
     * @param {number} position - Position ID
     * @param {Object} core - BattleCore reference
     */
    reapplyBuddySkillsForPosition(position, core) {
      // Find the new active and bench units at this position
      const activeUnit = core.activeTeam.find(u => u.positionId === position && !u.isBench);
      const benchUnit = core.benchTeam.find(u => u.positionId === position);

      if (!activeUnit || !benchUnit) return;

      // Remove old buddy skills from both units
      this.removeBuddySkill(activeUnit, position);
      this.removeBuddySkill(benchUnit, position);

      // Apply new buddy skills
      this.applyBuddySkill(activeUnit, benchUnit, core);
      this.applyBuddySkill(benchUnit, activeUnit, core);
    }
  };

  // Export globally
  window.BattleFieldBuddy = BattleFieldBuddy;

  console.log("[BattleFieldBuddy] Module loaded ✅");
})();
