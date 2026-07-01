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

  function getDefaultRewards(difficulty) {
    const mult = DIFFICULTY_MULTIPLIERS[difficulty] || 1;

    const completion = {
      ryo: Math.round(2000 * mult)
    };

    const firstTime = {
      ninja_pearls: Math.max(1, Math.round(1 * mult)),
      ryo: Math.round(5000 * mult)
    };

    // Higher difficulties add rarer first-clear materials
    if (mult >= 6) {
      firstTime.awakening_stone_6 = 1;
      firstTime.limit_break_crystal = 1;
    } else if (mult >= 4) {
      firstTime.awakening_stone_5 = 1;
      firstTime.dupe_crystal = 1;
    } else if (mult >= 2.5) {
      firstTime.awakening_stone_4 = 1;
    } else if (mult >= 1.5) {
      firstTime.awakening_stone_3 = 1;
    } else {
      firstTime.scroll_basic = 2;
    }

    return { completion, firstTime, objectives: [] };
  }

  // ---------- Get Rewards for Mission ----------
  async function getRewards(missionId, difficulty) {
    const config = await loadRewardsConfig();
    const missionRewards = config[missionId];

    if (!missionRewards || !missionRewards[difficulty]) {
      // No hand-authored rewards: fall back to difficulty-scaled defaults
      return getDefaultRewards(difficulty);
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

    return {
      ok: true,
      rewards: totalRewards,
      isFirstClear,
      newObjectives
    };
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
    getMissionSummary,
    resetProgress
  };

})(window);
