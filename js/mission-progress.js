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

  // ---------- Get Rewards for Mission ----------
  async function getRewards(missionId, difficulty) {
    const config = await loadRewardsConfig();
    const missionRewards = config[missionId];

    if (!missionRewards || !missionRewards[difficulty]) {
      return {
        completion: {},
        firstTime: {},
        objectives: []
      };
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
    completedObjectives.forEach((objectiveIndex) => {
      if (!progress.objectives[objectiveIndex]) {
        const objReward = rewards.objectives[objectiveIndex]?.reward || {};
        totalRewards = combineRewards(totalRewards, objReward);
        progress.objectives[objectiveIndex] = true;
      }
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
      newObjectives: completedObjectives.filter(i => !progress.objectives[i])
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
