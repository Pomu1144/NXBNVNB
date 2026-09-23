// js/battle/battle-combat.js - Combat System (Damage, Skills, Actions)
(() => {
  "use strict";

  /**
   * BattleCombat Module
   * Handles all combat calculations, attacks, skills, and damage
   *
   * Features:
   * - Damage calculation with DEF, criticals, variance
   * - Basic attacks with chakra gain
   * - Jutsu system with multipliers
   * - Ultimate abilities (multi-target)
   * - Multi-hit attacks
   * - Guard action with damage reduction
   * - Skill tier resolution
   */
  const BattleCombat = {

    /* ===== Skill Resolution ===== */

    /**
     * Get tier code for unit (3S, 4S, 5S, etc.)
     */
    getTierForUnit(unit) {
      return unit._ref?.inst?.tierCode || unit._ref?.base?.starMinCode || "3S";
    },

    /**
     * Get skill entry for specific tier
     */
    getSkillEntry(skill, tierCode) {
      if (!skill?.byTier) return null;
      if (skill.byTier[tierCode]) return skill.byTier[tierCode];
      const k = Object.keys(skill.byTier)[0];
      return k ? skill.byTier[k] : null;
    },

    /**
     * Get all skills for unit (jutsu + ultimate + secret)
     */
    getUnitSkills(unit) {
      const base = unit._ref?.base;
      const tier = this.getTierForUnit(unit);
      if (!base?.skills) return { tier, jutsu: null, ultimate: null, secret: null };

      const j = base.skills.jutsu ? this.getSkillEntry(base.skills.jutsu, tier) : null;
      const u = base.skills.ultimate ? this.getSkillEntry(base.skills.ultimate, tier) : null;
      const s = base.skills.secret ? this.getSkillEntry(base.skills.secret, tier) : null;

      return {
        tier,
        jutsu: j ? { meta: base.skills.jutsu, data: j } : null,
        ultimate: u ? { meta: base.skills.ultimate, data: u } : null,
        secret: s ? { meta: base.skills.secret, data: s } : null
      };
    },

    /* ===== Skill Unlocking System ===== */

    /**
     * Get character level from unit reference
     */
    getUnitLevel(unit) {
      return Number(unit._ref?.inst?.level || 1);
    },

    /**
     * Check if jutsu is unlocked (requires level 20)
     */
    isJutsuUnlocked(unit) {
      const level = this.getUnitLevel(unit);
      return level >= 20;
    },

    /**
     * Check if ultimate is unlocked (requires level 50)
     */
    isUltimateUnlocked(unit) {
      const level = this.getUnitLevel(unit);
      return level >= 50;
    },

    /* ===== Chakra costs (single source of truth) ===== */

    /**
     * Max level of the unit at its current tier (Progression tier cap,
     * e.g. 6S → 100). Limit breaks raise the level beyond this; a unit at or
     * above the tier cap counts as maxed.
     */
    getUnitMaxLevel(unit) {
      const tier = this.getTierForUnit(unit);
      const P = window.Progression;
      if (P?.levelCapForCode) return Number(P.levelCapForCode(tier)) || 40;
      const caps = { "1S": 20, "2S": 30, "3S": 40, "4S": 55, "5S": 70 };
      return caps[tier] ?? 100;
    },

    /** True when the unit is at the max level for its tier. */
    isUnitMaxed(unit) {
      if (!unit) return false;
      if (unit._ref?.inst?.level == null && unit.level == null) return false;
      const level = Number(unit._ref?.inst?.level ?? unit.level) || 1;
      return level >= this.getUnitMaxLevel(unit);
    },

    /**
     * Effective chakra cost of a skill for a unit.
     *  - `skill` may be the { meta, data } entry from getUnitSkills, the
     *    byTier data object itself, or a skill type string
     *    ('jutsu' | 'ultimate' | 'secret').
     *  - Uses chakraCostMax when the unit is maxed (and the skill has one),
     *    otherwise chakraCost; then applies the Chakra Gauge Reduction
     *    passive (unit.passives.chakraReduction, %), min 1.
     * Exposed as window.getSkillChakraCost(unit, skill).
     */
    getSkillChakraCost(unit, skill, fallback) {
      const DEFAULTS = { jutsu: 4, ultimate: 8, secret: 12 };
      let data = skill;
      if (typeof skill === 'string') {
        if (fallback == null) fallback = DEFAULTS[skill];
        data = this.getUnitSkills(unit)?.[skill] || null;
      }
      if (data && data.data && typeof data.data === 'object') data = data.data;
      if (!data) return Number(fallback ?? 0);

      const base = Number(data.chakraCost ?? fallback ?? 0);
      const max = Number(data.chakraCostMax);
      let cost = (Number.isFinite(max) && data.chakraCostMax != null && this.isUnitMaxed(unit)) ? max : base;
      if (!Number.isFinite(cost)) cost = Number(fallback ?? 0);

      const red = Number(unit?.passives?.chakraReduction) || 0;
      if (red > 0 && cost > 0) {
        cost = Math.max(1, cost - Math.floor(cost * (red / 100)));
      }
      return cost;
    },

    /**
     * Effective jutsu / ultimate / secret costs for a unit (null when the
     * unit has no such skill). Exposed as window.getUnitSkillCosts(unit).
     */
    getUnitSkillCosts(unit) {
      const s = this.getUnitSkills(unit);
      return {
        jutsu: s.jutsu ? this.getSkillChakraCost(unit, s.jutsu, 4) : null,
        ultimate: s.ultimate ? this.getSkillChakraCost(unit, s.ultimate, 8) : null,
        secret: s.secret ? this.getSkillChakraCost(unit, s.secret, 12) : null,
        maxed: this.isUnitMaxed(unit)
      };
    },

    /**
     * Check if secret technique is unlocked (requires tier 6S+)
     */
    isSecretUnlocked(unit) {
      const tier = this.getTierForUnit(unit);
      const tierOrder = ['3S', '4S', '5S', '6S', '6SB', '7S', '7SL', '8S', '8SM', '9S', '9ST', '10SO'];
      const currentIndex = tierOrder.indexOf(tier);
      const minIndex = tierOrder.indexOf('6S');
      return currentIndex >= minIndex;
    },

    /**
     * Get unlock requirements for skill type
     */
    getSkillUnlockRequirement(skillType) {
      const requirements = {
        jutsu: { level: 20, tier: null },
        ultimate: { level: 50, tier: null },
        secret: { level: null, tier: '6S+' }
      };
      return requirements[skillType] || null;
    },

    /* ===== Damage Calculation ===== */

    /**
     * Calculate damage with ATK, DEF, buffs, criticals, and variance
     * @param {Object} attacker - Attacking unit
     * @param {Object} defender - Defending unit
     * @param {number} multiplier - Skill multiplier (1.0 = basic attack)
     * @returns {Object} {damage, isCritical}
     */
    calculateDamage(attacker, defender, multiplier = 1) {
      // Validate inputs
      if (!attacker?.stats || !defender?.stats) {
        console.warn("[Combat] Invalid attacker or defender stats", { attacker, defender });
        return { damage: 0, isCritical: false };
      }

      // Check for dodge/immunity (unless attacker has Ignore Substitution)
      if (window.BattleEffects?.hasDamageImmunity(defender)) {
        if (!attacker.passives?.ignoreSubstitution) {
          console.log(`[Combat] 👻 ${defender.name} DODGED the attack!`);
          if (window.BattleEffects) {
            window.BattleEffects.showEffectIndicator(defender, 'DODGE', '#aaffff', { dom: window.BattleManager?.dom || {} });
          }
          return { damage: 0, isCritical: false, dodged: true };
        } else {
          console.log(`[Combat] ⚠️ ${attacker.name} IGNORES ${defender.name}'s dodge with Ignore Substitution!`);
        }
      }

      // Validate and parse multiplier
      let mult = 1;
      if (typeof multiplier === 'string') {
        const match = multiplier.match(/([\d.]+)/);
        mult = match ? parseFloat(match[1]) : 1;
      } else {
        mult = Number(multiplier) || 1;
      }

      // Ensure multiplier is valid
      if (isNaN(mult) || mult <= 0) {
        console.warn("[Combat] Invalid multiplier, using 1.0", { multiplier });
        mult = 1;
      }

      // Apply element advantage multiplier (with passives)
      if (window.BattleEffects?.getModifiedElementMultiplier) {
        const elementMult = window.BattleEffects.getModifiedElementMultiplier(attacker, defender);
        mult *= elementMult;
      }

      // Get buff modifiers from BattleBuffs
      const attackerBuffs = window.BattleBuffs?.aggregateBuffModifiers?.(attacker) || {
        atkFlat: 0,
        critRatePercent: 0,
        critDmgPercent: 0
      };

      const defenderBuffs = window.BattleBuffs?.aggregateBuffModifiers?.(defender) || {
        defFlat: 0,
        damageReductionPercent: 0,
        barrierHP: 0
      };

      // Get passive ability modifiers from BattlePassives
      const attackerPassives = window.BattlePassives?.getActiveModifiers?.(attacker) || {
        atkFlat: 0,
        critRatePercent: 0,
        critDmgPercent: 0,
        jutsuDamagePercent: 0
      };

      const defenderPassives = window.BattlePassives?.getActiveModifiers?.(defender) || {
        defFlat: 0,
        damageReductionPercent: 0
      };

      // Base stats with validation
      const baseAtk = Math.max(0, Number(attacker.stats.atk) || 100);
      const baseDef = Math.max(0, Number(defender.stats.def) || 0);

      // Apply buff and passive modifiers to stats
      const effectiveAtk = baseAtk + attackerBuffs.atkFlat + attackerPassives.atkFlat;
      const effectiveDef = baseDef + defenderBuffs.defFlat + defenderPassives.defFlat;

      // Base damage from ATK stat and multiplier
      let damage = effectiveAtk * mult;

      // Subtract defender's DEF (50% effectiveness)
      damage -= effectiveDef * 0.5;

      // Guard reduces damage by 50%
      if (defender.isGuarding) {
        damage *= 0.5;
      }

      // Apply damage reduction from buffs and passives (unless attacker has Nullifies Damage Reduction)
      let totalDamageReduction = defenderBuffs.damageReductionPercent + defenderPassives.damageReductionPercent;

      // Add defender's Reduce Damage by XX% passive
      if (defender.passives?.damageReduction > 0) {
        totalDamageReduction += defender.passives.damageReduction;
        console.log(`[Combat] 🛡️ ${defender.name} reduces damage by ${defender.passives.damageReduction}%`);
      }

      // Add defender's Reduce Element Damage passive
      const attackerElement = attacker._ref?.base?.element;
      if (attackerElement && defender.passives?.reduceElementDamage?.[attackerElement]) {
        const elementReduction = defender.passives.reduceElementDamage[attackerElement];
        totalDamageReduction += elementReduction;
        console.log(`[Combat] 🛡️ ${defender.name} reduces ${attackerElement} damage by ${elementReduction}%`);
      }

      // Apply total damage reduction (unless attacker nullifies it)
      if (totalDamageReduction > 0) {
        if (!attacker.passives?.nullifiesDamageReduction) {
          damage *= (1 - totalDamageReduction / 100);
        } else {
          console.log(`[Combat] ⚠️ ${attacker.name} NULLIFIES damage reduction!`);
        }
      }

      // Random variance (90% - 110%)
      damage *= (0.9 + Math.random() * 0.2);

      // Critical hit system:
      //   totalCritRate (%) = 15 base + card CRI + buff + passive
      //   ≥100% → always crit; overflow converts to bonus crit damage at 1:0.25
      //   critMultiplier = totalCritDmg / 100  (e.g. 360% → 3.6×)
      const cardCritRate = attacker.stats?.critRate || 0;  // raw % (e.g. 268.0)
      const totalCritRate = 15 + cardCritRate + attackerBuffs.critRatePercent + attackerPassives.critRatePercent;
      const overflowRate  = Math.max(0, totalCritRate - 100);
      const bonusCritDmg  = overflowRate * 0.25;  // 1% overflow → +0.25% crit dmg

      const isCritical = totalCritRate >= 100 || Math.random() < (totalCritRate / 100);

      if (isCritical) {
        const cardCritDmg   = attacker.stats?.critDmg || 0;  // raw % (e.g. 360.0)
        const totalCritDmg  = cardCritDmg + bonusCritDmg + attackerBuffs.critDmgPercent + attackerPassives.critDmgPercent;
        const critMultiplier = totalCritDmg > 0 ? (totalCritDmg / 100) : 1.5;  // fallback 1.5× if no crit dmg stat
        damage *= critMultiplier;
        console.log(`[Combat] ⚡ CRIT! rate=${totalCritRate.toFixed(1)}% overflow=${overflowRate.toFixed(1)}% dmg=${totalCritDmg.toFixed(1)}% mult=${critMultiplier.toFixed(2)}×`);
      }

      // Apply barrier absorption
      if (defenderBuffs.barrierHP > 0) {
        // Find barrier buff in defender's status effects
        const barrierBuff = defender.statusEffects?.find(se =>
          se.kind === 'buff' && se.payload?.barrierHP > 0
        );

        // Bug #9: Validate payload exists before accessing
        if (barrierBuff && barrierBuff.payload && barrierBuff.payload.barrierHP > 0) {
          const absorbed = Math.min(damage, barrierBuff.payload.barrierHP);
          barrierBuff.payload.barrierHP -= absorbed;
          damage -= absorbed;

          // Remove barrier if depleted
          if (barrierBuff.payload.barrierHP <= 0) {
            defender.statusEffects = defender.statusEffects.filter(se => se !== barrierBuff);
          }
        }
      }

      // Ensure minimum damage of 1 (unless fully blocked)
      const finalDamage = Math.max(0, Math.floor(damage));

      const defReduction = Math.floor(effectiveDef * 0.5);

      console.log(`[Combat] Damage calculated:`, {
        attacker: attacker.name,
        defender: defender.name,
        multiplier: mult,
        effectiveAtk,
        effectiveDef,
        rawDamage: damage,
        finalDamage: finalDamage > 0 ? Math.max(1, finalDamage) : 0,
        isCritical,
        attackerBuffs,
        defenderBuffs
      });

      return {
        damage: finalDamage > 0 ? Math.max(1, finalDamage) : 0,
        isCritical,
        breakdown: {
          atk: Math.floor(effectiveAtk),
          multiplier: mult.toFixed(1),
          defReduction: defReduction,
          guard: defender.isGuarding,
          critical: isCritical,
          critMultiplier: isCritical ? (((attacker.stats?.critDmg || 0) + Math.max(0, 15 + (attacker.stats?.critRate || 0) + attackerBuffs.critRatePercent + attackerPassives.critRatePercent - 100) * 0.25 + attackerBuffs.critDmgPercent + attackerPassives.critDmgPercent) / 100 || 1.5).toFixed(2) : null
        }
      };
    },

    /* ===== Basic Attack ===== */

    /**
     * Perform basic attack (single target)
     * Awards 1 chakra on hit
     */
    performAttack(attacker, target, core, onDone) {
      console.log(`[Combat] ${attacker.name} attacks ${target.name}`);

      // Calculate damage first
      const {damage, isCritical, breakdown} = this.calculateDamage(attacker, target, 1.0);

      // Create GSAP timeline for smooth sequencing
      if (window.gsap) {
        const tl = window.gsap.timeline({
          onComplete: () => {
            core.checkBattleEnd();
            onDone?.();
          }
        });

        // Step 1: Narrate and apply damage immediately
        tl.call(() => {
          if (window.BattleNarrator) {
            window.BattleNarrator.narrateAttack(attacker, target, core);
          }

          console.log(`[Combat] 🎯 BEFORE DAMAGE: ${target.name} HP = ${target.stats.hp}`);
          target.stats.hp = Math.max(0, target.stats.hp - damage);
          console.log(`[Combat] 💥 AFTER DAMAGE: ${target.name} HP = ${target.stats.hp} (took ${damage} damage)`);

          // Apply knockback
          if (window.BattlePhysics) {
            window.BattlePhysics.applyKnockback(target, attacker, 30, core);
          }

          // Award chakra for attacking
          if (core.chakra) {
            core.chakra.addChakra(attacker, 1, core);
          } else {
            attacker.chakra = Math.min(attacker.maxChakra, attacker.chakra + 1);
          }

          // Track basic attack for Last Stand Ultimate system
          if (window.BattleEquippedUltimate) {
            window.BattleEquippedUltimate.onBasicAttack(attacker.id);
          }

          // Show damage animation
          if (window.BattleAnimations) {
            window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
          }

          // Update displays
          if (core.units) {
            core.units.updateUnitDisplay(attacker, core);
            core.units.updateUnitDisplay(target, core);
          } else {
            core.updateUnitDisplay(attacker);
            core.updateUnitDisplay(target);
          }

          core.updateTeamHP();
        });

        // Step 2: Wait for HP bar animation (0.4s)
        tl.addLabel("complete", "+=0.4");

      } else {
        // Fallback to setTimeout
        if (window.BattleNarrator) {
          window.BattleNarrator.narrateAttack(attacker, target, core);
        }

        target.stats.hp = Math.max(0, target.stats.hp - damage);

        if (window.BattlePhysics) {
          window.BattlePhysics.applyKnockback(target, attacker, 30, core);
        }

        if (core.chakra) {
          core.chakra.addChakra(attacker, 1, core);
        } else {
          attacker.chakra = Math.min(attacker.maxChakra, attacker.chakra + 1);
        }

        if (window.BattleEquippedUltimate) {
          window.BattleEquippedUltimate.onBasicAttack(attacker.id);
        }

        if (window.BattleAnimations) {
          window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
        }

        if (core.units) {
          core.units.updateUnitDisplay(attacker, core);
          core.units.updateUnitDisplay(target, core);
        } else {
          core.updateUnitDisplay(attacker);
          core.updateUnitDisplay(target);
        }

        core.updateTeamHP();

        setTimeout(() => {
          core.checkBattleEnd();
          onDone?.();
        }, 400);
      }
    },

    /* ===== Jutsu (Single Target Skill) ===== */

    /**
     * Perform jutsu skill on single target
     * Costs chakra, has multiplier
     * @returns {boolean} Success status
     */
    performJutsu(attacker, target, core, onDone) {
      const skills = this.getUnitSkills(attacker);
      const j = skills.jutsu;

      if (!j) {
        console.warn(`[Combat] ${attacker.name} has no jutsu skill`);
        return false;
      }

      // Check if unit is sealed (cannot use jutsu)
      const isSealed = attacker.statusEffects?.some(e =>
        e.prevent_jutsu && e.turnsRemaining > 0
      );
      if (isSealed) {
        console.warn(`[Combat] 🔒 ${attacker.name}'s jutsu is sealed!`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`${attacker.name}'s jutsu is sealed!`, core);
        }
        if (window.BattleEffects) {
          window.BattleEffects.showEffectIndicator(attacker, 'SEALED', '#666666', core);
        }
        return false;
      }

      // Check if jutsu is unlocked
      if (!this.isJutsuUnlocked(attacker)) {
        const level = this.getUnitLevel(attacker);
        console.warn(`[Combat] ${attacker.name}'s jutsu is locked (Level ${level}/20)`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`${attacker.name}'s jutsu is locked! Requires Level 20.`, core);
        }
        return false;
      }

      // Effective cost: chakraCostMax when maxed, minus Chakra Gauge Reduction
      const cost = this.getSkillChakraCost(attacker, j, 4);

      // Check and spend chakra
      if (core.chakra) {
        if (!core.chakra.spendChakra(attacker, cost, core)) {
          return false;
        }
      } else {
        if (attacker.chakra < cost) return false;
        attacker.chakra -= cost;
      }

      // Reset basic attack count when using ninjutsu
      if (window.BattleEquippedUltimate) {
        window.BattleEquippedUltimate.onNinjutsuUse(attacker.id);
      }

      // Animated sprite units play their own jutsu sheet, one damage number per hit.
      if (this.usesSpriteSkill(attacker)) {
        this.performSpriteSkill(attacker, 'jutsu', j, [target], core, onDone);
        return true;
      }

      // Get multiplier from skill data (extract from description like "2.2x attack...")
      let mult = 2.0;
      const m = String(j.data.description || "").match(/([\d.]+)x/i);
      // Bug #2: Check if match exists and has captured group
      if (m && m[1]) mult = Number(m[1]) || 2.0;

      // Hits: full damage divided across N hits (each hit = totalDmg / hits)
      const hitCount = Math.max(1, Number(j.data.hits || 1));

      console.log(`[Combat] ${attacker.name} uses ${j.meta.name} (${mult}x, ${hitCount} hit${hitCount > 1 ? 's' : ''}) on ${target.name}`);

      // Calculate total damage first (full damage, then split by hits)
      const {damage: totalDamage, isCritical, breakdown} = this.calculateDamage(attacker, target, mult);
      const perHitDamage = Math.max(1, Math.floor(totalDamage / hitCount));
      const damage = perHitDamage * hitCount;  // re-assembled total (avoids rounding loss)

      // Create GSAP timeline for smooth sequencing
      if (window.gsap) {
        const tl = window.gsap.timeline({
          paused: true, // started once the cut-in is done
          onComplete: () => {
            core.checkBattleEnd();
            onDone?.();
          }
        });
        this.afterCutin(attacker, 'jutsu', j.data.name || j.data.skillName || j.meta.name, () => tl.play());

        // Step 1: Show attack name (0s)
        tl.call(() => {
          if (window.BattleAttackNames) {
            const attackName = j.data.name || j.data.skillName || j.meta.name;
            window.BattleAttackNames.showAttackName(attackName, 'jutsu');
          }
          if (window.BattleNarrator) {
            window.BattleNarrator.narrateJutsu(attacker, target, core);
          }
        });

        // Step 2: Wait 0.7s for attack name to breathe
        tl.call(() => {
          const animGif = j.data.animationGif || attacker._ref?.base?.jutsuAnimation;
          if (window.BattleAnimations) {
            window.BattleAnimations.playSkillAnimation(attacker, "jutsu", animGif, core.dom);
          }
        }, null, "+=0.7");

        // Step 3: Apply knockback at 0.3s
        tl.call(() => {
          if (window.BattlePhysics) {
            window.BattlePhysics.applyKnockback(target, attacker, 50, core);
          }
        }, null, "-=0.4");

        // Step 4: Apply damage (split across hits) and show damage numbers at 0.4s
        tl.call(() => {
          target.stats.hp = Math.max(0, target.stats.hp - damage);

          if (window.BattleAnimations) {
            // Show each hit separately with a small stagger, or show total if 1 hit
            if (hitCount <= 1) {
              window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
            } else {
              for (let h = 0; h < hitCount; h++) {
                setTimeout(() => {
                  window.BattleAnimations.showDamage(target, perHitDamage, isCritical, core.dom, false, h === 0 ? breakdown : null);
                }, h * 120);
              }
            }
          }

          // Apply description-based skill effects (immobilize, seal, heal, etc.)
          this.applyDescriptionEffects(j.data.description, attacker, [target], core);

          // Update displays
          if (core.units) {
            core.units.updateUnitDisplay(attacker, core);
            core.units.updateUnitDisplay(target, core);
          } else {
            core.updateUnitDisplay(attacker);
            core.updateUnitDisplay(target);
          }

          core.updateTeamHP();
        }, null, "-=0.3");

      } else {
        // Fallback to setTimeout for browsers without GSAP
        if (window.BattleAttackNames) {
          const attackName = j.data.name || j.data.skillName || j.meta.name;
          window.BattleAttackNames.showAttackName(attackName, 'jutsu');
        }

        if (window.BattleNarrator) {
          window.BattleNarrator.narrateJutsu(attacker, target, core);
        }

        setTimeout(() => {
          const animGif = j.data.animationGif || attacker._ref?.base?.jutsuAnimation;
          if (window.BattleAnimations) {
            window.BattleAnimations.playSkillAnimation(attacker, "jutsu", animGif, core.dom);
          }
        }, 700);

        target.stats.hp = Math.max(0, target.stats.hp - damage);

        // Apply description-based skill effects
        this.applyDescriptionEffects(j.data.description, attacker, [target], core);

        setTimeout(() => {
          if (window.BattlePhysics) {
            window.BattlePhysics.applyKnockback(target, attacker, 50, core);
          }
        }, 300);

        setTimeout(() => {
          if (window.BattleAnimations) {
            window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
          }
        }, 400);

        if (core.units) {
          core.units.updateUnitDisplay(attacker, core);
          core.units.updateUnitDisplay(target, core);
        } else {
          core.updateUnitDisplay(attacker);
          core.updateUnitDisplay(target);
        }

        core.updateTeamHP();

        setTimeout(() => {
          core.checkBattleEnd();
          onDone?.();
        }, 600);
      }

      return true;
    },

    /* ===== Ultimate (Multi-Target Skill) ===== */

    /**
     * Perform ultimate skill on multiple targets
     * Costs more chakra, hits all enemies
     * @returns {boolean} Success status
     */
    performUltimate(attacker, targets, core, onDone) {
      const skills = this.getUnitSkills(attacker);
      const u = skills.ultimate;

      if (!u) {
        console.warn(`[Combat] ${attacker.name} has no ultimate skill`);
        return false;
      }

      // Check if unit is sealed (cannot use ultimate)
      const isSealed = attacker.statusEffects?.some(e =>
        e.prevent_ultimate && e.turnsRemaining > 0
      );
      if (isSealed) {
        console.warn(`[Combat] 🔒 ${attacker.name}'s ultimate is sealed!`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`${attacker.name}'s ultimate is sealed!`, core);
        }
        if (window.BattleEffects) {
          window.BattleEffects.showEffectIndicator(attacker, 'SEALED', '#666666', core);
        }
        return false;
      }

      // Check if ultimate is unlocked
      if (!this.isUltimateUnlocked(attacker)) {
        const level = this.getUnitLevel(attacker);
        console.warn(`[Combat] ${attacker.name}'s ultimate is locked (Level ${level}/50)`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`${attacker.name}'s ultimate is locked! Requires Level 50.`, core);
        }
        return false;
      }

      // Effective cost: chakraCostMax when maxed, minus Chakra Gauge Reduction
      const cost = this.getSkillChakraCost(attacker, u, 8);

      // Check and spend chakra
      if (core.chakra) {
        if (!core.chakra.spendChakra(attacker, cost, core)) {
          return false;
        }
      } else {
        if (attacker.chakra < cost) return false;
        attacker.chakra -= cost;
      }

      // Animated sprite units play their own ultimate sheet, one damage number per hit.
      if (this.usesSpriteSkill(attacker)) {
        this.performSpriteSkill(attacker, 'ultimate', u, targets, core, onDone);
        return true;
      }

      // Get multiplier (extract from description like "1.5x attack...")
      let mult = 1.5;
      const m = String(u.data.description || "").match(/([\d.]+)x/i);
      // Bug #2: Check if match exists and has captured group
      if (m && m[1]) mult = Number(m[1]) || 1.5;

      console.log(`[Combat] ${attacker.name} uses ${u.meta.name} (${mult}x) on ${targets.length} targets`);

      // Create GSAP timeline for smooth sequencing
      if (window.gsap) {
        const tl = window.gsap.timeline({
          paused: true, // started once the cut-in is done
          onComplete: () => {
            core.checkBattleEnd();
            onDone?.();
          }
        });
        this.afterCutin(attacker, 'ultimate', u.data.name || u.data.skillName || u.meta.name, () => tl.play());

        // Step 1: Show attack name (0s)
        tl.call(() => {
          if (window.BattleAttackNames) {
            const attackName = u.data.name || u.data.skillName || u.meta.name;
            window.BattleAttackNames.showAttackName(attackName, 'ultimate');
          }
          if (window.BattleNarrator) {
            window.BattleNarrator.narrateUltimate(attacker, targets, core);
          }
        });

        // Step 2: Wait 0.7s then play animation
        tl.call(() => {
          const animGif = u.data.animationGif || attacker._ref?.base?.ultimateAnimation;
          if (window.BattleAnimations) {
            window.BattleAnimations.playSkillAnimation(attacker, "ultimate", animGif, core.dom);
          }

          // Update attacker display
          if (core.units) {
            core.units.updateUnitDisplay(attacker, core);
          } else {
            core.updateUnitDisplay(attacker);
          }
        }, null, "+=0.7");

        // Step 3: Hit each target with 0.2s stagger
        targets.forEach((target, i) => {
          tl.call(() => {
            const {damage, isCritical, breakdown} = this.calculateDamage(attacker, target, mult);
            target.stats.hp = Math.max(0, target.stats.hp - damage);

            // Check if this defeats the final enemy
            const remainingEnemies = core.enemyTeam.filter(e => e.stats.hp > 0).length;
            const shouldFinish = window.BattleFinish?.shouldTriggerFinish(target, remainingEnemies, true);

            // Apply knockback immediately
            if (window.BattlePhysics) {
              window.BattlePhysics.applyKnockback(target, attacker, 60, core);
            }

            // Show damage after 0.15s
            window.gsap.delayedCall(0.15, () => {
              if (window.BattleAnimations) {
                window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
              }
            });

            // Trigger finish effects if needed
            if (shouldFinish) {
              window.gsap.delayedCall(0.3, () => {
                if (window.BattleFinish) {
                  window.BattleFinish.playFinishEffects(attacker, target, core);
                }
              });
            }

            // Apply description-based skill effects to this target
            this.applyDescriptionEffects(u.data.description, attacker, [target], core);

            // Update target display
            if (core.units) {
              core.units.updateUnitDisplay(target, core);
            } else {
              core.updateUnitDisplay(target);
            }

            core.updateTeamHP();
          }, null, i === 0 ? "+=0" : "+=0.2");
        });

      } else {
        // Fallback to setTimeout
        if (window.BattleAttackNames) {
          const attackName = u.data.name || u.data.skillName || u.meta.name;
          window.BattleAttackNames.showAttackName(attackName, 'ultimate');
        }

        if (window.BattleNarrator) {
          window.BattleNarrator.narrateUltimate(attacker, targets, core);
        }

        setTimeout(() => {
          const animGif = u.data.animationGif || attacker._ref?.base?.ultimateAnimation;
          if (window.BattleAnimations) {
            window.BattleAnimations.playSkillAnimation(attacker, "ultimate", animGif, core.dom);
          }
        }, 700);

        targets.forEach((target, i) => {
          setTimeout(() => {
            const {damage, isCritical, breakdown} = this.calculateDamage(attacker, target, mult);
            target.stats.hp = Math.max(0, target.stats.hp - damage);

            const remainingEnemies = core.enemyTeam.filter(e => e.stats.hp > 0).length;
            const shouldFinish = window.BattleFinish?.shouldTriggerFinish(target, remainingEnemies, true);

            if (shouldFinish) {
              setTimeout(() => {
                if (window.BattleFinish) {
                  window.BattleFinish.playFinishEffects(attacker, target, core);
                }
              }, 300);
            }

            if (window.BattlePhysics) {
              window.BattlePhysics.applyKnockback(target, attacker, 60, core);
            }

            setTimeout(() => {
              if (window.BattleAnimations) {
                window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
              }
            }, 150);

            if (core.units) {
              core.units.updateUnitDisplay(target, core);
            } else {
              core.updateUnitDisplay(target);
            }
          }, i * 200);
        });

        if (core.units) {
          core.units.updateUnitDisplay(attacker, core);
        } else {
          core.updateUnitDisplay(attacker);
        }

        core.updateTeamHP();

        setTimeout(() => {
          core.checkBattleEnd();
          onDone?.();
        }, targets.length * 200 + 700);
      }

      return true;
    },

    /* ===== Multi-Hit Attacks ===== */

    /**
     * Perform multi-target basic attack
     * Used for AoE basic attacks
     */
    performMultiAttack(attacker, targets, core, onDone) {
      console.log(`[Combat] ${attacker.name} multi-attacks ${targets.length} enemies`);

      targets.forEach((target, i) => {
        setTimeout(() => {
          const {damage, isCritical, breakdown} = this.calculateDamage(attacker, target, 1.0);
          target.stats.hp = Math.max(0, target.stats.hp - damage);

          // Apply knockback
          if (window.BattlePhysics) {
            window.BattlePhysics.applyKnockback(target, attacker, 35, core);
          }

          if (window.BattleAnimations) {
            window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
          }

          if (core.units) {
            core.units.updateUnitDisplay(target, core);
          } else {
            core.updateUnitDisplay(target);
          }
        }, i * 150);
      });

      // Award chakra for multi-hit
      if (core.chakra) {
        core.chakra.addChakra(attacker, 1, core);
      } else {
        attacker.chakra = Math.min(attacker.maxChakra, attacker.chakra + 1);
      }

      // Track basic attack for Last Stand Ultimate system
      if (window.BattleEquippedUltimate) {
        window.BattleEquippedUltimate.onBasicAttack(attacker.id);
      }

      if (core.units) {
        core.units.updateUnitDisplay(attacker, core);
      } else {
        core.updateUnitDisplay(attacker);
      }

      setTimeout(() => {
        core.updateTeamHP();
        // Delay battle end check to allow HP bar animation to complete
        setTimeout(() => {
          core.checkBattleEnd();
          onDone?.();
        }, 400);
      }, targets.length * 150 + 300);
    },

    /**
     * Perform proximity combo attack
     * Hits nearby enemies with basic attacks as a combo
     */
    performProximityCombo(attacker, targets, core, onDone) {
      if (targets.length === 0) return;

      console.log(`[Combat] ${attacker.name} proximity combo on ${targets.length} targets`);

      // Narrate the combo
      if (window.BattleNarrator) {
        window.BattleNarrator.narrate(`${attacker.name} triggers proximity combo!`, core);
      }

      targets.forEach((target, i) => {
        setTimeout(() => {
          const {damage, isCritical, breakdown} = this.calculateDamage(attacker, target, 0.6); // 60% damage for combo
          target.stats.hp = Math.max(0, target.stats.hp - damage);

          // Apply knockback
          if (window.BattlePhysics) {
            window.BattlePhysics.applyKnockback(target, attacker, 40, core);
          }

          if (window.BattleAnimations) {
            window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
            // Show combo indicator
            setTimeout(() => {
              const comboText = document.createElement('div');
              comboText.textContent = 'COMBO!';
              comboText.style.position = 'absolute';
              comboText.style.fontSize = '1.2rem';
              comboText.style.fontWeight = 'bold';
              comboText.style.color = '#ffaa00';
              comboText.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
              comboText.style.zIndex = '500';
              comboText.style.pointerEvents = 'none';
              comboText.style.animation = 'damageFloat 0.8s ease-out forwards';

              const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${target.id}"]`);
              if (unitEl && core.dom.damageLayer) {
                const rect = unitEl.getBoundingClientRect();
                const sceneRect = core.dom.scene.getBoundingClientRect();
                comboText.style.left = `${rect.left - sceneRect.left + rect.width / 2}px`;
                comboText.style.top = `${rect.top - sceneRect.top - 30}px`;
                comboText.style.transform = 'translate(-50%, -100%)';
                core.dom.damageLayer.appendChild(comboText);
                setTimeout(() => comboText.remove(), 800);
              }
            }, 100);
          }

          if (core.units) {
            core.units.updateUnitDisplay(target, core);
          } else {
            core.updateUnitDisplay(target);
          }
        }, i * 120);
      });

      setTimeout(() => {
        core.updateTeamHP();
        // Delay battle end check to allow HP bar animation to complete
        setTimeout(() => {
          core.checkBattleEnd();
          onDone?.();
        }, 400);
      }, targets.length * 120 + 200);
    },

    /**
     * Perform multi-target jutsu
     * Used for AoE jutsu skills
     * @returns {boolean} Success status
     */
    performMultiJutsu(attacker, targets, core, onDone) {
      const skills = this.getUnitSkills(attacker);
      const j = skills.jutsu;

      if (!j) return false;
      if (!this.isJutsuUnlocked(attacker)) {
        window.BattleNarrator?.narrate(`${attacker.name}'s jutsu is locked! Requires Level 20.`, core);
        return false;
      }
      if (attacker.statusEffects?.some(e => e.prevent_jutsu && e.turnsRemaining > 0)) {
        window.BattleNarrator?.narrate(`${attacker.name}'s jutsu is sealed!`, core);
        return false;
      }

      const cost = this.getSkillChakraCost(attacker, j, 4);

      // Check and spend chakra
      if (core.chakra) {
        if (!core.chakra.spendChakra(attacker, cost, core)) {
          return false;
        }
      } else {
        if (attacker.chakra < cost) return false;
        attacker.chakra -= cost;
      }

      // Reset basic attack count when using ninjutsu
      if (window.BattleEquippedUltimate) {
        window.BattleEquippedUltimate.onNinjutsuUse(attacker.id);
      }

      // Animated sprite units play their own jutsu sheet, one damage number per hit.
      if (this.usesSpriteSkill(attacker)) {
        this.performSpriteSkill(attacker, 'jutsu', j, targets, core, onDone);
        return true;
      }

      // Get multiplier (extract from description like "2.0x attack...")
      let mult = 2.0;
      const m = String(j.data.description || "").match(/([\d.]+)x/i);
      // Bug #2: Check if match exists and has captured group
      if (m && m[1]) mult = Number(m[1]) || 2.0;

      console.log(`[Combat] ${attacker.name} multi-jutsu ${targets.length} enemies`);

      const skillName = j.data.name || j.data.skillName || j.meta.name;
      this.afterCutin(attacker, 'jutsu', skillName, () => {
        window.BattleAttackNames?.showAttackName(skillName, 'jutsu');
        // Play animation
        const animGif = j.data.animationGif || attacker._ref?.base?.jutsuAnimation;
        if (window.BattleAnimations) {
          window.BattleAnimations.playSkillAnimation(attacker, "jutsu", animGif, core.dom);
        }

        // Hit all targets
        targets.forEach((target, i) => {
          setTimeout(() => {
            const {damage, isCritical, breakdown} = this.calculateDamage(attacker, target, mult);
            target.stats.hp = Math.max(0, target.stats.hp - damage);

            // Apply knockback for multi-jutsu
            if (window.BattlePhysics) {
              window.BattlePhysics.applyKnockback(target, attacker, 45, core);
            }

            setTimeout(() => {
              if (window.BattleAnimations) {
                window.BattleAnimations.showDamage(target, damage, isCritical, core.dom, false, breakdown);
              }
            }, 150);

            if (core.units) {
              core.units.updateUnitDisplay(target, core);
            } else {
              core.updateUnitDisplay(target);
            }
          }, i * 200 + 400);
        });

        if (core.units) {
          core.units.updateUnitDisplay(attacker, core);
        } else {
          core.updateUnitDisplay(attacker);
        }

        setTimeout(() => {
          core.updateTeamHP();
          core.checkBattleEnd();
          onDone?.();
        }, targets.length * 200 + 800);
      });

      return true;
    },

    /* ===== Spritesheet Skills (units with animated battle sprites) ===== */

    /**
     * Units with an animated field sprite (SpritePlayer registry) play their
     * own 'jutsu' / 'ultimate' sheet instead of the generic skill overlay.
     * The sheet's JSON lists the frames where a strike lands ("hits"); each
     * one deals a slice of the skill's damage with its own damage number.
     */
    usesSpriteSkill(unit) {
      return !!(unit?._sprite && unit.charId && window.SpritePlayer?.has(unit.charId));
    },

    /** Living, on-field opponents of a unit. */
    getOpponents(unit, core) {
      const team = unit.isPlayer ? core.enemyTeam : core.activeTeam;
      return (team || []).filter(u => u && !u.isBench && u.stats?.hp > 0);
    },

    /** Base multiplier of a skill (structured effects first, then description). */
    getSkillMultiplier(data, fallback) {
      const fx = Number(data?.effects?.multiplier);
      if (fx > 0) return fx;
      const m = String(data?.description || "").match(/([\d.]+)x/i);
      return (m && Number(m[1])) || fallback;
    },

    /** True if the unit currently has an attack-weakening debuff. */
    isAttackWeakened(unit) {
      return !!unit?.statusEffects?.some(e =>
        (e.type === 'attack_weakened' || e.type === 'atk_reduction' || e.tag === 'atkDown' || e.kind === 'ATTACK_DEBUFF') &&
        (typeof e.turnsRemaining !== 'number' || e.turnsRemaining > 0)
      );
    },

    /** Per-target multiplier, e.g. "4.5x attack (6x attack if they are Attack Weakened)". */
    getTargetMultiplier(data, target, base) {
      const m = String(data?.description || "").match(/\(\s*([\d.]+)x[^)]*if\s+(?:they\s+are|the\s+target\s+is|target\s+is)\s+attack\s+weakened/i);
      if (m && this.isAttackWeakened(target)) return Number(m[1]) || base;
      return base;
    },

    /** Which enemies a sprite skill strikes (first entry = the one the unit dashes to). */
    resolveSkillTargets(attacker, data, given, core) {
      const opponents = this.getOpponents(attacker, core);
      const alive = (given || []).filter(t => t && t.stats?.hp > 0 && opponents.includes(t));
      // A drag drop already resolved its targets with the range preview
      // (BattleDrag.predictRange, which applies skillTargetLimit): hit exactly
      // those, never enemies outside the range the player saw.
      if (given?.fromRange) return alive;
      const dist = t => Math.hypot((t.pos?.x || 0) - (attacker.pos?.x || 0), (t.pos?.y || 0) - (attacker.pos?.y || 0));
      const desc = String(data?.description || "").toLowerCase();
      if (/all enemies/.test(desc)) {
        const first = alive[0] || [...opponents].sort((a, b) => dist(a) - dist(b))[0];
        return first ? [first, ...opponents.filter(t => t !== first)] : [];
      }
      const n = this.skillTargetLimit(data) || alive.length || 1;
      const pool = alive.length ? [...alive].sort((a, b) => dist(a) - dist(b)) : [];
      for (const t of [...opponents].sort((a, b) => dist(a) - dist(b))) if (!pool.includes(t)) pool.push(t);
      // A single chosen target (tap/drag) stays first even if another is closer.
      if (given?.length === 1 && alive[0]) {
        pool.splice(pool.indexOf(alive[0]), 1);
        pool.unshift(alive[0]);
      }
      return pool.slice(0, n);
    },

    /**
     * Max number of enemies a skill hits (effects.targets or "N enemy(s)" in
     * the description), or null when it hits everything in its area.
     * "All enemies" skills are unlimited.
     */
    skillTargetLimit(data) {
      const desc = String(data?.description || "").toLowerCase();
      if (/all enemies/.test(desc)) return null;
      const n = Number(data?.effects?.targets) || Number(desc.match(/(\d+)\s*enem/)?.[1]) || 0;
      return n > 0 ? n : null;
    },

    /**
     * Split a total into `n` hit slices that add up exactly to `total`.
     * Slightly uneven (±15%) with a heavier final blow, like a real combo.
     */
    splitDamage(total, n) {
      total = Math.max(0, Math.floor(total)); n = Math.max(1, n | 0);
      if (n === 1) return [total];
      const w = Array.from({ length: n }, (_, i) => (i === n - 1 ? 1.6 : 0.85 + Math.random() * 0.3));
      const W = w.reduce((a, b) => a + b, 0);
      const out = w.map(x => Math.floor(total * x / W));
      let rest = total - out.reduce((a, b) => a + b, 0);
      for (let i = n - 1; rest > 0; i = (i - 1 + n) % n, rest--) out[i]++;
      return out;
    },

    /** Attack Weakened: -30% ATK for N turns (same buff/debuff shape as ATK reduction). */
    applyAttackWeakened(target, turns, core) {
      if (!target || target.stats.hp <= 0) return;
      target.statusEffects = target.statusEffects || [];
      const existing = target.statusEffects.find(e => e.type === 'attack_weakened');
      if (existing) {
        existing.turnsRemaining = Math.max(existing.turnsRemaining || 0, turns);
      } else {
        const pct = 30;
        const amt = Math.floor((target.stats.atk || 0) * pct / 100);
        target.statusEffects.push({
          type: 'attack_weakened', kind: 'buff', category: 'debuff', tag: 'atkDown',
          name: 'Attack Weakened', color: '#ff8888', value: -amt,
          payload: { atkBoost: -amt },
          turnsRemaining: turns
        });
      }
      console.log(`[Combat] ${target.name} is Attack Weakened for ${turns} turn(s)`);
      window.BattleEffects?.showEffectIndicator(target, 'ATK WEAKENED', '#ff8888', core);
    },

    /** Structured skill debuffs ({type, chance, turns}). */
    applySkillDebuff(target, debuff, core) {
      if (!debuff || !target || target.stats.hp <= 0) return;
      const chance = debuff.chance == null ? 1 : Number(debuff.chance);
      if (Math.random() >= chance) return;
      if (debuff.type === 'attack_weakened') this.applyAttackWeakened(target, Number(debuff.turns) || 1, core);
      else console.warn(`[Combat] Unknown skill debuff type: ${debuff.type}`);
    },

    /** Run the unit's field element to a grid position (percent) with the run sheet. */
    dashUnitTo(unit, unitEl, to, core) {
      return new Promise(resolve => {
        core.units?.stopRun?.(unit); // cancel any in-flight runTo()
        const token = (unit._runToken = (unit._runToken || 0) + 1);
        const fromX = parseFloat(unitEl.style.left), fromY = parseFloat(unitEl.style.top);
        const x0 = Number.isFinite(fromX) ? fromX : unit.pos.x, y0 = Number.isFinite(fromY) ? fromY : unit.pos.y;
        const dist = Math.hypot(to.x - x0, to.y - y0);
        if (dist < 0.5) { unitEl.style.left = `${to.x}%`; unitEl.style.top = `${to.y}%`; return resolve(); }
        core.units?.setSpriteFacing?.(unit, to.x < x0);
        unit._sprite?.play('run');
        const duration = Math.min(520, 200 + dist * 7);
        const start = performance.now();
        const step = now => {
          if (unit._runToken !== token) return resolve();
          const t = Math.min(1, (now - start) / duration);
          const e = 1 - Math.pow(1 - t, 2); // ease-out: fast start, plant the feet
          unitEl.style.left = `${x0 + (to.x - x0) * e}%`;
          unitEl.style.top = `${y0 + (to.y - y0) * e}%`;
          if (t < 1) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
    },

    /** Grid position (percent) from which the attacker strikes `target`. */
    getStrikePosition(attacker, target, attackerEl, core, meta) {
      const grid = core.dom.grid?.getBoundingClientRect();
      const tEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${target.id}"]`);
      if (!grid?.width || !tEl) return { x: target.pos.x, y: target.pos.y };
      const dir = target.pos.x >= attacker.pos.x ? 1 : -1; // attacker comes from this side
      const tSprite = tEl.querySelector('.unit-sprite') || tEl;
      const tW = tSprite.getBoundingClientRect().width || 60;
      const h = attacker._sprite?.el?.offsetHeight || 120;
      const aW = meta ? meta.frameWidth * (h * (meta.heightScale || 1) / meta.frameHeight) : h * 0.8;
      const gapPx = tW * 0.45 + aW * 0.28;
      const x = Math.max(3, Math.min(97, target.pos.x - dir * (gapPx / grid.width) * 100));
      return { x, y: target.pos.y };
    },

    /**
     * Play the skill cut-in (BattleCutin), then run `fn`. The unit counts as
     * busy meanwhile so the turn watchdogs wait. Runs `fn` right away (next
     * microtask) when cut-ins are off.
     */
    afterCutin(attacker, kind, skillName, fn) {
      const C = window.BattleCutin;
      if (!C?.wants?.(attacker, kind)) { Promise.resolve().then(fn); return; }
      const wasBusy = attacker._actionBusy;
      attacker._actionBusy = true;
      C.play(attacker, kind, skillName).catch(() => {}).then(() => {
        attacker._actionBusy = wasBusy || false;
        fn();
      });
    },

    /**
     * Jutsu / ultimate for a sprite unit: dash in, play the sheet, deal one
     * slice of damage (and one damage number) per hit frame, dash back, then
     * apply end-of-skill effects and end the turn.
     */
    performSpriteSkill(attacker, kind, skill, givenTargets, core, onDone) {
      const data = skill.data || {};
      const targets = this.resolveSkillTargets(attacker, data, givenTargets, core);
      if (!targets.length) { core.checkBattleEnd?.(); onDone?.(); return; }
      const baseMult = this.getSkillMultiplier(data, kind === 'ultimate' ? 1.5 : 2.0);
      const skillName = data.name || data.skillName || skill.meta?.name || kind;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const anims = window.BattleAnimations;
      const sprite = attacker._sprite;
      const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${attacker.id}"]`);
      // Turn watchdogs (AI safety net, input manager) wait while this is set.
      attacker._actionBusy = true;
      const done = () => { attacker._actionBusy = false; core.checkBattleEnd?.(); onDone?.(); };

      // Callout band stays up for the whole sprite attack; hidden when it ends.
      // It is shown after the cut-in (if any) has played.
      let callout = null;
      const hideCallout = () => window.BattleAttackNames?.hideAttackName?.(callout);
      if (core.units) core.units.updateUnitDisplay(attacker, core); else core.updateUnitDisplay?.(attacker);

      // One damage roll per target (crit / variance / element, as the generic
      // path does), then split across the hit frames.
      const plans = targets.map(target => {
        const mult = this.getTargetMultiplier(data, target, baseMult);
        const r = this.calculateDamage(attacker, target, mult);
        return { target, mult, total: r.damage, isCritical: r.isCritical, dodged: !!r.dodged, dealt: 0, slices: [] };
      });

      (async () => {
        let meta = null;
        try { meta = sprite ? await sprite.meta(kind) : null; } catch (e) {
          console.warn(`[Combat] ${attacker.name} has no '${kind}' sheet, using timed hits`, e);
        }
        const hitCount = Math.max(1, (meta?.hits?.length) || Number(data.hits) || 1);
        plans.forEach(p => { p.slices = this.splitDamage(p.total, hitCount); });
        console.log(`[Combat] ${attacker.name} ${kind} "${skillName}": ${hitCount} hits`,
          plans.map(p => `${p.target.name} ${p.total} (${p.mult}x${p.isCritical ? ', crit' : ''}) = [${p.slices.join(', ')}]`));

        const prevZ = unitEl?.style.zIndex, prevTransition = unitEl?.style.transition;
        if (unitEl) { unitEl.style.zIndex = '70'; unitEl.style.transition = 'none'; }
        const home = { x: attacker.pos.x, y: attacker.pos.y };
        const anchor = targets[0];

        // Blazing-style cut-in first (resolves at once when off / not wanted).
        try { await window.BattleCutin?.play?.(attacker, kind, skillName); } catch (e) { /* cosmetic */ }
        callout = window.BattleAttackNames?.showAttackName(skillName, kind, { hold: 'manual' });
        await wait(350); // let the skill name land
        if (meta && unitEl) {
          await this.dashUnitTo(attacker, unitEl, this.getStrikePosition(attacker, anchor, unitEl, core, meta), core);
          const curX = parseFloat(unitEl.style.left);
          core.units?.setSpriteFacing?.(attacker, anchor.pos.x < curX);
        }

        let next = 0;
        const counter = { el: null };
        const doHit = k => {
          for (; next <= k && next < hitCount; next++) this.applySpriteHit(plans, next, hitCount, attacker, kind, core, counter);
        };
        await new Promise(resolve => {
          let finished = false, guard = null;
          const finish = () => {
            if (finished) return; finished = true;
            clearTimeout(guard);
            doHit(hitCount - 1); // anything not yet landed (interrupted / hidden tab)
            resolve();
          };
          if (meta && sprite) {
            sprite.play(kind, { onHit: k => doHit(k), onEnd: finish });
            guard = setTimeout(finish, (meta.frames / meta.fps) * 1000 + 1500);
          } else {
            anims?.playSkillAnimation?.(attacker, kind, data.animationGif || null, core.dom);
            let k = 0;
            const iv = setInterval(() => { doHit(k++); if (k >= hitCount) { clearInterval(iv); setTimeout(finish, 250); } }, 110);
          }
        });

        hideCallout();
        if (meta && unitEl) {
          await wait(120);
          await this.dashUnitTo(attacker, unitEl, home, core);
          unitEl.style.left = `${attacker.pos.x}%`;
          unitEl.style.top = `${attacker.pos.y}%`;
        }
        if (unitEl) { unitEl.style.zIndex = prevZ || ''; unitEl.style.transition = prevTransition || ''; }
        core.units?.settleSprite?.(attacker); // idle, default facing

        // End-of-skill effects on the survivors.
        const survivors = plans.filter(p => !p.dodged && p.target.stats.hp > 0).map(p => p.target);
        const fx = data.effects;
        if (fx) {
          if (fx.debuff) survivors.forEach(t => this.applySkillDebuff(t, fx.debuff, core));
          if (Number(fx.selfChakra) > 0) {
            if (core.chakra) core.chakra.addChakra(attacker, Number(fx.selfChakra), core);
            else attacker.chakra = Math.min(attacker.maxChakra || 10, (attacker.chakra || 0) + Number(fx.selfChakra));
            window.BattleChakraWheel?.updateChakraWheel?.(attacker, core);
          }
        } else {
          this.applyDescriptionEffects(data.description, attacker, survivors, core);
        }
        survivors.forEach(t => core.units ? core.units.updateUnitDisplay(t, core) : core.updateUnitDisplay?.(t));
        if (core.units) core.units.updateUnitDisplay(attacker, core); else core.updateUnitDisplay?.(attacker);
        core.updateTeamHP?.();

        await wait(450);
        done();
      })().catch(err => {
        console.error('[Combat] sprite skill failed', err);
        hideCallout();
        core.units?.settleSprite?.(attacker);
        done();
      });
    },

    /** Land hit `k` of a sprite combo on every target that is still standing. */
    applySpriteHit(plans, k, hitCount, attacker, kind, core, counter) {
      const anims = window.BattleAnimations;
      let landed = false;
      plans.forEach(p => {
        const t = p.target;
        if (p.dodged || t.stats.hp <= 0) return; // no numbers on a dead target
        const amt = p.slices[k] || 0;
        if (amt <= 0) return;
        t.stats.hp = Math.max(0, t.stats.hp - amt);
        p.dealt += amt;
        landed = true;
        anims?.showComboHit?.(t, amt, p.isCritical, core.dom, k, hitCount);

        if (t.stats.hp <= 0) {
          const remaining = (t.isPlayer ? core.activeTeam : core.enemyTeam).filter(e => e && e.stats.hp > 0).length;
          if (window.BattleFinish?.shouldTriggerFinish?.(t, remaining, kind === 'ultimate')) {
            setTimeout(() => window.BattleFinish.playFinishEffects(attacker, t, core), 200);
          }
        }
        if (core.units) core.units.updateUnitDisplay(t, core); else core.updateUnitDisplay?.(t);
      });
      if (landed) {
        const first = plans.find(p => !p.dodged)?.target;
        if (first) counter.el = anims?.showComboCounter?.(first, k + 1, core.dom, counter.el) || counter.el;
        core.updateTeamHP?.();
      }
    },

    /* ===== Guard Action ===== */

    /**
     * Perform guard action
     * Reduces incoming damage by 50% until next turn
     * Awards 2 chakra
     */
    performGuard(unit, core) {
      console.log(`[Combat] ${unit.name} guards`);

      unit.isGuarding = true;

      // Award chakra for guarding
      if (core.chakra) {
        core.chakra.addChakra(unit, 2, core);
      } else {
        unit.chakra = Math.min(unit.maxChakra, unit.chakra + 2);
      }

      if (core.units) {
        core.units.updateUnitDisplay(unit, core);
      } else {
        core.updateUnitDisplay(unit);
      }
    },

    /* ===== Secret Technique (Team Buff) ===== */

    /**
     * Perform secret technique - buffs all allies
     * Only available for 6S+ tier characters
     * @param {Object} caster - Unit casting secret technique
     * @param {Object} core - BattleCore reference
     * @returns {boolean} Success status
     */
    performSecret(caster, core) {
      const skills = this.getUnitSkills(caster);
      const secret = skills.secret;

      if (!secret) {
        console.warn(`[Combat] ${caster.name} has no secret technique`);
        return false;
      }

      // Check if unit is sealed (cannot use secret)
      const isSealed = caster.statusEffects?.some(e =>
        e.prevent_secret && e.turnsRemaining > 0
      );
      if (isSealed) {
        console.warn(`[Combat] 🔒 ${caster.name}'s secret technique is sealed!`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`${caster.name}'s secret technique is sealed!`, core);
        }
        if (window.BattleEffects) {
          window.BattleEffects.showEffectIndicator(caster, 'SEALED', '#666666', core);
        }
        return false;
      }

      // Check if secret is unlocked (6S+ tier)
      if (!this.isSecretUnlocked(caster)) {
        const tier = this.getTierForUnit(caster);
        console.warn(`[Combat] ${caster.name}'s secret is locked (Tier ${tier}, requires 6S+)`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`${caster.name}'s secret technique is locked! Requires 6★ or higher.`, core);
        }
        return false;
      }

      // Effective cost: chakraCostMax when maxed, minus Chakra Gauge Reduction
      const cost = this.getSkillChakraCost(caster, secret, 12);

      // Check and spend chakra
      if (core.chakra) {
        if (!core.chakra.spendChakra(caster, cost, core)) {
          return false;
        }
      } else {
        if (caster.chakra < cost) {
          console.warn(`[Combat] ${caster.name} not enough chakra (has ${caster.chakra}, needs ${cost})`);
          return false;
        }
        caster.chakra -= cost;
      }

      console.log(`[Combat] ${caster.name} uses SECRET: ${secret.meta.name}`);

      // Display attack name BEFORE effects apply (Storm 4 style)
      {
        const attackName = secret.data.name || secret.data.skillName || secret.meta.name;
        const showName = () => window.BattleAttackNames?.showAttackName(attackName, 'secret');
        if (window.BattleCutin?.wants?.(caster, 'secret')) {
          window.BattleCutin.play(caster, 'secret', attackName).catch(() => {}).then(showName);
        } else {
          showName();
        }
      }


      // Get effects from secret technique
      const effects = secret.data.effects;

      if (!effects) {
        console.warn(`[Combat] No effects defined for ${secret.meta.name}`);
        return false;
      }

      // Determine targets based on effects.target
      let targets = [];
      if (effects.target === "allAllies") {
        targets = core.activeTeam.filter(u => u.stats.hp > 0);
      } else if (effects.target === "self") {
        targets = [caster];
      } else {
        // Default to all allies
        targets = core.activeTeam.filter(u => u.stats.hp > 0);
      }

      console.log(`[Combat] Applying ${secret.meta.name} buffs to ${targets.length} allies`);

      // Apply buffs to all targets using BattleBuffs system
      if (window.BattleBuffs) {
        window.BattleBuffs.applyBuffEffects(core, caster, targets, effects, "secret");
      }

      // Show visual effect for buff application
      if (window.BattleAnimations) {
        targets.forEach((target, i) => {
          setTimeout(() => {
            // Show buff indicator
            const buffText = document.createElement('div');
            buffText.textContent = '▲ BUFFED!';
            buffText.style.cssText = `
              position: absolute;
              font-size: 1.5rem;
              font-weight: bold;
              color: #5efc82;
              text-shadow: 0 0 10px rgba(94, 252, 130, 0.8);
              pointer-events: none;
              z-index: 1000;
              animation: floatUp 1.5s ease-out forwards;
            `;

            const unitEl = core.dom.scene?.querySelector(`[data-unit-id="${target.id}"]`);
            if (unitEl) {
              unitEl.appendChild(buffText);
              setTimeout(() => buffText.remove(), 1500);
            }
          }, i * 150);
        });
      }

      // Update displays
      targets.forEach(target => {
        if (core.units) {
          core.units.updateUnitDisplay(target, core);
        } else {
          core.updateUnitDisplay(target);
        }
      });

      if (core.units) {
        core.units.updateUnitDisplay(caster, core);
      } else {
        core.updateUnitDisplay(caster);
      }

      return true;
    },

    /**
     * Get secret technique for unit
     */
    getSecretTechnique(unit) {
      const base = unit._ref?.base;
      const tier = this.getTierForUnit(unit);
      if (!base?.skills?.secret) return null;

      const s = this.getSkillEntry(base.skills.secret, tier);
      return s ? { meta: base.skills.secret, data: s } : null;
    },

    /* ===== AI Combat Logic ===== */

    /**
     * Perform AI turn action selection
     * AI chooses between attack, jutsu, ultimate, or guard
     */
    performAITurn(unit, core, onDone) {
      console.log(`[Combat] AI Turn for ${unit.name} (isPlayer: ${unit.isPlayer})`);

      const targets = (unit.isPlayer ? core.enemyTeam : core.activeTeam).filter(u => u.stats.hp > 0);

      console.log(`[Combat] AI found ${targets.length} valid targets:`, targets.map(t => t.name));

      if (targets.length === 0) {
        console.warn("[Combat] No valid targets for AI turn!");
        onDone?.();
        return;
      }

      const target = targets[Math.floor(Math.random() * targets.length)];
      const skills = this.getUnitSkills(unit);

      console.log(`[Combat] AI selected target: ${target.name}, has skills:`, {
        jutsu: !!skills.jutsu,
        ultimate: !!skills.ultimate
      });

      // Check if ultimate is available and random chance
      const preferUlt = skills.ultimate &&
                       this.isUltimateUnlocked(unit) &&
                       unit.chakra >= this.getSkillChakraCost(unit, skills.ultimate, 8) &&
                       Math.random() > 0.7;

      // Check if jutsu is available and random chance
      const preferJut = skills.jutsu &&
                       this.isJutsuUnlocked(unit) &&
                       unit.chakra >= this.getSkillChakraCost(unit, skills.jutsu, 4) &&
                       Math.random() > 0.5;

      // Execute chosen action — onDone fires when combat fully resolves
      if (preferUlt) {
        console.log("[Combat] AI using ultimate");
        this.performUltimate(unit, targets, core, onDone);
      } else if (preferJut) {
        console.log("[Combat] AI using jutsu");
        const ok = this.performJutsu(unit, target, core, onDone);
        if (!ok) this.performAttack(unit, target, core, onDone); // fallback
      } else if (unit.stats.hp < unit.stats.maxHP * 0.3 && Math.random() > 0.6) {
        // Guard if low HP — guard is synchronous, call onDone immediately
        console.log("[Combat] AI guarding");
        this.performGuard(unit, core);
        onDone?.();
      } else {
        // Default to basic attack
        console.log("[Combat] AI attacking");
        this.performAttack(unit, target, core, onDone);
      }
    },

    /* ===== Utility Functions ===== */

    /**
     * Get skill cost for unit
     */
    getSkillCost(unit, skillType) {
      const skills = this.getUnitSkills(unit);

      if (skillType === "jutsu" && skills.jutsu) {
        return this.getSkillChakraCost(unit, skills.jutsu, 4);
      } else if (skillType === "ultimate" && skills.ultimate) {
        return this.getSkillChakraCost(unit, skills.ultimate, 8);
      }

      return 0;
    },

    /**
     * Check if unit can use skill
     */
    canUseSkill(unit, skillType) {
      const cost = this.getSkillCost(unit, skillType);
      return unit.chakra >= cost;
    },

    /**
     * Get damage preview (without applying)
     */
    previewDamage(attacker, defender, multiplier = 1) {
      return this.calculateDamage(attacker, defender, multiplier);
    },

    /**
     * Parse a skill description text and apply any secondary effects
     * (immobilization, jutsu sealing, attack reduction, healing, barriers, etc.)
     * to the given targets.  Probability checks are rolled here.
     */
    applyDescriptionEffects(description, attacker, targets, core) {
      if (!description || !targets?.length) return;
      const desc = description.toLowerCase();

      targets.forEach(target => {
        if (!target || target.stats.hp <= 0) return;

        // ── Immobilization ───────────────────────────────────────────────
        const immobMatch = desc.match(/(\d+)%\s*chance\s*of\s*immobilization\s*for\s*(\d+)\s*turn/);
        if (immobMatch) {
          const chance = Number(immobMatch[1]);
          const turns  = Number(immobMatch[2]);
          if (Math.random() * 100 < chance) {
            target.statusEffects = target.statusEffects || [];
            target.statusEffects.push({
              type: 'immobilization', kind: 'debuff', tag: 'immobilized',
              name: 'Immobilized', color: '#888',
              prevent_action: true, turnsRemaining: turns
            });
            console.log(`[Combat] ${target.name} immobilized for ${turns} turn(s)`);
            if (window.BattleEffects) {
              window.BattleEffects.showEffectIndicator(target, 'IMMOBILIZED', '#888888', core);
            }
          }
        }

        // ── Jutsu Sealing ────────────────────────────────────────────────
        // Covers: "jutsu sealing", "sealing and/or attack reduction"
        const sealMatch = desc.match(/(\d+)%\s*chance\s*of\s*jutsu\s*seal/);
        if (sealMatch) {
          const chance = Number(sealMatch[1]);
          const turns  = Number(desc.match(/jutsu\s*seal(?:ing)?\s*for\s*(\d+)\s*turn/)?.[1] || 2);
          if (Math.random() * 100 < chance) {
            target.statusEffects = target.statusEffects || [];
            target.statusEffects.push({
              type: 'jutsu_seal', kind: 'debuff', tag: 'sealed',
              name: 'Jutsu Sealed', color: '#666',
              prevent_jutsu: true, prevent_ultimate: true, turnsRemaining: turns
            });
            console.log(`[Combat] ${target.name} jutsu sealed for ${turns} turn(s)`);
            if (window.BattleEffects) {
              window.BattleEffects.showEffectIndicator(target, 'SEALED', '#666666', core);
            }
          }
        }

        // ── Attack Reduction ─────────────────────────────────────────────
        const atkRedMatch = desc.match(/(\d+)%\s*(?:chance\s*of\s*)?attack\s*reduction\s*for\s*(\d+)\s*turn/);
        if (atkRedMatch) {
          const pct   = Number(atkRedMatch[1]);
          const turns = Number(atkRedMatch[2]);
          const atkDebuff = Math.floor((target.stats.atk || 0) * pct / 100);
          target.statusEffects = target.statusEffects || [];
          target.statusEffects.push({
            type: 'atk_reduction', kind: 'buff', tag: 'atkDown',
            name: `ATK -${pct}%`, value: -atkDebuff,
            payload: { atkBoost: -atkDebuff },
            turnsRemaining: turns
          });
          console.log(`[Combat] ${target.name} ATK reduced by ${pct}% for ${turns} turn(s)`);
          if (window.BattleEffects) {
            window.BattleEffects.showEffectIndicator(target, `ATK-${pct}%`, '#cc4444', core);
          }
        }

        // ── Slip Damage ──────────────────────────────────────────────────
        const slipMatch = desc.match(/(\d+)%\s*chance\s*of\s*slip\s*damage\s*for\s*(\d+)\s*turn/);
        if (slipMatch) {
          const chance = Number(slipMatch[1]);
          const turns  = Number(slipMatch[2]);
          if (Math.random() * 100 < chance) {
            const slipAmt = Math.floor((target.stats.maxHP || target.stats.hp) * 0.05);
            target.statusEffects = target.statusEffects || [];
            target.statusEffects.push({
              type: 'slip', kind: 'debuff', tag: 'slip',
              name: 'Slip Damage', color: '#cc6600',
              slipDamagePerTurn: slipAmt,
              turnsRemaining: turns
            });
            console.log(`[Combat] ${target.name} afflicted with slip damage for ${turns} turn(s)`);
            if (window.BattleEffects) {
              window.BattleEffects.showEffectIndicator(target, 'SLIP', '#cc6600', core);
            }
          }
        }

        // ── Barrier (applied to attacker/caster, not target) ────────────
        const barrierMatch = desc.match(/puts up a barrier.*?(\d+)\s*damage.*?for\s*(\d+)\s*turn/);
        if (barrierMatch) {
          const hp    = Number(barrierMatch[1]);
          const turns = Number(barrierMatch[2]);
          attacker.statusEffects = attacker.statusEffects || [];
          attacker.statusEffects.push({
            type: 'barrier', kind: 'buff', tag: 'barrier',
            name: `Barrier ${hp}`, barrierHP: hp, turnsRemaining: turns,
            payload: { barrierHP: hp }
          });
          console.log(`[Combat] ${attacker.name} raised a ${hp} HP barrier`);
          if (window.BattleEffects) {
            window.BattleEffects.showEffectIndicator(attacker, 'BARRIER', '#44aaff', core);
          }
        }
      });

      // ── Self-Heal (applied to attacker) ──────────────────────────────
      const healFlatMatch = description.match(/[Rr]estores?\s*([\d,]+)\s*health/);
      const healPctMatch  = description.match(/restores?\s*(\d+)%\s*HP/i);
      if (healFlatMatch) {
        const heal = Number(healFlatMatch[1].replace(/,/g, ''));
        attacker.stats.hp = Math.min(attacker.stats.maxHP, attacker.stats.hp + heal);
        if (window.BattleAnimations) {
          window.BattleAnimations.showDamageNumber?.(attacker, heal, true, false);
        }
        console.log(`[Combat] ${attacker.name} healed ${heal} HP`);
      } else if (healPctMatch) {
        const heal = Math.floor((Number(healPctMatch[1]) / 100) * attacker.stats.maxHP);
        attacker.stats.hp = Math.min(attacker.stats.maxHP, attacker.stats.hp + heal);
        if (window.BattleAnimations) {
          window.BattleAnimations.showDamageNumber?.(attacker, heal, true, false);
        }
        console.log(`[Combat] ${attacker.name} healed ${heal} HP (${healPctMatch[1]}%)`);
      }

      // ── Chakra Recovery ───────────────────────────────────────────────
      const chakraMatch = description.match(/restores?\s*Chakra\s*Gauge\s*by\s*(\d+)/i);
      if (chakraMatch) {
        const gain = Number(chakraMatch[1]);
        attacker.chakra = Math.min(attacker.maxChakra || 10, (attacker.chakra || 0) + gain);
        console.log(`[Combat] ${attacker.name} recovered ${gain} chakra`);
      }
    },

    /**
     * Apply status effect (for future expansion)
     */
    applyStatusEffect(target, effect, core) {
      if (!target.statusEffects) {
        target.statusEffects = [];
      }

      target.statusEffects.push(effect);
      console.log(`[Combat] ${target.name} afflicted with ${effect.type}`);
    },

    /**
     * Remove status effect
     */
    removeStatusEffect(target, effectType) {
      if (!target.statusEffects) return;

      target.statusEffects = target.statusEffects.filter(e => e.type !== effectType);
      console.log(`[Combat] ${target.name} recovered from ${effectType}`);
    },

    /**
     * Get effective multiplier with all bonuses
     */
    getEffectiveMultiplier(attacker, base = 1.0) {
      let mult = base;

      // Add status effect bonuses
      if (attacker.statusEffects) {
        attacker.statusEffects.forEach(effect => {
          if (effect.type === "ATK_BOOST") {
            mult *= 1.5;
          }
        });
      }

      return mult;
    }
  };

  // Export to window
  window.BattleCombat = BattleCombat;
  // Shared cost helpers (HUD / chakra bar / input read these)
  window.getSkillChakraCost = (unit, skill, fallback) => BattleCombat.getSkillChakraCost(unit, skill, fallback);
  window.getUnitSkillCosts = (unit) => BattleCombat.getUnitSkillCosts(unit);

  console.log("[BattleCombat] Module loaded ✅");
})();
