// js/music-player.js - Settings-modal facade over AudioManager's music
//
// Background music is owned by js/audio-manager.js (per-page tracks, loops,
// crossfades). This keeps the older MusicPlayer API used by
// js/settings-modal.js working and routes it to the shared settings in
// 'blazing_audio_settings'.

class MusicPlayer {
  get _am() {
    const am = window.AudioManager || null;
    if (am && !am.initialized) am.init(); // settings are read in init()
    return am;
  }

  // Kept for older callers; AudioManager starts page music itself
  init() {}

  get isPlaying() {
    return this._am ? this._am.musicEnabled : false;
  }

  get volume() {
    return this._am ? this._am.volumes.music : 0.5;
  }

  get isMuted() {
    return this._am ? this._am.muted : false;
  }

  get currentTrack() {
    return this._am ? this._am.musicPlaying : null;
  }

  /** Turn music on (settings toggle) */
  play() {
    this._am?.setMusicEnabled(true);
    this.updateUI();
  }

  /** Turn music off (settings toggle) */
  pause() {
    this._am?.setMusicEnabled(false);
    this.updateUI();
  }

  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Music volume (0.0 to 1.0) */
  setVolume(vol) {
    this._am?.setMusicVolume(vol);
    this.updateUI();
  }

  volumeUp() {
    this.setVolume(this.volume + 0.1);
  }

  volumeDown() {
    this.setVolume(this.volume - 0.1);
  }

  toggleMute() {
    this._am?.toggleMute();
    this.updateUI();
  }

  /** Switch track by AudioManager track name (e.g. 'village', 'boss') */
  changeTrack(name) {
    this._am?.playMusic(name);
  }

  /**
   * Update UI elements (for settings modal)
   */
  updateUI() {
    const musicToggle = document.getElementById('setting-music-enabled');
    if (musicToggle) {
      musicToggle.checked = this.isPlaying;
    }

    const volumeSlider = document.getElementById('setting-music-volume');
    if (volumeSlider) {
      volumeSlider.value = this.volume * 100;
    }

    const volumeDisplay = document.getElementById('music-volume-display');
    if (volumeDisplay) {
      volumeDisplay.textContent = Math.round(this.volume * 100) + '%';
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isPlaying: this.isPlaying,
      volume: this.volume,
      isMuted: this.isMuted,
      currentTrack: this.currentTrack
    };
  }
}

// Global instance
window.MusicPlayer = new MusicPlayer();
