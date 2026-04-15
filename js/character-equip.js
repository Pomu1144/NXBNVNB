// js/character-equip.js
// Character Ultimate Equipment System
// Manages equipping once-per-battle ultimate abilities to characters

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_character_equip_v1";

  let _ultimates = {};
  let _equipData = {};
  let _loaded = false;

  // ---------- Load Ultimates from JSON ----------
  async function loadUltimatesJSON() {
    try {
      const response = await fetch('data/equip-ultimates.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      // Convert array to object keyed by ID
      _ultimates = {};
      data.ultimates.forEach(ult => {
        _ultimates[ult.id] = ult;
      });

      _loaded = true;
      console.log(`[CharacterEquip] Loaded ${data.ultimates.length} equip ultimates from JSON`);
      return true;
    } catch (err) {
      console.error("[CharacterEquip] Failed to load ultimates JSON:", err);
      _loaded = false;
      return false;
    }
  }

  // ---------- Persistence ----------
  function loadEquipData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = JSON.parse(raw);
      _equipData = (data && typeof data === 'object') ? data : {};
    } catch {
      _equipData = {};
    }
  }

  function saveEquipData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_equipData));
    } catch (err) {
      console.error("[CharacterEquip] Failed to save:", err);
    }
  }

  // ---------- Equip API ----------
  function getEquippedUltimate(characterId) {
    return _equipData[characterId] || null;
  }

  function canCharacterEquipUltimate(characterId, ultimateId) {
    const ultimate = _ultimates[ultimateId];
    if (!ultimate) return false;

    // If no restrictions, anyone can equip
    if (!ultimate.allowedCharacters || ultimate.allowedCharacters.length === 0) {
      return true;
    }

    // Check if character is in allowed list
    return ultimate.allowedCharacters.includes(characterId);
  }

  function equipUltimate(characterId, ultimateId) {
    if (!_ultimates[ultimateId]) {
      console.error(`[CharacterEquip] Unknown ultimate: ${ultimateId}`);
      return false;
    }

    // Check character restrictions
    if (!canCharacterEquipUltimate(characterId, ultimateId)) {
      const ultimate = _ultimates[ultimateId];
      console.warn(`[CharacterEquip] ${characterId} cannot equip ${ultimate.name}`);
      if (window.ModalManager) {
        window.ModalManager.showError(`${characterId} cannot equip ${ultimate.name}.\n\nThis ultimate can only be equipped by specific characters.`);
      }
      return false;
    }

    _equipData[characterId] = ultimateId;
    saveEquipData();
    console.log(`[CharacterEquip] Equipped ${ultimateId} to ${characterId}`);
    return true;
  }

  function unequipUltimate(characterId) {
    delete _equipData[characterId];
    saveEquipData();
    console.log(`[CharacterEquip] Unequipped ultimate from ${characterId}`);
    return true;
  }

  function getUltimateData(ultimateId) {
    return _ultimates[ultimateId] || null;
  }

  function getAllUltimates() {
    return { ..._ultimates };
  }

  function isLoaded() {
    return _loaded;
  }

  // ---------- UI Update Functions ----------
  function updateEquipUI(characterId) {
    const equippedId = getEquippedUltimate(characterId);
    const equipSlot = document.getElementById('equip-slot');
    const equipInfo = document.getElementById('equip-info');

    if (!equipSlot || !equipInfo) return;

    if (equippedId) {
      const ultimate = getUltimateData(equippedId);
      if (ultimate) {
        // Hide empty slot, show equipped info
        equipSlot.style.display = 'none';
        equipInfo.style.display = 'block';

        // Update ultimate details
        document.getElementById('ultimate-icon').textContent = ultimate.icon;
        document.getElementById('ultimate-name').textContent = ultimate.name;
        document.getElementById('ultimate-description').textContent = ultimate.description;
        document.getElementById('ultimate-cost').textContent = `${ultimate.chakraCost} Chakra`;
      }
    } else {
      // Show empty slot, hide equipped info
      equipSlot.style.display = 'flex';
      equipInfo.style.display = 'none';
    }
  }

  function getAvailableUltimatesForCharacter(characterId) {
    return Object.values(_ultimates).filter(ult =>
      canCharacterEquipUltimate(characterId, ult.id)
    );
  }

  function openUltimateSelector(characterId) {
    // Only show ultimates this character can equip
    const ultimatesList = getAvailableUltimatesForCharacter(characterId);

    if (ultimatesList.length === 0) {
      if (window.ModalManager) {
        window.ModalManager.showError('No equippable ultimates available for this character.\n\nCheck back later for more ultimates!');
      }
      return;
    }

    // Format options for selection modal
    const options = ultimatesList.map(ult => ({
      id: ult.id,
      name: `${ult.icon} ${ult.name}`,
      description: `Cost: ${ult.chakraCost} Chakra | Power: ${ult.power}% | ${ult.description.substring(0, 60)}...`
    }));

    if (window.ModalManager) {
      window.ModalManager.showSelection(
        'Select Ultimate to Equip',
        options,
        (selected) => {
          if (equipUltimate(characterId, selected.id)) {
            updateEquipUI(characterId);
            const ult = getUltimateData(selected.id);
            window.ModalManager.showSuccess(`Equipped ${ult.icon} ${ult.name}!`);
          }
        },
        null
      );
    }
  }

  // ---------- Initialize Tab Listeners ----------
  function initEquipTab(characterId) {
    const btnSelect = document.getElementById('btn-select-ultimate');
    const btnUnequip = document.getElementById('btn-unequip-ultimate');
    const infoIcon = document.getElementById('equip-info-icon');

    if (btnSelect) {
      btnSelect.addEventListener('click', () => {
        openUltimateSelector(characterId);
      });
    }

    if (btnUnequip) {
      btnUnequip.addEventListener('click', () => {
        if (window.ModalManager) {
          window.ModalManager.showConfirm(
            'Are you sure you want to unequip this ultimate?',
            () => {
              unequipUltimate(characterId);
              updateEquipUI(characterId);
              window.ModalManager.showSuccess('Ultimate unequipped successfully');
            },
            null
          );
        }
      });
    }

    if (infoIcon) {
      infoIcon.addEventListener('click', () => {
        if (window.ModalManager) {
          window.ModalManager.showInfo(
            'Equipped Ultimate Information:\n\n' +
            '• Ultimates can only be used once per battle\n' +
            '• They have powerful effects that can turn the tide of battle\n' +
            '• Perform 3 basic attacks to charge your ultimate\n' +
            '• Using ninjutsu resets your basic attack counter\n' +
            '• Choose ultimates that complement your team strategy'
          );
        }
      });
    }

    // Initial UI update
    updateEquipUI(characterId);
  }

  // Initialize on load
  async function init() {
    await loadUltimatesJSON();
    loadEquipData();
  }

  // Auto-initialize
  init();

  // Public API
  global.CharacterEquip = {
    getEquippedUltimate,
    equipUltimate,
    unequipUltimate,
    getUltimateData,
    getAllUltimates,
    canCharacterEquipUltimate,
    getAvailableUltimatesForCharacter,
    updateEquipUI,
    openUltimateSelector,
    initEquipTab,
    isLoaded,
    loadUltimatesJSON
  };

})(window);
