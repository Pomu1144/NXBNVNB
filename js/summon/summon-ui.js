// js/summon/summon-ui.js - Summon UI Controller

class SummonUIController {
  constructor() {
    this.elements = {
      modal: null,
      resultDisplay: null,
      resultGrid: null,
      continueBtn: null,
      singleBtn: null,
      multiBtn: null,
      singleCost: null,
      multiCost: null,
      playerPearls: null,
      playerCoins: null,
      bannerName: null,
      bannerDescription: null,
      bannerTimer: null,
      stepProgress: null,
      stepCurrent: null,
      stepTotal: null
    };

    this.currentBanner = null;
    this.costs = {
      single: 5,
      multi: 30
    };
  }

  init() {
    // Cache DOM elements
    this.elements.modal = document.getElementById('summon-modal');
    this.elements.resultDisplay = document.getElementById('result-display');
    this.elements.resultGrid = document.getElementById('result-grid');
    this.elements.continueBtn = document.getElementById('btn-continue');
    this.elements.singleBtn = document.getElementById('btn-single');
    this.elements.multiBtn = document.getElementById('btn-multi');
    this.elements.singleCost = document.getElementById('single-cost');
    this.elements.multiCost = document.getElementById('multi-cost');
    // Use the correct element IDs that exist in summon.html
    this.elements.playerPearls = document.getElementById('currency-ninja-pearls');
    this.elements.playerCoins = document.getElementById('currency-ryo');
    this.elements.bannerName = document.getElementById('banner-name');
    this.elements.bannerDescription = document.getElementById('banner-description');
    this.elements.bannerTimer = document.getElementById('banner-timer');
    this.elements.stepProgress = document.getElementById('step-progress');
    this.elements.stepCurrent = document.getElementById('step-current');
    this.elements.stepTotal = document.getElementById('step-total');

    this.setupEventListeners();
    this.updateCurrencyDisplay();
    console.log('✅ Summon UI Controller initialized');
  }

  setupEventListeners() {
    // Summon buttons
    this.elements.singleBtn?.addEventListener('click', () => this.handleSingleSummon());
    this.elements.multiBtn?.addEventListener('click', () => this.handleMultiSummon());
    this.elements.continueBtn?.addEventListener('click', () => this.hideResults());

    // Modal overlay click to close
    this.elements.modal?.querySelector('.modal-overlay')?.addEventListener('click', () => this.hideResults());

    // Refresh currency display every 2 seconds to catch changes from other pages
    setInterval(() => this.updateCurrencyDisplay(), 2000);
  }

  updateCurrencyDisplay() {
    const pearls = window.Resources?.get('ninja_pearls') || 0;
    const ryo = window.Resources?.get('ryo') || 0;

    if (this.elements.playerPearls) {
      this.elements.playerPearls.textContent = pearls.toLocaleString();
    }
    if (this.elements.playerCoins) {
      this.elements.playerCoins.textContent = ryo.toLocaleString();
    }

    // Update button states
    this.updateButtonStates(pearls);
  }

  updateButtonStates(pearls) {
    if (this.elements.singleBtn) {
      if (pearls >= this.costs.single) {
        this.elements.singleBtn.disabled = false;
        this.elements.singleBtn.classList.remove('disabled');
      } else {
        this.elements.singleBtn.disabled = true;
        this.elements.singleBtn.classList.add('disabled');
      }
    }

    if (this.elements.multiBtn) {
      if (pearls >= this.costs.multi) {
        this.elements.multiBtn.disabled = false;
        this.elements.multiBtn.classList.remove('disabled');
      } else {
        this.elements.multiBtn.disabled = true;
        this.elements.multiBtn.classList.add('disabled');
      }
    }
  }

  updateBannerInfo(banner) {
    this.currentBanner = banner;

    if (this.elements.bannerName) {
      this.elements.bannerName.textContent = banner.name || 'Banner';
    }

    if (this.elements.bannerDescription) {
      this.elements.bannerDescription.textContent = banner.description || '';
    }

    // Update step progress if it's a step-up banner
    if (banner.type === 'step-up') {
      this.showStepProgress(true);
      this.updateStepProgress();
    } else {
      this.showStepProgress(false);
    }

    // Update costs if banner has custom costs
    if (banner.costs) {
      this.costs.single = banner.costs.single || 5;
      this.costs.multi = banner.costs.multi || 30;

      if (this.elements.singleCost) {
        this.elements.singleCost.textContent = this.costs.single;
      }
      if (this.elements.multiCost) {
        this.elements.multiCost.textContent = this.costs.multi;
      }
    }

    this.updateCurrencyDisplay();
  }

  showStepProgress(show) {
    if (this.elements.stepProgress) {
      if (show) {
        this.elements.stepProgress.classList.remove('hidden');
      } else {
        this.elements.stepProgress.classList.add('hidden');
      }
    }
  }

  updateStepProgress() {
    const stats = window.FibonacciSummonEngine?.getStats();
    if (!stats) return;

    if (this.elements.stepCurrent) {
      this.elements.stepCurrent.textContent = stats.currentMultiStep + 1;
    }

    if (this.elements.stepTotal) {
      this.elements.stepTotal.textContent = 8; // Max steps in Fibonacci sequence
    }
  }

