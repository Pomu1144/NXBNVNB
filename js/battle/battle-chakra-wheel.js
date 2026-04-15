// js/battle/battle-chakra-wheel.js - Image-Based Circular Chakra Gauge System
(() => {
  "use strict";

  /**
   * BattleChakraWheel Module
   * Professional chakra accumulation system with individual segments
   *
   * Features:
   * - Individual chakra segments (up to 10) positioned evenly around holder
   * - Segments accumulate and persist to show chakra history
   * - Circular frame overlay (chakraholder_icon.png, 140×140px)
   * - Proper layering: portrait (z:1) → chakra (z:5) → frame (z:10)
   * - Circular masking ensures chakra stays inside frame
   * - Click detection for attack selection
   * - Red ring when ultimate-ready
   */
  const BattleChakraWheel = {
    // Configuration
    CLICK_DELAY: 300, // ms between clicks to detect double/triple
    ROTATION_PER_CHAKRA: 36, // degrees per chakra point (10 chakra = 360°)
    MAX_CHAKRA_SEGMENTS: 10, // Maximum number of chakra segments

    // Click tracking
    clickTracking: new Map(), // unitId → {count, timer}

    // Wheel element cache
    wheelCache: new Map(), // unitId → wheelElement

    // Chakra history tracking (which segments have been filled)
    chakraHistory: new Map(), // unitId → Set of segment indices (0-9)

    /* ===== Initialization ===== */

    /**
     * Initialize chakra gauge for a unit
     * Creates the rotating gauge structure using image assets
     */
    createChakraWheel(unit, portraitContainer, isBench = false) {
      if (!unit || !portraitContainer) {
        console.warn('[ChakraWheel] Cannot create wheel - missing unit or portrait');
        return null;
      }

      console.log(`[ChakraWheel] Creating image-based chakra gauge for ${unit.name}`);

      // Get portrait image
      const portraitImg = portraitContainer.querySelector('img');
      if (!portraitImg) {
        console.warn('[ChakraWheel] No portrait image found');
        return null;
      }

      // Create unit ring container (140×140px)
      const unitRing = document.createElement('div');
      unitRing.className = 'unit-ring';
      unitRing.dataset.unitId = unit.id;

      // Clone portrait for bottom layer (128×128px, z-index: 1)
      const clonedPortrait = portraitImg.cloneNode(true);
      clonedPortrait.className = 'portrait';
      clonedPortrait.alt = unit.name;

      // Create chakra container (circular clipping container, z-index: 11)
      const chakraContainer = document.createElement('div');
      chakraContainer.className = 'chakra-container';

      // Create individual chakra segments (10 total, positioned evenly)
      for (let i = 0; i < this.MAX_CHAKRA_SEGMENTS; i++) {
        const chakraSegment = document.createElement('img');
        chakraSegment.className = 'chakra-segment';
        chakraSegment.dataset.segmentIndex = i;
        chakraSegment.src = 'assets/ui/gauges/chakra.png';
        chakraSegment.alt = `Chakra segment ${i + 1}`;

        // Position segment at fixed angle (36° intervals starting at bottom)
        const angle = i * this.ROTATION_PER_CHAKRA + 180; // Start at bottom (180°)
        chakraSegment.style.transform = `rotate(${angle}deg)`;

        chakraContainer.appendChild(chakraSegment);
      }

      // Create chakra frame overlay (top layer, 140×140px for active, 60×60px for bench, z-index: 10)
      const chakraFrame = document.createElement('img');
      chakraFrame.className = 'chakra-frame';
      // Use different frame asset for bench units
      chakraFrame.src = isBench ?
        'assets/ui/frames/chakraholder_iconbench.png' :
        'assets/ui/frames/chakraholder_icon.png';
      chakraFrame.alt = 'Chakra frame';

      // Assemble structure: portrait → chakra container → frame
      unitRing.appendChild(clonedPortrait);
      unitRing.appendChild(chakraContainer);
      unitRing.appendChild(chakraFrame);

      // Initialize chakra history tracking for this unit
      if (!this.chakraHistory.has(unit.id)) {
        this.chakraHistory.set(unit.id, new Set());
      }

      // Add click listener for attack selection
      unitRing.addEventListener('click', (e) => {
        this.handleWheelClick(unit, unitRing, e);
      });

      // Cache the wheel element
      this.wheelCache.set(unit.id, unitRing);

      // For active units, preserve any bench portraits that may be nested
      const existingBenchPortrait = portraitContainer.querySelector('.bench-portrait-container');

      // Replace portrait container content
      portraitContainer.innerHTML = '';
      portraitContainer.appendChild(unitRing);

      // Re-append bench portrait if it existed (for active units with bench)
      if (existingBenchPortrait && !isBench) {
        portraitContainer.appendChild(existingBenchPortrait);
      }

      console.log(`[ChakraWheel] Chakra accumulation system created for ${unit.name}${isBench ? ' (bench)' : ''}`);

      return unitRing;
    },

    /**
     * Update chakra gauge segments (shows proportional fill based on jutsu/ultimate costs)
     */
    updateChakraWheel(unit, core) {
      const wheel = this.wheelCache.get(unit.id);
      if (!wheel) {
        console.warn(`[ChakraWheel] No wheel found for ${unit.name} (${unit.id})`);
        return;
      }

      const currentChakra = unit.chakra || 0;
      const maxChakra = unit.maxChakra || 10;

      // Get jutsu and ultimate costs from unit's skills
      const skills = window.BattleCombat?.getUnitSkills(unit);
      const jutsuCost = Number(skills?.jutsu?.data?.chakraCost ?? 4);
      const ultimateCost = Number(skills?.ultimate?.data?.chakraCost ?? 8);

      // Get chakra history for this unit
      let history = this.chakraHistory.get(unit.id);
      if (!history) {
        history = new Set();
        this.chakraHistory.set(unit.id, history);
      }

      // Add current chakra segments to history (proportional to costs)
      // Calculate how many segments to show based on progress toward ultimate
      const segmentsToShow = Math.min(
        this.MAX_CHAKRA_SEGMENTS,
        Math.floor((currentChakra / ultimateCost) * this.MAX_CHAKRA_SEGMENTS)
      );

      for (let i = 0; i < segmentsToShow; i++) {
        history.add(i);
      }

      // Update segment visibility and styling based on thresholds
      const chakraSegments = wheel.querySelectorAll('.chakra-segment');
      chakraSegments.forEach((segment, index) => {
        // Calculate threshold indices
        const jutsuThreshold = Math.floor((jutsuCost / ultimateCost) * this.MAX_CHAKRA_SEGMENTS);
        const isJutsuRange = index < jutsuThreshold;
        const isUltimateRange = index >= jutsuThreshold;

        if (history.has(index)) {
          segment.classList.add('active');
          // Add visual distinction for jutsu vs ultimate range
          if (isJutsuRange) {
            segment.classList.add('jutsu-range');
            segment.classList.remove('ultimate-range');
          } else if (isUltimateRange) {
            segment.classList.add('ultimate-range');
            segment.classList.remove('jutsu-range');
          }
        } else {
          segment.classList.remove('active', 'jutsu-range', 'ultimate-range');
        }
      });

      console.log(`[ChakraWheel] ${unit.name}: ${currentChakra}/${maxChakra} chakra (jutsu:${jutsuCost}, ult:${ultimateCost}) showing ${segmentsToShow}/${this.MAX_CHAKRA_SEGMENTS} segments`);

      // Check if ultimate-ready (show red ring)
      this.checkUltimateReady(unit, wheel, core);
    },

    /**
     * Check if unit has enough chakra for ultimate and show red ring
     */
    checkUltimateReady(unit, wheel, core) {
      const skills = window.BattleCombat?.getUnitSkills(unit);
      if (!skills?.ultimate) return;

      const ultCost = Number(skills.ultimate.data?.chakraCost ?? 8);
      const hasEnough = unit.chakra >= ultCost;

      if (hasEnough) {
        wheel.classList.add('ultimate-ready');
      } else {
        wheel.classList.remove('ultimate-ready');
      }
    },

    /* ===== Chakra Gain Animation ===== */

    /**
     * Animate chakra gain (shows new segments with animation)
     */
    animateChakraGain(unit, amount, core) {
      const wheel = this.wheelCache.get(unit.id);
      if (!wheel) return;

      const oldChakra = unit.chakra || 0;
      const newChakra = Math.min(unit.maxChakra || 10, oldChakra + amount);

      // Update unit's chakra value
      unit.chakra = newChakra;

      console.log(`[ChakraWheel] ${unit.name} gained ${amount} chakra: ${oldChakra} → ${newChakra}`);

      // Add flash effect to newly gained segments
      const chakraSegments = wheel.querySelectorAll('.chakra-segment');
      for (let i = oldChakra; i < newChakra; i++) {
        const segment = chakraSegments[i];
        if (segment) {
          segment.classList.add('chakra-gain-flash');
          setTimeout(() => {
            segment.classList.remove('chakra-gain-flash');
          }, 500);
        }
      }

      // Update UI
      this.updateChakraWheel(unit, core);
    },

    /* ===== Click Detection System ===== */

    /**
     * Handle wheel click for double/triple-click detection
     * DOES NOT EXECUTE ATTACKS - only routes to input manager to set attack type
     */
    handleWheelClick(unit, wheel, event) {
      event.stopPropagation();

      const unitId = unit.id;
      let tracking = this.clickTracking.get(unitId);

      if (!tracking) {
        tracking = { count: 0, timer: null };
        this.clickTracking.set(unitId, tracking);
      }

      // Increment click count
      tracking.count++;

      // Clear existing timer
      if (tracking.timer) {
        clearTimeout(tracking.timer);
      }

      // Set new timer
      tracking.timer = setTimeout(() => {
        const clickCount = tracking.count;
        tracking.count = 0;

        // Route to input manager - DOES NOT EXECUTE, only sets attack type
        if (window.BattleInputManager) {
          if (clickCount === 1) {
            window.BattleInputManager.handleSingleClick(unit);
          } else if (clickCount === 2) {
            window.BattleInputManager.handleDoubleClick(unit);
          } else if (clickCount >= 3) {
            window.BattleInputManager.handleTripleClick(unit);
          }
        }
      }, this.CLICK_DELAY);
    },

    /* ===== Visual Effects ===== */

    /**
     * Show lightning effect around chakra wheel (visual only, non-blocking)
     * Called by BattleInputManager when attack type is selected
     */
    showLightningEffect(wheel, type = 'red') {
      // Remove any existing lightning
      const existing = wheel.querySelector('.lightning-effect');
      if (existing) {
        existing.remove();
      }

      // Create lightning container
      const lightning = document.createElement('div');
      lightning.className = `lightning-effect ${type}`;

      // Create lightning bolts (9 for red, 10 for gold)
      const boltCount = type === 'gold' ? 10 : 9;
      for (let i = 0; i < boltCount; i++) {
        const bolt = document.createElement('div');
        bolt.className = 'lightning-bolt';
        lightning.appendChild(bolt);
      }

      // Attach to parent container (not wheel directly)
      const parent = wheel.parentElement;
      if (parent) {
        parent.appendChild(lightning);
      } else {
        wheel.appendChild(lightning);
      }

      // Remove after animation completes
      const duration = type === 'gold' ? 1100 : 750;
      setTimeout(() => {
        lightning.remove();
      }, duration);
    },

    /* ===== Utility Functions ===== */

    /**
     * Reset chakra history for a unit (clears all segments)
     */
    resetChakraHistory(unitId) {
      this.chakraHistory.set(unitId, new Set());
      const wheel = this.wheelCache.get(unitId);
      if (wheel) {
        const chakraSegments = wheel.querySelectorAll('.chakra-segment');
        chakraSegments.forEach(segment => {
          segment.classList.remove('active');
        });
      }
      console.log(`[ChakraWheel] Reset chakra history for unit ${unitId}`);
    },

    /**
     * Remove chakra wheel for a unit
     */
    removeChakraWheel(unitId) {
      const wheel = this.wheelCache.get(unitId);
      if (wheel) {
        wheel.remove();
        this.wheelCache.delete(unitId);
      }
      this.clickTracking.delete(unitId);
      // Note: We intentionally keep chakra history for unit switching
    },

    /**
     * Clear all chakra wheels
     */
    clearAll() {
      this.wheelCache.forEach(wheel => wheel.remove());
      this.wheelCache.clear();
      this.clickTracking.clear();
      this.chakraHistory.clear();
    },

    /**
     * Get chakra wheel element for a unit
     */
    getWheel(unitId) {
      return this.wheelCache.get(unitId);
    }
  };

  // Export to window
  window.BattleChakraWheel = BattleChakraWheel;

  console.log("[BattleChakraWheel] Chakra accumulation system loaded ✅");
})();
