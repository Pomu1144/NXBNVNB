/* Mission difficulty: enemy stats that actually threaten the team, rising
 * through a mission and across ranks.
 *
 * Mission enemies used to carry hand-typed stats far below the units they
 * face (a 1★ grunt with 120 ATK against a 70k-HP team). Every mission has a
 * recommended power per rank (data/missions.json "power", the same number
 * the mission sheet shows as Rec. Power). A unit's power is HP + ATK + SPD
 * (js/characters.js), so the recommended power describes the unit the
 * mission was built for; enemies are sized against that unit:
 *
 *   grunt  – dies to ~4 normal attacks, kills that unit in ~11 hits
 *   boss   – dies to ~18 normal attacks, kills that unit in ~4-5 hits
 *
 * Everything then ramps up: later stages and waves of a mission (+30% /
 * +10%), higher ranks (Hard/Extreme/S/SS), and bosses on top. The data's own
 * stats stay as a floor, so a hand-tuned enemy is never made weaker.
 *
 * SS is built to challenge a full team of maxed 7★ units (CFG.SS): the
 * reference unit is never weaker than a max-level 7★ in max gear, and enemy
 * HP assumes jutsu / ultimate damage rather than normal attacks, so a grunt
 * survives a crit jutsu and a boss takes several ultimates. Their attack is
 * already sized to KO such a unit in a couple of boss hits, so it keeps the
 * normal counts.
 *
 * Only story/event missions are touched: Arena and Ninja Road size their
 * rivals themselves, and giant bosses keep data/bosses.json.
 *
 *   BattleDifficulty.enemyStats(bm, base, enemyData, { stageIndex, stageCount, waveIndex, waveCount })
 */
