// js/audio-manager.js - Comprehensive Audio System with Howler.js
(() => {
  "use strict";

  /**
   * AudioManager - Centralized audio system for the entire game
   * Uses Howler.js for reliable cross-browser audio playback
   *
   * Features:
   * - Background music with looping
   * - Sound effects with sprite support
   * - Volume controls (master, music, sfx)
   * - Fade in/out for smooth transitions
   * - Mobile touch unlock support
   * - LocalStorage for volume preferences
   */
  const AudioManager = {
    // Sound instances
    sounds: {},

    // Volume levels (0.0 to 1.0)
    volumes: {
      master: 0.7,
      music: 0.5,
      sfx: 0.8
    },

    // State
    initialized: false,
    musicPlaying: null,
    muted: false,

    /**
     * Initialize audio system
     * Call this once when the game loads
     */
    init() {
      if (this.initialized) return;

      console.log('[AudioManager] Initializing audio system...');

      // Load volume preferences
      this.loadVolumeSettings();

      // Define all sounds
      this.defineSounds();

      // Setup mobile unlock (iOS requires user interaction)
      this.setupMobileUnlock();

      this.initialized = true;
      console.log('[AudioManager] ✅ Audio system ready');
    },

    /**
     * Define all game sounds
     */
    defineSounds() {
      if (!window.Howl) {
        console.warn('[AudioManager] Howler.js not loaded, audio disabled');
        return;
      }

      // Background Music
      // Using existing music file location
      this.sounds.battleBGM = new Howl({
        src: ['assets/music/general.mp3'],
        loop: true,
        volume: this.getEffectiveVolume('music'),
        preload: true,
        onload: () => console.log('[AudioManager] Battle BGM loaded'),
        onloaderror: (id, err) => console.error('[AudioManager] Failed to load battle BGM:', err)
      });

      // Sound Effects - Using proper assets/audio/sfx/ structure
      // These will fail gracefully if files don't exist
      this.sounds.uiClick = new Howl({
        src: ['assets/audio/sfx/ui_click.mp3'],
        volume: this.getEffectiveVolume('sfx'),
        preload: false
      });

      this.sounds.hit = new Howl({
        src: ['assets/audio/sfx/hit.mp3'],
        volume: this.getEffectiveVolume('sfx'),
        preload: false
      });

      this.sounds.critical = new Howl({
        src: ['assets/audio/sfx/critical.mp3'],
        volume: this.getEffectiveVolume('sfx') * 1.2,
        preload: false
      });

      this.sounds.jutsu = new Howl({
        src: ['assets/audio/sfx/jutsu.mp3'],
        volume: this.getEffectiveVolume('sfx'),
        preload: false
      });

      this.sounds.ultimate = new Howl({
        src: ['assets/audio/sfx/ultimate.mp3'],
        volume: this.getEffectiveVolume('sfx') * 1.3,
        preload: false
      });

      this.sounds.summon = new Howl({
        src: ['assets/audio/sfx/summon.mp3'],
        volume: this.getEffectiveVolume('sfx') * 1.5,
        preload: false
      });

      this.sounds.victory = new Howl({
        src: ['assets/audio/sfx/victory.mp3'],
        volume: this.getEffectiveVolume('sfx'),
        preload: false
      });

      this.sounds.defeat = new Howl({
        src: ['assets/audio/sfx/defeat.mp3'],
        volume: this.getEffectiveVolume('sfx'),
        preload: false
      });

      console.log('[AudioManager] Defined', Object.keys(this.sounds).length, 'sounds');
    },

    /**
     * Setup mobile audio unlock
     * iOS requires user interaction before playing audio
     */
    setupMobileUnlock() {
      const unlock = () => {
        // Play and immediately pause a sound to unlock
        if (this.sounds.battleBGM && !this.sounds.battleBGM.playing()) {
          this.sounds.battleBGM.play();
          this.sounds.battleBGM.pause();
        }

        // Remove listeners
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('click', unlock);

        console.log('[AudioManager] Mobile audio unlocked');
      };

      document.addEventListener('touchstart', unlock);
      document.addEventListener('click', unlock);
    },

    /**
     * Calculate effective volume (master * category)
     */
    getEffectiveVolume(category) {
      if (this.muted) return 0;
      return this.volumes.master * this.volumes[category];
    },

    /**
     * Play background music
     */
    playBattleMusic() {
      if (!this.sounds.battleBGM) return;

      if (this.sounds.battleBGM.playing()) return;

      console.log('[AudioManager] Playing battle music');
      this.sounds.battleBGM.volume(this.getEffectiveVolume('music'));
      this.sounds.battleBGM.fade(0, this.getEffectiveVolume('music'), 1000);
      this.sounds.battleBGM.play();
      this.musicPlaying = 'battle';
    },

    /**
     * Stop background music with fade out
     */
    stopMusic(fadeDuration = 1000) {
      if (!this.sounds.battleBGM || !this.sounds.battleBGM.playing()) return;

      console.log('[AudioManager] Stopping music');
      this.sounds.battleBGM.fade(this.sounds.battleBGM.volume(), 0, fadeDuration);

      setTimeout(() => {
        this.sounds.battleBGM.stop();
        this.musicPlaying = null;
      }, fadeDuration);
    },

    /**
     * Play sound effect
     */
    playSFX(soundName) {
      const sound = this.sounds[soundName];
      if (!sound) {
        // console.warn(\`[AudioManager] Sound "\${soundName}" not found\`);
        return;
      }

      // Don't play if muted
      if (this.muted) return;

      // Set volume and play
      sound.volume(this.getEffectiveVolume('sfx'));
      sound.play();
    },

    /**
     * Set master volume (0.0 to 1.0)
     */
    setMasterVolume(volume) {
      this.volumes.master = Math.max(0, Math.min(1, volume));
      this.updateAllVolumes();
      this.saveVolumeSettings();
    },

    /**
     * Set music volume (0.0 to 1.0)
     */
    setMusicVolume(volume) {
      this.volumes.music = Math.max(0, Math.min(1, volume));
      if (this.sounds.battleBGM) {
        this.sounds.battleBGM.volume(this.getEffectiveVolume('music'));
      }
      this.saveVolumeSettings();
    },

    /**
     * Set SFX volume (0.0 to 1.0)
     */
    setSFXVolume(volume) {
      this.volumes.sfx = Math.max(0, Math.min(1, volume));
      this.saveVolumeSettings();
    },

    /**
     * Toggle mute
     */
    toggleMute() {
      this.muted = !this.muted;
      this.updateAllVolumes();
      this.saveVolumeSettings();
      return this.muted;
    },

    /**
     * Update all sound volumes
     */
    updateAllVolumes() {
      if (this.sounds.battleBGM) {
        this.sounds.battleBGM.volume(this.getEffectiveVolume('music'));
      }
    },

    /**
     * Save volume settings to localStorage
     */
    saveVolumeSettings() {
      const settings = {
        master: this.volumes.master,
        music: this.volumes.music,
        sfx: this.volumes.sfx,
        muted: this.muted
      };
      localStorage.setItem('blazing_audio_settings', JSON.stringify(settings));
    },

    /**
     * Load volume settings from localStorage
     */
    loadVolumeSettings() {
      const saved = localStorage.getItem('blazing_audio_settings');
      if (!saved) return;

      try {
        const settings = JSON.parse(saved);
        this.volumes.master = settings.master ?? 0.7;
        this.volumes.music = settings.music ?? 0.5;
        this.volumes.sfx = settings.sfx ?? 0.8;
        this.muted = settings.muted ?? false;
        console.log('[AudioManager] Loaded volume settings:', this.volumes);
      } catch (e) {
        console.error('[AudioManager] Failed to load volume settings:', e);
      }
    }
  };

  // Export to window
  window.AudioManager = AudioManager;

  // Auto-initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AudioManager.init());
  } else {
    AudioManager.init();
  }

  console.log("[AudioManager] Module loaded ✅");
})();
