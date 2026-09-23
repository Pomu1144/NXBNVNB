// js/battle/battle-units.js - Unit Management & Rendering
(() => {
  "use strict";

  /**
   * BattleUnits Module
   * Handles unit creation, rendering, stats, and visual updates
   *
   * Features:
   * - Unit creation with stats computation
   * - Tier art resolution
   * - Unit rendering on battlefield
   * - HP/chakra bar updates
   * - Bench unit display
   * - Position management
   */
  const BattleUnits = {

    /* ===== Art Resolution ===== */

    /**
     * Resolve tier-specific artwork
     * Falls back to base art if tier art not available
     */
    resolveTierArt(char, tier) {
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

    /* ===== Stats Computation ===== */

    /**
     * Compute effective stats for unit
     * Uses Progression system if available, otherwise base stats
     */
    computeStats(char, instance) {
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

    /* ===== Unit Creation ===== */

    /**
     * Create combatant unit object
     */
    createCombatant(data) {
      const isPlayer = data.isPlayer || false;

      // Give enemies a massive head start (1100-1180 gauge, almost at max 1200)
      // This ensures enemies get their first turn, then normal speed-based turns take over
      const initialGauge = isPlayer
        ? Math.floor(Math.random() * 200)  // Players: 0-200
        : 1100 + Math.floor(Math.random() * 80);  // Enemies: 1100-1180 (almost ready)

      const unit = {
        id: data.uid || `unit-${Date.now()}-${Math.random()}`,
        name: data.name || "Unknown",
        // Character id (e.g. "minato_2101"); for player units data.id is the
        // character id and data.uid the owned-instance id.
        charId: data.charId || (data.uid ? data.id : null) || null,
        portrait: data.portrait || "assets/characters/common/silhouette.png",
        isPlayer: isPlayer,
        positionId: data.positionId || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isBench: data.isBench || false,
        pos: data.pos || { x: 50, y: 50 },
        stats: data.stats,
        chakra: 2,  // Start with 2 chakra so wheels are visible
        maxChakra: 10,
        speedGauge: initialGauge,
        isPaused: false,
        isGuarding: false,
        statusEffects: [],
        chakraMode: "NONE",
        _ref: null
      };

      // Initialize chakra system
      if (window.BattleChakra) {
        window.BattleChakra.initUnit(unit);
      }

      // Initialize passive abilities
      if (window.BattleEffects) {
        window.BattleEffects.initUnitPassives(unit);
      }

      return unit;
    },

    /* ===== Rendering ===== */

    /**
     * Render all units on battlefield
     */
    renderAllUnits(core) {
      if (!core.dom.grid) {
        console.error("[Units] No battlefield grid element found!");
        return;
      }

      console.log("[Units] Rendering all units:", core.combatants.length);
      core.dom.grid.innerHTML = "";

      requestAnimationFrame(() => {
        core.combatants.forEach(unit => {
          this.renderUnit(unit, core);
        });
      });
    },

    /**
     * Render single unit
     */
    renderUnit(unit, core) {
      if (!core.dom.grid || unit.isBench) return;

      const unitEl = document.createElement("div");
      unitEl.className = `battle-unit ${unit.isPlayer ? 'player' : 'enemy'}`;
      unitEl.dataset.unitId = unit.id;
      unitEl.dataset.positionId = unit.positionId || 0;
      unitEl.style.position = 'absolute';
      unitEl.style.left = `${unit.pos.x}%`;
      unitEl.style.top = `${unit.pos.y}%`;
      // Units with an animated sprite are dragged with pointer events (the
      // sprite itself follows the finger/cursor); others use HTML5 DnD.
      const animated = !!(unit.charId && window.SpritePlayer?.has(unit.charId));
      unitEl.draggable = unit.isPlayer && !animated;

      const hpPercent = (unit.stats.hp / unit.stats.maxHP) * 100;
      const chakraPercent = (unit.chakra / unit.maxChakra) * 100;

      // Get chakra class
      const chakraClass = core.chakra ?
        core.chakra.getChakraClass(unit) : 'neutral';

      // Player HP / chakra live on the team holder cards, so player units
      // on the field only get the sprite (+ position badge); enemies keep
      // their bars. Every reader of .unit-hp-fill / .chakra-fill null-checks.

      // Show position ID for player units
      const positionLabel = unit.isPlayer ?
        `<div class="unit-position-label">${unit.positionId}</div>` : '';

      unitEl.innerHTML = `
        ${positionLabel}
        <div class="unit-sprite${animated ? ' unit-sprite--anim' : ''}">
          ${animated ? '' : `<img src="${unit.portrait}" alt="${unit.name}"
               onerror="this.src='assets/characters/common/silhouette.png';">`}
        </div>
        ${unit.isPlayer ? '' : `
        <div class="unit-hp-bar">
          <div class="unit-hp-fill" style="width:${hpPercent}%"></div>
        </div>
        <div class="unit-chakra-bar">
          <div class="chakra-fill ${chakraClass}" style="width:${chakraPercent}%"></div>
        </div>`}
      `;

      core.dom.grid.appendChild(unitEl);

      if (animated) this.attachSprite(unit, unitEl);

      // Add event listeners for player units
      if (unit.isPlayer && core.drag) {
        unitEl.addEventListener("dragstart", (e) => core.drag.handleActiveDragStart(e, unit, core));
        unitEl.addEventListener("dragend", (e) => core.drag.handleDragEnd(e, core));
        unitEl.addEventListener("dragover", (e) => core.drag.handleDragOver(e));
        unitEl.addEventListener("drop", (e) => core.drag.handleDrop(e, unit, core));
        if (animated && core.drag.handleSpritePointerDown) {
          unitEl.classList.add('battle-unit--sprite-drag');
          unitEl.addEventListener("pointerdown", (e) => core.drag.handleSpritePointerDown(e, unit, core, unitEl));
        }
      }

      // Add click handler
      unitEl.addEventListener("click", () => {
        if (core.chakra) {
          core.chakra.handleUnitClick(unit, core);
        }
      });
    },

    /**
     * Update unit display (HP, chakra, status)
     */
    updateUnitDisplay(unit, core) {
      console.log(`[BattleUnits] Updating display for ${unit.name}, HP: ${unit.stats.hp}/${unit.stats.maxHP}`);

      const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!unitEl) {
        console.warn(`[BattleUnits] Could not find unit element for ${unit.id}`);
        return;
      }

      // Update HP bar on battlefield
      const hpBar = unitEl.querySelector(".unit-hp-fill");
      const hpPercent = Math.max(0, Math.min(100, (unit.stats.hp / unit.stats.maxHP) * 100));

      console.log(`[BattleUnits] HP%: ${hpPercent.toFixed(1)}%, HP bar element:`, !!hpBar);

      if (hpBar) {
        hpBar.style.width = `${hpPercent}%`;
        hpBar.style.transition = 'width 0.3s ease-out';
        console.log(`[BattleUnits] ✅ Updated HP bar to ${hpPercent}%`);
      }

      // Update chakra bar
      if (core.chakra) {
        core.chakra.updateUnitChakraDisplay(unit, core);
      } else {
        const chakraBar = unitEl.querySelector(".chakra-fill");
        if (chakraBar) {
          const chakraPercent = (unit.chakra / unit.maxChakra) * 100;
          chakraBar.style.width = `${chakraPercent}%`;
        }
      }

      // Also update team holder HP bar if this is a player unit
      if (unit.isPlayer && core.dom.teamHolder) {
        const teamCard = core.dom.teamHolder.querySelector(`[data-unit-id="${unit.id}"]`);
        if (teamCard) {
          const teamHpBar = teamCard.querySelector(".unit-hp-fill");
          if (teamHpBar) {
            teamHpBar.style.width = `${hpPercent}%`;
            teamHpBar.style.transition = 'width 0.3s ease-out';
            console.log(`[BattleUnits] ✅ Updated team holder HP bar to ${hpPercent}%`);
          }
        } else {
          console.warn(`[BattleUnits] Could not find team card for ${unit.id}`);
        }
      }

      // Update visual state for dead units - make them disappear
      if (unit.stats.hp <= 0) {
        console.log(`[BattleUnits] 💀 Unit ${unit.name} is dead, removing from battlefield`);
        unitEl.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        unitEl.style.opacity = "0";
        unitEl.style.transform = "scale(0.8)";
        unitEl.style.pointerEvents = "none";

        // Remove from DOM after animation
        setTimeout(() => {
          if (unitEl.parentNode) {
            unitEl.remove();
          }
        }, 500);

        // Also remove from team holder if player unit (unless the card still
        // carries a living backup, which can be swapped in)
        if (unit.isPlayer && core.dom.teamHolder) {
          const teamCard = core.dom.teamHolder.querySelector(`[data-unit-id="${unit.id}"]`);
          if (teamCard) {
            const unitCard = teamCard.closest('.unit-card');
            const liveBackup = unitCard?.querySelector('.uc-mini:not(.is-dead)');
            if (liveBackup) {
              unitCard.classList.add('is-dead');
              window.BattleTeamHolder?.highlightActingUnit?.(core.turns?.currentUnit || null);
            } else if (unitCard) {
              unitCard.style.transition = 'opacity 0.5s ease-out';
              unitCard.style.opacity = "0";
              setTimeout(() => {
                if (unitCard.parentNode) {
                  unitCard.remove();
                }
              }, 500);
            }
          }
        }
      }
    },

    /**
     * Update unit position on battlefield
     */
    updateUnitPosition(unit, core) {
      // Match the battlefield element specifically: the turn-order marker and
      // team-holder portraits carry the same data-unit-id.
      const unitEl = core.dom.scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      if (unit._sprite) {
        this.runTo(unit, unitEl);
        return;
      }
      unitEl.style.left = `${unit.pos.x}%`;
      unitEl.style.top = `${unit.pos.y}%`;
    },

    /* ===== Animated spritesheets (units listed in SpritePlayer's registry) ===== */

    /** Mount an idle-looping sprite in the unit's sprite slot. */
    attachSprite(unit, unitEl) {
      const slot = unitEl.querySelector('.unit-sprite');
      // On-field sprite height comes from CSS (--sprite-h: 101px desktop,
      // smaller on phones) so it scales with the layout.
      const cssH = parseFloat(getComputedStyle(unitEl).getPropertyValue('--sprite-h'));
      const player = window.SpritePlayer.create(slot, window.SpritePlayer.pathFor(unit.charId), {
        height: Number.isFinite(cssH) && cssH > 0 ? Math.round(cssH) : 101,
        flip: !unit.isPlayer, // art faces right; enemies face left
      });
      unit._sprite = player;
      // Warm the run sheet so the first drag/move switches without a gap.
      window.SpritePlayer.preload(window.SpritePlayer.pathFor(unit.charId), 'run').catch(() => {});
      player.play('idle').catch(err => {
        // Sheet missing: fall back to the static portrait.
        console.warn('[BattleUnits] sprite load failed, using portrait', err);
        player.destroy();
        unit._sprite = null;
        // Back to the portrait: use the regular HTML5 drag path again.
        unitEl.draggable = unit.isPlayer;
        unitEl.classList.remove('battle-unit--sprite-drag');
        slot.classList.remove('unit-sprite--anim');
        slot.innerHTML = `<img src="${unit.portrait}" alt="${unit.name}">`;
      });
    },

    /** Face the sprite left/right (art faces right), with an optional lean. */
    setSpriteFacing(unit, facingLeft, leanDeg = 0) {
      if (!unit._sprite) return;
      const parts = [];
      if (facingLeft) parts.push('scaleX(-1)');
      if (leanDeg) parts.push(`rotate(${leanDeg}deg)`);
      unit._sprite.el.style.transform = parts.join(' ');
    },

    /** Stand still: idle loop, default facing (players right, enemies left). */
    settleSprite(unit) {
      if (!unit._sprite) return;
      this.setSpriteFacing(unit, !unit.isPlayer);
      unit._sprite.setState('idle');
    },

    /** Cancel any in-flight runTo() for this unit. */
    stopRun(unit) {
      unit._runToken = (unit._runToken || 0) + 1;
    },

    /** Run from the element's current position to unit.pos, then idle. */
    runTo(unit, unitEl) {
      const fromX = parseFloat(unitEl.style.left) || unit.pos.x;
      const fromY = parseFloat(unitEl.style.top) || unit.pos.y;
      const toX = unit.pos.x, toY = unit.pos.y;
      const dist = Math.hypot(toX - fromX, toY - fromY);
      const token = (unit._runToken = (unit._runToken || 0) + 1);
      if (dist < 0.5) {
        // Already there (e.g. the sprite was dragged to this spot): just settle.
        unitEl.style.left = `${toX}%`;
        unitEl.style.top = `${toY}%`;
        this.settleSprite(unit);
        return;
      }

      // Face the direction of travel.
      this.setSpriteFacing(unit, toX < fromX);

      const duration = Math.min(900, 250 + dist * 12); // ms, scales with distance
      const start = performance.now();
      unit._sprite.setState('run');

      const step = now => {
        if (unit._runToken !== token) return; // superseded by a newer move
        const t = Math.min(1, (now - start) / duration);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
        unitEl.style.left = `${fromX + (toX - fromX) * e}%`;
        unitEl.style.top = `${fromY + (toY - fromY) * e}%`;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          this.settleSprite(unit);
        }
      };
      requestAnimationFrame(step);
    },

    /* ===== Bench System ===== */

    /**
     * Render bench units
     */
    renderBenchUnits(core) {
      if (!core.dom.benchContainer) {
        console.warn("[Units] No bench container found!");
        return;
      }

      console.log("[Units] Rendering bench units:", core.benchTeam.length);

      core.dom.benchContainer.innerHTML = core.benchTeam.map((unit) => {
        const hpPercent = (unit.stats.hp / unit.stats.maxHP) * 100;
        return `
          <div class="bench-unit" data-unit-id="${unit.id}" data-position-id="${unit.positionId}" draggable="true">
            <img src="${unit.portrait}" alt="${unit.name}"
                 onerror="this.src='assets/characters/common/silhouette.png';">
            <div class="bench-name">${unit.name} [${unit.positionId}]</div>
            <div class="bench-hp-bar">
              <div class="bench-hp-fill" style="width: ${hpPercent}%"></div>
            </div>
          </div>
        `;
      }).join('');

      // Add drag handlers and chakra wheels
      core.dom.benchContainer.querySelectorAll(".bench-unit").forEach(el => {
        if (core.swap) {
          el.addEventListener("dragstart", (e) => core.swap.handleBenchDragStart(e, core));
          el.addEventListener("dragend", (e) => core.drag.handleDragEnd(e, core));
        }

        // Create chakra wheel for bench unit portrait
        const unitId = el.dataset.unitId;
        const unit = core.benchTeam.find(u => u.id === unitId);
        const portrait = el.querySelector('img');

        if (unit && portrait && window.BattleChakraWheel) {
          if (!window.BattleChakraWheel.getWheel(unit.id)) {
            window.BattleChakraWheel.createChakraWheel(unit, portrait, true); // true = bench unit
          }
          window.BattleChakraWheel.updateChakraWheel(unit, core);
        }
      });
    },

    /* ===== Utility Functions ===== */

    /**
     * Find unit by ID
     */
    findUnitById(id, core) {
      return core.combatants.find(u => u.id === id);
    },

    /**
     * Get all alive units
     */
    getAliveUnits(core) {
      return core.combatants.filter(u => u.stats.hp > 0);
    },

    /**
     * Get all player units (active + bench)
     */
    getAllPlayerUnits(core) {
      return [...core.activeTeam, ...core.benchTeam];
    },

    /**
     * Reset opacity for all units
     */
    resetOpacity(core) {
      core.dom.grid?.querySelectorAll(".battle-unit").forEach(el => {
        el.style.opacity = "1";
      });
      core.dom.benchContainer?.querySelectorAll(".bench-unit").forEach(el => {
        el.style.opacity = "1";
      });
    }
  };

  // Export to window
  window.BattleUnits = BattleUnits;

  console.log("[BattleUnits] Module loaded ✅");
})();
