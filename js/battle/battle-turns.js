// js/battle/battle-turns.js - Turn Management & Speed Gauge System
(() => {
  "use strict";

  /**
   * BattleTurns Module
   * Handles speed-based turn system with pause/resume mechanics
   *
   * Features:
   * - Speed-based gauge progression (faster units act more often)
   * - Turn locking (one unit at a time)
   * - Pause/resume for non-acting units
   * - Speed gauge visualization
   * - AI turn execution
   * - Action panel management
   */
  const BattleTurns = {
    // ===== State =====
    currentUnit: null,
    turnLocked: false,
    isPlayerTurn: false,
    speedGaugeInterval: null,
    autoMode: false,

    /* ===== Speed Gauge System ===== */

    /**
     * Start speed gauge tick system
     * Units gain gauge based on speed stat
     * Faster units reach max gauge first
     */
    startSpeedGaugeTick(core) {
      if (this.speedGaugeInterval) clearInterval(this.speedGaugeInterval);

      let tickCount = 0;
      this.speedGaugeInterval = setInterval(() => {
        // Don't advance if battle paused or turn locked
        if (core.isPaused || this.turnLocked) return;

        // Bug #5 fix: Validate combatants array exists
        if (!Array.isArray(core.combatants)) {
          console.error("[Turns] core.combatants is not an array!");
          return;
        }

        // Debug log every 20 ticks (about every 2 seconds)
        tickCount++;
        if (tickCount % 20 === 0) {
          console.log(`[Turns] Tick ${tickCount}: ${core.combatants.length} combatants`);
          console.log(`[Turns] Combatant details:`, core.combatants.map(u => ({
            name: u.name,
            isPlayer: u.isPlayer,
            isActive: u.isActive,
            isBench: u.isBench,
            hp: u.stats.hp,
            gauge: u.speedGauge,
            paused: u.isPaused
          })));
        }

        // Advance all non-paused combatants
        core.combatants.forEach(unit => {
          if (unit.stats.hp <= 0 || unit.isPaused) return;

          // Compressed gauge gain. Raw stat speeds (90-200+) filled the
          // 1200 gauge in a fraction of a second, so fast units fired
          // turn after turn in a blur ("stuck attacking"). This paces a
          // turn at roughly 2.5-4s and caps how much more often a fast
          // unit acts (~1.5x) while keeping speed meaningful.
          const speedGain = (10 + (unit.stats.speed || 90) / 12) * core.speedMultiplier
            * (window.BattleBuffs?.speedMult?.(unit) ?? 1);
          unit.speedGauge = Math.min(core.GAUGE_MAX, unit.speedGauge + speedGain);
        });

        this.updateSpeedGaugeDisplay(core);

        // Check for units ready to act (gauge >= max)
        const ready = core.combatants.find(u =>
          u.stats.hp > 0 &&
          u.speedGauge >= core.GAUGE_MAX &&
          !u.isPaused &&
          !this.turnLocked
        );

        if (ready) {
          console.log(`[Turns] Unit ready to act: ${ready.name} (isPlayer: ${ready.isPlayer}, gauge: ${ready.speedGauge})`);
          ready.speedGauge = core.GAUGE_MAX; // Cap at max
          this.startTurn(ready, core);
        }
      }, core.SPEED_TICK_INTERVAL);

      console.log("[Turns] Speed gauge system started");
    },

    /**
     * Update speed gauge visual display.
     * Markers are created once per unit and moved (CSS transition on
     * `left`), so they glide instead of being rebuilt every tick.
     * Classes: .player/.enemy, .acting (current turn), .next (next to act),
     * .paused.
     */
    updateSpeedGaugeDisplay(core) {
      const track = core.dom.speedGaugeTrack;
      if (!track) return;
      if (!Array.isArray(core.combatants)) return;

      let lane = track.querySelector(':scope > .speed-lane');
      if (!lane) {
        track.innerHTML = '';
        track.classList.add('speed-track-skin');
        lane = document.createElement('div');
        lane.className = 'speed-lane';
        track.appendChild(lane);
      }

      const alive = core.combatants.filter(u => u && u.stats && u.stats.hp > 0);
      const sorted = [...alive].sort((a, b) => b.speedGauge - a.speedGauge);
      const next = sorted.find(u => u !== this.currentUnit) || null;
      const keep = new Set();

      sorted.forEach((unit, rank) => {
        const key = String(unit.id);
        keep.add(key);
        let marker = lane.querySelector(`:scope > .speed-marker[data-unit-id="${key.replace(/["\\]/g, '\\$&')}"]`);
        if (!marker) {
          marker = document.createElement('div');
          marker.dataset.unitId = key;
          const portraitSrc = unit.portrait || unit.icon || 'assets/characters/common/silhouette.png';
          const pos = unit.isPlayer && unit.positionId != null
            ? `<span class="pos-label">${String(unit.positionId).replace(/[<>&"]/g, '')}</span>` : '';
          marker.innerHTML = `
            <span class="sm-portrait"><img src="${portraitSrc}" alt="${String(unit.name || '').replace(/"/g, '&quot;')}" draggable="false"
                 onerror="this.onerror=null;this.src='assets/characters/common/silhouette.png';"></span>
            <span class="sm-frame" aria-hidden="true"></span>
            ${pos}`;
          marker.style.left = '0%';
          lane.appendChild(marker);
        }

        const progress = Math.max(0, Math.min(100, (unit.speedGauge / core.GAUGE_MAX) * 100));
        const prev = parseFloat(marker.dataset.progress);
        // Big drops (turn just ended → back to 0) get a slower slide home
        marker.classList.toggle('sm-return', Number.isFinite(prev) && prev - progress > 25);
        marker.dataset.progress = progress.toFixed(1);
        marker.style.left = `${progress}%`;
        marker.style.zIndex = String(100 - rank + (unit === this.currentUnit ? 200 : unit === next ? 100 : 0));

        marker.className = `speed-marker ${unit.isPlayer ? 'player' : 'enemy'}`
          + `${unit.isPaused ? ' paused' : ''}`
          + `${unit === this.currentUnit ? ' acting' : ''}`
          + `${unit === next ? ' next' : ''}`
          + `${window.BattleBuffs?.cannotAct?.(unit) ? ' st-stunned' : ''}`
          + `${window.BattleBuffs?.isSealed?.(unit, 'jutsu') ? ' st-sealed' : ''}`
          + `${marker.classList.contains('sm-return') ? ' sm-return' : ''}`;
        marker.title = `${unit.name} · SPD ${unit.stats.speed}${window.BattleBuffs?.cannotAct?.(unit) ? ' · Immobilized (turn skipped)' : ''}`;
      });

      lane.querySelectorAll(':scope > .speed-marker').forEach(m => {
        if (!keep.has(m.dataset.unitId)) m.remove();
      });
    },

    /* ===== Pause/Resume System ===== */

    /**
     * Pause all units except current actor
     * Prevents gauge advancement during turn
     */
    pauseAllOtherUnits(core) {
      // Bug #5 fix: Validate combatants array exists
      if (!Array.isArray(core.combatants)) return;

      core.combatants.forEach(unit => {
        if (unit !== this.currentUnit) {
          unit.isPaused = true;
        }
      });
      console.log(`[Turns] All units paused except ${this.currentUnit.name}`);
    },

    /**
     * Resume all units
     * Allows gauge advancement after turn ends
     */
    resumeAllUnits(core) {
      // Bug #5 fix: Validate combatants array exists
      if (!Array.isArray(core.combatants)) return;

      core.combatants.forEach(unit => {
        unit.isPaused = false;
      });
      console.log("[Turns] All units resumed");
    },

    /**
     * Accumulate chakra for bench units (equivalent to guarding/passing)
     * Bench units gain 2 chakra per turn
     */
    accumulateBenchChakra(core) {
      if (!Array.isArray(core.benchTeam)) return;

      core.benchTeam.forEach(unit => {
        if (!unit || unit.stats.hp <= 0) return;

        const oldChakra = unit.chakra || 0;
        const maxChakra = unit.maxChakra || 10;

        // Add 2 chakra (same as guarding)
        unit.chakra = Math.min(maxChakra, oldChakra + 2);

        console.log(`[Turns] Bench unit ${unit.name} gained chakra: ${oldChakra} → ${unit.chakra}`);

        // Animate chakra gain if using chakra wheel system
        if (window.BattleChakraWheel && unit.chakra > oldChakra) {
          window.BattleChakraWheel.animateChakraGain(unit, unit.chakra - oldChakra, core);
        }

        // Update team holder display
        if (core.teamHolder) {
          core.teamHolder.updateUnitChakra(unit, core);
        }
      });
    },

    /* ===== Turn Management ===== */

    /**
     * Start a unit's turn
     * Locks system, pauses others, shows action panel
     */
    startTurn(unit, core) {
      if (core.isPaused || !unit || this.turnLocked) return;

      console.log(`[Turns] ========================================`);
      console.log(`[Turns] ${unit.name} turn start`);
      console.log(`[Turns] Unit properties:`, {
        isPlayer: unit.isPlayer,
        isActive: unit.isActive,
        isBench: unit.isBench,
        speed: unit.stats.speed,
        gauge: unit.speedGauge,
        hp: unit.stats.hp
      });
      console.log(`[Turns] ========================================`);

      // Lock turn system
      this.turnLocked = true;
      this.currentUnit = unit;
      this.isPlayerTurn = unit.isPlayer;

      // Pause all other units
      this.pauseAllOtherUnits(core);

      // Show the acting marker / card right away (the tick loop stops
      // redrawing while the turn is locked)
      this.updateSpeedGaugeDisplay(core);
      core.teamHolder?.highlightActingUnit?.(unit);

      // Turn start status effects: slip damage / damage regions / regen
      // tick, immobilization check (BattleBuffs)
      const st = window.BattleBuffs?.onTurnStart?.(core, unit) || {};
      window.StatusEffectUI?.renderPanel?.(unit);
      if (st.died) {
        console.log(`[Turns] ☠️ ${unit.name} was defeated by status damage`);
        setTimeout(() => {
          if (this.currentUnit === unit) this.endTurn(core);
          core.checkBattleEnd?.();
        }, 900);
        return;
      }

      // Apply passive ability turn start effects (HP regen, chakra boost, etc.)
      if (window.BattlePassives) {
        window.BattlePassives.onTurnStart(core, unit);
      }

      // Check if unit cannot act (immobilized): the turn is skipped
      const cannotAct = st.skip || window.BattleBuffs?.cannotAct?.(unit) || unit.statusEffects?.some(e =>
        e.prevent_action && e.turnsRemaining > 0
      );
      if (cannotAct) {
        const effect = st.effect || unit.statusEffects.find(e => e.prevent_action && e.turnsRemaining > 0);
        console.log(`[Turns] ⛓️ ${unit.name} cannot act (${effect?.name || 'Immobilized'}) — turn skipped`);
        window.StatusEffectUI?.popup?.(unit, 'Immobilized!', '#ffd27a', 'immobilize');
        window.BattleNarrator?.narrate?.(`${unit.name} is immobilized and cannot move!`, core);
        unit.isGuarding = false;
        // Skip turn - end after the notice
        setTimeout(() => { if (this.currentUnit === unit) this.endTurn(core); }, 1000);
        return;
      }

      // Reset unit state
      unit.isGuarding = false;

      // Clear overlays
      if (core.overlay) core.overlay.clear();
      this.clearEnemyHighlights(core);

      // Visual feedback - highlight active unit
      core.dom.scene?.querySelectorAll(".battle-unit").forEach(el => {
        el.classList.toggle("active", el.dataset.unitId === unit.id);
      });

      // Show action panel or perform AI turn
      if (unit.isPlayer && !this.autoMode) {
        this.showActionPanel(unit, core);
      } else {
        console.log(`[Turns] Starting AI turn for ${unit.name}`);
        setTimeout(() => {
          if (window.BattleCombat) {
            console.log(`[Turns] Calling performAITurn for ${unit.name}`);
            window.BattleCombat.performAITurn(unit, core, () => {
              // onDone from the AI's attack — end the turn when combat resolves
              if (this.currentUnit === unit) this.endTurn(core);
            });
          } else {
            console.error("[Turns] BattleCombat not available!");
          }
          // Safety timeout: end turn if combat callback never fires (guard, sealed, no targets, etc.)
          // Long spritesheet skills flag the unit busy; wait for them instead.
          const safety = () => {
            if (this.currentUnit !== unit) return;
            if (unit._actionBusy) { setTimeout(safety, 500); return; }
            this.endTurn(core);
          };
          setTimeout(safety, 1800);
        }, 500);
      }
    },

    /**
     * End current unit's turn
     * Resets gauge, unlocks system, resumes all
     */
    endTurn(core) {
      if (!this.currentUnit) return;

      console.log(`[Turns] ${this.currentUnit.name} turn end`);

      // Apply turn end effects (buff duration tick, expiration)
      if (window.BattleBuffs) {
        window.BattleBuffs.onTurnEnd(core, this.currentUnit);
      }

      // Apply passive ability turn end effects
      if (window.BattlePassives) {
        window.BattlePassives.onTurnEnd(core, this.currentUnit);
      }

      // Reset chakra mode if using chakra system
      if (core.chakra) {
        core.chakra.resetChakraMode(this.currentUnit, core);
      }

      // Bench units accumulate chakra (equivalent to guarding/passing)
      this.accumulateBenchChakra(core);

      // Decrement skill cooldowns each speed-bar cycle
      if (this.currentUnit.jutsuCooldown > 0)    this.currentUnit.jutsuCooldown--;
      if (this.currentUnit.ultimateCooldown > 0) this.currentUnit.ultimateCooldown--;

      // Reset gauge to 0 after acting
      this.currentUnit.speedGauge = 0;
      this.currentUnit.isPaused = false;

      this.hideActionPanel(core);
      core.queuedAction = null;

      if (core.overlay) core.overlay.clear();
      this.clearEnemyHighlights(core);

      // Update collective chakra and check for commander ultimate
      if (core.updateCollectiveChakra) {
        core.updateCollectiveChakra();
      }

      // Unlock turn system
      this.turnLocked = false;
      this.currentUnit = null;

      // Resume all units
      this.resumeAllUnits(core);

      this.updateSpeedGaugeDisplay(core);
      core.teamHolder?.highlightActingUnit?.(null);
    },

    /* ===== Action Panel ===== */

    /**
     * Show action panel for player units
     * Displays skills, chakra status, and action buttons
     */
    showActionPanel(unit, core) {
      if (!core.dom.actionPanel) return;

      const skills = window.BattleCombat?.getUnitSkills(unit) || { jutsu: null, ultimate: null, secret: null };

      // Update portrait and basic info
      if (core.dom.actionPortrait) {
        core.dom.actionPortrait.src = unit.portrait;
      }

      // Highlight acting unit in team holder
      if (core.teamHolder) {
        core.teamHolder.highlightActingUnit(unit);
      }
      if (core.dom.actionName) {
        core.dom.actionName.textContent = `${unit.name} [Pos ${unit.positionId}]`;
      }
      if (core.dom.actionHP) {
        core.dom.actionHP.textContent = `HP: ${unit.stats.hp} / ${unit.stats.maxHP}`;
      }
      if (core.dom.actionChakra) {
        core.dom.actionChakra.textContent = `Chakra: ${unit.chakra} / ${unit.maxChakra}`;
      }

      // Update chakra status display
      if (core.chakra) {
        core.chakra.updateActionPanelStatus(unit, core);
      }

      // Get skill costs
      // Effective costs (chakraCostMax when maxed, passive reduction applied)
      const costOf = (entry, fb) => window.BattleCombat?.getSkillChakraCost
        ? window.BattleCombat.getSkillChakraCost(unit, entry, fb)
        : Number(entry?.data?.chakraCost ?? fb);
      const jCost = costOf(skills.jutsu, 4);
      const uCost = costOf(skills.ultimate, 8);
      const sCost = costOf(skills.secret, 12);

      // Check unlock status
      const jutsuUnlocked = window.BattleCombat?.isJutsuUnlocked(unit) ?? true;
      const ultUnlocked = window.BattleCombat?.isUltimateUnlocked(unit) ?? true;
      const secretUnlocked = window.BattleCombat?.isSecretUnlocked(unit) ?? false;
      const unitLevel = window.BattleCombat?.getUnitLevel(unit) ?? 1;
      const unitTier = window.BattleCombat?.getTierForUnit(unit) ?? "3S";

      // Check cooldowns
      const jutsuOnCd  = (unit.jutsuCooldown    || 0) > 0;
      const ultOnCd    = (unit.ultimateCooldown  || 0) > 0;

      // Check if skills are usable (unlocked, enough chakra, not on cooldown)
      // Jutsu Sealing blocks jutsu, ultimate and secret techniques
      const B = window.BattleBuffs;
      const sealed = !!B?.isSealed?.(unit, 'jutsu');
      const sealTxt = sealed ? `SEALED (${B.sealTurns(unit)})` : '';
      const canJutsu  = !!skills.jutsu   && jutsuUnlocked  && unit.chakra >= jCost && !jutsuOnCd && !sealed;
      const canUlt    = !!skills.ultimate && ultUnlocked    && unit.chakra >= uCost && !ultOnCd && !B?.isSealed?.(unit, 'ultimate');
      const canSecret = !!skills.secret  && secretUnlocked && unit.chakra >= sCost && !B?.isSealed?.(unit, 'secret');
      [core.dom.btnJutsu, core.dom.btnUltimate, core.dom.btnSecret].forEach(b => b?.classList.toggle('st-sealed', sealed));

      // Update button states
      core.dom.btnJutsu?.classList.toggle("disabled", !canJutsu);
      core.dom.btnUltimate?.classList.toggle("disabled", !canUlt);
      core.dom.btnSecret?.classList.toggle("disabled", !canSecret);

      // Update skill names with lock / cooldown status
      if (core.dom.actionSkillName) {
        if (!skills.jutsu) {
          core.dom.actionSkillName.textContent = "—";
        } else if (!jutsuUnlocked) {
          core.dom.actionSkillName.textContent = `LOCKED (Lv ${unitLevel}/20)`;
        } else if (sealed) {
          core.dom.actionSkillName.textContent = `${skills.jutsu.meta.name} — ${sealTxt}`;
        } else if (jutsuOnCd) {
          core.dom.actionSkillName.textContent = `${skills.jutsu.meta.name} — CD ${unit.jutsuCooldown}`;
        } else {
          core.dom.actionSkillName.textContent = `${skills.jutsu.meta.name} (${jCost})`;
        }
      }
      if (core.dom.actionUltName) {
        if (!skills.ultimate) {
          core.dom.actionUltName.textContent = "—";
        } else if (!ultUnlocked) {
          core.dom.actionUltName.textContent = `LOCKED (Lv ${unitLevel}/50)`;
        } else if (sealed) {
          core.dom.actionUltName.textContent = `${skills.ultimate.meta.name} — ${sealTxt}`;
        } else if (ultOnCd) {
          core.dom.actionUltName.textContent = `${skills.ultimate.meta.name} — CD ${unit.ultimateCooldown}`;
        } else {
          core.dom.actionUltName.textContent = `${skills.ultimate.meta.name} (${uCost})`;
        }
      }
      if (core.dom.actionSecretName) {
        if (!skills.secret) {
          core.dom.actionSecretName.textContent = "—";
        } else if (!secretUnlocked) {
          core.dom.actionSecretName.textContent = `LOCKED (${unitTier}, needs 6S+)`;
        } else if (sealed) {
          core.dom.actionSecretName.textContent = `${skills.secret.meta.name} — ${sealTxt}`;
        } else {
          core.dom.actionSecretName.textContent = `${skills.secret.meta.name} (${sCost})`;
        }
      }

      // Render equipped jutsu card icons
      this.renderEquippedJutsuIcons(unit, core);
      window.StatusEffectUI?.renderPanel?.(unit);

      core.dom.actionPanel.classList.remove("hidden");
      this.keepUnitClearOfPanel(unit, core);
    },

    /**
     * The action panel floats over the left of the battlefield, where player
     * units stand (knockback clamps them to x ≥ 10%). A unit under the panel
     * cannot be tapped or dragged — its jutsu / ultimate looked unusable.
     * When the acting unit is covered, step it out to the panel's right.
     */
    keepUnitClearOfPanel(unit, core) {
      const panel = core.dom.actionPanel;
      const scene = core.dom.scene;
      if (!panel || !scene || !unit?.pos) return;
      if (panel.classList.contains('ap-collapsed')) return; // slid away: nothing covered
      const unitEl = scene.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;
      const pr = panel.getBoundingClientRect();
      const ur = unitEl.getBoundingClientRect();
      const sr = scene.getBoundingClientRect();
      if (!pr.width || !sr.width) return;
      const overlaps = ur.left < pr.right && ur.right > pr.left && ur.top < pr.bottom && ur.bottom > pr.top;
      if (!overlaps) return;
      const x = ((pr.right - sr.left + ur.width / 2 + 12) / sr.width) * 100;
      if (!(x > 0 && x < 60)) return; // panel spans most of the field: leave it
      unit.pos = { x, y: unit.pos.y };
      core.units?.updateUnitPosition(unit, core);
    },

    /**
     * Render equipped jutsu/ultimate card icons in the action panel.
     * Each icon shows the card art, its chakra cost, and a cooldown overlay.
     * Clicking an available icon queues the action and highlights targets.
     */
    renderEquippedJutsuIcons(unit, core) {
      const container = document.getElementById('equipped-jutsu-icons');
      if (!container) return;
      container.innerHTML = '';

      const equipped   = unit.equippedJutsu || {};
      const cardsData  = core.jutsuCardsData || [];
      const resolve    = window.CardSystem?.resolveCardPath || (p => p);

      const jutsuSlots = ['jutsu1', 'jutsu2', 'jutsu3'];

      jutsuSlots.forEach(slot => {
        const cardId = equipped[slot];
        const el = document.createElement('div');
        el.className = 'battle-jutsu-icon';

        if (!cardId) {
          el.classList.add('empty');
          el.innerHTML = '<span class="jutsu-icon-plus">+</span>';
        } else {
          const card   = cardsData.find(c => c.id === cardId);
          const cost   = Number(card?.stats?.cp ?? 4);
          const onCd   = (unit.jutsuCooldown || 0) > 0;
          const canUse = unit.chakra >= cost && !onCd;

          const src = card?.icon ? resolve(card.icon)
            : `assets/cardsandicons/${cardId}_icon.png`;

          el.innerHTML = `
            <img src="${src}" alt="${card?.jutsuName || cardId}"
                 onerror="this.src='assets/Stats/emptyslot.png';">
            <span class="jutsu-icon-cost">${cost}</span>
            ${onCd ? `<div class="jutsu-icon-cd">${unit.jutsuCooldown}</div>` : ''}
          `;
          if (!canUse) el.classList.add('disabled');

          el.addEventListener('click', () => {
            if (!canUse) return;
            unit.jutsuCooldown = 2 + Math.floor(Math.random() * 2);
            unit._activeCardSlot = slot;
            core.queuedAction = 'jutsu';
            this.highlightEnemies(core);
          });
        }

        container.appendChild(el);
      });

      // Ultimate card slot
      const ultId = equipped.ultimate;
      if (ultId) {
        const card   = cardsData.find(c => c.id === ultId);
        const cost   = Number(card?.stats?.cp ?? 8);
        const onCd   = (unit.ultimateCooldown || 0) > 0;
        const canUse = unit.chakra >= cost && !onCd;

        const el  = document.createElement('div');
        el.className = 'battle-jutsu-icon battle-ult-icon';

        const src = card?.icon ? resolve(card.icon)
          : `assets/cardsandicons/${ultId}_icon.png`;

        el.innerHTML = `
          <img src="${src}" alt="${card?.jutsuName || ultId}"
               onerror="this.src='assets/Stats/emptyslot.png';">
          <span class="jutsu-icon-cost">${cost}</span>
          ${onCd ? `<div class="jutsu-icon-cd">${unit.ultimateCooldown}</div>` : ''}
        `;
        if (!canUse) el.classList.add('disabled');

        el.addEventListener('click', () => {
          if (!canUse) return;
          unit.ultimateCooldown = 5 + Math.floor(Math.random() * 2);
          unit._activeCardSlot = 'ultimate';
          core.queuedAction = 'ultimate';
          this.highlightEnemies(core);
        });

        container.appendChild(el);
      }
    },

    /**
     * Hide action panel
     */
    hideActionPanel(core) {
      core.dom.actionPanel?.classList.add("hidden");
    },

    /* ===== Action Handlers ===== */

    /**
     * Handle attack button click
     */
    handleAttackButton(core) {
      core.queuedAction = "attack";
      this.highlightEnemies(core);
      console.log("[Turns] Attack mode - click or drag to enemy");
    },

    /**
     * Handle jutsu button click
     */
    handleJutsuButton(core) {
      if (!this.currentUnit) return;
      if (window.BattleCombat?.refuseIfSealed?.(this.currentUnit, 'jutsu', core)) return;

      const skills = window.BattleCombat?.getUnitSkills(this.currentUnit);
      const cost = window.BattleCombat?.getSkillChakraCost(this.currentUnit, skills?.jutsu, 4) ?? 4;

      // Check if jutsu exists
      if (!skills?.jutsu) {
        console.warn("[Turns] No jutsu skill available");
        return;
      }

      // Check cooldown
      if ((this.currentUnit.jutsuCooldown || 0) > 0) {
        const cd = this.currentUnit.jutsuCooldown;
        console.warn(`[Turns] Jutsu on cooldown: ${cd} turn(s) remaining`);
        if (window.BattleNarrator) window.BattleNarrator.narrate(`Jutsu on cooldown! (${cd} turn${cd > 1 ? 's' : ''} left)`, core);
        return;
      }

      // Check if jutsu is unlocked
      const jutsuUnlocked = window.BattleCombat?.isJutsuUnlocked(this.currentUnit) ?? true;
      if (!jutsuUnlocked) {
        const level = window.BattleCombat?.getUnitLevel(this.currentUnit) ?? 1;
        console.warn(`[Turns] Jutsu locked - Level ${level}/20`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`Jutsu is locked! Requires Level 20.`, core);
        }
        return;
      }

      // Check chakra
      if (this.currentUnit.chakra < cost) {
        console.warn("[Turns] Not enough chakra for jutsu");
        window.BattleNarrator?.narrate(`Not enough chakra! Need ${cost}, have ${this.currentUnit.chakra}.`, core);
        return;
      }

      // Set cooldown: 2-3 turns on speed bar
      this.currentUnit.jutsuCooldown = 2 + Math.floor(Math.random() * 2); // 2 or 3
      core.queuedAction = "jutsu";
      this.highlightEnemies(core);
      console.log("[Turns] Jutsu mode - click or drag to enemy");
    },

    /**
     * Handle ultimate button click
     */
    handleUltimateButton(core) {
      if (!this.currentUnit) return;
      if (window.BattleCombat?.refuseIfSealed?.(this.currentUnit, 'ultimate', core)) return;

      const skills = window.BattleCombat?.getUnitSkills(this.currentUnit);

      // Check if ultimate exists
      if (!skills?.ultimate) {
        console.warn("[Turns] No ultimate skill available");
        return;
      }

      // Check cooldown
      if ((this.currentUnit.ultimateCooldown || 0) > 0) {
        const cd = this.currentUnit.ultimateCooldown;
        console.warn(`[Turns] Ultimate on cooldown: ${cd} turn(s) remaining`);
        if (window.BattleNarrator) window.BattleNarrator.narrate(`Ultimate on cooldown! (${cd} turn${cd > 1 ? 's' : ''} left)`, core);
        return;
      }

      // Check if ultimate is unlocked
      const ultUnlocked = window.BattleCombat?.isUltimateUnlocked(this.currentUnit) ?? true;
      if (!ultUnlocked) {
        const level = window.BattleCombat?.getUnitLevel(this.currentUnit) ?? 1;
        console.warn(`[Turns] Ultimate locked - Level ${level}/50`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`Ultimate is locked! Requires Level 50.`, core);
        }
        return;
      }

      // Check chakra
      const cost = window.BattleCombat.getSkillChakraCost(this.currentUnit, skills.ultimate, 8);
      if (this.currentUnit.chakra < cost) {
        console.warn("[Turns] Not enough chakra for ultimate");
        window.BattleNarrator?.narrate(`Not enough chakra! Need ${cost}, have ${this.currentUnit.chakra}.`, core);
        return;
      }

      // Set cooldown: 5-6 turns on speed bar
      this.currentUnit.ultimateCooldown = 5 + Math.floor(Math.random() * 2); // 5 or 6
      core.queuedAction = "ultimate";
      this.highlightEnemies(core);
      console.log("[Turns] Ultimate mode - will hit all enemies");
    },

    /**
     * Handle secret technique button click
     */
    handleSecretButton(core) {
      if (!this.currentUnit) return;
      if (window.BattleCombat?.refuseIfSealed?.(this.currentUnit, 'secret', core)) return;

      const skills = window.BattleCombat?.getUnitSkills(this.currentUnit);

      // Check if secret exists
      if (!skills?.secret) {
        console.warn("[Turns] No secret technique available");
        return;
      }

      // Check if secret is unlocked (requires 6S+ tier)
      const secretUnlocked = window.BattleCombat?.isSecretUnlocked(this.currentUnit) ?? false;
      if (!secretUnlocked) {
        const tier = window.BattleCombat?.getTierForUnit(this.currentUnit) ?? "3S";
        console.warn(`[Turns] Secret technique locked - Tier ${tier}, requires 6S+`);
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`Secret technique is locked! Requires tier 6★ or higher.`, core);
        }
        return;
      }

      // Check chakra
      const cost = window.BattleCombat.getSkillChakraCost(this.currentUnit, skills.secret, 12);
      if (this.currentUnit.chakra < cost) {
        console.warn("[Turns] Not enough chakra for secret technique");
        if (window.BattleNarrator) {
          window.BattleNarrator.narrate(`Not enough chakra! Need ${cost}, have ${this.currentUnit.chakra}.`, core);
        }
        return;
      }

      // Perform secret technique (buffs allies)
      console.log("[Turns] Executing secret technique");
      if (window.BattleCombat) {
        const unit = this.currentUnit;
        window.BattleCombat.performSecret(unit, core, () => {
          if (this.currentUnit === unit) this.endTurn(core);
        });
      }
    },

    /**
     * Handle guard button click
     */
    handleGuardButton(core) {
      if (!this.currentUnit) return;

      if (window.BattleCombat) {
        window.BattleCombat.performGuard(this.currentUnit, core);
      }
      this.endTurn(core);
    },

    /* ===== Visual Helpers ===== */

    /**
     * Highlight all targetable enemies
     */
    highlightEnemies(core) {
      // Bug #5 fix: Validate combatants array exists
      if (!Array.isArray(core.combatants)) return;

      core.dom.scene?.querySelectorAll(".battle-unit").forEach(el => {
        const unit = core.combatants.find(u => u.id === el.dataset.unitId);
        if (unit && !unit.isPlayer && unit.stats.hp > 0) {
          el.style.filter = "drop-shadow(0 0 15px rgba(255, 234, 120, 0.9))";
        }
      });
    },

    /**
     * Clear enemy highlights
     */
    clearEnemyHighlights(core) {
      core.dom.scene?.querySelectorAll(".battle-unit").forEach(el => {
        el.style.filter = "";
      });
    },

    /* ===== Utility Functions ===== */

    /**
     * Get current turn unit
     */
    getCurrentUnit() {
      return this.currentUnit;
    },

    /**
     * Check if turn is locked
     */
    isTurnLocked() {
      return this.turnLocked;
    },

    /**
     * Force end turn (for special cases)
     */
    forceEndTurn(core) {
      console.log("[Turns] Forcing turn end");
      this.endTurn(core);
    },

    /**
     * Toggle auto mode
     */
    toggleAutoMode(core) {
      this.autoMode = !this.autoMode;
      core.dom.btnAuto?.classList.toggle("active", this.autoMode);
      console.log(`[Turns] Auto mode: ${this.autoMode ? "ON" : "OFF"}`);
    },

    /**
     * Change speed multiplier
     */
    changeSpeedMultiplier(core) {
      const speeds = [1, 2, 3];
      const idx = speeds.indexOf(core.speedMultiplier);
      core.speedMultiplier = speeds[(idx + 1) % speeds.length];

      if (core.dom.btnSpeed) {
        core.dom.btnSpeed.textContent = `×${core.speedMultiplier}`;
      }

      console.log(`[Turns] Speed multiplier: ×${core.speedMultiplier}`);
    },

    /**
     * Stop speed gauge system (cleanup)
     */
    stopSpeedGaugeTick() {
      if (this.speedGaugeInterval) {
        clearInterval(this.speedGaugeInterval);
        this.speedGaugeInterval = null;
        console.log("[Turns] Speed gauge system stopped");
      }
    }
  };

  // Export to window
  window.BattleTurns = BattleTurns;

  console.log("[BattleTurns] Module loaded ✅");
})();
