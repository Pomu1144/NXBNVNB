// js/inventory.js - Item Inventory Management (Unified with Resources)
document.addEventListener('DOMContentLoaded', () => {
  // Wait for Resources to be available
  if (typeof window.Resources === 'undefined') {
    console.error('[Inventory] Resources system not available!');
    return;
  }

  // Awakening tab groups (data/materials.json "kind"), in display order.
  // Core scrolls/beads always show; character-specific beads and special tools
  // only once owned, so the tab isn't 50 empty cards.
  const AWAKENING_GROUPS = [
    { kind: 'scroll', title: 'Awakening Scrolls', always: true },
    { kind: 'beads', title: 'Blazing Awakening Beads', always: true },
    { kind: 'special', title: 'Special Awakening', always: true },
    { kind: 'tool', title: 'Special Awakening Tools', always: false },
    { kind: 'special_beads', title: 'Special Blazing Awakening Beads', always: false },
    { kind: null, title: '★7 Awakening Materials', always: true }
  ];

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Wiki materials have real framed card art; other items use RewardFormat's
  // icon (real portraits/currency art, else an element-tinted emblem) because
  // most assets/items/*.png placeholders were never shipped.
  function iconOf(item) {
    if (item.fullName || !window.RewardFormat) return item.icon;
    return window.RewardFormat.icon(item.id) || item.icon;
  }

  function itemCard(item) {
    const card = document.createElement('div');
    const isMat = !!item.fullName || item.category === 'awakening';
    item = { ...item, icon: iconOf(item) };
    card.className = 'item-card' + (isMat ? ' is-material' : '') + (item.quantity > 0 ? '' : ' is-empty');
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <img src="${esc(item.icon)}" alt="${esc(item.name)}" class="item-icon" loading="lazy" onerror="this.onerror=null; this.style.display='none';">
      <div class="item-name">${esc(item.name)}</div>
      <div class="item-quantity">×${item.quantity}</div>
    `;
    card.addEventListener('click', () => showItemDetails(item));
    return card;
  }

  function groupTitle(text) {
    const h = document.createElement('div');
    h.className = 'items-group-title';
    h.textContent = text;
    return h;
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

    if (category === 'awakening') {
      AWAKENING_GROUPS.forEach(g => {
        const list = items.filter(it => (g.kind ? it.group === g.kind : !it.group))
          .filter(it => g.always || it.quantity > 0);
        if (!list.length) return;
        grid.appendChild(groupTitle(g.title));
        list.forEach(it => grid.appendChild(itemCard(it)));
      });
      return;
    }

    items.forEach(item => grid.appendChild(itemCard(item)));
  }

  // Show item details modal
  function showItemDetails(item) {
    const modal = document.getElementById('item-modal');
    const icon = document.getElementById('modal-item-icon');
    const name = document.getElementById('modal-item-name');
    const description = document.getElementById('modal-item-description');
    const quantityDisplay = document.getElementById('modal-item-quantity');
    const usageNote = document.getElementById('item-usage-note');

    icon.style.display = '';
    icon.src = item.icon;
    icon.onerror = () => { icon.onerror = null; icon.style.display = 'none'; };
    name.textContent = item.fullName || item.name;
    if (item.fullName) {
      // Wiki material: rarity, description and where to get it
      const stars = item.rarity ? `<span class="item-rarity">${'★'.repeat(item.rarity)}</span><br>` : '';
      const obtain = item.obtain ? `<p class="item-obtain"><b>Obtain:</b> ${esc(item.obtain)}</p>` : '';
      description.innerHTML = `${stars}${esc(item.description)}${obtain}`;
    } else {
      description.textContent = item.description;
    }
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

  // Initialize with awakening materials tab (after the material catalog loads)
  renderItems('awakening');
  if (window.Resources.ready) {
    window.Resources.ready.then(() => {
      const activeTab = document.querySelector('.tab-btn.active');
      renderItems(activeTab ? activeTab.dataset.tab : 'awakening');
    });
  }

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
