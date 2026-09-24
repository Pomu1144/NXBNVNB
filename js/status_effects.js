/* ============================================================
   js/status_effects.js — Status effect catalogue + skill text parser
   ------------------------------------------------------------
   Pure data / logic (no DOM), loaded before the battle modules and
   usable from Node (module.exports) for data surveys.

   - STATUS_EFFECTS: every buff / debuff the battle engine knows, with
     its Blazing icon (assets/ui/status/<icon>.png), bubble colour and
     behaviour flags. Keyed by UPPER_CASE for backwards compatibility;
     STATUS_EFFECT_BY_ID maps the lower-case id → definition.
   - parseSkillEffects(description): turns a skill description such as
     "Removes Perfect Dodge for 1 enemy(s) in range and ignores
     Substitution with 15x attack toward them, with a 80% chance of
     jutsu sealing for 5 turn(s)." into structured ops used by
     BattleBuffs (js/battle/battle-buffs.js).
   - parseAbilityProfile(abilities): passive abilities that interact
     with statuses (resistances, nullifies, rate boosts, ignores ...).
   - StatusEffectManager / statusManager: legacy id-keyed manager kept
     for older pages (teams.html).
   ============================================================ */
(function (root) {
  "use strict";

  const ICON_DIR = "assets/ui/status/";

  // kind: buff | debuff.  Behaviour flags are read by BattleBuffs.
  const DEFS = [
    // ── Ailments ───────────────────────────────────────────────
    { id: "immobilize",     name: "Immobilization",          kind: "debuff", icon: "immobilize",     color: "#f0a020", prevent_action: true, desc: "Cannot move; turn is skipped." },
    { id: "jutsu_seal",     name: "Jutsu Sealing",           kind: "debuff", icon: "jutsu_seal",     color: "#8a5cc8", prevent_jutsu: true, prevent_ultimate: true, prevent_secret: true, desc: "Cannot use Ninjutsu, Ultimate or Secret Techniques." },
    { id: "attack_down",    name: "Attack Weakened",         kind: "debuff", icon: "attack_down",    color: "#3b6fd8", desc: "Attack power reduced." },
    { id: "slip",           name: "Slip Damage",             kind: "debuff", icon: "slip",           color: "#8e3fc0", desc: "Takes damage at the start of every turn." },
    { id: "damage_region",  name: "Damage Region",           kind: "debuff", icon: "damage_region",  color: "#5a2a8a", desc: "Hazard area: fixed damage every turn (ignores defense)." },
    { id: "hp_seal",        name: "Health Recovery Sealing", kind: "debuff", icon: "hp_seal",        color: "#c83a4a", prevent_heal: true, desc: "Health cannot be restored." },
    { id: "chakra_seal",    name: "Chakra Recovery Sealing", kind: "debuff", icon: "chakra_seal",    color: "#2a7fd0", prevent_chakra: true, desc: "Chakra Gauge cannot be restored." },
    { id: "hp_to_dmg",      name: "Recovery→Damage",         kind: "debuff", icon: "hp_to_dmg",      color: "#b0306a", desc: "Healing received is converted into damage." },
    { id: "switch_seal",    name: "Switch Sealing",          kind: "debuff", icon: "switch_seal",    color: "#a04a3a", prevent_switch: true, desc: "Cannot switch with the back row." },
    { id: "vulnerability",  name: "Damage Taken Up",         kind: "debuff", icon: "vulnerability",  color: "#d05a20", desc: "Receives increased damage." },
    { id: "element_change", name: "Element Changed",         kind: "debuff", icon: "element_change", color: "#3a9a8a", desc: "Element temporarily changed." },
    { id: "speed_down",     name: "Speed Reduction",         kind: "debuff", icon: "speed_down",     color: "#3a70c0", desc: "Speed gauge fills more slowly." },

    // ── Boosts ─────────────────────────────────────────────────
    { id: "attack_up",        name: "Attack Boost",           kind: "buff", icon: "attack_up",        color: "#e0602a", desc: "Attack power increased." },
    { id: "damage_reduction", name: "Damage Reduction",       kind: "buff", icon: "damage_reduction", color: "#d2a21e", desc: "Damage taken reduced." },
    { id: "perfect_dodge",    name: "Perfect Dodge",          kind: "buff", icon: "perfect_dodge",    color: "#8a6a2a", desc: "Automatically evades the next attack(s)." },
    { id: "dodge_up",         name: "Dodge Boost",            kind: "buff", icon: "dodge_up",         color: "#6aa05a", desc: "Higher chance to evade attacks." },
    { id: "barrier",          name: "Barrier",                kind: "buff", icon: "barrier",          color: "#d8a820", desc: "Absorbs damage until broken." },
    { id: "regen",            name: "Continuous Recovery",    kind: "buff", icon: "regen",            color: "#2fb07a", desc: "Restores health every turn." },
    { id: "crit_up",          name: "Critical Rate Boost",    kind: "buff", icon: "crit_up",          color: "#e0a020", desc: "Critical rate increased." },
    { id: "nullify_ninjutsu", name: "Evade Ninjutsu",         kind: "buff", icon: "nullify_ninjutsu", color: "#4a8ad8", desc: "Nullifies damage from Ninjutsu / Secret Techniques." },
    { id: "nullify_normal",   name: "Evade Attacks",          kind: "buff", icon: "nullify_normal",   color: "#c04040", desc: "Nullifies damage from normal attacks." },
    { id: "ignore_defense",   name: "Ignore Defense",         kind: "buff", icon: "ignore_defense",   color: "#b06a2a", desc: "Attacks ignore the target's defense." },
    { id: "dmg_boost",        name: "Damage Boost",           kind: "buff", icon: "dmg_boost",        color: "#c03a8a", desc: "Deals increased damage." },
    { id: "range_up",         name: "Range Boost",            kind: "buff", icon: "range_up",         color: "#3a8ac0", desc: "Attack range changed." },
    { id: "speed_up",         name: "Speed Boost",            kind: "buff", icon: "speed_up",         color: "#3ab0d0", desc: "Speed gauge fills faster." },
    { id: "jutsu_seal_res",   name: "Jutsu Sealing Resist.",  kind: "buff", icon: "jutsu_seal_res",   color: "#6a5aa0", resist: "jutsu_seal", desc: "Lower chance of being jutsu sealed." },
    { id: "immobilize_res",   name: "Immobilization Resist.", kind: "buff", icon: "immobilize_res",   color: "#a07a2a", resist: "immobilize", desc: "Lower chance of being immobilized." },
    { id: "chakra_seal_res",  name: "Chakra Seal Resist.",    kind: "buff", icon: "chakra_seal_res",  color: "#2a6aa0", resist: "chakra_seal", desc: "Lower chance of being chakra recovery sealed." },
    { id: "switch_seal_res",  name: "Switch Seal Resist.",    kind: "buff", icon: "switch_seal_res",  color: "#8a4a3a", resist: "switch_seal", desc: "Lower chance of being switch sealed." },
    { id: "counter",          name: "Counterattack",          kind: "buff", icon: "counter",          color: "#c83a6a", desc: "May strike back when attacked." }
  ];

  const STATUS_EFFECT_BY_ID = {};
  const STATUS_EFFECTS = {};
  DEFS.forEach(d => {
    const def = Object.assign({ type: d.kind, iconPath: ICON_DIR + d.icon + ".png", description: d.desc }, d);
    STATUS_EFFECT_BY_ID[d.id] = def;
    STATUS_EFFECTS[d.id.toUpperCase()] = def;
  });
  // Legacy aliases used by older code paths
  const ALIASES = {
    stun: "immobilize", immobilized: "immobilize", immobilization: "immobilize", paralysis: "immobilize",
    sealed: "jutsu_seal", seal: "jutsu_seal", jutsu_sealing: "jutsu_seal",
    attack_weakened: "attack_down", atk_reduction: "attack_down", atkdown: "attack_down", attack_debuff: "attack_down",
    poison: "slip", burn: "slip", bleed: "slip",
    attack_boost: "attack_up", defense_boost: "damage_reduction", dodge: "dodge_up", healing: "regen"
  };
  ["STUN", "SEALED", "IMMOBILIZED", "POISON", "BURN", "ATTACK_DEBUFF", "ATTACK_BOOST", "PERFECT_DODGE_LEGACY"].forEach(k => {
    const id = ALIASES[k.toLowerCase()];
    if (id && !STATUS_EFFECTS[k]) STATUS_EFFECTS[k] = STATUS_EFFECT_BY_ID[id];
  });
  function resolveStatusId(x) {
    if (!x) return null;
    const k = String(x).toLowerCase();
    return STATUS_EFFECT_BY_ID[k] ? k : (ALIASES[k] || null);
  }

  // Instant (no duration) effect popups use these icons too
  const INSTANT_ICONS = {
    heal: "heal", chakra: "chakra_recovery", chakra_drain: "chakra_drain", knockback: "knockback", pull: "pull",
    remove_barrier: "remove_barrier", remove_perfect_dodge: "remove_perfect_dodge", remove_attack_up: "remove_attack_up",
    cure: "cure", self_damage: "self_damage", speed_gauge_down: "speed_gauge_down",
    ignore_substitution: "ignore_substitution", ignore_perfect_dodge: "ignore_perfect_dodge", ignore_element: "ignore_element"
  };

  /* ============================================================
     Skill description parser
     ============================================================ */

  const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
  const TURNS_RE = /for\s+(\d+)\s*(?:turn|second)/i;
  const num = s => Number(String(s).replace(/,/g, "")) || 0;

  // Ailment vocabulary (order matters for positions)
  const AILMENTS = [
    { id: "hp_to_dmg",   re: /health recovery to damage conversion/g },
    { id: "hp_seal",     re: /(?:health )?recovery (?:is )?seal(?:ing|ed)?|seal(?:ing)? health recovery|health recover(?:y)? (?:is )?sealed/g },
    { id: "chakra_seal", re: /chakra recovery seal(?:ing|ed)?/g },
    { id: "switch_seal", re: /switch seal(?:ing|ed)?/g },
    { id: "jutsu_seal",  re: /jutsu seal(?:ing|ed)?|sealing (?:their )?jutsu|jutsu sealing them|jutsu sealing/g },
    { id: "immobilize",  re: /immobiliz(?:ation|ing|ed|e)|imobilization|immoblization/g },
    { id: "slip",        re: /slip damage|slip damaged/g },
    { id: "attack_down", re: /attack reduction|attack weakened|weaken(?:ing)? (?:their )?attack|reducing (?:their|the) attack(?: of [^,.]*?)?/g }
  ];

  function findAilments(seg) {
    const out = [];
    const taken = [];
    AILMENTS.forEach(a => {
      a.re.lastIndex = 0;
      let m;
      while ((m = a.re.exec(seg))) {
        const s = m.index, e = s + m[0].length;
        if (taken.some(([ts, te]) => s < te && e > ts)) continue; // overlapped by a more specific one
        // "chakra recovery sealing" also matches the generic hp_seal regex — skip that
        taken.push([s, e]);
        out.push({ id: a.id, pos: s, end: e });
      }
    });
    return out.sort((a, b) => a.pos - b.pos);
  }

  /**
   * Parse a skill description into { ops, flags, cond, knockback, unrecognized }.
   * ops: [{op:'status', id, target, chance, turns, value, charges, element}
   *       {op:'heal', target, amount|percent|ofDamage, turns?, count?}
   *       {op:'chakra', target, amount} {op:'chakraDrain', amount}
   *       {op:'remove', what, pre:true} {op:'cure', ids, target}
   *       {op:'knockback'} {op:'pull'} {op:'selfDamage', percent}
   *       {op:'speedRollback'} {op:'percentHp', percent}]
   * flags: ignoreSubstitution, ignorePerfectDodge, ignoreBarrier,
   *        ignoreDamageReduction, ignoreElement, ignoreDefensePct
   * cond: [{when: statusId|'any', mult}] alternative multipliers
   */
  function parseSkillEffects(description) {
    const res = { ops: [], flags: {}, cond: [], unrecognized: [], recognized: [] };
    if (!description) return res;
    const text = String(description).replace(/\s+/g, " ").trim();
    const d = text.toLowerCase();
    const used = []; // [start,end] spans that were understood
    const mark = (s, e, tag) => { used.push([s, e]); if (tag && !res.recognized.includes(tag)) res.recognized.push(tag); };
    const each = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(d))) { fn(m); if (!re.global) break; } };
    const turnsAfter = (from, fallback) => {
      const m = TURNS_RE.exec(d.slice(from, from + 90));
      return m ? Number(m[1]) : fallback;
    };
    const lookback = (pos, n = 70) => d.slice(Math.max(0, pos - n), pos);
    const targetOf = (pos, after = "") => {
      const lb = lookback(pos, 80);
      const la = after;
      if (/excluding self/.test(la) || /excluding self/.test(lb)) return "alliesExSelf";
      if (/all allies|ally\(s\)|allies in range|gives them|to all allies|for those allies/.test(lb + " " + la)) return "allies";
      return "self";
    };

    // ── Conditional multipliers "(6x attack if they are Attack Weakened)" ──
    each(/\(\s*([\d.]+)x (?:attack|damage)(?: instead)? if ([^)]*)\)/g, m => {
      const c = m[2];
      let when = null;
      if (/immobiliz/.test(c)) when = "immobilize";
      else if (/slip/.test(c)) when = "slip";
      else if (/jutsu seal/.test(c)) when = "jutsu_seal";
      else if (/recover\w* (?:is )?seal/.test(c)) when = "hp_seal";
      else if (/attack weakened|attack reduc/.test(c)) when = "attack_down";
      else if (/status ailment/.test(c)) when = "any";
      if (when) { res.cond.push({ when, mult: Number(m[1]) }); mark(m.index, m.index + m[0].length, "conditional"); }
    });
    each(/(\d+(?:\.\d+)?)x attack instead if they are ([a-z ]+?)(?:[,.]|$)/g, m => {
      const c = m[2]; let when = /slip/.test(c) ? "slip" : /immobil/.test(c) ? "immobilize" : null;
      if (when) { res.cond.push({ when, mult: Number(m[1]) }); mark(m.index, m.index + m[0].length, "conditional"); }
    });
    each(/if they are slip damaged/g, m => mark(m.index, m.index + m[0].length));

    // ── Chance-based ailments / resistances ─────────────────────────
    // Each "N% chance" starts a segment that ends at the next chance or clause change.
    const chanceRe = /(\d+)%\s*chance(?:\s*each)?(?:\s*of|\s*to)?/g;
    const chances = [];
    each(chanceRe, m => chances.push({ pos: m.index, end: m.index + m[0].length, chance: Number(m[1]) / 100 }));
    chances.forEach((c, i) => {
      const nextPos = i + 1 < chances.length ? chances[i + 1].pos : d.length;
      let seg = d.slice(c.end, nextPos);
      const cut = seg.search(/\.\s|\.$|\bgives\b|\brestores\b|\bputs up\b|\bincreas|\bboosts\b|\bremoves\b|\bignores\b|\bknock|\bplus\b|\bcreat|\bnullif|\bdepletes\b|\bwith \d|, and \d/);
      if (cut > 0) seg = seg.slice(0, cut);
      const lb = lookback(c.pos, 40);
      // Resistances granted to self: "gives you N% chance of jutsu sealing resistance and immobilization resistance"
      if (/resistance/.test(seg)) {
        findAilments(seg).forEach(a => {
          const id = a.id + "_res";
          if (!STATUS_EFFECT_BY_ID[id]) return;
          res.ops.push({ op: "status", id, target: "self", chance: 1, value: c.chance * 100, turns: turnsAfter(c.end + a.end, 1) });
        });
        mark(c.pos, c.end + seg.length, "resistance");
        return;
      }
      // Health recovery to damage conversion
      const ails = findAilments(seg);
      if (!ails.length) return;
      const selfToo = /immobilizing you and/.test(seg) || /you and \d+ enemy/.test(seg);
      const eachTurns = TURNS_RE.exec(seg);
      ails.forEach(a => {
        // turns: first "for N turn" after the ailment inside the segment, else the segment's last
        const after = TURNS_RE.exec(seg.slice(a.end));
        let turns = after ? Number(after[1]) : (eachTurns ? Number(eachTurns[1]) : turnsAfter(c.end + a.end, 1));
        res.ops.push({ op: "status", id: a.id, target: "enemies", chance: c.chance, turns });
        if (selfToo && a.id === "immobilize") res.ops.push({ op: "status", id: a.id, target: "self", chance: c.chance, turns });
      });
      if (/^\s*(?:for|a|an)?\s*$/.test(lb.slice(-3))) {} // noop
      mark(c.pos, c.end + seg.length, "ailment");
    });

    // Combo passives phrased without "chance": "chance to do slip damage for N turns" handled above.

    // ── Buffs ───────────────────────────────────────────────────────
    each(/(?:gives? (?:you |them )?(?:an? )?)?(?:all allies in range get )?(?:attack boost of (\d+)%(?: attack boost)?|(\d+)% attack boost|boosts (?:your )?own attack by (\d+)%|boosts attack by (\d+)%)/g, m => {
      const pct = Number(m[1] || m[2] || m[3] || m[4]);
      const end = m.index + m[0].length;
      const tail = d.slice(end, end + 80);
      const target = targetOf(m.index + 1, m[0] + tail.slice(0, 60));
      res.ops.push({ op: "status", id: "attack_up", target, chance: 1, value: pct, turns: turnsAfter(end, 1) });
      mark(m.index, end + (TURNS_RE.exec(tail)?.index ?? 0) + 14, "attack_up");
    });
    each(/(\d+)% damage reduction(?! effects)/g, m => {
      const end = m.index + m[0].length;
      res.ops.push({ op: "status", id: "damage_reduction", target: targetOf(m.index, d.slice(end, end + 40)), chance: 1, value: Number(m[1]), turns: turnsAfter(end, 1) });
      mark(Math.max(0, m.index - 12), end + 18, "damage_reduction");
    });
    each(/(\d+) perfect dodge\(s\)|perfect dodge up to (\d+) times/g, m => {
      const end = m.index + m[0].length;
      const target = /all allies/.test(lookback(m.index, 30)) ? "allies" : "self";
      res.ops.push({ op: "status", id: "perfect_dodge", target, chance: 1, charges: Number(m[1] || m[2]), turns: turnsAfter(end, 1) });
      mark(Math.max(0, m.index - 12), end + 20, "perfect_dodge");
    });
    each(/block up to ([\d,]+) damage for any remaining turns/g, m => {
      res.ops.push({ op: "status", id: "barrier", target: "self", chance: 1, value: num(m[1]), turns: 3 });
      mark(m.index - 10, m.index + m[0].length + 40, "barrier");
    });
    each(/chance to dodge by (\d+)%/g, m => {
      const end = m.index + m[0].length;
      res.ops.push({ op: "status", id: "dodge_up", target: "self", chance: 1, value: Number(m[1]), turns: turnsAfter(end, 1) });
      mark(Math.max(0, m.index - 25), end + 18, "dodge_up");
    });
    each(/barrier (?:that protects (you|all allies within range|all allies in range) from|blocking) ([\d,]+) damage/g, m => {
      const end = m.index + m[0].length;
      res.ops.push({ op: "status", id: "barrier", target: /allies/.test(m[1] || "") ? "allies" : "self", chance: 1, value: num(m[2]), turns: turnsAfter(end, 1) });
      mark(Math.max(0, m.index - 10), end + 40, "barrier");
    });
    each(/critical rate by ([\d.]+)x/g, m => {
      const end = m.index + m[0].length;
      res.ops.push({ op: "status", id: "crit_up", target: "self", chance: 1, value: Math.round((Number(m[1]) - 1) * 100) || 20, turns: turnsAfter(end, 1) });
      mark(Math.max(0, m.index - 20), end + 18, "crit_up");
    });
    each(/nullifies damage you receive from ninjutsu or secret techniques/g, m => {
      const end = m.index + m[0].length;
      res.ops.push({ op: "status", id: "nullify_ninjutsu", target: "self", chance: 1, turns: turnsAfter(end, 1) });
      mark(Math.max(0, m.index - 5), end + 18, "nullify_ninjutsu");
    });
    each(/nullifies damage you receive from normal attacks[^.]*?counters/g, m => {
      const end = m.index + m[0].length;
      res.ops.push({ op: "status", id: "nullify_normal", target: "self", chance: 1, turns: turnsAfter(end, 1) });
      mark(m.index, end + 18, "nullify_normal");
    });
    each(/(?<!damage and )ignores defense for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "ignore_defense", target: "self", chance: 1, turns: Number(m[1]) });
      mark(m.index, m.index + m[0].length + 3, "ignore_defense");
    });
    each(/(\d+)% damage boost against ([a-z ]+?) for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "dmg_boost", target: "self", chance: 1, value: Number(m[1]), element: m[2].replace(/your |elemental affinities|effective /g, "").trim(), turns: Number(m[3]) });
      mark(Math.max(0, m.index - 12), m.index + m[0].length + 3, "dmg_boost");
    });
    each(/increased damage from their non-effective elemental affinities by (\d+)% for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "vulnerability", target: "enemies", chance: 1, value: Number(m[1]), turns: Number(m[2]) });
      mark(Math.max(0, m.index - 20), m.index + m[0].length + 3, "vulnerability");
    });
    each(/chang(?:es|ing) (?:the element of [^,]*?|their element) to (body|skill|bravery|wisdom|heart) for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "element_change", target: "enemies", chance: 1, element: m[1], turns: Number(m[2]) });
      mark(m.index, m.index + m[0].length + 3, "element_change");
    });
    each(/changes your element to (body|skill|bravery|wisdom|heart) for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "element_change", target: "self", chance: 1, element: m[1], turns: Number(m[2]) });
      mark(m.index, m.index + m[0].length + 3, "element_change");
    });
    each(/changes your range to "?(\w+)"? for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "range_up", target: "self", chance: 1, element: m[1], turns: Number(m[2]) });
      mark(m.index, m.index + m[0].length + 3, "range_up");
    });

    // ── Healing / chakra ────────────────────────────────────────────
    each(/restores ([\d,]+) (?:health of )?(?:of )?own health for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "regen", target: "self", chance: 1, value: num(m[1]), turns: Number(m[2]) });
      mark(m.index, m.index + m[0].length + 3, "regen");
    });
    each(/restores ([\d,]+) health (?:of|for|to) (\d+) ally\(s\) in range(?: for (\d+) turn)?/g, m => {
      if (m[3]) res.ops.push({ op: "status", id: "regen", target: "allies", count: Number(m[2]), chance: 1, value: num(m[1]), turns: Number(m[3]) });
      else res.ops.push({ op: "heal", target: "allies", count: Number(m[2]), amount: num(m[1]) });
      mark(m.index, m.index + m[0].length + 3, "heal");
    });
    each(/restores ([\d,]+) (?:of own health|health)(?!\s*(?:of|for|to)\s*\d)(?! (?:of own health )?for \d)/g, m => {
      if (used.some(([s, e]) => m.index >= s && m.index < e)) return;
      res.ops.push({ op: "heal", target: "self", amount: num(m[1]) });
      mark(m.index, m.index + m[0].length, "heal");
    });
    each(/restores own health by (\d+)% of the damage caused/g, m => {
      res.ops.push({ op: "heal", target: "self", ofDamage: Number(m[1]) });
      mark(m.index, m.index + m[0].length, "heal");
    });
    each(/restores? (?:own |your )?chakra gauge (?:for those allies )?by (\d+)/g, m => {
      const allies = /for those allies/.test(m[0]);
      res.ops.push({ op: "chakra", target: allies ? "allies" : "self", amount: Number(m[1]) });
      mark(m.index, m.index + m[0].length, "chakra");
    });
    each(/reduces their chakra gauge by (\d+)/g, m => {
      res.ops.push({ op: "chakraDrain", target: "enemies", amount: Number(m[1]) });
      mark(m.index, m.index + m[0].length, "chakra_drain");
    });
    each(/(?:but )?depletes your remaining health by (\d+)%|your remaining health is depleted by (\d+)%/g, m => {
      res.ops.push({ op: "selfDamage", percent: Number(m[1] || m[2]) });
      mark(m.index, m.index + m[0].length, "self_damage");
    });

    // ── Cures / removals ────────────────────────────────────────────
    each(/cures (them|own) (?:of )?([a-z ]+?)(?=[,.]|$| and )/g, m => {
      const ids = findAilments(m[2]).map(a => a.id);
      if (ids.length) { res.ops.push({ op: "cure", target: m[1] === "own" ? "self" : "allies", ids }); mark(m.index, m.index + m[0].length, "cure"); }
    });
    each(/removes jutsu seal of all allies/g, m => {
      res.ops.push({ op: "cure", target: "allies", ids: ["jutsu_seal"] });
      mark(m.index, m.index + m[0].length + 10, "cure");
    });
    each(/remov(?:es|ing) (?:their )?((?:perfect dodge|barriers?|attack boost)(?: and (?:perfect dodge|barriers?))?)/g, m => {
      const w = m[1];
      if (/perfect dodge/.test(w)) res.ops.push({ op: "remove", what: "perfect_dodge", pre: true });
      if (/barrier/.test(w)) res.ops.push({ op: "remove", what: "barrier", pre: true });
      if (/attack boost/.test(w)) res.ops.push({ op: "remove", what: "attack_up", pre: true });
      mark(m.index, m.index + m[0].length, "remove");
    });

    // ── Attack flags ────────────────────────────────────────────────
    each(/ignor(?:es|e|ing) (?:damage reduction effects \((?:reduce damage|damage reduction)\) and )?substitution/g, m => { res.flags.ignoreSubstitution = true; mark(m.index, m.index + m[0].length, "ignore_substitution"); });
    each(/ignor(?:es|e|ing) (?:substitution and )?(?:damage reduction effects|damage reduction)(?: \((?:reduce damage|damage reduction)\))?/g, m => { res.flags.ignoreDamageReduction = true; mark(m.index, m.index + m[0].length, "ignore_damage_reduction"); });
    each(/(?:ignor(?:es|e|ing)|which ignores) perfect dodge/g, m => { res.flags.ignorePerfectDodge = true; mark(m.index, m.index + m[0].length, "ignore_perfect_dodge"); });
    each(/(?:ignoring substitution and barrier|ignores? barrier)/g, m => { res.flags.ignoreBarrier = true; res.flags.ignoreSubstitution = true; mark(m.index, m.index + m[0].length, "ignore_barrier"); });
    each(/neutraliz(?:es|ing) element affinity-based damage reduction/g, m => { res.flags.ignoreElement = true; mark(m.index, m.index + m[0].length, "ignore_element"); });
    each(/ignoring (\d+)% of enemy defense/g, m => { res.flags.ignoreDefensePct = Number(m[1]); mark(m.index, m.index + m[0].length, "ignore_defense"); });

    // ── Movement ────────────────────────────────────────────────────
    each(/knock(?:s|ing)? (?:them|the) back/g, m => { if (!res.ops.some(o => o.op === "knockback")) res.ops.push({ op: "knockback" }); mark(m.index, m.index + m[0].length, "knockback"); });
    each(/drags them closer|pulling them together/g, m => { res.ops.push({ op: "pull" }); mark(m.index, m.index + m[0].length, "pull"); });
    each(/rolls back targeted enemies' speed gauge/g, m => { res.ops.push({ op: "speedRollback" }); mark(m.index, m.index + m[0].length, "speed_rollback"); });

    // ── Damage regions ──────────────────────────────────────────────
    each(/(acid|poison mist|black flame|[a-z]+) are(?:a)? (?:that )?(?:ignores defense and )?(?:does|causes) ([\d,]+) damage(?: and ignores defense)?(?: for (\d+) turn)?/g, m => {
      res.ops.push({ op: "status", id: "damage_region", target: "enemies", chance: 1, value: num(m[2]), turns: m[3] ? Number(m[3]) : 3 });
      mark(Math.max(0, m.index - 12), m.index + m[0].length + 3, "damage_region");
    });
    each(/deals (\d+)% of target's remaining health as damage/g, m => {
      res.ops.push({ op: "percentHp", percent: Number(m[1]) });
      mark(m.index, m.index + m[0].length, "percent_hp");
    });

    // ── Extra phrasings ─────────────────────────────────────────────
    each(/if (?:they are|they have(?: a)?|the target enemy is) ([a-z ]+?),\s*([\d.]+)x attack(?: instead)?/g, m => {
      const c = m[1];
      const when = /immobil/.test(c) ? "immobilize" : /slip/.test(c) ? "slip" : /jutsu seal/.test(c) ? "jutsu_seal" : /attack weakened|attack reduc/.test(c) ? "attack_down" : /recover/.test(c) ? "hp_seal" : null;
      if (when) { res.cond.push({ when, mult: Number(m[2]) }); mark(m.index, m.index + m[0].length, "conditional"); }
    });
    each(/(?:inflicts you with|immobilizes you for|gives you) ((?:immobilization|slip damage|chakra recovery sealing|jutsu sealing|and| |\d|turn\(s\)|for)+)/g, m => {
      const ids = findAilments(m[1]);
      if (!ids.length) return;
      const t = TURNS_RE.exec(d.slice(m.index, m.index + m[0].length + 20));
      ids.forEach(a => res.ops.push({ op: "status", id: a.id, target: "self", chance: 1, turns: t ? Number(t[1]) : 1 }));
      mark(m.index, m.index + m[0].length, "self_ailment");
    });
    each(/immobilizes you for (\d+) turn/g, m => {
      if (!res.ops.some(o => o.id === "immobilize" && o.target === "self")) res.ops.push({ op: "status", id: "immobilize", target: "self", chance: 1, turns: Number(m[1]) });
      mark(m.index, m.index + m[0].length + 3, "self_ailment");
    });
    each(/(?:gives you )?(\d+)% (immobilization|jutsu sealing|chakra recovery sealing) resistance for (\d+) turn/g, m => {
      const id = findAilments(m[2])[0]?.id;
      if (id) res.ops.push({ op: "status", id: id + "_res", target: "self", chance: 1, value: Number(m[1]), turns: Number(m[3]) });
      mark(m.index, m.index + m[0].length, "resistance");
    });
    each(/perfect dodge against (\d+) attack\(s\) for (\d+) turn/g, m => {
      res.ops.push({ op: "status", id: "perfect_dodge", target: "self", chance: 1, charges: Number(m[1]), turns: Number(m[2]) });
      mark(Math.max(0, m.index - 10), m.index + m[0].length, "perfect_dodge");
    });
    each(/and health by ([\d,]+)/g, m => { res.ops.push({ op: "heal", target: "self", amount: num(m[1]) }); mark(m.index, m.index + m[0].length, "heal"); });
    each(/restoring own health by (\d+)% of the damage caused/g, m => { res.ops.push({ op: "heal", target: "self", ofDamage: Number(m[1]) }); mark(m.index, m.index + m[0].length, "heal"); });
    each(/restores chakra gauge by (\d+) for all target ally\(s\)/g, m => {
      const i = res.ops.findIndex(o => o.op === "chakra" && o.target === "self" && o.amount === Number(m[1]));
      if (i >= 0) res.ops[i].target = "allies"; mark(m.index, m.index + m[0].length, "chakra");
    });
    each(/knocking all enemies back/g, m => { if (!res.ops.some(o => o.op === "knockback")) res.ops.push({ op: "knockback" }); mark(m.index, m.index + m[0].length, "knockback"); });
    each(/drawing them closer/g, m => { res.ops.push({ op: "pull" }); mark(m.index, m.index + m[0].length, "pull"); });
    each(/removes perfect dodge, attack boost, and barrier/g, m => {
      ["perfect_dodge", "attack_up", "barrier"].forEach(w => { if (!res.ops.some(o => o.op === "remove" && o.what === w)) res.ops.push({ op: "remove", what: w, pre: true }); });
      mark(m.index, m.index + m[0].length, "remove");
    });
    each(/ignoring substitution and perfect dodge/g, m => { res.flags.ignoreSubstitution = res.flags.ignorePerfectDodge = true; mark(m.index, m.index + m[0].length, "ignore_perfect_dodge"); });
    each(/nullifies element affinity-based damage reduction/g, m => { res.flags.ignoreElement = true; mark(m.index, m.index + m[0].length, "ignore_element"); });
    each(/deals (\d+)% of (?:target's|\d+ enemy's) remaining health as damage/g, m => {
      if (!res.ops.some(o => o.op === "percentHp")) res.ops.push({ op: "percentHp", percent: Number(m[1]) });
      mark(m.index, m.index + m[0].length, "percent_hp");
    });

    // ── Residual: what was not understood (for coverage stats) ──────
    let residual = d.split("");
    used.forEach(([s, e]) => { for (let i = Math.max(0, s); i < Math.min(d.length, e); i++) residual[i] = " "; });
    residual = residual.join("")
      // plain damage / targeting wording
      .replace(/\(?\s*[\d.]+x (?:attack|damage)[^,.;)]*\)?/g, " ")
      .replace(/\b(?:toward|towards|to|for|with|and|or|in|range|within|all|enemies|enemy\(s\)|enemy|them|they|the|a|an|of|each|plus|also|then|this|is|separate|from|ninjutsu|on-screen|other|elemental|elements|element|body|skill|bravery|wisdom|heart|path|that|erases|everything|its|instantly|instead|in an instant|strikes|phases|through|warps|behind|guards|yata|mirror|blow|chakra-enhanced|crushing|gravitational|force|targeted|turn\(s\)|turns|turn|you|your|own|if|are|but|damage|attack|attacks|ally\(s\)|allies|combination|follow-up|counters|normal|second\(s\)|seconds)\b/g, " ")
      .replace(/[^a-z]+/g, " ")
      .split(" ").filter(w => w.length > 2 && !/^(?:has|gives|get|also|als|while|whil|plus|instant|atttack|damage|toward|then|gaining|dealing|excluding|self|ally|ives)$/.test(w)).join(" ");
    if (residual) res.unrecognized.push(residual);
    return res;
  }

  /* ============================================================
     Passive ability profile (status-related abilities only)
     ============================================================ */
  function parseAbilityProfile(abilities) {
    const p = {
      resist: {}, nullify: {}, rateBoost: {}, allRateBoost: 0,
      ignoreSubstitution: false, ignorePerfectDodge: false, ignoreBarrier: false, removeBarrier: false,
      ignoreDamageReduction: false, ignoreElement: false, nullifyKnockback: false,
      substitution: 0, extendNinjutsu: 0, extendSecret: 0, recoveryBoost: 0,
      onAttack: [], lifestealNormal: 0
    };
    (abilities || []).forEach(a => {
      const n = String(a?.name || "").toLowerCase();
      const de = String(a?.description || "").toLowerCase();
      const pct = Number((de.match(/(\d+)%/) || [])[1]) || 0;
      const both = n + " | " + de;
      const resistMap = [["jutsu seal", "jutsu_seal"], ["immobiliz", "immobilize"], ["attack weakened", "attack_down"], ["attack reduction resistance", "attack_down"],
        ["slip damage", "slip"], ["health recovery sealed", "hp_seal"], ["recovery sealed", "hp_seal"], ["chakra recovery sealed", "chakra_seal"], ["switch sealed", "switch_seal"]];
      if (/lowers rate of|reduces the chance of receiving/.test(de)) {
        resistMap.forEach(([k, id]) => { if (de.includes(k)) p.resist[id] = Math.max(p.resist[id] || 0, pct); });
        if (de.includes("chakra recovery sealed")) delete p.resist.hp_seal;
        if (de.includes("chakra recovery sealed")) p.resist.chakra_seal = Math.max(p.resist.chakra_seal || 0, pct);
      }
      if (/^nullif/.test(n)) {
        if (n.includes("immobilization")) p.nullify.immobilize = true;
        if (n.includes("jutsu sealing")) p.nullify.jutsu_seal = true;
        if (n.includes("health recovery sealing")) p.nullify.hp_seal = true;
        if (n.includes("chakra recovery sealing")) p.nullify.chakra_seal = true;
        if (n.includes("knock back")) p.nullifyKnockback = true;
        if (n.includes("damage reduction effects")) p.ignoreDamageReduction = true;
        if (n.includes("element affinity") && !n.includes("comb")) p.ignoreElement = true;
      }
      if (/rate boost/.test(n)) {
        if (n.includes("status ailment")) p.allRateBoost += pct;
        else [["jutsu sealing", "jutsu_seal"], ["immobilization", "immobilize"], ["slip damage", "slip"], ["attack reduction", "attack_down"], ["health recovery sealing", "hp_seal"]]
          .forEach(([k, id]) => { if (n.includes(k)) p.rateBoost[id] = (p.rateBoost[id] || 0) + pct; });
      }
      if (n === "ignore substitution") p.ignoreSubstitution = true;
      if (n === "ignore perfect dodge") p.ignorePerfectDodge = true;
      if (n === "ignore barrier") p.ignoreBarrier = true;
      if (n === "barrier destruction") p.removeBarrier = true;
      if (/chance (?:of|to) (?:phase through and )?dodg(?:ing|e) a physical attack/.test(de)) {
        const all = [...de.matchAll(/(\d+)%/g)].map(x => Number(x[1]));
        p.substitution = Math.max(p.substitution, all.length ? all[all.length - 1] : pct);
      }
      if (/extend (?:active |status effect duration of )?ninjutsu/.test(de)) p.extendNinjutsu = Math.max(p.extendNinjutsu, Number((de.match(/by (\d+)/) || [])[1]) || 1);
      if (/extend (?:active )?secret|ninjutsu\/secret tech/.test(de)) p.extendSecret = Math.max(p.extendSecret, Number((de.match(/by (\d+)/) || [])[1]) || 1);
      if (/recovery amount by/.test(de)) p.recoveryBoost = Math.max(p.recoveryBoost, Number((de.match(/by (\d+)/) || [])[1]) || 0);
      // "N% chance to weaken attack for N turns when attacking" / combination variants
      const onAtk = de.match(/(\d+)% chance to (weaken attack|seal health recovery|do slip damage) for (\d+) turns?/);
      if (onAtk) p.onAttack.push({ id: /weaken/.test(onAtk[2]) ? "attack_down" : /seal/.test(onAtk[2]) ? "hp_seal" : "slip", chance: Number(onAtk[1]) / 100, turns: Number(onAtk[3]) });
      const ls = de.match(/restores health by (\d+)% of damage caused with normal attacks/);
      if (ls) p.lifestealNormal = Math.max(p.lifestealNormal, Number(ls[1]));
      void both;
    });
    return p;
  }

  /* ============================================================
     Legacy manager (teams.html)
     ============================================================ */
  class StatusEffectManager {
    constructor() { this.activeEffects = new Map(); }
    applyEffect(characterId, effectId, caster = null) {
      const id = resolveStatusId(effectId);
      const effect = id && STATUS_EFFECT_BY_ID[id];
      if (!effect) return false;
      if (!this.activeEffects.has(characterId)) this.activeEffects.set(characterId, []);
      const list = this.activeEffects.get(characterId);
      const ex = list.find(e => e.id === effect.id);
      if (ex) ex.turnsRemaining = 3;
      else list.push({ ...effect, turnsRemaining: 3, caster });
      return true;
    }
    removeEffect(characterId, effectId) {
      const list = this.activeEffects.get(characterId); if (!list) return;
      const i = list.findIndex(e => e.id === effectId); if (i !== -1) list.splice(i, 1);
    }
    getEffects(characterId) { return this.activeEffects.get(characterId) || []; }
    canAct(characterId) { return !this.getEffects(characterId).some(e => e.prevent_action); }
    canUseJutsu(characterId) { return !this.getEffects(characterId).some(e => e.prevent_jutsu); }
    clearEffects(characterId) { this.activeEffects.delete(characterId); }
    clearAll() { this.activeEffects.clear(); }
  }
  const statusManager = new StatusEffectManager();

  const api = { STATUS_EFFECTS, STATUS_EFFECT_BY_ID, INSTANT_ICONS, ICON_DIR, resolveStatusId, parseSkillEffects, parseAbilityProfile, StatusEffectManager, statusManager };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.STATUS_EFFECTS = STATUS_EFFECTS;
    root.StatusCatalog = api;
    root.statusManager = statusManager;
    root.StatusEffectManager = StatusEffectManager;
  }
})(typeof window !== "undefined" ? window : null);
