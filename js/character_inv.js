// js/character_inv.js
// Character Inventory System — stores character instances in localStorage
// Provides: allInstances, instancesOf, getByUid, addCopy, addExisting, removeOneByUid,
//           updateInstance, replaceInstance, _mutate, levelUpInstance, promoteTier,
//           and a helper: window.addCharacterById(charId)

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_inventory_v2";
  let _instances = []; // [{ uid, charId, level, tierCode? }, ...]

  // ---------- Persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = JSON.parse(raw);
      _instances = Array.isArray(arr) ? arr : [];
    } catch {
      _instances = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_instances));
    } catch (err) {
      console.error("[Inventory] Failed to save:", err);
    }
  }

  // ---------- Utils ----------
  let _uidCounter = 0; // Bug #7 fix: Add counter for guaranteed uniqueness
  function uid() {
    _uidCounter++;
    return Date.now().toString(36) +
           Math.random().toString(36).slice(2) +
           _uidCounter.toString(36);
  }

  function idxByUid(id) {
    return _instances.findIndex((x) => x.uid === id);
  }

  // ---------- Read ----------
  function allInstances() {
    return _instances.slice();
  }

  function instancesOf(charId) {
    return _instances.filter((x) => x.charId === charId);
  }

  function getByUid(id) {
    return _instances.find((x) => x.uid === id) || null;
  }

  // ---------- Write ----------
  function addCopy(charId, level = 1, tierCode = null) {
    const inst = {
      uid: uid(),
      charId,
      level: Number(level) || 1,
      tierCode: tierCode || null,
      dupeUnlocks: 0, // Track unlocked abilities (starts at 0)
      cost: 50, // Default cost (reduces with dupes)
      luck: 50, // Default luck (increases with dupes)
    };
    _instances.push(inst);
    save();
    return inst;
  }

  function addExisting(instance) {
    const inst = { uid: uid(), ...instance };
    _instances.push(inst);
    save();
    return inst;
  }

  function removeOneByUid(id) {
    const i = idxByUid(id);
    if (i >= 0) {
      _instances.splice(i, 1);
      save();
      return true;
    }
    return false;
  }

  function updateInstance(id, patch) {
    const i = idxByUid(id);
    if (i < 0) return null;
    _instances[i] = { ..._instances[i], ...patch };
    save();
    return _instances[i];
  }

  function replaceInstance(id, full) {
    const i = idxByUid(id);
    if (i < 0) return null;
    _instances[i] = { ...full, uid: id };
    save();
    return _instances[i];
  }

  function _mutate(id, fn) {
    const i = idxByUid(id);
    if (i < 0) return null;
    const next = fn(_instances[i]) || _instances[i];
    _instances[i] = { ...next, uid: id };
    save();
    return _instances[i];
  }

  // ---------- Level Up ----------
  function levelUpInstance(id, amount = 1, cap = Infinity) {
    const i = idxByUid(id);
    if (i < 0) return null;
    const before = Number(_instances[i].level) || 1;
    const next = Math.min(before + (Number(amount) || 0), Number(cap) || Infinity);
    _instances[i].level = Math.max(1, next);
    save();
    return _instances[i];
  }

  // ---------- Tier Promotion ----------
  function promoteTier(id, mode = "keep", character = null) {
    if (!global.Progression || !character) {
      return { ok: false, reason: "NO_CHARACTER_OR_PROGRESSION" };
    }
    const inst = getByUid(id);
    if (!inst) return { ok: false, reason: "NOT_FOUND" };
    const res = global.Progression.promoteTier(inst, character, mode);
    if (res.ok) save();
    return res;
  }

  // ---------- Dupe Feeding for Abilities ----------
  function feedDupe(mainUid, dupeUid, character) {
    if (!character || !character.abilities) {
      return { ok: false, reason: "NO_ABILITIES_TO_UNLOCK" };
    }

    const main = getByUid(mainUid);
    const dupe = getByUid(dupeUid);

    if (!main) return { ok: false, reason: "MAIN_NOT_FOUND" };
    if (!dupe) return { ok: false, reason: "DUPE_NOT_FOUND" };
    if (main.charId !== dupe.charId) {
      return { ok: false, reason: "CHARACTER_MISMATCH" };
    }

    // Initialize unlockedAbilities and dupeUnlocks if not present
    if (!Array.isArray(main.unlockedAbilities)) {
      main.unlockedAbilities = [];
    }
    if (typeof main.dupeUnlocks !== 'number') {
      main.dupeUnlocks = 0;
    }

    const maxAbilities = character.abilities.length;
    if (main.unlockedAbilities.length >= maxAbilities) {
      return { ok: false, reason: "ALL_ABILITIES_UNLOCKED" };
    }

    // Unlock next ability
    const nextAbilityIndex = main.unlockedAbilities.length;
    main.unlockedAbilities.push(nextAbilityIndex);
    main.dupeUnlocks = (main.dupeUnlocks || 0) + 1;

    // Bug #4 fix: Update main instance FIRST, then remove dupe SECOND (safer order)
    updateInstance(mainUid, {
      unlockedAbilities: main.unlockedAbilities,
      dupeUnlocks: main.dupeUnlocks
    });

    // Remove the dupe after main is safely updated
    if (!removeOneByUid(dupeUid)) {
      console.error("[Inventory] Warning: Failed to remove dupe UID:", dupeUid);
    }

    return {
      ok: true,
      unlockedAbility: character.abilities[nextAbilityIndex],
      totalUnlocked: main.unlockedAbilities.length,
      maxAbilities
    };
  }

  // ---------- Migration ----------
  function migrateIfNeeded() {
    let changed = false;
    const map = { "3": "3S", "4": "4S", "5": "5S", "6": "6S", "7": "7S", "8": "8S", "9": "9S", "10": "10SO" };
    _instances.forEach((inst) => {
      if (!inst.tierCode && typeof inst.stars !== "undefined") {
        const key = String(inst.stars);
        inst.tierCode = map[key] || null;
        changed = true;
      }
      // Migrate dupeUnlocks field for existing characters
      if (typeof inst.dupeUnlocks === "undefined") {
        inst.dupeUnlocks = 0;
        changed = true;
      }
    });
    if (changed) save();
  }

  load();
  migrateIfNeeded();

  // ---------- Cleanup Invalid Characters ----------
  async function cleanupInvalidCharacters() {
    try {
      const res = await fetch("data/characters.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`characters.json HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data.characters) ? data.characters : []);

      // Build set of valid character IDs
      const validIds = new Set();
      list.forEach(c => validIds.add(c.id));

      // Filter out characters with invalid IDs
      const before = _instances.length;
      _instances = _instances.filter(inst => validIds.has(inst.charId));
      const after = _instances.length;
      const removed = before - after;

      if (removed > 0) {
        save();
        console.log(`🧹 Cleaned up ${removed} invalid character(s)`);

        // Refresh grid if available
        if (typeof window.refreshCharacterGrid === "function") {
          window.refreshCharacterGrid();
        }

        return { success: true, removed, message: `Removed ${removed} invalid character(s)` };
      } else {
        return { success: true, removed: 0, message: 'No invalid characters found' };
      }
    } catch (error) {
      console.error('Failed to cleanup characters:', error);
      return { success: false, message: 'Failed to cleanup: ' + error.message };
    }
  }

  global.InventoryChar = {
    allInstances,
    instancesOf,
    getByUid,
    addCopy,
    addExisting,
    removeOneByUid,
    updateInstance,
    replaceInstance,
    _mutate,
    levelUpInstance,
    promoteTier,
    feedDupe,
    cleanupInvalidCharacters,
  };
})(window);

