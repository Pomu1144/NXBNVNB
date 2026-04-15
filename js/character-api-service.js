/**
 * Character API Service
 * Handles loading characters from REST API with local caching
 */

class CharacterAPIService {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl || 'https://your-api.com';
    this.cacheKey = 'blazing_characters_cache_v2';
    this.cacheTimestampKey = 'blazing_characters_cache_timestamp';
    this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Load characters with smart caching
   * 1. Check localStorage cache first (instant)
   * 2. If cache expired or missing, fetch from API
   * 3. Update cache in background
   */
  async loadCharacters() {
    console.log('📦 [CharacterAPI] Loading characters...');

    // Try cache first for instant load
    const cachedData = this.getCachedCharacters();
    if (cachedData) {
      console.log('✅ [CharacterAPI] Loaded from cache:', cachedData.length, 'characters');

      // Check if cache needs refresh in background
      if (this.isCacheExpired()) {
        console.log('🔄 [CharacterAPI] Cache expired, refreshing in background...');
        this.refreshCacheInBackground();
      }

      return cachedData;
    }

    // No cache - must fetch from API
    console.log('🌐 [CharacterAPI] No cache found, fetching from API...');
    return await this.fetchFromAPI();
  }

  /**
   * Get characters from localStorage cache
   */
  getCachedCharacters() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('[CharacterAPI] Cache read error:', error);
    }
    return null;
  }

  /**
   * Check if cache is expired
   */
  isCacheExpired() {
    try {
      const timestamp = localStorage.getItem(this.cacheTimestampKey);
      if (!timestamp) return true;

      const age = Date.now() - parseInt(timestamp);
      return age > this.cacheDuration;
    } catch (error) {
      return true;
    }
  }

  /**
   * Fetch characters from REST API
   */
  async fetchFromAPI() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/characters`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const characters = await response.json();

      // Update cache
      this.updateCache(characters);

      console.log('✅ [CharacterAPI] Fetched from API:', characters.length, 'characters');
      return characters;

    } catch (error) {
      console.error('❌ [CharacterAPI] API fetch failed:', error);

      // Fallback to expired cache if available
      const cachedData = this.getCachedCharacters();
      if (cachedData) {
        console.warn('⚠️ [CharacterAPI] Using expired cache as fallback');
        return cachedData;
      }

      throw new Error('Failed to load characters and no cache available');
    }
  }

  /**
   * Update localStorage cache
   */
  updateCache(characters) {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(characters));
      localStorage.setItem(this.cacheTimestampKey, Date.now().toString());
      console.log('💾 [CharacterAPI] Cache updated');
    } catch (error) {
      console.warn('[CharacterAPI] Failed to update cache:', error);
      // Cache update failure is non-critical
    }
  }

  /**
   * Refresh cache in background without blocking
   */
  async refreshCacheInBackground() {
    try {
      const characters = await this.fetchFromAPI();
      console.log('✅ [CharacterAPI] Background cache refresh complete');
    } catch (error) {
      console.warn('[CharacterAPI] Background refresh failed:', error);
      // Non-critical - user already has cached data
    }
  }

  /**
   * Force refresh cache (useful for admin/debug)
   */
  async forceRefresh() {
    console.log('🔄 [CharacterAPI] Forcing cache refresh...');
    localStorage.removeItem(this.cacheKey);
    localStorage.removeItem(this.cacheTimestampKey);
    return await this.loadCharacters();
  }

  /**
   * Get single character by ID (with caching)
   */
  async getCharacterById(id) {
    const characters = await this.loadCharacters();
    return characters.find(char => char.id === id);
  }

  /**
   * Search characters (with caching)
   */
  async searchCharacters(query) {
    const characters = await this.loadCharacters();
    const lowerQuery = query.toLowerCase();

    return characters.filter(char =>
      char.name.toLowerCase().includes(lowerQuery) ||
      char.id.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Clear cache (for debugging)
   */
  clearCache() {
    localStorage.removeItem(this.cacheKey);
    localStorage.removeItem(this.cacheTimestampKey);
    console.log('🗑️ [CharacterAPI] Cache cleared');
  }
}

// Global instance
window.CharacterAPI = new CharacterAPIService();

// Usage example:
// const characters = await window.CharacterAPI.loadCharacters();
