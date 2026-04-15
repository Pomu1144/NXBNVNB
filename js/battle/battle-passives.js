/* ============================================================
   js/battle/battle-passives.js — Character Passive Abilities Engine
   ------------------------------------------------------------
   - Applies permanent character abilities when entering battle
   - Handles stat bonuses, conditional effects, and turn-based triggers
   - Integrates with BattleBuffs for timed effects
   ============================================================ */
(() => {
  "use strict";

  /**
   * Passive ability patterns for parsing text descriptions
   * Maps ability names to structured effects
   */
  const ABILITY_PATTERNS = {
    // HP bonuses
    "Never Give Up": {
      type: "permanent_stat",
      stats: { hp: 100, maxHP: 100 },
      onTurnStart: { chakraRegenPercent: 10 }
    },

    // Conditional ATK bonuses
    "Shadow Clone Mastery": {
      type: "conditional_stat",
      condition: { stat: "hp", operator: ">", threshold: 0.5, relative: true },
      stats: { atk: 150 }
    },

    // Turn-based HP regeneration
    "Nine Tails Chakra": {
      type: "turn_regen",
      onTurnStart: { healPercent: 5 }
    },

    // Conditional damage reduction
    "Uzumaki Resilience": {
      type: "conditional_reduction",
      condition: { stat: "hp", operator: "<", threshold: 0.3, relative: true },
      effects: { damageReductionPercent: 15 }
    },

    // Sharingan abilities
    "Sharingan Awakening": {
      type: "permanent_stat",
      stats: { critRatePercent: 20 },
      special: { counterChance: 0.15 }
    },

    "Chidori Mastery": {
      type: "permanent_stat",
      stats: { jutsuDamagePercent: 25 },
      effects: { chakraCostReduction: 1 }
    },

    "Avenger's Fury": {
      type: "conditional_stat",
      condition: { trigger: "ally_defeated" },
      stats: { atk: 200 }
    }
  };

  const BattlePassives = {
    /**
     * Initialize passive abilities for a unit when entering battle
     * @param {Object} unit - The combat unit
     * @param {Object} core - BattleCore reference
     */
    initializePassives(unit, core) {
      if (!unit || !unit._ref?.base?.abilities) {
        return;
      }

      const abilities = unit._ref.base.abilities;

      // Initialize passive effects storage
      if (!unit.passiveEffects) {
        unit.passiveEffects = {
          permanentStats: {},
          conditionalStats: [],
          turnHooks: [],
          specialEffects: {}
        };
      }

      console.log(`[Passives] Initializing abilities for ${unit.name}:`, abilities.map(a => a.name));

      // Process each ability
      abilities.forEach(ability => {
        const pattern = ABILITY_PATTERNS[ability.name];

        if (!pattern) {
          console.warn(`[Passives] Unknown ability: ${ability.name}`);
          return;
        }

        this.applyAbility(unit, ability, pattern, core);
      });

      // Apply permanent stat bonuses immediately
      this.applyPermanentStats(unit);

      console.log(`[Passives] ✅ Initialized ${abilities.length} abilities for ${unit.name}`);
    },

    /**
     * Apply a single ability based on its pattern
     */
    applyAbility(unit, ability, pattern, core) {
      switch (pattern.type) {
        case "permanent_stat":
          this.registerPermanentStat(unit, pattern);
          break;

        case "conditional_stat":
          this.registerConditionalStat(unit, ability, pattern);
          break;

        case "turn_regen":
          this.registerTurnRegen(unit, pattern);
          break;

        case "conditional_reduction":
          this.registerConditionalReduction(unit, pattern);
          break;
      }

      // Register turn hooks
      if (pattern.onTurnStart) {
        unit.passiveEffects.turnHooks.push({
          trigger: "turnStart",
          ability: ability.name,
          effect: pattern.onTurnStart
        });
      }

      if (pattern.onTurnEnd) {
        unit.passiveEffects.turnHooks.push({
          trigger: "turnEnd",
          ability: ability.name,
          effect: pattern.onTurnEnd
        });
      }

      // Register special effects
      if (pattern.special) {
        Object.assign(unit.passiveEffects.specialEffects, pattern.special);
      }
    },

    /**
     * Register permanent stat bonuses
     */
    registerPermanentStat(unit, pattern) {
      if (!pattern.stats) return;

      Object.entries(pattern.stats).forEach(([stat, value]) => {
        if (!unit.passiveEffects.permanentStats[stat]) {
          unit.passiveEffects.permanentStats[stat] = 0;
        }
        unit.passiveEffects.permanentStats[stat] += value;
      });
    },

    /**
     * Register conditional stat bonuses
     */
    registerConditionalStat(unit, ability, pattern) {
      unit.passiveEffects.conditionalStats.push({
        ability: ability.name,
        condition: pattern.condition,
        stats: pattern.stats || {}
      });
    },

    /**
     * Register turn-based regeneration
     */
    registerTurnRegen(unit, pattern) {
      if (pattern.onTurnStart) {
        unit.passiveEffects.turnHooks.push({
          trigger: "turnStart",
          ability: "HP Regeneration",
          effect: pattern.onTurnStart
        });
      }
    },

    /**
     * Register conditional damage reduction
     */
    registerConditionalReduction(unit, pattern) {
      unit.passiveEffects.conditionalStats.push({
        ability: "Damage Reduction",
        condition: pattern.condition,
        effects: pattern.effects || {}
      });
    },

    /**
     * Apply permanent stat bonuses to unit stats
     */
    applyPermanentStats(unit) {
      const perma = unit.passiveEffects?.permanentStats || {};

      if (perma.hp) {
        unit.stats.hp += perma.hp;
        unit.stats.maxHP += perma.maxHP || perma.hp;
      }

      if (perma.atk) {
        unit.stats.atk += perma.atk;
      }

      if (perma.def) {
        unit.stats.def += perma.def;
      }

      if (perma.speed) {
        unit.stats.speed += perma.speed;
      }
    },

    /**
     * Check if a condition is met
     */
    checkCondition(unit, condition) {
      if (!condition) return true;

      // HP threshold conditions
      if (condition.stat === "hp") {
        const currentHP = unit.stats.hp;
        const maxHP = unit.stats.maxHP;
        const ratio = currentHP / maxHP;
        const threshold = condition.relative ? condition.threshold : condition.threshold / maxHP;

        switch (condition.operator) {
          case ">": return ratio > threshold;
          case ">=": return ratio >= threshold;
          case "<": return ratio < threshold;
          case "<=": return ratio <= threshold;
          case "==": return ratio === threshold;
          default: return false;
        }
      }

      // Trigger-based conditions (ally defeated, etc.)
      if (condition.trigger) {
        // These need to be set externally when events occur
        return unit.passiveEffects?.triggers?.[condition.trigger] || false;
      }

      return false;
    },

    /**
     * Get active conditional modifiers for a unit
     * Call this during damage calculation to get current passive bonuses
     */
    getActiveModifiers(unit) {
      const modifiers = {
        atkFlat: 0,
        defFlat: 0,
        speedPercent: 0,
        damageReductionPercent: 0,
        critRatePercent: 0,
        critDmgPercent: 0,
        jutsuDamagePercent: 0,
        chakraCostReduction: 0
      };

      if (!unit.passiveEffects) return modifiers;

      // Add permanent stats
      const perma = unit.passiveEffects.permanentStats || {};
      if (perma.critRatePercent) modifiers.critRatePercent += perma.critRatePercent;
      if (perma.jutsuDamagePercent) modifiers.jutsuDamagePercent += perma.jutsuDamagePercent;

      // Check conditional stats
      (unit.passiveEffects.conditionalStats || []).forEach(conditional => {
        if (this.checkCondition(unit, conditional.condition)) {
          // Apply conditional stats
          if (conditional.stats?.atk) modifiers.atkFlat += conditional.stats.atk;
          if (conditional.stats?.def) modifiers.defFlat += conditional.stats.def;

          // Apply conditional effects
          if (conditional.effects?.damageReductionPercent) {
            modifiers.damageReductionPercent += conditional.effects.damageReductionPercent;
          }
        }
      });

      return modifiers;
    },

    /**
     * Handle turn start hooks for a unit
     * Call this at the start of each unit's turn
     */
    onTurnStart(core, unit) {
      if (!unit.passiveEffects?.turnHooks) return;

      unit.passiveEffects.turnHooks
        .filter(hook => hook.trigger === "turnStart")
        .forEach(hook => {
          const effect = hook.effect;

          // HP regeneration
          if (effect.healPercent) {
            const healAmount = Math.floor((effect.healPercent / 100) * unit.stats.maxHP);
            unit.stats.hp = Math.min(unit.stats.maxHP, unit.stats.hp + healAmount);

            // Show heal animation
            if (window.BattleAnimations) {
              window.BattleAnimations.showDamageNumber(unit, healAmount, true, false);
            }

            console.log(`[Passives] ${unit.name} regenerated ${healAmount} HP from ${hook.ability}`);
          }

          // Chakra regeneration boost
          if (effect.chakraRegenPercent) {
            const baseRegen = 1; // Normal chakra gain per turn
            const boostedRegen = Math.floor(baseRegen * (1 + effect.chakraRegenPercent / 100));
            const bonus = boostedRegen - baseRegen;

            if (bonus > 0 && window.BattleBuffs) {
              window.BattleBuffs.giveChakra(core, unit, bonus);
            }
          }
        });
    },

    /**
     * Handle turn end hooks for a unit
     */
    onTurnEnd(core, unit) {
      if (!unit.passiveEffects?.turnHooks) return;

      unit.passiveEffects.turnHooks
        .filter(hook => hook.trigger === "turnEnd")
        .forEach(hook => {
          // Add turn end effects here if needed
        });
    },

    /**
     * Trigger passive effects based on battle events
     * @param {Object} unit - Unit to trigger for
     * @param {string} eventType - Event type (e.g., "ally_defeated")
     */
    triggerEvent(unit, eventType) {
      if (!unit.passiveEffects) {
        unit.passiveEffects = { triggers: {} };
      }

      if (!unit.passiveEffects.triggers) {
        unit.passiveEffects.triggers = {};
      }

      unit.passiveEffects.triggers[eventType] = true;
      console.log(`[Passives] Triggered ${eventType} for ${unit.name}`);
    },

    /**
     * Clear temporary event triggers (call at end of battle or wave)
     */
    clearEventTriggers(unit) {
      if (unit.passiveEffects?.triggers) {
        unit.passiveEffects.triggers = {};
      }
    }
  };

  // Export globally
  window.BattlePassives = BattlePassives;

  console.log("[BattlePassives] Module loaded ✅");
})();
