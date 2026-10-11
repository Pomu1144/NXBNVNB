/* Mission goals ("Special Reward Condition" in the original game).
 *
 * Tracks what happened during a battle and, at the end, checks the mission's
 * objectives (data/mission-rewards.json, or the defaults in mission-progress.js).
 * Each objective is matched by its description text:
 *   Clear without any ally falling          no player unit reached 0 HP
 *   Clear in N turns or less                rounds <= N (a round = every living ally acting once)
 *   Use only N-star or lower / higher characters
 *   Use N or fewer characters               front + bench
 *   Use ultimate / secret technique at least once
 *   Win without using jutsu
 *   Defeat all enemies with jutsu           every kill came from a jutsu, ultimate or secret
 *   Defeat boss with ultimate               the boss fell to an ultimate (or secret)
 *   All allies survive with over N% HP
 *   Complete in under N minutes
 *   Complete without using items            battles have no items, always met
 * Anything else is reported as not met.
 *
 * Hooks: BattleMissions.loadWave -> onWave, BattleTurns.endTurn -> onTurnEnd; the
 * four BattleCombat.perform* actions are wrapped here to count skills and credit kills.
 */
(function () {
  "use strict";

  const S = {
    bm: null, startedAt: 0, allyFell: false, playerActions: 0, teamSize: 0,
    used: { attack: 0, jutsu: 0, ultimate: 0, secret: 0 },
    kills: [], // { type, boss }
  };

  function reset(bm) {
    S.bm = bm;
    S.startedAt = performance.now();
    S.allyFell = false;
    S.playerActions = 0;
    S.teamSize = (bm.activeTeam || []).filter(Boolean).length || 1;
    S.used = { attack: 0, jutsu: 0, ultimate: 0, secret: 0 };
    S.kills = [];
  }

  const allies = bm => [...(bm.activeTeam || []), ...(bm.benchTeam || [])].filter(Boolean);
  const isDown = u => u.isKO || (u.stats && u.stats.hp <= 0);

  function checkAllies(bm) {
    if (allies(bm).some(isDown)) S.allyFell = true;
  }

  // Wrap an action so player use is counted and the enemies it fells are credited to it.
  function wrap(name, type, onDoneIndex) {
    const C = window.BattleCombat;
    const orig = C && C[name];
    if (typeof orig !== 'function' || orig._objWrapped) return;
    const fn = function (...args) {
      const unit = args[0];
      const core = args[onDoneIndex - 1];
      if (!unit || !unit.isPlayer || !core) return orig.apply(this, args);
      const before = new Set((core.enemyTeam || []).filter(e => e && !isDown(e)));
      const credit = () => {
        for (const e of before) if (isDown(e)) S.kills.push({ type, boss: !!e.isBoss });
        before.clear();
      };
      const done = args[onDoneIndex];
      args[onDoneIndex] = function (...r) { credit(); return typeof done === 'function' ? done.apply(this, r) : undefined; };
      const ok = orig.apply(this, args);
      if (ok !== false) S.used[type]++;
      return ok;
    };
    fn._objWrapped = true;
    C[name] = fn;
  }

  function install() {
    wrap('performAttack', 'attack', 3);
    wrap('performJutsu', 'jutsu', 3);
    wrap('performUltimate', 'ultimate', 3);
    wrap('performSecret', 'secret', 2);
  }

  // star tier of a player unit: its owned instance (unit.id is the instance uid), else the character's minimum
  function rarity(u) {
    const inst = window.InventoryChar?.getByUid?.(u.id);
    const base = (S.bm?.charactersData || []).find(c => c.id === (u.charId || inst?.charId));
    const n = parseInt(inst?.tierCode || u.tierCode || base?.starMinCode || base?.rarity, 10);
    return Number.isFinite(n) ? n : 0;
  }

  /** One objective -> true / false. */
  function check(desc, bm) {
    const d = String(desc || '').toLowerCase();
    const n = Number((d.match(/(\d+)/) || [])[1]);
    const team = allies(bm);
    const rounds = Math.ceil(S.playerActions / Math.max(1, S.teamSize));
    if (/without any ally falling|no ally falls?/.test(d)) return !S.allyFell && !team.some(isDown);
    if (/in \d+ turns? or (less|fewer)/.test(d)) return rounds <= n;
    if (/only \d+-star or lower/.test(d)) return team.every(u => rarity(u) <= n);
    if (/only \d+-star or higher/.test(d)) return team.every(u => rarity(u) >= n);
    if (/use \d+ or fewer characters/.test(d)) return team.length <= n;
    if (/use ultimate at least once/.test(d)) return S.used.ultimate > 0;
    if (/secret technique at least once/.test(d)) return S.used.secret > 0;
    if (/without using jutsu/.test(d)) return S.used.jutsu === 0;
    if (/defeat all enemies with jutsu/.test(d)) return S.kills.length > 0 && S.kills.every(k => k.type !== 'attack');
    if (/defeat boss with ultimate/.test(d)) return S.kills.some(k => k.boss && (k.type === 'ultimate' || k.type === 'secret'));
    if (/allies survive with over \d+% hp/.test(d)) {
      return (bm.activeTeam || []).filter(Boolean).every(u => u.stats && u.stats.hp / u.stats.maxHP * 100 > n);
    }
    if (/under \d+ minutes?/.test(d)) return (performance.now() - S.startedAt) / 60000 < n;
    if (/without using items/.test(d)) return true;
    return false;
  }

  window.BattleObjectives = {
    /** BattleMissions.loadWave: the first wave of a battle starts the record (one battle per page). */
    onWave(bm) {
      install();
      if (!S.bm) reset(bm);
    },

    /** BattleTurns.endTurn, for the unit whose turn just ended. */
    onTurnEnd(core, unit) {
      if (!S.bm) reset(core);
      if (unit && unit.isPlayer) S.playerActions++;
      checkAllies(core);
    },

    /** [{ description, reward }] -> [{ description, reward, met }] */
    evaluate(bm, objectives) {
      if (!S.bm) reset(bm);
      checkAllies(bm);
      return (objectives || []).map(o => ({ ...o, met: check(o.description, bm) }));
    },

    stats: () => ({ ...S, used: { ...S.used }, kills: S.kills.slice(), bm: undefined }),
  };
})();
