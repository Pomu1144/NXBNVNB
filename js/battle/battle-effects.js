// js/battle/battle-effects.js - Effect Parser & Element System
(() => {
  "use strict";

  /**
   * BattleEffects Module
   * Handles:
   * - Parsing buffs/debuffs from skill descriptions
   * - Element advantage system (Body/Skill/Heart, Wisdom/Bravery)
   * - Speed sickness mechanic
   * - Effect application and visual indicators
   */
  const BattleEffects = {

    /* ===== Element System ===== */

    /**
     * Element advantage chart
     * Body > Skill > Heart > Body (triangle)
     * Wisdom <> Bravery (mutual advantage)
     */
    ELEMENT_ADVANTAGES: {
      'Body': { strong: 'Skill', weak: 'Heart' },
      'Skill': { strong: 'Heart', weak: 'Body' },
      'Heart': { strong: 'Body', weak: 'Skill' },
      'Wisdom': { strong: 'Bravery', weak: 'Bravery' },
      'Bravery': { strong: 'Wisdom', weak: 'Wisdom' }
    },

    /**
     * Get element multiplier
     * @param {string} attackerElement - Attacker's element
     * @param {string} defenderElement - Defender's element
     * @returns {number} Damage multiplier (1.5x, 0.9x, or 1.0x)
     */
    getElementMultiplier(attackerElement, defenderElement) {
      if (!attackerElement || !defenderElement) return 1.0;
      if (attackerElement === defenderElement) return 1.0;

      const advantage = this.ELEMENT_ADVANTAGES[attackerElement];
      if (!advantage) return 1.0;

      if (advantage.strong === defenderElement) {
        console.log(`[Effects] 🔥 ${attackerElement} is STRONG against ${defenderElement} (1.5x)`);
        return 1.5;
      }
      if (advantage.weak === defenderElement) {
        console.log(`[Effects] 💧 ${attackerElement} is WEAK against ${defenderElement} (0.9x)`);
        return 0.9;
      }

      return 1.0;
    },

    /* ===== Ability Parsing (Passive Effects) ===== */

    /**
     * Parse character abilities into passive effects
     * @param {Object} unit - Battle unit with _ref to character data
     * @returns {Object} Passive abilities object
     */
    parseAbilities(unit) {
      const abilities = unit._ref?.base?.abilities || [];
      const passives = {
        nullifiesElementAffinity: false,
        nullifiesImmobilization: false,
        ignoreSubstitution: false,
        chakraReduction: 0,
        damageBoostVs: {},
        reduceElementDamage: {},
        nullifiesDamageReduction: false,
        nullifiesJutsuSealing: false,
        speedUp: 0,
        damageReduction: 0
      };

      abilities.forEach(ability => {
        const name = ability.name?.toLowerCase() || '';
        const desc = ability.description?.toLowerCase() || '';

        // Nullifies Element Affinity-based Damage Reduction
        if (name.includes('nullifies element affinity') || desc.includes('nullifies element affinity')) {
          passives.nullifiesElementAffinity = true;
          console.log(`[Abilities] ${unit.name}: Nullifies Element Affinity`);
        }

        // Nullifies Immobilization
        if (name.includes('nullifies immobilization') || desc.includes('nullifies immobilization')) {
          passives.nullifiesImmobilization = true;
          console.log(`[Abilities] ${unit.name}: Nullifies Immobilization`);
        }

        // Ignore Substitution
        if (name.includes('ignore substitution') || desc.includes('ignore substitution')) {
          passives.ignoreSubstitution = true;
          console.log(`[Abilities] ${unit.name}: Ignore Substitution`);
        }

        // Chakra Gauge Reduction
        if (name.includes('chakra gauge reduction') || desc.includes('chakra gauge reduction')) {
          const match = desc.match(/(\d+)%/);
          passives.chakraReduction = match ? parseInt(match[1]) : 20;
          console.log(`[Abilities] ${unit.name}: Chakra Reduction ${passives.chakraReduction}%`);
        }

        // Damage Boost Against [Element]
        const boostMatch = name.match(/damage boost against (\w+)/i) ||
                          desc.match(/damage boost against (\w+)/i);
        if (boostMatch) {
          const element = boostMatch[1].charAt(0).toUpperCase() + boostMatch[1].slice(1);
          passives.damageBoostVs[element] = true;
          console.log(`[Abilities] ${unit.name}: Damage Boost vs ${element}`);
        }

        // Reduce [Element] Damage
        const reduceMatch = name.match(/reduce (\w+) damage/i) ||
                           desc.match(/reduce (\w+) damage/i);
        if (reduceMatch) {
          const element = reduceMatch[1].charAt(0).toUpperCase() + reduceMatch[1].slice(1);
          const percentMatch = desc.match(/(\d+)%/);
          passives.reduceElementDamage[element] = percentMatch ? parseInt(percentMatch[1]) : 20;
          console.log(`[Abilities] ${unit.name}: Reduce ${element} Damage ${passives.reduceElementDamage[element]}%`);
        }

        // Nullifies Damage Reduction
        if (name.includes('nullifies damage reduction') || desc.includes('nullifies damage reduction')) {
          passives.nullifiesDamageReduction = true;
          console.log(`[Abilities] ${unit.name}: Nullifies Damage Reduction`);
        }

        // Nullifies Jutsu Sealing
        if (name.includes('nullifies jutsu sealing') || desc.includes('nullifies jutsu sealing')) {
          passives.nullifiesJutsuSealing = true;
          console.log(`[Abilities] ${unit.name}: Nullifies Jutsu Sealing`);
        }

        // Speed Up
        if (name.includes('speed up') && !name.includes('nullifies')) {
          passives.speedUp = 20;
          console.log(`[Abilities] ${unit.name}: Speed Up +20`);
        }

        // Reduce Damage by XX%
        const damageReduceMatch = name.match(/reduce damage by (\d+)%/i) ||
                                 desc.match(/reduce damage by (\d+)%/i);
        if (damageReduceMatch) {
          passives.damageReduction = parseInt(damageReduceMatch[1]);
          console.log(`[Abilities] ${unit.name}: Reduce Damage ${passives.damageReduction}%`);
        }
      });

      return passives;
    },

    /**
     * Initialize unit passives
     * @param {Object} unit - Battle unit
     */
    initUnitPassives(unit) {
      unit.passives = this.parseAbilities(unit);

      // Apply permanent stat modifications
      if (unit.passives.speedUp > 0) {
        unit.stats.speed = (unit.stats.speed || 0) + unit.passives.speedUp;
      }
    },

    /**
     * Get modified element multiplier with passives
     * @param {Object} attacker - Attacking unit
     * @param {Object} defender - Defending unit
     * @returns {number} Modified element multiplier
     */
    getModifiedElementMultiplier(attacker, defender) {
      const attackerElement = attacker._ref?.base?.element;
      const defenderElement = defender._ref?.base?.element;

      if (!attackerElement || !defenderElement) return 1.0;
      if (attackerElement === defenderElement) return 1.0;

      const advantage = this.ELEMENT_ADVANTAGES[attackerElement];
      if (!advantage) return 1.0;

      let baseMult = 1.0;
      let isAdvantage = false;
      let isDisadvantage = false;

      if (advantage.strong === defenderElement) {
        baseMult = 1.5;
        isAdvantage = true;
      } else if (advantage.weak === defenderElement) {
        baseMult = 0.9;
        isDisadvantage = true;
      }

      // Check attacker's Damage Boost vs Element
      if (attacker.passives?.damageBoostVs?.[defenderElement]) {
        if (isDisadvantage) {
          baseMult = 1.1; // Weak becomes 1.1x
          console.log(`[Effects] 📈 ${attacker.name} has Damage Boost vs ${defenderElement} (weak → 1.1x)`);
        } else if (!isAdvantage) {
          baseMult = 1.5; // Neutral becomes 1.5x
          console.log(`[Effects] 📈 ${attacker.name} has Damage Boost vs ${defenderElement} (neutral → 1.5x)`);
        } else {
          baseMult = 2.0; // Advantage becomes 2.0x
          console.log(`[Effects] 📈 ${attacker.name} has Damage Boost vs ${defenderElement} (advantage → 2.0x)`);
        }
      }

      // Check defender's Nullifies Element Affinity
      if (defender.passives?.nullifiesElementAffinity && isDisadvantage) {
        baseMult = 1.0; // Ignore disadvantage
        console.log(`[Effects] 🛡️ ${defender.name} nullifies element affinity (0.9x → 1.0x)`);
      }

      return baseMult;
    },

    /* ===== Effect Parsing ===== */

    /**
     * Parse effect keywords from skill description
     * @param {string} description - Skill description text
     * @returns {Array} Array of effect objects
     */
    parseEffects(description) {
      if (!description) return [];

      const effects = [];
      const lowerDesc = description.toLowerCase();

      // Healing effects
      if (lowerDesc.includes('heal') || lowerDesc.includes('recover') || lowerDesc.includes('restore hp')) {
        const healMatch = description.match(/(\d+)(?:%|).*(?:heal|hp)/i);
        effects.push({
          type: 'heal',
          value: healMatch ? parseInt(healMatch[1]) : 500,
          isPercent: description.includes('%')
        });
      }

      // Dodge/Immunity
      if (lowerDesc.includes('dodge') || lowerDesc.includes('evade')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'dodge',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 2
        });
      }

      // Invulnerability
      if (lowerDesc.includes('invulnerable') || lowerDesc.includes('immune')) {
        effects.push({
          type: 'invulnerable',
          duration: 1
        });
      }

      // Attack buffs
      if (lowerDesc.includes('attack up') || lowerDesc.includes('boosts attack') || lowerDesc.includes('atk boost')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'attack_boost',
          target: lowerDesc.includes('all allies') || lowerDesc.includes('team') ? 'allAllies' : 'self',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 3
        });
      }

      // Defense buffs
      if (lowerDesc.includes('defense up') || lowerDesc.includes('boosts defense') || lowerDesc.includes('def boost')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'defense_boost',
          target: lowerDesc.includes('all allies') || lowerDesc.includes('team') ? 'allAllies' : 'self',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 3
        });
      }

      // Speed buffs
      if (lowerDesc.includes('speed up') || lowerDesc.includes('boosts speed') || lowerDesc.includes('spd boost')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'speed_boost',
          target: lowerDesc.includes('all allies') || lowerDesc.includes('team') ? 'allAllies' : 'self',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 2
        });
      }

      // Attack debuffs
      if (lowerDesc.includes('attack down') || lowerDesc.includes('lowers attack') || lowerDesc.includes('reduces attack')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'attack_debuff',
          target: 'enemies',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 2
        });
      }

      // Speed debuffs
      if (lowerDesc.includes('speed down') || lowerDesc.includes('lowers speed') || lowerDesc.includes('reduces speed') || lowerDesc.includes('immobilize')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'speed_debuff',
          target: 'enemies',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 2
        });
      }

      // Poison
      if (lowerDesc.includes('poison')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'poison',
          target: 'enemies',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 3
        });
      }

      // Burn
      if (lowerDesc.includes('burn') || lowerDesc.includes('slip damage')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'burn',
          target: 'enemies',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 2
        });
      }

      // Bleed
      if (lowerDesc.includes('bleed')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'bleed',
          target: 'enemies',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 3
        });
      }

      // Immobilize (separate from stun - lasts longer)
      if (lowerDesc.includes('immobilize')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'immobilized',
          target: 'enemies',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 3
        });
      }
      // Stun (short duration paralysis)
      else if (lowerDesc.includes('stun')) {
        effects.push({
          type: 'stun',
          target: 'enemies',
          duration: 1
        });
      }

      // Jutsu Seal (prevent jutsu/ultimate/secret)
      if (lowerDesc.includes('jutsu seal') || lowerDesc.includes('seal jutsu') ||
          lowerDesc.includes('prevent jutsu') || lowerDesc.includes('sealing')) {
        const turnsMatch = description.match(/(\d+)\s*turn/i);
        effects.push({
          type: 'sealed',
          target: 'enemies',
          duration: turnsMatch ? parseInt(turnsMatch[1]) : 3
        });
      }

      // Chakra Steal
      if (lowerDesc.includes('chakra steal') || lowerDesc.includes('steal chakra') ||
          lowerDesc.includes('drain chakra')) {
        effects.push({
          type: 'chakra_steal',
          target: 'enemies',
          amount: 1  // Steals 1 chakra
        });
      }

      console.log(`[Effects] Parsed ${effects.length} effects from description:`, effects);
      return effects;
    },

    /**
     * Apply parsed effects to targets
     * @param {Object} caster - Unit casting the skill
     * @param {Array} targets - Target units
     * @param {Array} effects - Parsed effects
     * @param {Object} core - BattleCore reference
     */
    applyParsedEffects(caster, targets, effects, core) {
      if (!effects || effects.length === 0) return;

      effects.forEach(effect => {
        // Determine actual targets based on effect.target
        let actualTargets = [];

        if (effect.target === 'allAllies') {
          actualTargets = core.activeTeam.filter(u => u.stats.hp > 0);
        } else if (effect.target === 'self') {
          actualTargets = [caster];
        } else if (effect.target === 'enemies') {
          actualTargets = targets;
        } else {
          actualTargets = targets;
        }

        // Apply effect to each target
        actualTargets.forEach(target => {
          if (effect.type === 'heal') {
            this.applyHeal(target, effect.value, effect.isPercent, core);
          } else if (effect.type === 'dodge') {
            this.applyStatusEffect(target, 'DODGE', effect.duration, core);
          } else if (effect.type === 'invulnerable') {
            this.applyStatusEffect(target, 'INVULNERABLE', effect.duration, core);
          } else if (effect.type === 'attack_boost') {
            this.applyStatusEffect(target, 'ATTACK_BOOST', effect.duration, core);
          } else if (effect.type === 'defense_boost') {
            this.applyStatusEffect(target, 'DEFENSE_BOOST', effect.duration, core);
          } else if (effect.type === 'speed_boost') {
            this.applyStatusEffect(target, 'SPEED_BOOST', effect.duration, core);
          } else if (effect.type === 'attack_debuff') {
            this.applyStatusEffect(target, 'ATTACK_DEBUFF', effect.duration, core);
          } else if (effect.type === 'speed_debuff') {
            this.applyStatusEffect(target, 'SPEED_DEBUFF', effect.duration, core);
          } else if (effect.type === 'poison') {
            this.applyStatusEffect(target, 'POISON', effect.duration, core);
          } else if (effect.type === 'burn') {
            this.applyStatusEffect(target, 'BURN', effect.duration, core);
          } else if (effect.type === 'bleed') {
            this.applyStatusEffect(target, 'BLEED', effect.duration, core);
          } else if (effect.type === 'stun') {
            this.applyStatusEffect(target, 'STUN', effect.duration, core);
          } else if (effect.type === 'immobilized') {
            this.applyStatusEffect(target, 'IMMOBILIZED', effect.duration, core);
          } else if (effect.type === 'sealed') {
            this.applyStatusEffect(target, 'SEALED', effect.duration, core);
          } else if (effect.type === 'chakra_steal') {
            this.applyChakraSteal(caster, target, effect.amount, core);
          }
        });
      });
    },

    /**
     * Apply healing to unit
     * @param {Object} unit - Target unit
     * @param {number} value - Heal amount
     * @param {boolean} isPercent - Is percentage-based
     * @param {Object} core - BattleCore reference
     */
    applyHeal(unit, value, isPercent, core) {
      const healAmount = isPercent ? Math.floor(unit.stats.maxHP * (value / 100)) : value;
      const oldHP = unit.stats.hp;
      unit.stats.hp = Math.min(unit.stats.maxHP, unit.stats.hp + healAmount);
      const actualHeal = unit.stats.hp - oldHP;

      console.log(`[Effects] 💚 ${unit.name} healed for ${actualHeal} HP`);

      // Show heal animation
      if (window.BattleAnimations) {
        window.BattleAnimations.showDamage(unit, actualHeal, false, core.dom, true);
      }

      // Show visual indicator
      this.showEffectIndicator(unit, 'HEAL', '#44ff44', core);

      // Update display
      if (core.units) {
        core.units.updateUnitDisplay(unit, core);
      } else {
        core.updateUnitDisplay(unit);
      }
    },

    /**
     * Apply chakra steal effect
     * @param {Object} caster - Unit stealing chakra
     * @param {Object} target - Unit losing chakra
     * @param {number} amount - Amount of chakra to steal
     * @param {Object} core - BattleCore reference
     */
    applyChakraSteal(caster, target, amount, core) {
      // Don't steal from dead units
      if (target.stats.hp <= 0) return;

      const stolenAmount = Math.min(target.chakra, amount);

      if (stolenAmount > 0) {
        // Remove chakra from target
        target.chakra = Math.max(0, target.chakra - stolenAmount);

        // Add chakra to caster
        if (core.chakra) {
          core.chakra.addChakra(caster, stolenAmount, core);
        } else {
          caster.chakra = Math.min(caster.maxChakra, caster.chakra + stolenAmount);
        }

        console.log(`[Effects] 💠 ${caster.name} stole ${stolenAmount} chakra from ${target.name}`);

        // Show visual indicators
        this.showEffectIndicator(target, `-${stolenAmount} CHAKRA`, '#ff4444', core);
        this.showEffectIndicator(caster, `+${stolenAmount} CHAKRA`, '#44ddff', core);

        // Update displays
        if (core.units) {
          core.units.updateUnitDisplay(target, core);
          core.units.updateUnitDisplay(caster, core);
        } else {
          core.updateUnitDisplay(target);
          core.updateUnitDisplay(caster);
        }
      } else {
        console.log(`[Effects] 💨 ${target.name} has no chakra to steal`);
        this.showEffectIndicator(target, 'NO CHAKRA', '#888888', core);
      }
    },

    /**
     * Apply status effect to unit
     * @param {Object} unit - Target unit
     * @param {string} effectId - Status effect ID
     * @param {number} duration - Effect duration (optional override)
     * @param {Object} core - BattleCore reference
     */
    applyStatusEffect(unit, effectId, duration, core) {
      if (!unit.statusEffects) {
        unit.statusEffects = [];
      }

      const effectData = window.STATUS_EFFECTS?.[effectId];
      if (!effectData) {
        console.warn(`[Effects] Unknown effect: ${effectId}`);
        return;
      }

      // Check for Nullifies Immobilization (stun, paralysis, immobilized, etc.)
      if ((effectId === 'STUN' || effectId === 'PARALYSIS' || effectId === 'IMMOBILIZED') && unit.passives?.nullifiesImmobilization) {
        console.log(`[Effects] 🛡️ ${unit.name} nullifies immobilization (immune to ${effectData.name})`);
        this.showEffectIndicator(unit, 'IMMUNE', '#ffaa00', core);
        return;
      }

      // Check for Nullifies Jutsu Sealing
      if (effectId === 'SEALED' && unit.passives?.nullifiesJutsuSealing) {
        console.log(`[Effects] 🛡️ ${unit.name} nullifies jutsu sealing`);
        this.showEffectIndicator(unit, 'IMMUNE', '#ffaa00', core);
        return;
      }

      // Check if effect already exists
      const existing = unit.statusEffects.find(e => e.kind === effectId);
      if (existing && !effectData.stackable) {
        // Refresh duration
        existing.turnsRemaining = duration || effectData.duration;
        console.log(`[Effects] ♻️ Refreshed ${effectData.name} on ${unit.name}`);
      } else {
        // Add new effect
        unit.statusEffects.push({
          kind: effectId,
          name: effectData.name,
          icon: effectData.icon,
          turnsRemaining: duration || effectData.duration,
          ...effectData
        });
        console.log(`[Effects] ✨ Applied ${effectData.name} to ${unit.name}`);
      }

      // Show visual indicator
      this.showEffectIndicator(unit, effectData.name, effectData.color, core);

      // Update display
      if (core.units) {
        core.units.updateUnitDisplay(unit, core);
      } else {
        core.updateUnitDisplay(unit);
      }
    },

    /**
     * Show visual effect indicator on screen
     * @param {Object} unit - Target unit
     * @param {string} text - Effect text to display
     * @param {string} color - Text color
     * @param {Object} core - BattleCore reference
     */
    showEffectIndicator(unit, text, color, core) {
      const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl || !core.dom.damageLayer) return;

      const rect = unitEl.getBoundingClientRect();
      const sceneRect = core.dom.scene.getBoundingClientRect();

      const indicator = document.createElement('div');
      indicator.className = 'effect-indicator';
      indicator.textContent = text.toUpperCase();
      indicator.style.position = 'absolute';
      indicator.style.left = `${rect.left - sceneRect.left + rect.width / 2}px`;
      indicator.style.top = `${rect.top - sceneRect.top - 60}px`;
      indicator.style.transform = 'translate(-50%, 0)';
      indicator.style.fontSize = '1.8rem';
      indicator.style.fontWeight = 'bold';
      indicator.style.color = color;
      indicator.style.textShadow = `0 0 10px ${color}, 2px 2px 4px rgba(0,0,0,0.8)`;
      indicator.style.zIndex = '1000';
      indicator.style.pointerEvents = 'none';
      indicator.style.animation = 'effectPop 1.2s ease-out forwards';

      core.dom.damageLayer.appendChild(indicator);

      setTimeout(() => indicator.remove(), 1200);
    },

    /* ===== Speed Sickness System ===== */

    /**
     * Check for speed sickness and apply stacks
     * @param {Object} unit - Unit to check
     * @param {Object} core - BattleCore reference
     */
    checkSpeedSickness(unit, core) {
      const maxSpeed = unit.stats.maxSpeed || unit._ref?.base?.statsMax?.speed || 200;
      const currentSpeed = unit.stats.speed;
      const excessSpeed = currentSpeed - maxSpeed;

      if (excessSpeed > 50) {
        const stacks = Math.floor(excessSpeed / 50);

        // Apply speed sickness stacks
        for (let i = 0; i < stacks; i++) {
          this.applyStatusEffect(unit, 'SPEED_SICKNESS', 999, core);
        }

        console.log(`[Effects] 🤢 ${unit.name} has Speed Sickness! (${stacks} stacks, +${excessSpeed} over max)`);

        // Show warning
        this.showEffectIndicator(unit, `SPEED SICKNESS x${stacks}`, '#88ff00', core);
      }
    },

    /**
     * Process turn-based status effects
     * @param {Object} unit - Unit processing effects
     * @param {Object} core - BattleCore reference
     */
    processStatusEffects(unit, core) {
      if (!unit.statusEffects || unit.statusEffects.length === 0) return;

      unit.statusEffects.forEach(effect => {
        // Apply damage over time
        if (effect.damage_per_turn) {
          const damage = effect.damage_per_turn;
          unit.stats.hp = Math.max(0, unit.stats.hp - damage);

          console.log(`[Effects] 💀 ${unit.name} takes ${damage} from ${effect.name}`);

          if (window.BattleAnimations) {
            window.BattleAnimations.showDamage(unit, damage, false, core.dom);
          }
        }

        // Apply healing over time
        if (effect.heal_per_turn) {
          const heal = effect.heal_per_turn;
          unit.stats.hp = Math.min(unit.stats.maxHP, unit.stats.hp + heal);

          console.log(`[Effects] 💚 ${unit.name} heals ${heal} from ${effect.name}`);

          if (window.BattleAnimations) {
            window.BattleAnimations.showDamage(unit, heal, false, core.dom, true);
          }
        }

        // Decrease duration
        effect.turnsRemaining--;
      });

      // Remove expired effects
      const expiredEffects = unit.statusEffects.filter(e => e.turnsRemaining <= 0);
      expiredEffects.forEach(e => {
        console.log(`[Effects] ⏰ ${e.name} expired on ${unit.name}`);
        this.showEffectIndicator(unit, `${e.name} ENDED`, '#888888', core);
      });

      unit.statusEffects = unit.statusEffects.filter(e => e.turnsRemaining > 0);

      // Update display
      if (core.units) {
        core.units.updateUnitDisplay(unit, core);
      } else {
        core.updateUnitDisplay(unit);
      }
    },

    /**
     * Check if unit has damage immunity (dodge)
     * @param {Object} unit - Unit to check
     * @returns {boolean} Has damage immunity
     */
    hasDamageImmunity(unit) {
      if (!unit.statusEffects) return false;
      return unit.statusEffects.some(e => e.damage_immunity);
    }
  };

  // Add CSS for effect indicators
  const style = document.createElement('style');
  style.textContent = `
    @keyframes effectPop {
      0% {
        opacity: 0;
        transform: translate(-50%, 20px) scale(0.5);
      }
      20% {
        opacity: 1;
        transform: translate(-50%, -10px) scale(1.2);
      }
      40% {
        transform: translate(-50%, 0) scale(1);
      }
      70% {
        transform: translate(-50%, 0) scale(1);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -20px) scale(0.8);
        opacity: 0;
      }
    }

    .effect-indicator {
      font-family: 'Cinzel', serif;
      letter-spacing: 3px;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);

  // Export to window
  window.BattleEffects = BattleEffects;

  console.log("[BattleEffects] Module loaded ✅");
})();
