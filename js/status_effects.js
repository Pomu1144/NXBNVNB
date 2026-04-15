const STATUS_EFFECTS = {
  // BUFFS (Positive Effects)
  ATTACK_BOOST: {
    id: 'attack_boost',
    name: 'Attack Boost',
    type: 'buff',
    icon: '',
    color: '#ff4444',
    description: 'Increases attack power',
    stat_modifier: { attack: 1.3 },
    duration: 3,
    stackable: false
  },
  
  DEFENSE_BOOST: {
    id: 'defense_boost',
    name: 'Defense Boost',
    type: 'buff',
    icon: '',
    color: '#4488ff',
    description: 'Increases defense',
    stat_modifier: { defense: 1.3 },
    duration: 3,
    stackable: false
  },
  
  SPEED_BOOST: {
    id: 'speed_boost',
    name: 'Speed Boost',
    type: 'buff',
    icon: '',
    color: '#ffdd44',
    description: 'Increases speed',
    stat_modifier: { speed: 1.5 },
    duration: 2,
    stackable: false
  },
  
  CHAKRA_REGEN: {
    id: 'chakra_regen',
    name: 'Chakra Regeneration',
    type: 'buff',
    icon: '',
    color: '#44ddff',
    description: 'Regenerates chakra each turn',
    chakra_per_turn: 20,
    duration: 3,
    stackable: false
  },
  
  HEALING: {
    id: 'healing',
    name: 'Healing',
    type: 'buff',
    icon: '',
    color: '#44ff44',
    description: 'Restores HP each turn',
    heal_per_turn: 15,
    duration: 3,
    stackable: true
  },
  
  INVULNERABLE: {
    id: 'invulnerable',
    name: 'Invulnerable',
    type: 'buff',
    icon: '',
    color: '#ffff44',
    description: 'Immune to all damage',
    damage_reduction: 1.0,
    duration: 1,
    stackable: false
  },
  
  PERFECT_DODGE: {
    id: 'perfect_dodge',
    name: 'Perfect Dodge',
    type: 'buff',
    icon: '',
    color: '#ccccff',
    description: 'Next attack will miss',
    dodge_next: true,
    duration: 1,
    stackable: false
  },

  DODGE: {
    id: 'dodge',
    name: 'Dodge',
    type: 'buff',
    icon: '',
    color: '#aaffff',
    description: 'Immune to all damage',
    damage_immunity: true,
    duration: 2,
    stackable: false
  },
  
  // DEBUFFS (Negative Effects)
  STUN: {
    id: 'stun',
    name: 'Stunned',
    type: 'debuff',
    icon: '',
    color: '#ffaa00',
    description: 'Cannot act',
    prevent_action: true,
    duration: 1,
    stackable: false
  },
  
  POISON: {
    id: 'poison',
    name: 'Poisoned',
    type: 'debuff',
    icon: '',
    color: '#aa00ff',
    description: 'Takes damage each turn',
    damage_per_turn: 10,
    duration: 3,
    stackable: true
  },
  
  BURN: {
    id: 'burn',
    name: 'Burning',
    type: 'debuff',
    icon: '',
    color: '#ff4400',
    description: 'Takes fire damage each turn',
    damage_per_turn: 15,
    duration: 2,
    stackable: true
  },
  
  PARALYSIS: {
    id: 'paralysis',
    name: 'Paralyzed',
    type: 'debuff',
    icon: '',
    color: '#ffff00',
    description: 'Cannot move, reduced defense',
    prevent_action: true,
    stat_modifier: { defense: 0.5 },
    duration: 1,
    stackable: false
  },
  
  GENJUTSU: {
    id: 'genjutsu',
    name: 'Genjutsu',
    type: 'debuff',
    icon: '',
    color: '#ff00ff',
    description: 'Confused, may attack allies',
    confusion: true,
    stat_modifier: { accuracy: 0.5 },
    duration: 2,
    stackable: false
  },
  
  SPEED_DEBUFF: {
    id: 'speed_debuff',
    name: 'Slowed',
    type: 'debuff',
    icon: '',
    color: '#8888ff',
    description: 'Reduced speed',
    stat_modifier: { speed: 0.5 },
    duration: 2,
    stackable: false
  },
  
  ATTACK_DEBUFF: {
    id: 'attack_debuff',
    name: 'Weakened',
    type: 'debuff',
    icon: '',
    color: '#ff8888',
    description: 'Reduced attack power',
    stat_modifier: { attack: 0.7 },
    duration: 2,
    stackable: false
  },
  
  MARKED: {
    id: 'marked',
    name: 'Marked',
    type: 'debuff',
    icon: '',
    color: '#ff0000',
    description: 'Takes increased damage',
    damage_multiplier: 1.5,
    duration: 3,
    stackable: false
  },
  
  TAGGED: {
    id: 'tagged',
    name: 'Tagged',
    type: 'debuff',
    icon: '',
    color: '#ff6600',
    description: 'Cannot dodge, easier to hit',
    stat_modifier: { evasion: 0 },
    duration: 2,
    stackable: false
  },
  
  DROWNED: {
    id: 'drowned',
    name: 'Drowned',
    type: 'debuff',
    icon: '',
    color: '#0088ff',
    description: 'Water damage over time, reduced mobility',
    damage_per_turn: 12,
    stat_modifier: { speed: 0.6 },
    duration: 3,
    stackable: false
  },
  
  SHOCK: {
    id: 'shock',
    name: 'Shocked',
    type: 'debuff',
    icon: '',
    color: '#ffff44',
    description: 'Lightning damage, may cause paralysis',
    damage_per_turn: 8,
    duration: 2,
    stackable: true,
    special: 'may_paralyze' // 30% chance to paralyze
  },
  
  AFTERSHOCK: {
    id: 'aftershock',
    name: 'Aftershock',
    type: 'debuff',
    icon: '',
    color: '#ffaa00',
    description: 'Lingering electrical damage',
    damage_per_turn: 5,
    duration: 4,
    stackable: true
  },
  
  BLEED: {
    id: 'bleed',
    name: 'Bleeding',
    type: 'debuff',
    icon: '',
    color: '#cc0000',
    description: 'Loses HP each turn',
    damage_per_turn: 8,
    duration: 3,
    stackable: true
  },
  
  SEALED: {
    id: 'sealed',
    name: 'Jutsu Sealed',
    type: 'debuff',
    icon: '',
    color: '#666666',
    description: 'Cannot use jutsu, ultimate, or secret techniques',
    prevent_jutsu: true,
    prevent_ultimate: true,
    prevent_secret: true,
    duration: 3,
    stackable: false
  },

  IMMOBILIZED: {
    id: 'immobilized',
    name: 'Immobilized',
    type: 'debuff',
    icon: '',
    color: '#888888',
    description: 'Cannot act for multiple turns',
    prevent_action: true,
    duration: 3,
    stackable: false
  },

  SPEED_SICKNESS: {
    id: 'speed_sickness',
    name: 'Speed Sickness',
    type: 'debuff',
    icon: '',
    color: '#88ff00',
    description: 'Moving too fast! Takes damage and loses attack',
    damage_per_turn: 50,
    stat_modifier: { attack: 0.8 },
    duration: 999,
    stackable: true,
    special: 'speed_penalty'
  }
};

