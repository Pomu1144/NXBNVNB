// js/storage-manager.js - Enhanced Storage System with localForage
(() => {
  "use strict";

  /**
   * StorageManager - Async storage wrapper with localForage
   * Provides backwards compatibility with localStorage while offering better performance
   *
   * Features:
   * - Async storage (IndexedDB > WebSQL > localStorage fallback)
   * - 50MB+ storage limit (vs 5MB for localStorage)
   * - Automatic JSON serialization
   * - Migration from localStorage
   * - Type-safe getters/setters
   */
  const StorageManager = {
    initialized: false,
    migrated: false,

    /**
     * Initialize storage system
     */
    async init() {
      if (this.initialized) return;

      if (!window.localforage) {
        console.warn('[StorageManager] localForage not loaded, using localStorage fallback');
        this.initialized = true;
        return;
      }

      // Configure localForage
      localforage.config({
        name: 'NarutoBlazingDB',
        storeName: 'blazing_data',
        description: 'Naruto Blazing game data storage'
      });

      console.log('[StorageManager] Initializing with localForage...');
      console.log('[StorageManager] Driver:', await localforage.driver());

      // Migrate data from localStorage if needed
      await this.migrateFromLocalStorage();

      this.initialized = true;
      console.log('[StorageManager] ✅ Storage system ready');
    },

    /**
     * Migrate existing localStorage data to localForage
     */
    async migrateFromLocalStorage() {
      if (this.migrated) return;

      const migrationKey = '_blazing_migration_v2_complete';
      const alreadyMigrated = localStorage.getItem(migrationKey);
      
      if (alreadyMigrated) {
        this.migrated = true;
        return;
      }

      console.log('[StorageManager] Migrating from localStorage...');

      const keysToMigrate = [
        'blazing_inventory_v2',
        'blazing_teams_v1',
        'blazing_resources_v1',
        'blazing_equipped_ultimates',
        'blazing_audio_settings',
        'currentMissionId',
        'currentDifficulty'
      ];

      let migrated = 0;
      for (const key of keysToMigrate) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            // Try to parse as JSON, or store as string
            let data;
            try {
              data = JSON.parse(value);
            } catch (e) {
              data = value;
            }
            await localforage.setItem(key, data);
            migrated++;
          } catch (e) {
            console.error(`[StorageManager] Failed to migrate ${key}:`, e);
          }
        }
      }

      // Mark migration as complete
      localStorage.setItem(migrationKey, 'true');
      this.migrated = true;

      console.log(`[StorageManager] ✅ Migrated ${migrated} keys from localStorage`);
    },

    /**
     * Get item from storage
     * @param {string} key - Storage key
     * @returns {Promise<any>} Stored value
     */
    async get(key) {
      if (!window.localforage) {
        const value = localStorage.getItem(key);
        try {
          return value ? JSON.parse(value) : null;
        } catch (e) {
          return value;
        }
      }

      return await localforage.getItem(key);
    },

    /**
     * Set item in storage
     * @param {string} key - Storage key
     * @param {any} value - Value to store
     */
    async set(key, value) {
      if (!window.localforage) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return;
      }

      await localforage.setItem(key, value);
    },

    /**
     * Remove item from storage
     * @param {string} key - Storage key
     */
    async remove(key) {
      if (!window.localforage) {
        localStorage.removeItem(key);
        return;
      }

      await localforage.removeItem(key);
    },

    /**
     * Clear all storage
     */
    async clear() {
      if (!window.localforage) {
        localStorage.clear();
        return;
      }

      await localforage.clear();
    },

    /**
     * Get all keys
     * @returns {Promise<string[]>}
     */
    async keys() {
      if (!window.localforage) {
        return Object.keys(localStorage);
      }

      return await localforage.keys();
    },

    /**
     * Get storage size estimate
     * @returns {Promise<number>} Size in bytes
     */
    async getSize() {
      if (!window.localforage) {
        // Rough estimate for localStorage
        return JSON.stringify(localStorage).length;
      }

      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return estimate.usage || 0;
      }

      return 0;
    },

    /**
     * Synchronous get (use sparingly, blocks thread)
     * Falls back to localStorage
     */
    getSync(key) {
      const value = localStorage.getItem(key);
      try {
        return value ? JSON.parse(value) : null;
      } catch (e) {
        return value;
      }
    },

    /**
     * Synchronous set (use sparingly, blocks thread)
     * Falls back to localStorage
     */
    setSync(key, value) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  };

  // Export to window
  window.StorageManager = StorageManager;

  // Auto-initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await StorageManager.init();
    });
  } else {
    StorageManager.init().catch(console.error);
  }

  console.log("[StorageManager] Module loaded ✅");
})();
