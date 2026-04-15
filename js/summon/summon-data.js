// js/summon/summon-data.js - Summon Data Management

class SummonDataLoader {
  constructor() {
    this.banners = [];
    this.baseRates = {};
    this.characterPool = [];
    this.loaded = false;
  }

  async init() {
    try {
      // Load summon banners
      const summonResponse = await fetch('data/summon.json');
      if (!summonResponse.ok) {
        throw new Error(`HTTP ${summonResponse.status}: ${summonResponse.statusText}`);
      }
      const summonData = await summonResponse.json();

      // Validate summon data structure
      if (!summonData || typeof summonData !== 'object') {
        throw new Error('Invalid summon data structure');
      }

      // Handle both "pools" and "banners" field names for compatibility
      this.banners = Array.isArray(summonData.pools) ? summonData.pools :
                     Array.isArray(summonData.banners) ? summonData.banners : [];
      this.baseRates = summonData.baseRates || {
        '7star': 0.33,
        '6star': 3.0,
        '5star': 12.0,
        '4star': 84.67
      };

      // Load character pool
      const charsResponse = await fetch('data/characters.json');
      if (!charsResponse.ok) {
        throw new Error(`HTTP ${charsResponse.status}: ${charsResponse.statusText}`);
      }
      const charsData = await charsResponse.json();

      // Validate character data
      if (!charsData || (typeof charsData !== 'object' && !Array.isArray(charsData))) {
        throw new Error('Invalid character data structure');
      }

      this.characterPool = Array.isArray(charsData) ? charsData : Object.values(charsData);

      this.loaded = true;
      console.log('✅ Summon data loaded:', this.banners.length, 'banners');
      return true;
    } catch (error) {
      console.error('❌ Failed to load summon data:', error);
      return false;
    }
  }

  getBanners() {
    return this.banners;
  }

  getBanner(index) {
    return this.banners[index] || null;
  }

  getBannerById(id) {
    return this.banners.find(b => b.id === id) || null;
  }

  getFeaturedUnits(bannerIndex) {
    const banner = this.getBanner(bannerIndex);
    return banner?.featured || [];
  }

  getBaseRates() {
    return this.baseRates;
  }

  getCharacterPool() {
    return this.characterPool;
  }

  getCharactersByRarity(rarity) {
    return this.characterPool.filter(c => c.rarity === rarity);
  }

  isLoaded() {
    return this.loaded;
  }
}

// Global instance - Export to window for access from other modules
const summonData = new SummonDataLoader();
window.summonData = summonData;
