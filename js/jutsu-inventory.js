// js/jutsu-inventory.js
// Ownership store for jutsu cards. Players do NOT start with every jutsu — they
// acquire them from the Jutsu gacha (see js/summon/jutsu-summon.js). The
// character equip screen only offers cards the player actually owns.
(function (global) {
  "use strict";

  const KEY = "blazing_jutsu_inventory_v1";

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw : []);
    } catch (e) {
      return new Set();
    }
  }

  let owned = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify([...owned])); } catch (e) {}
  }

  function has(id) { return owned.has(id); }
  function all() { return [...owned]; }
  function count() { return owned.size; }

  // Returns true if this was a brand-new card (not previously owned).
  function add(id) {
    if (!id) return false;
    const isNew = !owned.has(id);
    if (isNew) { owned.add(id); save(); }
    return isNew;
  }

  // Dev/testing helper: grant every id in a list.
  function grantAll(ids) {
    (ids || []).forEach(x => owned.add(typeof x === "string" ? x : x && x.id));
    save();
  }

  function reset() { owned = new Set(); save(); }

  global.JutsuInventory = { has, all, count, add, grantAll, reset, STORAGE_KEY: KEY };
})(window);
