// js/awakening.js
// Awakening System - handles tier promotion with material requirements
// Load AFTER progression.js and resources.js

(function (global) {
  "use strict";

  let _awakeningRequirements = null;
  let _awakeningTransforms = null;
  let _requirementsDoc = null;   // whole awakening-requirements.json
  let _perUnit = null;           // data/awakening-materials-per-unit.json .units

  const TIER_ORDER = ["1S","2S","3S","4S","5S","6S","6SB","7S","7SL","8S","8SM","9S","9ST","10SO"];
  const ELEMENTS = ["heart", "skill", "body", "bravery", "wisdom"];
  // Per-unit wiki materials and element defaults cover awakenings up to
  // Blazing Awakening (…→6SB). 6SB→7S and above keep the generic tier table.
  const LAST_WIKI_TARGET = "6SB";

  // Load awakening requirements from JSON
  async function loadRequirements() {
    if (_awakeningRequirements) return _awakeningRequirements;

    try {
      const res = await fetch("data/awakening-requirements.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _requirementsDoc = data || {};
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

  // Per-unit awakening materials scraped from the wiki unit pages
  async function loadPerUnit() {
    if (_perUnit) return _perUnit;
    try {
      const res = await fetch("data/awakening-materials-per-unit.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _perUnit = (data && data.units) || {};
    } catch (err) {
      console.warn("[Awakening] Per-unit materials unavailable:", err);
      _perUnit = {};
    }
    return _perUnit;
  }

  // Get the generic tier-table requirements for a tier (materials may still
  // contain "{el}" placeholders; use getRequirementsFor for a real unit)
  async function getRequirements(tierCode) {
    const reqs = await loadRequirements();
    return reqs[tierCode] || null;
  }

  function elementOf(character) {
    const el = String(character?.element || "").trim().toLowerCase();
    return ELEMENTS.includes(el) ? el : null;
  }

  // "{el}" → the unit's element; element-less units use noElementSubstitutes
  function resolveElementMaterials(materials, element) {
    const subs = (_requirementsDoc && _requirementsDoc.noElementSubstitutes) || {};
    const out = {};
    for (const [id, n] of Object.entries(materials || {})) {
      let key = id;
      if (id.includes("{el}")) {
        if (element) key = id.replace("{el}", element);
        else key = subs[id.split("_")[0]] || id.replace("{el}", "heart");
      }
      out[key] = (out[key] || 0) + Number(n || 0);
    }
    return out;
  }

  function currentTierOf(inst, character) {
    const bounds = global.Progression?.getTierBounds(character);
    return inst?.tierCode || bounds?.minCode || "3S";
  }

  /**
   * Requirements for this unit's next awakening:
   *   { tier, nextTier, materials:{id:n, ryo:n}, source, blazing, wikiCard }
   * source: "wiki"    per-unit materials from the unit's wiki page
   *         "element" element-matched tier default (no wiki data)
   *         "tier"    generic tier table (6SB→7S and above, unchanged)
   */
  async function getRequirementsFor(inst, character) {
    const [reqs, perUnit] = await Promise.all([loadRequirements(), loadPerUnit()]);
    const tier = currentTierOf(inst, character);
    const base = reqs[tier];
    if (!base) return null;
    const nextTier = base.nextTier;
    const withinWiki = TIER_ORDER.indexOf(nextTier) !== -1 &&
      TIER_ORDER.indexOf(nextTier) <= TIER_ORDER.indexOf(LAST_WIKI_TARGET);
    const unitId = inst?.charId || character?.id;
    const ryo = Number(base.materials?.ryo) || 0;

    if (withinWiki) {
      const wiki = perUnit[unitId]?.[tier];
      if (wiki && wiki.materials) {
        const materials = { ...wiki.materials };
        if (ryo) materials.ryo = ryo;
        return { tier, nextTier, materials, source: "wiki", blazing: nextTier === "6SB", wikiCard: wiki.wikiCard || null };
      }
      return {
        tier, nextTier,
        materials: resolveElementMaterials(base.materials, elementOf(character)),
        source: "element", blazing: nextTier === "6SB", wikiCard: null
      };
    }
    return { tier, nextTier, materials: { ...(base.materials || {}) }, source: "tier", blazing: false, wikiCard: null };
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

    return hasAllMaterials(inst, character);
  }

  // Materials check only (no level/tier check): drives the Awaken button
  async function hasAllMaterials(inst, character) {
    if (!inst || !character || !global.Resources) return false;
    const reqs = await getRequirementsFor(inst, character);
    if (!reqs || !reqs.materials) return true; // No requirements = free awakening
    return global.Resources.canAfford(reqs.materials);
  }

  // Get missing materials for awakening
  async function getMissingMaterials(inst, character) {
    if (!inst || !character) return {};

    const reqs = await getRequirementsFor(inst, character);

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
    const reqs = await getRequirementsFor(inst, character);

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
    const currentTier = currentTierOf(inst, character);
    const reqs = await getRequirementsFor(inst, character);

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
      transformToId: transformToId || null,
      source: reqs.source,
      blazing: reqs.blazing
    };
  }

  // Public API
  global.Awakening = {
    loadRequirements,
    loadPerUnit,
    getRequirements,
    getRequirementsFor,
    hasAllMaterials,
    loadTransforms,
    getTransformForTier,
    canAwaken,
    canAffordAwaken,
    getMissingMaterials,
    performAwaken,
    getAwakeningPreview
  };

})(window);
