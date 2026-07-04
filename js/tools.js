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
      const res = await fetch('data/characters.json');
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

    // Render the owned-character roster into the left rail
    renderRoster();

    console.log('[Tools] Tools system initialized');
  });

  // Map a tier code to a star count (mirrors team_manager / characters).
  const STAR_BY_TIER = { "1S":1,"2S":2,"3S":3,"4S":4,"5S":5,"6S":6,"6SB":6,"7S":7,"7SL":7,"8S":8,"8SM":8,"9S":9,"9ST":9,"10SO":10 };
  function starCountFor(inst, baseChar) {
    const tier = (inst && inst.tierCode) || (baseChar && (baseChar.starMaxCode || baseChar.starMinCode)) || `${(baseChar && baseChar.rarity) || 5}S`;
    return STAR_BY_TIER[tier] || (baseChar && baseChar.rarity) || 5;
  }

  function setupEventListeners() {
    // Roster search (left rail)
    const searchInput = document.getElementById('tools-search');
    if (searchInput) searchInput.addEventListener('input', filterCharacters);
  }

  // Render the owned-character roster into the left rail.
  function renderRoster() {
    const list = document.getElementById('tools-roster-list');
    if (!list) return;

    if (typeof window.InventoryChar === 'undefined') {
      list.innerHTML = '<div class="tools-roster-empty">Inventory not loaded.</div>';
      return;
    }

    const characters = window.InventoryChar.allInstances() || [];
    if (characters.length === 0) {
      list.innerHTML = '<div class="tools-roster-empty">No characters owned yet.<br>Summon some first!</div>';
      return;
    }

    // Highest rarity first so strong units are easy to find.
    const sorted = characters.slice().sort((a, b) => {
      const ca = getBase(a.charId), cb = getBase(b.charId);
      return (starCountFor(b, cb)) - (starCountFor(a, ca));
    });

    list.innerHTML = '';
    sorted.forEach(inst => {
      const baseChar = getBase(inst.charId);
      if (!baseChar) return;
      const item = document.createElement('button');
      item.className = 'tools-roster-item';
      item.dataset.uid = inst.uid;
      item.dataset.name = (baseChar.name || '').toLowerCase();
      const portrait = baseChar.portrait || baseChar.card || baseChar.icon || 'assets/placeholder.png';
      item.innerHTML = `
        <img src="${portrait}" alt="${baseChar.name || ''}" onerror="this.src='assets/placeholder.png'">
        <div class="tools-roster-meta">
          <div class="tools-roster-name">${baseChar.name || 'Unknown'}</div>
          <div class="tools-roster-stars">${'★'.repeat(Math.min(10, starCountFor(inst, baseChar)))}</div>
        </div>`;
      item.addEventListener('click', () => {
        list.querySelectorAll('.tools-roster-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        selectCharacter(inst, baseChar);
      });
      list.appendChild(item);
    });

    // Auto-select the first (strongest) unit.
    const first = list.querySelector('.tools-roster-item');
    if (first) first.click();
  }

  function getBase(charId) {
    return window.CharacterInventory ? window.CharacterInventory.getCharacterById(charId) : null;
  }

  // SS→D letter grade from a unit's power rank (matches team/character screens).
  function gradeOf(baseChar) {
    const p = Number(baseChar && baseChar.powerRank) || 0;
    if (p >= 10000) return 'SS';
    if (p >= 8000)  return 'S';
    if (p >= 6000)  return 'A';
    if (p >= 4000)  return 'B';
    if (p >= 2000)  return 'C';
    return 'D';
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

    // Stars on top of the center stage
    const starRow = document.getElementById('tools-star-row');
    if (starRow) {
      const n = Math.min(10, starCountFor(inst, baseChar));
      starRow.innerHTML = new Array(n).fill('<span class="tools-star">★</span>').join('');
    }

    // Power + letter grade badge on top of the art
    const badge = document.getElementById('tools-power-badge');
    const gradeEl = document.getElementById('tools-grade');
    if (gradeEl) {
      const g = gradeOf(baseChar);
      gradeEl.textContent = g;
      gradeEl.dataset.grade = g;
    }
    if (badge) badge.style.display = 'flex';

    // Show equipment container and stats
    const equipmentContainer = document.getElementById('equipment-container');
    const statsDisplay = document.getElementById('stats-display');
    const selectedInfo = document.getElementById('selected-character-info');
    const emptyHint = document.getElementById('tools-empty-hint');

    if (equipmentContainer) equipmentContainer.style.display = 'grid';
    if (statsDisplay) statsDisplay.style.display = 'grid';
    if (emptyHint) emptyHint.style.display = 'none';
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
      // Use full character PNG (some full arts ship as .gif — prefer the PNG)
      const full = (baseChar.full || baseChar.card || baseChar.portrait || baseChar.icon || 'assets/placeholder.png').replace(/\.gif$/i, '.png');
      characterImg.src = full;
      characterImg.alt = baseChar.name;
      characterImg.style.display = 'block';
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
    const searchInput = document.getElementById('tools-search');
    const term = (searchInput ? searchInput.value : '').toLowerCase();
    document.querySelectorAll('.tools-roster-item').forEach(item => {
      item.style.display = (!term || (item.dataset.name || '').includes(term)) ? '' : 'none';
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
