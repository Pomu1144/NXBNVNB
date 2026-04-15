// js/characters_abilities.js - Character Passive Ability Icon System
// Displays tier-based passive icons on the right side of character art

class CharacterAbilitiesSystem {
  constructor() {
    this.currentCharacter = null;
    this.currentTier = null;
    this.iconContainer = null;
    console.log('✅ Passive Abilities System initialized');
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
        setTimeout(() => this.renderPassiveIcons(), 100);
      }
    });

    observer.observe(modal, {
      attributes: true,
      attributeFilter: ['class']
    });

    console.log('✅ Modal observer active');
  }

  renderPassiveIcons() {
    console.log('🎨 Rendering passive icons...');
    
    // Get the currently displayed character
    const uid = this.getCurrentCharacterUID();
    if (!uid) {
      console.log('⚠️ No character UID found');
      return;
    }

    // Get character data
    const character = this.getCharacterData(uid);
    if (!character) {
      console.log('⚠️ No character data found');
      return;
    }

    this.currentCharacter = character;
    this.currentTier = character.tierCode || character.starMinCode;

    // Get passive icons for current tier
    const icons = this.getPassiveIconsForTier();
    if (!icons || icons.length === 0) {
      console.log('⚠️ No passive icons for this character/tier');
      this.removeIconContainer();
      return;
    }

    // Render the icons
    this.createIconContainer();
    this.populateIcons(icons);
    console.log('✅ Passive icons rendered:', icons.length);
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

  getCharacterData(uid) {
    if (!window.InventoryChar) {
      console.error('❌ InventoryChar not found');
      return null;
    }

    const instance = window.InventoryChar.getByUid(uid);

    if (!instance) return null;

    // Get base character data
    const baseChar = window.CharacterInventory?.getCharacterById(instance.charId);

    return {
      ...instance,
      passiveIcons: baseChar?.passiveIcons,
      tierCode: instance.tierCode || baseChar?.starMinCode
    };
  }

  getPassiveIconsForTier() {
    if (!this.currentCharacter?.passiveIcons) return null;

    const passiveIcons = this.currentCharacter.passiveIcons;

    // Check if passiveIcons uses numbered keys (1, 2, 3, ...) or tier-based keys
    // If it's an object with numbered keys, convert to array
    if (typeof passiveIcons === 'object' && !Array.isArray(passiveIcons)) {
      // Check if keys are numbers
      const keys = Object.keys(passiveIcons);
      const isNumbered = keys.every(k => !isNaN(k));

      if (isNumbered) {
        // Return array of icon names in order
        return keys.sort((a, b) => parseInt(a) - parseInt(b)).map(k => passiveIcons[k]);
      }

      // Otherwise try tier-based lookup
      const tier = this.currentTier;
      if (passiveIcons[tier]) {
        return passiveIcons[tier];
      }

      // Fallback to lowest tier
      const minTier = this.currentCharacter.starMinCode;
      return passiveIcons[minTier] || null;
    }

    return passiveIcons;
  }

  createIconContainer() {
    // Remove existing container if present
    this.removeIconContainer();

    // Find the character art container
    const artContainer = document.querySelector('.char-modal-art');
    if (!artContainer) {
      console.error('❌ Art container not found');
      return;
    }

    // Create icon container
    this.iconContainer = document.createElement('div');
    this.iconContainer.id = 'char-passive-icons';
    this.iconContainer.className = 'passive-icons-right';

    // Append to art container
    artContainer.appendChild(this.iconContainer);
  }

  populateIcons(icons) {
    if (!this.iconContainer) return;

    // Clear existing icons
    this.iconContainer.innerHTML = '';

    // Get unlocked abilities count to determine locked state
    const instance = window.InventoryChar?.getByUid(this.currentCharacter?.uid);
    const unlockedCount = instance?.dupeUnlocks || 0;

    // Add each icon
    icons.forEach((iconId, index) => {
      const iconElement = document.createElement('div');
      iconElement.className = 'passive-icon';

      // Add locked class if this icon is beyond the unlocked count
      if (index >= unlockedCount) {
        iconElement.classList.add('locked');
      }

      // Add tier class for special styling
      if (this.currentTier) {
        const tierNum = this.currentTier.replace(/\D/g, '');
        iconElement.classList.add(`tier-${tierNum}`);
      }

      // Add tooltip as data attribute
      iconElement.setAttribute('data-tooltip', this.getIconTooltip(iconId));

      const img = document.createElement('img');
      img.src = `assets/passive_icons/${iconId}.png`;
      img.alt = iconId;

      // Fallback to default icon on error
      img.onerror = () => {
        console.log(`⚠️ Icon not found: ${iconId}.png`);
        iconElement.classList.add('error');
      };

      iconElement.appendChild(img);
      this.iconContainer.appendChild(iconElement);
    });

    console.log(`✅ Added ${icons.length} passive icons (${unlockedCount} unlocked)`);
  }

  getIconTooltip(iconId) {
    const tooltips = {
      'atk_up': 'Attack Up',
      'def_up': 'Defense Up',
      'hp_up': 'HP Up',
      'crit_up': 'Critical Rate Up',
      'crit_dmg': 'Critical Damage Up',
      'heal_up': 'Healing Boost',
      'regen': 'HP Regeneration',
      'chakra_restore': 'Chakra Restore',
      'speed_up': 'Speed Up',
      'haste': 'Haste',
      'damage_reduction': 'Damage Reduction',
      'barrier': 'Barrier',
      'dodge': 'Dodge',
      'counter': 'Counter Attack',
      'pierce': 'Defense Pierce',
      'element_boost': 'Element Boost',
      'element_resist': 'Element Resistance',
      'field_heal': 'Field Healing',
      'buddy_heal': 'Buddy Healing',
      'slip_damage': 'Slip Damage',
      'burn': 'Burn',
      'poison': 'Poison',
      'stun_inflict': 'Stun',
      'seal_inflict': 'Seal'
    };

    return tooltips[iconId] || iconId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  removeIconContainer() {
    if (this.iconContainer) {
      this.iconContainer.remove();
      this.iconContainer = null;
    } else {
      const existing = document.getElementById('char-passive-icons');
      if (existing) existing.remove();
    }
  }
}

// Initialize the system when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.characterAbilities = new CharacterAbilitiesSystem();
  });
} else {
  window.characterAbilities = new CharacterAbilitiesSystem();
}
