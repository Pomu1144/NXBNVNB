/* ============================================================
   js/battle/battle-buffs.js — Buff / Debuff Application Engine
   ------------------------------------------------------------
   - Reads `effects` from characters.json skill tier nodes
   - Applies timed buffs, instant heals, revives, chakra gains
   - NEW: Cleanses negative ailments when `cleanseDebuffs:true`
   - Safe to load before/after other battle modules
   ============================================================ */
(() => {
  "use strict";

  // Tags & helpers for identifying negative status effects/ailments
  const NEGATIVE_TAGS = new Set([
    "poison","slip","bleed","burn","shock","freeze",
    "stun","paralysis","immobilize","immobilized","seal","sealed","silence","mute",
    "slow","atkDown","defDown","spdDown","resDown","accDown",
    "blind","confusion","fear","taunt","healBlock","curse",
    "defenseBreak","vulnerability","doom"
  ]);

  function isNegativeAilment(se) {
    if (!se) return false;
    // Common shapes supported:
    // { kind: 'debuff'|'buff', tag: 'poison', ... }
    // { category: 'debuff', type: 'poison', ... }
    // { tag: 'atkDown', value: -200, ... }
    if (se.kind === "debuff" || se.category === "debuff") return true;
    const tag = (se.tag || se.type || se.name || "").toString().toLowerCase();
    if (NEGATIVE_TAGS.has(tag)) return true;
    if (typeof se.value === "number" && se.value < 0) return true;
    return false;
  }

  // --- Public API object ---
  const Buffs = {
    /**
     * Apply effects from a skill (jutsu/ultimate/secret) to target units.
     * @param {Object} core - BattleCore
     * @param {Object} caster - Unit who is casting
     * @param {Array<Object>} targets - Units to receive the effect
     * @param {Object} effects - Effects descriptor from characters.json
     * @param {String} sourceKey - Optional label for source (e.g., 'secret')
     */
    applyBuffEffects(core, caster, targets, effects = {}, sourceKey = "skill") {
      if (!core || !Array.isArray(targets) || targets.length === 0) return;

      // Instant cleanses first (so heals/regen apply on a clean slate)
      if (effects.cleanseDebuffs) {
        const types = Array.isArray(effects.cleanseTypes) ? effects.cleanseTypes : null;
        targets.forEach(t => this.cleanseUnit(core, t, { types }));
        // Optional: short narration ping
        try {
          window.BattleNarrator?.showAction?.("Negative ailments cleansed!", "secret", core.dom);
        } catch {}
      }

      // Revive window
      if (effects.revive) {
        const windowTurns = Number(effects.reviveWindowTurns ?? 3);
        targets.forEach(t => this.tryRevive(core, t, windowTurns));
      }

      // Instant heal
      if (Number(effects.healPercent) > 0) {
        targets.forEach(t => this.healPercent(core, t, effects.healPercent));
      }

      // Chakra immediate & regen
      if (Number(effects.chakraGain) > 0) {
        targets.forEach(t => this.giveChakra(core, t, effects.chakraGain));
      }

      // Timed buff container
      const duration = Math.max(0, Number(effects.durationTurns || 0));
      if (duration > 0) {
        targets.forEach(t => this.addTimedBuff(core, t, effects, { sourceKey }));
      }

      // Update displays
      targets.forEach(u => core.updateUnitDisplay?.(u));
    },

    /* =========================
       Instant effect utilities
       ========================= */

    cleanseUnit(core, unit, opts = {}) {
      if (!unit) return;
      const types = Array.isArray(opts.types) ? new Set(opts.types.map(x => String(x).toLowerCase())) : null;
      const before = unit.statusEffects?.length || 0;

      if (!Array.isArray(unit.statusEffects)) unit.statusEffects = [];

      unit.statusEffects = unit.statusEffects.filter(se => {
        if (!isNegativeAilment(se)) return true; // keep non-negative
        if (types && !types.has(String(se.tag || se.type || "").toLowerCase())) {
          return true; // scoped cleanse and this debuff isn't targeted
        }
        return false; // remove
      });

      const removed = before - unit.statusEffects.length;
      if (removed > 0) {
        // Optional UI hook or animation layer clear
        // core.effects?.removeDebuffVFX?.(unit);
      }
    },

    tryRevive(core, unit, reviveWindowTurns = 3) {
      // Bug #10 fix: Validate unit.stats exists before accessing
      if (!unit || !unit.stats || unit.stats.hp > 0) return;
      const diedAtTurn = unit.diedAtTurn ?? -Infinity;
      const currentTurn = core.turns?.globalTurn ?? 0;
      if (currentTurn - diedAtTurn <= reviveWindowTurns) {
        const reviveHP = Math.max(1, Math.floor((unit.stats.maxHP || 1) * 0.4)); // 40% default unless your JSON specifies; can extend later
        unit.stats.hp = reviveHP;
        unit.isKO = false;
        // Remove KO flags/debuffs
        unit.statusEffects = (unit.statusEffects || []).filter(se => (se.tag || "").toLowerCase() !== "ko");
        // UI
        core.updateUnitDisplay?.(unit);
        try { window.BattleNarrator?.showAction?.("Revived!", "secret", core.dom); } catch {}
      }
    },

    healPercent(core, unit, percent) {
      if (!unit || !unit.stats) return;
      const p = Math.max(0, Number(percent) || 0);
      const max = Number(unit.stats.maxHP || 0);
      if (!max || p <= 0) return;
      const amt = Math.floor((p / 100) * max);
      unit.stats.hp = Math.min(max, Math.max(0, unit.stats.hp + amt));
      // Optionally spawn heal numbers on damage layer
      // core.combat?.spawnHealNumber?.(unit, amt);
    },

    giveChakra(core, unit, amount) {
      if (!unit) return;
      const add = Number(amount) || 0;
      unit.chakra = Math.min(unit.maxChakra || 10, Math.max(0, (unit.chakra || 0) + add));
      // Optional UI update:
      // core.chakra?.updateChakraUI?.(unit, core);
    },

    /* =========================
       Timed buff registration
       ========================= */

    addTimedBuff(core, unit, effects, meta = {}) {
      if (!unit) return;

      const tag = (effects.tag || meta.sourceKey || "buff").toString();
      const unique = !!effects.unique;
      const stacking = effects.stacking || { mode: "additive", maxStacks: 1 };

      if (!Array.isArray(unit.statusEffects)) unit.statusEffects = [];

      // Existing buff of same tag
      const existing = unit.statusEffects.find(se => se.kind === "buff" && se.tag === tag);

      if (unique && existing) {
        // refresh duration and payload (no stacking)
        existing.turnsRemaining = Number(effects.durationTurns || 0);
        existing.payload = this._buildPayloadFromEffects(effects);
        existing.stacks = 1;
        return;
      }

      if (existing && stacking.mode !== "refresh") {
        // stacking: "additive" or "max"
        existing.turnsRemaining = Math.max(
          existing.turnsRemaining,
          Number(effects.durationTurns || 0)
        );
        existing.stacks = Math.min(
          Number(existing.stacks || 1) + 1,
          Number(stacking.maxStacks || 1)
        );
        // Merge payload depending on mode
        this._mergePayload(existing.payload, effects, stacking.mode);
        return;
      }

      // New timed buff record
      unit.statusEffects.push({
        kind: "buff",
        tag,
        source: meta.sourceKey || "skill",
        appliedAtTurn: core.turns?.globalTurn ?? 0,
        turnsRemaining: Number(effects.durationTurns || 0),
        stacks: 1,
        payload: this._buildPayloadFromEffects(effects)
      });
    },

    _buildPayloadFromEffects(effects) {
      // Only capture fields that influence stats/behavior per turn
      const p = {};
      if (Number(effects.atkBoost)) p.atkBoost = Number(effects.atkBoost);
      if (Number(effects.defBoost)) p.defBoost = Number(effects.defBoost);
      if (Number(effects.speedBoostPercent)) p.speedBoostPercent = Number(effects.speedBoostPercent);
      if (Number(effects.damageReductionPercent)) p.damageReductionPercent = Number(effects.damageReductionPercent);
      if (Number(effects.barrierHP)) p.barrierHP = Number(effects.barrierHP);
      if (Number(effects.critRatePercent)) p.critRatePercent = Number(effects.critRatePercent);
      if (Number(effects.critDmgPercent)) p.critDmgPercent = Number(effects.critDmgPercent);
      if (Number(effects.chakraRegenPerTurn)) p.chakraRegenPerTurn = Number(effects.chakraRegenPerTurn);
      // You can extend with more keys as needed
      return p;
    },

    _mergePayload(payload, effects, mode) {
      const add = this._buildPayloadFromEffects(effects);
      if (mode === "additive") {
        for (const k of Object.keys(add)) {
          payload[k] = (payload[k] || 0) + add[k];
        }
      } else if (mode === "max") {
        for (const k of Object.keys(add)) {
          payload[k] = Math.max(payload[k] || 0, add[k]);
        }
      } else {
        // default overwrite
        Object.assign(payload, add);
      }
    },

    /* =========================
       Per-turn upkeep hooks
       ========================= */

    /** Call this at the start of a unit's turn to tick durations and apply regen. */
    onTurnStart(core, unit) {
      if (!unit?.statusEffects?.length) return;

      // Chakra regen from buffs
      for (const se of unit.statusEffects) {
        if (se.kind !== "buff") continue;
        const regen = Number(se.payload?.chakraRegenPerTurn || 0);
        if (regen > 0) this.giveChakra(core, unit, regen);
      }

      // Tick down durations (but not here—do at end so the buff still affects the current turn)
    },

    /** Call this at the end of a unit's turn to tick durations and remove expired. */
    onTurnEnd(core, unit) {
      if (!unit?.statusEffects?.length) return;

      for (const se of unit.statusEffects) {
        if (typeof se.turnsRemaining === "number" && se.turnsRemaining > 0) {
          se.turnsRemaining -= 1;
        }
      }
      unit.statusEffects = unit.statusEffects.filter(se => {
        if (typeof se.turnsRemaining !== "number") return true;
        return se.turnsRemaining > 0;
      });
    },

    /**
     * Compute dynamic combat modifiers contributed by buffs for a unit.
     * Your combat damage/defense pipeline should read this and apply.
     */
    aggregateBuffModifiers(unit) {
      const out = {
        atkFlat: 0,
        defFlat: 0,
        speedPercent: 0,
        damageReductionPercent: 0,
        critRatePercent: 0,
        critDmgPercent: 0,
        barrierHP: 0
      };
      if (!unit?.statusEffects?.length) return out;

      for (const se of unit.statusEffects) {
        if (se.kind !== "buff" || !se.payload) continue;
        const p = se.payload;
        out.atkFlat += Number(p.atkBoost || 0);
        out.defFlat += Number(p.defBoost || 0);
        out.speedPercent += Number(p.speedBoostPercent || 0);
        out.damageReductionPercent += Number(p.damageReductionPercent || 0);
        out.critRatePercent += Number(p.critRatePercent || 0);
        out.critDmgPercent += Number(p.critDmgPercent || 0);
        out.barrierHP += Number(p.barrierHP || 0);
      }

      return out;
    }
  };

  // Export globally
  window.BattleBuffs = Buffs;

  console.log("[BattleBuffs] Module loaded ✅ (includes cleanseDebuffs support)");
})();
