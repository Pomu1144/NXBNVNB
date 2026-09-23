// js/battle/battle-input-manager.js - 2-Stage Input State Machine
(() => {
  "use strict";

  /**
   * BattleInputManager Module
   * Implements proper 2-stage input system for Naruto Blazing battle mechanics
   *
   * STAGE 1 (Click): Select attack type
   * - Single click → Jutsu (when unlocked + enough chakra, else Normal Attack)
   * - Double click → Ultimate
   * - Triple click → Secret Technique
   *
   * STAGE 2 (Drag): Target and execute
   * - Drag start → Show targeting UI
   * - Drag move → Update target indicator
   * - Drag release → Execute attack
   *
   * INDEPENDENT: Unit switching
   * - Click bench portrait → Swap active/bench (does NOT affect attack state)
   */
  const BattleInputManager = {
    // Input states
    STATES: {
      IDLE: 'idle',
      READY_TO_DRAG: 'readyToDrag',
      DRAGGING: 'dragging'
    },

    // Attack types
    ATTACK_TYPES: {
      NORMAL: 'normal',
      JUTSU: 'jutsu',
      ULTIMATE: 'ultimate',
      SECRET: 'secret'
    },

    // Current state
    currentState: 'idle',
    selectedAttackType: null,
    selectedUnit: null,
    dragStartPos: null,
    currentTarget: null,

    /* ===== Initialization ===== */

    init(core) {
      this.core = core;
      this.setupDragHandlers();
      console.log('[InputManager] Initialized - 2-stage input system ready');
      return true;
    },

    /* ===== STAGE 1: Click to Select Attack Type ===== */

    /**
     * A unit may only arm an attack during its own turn.
     * Without this check, clicking any unit at any time armed the state
     * machine, and every subsequent drag executed another attack while
     * ending whichever turn was actually in progress.
     */
    canArmAttack(unit) {
      if (!unit || !unit.isPlayer || unit.stats?.hp <= 0) return false;
      const turns = this.core?.turns || window.BattleTurns;
      if (turns && turns.currentUnit !== unit) return false;
      return true;
    },

    /**
     * Why `unit` cannot use a skill right now ('jutsu' | 'ultimate' |
     * 'secret'), or null when it can. Uses the shared effective-cost helper.
     */
    skillBlockReason(unit, type) {
      const C = window.BattleCombat;
      if (!C) return 'Combat not ready';
      const skills = C.getUnitSkills(unit);
      const entry = skills?.[type];
      const label = type === 'jutsu' ? 'Jutsu' : type === 'ultimate' ? 'Ultimate' : 'Secret technique';
      if (!entry) return `${unit.name} has no ${label.toLowerCase()}`;
      if (type === 'jutsu' && !C.isJutsuUnlocked(unit)) return `${label} is locked! Requires Level 20.`;
      if (type === 'ultimate' && !C.isUltimateUnlocked(unit)) return `${label} is locked! Requires Level 50.`;
      if (type === 'secret' && !C.isSecretUnlocked(unit)) return `${label} is locked! Requires 6★ or higher.`;
      const cd = type === 'jutsu' ? unit.jutsuCooldown : type === 'ultimate' ? unit.ultimateCooldown : 0;
      if ((cd || 0) > 0) return `${label} on cooldown! (${cd} turn${cd > 1 ? 's' : ''} left)`;
      const cost = C.getSkillChakraCost(unit, entry);
      if ((Number(unit.chakra) || 0) < cost) return `Not enough chakra for ${label.toLowerCase()} (need ${cost}, have ${unit.chakra}).`;
      return null;
    },

    armSkill(unit, type) {
      this.selectedAttackType = type;
      this.selectedUnit = unit;
      this.currentState = this.STATES.READY_TO_DRAG;
      // Keep the button / sprite-drag / enemy-click paths in sync
      if (this.core && (type === 'jutsu' || type === 'ultimate')) this.core.queuedAction = type;
      window.BattleNarrator?.narrate?.(
        `${type === 'jutsu' ? 'Jutsu' : type === 'ultimate' ? 'Ultimate' : 'Secret technique'} ready — drag or tap an enemy`, this.core);
    },

    /**
     * Handle single click - select jutsu (falls back to a normal attack)
     */
    handleSingleClick(unit) {
      if (this.currentState !== this.STATES.IDLE) return;
      if (!this.canArmAttack(unit)) return;

      if (!this.skillBlockReason(unit, 'jutsu')) {
        console.log(`[InputManager] Single click: Jutsu selected for ${unit.name}`);
        this.armSkill(unit, this.ATTACK_TYPES.JUTSU);
        this.showAttackTypeSelected(unit, 'jutsu');
        return;
      }

      console.log(`[InputManager] Single click: Normal attack selected for ${unit.name}`);
      this.selectedAttackType = this.ATTACK_TYPES.NORMAL;
      this.selectedUnit = unit;
      this.currentState = this.STATES.READY_TO_DRAG;

      // Visual feedback - subtle glow
      this.showAttackTypeSelected(unit, 'normal');
    },

    /**
     * Handle double click - select ultimate
     */
    handleDoubleClick(unit) {
      if (this.currentState !== this.STATES.IDLE) return;
      if (!this.canArmAttack(unit)) return;

      // Check unlock / cooldown / chakra (effective cost)
      const why = this.skillBlockReason(unit, 'ultimate');
      if (why) {
        console.log(`[InputManager] ${why}`);
        window.BattleNarrator?.narrate?.(why, this.core);
        return;
      }

      console.log(`[InputManager] Double click: Ultimate selected for ${unit.name}`);
      this.armSkill(unit, this.ATTACK_TYPES.ULTIMATE);

      // Visual feedback - red lightning (non-blocking)
      if (window.BattleChakraWheel) {
        const wheel = window.BattleChakraWheel.getWheel(unit.id);
        if (wheel) {
          window.BattleChakraWheel.showLightningEffect(wheel, 'red');
        }
      }
    },

    /**
     * Handle triple click - select secret technique
     */
    handleTripleClick(unit) {
      if (this.currentState !== this.STATES.IDLE) return;
      if (!this.canArmAttack(unit)) return;

      const why = this.skillBlockReason(unit, 'secret');
      if (why) {
        console.log(`[InputManager] ${why}`);
        window.BattleNarrator?.narrate?.(why, this.core);
        return;
      }

      console.log(`[InputManager] Triple click: Secret Technique selected for ${unit.name}`);
      this.armSkill(unit, this.ATTACK_TYPES.SECRET);

      // Visual feedback - gold lightning (non-blocking)
      if (window.BattleChakraWheel) {
        const wheel = window.BattleChakraWheel.getWheel(unit.id);
        if (wheel) {
          window.BattleChakraWheel.showLightningEffect(wheel, 'gold');
        }
      }
    },

    /**
     * Show visual feedback for selected attack type
     */
    showAttackTypeSelected(unit, type) {
      const wheel = window.BattleChakraWheel?.getWheel(unit.id);
      if (!wheel) return;

      // Add subtle glow for normal attacks
      wheel.classList.add('attack-selected');
      setTimeout(() => {
        wheel.classList.remove('attack-selected');
      }, 500);
    },

    /* ===== STAGE 2: Drag to Target and Execute ===== */

    /**
     * Setup drag event handlers for targeting
     */
    setupDragHandlers() {
      document.addEventListener('pointerdown', (e) => this.handleDragStart(e));
      document.addEventListener('pointermove', (e) => this.handleDragMove(e));
      document.addEventListener('pointerup', (e) => this.handleDragEnd(e));
      document.addEventListener('pointercancel', (e) => this.cancelDrag(e));
    },

    /**
     * Handle drag start - begin targeting
     */
    handleDragStart(e) {
      // Only start drag if we're in ready-to-drag state
      if (this.currentState !== this.STATES.READY_TO_DRAG) return;

      // Check if drag started from the battle field area (not UI elements)
      const targetElement = e.target;
      if (targetElement.closest('.team-holder') ||
          targetElement.closest('.battle-ui-top') ||
          targetElement.closest('#action-panel') ||
          targetElement.closest('button')) {
        return; // Don't drag from UI elements
      }
      // Pressing the armed unit's own sprite: battle-drag's sprite drag
      // takes over (it reads the armed skill from core.queuedAction).
      if (this.selectedUnit && targetElement.closest(`.battle-unit[data-unit-id="${this.selectedUnit.id}"]`)) {
        return;
      }

      this.currentState = this.STATES.DRAGGING;
      this.dragStartPos = { x: e.clientX, y: e.clientY };
      // A plain tap on an enemy (no drag movement) should still target it
      this.currentTarget = this.findTargetAtPosition(this.dragStartPos);

      console.log(`[InputManager] Drag started - targeting mode active`);
      this.showTargetingUI();
    },

    /**
     * Handle drag move - update targeting indicator
     */
    handleDragMove(e) {
      if (this.currentState !== this.STATES.DRAGGING) return;

      const currentPos = { x: e.clientX, y: e.clientY };
      this.updateTargetingUI(currentPos);

      // Find potential target under cursor
      const target = this.findTargetAtPosition(currentPos);
      if (target) {
        this.currentTarget = target;
        this.highlightTarget(target);
      }
    },

    /**
     * Handle drag end - execute attack
     */
    handleDragEnd(e) {
      if (this.currentState !== this.STATES.DRAGGING) return;

      console.log(`[InputManager] Drag released - executing ${this.selectedAttackType} attack`);

      const endTarget = this.findTargetAtPosition({ x: e.clientX, y: e.clientY });
      if (endTarget) this.currentTarget = endTarget;

      // The armed skill is consumed by this release
      if (this.core && this.core.queuedAction === this.selectedAttackType) this.core.queuedAction = null;

      // Execute the attack
      if (this.currentTarget && this.selectedUnit) {
        this.executeAttack(this.selectedUnit, this.selectedAttackType, this.currentTarget);
      }

      // Reset state
      this.resetState();
    },

    /**
     * Cancel drag
     */
    cancelDrag(e) {
      if (this.currentState === this.STATES.DRAGGING) {
        console.log(`[InputManager] Drag cancelled`);
        this.resetState();
      }
    },

    /**
     * Show targeting UI overlay
     */
    showTargetingUI() {
      // Create targeting overlay
      const overlay = document.createElement('div');
      overlay.className = 'targeting-overlay';
      overlay.id = 'targeting-overlay';

      const indicator = document.createElement('div');
      indicator.className = 'targeting-indicator';
      indicator.id = 'targeting-indicator';

      overlay.appendChild(indicator);
      document.body.appendChild(overlay);
    },

    /**
     * Update targeting UI position
     */
    updateTargetingUI(pos) {
      const indicator = document.getElementById('targeting-indicator');
      if (indicator) {
        indicator.style.left = `${pos.x}px`;
        indicator.style.top = `${pos.y}px`;
      }
    },

    /**
     * Find target enemy at position
     */
    findTargetAtPosition(pos) {
      if (!this.core?.enemyTeam || !this.core.dom.scene) return null;

      // Get all enemy unit elements from the scene
      const scene = this.core.dom.scene;
      const enemies = this.core.enemyTeam.filter(e => e && e.stats.hp > 0);

      // Find enemy unit whose DOM element contains the cursor position
      for (const enemy of enemies) {
        const unitEl = scene.querySelector(`[data-unit-id="${enemy.id}"]`);
        if (!unitEl) continue;

        const rect = unitEl.getBoundingClientRect();

        // Check if cursor is within enemy's bounding box (with some padding for easier targeting)
        const padding = 20;
        if (
          pos.x >= rect.left - padding &&
          pos.x <= rect.right + padding &&
          pos.y >= rect.top - padding &&
          pos.y <= rect.bottom + padding
        ) {
          return enemy;
        }
      }

      // If no direct hit, find closest enemy to cursor position
      let closestEnemy = null;
      let closestDistance = Infinity;

      for (const enemy of enemies) {
        const unitEl = scene.querySelector(`[data-unit-id="${enemy.id}"]`);
        if (!unitEl) continue;

        const rect = unitEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distance = Math.sqrt(
          Math.pow(pos.x - centerX, 2) + Math.pow(pos.y - centerY, 2)
        );

        if (distance < closestDistance) {
          closestDistance = distance;
          closestEnemy = enemy;
        }
      }

      return closestEnemy;
    },

    /**
     * Highlight target enemy
     */
    highlightTarget(target) {
      if (!target || !this.core?.dom?.scene) return;

      // Remove previous highlights and kill their animations
      const prevHighlights = this.core.dom.scene.querySelectorAll('.target-highlight');
      prevHighlights.forEach(h => {
        if (window.gsap) {
          window.gsap.killTweensOf(h);
        }
        h.remove();
      });

      // Find target's DOM element
      const unitEl = this.core.dom.scene.querySelector(`[data-unit-id="${target.id}"]`);
      if (!unitEl) return;

      // Create highlight overlay
      const highlight = document.createElement('div');
      highlight.className = 'target-highlight';
      highlight.style.cssText = `
        position: absolute;
        pointer-events: none;
        border: 3px solid #ff4444;
        border-radius: 50%;
        box-shadow: 0 0 20px rgba(255, 68, 68, 0.8), inset 0 0 20px rgba(255, 68, 68, 0.4);
        z-index: 100;
        opacity: 0;
        transform: scale(0.8);
      `;

      const rect = unitEl.getBoundingClientRect();
      const sceneRect = this.core.dom.scene.getBoundingClientRect();

      highlight.style.left = `${rect.left - sceneRect.left - 5}px`;
      highlight.style.top = `${rect.top - sceneRect.top - 5}px`;
      highlight.style.width = `${rect.width + 10}px`;
      highlight.style.height = `${rect.height + 10}px`;

      this.core.dom.scene.appendChild(highlight);

      // Animate with GSAP for smooth, professional feel
      if (window.gsap) {
        // Initial pop-in
        window.gsap.fromTo(highlight,
          { scale: 0.8, opacity: 0 },
          {
            scale: 1,
            opacity: 0.9,
            duration: 0.2,
            ease: "back.out(2)",
            onComplete: () => {
              // Continuous pulse
              window.gsap.to(highlight, {
                scale: 1.08,
                opacity: 1,
                duration: 0.4,
                ease: "sine.inOut",
                yoyo: true,
                repeat: -1
              });
            }
          }
        );
      } else {
        // Fallback to CSS animation
        highlight.style.animation = 'targetPulse 0.6s ease-in-out infinite';
        highlight.style.opacity = '0.9';
        highlight.style.transform = 'scale(1)';
      }

      console.log(`[InputManager] Targeting: ${target.name}`);
    },

    /**
     * Execute the selected attack
     */
    executeAttack(attacker, attackType, target) {
      const core = this.core;

      // The turn may have ended (or changed hands) since the attack was armed
      if (core?.turns && core.turns.currentUnit !== attacker) {
        console.warn(`[InputManager] Ignoring ${attackType} from ${attacker.name} — not their turn`);
        return;
      }

      console.log(`[InputManager] Executing ${attackType} attack: ${attacker.name} → ${target.name}`);

      // Only ever end THIS unit's turn, and only once
      const doEndTurn = () => {
        if (core?.turns) {
          if (core.turns.currentUnit === attacker) core.turns.endTurn(core);
        } else if (core?.endTurn) {
          core.endTurn();
        }
      };

      if (window.BattleCombat) {
        let ok = true;
        switch (attackType) {
          case this.ATTACK_TYPES.NORMAL:
            window.BattleCombat.performAttack(attacker, target, core, doEndTurn);
            break;
          case this.ATTACK_TYPES.JUTSU:
            ok = window.BattleCombat.performJutsu(attacker, target, core, doEndTurn) !== false;
            break;
          case this.ATTACK_TYPES.ULTIMATE:
            ok = window.BattleCombat.performUltimate(attacker, [target], core, doEndTurn) !== false;
            break;
          case this.ATTACK_TYPES.SECRET: {
            ok = window.BattleCombat.performSecret(attacker, core);
            if (ok) doEndTurn();
            break;
          }
        }
        // Skill refused (sealed / locked / chakra): the turn stays open
        if (!ok) {
          console.warn(`[InputManager] ${attackType} could not be used by ${attacker.name}`);
          return;
        }

        // Watchdog: if the combat callback never fires (mirrors the AI
        // turn's safety net), release the turn instead of soft-locking
        const watchdog = () => {
          if (core?.turns && core.turns.currentUnit === attacker) {
            if (attacker._actionBusy) { setTimeout(watchdog, 1000); return; } // sprite skill still playing
            console.warn(`[InputManager] Watchdog releasing stuck turn for ${attacker.name}`);
            core.turns.endTurn(core);
          }
        };
        setTimeout(watchdog, 6000);
      }
    },

    /**
     * Reset input state to idle
     */
    resetState() {
      this.currentState = this.STATES.IDLE;
      this.selectedAttackType = null;
      this.selectedUnit = null;
      this.dragStartPos = null;
      this.currentTarget = null;

      // Remove targeting UI
      const overlay = document.getElementById('targeting-overlay');
      if (overlay) {
        overlay.remove();
      }

      // Remove target highlights
      if (this.core?.dom?.scene) {
        const highlights = this.core.dom.scene.querySelectorAll('.target-highlight');
        highlights.forEach(h => h.remove());
      }
    },

    /* ===== INDEPENDENT: Unit Switching ===== */

    /**
     * Handle unit switch (independent of attack state)
     * This is called directly from team holder when bench portrait is clicked
     */
    handleUnitSwitch(cardIndex) {
      // Switch does NOT affect attack state
      // It's completely independent
      console.log(`[InputManager] Unit switch at index ${cardIndex} - attack state unchanged`);

      // The actual switching is handled by BattleTeamHolder
      // We just log it here for tracking
    }
  };

  // Export to window
  window.BattleInputManager = BattleInputManager;

  console.log("[BattleInputManager] Module loaded ✅");
})();
