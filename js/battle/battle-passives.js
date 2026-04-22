/* ============================================================
   js/battle/battle-passives.js — Character Passive Abilities Engine
   ------------------------------------------------------------
   Applies permanent character abilities when entering battle.
   Uses keyword matching against real ability names from characters.json
   so that any ability name containing a known keyword gets an effect.
   ============================================================ */
(() => {
  "use strict";

  // Checked in order; first match wins per ability.
  // stats → applied once at battle start (permanent)
  // turnStart → applied each turn (regen, chakra)
  // special → stored in specialEffects (evasion, counter, immunity)
  const KEYWORD_EFFECTS = [
    // ── ATK ──────────────────────────────────────────────────────────────
    { match: 'combination attack boost',      stats: { atkFlat: 120 } },
    { match: 'attack boost',                  stats: { atkFlat: 100 } },
    { match: 'damage boost against',          stats: { atkFlat: 80  } },
    { match: 'attack reduction rate boost',   stats: { atkFlat: 60  } },
    { match: 'slip damage rate boost',        stats: { atkFlat: 60  } },
    { match: 'status ailment rate boost',     stats: { atkFlat: 50  } },
    { match: 'chakra gauge reduction',        stats: { atkFlat: 50  } },

    // ── HP / HEAL ─────────────────────────────────────────────────────────
    { match: 'health boost',                  stats: { hpFlat: 500 } },
    { match: 'self-healing',                  turnStart: { healFlat: -1  } },  // -1 = parse from ability name
    { match: 'health recovers',               turnStart: { healFlat: -1  } },  // -1 = parse from ability name

    // ── SPEED ─────────────────────────────────────────────────────────────
    { match: 'speed boost',                   stats: { speedFlat: 30 } },

    // ── CRIT ──────────────────────────────────────────────────────────────
    { match: 'combination critical rate boost', stats: { critRatePercent: 10 } },
    { match: 'critical rate boost',             stats: { critRatePercent: 15 } },

    // ── DAMAGE REDUCTION ──────────────────────────────────────────────────
    { match: 'reduce wisdom damage',          stats: { damageReductionPercent: 8  } },
    { match: 'reduce bravery damage',         stats: { damageReductionPercent: 8  } },
    { match: 'reduce heart damage',           stats: { damageReductionPercent: 8  } },
    { match: 'reduce body damage',            stats: { damageReductionPercent: 8  } },
    { match: 'reduce skill damage',           stats: { damageReductionPercent: 8  } },
    { match: 'reduce damage',                 stats: { damageReductionPercent: 12 } },
    { match: 'nullifies element affinity',    stats: { damageReductionPercent: 10 } },

    // ── CHAKRA ────────────────────────────────────────────────────────────
    { match: '0 chakra req',                  stats: { chakraCostReduction: 4 } },
    { match: 'chakra recovery when receiving', turnStart: { chakraRegen: 1 } },
    { match: 'chakra recovers',               turnStart: { chakraRegen: 1 } },
    { match: 'chakra boost',                  battleStart: { chakraGrant: 4 } },

    // ── EVASION / COUNTER ─────────────────────────────────────────────────
    { match: 'substitution jutsu',            special: { evasionChance: 0.10 } },
    { match: 'counter sensor',                special: { counterChance: 0.12 } },
    { match: 'ignore substitution',           special: { ignoreEvasion: true } },
    { match: 'nullifies immobilization',      special: { immuneImmobilize: true } },

    // ── RESISTANCES (no direct combat stat, but logged) ───────────────────
    { match: 'jutsu sealing resistance',            stats: {} },
    { match: 'immobilization resistance',           stats: {} },
    { match: 'attack reduction resistance',         stats: {} },
    { match: 'slip damage resistance',              stats: {} },
    { match: 'chakra recovery sealing resistance',  stats: {} },
    { match: 'jutsu sealing rate boost',            stats: {} },
    { match: 'immobilization rate boost',           stats: {} },
  ];

  function findKeywordEffect(abilityName) {
    const lower = (abilityName || '').toLowerCase();
    return KEYWORD_EFFECTS.find(ke => lower.includes(ke.match)) || null;
  }

  const BattlePassives = {
    initializePassives(unit, core) {
      if (!unit || !unit._ref?.base?.abilities) return;

      const abilities = unit._ref.base.abilities;

      if (!unit.passiveEffects) {
        unit.passiveEffects = {
          permanentStats: {},
          turnHooks: [],
          specialEffects: {}
        };
      }

      console.log(`[Passives] Initializing for ${unit.name}:`, abilities.map(a => a.name));

      abilities.forEach(ability => {
        const ke = findKeywordEffect(ability.name);
        if (!ke) {
          console.log(`[Passives] No match: "${ability.name}"`);
          return;
        }
        this._applyKeywordEffect(unit, ability.name, ke);
      });

      this.applyPermanentStats(unit);
      console.log(`[Passives] ✅ Done for ${unit.name}`, unit.passiveEffects);
    },

    _applyKeywordEffect(unit, name, ke) {
      if (ke.stats) {
        Object.entries(ke.stats).forEach(([stat, val]) => {
          unit.passiveEffects.permanentStats[stat] =
            (unit.passiveEffects.permanentStats[stat] || 0) + val;
        });
      }

      if (ke.turnStart) {
        // Parse numeric value from ability name if effect has a placeholder (healFlat: -1)
        const effect = { ...ke.turnStart };
        if (effect.healFlat === -1) {
          // Extract number from ability name, e.g. "Self-Healing 500" → 500
          const m = name.match(/(\d[\d,]*)/);
          effect.healFlat = m ? parseInt(m[1].replace(/,/g, ''), 10) : 150;
        }
        unit.passiveEffects.turnHooks.push({
          trigger: 'turnStart',
          ability: name,
          effect
        });
      }

      if (ke.battleStart) {
        unit.passiveEffects.turnHooks.push({
          trigger: 'battleStart',
          ability: name,
          effect: ke.battleStart
        });
      }

      if (ke.special) {
        Object.entries(ke.special).forEach(([k, v]) => {
          if (typeof v === 'boolean') {
            unit.passiveEffects.specialEffects[k] = true;
          } else {
            unit.passiveEffects.specialEffects[k] =
              (unit.passiveEffects.specialEffects[k] || 0) + v;
          }
        });
      }
    },

    applyPermanentStats(unit) {
      const perma = unit.passiveEffects?.permanentStats || {};

      if (perma.hpFlat) {
        unit.stats.hp    = (unit.stats.hp    || 0) + perma.hpFlat;
        unit.stats.maxHP = (unit.stats.maxHP || 0) + perma.hpFlat;
      }
      if (perma.atkFlat) {
        unit.stats.atk = (unit.stats.atk || 0) + perma.atkFlat;
      }
      if (perma.defFlat) {
        unit.stats.def = (unit.stats.def || 0) + perma.defFlat;
      }
      if (perma.speedFlat) {
        unit.stats.speed = (unit.stats.speed || 0) + perma.speedFlat;
      }
      // critRatePercent, damageReductionPercent, chakraCostReduction kept in
      // permanentStats and read via getActiveModifiers() during combat
    },

    getActiveModifiers(unit) {
      const mods = {
        atkFlat: 0,
        defFlat: 0,
        speedPercent: 0,
        damageReductionPercent: 0,
        critRatePercent: 0,
        critDmgPercent: 0,
        jutsuDamagePercent: 0,
        chakraCostReduction: 0,
        evasionChance: 0,
        counterChance: 0
      };
      if (!unit.passiveEffects) return mods;

      const perma = unit.passiveEffects.permanentStats || {};
      if (perma.critRatePercent)        mods.critRatePercent        += perma.critRatePercent;
      if (perma.critDmgPercent)         mods.critDmgPercent         += perma.critDmgPercent;
      if (perma.damageReductionPercent) mods.damageReductionPercent += perma.damageReductionPercent;
      if (perma.chakraCostReduction)    mods.chakraCostReduction    += perma.chakraCostReduction;
      if (perma.jutsuDamagePercent)     mods.jutsuDamagePercent     += perma.jutsuDamagePercent;

      const special = unit.passiveEffects.specialEffects || {};
      if (special.evasionChance) mods.evasionChance = special.evasionChance;
      if (special.counterChance) mods.counterChance = special.counterChance;

      return mods;
    },

    onTurnStart(core, unit) {
      if (!unit.passiveEffects?.turnHooks) return;

      unit.passiveEffects.turnHooks
        .filter(h => h.trigger === 'turnStart')
        .forEach(hook => {
          const effect = hook.effect;

          if (effect.healFlat) {
            const heal = effect.healFlat;
            unit.stats.hp = Math.min(unit.stats.maxHP, unit.stats.hp + heal);
            if (window.BattleAnimations) {
              window.BattleAnimations.showDamageNumber(unit, heal, true, false);
            }
            console.log(`[Passives] ${unit.name} healed ${heal} from "${hook.ability}"`);
          }

          if (effect.healPercent) {
            const heal = Math.floor((effect.healPercent / 100) * unit.stats.maxHP);
            unit.stats.hp = Math.min(unit.stats.maxHP, unit.stats.hp + heal);
            if (window.BattleAnimations) {
              window.BattleAnimations.showDamageNumber(unit, heal, true, false);
            }
          }

          if (effect.chakraRegen) {
            const oldChakra = unit.chakra || 0;
            unit.chakra = Math.min(unit.maxChakra || 10, oldChakra + effect.chakraRegen);
            if (window.BattleBuffs && unit.chakra > oldChakra) {
              window.BattleBuffs.giveChakra?.(core, unit, unit.chakra - oldChakra);
            }
            console.log(`[Passives] ${unit.name} gained chakra from "${hook.ability}"`);
          }
        });
    },

    onBattleStart(core, unit) {
      if (!unit.passiveEffects?.turnHooks) return;

      unit.passiveEffects.turnHooks
        .filter(h => h.trigger === 'battleStart')
        .forEach(hook => {
          const effect = hook.effect;

          if (effect.chakraGrant) {
            const oldChakra = unit.chakra || 0;
            unit.chakra = Math.min(unit.maxChakra || 10, oldChakra + effect.chakraGrant);
            if (window.BattleBuffs && unit.chakra > oldChakra) {
              window.BattleBuffs.giveChakra?.(core, unit, unit.chakra - oldChakra);
            }
            console.log(`[Passives] ${unit.name} gained ${effect.chakraGrant} chakra at battle start from "${hook.ability}"`);
          }
        });
    },

    onTurnEnd(core, unit) {
      // Reserved for future turn-end passive effects
    },

    triggerEvent(unit, eventType) {
      if (!unit.passiveEffects) unit.passiveEffects = { specialEffects: {} };
      if (!unit.passiveEffects.triggers) unit.passiveEffects.triggers = {};
      unit.passiveEffects.triggers[eventType] = true;
      console.log(`[Passives] Triggered ${eventType} for ${unit.name}`);
    },

    clearEventTriggers(unit) {
      if (unit.passiveEffects?.triggers) unit.passiveEffects.triggers = {};
    }
  };

  window.BattlePassives = BattlePassives;
  console.log("[BattlePassives] Module loaded ✅");
})();
