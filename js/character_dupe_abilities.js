// js/character_dupe_abilities.js - Character Dupe-Based Abilities System
// Displays character abilities that unlock when feeding duplicates
// Each dupe fed unlocks one ability slot

class CharacterDupeAbilitiesSystem {
  constructor() {
    this.currentCharacter = null;
    this.currentInstance = null;
    this.abilitiesContainer = null;
    console.log('✅ Character Dupe Abilities System initialized');
    this.init();
  }

  init() {
    this.waitForModal();
  }

  waitForModal() {
    const checkModal = setInterval(() => {
      const modal = document.getElementById('char-modal');
      if (modal) {
        clearInterval(checkModal);
        this.setupModalObserver();
      }
    }, 100);
  }

  setupModalObserver() {
    const modal = document.getElementById('char-modal');
    const observer = new MutationObserver(() => {
      if (!modal.classList.contains('hidden')) {
        setTimeout(() => this.renderAbilities(), 100);
      }
    });

    observer.observe(modal, {
      attributes: true,
      attributeFilter: ['class']
    });

    console.log('✅ Dupe Abilities modal observer active');
  }

  renderAbilities() {
    console.log('🎨 Rendering dupe abilities...');

    // Get the currently displayed character
    const uid = this.getCurrentCharacterUID();
    if (!uid) {
      console.log('⚠️ No character UID found');
      return;
    }

    // Get character instance and base data
    const instance = this.getCharacterInstance(uid);
    if (!instance) {
      console.log('⚠️ No character instance found');
      return;
    }

    const baseChar = this.getBaseCharacterData(instance.charId);
    if (!baseChar) {
      console.log('⚠️ No base character data found');
      return;
    }

    this.currentInstance = instance;
    this.currentCharacter = baseChar;

    // Get abilities from base character data
    const abilities = baseChar.abilities || [];
    if (abilities.length === 0) {
      console.log('⚠️ No abilities defined for this character');
      this.removeAbilitiesContainer();
      return;
    }

    // Get unlocked abilities count (based on dupes fed)
    const unlockedCount = this.getUnlockedAbilitiesCount(instance);

    // Render the abilities list
    this.createAbilitiesContainer();
    this.populateAbilities(abilities, unlockedCount);
    console.log(`✅ Rendered ${abilities.length} abilities (${unlockedCount} unlocked)`);
  }

  getCurrentCharacterUID() {
    // Try to get UID from modal dataset
    const modal = document.getElementById('char-modal');
    let uid = modal?.dataset?.currentUid;

    if (uid) return uid;

    // Fallback: get from selected card
    const selected = document.querySelector('.char-card.selected');
    uid = selected?.dataset?.uid;

    return uid || null;
  }

  getCharacterInstance(uid) {
    if (!window.InventoryChar) {
      console.error('❌ InventoryChar not found');
      return null;
    }

    return window.InventoryChar.getByUid(uid);
  }

  getBaseCharacterData(charId) {
    // Try to get from CharacterInventory first
    if (window.CharacterInventory?.getCharacterById) {
      return window.CharacterInventory.getCharacterById(charId);
    }

    // Fallback: try global characters data
    if (window.CHARACTERS_DATA) {
      return window.CHARACTERS_DATA.find(c => c.id === charId);
    }

    return null;
  }

  getUnlockedAbilitiesCount(instance) {
    // Each character starts with 0 abilities unlocked
    // Each dupe fed unlocks 1 ability
    // Track using dupeUnlocks field
    return instance.dupeUnlocks || 0;
  }

  createAbilitiesContainer() {
    // Remove existing container if present
    this.removeAbilitiesContainer();

    // Find the abilities tab wrapper
    const abilitiesWrap = document.getElementById('char-abilities');
    if (!abilitiesWrap) {
      console.error('❌ Abilities tab wrapper not found');
      return;
    }

    // Create abilities container - positioned in the ABILITIES TAB
    this.abilitiesContainer = document.createElement('div');
    this.abilitiesContainer.id = 'char-dupe-abilities';
    this.abilitiesContainer.className = 'dupe-abilities-tab';

    // Clear and append to abilities tab
    abilitiesWrap.innerHTML = '';
    abilitiesWrap.appendChild(this.abilitiesContainer);
  }

