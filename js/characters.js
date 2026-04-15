/* ============================================
   js/characters.js  — CLEAN, FINAL VERSION
   - Characters grid + Blazing-style modal
   - Tabs: Status • Ninjutsu • Passives
   - Level Up / Add / Remove / Awaken wired
   - Stars moved BELOW the name tube
   - Uses InventoryChar + (optional) Progression
   ============================================ */
(() => {
  "use strict";

  /* ---------- DOM ---------- */
  const GRID          = document.querySelector(".char-grid");
  const MODAL         = document.getElementById("char-modal");
  const MODAL_IMG     = document.getElementById("char-modal-img");
  const MODAL_CLOSE   = document.getElementById("char-modal-close");

  const NP_NAME       = document.getElementById("nameplate-name");
  const NP_VERSION    = document.getElementById("nameplate-version");
  const NP_STARS      = document.getElementById("nameplate-stars");

  const STATS_WRAP    = document.getElementById("char-stats");
  const LV_VALUE_EL   = document.getElementById("status-level");
  const LV_CAP_EL     = document.getElementById("status-cap");
  const TIP_EL        = document.getElementById("awaken-tip");

  const BTN_LVUP      = document.getElementById("btn-levelup");
  const BTN_FEEDDUPE  = document.getElementById("btn-feeddupe");
  // const BTN_REMOVE    = document.getElementById("btn-removecopy"); // Removed per user request
  const BTN_AWAKEN    = document.getElementById("btn-awaken");
  const BTN_LIMITBREAK = document.getElementById("btn-limitbreak");

  const LB_INFO       = document.getElementById("limitbreak-info");
  const LB_CURRENT    = document.getElementById("lb-current");
  const LB_MAX        = document.getElementById("lb-max");
  const LB_BONUS      = document.getElementById("lb-bonus");
  const MATERIALS_DISPLAY = document.getElementById("materials-display");

  const SKILLS_WRAP   = document.getElementById("char-skills");
  const SUPPORT_WRAP  = document.getElementById("char-support");
  const ABILITIES_WRAP = document.getElementById("char-abilities");

  const DUPE_MODAL    = document.getElementById("dupe-selector-modal");
  const DUPE_GRID     = document.getElementById("dupe-grid");
  const DUPE_CANCEL   = document.getElementById("dupe-modal-cancel");

  const RAMEN_MODAL    = document.getElementById("ramen-selector-modal");
  const RAMEN_GRID     = document.getElementById("ramen-grid");
  const RAMEN_CANCEL   = document.getElementById("ramen-modal-cancel");
  const RAMEN_CHAR_PORTRAIT = document.getElementById("ramen-char-portrait");
  const RAMEN_CHAR_NAME = document.getElementById("ramen-char-name");
  const RAMEN_CHAR_LEVEL = document.getElementById("ramen-char-level");

  // Bug #3 fix: Validate all critical DOM elements exist before proceeding
  const requiredElements = {
    GRID, MODAL, MODAL_IMG, NP_NAME, NP_VERSION, NP_STARS,
    STATS_WRAP, LV_VALUE_EL, LV_CAP_EL, BTN_LVUP, BTN_FEEDDUPE,
    /* BTN_REMOVE, */ BTN_AWAKEN, SKILLS_WRAP, SUPPORT_WRAP, ABILITIES_WRAP
  };

  const missingElements = Object.entries(requiredElements)
    .filter(([name, el]) => !el)
    .map(([name]) => name);

  if (missingElements.length > 0) {
    console.error("[characters] Missing required DOM elements:", missingElements.join(", "));
    return;
  }
  if (typeof window.InventoryChar === "undefined") {
    console.error("[characters] InventoryChar is not loaded. Load js/character_inv.js before this file.");
    return;
  }

  /* ---------- Safe helpers ---------- */
  const hasProg = typeof window.Progression !== "undefined";
  const hasAwakening = typeof window.Awakening !== "undefined";
  const hasLimitBreak = typeof window.LimitBreak !== "undefined";
  const hasResources = typeof window.Resources !== "undefined";
  const safeStr = (v, d = "") => (typeof v === "string" && v.trim() ? v.trim() : d);
  const safeNum = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  /* ---------- Power Grade Calculation ---------- */
  function calculatePowerGrade(power, unlockedAbilities = 0) {
    // Each ability adds 30,000 POW
    const abilityBonus = unlockedAbilities * 30000;
    const totalPower = power + abilityBonus;

    // Grade thresholds (checking from highest to lowest)
    if (totalPower >= 400000) return 'LR';
    if (totalPower >= 300000) return 'UR';
    if (totalPower >= 250000) return 'SSS';
    if (totalPower >= 200000) return 'SS';
    if (totalPower >= 150000) return 'S';
    if (totalPower >= 90000) return 'A';
    if (totalPower >= 70000) return 'B';
    if (totalPower >= 50000) return 'C';
    return 'D'; // < 50,000
  }
  window.calculatePowerGrade = calculatePowerGrade;

  /* ---------- Power Grade Display Element ---------- */
  function getPowerGradeElement(grade) {
    const gradeLower = grade.toLowerCase();

    // Use video for LR and UR (if available), with PNG fallback
    if (grade === 'LR' || grade === 'UR') {
      return `<video class="power-grade-video" autoplay loop muted playsinline>
          <source src="assets/icons/pow_${gradeLower}.mp4" type="video/mp4">
        </video>`;
    }

    // Use PNG for other grades
    return `<img class="power-grade-img" src="assets/icons/pow_${gradeLower}.png" alt="${grade}" onerror="this.innerHTML='${grade}'; this.style.display='flex'; this.style.alignItems='center'; this.style.justifyContent='center'; this.style.fontSize='48px'; this.style.fontWeight='900'; this.style.color='#ffd700';" />`;
  }
  window.getPowerGradeElement = getPowerGradeElement;

  /* ---------- Tier helpers ---------- */
  const STAR_COUNT_BY_TIER = { "3S":3,"4S":4,"5S":5,"6S":6,"6SB":6,"7S":7,"7SL":7,"8S":8,"8SM":8,"9S":9,"9ST":9,"10SO":10 };
  const TIER_CAP_FALLBACK  = { "3S":50,"4S":70,"5S":100,"6S":100,"6SB":100,"7S":120,"7SL":150,"8S":150,"8SM":150,"9S":150,"9ST":200,"10SO":250 };

  const starsFromTier = (code) => STAR_COUNT_BY_TIER[code] ?? 0;
  const tierCap = (c, tier) => {
    if (hasProg && window.Progression.computeEffectiveStatsLoreTier) {
      const probe = window.Progression.computeEffectiveStatsLoreTier(c, 1, tier, { normalize:true });
      return probe?.cap ?? (TIER_CAP_FALLBACK[tier] || 70);
    }
    return TIER_CAP_FALLBACK[tier] || 70;
  };
  const minTier = (c) => c.starMinCode || `${c.rarity || 3}S`;
  const maxTier = (c) => c.starMaxCode || minTier(c);

  /* ---------- Art resolver ---------- */
  function resolveTierArt(c, tier) {
    const fbPortrait = c?.portrait || "assets/characters/_common/silhouette.png";
    const fbFull     = c?.full || fbPortrait;
    const map = c?.artByTier || {};
    if (map[tier]) return { portrait: map[tier].portrait || fbPortrait, full: map[tier].full || fbFull };
    return { portrait: fbPortrait, full: fbFull };
  }
  window.resolveTierArt = resolveTierArt;

  /* ---------- Stars HTML ---------- */
  const renderStars = (n) => new Array(Math.max(0, Math.min(10, n))).fill(0).map(() => "<img src='assets/ui/NormalStar.png' class='star' alt='star'>").join("");
  window.renderStars = renderStars;
  window.starsFromTier = starsFromTier;

  /* ---------- Level badge (grid cards) ---------- */
  function levelBadgeHTML(c, inst) {
    const t = inst.tierCode || minTier(c);
    let cap = tierCap(c, t);

    // Apply extended level cap from limit breaks
    if (hasLimitBreak && inst.limitBreakLevel && inst.limitBreakLevel > 0) {
      cap = window.LimitBreak.getExtendedLevelCap(t, inst.limitBreakLevel);
    }

    const lv = safeNum(inst.level, 1);
    const isMax = lv >= cap;

    // Handle limit break levels (> 100)
    if (lv >= 150) {
      return `<span class="lv">Lv</span> <span class="limit-break-max">MAX</span>`;
    } else if (lv > 100) {
      return `<span class="lv">Lv</span> <span class="limit-break">${lv}</span>`;
    } else if (isMax) {
      return `<span class="lv">Lv</span> <span class="max">MAX</span>`;
    } else {
      return `<span class="lv">Lv</span> ${lv}`;
    }
  }

  /* ---------- Ultimate Badge (completion indicator) ---------- */
  function ultimateBadgeHTML(c, inst) {
    if (!c || !c.abilities || c.abilities.length === 0) {
      return ''; // No badge if character has no abilities
    }

    const unlockedAbilities = inst.unlockedAbilities || [];
    const totalAbilities = c.abilities.length;
    const allAbilitiesUnlocked = unlockedAbilities.length >= totalAbilities;

    if (!allAbilitiesUnlocked) {
      return ''; // No badge if not all abilities unlocked
    }

    const lv = safeNum(inst.level, 1);
    const isLevel150 = lv >= 150;

    if (isLevel150) {
      // Show ultimate_max badge (all abilities + level 150)
      return `<img class="ultimate-badge" src="assets/ui/ultimate_max.png" alt="Ultimate Max" onerror="this.style.display='none';" title="All abilities unlocked + Level 150!" />`;
    } else {
      // Show ultimate badge (all abilities unlocked)
      return `<img class="ultimate-badge" src="assets/ui/ultimate.png" alt="Ultimate" onerror="this.style.display='none';" title="All abilities unlocked!" />`;
    }
  }

  /* ---------- Data ---------- */
  let BASE = [];
  let BYID = Object.create(null);

  /* ---------- Load characters.json ---------- */
  async function loadBase() {
    // Add cache-busting timestamp to force fresh load
    const cacheBuster = `?v=${Date.now()}`;
    const res = await fetch(`data/characters.json${cacheBuster}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    BASE = Array.isArray(json) ? json : (Array.isArray(json.characters) ? json.characters : []);
    BYID = BASE.reduce((acc, c) => (acc[c.id] = c, acc), Object.create(null));
  }

  /* ---------- Global accessor for character data ---------- */
  window.CharacterInventory = {
    getCharacterById: (id) => BYID[id] || null,
    getAllCharacters: () => BASE.slice()
  };

  /* ---------- Grid render ---------- */
  function renderGrid() {
    const instances = window.InventoryChar.allInstances();
    if (!instances.length) {
      GRID.innerHTML = `<div class="empty-msg">No characters in your roster yet.</div>`;
      return;
    }

    // Sort characters by star rating (highest to lowest)
    const sortedInstances = instances.sort((a, b) => {
      const charA = BYID[a.charId];
      const charB = BYID[b.charId];

      // Get tier codes
      const tierA = a.tierCode || (charA ? minTier(charA) : "3S");
      const tierB = b.tierCode || (charB ? minTier(charB) : "3S");

      // Get star counts from tier codes
      const starsA = starsFromTier(tierA);
      const starsB = starsFromTier(tierB);

      // Sort by stars descending (highest first)
      return starsB - starsA;
    });

    GRID.innerHTML = sortedInstances.map(inst => {
      const c = BYID[inst.charId];
      if (!c) {
        return `
          <button class="char-slot missing" type="button" data-uid="${inst.uid}" aria-label="Missing base">
            <div class="char-card-portrait" style="display:grid;place-items:center;background:#5b3;color:#fff;padding:10px;">
              <div style="text-align:center;font-size:12px">Missing base:<br><code>${safeStr(inst.charId,'unknown')}</code></div>
            </div>
            <div class="char-card-level"><span class="lv">Lv</span> ${safeNum(inst.level,1)}</div>
          </button>
        `;
      }
      const tier = inst.tierCode || minTier(c);
      const art  = resolveTierArt(c, tier);
      return `
        <button class="char-slot" type="button" data-uid="${inst.uid}">
          <img class="char-portrait-img" src="${safeStr(art.portrait, c.portrait)}" alt="${c.name} portrait"
               onerror="this.onerror=null;this.src='assets/characters/_common/silhouette.png';" />
          <div class="char-card-level">${levelBadgeHTML(c, inst)}</div>
          ${ultimateBadgeHTML(c, inst)}
        </button>
      `;
    }).join("");
  }
  window.refreshCharacterGrid = renderGrid;

  /* ---------- Modal open/close ---------- */
  function openModalByUid(uid) {
    const inst = window.InventoryChar.getByUid(uid);
    if (!inst) return;

    // Store current UID in modal dataset for abilities systems
    MODAL.dataset.currentUid = uid;

    const c = BYID[inst.charId];
    if (!c) {
      NP_NAME.textContent = "Unknown Character";
      NP_VERSION.textContent = "Unlinked copy";
      NP_STARS.innerHTML = "";
      MODAL_IMG.src = "assets/characters/_common/silhouette.png";
      STATS_WRAP.innerHTML = `<div class="stat-row"><span class="stat-label">Note</span><span class="stat-value">Base '${safeStr(inst.charId,'unknown')}' not found in characters.json.</span></div>`;
      wireStatusButtons(null, inst, null);
      showModal();
      return;
    }

    const tier = inst.tierCode || minTier(c);
    const art  = resolveTierArt(c, tier);

    NP_NAME.textContent    = safeStr(c.name, "Unknown");
    NP_VERSION.textContent = safeStr(c.version, "");
    NP_STARS.innerHTML     = renderStars(starsFromTier(tier));

    MODAL_IMG.src = safeStr(art.full, art.portrait);
    MODAL_IMG.alt = `${c.name} full artwork`;

    renderStatusTab(c, inst, tier);
    renderSkillsTab(c, inst, tier);
    renderSupportTab(c, inst, tier);
    renderAbilitiesTab(c, inst);
    renderToolsTab(c, inst, tier);
    setActiveTab("status");

    // Render jutsu/ultimate slots
    if (typeof window.renderJutsuSlots === 'function') {
      window.renderJutsuSlots(uid);
    }
    if (typeof window.refreshJutsuEquipmentBindings === 'function') {
      window.refreshJutsuEquipmentBindings();
    }

    showModal();
  }

  function showModal() {
    MODAL.classList.add("open");
    MODAL.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    MODAL.classList.remove("open");
    MODAL.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  MODAL_CLOSE?.addEventListener("click", closeModal);
  MODAL?.addEventListener("click", (e) => { if (e.target === MODAL) closeModal(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && MODAL.classList.contains("open")) closeModal(); });

  /* ---------- Tabs ---------- */
  function setActiveTab(tab) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("is-active", p.id === `tab-${tab}`));
  }
  function wireTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.onclick = () => setActiveTab(btn.dataset.tab));
  }
  wireTabs();

  /* ---------- STATUS tab ---------- */
  async function renderStatusTab(c, inst, tier) {
    // Compute stats (with limit break if applicable)
    let stats = {};
    if (hasProg && window.Progression.computeEffectiveStatsLoreTier) {
      // Calculate extended cap if limit breaks are present
      let extendedCap = null;
      if (hasLimitBreak && inst.limitBreakLevel && inst.limitBreakLevel > 0) {
        extendedCap = window.LimitBreak.getExtendedLevelCap(tier, inst.limitBreakLevel);
      }

      const comp = window.Progression.computeEffectiveStatsLoreTier(c, safeNum(inst.level,1), tier, {
        normalize: true,
        extendedCap: extendedCap
      });
      stats = comp?.stats || {};

      // Apply limit break bonuses if present
      if (hasLimitBreak && inst.limitBreakLevel && inst.limitBreakLevel > 0) {
        stats = window.LimitBreak.applyLimitBreakToStats(stats, inst.limitBreakLevel);
      }

      // Calculate power: Health + Attack + Speed
      const power = (stats.hp || 0) + (stats.atk || 0) + (stats.speed || 0);

      // Save power data for sync with Tools page
      if (inst.uid) {
        const powerData = {
          uid: inst.uid,
          power: power,
          health: stats.hp || 0,
          attack: stats.atk || 0,
          speed: stats.speed || 0,
          lastUpdated: Date.now()
        };
        localStorage.setItem(`character_power_${inst.uid}`, JSON.stringify(powerData));
      }

      // Calculate power grade
      const unlockedAbilities = (inst.unlockedAbilities || []).length;
      const powerGrade = calculatePowerGrade(power, unlockedAbilities);
      const totalPower = power + (unlockedAbilities * 30000);

      // Render stats
      STATS_WRAP.innerHTML = `
        <div class="stats-divider">
          <img src="assets/Stats/statsdiv.png" alt="" onerror="this.style.display='none';" />
        </div>
        <div class="stat-row">
          <img src="assets/ui/healthstat.png" alt="Health" />
          <span class="stat-label">Health</span>
          <span class="stat-value">${stats.hp ?? "-"}</span>
        </div>
        <div class="stat-row">
          <img src="assets/ui/strengthstat.png" alt="Attack" />
          <span class="stat-label">Attack</span>
          <span class="stat-value">${stats.atk ?? "-"}</span>
        </div>
        <div class="stat-row">
          <img src="assets/ui/speedstat.png" alt="Speed" />
          <span class="stat-label">Speed</span>
          <span class="stat-value">${stats.speed ?? "-"}</span>
        </div>
        <div class="equip-divider">
          <img src="assets/Stats/equipdiv.png" alt="" onerror="this.style.display='none';" />
        </div>
        <div class="equipment-grid">
          ${Array(5).fill(0).map((_, i) => `<div class="equipment-slot" data-slot="${i + 1}"><img src="assets/Stats/emptyslot.png" alt="Empty Slot ${i + 1}" onerror="this.style.display='none';" /></div>`).join('')}
        </div>`;

      // Render power holder under character art
      const powerHolderContainer = document.getElementById('char-power-holder-container');
      if (powerHolderContainer) {
        powerHolderContainer.innerHTML = `
          <div class="power-holder-container">
            <div class="power-holder-content">
              <div class="power-grade">${getPowerGradeElement(powerGrade)}</div>
              <div class="power-value">${totalPower.toLocaleString()}</div>
            </div>
          </div>`;
      }
    } else {
      const s = c.statsBase || {};

      // Calculate power: Health + Attack + Speed
      const power = (s.hp || 0) + (s.atk || 0) + (s.speed || 0);

      // Save power data for sync with Tools page
      if (inst.uid) {
        const powerData = {
          uid: inst.uid,
          power: power,
          health: s.hp || 0,
          attack: s.atk || 0,
          speed: s.speed || 0,
          lastUpdated: Date.now()
        };
        localStorage.setItem(`character_power_${inst.uid}`, JSON.stringify(powerData));
      }

      // Calculate power grade
      const unlockedAbilities = (inst.unlockedAbilities || []).length;
      const powerGrade = calculatePowerGrade(power, unlockedAbilities);
      const totalPower = power + (unlockedAbilities * 30000);

      // Render stats
      STATS_WRAP.innerHTML = `
        <div class="stats-divider">
          <img src="assets/Stats/statsdiv.png" alt="" onerror="this.style.display='none';" />
        </div>
        <div class="stat-row">
          <img src="assets/ui/healthstat.png" alt="Health" />
          <span class="stat-label">Health</span>
          <span class="stat-value">${s.hp ?? "-"}</span>
        </div>
        <div class="stat-row">
          <img src="assets/ui/strengthstat.png" alt="Attack" />
          <span class="stat-label">Attack</span>
          <span class="stat-value">${s.atk ?? "-"}</span>
        </div>
        <div class="stat-row">
          <img src="assets/ui/speedstat.png" alt="Speed" />
          <span class="stat-label">Speed</span>
          <span class="stat-value">${s.speed ?? "-"}</span>
        </div>
        <div class="equip-divider">
          <img src="assets/Stats/equipdiv.png" alt="" onerror="this.style.display='none';" />
        </div>
        <div class="equipment-grid">
          ${Array(5).fill(0).map((_, i) => `<div class="equipment-slot" data-slot="${i + 1}"><img src="assets/Stats/emptyslot.png" alt="Empty Slot ${i + 1}" onerror="this.style.display='none';" /></div>`).join('')}
        </div>`;

      // Render power holder under character art
      const powerHolderContainer = document.getElementById('char-power-holder-container');
      if (powerHolderContainer) {
        powerHolderContainer.innerHTML = `
          <div class="power-holder-container">
            <div class="power-holder-content">
              <div class="power-grade">${getPowerGradeElement(powerGrade)}</div>
              <div class="power-value">${totalPower.toLocaleString()}</div>
            </div>
          </div>`;
      }
    }

    // Get base tier cap (without limit breaks) for awakening checks
    const baseCap = tierCap(c, tier);

    // Display cap includes limit break extensions
    let cap = baseCap;
    if (hasLimitBreak && inst.limitBreakLevel && inst.limitBreakLevel > 0) {
      cap = window.LimitBreak.getExtendedLevelCap(tier, inst.limitBreakLevel);
    }

    const level = Math.max(1, safeNum(inst.level, 1));
    const isMax = level >= cap;
    const isMaxBaseTier = level >= baseCap; // At base tier max (for awakening)

    // Update level display with red color when level > 100 or at MAX (150)
    // Remove any existing special classes first
    LV_VALUE_EL.classList.remove('limit-break', 'limit-break-max', 'max');

    if (level >= 150) {
      LV_VALUE_EL.textContent = "MAX";
      LV_VALUE_EL.classList.add('limit-break-max');
    } else if (level > 100) {
      LV_VALUE_EL.textContent = String(level);
      LV_VALUE_EL.classList.add('limit-break');
    } else if (isMax) {
      LV_VALUE_EL.textContent = "MAX";
      LV_VALUE_EL.classList.add('max');
    } else {
      LV_VALUE_EL.textContent = String(level);
    }
    LV_CAP_EL.textContent   = String(cap);

    // Awakening check - use base tier cap, not extended cap
    const canAwaken = hasProg && typeof window.Progression.canAwaken === "function" && isMaxBaseTier && window.Progression.canAwaken(inst, c);

    BTN_AWAKEN.disabled = !canAwaken;
    TIP_EL.textContent = canAwaken ? "Ready to awaken." : (isMaxBaseTier ? "Max tier level reached." : `Level up to ${baseCap} to awaken.`);

    // Limit break display
    const maxLB = hasLimitBreak ? window.LimitBreak.getMaxLimitBreakLevel(tier) : 0;
    const currentLB = inst.limitBreakLevel || 0;

    if (maxLB > 0 && LB_INFO) {
      LB_INFO.style.display = "block";
      if (LB_CURRENT) LB_CURRENT.textContent = currentLB;
      if (LB_MAX) LB_MAX.textContent = maxLB;

      if (LB_BONUS && currentLB > 0) {
        const bonus = window.LimitBreak.computeLimitBreakBonus(currentLB);
        LB_BONUS.innerHTML = `Stat Bonus: HP +${(bonus.hp * 100).toFixed(1)}%, ATK +${(bonus.atk * 100).toFixed(1)}%, DEF +${(bonus.def * 100).toFixed(1)}%`;
      } else if (LB_BONUS) {
        LB_BONUS.innerHTML = "No limit breaks applied yet.";
      }
    } else if (LB_INFO) {
      LB_INFO.style.display = "none";
    }

    // Limit break button
    const canLB = hasLimitBreak && await window.LimitBreak.canLimitBreak(inst, c);
    const canAffordLB = hasLimitBreak && await window.LimitBreak.canAffordLimitBreak(inst, c);
    if (BTN_LIMITBREAK) {
      BTN_LIMITBREAK.disabled = !canLB || !canAffordLB;
    }

    // Display awakening materials
    if (hasAwakening && MATERIALS_DISPLAY) {
      await renderMaterials(inst, c, tier);
    }

    wireStatusButtons(c, inst, tier);
  }
  window.renderStatusTab = renderStatusTab;

  /* ---------- Dupe Selector Modal ---------- */
  function openDupeSelector(mainInst, character) {
    const dupes = window.InventoryChar.instancesOf(character.id)
      .filter(inst => inst.uid !== mainInst.uid); // Exclude the main character

    if (dupes.length === 0) {
      if (window.ModalManager) {
        window.ModalManager.showInfo("No duplicates available to feed!");
      }
      return;
    }

    // Get ability unlock progress
    const unlockedCount = (mainInst.unlockedAbilities || []).length;
    const maxAbilities = character.abilities ? character.abilities.length : 0;
    const remainingAbilities = maxAbilities - unlockedCount;

    // Update modal title with progress
    const modalTitle = document.querySelector('.dupe-modal-title');
    if (modalTitle) {
      modalTitle.innerHTML = `
        Select Duplicate to Feed
        <div style="font-size: 14px; color: #d9b362; margin-top: 8px; font-weight: normal;">
          Abilities Unlocked: ${unlockedCount}/${maxAbilities}
          ${remainingAbilities > 0 ? `<br><span style="color: #b8985f;">Feed ${remainingAbilities} more duplicate${remainingAbilities === 1 ? '' : 's'} to unlock all abilities</span>` : '<br><span style="color: #62d98f;">All abilities unlocked!</span>'}
        </div>
      `;
    }

    // Render dupe grid
    DUPE_GRID.innerHTML = dupes.map((dupe, index) => {
      const tier = dupe.tierCode || minTier(character);
      const art = resolveTierArt(character, tier);
      const willUnlock = index < remainingAbilities ?
        `<div style="position:absolute; top:4px; right:4px; background:rgba(212,175,55,0.9); color:#111; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600;">WILL UNLOCK</div>` : '';
      return `
        <div class="dupe-card" data-uid="${dupe.uid}">
          ${willUnlock}
          <img class="dupe-card-portrait" src="${safeStr(art.portrait, character.portrait)}" alt="${character.name}"
               onerror="this.onerror=null;this.src='assets/characters/_common/silhouette.png';" />
          <div class="dupe-card-level">Lv ${dupe.level || 1}</div>
        </div>
      `;
    }).join("");

    // Wire up clicks
    DUPE_GRID.querySelectorAll('.dupe-card').forEach(card => {
      card.addEventListener('click', async () => {
        const dupeUid = card.getAttribute('data-uid');
        await handleDupeFeeding(mainInst.uid, dupeUid, character);
        closeDupeModal();
      });
    });

    showDupeModal();
  }

  function showDupeModal() {
    DUPE_MODAL.classList.add("open");
    DUPE_MODAL.setAttribute("aria-hidden", "false");
  }

  function closeDupeModal() {
    DUPE_MODAL.classList.remove("open");
    DUPE_MODAL.setAttribute("aria-hidden", "true");
  }

  async function handleDupeFeeding(mainUid, dupeUid, character) {
    const result = window.InventoryChar.feedDupe(mainUid, dupeUid, character);

    if (!result.ok) {
      const messages = {
        'NO_ABILITIES_TO_UNLOCK': "This character has no abilities to unlock!",
        'MAIN_NOT_FOUND': "Main character not found!",
        'DUPE_NOT_FOUND': "Duplicate not found!",
        'CHARACTER_MISMATCH': "Characters don't match!",
        'ALL_ABILITIES_UNLOCKED': "All abilities are already unlocked!"
      };
      if (window.ModalManager) { window.ModalManager.showInfo(messages[result.reason] || "Failed to feed duplicate!"); };
      return;
    }

    // Success! Update the UI
    const freshInst = window.InventoryChar.getByUid(mainUid);
    const tier = freshInst.tierCode || minTier(character);

    renderGrid();
    renderAbilitiesTab(character, freshInst);

    // Refresh passive icons to show newly unlocked icon
    if (window.characterAbilities) {
      window.characterAbilities.renderPassiveIcons();
    }

    // Update Feed Dupe button state
    const hasDupes = window.InventoryChar.instancesOf(character.id).length > 1;
    const allUnlocked = result.totalUnlocked >= result.maxAbilities;
    if (BTN_FEEDDUPE) {
      BTN_FEEDDUPE.disabled = !hasDupes || allUnlocked;
    }

    // Trigger daily mission
    if (window.DailyMissions) {
      const dailyResult = await window.DailyMissions.incrementDaily('daily_feed_dupe');
      if (dailyResult && dailyResult.completed) {
        if (window.ModalManager) { window.ModalManager.showInfo(`Daily Mission Completed!\n${dailyResult.dailyName}`); };
      }
    }

    if (window.ModalManager) { window.ModalManager.showInfo(`Ability unlocked!\n\n${result.unlockedAbility.name}\n${result.unlockedAbility.description || result.unlockedAbility}\n\nTotal: ${result.totalUnlocked}/${result.maxAbilities} abilities unlocked`); };
  }

  if (DUPE_CANCEL) {
    DUPE_CANCEL.addEventListener('click', closeDupeModal);
  }

  if (DUPE_MODAL) {
    DUPE_MODAL.addEventListener('click', (e) => {
      if (e.target === DUPE_MODAL) closeDupeModal();
    });
  }

  /* ---------- Ramen Selector Modal ---------- */
  let ramenClickCounts = {}; // Track click counts for each ramen

  function openRamenSelector(inst, character) {
    if (!hasResources) {
      if (window.ModalManager) { window.ModalManager.showInfo("Resources system not available!"); };
      return;
    }

    // Reset click counts
    ramenClickCounts = {};

    const tier = inst.tierCode || minTier(character);
    let cap = tierCap(character, tier);

    // Apply extended level cap from limit breaks
    if (hasLimitBreak && inst.limitBreakLevel && inst.limitBreakLevel > 0) {
      cap = window.LimitBreak.getExtendedLevelCap(tier, inst.limitBreakLevel);
    }

    const currentLevel = inst.level || 1;

    if (currentLevel >= cap) {
      if (window.ModalManager) { window.ModalManager.showInfo("Character is already at max level!"); };
      return;
    }

    // Update character info in modal
    const art = resolveTierArt(character, tier);
    RAMEN_CHAR_PORTRAIT.src = art.portrait;
    RAMEN_CHAR_NAME.textContent = character.name || "Unknown";
    RAMEN_CHAR_LEVEL.textContent = `Lv ${currentLevel}/${cap}`;

    // Get all ramen from inventory
    const allRamen = window.Resources.getItemsByCategory('ramen');
    const availableRamen = allRamen.filter(r => r.quantity > 0);

    if (availableRamen.length === 0) {
      RAMEN_GRID.innerHTML = `
        <div class="ramen-empty-state">
          <div class="ramen-empty-icon">🍜</div>
          <div class="ramen-empty-text">No Ramen Available</div>
          <div class="ramen-empty-subtext">Visit the Shop to purchase ramen or complete missions to earn them!</div>
        </div>
      `;
      showRamenModal();
      return;
    }

    // Sort ramen by tier (element doesn't matter for feeding)
    availableRamen.sort((a, b) => (a.exp || 0) - (b.exp || 0));

    // Render ramen cards with click counters
    RAMEN_GRID.innerHTML = '';
    availableRamen.forEach(ramen => {
      const card = document.createElement('div');
      card.className = 'ramen-card';
      card.setAttribute('data-ramen-id', ramen.id);
      if (ramen.element) {
        card.setAttribute('data-element', ramen.element);
      }

      ramenClickCounts[ramen.id] = 0;

      card.innerHTML = `
        <img src="${ramen.icon}" alt="${ramen.name}" class="ramen-icon" onerror="this.onerror=null; this.style.display='none';">
        <div class="ramen-name">${ramen.name}</div>
        <div class="ramen-exp">+${ramen.exp.toLocaleString()} EXP</div>
        <div class="ramen-quantity">×${ramen.quantity}</div>
        <div class="ramen-counter" id="counter-${ramen.id}">0</div>
      `;

      card.addEventListener('click', (e) => {
        // Increment counter
        if (ramenClickCounts[ramen.id] < ramen.quantity) {
          ramenClickCounts[ramen.id]++;
          const counterEl = document.getElementById(`counter-${ramen.id}`);
          if (counterEl) {
            counterEl.textContent = ramenClickCounts[ramen.id];
            counterEl.classList.add('active');
          }
        }
      });

      // Right-click to decrement
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (ramenClickCounts[ramen.id] > 0) {
          ramenClickCounts[ramen.id]--;
          const counterEl = document.getElementById(`counter-${ramen.id}`);
          if (counterEl) {
            counterEl.textContent = ramenClickCounts[ramen.id];
            if (ramenClickCounts[ramen.id] === 0) {
              counterEl.classList.remove('active');
            }
          }
        }
      });

      RAMEN_GRID.appendChild(card);
    });

    // Add "Use Ramen" button
    const useButton = document.createElement('button');
    useButton.className = 'ramen-use-button';
    useButton.textContent = 'Use Selected Ramen';
    useButton.addEventListener('click', async () => {
      await processRamenFeeding(inst, character, cap);
    });
    RAMEN_GRID.appendChild(useButton);

    showRamenModal();
  }

  function showRamenModal() {
    RAMEN_MODAL.classList.add("open");
    RAMEN_MODAL.setAttribute("aria-hidden", "false");
  }

  function closeRamenModal() {
    RAMEN_MODAL.classList.remove("open");
    RAMEN_MODAL.setAttribute("aria-hidden", "true");
  }

  async function processRamenFeeding(inst, character, cap) {
    if (!hasResources) return;

    // Collect all selected ramen
    const selectedRamen = Object.entries(ramenClickCounts).filter(([id, count]) => count > 0);

    if (selectedRamen.length === 0) {
      if (window.ModalManager) { window.ModalManager.showInfo("Please select ramen to use by clicking on them!"); };
      return;
    }

    // Calculate total EXP
    let totalExp = 0;
    const ramenDetails = [];

    for (const [ramenId, amount] of selectedRamen) {
      const ramenInfo = window.Resources.getMaterialInfo(ramenId);
      const expGain = (ramenInfo.exp || 0) * amount;
      totalExp += expGain;
      ramenDetails.push({ id: ramenId, name: ramenInfo.name, amount, exp: expGain });
    }

    const currentLevel = inst.level || 1;

    // Calculate level gains
    let levelsGained = 0;
    let newLevel = currentLevel;
    let remainingExp = totalExp;

    while (remainingExp > 0 && newLevel < cap) {
      const expNeeded = Math.floor(100 * newLevel); // Progressive EXP requirement
      if (remainingExp >= expNeeded) {
        remainingExp -= expNeeded;
        newLevel++;
        levelsGained++;
      } else {
        break;
      }
    }

    // Cap at maximum level
    newLevel = Math.min(newLevel, cap);
    levelsGained = newLevel - currentLevel;

    // Build confirmation message
    let confirmMsg = `Use the following ramen?\n\n`;
    ramenDetails.forEach(r => {
      confirmMsg += `${r.name} x${r.amount} (+${r.exp.toLocaleString()} EXP)\n`;
    });
    confirmMsg += `\nTotal EXP: ${totalExp.toLocaleString()}\n`;
    confirmMsg += `Current Level: ${currentLevel}\n`;
    confirmMsg += `New Level: ${newLevel}${levelsGained > 0 ? ` (+${levelsGained})` : ''}\n`;

    if (window.ModalManager) {
      window.ModalManager.showConfirm(
        confirmMsg,
        () => {
          // Consume all selected ramen
          for (const [ramenId, amount] of selectedRamen) {
            window.Resources.subtract(ramenId, amount);
          }

          // Level up character
          inst.level = newLevel;
          window.InventoryChar.updateInstance(inst.uid, inst);

          // Daily mission check
          if (window.DailyMissions) {
            const result = window.DailyMissions.recordAction('level_up_character');
            if (result?.completed) {
              if (window.ModalManager) { window.ModalManager.showInfo(`Daily Mission Completed!\n${result.dailyName}`); };
            }
          }

          // Success message
          if (window.ModalManager) { window.ModalManager.showInfo(`Success!\n\n+${totalExp.toLocaleString()} EXP\n${levelsGained > 0 ? `Gained ${levelsGained} level${levelsGained > 1 ? 's' : ''}!` : 'EXP stored for next level'}\n\nNew Level: ${newLevel}/${cap}`); }

          // Close modal and refresh grid
          closeRamenModal();
          renderGrid();
        },
        () => {
          // User cancelled
        }
      );
      return;
    }

    // Fallback if ModalManager not available
    // Consume all selected ramen
    for (const [ramenId, amount] of selectedRamen) {
      window.Resources.subtract(ramenId, amount);
    }

    // Level up character
    inst.level = newLevel;
    window.InventoryChar.updateInstance(inst.uid, inst);

    // Refresh UI
    LV_VALUE_EL.textContent = (newLevel >= cap) ? "MAX" : String(newLevel);
    if (character) window.renderStatusTab(character, inst, inst.tierCode || minTier(character));

    // Trigger daily mission
    if (window.DailyMissions) {
      const result = await window.DailyMissions.incrementDaily('daily_level_up');
      if (result && result.completed) {
        if (window.ModalManager) { window.ModalManager.showInfo(`Daily Mission Completed!\n${result.dailyName}`); };
      }
    }

    // Success message
    if (window.ModalManager) { window.ModalManager.showInfo(`Success!\n\n+${totalExp.toLocaleString()} EXP\n${levelsGained > 0 ? `Gained ${levelsGained} level${levelsGained > 1 ? 's' : ''}!` : 'EXP stored for next level'}\n\nNew Level: ${newLevel}/${cap}`); }

    // Close modal and refresh grid
    closeRamenModal();
    renderGrid();
  }

  if (RAMEN_CANCEL) {
    RAMEN_CANCEL.addEventListener('click', closeRamenModal);
  }

  if (RAMEN_MODAL) {
    RAMEN_MODAL.addEventListener('click', (e) => {
      if (e.target === RAMEN_MODAL) closeRamenModal();
    });
  }

  /* ---------- Materials Display ---------- */
  async function renderMaterials(inst, c, tier) {
    if (!hasAwakening || !hasResources) {
      MATERIALS_DISPLAY.innerHTML = "";
      return;
    }

    const reqs = await window.Awakening.getRequirements(tier);

    if (!reqs || !reqs.materials) {
      MATERIALS_DISPLAY.innerHTML = '<div class="no-requirements">No awakening materials required for this tier.</div>';
      return;
    }

    let html = '<div class="materials-title">Awakening Materials Required</div>';

    for (const [matId, required] of Object.entries(reqs.materials)) {
      const owned = window.Resources.get(matId);
      const matInfo = window.Resources.getMaterialInfo(matId);
      const sufficient = owned >= required;
      const className = sufficient ? "sufficient" : "insufficient";

      html += `
        <div class="material-item">
          <span class="material-name">${matInfo.name}</span>
          <span class="material-amount ${className}">${owned}/${required}</span>
        </div>
      `;
    }

    MATERIALS_DISPLAY.innerHTML = html;
  }

  function wireStatusButtons(c, inst, tierOrNull) {
    BTN_LVUP.onclick = () => {
      if (!c) return;
      openRamenSelector(inst, c);
    };

    BTN_FEEDDUPE.onclick = () => {
      if (!c?.id) return;

      // Check if character has abilities that can be unlocked
      const hasAbilities = c.abilities && c.abilities.length > 0;
      const currentUnlocks = inst.dupeUnlocks || 0;
      const canUnlockMore = hasAbilities && currentUnlocks < c.abilities.length;

      if (!canUnlockMore) {
        if (window.ModalManager) { window.ModalManager.showInfo(hasAbilities
          ? "All abilities already unlocked!"
          : "This character has no abilities to unlock."); };
        return;
      }

      // Get all duplicates of the same character (excluding current one)
      const allCopies = window.InventoryChar.instancesOf(c.id);
      const duplicates = allCopies.filter(copy => copy.uid !== inst.uid);

      if (duplicates.length === 0) {
        if (window.ModalManager) { window.ModalManager.showInfo("No duplicates available to feed!\n\nYou need another copy of this character to unlock abilities."); };
        return;
      }

      // Build selection dialog
      const nextAbility = c.abilities[currentUnlocks];

      const options = duplicates.map(dupe => {
        const dupeStars = starsFromTier(dupe.tierCode || minTier(c));
        return {
          id: dupe.uid,
          name: `Level ${dupe.level} (${dupeStars} stars)`,
          description: `UID: ${dupe.uid.substring(0, 8)}`
        };
      });

      if (window.ModalManager) {
        window.ModalManager.showSelection(
          `Feed Duplicate - Unlock: ${nextAbility.name}\n${nextAbility.description}`,
          options,
          (selected) => {
            const selectedDupe = duplicates.find(d => d.uid === selected.id);
            if (!selectedDupe) return;

            // Confirm the feeding
            const dupeStars = starsFromTier(selectedDupe.tierCode || minTier(c));
            const confirmMsg = `Are you sure you want to feed this duplicate?\n\n` +
                              `Feeding: Lv ${selectedDupe.level} (${dupeStars} stars)\n` +
                              `To unlock: ${nextAbility.name}\n\n` +
                              `This will permanently remove the duplicate from your inventory.`;

            window.ModalManager.showConfirm(
              confirmMsg,
              () => {
                // Feed the duplicate
                if (window.characterDupeAbilities) {
                  const result = window.characterDupeAbilities.feedDuplicateForAbility(inst, selectedDupe, c);

                  if (result.success) {
                    if (window.ModalManager) { window.ModalManager.showSuccess(`Ability Unlocked!\n\n${result.abilityName}\n${result.abilityDescription}\n\nProgress: ${result.unlockedCount}/${result.maxAbilities}`); };
                    renderGrid();
                    openModal(inst.uid);
                  } else {
                    if (window.ModalManager) { window.ModalManager.showInfo(result.message); };
                  }
                }
              },
              null
            );
          },
          null
        );
        return;
      }

      // Fallback (should not reach here if ModalManager loaded)
      // Feed the duplicate
      if (window.characterDupeAbilities) {
        const result = window.characterDupeAbilities.unlockNextAbility(inst.uid);
        if (result.success) {
          // Remove the fed duplicate from inventory
          window.InventoryChar.removeOneByUid(selectedDupe.uid);

          if (window.ModalManager) { window.ModalManager.showSuccess(` Ability Unlocked!\n\n${result.abilityName}\n${result.abilityDescription}\n\nProgress: ${result.unlockedCount}/${result.maxAbilities}`); };

          // Refresh displays
          window.characterDupeAbilities.refresh();
          renderGrid();
        } else {
          if (window.ModalManager) { window.ModalManager.showInfo(` ${result.message}`); };
        }
      }
    };

    /* Remove Copy button removed per user request
    BTN_REMOVE.onclick = () => {
      window.InventoryChar.removeOneByUid(inst.uid);
      renderGrid();
      closeModal();
    };
    */

    // Feed Dupe button
    if (BTN_FEEDDUPE) {
      // Check if character has abilities and if there are duplicates available
      const hasDupes = window.InventoryChar.instancesOf(c.id).length > 1;
      const hasAbilities = c.abilities && Array.isArray(c.abilities) && c.abilities.length > 0;
      const unlockedCount = (inst.unlockedAbilities || []).length;
      const maxAbilities = c.abilities ? c.abilities.length : 0;
      const allUnlocked = unlockedCount >= maxAbilities;

      // Update button text to show progress
      if (hasAbilities) {
        BTN_FEEDDUPE.textContent = `Latent Awaken (${unlockedCount}/${maxAbilities})`;

        // Add tooltip hint
        if (allUnlocked) {
          BTN_FEEDDUPE.title = "All abilities unlocked!";
        } else if (!hasDupes) {
          BTN_FEEDDUPE.title = "No duplicates available. Summon more copies to unlock abilities.";
        } else {
          BTN_FEEDDUPE.title = `Feed duplicates to unlock abilities. ${maxAbilities - unlockedCount} remaining.`;
        }
      } else {
        BTN_FEEDDUPE.textContent = "Latent Awaken";
        BTN_FEEDDUPE.title = "This character has no abilities to unlock";
      }

      BTN_FEEDDUPE.disabled = !hasDupes || !hasAbilities || allUnlocked;

      BTN_FEEDDUPE.onclick = () => {
        if (BTN_FEEDDUPE.disabled) return;
        openDupeSelector(inst, c);
      };
    }

    BTN_AWAKEN.onclick = async () => {
      if (!c) return;
      if (!(hasProg && typeof window.Progression.canAwaken === "function" && window.Progression.canAwaken(inst, c))) return;

      // Use new Awakening system if available
      let res;
      if (hasAwakening) {
        const canAfford = await window.Awakening.canAffordAwaken(inst, c);
        if (!canAfford) {
          if (window.ModalManager) { window.ModalManager.showInfo("You don't have enough materials to awaken this character!"); };
          return;
        }

        res = await window.Awakening.performAwaken(inst, c, "reset");
      } else {
        // Fallback to old system
        res = (typeof window.InventoryChar.promoteTier === "function")
          ? window.InventoryChar.promoteTier(inst.uid, "reset", c)
          : window.Progression.promoteTier(inst, c, "reset");
      }

      if (!res?.ok) {
        if (window.ModalManager) { window.ModalManager.showInfo(res.reason === "INSUFFICIENT_MATERIALS"
          ? "Insufficient materials for awakening!"
          : "Max tier reached or cannot awaken."); };
        return;
      }

      // Check if character transformed to a new ID
      console.log("[UI Debug] Awakening result:", { transformed: res.transformed, newCharacterId: res.newCharacterId, tier: res.tier });

      // Function to update UI after awakening (used after animation or immediately)
      const updateUIAfterAwakening = async () => {
        const fresh = window.InventoryChar.getByUid(inst.uid);
        const newTier = fresh?.tierCode || maxTier(c);

        // Force refresh artwork with cache busting
        const art = resolveTierArt(c, newTier);
        const timestamp = Date.now();
        MODAL_IMG.src = safeStr(art.full, art.portrait) + `?t=${timestamp}`;
        NP_STARS.innerHTML = renderStars(starsFromTier(newTier));

        // Update nameplate with new character name/version
        NP_NAME.textContent = c.name || "";
        NP_VERSION.textContent = c.version || "";

        // Update all UI elements
        await window.renderStatusTab(c, fresh, newTier);
        renderSkillsTab(c, fresh, newTier);

        // Force refresh the inventory grid to show updated character
        renderGrid();

        // Log successful UI update
        console.log(`[UI Debug] UI fully refreshed for ${c.name} (${c.id}) at tier ${newTier}`);
      };

      if (res.transformed && res.newCharacterId) {
        console.log(`[UI Debug] Character transformed from ${inst.charId} to ${res.newCharacterId}`);

        // *** GET OLD CHARACTER DATA BEFORE UPDATING ANYTHING ***
        const oldCharacterName = c.name;
        const oldTier = inst.tierCode || maxTier(c);
        const oldArt = resolveTierArt(c, oldTier);
        const oldArtworkUrl = safeStr(oldArt.full, oldArt.portrait);
        console.log(`[UI Debug] Saved old character data: ${oldCharacterName} at tier ${oldTier}`);
        console.log(`[UI Debug] Old artwork URL: ${oldArtworkUrl}`);

        // Get the new character data from BYID
        const newCharacter = BYID[res.newCharacterId];
        if (newCharacter) {
          console.log(`[UI Debug] Loaded new character: ${newCharacter.name} (${newCharacter.id})`);

          // Calculate new character artwork
          const newArt = resolveTierArt(newCharacter, res.tier);
          const newArtworkUrl = safeStr(newArt.full, newArt.portrait);
          console.log(`[UI Debug] New artwork URL: ${newArtworkUrl}`);

          // Save the UID for later
          const currentUid = inst.uid;

          // 🚀 1. Play animation FIRST (modal stays open, animation plays as overlay)
          if (window.AwakeningAnimation && typeof window.AwakeningAnimation.play === 'function') {
            try {
              console.log("[UI Debug] Playing awakening animation (modal stays open)...");
              console.log("[UI Debug] Old character:", oldCharacterName, "→ New character:", newCharacter.name);
              console.log("[UI Debug] Old artwork:", oldArtworkUrl);
              console.log("[UI Debug] New artwork:", newArtworkUrl);

              // Play animation - modal stays open during animation
              window.AwakeningAnimation.play(
                oldCharacterName,
                newCharacter.name,
                oldArtworkUrl,
                newArtworkUrl,
                () => {
                  console.log("[UI Debug] Animation completed");

                  // 🧠 2. NOW close modal (after animation)
                  closeModal();

                  // 💾 3. Update localStorage with new character data
                  console.log("[UI Debug] Updating localStorage with new character ID...");
                  window.InventoryChar.updateInstance(currentUid, {
                    charId: res.newCharacterId,
                    tierCode: res.tier,
                    level: res.level ?? 1
                  });
                  console.log("[UI Debug] LocalStorage updated successfully");

                  // 🔄 4. Reopen modal with refreshed data
                  setTimeout(() => {
                    openModalByUid(currentUid);
                    console.log("[UI Debug] Modal reopened with updated character data");

                    // Force refresh the inventory grid to show updated character
                    renderGrid();

                    // Trigger daily mission
                    if (window.DailyMissions) {
                      window.DailyMissions.incrementDaily('daily_awaken').then(dailyResult => {
                        if (dailyResult && dailyResult.completed) {
                          if (window.ModalManager) { window.ModalManager.showInfo(`Daily Mission Completed!\n${dailyResult.dailyName}`); };
                        }
                      });
                    }
                  }, 100);
                },
                'gold' // Default theme: darker gold
              );
            } catch (error) {
              console.error("[UI Debug] Animation error:", error);
              // If animation fails, still update and refresh
              window.InventoryChar.updateInstance(currentUid, {
                charId: res.newCharacterId,
                tierCode: res.tier,
                level: res.level ?? 1
              });
              closeModal();
              setTimeout(() => {
                openModalByUid(currentUid);
                renderGrid();
              }, 100);
            }
          } else {
            console.warn("[UI Debug] AwakeningAnimation not available");
            // If no animation, just update and refresh
            window.InventoryChar.updateInstance(currentUid, {
              charId: res.newCharacterId,
              tierCode: res.tier,
              level: res.level ?? 1
            });
            closeModal();
            setTimeout(() => {
              openModalByUid(currentUid);
              renderGrid();
            }, 100);
          }
        } else {
          console.error("[UI Debug] Failed to load new character:", res.newCharacterId);
          await updateUIAfterAwakening();
        }
      } else {
        console.log("[UI Debug] Standard awakening without transformation");
        // Standard awakening without transformation
        if (!res.persisted && res.tier) {
          window.InventoryChar.updateInstance(inst.uid, { tierCode: res.tier, level: res.level ?? 1 });
        }

        // *** FORCE COMPLETE MODAL REFRESH VIA AJAX (same as transformation path) ***
        const currentUid = inst.uid;
        console.log("[UI Debug] Forcing complete modal refresh for UID:", currentUid);

        // Close current modal
        closeModal();

        // Immediately reopen with fresh data from localStorage (AJAX pattern)
        setTimeout(() => {
          openModalByUid(currentUid);
          console.log("[UI Debug] Modal reopened with updated character data");

          // Force refresh the inventory grid to show updated character
          renderGrid();

          // Trigger daily mission
          if (window.DailyMissions) {
            window.DailyMissions.incrementDaily('daily_awaken').then(dailyResult => {
              if (dailyResult && dailyResult.completed) {
                if (window.ModalManager) { window.ModalManager.showInfo(`Daily Mission Completed!\n${dailyResult.dailyName}`); };
              }
            });
          }

          // Show success message
          if (window.ModalManager) {
            window.ModalManager.showInfo(`Successfully awakened ${c.name} to ${starsFromTier(res.tier)} stars!`);
          }
        }, 100); // Small delay to let modal close animation complete
      }
    };

    // Limit Break button
    if (BTN_LIMITBREAK) {
      BTN_LIMITBREAK.onclick = async () => {
        if (!c || !hasLimitBreak) return;

        const canLB = await window.LimitBreak.canLimitBreak(inst, c);
        if (!canLB) {
          if (window.ModalManager) { window.ModalManager.showInfo("This character cannot be limit broken yet. Must be at max evolution (no awakening possible) and max level."); };
          return;
        }

        const canAfford = await window.LimitBreak.canAffordLimitBreak(inst, c);
        if (!canAfford) {
          if (window.ModalManager) { window.ModalManager.showInfo("You don't have enough materials for limit break!"); };
          return;
        }

        const tier = inst.tierCode || minTier(c);
        const cost = await window.LimitBreak.getLimitBreakCost(tier, inst.limitBreakLevel || 0, c);

        let costStr = "Cost:\n";
        for (const [matId, amt] of Object.entries(cost)) {
          const matInfo = window.Resources.getMaterialInfo(matId);
          costStr += `${matInfo.name}: ${amt}\n`;
        }

        if (window.ModalManager) {
          window.ModalManager.showConfirm(
            `Limit Break ${c.name}?\n\n${costStr}`,
            async () => {
              const res = await window.LimitBreak.performLimitBreak(inst, c);

              if (!res?.ok) {
                if (window.ModalManager) { window.ModalManager.showError(res.reason === "INSUFFICIENT_MATERIALS"
                  ? "Insufficient materials!"
                  : "Limit break failed!"); };
                return;
              }

              // Get character artwork for animation
              const currentLB = inst.limitBreakLevel || 0;
              const newLB = res.limitBreakLevel;
              const art = resolveTierArt(c, tier);
              const artworkUrl = safeStr(art.full, art.portrait);

              // Save UID for later
              const currentUid = inst.uid;

              // Play limit break animation with purple theme
              if (window.AwakeningAnimation && typeof window.AwakeningAnimation.play === 'function') {
                try {
                  console.log("[Limit Break] Playing limit break animation...");
                  console.log(`[Limit Break] ${c.name} LB${currentLB} → LB${newLB}`);

                  // Play animation - use same character artwork for before/after
                  window.AwakeningAnimation.play(
                    `${c.name} LB${currentLB}`,
                    `${c.name} LB${newLB}`,
                    artworkUrl,
                    artworkUrl,
                    async () => {
                      console.log("[Limit Break] Animation completed");

                      // Update instance after animation
                      window.InventoryChar.updateInstance(currentUid, { limitBreakLevel: newLB });
                      const fresh = window.InventoryChar.getByUid(currentUid);

                      await window.renderStatusTab(c, fresh, tier);
                      renderGrid();

                      if (window.ModalManager) {
                        window.ModalManager.showSuccess(`Limit Break successful! ${c.name} is now LB${newLB}!`);
                      }
                    },
                    'purple'  // Purple theme for limit break
                  );
                } catch (error) {
                  console.error("[Limit Break] Animation error:", error);
                  // Fallback: update without animation
                  window.InventoryChar.updateInstance(currentUid, { limitBreakLevel: newLB });
                  const fresh = window.InventoryChar.getByUid(currentUid);

                  await window.renderStatusTab(c, fresh, tier);
                  renderGrid();

                  if (window.ModalManager) {
                    window.ModalManager.showSuccess(`Limit Break successful! ${c.name} is now LB${newLB}!`);
                  }
                }
              } else {
                console.warn("[Limit Break] AwakeningAnimation not available, updating without animation");
                // Fallback: update without animation
                window.InventoryChar.updateInstance(currentUid, { limitBreakLevel: newLB });
                const fresh = window.InventoryChar.getByUid(currentUid);

                await window.renderStatusTab(c, fresh, tier);
                renderGrid();

                if (window.ModalManager) {
                  window.ModalManager.showSuccess(`Limit Break successful! ${c.name} is now LB${newLB}!`);
                }
              }
            },
            null
          );
          return;
        }
      };
    }
  }

  /* ---------- SKILLS tab ---------- */
  function pickTierSkillEntry(skillObj, tier, fallbackTier) {
    if (!skillObj?.byTier) return null;
    if (skillObj.byTier[tier]) return skillObj.byTier[tier];
    if (fallbackTier && skillObj.byTier[fallbackTier]) return skillObj.byTier[fallbackTier];
    const first = Object.keys(skillObj.byTier)[0];
    return first ? skillObj.byTier[first] : null;
  }

  // Helper to extract multiplier from description if not explicitly provided
  function extractMultiplier(skillEntry) {
    if (skillEntry.multiplier) return skillEntry.multiplier;
    const match = skillEntry.description?.match(/(\d+\.?\d*x)/i);
    return match ? match[1] : "-";
  }

  function renderSkillsTab(c, inst, tier) {
    SKILLS_WRAP.innerHTML = "";
    const minT = minTier(c);
    const { jutsu=null, ultimate=null, secret=null } = c.skills || {};
    const cards = [];

    // Get character level for unlock checks
    const charLevel = Number(inst?.level || 1);
    const jutsuUnlocked = charLevel >= 20;
    const ultimateUnlocked = charLevel >= 50;

    if (jutsu) {
      const e = pickTierSkillEntry(jutsu, tier, minT);
      if (e) {
        // Check if jutsu is unlocked by level
        const lockOverlay = jutsuUnlocked ? '' : `<div class="lock-overlay"><img src="assets/icons/locked.png" alt="Locked" onerror="this.style.display='none';" /></div>`;
        const lockStatus = jutsuUnlocked ? '' : ` <span style="color:#d8b86a">(Requires Lv 20)</span>`;
        const cardClass = jutsuUnlocked ? '' : ' locked';
        const multiplier = extractMultiplier(e);
        cards.push(`
          <div class="skill-card${cardClass}">
            ${lockOverlay}
            <div class="skill-header"><span class="skill-type">Ninjutsu</span><span class="skill-name">${safeStr(jutsu.name,"Ninjutsu")}${lockStatus}</span></div>
            <div class="skill-meta">
              <span>Chakra: <strong>${safeNum(e.chakraCost,"-")}</strong></span>
              <span>CD: <strong>${safeNum(e.cooldown,"-")}</strong></span>
              <span>Range: <strong>${safeStr(e.range,"-")}</strong></span>
              <span>Hits: <strong>${safeNum(e.hits,"-")}</strong></span>
              <span>Mult: <strong>${multiplier}</strong></span>
            </div>
            <div class="skill-desc">${safeStr(e.description,"")}</div>
          </div>
        `);
      }
    }

    if (ultimate) {
      const e = pickTierSkillEntry(ultimate, tier, null);
      if (e) {
        // Check if ultimate is unlocked by level
        const lockOverlay = ultimateUnlocked ? '' : `<div class="lock-overlay"><img src="assets/icons/locked.png" alt="Locked" onerror="this.style.display='none';" /></div>`;
        const lockStatus = ultimateUnlocked ? '' : ` <span style="color:#d8b86a">(Requires Lv 50)</span>`;
        const cardClass = ultimateUnlocked ? '' : ' locked';
        const multiplier = extractMultiplier(e);
        cards.push(`
          <div class="skill-card ultimate${cardClass}">
            ${lockOverlay}
            <div class="skill-header"><span class="skill-type">Ultimate</span><span class="skill-name">${safeStr(ultimate.name,"Ultimate")}${lockStatus}</span></div>
            <div class="skill-meta">
              <span>Chakra: <strong>${safeNum(e.chakraCost,"-")}</strong></span>
              <span>CD: <strong>${safeNum(e.cooldown,"-")}</strong></span>
              <span>Range: <strong>${safeStr(e.range,"-")}</strong></span>
              <span>Hits: <strong>${safeNum(e.hits,"-")}</strong></span>
              <span>Mult: <strong>${multiplier}</strong></span>
            </div>
            <div class="skill-desc">${safeStr(e.description,"")}</div>
          </div>
        `);
      } else {
        cards.push(`
          <div class="skill-card ultimate locked">
            <div class="lock-overlay"><img src="assets/icons/locked.png" alt="Locked" onerror="this.style.display='none';" /></div>
            <div class="skill-header"><span class="skill-type">Ultimate</span><span class="skill-name">${safeStr(ultimate.name,"Ultimate")} <span style="color:#d8b86a">(Tier Locked)</span></span></div>
            <div class="skill-desc">Unlocks upon awakening to a higher star tier.</div>
          </div>
        `);
      }
    }

    /* === Secret Technique support (added without altering other logic) === */
    if (secret) {
      const e = pickTierSkillEntry(secret, tier, null);
      if (e) {
        cards.push(`
          <div class="skill-card secret">
            <div class="skill-header"><span class="skill-type">Secret</span><span class="skill-name">${safeStr(secret.name,"Secret Technique")}</span></div>
            <div class="skill-meta">
              <span>Chakra: <strong>${safeNum(e.chakraCost,"-")}</strong></span>
              <span>CD: <strong>${safeNum(e.cooldown,"-")}</strong></span>
              <span>Range: <strong>${safeStr(e.range,"-")}</strong></span>
            </div>
            <div class="skill-desc">${safeStr(e.description,"")}</div>
          </div>
        `);
      }
    }

    SKILLS_WRAP.innerHTML = cards.length ? cards.join("") : `<div class="skill-card">No skills available.</div>`;
  }
  window.renderSkillsTab = renderSkillsTab;

  /* ---------- F/B SKILLS tab ---------- */
  function renderSupportTab(c, inst, tier) {
    const blocks = [];

    // Handle field skill (can be string or nested object)
    const fieldSkill = c.fieldSkill || c.skills?.fieldSkill;
    if (fieldSkill) {
      let fieldText = '';
      if (typeof fieldSkill === 'string') {
        fieldText = fieldSkill;
      } else if (fieldSkill.byTier) {
        // Extract from byTier structure
        const entry = pickTierSkillEntry(fieldSkill, tier, null);
        fieldText = entry?.description || fieldSkill.description || fieldSkill.name || '';
      } else {
        fieldText = fieldSkill.description || fieldSkill.name || '';
      }
      if (fieldText) {
        blocks.push(`<div class="support-box"><strong>Field Skill</strong><div>${fieldText}</div></div>`);
      }
    }

    // Handle buddy skill (can be string or nested object)
    const buddySkill = c.buddySkill || c.skills?.buddySkill;
    if (buddySkill) {
      let buddyText = '';
      if (typeof buddySkill === 'string') {
        buddyText = buddySkill;
      } else if (buddySkill.byTier) {
        // Extract from byTier structure
        const entry = pickTierSkillEntry(buddySkill, tier, null);
        buddyText = entry?.description || buddySkill.description || buddySkill.name || '';
      } else {
        buddyText = buddySkill.description || buddySkill.name || '';
      }
      if (buddyText) {
        blocks.push(`<div class="support-box"><strong>Buddy Skill</strong><div>${buddyText}</div></div>`);
      }
    }

    if (Array.isArray(c.syncSkills) && c.syncSkills.length) {
      blocks.push(`<div class="support-box"><strong>Sync Skills</strong><ul>${c.syncSkills.map(s => `<li>${s.type ? `<em>${s.type}:</em> ` : ""}${s.effect || s}</li>`).join("")}</ul></div>`);
    }
    SUPPORT_WRAP.innerHTML = blocks.length ? blocks.join("") : `<div class="support-box">No support skills.</div>`;
  }

  /* ---------- ABILITIES tab ---------- */
  function renderAbilitiesTab(c, inst) {
    if (!c.abilities || !Array.isArray(c.abilities) || c.abilities.length === 0) {
      ABILITIES_WRAP.innerHTML = `<div class="no-abilities">This character has no passive abilities.</div>`;
      return;
    }

    const unlockedAbilities = inst.unlockedAbilities || [];
    const totalAbilities = c.abilities.length;

    let html = `<div class="abilities-progress">Abilities Unlocked: ${unlockedAbilities.length}/${totalAbilities}</div>`;

    c.abilities.forEach((ability, index) => {
      const isUnlocked = unlockedAbilities.includes(index);
      const lockClass = isUnlocked ? '' : 'locked';
      const lockOverlay = isUnlocked ? '' : '<div class="lock-overlay"><img src="assets/icons/locked.png" alt="Locked" onerror="this.style.display=\'none\';" /></div>';
      const statusText = isUnlocked ? 'UNLOCKED' : 'LOCKED';
      const statusClass = isUnlocked ? '' : 'locked';

      html += `
        <div class="ability-card ${lockClass}">
          ${lockOverlay}
          <div class="ability-header">
            <div class="ability-name">${ability.name || `Ability ${index + 1}`}</div>
            <div class="ability-unlock-status ${statusClass}">${statusText}</div>
          </div>
          <div class="ability-description">${ability.description || ability}</div>
        </div>
      `;
    });

    ABILITIES_WRAP.innerHTML = html;
  }

  /* ---------- TOOLS tab ---------- */
  function renderToolsTab(c, inst, tier) {
    // Get stats for power calculation
    let stats = {};
    if (hasProg && window.Progression.computeEffectiveStatsLoreTier) {
      // Calculate extended cap if limit breaks are present
      let extendedCap = null;
      if (hasLimitBreak && inst.limitBreakLevel && inst.limitBreakLevel > 0) {
        extendedCap = window.LimitBreak.getExtendedLevelCap(tier, inst.limitBreakLevel);
      }

      const comp = window.Progression.computeEffectiveStatsLoreTier(c, safeNum(inst.level,1), tier, {
        normalize: true,
        extendedCap: extendedCap
      });
      stats = comp?.stats || {};

      // Apply limit break bonuses if present
      if (hasLimitBreak && inst.limitBreakLevel && inst.limitBreakLevel > 0) {
        stats = window.LimitBreak.applyLimitBreakToStats(stats, inst.limitBreakLevel);
      }
    } else {
      stats = c.statsBase || {};
    }

    // Calculate power: Health + Attack + Speed
    const power = (stats.hp || 0) + (stats.atk || 0) + (stats.speed || 0);

    // Update power display
    const powerValueEl = document.getElementById('tools-power-value');
    if (powerValueEl) {
      powerValueEl.textContent = power.toLocaleString();
    }

    // TODO: Load and display equipment when equipment system is implemented
    console.log('[Tools] Tools tab rendered for character:', c.name, 'Power:', power);
  }

  /* ---------- Grid clicks ---------- */
  GRID.addEventListener("click", (e) => {
    const slot = e.target.closest(".char-slot");
    if (!slot) return;
    const uid = slot.getAttribute("data-uid");
    if (uid) openModalByUid(uid);
  });

  /* ---------- Boot ---------- */
  (async function init() {
    try {
      await loadBase();
      renderGrid();
    } catch (err) {
      console.error("[characters] Failed to initialize:", err);
      GRID.innerHTML = `<div class="empty-msg">Failed to load characters.</div>`;
    }
  })();

  /* ---------- Dev Function: Adjust Power for Testing ---------- */
  window.devAdjustPower = function(uid, newPower) {
    const inst = window.InventoryChar.getByUid(uid);
    if (!inst) {
      console.error(`Character with UID ${uid} not found!`);
      return;
    }

    const c = BYID[inst.charId];
    if (!c) {
      console.error(`Character base data not found for ${inst.charId}!`);
      return;
    }

    // Calculate the stats needed to reach target power
    // Power = HP + ATK + Speed
    // We'll distribute it evenly across all three stats
    const statPerStat = Math.floor(newPower / 3);

    console.log(`[DEV] Adjusting character ${c.name} (${uid}) to power: ${newPower}`);
    console.log(`[DEV] Setting HP: ${statPerStat}, ATK: ${statPerStat}, Speed: ${statPerStat}`);

    // Update the character's base stats (this is for dev testing only)
    c.statsBase = {
      hp: statPerStat,
      atk: statPerStat,
      def: c.statsBase?.def || 100,
      speed: statPerStat
    };

    // Reopen the modal if it's currently open for this character
    const currentUid = MODAL.dataset.currentUid;
    if (currentUid === uid && MODAL.classList.contains('open')) {
      closeModal();
      setTimeout(() => openModalByUid(uid), 100);
    }

    console.log(`[DEV] Power adjusted! New total power: ${statPerStat * 3}`);
    console.log(`[DEV] To see power grade, open the character modal.`);
  };

  // Export helper for console access
  window.devGetCurrentCharacterUid = function() {
    const uid = MODAL.dataset.currentUid;
    if (!uid) {
      console.log('[DEV] No character modal is currently open.');
      return null;
    }
    console.log(`[DEV] Current character UID: ${uid}`);
    return uid;
  };

  console.log('[DEV] Power adjustment functions loaded!');
  console.log('[DEV] Usage: devAdjustPower(uid, newPower) - e.g., devAdjustPower("char_123", 50000)');
  console.log('[DEV] Get current UID: devGetCurrentCharacterUid()');

})();

/* ========== Radial Pie Menu / Ability Wheel ========== */
(function initRadialMenu() {
  const radialMenu = document.getElementById('radial-menu');
  const radialAnchor = document.getElementById('radial-anchor');
  const radialSatellites = document.querySelectorAll('.radial-satellite-btn');

  if (!radialMenu || !radialAnchor) {
    console.warn('[Radial Menu] Elements not found');
    return;
  }

  // Show the radial menu
  radialMenu.style.display = 'block';

  let isExpanded = false;

  // Toggle menu on anchor click
  radialAnchor.addEventListener('click', (e) => {
    e.stopPropagation();
    isExpanded = !isExpanded;
    radialMenu.classList.toggle('expanded', isExpanded);
    console.log(`[Radial Menu] ${isExpanded ? 'Expanded' : 'Collapsed'}`);
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (isExpanded && !radialMenu.contains(e.target)) {
      isExpanded = false;
      radialMenu.classList.remove('expanded');
      console.log('[Radial Menu] Collapsed (clicked outside)');
    }
  });

  // Handle satellite button clicks
  radialSatellites.forEach(satellite => {
    satellite.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = satellite.getAttribute('data-action');
      console.log(`[Radial Menu] Action triggered: ${action}`);

      // Close menu after action
      isExpanded = false;
      radialMenu.classList.remove('expanded');

      // TODO: Implement action handlers
      alert(`Action: ${action}\n\nThis will trigger the ${action} ability!`);
    });
  });

  console.log('[Radial Menu] Initialized successfully');
})();


/* ========== Jutsu Equipment System ========== */
(function initJutsuEquipment() {
  const CARD_MODAL = document.getElementById('card-inventory-modal');
  const CARD_GRID = document.getElementById('card-inventory-grid');
  const CARD_CANCEL = document.getElementById('card-inventory-cancel');
  const REPLACEMENT_MODAL = document.getElementById('jutsu-replacement-modal');
  const REPLACEMENT_OPTIONS = document.getElementById('replacement-options');
  const REPLACEMENT_CANCEL = document.getElementById('replacement-cancel');

  if (!CARD_MODAL || !CARD_GRID || !CARD_CANCEL) {
    console.warn('[Jutsu Equipment] Elements not found');
    return;
  }

  let jutsuCardsData = [];
  let currentCharacterUid = null;
  let pendingCardToEquip = null;
  let currentSlotType = null; // Track which type of slot was clicked ('jutsu', 'ultimate', or 'equipment')
  let currentSlotNumber = null; // Track equipment slot number (1-5)

  // Load jutsu cards JSON
  async function loadJutsuCards() {
    try {
      const response = await fetch('data/jutsu_cards.json');
      const data = await response.json();
      jutsuCardsData = data.cards || [];
      console.log('[Jutsu Equipment] Loaded', jutsuCardsData.length, 'jutsu cards');
    } catch (error) {
      console.error('[Jutsu Equipment] Failed to load jutsu cards:', error);
    }
  }

  // Initialize equipped jutsu data structure on character instances
  function getEquippedJutsu(uid) {
    const inst = window.InventoryChar?.getByUid(uid);
    if (!inst) return null;

    if (!inst.equippedJutsu) {
      inst.equippedJutsu = {
        jutsu1: null,
        jutsu2: null,
        jutsu3: null,
        ultimate: null,
        equipment1: null,
        equipment2: null,
        equipment3: null,
        equipment4: null,
        equipment5: null
      };
    }
    return inst.equippedJutsu;
  }

  // Save equipped jutsu to character instance
  function saveEquippedJutsu(uid, equipped) {
    const inst = window.InventoryChar?.getByUid(uid);
    if (inst) {
      inst.equippedJutsu = equipped;
      window.InventoryChar.updateInstance(uid, inst);
    }
  }

  // Render jutsu/ultimate slots for current character
  function renderJutsuSlots(uid) {
    const equipped = getEquippedJutsu(uid);
    if (!equipped) return;

    // Render jutsu slots
    ['jutsu1', 'jutsu2', 'jutsu3'].forEach(slotName => {
      const slotBtn = document.querySelector(`.jutsu-slot[data-slot="${slotName}"]`);
      if (!slotBtn) return;

      const icon = slotBtn.querySelector('.jutsu-slot-icon');
      const cardId = equipped[slotName];

      if (cardId) {
        const card = jutsuCardsData.find(c => c.id === cardId);
        if (card && icon) {
          icon.src = card.icon;
          icon.style.display = 'block';
        }
      } else if (icon) {
        icon.src = '';
        icon.style.display = 'none';
      }
    });

    // Render ultimate slot
    const ultimateSlot = document.querySelector('.ultimate-slot[data-slot="ultimate"]');
    if (ultimateSlot) {
      const icon = ultimateSlot.querySelector('.ultimate-slot-icon');
      const cardId = equipped.ultimate;

      if (cardId) {
        const card = jutsuCardsData.find(c => c.id === cardId);
        if (card && icon) {
          icon.src = card.icon;
          icon.style.display = 'block';
        }
      } else if (icon) {
        icon.src = '';
        icon.style.display = 'none';
      }
    }

    // Render equipment slots (1-5)
    for (let i = 1; i <= 5; i++) {
      const slotName = `equipment${i}`;
      const equipSlot = document.querySelector(`.tools-equipment-slot[data-slot="${i}"]`);
      if (!equipSlot) continue;

      const cardId = equipped[slotName];

      if (cardId) {
        const card = jutsuCardsData.find(c => c.id === cardId);
        if (card) {
          // Clear slot content
          equipSlot.innerHTML = '';

          // Create and add card image
          const cardImg = document.createElement('img');
          cardImg.src = card.fullArt || card.icon;
          cardImg.alt = card.name;
          cardImg.style.width = '100%';
          cardImg.style.height = '100%';
          cardImg.style.objectFit = 'cover';
          cardImg.onerror = () => { cardImg.src = card.icon; };

          equipSlot.appendChild(cardImg);
          equipSlot.classList.add('filled');
        }
      } else {
        // Restore empty slot
        equipSlot.innerHTML = `
          <div class="tools-slot-empty">
            <div class="tools-slot-label">Slot ${i}</div>
          </div>
        `;
        equipSlot.classList.remove('filled');
      }
    }
  }

  // Check if card is already equipped
  function isCardEquipped(uid, cardId) {
    const equipped = getEquippedJutsu(uid);
    if (!equipped) return false;

    return Object.values(equipped).includes(cardId);
  }

  // Find first empty jutsu slot
  function findEmptyJutsuSlot(uid) {
    const equipped = getEquippedJutsu(uid);
    if (!equipped) return null;

    if (!equipped.jutsu1) return 'jutsu1';
    if (!equipped.jutsu2) return 'jutsu2';
    if (!equipped.jutsu3) return 'jutsu3';
    return null;
  }

  // Equip card to slot
  function equipCard(uid, cardId, slotName) {
    const equipped = getEquippedJutsu(uid);
    if (!equipped) return;

    equipped[slotName] = cardId;
    saveEquippedJutsu(uid, equipped);
    renderJutsuSlots(uid);
    console.log(`[Jutsu Equipment] Equipped ${cardId} to ${slotName}`);
  }

  // Show replacement popup when all jutsu slots full
  function showReplacementPopup(uid, cardToEquip) {
    const equipped = getEquippedJutsu(uid);
    if (!equipped) return;

    pendingCardToEquip = cardToEquip;

    // Build replacement options
    REPLACEMENT_OPTIONS.innerHTML = '';
    ['jutsu1', 'jutsu2', 'jutsu3'].forEach(slotName => {
      const cardId = equipped[slotName];
      if (!cardId) return;

      const card = jutsuCardsData.find(c => c.id === cardId);
      if (!card) return;

      const option = document.createElement('div');
      option.className = 'replacement-option';
      option.dataset.slot = slotName;
      option.innerHTML = `
        <img src="${card.icon}" alt="${card.name}">
        <span class="replacement-option-name">${card.name}</span>
      `;

      option.addEventListener('click', () => {
        equipCard(uid, cardToEquip.id, slotName);
        closeReplacementPopup();
      });

      REPLACEMENT_OPTIONS.appendChild(option);
    });

    REPLACEMENT_MODAL.setAttribute('aria-hidden', 'false');
  }

  // Close replacement popup
  function closeReplacementPopup() {
    REPLACEMENT_MODAL.setAttribute('aria-hidden', 'true');
    pendingCardToEquip = null;
  }

  function handleSlotClick(event) {
    event.preventDefault();
    event.stopPropagation();
    openCardInventory(event.currentTarget);
  }

  function handleSlotKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      openCardInventory(event.currentTarget);
    }
  }

  function refreshSlotBindings() {
    const slotElements = document.querySelectorAll('.equipment-slot, .tools-equipment-slot, .jutsu-slot, .ultimate-slot');
    slotElements.forEach(slot => {
      if (slot.dataset.jutsuSlotBound === 'true') return;

      slot.dataset.jutsuSlotBound = 'true';
      slot.addEventListener('click', handleSlotClick);
      slot.addEventListener('keydown', handleSlotKeydown);

      const isNativeButton = slot.tagName.toLowerCase() === 'button';

      if (!slot.hasAttribute('role') && !isNativeButton) {
        slot.setAttribute('role', 'button');
      }
      if (!slot.hasAttribute('tabindex') && !isNativeButton) {
        slot.setAttribute('tabindex', '0');
      }
    });
  }

  // Open card inventory modal
  function openCardInventory(equipmentSlot) {
    const charModal = document.getElementById('char-modal');
    const uid = charModal?.dataset?.currentUid;
    if (!uid) {
      console.warn('[Jutsu Equipment] No character UID found');
      return;
    }

    currentCharacterUid = uid;

    // Determine slot type
    if (equipmentSlot.classList.contains('tools-equipment-slot')) {
      currentSlotType = 'equipment';
      currentSlotNumber = equipmentSlot.dataset.slot;
      console.log(`[Jutsu Equipment] Opening inventory for equipment slot ${currentSlotNumber}`);
    } else if (equipmentSlot.classList.contains('jutsu-slot')) {
      currentSlotType = 'jutsu';
      currentSlotNumber = equipmentSlot.dataset.slot;
      console.log(`[Jutsu Equipment] Opening inventory for jutsu slot ${currentSlotNumber}`);
    } else if (equipmentSlot.classList.contains('ultimate-slot')) {
      currentSlotType = 'ultimate';
      currentSlotNumber = null;
      console.log('[Jutsu Equipment] Opening inventory for ultimate slot');
    } else {
      currentSlotType = 'equipment';
      currentSlotNumber = equipmentSlot.dataset.slot;
      console.log('[Jutsu Equipment] Opening inventory (default to equipment)');
    }

    // Get character's base ID to check eligibility
    const charInstance = window.InventoryChar?.getByUid(uid);
    const characterId = charInstance?.charId;

    if (!characterId) {
      console.warn('[Jutsu Equipment] Could not get character ID from UID:', uid);
      return;
    }

    // Filter cards based on eligibility
    const eligibleCards = jutsuCardsData.filter(card => {
      // If no eligibleCharacters array, or it's empty, card is available to all
      if (!card.eligibleCharacters || card.eligibleCharacters.length === 0) {
        return true;
      }
      // Check if this character is in the eligible list
      return card.eligibleCharacters.includes(characterId);
    });

    console.log(`[Jutsu Equipment] Showing ${eligibleCards.length} eligible cards for ${characterId}`);

    // Render jutsu cards (only eligible ones)
    CARD_GRID.innerHTML = eligibleCards.map(card => {
      return `
        <div class="card-inventory-item" data-card-id="${card.id}">
          <img src="${card.fullArt || card.icon}"
               alt="${card.name}"
               onerror="this.src='${card.icon}';">
          <div style="position:absolute;bottom:4px;left:4px;right:4px;background:rgba(0,0,0,0.8);padding:4px;font-size:10px;text-align:center;border-radius:4px;">
            ${card.name}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers to card items
    CARD_GRID.querySelectorAll('.card-inventory-item').forEach(item => {
      item.addEventListener('click', () => {
        const cardId = item.getAttribute('data-card-id');
        handleCardSelection(cardId);
      });
    });

    // Show modal
    CARD_MODAL.setAttribute('aria-hidden', 'false');
  }

  // Close card inventory modal
  function closeCardInventory() {
    CARD_MODAL.setAttribute('aria-hidden', 'true');
    currentCharacterUid = null;
    currentSlotType = null;
    currentSlotNumber = null;
    console.log('[Jutsu Equipment] Card inventory closed');
  }

  // Handle card selection
  function handleCardSelection(cardId) {
    const uid = currentCharacterUid;
    if (!uid) return;

    const card = jutsuCardsData.find(c => c.id === cardId);
    if (!card) return;

    // Check if card is already equipped
    if (isCardEquipped(uid, cardId)) {
      alert(`This card is already equipped!`);
      return;
    }

    // Validate character eligibility
    const charInstance = window.InventoryChar?.getByUid(uid);
    const characterId = charInstance?.charId;

    if (card.eligibleCharacters && card.eligibleCharacters.length > 0) {
      if (!card.eligibleCharacters.includes(characterId)) {
        alert(`${card.name} cannot be equipped by this character!\n\nThis jutsu is restricted to specific characters.`);
        console.warn(`[Jutsu Equipment] ${characterId} cannot equip ${card.name}`);
        return;
      }
    }

    const equipped = getEquippedJutsu(uid);

    // Handle equipment slot clicks
    if (currentSlotType === 'equipment' && currentSlotNumber) {
      const slotName = `equipment${currentSlotNumber}`;
      equipCard(uid, cardId, slotName);
      closeCardInventory();
      return;
    }

    // Handle jutsu/ultimate slots
    if (card.type === 'ultimate') {
      // Equip to ultimate slot
      equipCard(uid, cardId, 'ultimate');
      closeCardInventory();
    } else if (card.type === 'jutsu') {
      // If clicking from jutsu slot directly, equip to that slot
      if (currentSlotType === 'jutsu' && currentSlotNumber) {
        equipCard(uid, cardId, currentSlotNumber);
        closeCardInventory();
        return;
      }

      // Find empty jutsu slot
      const emptySlot = findEmptyJutsuSlot(uid);

      if (emptySlot) {
        // Equip to empty slot
        equipCard(uid, cardId, emptySlot);
        closeCardInventory();
      } else {
        // All slots full - show replacement popup
        closeCardInventory();
        showReplacementPopup(uid, card);
      }
    }
  }

  // Wire up cancel buttons
  CARD_CANCEL.addEventListener('click', closeCardInventory);
  if (REPLACEMENT_CANCEL) {
    REPLACEMENT_CANCEL.addEventListener('click', closeReplacementPopup);
  }

  // Close modals when clicking outside
  CARD_MODAL.addEventListener('click', (e) => {
    if (e.target === CARD_MODAL) {
      closeCardInventory();
    }
  });

  if (REPLACEMENT_MODAL) {
    REPLACEMENT_MODAL.addEventListener('click', (e) => {
      if (e.target === REPLACEMENT_MODAL) {
        closeReplacementPopup();
      }
    });
  }

  // Delegate click handler for equipment slots AND jutsu/ultimate slots
  document.addEventListener('click', (e) => {
    const equipmentSlot = e.target.closest('.equipment-slot, .tools-equipment-slot');
    const jutsuSlot = e.target.closest('.jutsu-slot');
    const ultimateSlot = e.target.closest('.ultimate-slot');

    if (equipmentSlot) {
      console.log('[Jutsu Equipment] Equipment slot clicked');
      e.preventDefault();
      e.stopPropagation();
      openCardInventory(equipmentSlot);
    } else if (jutsuSlot) {
      console.log('[Jutsu Equipment] Jutsu slot clicked');
      e.preventDefault();
      e.stopPropagation();
      openCardInventory(jutsuSlot);
    } else if (ultimateSlot) {
      console.log('[Jutsu Equipment] Ultimate slot clicked');
      e.preventDefault();
      e.stopPropagation();
      openCardInventory(ultimateSlot);
    }
  });

  // Expose function to render jutsu slots when character modal opens
  window.renderJutsuSlots = renderJutsuSlots;
  window.refreshJutsuEquipmentBindings = refreshSlotBindings;

  // Load jutsu cards on init
  loadJutsuCards();
  refreshSlotBindings();

  console.log('[Jutsu Equipment] Initialized successfully');
})();
