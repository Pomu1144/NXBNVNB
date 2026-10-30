/* In-battle menu: a gear button at the top right that pauses the fight and
 * opens a panel with music / effects volume, mute, battle speed, auto battle,
 * field marks, Resume and Retreat (which asks before leaving). Settings are the same ones the Settings page uses
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

    // Quick toggles beside the menu: battle speed and auto battle.
    const quick = document.createElement('div');
    quick.className = 'battle-quick';
    quick.innerHTML = `
      <button type="button" id="btn-quick-speed" class="bq-btn" aria-label="Battle speed">×1</button>
      <button type="button" id="btn-quick-auto" class="bq-btn" aria-label="Auto battle">AUTO</button>`;
    quick.querySelector('#btn-quick-speed').addEventListener('click', e => {
      e.stopPropagation();
      const bm = core(); if (!bm?.turns) return;
      bm.turns.changeSpeedMultiplier(bm);
      syncQuick();
    });
    quick.querySelector('#btn-quick-auto').addEventListener('click', e => {
      e.stopPropagation();
      const bm = core(); if (!bm?.turns) return;
      bm.turns.toggleAutoMode(bm);
      syncQuick();
    });
    const row = document.createElement('div');
    row.className = 'battle-hud-buttons';
    row.append(quick, btn);
    hudRight.appendChild(row);
    syncQuick();
    // the action panel's own Auto / ×N buttons change the same state
    document.addEventListener('click', () => setTimeout(syncQuick, 0), true);
    setTimeout(syncQuick, 1500); // a resumed battle restores its speed after init
  }

  function syncQuick() {
    const bm = core();
    const sp = document.getElementById('btn-quick-speed');
    const au = document.getElementById('btn-quick-auto');
    if (sp) { const m = bm?.speedMultiplier || 1; sp.textContent = `×${m}`; sp.classList.toggle('is-on', m > 1); }
    if (au) au.classList.toggle('is-on', !!bm?.turns?.autoMode);
  }

  // One control for every setting: a row of square segments, the chosen
  // one lit. Off | On for switches, ×1 | ×2 | ×3 for speed.
  function segs(act, options, current) {
    return `<div class="bm-segs" role="radiogroup" data-act="${act}">${options.map(([v, label]) =>
      `<button type="button" class="bm-seg${v === current ? ' is-on' : ''}" role="radio" aria-checked="${v === current}" data-v="${v}">${label}</button>`
    ).join('')}</div>`;
  }
  const ONOFF = [['0', 'Off'], ['1', 'On']];
  const onoff = (b) => (b ? '1' : '0');
  function light(group, v) {
    group.querySelectorAll('.bm-seg').forEach(x => {
      const on = x.dataset.v === String(v);
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-checked', on);
    });
  }

  function open() {
    if (panel) return;
    const bm = core();
    const A = window.AudioManager;
    const s = A?.getSettings?.() || { bgmVolume: 0.5, sfxVolume: 0.8, masterMuted: false };
    wasPaused = !!bm?.isPaused;
    if (bm) bm.isPaused = true;
    const scars = window.BattleScars;

    panel = document.createElement('div');
    panel.className = 'battle-menu-overlay';
    panel.innerHTML = `
      <div class="battle-menu jjk-panel${s.masterMuted ? ' is-muted' : ''}" role="dialog" aria-label="Battle paused">
        <div class="bm-head">
          <div class="bm-titles"><small>一時停止 · Paused</small><h2 class="bm-title">Battle Menu</h2></div>
          <button type="button" class="bm-close" aria-label="Close"></button>
        </div>
        <div class="bm-body">
          <section class="bm-sec">
          <h3 class="bm-kicker">Audio</h3>
          <label class="bm-row">
            <span>Music</span>
            <input type="range" min="0" max="100" step="5" class="bm-range" data-kind="music" value="${pct(s.bgmVolume)}" style="--v:${pct(s.bgmVolume)}%">
            <b class="bm-val" data-for="music">${pct(s.bgmVolume)}</b>
          </label>
          <label class="bm-row">
            <span>Effects</span>
            <input type="range" min="0" max="100" step="5" class="bm-range" data-kind="sfx" value="${pct(s.sfxVolume)}" style="--v:${pct(s.sfxVolume)}%">
            <b class="bm-val" data-for="sfx">${pct(s.sfxVolume)}</b>
          </label>
          <div class="bm-row"><span>Sound</span>${segs('mute', ONOFF, onoff(!s.masterMuted))}</div>
          </section>
          <section class="bm-sec">
          <h3 class="bm-kicker">Battle</h3>
          <div class="bm-row"><span>Speed</span>${segs('speed', [['1', '×1'], ['2', '×2'], ['3', '×3']], String(bm?.speedMultiplier || 1))}</div>
          <div class="bm-row"><span>Auto</span>${segs('auto', ONOFF, onoff(bm?.turns?.autoMode))}</div>
          ${scars ? `<div class="bm-row"><span>Field marks</span>${segs('scars', ONOFF, onoff(scars.isEnabled()))}</div>` : ''}
          </section>
        </div>
        <div class="bm-foot">
          <button type="button" class="jjk-btn bm-retreat" data-act="retreat">Retreat</button>
          <button type="button" class="jjk-btn is-primary bm-resume" data-act="resume">Resume</button>
        </div>
        <div class="bm-confirm" hidden>
          <p><b>Leave the battle?</b><span>You get no rewards for this run.</span></p>
          <div class="bm-foot">
            <button type="button" class="jjk-btn" data-act="stay">Stay</button>
            <button type="button" class="jjk-btn bm-leave" data-act="leave">Leave</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    const box = panel.querySelector('.battle-menu');

    panel.addEventListener('click', e => { if (e.target === panel) close(); });
    panel.querySelector('.bm-close').addEventListener('click', close);
    panel.querySelectorAll('.bm-range').forEach(r => r.addEventListener('input', () => {
      const v = Number(r.value) / 100;
      if (r.dataset.kind === 'music') A?.setMusicVolume?.(v); else A?.setSFXVolume?.(v);
      r.style.setProperty('--v', `${r.value}%`);
      panel.querySelector(`.bm-val[data-for="${r.dataset.kind}"]`).textContent = r.value;
    }));
    panel.querySelectorAll('.bm-segs').forEach(group => group.addEventListener('click', e => {
      const seg = e.target.closest('.bm-seg');
      if (!seg || seg.classList.contains('is-on')) return;
      const v = seg.dataset.v;
      const bm2 = core();
      switch (group.dataset.act) {
        case 'mute': {
          const muted = A?.toggleMute?.();
          box.classList.toggle('is-muted', !!muted);
          light(group, onoff(!muted));
          return;
        }
        case 'speed':
          if (!bm2) return;
          bm2.speedMultiplier = Number(v);
          if (bm2.dom?.btnSpeed) bm2.dom.btnSpeed.textContent = `×${bm2.speedMultiplier}`;
          break;
        case 'auto':
          if (!bm2?.turns) return;
          bm2.turns.toggleAutoMode(bm2);
          light(group, onoff(bm2.turns.autoMode));
          syncQuick();
          return;
        case 'scars':
          scars.setEnabled(v === '1');
          break;
      }
      light(group, v);
      syncQuick();
    }));
    panel.querySelector('[data-act="resume"]').addEventListener('click', close);
    // Retreat asks first, in place of the buttons; Stay goes back
    const confirmBox = panel.querySelector('.bm-confirm');
    const mainFoot = panel.querySelector('.bm-foot');
    panel.querySelector('[data-act="retreat"]').addEventListener('click', () => {
      mainFoot.hidden = true; confirmBox.hidden = false;
      confirmBox.querySelector('[data-act="stay"]').focus();
    });
    panel.querySelector('[data-act="stay"]').addEventListener('click', () => {
      confirmBox.hidden = true; mainFoot.hidden = false;
      panel.querySelector('[data-act="retreat"]').focus();
    });
    panel.querySelector('[data-act="leave"]').addEventListener('click', retreat);
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

  function retreat() {
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
