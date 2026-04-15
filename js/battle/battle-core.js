// js/battle/battle-core.js - Core Battle Manager (Fixed Integration)
(() => {
  "use strict";

  async function fetchJSON(url, fallback = null) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (e) {
      console.warn(`[fetchJSON] ${url} ->`, e);
      return fallback;
    }
  }

  /**
   * Battle Formation Patterns
   * Returns positions for up to 4 units in various tactical formations
   */
  const BattleFormations = {
    // Standard 2x2 grid
    standard: (baseX) => [
      { x: baseX, y: 25 },
      { x: baseX + 15, y: 25 },
      { x: baseX, y: 50 },
      { x: baseX + 15, y: 50 }
    ],

    // Triangle formation (3 front, 1 back)
    triangle: (baseX) => [
      { x: baseX - 10, y: 35 },
      { x: baseX + 10, y: 35 },
      { x: baseX + 25, y: 35 },
      { x: baseX + 7.5, y: 55 }
    ],

    // Inverted triangle (1 front, 3 back)
    invertedTriangle: (baseX) => [
      { x: baseX + 7.5, y: 25 },
      { x: baseX - 10, y: 50 },
      { x: baseX + 10, y: 50 },
      { x: baseX + 25, y: 50 }
    ],

    // Corners spread out
    corners: (baseX) => [
      { x: baseX - 5, y: 20 },
      { x: baseX + 25, y: 20 },
      { x: baseX - 5, y: 60 },
      { x: baseX + 25, y: 60 }
    ],

    // Line formation (horizontal)
    line: (baseX) => [
      { x: baseX - 10, y: 40 },
      { x: baseX + 5, y: 40 },
      { x: baseX + 15, y: 40 },
      { x: baseX + 30, y: 40 }
    ],

    // Diamond formation
    diamond: (baseX) => [
      { x: baseX + 7.5, y: 25 },
      { x: baseX - 5, y: 40 },
      { x: baseX + 20, y: 40 },
      { x: baseX + 7.5, y: 55 }
    ],

    // Wide 2x2 (more spread out)
    wide: (baseX) => [
      { x: baseX - 10, y: 25 },
      { x: baseX + 25, y: 25 },
      { x: baseX - 10, y: 50 },
      { x: baseX + 25, y: 50 }
    ]
  };

  /**
   * Get random formation for a team
   */
  function getRandomFormation(baseX) {
    const formations = Object.keys(BattleFormations);
    const randomKey = formations[Math.floor(Math.random() * formations.length)];
    console.log(`[BattleCore] 🎯 Selected formation: ${randomKey}`);
    return BattleFormations[randomKey](baseX);
  }

  /**
   * BattleCore Module
   * Central manager that coordinates all battle modules
   * Handles initialization, data loading, and module orchestration
   */
  const BattleCore = {
    // ===== State =====
    missionData: null,
    difficulty: "S",
    currentStageIndex: 0,
    currentWaveIndex: 0,

    activeTeam: [],
    benchTeam: [],
    enemyTeam: [],
    combatants: [],

    commander: null,          // Commander unit (off-field)
    commanderBuffs: [],       // Active commander buffs
    collectiveChakra: 0,      // Total team chakra for commander ultimate
    commanderUltimateUsed: false, // Track if commander ultimate was triggered

    isPaused: true,
    speedMultiplier: 1,
    queuedAction: null,

    enemiesData: [],
    charactersData: [],
    dom: {},
    overlay: null,

    // Constants
    GAUGE_MAX: 1200,
    SPEED_TICK_INTERVAL: 50,

    // Module references (will be set by battle.js)
    chakra: null,
    combat: null,
    units: null,
    drag: null,
    swap: null,
    turns: null,

    /* ===== Initialization ===== */

    async init() {
      console.log("[BattleCore] ⚔️ Initializing battle system...");

      this.cacheDOM();
      this.setupEventListeners();

      const missionId = localStorage.getItem("currentMissionId") || "m_001";
      const preferredDifficulty = localStorage.getItem("currentDifficulty") || "C";

      const [missions, enemies, characters] = await Promise.all([
        fetchJSON("data/missions.json", []),
        fetchJSON("data/enemies.json", []),
        fetchJSON("data/characters.json", [])
      ]);

      this.enemiesData = enemies;
      this.charactersData = Array.isArray(characters) ? characters : (characters?.characters || []);
      this.missionData = (Array.isArray(missions) ? missions : []).find(m => m.id === missionId);

      if (!this.missionData) {
        console.error(`[BattleCore] Mission ${missionId} not found!`);
        return;
      }

      const diffs = Object.keys(this.missionData.difficulties || {});
      this.difficulty = diffs.includes(preferredDifficulty) ? preferredDifficulty : (diffs[0] || "C");

      // Set mission title
      if (this.dom.missionTitle) {
        this.dom.missionTitle.textContent = this.missionData.name;
      }

      // Load background map
      const firstStage = this.missionData?.difficulties?.[this.difficulty]?.[0];
      if (firstStage?.map && this.dom.scene) {
        this.dom.scene.style.backgroundImage = `url('${firstStage.map}')`;
        this.dom.scene.style.backgroundSize = 'cover';
        this.dom.scene.style.backgroundPosition = 'center';
        console.log("[BattleCore] 🌄 Map loaded:", firstStage.map);
      }

      // Create overlay if drag module available
      if (this.dom.scene && this.drag) {
        this.overlay = this.drag.makeOverlay(this.dom.scene);
      }

      // Load player team
      this.loadPlayerTeamFromStorage();

      // Initialize missions module if available
      if (window.BattleMissions) {
        window.BattleMissions.init(this);
      }

      // Initialize rewards system if available
      if (window.BattleRewards) {
        window.BattleRewards.init(this);
      }

      // Initialize modifiers if available
      if (window.BattleModifiers) {
        window.BattleModifiers.init(this);
      }

      // NOTE: BattleFieldBuddy.init() is called AFTER first wave loads in battle-missions.js

      // Play entrance animations if available
      if (window.BattleEntrance) {
        await window.BattleEntrance.playEntranceSequence(this);
      }

      // Start battle music
      if (window.AudioManager) {
        window.AudioManager.playBattleMusic();
      }

      // Start speed gauge system if turns module available
      if (this.turns) {
        this.turns.startSpeedGaugeTick(this);
      }

      console.log("[BattleCore] ✅ Battle initialized successfully");
    },

    /* ===== DOM Caching ===== */

    cacheDOM() {
      this.dom = {
        scene: document.getElementById("battle-scene"),
        grid: document.getElementById("battlefield-grid"),
        damageLayer: document.getElementById("damage-numbers"),
        effectsLayer: document.getElementById("effects-layer"),
        turnOrderEl: document.getElementById("turn-icons"),
        actionPanel: document.getElementById("action-panel"),
        benchContainer: document.getElementById("bench-units"),

        waveCurrent: document.getElementById("wave-current"),
        waveTotal: document.getElementById("wave-total"),
        missionTitle: document.getElementById("mission-title"),
        teamHPBar: document.getElementById("team-hp-bar"),
        teamHPText: document.getElementById("team-hp-text"),

        actionPortrait: document.getElementById("action-portrait"),
        actionName: document.getElementById("action-name"),
        actionHP: document.getElementById("action-hp"),
        actionChakra: document.getElementById("action-chakra"),
        actionSkillName: document.getElementById("action-skill-name"),
        actionUltName: document.getElementById("action-ult-name"),
        actionSecretName: document.getElementById("action-secret-name"),

        btnAttack: document.getElementById("btn-attack"),
        btnJutsu: document.getElementById("btn-jutsu"),
        btnUltimate: document.getElementById("btn-ultimate"),
        btnSecret: document.getElementById("btn-secret"),        // ⭐ NEW: Secret Technique button
        btnGuard: document.getElementById("btn-guard"),
        btnAuto: document.getElementById("btn-auto"),
        btnSpeed: document.getElementById("btn-speed"),

        speedGaugeTrack: document.getElementById("speed-gauge-track"),

        battleResult: document.getElementById("battle-result"),
        resultTitle: document.getElementById("result-title"),
        resultStats: document.getElementById("result-stats"),
        btnContinue: document.getElementById("btn-continue"),

        // Commander UI elements
        commanderDisplay: document.getElementById("commander-display"),
        commanderName: document.getElementById("commander-name"),
        collectiveChakraText: document.getElementById("collective-chakra-text")
      };

      console.log("[BattleCore] DOM cached:", Object.keys(this.dom).filter(k => this.dom[k]).length, "elements found");
    },

    /* ===== Event Listeners ===== */

    setupEventListeners() {
      if (this.turns) {
        this.dom.btnAttack?.addEventListener("click", () => this.turns.handleAttackButton(this));
        this.dom.btnJutsu?.addEventListener("click", () => this.turns.handleJutsuButton(this));
        this.dom.btnUltimate?.addEventListener("click", () => this.turns.handleUltimateButton(this));
        this.dom.btnSecret?.addEventListener("click", () => this.turns.handleSecretButton(this)); // ⭐ NEW: wire Secret
        this.dom.btnGuard?.addEventListener("click", () => this.turns.handleGuardButton(this));
        this.dom.btnAuto?.addEventListener("click", () => this.turns.toggleAutoMode(this));
        this.dom.btnSpeed?.addEventListener("click", () => this.turns.changeSpeedMultiplier(this));
      }

      this.dom.btnContinue?.addEventListener("click", () => {
        window.location.href = "missions.html";
      });

      if (this.dom.scene && this.drag) {
        this.dom.scene.addEventListener("dragover", (e) => this.drag.handleSceneDragOver(e, this));
        this.dom.scene.addEventListener("drop", (e) => this.drag.handleSceneDrop(e, this));
      }
    },

    /* ===== Team Loading ===== */

    loadPlayerTeamFromStorage() {
      const teamsData = JSON.parse(localStorage.getItem("blazing_teams_v1") || "{}");
      const currentTeamNum = 1;
      const teamSlots = teamsData[currentTeamNum] || {};

      console.log("[BattleCore] Loading team slots:", teamSlots);
      console.log("[BattleCore] window.InventoryChar available?", !!window.InventoryChar);
      console.log("[BattleCore] charactersData loaded?", this.charactersData?.length);

      // FIXED: Use 4 active slots (front-1 through front-4)
      const frontSlots = ["front-1", "front-2", "front-3", "front-4"];
      const backSlots = ["back-1", "back-2", "back-3", "back-4"];

      // Get random formation positions for player team
      const playerFormation = getRandomFormation(20);

      this.activeTeam = frontSlots.map((slotId, i) => {
        const slot = teamSlots[slotId];
        if (!slot?.uid) return null;

        const inst = window.InventoryChar?.getByUid(slot.uid);
        const base = this.charactersData.find(c => c.id === slot.charId);

        if (!inst || !base) {
          console.warn(`[BattleCore] Missing data for slot ${slotId}`, { inst, base });
          return null;
        }

        const tier = inst.tierCode || base.starMinCode || "3S";

        // Use units module if available, otherwise inline
        const art = this.units ?
          this.units.resolveTierArt(base, tier) :
          this.resolveTierArtFallback(base, tier);

        const stats = this.units ?
          this.units.computeStats(base, inst) :
          this.computeStatsFallback(base, inst);

        const unit = this.units ?
          this.units.createCombatant({
            ...base,
            ...inst,
            portrait: art.portrait,
            isPlayer: true,
            positionId: i + 1,
            isActive: true,
            stats,
            pos: playerFormation[i] || { x: 20, y: 25 + i * 15 }
          }) :
          this.createCombatantFallback({
            ...base,
            ...inst,
            portrait: art.portrait,
            isPlayer: true,
            positionId: i + 1,
            isActive: true,
            stats,
            pos: playerFormation[i] || { x: 20, y: 25 + i * 15 }
          });

        unit._ref = { base, inst, tier };

        // Initialize passive abilities
        if (window.BattlePassives) {
          window.BattlePassives.initializePassives(unit, this);
        }

        console.log(`[BattleCore] Active unit ${i + 1}:`, unit.name, tier, art.portrait);
        return unit;
      }).filter(Boolean);

      // FIXED: Load 4 bench units (back-1 through back-4)
      this.benchTeam = backSlots.map((slotId, i) => {
        const slot = teamSlots[slotId];
        if (!slot?.uid) return null;

        const inst = window.InventoryChar?.getByUid(slot.uid);
        const base = this.charactersData.find(c => c.id === slot.charId);

        if (!inst || !base) return null;

        const tier = inst.tierCode || base.starMinCode || "3S";

        const art = this.units ?
          this.units.resolveTierArt(base, tier) :
          this.resolveTierArtFallback(base, tier);

        const stats = this.units ?
          this.units.computeStats(base, inst) :
          this.computeStatsFallback(base, inst);

        const unit = this.units ?
          this.units.createCombatant({
            ...base,
            ...inst,
            portrait: art.portrait,
            isPlayer: true,
            positionId: i + 1,
            isActive: false,
            isBench: true,
            stats,
            pos: { x: 0, y: 0 }
          }) :
          this.createCombatantFallback({
            ...base,
            ...inst,
            portrait: art.portrait,
            isPlayer: true,
            positionId: i + 1,
            isActive: false,
            isBench: true,
            stats,
            pos: { x: 0, y: 0 }
          });

        unit._ref = { base, inst, tier };

        // Initialize passive abilities
        if (window.BattlePassives) {
          window.BattlePassives.initializePassives(unit, this);
        }

        console.log(`[BattleCore] Bench unit ${i + 1}:`, unit.name, tier);
        return unit;
      }).filter(Boolean);

      console.log("[BattleCore] ✅ Loaded:", this.activeTeam.length, "active,", this.benchTeam.length, "bench");

      // Load Commander (off-field support)
      this.loadCommander(teamSlots);

      // Apply commander buffs to team
      if (this.commander && this.commanderBuffs.length > 0) {
        this.applyCommanderBuffs();
      }

      // Fallback if no team loaded
      if (this.activeTeam.length === 0) {
        console.warn("[BattleCore] No active team! Creating fallback...");
        this.createFallbackTeam();
      }

      // Render using modules if available
      if (this.units) {
        this.units.renderBenchUnits(this);
      }
      this.updateTeamHP();
      this.updateCombatants();
    },

    /* ===== Commander System ===== */

    loadCommander(teamSlots) {
      const commanderSlot = teamSlots.commander;
      if (!commanderSlot?.uid) {
        console.log("[BattleCore] No commander assigned");
        return;
      }

      const inst = window.InventoryChar?.getByUid(commanderSlot.uid);
      const base = this.charactersData.find(c => c.id === commanderSlot.charId);

      if (!inst || !base) {
        console.warn("[BattleCore] Commander data not found");
        return;
      }

      const tier = inst.tierCode || base.starMinCode || "3S";
      const stars = this.getStarsFromTier(tier);
      const element = base.element || 'heart';

      this.commander = {
        base,
        inst,
        tier,
        stars,
        element: element.toLowerCase(),
        name: base.name,
        ultimate: this.getCommanderUltimate(base, tier)
      };

      // Calculate commander buffs
      this.commanderBuffs = this.calculateCommanderBuffs(element, stars);

      console.log(`[BattleCore] 🎖️ Commander loaded: ${base.name} (${stars}★ ${element})`);
      console.log(`[BattleCore] 📊 Commander buffs:`, this.commanderBuffs);

      // Show commander UI
      this.showCommanderUI();
    },

    showCommanderUI() {
      if (!this.commander || !this.dom.commanderDisplay) return;

      this.dom.commanderDisplay.classList.remove('hidden');
      if (this.dom.commanderName) {
        this.dom.commanderName.textContent = this.commander.name;
      }
      this.updateCollectiveChakraUI();
    },

    updateCollectiveChakraUI() {
      if (!this.dom.collectiveChakraText) return;

      this.dom.collectiveChakraText.textContent = this.collectiveChakra;

      // Add visual indicator when ready for ultimate
      if (this.collectiveChakra >= 16 && !this.commanderUltimateUsed) {
        this.dom.collectiveChakraText.classList.add('ready');
      } else {
        this.dom.collectiveChakraText.classList.remove('ready');
      }
    },

    getStarsFromTier(code) {
      const map = {
        "3S":3,"4S":4,"5S":5,"6S":6,"6SB":6,"7S":7,"7SL":7,
        "8S":8,"8SM":8,"9S":9,"9ST":9,"10SO":10
      };
      return map[code] || 5;
    },

    calculateCommanderBuffs(element, stars) {
      const buffs = [];

      // Baseline buffs at 5 stars
      const baselineBuffs = {
        body: [{ type: 'atk', value: 4, label: 'ATK' }],
        bravery: [
          { type: 'atk', value: 3, label: 'ATK' },
          { type: 'hp', value: 1, label: 'HP' }
        ],
        wisdom: [
          { type: 'atk', value: 3, label: 'ATK' },
          { type: 'hp', value: 1, label: 'HP' }
        ],
        heart: [{ type: 'atk', value: 4, label: 'ATK' }],
        skill: [{ type: 'speed', value: 4, label: 'Speed' }]
      };

      const elementBuffs = baselineBuffs[element] || [];

      // Calculate scaling: 5 stars = baseline, 10 stars = 20%
      const starMultiplier = stars >= 5 ? (stars - 5) / 5 : 0;

      elementBuffs.forEach(buff => {
        const scaledValue = buff.value + starMultiplier * (20 - buff.value);
        buffs.push({
          type: buff.type,
          value: scaledValue / 100, // Convert to multiplier (e.g., 4% = 0.04)
          percent: Math.round(scaledValue * 10) / 10,
          label: buff.label
        });
      });

      return buffs;
    },

    getCommanderUltimate(char, tierCode) {
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
        multiplier: tierData.multiplier || "Unknown",
        effects: tierData.effects || {}
      };
    },

    applyCommanderBuffs() {
      console.log("[BattleCore] Applying commander buffs to team...");

      this.activeTeam.forEach(unit => {
        if (!unit || !unit.stats) return;

        this.commanderBuffs.forEach(buff => {
          const before = unit.stats[buff.type];

          if (buff.type === 'atk') {
            unit.stats.atk = Math.floor(unit.stats.atk * (1 + buff.value));
          } else if (buff.type === 'hp') {
            const hpBoost = Math.floor(unit.stats.maxHP * buff.value);
            unit.stats.maxHP += hpBoost;
            unit.stats.hp += hpBoost;
          } else if (buff.type === 'speed') {
            unit.stats.speed = Math.floor(unit.stats.speed * (1 + buff.value));
          }

          const after = unit.stats[buff.type];
          console.log(`  ${unit.name}: ${buff.label} ${before} → ${after} (+${buff.percent}%)`);
        });
      });
    },

    updateCollectiveChakra() {
      this.collectiveChakra = this.activeTeam.reduce((sum, unit) => {
        return sum + (unit?.chakra || 0);
      }, 0);

      // Update UI
      this.updateCollectiveChakraUI();

      // Check for commander ultimate trigger
      if (!this.commanderUltimateUsed && this.collectiveChakra >= 16 && this.commander?.ultimate) {
        this.triggerCommanderUltimate();
      }

      return this.collectiveChakra;
    },

    triggerCommanderUltimate() {
      if (!this.commander || !this.commander.ultimate || this.commanderUltimateUsed) return;

      console.log(`[BattleCore] 💥 COMMANDER ULTIMATE TRIGGERED! (Collective Chakra: ${this.collectiveChakra})`);
      console.log(`[BattleCore] ${this.commander.name}: ${this.commander.ultimate.name}`);

      this.commanderUltimateUsed = true;

      // Show narrator message
      if (window.BattleNarrator) {
        window.BattleNarrator.showAction?.(
          `${this.commander.name}: ${this.commander.ultimate.name}!`,
          "ultimate",
          this.dom
        );
      }

      // Apply ultimate effects to enemies
      if (this.commander.ultimate.effects && window.BattleBuffs) {
        const targets = this.commander.ultimate.range?.toLowerCase().includes("all")
          ? this.enemyTeam.filter(e => e && !e.isKO)
          : [this.enemyTeam.find(e => e && !e.isKO)].filter(Boolean);

        if (targets.length > 0) {
          // Apply damage/effects
          const ultimate = this.commander.ultimate;
          const multiplier = parseFloat(ultimate.multiplier) || 10;

          // Use average team ATK as base damage
          const avgAtk = this.activeTeam.reduce((sum, u) => sum + (u?.stats?.atk || 0), 0) / this.activeTeam.length;
          const baseDamage = Math.floor(avgAtk * multiplier);

          targets.forEach(enemy => {
            if (this.combat && this.combat.dealDamage) {
              this.combat.dealDamage(enemy, baseDamage, this, { isUltimate: true });
            }
          });

          // Apply any buff/debuff effects
          window.BattleBuffs.applyBuffEffects?.(
            this,
            { name: this.commander.name },
            targets,
            ultimate.effects,
            "commander_ultimate"
          );
        }
      }
    },

    /* ===== Fallback Methods (when modules not loaded) ===== */

    resolveTierArtFallback(char, tier) {
      const fbPortrait = char?.portrait || "assets/characters/common/silhouette.png";
      const fbFull = char?.full || fbPortrait;
      const map = char?.artByTier || {};

      if (map[tier]) {
        return {
          portrait: map[tier].portrait || fbPortrait,
          full: map[tier].full || fbFull
        };
      }

      return { portrait: fbPortrait, full: fbFull };
    },

    computeStatsFallback(char, instance) {
      if (window.Progression?.computeEffectiveStatsLoreTier) {
        const tier = instance?.tierCode || char?.starMinCode || "5S";
        const lvl = Number(instance?.level || 1);
        const result = window.Progression.computeEffectiveStatsLoreTier(
          char, lvl, tier, { normalize: true }
        );
        const s = result?.stats || {};

        return {
          hp: s.hp ?? 1000,
          maxHP: s.hp ?? 1000,
          atk: s.atk ?? 100,
          def: s.def ?? 50,
          speed: s.speed ?? 100,
          chakraBase: s.chakra ?? 10
        };
      }

      const base = char?.statsMax || char?.statsBase || {};
      return {
        hp: base.hp || 1000,
        maxHP: base.hp || 1000,
        atk: base.atk || 100,
        def: base.def || 50,
        speed: base.speed || 100,
        chakraBase: base.chakra || 10
      };
    },

    createCombatantFallback(data) {
      const unit = {
        id: data.uid || `unit-${Date.now()}-${Math.random()}`,
        name: data.name || "Unknown",
        portrait: data.portrait || "assets/characters/common/silhouette.png",
        isPlayer: data.isPlayer || false,
        positionId: data.positionId || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isBench: data.isBench || false,
        pos: data.pos || { x: 50, y: 50 },
        stats: data.stats,
        chakra: 0,
        maxChakra: 10,
        speedGauge: Math.floor(Math.random() * 200),
        isPaused: false,
        isGuarding: false,
        statusEffects: [],
        chakraMode: "NONE",
        _ref: null
      };

      return unit;
    },

    createFallbackTeam() {
      const inventory = window.InventoryChar?.allInstances() || [];

      // Create 4 active units
      this.activeTeam = inventory.slice(0, 4).map((inst, i) => {
        const base = this.charactersData.find(c => c.id === inst.charId) || {};
        const tier = inst.tierCode || base.starMinCode || "3S";
        const art = this.resolveTierArtFallback(base, tier);
        const stats = this.computeStatsFallback(base, inst);

        const unit = this.createCombatantFallback({
          ...base,
          ...inst,
          portrait: art.portrait,
          isPlayer: true,
          positionId: i + 1,
          isActive: true,
          stats,
          pos: { x: 20 + (i % 2 * 15), y: 25 + Math.floor(i / 2) * 25 }
        });
        unit._ref = { base, inst, tier };
        return unit;
      });

      // Create 4 bench units
      this.benchTeam = inventory.slice(4, 8).map((inst, i) => {
        const base = this.charactersData.find(c => c.id === inst.charId) || {};
        const tier = inst.tierCode || base.starMinCode || "3S";
        const art = this.resolveTierArtFallback(base, tier);
        const stats = this.computeStatsFallback(base, inst);

        const unit = this.createCombatantFallback({
          ...base,
          ...inst,
          portrait: art.portrait,
          isPlayer: true,
          positionId: i + 1,
          isActive: false,
          isBench: true,
          stats,
          pos: { x: 0, y: 0 }
        });
        unit._ref = { base, inst, tier };
        return unit;
      });
    },

    /* ===== Core Functions ===== */

    updateCombatants() {
      // Only active (non-benched) units participate in combat
      this.combatants = [...this.activeTeam, ...this.enemyTeam].filter(u => !u.isBench && u.isActive);
      console.log("[BattleCore] ========== COMBATANTS UPDATE ==========");
      console.log("[BattleCore] Total combatants:", this.combatants.length);
      console.log("[BattleCore] Active team count:", this.activeTeam.length);
      console.log("[BattleCore] Enemy team count:", this.enemyTeam.length);

      // Detailed breakdown
      console.log("[BattleCore] --- PLAYERS ---");
      this.activeTeam.forEach(u => {
        console.log(`  ${u.name}: isActive=${u.isActive}, isBench=${u.isBench}, inCombatants=${this.combatants.includes(u)}`);
      });

      console.log("[BattleCore] --- ENEMIES ---");
      this.enemyTeam.forEach(u => {
        console.log(`  ${u.name}: isActive=${u.isActive}, isBench=${u.isBench}, isPaused=${u.isPaused}, inCombatants=${this.combatants.includes(u)}`);
      });

      console.log("[BattleCore] ========================================");
    },

    updateTeamHP() {
      const current = this.activeTeam.reduce((sum, u) => sum + u.stats.hp, 0);
      const max = this.activeTeam.reduce((sum, u) => sum + u.stats.maxHP, 0);
      const percent = max ? (current / max) * 100 : 0;

      if (this.dom.teamHPBar) this.dom.teamHPBar.style.width = `${percent}%`;
      if (this.dom.teamHPText) this.dom.teamHPText.textContent = `${current.toLocaleString()} / ${max.toLocaleString()}`;
    },

    checkBattleEnd() {
      const playersAlive = this.activeTeam.filter(u => u.stats.hp > 0).length;
      const enemiesAlive = this.enemyTeam.filter(u => u.stats.hp > 0).length;

      console.log(`[BattleEnd] 🏥 Check: Players alive = ${playersAlive}, Enemies alive = ${enemiesAlive}`);
      this.enemyTeam.forEach(e => console.log(`[BattleEnd]   Enemy ${e.name}: HP = ${e.stats.hp}`));

      if (playersAlive === 0) {
        setTimeout(() => {
          if (window.BattleMissions) {
            window.BattleMissions.declareDefeat(this);
          }
        }, 600);
      } else if (enemiesAlive === 0) {
        this.isPaused = true;

        // Delay to allow HP bars to finish animating to 0
        setTimeout(() => {
          if (window.BattleMissions) {
            window.BattleMissions.handleWaveComplete(this);
          }
        }, 600);
      }
    },

    /* ===== Legacy Compatibility Methods ===== */

    updateUnitDisplay(unit) {
      if (this.units) {
        this.units.updateUnitDisplay(unit, this);
      }
    },

    renderAllUnits() {
      if (this.units) {
        this.units.renderAllUnits(this);
      }
    },

    startTurn(unit) {
      if (this.turns) {
        this.turns.startTurn(unit, this);
      }
    },

    endTurn() {
      if (this.turns) {
        this.turns.endTurn(this);
      }
    }
  };

  // Export to window
  window.BattleCore = BattleCore;
  window.BattleFormations = BattleFormations;
  window.getRandomFormation = getRandomFormation;

  console.log("[BattleCore] Module loaded ✅");
})();
