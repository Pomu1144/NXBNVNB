/* ============================================================
   js/battle/battle-buffs.js — Status effect engine (buffs / debuffs)
   ------------------------------------------------------------
   One place for every timed status on a battle unit
   (unit.statusEffects), shared by player units and enemies:

   - Catalogue + description parser: js/status_effects.js
     (window.StatusCatalog: STATUS_EFFECT_BY_ID, parseSkillEffects,
     parseAbilityProfile)
   - Skill hooks (called by BattleCombat):
       skillFx(data)            parsed + structured effects of a skill
       preHit(...)              "removes Perfect Dodge / Barrier" before damage
       attackCtx(...)           ignore-substitution / barrier / DR flags
       checkEvade(...)          Perfect Dodge, dodge boost, Substitution,
                                nullify ninjutsu / normal attacks
       damageMods(...)          attack up/down, damage reduction,
                                vulnerability, crit, ignore defense
       absorbBarrier(...)       barrier HP soaks damage
       postSkill(...)           ailments (chance rolls), buffs, heals,
                                chakra, cures, knockback / pull ...
   - Turn hooks (BattleTurns): onTurnStart (slip / region / regen ticks,
     immobilization skip), onTurnEnd (durations tick down per the
     unit's own turns and expire).
   - Gates: isSealed(unit, kind), cannotAct(unit), canHeal, canGainChakra
   - Passive abilities: resistances, "Nullifies ...", rate boosts,
     ignore Substitution / Perfect Dodge / Barrier, Substitution Jutsu,
     Nullifies Knock Back, extend-turn abilities, on-attack ailments.
   UI lives in js/status_ui.js (window.StatusEffectUI).
   ============================================================ */