// Status Effect Manager
class StatusEffectManager {
  constructor() {
    this.activeEffects = new Map(); // characterId -> [effects]
  }
  
  // Apply status effect to character
  applyEffect(characterId, effectId, caster = null) {
    const effect = STATUS_EFFECTS[effectId.toUpperCase()];
    if (!effect) {
      console.error(`Unknown status effect: ${effectId}`);
      return false;
    }
    
    if (!this.activeEffects.has(characterId)) {
      this.activeEffects.set(characterId, []);
    }
    
    const charEffects = this.activeEffects.get(characterId);
    
    // Check if effect already exists
    const existingIndex = charEffects.findIndex(e => e.id === effect.id);
    
    if (existingIndex !== -1) {
      if (effect.stackable) {
        // Add new stack
        charEffects.push({
          ...effect,
          turnsRemaining: effect.duration,
          caster: caster
        });
      } else {
        // Refresh duration
        charEffects[existingIndex].turnsRemaining = effect.duration;
      }
    } else {
      // Add new effect
      charEffects.push({
        ...effect,
        turnsRemaining: effect.duration,
        caster: caster
      });
    }
    
    console.log(`✨ Applied ${effect.name} to character ${characterId}`);
    return true;
  }
  
  // Remove specific effect
  removeEffect(characterId, effectId) {
    if (!this.activeEffects.has(characterId)) return;
    
    const charEffects = this.activeEffects.get(characterId);
    const index = charEffects.findIndex(e => e.id === effectId);
    
    if (index !== -1) {
      const removed = charEffects.splice(index, 1)[0];
      console.log(`❌ Removed ${removed.name} from character ${characterId}`);
    }
  }
  
