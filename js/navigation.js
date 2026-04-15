// js/navigation.js
// Navigation System for Banner Buttons, Bottom Icons, and Summon Banners
// Handles all page navigation and deep linking

(function (global) {
  "use strict";

  const ACCOUNT_STORE_KEY = 'blazing-account-store';
  const PLAYER_ID_KEY = 'blazing-player-id';
  const LOGIN_KEY = 'blazing-login-complete';
  const RESOURCES_KEY = 'blazing_resources_v1';
  const INVENTORY_KEY = 'blazing_inventory_v2';
  const TEAM_KEY = 'blazing_teams_v1';

  const AccountSync = {
    initialized: false,
    timer: null,

    loadStore() {
      try {
        const raw = localStorage.getItem(ACCOUNT_STORE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        }
      } catch (error) {
        console.warn('[AccountSync] Failed to read account store:', error);
      }
      return { nextId: 1001, accounts: [] };
    },

    persistStore(store) {
      try {
        localStorage.setItem(ACCOUNT_STORE_KEY, JSON.stringify(store));
      } catch (error) {
        console.warn('[AccountSync] Unable to persist account store:', error);
      }
    },

    isLoggedIn() {
      try {
        return localStorage.getItem(LOGIN_KEY) === 'true';
      } catch (error) {
        return false;
      }
    },

    getActiveAccount(store) {
      if (!this.isLoggedIn()) return null;
      const playerId = localStorage.getItem(PLAYER_ID_KEY);
      if (!playerId || !Array.isArray(store?.accounts)) return null;
      return store.accounts.find((acct) => String(acct.id) === String(playerId)) || null;
    },

    readInventory(accountId) {
      try {
        const raw = localStorage.getItem(INVENTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) return [];
        return list.map((inst, index) => {
          const characterId = String(inst.charId || inst.characterId || '').trim();
          return {
            uid: inst.uid || `acct-${accountId || 'local'}-${index}-${characterId || 'ninja'}`,
            characterId,
            level: Number(inst.level) || 1,
            tierCode: inst.tierCode || null,
            dupeUnlocks: Number.isFinite(Number(inst.dupeUnlocks))
              ? Number(inst.dupeUnlocks)
              : 0,
          };
        });
      } catch (error) {
        console.warn('[AccountSync] Failed to parse inventory:', error);
        return [];
      }
    },

    readTeams() {
      try {
        const raw = localStorage.getItem(TEAM_KEY);
        if (!raw) return { 1: {}, 2: {}, 3: {} };
        const parsed = JSON.parse(raw);
        return {
          1: parsed[1] || parsed['1'] || {},
          2: parsed[2] || parsed['2'] || {},
          3: parsed[3] || parsed['3'] || {},
        };
      } catch (error) {
        console.warn('[AccountSync] Failed to parse teams:', error);
        return { 1: {}, 2: {}, 3: {} };
      }
    },

    readResources(current = {}) {
      try {
        const raw = localStorage.getItem(RESOURCES_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (error) {
        console.warn('[AccountSync] Failed to parse resources:', error);
      }
      return current || {};
    },

    syncNow() {
      const store = this.loadStore();
      const account = this.getActiveAccount(store);
      if (!account) return;

      account.ninjas = this.readInventory(account.id);
      account.teams = this.readTeams();
      account.resources = this.readResources(account.resources);

      this.persistStore(store);
    },

    init() {
      if (this.initialized) return;
      this.initialized = true;
      this.syncNow();

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.syncNow();
        }
      });

      window.addEventListener('beforeunload', () => this.syncNow());
      this.timer = window.setInterval(() => this.syncNow(), 12000);

      console.log('[AccountSync] Session syncing enabled');
    },
  };

  AccountSync.init();
  global.AccountSync = AccountSync;

  // ---------- Navigation Function ----------
  function navigateTo(url, params = {}) {
    console.log(`[Navigation] Navigating to: ${url}`, params);

    // Add query parameters if provided
    let fullUrl = url;
    if (Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      fullUrl = `${url}?${queryString}`;
    }

    // Fade out transition
    document.body.style.transition = "opacity 0.2s linear";
    document.body.style.opacity = "0";

    setTimeout(() => {
      window.location.href = fullUrl;
    }, 200);
  }

  // ---------- Banner Button Navigation ----------
  function initBannerButtons() {
    // Missions
    const btnMissions = document.querySelector('.banner-button.missions');
    if (btnMissions) {
      btnMissions.addEventListener('click', () => {
        console.log("[Navigation] Missions banner clicked");
        navigateTo('missions.html');
      });
    }

    // Characters
    const btnCharacters = document.querySelector('.banner-button.characters');
    if (btnCharacters) {
      btnCharacters.addEventListener('click', () => {
        console.log("[Navigation] Characters banner clicked");
        navigateTo('characters.html');
      });
    }

    // Summon
    const btnSummon = document.querySelector('.banner-button.summon');
    if (btnSummon) {
      btnSummon.addEventListener('click', () => {
        console.log("[Navigation] Summon banner clicked");
        navigateTo('summon.html');
      });
    }

    // Fusion
    const btnFusion = document.querySelector('.banner-button.fusion');
    if (btnFusion) {
      btnFusion.addEventListener('click', () => {
        console.log("[Navigation] Fusion banner clicked");
        navigateTo('fusion.html');
      });
    }

    // Shop
    const btnShop = document.querySelector('.banner-button.shop');
    if (btnShop) {
      btnShop.addEventListener('click', () => {
        console.log("[Navigation] Shop banner clicked");
        navigateTo('shop.html');
      });
    }
  }

  // ---------- HUD Button Navigation (Bottom Bar) ----------
  function initHudButtons() {
    console.log("[Navigation] Initializing HUD buttons...");

    // Village (Home/Index)
    const btnVillage = document.getElementById('btn-village');
    if (btnVillage) {
      btnVillage.addEventListener('click', () => {
        console.log("[Navigation] Village button clicked");
        navigateTo('village.html');
      });
    }

    // Characters
    const btnCharacters = document.getElementById('btn-characters');
    if (btnCharacters) {
      btnCharacters.addEventListener('click', () => {
        console.log("[Navigation] Characters button clicked");
        navigateTo('characters.html');
      });
    }

    // Fusion
    const btnFusion = document.getElementById('btn-fusion');
    if (btnFusion) {
      btnFusion.addEventListener('click', () => {
        console.log("[Navigation] Fusion button clicked");
        navigateTo('fusion.html');
      });
    }

    // Teams
    const btnTeams = document.getElementById('btn-teams');
    if (btnTeams) {
      btnTeams.addEventListener('click', () => {
        console.log("[Navigation] Teams button clicked");
        navigateTo('teams.html');
      });
    }

    // Tools
    const btnTools = document.getElementById('btn-tools');
    if (btnTools) {
      btnTools.addEventListener('click', () => {
        console.log("[Navigation] Tools button clicked");
        navigateTo('tools.html');
      });
    }

    // Summon
    const btnSummon = document.getElementById('btn-summon');
    if (btnSummon) {
      btnSummon.addEventListener('click', () => {
        console.log("[Navigation] Summon button clicked");
        navigateTo('summon.html');
      });
    }

    // Missions
    const btnMissions = document.getElementById('btn-missions');
    if (btnMissions) {
      btnMissions.addEventListener('click', () => {
        console.log("[Navigation] Missions button clicked");
        navigateTo('missions.html');
      });
    }

    // Inventory
    const btnInventory = document.getElementById('btn-inventory');
    if (btnInventory) {
      btnInventory.addEventListener('click', () => {
        console.log("[Navigation] Inventory button clicked");
        navigateTo('inventory.html');
      });
    }

    // Shop
    const btnShop = document.getElementById('btn-shop');
    if (btnShop) {
      btnShop.addEventListener('click', () => {
        console.log("[Navigation] Shop button clicked");
        navigateTo('shop.html');
      });
    }

    // Home (alternative ID)
    const btnHome = document.getElementById('btn-home');
    if (btnHome) {
      btnHome.addEventListener('click', () => {
        console.log("[Navigation] Home button clicked");
        navigateTo('village.html');
      });
    }

    console.log("[Navigation] HUD buttons initialized successfully");
  }

  // ---------- Bottom Icon Navigation ----------
  function initBottomIcons() {
    console.log("[Navigation] Initializing bottom icons...");

    // Notice
    const iconNotice = document.querySelector('.bottom-icon[data-action="notice"]');
    console.log("[Navigation] Notice icon found:", iconNotice);
    if (iconNotice) {
      iconNotice.addEventListener('click', () => {
        console.log("[Navigation] Notice clicked");
        alert("Notice System\n\nNo new notices at this time.");
      });
    }

    // Present Box
    const iconPresents = document.querySelector('.bottom-icon[data-action="presents"]');
    if (iconPresents) {
      iconPresents.addEventListener('click', () => {
        console.log("[Navigation] Present Box clicked");
        alert("Present Box\n\nNo presents available.");
      });
    }

    // Achievements
    const iconAchievements = document.querySelector('.bottom-icon[data-action="achievements"]');
    if (iconAchievements) {
      iconAchievements.addEventListener('click', () => {
        console.log("[Navigation] Achievements clicked");
        alert("Achievements\n\nComing soon!");
      });
    }

    // Panel Missions
    const iconPanelMissions = document.querySelector('.bottom-icon[data-action="panel-missions"]');
    if (iconPanelMissions) {
      iconPanelMissions.addEventListener('click', () => {
        console.log("[Navigation] Panel Missions clicked");
        if (window.PanelMissions) {
          window.PanelMissions.openPanelModal();
        } else {
          alert('Panel Missions system not loaded. Please reload the page.');
        }
      });
    }

    // Chat
    const iconChat = document.querySelector('.bottom-icon[data-action="chat"]');
    if (iconChat) {
      iconChat.addEventListener('click', () => {
        console.log("[Navigation] Chat clicked");
        alert("Chat System\n\nComing soon!");
      });
    }

    // Inventory (Storage)
    const iconInventory = document.querySelector('.bottom-icon[data-action="inventory"]');
    if (iconInventory) {
      iconInventory.addEventListener('click', () => {
        console.log("[Navigation] Inventory clicked");
        navigateTo('inventory.html');
      });
    }

    // Teams
    const iconTeams = document.querySelector('.bottom-icon[data-action="teams"]');
    if (iconTeams) {
      iconTeams.addEventListener('click', () => {
        console.log("[Navigation] Teams clicked");
        navigateTo('teams.html');
      });
    }

    // Resources
    const iconResources = document.querySelector('.bottom-icon[data-action="resources"]');
    if (iconResources) {
      iconResources.addEventListener('click', () => {
        console.log("[Navigation] Resources clicked");
        navigateTo('resources.html');
      });
    }

    // Guilds
    const iconGuilds = document.querySelector('.bottom-icon[data-action="guilds"]');
    if (iconGuilds) {
      iconGuilds.addEventListener('click', () => {
        console.log("[Navigation] Guilds clicked");
        alert("Guilds System\n\nComing soon!");
      });
    }

    // Tools
    const iconTools = document.querySelector('.bottom-icon[data-action="tools"]');
    if (iconTools) {
      iconTools.addEventListener('click', () => {
        console.log("[Navigation] Tools clicked");
        navigateTo('tools.html');
      });
    }

    // Settings
    const iconSettings = document.querySelector('.bottom-icon[data-action="settings"]');
    if (iconSettings) {
      iconSettings.addEventListener('click', () => {
        console.log("[Navigation] Settings clicked");
        openSettingsMenu();
      });
    }

    console.log("[Navigation] Bottom icons initialized successfully");
  }

  // ---------- Summon Banner Carousel Navigation ----------
  async function initSummonBanners() {
    const carousel = document.querySelector('.summon-banner-carousel');
    if (!carousel) return;

    try {
      // Load summon banners data
      const response = await fetch('data/summon.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const summonsData = await response.json();

      // Clear carousel and create structure
      carousel.innerHTML = '';

      // Create track for horizontal sliding
      const track = document.createElement('div');
      track.className = 'summon-carousel-track';

      // Create banner cards
      summonsData.banners.forEach((banner, index) => {
        const card = document.createElement('div');
        card.className = 'summon-banner-card';
        card.dataset.bannerId = banner.id;

        // Add banner type class for different gradient styles
        if (banner.type) {
          card.classList.add(`banner-type-${banner.type}`);
        }

        // Set background image from banner data (if it exists)
        if (banner.image) {
          const img = new Image();
          img.onload = () => {
            card.style.backgroundImage = `url("${banner.image}")`;
            console.log(`[Summon] Loaded image: ${banner.image}`);
          };
          img.onerror = () => {
            console.warn(`[Summon] Image not found: ${banner.image} - using gradient fallback`);
          };
          img.src = banner.image;
        }

        // Add title
        const title = document.createElement('div');
        title.className = 'summon-banner-title';
        title.textContent = banner.name;
        card.appendChild(title);

        // Add subtitle/description
        const subtitle = document.createElement('div');
        subtitle.className = 'summon-banner-subtitle';
        subtitle.textContent = banner.description || banner.subtitle || '';
        card.appendChild(subtitle);

        // Click handler - navigate to summon.html with banner ID
        card.addEventListener('click', () => {
          console.log(`[Summon] Banner clicked: ${banner.name}`);
          navigateTo('summon.html', { banner: banner.id });
        });

        track.appendChild(card);
      });

      carousel.appendChild(track);

      // Create navigation arrows
      const leftArrow = document.createElement('div');
      leftArrow.className = 'summon-carousel-arrow left';
      leftArrow.innerHTML = '◀';
      carousel.appendChild(leftArrow);

      const rightArrow = document.createElement('div');
      rightArrow.className = 'summon-carousel-arrow right';
      rightArrow.innerHTML = '▶';
      carousel.appendChild(rightArrow);

      // Create navigation dots
      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'summon-carousel-dots';
      summonsData.banners.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = `summon-carousel-dot ${index === 0 ? 'active' : ''}`;
        dot.dataset.index = index;
        dotsContainer.appendChild(dot);
      });
      carousel.appendChild(dotsContainer);

      // Initialize carousel functionality
      initCarouselControls(carousel, track, summonsData.banners.length);

      console.log(`[Navigation] Loaded ${summonsData.banners.length} summon banners`);
    } catch (err) {
      console.error("[Navigation] Failed to load summon banners:", err);
    }
  }

  // ---------- Carousel Controls (Auto-advance, Arrows, Dots) ----------
  function initCarouselControls(carousel, track, totalBanners) {
    let currentIndex = 0;
    let autoAdvanceInterval = null;

    function goToSlide(index) {
      currentIndex = (index + totalBanners) % totalBanners;
      const offset = -currentIndex * 380; // 380px per banner
      track.style.transform = `translateX(${offset}px)`;

      // Update dots
      const dots = carousel.querySelectorAll('.summon-carousel-dot');
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
      });
    }

    function nextSlide() {
      goToSlide(currentIndex + 1);
    }

    function prevSlide() {
      goToSlide(currentIndex - 1);
    }

    // Arrow navigation
    const leftArrow = carousel.querySelector('.summon-carousel-arrow.left');
    const rightArrow = carousel.querySelector('.summon-carousel-arrow.right');

    if (leftArrow) {
      leftArrow.addEventListener('click', () => {
        prevSlide();
        resetAutoAdvance();
      });
    }

    if (rightArrow) {
      rightArrow.addEventListener('click', () => {
        nextSlide();
        resetAutoAdvance();
      });
    }

    // Dot navigation
    const dots = carousel.querySelectorAll('.summon-carousel-dot');
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const index = parseInt(dot.dataset.index);
        goToSlide(index);
        resetAutoAdvance();
      });
    });

    // Auto-advance every 5 seconds
    function startAutoAdvance() {
      autoAdvanceInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoAdvance() {
      if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
        autoAdvanceInterval = null;
      }
    }

    function resetAutoAdvance() {
      stopAutoAdvance();
      startAutoAdvance();
    }

    // Pause on hover
    carousel.addEventListener('mouseenter', stopAutoAdvance);
    carousel.addEventListener('mouseleave', startAutoAdvance);

    // Start auto-advance
    startAutoAdvance();

    console.log('[Navigation] Carousel controls initialized with auto-advance');
  }

  // ---------- Settings Menu ----------
  function openSettingsMenu() {
    navigateTo('settings.html');
  }

  // ---------- Background Changer ----------
  function changeBackground(num) {
    const el = document.getElementById("full-bg");
    if (!el) return;

    for (let i = 1; i <= 10; i++) {
      el.classList.remove(`bg-${i}`);
    }
    el.classList.add(`bg-${num}`);
    console.log(`[Navigation] Background changed to bg-${num}`);
  }

  // ---------- Username Click Handler ----------
  function initUsernameClick() {
    const usernameElement = document.getElementById('player-username');
    if (usernameElement) {
      usernameElement.addEventListener('click', () => {
        // Open settings modal instead of old username editor
        if (typeof window.SettingsModal !== "undefined") {
          window.SettingsModal.open();
        }
      });
    }
  }

  // ---------- Initialization ----------
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initBannerButtons();
        initHudButtons();
        initBottomIcons();
        initSummonBanners();
        initUsernameClick();
        console.log("[Navigation] Navigation system initialized");
      });
    } else {
      initBannerButtons();
      initHudButtons();
      initBottomIcons();
      initSummonBanners();
      initUsernameClick();
      console.log("[Navigation] Navigation system initialized");
    }
  }

  // Auto-initialize
  init();

  // Public API
  global.Navigation = {
    navigateTo,
    openSettingsMenu,
    changeBackground
  };

})(window);
