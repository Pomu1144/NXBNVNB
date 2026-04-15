// js/top-bar.js
// Top Bar HUD - Displays Ninja Rank and Currency

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_player_rank";

  /**
   * TopBar Module
   * Manages the top bar HUD displaying ninja rank and currencies
   */
  const TopBar = {
    // DOM elements
    rankValueEl: null,
    currencyElements: {},

    // Player rank (stored separately from resources)
    playerRank: 1,

    /**
     * Initialize the top bar
     */
    init() {
      console.log("[TopBar] Initializing...");

      // Get DOM elements
      this.rankValueEl = document.getElementById("ninja-rank-value");
      this.currencyElements = {
        ninja_pearls: document.getElementById("currency-ninja-pearls"),
        shinobites: document.getElementById("currency-shinobites"),
        ryo: document.getElementById("currency-ryo")
      };

      // Load player rank from storage
      this.loadPlayerRank();

      // Initial update
      this.update();

      console.log("[TopBar] Initialized ✅");
    },

    /**
     * Load player rank from localStorage
     */
    loadPlayerRank() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          this.playerRank = Math.max(1, parseInt(stored, 10));
        } else {
          this.playerRank = 1;
          this.savePlayerRank();
        }
      } catch (err) {
        console.error("[TopBar] Failed to load player rank:", err);
        this.playerRank = 1;
      }
    },

    /**
     * Save player rank to localStorage
     */
    savePlayerRank() {
      try {
        localStorage.setItem(STORAGE_KEY, this.playerRank.toString());
      } catch (err) {
        console.error("[TopBar] Failed to save player rank:", err);
      }
    },

    /**
     * Set player rank
     * @param {number} rank - New rank value
     */
    setRank(rank) {
      this.playerRank = Math.max(1, Math.min(999, parseInt(rank, 10)));
      this.savePlayerRank();
      this.updateRank();
    },

    /**
     * Add experience/rank (for future leveling system)
     * @param {number} amount - Amount to add
     */
    addRank(amount) {
      this.playerRank = Math.min(999, this.playerRank + Math.max(0, parseInt(amount, 10)));
      this.savePlayerRank();
      this.updateRank();
    },

    /**
     * Get current player rank
     * @returns {number} Current rank
     */
    getRank() {
      return this.playerRank;
    },

    /**
     * Update rank display
     */
    updateRank() {
      if (this.rankValueEl) {
        this.rankValueEl.textContent = this.playerRank;
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
     * Update entire top bar (rank + currencies)
     */
    update() {
      this.updateRank();
      this.updateCurrencies();
    },

    /**
     * Refresh the top bar (call after currency changes)
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
