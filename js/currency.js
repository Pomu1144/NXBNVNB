// js/currency.js - Simple Currency Management System

(function(global) {
  "use strict";

  const STORAGE_KEY = "blazing_currency_v1";

  // Currency keys
  const KEYS = {
    pearls: 'ninja_pearls',
    coins: 'coins',
    gems: 'gems'
  };

  // Default values
  const DEFAULTS = {
    [KEYS.pearls]: 0,
    [KEYS.coins]: 0,
    [KEYS.gems]: 0
  };

  let _data = { ...DEFAULTS };

  /**
   * Load currency from localStorage
   */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _data = { ...DEFAULTS, ...parsed };
      }
    } catch (err) {
      console.error('[Currency] Failed to load:', err);
      _data = { ...DEFAULTS };
    }
  }

  /**
   * Save currency to localStorage
   */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch (err) {
      console.error('[Currency] Failed to save:', err);
    }
  }

  /**
   * Get currency value
   * @param {string} key - Currency key
   * @param {number} defaultValue - Default if not found
   * @returns {number}
   */
  function get(key, defaultValue = 0) {
    return _data[key] !== undefined ? _data[key] : defaultValue;
  }

  /**
   * Set currency value
   * @param {string} key - Currency key
   * @param {number} value - New value
   */
  function set(key, value) {
    _data[key] = Math.max(0, Number(value) || 0);
    save();

    // Dispatch event for UI updates
    if (typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('currencyChanged', {
        detail: { key, value: _data[key] }
      }));
    }
  }

  /**
   * Add to currency
   * @param {string} key - Currency key
   * @param {number} amount - Amount to add
   */
  function add(key, amount) {
    const current = get(key, 0);
    set(key, current + amount);
  }

  /**
   * Subtract from currency
   * @param {string} key - Currency key
   * @param {number} amount - Amount to subtract
   * @returns {boolean} True if successful, false if insufficient
   */
  function subtract(key, amount) {
    const current = get(key, 0);
    if (current < amount) {
      return false;
    }
    set(key, current - amount);
    return true;
  }

  /**
   * Check if has enough currency
   * @param {string} key - Currency key
   * @param {number} amount - Amount required
   * @returns {boolean}
   */
  function has(key, amount) {
    return get(key, 0) >= amount;
  }

  /**
   * Get all currency data
   * @returns {Object}
   */
  function getAll() {
    return { ..._data };
  }

  /**
   * Reset all currency
   */
  function reset() {
    _data = { ...DEFAULTS };
    save();

    // Dispatch event
    if (typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('currencyChanged', {
        detail: { reset: true }
      }));
    }
  }

  // Initialize on load
  load();

  // Export Currency API
  const Currency = {
    keys: KEYS,
    get,
    set,
    add,
    subtract,
    has,
    getAll,
    reset,
    load,
    save
  };

  // Expose globally
  global.Currency = Currency;

  console.log('✅ Currency system loaded');

})(window);
