// js/awakening.js
// Awakening System - handles tier promotion with material requirements
// Load AFTER progression.js and resources.js

(function (global) {
  "use strict";

  let _awakeningRequirements = null;
  let _awakeningTransforms = null;

  // Load awakening requirements from JSON
  async function loadRequirements() {
    if (_awakeningRequirements) return _awakeningRequirements;

    try {
      const res = await fetch("data/awakening-requirements.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _awakeningRequirements = data.tierRequirements || {};
      return _awakeningRequirements;
    } catch (err) {
      console.error("[Awakening] Failed to load requirements:", err);
      _awakeningRequirements = {};
      return {};
    }
  }

  // Load awakening transforms from JSON
  async function loadTransforms() {
    if (_awakeningTransforms) {
      console.log("[Awakening Debug] Using cached transforms");
      return _awakeningTransforms;
    }

    try {
      console.log("[Awakening Debug] Loading transforms from JSON...");
      const res = await fetch("data/awakening-transforms.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Convert array to lookup map: { characterId: { tierCode: transformToId } }
      if (Array.isArray(data)) {
        _awakeningTransforms = {};
        data.forEach(transform => {
          if (!transform.fromId || !transform.toId || !transform.tier) return;

          if (!_awakeningTransforms[transform.fromId]) {
            _awakeningTransforms[transform.fromId] = {};
          }
          _awakeningTransforms[transform.fromId][transform.tier] = transform.toId;
        });
        console.log(`[Awakening Debug] Loaded ${data.length} transform mappings`);
        console.log("[Awakening Debug] Sample: naruto_659 ->", _awakeningTransforms["naruto_659"]);
      } else {
        _awakeningTransforms = data.transforms || {};
      }

      return _awakeningTransforms;
    } catch (err) {
      console.error("[Awakening] Failed to load transforms:", err);
      _awakeningTransforms = {};
      return {};
    }
  }

  // Check if character should transform to a different ID at this tier
  async function getTransformForTier(characterId, tierCode) {
    const transforms = await loadTransforms();
    return transforms[characterId]?.[tierCode] || null;
  }

  // Get awakening requirements for a tier
  async function getRequirements(tierCode) {
    const reqs = await loadRequirements();
    return reqs[tierCode] || null;
  }

  // Check if character can awaken (level + tier requirements)
  function canAwaken(inst, character) {
    if (!inst || !character) return false;
    if (!global.Progression) return false;

    // Use Progression.canAwaken (checks level and tier)
    return global.Progression.canAwaken(inst, character);
  }

  // Check if player has materials to awaken
  async function canAffordAwaken(inst, character) {
    if (!canAwaken(inst, character)) return false;
    if (!global.Resources) return false;

    // Bug #11 fix: Validate getTierBounds result before accessing minCode
    const bounds = global.Progression?.getTierBounds(character);
    const tier = inst.tierCode || bounds?.minCode || "3S";
    const reqs = await getRequirements(tier);

    if (!reqs || !reqs.materials) return true; // No requirements = free awakening

    return global.Resources.canAfford(reqs.materials);
  }

  // Get missing materials for awakening
  async function getMissingMaterials(inst, character) {
    if (!inst || !character) return {};

    // Bug #11 fix: Validate getTierBounds result before accessing minCode
    const bounds = global.Progression?.getTierBounds(character);
    const tier = inst.tierCode || bounds?.minCode || "3S";
    const reqs = await getRequirements(tier);

    if (!reqs || !reqs.materials) return {};

    const missing = {};
    for (const [mat, required] of Object.entries(reqs.materials)) {
      const owned = global.Resources ? global.Resources.get(mat) : 0;
      if (owned < required) {
        missing[mat] = {
          required,
          owned,
          missing: required - owned
        };
      }
    }

    return missing;
  }

  // Perform awakening (with material cost)
  async function performAwaken(inst, character, mode = "reset") {
    if (!inst || !character) {
      return { ok: false, reason: "INVALID_INSTANCE_OR_CHARACTER" };
    }

    if (!canAwaken(inst, character)) {
      return { ok: false, reason: "CANNOT_AWAKEN" };
    }

    const oldCharacterId = inst.charId || character.id;
    const tier = inst.tierCode || global.Progression.getTierBounds(character).minCode;
    const reqs = await getRequirements(tier);

    // Check and spend materials if requirements exist
    if (reqs && reqs.materials && global.Resources) {
      const spendResult = global.Resources.spend(reqs.materials);
      if (!spendResult.ok) {
        return spendResult;
      }
    }

    // Perform tier promotion via Progression system
    if (!global.Progression) {
      return { ok: false, reason: "PROGRESSION_NOT_INITIALIZED" };
    }

    const result = global.Progression.promoteTier(inst, character, mode);

    if (!result.ok) {
      return result;
    }

    // Check if character should transform to a different ID at this tier
    const newTier = result.tier;
    console.log(`[Awakening Debug] Checking transform for ${oldCharacterId} at tier ${newTier}`);
    console.log(`[Awakening Debug] Available transforms for ${oldCharacterId}:`, await loadTransforms().then(t => t[oldCharacterId]));

    const transformToId = await getTransformForTier(oldCharacterId, newTier);
    console.log(`[Awakening Debug] Transform result:`, transformToId);

    if (transformToId) {
      console.log(`✨ [Awakening Transform] ${oldCharacterId} → ${transformToId} at tier ${newTier}`);

      // Update the instance character ID (use 'charId' not 'characterId')
      inst.charId = transformToId;

      // Set transformation flags in result
      result.transformed = true;
      result.oldCharacterId = oldCharacterId;
      result.newCharacterId = transformToId;

      // Save inventory if available
      if (global.InventoryChar && typeof global.InventoryChar.save === 'function') {
        global.InventoryChar.save();
        console.log(`✅ [Awakening Transform] Saved inventory with new characterId: ${transformToId}`);
      } else {
        console.warn(`⚠️ [Awakening Transform] InventoryChar.save not available`);
      }
    } else {
      console.log(`[Awakening Debug] No transformation found for ${oldCharacterId} at tier ${newTier}`);
    }

    return result;
  }

  // Get awakening preview (what will happen)
  async function getAwakeningPreview(inst, character) {
    if (!inst || !character || !global.Progression) {
      return null;
    }

    // Bug #11 & #12 fix: Validate getTierBounds and computeEffectiveStatsLoreTier results
    const bounds = global.Progression?.getTierBounds(character);
    const currentTier = inst.tierCode || bounds?.minCode || "3S";
    const reqs = await getRequirements(currentTier);

    if (!reqs) return null;

    const nextTier = reqs.nextTier;
    const materials = reqs.materials || {};
    const canDoIt = canAwaken(inst, character);
    const canPay = await canAffordAwaken(inst, character);

    // Check if this awakening will transform the character
    const currentCharacterId = inst.charId || character.id;
    const transformToId = await getTransformForTier(currentCharacterId, nextTier);
    const willTransform = !!transformToId;

    // Get the character data we'll be using for stats (current or transformed)
    let previewCharacter = character;
    if (willTransform && global.Characters) {
      const transformedChar = await global.Characters.getCharacterById(transformToId);
      if (transformedChar) {
        previewCharacter = transformedChar;
      }
    }

    // Get stats preview
    const currentStats = global.Progression.computeEffectiveStatsLoreTier(
      character,
      inst.level,
      currentTier
    );

    const nextCap = global.Progression.levelCapForCode(nextTier);
    const nextStats = global.Progression.computeEffectiveStatsLoreTier(
      previewCharacter,
      1, // After awakening, level resets to 1
      nextTier
    );

    // Bug #12 fix: Validate stats computation results before accessing properties
    if (!currentStats || !nextStats) {
      return null;
    }

    return {
      currentTier,
      nextTier,
      materials,
      canAwaken: canDoIt,
      canAfford: canPay,
      currentStats: currentStats.stats || {},
      nextStats: nextStats.stats || {},
      currentCap: currentStats.cap || 100,
      nextCap: nextCap || 100,
      willTransform,
      transformToId: transformToId || null
    };
  }

  // Public API
  global.Awakening = {
    loadRequirements,
    getRequirements,
    loadTransforms,
    getTransformForTier,
    canAwaken,
    canAffordAwaken,
    getMissingMaterials,
    performAwaken,
    getAwakeningPreview
  };

})(window);
