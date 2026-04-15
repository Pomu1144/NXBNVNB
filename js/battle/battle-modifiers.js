// js/battle/battle-modifiers.js - Mission Modifiers System
(() => {
  "use strict";

  /**
   * BattleModifiers Module
   * Handles mission difficulty modifiers and challenge modes
   *
   * Modifier Types:
   * - HARD: Enemies have 2x HP and ATK
   * - SPEED_RUN: Time limit for bonus rewards
   * - NO_JUTSU: Only basic attacks allowed
   * - SURVIVAL: Endless waves until defeat
   */
  const BattleModifiers = {

    activeModifiers: [],
    startTime: null,
    timeLimit: 180000, // 3 minutes for speed run
    survivalWaveCount: 0,

    /**
     * Initialize modifiers from URL params or saved state
     */
    init(core) {
      console.log("[Modifiers] Initializing mission modifiers");

      // Check URL params for modifiers
      const urlParams = new URLSearchParams(window.location.search);
      const modifiersParam = urlParams.get('modifiers');

      if (modifiersParam) {
        this.activeModifiers = modifiersParam.split(',');
      } else {
        // Check localStorage for saved modifiers
        const saved = localStorage.getItem('blazing_mission_modifiers');
        if (saved) {
          this.activeModifiers = JSON.parse(saved);
        }
      }

      console.log("[Modifiers] Active modifiers:", this.activeModifiers);

      // Apply modifiers
      this.applyModifiers(core);

      // Start timer for speed run
      if (this.hasModifier('SPEED_RUN')) {
        this.startSpeedRunTimer(core);
      }
    },

    /**
     * Check if a modifier is active
     */
    hasModifier(modifier) {
      return this.activeModifiers.includes(modifier);
    },

    /**
     * Apply all active modifiers
     */
    applyModifiers(core) {
      if (this.hasModifier('HARD')) {
        this.applyHardMode(core);
      }

      if (this.hasModifier('NO_JUTSU')) {
        this.applyNoJutsuMode(core);
      }

      if (this.hasModifier('SURVIVAL')) {
        this.applySurvivalMode(core);
      }
    },

    /**
     * HARD MODE: Enemies have 2x HP and ATK
     */
    applyHardMode(core) {
      console.log("[Modifiers] Applying HARD MODE");

      core.enemyTeam.forEach(enemy => {
        enemy.stats.hp *= 2;
        enemy.stats.maxHP *= 2;
        enemy.stats.atk *= 2;

        console.log(`[Modifiers] ${enemy.name} buffed:`, {
          hp: enemy.stats.hp,
          atk: enemy.stats.atk
        });
      });

      // Show hard mode indicator
      this.showModifierIndicator('HARD MODE', '#ff4444', core);
    },

    /**
     * SPEED RUN MODE: Time limit for bonus rewards
     */
    startSpeedRunTimer(core) {
      console.log("[Modifiers] Starting SPEED RUN timer");

      this.startTime = Date.now();

      // Create timer UI
      this.createTimerUI(core);

      // Update timer every second
      this.timerInterval = setInterval(() => {
        this.updateTimer(core);
      }, 1000);
    },

    /**
     * Create timer UI element
     */
    createTimerUI(core) {
      if (document.getElementById('speed-run-timer')) return;

      const timerEl = document.createElement('div');
      timerEl.id = 'speed-run-timer';

      timerEl.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: rgba(20, 25, 35, 0.95);
        border: 2px solid rgba(255, 215, 0, 0.5);
        border-radius: 8px;
        padding: 10px 20px;
        font-family: 'Cinzel', serif;
        font-size: 1.2rem;
        font-weight: bold;
        color: #ffd700;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
      `;

      timerEl.innerHTML = `
        <div style="font-size: 0.8rem; margin-bottom: 4px; color: #b8985f;">SPEED RUN</div>
        <div id="timer-display">3:00</div>
      `;

      document.body.appendChild(timerEl);
    },

    /**
     * Update timer display
     */
    updateTimer(core) {
      const elapsed = Date.now() - this.startTime;
      const remaining = Math.max(0, this.timeLimit - elapsed);

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      const timerDisplay = document.getElementById('timer-display');
      if (timerDisplay) {
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Change color when time is running out
        if (remaining < 30000) {
          timerDisplay.style.color = '#ff4444';
          timerDisplay.style.animation = 'timerPulse 0.5s ease-in-out infinite';
        }
      }

      // Time's up!
      if (remaining <= 0) {
        this.handleSpeedRunTimeout(core);
      }
    },

    /**
     * Handle speed run timeout
     */
    handleSpeedRunTimeout(core) {
      console.log("[Modifiers] Speed run time's up!");

      clearInterval(this.timerInterval);

      // Show timeout message
      if (window.BattleNarrator) {
        window.BattleNarrator.narrate("TIME'S UP! Speed run failed.", core);
      }

      // Reduce rewards (handled in victory screen)
      core.speedRunFailed = true;
    },

    /**
     * NO JUTSU MODE: Only basic attacks allowed
     */
    applyNoJutsuMode(core) {
      console.log("[Modifiers] Applying NO JUTSU MODE");

      // Disable jutsu and ultimate buttons
      const disableSkills = () => {
        if (core.dom.btnJutsu) {
          core.dom.btnJutsu.classList.add('disabled');
          core.dom.btnJutsu.style.opacity = '0.3';
          core.dom.btnJutsu.style.pointerEvents = 'none';
        }
        if (core.dom.btnUltimate) {
          core.dom.btnUltimate.classList.add('disabled');
          core.dom.btnUltimate.style.opacity = '0.3';
          core.dom.btnUltimate.style.pointerEvents = 'none';
        }
        if (core.dom.btnSecret) {
          core.dom.btnSecret.classList.add('disabled');
          core.dom.btnSecret.style.opacity = '0.3';
          core.dom.btnSecret.style.pointerEvents = 'none';
        }
      };

      // Disable initially and on every turn
      disableSkills();
      core.noJutsuDisableCallback = disableSkills;

      this.showModifierIndicator('NO JUTSU', '#4488ff', core);
    },

    /**
     * SURVIVAL MODE: Endless waves
     */
    applySurvivalMode(core) {
      console.log("[Modifiers] Applying SURVIVAL MODE");

      this.survivalWaveCount = 0;

      // Override wave completion to generate endless waves
      core.survivalMode = true;

      this.showModifierIndicator('SURVIVAL', '#ff9900', core);
      this.createSurvivalUI(core);
    },

    /**
     * Create survival mode UI
     */
    createSurvivalUI(core) {
      if (document.getElementById('survival-counter')) return;

      const counterEl = document.createElement('div');
      counterEl.id = 'survival-counter';

      counterEl.style.cssText = `
        position: fixed;
        top: 150px;
        right: 20px;
        background: rgba(20, 25, 35, 0.95);
        border: 2px solid rgba(255, 153, 0, 0.5);
        border-radius: 8px;
        padding: 10px 20px;
        font-family: 'Cinzel', serif;
        font-size: 1.2rem;
        font-weight: bold;
        color: #ff9900;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
      `;

      counterEl.innerHTML = `
        <div style="font-size: 0.8rem; margin-bottom: 4px; color: #b8985f;">WAVE</div>
        <div id="survival-wave-num">1</div>
      `;

      document.body.appendChild(counterEl);
    },

    /**
     * Update survival wave counter
     */
    updateSurvivalWave(waveNum) {
      this.survivalWaveCount = waveNum;

      const waveNumEl = document.getElementById('survival-wave-num');
      if (waveNumEl) {
        waveNumEl.textContent = waveNum;
      }
    },

    /**
     * Generate next survival wave with scaled difficulty
     */
    generateSurvivalWave(core, baseWave) {
      const waveNum = this.survivalWaveCount + 1;
      const scaleFactor = 1 + (waveNum * 0.2); // 20% increase per wave

      console.log(`[Modifiers] Generating survival wave ${waveNum} (scale: ${scaleFactor}x)`);

      // Scale up enemy stats
      const scaledEnemies = baseWave.enemies.map(enemyId => {
        return {
          ...enemyId,
          hpMultiplier: scaleFactor,
          atkMultiplier: scaleFactor
        };
      });

      this.updateSurvivalWave(waveNum);

      return { enemies: scaledEnemies };
    },

    /**
     * Show modifier indicator on screen
     */
    showModifierIndicator(text, color, core) {
      const indicator = document.createElement('div');
      indicator.className = 'modifier-indicator';

      indicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        font-size: 3rem;
        font-weight: bold;
        font-family: 'Cinzel', serif;
        color: ${color};
        text-shadow:
          0 0 20px ${color},
          0 0 40px ${color},
          3px 3px 6px rgba(0, 0, 0, 0.9);
        z-index: 9999;
        pointer-events: none;
        letter-spacing: 3px;
        animation: modifierIndicator 2s ease-out forwards;
      `;

      indicator.textContent = text;

      document.body.appendChild(indicator);
      setTimeout(() => indicator.remove(), 2000);
    },

    /**
     * Get modifier bonuses for rewards
     */
    getRewardMultiplier() {
      let multiplier = 1.0;

      if (this.hasModifier('HARD')) multiplier *= 2.0;
      if (this.hasModifier('SPEED_RUN') && !core.speedRunFailed) multiplier *= 1.5;
      if (this.hasModifier('NO_JUTSU')) multiplier *= 1.8;
      if (this.hasModifier('SURVIVAL')) multiplier *= (1 + this.survivalWaveCount * 0.5);

      return multiplier;
    },

    /**
     * Cleanup on battle end
     */
    cleanup() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
      }

      document.getElementById('speed-run-timer')?.remove();
      document.getElementById('survival-counter')?.remove();
    },

    /**
     * Initialize modifier styles
     */
    initializeStyles() {
      if (document.getElementById('modifier-styles')) return;

      const style = document.createElement('style');
      style.id = 'modifier-styles';
      style.textContent = `
        @keyframes modifierIndicator {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
          20% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 1;
          }
          80% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0;
          }
        }

        @keyframes timerPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `;

      document.head.appendChild(style);
      console.log("[Modifiers] Styles initialized");
    }
  };

  // Initialize styles on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BattleModifiers.initializeStyles());
  } else {
    BattleModifiers.initializeStyles();
  }

  // Export globally
  window.BattleModifiers = BattleModifiers;
})();