(function () {
  'use strict';

  const CFG = {
    // Unit power above this is mostly ability bonus (+30k power each, no
    // stats), so only a quarter of the excess counts as real stats.
    STAT_POWER_KNEE: 80000,
    STAT_POWER_EXCESS: 0.25,
    // Share of a unit's power that is HP / ATK (a maxed unit is ~94% HP).
    HP_SHARE: 0.94,
    ATK_SHARE: 0.055,
    // Normal attacks needed to defeat an enemy / hits an enemy needs to
    // defeat the reference unit.
    GRUNT_HITS_TO_KILL: 4,
    GRUNT_HITS_TO_KO: 11,
    BOSS_HITS_TO_KILL: 18,
    BOSS_HITS_TO_KO: 4.5,
    DEF_SHARE: 0.004,
    // Ramp through a mission: last stage +30%, last wave of a stage +10%.
    STAGE_RAMP: 0.30,
    WAVE_RAMP: 0.10,
    // Rank on top of the recommended power (harder ranks hit harder).
    RANK: { D: 0.85, C: 1, B: 1.12, A: 1.25, S: 1.4, SS: 1.6 },
    // Bosses get the rank twice over on HP.
    BOSS_RANK_HP_EXP: 1.5,
    // SS: built to challenge a full team of maxed 7★ units.
    SS: {
      // Max-level 7★ (average statsMax of the 7★ cards: ~54k HP, ~5k ATK)
      // in max Red Shiny gear (+10.8k HP, +630 ATK). Used when the rank's
      // recommended power describes a weaker unit.
      FLOOR_UNIT: { hp: 65000, atk: 5600, def: 400 },
      // A 7★ jutsu is ~5-7x ATK and an ultimate up to 20x, often critting,
      // so these count in normal attacks: a grunt survives a crit jutsu, a
      // boss takes several ultimates.
      GRUNT_HITS_TO_KILL: 10,
      BOSS_HITS_TO_KILL: 60,
    },
  };

  function statPower(power) {
    const p = Math.max(0, Number(power) || 0);
    if (p <= CFG.STAT_POWER_KNEE) return p;
    return CFG.STAT_POWER_KNEE + (p - CFG.STAT_POWER_KNEE) * CFG.STAT_POWER_EXCESS;
  }

  /** The unit a mission rank was built for: { hp, atk }. */
  function referenceUnit(power) {
    const s = statPower(power);
    return { hp: s * CFG.HP_SHARE, atk: s * CFG.ATK_SHARE, def: s * CFG.DEF_SHARE };
  }

  function isBossEntry(enemyData, base, ctx, stageData) {
    if (enemyData && typeof enemyData === 'object' && enemyData.boss) return true;
    const id = base?.id;
    return !!(stageData?.boss && id && stageData.boss === id && ctx.waveIndex === ctx.waveCount - 1);
  }

  /** Reference unit and hit counts for a mission rank. */
  function rankTuning(rank, power) {
    const ref = referenceUnit(power);
    if (rank !== 'SS') return { ref, hits: CFG };
    const f = CFG.SS.FLOOR_UNIT;
    return {
      ref: { hp: Math.max(ref.hp, f.hp), atk: Math.max(ref.atk, f.atk), def: Math.max(ref.def, f.def) },
      hits: { ...CFG, ...CFG.SS },
    };
  }

  /**
   * Target stats for one enemy of the current mission wave, or null when the
   * battle isn't a scaled mission. Pure: returns a new stats object.
   */
  function targetStats(mission, rank, base, enemyData, ctx) {
    const power = mission?.power?.[rank];
    if (!(power > 0)) return null;
    const { ref, hits } = rankTuning(rank, power);
    const stageT = ctx.stageCount > 1 ? ctx.stageIndex / (ctx.stageCount - 1) : 0;
    const waveT = ctx.waveCount > 1 ? ctx.waveIndex / (ctx.waveCount - 1) : 0;
    const ramp = 1 + CFG.STAGE_RAMP * stageT + CFG.WAVE_RAMP * waveT;
    const r = CFG.RANK[rank] ?? 1;
    const stageData = mission.difficulties?.[rank]?.[ctx.stageIndex];
    const boss = isBossEntry(enemyData, base, ctx, stageData);

    const hp = boss
      ? ref.atk * hits.BOSS_HITS_TO_KILL * ramp * Math.pow(r, CFG.BOSS_RANK_HP_EXP)
      : ref.atk * hits.GRUNT_HITS_TO_KILL * ramp * r;
    const atk = boss
      ? (ref.hp / hits.BOSS_HITS_TO_KO) * ramp * r
      : (ref.hp / hits.GRUNT_HITS_TO_KO) * ramp * r;
    return { hp: Math.round(hp), atk: Math.round(atk), def: Math.round(ref.def * r), boss };
  }

  /** Stats to use for a mission enemy: data stats, raised to the target. */
  function enemyStats(bm, base, enemyData, ctx) {
    const stats = { ...(base?.stats || {}) };
    if (!bm || bm.isArena || bm.isNinjaRoad) return stats;
    const t = targetStats(bm.missionData, bm.difficulty, base, enemyData, ctx);
    if (!t) return stats;
    stats.hp = Math.max(Number(stats.hp) || 0, t.hp);
    stats.atk = Math.max(Number(stats.atk) || 0, t.atk);
    stats.def = Math.max(Number(stats.def) || 0, t.def);
    return stats;
  }

  const api = { CFG, statPower, referenceUnit, rankTuning, targetStats, enemyStats };

  // Enraged mission bosses (battle-combat.js AI) pulse red.
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
      .battle-unit.is-enraged .unit-sprite,
      .battle-unit.is-enraged .sprite-player {
        animation: enrageGlow 1.4s ease-in-out infinite;
      }
      @keyframes enrageGlow {
        0%, 100% { filter: drop-shadow(0 0 3px rgba(220, 40, 30, .7)); }
        50%      { filter: drop-shadow(0 0 10px rgba(255, 60, 40, .95)); }
      }
      @media (prefers-reduced-motion: reduce) {
        .battle-unit.is-enraged .unit-sprite, .battle-unit.is-enraged .sprite-player {
          animation: none; filter: drop-shadow(0 0 6px rgba(230, 50, 35, .9));
        }
      }`;
    document.head.appendChild(style);
  }
  if (typeof window !== 'undefined') window.BattleDifficulty = api;
  if (typeof module !== 'undefined') module.exports = api; // node balance report / tests
})();
