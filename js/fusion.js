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

      // Render available fusions (owned recipe scrolls only)
      this.renderAvailableFusions();

      // Recipe ownership can change from another tab (Summon / Shop) or the dev panel
      const rerender = () => { this.renderAvailableFusions(); if (this.selectedUnits.slot1 || this.selectedUnits.slot2) this.validateFusion(); };
      window.addEventListener('recipebook:change', rerender);
      window.addEventListener('storage', (e) => { if (e.key === window.RecipeBook?.STORAGE_KEY) rerender(); });

      // Deep link from the summon reveal / shop: fusion.html?recipe=<id>
      const deep = new URLSearchParams(location.search).get('recipe');
      if (deep && this.isRecipeOwned(deep)) {
        this.selectRecipeCard(deep);
        this.autoPopulateFusion(deep);
      }

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
      ['slot-1', 'slot-2'].forEach((id, i) => document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openUnitSelector(i + 1); }
      }));

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
        grid.innerHTML = '<div class="fu-empty">No characters available</div>';
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
          <div class="unit-card" data-uid="${inst.uid}" data-tier="${this.tierRank(inst.tierCode)}">
            <div class="unit-card-art"><img src="${portrait}" alt="${charData?.name || 'Unknown'}" loading="lazy" onerror="this.src='assets/characters/common/silhouette.png'"></div>
            <div class="unit-card-info">
              <div class="unit-card-name">${charData?.name || 'Unknown'}</div>
              <div class="unit-card-meta">${inst.tierCode || '—'} · Lv ${inst.level || 1}</div>
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
            <div class="slot-label">Unit ${slot}</div>
          </div>
        `;
        slotEl.classList.remove('filled');
        delete slotEl.dataset.tier;
        infoEl.innerHTML = '';
        return;
      }

      slotEl.innerHTML = `<img src="${unit.portrait}" alt="${unit.charData?.name || 'Unknown'}">`;
      slotEl.classList.add('filled');
      slotEl.dataset.tier = this.tierRank(unit.tierCode);

      infoEl.innerHTML = `
        <div class="unit-name">${unit.charData?.name || 'Unknown'}</div>
        <div class="unit-meta">${unit.tierCode || '—'} · Lv ${unit.level || 1}</div>
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
        requirementsGrid.innerHTML = '<div class="requirement-none">No recipe uses these two units</div>';
        btnFuse.disabled = true;
        this.clearResultSlot();
        return;
      }

      // Check requirements
      const reqs = fusion.requirements;
      const resources = window.Resources?.getAll?.() || {};
      const requirements = [];

      // The player must own this recipe's scroll (Summon › Recipes or the Shop)
      const ownsRecipe = this.isRecipeOwned(fusion.id);
      requirements.push({
        label: 'Recipe scroll',
        value: ownsRecipe ? '✓' : 'Not owned',
        title: ownsRecipe ? '' : 'Get this recipe from Summon › Recipes or the Shop',
        met: ownsRecipe
      });

      // Check tier requirements - units must be at max awakening
      const char1Data = this.charactersData.find(c => c.id === fusion.requirements.unit1);
      const char2Data = this.charactersData.find(c => c.id === fusion.requirements.unit2);

      // Pair each required unit with the slot holding it (either order).
      const swapped = !(this.unitMeetsReq(slot1, reqs.unit1).match && this.unitMeetsReq(slot2, reqs.unit2).match);
      const pairs = [[char1Data, reqs.unit1, swapped ? slot2 : slot1], [char2Data, reqs.unit2, swapped ? slot1 : slot2]];
      pairs.forEach(([charData, reqId, slot]) => {
        if (!charData) return;
        const maxTier = this.reqTopTier(charData);
        const { met } = this.unitMeetsReq(slot, reqId);
        requirements.push({
          label: `${charData.name} ${maxTier}`,
          value: met ? '✓' : `${slot.tierCode} → ${maxTier}`,
          met
        });
      });

      // Duplicate copies requirement (same unit recipes)
      if (reqs.requiredCopies && slot1.charId === slot2.charId) {
        const inv = window.InventoryChar?.allInstances?.() || [];
        const copyCount = inv.filter(inst => inst.charId === slot1.charId).length;
        const met = copyCount >= reqs.requiredCopies;
        requirements.push({
          label: `${slot1.charData?.name || 'Unit'} Copies`,
          value: `${copyCount}/${reqs.requiredCopies}`,
          met
        });
      }

      // Minimum level check
      if (reqs.minLevel) {
        const met = (slot1.level >= reqs.minLevel) && (slot2.level >= reqs.minLevel);
        requirements.push({
          label: `Level ${reqs.minLevel}+`,
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
          const have = window.Resources?.get?.(material) ?? (resources[material] || 0);
          const met = have >= amount;
          const fmt = (n) => Number(n || 0).toLocaleString();
          const icon = this.currencyIcon(material);
          requirements.push({
            label: `${icon ? `<img src="${icon}" alt="" class="requirement-icon">` : ''}${material}`,
            value: met ? fmt(amount) : `${fmt(have)} / ${fmt(amount)}`,
            title: `Have ${fmt(have)}`,
            cost: true,
            met
          });
        });
      }

      // Render requirements
      requirementsEl.style.display = 'block';
      requirementsGrid.innerHTML = requirements.map(req => `
        <div class="requirement-item ${req.met ? 'met' : 'not-met'}${req.cost ? ' is-cost' : ''}"${req.title ? ` title="${req.title}"` : ''}>
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

    // Top tier a required unit must reach. A card that transforms into another
    // card when awakened past a tier (awakening-transforms.json) can never be
    // at its nominal starMaxCode, so its top is the tier just below the
    // transform (Progression.statTopTier); otherwise starMaxCode.
    reqTopTier(charData) {
      if (!charData) return null;
      return window.Progression?.statTopTier?.(charData) || charData.starMaxCode;
    },

    // { tier, toId } when the required card turns into another card past its top tier.
    reqTransform(charData) {
      return (charData && window.Progression?.transformAtTop?.(charData)) || null;
    },

    // Does this instance count as the required unit? Either the card itself at
    // its top tier, or the card it transforms into (at/after the transform tier).
    // Returns { match: bool (right chain), met: bool (tier requirement satisfied) }.
    unitMeetsReq(inst, reqId) {
      if (!inst) return { match: false, met: false };
      const reqChar = this.charactersData.find(c => c.id === reqId);
      const top = this.reqTopTier(reqChar);
      if (inst.charId === reqId) {
        const tier = inst.tierCode || reqChar?.starMinCode;
        return { match: true, met: tier === top || tier === reqChar?.starMaxCode };
      }
      const tf = this.reqTransform(reqChar);
      if (tf && inst.charId === tf.toId) {
        const order = window.Progression?.TIER_ORDER || [];
        const toChar = this.charactersData.find(c => c.id === tf.toId);
        const tier = inst.tierCode || toChar?.starMinCode;
        return { match: true, met: order.indexOf(tier) >= order.indexOf(tf.tier) };
      }
      return { match: false, met: false };
    },

    // Find fusion recipe
    findFusionRecipe(unit1, unit2) {
      if (!this.fusionsData?.fusions) return null;

      const is = (inst, reqId) => this.unitMeetsReq(inst, reqId).match;
      return this.fusionsData.fusions.find(fusion => {
        const req = fusion.requirements;
        return (
          (is(unit1, req.unit1) && is(unit2, req.unit2)) ||
          (is(unit1, req.unit2) && is(unit2, req.unit1))
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

      this.setTicketHead(fusion.stepNumber ? `Step ${fusion.stepNumber}` : 'Fusion', fusion.name || resultChar.name);
      resultSlot.innerHTML = `<img src="${portrait}" alt="${resultChar.name}">`;
      resultSlot.classList.add('filled');
      resultSlot.dataset.tier = this.tierRank(fusion.result.tier);

      const bonusStats = fusion.result.bonusStats || {};
      if (!resultInfo) return;
      const bonus = [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF']]
        .filter(([k]) => bonusStats[k])
        .map(([k, l]) => `<span>+${Number(bonusStats[k]).toLocaleString()} ${l}</span>`)
        .join('');
      resultInfo.innerHTML = `
        <div class="unit-name">${resultChar.name}</div>
        <div class="unit-meta">${fusion.result.tier} · Lv ${fusion.result.level || 1}</div>
        ${bonus ? `<div class="unit-bonus">${bonus}</div>` : ''}
      `;
    },

    // Clear result slot
    clearResultSlot() {
      const resultSlot = document.getElementById('result-slot');
      const resultInfo = document.getElementById('result-info');

      resultSlot.innerHTML = `
        <div class="slot-placeholder">
          <div class="slot-icon">?</div>
          <div class="slot-label">Result</div>
        </div>
      `;
      resultSlot.classList.remove('filled');
      delete resultSlot.dataset.tier;
      if (resultInfo) resultInfo.innerHTML = '';
      this.setTicketHead('Fusion', 'Choose a recipe');
    },

    // Fusion ticket header (kicker + recipe name)
    setTicketHead(kicker, title) {
      const k = document.getElementById('fu-ticket-kicker');
      const t = document.getElementById('fu-ticket-title');
      if (k) k.textContent = kicker;
      if (t) t.textContent = title;
    },

    // Perform fusion
    async performFusion() {
      const { slot1, slot2 } = this.selectedUnits;
      if (!slot1 || !slot2) return;

      const fusion = this.findFusionRecipe(slot1, slot2);
      if (!fusion) return;

      // Hard gate (the Fuse button can be bypassed from the console): recipe owned
      // and every requirement met, re-checked right now.
      if (!this.isRecipeOwned(fusion.id)) {
        console.warn("[Fusion] Refused: recipe not owned", fusion.id);
        return;
      }
      this.validateFusion();
      if (document.getElementById('btn-fuse')?.disabled) {
        console.warn("[Fusion] Refused: requirements not met", fusion.id);
        return;
      }

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

      // Remove required units from inventory
      if (fusion.requirements.requiredCopies && slot1.charId === slot2.charId) {
        const needed = Math.max(1, fusion.requirements.requiredCopies);
        const inv = window.InventoryChar?.allInstances?.() || [];
        const matches = inv.filter(inst => inst.charId === slot1.charId).slice(0, needed);
        matches.forEach(inst => window.InventoryChar?.removeOneByUid(inst.uid));
      } else {
        window.InventoryChar?.removeOneByUid(slot1.uid);
        window.InventoryChar?.removeOneByUid(slot2.uid);
      }

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

        // Persist the extra fields (InventoryChar has no public save())
        window.InventoryChar?.updateInstance?.(newChar.uid, {
          level: newChar.level,
          fusionLegacySteps: newChar.fusionLegacySteps,
          fusionPath: newChar.fusionPath
        });
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
      const resultEl = document.getElementById('success-result') || document.getElementById('success-content');

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
        <div class="success-legacy">Legacy bonus · ${legacyBonus} step${legacyBonus !== 1 ? 's' : ''} · +${legacyBonusPercent}% all stats</div>
      ` : '';

      resultEl.innerHTML = `
        <div class="success-art"><img src="${portrait}" alt="${charData?.name || 'Unknown'}"></div>
        <div class="success-name">${charData?.name || 'Unknown'}</div>
        <div class="success-meta">${fusion.result.tier} · Lv ${fusion.result.level || 1}</div>
        ${legacyBonusDisplay}
      `;

      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    },

    // Clear selection
    clearSelection() {
      this.selectedUnits = { slot1: null, slot2: null };
      document.querySelectorAll('#fusions-grid .rscroll.selected').forEach(c => c.classList.remove('selected'));
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

    // Recipe ownership (js/recipe-book.js). No RecipeBook → nothing is owned.
    isRecipeOwned(fusionId) {
      return !!window.RecipeBook?.has?.(fusionId);
    },

    // Data shape js/recipe-scroll.js expects: { chars: {id: char}, paths }
    scrollData() {
      if (!this._scrollData) {
        const chars = {};
        (this.charactersData || []).forEach(c => { chars[c.id] = c; });
        this._scrollData = { chars, paths: this.fusionsData?.fusionPaths || {} };
      }
      return this._scrollData;
    },

    selectRecipeCard(fusionId) {
      document.querySelectorAll('#fusions-grid .rscroll').forEach(c => {
        const on = c.dataset.fusionId === fusionId;
        c.classList.toggle('selected', on);
        if (on) c.scrollIntoView?.({ block: 'nearest' });
      });
    },

    // Render the player's recipe scrolls (owned only) — or the empty state
    renderAvailableFusions() {
      const grid = document.getElementById('fusions-grid');
      if (!grid || !this.fusionsData?.fusions) return;

      const all = this.fusionsData.fusions;
      const owned = all.filter(f => this.isRecipeOwned(f.id));
      const panel = grid.closest('.fusion-recipes-panel');
      const count = document.getElementById('recipe-count');
      if (count) count.textContent = `${owned.length} / ${all.length}`;
      panel?.classList.toggle('is-empty', owned.length === 0);
      const selected = grid.querySelector('.rscroll.selected')?.dataset.fusionId;

      if (!owned.length || !window.RecipeScroll) {
        grid.innerHTML = `
          <div class="rc-empty">
            <img class="rc-empty-art" src="assets/ui/recipes/scroll_closed.webp" alt="">
            <h3>No recipes yet</h3>
            <p>Fusion needs a recipe scroll. Get recipe scrolls from <b>Summon</b> or the <b>Shop</b>.</p>
            <div class="rc-empty-actions">
              <a class="jjk-btn is-primary" href="summon.html?tab=recipes">Summon</a>
              <a class="jjk-btn" href="shop.html?tab=recipes">Shop</a>
            </div>
          </div>`;
        return;
      }

      const data = this.scrollData();
      grid.innerHTML = owned.map(f => window.RecipeScroll.html(f, data, { button: true })).join('') +
        `<p class="rc-more">More recipes: <a href="summon.html?tab=recipes">Summon</a> · <a href="shop.html?tab=recipes">Shop</a></p>`;
      if (selected) this.selectRecipeCard(selected);

      grid.querySelectorAll('.rscroll').forEach(card => {
        card.addEventListener('click', () => this.autoPopulateFusion(card.dataset.fusionId));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
        });
      });
    },

    // Map a tier code (3S, 5S, 6SB…) to a rarity bucket used for frame colors
    tierRank(tier) {
      const n = parseInt(String(tier || ''), 10);
      if (!n) return 'x';
      if (n <= 3) return '3';
      if (n >= 7) return '7';
      return String(n);
    },

    // Currency icon for a material key (null if none)
    currencyIcon(mat) {
      const m = String(mat).toLowerCase();
      if (m === 'ryo') return 'assets/icons/currency/ryo.png';
      if (m.includes('pearl')) return 'assets/icons/currency/ninjapearl.png';
      if (m.includes('shinobite')) return 'assets/icons/currency/shinobite.png';
      return null;
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
      if (!fusion || !this.isRecipeOwned(fusionId)) return;

      console.log("[Fusion] Auto-populating fusion:", fusion.name);

      // Get user's inventory
      const inventory = window.InventoryChar?.allInstances() || [];

      // Find matching units in inventory (must be at max tier)
      const char1Data = this.charactersData.find(c => c.id === fusion.requirements.unit1);
      const char2Data = this.charactersData.find(c => c.id === fusion.requirements.unit2);

      // Eligible: the card at its top tier, or the card it transforms into.
      const eligible = (inst, reqId) => this.unitMeetsReq(inst, reqId).met;
      const unit1 = inventory.find(inst => eligible(inst, fusion.requirements.unit1));

      const unit2 = inventory.find(inst => {
        if (!eligible(inst, fusion.requirements.unit2)) return false;
        // same-unit recipes can reuse type, but not exact same instance
        return inst.uid !== unit1?.uid;
      });
      const dataOf = (inst, fallback) => this.charactersData.find(c => c.id === inst?.charId) || fallback;

      // Clear previous selection
      this.clearSelection();

      // Highlight the chosen recipe card
      this.selectRecipeCard(fusionId);

      // Populate slots if units are found
      if (unit1) {
        const d1 = dataOf(unit1, char1Data);
        const tierData = d1?.artByTier?.[unit1.tierCode] || {};
        const portrait = tierData.portrait || d1?.portrait || 'assets/characters/common/silhouette.png';

        this.selectedUnits.slot1 = { ...unit1, portrait, charData: d1 };
        this.updateSlotDisplay(1);
      }

      if (unit2) {
        const d2 = dataOf(unit2, char2Data);
        const tierData = d2?.artByTier?.[unit2.tierCode] || {};
        const portrait = tierData.portrait || d2?.portrait || 'assets/characters/common/silhouette.png';

        this.selectedUnits.slot2 = { ...unit2, portrait, charData: d2 };
        this.updateSlotDisplay(2);
      }

      // Validate and show preview
      this.validateFusion();
      // Missing units: still show which recipe is chosen and what it makes
      if (!unit1 || !unit2) this.showResultPreview(fusion);

      // Scroll to fusion area
      // On stacked (narrow) layouts, bring the altar into view
      if (window.matchMedia('(max-width: 760px)').matches) {
        document.querySelector('.fusion-workspace-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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
