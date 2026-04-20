// js/characters_abilities.js - Character Passive Ability Icon System
// Displays ability icons on the right side of character art.
// Icon filenames are derived from ability names by lowercasing + replacing
// spaces/special chars with underscores (matches assets/passive_icons/*.png).

class CharacterAbilitiesSystem {
  constructor() {
    this.currentCharacter = null;
    this.iconContainer = null;
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
        this.setupModalObserver(modal);
      }
    }, 100);
  }

  setupModalObserver(modal) {
    const observer = new MutationObserver(() => {
      if (modal.classList.contains('open')) {
        setTimeout(() => this.renderPassiveIcons(), 50);
      } else {
        this.removeIconContainer();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  // Convert ability name → passive_icons filename (no extension).
  // "Attack Boost" → "attack_boost"
  // "0 Chakra Req'd for Ninjutsu" → "0_chakra_reqd_for_ninjutsu"
  abilityNameToIconId(name) {
    return name
      .toLowerCase()
      .replace(/'/g, '')          // remove apostrophes
      .replace(/[/\\()\[\]]/g, ' ') // punctuation → space
      .replace(/[-–—]/g, '_')    // dashes → underscore
      .replace(/[^a-z0-9_ ]/g, '') // strip anything else
      .trim()
      .replace(/\s+/g, '_');      // spaces → underscore
  }

  renderPassiveIcons() {
    const modal = document.getElementById('char-modal');
    const uid = modal?.dataset?.currentUid;
    if (!uid) { this.removeIconContainer(); return; }

    const instance = window.InventoryChar?.getByUid(uid);
    if (!instance) { this.removeIconContainer(); return; }

    const baseChar = window.CharacterInventory?.getCharacterById(instance.charId);
    const abilities = baseChar?.abilities || [];

    if (!abilities.length) { this.removeIconContainer(); return; }

    // Build list of icon IDs from ability names
    const iconIds = abilities.map(a => this.abilityNameToIconId(a.name || ''));

    // How many abilities this instance has unlocked
    const unlockedCount = (instance.unlockedAbilities || []).length;

    this.createIconContainer();
    this.populateIcons(iconIds, abilities, unlockedCount);
  }

  createIconContainer() {
    this.removeIconContainer();

    const artContainer = document.querySelector('.char-modal-art');
    if (!artContainer) return;

    this.iconContainer = document.createElement('div');
    this.iconContainer.id = 'char-passive-icons';
    this.iconContainer.className = 'passive-icons-right';
    artContainer.appendChild(this.iconContainer);
  }

  populateIcons(iconIds, abilities, unlockedCount) {
    if (!this.iconContainer) return;
    this.iconContainer.innerHTML = '';

    iconIds.forEach((iconId, index) => {
      const isUnlocked = index < unlockedCount;
      const ability = abilities[index] || {};

      const iconEl = document.createElement('div');
      iconEl.className = 'passive-icon' + (isUnlocked ? ' unlocked' : ' locked');
      iconEl.setAttribute('data-tooltip', ability.name || iconId);
      iconEl.title = ability.name || iconId;

      const img = document.createElement('img');
      img.src = `assets/passive_icons/${iconId}.png`;
      img.alt = ability.name || iconId;
      img.onerror = () => { iconEl.classList.add('error'); };

      iconEl.appendChild(img);
      this.iconContainer.appendChild(iconEl);
    });
  }

  removeIconContainer() {
    if (this.iconContainer) {
      this.iconContainer.remove();
      this.iconContainer = null;
    } else {
      document.getElementById('char-passive-icons')?.remove();
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.characterAbilities = new CharacterAbilitiesSystem();
  });
} else {
  window.characterAbilities = new CharacterAbilitiesSystem();
}
