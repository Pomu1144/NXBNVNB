// js/mission-progress.js
// Mission Progress Tracking & Rewards System
// Tracks mission completions, objectives, and distributes rewards

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_mission_progress_v1";
  let _progress = {}; // { "m_001": { "C": { firstClear: true, objectives: [true, false, true] } } }
  let _rewardsConfig = null;

  // ---------- Persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _progress = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error("[MissionProgress] Failed to load:", err);
      _progress = {};
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_progress));
    } catch (err) {
      console.error("[MissionProgress] Failed to save:", err);
    }
  }

  // ---------- Load Rewards Config ----------
  async function loadRewardsConfig() {
    if (_rewardsConfig) return _rewardsConfig;

    try {
      const res = await fetch("data/mission-rewards.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _rewardsConfig = data.rewards || {};
      return _rewardsConfig;
    } catch (err) {
      console.error("[MissionProgress] Failed to load rewards:", err);
      _rewardsConfig = {};
      return {};
    }
  }

  // ---------- Progress Getters ----------
  function getProgress(missionId, difficulty) {
    if (!_progress[missionId]) _progress[missionId] = {};
    if (!_progress[missionId][difficulty]) {
      _progress[missionId][difficulty] = {
        firstClear: false,
        objectives: []
      };
    }
    return _progress[missionId][difficulty];
  }

  function hasFirstCleared(missionId, difficulty) {
    const progress = getProgress(missionId, difficulty);
    return progress.firstClear === true;
  }

  function getCompletedObjectives(missionId, difficulty) {
    const progress = getProgress(missionId, difficulty);
    return progress.objectives || [];
  }

  // ---------- Default Rewards (missions without a config entry) ----------
  const DIFFICULTY_MULTIPLIERS = { D: 0.5, C: 1, B: 1.5, A: 2.5, S: 4, SS: 6 };

  function getDefaultRewards(difficulty, missionId = "") {
    const mult = DIFFICULTY_MULTIPLIERS[difficulty] || 1;

    const completion = {
      ryo: Math.round(2000 * mult)
    };

    const firstTime = {
      ninja_pearls: Math.max(1, Math.round(1 * mult)),
      ryo: Math.round(5000 * mult)
    };

    // Higher difficulties add rarer first-clear materials: the real Naruto
    // Blazing awakening scrolls / Blazing Awakening beads; the element is
    // fixed per mission (hash of its id) so previews match what is granted
    const ELEMENTS = ["heart", "skill", "body", "bravery", "wisdom"];
    let h = 0;
    for (const ch of String(missionId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const el = ELEMENTS[h % ELEMENTS.length];
    if (mult >= 6) {
      firstTime[`beads_${el}_5`] = 1;
      firstTime.awakening_stone_6 = 1;
      firstTime.limit_break_crystal = 1;
    } else if (mult >= 4) {
      firstTime[`beads_${el}_4`] = 1;
      firstTime.dupe_crystal = 1;
    } else if (mult >= 2.5) {
      firstTime[`book_${el}_3`] = 1;
    } else if (mult >= 1.5) {
      firstTime[`book_${el}_2`] = 1;
    } else {
      firstTime[`book_${el}_1`] = 2;
    }

    return { completion, firstTime, objectives: [] };
  }

  // ---------- Per-mission clear rewards (data/missions.json) ----------
  // Missions declare { clearRewards: { <rank>: { firstTime, completion } } }
  // next to their stages; that is the primary source. mission-rewards.json
  // still supplies objectives and covers missions without clearRewards.
  let _missionsPromise = null;
  function loadMissions() {
    if (!_missionsPromise) {
      _missionsPromise = fetch("data/missions.json")
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    return _missionsPromise;
  }

  // ---------- Get Rewards for Mission ----------
  async function getRewards(missionId, difficulty) {
    const config = await loadRewardsConfig();
    const missionRewards = config[missionId];

    const missions = await loadMissions();
    const own = (Array.isArray(missions) ? missions : [])
      .find(m => m.id === missionId)?.clearRewards?.[difficulty];
    if (own) {
      return {
        completion: own.completion || {},
        firstTime: own.firstTime || {},
        objectives: missionRewards?.[difficulty]?.objectives || []
      };
    }

    if (!missionRewards || !missionRewards[difficulty]) {
      // No hand-authored rewards: fall back to difficulty-scaled defaults
      return getDefaultRewards(difficulty, missionId);
    }

    return {
      completion: missionRewards[difficulty].completion || {},
      firstTime: missionRewards[difficulty].firstTime || {},
      objectives: missionRewards[difficulty].objectives || []
    };
  }

  // ---------- Complete Mission ----------
  async function completeMission(missionId, difficulty, completedObjectives = []) {
    const rewards = await getRewards(missionId, difficulty);
    const progress = getProgress(missionId, difficulty);
    const isFirstClear = !progress.firstClear;

    let totalRewards = {};

    // Add completion rewards (always given)
    totalRewards = { ...totalRewards, ...rewards.completion };

    // Add first-time clear bonus
    if (isFirstClear && rewards.firstTime) {
      totalRewards = combineRewards(totalRewards, rewards.firstTime);
      progress.firstClear = true;
    }

    // Add objective rewards (only for newly completed objectives)
    const newObjectives = completedObjectives.filter(i => !progress.objectives[i]);
    newObjectives.forEach((objectiveIndex) => {
      const objReward = rewards.objectives[objectiveIndex]?.reward || {};
      totalRewards = combineRewards(totalRewards, objReward);
      progress.objectives[objectiveIndex] = true;
    });

    // Save progress
    save();

    // Award rewards
    if (global.Resources) {
      Object.entries(totalRewards).forEach(([matId, amount]) => {
        global.Resources.add(matId, amount);
      });
    }

    // Shinobi Chronicles: the chapter's featured boss unit
    const unit = await rollChronicleUnit(missionId, difficulty, isFirstClear);
    if (unit) totalRewards = { ...totalRewards, characters: [unit] };

    return {
      ok: true,
      rewards: totalRewards,
      isFirstClear,
      newObjectives,
      unitDrop: unit
    };
  }

  // ---------- Shinobi Chronicles boss unit drop ----------
  // First clear of the hardest rank always gives the chapter's featured unit.
  // First clears of the lower ranks give only a chance at it, and so do
  // replays of the harder ranks (a Normal replay gives nothing).
  const CHRONICLE_DROP = {
    firstClear: { C: 0.15, B: 0.30 },
    replay: { B: 0.08, A: 0.12 }
  };
  let _charsPromise = null;
  function loadCharacters() {
    if (!_charsPromise) {
      _charsPromise = fetch("data/characters.json")
        .then(r => (r.ok ? r.json() : []))
        .then(j => (Array.isArray(j) ? j : (j.characters || [])))
        .catch(() => []);
    }
    return _charsPromise;
  }

  async function rollChronicleUnit(missionId, difficulty, isFirstClear, rand = Math.random) {
    const missions = await loadMissions();
    const mission = (Array.isArray(missions) ? missions : []).find(m => m.id === missionId);
    if (!mission || !mission.feature || !/^Shinobi Chronicles/i.test(String(mission.category || ""))) return null;
    const ranks = Object.keys(mission.rankNames || mission.power || {});
    const hardest = ranks[ranks.length - 1];
    const guaranteed = isFirstClear && difficulty === hardest;
    const chance = guaranteed ? 1
      : (isFirstClear ? CHRONICLE_DROP.firstClear : CHRONICLE_DROP.replay)[difficulty] || 0;
    if (!(chance > 0) || (!guaranteed && rand() >= chance)) return null;

    const chars = await loadCharacters();
    const c = chars.find(x => x.id === mission.feature);
    if (!c) return null;
    const tiers = Object.keys(c.artByTier || {});
    const tierCode = tiers.includes(`${c.rarity}S`) ? `${c.rarity}S` : (tiers[0] || `${c.rarity || 5}S`);
    if (global.InventoryChar && typeof global.InventoryChar.addCopy === "function") {
      global.InventoryChar.addCopy(c.id, 1, tierCode);
    }
    return { characterId: c.id, tierCode, quantity: 1, guaranteed };
  }

  // ---------- Helper: Combine Rewards ----------
  function combineRewards(rewards1, rewards2) {
    const combined = { ...rewards1 };
    Object.entries(rewards2).forEach(([matId, amount]) => {
      combined[matId] = (combined[matId] || 0) + amount;
    });
    return combined;
  }

  // ---------- Get Mission Summary ----------
  async function getMissionSummary(missionId, difficulty) {
    const rewards = await getRewards(missionId, difficulty);
    const progress = getProgress(missionId, difficulty);

    return {
      firstCleared: progress.firstClear,
      completedObjectives: progress.objectives,
      totalObjectives: rewards.objectives.length,
      rewards: {
        completion: rewards.completion,
        firstTime: rewards.firstTime,
        objectives: rewards.objectives
      }
    };
  }

  // ---------- Reset Progress (Dev Tool) ----------
  function resetProgress() {
    _progress = {};
    save();
    console.log("[MissionProgress] Progress reset!");
  }

  // ---------- Public API ----------
  load();

  global.MissionProgress = {
    loadRewardsConfig,
    getProgress,
    hasFirstCleared,
    getCompletedObjectives,
    getRewards,
    completeMission,
    rollChronicleUnit,
    CHRONICLE_DROP,
    getMissionSummary,
    resetProgress
  };

})(window);
