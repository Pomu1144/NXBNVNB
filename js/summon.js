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

      // Load first banner
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
  //  Load a specific banner
  // =======================================================
  function loadBanner(index) {
    const banner = summonData.getBanner(index);
    if (!banner) {
      console.warn('⚠ Banner not found:', index);
      return;
    }

    currentBannerIndex = index;

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

    // Reset summon engine session
    if (window.FibonacciSummonEngine) {
      window.FibonacciSummonEngine.setPool(currentPool, featuredCharacters);
      window.FibonacciSummonEngine.resetSession();
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
  //  Show Featured Units Modal
  // =======================================================
  function showFeaturedUnits() {
    if (featuredCharacters.length === 0) {
      alert('No featured units in this banner.');
      return;
    }

    const text = featuredCharacters
      .map(c => `• ${c.name} (${c.rarity}★)`)
      .join('\n');

    alert(`Featured Units:\n\n${text}`);
  }

  // =======================================================
  //  Show Summon Contents & Rates
  // =======================================================
  function showSummonContents() {
    const rates = window.FibonacciSummonEngine?.getRatesDisplay();
    if (!rates) return;

    const message = `
Summon Contents
━━━━━━━━━━━━━━━━━━━

Current Rates:
• Multi Step: ${rates.multiStep}
• Gold Chance: ${rates.goldChance}
• Featured Chance: ${rates.featuredChance}

Total Characters Available: ${currentPool.length}
Featured Characters: ${featuredCharacters.length}

Session Statistics:
${rates.totalGolds}
${rates.featuredGolds}
`;

    alert(message);
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
