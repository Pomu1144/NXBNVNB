// js/user-profile.js
// User Profile Management System
// Handles username, player settings, and profile data

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_user_profile_v1";

  // Default profile structure
  const DEFAULT_PROFILE = {
    username: "Ninja",
    joinDate: null,
    lastLogin: null,
    preferences: {
      theme: "default",
      notifications: true,
      autoSave: true
    }
  };

  class UserProfile {
    constructor() {
      this.profile = this.load();
      // Set join date if new user
      if (!this.profile.joinDate) {
        this.profile.joinDate = new Date().toISOString();
        this.save();
      }
      this.updateLastLogin();
    }

    /**
     * Load profile from localStorage
     */
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          console.log("📝 No profile found. Creating new profile...");
          return { ...DEFAULT_PROFILE };
        }
        const parsed = JSON.parse(raw);
        console.log("✅ Profile loaded:", parsed.username);
        return { ...DEFAULT_PROFILE, ...parsed };
      } catch (err) {
        console.error("❌ Error loading profile:", err);
        return { ...DEFAULT_PROFILE };
      }
    }

    /**
     * Save profile to localStorage
     */
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
        console.log("💾 Profile saved:", this.profile.username);
        return true;
      } catch (err) {
        console.error("❌ Error saving profile:", err);
        return false;
      }
    }

    /**
     * Get username
     */
    getUsername() {
      return this.profile.username || "Ninja";
    }

    /**
     * Set username
     */
    setUsername(newName) {
      if (!newName || typeof newName !== "string") {
        console.error("❌ Invalid username");
        return false;
      }

      const trimmed = newName.trim();
      if (trimmed.length === 0) {
        console.error("❌ Username cannot be empty");
        return false;
      }

      if (trimmed.length > 20) {
        console.error("❌ Username too long (max 20 characters)");
        return false;
      }

      this.profile.username = trimmed;
      this.save();
      console.log(`✅ Username changed to: ${trimmed}`);

      // Dispatch event for UI updates
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("usernameChanged", {
          detail: { username: trimmed }
        }));
      }

      return true;
    }

    /**
     * Update last login timestamp
     */
    updateLastLogin() {
      this.profile.lastLogin = new Date().toISOString();
      this.save();
    }

    /**
     * Get full profile
     */
    getProfile() {
      return { ...this.profile };
    }

    /**
     * Update preference
     */
    setPreference(key, value) {
      if (this.profile.preferences.hasOwnProperty(key)) {
        this.profile.preferences[key] = value;
        this.save();
        return true;
      }
      return false;
    }

    /**
     * Get preference
     */
    getPreference(key) {
      return this.profile.preferences[key];
    }

    /**
     * Reset profile to defaults
     */
    reset() {
      this.profile = { ...DEFAULT_PROFILE };
      this.profile.joinDate = new Date().toISOString();
      this.save();
      console.log("🔄 Profile reset to defaults");

      // Dispatch event for UI updates
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("usernameChanged", {
          detail: { username: this.profile.username }
        }));
      }
    }

    /**
     * Export profile data
     */
    export() {
      return JSON.stringify(this.profile, null, 2);
    }

    /**
     * Import profile data
     */
    import(jsonString) {
      try {
        const imported = JSON.parse(jsonString);
        this.profile = { ...DEFAULT_PROFILE, ...imported };
        this.save();
        console.log("✅ Profile imported successfully");
        return true;
      } catch (err) {
        console.error("❌ Error importing profile:", err);
        return false;
      }
    }
  }

  // Create singleton instance
  const userProfile = new UserProfile();

  // Export to global scope
  global.UserProfile = userProfile;

  // Helper functions for quick access
  global.getUsername = () => userProfile.getUsername();
  global.setUsername = (name) => userProfile.setUsername(name);

  console.log("✅ UserProfile system initialized");

})(window);
