// js/battle_missions.js - Mission, Stage, and Wave Management
(() => {
  "use strict";

  const BattleMissions = {
    /**
     * Initialize the missions module
     * @param {Object} battleManager - Reference to BattleManager
     */
    init(battleManager) {
      console.log("[Missions] Initializing missions module");
      this.loadStage(battleManager, 0);
    },

    /**
     * Load a specific stage
     * @param {Object} bm - BattleManager reference
     * @param {number} stageIndex - Index of the stage to load
     */
    loadStage(bm, stageIndex) {
      bm.currentStageIndex = stageIndex;
      const stages = bm.missionData.difficulties?.[bm.difficulty];

      if (!Array.isArray(stages) || !stages[stageIndex]) {
        this.declareVictory(bm);
        return;
      }

      const stageData = stages[stageIndex];
      console.log(`[Missions] Loading stage ${stageIndex + 1}/${stages.length}`);

      this.setSceneBackground(bm, stageData);
      this.loadWave(bm, stageData.waves || [], 0);
    },

    /**
     * Set the background image for the battle scene
     * @param {Object} bm - BattleManager reference
     * @param {Object} stageData - Stage configuration data
     */
    setSceneBackground(bm, stageData) {
      const mapPath = stageData?.map || bm.missionData?.map || null;
      if (!mapPath || !bm.dom.scene) return;

      const img = new Image();
      img.onload = () => {
        bm.dom.scene.style.backgroundImage = `url("${mapPath}")`;
        bm.dom.scene.style.backgroundSize = "cover";
        bm.dom.scene.style.backgroundPosition = "center";
        console.log("[Missions] Map loaded:", mapPath);
      };
      img.onerror = () => console.warn("[Missions] Failed to load map:", mapPath);
      img.src = mapPath;
    },

    /**
     * Load a specific wave within the current stage
     * @param {Object} bm - BattleManager reference
     * @param {Array} waves - Array of wave configurations
     * @param {number} waveIndex - Index of the wave to load
     */
    loadWave(bm, waves, waveIndex) {
      bm.currentWaveIndex = waveIndex;
      const waveData = waves[waveIndex] || { enemies: [] };

      console.log(`[Missions] Loading wave ${waveIndex + 1}/${waves.length}`);

      if (bm.dom.waveCurrent) bm.dom.waveCurrent.textContent = waveIndex + 1;
      if (bm.dom.waveTotal) bm.dom.waveTotal.textContent = waves.length;

      // Get random formation for enemies
      const enemyFormation = window.getRandomFormation ? window.getRandomFormation(70) : null;

      // Create enemy team
      bm.enemyTeam = (waveData.enemies || []).map((enemyData, i) => {
        let base;

        // Support pre-built enemy objects (e.g. from arena mode) as well as string IDs
        if (typeof enemyData === 'object' && enemyData !== null && enemyData.stats) {
          base = enemyData;
        } else {
          const enemyId = typeof enemyData === 'object' ? enemyData.id : enemyData;

          // First try to find in enemiesData, then fallback to charactersData
          base = bm.enemiesData.find(e => e.id === enemyId);

          if (!base) {
            // Try to find character data for this enemy
            const charData = bm.charactersData.find(c => c.id === enemyId);
            if (charData) {
              base = {
                id: charData.id,
                name: charData.name,
                portrait: charData.portrait || "assets/characters/common/silhouette.png",
                stats: {
                  hp: charData.statsMax?.hp || 800,
                  atk: charData.statsMax?.atk || 80,
                  def: 30,
                  speed: charData.statsMax?.speed || 90,
                  chakra: 5
                }
              };
            } else {
              // Fallback to generic enemy
              base = {
                id: enemyId,
                name: String(enemyId),
                portrait: "assets/characters/common/silhouette.png",
                stats: { hp: 800, atk: 80, def: 30, speed: 90, chakra: 5 }
              };
            }
          }
        }

        // Convert sprite to portrait for compatibility
        const portrait = base.portrait || base.sprite || "assets/characters/common/silhouette.png";

        // Use modular units.createCombatant or fallback
        const enemyPos = enemyFormation ? enemyFormation[i] : { x: 70 + (i % 2 * 15), y: 25 + Math.floor(i / 2) * 25 };

        const unit = bm.units ?
          bm.units.createCombatant({
            id: base.id,
            name: base.name,
            portrait: portrait,
            isPlayer: false,
            isActive: true,
            isBench: false,
            stats: { ...base.stats, maxHP: base.stats.hp },
            pos: enemyPos
          }) :
          {
            id: base.id,
            name: base.name,
            portrait: portrait,
            isPlayer: false,
            isActive: true,
            isBench: false,
            stats: { ...base.stats, maxHP: base.stats.hp },
            pos: enemyPos,
            chakra: 0,
            maxChakra: 10,
            speedGauge: 1100 + Math.floor(Math.random() * 80), // Enemies start at 1100-1180 (almost ready)
            isPaused: false,
            isGuarding: false,
            statusEffects: [],
            chakraMode: "NONE"
          };
        unit._ref = { enemy: base, base };

        // Initialize passive abilities (if enemy has any)
        if (window.BattlePassives) {
          window.BattlePassives.initializePassives(unit, bm);
        }

        return unit;
      });

      // Reset active team state for new wave
      bm.activeTeam.forEach(p => {
        p.speedGauge = Math.floor(Math.random() * 200);
        p.isGuarding = false;
      });

      bm.updateCombatants();
      bm.renderAllUnits();

      // Initialize field/buddy skills after first wave loads (only once)
      if (!this._fieldBuddyInitialized && window.BattleFieldBuddy) {
        try {
          window.BattleFieldBuddy.init(bm);
          this._fieldBuddyInitialized = true;
        } catch (err) {
          console.error("[Missions] Field/Buddy init error:", err);
        }
      }

      bm.isPaused = false;

      console.log(`[Missions] Wave loaded with ${bm.enemyTeam.length} enemies`);

      // Detailed enemy inspection
      bm.enemyTeam.forEach((enemy, i) => {
        console.log(`[Missions] ========== ENEMY ${i + 1}: ${enemy.name} ==========`);
        console.log(`[Missions]   isPlayer: ${enemy.isPlayer}`);
        console.log(`[Missions]   isActive: ${enemy.isActive}`);
        console.log(`[Missions]   isBench: ${enemy.isBench}`);
        console.log(`[Missions]   isPaused: ${enemy.isPaused}`);
        console.log(`[Missions]   HP: ${enemy.stats.hp}`);
        console.log(`[Missions]   Speed: ${enemy.stats.speed}`);
        console.log(`[Missions]   SpeedGauge: ${enemy.speedGauge}`);
        console.log(`[Missions] ==========================================`);
      });
    },

    /**
     * Handle wave completion - check if there are more waves or stages
     * @param {Object} bm - BattleManager reference
     */
    async handleWaveComplete(bm) {
      console.log("[Missions] Wave complete!");

      const stages = bm.missionData.difficulties[bm.difficulty];
      const currentStage = stages[bm.currentStageIndex];
      const totalWaves = currentStage.waves?.length || 0;

      // Check if there are more waves in current stage
      if (bm.currentWaveIndex < totalWaves - 1) {
        console.log(`[Missions] Loading next wave: ${bm.currentWaveIndex + 2}/${totalWaves}`);

        // Show wave transition message
        this.showWaveTransition(bm, bm.currentWaveIndex + 2, totalWaves);

        setTimeout(() => {
          this.loadWave(bm, currentStage.waves, bm.currentWaveIndex + 1);
        }, 2000);
      }
      // Check if there are more stages
      else if (bm.currentStageIndex < stages.length - 1) {
        console.log(`[Missions] Stage complete! Loading next stage: ${bm.currentStageIndex + 2}/${stages.length}`);

        // Award chest for completed stage
        if (window.BattleRewards) {
          await window.BattleRewards.awardStageChest(currentStage, bm.currentStageIndex, bm);
        }

        // Show stage transition message
        this.showStageTransition(bm, bm.currentStageIndex + 2, stages.length);

        setTimeout(async () => {
          // Collect chest before next stage
          if (window.BattleRewards) {
            await window.BattleRewards.collectStageChest(bm);
          }
          this.loadStage(bm, bm.currentStageIndex + 1);
        }, 2500);
      }
      // Mission complete!
      else {
        console.log("[Missions] All stages and waves complete!");

        // Award final stage chest (arena pays out via arena stars instead)
        if (window.BattleRewards && !bm.isArena) {
          await window.BattleRewards.awardStageChest(currentStage, bm.currentStageIndex, bm);
        }

        // Record completion, first-clear rewards, player EXP and dailies
        await this.recordMissionComplete(bm);

        setTimeout(async () => {
          // Show results screen with all collected chests
          if (!bm.isArena && window.BattleRewards && window.BattleRewards.collectedChests.length > 0) {
            await window.BattleRewards.showResultsScreen(bm);
          } else {
            this.declareVictory(bm);
          }
        }, 1000);
      }
    },

    /**
     * Persist mission completion and grant progression rewards.
     * Runs once per battle; arena fights don't count as missions.
     * @param {Object} bm - BattleManager reference
     */
    async recordMissionComplete(bm) {
      if (bm._missionCompletionRecorded || bm.isArena) return;
      bm._missionCompletionRecorded = true;

      const missionId = bm.missionData?.id || localStorage.getItem("currentMissionId");
      const difficulty = bm.difficulty;

      try {
        if (window.MissionProgress && missionId && difficulty) {
          const result = await window.MissionProgress.completeMission(missionId, difficulty);
          console.log("[Missions] Completion recorded:", missionId, difficulty, result?.rewards);
        }
      } catch (err) {
        console.error("[Missions] Failed to record completion:", err);
      }

      try {
        if (window.ExpRewards) {
          const stats = this.calculateBattleStats(bm);
          const expByDifficulty = { C: "MISSION_EASY", B: "MISSION_NORMAL", A: "MISSION_HARD", S: "MISSION_EXTREME" };
          window.ExpRewards.giveReward(expByDifficulty[difficulty] || "MISSION_NORMAL");
          window.ExpRewards.onBattleWin({
            unitsLost: stats.totalUnits - stats.survivingUnits,
            damageTaken: stats.maxTeamHP - stats.teamHP
          });
        }
      } catch (err) {
        console.error("[Missions] Failed to award EXP:", err);
      }

      try {
        if (window.DailyMissions) {
          await window.DailyMissions.incrementDaily("daily_complete_mission");
        }
      } catch (err) {
        console.error("[Missions] Failed to update daily missions:", err);
      }
    },

    /**
     * Record an arena battle outcome: stars, win/loss record, streak,
     * battle history and ryo payout. Runs once per battle.
     * @param {Object} bm - BattleManager reference
     * @param {boolean} isVictory - Whether the player won
     * @returns {Object|null} outcome summary for the result screen
     */
    recordArenaResult(bm, isVictory) {
      if (!bm.isArena || bm._arenaResultRecorded) return bm._arenaOutcome || null;
      bm._arenaResultRecorded = true;

      let opponent = null;
      try { opponent = JSON.parse(localStorage.getItem("arena_opponent") || "null"); } catch (e) {}
      localStorage.removeItem("arena_opponent");

      let record = { wins: 0, losses: 0, streak: 0, bestStreak: 0 };
      try {
        const saved = JSON.parse(localStorage.getItem("arena_record_v1") || "null");
        if (saved && typeof saved === "object") record = { ...record, ...saved };
      } catch (e) {}

      const starsBefore = Math.max(0, Number(localStorage.getItem("arena_stars")) || 0);
      let starsGained = 0;
      let ryoGained = 0;

      if (isVictory) {
        record.wins++;
        record.streak++;
        record.bestStreak = Math.max(record.bestStreak, record.streak);

        // Base star + opponent bounty + streak bonus every 3rd consecutive win
        starsGained = 1 + Math.max(0, Number(opponent?.bonusStars) || 0);
        if (record.streak > 0 && record.streak % 3 === 0) starsGained++;

        ryoGained = 3000 + starsBefore * 100;
      } else {
        record.losses++;
        record.streak = 0;

        // Demotion pressure only above Chunin (30+ stars); consolation ryo
        if (starsBefore > 30) starsGained = -1;
        ryoGained = 500;
      }

      const starsAfter = Math.max(0, starsBefore + starsGained);
      localStorage.setItem("arena_stars", String(starsAfter));
      localStorage.setItem("arena_record_v1", JSON.stringify(record));

      // Battle history (latest first, capped at 10)
      try {
        let history = [];
        try { history = JSON.parse(localStorage.getItem("arena_history_v1") || "[]"); } catch (e) {}
        if (!Array.isArray(history)) history = [];
        history.unshift({
          result: isVictory ? "win" : "loss",
          opponent: opponent?.name || "Unknown Shinobi",
          epithet: opponent?.epithet || "",
          stars: starsGained,
          streak: record.streak,
          date: new Date().toISOString()
        });
        localStorage.setItem("arena_history_v1", JSON.stringify(history.slice(0, 10)));
      } catch (e) {
        console.error("[Missions] Failed to save arena history:", e);
      }

      if (ryoGained > 0 && window.Resources) {
        window.Resources.add("ryo", ryoGained);
      }

      if (isVictory && window.ExpRewards) {
        try { window.ExpRewards.onBattleWin({}); } catch (e) {}
      }

      bm._arenaOutcome = {
        starsGained,
        starsAfter,
        ryoGained,
        streak: record.streak,
        opponent: opponent?.name || null
      };
      console.log("[Missions] Arena result recorded:", bm._arenaOutcome);
      return bm._arenaOutcome;
    },

    /**
     * Show wave transition message
     * @param {Object} bm - BattleManager reference
     * @param {number} nextWave - Next wave number
     * @param {number} totalWaves - Total waves in stage
     */
    showWaveTransition(bm, nextWave, totalWaves) {
      if (!bm.dom.scene) return;

      const transition = document.createElement('div');
      transition.className = 'wave-transition';
      transition.style.position = 'absolute';
      transition.style.inset = '0';
      transition.style.display = 'flex';
      transition.style.flexDirection = 'column';
      transition.style.alignItems = 'center';
      transition.style.justifyContent = 'center';
      transition.style.background =
        "linear-gradient(rgba(6,8,16,0.58), rgba(6,8,16,0.72)), " +
        "url('assets/ui/generated/wave_clear_bg.webp') center center / cover no-repeat, " +
        "rgba(10, 15, 30, 0.95)";
      transition.style.zIndex = '999';
      transition.style.animation = 'fadeInOut 2s ease-in-out';
      transition.style.backdropFilter = 'blur(8px)';

      transition.innerHTML = `
        <div style="
          font-family: 'Cinzel', serif;
          font-size: 1.2rem;
          font-weight: 600;
          color: rgba(212, 175, 55, 0.8);
          letter-spacing: 0.3em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        ">
          Wave
        </div>
        <div style="
          font-family: 'Cinzel', serif;
          font-size: 5rem;
          font-weight: 700;
          color: #d4af37;
          text-shadow:
            0 0 20px rgba(212, 175, 55, 0.4),
            0 0 40px rgba(212, 175, 55, 0.2),
            0 4px 8px rgba(0, 0, 0, 0.8);
          letter-spacing: 0.1em;
        ">
          ${nextWave}
        </div>
        <div style="
          font-family: 'Cinzel', serif;
          font-size: 1rem;
          color: rgba(212, 175, 55, 0.6);
          margin-top: 0.5rem;
          letter-spacing: 0.2em;
        ">
          ${nextWave} of ${totalWaves}
        </div>
      `;

      bm.dom.scene.appendChild(transition);

      setTimeout(() => transition.remove(), 2000);
    },

    /**
     * Show stage transition message
     * @param {Object} bm - BattleManager reference
     * @param {number} nextStage - Next stage number
     * @param {number} totalStages - Total stages in mission
     */
    showStageTransition(bm, nextStage, totalStages) {
      if (!bm.dom.scene) return;

      const transition = document.createElement('div');
      transition.className = 'stage-transition';
      transition.style.position = 'absolute';
      transition.style.inset = '0';
      transition.style.display = 'flex';
      transition.style.flexDirection = 'column';
      transition.style.alignItems = 'center';
      transition.style.justifyContent = 'center';
      transition.style.background =
        "linear-gradient(rgba(6,8,16,0.55), rgba(6,8,16,0.70)), " +
        "url('assets/ui/generated/wave_clear_bg.webp') center center / cover no-repeat, " +
        "rgba(10, 15, 30, 0.95)";
      transition.style.zIndex = '999';
      transition.style.animation = 'fadeInOut 2.5s ease-in-out';
      transition.style.backdropFilter = 'blur(10px)';

      transition.innerHTML = `
        <div style="
          font-family: 'Cinzel', serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: #b8985f;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-bottom: 2rem;
          text-shadow: 0 0 15px rgba(184, 152, 95, 0.4);
        ">
          Stage Complete
        </div>
        <div style="
          width: 120px;
          height: 2px;
          background: linear-gradient(90deg, transparent, #d4af37, transparent);
          margin-bottom: 2rem;
        "></div>
        <div style="
          font-family: 'Cinzel', serif;
          font-size: 1.2rem;
          font-weight: 600;
          color: rgba(212, 175, 55, 0.8);
          letter-spacing: 0.3em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        ">
          Next Stage
        </div>
        <div style="
          font-family: 'Cinzel', serif;
          font-size: 6rem;
          font-weight: 700;
          color: #d4af37;
          text-shadow:
            0 0 25px rgba(212, 175, 55, 0.5),
            0 0 50px rgba(212, 175, 55, 0.3),
            0 6px 12px rgba(0, 0, 0, 0.9);
          letter-spacing: 0.1em;
        ">
          ${nextStage}
        </div>
        <div style="
          font-family: 'Cinzel', serif;
          font-size: 1rem;
          color: rgba(212, 175, 55, 0.6);
          margin-top: 1rem;
          letter-spacing: 0.2em;
        ">
          ${nextStage} of ${totalStages}
        </div>
      `;

      bm.dom.scene.appendChild(transition);

      setTimeout(() => transition.remove(), 2500);
    },

    /**
     * Declare victory and show results
     * @param {Object} bm - BattleManager reference
     */
    declareVictory(bm) {
      console.log("🏆 VICTORY!");

      bm.isPaused = true;

      if (bm.speedGaugeInterval) {
        clearInterval(bm.speedGaugeInterval);
      }

      if (bm.isArena) {
        this.recordArenaResult(bm, true);
      }

      // Calculate statistics
      const stats = this.calculateBattleStats(bm);

      this.showResult(bm, true, stats);
    },

    /**
     * Declare defeat and show results
     * @param {Object} bm - BattleManager reference
     */
    declareDefeat(bm) {
      console.log("💀 DEFEAT!");

      bm.isPaused = true;

      if (bm.speedGaugeInterval) {
        clearInterval(bm.speedGaugeInterval);
      }

      if (bm.isArena) {
        this.recordArenaResult(bm, false);
      }

      // Calculate statistics
      const stats = this.calculateBattleStats(bm);

      this.showResult(bm, false, stats);
    },

    /**
     * Calculate battle statistics
     * @param {Object} bm - BattleManager reference
     * @returns {Object} Battle statistics
     */
    calculateBattleStats(bm) {
      const teamHP = bm.activeTeam.reduce((sum, u) => sum + u.stats.hp, 0);
      const maxTeamHP = bm.activeTeam.reduce((sum, u) => sum + u.stats.maxHP, 0);
      const survivingUnits = bm.activeTeam.filter(u => u.stats.hp > 0).length;

      return {
        stage: bm.currentStageIndex + 1,
        wave: bm.currentWaveIndex + 1,
        teamHP,
        maxTeamHP,
        hpPercent: maxTeamHP > 0 ? Math.round((teamHP / maxTeamHP) * 100) : 0,
        survivingUnits,
        totalUnits: bm.activeTeam.length
      };
    },

    /**
     * Show battle result screen
     * @param {Object} bm - BattleManager reference
     * @param {boolean} isVictory - Whether the player won
     * @param {Object} stats - Battle statistics
     */
    showResult(bm, isVictory, stats) {
      if (!bm.dom.battleResult) return;

      // Set title with proper class
      bm.dom.resultTitle.textContent = isVictory ? "VICTORY" : "DEFEAT";
      bm.dom.resultTitle.className = isVictory ? "result-title victory" : "result-title defeat";

      // Create professional stats HTML
      const isArena = !!bm.isArena;
      const subtitle = isArena
        ? (isVictory ? "Arena Victory" : "Arena Defeat")
        : (isVictory ? "Mission Accomplished" : "Mission Failed");
      const returnUrl = isArena ? 'arena.html' : 'missions.html';

      // Arena outcome rows (stars, streak, ryo)
      const arena = bm._arenaOutcome;
      const arenaRowsHTML = (isArena && arena) ? `
          <div class="stat-divider"></div>

          <div class="stat-row">
            <span class="stat-label">${arena.opponent ? `Opponent` : `Arena`}</span>
            <span class="stat-value gold">${arena.opponent || 'Ranked Match'}</span>
          </div>

          <div class="stat-row">
            <span class="stat-label">Arena Stars</span>
            <span class="stat-value ${arena.starsGained >= 0 ? 'gold' : ''}">
              ${arena.starsGained > 0 ? '+' : ''}${arena.starsGained} ★ &nbsp;(${arena.starsAfter} total)
            </span>
          </div>

          ${arena.streak > 1 ? `
          <div class="stat-row">
            <span class="stat-label">Win Streak</span>
            <span class="stat-value gold">${arena.streak}</span>
          </div>` : ''}

          ${arena.ryoGained > 0 ? `
          <div class="stat-row">
            <span class="stat-label">Ryo Earned</span>
            <span class="stat-value">${arena.ryoGained.toLocaleString()}</span>
          </div>` : ''}
      ` : '';

      bm.dom.resultStats.innerHTML = `
        <div class="result-subtitle">
          ${subtitle}
        </div>

        <div class="result-stats">
          <!-- Mission Info -->
          <div class="stat-row">
            <span class="stat-label">${isArena ? "Mode" : "Mission"}</span>
            <span class="stat-value gold">${bm.missionData.name}</span>
          </div>

          <div class="stat-row">
            <span class="stat-label">Difficulty</span>
            <span class="stat-value gold">${bm.difficulty}-Rank</span>
          </div>

          <div class="stat-divider"></div>

          <!-- Progress Info -->
          <div class="stat-row">
            <span class="stat-label">Stage Reached</span>
            <span class="stat-value">${stats.stage}</span>
          </div>

          <div class="stat-row">
            <span class="stat-label">Wave Completed</span>
            <span class="stat-value">${stats.wave}</span>
          </div>
          ${arenaRowsHTML}

          <div class="stat-divider"></div>

          <!-- Team Status -->
          <div class="result-summary">
            <div class="summary-row">
              <span class="summary-label">Units Surviving</span>
              <span class="summary-value ${stats.survivingUnits > 0 ? 'success' : 'danger'}">
                ${stats.survivingUnits} / ${stats.totalUnits}
              </span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Team HP</span>
              <span class="summary-value ${stats.hpPercent > 50 ? 'success' : stats.hpPercent > 25 ? 'warning' : 'danger'}">
                ${stats.teamHP.toLocaleString()} / ${stats.maxTeamHP.toLocaleString()}
              </span>
            </div>
            <div class="summary-row">
              <span class="summary-label">HP Remaining</span>
              <span class="summary-value ${stats.hpPercent > 50 ? 'success' : stats.hpPercent > 25 ? 'warning' : 'danger'}">
                ${stats.hpPercent}%
              </span>
            </div>
          </div>
        </div>

        <div class="result-buttons">
          <button class="result-btn primary" id="btn-continue-battle">
            ${isVictory ? "Continue" : "Return"}
          </button>
          ${!isVictory ? '<button class="result-btn secondary" id="btn-retry-battle">Retry</button>' : ''}
        </div>
      `;

      // Add event listeners
      const btnContinue = document.getElementById('btn-continue-battle');
      const btnRetry = document.getElementById('btn-retry-battle');

      if (btnContinue) {
        btnContinue.addEventListener('click', () => {
          // Clean up any lingering arena state
          if (isArena) {
            localStorage.removeItem('arena_enemies');
            localStorage.removeItem('arena_map');
          }
          window.location.href = returnUrl;
        });
      }

      if (btnRetry && !isVictory) {
        btnRetry.addEventListener('click', () => {
          window.location.reload();
        });
      }

      bm.dom.battleResult.classList.remove("hidden");

      // Trigger screen effect
      if (window.BattleAnimations) {
        window.BattleAnimations.screenFlash(
          isVictory ? 'rgba(255, 215, 0, 0.15)' : 'rgba(184, 134, 11, 0.1)',
          500,
          bm.dom
        );
      }
    }
  };

  // Export to window
  window.BattleMissions = BattleMissions;

  // Add CSS animations for transitions
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% {
        opacity: 0;
        transform: scale(0.92) translateY(20px);
      }
      15% {
        opacity: 1;
        transform: scale(1.02) translateY(-5px);
      }
      20% {
        transform: scale(1) translateY(0);
      }
      80% {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      100% {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
      }
    }

    @keyframes goldShimmer {
      0%, 100% {
        filter: brightness(1);
      }
      50% {
        filter: brightness(1.3);
      }
    }

    .wave-transition, .stage-transition {
      animation: fadeInOut 2s ease-in-out;
    }

    .wave-transition > div:nth-child(2),
    .stage-transition > div:nth-child(4) {
      animation: fadeInOut 2s ease-in-out, goldShimmer 1.5s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);

  console.log("[BattleMissions] Module loaded");

})();
