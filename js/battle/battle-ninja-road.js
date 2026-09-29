// js/battle/battle-ninja-road.js - Ninja Road battles (see ninja-road.html / js/ninja-road.js)
//
// ninja-road.html writes a launch record (LAUNCH_KEY) and arms FLAG_KEY, then
// opens battle.html. battle-core consumes the flag and builds the floor from
// the launch: the chosen squad's living units (launch.slots), the floor's
// enemy waves and, on boss floors, a giant. The squad keeps its state between
// floors: each unit's HP, chakra and jutsu / ultimate cooldowns are restored
// from launch.carry here, and written back to RESULT_KEY when the floor ends.
// The road page applies that result (once per launch id) and pays rewards.
(() => {
  "use strict";

  const FLAG_KEY = "ninja_road_battle_mode";
  const LAUNCH_KEY = "ninja_road_launch";
  const RESULT_KEY = "ninja_road_result";

  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };

  const BattleNinjaRoad = {
    FLAG_KEY, LAUNCH_KEY, RESULT_KEY,

    /** Launch record, or null. */
    launch() {
      try {
        const l = JSON.parse(lsGet(LAUNCH_KEY) || "null");
        return l && typeof l === "object" && l.id && Array.isArray(l.waves) ? l : null;
      } catch (e) { return null; }
    },

    /** Consume the launch flag; returns the launch when this page is a Ninja Road floor. */
    take() {
      const armed = lsGet(FLAG_KEY) === "1";
      lsDel(FLAG_KEY);
      return armed ? this.launch() : null;
    },

    stageKey() {
      const l = this.launch();
      return l ? `ninjaroad:${l.id}` : null;
    },

    /** Synthetic mission for battle-core (same shape as data/missions.json). */
    buildMission(l) {
      const toEnemy = e => {
        if (e && e.giant) return { giant: e.giant, id: e.giant, boss: true, hp: e.hp, atk: e.atk };
        return {
          id: e.id,
          name: e.name,
          portrait: e.icon || e.portrait || "assets/characters/common/silhouette.png",
          stats: {
            hp: e.hp || 5000, atk: e.atk || 800, def: 80,
            speed: e.spd || 100, chakra: 5, maxHP: e.hp || 5000
          },
          skills: e.skills || {},
          element: e.element || null
        };
      };
      const mission = {
        id: "ninja_road",
        name: `Ninja Road · Floor ${l.floor}`,
        difficulties: {
          C: [{
            map: l.map || "assets/maps/bg_020101_mori.png",
            waves: l.waves.map(w => ({ enemies: (w || []).map(toEnemy) }))
          }]
        }
      };
      const giant = l.waves.flat().find(e => e && e.giant);
      if (giant) mission.giant = giant.giant;
      return mission;
    },

    /** Restore each unit's carried HP / chakra / cooldowns; apply the boss seal. */
    applyCarry(core) {
      const l = core.ninjaRoad;
      if (!l) return;
      const carry = l.carry || {};
      const boost = Math.max(0, Number(l.atkBoost) || 0);
      [...(core.activeTeam || []), ...(core.benchTeam || [])].forEach(u => {
        if (!u || !u.stats) return;
        const c = carry[u.id];
        if (c) {
          const frac = Math.max(0, Math.min(1, Number(c.hp)));
          if (Number.isFinite(frac)) u.stats.hp = Math.max(1, Math.round(u.stats.maxHP * frac));
          if (Number.isFinite(c.chakra)) u.chakra = Math.max(0, Math.min(u.maxChakra || 10, c.chakra));
          if (Number.isFinite(c.jc)) u.jutsuCooldown = Math.max(0, c.jc | 0);
          if (Number.isFinite(c.uc)) u.ultimateCooldown = Math.max(0, c.uc | 0);
        }
        if (boost > 0) u.stats.atk = Math.round(u.stats.atk * (1 + boost));
      });
    },

    /** Write the floor result for the road page (idempotent per launch id). */
    record(core, victory) {
      const l = core.ninjaRoad;
      if (!l || core._ninjaRoadRecorded) return;
      core._ninjaRoadRecorded = true;
      const units = {};
      [...(core.activeTeam || []), ...(core.benchTeam || [])].forEach(u => {
        if (!u || !u.stats) return;
        const max = Number(u.stats.maxHP) || 1;
        units[u.id] = {
          hp: victory ? Math.max(0, Math.min(1, (Number(u.stats.hp) || 0) / max)) : 0,
          chakra: Number(u.chakra) || 0,
          jc: Number(u.jutsuCooldown) || 0,
          uc: Number(u.ultimateCooldown) || 0
        };
      });
      lsSet(RESULT_KEY, JSON.stringify({ id: l.id, floor: l.floor, victory: !!victory, units, at: Date.now() }));
    }
  };

  window.BattleNinjaRoad = BattleNinjaRoad;
})();
