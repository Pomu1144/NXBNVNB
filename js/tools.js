// Character Tools System
(function() {
  'use strict';

  let selectedCharacter = null;
  let characterEquipment = {}; // Will store equipment per character
  let equipmentData = {}; // Will be loaded from JSON
  let charactersData = []; // Base character data
  let charactersById = {}; // Character lookup by ID

  // Load characters.json data
  async function loadCharactersData() {
    try {
      const cacheBuster = `?v=${Date.now()}`;
      const res = await fetch(`data/characters.json${cacheBuster}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      charactersData = Array.isArray(json) ? json : (Array.isArray(json.characters) ? json.characters : []);
      charactersById = charactersData.reduce((acc, c) => (acc[c.id] = c, acc), {});

      // Set up global accessor
      window.CharacterInventory = {
        getCharacterById: (id) => charactersById[id] || null,
        getAllCharacters: () => charactersData.slice()
      };

      console.log('[Tools] Loaded', charactersData.length, 'base characters');
    } catch (err) {
      console.error('[Tools] Failed to load characters.json:', err);
    }
  }

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Tools] Initializing Tools system...');

    // Load base characters data
    await loadCharactersData();

    // Load saved equipment data
    loadEquipmentData();

    // Setup event listeners
    setupEventListeners();

    console.log('[Tools] Tools system initialized');
  });

  function setupEventListeners() {
    // Character selection button
    const btnSelectCharacter = document.getElementById('btn-select-character');
    if (btnSelectCharacter) {
      btnSelectCharacter.addEventListener('click', openCharacterSelector);
    }

    // Modal cancel button
    const modalCancel = document.getElementById('modal-cancel');
    if (modalCancel) {
      modalCancel.addEventListener('click', closeCharacterSelector);
    }

    // Close modal on background click
    const modal = document.getElementById('character-selector-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeCharacterSelector();
        }
      });
    }

    // Search input
    const searchInput = document.getElementById('character-search');
    if (searchInput) {
      searchInput.addEventListener('input', filterCharacters);
    }
  }

  function openCharacterSelector() {
    console.log('[Tools] Opening character selector...');

    const modal = document.getElementById('character-selector-modal');
    const grid = document.getElementById('characters-grid');

    if (!modal || !grid) {
      console.error('[Tools] Modal or grid not found');
      return;
    }

    // Load characters from inventory
    if (typeof window.InventoryChar === 'undefined') {
      console.error('[Tools] InventoryChar not loaded');
      alert('Character system not loaded. Please reload the page.');
      return;
    }

    const characters = window.InventoryChar.allInstances();
    console.log(`[Tools] Loaded ${characters.length} characters`);

    // Clear grid
    grid.innerHTML = '';

    // Populate grid
    characters.forEach(char => {
      const card = createCharacterCard(char);
      grid.appendChild(card);
    });

    // Show modal
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeCharacterSelector() {
    const modal = document.getElementById('character-selector-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function createCharacterCard(inst) {
    const card = document.createElement('div');
    card.className = 'character-card';

    // Get base character data
    const baseChar = window.CharacterInventory ? window.CharacterInventory.getCharacterById(inst.charId) : null;

    const img = document.createElement('img');
    if (baseChar) {
      img.src = baseChar.card || baseChar.portrait || baseChar.icon || 'assets/placeholder.png';
      img.alt = baseChar.name;
    } else {
      img.src = 'assets/placeholder.png';
      img.alt = 'Unknown';
    }
    img.onerror = () => { img.src = 'assets/placeholder.png'; };

    const info = document.createElement('div');
    info.className = 'character-card-info';

    const name = document.createElement('div');
    name.className = 'character-card-name';
    name.textContent = baseChar ? (baseChar.name || 'Unknown') : 'Unknown';

    info.appendChild(name);
    card.appendChild(img);
    card.appendChild(info);

    card.addEventListener('click', () => {
      selectCharacter(inst, baseChar);
      closeCharacterSelector();
    });

    return card;
  }

  function selectCharacter(inst, baseChar) {
    if (!baseChar) {
      console.error('[Tools] Base character data not found');
      return;
    }

    console.log('[Tools] Selected character:', baseChar.name);

    selectedCharacter = { inst, baseChar };

    // Update UI
    updateCharacterDisplay();

    // Show equipment container and stats
    const equipmentContainer = document.getElementById('equipment-container');
    const statsDisplay = document.getElementById('stats-display');
    const selectedInfo = document.getElementById('selected-character-info');

    if (equipmentContainer) equipmentContainer.style.display = 'grid';
    if (statsDisplay) statsDisplay.style.display = 'grid';
    if (selectedInfo) {
      selectedInfo.style.display = 'block';
      const nameEl = document.getElementById('character-name');
      const versionEl = document.getElementById('character-version');
      if (nameEl) nameEl.textContent = baseChar.name || 'Unknown';
      if (versionEl) versionEl.textContent = baseChar.version || '';
    }

    // Calculate and display power
    calculatePower();
  }

  function updateCharacterDisplay() {
    if (!selectedCharacter) return;

    const { baseChar } = selectedCharacter;
    const characterImg = document.getElementById('character-full-image');
    if (characterImg) {
      // Use full character PNG
      characterImg.src = baseChar.full || baseChar.card || baseChar.portrait || baseChar.icon || 'assets/placeholder.png';
      characterImg.alt = baseChar.name;
      characterImg.onerror = () => {
        characterImg.src = baseChar.card || baseChar.portrait || baseChar.icon || 'assets/placeholder.png';
      };
    }
  }

  function calculatePower() {
    if (!selectedCharacter) return;

    const { inst, baseChar } = selectedCharacter;

    // Try to load synced power data from character.html first
    const savedPowerData = localStorage.getItem(`character_power_${inst.uid}`);

    let health, attack, speed, totalPower;

    if (savedPowerData) {
      // Use synced data from character.html
      try {
        const powerData = JSON.parse(savedPowerData);
        health = powerData.health || 0;
        attack = powerData.attack || 0;
        speed = powerData.speed || 0;
        totalPower = powerData.power || (health + attack + speed);
        console.log('[Tools] Using synced power data from character.html');
      } catch (e) {
        console.error('[Tools] Failed to parse saved power data:', e);
        // Fall back to base stats
        const stats = baseChar.statsBase || {};
        health = stats.hp || 0;
        attack = stats.atk || 0;
        speed = stats.speed || 0;
        totalPower = health + attack + speed;
      }
    } else {
      // Use base stats if no synced data exists
      const stats = baseChar.statsBase || {};
      health = stats.hp || 0;
      attack = stats.atk || 0;
      speed = stats.speed || 0;
      totalPower = health + attack + speed;
      console.log('[Tools] No synced data found, using base stats');
    }

    // TODO: Add equipment bonuses when equipment system is implemented
    let equipmentBonus = 0;
    totalPower += equipmentBonus;

    // Update display
    const powerEl = document.getElementById('power-value');
    const healthEl = document.getElementById('stat-health');
    const attackEl = document.getElementById('stat-attack');
    const speedEl = document.getElementById('stat-speed');

    if (powerEl) powerEl.textContent = totalPower.toLocaleString();
    if (healthEl) healthEl.textContent = health.toLocaleString();
    if (attackEl) attackEl.textContent = attack.toLocaleString();
    if (speedEl) speedEl.textContent = speed.toLocaleString();

    console.log(`[Tools] Power displayed: ${totalPower} (H:${health} A:${attack} S:${speed})`);

    // Save to sync with character.html
    savePowerData();
  }

  function savePowerData() {
    if (!selectedCharacter) return;

    const { inst, baseChar } = selectedCharacter;
    const stats = baseChar.statsBase || {};

    const powerEl = document.getElementById('power-value');
    const powerValue = powerEl ? parseInt(powerEl.textContent.replace(/,/g, '')) : 0;

    const powerData = {
      uid: inst.uid,
      power: powerValue,
      health: stats.hp || 0,
      attack: stats.atk || 0,
      speed: stats.speed || 0,
      lastUpdated: Date.now()
    };

    localStorage.setItem(`character_power_${inst.uid}`, JSON.stringify(powerData));
    console.log('[Tools] Power data saved for character:', inst.uid);
  }

  function loadEquipmentData() {
    // Load equipment from localStorage
    const saved = localStorage.getItem('character_equipment');
    if (saved) {
      try {
        characterEquipment = JSON.parse(saved);
        console.log('[Tools] Loaded equipment data');
      } catch (e) {
        console.error('[Tools] Failed to load equipment data:', e);
      }
    }

    // TODO: Load equipment definitions from JSON file
    // For now, equipment slots are empty and ready for future implementation
  }

  function filterCharacters() {
    const searchInput = document.getElementById('character-search');
    const searchTerm = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll('.character-card');

    cards.forEach(card => {
      const name = card.querySelector('.character-card-name').textContent.toLowerCase();
      if (name.includes(searchTerm)) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Export functions for external use
  window.CharacterTools = {
    getSelectedCharacter: () => selectedCharacter,
    calculatePower: calculatePower,
    getPowerData: (uid) => {
      const saved = localStorage.getItem(`character_power_${uid}`);
      return saved ? JSON.parse(saved) : null;
    }
  };

  console.log('[Tools] Tools module loaded');
})();