// ---------- Add Character by ID (main menu helper) ----------
window.addCharacterById = async function (charId) {
  try {
    const res = await fetch("data/characters.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`characters.json HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (Array.isArray(data.characters) ? data.characters : []);
    const found = list.find((c) => c.id === charId);

    if (!found) {
      if (window.ModalManager) { window.ModalManager.showError(` Character ID '${charId}' not found in characters.json`); };
      return;
    }

    if (typeof window.InventoryChar === "undefined") {
      if (window.ModalManager) { window.ModalManager.showInfo(" Inventory system not initialized yet."); };
      return;
    }

    // Prevent duplicates unless intentionally adding more copies
    const existing = window.InventoryChar.instancesOf(charId);
    if (existing.length > 0) {
      if (window.ModalManager) {
        window.ModalManager.showConfirm(
          `${found.name} already exists. Add another copy?`,
          () => {
            const newInst = window.InventoryChar.addCopy(found.id, 1);
            localStorage.setItem("blazing_inventory_v2", JSON.stringify(window.InventoryChar.allInstances()));

            // Refresh if on characters page
            if (typeof window.refreshCharacterGrid === "function") {
              window.refreshCharacterGrid();
            }

            window.ModalManager.showSuccess(`Added ${found.name}${found.version ? ` (${found.version})` : ""} to your roster!`);
            console.log("[AddCharacterById] Added:", newInst, found);
          },
          null
        );
        return;
      }
    }

    const newInst = window.InventoryChar.addCopy(found.id, 1);
    localStorage.setItem("blazing_inventory_v2", JSON.stringify(window.InventoryChar.allInstances()));

    // Refresh if on characters page
    if (typeof window.refreshCharacterGrid === "function") {
      window.refreshCharacterGrid();
    }

    if (window.ModalManager) { window.ModalManager.showSuccess(`Added ${found.name}${found.version ? ` (${found.version})` : ""} to your roster!`); }
    console.log("[AddCharacterById] Added:", newInst, found);
  } catch (err) {
    console.error("[AddCharacterById] Failed:", err);
    if (window.ModalManager) { window.ModalManager.showInfo(" Failed to add character — see console for details."); };
  }
};
