/* Character EXP after a mission (the original game's "Team" EXP results).
 *
 * Every unit on the team (front and back row, fallen ones too) gains the mission's EXP.
 * EXP per level uses the same curve as ramen feeding (100 x level to go from that level
 * to the next); the level cap is the tier cap plus 5 per limit break (max 150). The
 * partial EXP towards the next level is kept on the instance as `exp`. Units already at
 * the cap gain nothing.
 *
 *   BattleUnitExp.missionExp(mission, rank) -> EXP each unit gains
 *   BattleUnitExp.grant(bm) -> { exp, units: [{ uid, name, portrait, tier, element,
 *       before: { level, exp, need }, after: { level, exp, need }, cap, gained, levels }] }
 *
 * Called by BattleMissions.recordMissionComplete; the results screen
 * (BattleRewards.unitExpMarkup / playUnitExp) animates the bars from before to after.
 */
(function () {
  "use strict";

  // Mission EXP per unit by rank; a mission can set its own with "unitExp": { "<rank>": n }
  const RANK_EXP = { D: 150, C: 300, B: 600, A: 1100, S: 1800, SS: 2600 };

  const expToNext = level => 100 * Math.max(1, Number(level) || 1);

  // tiers that can be limit broken (js/limit-break.js MAX_LIMIT_BREAK_LEVELS: 10 each)
  const LB_TIERS = ['6S', '6SB', '7S', '7SL', '8S', '8SM', '9S', '9ST', '10SO'];
  function capOf(inst) {
    const P = window.Progression;
    const base = (P && P.levelCapForCode && P.levelCapForCode(inst.tierCode)) || 100;
    const lb = LB_TIERS.includes(inst.tierCode) ? Math.min(10, Number(inst.limitBreakLevel) || 0) : 0;
    return lb ? Math.min(base + lb * 5, 150) : base;
  }

  function missionExp(mission, rank) {
    const own = mission && mission.unitExp && Number(mission.unitExp[rank]);
    return own > 0 ? own : (RANK_EXP[rank] || RANK_EXP.C);
  }

  /** Add EXP to one owned instance (mutates it). */
  function addExp(inst, amount) {
    const cap = capOf(inst);
    let level = Math.min(Number(inst.level) || 1, cap);
    let exp = Math.max(0, Number(inst.exp) || 0);
    const before = { level, exp: level >= cap ? 0 : exp, need: level >= cap ? 0 : expToNext(level) };
    let gained = 0;
    if (level < cap) {
      exp += amount;
      gained = amount;
      while (level < cap && exp >= expToNext(level)) { exp -= expToNext(level); level++; }
      if (level >= cap) { gained -= exp; exp = 0; }
    }
    inst.level = level;
    inst.exp = exp;
    return { before, after: { level, exp, need: level >= cap ? 0 : expToNext(level) }, cap, gained, levels: level - before.level };
  }

  function grant(bm) {
    const IC = window.InventoryChar;
    const amount = missionExp(bm.missionData, bm.difficulty);
    const out = { exp: amount, units: [] };
    if (!IC || !IC.getByUid) return out;
    const team = [...(bm.activeTeam || []), ...(bm.benchTeam || [])].filter(u => u && u.isPlayer !== false);
    const seen = new Set();
    for (const u of team) {
      const inst = IC.getByUid(u.id);
      if (!inst || seen.has(inst.uid)) continue;
      seen.add(inst.uid);
      const r = addExp(inst, amount);
      const save = x => { x.level = inst.level; x.exp = inst.exp; };
      if (IC._mutate) IC._mutate(inst.uid, save);
      else if (IC.updateInstance) IC.updateInstance(inst.uid, inst);
      const base = (bm.charactersData || []).find(c => c.id === inst.charId) || {};
      out.units.push({
        uid: inst.uid, name: u.name || base.name || '', portrait: u.portrait || base.portrait || '',
        tier: inst.tierCode || '', element: base.element || base.type || '', ...r,
      });
    }
    return out;
  }

  window.BattleUnitExp = { missionExp, grant, addExp, capOf, expToNext, RANK_EXP };
})();
