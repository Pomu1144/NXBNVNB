// js/inventory.js - Item Inventory Management (Unified with Resources)
document.addEventListener('DOMContentLoaded', () => {
  // Wait for Resources to be available
  if (typeof window.Resources === 'undefined') {
    console.error('[Inventory] Resources system not available!');
    return;
  }

  // Render items for a specific category
  function renderItems(category) {
    const grid = document.getElementById(`${category}-grid`);
    if (!grid) return;

    const items = window.Resources.getItemsByCategory(category);
    grid.innerHTML = '';

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-text">No items in this category</div>
          <div class="empty-state-subtext">Complete missions to obtain items!</div>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <img src="${item.icon}" alt="${item.name}" class="item-icon" onerror="this.onerror=null; this.style.display='none';">
        <div class="item-name">${item.name}</div>
        <div class="item-quantity">×${item.quantity}</div>
      `;

      card.addEventListener('click', () => showItemDetails(item));
      grid.appendChild(card);
    });
  }

  // Show item details modal
  function showItemDetails(item) {
    const modal = document.getElementById('item-modal');
    const icon = document.getElementById('modal-item-icon');
    const name = document.getElementById('modal-item-name');
    const description = document.getElementById('modal-item-description');
    const quantityDisplay = document.getElementById('modal-item-quantity');
    const usageNote = document.getElementById('item-usage-note');

    icon.src = item.icon;
    icon.onerror = () => { icon.onerror = null; icon.style.display = 'none'; };
    name.textContent = item.name;
    description.textContent = item.description;
    quantityDisplay.textContent = item.quantity;

    // Show usage note based on item category
    if (usageNote) {
      let noteText = '';
      switch(item.category) {
        case 'ramen':
        case 'enhancement':
          noteText = 'Use this item in the Characters page to enhance your characters.';
          break;
        case 'awakening':
          noteText = 'Use this material in the Awakening system to upgrade character tiers.';
          break;
        case 'scrolls':
          if (item.id === 'limit_break_crystal') {
            noteText = 'Use this crystal in the Limit Break system to increase character level caps.';
          } else {
            noteText = 'Use these materials in various character enhancement systems.';
          }
          break;
        default:
          noteText = '';
      }

      if (noteText) {
        usageNote.textContent = noteText;
        usageNote.classList.remove('hidden');
      } else {
        usageNote.classList.add('hidden');
      }
    }

    // Store current item for potential use
    modal.dataset.itemId = item.id;
    modal.dataset.itemCategory = item.category;

    modal.classList.remove('hidden');
  }

  // Close modal
  function closeModal() {
    const modal = document.getElementById('item-modal');
    modal.classList.add('hidden');
  }

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.querySelector('.modal-overlay')?.addEventListener('click', closeModal);

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;

      // Update active states
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));

      button.classList.add('active');
      document.getElementById(`tab-${targetTab}`)?.classList.add('active');

      // Render items for the selected tab
      renderItems(targetTab);
    });
  });

  // Initialize with awakening materials tab
  renderItems('awakening');

  // Public API for adding/removing items (wrapper around Resources)
  window.InventoryManager = {
    addItem: function(itemId, quantity = 1) {
      const result = window.Resources.add(itemId, quantity);

      // Re-render current tab if on inventory page
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab) {
        renderItems(activeTab.dataset.tab);
      }

      return result;
    },

    removeItem: function(itemId, quantity = 1) {
      if (!window.Resources.has(itemId, quantity)) {
        return false; // Not enough items
      }

      window.Resources.subtract(itemId, quantity);

      // Re-render current tab if on inventory page
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab) {
        renderItems(activeTab.dataset.tab);
      }

      return true;
    },

    getItemQuantity: function(itemId) {
      return window.Resources.get(itemId);
    },

    hasItem: function(itemId, quantity = 1) {
      return window.Resources.has(itemId, quantity);
    },

    getAllItems: function() {
      return window.Resources.getAll();
    },

    // Refresh the current view
    refresh: function() {
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab) {
        renderItems(activeTab.dataset.tab);
      }
    }
  };

  // Listen for storage events from other tabs/windows
  window.addEventListener('storage', (e) => {
    if (e.key === 'blazing_resources_v1') {
      window.InventoryManager.refresh();
    }
  });
});
