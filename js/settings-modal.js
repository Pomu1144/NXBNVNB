// Settings Modal System - Centralized Game Settings

(function(global) {
  'use strict';

  const SettingsModal = {
    overlay: null,
    modal: null,
    isOpen: false,

    /**
     * Initialize the settings modal
     */
    init() {
      this.createModal();
      this.setupEventListeners();
      console.log('✅ Settings modal initialized');
    },

    /**
     * Create the settings modal HTML structure
     */
    createModal() {
      // Check if modal already exists
      if (document.getElementById('settings-overlay')) {
        this.overlay = document.getElementById('settings-overlay');
        this.modal = document.getElementById('settings-modal');
        return;
      }

      // Create overlay
      this.overlay = document.createElement('div');
      this.overlay.id = 'settings-overlay';
      this.overlay.className = 'settings-overlay';

      // Create modal structure
      this.overlay.innerHTML = `
        <div id="settings-modal" class="settings-modal">
          <div class="settings-header">
            <h2 class="settings-title">Settings</h2>
            <button class="settings-close" id="settings-close-btn">×</button>
          </div>
          <div class="settings-body">
            <!-- Music Section -->
            <div class="settings-section">
              <h3 class="settings-section-title">🎵 Music</h3>

              <div class="settings-option">
                <label class="settings-option-label">Music Enabled</label>
                <div class="settings-input-group">
                  <label class="settings-toggle">
                    <input type="checkbox" id="setting-music-enabled" checked>
                    <span class="toggle-slider"></span>
                  </label>
                  <span class="settings-help">Enable background music</span>
                </div>
              </div>

              <div class="settings-option">
                <label class="settings-option-label">Music Volume</label>
                <div class="settings-input-group">
                  <input type="range" min="0" max="100" value="50" class="settings-slider" id="setting-music-volume">
                  <span class="settings-value" id="music-volume-display">50%</span>
                </div>
              </div>
            </div>

            <div class="settings-divider"></div>

            <!-- Player Section -->
            <div class="settings-section">
              <h3 class="settings-section-title">👤 Player</h3>

              <div class="settings-option">
                <label class="settings-option-label">Username</label>
                <div class="settings-input-group">
                  <input type="text" class="settings-input" id="setting-username" placeholder="Enter your username" maxlength="20">
                </div>
                <p class="settings-help">Your display name in the game</p>
              </div>
            </div>

            <div class="settings-divider"></div>

            <!-- Visual Section -->
            <div class="settings-section">
              <h3 class="settings-section-title">🎨 Visual</h3>

              <div class="settings-option">
                <label class="settings-option-label">Background Theme</label>
                <div class="background-grid" id="background-grid">
                  <!-- Background options will be generated here -->
                </div>
                <p class="settings-help">Choose your village background</p>
              </div>
            </div>

            <div class="settings-divider"></div>

            <!-- Character Display Section -->
            <div class="settings-section">
              <h3 class="settings-section-title">⚡ Character Display</h3>

              <div class="settings-option">
                <button class="settings-button" id="setting-select-character">
                  Select Display Character
                </button>
                <p class="settings-help">Choose which character appears in your village</p>
              </div>
            </div>

            <div class="settings-divider"></div>

            <!-- Data Section -->
            <div class="settings-section">
              <h3 class="settings-section-title">💾 Data</h3>

              <div class="settings-option">
                <button class="settings-button" id="setting-view-resources">
                  View Resources
                </button>
                <p class="settings-help">Check your materials and currency</p>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.overlay);
      this.modal = document.getElementById('settings-modal');

      // Generate background options
      this.generateBackgroundOptions();
    },

    /**
     * Generate background selection grid
     */
    generateBackgroundOptions() {
      const grid = document.getElementById('background-grid');
      if (!grid) return;

      for (let i = 1; i <= 10; i++) {
        const option = document.createElement('div');
        option.className = 'background-option';
        option.dataset.bg = i;
        option.dataset.number = i;
        option.style.backgroundImage = `url('assets/backgrounds/bg-${i}.jpg')`;

        // Check if this is the current background
        const bgElement = document.getElementById('full-bg');
        if (bgElement && bgElement.classList.contains(`bg-${i}`)) {
          option.classList.add('active');
        }

        option.addEventListener('click', () => this.changeBackground(i));
        grid.appendChild(option);
      }
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Close button
      const closeBtn = document.getElementById('settings-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      // Click outside to close
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });

      // ESC key to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });

      // Music enabled toggle
      const musicToggle = document.getElementById('setting-music-enabled');
      if (musicToggle) {
        musicToggle.addEventListener('change', (e) => {
          if (e.target.checked) {
            window.MusicPlayer?.play();
          } else {
            window.MusicPlayer?.pause();
          }
        });
      }

      // Music volume slider
      const volumeSlider = document.getElementById('setting-music-volume');
      const volumeDisplay = document.getElementById('music-volume-display');
      if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
          const volume = e.target.value;
          if (volumeDisplay) volumeDisplay.textContent = `${volume}%`;
          window.MusicPlayer?.setVolume(volume / 100);
        });
      }

      // Username input
      const usernameInput = document.getElementById('setting-username');
      if (usernameInput) {
        // Load saved username
        const savedUsername = localStorage.getItem('player_username') || 'Shinobi';
        usernameInput.value = savedUsername;

        usernameInput.addEventListener('change', (e) => {
          const username = e.target.value.trim() || 'Shinobi';
          localStorage.setItem('player_username', username);

          // Update username display if it exists
          const usernameEl = document.getElementById('player-username');
          if (usernameEl) usernameEl.textContent = username;

          console.log('Username updated:', username);
        });
      }

      // Select character button
      const selectCharBtn = document.getElementById('setting-select-character');
      if (selectCharBtn) {
        selectCharBtn.addEventListener('click', () => {
          if (typeof window.CharacterVignette !== 'undefined') {
            this.close();
            window.CharacterVignette.openCharacterSelector();
          } else {
            alert('Character Vignette system not loaded. Please reload the page.');
          }
        });
      }

      // View resources button
      const viewResourcesBtn = document.getElementById('setting-view-resources');
      if (viewResourcesBtn) {
        viewResourcesBtn.addEventListener('click', () => {
          this.close();
          if (typeof window.Navigation !== 'undefined') {
            window.Navigation.navigateTo('resources.html');
          } else {
            window.location.href = 'resources.html';
          }
        });
      }
    },

    /**
     * Change background theme
     */
    changeBackground(num) {
      const bgElement = document.getElementById('full-bg');
      if (!bgElement) return;

      // Remove all background classes
      for (let i = 1; i <= 10; i++) {
        bgElement.classList.remove(`bg-${i}`);
      }

      // Add new background class
      bgElement.classList.add(`bg-${num}`);

      // Update active state in grid
      document.querySelectorAll('.background-option').forEach(opt => {
        opt.classList.remove('active');
        if (opt.dataset.bg == num) {
          opt.classList.add('active');
        }
      });

      // Save preference
      localStorage.setItem('selected_background', num);

      console.log(`Background changed to bg-${num}`);
    },

    /**
     * Load saved settings
     */
    loadSettings() {
      // Music enabled
      const musicToggle = document.getElementById('setting-music-enabled');
      if (musicToggle && window.MusicPlayer) {
        const status = window.MusicPlayer.getStatus();
        musicToggle.checked = status.isPlaying;
      }

      // Music volume
      const volumeSlider = document.getElementById('setting-music-volume');
      const volumeDisplay = document.getElementById('music-volume-display');
      if (volumeSlider && window.MusicPlayer) {
        const status = window.MusicPlayer.getStatus();
        const volumePercent = Math.round(status.volume * 100);
        volumeSlider.value = volumePercent;
        if (volumeDisplay) volumeDisplay.textContent = `${volumePercent}%`;
      }

      // Background
      const savedBg = localStorage.getItem('selected_background');
      if (savedBg) {
        document.querySelectorAll('.background-option').forEach(opt => {
          opt.classList.toggle('active', opt.dataset.bg == savedBg);
        });
      }
    },

    /**
     * Open the settings modal
     */
    open() {
      if (!this.overlay) this.init();

      this.overlay.classList.add('active');
      this.isOpen = true;
      this.loadSettings();

      console.log('Settings modal opened');
    },

    /**
     * Close the settings modal
     */
    close() {
      this.overlay.classList.remove('active');
      this.isOpen = false;

      console.log('Settings modal closed');
    },

    /**
     * Toggle the settings modal
     */
    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SettingsModal.init());
  } else {
    SettingsModal.init();
  }

  // Export to global scope
  global.SettingsModal = SettingsModal;

})(window);
