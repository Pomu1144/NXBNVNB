// js/fusion.js - Character Fusion System
(() => {
  "use strict";

  const FusionSystem = {
    // State
    selectedUnits: { slot1: null, slot2: null },
    fusionsData: null,
    charactersData: null,
    currentSlot: null,

    // Initialize
    async init() {
      console.log("[Fusion] Initializing fusion system...");

      // Load fusion data
      await this.loadFusionData();

      // Load characters data
      await this.loadCharactersData();

      // Setup event listeners
      this.setupEventListeners();

      // Render available fusions
      this.renderAvailableFusions();

      console.log("[Fusion] ✅ Fusion system initialized");
    },

    // Load fusion recipes
    async loadFusionData() {
      try {
        const response = await fetch('data/fusions.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        this.fusionsData = await response.json();
        console.log("[Fusion] Loaded fusion data:", this.fusionsData);
      } catch (error) {
        console.error("[Fusion] Failed to load fusion data:", error);
        this.fusionsData = { fusions: [], fusionRules: {} };
      }
    },

    // Load characters data
    async loadCharactersData() {
      try {
        const response = await fetch('data/characters.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        this.charactersData = data.characters || data;
        console.log("[Fusion] Loaded characters data");
      } catch (error) {
        console.error("[Fusion] Failed to load characters data:", error);
        this.charactersData = [];
      }
    },

    // Setup event listeners
    setupEventListeners() {
      // Slot click handlers
      document.getElementById('slot-1')?.addEventListener('click', () => this.openUnitSelector(1));
      document.getElementById('slot-2')?.addEventListener('click', () => this.openUnitSelector(2));

      // Button handlers
      document.getElementById('btn-fuse')?.addEventListener('click', () => this.performFusion());
      document.getElementById('btn-clear')?.addEventListener('click', () => this.clearSelection());

      // Modal handlers
      document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
      document.getElementById('success-close')?.addEventListener('click', () => this.closeSuccessModal());

      // Search and filter
      document.getElementById('unit-search')?.addEventListener('input', (e) => this.filterUnits(e.target.value));
      document.getElementById('tier-filter')?.addEventListener('change', (e) => this.filterByTier(e.target.value));

      // Close modal on background click
      document.getElementById('unit-selector-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'unit-selector-modal') this.closeModal();
      });
    },

    // Open unit selector modal
    openUnitSelector(slot) {
      this.currentSlot = slot;
      const modal = document.getElementById('unit-selector-modal');
      modal?.classList.add('open');
      modal?.setAttribute('aria-hidden', 'false');

      this.renderUnitGrid();
    },

    // Close modal
    closeModal() {
      const modal = document.getElementById('unit-selector-modal');
      modal?.classList.remove('open');
      modal?.setAttribute('aria-hidden', 'true');
      this.currentSlot = null;
    },

    // Close success modal
    closeSuccessModal() {
      const modal = document.getElementById('fusion-success-modal');
      modal?.classList.remove('open');
      modal?.setAttribute('aria-hidden', 'true');
      this.clearSelection();
    },

    // Render unit grid in modal
    renderUnitGrid(searchTerm = '', tierFilter = '') {
      const grid = document.getElementById('units-grid');
      if (!grid) return;

      // Get user's inventory
      const inventory = window.InventoryChar?.allInstances() || [];

      if (inventory.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(238,230,209,0.5);">No characters available</div>';
        return;
      }

      // Filter units
      let filteredUnits = inventory.filter(inst => {
        // Search filter
        if (searchTerm) {
          const charData = this.charactersData.find(c => c.id === inst.charId);
          const name = charData?.name || '';
          if (!name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        }

        // Tier filter
        if (tierFilter && inst.tierCode !== tierFilter) return false;

        // Don't show already selected units
        if (this.selectedUnits.slot1?.uid === inst.uid) return false;
        if (this.selectedUnits.slot2?.uid === inst.uid) return false;

        return true;
      });

      // Render cards
      grid.innerHTML = filteredUnits.map(inst => {
        const charData = this.charactersData.find(c => c.id === inst.charId);
        const tierData = charData?.artByTier?.[inst.tierCode] || {};
        const portrait = tierData.portrait || charData?.portrait || 'assets/characters/common/silhouette.png';

        return `
          <div class="unit-card" data-uid="${inst.uid}">
            <img src="${portrait}" alt="${charData?.name || 'Unknown'}" onerror="this.src='assets/characters/common/silhouette.png'">
            <div class="unit-card-info">
              <div class="unit-card-name">${charData?.name || 'Unknown'}</div>
            </div>
          </div>
        `;
      }).join('');

      // Add click handlers
      grid.querySelectorAll('.unit-card').forEach(card => {
        card.addEventListener('click', () => {
          const uid = card.dataset.uid;
          this.selectUnit(uid);
        });
      });
    },

    // Select a unit for fusion
    selectUnit(uid) {
      if (!this.currentSlot) return;

      const inst = window.InventoryChar?.getByUid(uid);
      if (!inst) return;

      const charData = this.charactersData.find(c => c.id === inst.charId);
      const tierData = charData?.artByTier?.[inst.tierCode] || {};
      const portrait = tierData.portrait || charData?.portrait || 'assets/characters/common/silhouette.png';

      const slotKey = `slot${this.currentSlot}`;
      this.selectedUnits[slotKey] = { ...inst, portrait, charData };

      this.updateSlotDisplay(this.currentSlot);
      this.closeModal();
      this.validateFusion();
    },

    // Update slot display
    updateSlotDisplay(slot) {
      const slotEl = document.getElementById(`slot-${slot}`);
      const infoEl = document.getElementById(`info-${slot}`);
      const unit = this.selectedUnits[`slot${slot}`];

      if (!unit) {
        slotEl.innerHTML = `
          <div class="slot-placeholder">
            <div class="slot-icon">+</div>
            <div class="slot-label">Select Unit ${slot}</div>
          </div>
        `;
        slotEl.classList.remove('filled');
        infoEl.innerHTML = '';
        return;
      }

      // Calculate effective stats
      const stats = this.calculateUnitStats(unit);

      slotEl.innerHTML = `<img src="${unit.portrait}" alt="${unit.charData?.name || 'Unknown'}">`;
      slotEl.classList.add('filled');

      infoEl.innerHTML = `
        <div class="unit-name">${unit.charData?.name || 'Unknown'}</div>
        <div class="unit-tier">Tier: ${unit.tierCode || 'Unknown'}</div>
        <div class="unit-level">Level: ${unit.level || 1}</div>
        <div class="unit-stats">
          <div class="stat-row"><span>HP:</span><span>${stats.hp || 0}</span></div>
          <div class="stat-row"><span>ATK:</span><span>${stats.atk || 0}</span></div>
          <div class="stat-row"><span>DEF:</span><span>${stats.def || 0}</span></div>
          <div class="stat-row"><span>SPD:</span><span>${stats.speed || 0}</span></div>
        </div>
      `;
    },

    // Calculate unit stats
    calculateUnitStats(unit) {
      let stats = {};

      if (window.Progression?.computeEffectiveStatsLoreTier) {
        const result = window.Progression.computeEffectiveStatsLoreTier(
          unit.charData,
          unit.level || 1,
          unit.tierCode || '3S',
          { normalize: true }
        );
        stats = result.stats || {};
      } else {
        stats = unit.charData?.statsMax || unit.charData?.statsBase || {};
      }

      // Apply fusion legacy bonus if present
      if (unit.fusionLegacySteps && unit.fusionPath && this.fusionsData?.fusionPaths) {
        const pathConfig = this.fusionsData.fusionPaths[unit.fusionPath];
        if (pathConfig) {
          const bonusMultiplier = 1 + (unit.fusionLegacySteps * pathConfig.bonusPerStep);
          stats = {
            hp: Math.round(stats.hp * bonusMultiplier),
            atk: Math.round(stats.atk * bonusMultiplier),
            def: Math.round(stats.def * bonusMultiplier),
            speed: Math.round(stats.speed * bonusMultiplier)
          };
        }
      }

      return stats;
    },

    // Validate fusion requirements
    validateFusion() {
      const { slot1, slot2 } = this.selectedUnits;
      const btnFuse = document.getElementById('btn-fuse');
      const requirementsEl = document.getElementById('fusion-requirements');
      const requirementsGrid = document.getElementById('requirements-grid');

      if (!slot1 || !slot2) {
        btnFuse.disabled = true;
        requirementsEl.style.display = 'none';
        this.clearResultSlot();
        return;
      }

      // Find matching fusion recipe
      const fusion = this.findFusionRecipe(slot1, slot2);

      if (!fusion) {
        requirementsEl.style.display = 'block';
        requirementsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: rgba(231,76,60,0.8);">No fusion recipe found for these units</div>';
        btnFuse.disabled = true;
        this.clearResultSlot();
        return;
      }

      // Check requirements
      const reqs = fusion.requirements;
      const resources = window.Resources?.get() || {};
      const requirements = [];

      // Check tier requirements - units must be at max awakening
      const char1Data = this.charactersData.find(c => c.id === fusion.requirements.unit1);
      const char2Data = this.charactersData.find(c => c.id === fusion.requirements.unit2);

      if (char1Data) {
        const maxTier = char1Data.starMaxCode;
        const met = slot1.tierCode === maxTier;
        requirements.push({
          label: `${char1Data.name} at ${maxTier}`,
          value: met ? '✓' : `${slot1.tierCode} (Awaken to ${maxTier})`,
          met
        });
      }

      if (char2Data) {
        const maxTier = char2Data.starMaxCode;
        const met = slot2.tierCode === maxTier;
        requirements.push({
          label: `${char2Data.name} at ${maxTier}`,
          value: met ? '✓' : `${slot2.tierCode} (Awaken to ${maxTier})`,
          met
        });
      }

      // Minimum level check
      if (reqs.minLevel) {
        const met = (slot1.level >= reqs.minLevel) && (slot2.level >= reqs.minLevel);
        requirements.push({
          label: `Min Level ${reqs.minLevel}`,
          value: met ? '✓' : '✗',
          met
        });
      }

      // Material checks (scrolls removed per user request)
      if (reqs.materials) {
        Object.entries(reqs.materials).forEach(([material, amount]) => {
          // Skip scroll requirements
          if (material.toLowerCase().includes('scroll')) {
            return;
          }
          const have = resources[material] || 0;
          const met = have >= amount;
          requirements.push({
            label: material,
            value: `${have}/${amount}`,
            met
          });
        });
      }

      // Render requirements
      requirementsEl.style.display = 'block';
      requirementsGrid.innerHTML = requirements.map(req => `
        <div class="requirement-item ${req.met ? 'met' : 'not-met'}">
          <span class="requirement-label">${req.label}</span>
          <span class="requirement-value">${req.value}</span>
        </div>
      `).join('');

      // Update fusion button
      const allMet = requirements.every(r => r.met);
      btnFuse.disabled = !allMet;

      // Show result preview
      this.showResultPreview(fusion);
    },

    // Find fusion recipe
    findFusionRecipe(unit1, unit2) {
      if (!this.fusionsData?.fusions) return null;

      return this.fusionsData.fusions.find(fusion => {
        const req = fusion.requirements;
        return (
          (unit1.charId === req.unit1 && unit2.charId === req.unit2) ||
          (unit1.charId === req.unit2 && unit2.charId === req.unit1)
        );
      });
    },

    // Show result preview
    showResultPreview(fusion) {
      const resultSlot = document.getElementById('result-slot');
      const resultInfo = document.getElementById('result-info');

      const resultChar = this.charactersData.find(c => c.id === fusion.result.characterId);
      if (!resultChar) {
        this.clearResultSlot();
        return;
      }

      const tierData = resultChar.artByTier?.[fusion.result.tier] || {};
      const portrait = tierData.portrait || resultChar.portrait || 'assets/characters/common/silhouette.png';

      resultSlot.innerHTML = `<img src="${portrait}" alt="${resultChar.name}">`;
      resultSlot.classList.add('filled');

      const bonusStats = fusion.result.bonusStats || {};
      resultInfo.innerHTML = `
        <div class="unit-name">${resultChar.name}</div>
        <div class="unit-tier">Tier: ${fusion.result.tier}</div>
        <div class="unit-level">Starting Level: ${fusion.result.level}</div>
        ${Object.keys(bonusStats).length > 0 ? `
          <div class="unit-stats">
            ${bonusStats.hp ? `<div class="stat-row"><span>Bonus HP:</span><span>+${bonusStats.hp}</span></div>` : ''}
            ${bonusStats.atk ? `<div class="stat-row"><span>Bonus ATK:</span><span>+${bonusStats.atk}</span></div>` : ''}
            ${bonusStats.def ? `<div class="stat-row"><span>Bonus DEF:</span><span>+${bonusStats.def}</span></div>` : ''}
          </div>
        ` : ''}
      `;
    },

    // Clear result slot
    clearResultSlot() {
      const resultSlot = document.getElementById('result-slot');
      const resultInfo = document.getElementById('result-info');

      resultSlot.innerHTML = `
        <div class="slot-placeholder">
          <div class="slot-icon">?</div>
          <div class="slot-label">Fusion Result</div>
        </div>
      `;
      resultSlot.classList.remove('filled');
      resultInfo.innerHTML = '';
    },

    // Perform fusion
    async performFusion() {
      const { slot1, slot2 } = this.selectedUnits;
      if (!slot1 || !slot2) return;

      const fusion = this.findFusionRecipe(slot1, slot2);
      if (!fusion) return;

      console.log("[Fusion] Performing fusion:", fusion);

      // Deduct materials
      if (fusion.requirements.materials) {
        Object.entries(fusion.requirements.materials).forEach(([material, amount]) => {
          window.Resources?.add(material, -amount);
        });
      }

      // Calculate Legacy Bonus
      const legacyBonus = this.calculateLegacyBonus(slot1, slot2, fusion);
      console.log("[Fusion] Legacy Bonus Steps:", legacyBonus);

      // Fusion Bug A & B fix: Use correct method names
      // Remove the two units from inventory
      window.InventoryChar?.removeOneByUid(slot1.uid);
      window.InventoryChar?.removeOneByUid(slot2.uid);

      // Add the fusion result
      const fusionLevel = fusion.result.level || 1;
      const newChar = window.InventoryChar?.addCopy(
        fusion.result.characterId,
        fusionLevel,
        fusion.result.tier
      );

      if (newChar) {
        if (fusion.result.level > 1) {
          newChar.level = fusion.result.level;
        }

        // Store legacy bonus count for cumulative stat bonuses
        newChar.fusionLegacySteps = legacyBonus;
        newChar.fusionPath = fusion.fusionPath || null;

        window.InventoryChar?.save();
      }

      console.log("[Fusion] ✅ Fusion successful:", newChar);

      // Show success modal
      this.showSuccessModal(fusion, newChar, legacyBonus);
    },

    // Calculate legacy bonus based on fusion path
    calculateLegacyBonus(unit1, unit2, fusion) {
      // If this fusion is not part of a legacy path, return 0
      if (!fusion.fusionPath) return 0;

      // Count legacy steps from both input units (same path only)
      const unit1Steps = (unit1.fusionPath === fusion.fusionPath) ? (unit1.fusionLegacySteps || 0) : 0;
      const unit2Steps = (unit2.fusionPath === fusion.fusionPath) ? (unit2.fusionLegacySteps || 0) : 0;

      // Take the maximum from either unit, then add 1 for this fusion
      const maxSteps = Math.max(unit1Steps, unit2Steps);
      return maxSteps + 1;
    },

    // Show success modal
    showSuccessModal(fusion, newChar, legacyBonus) {
      const modal = document.getElementById('fusion-success-modal');
      const resultEl = document.getElementById('success-result');

      const charData = this.charactersData.find(c => c.id === fusion.result.characterId);
      const tierData = charData?.artByTier?.[fusion.result.tier] || {};
      const portrait = tierData.portrait || charData?.portrait || 'assets/characters/common/silhouette.png';

      // Get path-specific bonus or fall back to global
      let bonusPerStep = this.fusionsData.fusionRules.legacyBonusPerStep;
      if (fusion.fusionPath && this.fusionsData.fusionPaths?.[fusion.fusionPath]) {
        bonusPerStep = this.fusionsData.fusionPaths[fusion.fusionPath].bonusPerStep;
      }

      const legacyBonusPercent = (legacyBonus * bonusPerStep * 100).toFixed(1);
      const legacyBonusDisplay = legacyBonus > 0 ? `
        <div style="font-size: 1rem; color: rgba(255, 215, 0, 0.9); margin-top: 12px; padding: 8px; background: rgba(217, 179, 98, 0.1); border-radius: 8px;">
          <strong>⭐ Legacy Bonus:</strong> ${legacyBonus} step${legacyBonus !== 1 ? 's' : ''} (+${legacyBonusPercent}% to all stats)
        </div>
      ` : '';

      resultEl.innerHTML = `
        <img src="${portrait}" style="width: 200px; height: 200px; object-fit: cover; border-radius: 12px; margin: 20px auto; display: block;" alt="${charData?.name || 'Unknown'}">
        <div style="font-size: 1.5rem; color: var(--gold); font-weight: 600; margin-bottom: 10px;">${charData?.name || 'Unknown'}</div>
        <div style="font-size: 1rem; color: rgba(238,230,209,0.8);">Tier: ${fusion.result.tier}</div>
        <div style="font-size: 1rem; color: rgba(238,230,209,0.8);">Level: ${fusion.result.level}</div>
        ${legacyBonusDisplay}
      `;

      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    },

    // Clear selection
    clearSelection() {
      this.selectedUnits = { slot1: null, slot2: null };
      this.updateSlotDisplay(1);
      this.updateSlotDisplay(2);
      this.clearResultSlot();

      const requirementsEl = document.getElementById('fusion-requirements');
      requirementsEl.style.display = 'none';

      const btnFuse = document.getElementById('btn-fuse');
      btnFuse.disabled = true;
    },

    // Filter units by search
    filterUnits(searchTerm) {
      const tierFilter = document.getElementById('tier-filter')?.value || '';
      this.renderUnitGrid(searchTerm, tierFilter);
    },

    // Filter units by tier
    filterByTier(tier) {
      const searchTerm = document.getElementById('unit-search')?.value || '';
      this.renderUnitGrid(searchTerm, tier);
    },

    // Render available fusions list
    renderAvailableFusions() {
      const grid = document.getElementById('fusions-grid');
      if (!grid || !this.fusionsData?.fusions) return;

      if (this.fusionsData.fusions.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(238,230,209,0.5);">No fusion recipes available</div>';
        return;
      }

      grid.innerHTML = this.fusionsData.fusions.map(fusion => {
        const char1 = this.charactersData.find(c => c.id === fusion.requirements.unit1);
        const char2 = this.charactersData.find(c => c.id === fusion.requirements.unit2);
        const result = this.charactersData.find(c => c.id === fusion.result.characterId);

        // Get portraits - use base tier first, then max tier
        const char1Portrait = this.getCharacterPortrait(char1, char1?.starMinCode || '3S');
        const char2Portrait = this.getCharacterPortrait(char2, char2?.starMinCode || '3S');
        const resultPortrait = this.getCharacterPortrait(result, fusion.result.tier);

        const materials = Object.entries(fusion.requirements.materials || {})
          .map(([mat, amt]) => `<div class="material-tag">${mat}: ${amt}</div>`)
          .join('');

        return `
          <div class="fusion-card" data-fusion-id="${fusion.id}">
            <div class="fusion-card-title">${fusion.name || 'Unknown Fusion'}</div>

            <!-- Fusion Preview with Icons -->
            <div class="fusion-preview">
              <div class="fusion-preview-unit">
                <img src="${char1Portrait}" alt="${char1?.name || 'Unknown'}" class="fusion-preview-icon">
                <div class="fusion-preview-name">${char1?.name || 'Unknown'}</div>
                <div class="fusion-preview-version">${char1?.version || ''}</div>
              </div>

              <div class="fusion-preview-plus">+</div>

              <div class="fusion-preview-unit">
                <img src="${char2Portrait}" alt="${char2?.name || 'Unknown'}" class="fusion-preview-icon">
                <div class="fusion-preview-name">${char2?.name || 'Unknown'}</div>
                <div class="fusion-preview-version">${char2?.version || ''}</div>
              </div>

              <div class="fusion-preview-arrow">→</div>

              <div class="fusion-preview-unit result">
                <img src="${resultPortrait}" alt="${result?.name || 'Unknown'}" class="fusion-preview-icon">
                <div class="fusion-preview-name">${result?.name || 'Unknown'}</div>
                <div class="fusion-preview-version">${result?.version || ''}</div>
              </div>
            </div>

            <div class="fusion-card-description">${fusion.description || ''}</div>
            <div class="fusion-card-materials">${materials}</div>
          </div>
        `;
      }).join('');

      // Add click handlers to auto-populate fusion slots
      grid.querySelectorAll('.fusion-card').forEach(card => {
        card.addEventListener('click', () => {
          const fusionId = card.dataset.fusionId;
          this.autoPopulateFusion(fusionId);
        });
      });
    },

    // Get character portrait by tier
    getCharacterPortrait(charData, tier) {
      if (!charData) return 'assets/characters/common/silhouette.png';

      const tierData = charData.artByTier?.[tier] || {};
      return tierData.portrait || charData.portrait || 'assets/characters/common/silhouette.png';
    },

    // Auto-populate fusion slots from recipe
    autoPopulateFusion(fusionId) {
      const fusion = this.fusionsData.fusions.find(f => f.id === fusionId);
      if (!fusion) return;

      console.log("[Fusion] Auto-populating fusion:", fusion.name);

      // Get user's inventory
      const inventory = window.InventoryChar?.allInstances() || [];

      // Find matching units in inventory (must be at max tier)
      const char1Data = this.charactersData.find(c => c.id === fusion.requirements.unit1);
      const char2Data = this.charactersData.find(c => c.id === fusion.requirements.unit2);

      const unit1 = inventory.find(inst =>
        inst.charId === fusion.requirements.unit1 &&
        inst.tierCode === char1Data?.starMaxCode
      );

      const unit2 = inventory.find(inst =>
        inst.charId === fusion.requirements.unit2 &&
        inst.tierCode === char2Data?.starMaxCode &&
        inst.uid !== unit1?.uid  // Don't select the same unit twice
      );

      // Clear previous selection
      this.clearSelection();

      // Populate slots if units are found
      if (unit1) {
        const tierData = char1Data?.artByTier?.[unit1.tierCode] || {};
        const portrait = tierData.portrait || char1Data?.portrait || 'assets/characters/common/silhouette.png';

        this.selectedUnits.slot1 = { ...unit1, portrait, charData: char1Data };
        this.updateSlotDisplay(1);
      }

      if (unit2) {
        const tierData = char2Data?.artByTier?.[unit2.tierCode] || {};
        const portrait = tierData.portrait || char2Data?.portrait || 'assets/characters/common/silhouette.png';

        this.selectedUnits.slot2 = { ...unit2, portrait, charData: char2Data };
        this.updateSlotDisplay(2);
      }

      // Validate and show preview
      this.validateFusion();

      // Scroll to fusion area
      document.querySelector('.fusion-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FusionSystem.init());
  } else {
    FusionSystem.init();
  }

  // Export to window
  window.FusionSystem = FusionSystem;

  console.log("[Fusion] Module loaded ✅");
})();
