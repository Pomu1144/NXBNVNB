// js/daily-missions.js
// Daily Missions & Login Bonus System
// Tracks daily mission progress and login streaks

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_daily_progress_v1";
  let _progress = {
    lastReset: null,
    dailies: {},
    loginStreak: 0,
    lastLogin: null,
    loginDay: 1
  };
  let _config = null;

  // ---------- Persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _progress = JSON.parse(raw);
      }
    } catch (err) {
      console.error("[DailyMissions] Failed to load:", err);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_progress));
    } catch (err) {
      console.error("[DailyMissions] Failed to save:", err);
    }
  }

  // ---------- Load Config ----------
  async function loadConfig() {
    if (_config) return _config;

    try {
      const res = await fetch("data/daily-missions.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _config = await res.json();
      return _config;
    } catch (err) {
      console.error("[DailyMissions] Failed to load config:", err);
      _config = { dailyMissions: [], loginCalendar: [] };
      return _config;
    }
  }

  // ---------- Date Helpers ----------
  function getDateString(date = new Date()) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  function isSameDay(date1Str, date2Str) {
    return date1Str === date2Str;
  }

  function isConsecutiveDay(lastLoginStr) {
    if (!lastLoginStr) return false;
    const lastLogin = new Date(lastLoginStr);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getDateString(lastLogin) === getDateString(yesterday);
  }

  // ---------- Reset Check ----------
  function checkAndResetDaily() {
    const today = getDateString();

    // Reset dailies if it's a new day
    if (_progress.lastReset !== today) {
      console.log("[DailyMissions] New day detected, resetting dailies");
      _progress.dailies = {};
      _progress.lastReset = today;
      save();
    }
  }

  // ---------- Login Processing ----------
  async function processLogin() {
    const today = getDateString();
    const config = await loadConfig();

    // Check if already logged in today
    if (_progress.lastLogin === today) {
      console.log("[DailyMissions] Already logged in today");
      return {
        alreadyClaimed: true,
        loginDay: _progress.loginDay,
        reward: null
      };
    }

    // Check if login streak continues
    if (isConsecutiveDay(_progress.lastLogin)) {
      _progress.loginStreak++;
      _progress.loginDay = (_progress.loginDay % 14) + 1;
    } else if (_progress.lastLogin !== today) {
      // Streak broken, reset
      _progress.loginStreak = 1;
      _progress.loginDay = 1;
    }

    _progress.lastLogin = today;

    // Get login reward
    const calendar = config.loginCalendar || [];
    const dayReward = calendar.find(r => r.day === _progress.loginDay);
    const reward = dayReward ? dayReward.reward : {};

    // Award rewards
    if (global.Resources && Object.keys(reward).length > 0) {
      Object.entries(reward).forEach(([matId, amount]) => {
        global.Resources.add(matId, amount);
      });
    }

    save();

    return {
      ok: true,
      alreadyClaimed: false,
      loginDay: _progress.loginDay,
      loginStreak: _progress.loginStreak,
      reward
    };
  }

  // ---------- Daily Mission Progress ----------
  async function incrementDaily(dailyId) {
    checkAndResetDaily();

    if (!_progress.dailies[dailyId]) {
      _progress.dailies[dailyId] = { progress: 0, claimed: false };
    }

    const config = await loadConfig();
    const daily = config.dailyMissions.find(d => d.id === dailyId);

    if (!daily) {
      console.warn(`[DailyMissions] Unknown daily: ${dailyId}`);
      return false;
    }

    if (_progress.dailies[dailyId].claimed) {
      return false; // Already claimed
    }

    _progress.dailies[dailyId].progress++;

    // Auto-claim if requirement met
    if (_progress.dailies[dailyId].progress >= daily.requirement && !_progress.dailies[dailyId].claimed) {
      _progress.dailies[dailyId].claimed = true;

      // Award rewards
      if (global.Resources && daily.reward) {
        Object.entries(daily.reward).forEach(([matId, amount]) => {
          global.Resources.add(matId, amount);
        });
      }

      save();
      return {
        ok: true,
        completed: true,
        reward: daily.reward,
        dailyName: daily.name
      };
    }

    save();
    return {
      ok: true,
      completed: false,
      progress: _progress.dailies[dailyId].progress,
      requirement: daily.requirement
    };
  }

  // ---------- Get Daily Status ----------
  async function getDailyStatus() {
    checkAndResetDaily();
    const config = await loadConfig();

    return config.dailyMissions.map(daily => {
      const progress = _progress.dailies[daily.id] || { progress: 0, claimed: false };
      return {
        id: daily.id,
        name: daily.name,
        description: daily.description,
        requirement: daily.requirement,
        progress: progress.progress,
        claimed: progress.claimed,
        completed: progress.progress >= daily.requirement,
        reward: daily.reward
      };
    });
  }

  // ---------- Get Login Status ----------
  async function getLoginStatus() {
    const config = await loadConfig();
    const calendar = config.loginCalendar || [];

    return {
      loginDay: _progress.loginDay,
      loginStreak: _progress.loginStreak,
      lastLogin: _progress.lastLogin,
      claimedToday: _progress.lastLogin === getDateString(),
      calendar: calendar.map((day, index) => ({
        day: day.day,
        reward: day.reward,
        claimed: _progress.loginDay > day.day || (_progress.loginDay === day.day && _progress.lastLogin === getDateString()),
        current: _progress.loginDay === day.day && _progress.lastLogin !== getDateString()
      }))
    };
  }

  // ---------- Reset Progress (Dev Tool) ----------
  function resetProgress() {
    _progress = {
      lastReset: null,
      dailies: {},
      loginStreak: 0,
      lastLogin: null,
      loginDay: 1
    };
    save();
    console.log("[DailyMissions] Progress reset!");
  }

  // ---------- Public API ----------
  load();
  checkAndResetDaily();

  global.DailyMissions = {
    loadConfig,
    processLogin,
    incrementDaily,
    getDailyStatus,
    getLoginStatus,
    resetProgress
  };

})(window);