(() => {
  "use strict";

  const Cat = () => window.StatusCatalog || {};
  const defOf = id => Cat().STATUS_EFFECT_BY_ID?.[id] || null;
  const UI = () => window.StatusEffectUI || null;
  const core0 = () => window.BattleManager || null;
  const alive = u => !!(u && u.stats && u.stats.hp > 0);
  const log = (...a) => console.log("[Status]", ...a);

  // Legacy / foreign record → catalogue id
  function idOf(se) {
    if (!se) return null;
    if (se.id && defOf(se.id)) return se.id;
    const R = Cat().resolveStatusId;
    const cand = [se.type, se.tag, se.kind];
    for (const c of cand) { const r = R ? R(c) : null; if (r) return r; }
    return null;
  }
  const active = se => se && (typeof se.turnsRemaining !== "number" || se.turnsRemaining > 0);

  const NEGATIVE = new Set(["immobilize", "jutsu_seal", "attack_down", "slip", "damage_region", "hp_seal", "chakra_seal", "hp_to_dmg", "switch_seal", "vulnerability", "element_change", "speed_down"]);
  function isNegativeAilment(se) {
    const id = idOf(se);
    if (id) return NEGATIVE.has(id);
    if (se?.kind === "debuff" || se?.category === "debuff") return true;
    return typeof se?.value === "number" && se.value < 0;
  }

  const Buffs = {
    turnSerial: 0,
    _fxCache: new WeakMap(),

    /* =========================
       Queries
       ========================= */
    list(unit) {
      return (unit?.statusEffects || []).filter(se => active(se) && idOf(se));
    },
    get(unit, id) {
      return (unit?.statusEffects || []).find(se => active(se) && idOf(se) === id) || null;
    },
    has(unit, id) { return !!this.get(unit, id); },
    sum(unit, id, field = "value") {
      return (unit?.statusEffects || []).reduce((a, se) => a + (active(se) && idOf(se) === id ? Number(se[field]) || 0 : 0), 0);
    },
    cannotAct(unit) {
      return !!(unit?.statusEffects || []).some(se => active(se) && se.prevent_action);
    },
    /** kind: 'jutsu' | 'ultimate' | 'secret' */
    isSealed(unit, kind = "jutsu") {
      const flag = kind === "ultimate" ? "prevent_ultimate" : kind === "secret" ? "prevent_secret" : "prevent_jutsu";
      return !!(unit?.statusEffects || []).some(se => active(se) && se[flag]);
    },
    sealTurns(unit) {
      const se = this.get(unit, "jutsu_seal");
      return se ? se.turnsRemaining : 0;
    },
    canHeal(unit) { return !this.has(unit, "hp_seal"); },
    canGainChakra(unit) { return !this.has(unit, "chakra_seal"); },
    speedMult(unit) {
      return Math.max(0.2, 1 + (this.sum(unit, "speed_up") - this.sum(unit, "speed_down")) / 100);
    },
    elementOf(unit) {
      const ec = this.get(unit, "element_change");
      return (ec?.element || unit?._ref?.base?.element || "").toString().toLowerCase();
    },

    /** Status-related passive abilities of a unit (cached per unit). */
    profile(unit) {
      if (!unit) return Cat().parseAbilityProfile ? Cat().parseAbilityProfile([]) : {};
      if (!unit._statusProfile) {
        const abil = unit._ref?.base?.abilities || [];
        unit._statusProfile = Cat().parseAbilityProfile ? Cat().parseAbilityProfile(abil) : {};
      }
      return unit._statusProfile;
    },

    /* =========================
       Applying / removing statuses
       ========================= */

    /**
     * Put status `id` on `unit`. opts: {turns, value, charges, element,
     * chance (0-1), caster, source, silent}. Rolls the chance (with the
     * caster's rate boosts and the target's resistances / nullifies).
     * Returns the record, or null when it did not land.
     */
    addStatus(core, unit, id, opts = {}) {
      const def = defOf(id);
      if (!def || !alive(unit)) return null;
      core = core || core0();
      const caster = opts.caster || null;
      const hostile = def.kind === "debuff" && caster && caster !== unit;

      if (def.kind === "debuff" && caster !== unit) {
        const prof = this.profile(unit);
        if (prof.nullify?.[id]) {
          UI()?.popup(unit, `Nullified`, "#9fd8ff", id);
          log(`${unit.name} nullifies ${def.name}`);
          return null;
        }
        let chance = opts.chance == null ? 1 : Number(opts.chance);
        if (hostile && chance < 1) {
          const cp = this.profile(caster);
          chance += ((cp.rateBoost?.[id] || 0) + (cp.allRateBoost || 0)) / 100;
        }
        // Resistances: passive + timed "<id>_res" statuses
        const res = (prof.resist?.[id] || 0) + this.sum(unit, id + "_res");
        if (res > 0) chance *= Math.max(0, 1 - res / 100);
        if (Math.random() >= chance) {
          if (res > 0) UI()?.popup(unit, "Resisted", "#bfe8ff", id);
          log(`${def.name} failed on ${unit.name} (chance ${(chance * 100).toFixed(0)}%)`);
          return null;
        }
      } else if (opts.chance != null && Math.random() >= Number(opts.chance)) {
        return null;
      }

      let turns = Math.max(1, Number(opts.turns) || 1);
      // "Extend Turns of Ninjutsu / Secret Technique Effect" passives
      if (caster && opts.source) {
        const cp = this.profile(caster);
        if (opts.source === "secret" && cp.extendSecret) turns += cp.extendSecret;
        else if (opts.source !== "secret" && opts.source !== "passive" && cp.extendNinjutsu) turns += cp.extendNinjutsu;
      }

      unit.statusEffects = unit.statusEffects || [];
      let rec = unit.statusEffects.find(se => idOf(se) === id && active(se));
      const value = opts.value != null ? Number(opts.value) : this.defaultValue(id, unit, caster);
      if (rec) {
        rec.turnsRemaining = Math.max(rec.turnsRemaining || 0, turns);
        if (value != null) rec.value = Math.max(Number(rec.value) || 0, value);
        if (opts.charges) rec.charges = Math.max(rec.charges || 0, Number(opts.charges));
        if (opts.element) rec.element = opts.element;
        if (id === "slip" || id === "damage_region") rec.dmg = Math.max(rec.dmg || 0, this.tickDamage(id, unit, value));
        rec.appliedSerial = this.turnSerial;
      } else {
        rec = {
          id, type: id, tag: id, kind: def.kind, category: def.kind, name: def.name, color: def.color,
          turnsRemaining: turns, value, source: opts.source || "skill", casterId: caster?.id || null,
          appliedSerial: this.turnSerial, appliedAt: Date.now()
        };
        ["prevent_action", "prevent_jutsu", "prevent_ultimate", "prevent_secret", "prevent_heal", "prevent_chakra", "prevent_switch"]
          .forEach(f => { if (def[f]) rec[f] = true; });
        if (opts.charges) rec.charges = Number(opts.charges);
        if (opts.element) rec.element = opts.element;
        if (id === "slip" || id === "damage_region") rec.dmg = this.tickDamage(id, unit, value);
        if (id === "barrier") rec.barrierHP = value;
        unit.statusEffects.push(rec);
      }
      if (id === "barrier") rec.barrierHP = Math.max(rec.barrierHP || 0, value || 0);
      // Immobilized units also lose their guard
      if (id === "immobilize") unit.isGuarding = false;
      log(`${unit.name} ← ${def.name}${value != null ? ` (${value})` : ""}${rec.charges ? ` x${rec.charges}` : ""} for ${rec.turnsRemaining} turn(s)`);
      if (!opts.silent) UI()?.announce(unit, rec);
      this.refresh(core, unit);
      return rec;
    },

    defaultValue(id, unit) {
      switch (id) {
        case "attack_down": return 30;
        case "attack_up": return 30;
        case "damage_reduction": return 20;
        case "dodge_up": return 30;
        case "vulnerability": return 20;
        case "speed_down": return 30;
        case "speed_up": return 30;
        default: return null;
      }
    },

    /** Per-turn damage of slip damage / damage regions. */
    tickDamage(id, unit, value) {
      if (id === "damage_region") return Math.max(1, Number(value) || 500);
      const max = Number(unit?.stats?.maxHP) || Number(unit?.stats?.hp) || 1000;
      return Math.max(1, Math.floor(max * 0.05));
    },

    removeStatus(core, unit, id, reason) {
      if (!unit?.statusEffects) return 0;
      const before = unit.statusEffects.length;
      unit.statusEffects = unit.statusEffects.filter(se => idOf(se) !== id);
      const n = before - unit.statusEffects.length;
      if (n && reason) UI()?.popup(unit, reason, "#ffffff", id);
      if (n) this.refresh(core || core0(), unit);
      return n;
    },

    cleanseUnit(core, unit, opts = {}) {
      if (!unit?.statusEffects) return 0;
      const only = Array.isArray(opts.types) || Array.isArray(opts.ids)
        ? new Set((opts.ids || opts.types).map(x => Cat().resolveStatusId?.(x) || String(x).toLowerCase())) : null;
      const before = unit.statusEffects.length;
      unit.statusEffects = unit.statusEffects.filter(se => {
        if (!isNegativeAilment(se)) return true;
        return only ? !only.has(idOf(se)) : false;
      });
      const n = before - unit.statusEffects.length;
      if (n) { UI()?.popup(unit, "Cured", "#8affc1", "cure"); this.refresh(core || core0(), unit); }
      return n;
    },

    refresh(core, unit) {
      core = core || core0();
      try { UI()?.render(unit, core); } catch (e) { console.warn("[Status] UI render failed", e); }
    },

    /* =========================
       Heals / chakra (respect recovery seals)
       ========================= */

    heal(core, unit, amount, opts = {}) {
      core = core || core0();
      if (!alive(unit)) return 0;
      let amt = Math.floor(Number(amount) || 0);
      if (amt <= 0) return 0;
      if (opts.caster && opts.source && opts.source !== "passive") {
        const rb = this.profile(opts.caster).recoveryBoost || 0;
        if (rb) amt += rb;
      }
      if (this.has(unit, "hp_to_dmg")) {
        unit.stats.hp = Math.max(0, unit.stats.hp - amt);
        UI()?.number(unit, amt, "slip");
        UI()?.popup(unit, "Recovery → Damage", "#ff7aa8", "hp_to_dmg");
        this._afterHpChange(core, unit);
        return -amt;
      }
      if (!this.canHeal(unit)) {
        UI()?.popup(unit, "Recovery Sealed", "#ff8a9a", "hp_seal");
        log(`${unit.name}'s heal of ${amt} blocked (Health Recovery Sealing)`);
        return 0;
      }
      const max = Number(unit.stats.maxHP) || unit.stats.hp;
      const before = unit.stats.hp;
      unit.stats.hp = Math.min(max, unit.stats.hp + amt);
      const gained = unit.stats.hp - before;
      if (gained > 0 && !opts.silent) UI()?.number(unit, gained, "heal");
      this._afterHpChange(core, unit);
      return gained;
    },

    healPercent(core, unit, percent) {
      const max = Number(unit?.stats?.maxHP) || 0;
      return this.heal(core, unit, Math.floor((Math.max(0, Number(percent) || 0) / 100) * max));
    },

    /** Add chakra through the normal chakra system (which checks the seal). */
    giveChakra(core, unit, amount) {
      core = core || core0();
      if (!unit) return 0;
      const add = Number(amount) || 0;
      if (add <= 0) return 0;
      if (core?.chakra?.addChakra) return core.chakra.addChakra(unit, add, core);
      if (!this.canGainChakra(unit)) { UI()?.popup(unit, "Chakra Sealed", "#7fb8ff", "chakra_seal"); return 0; }
      const before = unit.chakra || 0;
      unit.chakra = Math.min(unit.maxChakra || 10, before + add);
      window.BattleChakraWheel?.updateChakraWheel?.(unit, core);
      return unit.chakra - before;
    },

    drainChakra(core, unit, amount) {
      core = core || core0();
      if (!alive(unit)) return 0;
      const before = unit.chakra || 0;
      unit.chakra = Math.max(0, before - (Number(amount) || 0));
      const lost = before - unit.chakra;
      if (lost > 0) {
        UI()?.popup(unit, `Chakra -${lost}`, "#7fb8ff", "chakra_drain");
        core?.chakra?.updateUnitChakraDisplay?.(unit, core);
        window.BattleChakraWheel?.updateChakraWheel?.(unit, core);
        core?.teamHolder?.updateUnitChakra?.(unit, core);
      }
      return lost;
    },

    _afterHpChange(core, unit) {
      if (!core) return;
      if (core.units) core.units.updateUnitDisplay(unit, core); else core.updateUnitDisplay?.(unit);
      core.updateTeamHP?.();
    },

    /* =========================
       Skill effects
       ========================= */

    /**
     * Parsed effects of a skill tier node ({description, effects}).
     * Structured `effects` (characters.json) win over / add to the text.
     */
    skillFx(data) {
      if (!data) return { ops: [], flags: {}, cond: [] };
      if (this._fxCache.has(data)) return this._fxCache.get(data);
      const P = Cat().parseSkillEffects;
      const fx = P ? P(data.description || "") : { ops: [], flags: {}, cond: [] };
      const e = data.effects || {};
      // Structured debuff { type, chance, turns }
      const dbs = Array.isArray(e.debuffs) ? e.debuffs : e.debuff ? [e.debuff] : [];
      dbs.forEach(db => {
        const id = Cat().resolveStatusId?.(db.type || db.id);
        if (!id) return;
        fx.ops = fx.ops.filter(o => !(o.op === "status" && o.id === id && o.target === "enemies"));
        fx.ops.push({ op: "status", id, target: "enemies", chance: db.chance == null ? 1 : Number(db.chance), turns: Number(db.turns) || 1, value: db.value });
      });
      if (Number(e.selfChakra) > 0) {
        fx.ops = fx.ops.filter(o => !(o.op === "chakra" && o.target === "self"));
        fx.ops.push({ op: "chakra", target: "self", amount: Number(e.selfChakra) });
      }
      const text = String(data.description || "");
      fx.hasDamage = Number(e.multiplier) > 0 || /[\d.]+x\s*(?:attack|damage|atttack)|remaining health as damage/i.test(text);
      this._fxCache.set(data, fx);
      return fx;
    },

    /** Per-target skill multiplier (conditional "(6x attack if they are ...)"). */
    conditionalMult(fx, target, base) {
      let mult = base;
      (fx?.cond || []).forEach(c => {
        const hit = c.when === "any" ? this.list(target).some(se => NEGATIVE.has(idOf(se))) : this.has(target, c.when);
        if (hit) mult = Math.max(mult, c.mult);
      });
      return mult;
    },

    /** Attack context for calculateDamage (skill flags + attacker passives). */
    attackCtx(attacker, fx, kind = "attack") {
      const p = this.profile(attacker);
      const f = fx?.flags || {};
      return {
        kind,
        ignoreSubstitution: !!(f.ignoreSubstitution || p.ignoreSubstitution),
        ignorePerfectDodge: !!(f.ignorePerfectDodge || p.ignorePerfectDodge),
        ignoreBarrier: !!(f.ignoreBarrier || p.ignoreBarrier),
        ignoreDamageReduction: !!(f.ignoreDamageReduction || p.ignoreDamageReduction),
        ignoreElement: !!(f.ignoreElement || p.ignoreElement),
        ignoreDefensePct: Number(f.ignoreDefensePct) || (this.has(attacker, "ignore_defense") ? 100 : 0),
        percentHp: (fx?.ops || []).find(o => o.op === "percentHp")?.percent || 0
      };
    },

    /** Before the damage roll: "Removes Perfect Dodge / Barrier / Attack Boost". */
    preHit(core, attacker, targets, fx) {
      const rem = (fx?.ops || []).filter(o => o.op === "remove");
      const p = this.profile(attacker);
      if (p.removeBarrier && !rem.some(o => o.what === "barrier")) rem.push({ op: "remove", what: "barrier" });
      (targets || []).forEach(t => {
        if (!alive(t) || t.isPlayer === attacker?.isPlayer) return;
        rem.forEach(o => {
          const labels = { perfect_dodge: "Perfect Dodge Removed", barrier: "Barrier Removed", attack_up: "Attack Boost Removed" };
          if (this.has(t, o.what)) this.removeStatus(core, t, o.what, labels[o.what]);
        });
      });
    },

    /**
     * Evasion check before damage. Returns null or {reason}.
     *  - Nullify Ninjutsu (jutsu/ultimate/secret) / Nullify Normal (attacks)
     *  - Perfect Dodge (consumes a charge) unless ignored
     *  - Dodge boost % and Substitution passive (physical/normal attacks)
     *    unless "ignores Substitution"
     */
    checkEvade(attacker, defender, ctx = {}) {
      if (!defender || !attacker || attacker === defender) return null;
      const kind = ctx.kind || "attack";
      const isSkill = kind === "jutsu" || kind === "ultimate" || kind === "secret";
      let reason = null;
      if (isSkill && this.has(defender, "nullify_ninjutsu")) reason = "Nullified";
      else if (!isSkill && this.has(defender, "nullify_normal")) reason = "Nullified";
      if (!reason && !ctx.ignorePerfectDodge) {
        const pd = this.get(defender, "perfect_dodge");
        if (pd && (pd.charges == null || pd.charges > 0)) {
          if (pd.charges != null) {
            pd.charges -= 1;
            if (pd.charges <= 0) defender.statusEffects = defender.statusEffects.filter(se => se !== pd);
          }
          reason = "Perfect Dodge";
        }
      }
      if (!reason && !ctx.ignoreSubstitution) {
        const dodge = this.sum(defender, "dodge_up");
        const subst = !isSkill ? (this.profile(defender).substitution || 0) : 0;
        const chance = Math.min(95, dodge + subst);
        if (chance > 0 && Math.random() * 100 < chance) reason = dodge > 0 ? "Dodge" : "Substitution";
      }
      if (reason) {
        log(`${defender.name} evades ${attacker.name}'s ${kind} (${reason})`);
        UI()?.popup(defender, reason === "Nullified" ? "Nullified!" : `${reason}!`, "#bff4ff",
          reason === "Perfect Dodge" ? "perfect_dodge" : reason === "Nullified" ? (isSkill ? "nullify_ninjutsu" : "nullify_normal") : "dodge_up");
        this.refresh(null, defender);
        return { reason };
      }
      return null;
    },

    /** Status-driven damage modifiers. */
    damageMods(attacker, defender, ctx = {}) {
      const out = { atkPct: 0, drPct: 0, vulnPct: 0, critRate: 0, dmgPct: 0, ignoreDef: false };
      out.atkPct = this.sum(attacker, "attack_up") - this.sum(attacker, "attack_down");
      out.drPct = this.sum(defender, "damage_reduction");
      out.vulnPct = this.sum(defender, "vulnerability");
      out.critRate = this.sum(attacker, "crit_up");
      out.ignoreDef = (ctx.ignoreDefensePct || 0) >= 100 || this.has(attacker, "ignore_defense");
      const db = this.get(attacker, "dmg_boost");
      if (db) {
        const want = String(db.element || "").toLowerCase();
        const el = this.elementOf(defender);
        if (!want || want.includes("effective") || (el && want.includes(el))) out.dmgPct += Number(db.value) || 0;
      }
      return out;
    },

    /** Barrier soaks damage. Returns the damage left over. */
    absorbBarrier(core, defender, damage, ctx = {}) {
      if (ctx.ignoreBarrier || damage <= 0) return damage;
      const b = this.get(defender, "barrier");
      if (!b) return damage;
      const hp = Number(b.barrierHP ?? b.value ?? b.payload?.barrierHP) || 0;
      const absorbed = Math.min(Math.round(damage), Math.round(hp));
      b.barrierHP = hp - absorbed;
      if (b.payload) b.payload.barrierHP = b.barrierHP;
      if (b.barrierHP <= 0) {
        defender.statusEffects = defender.statusEffects.filter(se => se !== b);
        UI()?.popup(defender, "Barrier Broken", "#ffe28a", "barrier");
      } else {
        UI()?.popup(defender, `Barrier -${absorbed}`, "#ffe28a", "barrier");
      }
      this.refresh(core, defender);
      return damage - absorbed;
    },

    /**
     * After a skill lands: apply its ops.
     *   hitTargets: enemies that were hit (not dodged) and still alive
     *   opts: { kind, dealt: total damage dealt, allTargets }
     */
    postSkill(core, attacker, hitTargets, fx, opts = {}) {
      core = core || core0();
      if (!attacker || !fx) return;
      const kind = opts.kind || "jutsu";
      const source = kind === "secret" ? "secret" : kind;
      const enemies = (hitTargets || []).filter(alive);
      const allies = this.alliesOf(attacker, core);
      const pickAllies = (target, count) => {
        let pool = target === "alliesExSelf" ? allies.filter(a => a !== attacker) : allies;
        if (count) {
          // Limited count ("1 ally(s) in range"): the most injured first
          const ratio = u => (u.stats.hp || 0) / (u.stats.maxHP || 1);
          pool = [...pool].sort((a, b) => ratio(a) - ratio(b)).slice(0, count);
        }
        return pool;
      };
      const who = (target, count) => target === "enemies" ? enemies
        : target === "self" ? (alive(attacker) ? [attacker] : [])
        : pickAllies(target, count);

      let delay = 0;
      const stagger = fn => { const d = delay; delay += 140; d ? setTimeout(fn, d) : fn(); };

      (fx.ops || []).forEach(o => {
        switch (o.op) {
          case "status":
            who(o.target, o.count).forEach(t => stagger(() => this.addStatus(core, t, o.id, {
              turns: o.turns, value: o.value, charges: o.charges, element: o.element,
              chance: o.chance, caster: attacker, source
            })));
            break;
          case "heal":
            if (o.ofDamage) { const amt = Math.floor((opts.dealt || 0) * o.ofDamage / 100); if (amt > 0) this.heal(core, attacker, amt, { caster: attacker, source }); }
            else who(o.target, o.count).forEach(t => this.heal(core, t, o.amount, { caster: attacker, source }));
            break;
          case "chakra":
            who(o.target, o.count).forEach(t => this.giveChakra(core, t, o.amount));
            break;
          case "chakraDrain":
            enemies.forEach(t => this.drainChakra(core, t, o.amount));
            break;
          case "cure":
            who(o.target === "self" ? "self" : "allies").forEach(t => this.cleanseUnit(core, t, { ids: o.ids }));
            break;
          case "selfDamage": {
            const lose = Math.floor((attacker.stats.hp || 0) * o.percent / 100);
            if (lose > 0) {
              attacker.stats.hp = Math.max(1, attacker.stats.hp - lose);
              UI()?.number(attacker, lose, "self");
              this._afterHpChange(core, attacker);
            }
            break;
          }
          case "speedRollback":
            enemies.forEach(t => { t.speedGauge = 0; UI()?.popup(t, "Speed Gauge ↺", "#9fd0ff", "speed_gauge_down"); });
            core?.turns?.updateSpeedGaugeDisplay?.(core);
            break;
          case "knockback":
          case "pull":
            enemies.forEach(t => {
              if (this.profile(t).nullifyKnockback) { UI()?.popup(t, "No Knockback", "#ffffff", "knockback"); return; }
              setTimeout(() => {
                if (!alive(t)) return;
                window.BattlePhysics?.applyKnockback?.(t, attacker, o.op === "pull" ? -70 : 120, core);
              }, 360);
            });
            break;
          default: break;
        }
      });

      // Every active member of the caster's side may have been buffed
      [attacker, ...enemies].forEach(u => this.refresh(core, u));
    },

    /** Normal attack landed: on-attack passive ailments and lifesteal. */
    onNormalHit(core, attacker, target, dealt) {
      const p = this.profile(attacker);
      if (alive(target)) (p.onAttack || []).forEach(a => this.addStatus(core, target, a.id, { turns: a.turns, chance: a.chance, caster: attacker, source: "passive" }));
      if (p.lifestealNormal && dealt > 0) this.heal(core, attacker, Math.floor(dealt * p.lifestealNormal / 100), { source: "passive" });
    },

    alliesOf(unit, core) {
      core = core || core0();
      const team = unit?.isPlayer ? core?.activeTeam : core?.enemyTeam;
      return (team || []).filter(u => alive(u) && !u.isBench);
    },

    /* =========================
       Turn hooks
       ========================= */

    /**
     * Start of `unit`'s turn: slip damage / damage regions / regeneration
     * tick, chakra regen. Returns { died, skip } — skip when immobilized.
     */
    onTurnStart(core, unit) {
      this.turnSerial++;
      const out = { died: false, skip: false, effect: null };
      if (!unit?.statusEffects?.length) return out;
      core = core || core0();

      // Legacy payload chakra regen (secret / commander buffs)
      unit.statusEffects.forEach(se => {
        const regen = Number(se.payload?.chakraRegenPerTurn || 0);
        if (active(se) && regen > 0) this.giveChakra(core, unit, regen);
      });

      let t = 0;
      const later = fn => { const d = t; t += 260; d ? setTimeout(fn, d) : fn(); };
      this.list(unit).forEach(se => {
        const id = idOf(se);
        if (id === "slip" || id === "damage_region") {
          const dmg = Math.max(1, Number(se.dmg) || this.tickDamage(id, unit, se.value));
          if (!alive(unit)) return;
          unit.stats.hp = Math.max(0, unit.stats.hp - dmg);
          log(`${unit.name} takes ${dmg} ${se.name} damage (${se.turnsRemaining} turn(s) left)`);
          later(() => {
            UI()?.number(unit, dmg, id === "slip" ? "slip" : "region");
            UI()?.popup(unit, id === "slip" ? "Slip Damage" : "Damage Region", "#d9a0ff", id);
          });
          if (unit.stats.hp <= 0) out.died = true;
        } else if (id === "regen" && alive(unit)) {
          later(() => this.heal(core, unit, Number(se.value) || 0, { source: "regen" }));
        }
      });
      if (out.died) {
        unit.diedAtTurn = core?.turns?.globalTurn ?? 0;
        this._afterHpChange(core, unit);
      } else if (this.cannotAct(unit)) {
        out.skip = true;
        out.effect = unit.statusEffects.find(se => active(se) && se.prevent_action);
      }
      this.refresh(core, unit);
      return out;
    },

    /** End of `unit`'s turn: durations tick down, expired effects fall off. */
    onTurnEnd(core, unit) {
      if (!unit?.statusEffects?.length) return;
      core = core || core0();
      const expired = [];
      unit.statusEffects.forEach(se => {
        if (typeof se.turnsRemaining !== "number" || se.turnsRemaining <= 0) return;
        // Applied during this very turn (e.g. a self-buff from this skill):
        // its first turn is the next one.
        if (se.appliedSerial === this.turnSerial && idOf(se)) return;
        se.turnsRemaining -= 1;
        if (se.turnsRemaining <= 0 && idOf(se)) expired.push(se);
      });
      unit.statusEffects = unit.statusEffects.filter(se => typeof se.turnsRemaining !== "number" || se.turnsRemaining > 0);
      expired.forEach(se => log(`${unit.name}: ${se.name} wore off`));
      if (expired.length) UI()?.expired(unit, expired);
      this.refresh(core, unit);
    },

    /* =========================
       Legacy API (secret / commander / field-buddy payloads)
       ========================= */

    applyBuffEffects(core, caster, targets, effects = {}, sourceKey = "skill") {
      if (!core || !Array.isArray(targets) || targets.length === 0) return;
      if (effects.cleanseDebuffs) targets.forEach(t => this.cleanseUnit(core, t, { types: effects.cleanseTypes }));
      if (effects.revive) targets.forEach(t => this.tryRevive(core, t, Number(effects.reviveWindowTurns ?? 3)));
      if (Number(effects.healPercent) > 0) targets.forEach(t => this.healPercent(core, t, effects.healPercent));
      if (Number(effects.chakraGain) > 0) targets.forEach(t => this.giveChakra(core, t, effects.chakraGain));
      const turns = Math.max(0, Number(effects.durationTurns || 0));
      if (turns > 0) {
        targets.forEach(t => {
          const o = { turns, caster, source: sourceKey };
          if (Number(effects.atkBoostPercent)) this.addStatus(core, t, "attack_up", { ...o, value: Number(effects.atkBoostPercent) });
          if (Number(effects.damageReductionPercent)) this.addStatus(core, t, "damage_reduction", { ...o, value: Number(effects.damageReductionPercent) });
          if (Number(effects.barrierHP)) this.addStatus(core, t, "barrier", { ...o, value: Number(effects.barrierHP) });
          if (Number(effects.critRatePercent)) this.addStatus(core, t, "crit_up", { ...o, value: Number(effects.critRatePercent) });
          if (Number(effects.speedBoostPercent)) this.addStatus(core, t, "speed_up", { ...o, value: Number(effects.speedBoostPercent) });
          // Flat payload buffs keep the generic record (read by aggregateBuffModifiers)
          if (Number(effects.atkBoost) || Number(effects.defBoost) || Number(effects.critDmgPercent) || Number(effects.chakraRegenPerTurn)) {
            this.addTimedBuff(core, t, effects, { sourceKey });
          }
        });
      }
      targets.forEach(u => core.units ? core.units.updateUnitDisplay(u, core) : core.updateUnitDisplay?.(u));
    },
    applyBuff(target, stat, multiplier, duration) {
      const id = /def|reduc/i.test(stat) ? "damage_reduction" : /crit/i.test(stat) ? "crit_up" : /spe/i.test(stat) ? "speed_up" : "attack_up";
      return this.addStatus(null, target, id, { turns: duration || 2, value: Math.round(Math.abs((Number(multiplier) || 1.3) - 1) * 100) || 30 });
    },
    applyDebuff(target, status, duration) {
      const id = Cat().resolveStatusId?.(status) || "attack_down";
      return this.addStatus(null, target, id, { turns: duration || 2 });
    },
    cleanse(target) { return this.cleanseUnit(null, target); },

    tryRevive(core, unit, reviveWindowTurns = 3) {
      if (!unit || !unit.stats || unit.stats.hp > 0) return;
      const diedAtTurn = unit.diedAtTurn ?? -Infinity;
      const currentTurn = core.turns?.globalTurn ?? 0;
      if (currentTurn - diedAtTurn <= reviveWindowTurns) {
        unit.stats.hp = Math.max(1, Math.floor((unit.stats.maxHP || 1) * 0.4));
        unit.isKO = false;
        unit.statusEffects = [];
        core.updateUnitDisplay?.(unit);
        try { window.BattleNarrator?.showAction?.("Revived!", "secret", core.dom); } catch {}
      }
    },

    addTimedBuff(core, unit, effects, meta = {}) {
      if (!unit) return;
      const tag = (effects.tag || meta.sourceKey || "buff").toString();
      unit.statusEffects = unit.statusEffects || [];
      const existing = unit.statusEffects.find(se => se.kind === "buff" && se.tag === tag && !idOf(se));
      const payload = this._buildPayloadFromEffects(effects);
      if (existing) {
        existing.turnsRemaining = Math.max(existing.turnsRemaining, Number(effects.durationTurns || 0));
        Object.assign(existing.payload, payload);
        return;
      }
      unit.statusEffects.push({
        kind: "buff", tag, source: meta.sourceKey || "skill", appliedAtTurn: core?.turns?.globalTurn ?? 0,
        turnsRemaining: Number(effects.durationTurns || 0), stacks: 1, payload, appliedSerial: this.turnSerial
      });
    },

    _buildPayloadFromEffects(effects) {
      const p = {};
      ["atkBoost", "defBoost", "critDmgPercent", "chakraRegenPerTurn"].forEach(k => { if (Number(effects[k])) p[k] = Number(effects[k]); });
      return p;
    },

    /** Flat payload modifiers (field / buddy skills, legacy timed buffs). */
    aggregateBuffModifiers(unit) {
      const out = { atkFlat: 0, defFlat: 0, speedPercent: 0, damageReductionPercent: 0, critRatePercent: 0, critDmgPercent: 0, barrierHP: 0 };
      (unit?.statusEffects || []).forEach(se => {
        if (!active(se) || !se.payload || idOf(se)) return;
        const p = se.payload;
        out.atkFlat += Number(p.atkBoost || 0);
        out.defFlat += Number(p.defBoost || 0);
        out.speedPercent += Number(p.speedBoostPercent || 0);
        out.damageReductionPercent += Number(p.damageReductionPercent || 0);
        out.critRatePercent += Number(p.critRatePercent || 0);
        out.critDmgPercent += Number(p.critDmgPercent || 0);
      });
      return out;
    },

    isNegativeAilment
  };

  window.BattleBuffs = Buffs;
  console.log("[BattleBuffs] Status engine loaded ✅");
})();
