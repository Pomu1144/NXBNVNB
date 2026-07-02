// =======================================================
//  SUMMON SYSTEM - FULL FILE (FINAL VERSION)
//  Supports:
//  ✓ Standard Pool
//  ✓ Featured Units
//  ✓ Birthday "all versions"
//  ✓ Blazing Festival, Bash, Anniversary
//  ✓ Double Fibonacci Summon Engine
// =======================================================

(async function initSummoning() {
  console.log('🎴 Initializing Double Fibonacci Summon System...');

  let currentBannerIndex = 0;
  let allCharacters = [];
  let featuredCharacters = [];
  let currentPool = [];

  // =======================================================
  //  Build the full pool for a banner
  // =======================================================
  function buildBannerPool(banner) {
    let pool = [];

    // 0. Random-100 banner: pick 100 unique characters at their pre-evolved (starMinCode) form
    if (banner.type === 'random_100' || banner.useRandomPool) {
      // Playable units only — characters.json also holds props/items (powerRank 0)
      const preEvolved = allCharacters.filter(c => c.id && c.name && (Number(c.powerRank) || 0) > 0);
      const shuffled = [...preEvolved].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(100, shuffled.length));
      pool.push(...selected);
      // Still add featured units if any
      if (banner.featured && banner.featured.length > 0) {
        for (let id of banner.featured) {
          const char = allCharacters.find(c => c.id === id);
          if (char && !pool.find(p => p.id === id)) pool.push(char);
        }
      }
      return [...new Map(pool.map(c => [c.id, c])).values()];
    }

    // 1. Standard Pool
    if (banner.includeStandardPool && summonData.standardPool) {
      for (let id of summonData.standardPool) {
        const char = allCharacters.find(c => c.id === id);
        if (char) pool.push(char);
      }
    }

    // 2. Featured Units
    if (banner.featured && banner.featured.length > 0) {
      for (let id of banner.featured) {
        const char = allCharacters.find(c => c.id === id);
        if (char) pool.push(char);
      }
    }

    // 3. Birthday Banners → Add ALL Versions of Name
    if (banner.includes_all_versions && banner.character_name) {
      const nameLower = banner.character_name.toLowerCase();

      const versions = allCharacters.filter(c =>
        c.name.toLowerCase().includes(nameLower)
      );

      pool.push(...versions);
    }

    // 4. Remove duplicates
    const unique = [...new Map(pool.map(c => [c.id, c])).values()];

    return unique;
  }

  // =======================================================
  //  Initialize System
  // =======================================================
  async function initialize() {
    try {
      // Load summon JSON structure
      await summonData.init();

      // Load all characters
      const charsResponse = await fetch('data/characters.json');
      if (!charsResponse.ok)
        throw new Error(`HTTP ${charsResponse.status}: ${charsResponse.statusText}`);

      const charsData = await charsResponse.json();
      allCharacters = Object.values(charsData);

      // Initialize UI systems
      if (window.CharacterSelector)
        window.CharacterSelector.updatePools(allCharacters, []);

      if (window.SummonUI)
        window.SummonUI.init();

      if (window.SummonAnimator)
        window.SummonAnimator.init();

      // Build the banner preview strip, then load the first banner
      _injectBannerArtStyles();
      buildPreviewStrip();

      // Wire up the carousel controller (arrows + swipe)
      if (window.BannerCarousel) {
        window.BannerCarousel.init('banner-preview-scroll', 'main-carousel');
      }

      loadBanner(0);

      // Setup event listeners
      setupUIEvents();

      console.log('✅ Summon system initialized successfully');
      console.log(`📊 Total Characters Loaded: ${allCharacters.length}`);

    } catch (error) {
      console.error('❌ Failed to initialize summon system:', error);
    }
  }

  // =======================================================
  //  Banner artwork rendering
  // =======================================================
  function renderBannerArt(banner) {
    const carousel = document.getElementById('main-carousel');
    if (!carousel) return;

    const fallback = `
      <div class="banner-art banner-art-fallback">
        <div class="banner-art-fallback-name">${banner.name || 'Summon Banner'}</div>
        <div class="banner-art-fallback-sub">${banner.description || ''}</div>
      </div>`;

    if (banner.image) {
      carousel.innerHTML = `
        <div class="banner-art">
          <img src="${banner.image}" alt="${banner.name || 'Banner'}"
               draggable="false"
               onerror="this.parentElement.outerHTML = ${JSON.stringify(fallback).replace(/"/g, '&quot;')};">
        </div>`;
    } else {
      carousel.innerHTML = fallback;
    }
  }

  function buildPreviewStrip() {
    const strip = document.getElementById('banner-preview-scroll');
    if (!strip) return;

    const banners = summonData.getBanners();
    strip.innerHTML = banners.map((b, i) => `
      <div class="preview-item ${i === currentBannerIndex ? 'active' : ''}" data-index="${i}" title="${b.name || ''}">
        ${b.image
          ? `<img src="${b.image}" alt="" draggable="false" onerror="this.remove();">`
          : `<span class="preview-item-label">${(b.name || '?').slice(0, 14)}</span>`}
      </div>`).join('');

    strip.querySelectorAll('.preview-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index, 10);
        if (window.BannerCarousel) window.BannerCarousel.goTo(idx);
        else loadBanner(idx);
      });
    });
  }

  function _injectBannerArtStyles() {
    if (document.getElementById('banner-art-styles')) return;
    const s = document.createElement('style');
    s.id = 'banner-art-styles';
    s.textContent = `
      .banner-art { width:100%; height:100%; }
      .banner-art img {
        width:100%; height:100%; object-fit:cover; object-position:center;
        display:block; border-radius:inherit; pointer-events:none;
      }
      .banner-art-fallback {
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:8px; padding:18px; text-align:center;
        background:
          radial-gradient(circle at 30% 20%, rgba(212,175,55,0.16), transparent 55%),
          linear-gradient(135deg, rgba(20,24,52,0.95), rgba(8,10,24,0.95));
      }
      .banner-art-fallback-name {
        font-family:"Cinzel",serif; font-size:clamp(16px,2.6vw,26px); font-weight:700;
        color:#d4af37; letter-spacing:2px;
        text-shadow:0 0 18px rgba(212,175,55,0.45), 0 2px 4px rgba(0,0,0,0.9);
      }
      .banner-art-fallback-sub {
        font-family:"Cinzel",serif; font-size:clamp(10px,1.4vw,13px);
        color:rgba(217,179,98,0.7); max-width:70%;
      }
      #banner-preview-scroll .preview-item img {
        width:100%; height:100%; object-fit:cover; display:block; border-radius:inherit;
      }
      #banner-preview-scroll .preview-item-label {
        font-family:"Cinzel",serif; font-size:9px; color:#b8985f;
        display:flex; align-items:center; justify-content:center;
        width:100%; height:100%; text-align:center; padding:2px; overflow:hidden;
      }
    `;
    document.head.appendChild(s);
  }

  // =======================================================
  //  Load a specific banner
  // =======================================================
  function loadBanner(index) {
    const banner = summonData.getBanner(index);
    if (!banner) {
      console.warn('⚠ Banner not found:', index);
      return;
    }

    currentBannerIndex = index;

    // Render banner artwork in the carousel
    _injectBannerArtStyles();
    renderBannerArt(banner);

    // Build the FULL summon pool for this banner
    currentPool = buildBannerPool(banner);

    // Identify featured subset
    featuredCharacters =
      banner.featured?.map(id => allCharacters.find(c => c.id === id))
        .filter(Boolean) || [];

    // Update UI selector
    if (window.CharacterSelector)
      window.CharacterSelector.updatePools(currentPool, featuredCharacters);

    // Update Banner Info UI
    if (window.SummonUI)
      window.SummonUI.updateBannerInfo(banner);

    // Switch pity/step-up tracking to this banner (state persists per banner)
    if (window.FibonacciSummonEngine) {
      window.FibonacciSummonEngine.setActiveBanner(banner.id);
    }

    console.log(`📜 Loaded Banner: ${banner.name}`);
    console.log(`📦 Total Pool: ${currentPool.length} units`);
    console.log(`🎯 Featured: ${featuredCharacters.length} units`);
  }

  // =======================================================
  //  Setup UI Events
  // =======================================================
  function setupUIEvents() {
    const backBtn = document.getElementById('btn-back-to-home');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.location.href = 'village.html';
      });
    }

    const ratesBtn = document.getElementById('btn-rates');
    if (ratesBtn) {
      ratesBtn.addEventListener('click', () => {
        window.SummonUI?.showRatesInfo();
      });
    }

    const featuredBtn = document.getElementById('btn-featured');
    if (featuredBtn) {
      featuredBtn.addEventListener('click', () => {
        showFeaturedUnits();
      });
    }

    const contentsBtn = document.getElementById('btn-contents');
    if (contentsBtn) {
      contentsBtn.addEventListener('click', () => {
        showSummonContents();
      });
    }
  }

  // =======================================================
  //  Show Featured Units Modal (handled by summon.html inline)
  // =======================================================
  function showFeaturedUnits() {
    // Delegated to summon.html's inline info modal handler
  }

  // =======================================================
  //  Show Summon Contents (handled by summon.html inline)
  // =======================================================
  function showSummonContents() {
    // Delegated to summon.html's inline info modal handler
  }

  // =======================================================
  //  Start Initialization
  // =======================================================
  initialize();

  // Expose control for debugging
  window.SummonSystem = {
    loadBanner,
    getCurrentBanner: () => summonData.getBanner(currentBannerIndex),
    getFeaturedUnits: () => featuredCharacters,
    getAllCharacters: () => allCharacters,
    getCurrentPool: () => currentPool,
    getStats: () => window.FibonacciSummonEngine?.getStats(),
    resetEngine: () => window.FibonacciSummonEngine?.resetSession()
  };

})();