  // Get all active effects for character
  getEffects(characterId) {
    return this.activeEffects.get(characterId) || [];
  }
  
  // Process turn effects (damage, healing, etc.)
  processTurnEffects(characterId, character) {
    const effects = this.getEffects(characterId);
    const results = [];
    
    effects.forEach(effect => {
      // Apply damage over time
      if (effect.damage_per_turn) {
        const damage = effect.damage_per_turn;
        character.current_hp = Math.max(0, character.current_hp - damage);
        results.push({
          type: 'damage',
          effect: effect.name,
          value: damage
        });
      }
      
      // Apply healing over time
      if (effect.heal_per_turn) {
        const heal = effect.heal_per_turn;
        character.current_hp = Math.min(character.max_hp, character.current_hp + heal);
        results.push({
          type: 'heal',
          effect: effect.name,
          value: heal
        });
      }
      
      // Apply chakra regeneration
      if (effect.chakra_per_turn) {
        const chakra = effect.chakra_per_turn;
        character.current_chakra = Math.min(character.max_chakra, character.current_chakra + chakra);
        results.push({
          type: 'chakra',
          effect: effect.name,
          value: chakra
        });
      }
      
      // Special effects
      if (effect.special === 'may_paralyze' && Math.random() < 0.3) {
        this.applyEffect(characterId, 'PARALYSIS');
        results.push({
          type: 'status',
          effect: 'Paralyzed by Shock!',
          value: 0
        });
      }
      
      // Decrease duration
      effect.turnsRemaining--;
    });
    
    // Remove expired effects
    this.activeEffects.set(
      characterId,
      effects.filter(e => e.turnsRemaining > 0)
    );
    
    return results;
  }
  
  // Check if character can act
  canAct(characterId) {
    const effects = this.getEffects(characterId);
    return !effects.some(e => e.prevent_action);
  }
  
  // Check if character can use jutsu
  canUseJutsu(characterId) {
    const effects = this.getEffects(characterId);
    return !effects.some(e => e.prevent_jutsu);
  }
  
  // Calculate modified stats
  getModifiedStats(characterId, baseStats) {
    const effects = this.getEffects(characterId);
    const modified = { ...baseStats };
    
    effects.forEach(effect => {
      if (effect.stat_modifier) {
        Object.keys(effect.stat_modifier).forEach(stat => {
          if (modified[stat] !== undefined) {
            modified[stat] *= effect.stat_modifier[stat];
          }
        });
      }
    });
    
    return modified;
  }
  
  // Calculate damage multiplier
  getDamageMultiplier(characterId) {
    const effects = this.getEffects(characterId);
    let multiplier = 1.0;
    
    effects.forEach(effect => {
      if (effect.damage_multiplier) {
        multiplier *= effect.damage_multiplier;
      }
      if (effect.damage_reduction) {
        multiplier *= (1 - effect.damage_reduction);
      }
    });
    
    return multiplier;
  }
  
  // Check if should dodge
  shouldDodge(characterId) {
    const effects = this.getEffects(characterId);
    const dodgeEffect = effects.find(e => e.dodge_next);
    if (dodgeEffect) {
      this.removeEffect(characterId, dodgeEffect.id);
      return true;
    }
    return false;
  }

  // Check if has damage immunity
  hasDamageImmunity(characterId) {
    const effects = this.getEffects(characterId);
    return effects.some(e => e.damage_immunity);
  }
  
  // Clear all effects
  clearEffects(characterId) {
    this.activeEffects.delete(characterId);
  }
  
  // Clear all
  clearAll() {
    this.activeEffects.clear();
  }
}

// Global instance
const statusManager = new StatusEffectManager();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STATUS_EFFECTS, StatusEffectManager, statusManager };
}
