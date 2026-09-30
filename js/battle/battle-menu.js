/* In-battle menu: a gear button at the top right that pauses the fight and
 * opens a panel with music / effects volume, mute, battle speed, auto battle,
 * Resume and Retreat. Settings are the same ones the Settings page uses
 * (AudioManager, 'blazing_audio_settings'), so changes carry over.
 *
 * Retreat leaves without rewards: missions go back to the mission list,
 * Arena counts it as a loss, Ninja Road keeps the floor open (as leaving
 * mid-floor always has).
 */
(function () {
  'use strict';

  const pct = v => Math.round((Number(v) || 0) * 100);
  let panel = null, wasPaused = false;

  function core() { return window.BattleManager; }

  function exitUrl(bm) {
    return bm?.isArena ? 'arena.html' : bm?.isNinjaRoad ? 'ninja-road.html' : 'missions.html';
  }

  function injectButton() {
    const hudRight = document.querySelector('.battle-hud .hud-right');
    if (!hudRight || document.getElementById('btn-battle-menu')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-battle-menu';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Battle menu');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    btn.addEventListener('click', e => { e.stopPropagation(); open(); });
    hudRight.appendChild(btn);
  }

  function speedButtons(bm) {
    return [1, 2, 3].map(s =>
      `<button type="button" class="bm-seg${(bm?.speedMultiplier || 1) === s ? ' is-on' : ''}" data-speed="${s}">×${s}</button>`
    ).join('');
  }

  function open() {
    if (panel) return;
    const bm = core();
    const A = window.AudioManager;
    const s = A?.getSettings?.() || { bgmVolume: 0.5, sfxVolume: 0.8, masterMuted: false };
    wasPaused = !!bm?.isPaused;
    if (bm) bm.isPaused = true;

    panel = document.createElement('div');
    panel.className = 'battle-menu-overlay';
    panel.innerHTML = `
      <div class="battle-menu jjk-panel" role="dialog" aria-label="Battle menu">
        <div class="bm-head">
          <h2 class="bm-title">Menu</h2>
          <button type="button" class="bm-close" aria-label="Close">✕</button>
        </div>
        <div class="bm-body">
          <label class="bm-row">
            <span>Music</span>
            <input type="range" min="0" max="100" step="5" class="bm-range" data-kind="music" value="${pct(s.bgmVolume)}">
            <b class="bm-val" data-for="music">${pct(s.bgmVolume)}</b>
          </label>
          <label class="bm-row">
            <span>Effects</span>
            <input type="range" min="0" max="100" step="5" class="bm-range" data-kind="sfx" value="${pct(s.sfxVolume)}">
            <b class="bm-val" data-for="sfx">${pct(s.sfxVolume)}</b>
          </label>
          <div class="bm-row">
            <span>Sound</span>
            <button type="button" class="bm-toggle${s.masterMuted ? '' : ' is-on'}" data-act="mute">${s.masterMuted ? 'Off' : 'On'}</button>
          </div>
          <div class="bm-row">
            <span>Speed</span>
            <div class="bm-segs">${speedButtons(bm)}</div>
          </div>
          <div class="bm-row">
            <span>Auto battle</span>
            <button type="button" class="bm-toggle${bm?.turns?.autoMode ? ' is-on' : ''}" data-act="auto">${bm?.turns?.autoMode ? 'On' : 'Off'}</button>
          </div>
        </div>
        <div class="bm-foot">
          <button type="button" class="jjk-btn bm-retreat" data-act="retreat">Retreat</button>
          <button type="button" class="jjk-btn is-primary bm-resume" data-act="resume">Resume</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    panel.addEventListener('click', e => { if (e.target === panel) close(); });
    panel.querySelector('.bm-close').addEventListener('click', close);
    panel.querySelectorAll('.bm-range').forEach(r => r.addEventListener('input', () => {
      const v = Number(r.value) / 100;
      if (r.dataset.kind === 'music') A?.setMusicVolume?.(v); else A?.setSFXVolume?.(v);
      panel.querySelector(`.bm-val[data-for="${r.dataset.kind}"]`).textContent = r.value;
    }));
    panel.querySelectorAll('.bm-seg').forEach(b => b.addEventListener('click', () => {
      const bm2 = core(); if (!bm2) return;
      bm2.speedMultiplier = Number(b.dataset.speed);
      if (bm2.dom?.btnSpeed) bm2.dom.btnSpeed.textContent = `×${bm2.speedMultiplier}`;
      panel.querySelectorAll('.bm-seg').forEach(x => x.classList.toggle('is-on', x === b));
    }));
    panel.querySelector('[data-act="mute"]').addEventListener('click', e => {
      const muted = A?.toggleMute?.();
      e.currentTarget.classList.toggle('is-on', !muted);
      e.currentTarget.textContent = muted ? 'Off' : 'On';
    });
    panel.querySelector('[data-act="auto"]').addEventListener('click', e => {
      const bm2 = core(); if (!bm2?.turns) return;
      bm2.turns.toggleAutoMode(bm2);
      e.currentTarget.classList.toggle('is-on', bm2.turns.autoMode);
      e.currentTarget.textContent = bm2.turns.autoMode ? 'On' : 'Off';
    });
    panel.querySelector('[data-act="resume"]').addEventListener('click', close);
    panel.querySelector('[data-act="retreat"]').addEventListener('click', e => confirmRetreat(e.currentTarget));
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (!panel) return;
    panel.remove(); panel = null;
    document.removeEventListener('keydown', onKey);
    const bm = core();
    if (bm && !bm._retreating) bm.isPaused = wasPaused;
  }

  function confirmRetreat(btn) {
    if (btn.dataset.armed !== '1') {        // second tap confirms
      btn.dataset.armed = '1';
      btn.textContent = 'Leave? No rewards';
      btn.classList.add('is-armed');
      return;
    }
    const bm = core();
    if (bm) {
      bm._retreating = true;
      bm.isPaused = true;
      if (bm.isArena) { try { window.BattleMissions?.recordArenaResult?.(bm, false); } catch (_) { /* best effort */ } }
    }
    window.BattleSave?.clearSaved?.('retreat', true);
    window.location.href = exitUrl(bm);
  }

  function init() { injectButton(); }

  window.BattleMenu = { open, close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
