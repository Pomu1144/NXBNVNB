// js/player-save-system.js - Player Save/Load System for Cross-Device Play

class PlayerSaveSystem {
  constructor() {
    this.SAVE_VERSION = '1.0.0';
  }

  /**
   * Export all player data to a save object
   * @returns {Object} Complete player save data
   */
  async exportSaveData() {
    try {
      // Collect all player data from localStorage
      const saveData = {
        version: this.SAVE_VERSION,
        exportDate: new Date().toISOString(),
        playerId: this.getOrCreatePlayerId(),

        // Character Inventory
        characters: this.getCharacterData(),

        // Resources
        resources: this.getResourceData(),

        // User Profile
        profile: this.getProfileData(),

        // Ninja Rank & Progress
        progress: this.getProgressData(),

        // Mailbox/Present Box
        mailbox: this.getMailboxData(),

        // Gift Codes (redeemed codes)
        giftCodes: this.getGiftCodeData(),

        // Settings
        settings: this.getSettingsData()
      };

      console.log('✅ Player save data exported successfully');
      return saveData;
    } catch (error) {
      console.error('❌ Failed to export save data:', error);
      throw error;
    }
  }

  /**
   * Import player data from a save object
   * @param {Object} saveData - Save data object
   * @param {boolean} merge - If true, merge with existing data. If false, overwrite.
   * @returns {Object} Import result
   */
  async importSaveData(saveData, merge = false) {
    try {
      // Validate save data
      if (!saveData || !saveData.version) {
        throw new Error('Invalid save data format');
      }

      console.log(`📥 Importing save data (version ${saveData.version})...`);

      // Backup current data before import
      const backup = await this.exportSaveData();
      sessionStorage.setItem('blazing_save_backup', JSON.stringify(backup));

      // Import each data type
      if (saveData.characters) {
        this.importCharacterData(saveData.characters, merge);
      }

      if (saveData.resources) {
        this.importResourceData(saveData.resources, merge);
      }

      if (saveData.profile) {
        this.importProfileData(saveData.profile, merge);
      }

      if (saveData.progress) {
        this.importProgressData(saveData.progress, merge);
      }

      if (saveData.mailbox) {
        this.importMailboxData(saveData.mailbox, merge);
      }

      if (saveData.giftCodes) {
        this.importGiftCodeData(saveData.giftCodes, merge);
      }

      if (saveData.settings) {
        this.importSettingsData(saveData.settings, merge);
      }

      console.log('✅ Player save data imported successfully');
      return { success: true, message: 'Save data imported successfully! Please reload the page.' };
    } catch (error) {
      console.error('❌ Failed to import save data:', error);
      return { success: false, message: 'Failed to import: ' + error.message };
    }
  }

