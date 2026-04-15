// js/team_manager.js
// Team management system for Blazing-style team setup
// Requires: character_inv.js, progression.js

(() => {
  "use strict";

  /* =========================
   * Settings
   * ========================= */
  const STORAGE_KEY = "blazing_teams_v1";
  const MAX_COST = 408;
  const DISPLAY_MODE = "pvp"; // "pvp" | "pve" – which stats to show on cards & totals

  let currentTeam = 1;
  let activeSlot = null;
  let teams = { 1: {}, 2: {}, 3: {} };
  let BASE = [];          // full character list (array)
  let BYID = {};          // id -> character

  /* ---------- DOM ---------- */
  const teamTabs = document.querySelectorAll(".team-tab");
  const slots = document.querySelectorAll(".team-slot");
  const charGrid = document.getElementById("team-char-grid");
  const charFilter = document.getElementById("char-filter");
  const btnSave = document.getElementById("btn-save-team");
  const btnClear = document.getElementById("btn-clear-team");

  const totalCostEl = document.getElementById("total-cost");
  const totalHealthEl = document.getElementById("total-health");

  // Commander DOM elements
  const commanderBuffDisplay = document.getElementById("commander-buff-display");
  const commanderUltimateImg = document.getElementById("commander-ultimate-img");
  const commanderUltimateInfo = document.getElementById("commander-ultimate-info");

  const previewModal = document.getElementById("char-preview-modal");
  const previewClose = document.getElementById("preview-close");
  const previewImg = document.getElementById("preview-img");
  const previewName = document.getElementById("preview-name");
  const previewVersion = document.getElementById("preview-version");
  const previewStars = document.getElementById("preview-stars");
  const previewStats = document.getElementById("preview-stats");
  const btnAssign = document.getElementById("btn-assign-char");

  // Bug #8 fix: Validate critical DOM elements exist
  if (!charGrid || !totalCostEl || !totalHealthEl) {
    console.error("[Team Manager] Missing critical DOM elements!");
    return;
  }

  let selectedChar = null;

  /* =========================
   * Utilities
   * ========================= */
  const safeStr = (v, d = "") => (typeof v === "string" && v.trim() ? v.trim() : d);
  const safeNum = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

  const starsFromTier = (code) => {
    const map = { "3S":3,"4S":4,"5S":5,"6S":6,"6SB":6,"7S":7,"7SL":7,"8S":8,"8SM":8,"9S":9,"9ST":9,"10SO":10 };
    return map[code] ?? 0;
  };

  const renderStars = (n) => {
    const count = Math.max(0, Math.min(10, n));
    return new Array(count).fill(0).map(() => "<span class='star'>★</span>").join("");
  };

  function resolveTierArt(c, tier) {
    const fbPortrait = c?.portrait || "assets/characters/common/silhouette.png";
    const fbFull = c?.full || fbPortrait;
    const map = c?.artByTier || {};
    if (map[tier]) return { portrait: map[tier].portrait || fbPortrait, full: map[tier].full || fbFull };
    return { portrait: fbPortrait, full: fbFull };
  }

  const minTier = (c) => c.starMinCode || `${c.rarity || 3}S`;

  // ----- helpers to read your schema and build the stat rail -----
  const pick = (obj, pathArr) => pathArr.reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);

  function pickStats(char, mode = "pvp") {
    if (mode === "pvp") {
      return (
        pick(char, ["statsPvPFull"]) ||
        pick(char, ["statsPvPMax"]) ||
        pick(char, ["statsPvP"]) ||
        pick(char, ["statsMax"]) ||
        pick(char, ["statsBase"]) ||
        { hp: 0, atk: 0, speed: 0 }
      );
    }
    // pve/default
    return (
      pick(char, ["statsMax"]) ||
      pick(char, ["statsBase"]) ||
      pick(char, ["statsPvPFull"]) ||
      { hp: 0, atk: 0, speed: 0 }
    );
  }

  function pickCost(char) {
    const c = char?.cost;
    if (!c) return 60; // sensible fallback
    return typeof c === "number" ? c : (c.max ?? c.base ?? 60);
  }

  function pickLuck(char) {
    const l = char?.luck;
    if (!l) return 0;
    return typeof l === "number" ? l : (l.base ?? 0);
  }

  const pickRange = (char) => char?.range || "Mid";
  function pickImg(char, tierCode) {
    if (char?.portrait) return char.portrait;
    if (char?.artByTier?.[tierCode]?.portrait) return char.artByTier[tierCode].portrait;
    const firstTier = char?.artByTier ? Object.keys(char.artByTier)[0] : null;
    if (firstTier) return char.artByTier[firstTier].portrait;
    return "assets/characters/_common/silhouette.png";
  }
  const starCode = (char) => char?.starMaxCode || char?.starMinCode || `${char?.rarity || 1}S`;

  /* =========================
   * Commander System Functions
   * ========================= */

  /**
   * Calculate commander buffs based on element and star level
   * @param {string} element - Character element (body, bravery, wisdom, heart, skill)
   * @param {number} stars - Star rating (5-10)
   * @returns {Array} Array of buff objects
   */
  function calculateCommanderBuffs(element, stars) {
    const buffs = [];

    // Baseline buffs at 5 stars
    const baselineBuffs = {
      body: [{ type: 'atk', value: 4, icon: '⚔️', label: 'ATK' }],
      bravery: [
        { type: 'atk', value: 3, icon: '⚔️', label: 'ATK' },
        { type: 'hp', value: 1, icon: '❤️', label: 'Health' }
      ],
      wisdom: [
        { type: 'atk', value: 3, icon: '⚔️', label: 'ATK' },
        { type: 'hp', value: 1, icon: '❤️', label: 'Health' }
      ],
      heart: [{ type: 'atk', value: 4, icon: '⚔️', label: 'ATK' }],
      skill: [{ type: 'speed', value: 4, icon: '⚡', label: 'Speed' }]
    };

    const elementBuffs = baselineBuffs[element?.toLowerCase()] || [];

    // Calculate scaling: 5 stars = baseline, 10 stars = 20%
    // Linear interpolation: buff = baseline + (stars - 5) * ((20 - baseline) / 5)
    const starMultiplier = stars >= 5 ? (stars - 5) / 5 : 0;

    elementBuffs.forEach(buff => {
      const scaledValue = buff.value + starMultiplier * (20 - buff.value);
      buffs.push({
        type: buff.type,
        value: Math.round(scaledValue * 10) / 10, // Round to 1 decimal
        icon: buff.icon,
        label: buff.label
      });
    });

    return buffs;
  }

  /**
   * Extract ultimate data from character JSON
   * @param {Object} char - Character object
   * @param {string} tierCode - Star tier code (e.g., "6S", "10SO")
   * @returns {Object|null} Ultimate data or null
   */
  function getCommanderUltimate(char, tierCode) {
    if (!char?.skills?.ultimate) return null;

    const ultimate = char.skills.ultimate;
    const tierData = ultimate.byTier?.[tierCode] || ultimate.byTier?.[Object.keys(ultimate.byTier || {})[0]];

    if (!tierData) return null;

    return {
      name: ultimate.name || "Commander Ultimate",
      description: tierData.description || "Powerful ultimate attack",
      chakraCost: tierData.chakraCost || 0,
      range: tierData.range || "Unknown",
      hits: tierData.hits || 0,
      multiplier: tierData.multiplier || "Unknown"
    };
  }

  /* =========================
   * Load Character Data
   * ========================= */
  async function loadCharacters() {
    try {
      const res = await fetch("data/characters.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      BASE = Array.isArray(json) ? json : (Array.isArray(json.characters) ? json.characters : []);
      BYID = BASE.reduce((acc, c) => (acc[c.id] = c, acc), {});
      console.log("[Team Manager] Loaded", BASE.length, "characters");
    } catch (err) {
      console.error("[Team Manager] Failed to load characters:", err);
    }
  }

  /* =========================
   * Storage
   * ========================= */
  function saveTeams() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
      console.log("[Team Manager] Teams saved");
    } catch (err) {
      console.error("[Team Manager] Save failed:", err);
    }
  }

  function loadTeams() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        teams = JSON.parse(raw);
        console.log("[Team Manager] Teams loaded");
      }
    } catch (err) {
      console.error("[Team Manager] Load failed:", err);
      teams = { 1: {}, 2: {}, 3: {} };
    }
  }

  /* =========================
   * Rendering
   * ========================= */

  // Build the right-side stat rail card for a slot
  function renderFilledSlot(slotEl, slotId, inst, char) {
    const tier = inst.tierCode || minTier(char);
    const stats = window.Progression?.computeEffectiveStatsLoreTier
      ? (window.Progression.computeEffectiveStatsLoreTier(char, inst.level, tier, { normalize: true }).stats || pickStats(char, DISPLAY_MODE))
      : pickStats(char, DISPLAY_MODE);

    const img = resolveTierArt(char, tier).portrait || pickImg(char, tier);
    const cost = pickCost(char);
    const luck = pickLuck(char);
    const range = pickRange(char);
    const stars = starsFromTier(tier);

    slotEl.innerHTML = `
      <div class="slot-card">
        <div class="portrait">
          <img src="${img}" alt="${char.name}"
               onerror="this.src='assets/characters/_common/silhouette.png';" />
          <div class="lv-badge">Lv ${inst.level}</div>
        </div>

        <div class="rail">
          <div class="stat"><span class="k">Health</span><span class="v">${safeNum(stats.hp,0).toLocaleString()}</span></div>
          <div class="stat"><span class="k">Strength</span><span class="v">${safeNum(stats.atk,0).toLocaleString()}</span></div>
          <div class="stat"><span class="k">Speed</span><span class="v">${safeNum(stats.speed,0)}</span></div>
          <div class="sep"></div>
          <div class="stat"><span class="k">Cost</span><span class="v">${cost}</span></div>
          <div class="stat"><span class="k">Luck</span><span class="v">${luck}</span></div>
          <div class="stat"><span class="k">Range</span><span class="v">${safeStr(range)}</span></div>
        </div>

        <button class="slot-remove" data-slot="${slotId}" title="Remove">×</button>
      </div>
    `;
  }

  function renderCommanderInfo() {
    const team = teams[currentTeam] || {};
    const commanderAssignment = team.commander;
    const commanderSlot = document.querySelector('.commander-slot');

    if (!commanderAssignment?.uid || !commanderBuffDisplay || !commanderUltimateImg || !commanderUltimateInfo) {
      // No commander assigned - show empty state
      if (commanderBuffDisplay) {
        commanderBuffDisplay.innerHTML = '<span class="no-commander">No commander assigned</span>';
      }
      if (commanderUltimateImg) {
        commanderUltimateImg.innerHTML = '<span class="no-ultimate">Assign a commander to view ultimate</span>';
      }
      if (commanderUltimateInfo) {
        commanderUltimateInfo.innerHTML = `
          <div class="ultimate-name">-</div>
          <div class="ultimate-description">Ultimate triggers when team chakra reaches 16</div>
        `;
      }
      if (commanderSlot) {
        commanderSlot.removeAttribute('data-element');
      }
      return;
    }

    const inst = window.InventoryChar?.getByUid(commanderAssignment.uid);
    const char = BYID[commanderAssignment.charId];

    if (!inst || !char) {
      renderCommanderInfo(); // Recursively call with no commander
      return;
    }

    const tier = inst.tierCode || minTier(char);
    const stars = starsFromTier(tier);
    const element = char.element || 'heart'; // Fallback to heart if no element

    // Set element attribute for styling
    if (commanderSlot) {
      commanderSlot.setAttribute('data-element', element.toLowerCase());
    }

    // Calculate and display buffs
    const buffs = calculateCommanderBuffs(element, stars);
    if (commanderBuffDisplay) {
      commanderBuffDisplay.innerHTML = buffs.map(buff => `
        <div class="buff-item">
          <span class="buff-icon">${buff.icon}</span>
          <span class="buff-text">+${buff.value}% ${buff.label}</span>
        </div>
      `).join('');
    }

    // Display ultimate info
    const ultimate = getCommanderUltimate(char, tier);
    if (ultimate && commanderUltimateInfo) {
      commanderUltimateInfo.innerHTML = `
        <div class="ultimate-name">${ultimate.name}</div>
        <div class="ultimate-description">${ultimate.description}</div>
        <div class="ultimate-stats">
          <span class="ultimate-stat-badge">Chakra: ${ultimate.chakraCost}</span>
          <span class="ultimate-stat-badge">Range: ${ultimate.range}</span>
          <span class="ultimate-stat-badge">Hits: ${ultimate.hits}</span>
          <span class="ultimate-stat-badge">Power: ${ultimate.multiplier}</span>
        </div>
      `;
    } else {
      commanderUltimateInfo.innerHTML = `
        <div class="ultimate-name">No Ultimate Data</div>
        <div class="ultimate-description">Ultimate triggers when team chakra reaches 16</div>
      `;
    }

    // Display ultimate image placeholder
    if (commanderUltimateImg) {
      commanderUltimateImg.innerHTML = `
        <span class="no-ultimate">Ultimate PNG<br>(To be added)</span>
      `;
    }
  }

  function renderTeam() {
    const team = teams[currentTeam] || {};

    // Draw each slot
    slots.forEach(slot => {
      const slotId = slot.dataset.slot;
      const assigned = team[slotId];

      if (assigned?.uid) {
        const inst = window.InventoryChar?.getByUid(assigned.uid);
        const char = BYID[assigned.charId];

        if (inst && char) {
          renderFilledSlot(slot, slotId, inst, char);
          return;
        }
      }

      // Empty state
      slot.innerHTML = `<div class="slot-empty">Empty</div>`;
    });

    updateTeamStats();
    renderCommanderInfo();
    renderCharacterGrid();
  }

  // Update header totals: pooled HP & total cost (actives only)
  function updateTeamStats() {
    const team = teams[currentTeam] || {};
    let totalCost = 0;
    let totalHealth = 0;

    Object.entries(team).forEach(([slotId, assigned]) => {
      if (!assigned?.uid) return;

      const inst = window.InventoryChar?.getByUid(assigned.uid);
      const char = BYID[assigned.charId];
      if (!inst || !char) return;

      // cost
      totalCost += pickCost(char);

      // hp (prefer normalized effective stats if provided)
      const tier = inst.tierCode || minTier(char);
      if (window.Progression?.computeEffectiveStatsLoreTier) {
        const { stats } = window.Progression.computeEffectiveStatsLoreTier(
          char, inst.level, tier, { normalize: true }
        );
        totalHealth += safeNum(stats.hp, 0);
      } else {
        totalHealth += safeNum(pickStats(char, DISPLAY_MODE).hp, 0);
      }
    });

    totalCostEl.textContent = totalCost;
    totalHealthEl.textContent = totalHealth.toLocaleString();

    totalCostEl.style.color = totalCost > MAX_COST ? "#ff4444" : "var(--gold)";
  }

  /* ---------- Character Grid ---------- */
  function renderCharacterGrid(filter = "") {
    const instances = window.InventoryChar?.allInstances() || [];
    const team = teams[currentTeam] || {};
    // Include commander in assigned UIDs
    const assignedUids = new Set(Object.values(team).map(a => a?.uid).filter(Boolean));

    const filterLower = filter.toLowerCase();
    const filtered = instances.filter(inst => {
      const char = BYID[inst.charId];
      if (!char) return false;
      if (filter && !char.name.toLowerCase().includes(filterLower)) return false;
      return true;
    });

    charGrid.innerHTML = filtered.map(inst => {
      const char = BYID[inst.charId];
      const tier = inst.tierCode || minTier(char);
      const art = resolveTierArt(char, tier);
      const isAssigned = assignedUids.has(inst.uid);

      return `
        <div class="team-char-card ${isAssigned ? 'assigned' : ''}" 
             data-uid="${inst.uid}"
             data-char-id="${char.id}"
             draggable="${!isAssigned}">
          <img src="${art.portrait}" alt="${char.name}" 
               onerror="this.src='assets/characters/_common/silhouette.png';" />
          <div class="team-char-card-info">
            <div class="team-char-card-name">${safeStr(char.name)}</div>
            <div class="team-char-card-level">Lv ${inst.level} ${renderStars(starsFromTier(tier))}</div>
          </div>
        </div>
      `;
    }).join("");

    if (filtered.length === 0) {
      charGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:20px; color:#888;">No characters found.</div>`;
    }

    // Attach drag listeners
    attachDragListeners();
  }

  /* =========================
   * Drag & Drop System
   * ========================= */
  function attachDragListeners() {
    // Character cards - drag start
    document.querySelectorAll(".team-char-card:not(.assigned)").forEach(card => {
      card.addEventListener("dragstart", handleDragStart);
    });

    // Team slots - drop zones
    slots.forEach(slot => {
      slot.addEventListener("dragover", handleDragOver);
      slot.addEventListener("dragleave", handleDragLeave);
      slot.addEventListener("drop", handleDrop);
    });
  }

  function handleDragStart(e) {
    const card = e.currentTarget;
    const uid = card.dataset.uid;
    const charId = card.dataset.charId;

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify({ uid, charId }));

    // Visual feedback
    card.style.opacity = "0.5";
    console.log("[Team Manager] Drag started:", uid);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const slot = e.currentTarget;
    slot.classList.add("drag-over");
  }

  function handleDragLeave(e) {
    const slot = e.currentTarget;
    slot.classList.remove("drag-over");
  }

  function handleDrop(e) {
    e.preventDefault();

    const slot = e.currentTarget;
    slot.classList.remove("drag-over");

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const { uid, charId } = data;

      if (!uid || !charId) {
        console.error("[Team Manager] Invalid drop data");
        return;
      }

      const slotId = slot.dataset.slot;
      const slotType = slot.dataset.type; // "active" or "commander"
      const team = teams[currentTeam];

      // Check if already assigned elsewhere
      const alreadyAssigned = Object.entries(team).find(([slot, data]) =>
        data?.uid === uid
      );

      if (alreadyAssigned) {
        alert(`This character is already assigned to ${alreadyAssigned[0]}!`);
        return;
      }

      // Assign to slot
      team[slotId] = { uid, charId };
      saveTeams();
      renderTeam();

      console.log("[Team Manager] Character assigned to", slotId, `(${slotType})`);

    } catch (err) {
      console.error("[Team Manager] Drop failed:", err);
    }
  }

  /* =========================
   * Events & Handlers
   * ========================= */

  function handleSlotClick(e) {
    const slot = e.target.closest(".team-slot");
    if (!slot) return;

    // Don't select if clicking remove button
    if (e.target.closest(".slot-remove")) return;

    slots.forEach(s => s.classList.remove("active"));
    slot.classList.add("active");
    activeSlot = slot.dataset.slot;

    console.log("[Team Manager] Active slot:", activeSlot);
  }

  function handleSlotRemove(e) {
    const btn = e.target.closest(".slot-remove");
    if (!btn) return;

    e.stopPropagation();

    const slotId = btn.dataset.slot;
    const team = teams[currentTeam];

    if (team[slotId]) {
      delete team[slotId];
      saveTeams();
      renderTeam();
    }
  }

  function handleCharClick(e) {
    const card = e.target.closest(".team-char-card");
    if (!card || card.classList.contains("assigned")) return;

    const uid = card.dataset.uid;
    const charId = card.dataset.charId;

    const inst = window.InventoryChar?.getByUid(uid);
    const char = BYID[charId];

    if (!inst || !char) return;

    selectedChar = { uid, charId, inst, char };
    showPreview(inst, char);
  }

  /* ---------- Preview Modal ---------- */
  function showPreview(inst, char) {
    // Bug #9 fix: Validate preview elements exist before using them
    if (!previewImg || !previewName || !previewStars || !previewStats || !previewModal) {
      console.error("[Team Manager] Preview elements not found!");
      return;
    }

    const tier = inst.tierCode || minTier(char);
    const art = resolveTierArt(char, tier);

    previewImg.src = art.full || art.portrait;
    previewName.textContent = char.name;
    if (previewVersion) previewVersion.textContent = char.version || "";
    previewStars.innerHTML = renderStars(starsFromTier(tier));

    // Stats
    let stats = { hp: 0, atk: 0, def: 0, speed: 0 };
    if (window.Progression?.computeEffectiveStatsLoreTier) {
      const result = window.Progression.computeEffectiveStatsLoreTier(
        char, inst.level, tier, { normalize: true }
      );
      stats = result.stats;
    } else {
      const src = pickStats(char, DISPLAY_MODE);
      stats = { hp: src.hp || 0, atk: src.atk || 0, def: src.def || 0, speed: src.speed || 0 };
    }

    previewStats.innerHTML = `
      <div class="preview-stat"><span class="preview-stat-label">Health</span><span class="preview-stat-value">${safeNum(stats.hp,0).toLocaleString()}</span></div>
      <div class="preview-stat"><span class="preview-stat-label">Attack</span><span class="preview-stat-value">${safeNum(stats.atk,0).toLocaleString()}</span></div>
      <div class="preview-stat"><span class="preview-stat-label">Defense</span><span class="preview-stat-value">${safeNum(stats.def,0).toLocaleString()}</span></div>
      <div class="preview-stat"><span class="preview-stat-label">Speed</span><span class="preview-stat-value">${safeNum(stats.speed,0)}</span></div>
    `;

    previewModal.classList.add("open");
  }

  function closePreview() {
    previewModal.classList.remove("open");
    selectedChar = null;
  }

  function assignCharacter() {
    if (!selectedChar || !activeSlot) {
      alert("Please select a slot first!");
      return;
    }

    const team = teams[currentTeam];

    // Prevent duplicate assignment of the same instance
    const alreadyAssigned = Object.entries(team).find(([slot, data]) =>
      data?.uid === selectedChar.uid
    );
    if (alreadyAssigned) {
      const slotLabel = alreadyAssigned[0] === 'commander' ? 'Commander' : alreadyAssigned[0];
      alert(`This character is already assigned to ${slotLabel}!`);
      return;
    }

    team[activeSlot] = {
      uid: selectedChar.uid,
      charId: selectedChar.charId
    };

    saveTeams();
    closePreview();
    renderTeam();

    slots.forEach(s => s.classList.remove("active"));
    activeSlot = null;
  }

  function switchTeam(teamNum) {
    currentTeam = teamNum;

    teamTabs.forEach(tab => {
      tab.classList.toggle("active", Number(tab.dataset.team) === teamNum);
    });

    slots.forEach(s => s.classList.remove("active"));
    activeSlot = null;

    renderTeam();
  }

  function saveTeam() {
    saveTeams();
    if (window.ModalManager) {
      window.ModalManager.showSuccess(`Team ${currentTeam} saved!`);
    }
  }

  function clearTeam() {
    if (window.ModalManager) {
      window.ModalManager.showConfirm(
        `Clear all characters from Team ${currentTeam}?`,
        () => {
          teams[currentTeam] = {};
          saveTeams();
          renderTeam();
        },
        null
      );
    }
  }

  function filterCharacters() {
    renderCharacterGrid(charFilter.value);
  }

  /* =========================
   * Event Listeners
   * ========================= */
  teamTabs.forEach(tab => {
    tab.addEventListener("click", () => switchTeam(Number(tab.dataset.team)));
  });

  slots.forEach(slot => {
    slot.addEventListener("click", handleSlotClick);
  });

  document.addEventListener("click", handleSlotRemove);
  charGrid.addEventListener("click", handleCharClick);

  previewClose?.addEventListener("click", closePreview);
  previewModal?.addEventListener("click", (e) => {
    if (e.target === previewModal) closePreview();
  });

  btnAssign?.addEventListener("click", assignCharacter);
  btnSave?.addEventListener("click", saveTeam);
  btnClear?.addEventListener("click", clearTeam);
  charFilter?.addEventListener("input", filterCharacters);

  /* =========================
   * Init
   * ========================= */
  (async function init() {
    console.log("[Team Manager] Initializing...");

    if (!window.InventoryChar) {
      console.error("[Team Manager] InventoryChar not loaded!");
      return;
    }

    await loadCharacters();
    loadTeams();
    renderTeam();

    console.log("[Team Manager] Ready!");
  })();

})();
