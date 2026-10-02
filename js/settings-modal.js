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

      // Dev grants only exist in dev mode (js/dev-mode.js, ?dev=1)
      const devSection = global.DEV_MODE ? `
            <!-- Developer Tools Section -->
            <div class="settings-section">
              <h3 class="settings-section-title">Developer Tools</h3>

              <div class="settings-option">
                <button class="settings-button settings-button-special" id="setting-receive-random-chars">
                  Receive 30 Random Characters
                </button>
                <p class="settings-help">Add 30 random characters to your inventory</p>
              </div>

              <div class="settings-option">
                <button class="settings-button settings-button-special" id="setting-grant-blazing-bases">
                  Grant All Blazing Awakened 5★ Bases
                </button>
                <p class="settings-help">Adds the 5★ base of every Blazing Awakened (6SB) unit so you can test the full 5S → 6S → 6SB path</p>
              </div>
            </div>

            <div class="settings-divider"></div>
` : '';

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
              <h3 class="settings-section-title">Music</h3>

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
              <h3 class="settings-section-title">Player</h3>

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
              <h3 class="settings-section-title">Visual</h3>

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
              <h3 class="settings-section-title">Character Display</h3>

              <div class="settings-option">
                <button class="settings-button" id="setting-select-character">
                  Select Display Character
                </button>
                <p class="settings-help">Choose which character appears in your village</p>
              </div>
            </div>

            <div class="settings-divider"></div>

            ${devSection}
            <!-- Data Section -->
            <div class="settings-section">
              <h3 class="settings-section-title">Data</h3>

              <div class="settings-option">
                <button class="settings-button" id="setting-view-resources">
                  View Resources
                </button>
                <p class="settings-help">Check your materials and currency</p>
              </div>

              <div class="settings-option">
                <button class="settings-button" id="setting-open-settings-page">
                  All Settings
                </button>
                <p class="settings-help">Sound effects, gift codes, save export / import and log out</p>
              </div>
            </div>

            <div class="settings-divider"></div>

            <!-- Screen info: how this device reports its screen to the game
                 (for layout fixes on new phones / OS versions) -->
            <div class="settings-section">
              <h3 class="settings-section-title">Screen</h3>
              <p class="settings-help" id="setting-screen-info" style="font-family:monospace;font-size:11px;line-height:1.6;word-break:break-word"></p>
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

      const BG = global.VillageBackgrounds;
      if (!BG) return;
      const current = BG.savedId();
      BG.LIST.forEach((bg) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'background-option';
        option.dataset.bg = bg.id;
        option.dataset.name = bg.name;
        option.title = bg.name;
        option.setAttribute('aria-label', bg.name);
        option.style.backgroundImage = `url('${bg.thumb}')`;
        option.classList.toggle('active', bg.id === current);
        option.addEventListener('click', () => this.changeBackground(bg.id));
        grid.appendChild(option);
      });
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
          volumeSlider.style.setProperty('--pct', `${volume}%`);
          window.MusicPlayer?.setVolume(volume / 100);
        });
      }

      // Username input (canonical key shared with the login flow)
      const usernameInput = document.getElementById('setting-username');
      if (usernameInput) {
        // Load saved username
        const savedUsername = localStorage.getItem('blazing-login-username') || 'Ninja';
        usernameInput.value = savedUsername;

        usernameInput.addEventListener('change', (e) => {
          const username = e.target.value.trim() || 'Ninja';

          if (window.Username?.set) {
            window.Username.set(username);
          } else if (window.UserProfile?.setUsername) {
            window.UserProfile.setUsername(username);
          } else {
            localStorage.setItem('blazing-login-username', username);
            window.dispatchEvent(new CustomEvent('usernameChanged', { detail: { username } }));
          }

          // Update username display if it exists
          const usernameEl = document.getElementById('player-username');
          if (usernameEl) usernameEl.textContent = username;
          const hudEl = document.getElementById('username-display');
          if (hudEl) hudEl.textContent = username;

          console.log('Username updated:', username);
        });
      }

      // Full settings page
      const settingsPageBtn = document.getElementById('setting-open-settings-page');
      if (settingsPageBtn) {
        settingsPageBtn.addEventListener('click', () => {
          this.close();
          if (typeof window.Navigation !== 'undefined') {
            window.Navigation.navigateTo('settings.html');
          } else {
            window.location.href = 'settings.html';
          }
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

      // Receive 30 random characters button
      const randCharsBtn = document.getElementById('setting-receive-random-chars');
      if (randCharsBtn) {
        randCharsBtn.addEventListener('click', () => this.receiveRandomCharacters());
      }

      // Grant all Blazing Awakened 5★ bases button
      const blazingBtn = document.getElementById('setting-grant-blazing-bases');
      if (blazingBtn) {
        blazingBtn.addEventListener('click', () => this.grantBlazingBases());
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
     * Receive 30 random characters from characters.json
     */
    async receiveRandomCharacters() {
      const btn = document.getElementById('setting-receive-random-chars');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Adding characters...';
      }

      try {
        if (typeof window.InventoryChar === 'undefined') {
          alert('Character inventory not available. Please go to the main menu first.');
          return;
        }

        let allChars = [];
        try {
          const res = await fetch('data/characters.json');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          allChars = Array.isArray(data) ? data : Object.values(data);
          // Playable units only — characters.json also holds props/items
          // (Deadly Beads, chests, boosts...) which have powerRank 0
          allChars = allChars.filter(c => (Number(c?.powerRank) || 0) > 0);
        } catch (e) {
          console.error('[Settings] Failed to load characters.json:', e);
          alert('Failed to load character data.');
          return;
        }

        if (allChars.length === 0) {
          alert('No characters found in data.');
          return;
        }

        // Pick 30 random characters (with replacement allowed)
        const count = 30;
        const picked = [];
        for (let i = 0; i < count; i++) {
          const idx = Math.floor(Math.random() * allChars.length);
          picked.push(allChars[idx]);
        }

        // Add each to inventory
        picked.forEach(char => {
          const tierCode = char.starMinCode || '3S';
          window.InventoryChar.addCopy(char.id, 1, tierCode);
        });

        const names = [...new Set(picked.map(c => c.name))].slice(0, 5).join(', ');
        alert(`Added 30 random characters!\nIncludes: ${names}... and more.\nCheck your Characters page!`);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Receive 30 Random Characters';
        }
      }
    },

    /**
     * Grant the 5★ base of every Blazing Awakened (6SB) unit, so the full
     * 5S → 6S → 6SB awakening path can be tested from a fresh copy.
     */
    async grantBlazingBases() {
      const btn = document.getElementById('setting-grant-blazing-bases');
      if (btn) { btn.disabled = true; btn.textContent = 'Granting…'; }
      try {
        if (typeof window.InventoryChar === 'undefined') {
          alert('Character inventory not available. Please go to the main menu first.');
          return;
        }

        let chars = [], transforms = [];
        try {
          [chars, transforms] = await Promise.all([
            fetch('data/characters.json').then(r => r.json()),
            fetch('data/awakening-transforms.json').then(r => r.json()).catch(() => [])
          ]);
          chars = Array.isArray(chars) ? chars : Object.values(chars);
        } catch (e) {
          console.error('[Settings] Failed to load data:', e);
          alert('Failed to load character data.');
          return;
        }

        const byId = {};
        chars.forEach(c => { byId[c.id] = c; });
        // reverse transform map (evolved -> base) to walk any form back to its root
        const rev = {};
        (transforms || []).forEach(t => { if (t && t.fromId && t.toId) rev[t.toId] = t.fromId; });
        const baseOf = (id) => {
          const seen = new Set();
          let cur = id;
          while (rev[cur] && !seen.has(cur)) { seen.add(cur); cur = rev[cur]; }
          return cur;
        };

        // Any record that participates in a Blazing chain (has a 6SB tier)
        const isBlazing = (c) =>
          c.starMaxCode === '6SB' || c.starMinCode === '6SB' ||
          !!(c.artByTier && c.artByTier['6SB']);

        const baseIds = new Set();
        chars.forEach(c => { if (isBlazing(c)) baseIds.add(baseOf(c.id)); });

        let granted = 0;
        baseIds.forEach(id => {
          const c = byId[id];
          if (!c) return;
          window.InventoryChar.addCopy(id, 1, c.starMinCode || '5S');
          granted++;
        });

        alert(`Granted ${granted} Blazing Awakened base unit${granted === 1 ? '' : 's'}.\nCheck your Characters page — level to max, then Awaken to walk 5S → 6S → 6SB.`);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Grant All Blazing Awakened 5★ Bases'; }
      }
    },

    /**
     * Change background theme
     */
    changeBackground(num) {
      const BG = global.VillageBackgrounds;
      if (!BG || !BG.save(num)) return;

      // Only pages that show the village scene swap their backdrop live
      const bgElement = document.getElementById('full-bg');
      if (bgElement && bgElement.closest('.game-canvas')) BG.apply(bgElement, num);

      document.querySelectorAll('.background-option').forEach(opt => {
        opt.classList.toggle('active', Number(opt.dataset.bg) === Number(num));
      });

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
        volumeSlider.style.setProperty('--pct', `${volumePercent}%`);
        if (volumeDisplay) volumeDisplay.textContent = `${volumePercent}%`;
      }

      // Background
      const current = global.VillageBackgrounds ? global.VillageBackgrounds.savedId() : 1;
      document.querySelectorAll('.background-option').forEach(opt => {
        opt.classList.toggle('active', Number(opt.dataset.bg) === current);
      });
    },

    /**
     * Open the settings modal
     */
    open() {
      if (!this.overlay) this.init();

      this.overlay.classList.add('active');
      this.isOpen = true;
      this.loadSettings();
      this.showScreenInfo();

      console.log('Settings modal opened');
    },

    /**
     * Fill the Screen line: viewport, screen, safe areas and where a
     * full-screen fixed layer really sits on this device.
     */
    showScreenInfo() {
      const el = document.getElementById('setting-screen-info');
      if (!el) return;
      try {
        const probe = (css) => {
          const d = document.createElement('div');
          d.style.cssText = 'position:fixed;left:0;width:1px;visibility:hidden;pointer-events:none;' + css;
          document.body.appendChild(d);
          const r = d.getBoundingClientRect(), c = getComputedStyle(d);
          const cs = { paddingTop: c.paddingTop, paddingRight: c.paddingRight, paddingBottom: c.paddingBottom, paddingLeft: c.paddingLeft };
          d.remove();
          return { r, cs };
        };
        const fx = probe('top:0;bottom:0').r;
        const h = (u) => Math.round(probe('top:0;height:' + u).r.height);
        const sa = probe('top:0;height:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)').cs;
        const vv = window.visualViewport;
        const ios = (navigator.userAgent.match(/OS (\d+)_(\d+)/) || []).slice(1).join('.') || '-';
        const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
        el.textContent = [
          'inner ' + innerWidth + 'x' + innerHeight + ', client ' + document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight,
          'screen ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x',
          'fixed top ' + Math.round(fx.top) + ' h ' + Math.round(fx.height) + (vv ? ', vv h ' + Math.round(vv.height) + ' top ' + Math.round(vv.offsetTop) : ''),
          '100vh ' + h('100vh') + ', lvh ' + h('100lvh') + ', svh ' + h('100svh') + ', dvh ' + h('100dvh'),
          'safe t' + parseInt(sa.paddingTop) + ' r' + parseInt(sa.paddingRight) + ' b' + parseInt(sa.paddingBottom) + ' l' + parseInt(sa.paddingLeft),
          'iOS ' + ios + (standalone ? ', home-screen app' : ', browser') + ', scrollY ' + Math.round(scrollY)
        ].join(' | ');
      } catch (e) { el.textContent = 'n/a'; }
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
