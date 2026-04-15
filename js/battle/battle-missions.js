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
      bm.enemyTeam = (waveData.enemies || []).map((enemyId, i) => {
        // First try to find in enemiesData, then fallback to charactersData
        let base = bm.enemiesData.find(e => e.id === enemyId);

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
              name: enemyId,
              portrait: "assets/characters/common/silhouette.png",
              stats: { hp: 800, atk: 80, def: 30, speed: 90, chakra: 5 }
            };
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

        // Award final stage chest
        if (window.BattleRewards) {
          await window.BattleRewards.awardStageChest(currentStage, bm.currentStageIndex, bm);
        }

        setTimeout(async () => {
          // Show results screen with all collected chests
          if (window.BattleRewards && window.BattleRewards.collectedChests.length > 0) {
            await window.BattleRewards.showResultsScreen(bm);
          } else {
            this.declareVictory(bm);
          }
        }, 1000);
      }
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
      transition.style.backgroundColor = 'rgba(10, 15, 30, 0.95)';
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
      transition.style.backgroundColor = 'rgba(10, 15, 30, 0.95)';
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
      bm.dom.resultStats.innerHTML = `
        <div class="result-subtitle">
          ${isVictory ? "Mission Accomplished" : "Mission Failed"}
        </div>

        <div class="result-stats">
          <!-- Mission Info -->
          <div class="stat-row">
            <span class="stat-label">Mission</span>
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
          window.location.href = 'missions.html';
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
