// js/music-player.js - Background Music System

class MusicPlayer {
  constructor() {
    this.audio = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.volume = 0.5; // Default 50%
    this.isMuted = false;

    // Load preferences from localStorage
    this.loadPreferences();
  }

  /**
   * Initialize the music player
   */
  init(trackPath = 'assets/music/general.mp3') {
    // Create or reuse existing audio element
    this.audio = document.getElementById('game-music');

    if (!this.audio) {
      this.audio = new Audio();
      this.audio.id = 'game-music';
      this.audio.loop = true;
      this.audio.preload = 'auto';
      document.body.appendChild(this.audio);
    }

    // Set the track
    if (this.currentTrack !== trackPath) {
      this.currentTrack = trackPath;
      this.audio.src = trackPath;
    }

    // Apply saved preferences
    this.audio.volume = this.isMuted ? 0 : this.volume;

    // Add error event listener for debugging
    this.audio.addEventListener('error', (e) => {
      console.error('❌ Music failed to load:', {
        path: trackPath,
        error: this.audio.error?.message || 'Unknown error',
        code: this.audio.error?.code
      });
    });

    // Add loaded event listener
    this.audio.addEventListener('loadeddata', () => {
      console.log('✅ Music file loaded successfully:', trackPath);
    });

    // Auto-play if user had it playing before
    if (this.isPlaying) {
      this.play();
    }

    console.log('🎵 Music player initialized with track:', trackPath);
  }

  /**
   * Play the music
   */
  play() {
    if (!this.audio) {
      console.error('❌ Audio element not initialized');
      return;
    }

    // Check if audio source is set
    if (!this.audio.src) {
      console.error('❌ No audio source set');
      return;
    }

    console.log('🎵 Attempting to play music from:', this.audio.src);

    this.audio.play().then(() => {
      this.isPlaying = true;
      this.savePreferences();
      this.updateUI();
      console.log('✅ Music playing successfully');
    }).catch(error => {
      console.warn('⚠️ Autoplay blocked by browser:', error.message);
      console.log('💡 User must interact with the page first (click anywhere)');
      console.log('💡 Or toggle music in Settings modal (gear icon)');

      // Mark as not playing
      this.isPlaying = false;
      this.savePreferences();
      this.updateUI();
    });
  }

  /**
   * Pause the music
   */
  pause() {
    if (!this.audio) return;

    this.audio.pause();
    this.isPlaying = false;
    this.savePreferences();
    this.updateUI();
    console.log('⏸️ Music paused');
  }

  /**
   * Toggle play/pause
   */
  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(vol) {
    if (!this.audio) return;

    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.isMuted) {
      this.audio.volume = this.volume;
    }
    this.savePreferences();
    this.updateUI();
  }

  /**
   * Increase volume
   */
  volumeUp() {
    this.setVolume(this.volume + 0.1);
  }

  /**
   * Decrease volume
   */
  volumeDown() {
    this.setVolume(this.volume - 0.1);
  }

  /**
   * Toggle mute
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.audio) {
      this.audio.volume = this.isMuted ? 0 : this.volume;
    }
    this.savePreferences();
    this.updateUI();
  }

  /**
   * Change track
   */
  changeTrack(trackPath) {
    if (!this.audio) return;

    const wasPlaying = this.isPlaying;
    this.currentTrack = trackPath;
    this.audio.src = trackPath;

    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Save preferences to localStorage
   */
  savePreferences() {
    localStorage.setItem('music_preferences', JSON.stringify({
      isPlaying: this.isPlaying,
      volume: this.volume,
      isMuted: this.isMuted,
      currentTrack: this.currentTrack
    }));
  }

  /**
   * Load preferences from localStorage
   */
  loadPreferences() {
    const saved = localStorage.getItem('music_preferences');
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        this.isPlaying = prefs.isPlaying || false;
        this.volume = prefs.volume !== undefined ? prefs.volume : 0.5;
        this.isMuted = prefs.isMuted || false;
        this.currentTrack = prefs.currentTrack || null;
      } catch (e) {
        console.error('Failed to load music preferences:', e);
      }
    }
  }

  /**
   * Update UI elements (for settings modal)
   */
  updateUI() {
    // Update settings modal music toggle if it exists
    const musicToggle = document.getElementById('setting-music-enabled');
    if (musicToggle) {
      musicToggle.checked = this.isPlaying;
    }

    // Update settings modal volume slider if it exists
    const volumeSlider = document.getElementById('setting-music-volume');
    if (volumeSlider) {
      volumeSlider.value = this.volume * 100;
    }

    // Update settings modal volume display if it exists
    const volumeDisplay = document.getElementById('music-volume-display');
    if (volumeDisplay) {
      volumeDisplay.textContent = Math.round(this.volume * 100) + '%';
    }

    console.log('🔄 Music UI updated - isPlaying:', this.isPlaying, 'volume:', Math.round(this.volume * 100) + '%');
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

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.MusicPlayer.init();

  // Check if we're on battle page - don't auto-play music on battle
  const isBattlePage = window.location.pathname.includes('battle.html');

  if (!isBattlePage) {
    // Auto-play music on all pages except battle
    // Note: This may be blocked by browser autoplay policy
    console.log('🎵 Setting up music auto-play...');

    // Try to play immediately (will likely be blocked)
    setTimeout(() => {
      if (!window.MusicPlayer.isPlaying) {
        window.MusicPlayer.play();
      }
    }, 500);

    // Set up one-time click listener to start music on first user interaction
    const startMusicOnInteraction = () => {
      if (!window.MusicPlayer.isPlaying) {
        console.log('👆 User interaction detected - starting music');
        window.MusicPlayer.play();
      }
      // Remove listener after first interaction
      document.removeEventListener('click', startMusicOnInteraction);
      document.removeEventListener('keydown', startMusicOnInteraction);
      document.removeEventListener('touchstart', startMusicOnInteraction);
    };

    document.addEventListener('click', startMusicOnInteraction);
    document.addEventListener('keydown', startMusicOnInteraction);
    document.addEventListener('touchstart', startMusicOnInteraction);
  } else {
    // On battle page, pause music
    window.MusicPlayer.pause();
    console.log('🎵 Music paused for battle');
  }
});

console.log('✅ Music player module loaded');
