// js/summon/summon-dev-panel.js - Development Currency Panel

class DevPanel {
  constructor() {
    this.isCollapsed = false;
  }

  init() {
    this.createPanel();
    this.attachEventListeners();
    console.log('🛠️ Dev Panel initialized');
  }

  createPanel() {
    const panel = document.createElement('div');
    panel.className = 'dev-panel';
    panel.id = 'dev-panel';

    panel.innerHTML = `
      <div class="dev-panel-header">
        <div class="dev-panel-title">Dev Tools</div>
        <button class="dev-panel-toggle" id="dev-toggle">×</button>
      </div>

      <div class="dev-panel-content">
        <!-- Pearls -->
        <div class="dev-currency-group">
          <div class="dev-currency-label">
            <img src="assets/icons/pearl_icon.png" alt="Pearl">
            <span>Ninja Pearls</span>
          </div>
          <div class="dev-currency-buttons">
            <button class="dev-add-btn" data-currency="pearls" data-amount="5">+5</button>
            <button class="dev-add-btn" data-currency="pearls" data-amount="50">+50</button>
            <button class="dev-add-btn" data-currency="pearls" data-amount="500">+500</button>
          </div>
        </div>

        <div class="dev-divider"></div>

        <!-- Coins -->
        <div class="dev-currency-group">
          <div class="dev-currency-label">
            <img src="assets/icons/coins_icon.png" alt="Coins">
            <span>Coins</span>
          </div>
          <div class="dev-currency-buttons">
            <button class="dev-add-btn" data-currency="coins" data-amount="1000">+1K</button>
            <button class="dev-add-btn" data-currency="coins" data-amount="10000">+10K</button>
            <button class="dev-add-btn" data-currency="coins" data-amount="100000">+100K</button>
          </div>
        </div>

        <div class="dev-divider"></div>

        <!-- Reset Button -->
        <button class="dev-reset-btn" id="dev-reset">Reset All Currency</button>

        <div class="dev-info">Development Panel Only</div>
      </div>
    `;

    document.body.appendChild(panel);
  }

  attachEventListeners() {
    // Toggle panel
    const toggleBtn = document.getElementById('dev-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.togglePanel());
    }

    // Add currency buttons
    const addButtons = document.querySelectorAll('.dev-add-btn');
    addButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const currency = btn.dataset.currency;
        const amount = parseInt(btn.dataset.amount);
        this.addCurrency(currency, amount);
      });
    });

    // Reset button
    const resetBtn = document.getElementById('dev-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetCurrency());
    }
  }

  togglePanel() {
    const panel = document.getElementById('dev-panel');
    if (panel) {
      this.isCollapsed = !this.isCollapsed;
      panel.classList.toggle('collapsed', this.isCollapsed);
    }
  }

  addCurrency(type, amount) {
    if (!window.Resources) {
      console.warn('Resources system not loaded');
      return;
    }

    const key = type === 'pearls' ? 'ninja_pearls' : 'ryo';
    window.Resources.add(key, amount);

    // Update display
    if (window.SummonUI) {
      window.SummonUI.updateCurrencyDisplay();
    }

    // Visual feedback
    this.showFeedback(`+${amount} ${type}`);
  }

  resetCurrency() {
    if (!window.Resources) return;

    if (confirm('Reset all currency to 0?')) {
      window.Resources.set('ninja_pearls', 0);
      window.Resources.set('ryo', 0);
      window.Resources.set('shinobites', 0);

      // Update display
      if (window.SummonUI) {
        window.SummonUI.updateCurrencyDisplay();
      }

      this.showFeedback('Currency reset');
    }
  }

  showFeedback(message) {
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 107, 0, 0.9);
      color: #fff;
      padding: 15px 30px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 700;
      z-index: 10000;
      pointer-events: none;
      animation: feedbackPop 0.6s ease-out;
    `;
    feedback.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes feedbackPop {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.5);
        }
        50% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1);
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.remove();
      style.remove();
    }, 600);
  }
}

// Initialize on load
window.DevPanel = new DevPanel();

console.log('✅ Dev Panel module loaded');
