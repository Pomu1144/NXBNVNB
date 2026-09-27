// js/audio-manager.js - Game audio: Web Audio background music + Howler.js SFX
(() => {
  "use strict";

  /**
   * AudioManager - Centralized audio system for the entire game
   *
   * Music:
   * - Each page plays its own looping track (see PAGE_MUSIC / <body data-music>)
   * - Web Audio buffers with sample-accurate loop points (no gap at the seam)
   * - Crossfades between tracks; pages sharing a track resume where the last
   *   page left off (position kept in sessionStorage)
   * - Starts on the first tap/click/key when autoplay is blocked (iOS Safari)
   * - Volume, mute and "music enabled" apply live
   *
   * SFX: Howler.js (when loaded), same volume settings.
   *
   * Settings live in localStorage 'blazing_audio_settings':
   *   { master, music, sfx, muted, musicEnabled, sfxMuted }
   */

  const MUSIC_DIR = 'assets/audio/music/';

  // Loop tracks carry a copy of the loop's tail before loopStart and of its
  // head after loopEnd, so any window of (loopEnd - loopStart) loops cleanly
  // whatever MP3 decoder delay the browser does or doesn't trim.
  const MUSIC_TRACKS = {
    title:   { file: 'title.mp3',   loopStart: 0.25, loopEnd: 76.0395 },
    village: { file: 'village.mp3', loopStart: 0.25, loopEnd: 57.85 },
    battle:  { file: 'battle.mp3',  loopStart: 0.25, loopEnd: 45.9643 },
    boss:    { file: 'boss.mp3',    loopStart: 0.25, loopEnd: 60.25 },
    summon:  { file: 'summon.mp3',  loopStart: 0.25, loopEnd: 48.25 },
    arena:   { file: 'arena.mp3',   loopStart: 0.25, loopEnd: 55.9022 },
    shop:    { file: 'shop.mp3',    loopStart: 0.25, loopEnd: 45.9643 },
    victory: { file: 'victory.mp3', loop: false },
    defeat:  { file: 'defeat.mp3',  loop: false }
  };
  const MUSIC_ALIASES = { menu: 'shop', login: 'title', index: 'title' };

  // Page -> track. Unlisted pages get 'menu'. null = the page picks its own
  // track in code (battle.html: battle / arena / boss via BattleCore).
  const PAGE_MUSIC = {
    '': 'title',
    'index.html': 'title',
    'village.html': 'village',
    'battle.html': null,
    'summon.html': 'summon',
    'arena.html': 'arena',
    'shop.html': 'shop'
  };

  const POS_KEY = 'blazing_music_pos';
  const FADE = 0.8;

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
    musicPlaying: null,   // track requested on this page (legacy flag name)
    muted: false,
    musicEnabled: true,
    sfxMuted: false,

    // Music engine
    ctx: null,
    musicBus: null,
    current: null,        // { name, src, gain, t0, off, len, loop }
    _buffers: {},
    _req: 0,

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
      this._setupLifecycle();

      this.initialized = true;
      console.log('[AudioManager] ✅ Audio system ready');
    },

    /**
     * Define all game sounds
     */
    defineSounds() {
      if (!window.Howl) return;

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

    /* ===== Music engine ===== */

    /**
     * Create the music AudioContext (it stays suspended until a gesture on iOS
     * and on browsers that block autoplay). Kept apart from Howler's context,
     * whose autoSuspend would otherwise pause the music.
     */
    _ensureContext() {
      if (this.ctx) return this.ctx;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        this.ctx = new Ctx();
      } catch (e) {
        console.warn('[AudioManager] Web Audio unavailable:', e);
        return null;
      }
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this._musicLevel();
      this.musicBus.connect(this.ctx.destination);
      return this.ctx;
    },

    _musicLevel() {
      if (this.muted || !this.musicEnabled) return 0;
      return this.volumes.master * this.volumes.music;
    },

    _applyMusicVolume() {
      if (!this.musicBus) return;
      const g = this.musicBus.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(this._musicLevel(), now, 0.05);
    },

    _resolve(name) {
      name = MUSIC_ALIASES[name] || name;
      return MUSIC_TRACKS[name] ? name : null;
    },

    _loadBuffer(name) {
      if (!this._buffers[name]) {
        const url = MUSIC_DIR + MUSIC_TRACKS[name].file;
        this._buffers[name] = fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
          })
          // Callback form for older Safari, which lacks the promise form
          .then((data) => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
          .catch((err) => {
            delete this._buffers[name];
            console.warn('[AudioManager] Failed to load music', url, err);
            return null;
          });
      }
      return this._buffers[name];
    },

    /**
     * Track this page plays by default: <body data-music="..."> wins
     * ("none" = silent), then PAGE_MUSIC, then the shared menu track.
     */
    pageTrack() {
      const attr = document.body && document.body.dataset.music;
      if (attr) return attr === 'none' ? null : attr;
      const page = window.location.pathname.split('/').pop();
      return page in PAGE_MUSIC ? PAGE_MUSIC[page] : 'menu';
    },

    /**
     * Play a music track by name: title, village, battle, boss, summon, arena,
     * shop (alias menu), victory, defeat. Crossfades from whatever is playing.
     * A track that is already playing is left alone unless opts.restart.
     */
    playMusic(name, opts = {}) {
      const track = this._resolve(name);
      if (!track) {
        console.warn('[AudioManager] Unknown music track:', name);
        return;
      }
      this.musicPlaying = track;
      if (!this.musicEnabled) return;
      if (this.current && this.current.name === track && !opts.restart) return;
      if (!this._ensureContext()) return;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});

      const req = ++this._req;
      this._loadBuffer(track).then((buf) => {
        // A newer request (or stopMusic) superseded this one while loading
        if (!buf || req !== this._req || !this.musicEnabled) return;
        this._startBuffer(track, buf, opts.fade ?? FADE);
      });
    },

    _startBuffer(name, buf, fade) {
      const def = MUSIC_TRACKS[name];
      const loop = def.loop !== false;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(this.musicBus);

      let offset = 0;
      let len = buf.duration;
      if (loop) {
        const end = Math.min(def.loopEnd, buf.duration);
        len = end - def.loopStart;
        src.loop = true;
        src.loopStart = def.loopStart;
        src.loopEnd = end;
        offset = def.loopStart + this._savedPosition(name, len);
      }

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + Math.max(0.02, fade));
      src.start(now, offset);

      this._fadeOut(this.current, fade);
      const entry = { name, src, gain, t0: now, off: offset - (loop ? def.loopStart : 0), len, loop };
      this.current = entry;
      if (!loop) {
        src.onended = () => {
          if (this.current !== entry) return;
          this.current = null;
          if (this.musicPlaying === name) this.musicPlaying = null;
        };
      }
      console.log('[AudioManager] Music:', name);
    },

    _fadeOut(entry, fade) {
      if (!entry) return;
      const now = this.ctx.currentTime;
      const g = entry.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
      entry.src.onended = null;
      try { entry.src.stop(now + fade + 0.05); } catch (e) { /* already stopped */ }
    },

    /** Seconds into the current track (into the loop for looping tracks). */
    musicPosition() {
      const c = this.current;
      if (!c || !this.ctx) return 0;
      const t = c.off + (this.ctx.currentTime - c.t0);
      return c.loop ? t % c.len : Math.min(t, c.len);
    },

    _savePosition() {
      const c = this.current;
      if (!c || !c.loop) return;
      try {
        sessionStorage.setItem(POS_KEY, JSON.stringify({ name: c.name, pos: this.musicPosition(), ts: Date.now() }));
      } catch (e) { /* storage unavailable */ }
    },

    // Where the previous page left this track, advanced by the time spent
    // loading, so a track shared by several pages carries on across them.
    _savedPosition(name, len) {
      try {
        const s = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null');
        if (!s || s.name !== name) return 0;
        const gap = (Date.now() - s.ts) / 1000;
        if (gap < 0 || gap > 600) return 0;
        return (s.pos + gap) % len;
      } catch (e) {
        return 0;
      }
    },

    /**
     * Stop background music with fade out
     */
    stopMusic(fadeDuration = 1000) {
      this._req++;
      this.musicPlaying = null;
      if (!this.current || !this.ctx) return;
      this._savePosition();
      this._fadeOut(this.current, fadeDuration / 1000);
      this.current = null;
    },

    /** Results-screen jingles (non-looping); the loop fades out under them. */
    playVictoryMusic() {
      this.playMusic('victory', { fade: 0.3, restart: true });
    },

    playDefeatMusic() {
      this.playMusic('defeat', { fade: 0.3, restart: true });
    },

    playBossMusic() {
      this.playMusic('boss');
    },

    /**
     * Music on/off (settings toggle). Off remembers the requested track so
     * turning it back on resumes the right one.
     */
    setMusicEnabled(on) {
      this.musicEnabled = !!on;
      this.saveVolumeSettings();
      if (!on) {
        const wanted = this.musicPlaying;
        this.stopMusic(400);
        this.musicPlaying = wanted;
      } else {
        this._applyMusicVolume();
        const t = this.musicPlaying || this.pageTrack();
        if (t) this.playMusic(t);
      }
      return this.musicEnabled;
    },

    /**
     * Setup mobile audio unlock
     * iOS (and autoplay-blocking browsers) only start audio inside a gesture.
     */
    setupMobileUnlock() {
      const events = ['pointerdown', 'touchend', 'click', 'keydown'];
      const done = () => {
        events.forEach((ev) => document.removeEventListener(ev, unlock, true));
        console.log('[AudioManager] Audio unlocked');
      };
      const unlock = () => {
        const ctx = this._ensureContext();
        if (!ctx) return;
        if (ctx.state === 'running') return done();
        ctx.resume().then(() => { if (ctx.state === 'running') done(); }).catch(() => {});
        // Older iOS also wants a sound started inside the gesture
        try {
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, 22050);
          s.connect(ctx.destination);
          s.start(0);
        } catch (e) { /* ignore */ }
        if (this.musicPlaying && !this.current) this.playMusic(this.musicPlaying);
      };
      events.forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));
    },

    _setupLifecycle() {
      // Keep the spot in the loop for the next page, and pause while hidden
      window.addEventListener('pagehide', () => this._savePosition());
      setInterval(() => this._savePosition(), 1000);
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) {
          this._savePosition();
          this.ctx.suspend().catch(() => {});
        } else {
          this.ctx.resume().catch(() => {});
        }
      });
      // Back/forward cache restore: the context can come back suspended
      window.addEventListener('pageshow', (e) => {
        if (e.persisted && this.ctx) this.ctx.resume().catch(() => {});
      });
      // Settings changed in another tab
      window.addEventListener('storage', (e) => {
        if (e.key !== 'blazing_audio_settings') return;
        const wasEnabled = this.musicEnabled;
        this.loadVolumeSettings();
        this.updateAllVolumes();
        if (wasEnabled !== this.musicEnabled) this.setMusicEnabled(this.musicEnabled);
      });
    },

    /**
     * Calculate effective volume (master * category)
     */
    getEffectiveVolume(category) {
      if (this.muted) return 0;
      if (category === 'sfx' && this.sfxMuted) return 0;
      if (category === 'music') return this._musicLevel();
      return this.volumes.master * this.volumes[category];
    },

    /**
     * Legacy entry point: plays this page's track (battle.html asks for
     * battle / arena / boss itself through playMusic).
     */
    playBattleMusic() {
      this.playMusic(this.pageTrack() || 'battle');
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
      if (this.muted || this.sfxMuted) return;

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
      this._applyMusicVolume();
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
      this._applyMusicVolume();
    },

    /**
     * Save volume settings to localStorage
     */
    saveVolumeSettings() {
      const settings = {
        master: this.volumes.master,
        music: this.volumes.music,
        sfx: this.volumes.sfx,
        muted: this.muted,
        musicEnabled: this.musicEnabled,
        sfxMuted: this.sfxMuted
      };
      try {
        localStorage.setItem('blazing_audio_settings', JSON.stringify(settings));
      } catch (e) { /* storage unavailable */ }
    },

    /**
     * Load volume settings from localStorage
     */
    loadVolumeSettings() {
      let saved = null;
      try { saved = localStorage.getItem('blazing_audio_settings'); } catch (e) { /* ignore */ }
      if (!saved) return;

      try {
        const settings = JSON.parse(saved);
        this.volumes.master = settings.master ?? 0.7;
        this.volumes.music = settings.music ?? 0.5;
        this.volumes.sfx = settings.sfx ?? 0.8;
        this.muted = settings.muted ?? false;
        this.musicEnabled = settings.musicEnabled ?? true;
        this.sfxMuted = settings.sfxMuted ?? false;
        console.log('[AudioManager] Loaded volume settings:', this.volumes);
      } catch (e) {
        console.error('[AudioManager] Failed to load volume settings:', e);
      }
    },

    /**
     * Get current settings snapshot (used by settings.html)
     */
    getSettings() {
      return {
        bgmVolume: this.volumes.music,
        sfxVolume: this.volumes.sfx,
        masterMuted: this.muted,
        bgmMuted: !this.musicEnabled,
        sfxMuted: this.sfxMuted,
        musicEnabled: this.musicEnabled
      };
    },

    /** 0-100 for the village settings prompt ('bgm' = music). */
    getVolumePercent(kind) {
      const v = this.volumes[kind === 'bgm' ? 'music' : kind];
      return Math.round((v ?? 0) * 100);
    },

    /**
     * Alias used by settings.html
     */
    setBGMVolume(volume) {
      this.setMusicVolume(volume);
    },

    /**
     * Alias used by settings.html
     */
    toggleMasterMute() {
      return this.toggleMute();
    },

    toggleBGMMute() {
      return !this.setMusicEnabled(!this.musicEnabled);
    },

    toggleSFXMute() {
      this.sfxMuted = !this.sfxMuted;
      this.saveVolumeSettings();
      return this.sfxMuted;
    },

    reset() {
      this.volumes = { master: 0.7, music: 0.5, sfx: 0.8 };
      this.muted = false;
      this.sfxMuted = false;
      this.setMusicEnabled(true);
    },

    /**
     * General BGM play — starts this page's background music
     */
    playBGM() {
      this.playBattleMusic();
    }
  };

  // Export to window
  window.AudioManager = AudioManager;

  // Start this page's track. If autoplay is blocked it begins on the first
  // tap/click/key (see setupMobileUnlock).
  function _startPageMusic() {
    AudioManager.init();
    const track = AudioManager.pageTrack();
    if (track) AudioManager.playMusic(track);
  }

  // Auto-initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startPageMusic);
  } else {
    _startPageMusic();
  }

  console.log("[AudioManager] Module loaded ✅");
})();