  async handleSingleSummon() {
    const pearls = window.Resources?.get('ninja_pearls') || 0;

    if (pearls < this.costs.single) {
      alert('Not enough Ninja Pearls!');
      return;
    }

    // Deduct cost
    window.Resources?.subtract('ninja_pearls', this.costs.single);

    // Perform summon
    const result = window.FibonacciSummonEngine?.performSingleSummon();
    if (!result) return;

    // Select character
    const characterData = window.CharacterSelector?.selectCharacter(result);
    if (!characterData) return;

    // Add to inventory
    window.InventoryChar?.addCopy(characterData.id, 1);

    // Show animation and results
    await window.SummonAnimator?.playSummonAnimation('single');
    this.displayResults([{ character: characterData, summonData: result }]);

    // Update UI
    this.updateCurrencyDisplay();
    this.updateStepProgress();
  }

  async handleMultiSummon() {
    const pearls = window.Resources?.get('ninja_pearls') || 0;

    if (pearls < this.costs.multi) {
      alert('Not enough Ninja Pearls!');
      return;
    }

    // Deduct cost
    window.Resources?.subtract('ninja_pearls', this.costs.multi);

    // Perform multi summon
    const results = window.FibonacciSummonEngine?.performMultiSummon();
    if (!results) return;

    // Select characters
    const characters = window.CharacterSelector?.selectCharacters(results);

    // Add to inventory
    characters.forEach(({character}) => {
      if (character) {
        window.InventoryChar?.addCopy(character.id, 1);
      }
    });

    // Show animation and results
    await window.SummonAnimator?.playSummonAnimation('multi');
    this.displayResults(characters);

    // Update UI
    this.updateCurrencyDisplay();
    this.updateStepProgress();

    // Log stats for debugging
    console.log('Multi Summon Stats:', window.FibonacciSummonEngine?.getRatesDisplay());
  }

  displayResults(results) {
    if (!this.elements.resultGrid) return;

    // Clear previous results
    this.elements.resultGrid.innerHTML = '';

    // Calculate statistics
    const stats = this.calculateResultStats(results);

    // Display statistics
    this.displayResultStats(stats);

    // Set grid class for single vs multi
    if (results.length === 1) {
      this.elements.resultGrid.classList.add('single');
    } else {
      this.elements.resultGrid.classList.remove('single');
    }

    // Create result cards
    results.forEach(({character, summonData}) => {
      if (!character) return;

      const card = document.createElement('div');
      card.className = `result-card rarity-${summonData.rarity}`;

      if (summonData.isFeatured) {
        card.classList.add('featured');
      }

      card.innerHTML = `
        <div class="result-card-inner">
          <img src="${character.portrait || character.full}" alt="${character.name}"
               onerror="this.src='assets/characters/common/silhouette.png'">
          <div class="result-card-info">
            <div class="result-card-name">${character.name}</div>
            <div class="result-card-rarity">${'★'.repeat(character.rarity || 4)}</div>
            ${summonData.isFeatured ? '<div class="result-card-featured">FEATURED</div>' : ''}
          </div>
        </div>
      `;

      this.elements.resultGrid.appendChild(card);
    });

    // Show results
    this.showResults();
  }

  calculateResultStats(results) {
    const stats = {
      total: results.length,
      bronze: 0,
      silver: 0,
      gold: 0,
      featured: 0
    };

    results.forEach(({summonData}) => {
      if (summonData.rarity === 'bronze') stats.bronze++;
      else if (summonData.rarity === 'silver') stats.silver++;
      else if (summonData.rarity === 'gold') {
        stats.gold++;
        if (summonData.isFeatured) stats.featured++;
      }
    });

    return stats;
  }

  displayResultStats(stats) {
    const statsContainer = document.getElementById('result-stats');
    if (!statsContainer) return;

    statsContainer.innerHTML = `
      <div class="result-stat">
        <div class="result-stat-label">Total Pulls</div>
        <div class="result-stat-value">${stats.total}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">Gold Units</div>
        <div class="result-stat-value">${stats.gold}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">Featured</div>
        <div class="result-stat-value">${stats.featured}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">Gold Rate</div>
        <div class="result-stat-value">${((stats.gold / stats.total) * 100).toFixed(1)}%</div>
      </div>
    `;
  }

  showResults() {
    if (this.elements.modal) {
      this.elements.modal.classList.remove('hidden');
    }

    if (this.elements.resultDisplay) {
      this.elements.resultDisplay.classList.remove('hidden');
    }
  }

  hideResults() {
    if (this.elements.modal) {
      this.elements.modal.classList.add('hidden');
    }

    if (this.elements.resultDisplay) {
      this.elements.resultDisplay.classList.add('hidden');
    }

    if (this.elements.resultGrid) {
      this.elements.resultGrid.innerHTML = '';
    }
  }

  showRatesInfo() {
    const rates = window.FibonacciSummonEngine?.getRatesDisplay();
    if (!rates) return;

    const message = `
Current Summon Rates:
━━━━━━━━━━━━━━━━━━━
Multi Step: ${rates.multiStep}
Gold Chance: ${rates.goldChance}
Featured Chance: ${rates.featuredChance}

Session Stats:
Total Golds: ${rates.totalGolds}
Featured Golds: ${rates.featuredGolds}
    `;

    alert(message);
  }
}

// Global instance
window.SummonUI = new SummonUIController();

console.log('✅ Summon UI Controller loaded');
