// js/top-bar.js
// Top Bar HUD - Displays Ninja Rank, EXP, and Currency
// ENHANCED VERSION with EXP System

(function (global) {
  "use strict";

  /**
   * TopBar Module
   * Manages the top bar HUD displaying ninja rank, EXP progress, and currencies
   */
  const TopBar = {
    // DOM elements
    rankValueEl: null,
    rankProgressBar: null,
    rankProgressText: null,
    currencyElements: {},

    /**
     * Initialize the top bar
     */
    async init() {
      console.log("[TopBar] Initializing...");

      // Wait for NinjaRank module to initialize
      if (global.NinjaRank) {
        await global.NinjaRank.init();

        // Set up callbacks for EXP/Rank changes
        global.NinjaRank.onRankUp = (newRank) => this.handleRankUp(newRank);
        global.NinjaRank.onExpGain = (amount, newExp) => this.handleExpGain(amount, newExp);
      }

      // Get DOM elements
      this.rankValueEl = document.getElementById("ninja-rank-value");
      this.rankProgressBar = document.getElementById("rank-progress-fill");
      this.rankProgressText = document.getElementById("rank-progress-text");
      this.currencyElements = {
        ninja_pearls: document.getElementById("currency-ninja-pearls"),
        shinobites: document.getElementById("currency-shinobites"),
        ryo: document.getElementById("currency-ryo")
      };

      // Initial update
      this.update();

      console.log("[TopBar] Initialized ✅");
    },

    /**
     * Update rank display
     */
    updateRank() {
      if (!global.NinjaRank) return;

      const rank = global.NinjaRank.getRank();
      const maxRank = global.NinjaRank.getMaxRank();

      if (this.rankValueEl) {
        this.rankValueEl.textContent = rank;

        // Add max rank indicator
        if (rank >= maxRank) {
          this.rankValueEl.classList.add('max-rank');
        } else {
          this.rankValueEl.classList.remove('max-rank');
        }
      }
    },

    /**
     * Update EXP progress bar
     */
    updateExpProgress() {
      if (!global.NinjaRank) return;

      const progress = global.NinjaRank.getExpProgress();
      const currentExp = global.NinjaRank.getExp();
      const expToNext = global.NinjaRank.getExpToNextRank();
      const isMaxRank = global.NinjaRank.isMaxRank();

      if (this.rankProgressBar) {
        const percentage = Math.round(progress * 100);
        this.rankProgressBar.style.width = `${percentage}%`;

        // Change color when close to rank up
        if (percentage >= 80 && !isMaxRank) {
          this.rankProgressBar.classList.add('near-rankup');
        } else {
          this.rankProgressBar.classList.remove('near-rankup');
        }

        // Max rank styling
        if (isMaxRank) {
          this.rankProgressBar.classList.add('max-rank');
        } else {
          this.rankProgressBar.classList.remove('max-rank');
        }
      }

      if (this.rankProgressText) {
        if (isMaxRank) {
          this.rankProgressText.textContent = 'MAX';
        } else {
          this.rankProgressText.textContent = `${this.formatNumber(expToNext)} to next rank`;
        }
      }
    },

    /**
     * Update currency displays
     */
    updateCurrencies() {
      if (!global.Resources) {
        console.warn("[TopBar] Resources module not loaded yet");
        return;
      }

      // Update each currency
      const currencies = ["ninja_pearls", "shinobites", "ryo"];

      currencies.forEach(currencyId => {
        const element = this.currencyElements[currencyId];
        if (element) {
          const amount = global.Resources.get(currencyId);
          const formattedAmount = this.formatNumber(amount);

          // Animate if value changed
          if (element.textContent !== formattedAmount) {
            element.classList.add("updated");
            setTimeout(() => {
              element.classList.remove("updated");
            }, 300);
          }

          element.textContent = formattedAmount;
        }
      });
    },

    /**
     * Handle rank up event
     */
    handleRankUp(newRank) {
      console.log(`[TopBar] 🎉 RANK UP! New Rank: ${newRank}`);

      // Visual feedback
      if (this.rankValueEl) {
        this.rankValueEl.classList.add('rank-up-animation');
        setTimeout(() => {
          this.rankValueEl.classList.remove('rank-up-animation');
        }, 1000);
      }

      // Show rank up notification
      this.showRankUpNotification(newRank);

      // Update display
      this.update();
    },

    /**
     * Handle EXP gain event
     */
    handleExpGain(amount, newExp) {
      console.log(`[TopBar] +${amount} EXP (Total: ${newExp})`);

      // Show floating +EXP indicator
      this.showExpGainIndicator(amount);

      // Update progress bar
      this.updateExpProgress();
    },

    /**
     * Show rank up notification
     */
    showRankUpNotification(newRank) {
      const notification = document.createElement('div');
      notification.className = 'rank-up-notification';
      notification.innerHTML = `
        <div class="rank-up-content">
          <div class="rank-up-title">🎉 RANK UP!</div>
          <div class="rank-up-rank">Ninja Rank ${newRank}</div>
        </div>
      `;
      document.body.appendChild(notification);

      // Animate in
      requestAnimationFrame(() => {
        notification.classList.add('show');
      });

      // Remove after 3 seconds
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
      }, 3000);
    },

    /**
     * Show floating +EXP indicator
     */
    showExpGainIndicator(amount) {
      if (!this.rankValueEl) return;

      const rect = this.rankValueEl.getBoundingClientRect();
      const indicator = document.createElement('div');
      indicator.className = 'exp-gain-indicator';
      indicator.textContent = `+${amount} EXP`;
      indicator.style.left = `${rect.right + 10}px`;
      indicator.style.top = `${rect.top}px`;

      document.body.appendChild(indicator);

      // Animate and remove
      setTimeout(() => indicator.remove(), 1000);
    },

    /**
     * Format number with commas for thousands
     * @param {number} num - Number to format
     * @returns {string} Formatted string
     */
    formatNumber(num) {
      const n = parseInt(num, 10);
      if (isNaN(n)) return "0";

      // Use K/M notation for large numbers
      if (n >= 1000000) {
        return (n / 1000000).toFixed(1) + "M";
      } else if (n >= 100000) {
        return (n / 1000).toFixed(0) + "K";
      } else if (n >= 10000) {
        return (n / 1000).toFixed(1) + "K";
      }

      // Add commas for thousands
      return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    /**
     * Update entire top bar (rank + exp + currencies)
     */
    update() {
      this.updateRank();
      this.updateExpProgress();
      this.updateCurrencies();
    },

    /**
     * Refresh the top bar (call after currency/exp changes)
     */
    refresh() {
      this.update();
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      TopBar.init();
    });
  } else {
    // DOM already loaded
    TopBar.init();
  }

  // Export to global scope
  global.TopBar = TopBar;

  console.log("[TopBar] Module loaded ✅");

})(window);
