// Shop System - Handles purchasing items and resources
(() => {
  "use strict";

  const Shop = {
    shopData: null,
    currentItem: null,
    currentQuantity: 1,

    async init() {
      console.log("[Shop] Initializing shop system...");

      // Load shop data
      await this.loadShopData();

      // Setup event listeners
      this.setupEventListeners();

      // Render initial tab (deep link: shop.html?tab=recipes)
      const startTab = new URLSearchParams(location.search).get('tab');
      if (startTab && this.shopData[startTab]) this.switchTab(startTab);
      else this.renderTab('ramen');

      // Recipe ownership / fragments can change from other pages or tabs
      const refreshRecipes = () => { if (document.getElementById('tab-recipes')?.classList.contains('active')) this.renderTab('recipes'); };
      window.addEventListener('recipebook:change', refreshRecipes);
      window.addEventListener('storage', (e) => { if (e.key === window.RecipeBook?.STORAGE_KEY) refreshRecipes(); });

      // Update resource display
      this.updateResourceDisplay();

      console.log("[Shop] ✅ Shop initialized");
    },

    async loadShopData() {
      try {
        const response = await fetch('data/shop.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();

        // Validate data structure
        if (!data || typeof data !== 'object' || !data.shop) {
          throw new Error('Invalid shop data structure');
        }

        this.shopData = data.shop;
        console.log("[Shop] Shop data loaded:", this.shopData);
      } catch (error) {
        console.error("[Shop] Failed to load shop data:", error);
        this.shopData = { ramen: [], materials: [], resources: [] };
      }
    },

    updateResourceDisplay() {
      // Use unified Resources system
      if (window.Resources) {
        const ninjaPearlsEl = document.getElementById('currency-ninja-pearls');
        const shinobitesEl = document.getElementById('currency-shinobites');
        const ryoEl = document.getElementById('currency-ryo');
        const grannyCoinsEl = document.getElementById('currency-granny-coins');

        if (ninjaPearlsEl) ninjaPearlsEl.textContent = window.Resources.get('ninja_pearls').toLocaleString();
        if (shinobitesEl) shinobitesEl.textContent = window.Resources.get('shinobites').toLocaleString();
        if (ryoEl) ryoEl.textContent = window.Resources.get('ryo').toLocaleString();
        if (grannyCoinsEl) grannyCoinsEl.textContent = window.Resources.get('granny_coin').toLocaleString();
      }
    },

    setupEventListeners() {
      // Tab switching
      document.querySelectorAll('.shop-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          const tabName = e.target.dataset.tab;
          this.switchTab(tabName);
        });
      });

      // Purchase modal controls
      const qtyMinus = document.getElementById('qty-minus');
      const qtyPlus = document.getElementById('qty-plus');
      const qtyInput = document.getElementById('qty-input');

      if (qtyMinus) {
        qtyMinus.addEventListener('click', () => {
          const current = parseInt(qtyInput.value) || 1;
          if (current > 1) {
            qtyInput.value = current - 1;
            this.updatePurchaseCost();
          }
        });
      }

      if (qtyPlus) {
        qtyPlus.addEventListener('click', () => {
          const current = parseInt(qtyInput.value) || 1;
          if (current < 99) {
            qtyInput.value = current + 1;
            this.updatePurchaseCost();
          }
        });
      }

      if (qtyInput) {
        qtyInput.addEventListener('change', () => {
          let value = parseInt(qtyInput.value) || 1;
          value = Math.max(1, Math.min(99, value));
          qtyInput.value = value;
          this.updatePurchaseCost();
        });
      }

      // Confirm purchase
      const btnConfirm = document.getElementById('btn-confirm-purchase');
      if (btnConfirm) {
        btnConfirm.addEventListener('click', () => this.confirmPurchase());
      }

      // Cancel purchase
      const btnCancel = document.getElementById('btn-cancel-purchase');
      if (btnCancel) {
        btnCancel.addEventListener('click', () => this.closeModal('purchase-modal'));
      }

      // Close success modal
      const btnCloseSuccess = document.getElementById('btn-close-success');
      if (btnCloseSuccess) {
        btnCloseSuccess.addEventListener('click', () => this.closeModal('success-modal'));
      }

      // Bottom bar navigation is now handled by navigation.js
    },

    switchTab(tabName) {
      // Update tab buttons
      document.querySelectorAll('.shop-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });

      // Update tab content
      document.querySelectorAll('.shop-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
      });

      // Render tab content
      this.renderTab(tabName);
    },

    renderTab(tabName) {
      const items = this.shopData[tabName] || [];
      const gridId = `${tabName}-grid`;
      const grid = document.getElementById(gridId);

      if (!grid) return;

      grid.innerHTML = '';

      items.forEach(item => {
        const card = this.createItemCard(item, tabName);
        grid.appendChild(card);
      });

      if (tabName === 'recipes') this.updateRecipeStatus();
    },

    // ---------------- Recipe scrolls (js/recipe-book.js) ----------------
    updateRecipeStatus() {
      const book = window.RecipeBook;
      if (!book) return;
      const owned = document.getElementById('rc-shop-owned');
      const frags = document.getElementById('rc-shop-fragments');
      book.loadData().then(d => { if (owned) owned.textContent = `${book.count()} / ${d.fusions.length}`; });
      if (frags) frags.textContent = book.fragments();
    },

    // Sealed scroll: same grade rates as Summon › Recipes (all recipes, no rate-up)
    async buyRandomRecipe(item) {
      const book = window.RecipeBook;
      const cost = item.cost.ninja_pearls || item.cost.pearls || 0;
      if (!book || !window.Resources) return;
      if (window.Resources.get('ninja_pearls') < cost) {
        alert(`Insufficient Ninja Pearls! You need ${cost} but only have ${window.Resources.get('ninja_pearls')}.`);
        return;
      }
      const data = await book.loadData();
      const [fusion] = book.roll(data.fusions, [], 1);
      if (!fusion) return;
      window.Resources.subtract('ninja_pearls', cost);
      const res = book.grant(fusion.id, 'shop');
      this.updateResourceDisplay();
      this.renderTab('recipes');
      window.RecipeScroll?.reveal([{ fusion, isNew: res.isNew }], data);
    },

    // Chosen recipe: picker of recipes the player doesn't own, paid with fragments
    async openRecipePicker(item) {
      const book = window.RecipeBook;
      if (!book || !window.RecipeScroll) return;
      const data = await book.loadData();
      const price = item.cost.recipe_fragments || book.FRAGMENTS_PER_CHOICE;
      const unowned = data.fusions.filter(f => !book.has(f.id));
      document.getElementById('rc-picker')?.remove();
      const ov = document.createElement('div');
      ov.id = 'rc-picker';
      ov.className = 'rc-picker';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      const have = book.fragments();
      ov.innerHTML = `
        <div class="rc-picker-panel">
          <header class="rc-picker-head">
            <h2>Choose a Recipe</h2>
            <span class="rc-picker-bal">Fragments <b>${have}</b> / ${price}</span>
            <button class="rc-picker-close" type="button" aria-label="Close">✕</button>
          </header>
          ${have < price ? `<p class="rc-picker-note">You need ${price} Recipe Fragments — duplicate scrolls from Summon › Recipes give 1 each.</p>` : ''}
          <div class="rc-picker-grid">
            ${unowned.length ? unowned.map(f => window.RecipeScroll.html(f, data, { button: true })).join('') : '<p class="rc-picker-note">You own every recipe.</p>'}
          </div>
        </div>`;
      document.body.appendChild(ov);
      const close = () => ov.remove();
      ov.querySelector('.rc-picker-close').addEventListener('click', close);
      ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
      ov.querySelectorAll('.rscroll').forEach(card => {
        const pick = () => {
          const fusion = data.fusions.find(f => f.id === card.dataset.fusionId);
          if (!fusion) return;
          if (book.fragments() < price) { alert(`Not enough Recipe Fragments (${book.fragments()} / ${price}).`); return; }
          if (!confirm(`Trade ${price} Recipe Fragments for "${fusion.name}"?`)) return;
          if (!book.spendFragments(price)) return;
          const res = book.grant(fusion.id, 'shop-choice');
          close();
          this.renderTab('recipes');
          window.RecipeScroll.reveal([{ fusion, isNew: res.isNew }], data);
        };
        card.addEventListener('click', pick);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      });
    },

    createItemCard(item, category) {
      const card = document.createElement('div');
      card.className = 'shop-item';

      // Determine cost display
      let costHTML = '';
      if (item.cost) {
        if (item.cost.ryo) {
          costHTML = `
            <div class="item-cost">
              <img src="assets/icons/currency/ryo.png" alt="Ryo" class="cost-icon" onerror="this.style.display='none'">
              <span>${item.cost.ryo.toLocaleString()}</span>
            </div>
          `;
        } else if (item.cost.ninja_pearls || item.cost.pearls) {
          const cost = item.cost.ninja_pearls || item.cost.pearls;
          costHTML = `
            <div class="item-cost">
              <img src="assets/icons/currency/ninjapearl.png" alt="Ninja Pearls" class="cost-icon" onerror="this.style.display='none'">
              <span>${cost.toLocaleString()}</span>
            </div>
          `;
        } else if (item.cost.shinobites) {
          costHTML = `
            <div class="item-cost">
              <img src="assets/icons/currency/shinobite.png" alt="Shinobites" class="cost-icon" onerror="this.style.display='none'">
              <span>${item.cost.shinobites.toLocaleString()}</span>
            </div>
          `;
        } else if (item.cost.granny_coin) {
          costHTML = `
            <div class="item-cost">
              <span class="cost-icon granny-coin-icon" role="img" aria-label="Granny Coins"></span>
              <span>${item.cost.granny_coin.toLocaleString()}</span>
            </div>
          `;
        } else if (item.cost.recipe_fragments) {
          costHTML = `
            <div class="item-cost">
              <img src="assets/ui/recipes/scroll_closed.webp" alt="Recipe Fragments" class="cost-icon">
              <span>${item.cost.recipe_fragments} Fragments</span>
            </div>
          `;
        }
      }

      // Build tier badge if the item declares one or its name encodes a star tier
      let tier = item.tier;
      if (!tier) {
        const m = String(item.name).match(/(\d)\s*★|★\s*(\d)/);
        if (m) tier = `${m[1] || m[2]}★`;
      }
      const tierHTML = tier ? `<span class="item-tier">${tier}</span>` : '';

      // Build exp display if exists
      const expInfo = item.exp ? ` (+${item.exp.toLocaleString()} EXP)` : '';

      card.innerHTML = `
        <div class="si-inner">
          <div class="item-name">${tierHTML}<span class="item-name-text">${item.name}</span></div>
          <div class="si-body">
            <div class="item-icon">
              <img src="${item.icon}" alt="${item.name}" onerror="this.src='assets/characters/common/silhouette.png'">
            </div>
            <div class="item-description">${item.description}${expInfo}</div>
          </div>
          <div class="item-footer">
            ${costHTML}
            <button class="btn-buy">Buy</button>
          </div>
        </div>
      `;

      // Add click handler to buy button
      const buyBtn = card.querySelector('.btn-buy');
      if (item.recipe) card.classList.add('is-recipe');
      buyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.recipe === 'choice') this.openRecipePicker(item);
        else this.openPurchaseModal(item, category);
      });

      return card;
    },

    openPurchaseModal(item, category) {
      this.currentItem = { ...item, category };
      this.currentQuantity = 1;

      // Populate modal
      const modal = document.getElementById('purchase-modal');
      const icon = document.getElementById('purchase-item-icon');
      const name = document.getElementById('purchase-item-name');
      const desc = document.getElementById('purchase-item-desc');
      const qtyInput = document.getElementById('qty-input');

      if (icon) icon.src = item.icon;
      if (name) name.textContent = item.name;
      if (desc) desc.textContent = item.description;
      if (qtyInput) qtyInput.value = 1;
      // Recipe scrolls are unsealed one at a time
      const qtyRow = document.querySelector('#purchase-modal .quantity-selector');
      if (qtyRow) qtyRow.style.display = item.recipe ? 'none' : '';

      this.updatePurchaseCost();

      // Show modal
      modal.classList.remove('hidden');
    },

    updatePurchaseCost() {
      const qtyInput = document.getElementById('qty-input');
      const quantity = parseInt(qtyInput?.value) || 1;
      const costEl = document.getElementById('purchase-total-cost');

      if (!this.currentItem || !costEl) return;

      const item = this.currentItem;
      let costHTML = '';

      if (item.cost.ryo) {
        const total = item.cost.ryo * quantity;
        costHTML = `<span style="display: flex; align-items: center; gap: 8px;">
          <img src="assets/icons/currency/ryo.png" alt="Ryo" style="width: 20px; height: 20px;" onerror="this.style.display='none'">
          ${total.toLocaleString()}
        </span>`;
      } else if (item.cost.ninja_pearls || item.cost.pearls) {
        const cost = item.cost.ninja_pearls || item.cost.pearls;
        const total = cost * quantity;
        costHTML = `<span style="display: flex; align-items: center; gap: 8px;">
          <img src="assets/icons/currency/ninjapearl.png" alt="Ninja Pearls" style="width: 20px; height: 20px;" onerror="this.style.display='none'">
          ${total.toLocaleString()}
        </span>`;
      } else if (item.cost.shinobites) {
        const total = item.cost.shinobites * quantity;
        costHTML = `<span style="display: flex; align-items: center; gap: 8px;">
          <img src="assets/icons/currency/shinobite.png" alt="Shinobites" style="width: 20px; height: 20px;" onerror="this.style.display='none'">
          ${total.toLocaleString()}
        </span>`;
      } else if (item.cost.granny_coin) {
        const total = item.cost.granny_coin * quantity;
        costHTML = `<span style="display: flex; align-items: center; gap: 8px;">
          <span class="granny-coin-icon" role="img" aria-label="Granny Coins" style="width: 20px; height: 20px;"></span>
          ${total.toLocaleString()}
        </span>`;
      }

      costEl.innerHTML = costHTML;
    },

    confirmPurchase() {
      const qtyInput = document.getElementById('qty-input');
      const quantity = parseInt(qtyInput?.value) || 1;
      const item = this.currentItem;

      if (!item || !window.Resources) return;

      if (item.recipe === 'random') {
        this.closeModal('purchase-modal');
        this.buyRandomRecipe(item);
        return;
      }

      // Calculate total cost and determine currency type
      let totalCost = 0;
      let costType = '';
      let costLabel = '';

      if (item.cost.ryo) {
        totalCost = item.cost.ryo * quantity;
        costType = 'ryo';
        costLabel = 'Ryo';
      } else if (item.cost.ninja_pearls) {
        totalCost = item.cost.ninja_pearls * quantity;
        costType = 'ninja_pearls';
        costLabel = 'Ninja Pearls';
      } else if (item.cost.pearls) {
        // Legacy support for old 'pearls' key
        totalCost = item.cost.pearls * quantity;
        costType = 'ninja_pearls';
        costLabel = 'Ninja Pearls';
      } else if (item.cost.shinobites) {
        totalCost = item.cost.shinobites * quantity;
        costType = 'shinobites';
        costLabel = 'Shinobites';
      } else if (item.cost.granny_coin) {
        totalCost = item.cost.granny_coin * quantity;
        costType = 'granny_coin';
        costLabel = 'Granny Coins';
      }

      // Check if player has enough resources using Resources API
      const currentAmount = window.Resources.get(costType);
      if (currentAmount < totalCost) {
        alert(`Insufficient ${costLabel}! You need ${totalCost.toLocaleString()} but only have ${currentAmount.toLocaleString()}.`);
        return;
      }

      // Deduct cost using Resources API
      window.Resources.subtract(costType, totalCost);
      this.updateResourceDisplay();

      // Add items to inventory
      this.addItemsToInventory(item, quantity);

      // Close purchase modal
      this.closeModal('purchase-modal');

      // Show success modal
      this.showSuccessModal(item, quantity);

      console.log(`[Shop] Purchased ${quantity}x ${item.name} for ${totalCost} ${costLabel}`);
    },

    addItemsToInventory(item, quantity) {
      // Use unified Resources system instead of separate shop inventory
      if (window.Resources) {
        // Handle special items that add resources directly (like ryo pouches)
        if (item.value) {
          // This is a resource package (e.g., ryo_small gives ryo)
          for (const [resourceId, amount] of Object.entries(item.value)) {
            window.Resources.add(resourceId, amount * quantity);
            console.log(`[Shop] Added ${amount * quantity} ${resourceId} to resources`);
          }
        } else {
          // This is a regular item (ramen, scrolls, etc.)
          window.Resources.add(item.id, quantity);
          console.log(`[Shop] Added ${quantity}x ${item.name} to inventory`);
        }

        // Refresh inventory UI if it's available
        if (window.InventoryManager && typeof window.InventoryManager.refresh === 'function') {
          window.InventoryManager.refresh();
        }
      } else {
        console.error('[Shop] Resources system not available!');
      }
    },

    showSuccessModal(item, quantity) {
      const modal = document.getElementById('success-modal');
      const message = document.getElementById('success-message');

      if (message) {
        let itemInfo = `${quantity}x ${item.name}`;
        if (item.exp) {
          itemInfo += ` (Total: ${(item.exp * quantity).toLocaleString()} EXP)`;
        }
        message.innerHTML = `You successfully purchased:<br><strong style="color: #ffd700;">${itemInfo}</strong>`;
      }

      modal.classList.remove('hidden');
    },

    closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add('hidden');
      }
    }
  };

  // Initialize shop when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Shop.init());
  } else {
    Shop.init();
  }

  // Export for external access
  window.Shop = Shop;
})();
