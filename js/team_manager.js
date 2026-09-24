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

  const TEAM_NAMES_KEY = 'blazing_team_names';
  let currentTeam = 1;
  let activeSlot = null;
  let teams = { 1:{}, 2:{}, 3:{}, 4:{}, 5:{}, 6:{}, 7:{}, 8:{} };
  let teamNames = { 1:'Team 1', 2:'Team 2', 3:'Team 3', 4:'Team 4', 5:'Team 5', 6:'Team 6', 7:'Team 7', 8:'Team 8' };
  let BASE = [];
  let BYID = {};

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

  // Shared star component (.bz-stars / .bz-star, styled in teams.css — same
  // markup as js/characters.js). Size comes from the container's --bz-star-size.
  const renderStars = (n) => {
    const count = Math.max(0, Math.min(10, Number(n) || 0));
    const star = "<img src='assets/ui/jjk/star_gold.webp' class='bz-star' alt='' draggable='false'>";
    return `<span class="bz-stars" data-count="${count}" role="img" aria-label="${count} star${count === 1 ? "" : "s"}">${star.repeat(count)}</span>`;
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

  /* ---------- Sorting / filtering ---------- */
  let currentSort = "rarity";

  // A unit's CURRENT power = effective power at its current level + tier.
  // Used for the "Power" sort so it reflects actual investment.
  function effectivePower(char, inst) {
    const tier = inst?.tierCode || minTier(char);
    try {
      if (window.Progression && window.Progression.computeEffectiveStatsLoreTier) {
        const comp = window.Progression.computeEffectiveStatsLoreTier(
          char, safeNum(inst?.level, 1), tier, { normalize: true }
        );
        if (comp && Number.isFinite(comp.power)) return comp.power;
      }
    } catch (e) { /* fall through */ }
    return safeNum(char?.powerRank, 0);
  }

  // A unit's POWER CEILING at its current star tier — the effective power it
  // would have at that tier's max level. Shown on roster cards (and used by the
  // "Potential" sort) instead of current power, so a freshly-pulled 7S still
  // reads as the top-tier unit it is, while a 6S vs 7S of the same card differ.
  function tierCeilingPower(char, inst) {
    const tier = inst?.tierCode || minTier(char);
    try {
      if (window.Progression && window.Progression.computeEffectiveStatsLoreTier) {
        const caps = window.Progression.TIER_CAPS || {};
        const cap = caps[tier] || 100;
        const comp = window.Progression.computeEffectiveStatsLoreTier(
          char, cap, tier, { normalize: true }
        );
        if (comp && Number.isFinite(comp.power)) return comp.power;
      }
    } catch (e) { /* fall through */ }
    return safeNum(char?.powerRank, 0);
  }


  function sortKey(inst, char) {
    const tier = inst.tierCode || minTier(char);
    const stats = pickStats(char, DISPLAY_MODE);
    switch (currentSort) {
      case "power": return effectivePower(char, inst);
      case "grade": return tierCeilingPower(char, inst) * 1e3 + safeNum(inst.level, 0); // "Potential"
      case "star":  return starsFromTier(tier) * 1e7 + safeNum(char.powerRank, 0);
      case "level": return safeNum(inst.level, 0) * 1e7 + safeNum(char.powerRank, 0);
      case "atk":   return safeNum(stats.atk, 0);
      case "speed": return safeNum(stats.speed, 0);
      case "rarity":
      default:      return safeNum(char.rarity, 0) * 1e7 + safeNum(char.powerRank, 0);
    }
  }

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
      const res = await fetch("data/characters.json");
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
      window.dispatchEvent(new CustomEvent('blazing_teams_updated'));
      console.log("[Team Manager] Teams saved");
    } catch (err) {
      console.error("[Team Manager] Save failed:", err);
    }
  }

  function saveTeamNames() {
    try { localStorage.setItem(TEAM_NAMES_KEY, JSON.stringify(teamNames)); } catch(e) {}
  }

  function loadTeamNames() {
    try {
      const raw = localStorage.getItem(TEAM_NAMES_KEY);
      if (raw) Object.assign(teamNames, JSON.parse(raw));
    } catch(e) {}
  }

  function loadTeams() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (let i = 1; i <= 8; i++) {
          teams[i] = parsed[i] || parsed[String(i)] || {};
        }
        console.log("[Team Manager] Teams loaded");
      }
    } catch (err) {
      console.error("[Team Manager] Load failed:", err);
      teams = { 1:{}, 2:{}, 3:{}, 4:{}, 5:{}, 6:{}, 7:{}, 8:{} };
    }
  }

  function renameCurrentTeam() {
    const current = teamNames[currentTeam] || `Team ${currentTeam}`;
    const newName = prompt(`New name for Team ${currentTeam}:`, current);
    if (!newName || !newName.trim() || newName.trim() === current) return;
    const trimmed = newName.trim().substring(0, 24);
    teamNames[currentTeam] = trimmed;
    saveTeamNames();
    const tab = document.querySelector(`.team-tab[data-team="${currentTeam}"]`);
    if (tab) tab.textContent = trimmed;
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

    const unlockedAbilities = inst.unlockedAbilities || [];
    const totalAbilities = (char.abilities || []).length;
    const allAbilitiesUnlocked = totalAbilities > 0 && unlockedAbilities.length >= totalAbilities;
    const teamUltimateBadge = allAbilitiesUnlocked
      ? `<img class="ultimate-badge" src="assets/ui/${(inst.level || 1) >= 150 ? 'ultimate_max' : 'ultimate'}.png" alt="Ultimate" onerror="this.style.display='none';" />`
      : '';

    const is7Star = (starsFromTier(tier) || 0) >= 7;
    // The lightning overlay is injected by js/seven-star-fx.js (shared video,
    // only while on-screen) right before .lv-badge — where the <video> sat.
    const fxAttr = is7Star ? ' data-fx="7star" data-fx-before=":scope > .lv-badge"' : '';

    // Card stat contributions (CRI, CRIT DMG, EVA)
    const cardContrib = window.CardSystem?.getEquippedContributions
      ? window.CardSystem.getEquippedContributions(inst.equippedJutsu)
      : { cri: 0, critDmg: 0, eva: 0 };
    const baseCri = safeNum(char.statsMax?.cri || char.statsBase?.cri, 0);
    const baseEva = safeNum(char.statsMax?.eva || char.statsBase?.eva, 0);
    const totalCri    = (baseCri + cardContrib.cri).toFixed(1);
    const totalCritDmg = cardContrib.critDmg.toFixed(1);
    const totalEva    = (baseEva + cardContrib.eva).toFixed(2);

    slotEl.innerHTML = `
      <div class="slot-card${is7Star ? ' is-7star' : ''}">
        <div class="portrait"${fxAttr}>
          <img src="${img}" alt="${char.name}"
               onerror="this.src='assets/characters/_common/silhouette.png';" />
          <div class="lv-badge">Lv ${inst.level}</div>
          ${teamUltimateBadge}
        </div>

        <div class="rail">
          <div class="stat"><span class="k">Health</span><span class="v">${safeNum(stats.hp,0).toLocaleString()}</span></div>
          <div class="stat"><span class="k">Strength</span><span class="v">${safeNum(stats.atk,0).toLocaleString()}</span></div>
          <div class="stat"><span class="k">Speed</span><span class="v">${safeNum(stats.speed,0)}</span></div>
          <div class="sep"></div>
          <div class="stat"><span class="k">CRI Rate</span><span class="v">${totalCri}%</span></div>
          <div class="stat"><span class="k">CRIT DMG</span><span class="v">${totalCritDmg}%</span></div>
          <div class="stat"><span class="k">Evasion</span><span class="v">${totalEva}%</span></div>
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
      slot.classList.toggle("has-unit", !!assigned?.uid);

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

  /* ---------- Character Grid ----------
   * The roster can hold hundreds of units, so the grid is built ONCE (per page
   * load) and afterwards only patched:
   *   - search / element / star filters toggle the `hidden` attribute,
   *   - sorting re-appends the existing nodes in the new order,
   *   - team changes flip the `.assigned` class.
   * No card is ever re-rendered while the player types or drags. */
  const ELEMENTS = ["heart", "skill", "body", "bravery", "wisdom"];
  const FILTER_PREFS_KEY = "blazing_teams_filters_v1"; // per-viewer convenience only
  const filterState = { q: "", els: new Set(), stars: new Set() };
  let gridEntries = [];            // [{ uid, el, name, element, stars }]
  const cardByUid = new Map();     // uid -> card element
  const rosterCountEl = document.getElementById("roster-count");
  const filterResetBtn = document.getElementById("btn-filter-reset");
  let gridEmptyEl = null;

  const elementOf = (char) => {
    const e = safeStr(char?.element).toLowerCase();
    return ELEMENTS.includes(e) ? e : "";
  };
  // Star bucket used by the star chips: 1–3★ share the "≤3" chip.
  const starBucket = (n) => (n <= 3 ? 3 : Math.min(n, 7));

  function cardHTML(inst, char) {
    const tier = inst.tierCode || minTier(char);
    const art = resolveTierArt(char, tier);
    const stars = starsFromTier(tier) || safeNum(char.rarity, 1);
    const is7Star = stars >= 7;
    const power = Math.round(tierCeilingPower(char, inst));
    const el = elementOf(char);
    // Lightning overlay: injected by js/seven-star-fx.js only while the
    // card is on-screen (one shared video for the page), placed before the
    // portrait <img> where the per-card <video> used to be.
    const fxAttr = is7Star ? ' data-fx="7star" data-fx-before=":scope > img"' : "";
    return `
      <div class="team-char-card${is7Star ? ' is-7star' : ''}"
           data-uid="${inst.uid}"
           data-char-id="${char.id}"
           data-stars="${Math.min(stars, 7)}"${el ? ` data-el="${el}"` : ""}
           title="${safeStr(char.name)} · ${stars}★ · Lv ${inst.level} · Power ${power.toLocaleString()}"${fxAttr}>
        <img src="${art.portrait}" alt="${char.name}" loading="lazy" decoding="async" draggable="false"
             onerror="this.src='assets/characters/_common/silhouette.png';" />
        <div class="team-char-card-info">
          <div class="team-char-card-name">${safeStr(char.name)}</div>
          <div class="team-char-card-stars">${renderStars(stars)}</div>
          <div class="team-char-card-meta">
            <span class="tcc-lv">Lv <b>${inst.level}</b></span>
            <span class="tcc-power" title="Power at max level for this star tier">${power.toLocaleString()}</span>
          </div>
        </div>
      </div>`;
  }

  function buildCharacterGrid() {
    const instances = (window.InventoryChar?.allInstances() || []).filter(i => BYID[i.charId]);
    charGrid.innerHTML = instances.map(inst => cardHTML(inst, BYID[inst.charId])).join("");
    cardByUid.clear();
    gridEntries = [];
    charGrid.querySelectorAll(".team-char-card").forEach((card, i) => {
      const inst = instances[i];
      const char = BYID[inst.charId];
      cardByUid.set(inst.uid, card);
      gridEntries.push({
        uid: inst.uid,
        inst,
        char,
        el: card,
        name: safeStr(char.name).toLowerCase(),
        element: elementOf(char),
        stars: starBucket(Number(card.dataset.stars) || 1),
      });
    });
    gridEmptyEl = document.createElement("div");
    gridEmptyEl.className = "grid-empty";
    gridEmptyEl.hidden = true;
    charGrid.appendChild(gridEmptyEl);
    applySort();
    applyFilters();
  }

  // Precompute every key once per sort (the power keys are not cheap).
  function applySort() {
    if (!gridEntries.length) return;
    let ordered;
    if (currentSort === "name") {
      ordered = gridEntries.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const keys = new Map(gridEntries.map(e => [e, sortKey(e.inst, e.char)]));
      ordered = gridEntries.slice().sort((a, b) => keys.get(b) - keys.get(a)); // best first
    }
    const frag = document.createDocumentFragment();
    ordered.forEach(e => frag.appendChild(e.el));
    frag.appendChild(gridEmptyEl);
    charGrid.appendChild(frag);
  }

  function applyFilters() {
    const q = filterState.q.trim().toLowerCase();
    const { els, stars } = filterState;
    let shown = 0;
    for (const e of gridEntries) {
      const ok = (!q || e.name.includes(q)) &&
                 (!els.size || els.has(e.element)) &&
                 (!stars.size || stars.has(e.stars));
      if (e.el.hidden === ok) e.el.hidden = !ok;
      if (ok) shown++;
    }
    const active = !!q || els.size > 0 || stars.size > 0;
    if (rosterCountEl) rosterCountEl.textContent = active ? `${shown} / ${gridEntries.length}` : `${gridEntries.length}`;
    if (filterResetBtn) filterResetBtn.hidden = !active;
    if (gridEmptyEl) {
      gridEmptyEl.hidden = shown > 0;
      gridEmptyEl.textContent = gridEntries.length ? "No units match these filters." : "No characters found.";
    }
    saveFilterPrefs();
  }

  function syncGridAssigned() {
    const team = teams[currentTeam] || {};
    const assigned = new Set(Object.values(team).map(a => a?.uid).filter(Boolean));
    for (const e of gridEntries) {
      const on = assigned.has(e.uid);
      if (e.el.classList.contains("assigned") !== on) e.el.classList.toggle("assigned", on);
    }
  }

  function renderCharacterGrid() {
    if (!gridEntries.length && !gridEmptyEl) buildCharacterGrid();
    syncGridAssigned();
  }

  function saveFilterPrefs() {
    try {
      localStorage.setItem(FILTER_PREFS_KEY, JSON.stringify({
        els: [...filterState.els], stars: [...filterState.stars], sort: currentSort,
      }));
    } catch (e) { /* storage unavailable: prefs are optional */ }
  }
  function loadFilterPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(FILTER_PREFS_KEY) || "null");
      if (!p) return;
      (p.els || []).forEach(x => ELEMENTS.includes(x) && filterState.els.add(x));
      (p.stars || []).forEach(x => [3, 4, 5, 6, 7].includes(Number(x)) && filterState.stars.add(Number(x)));
      if (typeof p.sort === "string" && document.querySelector(`.sort-opt[data-sort="${p.sort}"]`)) currentSort = p.sort;
    } catch (e) { /* ignore */ }
  }

  /* =========================
   * Team placement rules
   * =========================
   * Slots: front-1..4, back-1..4 (active) and "commander" (off-field support).
   * Any unit may sit in any slot; the only rule is that a character appears
   * on a team once (same copy OR another copy of the same character). */
  function slotHolding(team, pred, exceptSlot) {
    return Object.keys(team).find(k => k !== exceptSlot && team[k]?.uid && pred(team[k])) || null;
  }
  const slotLabel = (id) => id === "commander" ? "Commander"
    : id.replace(/^front-/, "Front ").replace(/^back-/, "Back ");

  /** Work out what dropping `src` on `targetSlot` would do (no side effects).
   *  src = { from: "slot", slot } | { from: "list", uid, charId }
   *  target = slot id, or "list" (remove from team). */
  function planDrop(src, target) {
    const team = teams[currentTeam] || {};
    if (target === "list") {
      return src.from === "slot" ? { kind: "remove" } : { kind: "none" };
    }
    const occupant = team[target]?.uid ? team[target] : null;
    if (src.from === "slot") {
      if (src.slot === target) return { kind: "none" };
      return { kind: occupant ? "swap" : "move" };
    }
    // From the roster list. A card already on this team acts like its slot.
    const at = slotHolding(team, a => a.uid === src.uid);
    if (at) return planDrop({ from: "slot", slot: at }, target);
    const dupe = slotHolding(team, a => a.charId === src.charId, target);
    if (dupe) return { kind: "invalid", reason: `Already in ${slotLabel(dupe)}` };
    return { kind: occupant ? "replace" : "place" };
  }

  function commitDrop(src, target) {
    const plan = planDrop(src, target);
    const team = teams[currentTeam] || (teams[currentTeam] = {});
    if (plan.kind === "none" || plan.kind === "invalid") return plan;

    let fromSlot = src.from === "slot" ? src.slot : slotHolding(team, a => a.uid === src.uid);
    if (plan.kind === "remove") {
      delete team[fromSlot];
    } else if (plan.kind === "swap" || plan.kind === "move") {
      const moving = team[fromSlot];
      const other = team[target];
      team[target] = moving;
      if (plan.kind === "swap") team[fromSlot] = other; else delete team[fromSlot];
    } else { // place / replace — the old occupant simply returns to the list
      team[target] = { uid: src.uid, charId: src.charId };
    }
    saveTeams();
    renderTeam();
    flashSlots(plan.kind === "swap" ? [target, fromSlot] : plan.kind === "remove" ? [] : [target]);
    return plan;
  }

  function flashSlots(ids) {
    ids.forEach(id => {
      const el = document.querySelector(`.team-slot[data-slot="${id}"]`);
      if (!el) return;
      el.classList.remove("just-dropped");
      void el.offsetWidth; // restart the animation
      el.classList.add("just-dropped");
      setTimeout(() => el.classList.remove("just-dropped"), 520);
    });
  }

  /* =========================
   * Drag & Drop (pointer events: mouse, touch and pen)
   * =========================
   * Mouse: press and move 6px to pick a unit up.
   * Touch/pen: press and hold ~220ms (a quick swipe still scrolls the list).
   * While dragging, a ghost follows the pointer; the slot under it shows what
   * will happen (Place / Replace / Move / Swap / Remove, or a red "already on
   * team"). Releasing commits it and saves. Esc cancels. */
  const DRAG_THRESHOLD = 6;
  const HOLD_MS = 220;
  const HOLD_SLOP = 8;
  const dropLabels = { place: "Place", replace: "Replace", move: "Move", swap: "Swap", remove: "Remove" };
  let drag = null;          // active gesture
  let suppressClick = false;

  function dragSourceFrom(target) {
    if (target.closest(".slot-remove, button, input")) return null;
    const card = target.closest(".team-char-card");
    if (card && charGrid.contains(card)) {
      return { src: { from: "list", uid: card.dataset.uid, charId: card.dataset.charId }, el: card,
               img: card.querySelector(":scope > img")?.src };
    }
    const slot = target.closest(".team-slot");
    if (slot) {
      const a = (teams[currentTeam] || {})[slot.dataset.slot];
      if (!a?.uid || !slot.querySelector(".slot-card")) return null;
      return { src: { from: "slot", slot: slot.dataset.slot }, el: slot,
               img: slot.querySelector(".portrait img")?.src };
    }
    return null;
  }

  function onPointerDown(e) {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const s = dragSourceFrom(e.target);
    if (!s) return;
    drag = {
      ...s, id: e.pointerId, type: e.pointerType,
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      active: false, target: null, plan: null, ghost: null, timer: 0,
    };
    if (e.pointerType !== "mouse") {
      drag.timer = setTimeout(() => { if (drag && !drag.active) startDrag(); }, HOLD_MS);
    }
  }

  function startDrag() {
    drag.active = true;
    clearTimeout(drag.timer);
    const g = document.createElement("div");
    g.className = "drag-ghost";
    g.innerHTML = `<img src="${drag.img || "assets/characters/_common/silhouette.png"}" alt="" draggable="false" />`;
    document.body.appendChild(g);
    drag.ghost = g;
    drag.el.classList.add("drag-source");
    document.body.classList.add("is-dragging-unit");
    try { window.getSelection()?.removeAllRanges(); } catch (e) {}
    positionGhost();
    updateDropTarget();
    try { navigator.vibrate?.(12); } catch (e) {}
  }

  function positionGhost() {
    if (drag?.ghost) drag.ghost.style.transform = `translate3d(${drag.x}px, ${drag.y}px, 0) translate(-50%, -60%)`;
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    const dist = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    if (!drag.active) {
      if (drag.type === "mouse") { if (dist >= DRAG_THRESHOLD) startDrag(); }
      else if (dist > HOLD_SLOP) { cancelDrag(); }   // moved before the hold: let it scroll
      return;
    }
    e.preventDefault();
    positionGhost();
    updateDropTarget();
    autoScroll();
  }

  function hitTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slot = el.closest(".team-slot");
    if (slot) return { key: slot.dataset.slot, el: slot };
    const list = el.closest(".char-selection");
    if (list) return { key: "list", el: list };
    return null;
  }

  function clearDropMarks() {
    if (drag?.target?.el) {
      drag.target.el.classList.remove("drag-over", "drop-ok", "drop-swap", "drop-invalid", "drop-remove");
      delete drag.target.el.dataset.dropLabel;
    }
  }

  function updateDropTarget() {
    const hit = hitTarget(drag.x, drag.y);
    if (hit?.el === drag.target?.el && hit?.key === drag.target?.key) return;
    clearDropMarks();
    drag.target = hit;
    drag.plan = hit ? planDrop(drag.src, hit.key) : null;
    if (!hit || !drag.plan || drag.plan.kind === "none") return;
    const k = drag.plan.kind;
    hit.el.classList.add("drag-over",
      k === "invalid" ? "drop-invalid" : k === "swap" ? "drop-swap" : k === "remove" ? "drop-remove" : "drop-ok");
    hit.el.dataset.dropLabel = k === "invalid" ? drag.plan.reason : dropLabels[k];
  }

  // Edge auto-scroll so a unit can be carried from the list to slots that are
  // off-screen (stacked layout) or to hidden cards in the list.
  function autoScroll() {
    if (drag.scrollRaf) return;
    const step = () => {
      drag && (drag.scrollRaf = 0);
      if (!drag?.active) return;
      const edge = 48, vh = window.innerHeight;
      const bottomBar = document.querySelector(".bottom-bar")?.offsetHeight || 0;
      const lo = edge, hi = vh - bottomBar - edge;
      // Only scroll once the pointer has been outside the edge bands since the
      // drag began, so picking a unit up near an edge doesn't yank the page.
      if (drag.y > lo && drag.y < hi) { drag.scrollArmed = true; return; }
      if (!drag.scrollArmed) return;
      let dy = 0;
      if (drag.y <= lo) dy = -Math.ceil((lo - drag.y + 4) / 3);
      else dy = Math.ceil((drag.y - hi + 4) / 3);
      if (dy) {
        const sc = document.scrollingElement;
        const before = sc.scrollTop;
        sc.scrollTop += dy;
        if (sc.scrollTop !== before) {
          updateDropTarget();
          drag.scrollRaf = requestAnimationFrame(step);
        }
      }
    };
    drag.scrollRaf = requestAnimationFrame(step);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.active) {
      e.preventDefault();
      updateDropTarget();
      const target = drag.target, plan = drag.plan, src = drag.src;
      endDrag();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (target && plan) {
        if (plan.kind === "invalid") toast(plan.reason);
        else if (plan.kind !== "none") commitDrop(src, target.key);
      }
      return;
    }
    cancelDrag();
  }

  function endDrag() {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.scrollRaf) cancelAnimationFrame(drag.scrollRaf);
    clearDropMarks();
    drag.ghost?.remove();
    drag.el?.classList.remove("drag-source");
    document.body.classList.remove("is-dragging-unit");
    drag = null;
  }
  function cancelDrag() { endDrag(); }

  let toastTimer = 0;
  function toast(msg) {
    let t = document.getElementById("team-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "team-toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
  }

  function initDragAndDrop() {
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.id) cancelDrag(); });
    // Once a touch drag has started, stop the page/list from scrolling under it.
    document.addEventListener("touchmove", (e) => { if (drag?.active) e.preventDefault(); }, { passive: false });
    // Long-press must not open the context menu / image callout.
    document.addEventListener("contextmenu", (e) => { if (drag) e.preventDefault(); });
    // A drag ends with a click on whatever is underneath; swallow it.
    document.addEventListener("click", (e) => {
      if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
    }, true);
    // No native HTML5 drag (it would fight the pointer drag).
    document.addEventListener("dragstart", (e) => {
      if (e.target.closest?.(".team-slot, #team-char-grid")) e.preventDefault();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drag) cancelDrag(); });
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

    // Same rules as drag & drop (one copy of a character per team); an
    // occupied slot is replaced and its unit goes back to the list.
    const plan = planDrop({ from: "list", uid: selectedChar.uid, charId: selectedChar.charId }, activeSlot);
    if (plan.kind === "invalid") {
      alert(`This character is already on this team (${plan.reason.replace(/^Already in /, "")})!`);
      return;
    }
    if (plan.kind === "move" || plan.kind === "swap") {
      alert("This character is already on this team — drag it to move or swap slots.");
      return;
    }
    const team = teams[currentTeam];
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

  // Live search: filtering only toggles `hidden` on existing cards, so it
  // runs on every keystroke without re-rendering the grid.
  function filterCharacters() {
    filterState.q = charFilter.value || "";
    applyFilters();
    charGrid.scrollTop = 0;
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

  /* ---------- Sort menu ---------- */
  const sortBtn = document.getElementById("btn-sort");
  const sortMenu = document.getElementById("sort-menu");
  const sortLabel = document.getElementById("sort-label");
  function closeSortMenu() {
    if (sortMenu) sortMenu.hidden = true;
    sortBtn?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
  }
  function reflectSort() {
    sortMenu?.querySelectorAll(".sort-opt").forEach(o =>
      o.classList.toggle("active", o.dataset.sort === currentSort));
    const opt = sortMenu?.querySelector(`.sort-opt[data-sort="${currentSort}"]`);
    if (sortLabel && opt) sortLabel.textContent = opt.textContent;
  }
  sortBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!sortMenu) return;
    sortMenu.hidden = !sortMenu.hidden;
    sortBtn.classList.toggle("open", !sortMenu.hidden);
    sortBtn.setAttribute("aria-expanded", String(!sortMenu.hidden));
  });
  sortMenu?.querySelectorAll(".sort-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      currentSort = opt.dataset.sort || "rarity";
      reflectSort();
      closeSortMenu();
      applySort();
      saveFilterPrefs();
    });
  });
  document.addEventListener("click", (e) => {
    if (sortMenu && !sortMenu.hidden && !e.target.closest(".sort-wrap")) closeSortMenu();
  });

  /* ---------- Element / star filter chips ---------- */
  function reflectChips() {
    document.querySelectorAll("#filter-elements .f-chip").forEach(b =>
      b.setAttribute("aria-pressed", String(filterState.els.has(b.dataset.el))));
    document.querySelectorAll("#filter-stars .f-chip").forEach(b =>
      b.setAttribute("aria-pressed", String(filterState.stars.has(Number(b.dataset.stars)))));
  }
  document.getElementById("filter-elements")?.addEventListener("click", (e) => {
    const b = e.target.closest(".f-chip"); if (!b) return;
    const k = b.dataset.el;
    filterState.els.has(k) ? filterState.els.delete(k) : filterState.els.add(k);
    reflectChips(); applyFilters(); charGrid.scrollTop = 0;
  });
  document.getElementById("filter-stars")?.addEventListener("click", (e) => {
    const b = e.target.closest(".f-chip"); if (!b) return;
    const k = Number(b.dataset.stars);
    filterState.stars.has(k) ? filterState.stars.delete(k) : filterState.stars.add(k);
    reflectChips(); applyFilters(); charGrid.scrollTop = 0;
  });
  filterResetBtn?.addEventListener("click", () => {
    filterState.q = ""; filterState.els.clear(); filterState.stars.clear();
    if (charFilter) charFilter.value = "";
    reflectChips(); applyFilters();
  });

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
    loadTeamNames();

    // Apply saved names to all tabs
    document.querySelectorAll(".team-tab").forEach(tab => {
      const n = Number(tab.dataset.team);
      if (teamNames[n]) tab.textContent = teamNames[n];
    });

    // Wire rename button
    const renameBtn = document.getElementById("btn-rename-team");
    if (renameBtn) renameBtn.addEventListener("click", renameCurrentTeam);

    loadFilterPrefs();
    reflectSort();
    reflectChips();
    initDragAndDrop();
    renderTeam();
    console.log("[Team Manager] Ready!");
  })();

})();