  populateAbilities(abilities, unlockedCount) {
    if (!this.abilitiesContainer) return;

    // Clear existing abilities
    this.abilitiesContainer.innerHTML = '';

    // Create header
    const header = document.createElement('div');
    header.className = 'abilities-header';
    header.innerHTML = `
      <div class="abilities-title">Character Abilities</div>
      <div class="abilities-unlock-count">${unlockedCount}/${abilities.length} Unlocked</div>
    `;
    this.abilitiesContainer.appendChild(header);

    // Create abilities list
    const abilityList = document.createElement('div');
    abilityList.className = 'abilities-list';

    abilities.forEach((ability, index) => {
      const isUnlocked = index < unlockedCount;
      const abilityElement = this.createAbilityElement(ability, index, isUnlocked);
      abilityList.appendChild(abilityElement);
    });

    this.abilitiesContainer.appendChild(abilityList);

    // Add unlock instructions if not all unlocked
    if (unlockedCount < abilities.length) {
      const instructions = document.createElement('div');
      instructions.className = 'abilities-unlock-hint';
      instructions.innerHTML = `
        <div class="unlock-hint-icon">🔒</div>
        <div class="unlock-hint-text">Feed duplicates to unlock more abilities</div>
      `;
      this.abilitiesContainer.appendChild(instructions);
    }

    console.log(`✅ Added ${abilities.length} abilities to container`);
  }

  createAbilityElement(ability, index, isUnlocked) {
    const abilityDiv = document.createElement('div');
    abilityDiv.className = `ability-item ${isUnlocked ? 'unlocked' : 'locked'}`;
    abilityDiv.dataset.abilityIndex = index;

    // Ability number badge
    const badge = document.createElement('div');
    badge.className = 'ability-badge';
    badge.textContent = index + 1;
    abilityDiv.appendChild(badge);

    // Ability content
    const content = document.createElement('div');
    content.className = 'ability-content';

    if (isUnlocked) {
      // Show full ability details
      const name = document.createElement('div');
      name.className = 'ability-name';
      name.textContent = ability.name;
      content.appendChild(name);

      const description = document.createElement('div');
      description.className = 'ability-description';
      description.textContent = ability.description;
      content.appendChild(description);

      // Add unlock status indicator
      const statusIndicator = document.createElement('div');
      statusIndicator.className = 'ability-status unlocked';
      statusIndicator.innerHTML = '<span class="status-icon">★</span>';
      abilityDiv.appendChild(statusIndicator);
    } else {
      // Show locked state
      const locked = document.createElement('div');
      locked.className = 'ability-locked-text';
      locked.innerHTML = `
        <div class="locked-icon">🔒</div>
        <div class="locked-label">Locked</div>
      `;
      content.appendChild(locked);

      // Add unlock status indicator
      const statusIndicator = document.createElement('div');
      statusIndicator.className = 'ability-status locked';
      statusIndicator.innerHTML = '<span class="status-icon">🔒</span>';
      abilityDiv.appendChild(statusIndicator);
    }

    abilityDiv.appendChild(content);

    return abilityDiv;
  }

  removeAbilitiesContainer() {
    if (this.abilitiesContainer) {
      this.abilitiesContainer.remove();
      this.abilitiesContainer = null;
    } else {
      const existing = document.getElementById('char-dupe-abilities');
      if (existing) existing.remove();
    }
  }

  // Public method to unlock an ability (called when feeding a dupe)
  unlockNextAbility(uid) {
    const instance = this.getCharacterInstance(uid);
    if (!instance) {
      console.error('❌ Cannot unlock ability: instance not found');
      return { success: false, message: 'Character instance not found' };
    }

    const baseChar = this.getBaseCharacterData(instance.charId);
    if (!baseChar || !baseChar.abilities || baseChar.abilities.length === 0) {
      return { success: false, message: 'This character has no abilities to unlock' };
    }

    const currentUnlocked = instance.dupeUnlocks || 0;
    const maxAbilities = baseChar.abilities.length;

    if (currentUnlocked >= maxAbilities) {
      return { success: false, message: 'All abilities already unlocked!' };
    }

    // Increment unlocked count
    const newUnlockedCount = currentUnlocked + 1;

    // Update cost and luck based on dupes
    const currentCost = instance.cost || 50;
    const currentLuck = instance.luck || 50;
    const newCost = Math.max(28, currentCost - 2); // Min cost of 28
    const newLuck = Math.min(100, currentLuck + 10); // Max luck of 100

    window.InventoryChar.updateInstance(uid, {
      dupeUnlocks: newUnlockedCount,
      cost: newCost,
      luck: newLuck
    });

    const unlockedAbility = baseChar.abilities[currentUnlocked];

    console.log(`✅ Unlocked ability ${newUnlockedCount}/${maxAbilities}: ${unlockedAbility.name}`);

    return {
      success: true,
      message: `Unlocked: ${unlockedAbility.name}`,
      abilityName: unlockedAbility.name,
      abilityDescription: unlockedAbility.description,
      unlockedCount: newUnlockedCount,
      maxAbilities: maxAbilities
    };
  }

  // Refresh the abilities display (call after unlocking)
  refresh() {
    this.renderAbilities();
  }
}

// Initialize the system when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.characterDupeAbilities = new CharacterDupeAbilitiesSystem();
  });
} else {
  window.characterDupeAbilities = new CharacterDupeAbilitiesSystem();
}
