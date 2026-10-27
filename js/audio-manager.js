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

  const MUSIC_DIR = 'assets/audio/';

  // The original game's BGM (assets/audio/original/music, from the IPA),
  // rebuilt as loop files by tools/audio/make_music_loops.py: each carries a
  // copy of the loop's tail before loopStart and of its head after loopEnd, so
  // any window of (loopEnd - loopStart) loops cleanly whatever MP3 decoder
  // delay the browser does or doesn't trim. Results are the original jingles.
  const MUSIC_TRACKS = {
    title:        { file: 'music/title.mp3',        loopStart: 0.25, loopEnd: 48.25 },   // BGM_2_tittle
    home:         { file: 'music/home.mp3',         loopStart: 0.25, loopEnd: 48.25 },   // BGM_1_menu_home
    arena:        { file: 'music/arena.mp3',        loopStart: 0.25, loopEnd: 48.25 },   // BGM_3_menu_pvp
    arena_battle: { file: 'music/arena_battle.mp3', loopStart: 0.25, loopEnd: 43.327 },  // BGM_4_battle_pvp
    battle:       { file: 'music/battle.mp3',       loopStart: 0.25, loopEnd: 43.327 },  // BGM_5_battle_normal
    boss:         { file: 'music/boss.mp3',         loopStart: 0.25, loopEnd: 39.523 },  // BGM_6_battle_boss
    summon:       { file: 'music/summon.mp3',       loopStart: 0.25, loopEnd: 24.74 },   // BGM_7_Gasha
    discipline:   { file: 'music/discipline.mp3',   loopStart: 0.25, loopEnd: 39.274 },  // BGM_008_discipline
    tension:      { file: 'music/tension.mp3',      loopStart: 0.25, loopEnd: 27.25 },   // BGM_009_tension
    intrigue:     { file: 'music/intrigue.mp3',     loopStart: 0.25, loopEnd: 27.679 },  // BGM_010_intrigue
    sorrow:       { file: 'music/sorrow.mp3',       loopStart: 0.25, loopEnd: 32.25 },   // BGM_011_sorrow
    battle_event: { file: 'music/battle_event.mp3', loopStart: 0.25, loopEnd: 49.481 },  // BGM_012_battle_event
    victory:      { file: 'original/jingles/JG_3_mission_clear.mp3', loop: false },
    defeat:       { file: 'original/jingles/JG_4_mission_fail.mp3',  loop: false }
  };
  // The village and every menu page share the home theme (one track name, so
  // it carries on across pages instead of restarting).
  const MUSIC_ALIASES = { village: 'home', shop: 'home', menu: 'home', login: 'title', index: 'title' };

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

      // Sound effects from the original game's sound bank (assets/audio/original,
      // extracted by tools/audio/extract_acb.py; manifest.json lists every clip).
      const O = 'assets/audio/original/';
      const SFX = {
        uiClick:      ['sfx/SE_1_menu_slct.mp3', 1],
        hit:          ['sfx/SE_27_hit_dageki_1.mp3', 1],
        critical:     ['sfx/SE_30_hit_critical_1.mp3', 1.2],
        jutsu:        ['sfx/SE_32_skill_on.mp3', 1],
        ultimate:     ['sfx/SE_33_s_skill_on_1.mp3', 1.3],
        summon:       ['sfx/SE_80_gasha_quake_01_a.mp3', 1.5],
        victory:      ['jingles/JG_3_mission_clear.mp3', 1],
        defeat:       ['jingles/JG_4_mission_fail.mp3', 1],
        awakening:    ['jingles/JG_5_evolution.mp3', 1],
        heal:         ['sfx/SE_22_heal.mp3', 1],
        buff:         ['sfx/SE_50_buff.mp3', 1],
        debuff:       ['sfx/SE_51_debuff.mp3', 1],
        poison:       ['sfx/SE_52_poison.mp3', 1],
        seal:         ['sfx/SE_54_seal_1.mp3', 1],
        slipDamage:   ['sfx/SE_95_slipdamage.mp3', 1],
        bossCaution:  ['sfx/SE_15_boss_caution.mp3', 1],
      };
      this._sfxGain = {};
      for (const [name, [file, gain]] of Object.entries(SFX)) {
        this._sfxGain[name] = gain;
        this.sounds[name] = new Howl({ src: [O + file], volume: this.getEffectiveVolume('sfx') * gain, preload: false });
      }

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
      // iOS: Web Audio follows the ring/silent switch unless the page asks for
      // the playback session (Safari 17+), so music was silent on muted phones.
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
      // Stays armed for the whole page: iOS also suspends the context after a
      // call, Siri or an app switch ('interrupted'), and only a gesture can
      // resume it again.
      const events = ['pointerdown', 'touchend', 'click', 'keydown'];
      let unlocked = false;
      const done = () => {
        if (unlocked) return;
        unlocked = true;
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
     * Play a voice clip (an mp3 URL) at the sound-effect volume, ducking the
     * music under it. Resolves to the playing source, or null when muted or
     * the clip can't be played (call it inside a user gesture on iOS).
     */
    playVoice(src, { duck = 0.35 } = {}) {
      if (this.muted || this.sfxMuted) return Promise.resolve(null);
      const ctx = this._ensureContext();
      if (!ctx) return Promise.resolve(null);
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      return fetch(src)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
        .then(buf => {
          const s = ctx.createBufferSource();
          const g = ctx.createGain();
          s.buffer = buf;
          g.gain.value = this.getEffectiveVolume('sfx');
          s.connect(g);
          g.connect(ctx.destination);
          if (this.musicBus && duck < 1) {
            const mg = this.musicBus.gain, now = ctx.currentTime;
            mg.cancelScheduledValues(now);
            mg.setTargetAtTime(this._musicLevel() * duck, now, 0.08);
            s.onended = () => this._applyMusicVolume();
          }
          s.start();
          return s;
        })
        .catch(e => { console.warn('[AudioManager] voice failed', src, e); return null; });
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
      sound.volume(this.getEffectiveVolume('sfx') * ((this._sfxGain && this._sfxGain[soundName]) || 1));
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

    /** 0-100 for the settings page ('bgm' = music). */
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
