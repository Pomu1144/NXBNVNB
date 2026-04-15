// js/summon/summon-animation.js - Summon Animation Controller

class SummonAnimationController {
  constructor() {
    this.elements = {
      modal: null,
      video: null,
      animationContainer: null,
      resultDisplay: null
    };

    this.isPlaying = false;
  }

  init() {
    this.elements.modal = document.getElementById('summon-modal');
    this.elements.video = document.getElementById('summon-video');
    this.elements.animationContainer = document.querySelector('.summon-animation');
    this.elements.resultDisplay = document.getElementById('result-display');

    this.setupVideoListeners();
    console.log('✅ Summon Animation Controller initialized');
  }

  setupVideoListeners() {
    if (!this.elements.video) return;

    this.elements.video.addEventListener('ended', () => {
      this.onAnimationComplete();
    });

    this.elements.video.addEventListener('error', (e) => {
      console.warn('Video playback error, skipping animation:', e);
      this.onAnimationComplete();
    });
  }

  /**
   * Play summon animation
   * @param {string} type - 'single' or 'multi'
   * @returns {Promise} Resolves when animation completes
   */
  async playSummonAnimation(type = 'single') {
    return new Promise((resolve) => {
      if (this.isPlaying) {
        resolve();
        return;
      }

      this.isPlaying = true;

      // Show modal and animation
      if (this.elements.modal) {
        this.elements.modal.classList.remove('hidden');
      }

      if (this.elements.animationContainer) {
        this.elements.animationContainer.classList.remove('hidden');
      }

      if (this.elements.resultDisplay) {
        this.elements.resultDisplay.classList.add('hidden');
      }

      // Play video if available
      if (this.elements.video) {
        this.elements.video.currentTime = 0;
        const playPromise = this.elements.video.play();

        if (playPromise) {
          playPromise.catch((error) => {
            console.warn('Video autoplay prevented:', error);
            // Skip video and resolve immediately
            setTimeout(() => {
              this.onAnimationComplete();
              resolve();
            }, 500);
          });
        }

        // Set timeout as fallback - increased for full animation
        setTimeout(() => {
          if (this.isPlaying) {
            this.onAnimationComplete();
            resolve();
          }
        }, 12000); // Max 12 seconds for full animation
      } else {
        // No video element, use CSS animation
        this.playFallbackAnimation(type).then(() => {
          this.onAnimationComplete();
          resolve();
        });
      }

      // Store resolve callback for video end event
      this._currentResolve = resolve;
    });
  }

  /**
   * Fallback animation using CSS
   */
  async playFallbackAnimation(type) {
    return new Promise((resolve) => {
      // Create portal effect overlay
      const overlay = document.createElement('div');
      overlay.className = 'summon-portal-overlay';
      overlay.innerHTML = `
        <div class="portal-circle"></div>
        <div class="portal-glow"></div>
      `;

      if (this.elements.animationContainer) {
        this.elements.animationContainer.appendChild(overlay);
      }

      // Remove after animation
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 2000);
    });
  }

  /**
   * Called when animation completes
   */
  onAnimationComplete() {
    this.isPlaying = false;

    // Hide animation container
    if (this.elements.animationContainer) {
      this.elements.animationContainer.classList.add('hidden');
    }

    // Pause video
    if (this.elements.video) {
      this.elements.video.pause();
    }

    // Resolve promise if callback exists
    if (this._currentResolve) {
      this._currentResolve();
      this._currentResolve = null;
    }
  }

  /**
   * Skip animation
   */
  skipAnimation() {
    if (this.isPlaying) {
      this.onAnimationComplete();
    }
  }

  /**
   * Create particle effects for summon
   */
  createParticleEffect(container, type = 'gold') {
    const particleCount = type === 'gold' ? 50 : 30;
    const colors = {
      gold: ['#FFD700', '#FFA500', '#FFFF00'],
      silver: ['#C0C0C0', '#E8E8E8', '#A8A8A8'],
      bronze: ['#CD7F32', '#B87333', '#996515']
    };

    const colorSet = colors[type] || colors.bronze;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'summon-particle';
      particle.style.cssText = `
        position: absolute;
        width: ${Math.random() * 8 + 4}px;
        height: ${Math.random() * 8 + 4}px;
        background: ${colorSet[Math.floor(Math.random() * colorSet.length)]};
        border-radius: 50%;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        opacity: ${Math.random() * 0.8 + 0.2};
        animation: particleFloat ${Math.random() * 3 + 2}s ease-out forwards;
        pointer-events: none;
      `;

      container.appendChild(particle);

      // Remove after animation
      setTimeout(() => {
        particle.remove();
      }, 5000);
    }
  }
}

// Add CSS for fallback animations
const style = document.createElement('style');
style.textContent = `
  .summon-portal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle, rgba(255,215,0,0.1) 0%, rgba(0,0,0,0.9) 100%);
    z-index: 10;
  }

  .portal-circle {
    width: 200px;
    height: 200px;
    border: 4px solid #FFD700;
    border-radius: 50%;
    animation: portalSpin 2s linear infinite, portalPulse 1s ease-in-out infinite;
    box-shadow: 0 0 30px #FFD700, inset 0 0 30px #FFD700;
  }

  .portal-glow {
    position: absolute;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(255,215,0,0.5) 0%, transparent 70%);
    border-radius: 50%;
    animation: portalGlow 1.5s ease-in-out infinite;
  }

  @keyframes portalSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes portalPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  @keyframes portalGlow {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.2); }
  }

  @keyframes particleFloat {
    0% {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    100% {
      transform: translateY(-100px) scale(0);
      opacity: 0;
    }
  }

  .summon-particle {
    pointer-events: none;
  }
`;
document.head.appendChild(style);

// Global instance
window.SummonAnimator = new SummonAnimationController();

console.log('✅ Summon Animation Controller loaded');