  /**
   * Download save data as JSON file
   */
  async downloadSaveFile() {
    try {
      const saveData = await this.exportSaveData();
      const json = JSON.stringify(saveData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `blazing_save_${saveData.playerId}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('✅ Save file downloaded');
      return { success: true, message: 'Save file downloaded successfully!' };
    } catch (error) {
      console.error('❌ Failed to download save file:', error);
      return { success: false, message: 'Failed to download: ' + error.message };
    }
  }

  /**
   * Upload and import save file
   * @param {File} file - JSON save file
   * @param {boolean} merge - If true, merge with existing data
   */
  async uploadSaveFile(file, merge = false) {
    try {
      const text = await file.text();
      const saveData = JSON.parse(text);
      return await this.importSaveData(saveData, merge);
    } catch (error) {
      console.error('❌ Failed to upload save file:', error);
      return { success: false, message: 'Failed to read file: ' + error.message };
    }
  }

  // ==================== Data Getters ====================

  getCharacterData() {
    const data = localStorage.getItem('blazing_inventory_v2');
    return data ? JSON.parse(data) : [];
  }

  getResourceData() {
    const data = localStorage.getItem('blazing_resources_v1');
    return data ? JSON.parse(data) : null;
  }

  getProfileData() {
    return {
      username: localStorage.getItem('blazing-login-username') || 'Ninja',
      userProfile: localStorage.getItem('blazing_user_profile_v1')
    };
  }

  getProgressData() {
    return {
      ninjaRank: localStorage.getItem('blazing_player_rank'),
      ninjaExp: localStorage.getItem('blazing_player_exp'),
      dailyMissions: localStorage.getItem('blazing_daily_progress_v1'),
      missionProgress: localStorage.getItem('blazing_mission_progress_v1'),
      panelMissions: localStorage.getItem('blazing_panel_mission_progress'),
      achievements: localStorage.getItem('blazing_achievements_v1'),
      teams: localStorage.getItem('blazing_teams_v1'),
      teamNames: localStorage.getItem('blazing_team_names'),
      cardLevels: localStorage.getItem('blazing_card_levels_v1'),
      characterEquip: localStorage.getItem('blazing_character_equip_v1'),
      equippedUltimates: localStorage.getItem('blazing_equipped_ultimates'),
      summonState: localStorage.getItem('blazing_summon_state_v1')
    };
  }

  getMailboxData() {
    const data = localStorage.getItem('mailboxMessages');
    return data ? JSON.parse(data) : [];
  }

  getGiftCodeData() {
    const data = localStorage.getItem('blazing_redeemed_codes_v1');
    return data ? JSON.parse(data) : [];
  }

  getSettingsData() {
    return {
      audio: localStorage.getItem('blazing_audio_settings'),
      background: localStorage.getItem('blazing_background')
    };
  }

  // ==================== Data Setters ====================

  importCharacterData(data, merge) {
    if (merge) {
      const existing = this.getCharacterData();
      const combined = [...existing, ...data];
      localStorage.setItem('blazing_inventory_v2', JSON.stringify(combined));
    } else {
      localStorage.setItem('blazing_inventory_v2', JSON.stringify(data));
    }
  }

  importResourceData(data, merge) {
    if (merge && data) {
      const existing = this.getResourceData() || {};
      const combined = { ...existing, ...data };
      localStorage.setItem('blazing_resources_v1', JSON.stringify(combined));
    } else if (data) {
      localStorage.setItem('blazing_resources_v1', JSON.stringify(data));
    }
  }

  importProfileData(data, merge) {
    if (!merge || !localStorage.getItem('blazing-login-username')) {
      if (data.username) {
        localStorage.setItem('blazing-login-username', data.username);
      }
      if (data.userProfile) {
        localStorage.setItem('blazing_user_profile_v1', data.userProfile);
      }
    }
  }

  importProgressData(data, merge) {
    if (!merge) {
      const keyMap = {
        ninjaRank: 'blazing_player_rank',
        ninjaExp: 'blazing_player_exp',
        dailyMissions: 'blazing_daily_progress_v1',
        missionProgress: 'blazing_mission_progress_v1',
        panelMissions: 'blazing_panel_mission_progress',
        achievements: 'blazing_achievements_v1',
        teams: 'blazing_teams_v1',
        teamNames: 'blazing_team_names',
        cardLevels: 'blazing_card_levels_v1',
        characterEquip: 'blazing_character_equip_v1',
        equippedUltimates: 'blazing_equipped_ultimates',
        summonState: 'blazing_summon_state_v1'
      };
      Object.entries(keyMap).forEach(([field, storageKey]) => {
        if (data[field] !== null && data[field] !== undefined) {
          localStorage.setItem(storageKey, data[field]);
        }
      });
    }
  }

  importMailboxData(data, merge) {
    if (merge) {
      const existing = this.getMailboxData();
      const combined = [...existing, ...data];
      localStorage.setItem('mailboxMessages', JSON.stringify(combined));
    } else {
      localStorage.setItem('mailboxMessages', JSON.stringify(data));
    }
  }

  importGiftCodeData(data, merge) {
    if (merge) {
      const existing = this.getGiftCodeData();
      const combined = [...existing, ...data];
      localStorage.setItem('blazing_redeemed_codes_v1', JSON.stringify(combined));
    } else {
      localStorage.setItem('blazing_redeemed_codes_v1', JSON.stringify(data));
    }
  }

  importSettingsData(data, merge) {
    if (!merge) {
      if (data.audio) localStorage.setItem('blazing_audio_settings', data.audio);
      if (data.background) localStorage.setItem('blazing_background', data.background);
    }
  }

  // ==================== Utility Functions ====================

  getOrCreatePlayerId() {
    let playerId = localStorage.getItem('blazing_player_id');
    if (!playerId) {
      playerId = 'PLAYER_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('blazing_player_id', playerId);
    }
    return playerId;
  }

  /**
   * Restore from backup (stored in sessionStorage)
   */
  async restoreFromBackup() {
    try {
      const backup = sessionStorage.getItem('blazing_save_backup');
      if (!backup) {
        return { success: false, message: 'No backup found' };
      }

      const saveData = JSON.parse(backup);
      await this.importSaveData(saveData, false);

      return { success: true, message: 'Restored from backup successfully!' };
    } catch (error) {
      return { success: false, message: 'Failed to restore: ' + error.message };
    }
  }

  /**
   * Clear all player data (for testing/reset)
   */
  clearAllData() {
    const keys = [
      'blazing_inventory_v2',
      'blazing_resources_v1',
      'blazing-login-username',
      'blazing_user_profile_v1',
      'blazing_player_rank',
      'blazing_player_exp',
      'blazing_daily_progress_v1',
      'blazing_mission_progress_v1',
      'blazing_panel_mission_progress',
      'blazing_achievements_v1',
      'blazing_teams_v1',
      'blazing_team_names',
      'blazing_card_levels_v1',
      'blazing_character_equip_v1',
      'blazing_equipped_ultimates',
      'blazing_summon_state_v1',
      'mailboxMessages',
      'blazing_redeemed_codes_v1',
      'blazing_audio_settings',
      'blazing_background'
    ];

    keys.forEach(key => localStorage.removeItem(key));
    console.log('🧹 All player data cleared');
    return { success: true, message: 'All data cleared' };
  }
}

// Global instance
window.PlayerSaveSystem = new PlayerSaveSystem();

console.log('✅ Player Save System module loaded');
