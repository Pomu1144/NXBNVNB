class StatusEffectUI {
  // Create status effect badge HTML
  static createBadge(effect, stacks = 1) {
    const type = effect.type || 'neutral';
    const turnsLeft = effect.turnsRemaining || effect.duration;
    const showStack = stacks > 1 && effect.stackable;
    
    return `
      <div class="status-effect ${type} active" data-effect="${effect.id}" title="${effect.description}">
        <span class="status-icon">${effect.icon}</span>
        <span class="status-duration">${turnsLeft}</span>
        ${showStack ? `<span class="status-stack">×${stacks}</span>` : ''}
        <div class="status-tooltip">
          <div class="status-tooltip-name">${effect.name}</div>
          <div class="status-tooltip-desc">${effect.description}</div>
        </div>
      </div>
    `;
  }
  
  // Render all status effects for a character
  static renderEffects(characterId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const effects = statusManager.getEffects(characterId);
    
    if (effects.length === 0) {
      container.innerHTML = '<span class="status-effects-empty">No active effects</span>';
      return;
    }
    
    // Group stacks
    const grouped = {};
    effects.forEach(effect => {
      if (!grouped[effect.id]) {
        grouped[effect.id] = { effect, count: 0 };
      }
      grouped[effect.id].count++;
    });
    
    // Render badges
    container.innerHTML = Object.values(grouped)
      .map(({ effect, count }) => this.createBadge(effect, count))
      .join('');
  }
  
  // Show status effect applied animation
  static showEffectApplied(characterElement, effectId) {
    const effect = Object.values(STATUS_EFFECTS).find(e => e.id === effectId);
    if (!effect) return;
    
    const popup = document.createElement('div');
    popup.className = 'status-popup';
    popup.innerHTML = `
      <span class="status-popup-icon">${effect.icon}</span>
      <span class="status-popup-text">${effect.name}</span>
    `;
    popup.style.cssText = `
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: ${effect.type === 'buff' ? 'rgba(0, 200, 100, 0.9)' : 'rgba(200, 0, 0, 0.9)'};
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
      animation: statusPopup 2s ease forwards;
      z-index: 1000;
      pointer-events: none;
    `;
    
    characterElement.style.position = 'relative';
    characterElement.appendChild(popup);
    
    setTimeout(() => popup.remove(), 2000);
  }
}

// Add CSS for popup animation
if (!document.getElementById('status-popup-styles')) {
  const style = document.createElement('style');
  style.id = 'status-popup-styles';
  style.textContent = `
    @keyframes statusPopup {
      0% {
        opacity: 0;
        transform: translateX(-50%) translateY(0) scale(0.5);
      }
      20% {
        opacity: 1;
        transform: translateX(-50%) translateY(-10px) scale(1.2);
      }
      80% {
        opacity: 1;
        transform: translateX(-50%) translateY(-20px) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateX(-50%) translateY(-30px) scale(0.8);
      }
    }
  `;
  document.head.appendChild(style);
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StatusEffectUI };
}
