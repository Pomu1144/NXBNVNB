// js/panel-missions.js - Panel Missions, laid out like the original game's Panel Mission
// screen, turned landscape: the panel banner (art, logo, "Complete 9 Panel Missions to get
// <reward>!") and the controls on the left, the 3x3 board of parchment slips on the right.
// Claiming a mission turns its slip over to show that ninth of the panel art; claiming all
// nine grants the panel reward. Panels page with the arrows / dots; the swap button flips
// every slip between its condition and its reward, as in the original.
//
// Data: data/panel.json ({ panels: [{ id, name, logo, theme, art, reward, missions[9] }] },
// see its _doc for the track types). Claimed state: localStorage
// 'blazing_panel_mission_progress' ([{ id, completed }], mission ids plus 'panel:<id>').
// Play counts for "complete X N times" missions: localStorage 'blazing_play_counts_v1',
// bumped by BattleMissions.recordMissionComplete via PanelMissions.recordPlay().
// UI styles: css/panel-missions.css. Type: the original FOT-Reggae B (titles) and
// FOT-Matisse EB (slips), subset to Latin from the IPA (assets/fonts/).

const PLAY_KEY = 'blazing_play_counts_v1';
const PROGRESS_KEY = 'blazing_panel_mission_progress';

class PanelMissions {
  constructor() {
    this.panels = [];
    this.missions = [];       // flat list, kept for callers that read it
    this.claimed = {};        // id -> true
    this._chars = null;       // id -> character (for awakening / max level / names)
    this._escBound = false;
    this.page = 0;
    this.showRewards = false;
  }

  async init() {
    await this.loadMissions();
    this.loadMissionProgress();
    this._loadCharacters();
  }

  async loadMissions() {
    try {
      const response = await fetch('data/panel.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // older data: one flat list whose last entry is the completion reward
      this.panels = Array.isArray(data.panels) ? data.panels
        : [{ id: 'basic', name: 'Panel Missions', logo: ['Panel', 'Missions'], missions: (data.missions || []).slice(0, 9), reward: (data.missions || [])[9]?.reward }];
      this.missions = this.panels.flatMap(p => p.missions);
    } catch (error) {
      console.error('Failed to load panel missions:', error);
      this.panels = [];
      this.missions = [];
    }
  }

  loadMissionProgress() {
    this.claimed = {};
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]');
      (Array.isArray(saved) ? saved : []).forEach(m => { if (m && m.completed) this.claimed[m.id] = true; });
      // the old flat list's completion reward was mission_010
      if (this.claimed.mission_010) this.claimed['panel:basic'] = true;
    } catch (error) {
      console.error('Failed to load mission progress:', error);
    }
  }

  saveMissionProgress() {
    try {
      const out = Object.keys(this.claimed).map(id => ({ id, completed: true }));
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(out));
    } catch (error) {
      console.error('Failed to save mission progress:', error);
    }
  }

  /** BattleMissions.recordMissionComplete: count a cleared mission (any rank). */
  recordPlay(missionId, category) {
    try {
      const c = JSON.parse(localStorage.getItem(PLAY_KEY) || '{}') || {};
      c.missions = c.missions || {};
      c.cats = c.cats || {};
      if (missionId) c.missions[missionId] = (c.missions[missionId] || 0) + 1;
      if (category) c.cats[category] = (c.cats[category] || 0) + 1;
      localStorage.setItem(PLAY_KEY, JSON.stringify(c));
    } catch (e) { /* storage blocked */ }
  }

  /* ------------------------------------------------------------------
   * Progress (read-only snapshot of saved game state)
   * ------------------------------------------------------------------ */
  _loadCharacters() {
    if (this._chars || typeof window.loadCharactersData !== 'function') return;
    window.loadCharactersData().then(data => {
      const list = Array.isArray(data) ? data : (Array.isArray(data?.characters) ? data.characters : []);
      const map = {};
      list.forEach(c => { if (c && c.id) map[c.id] = c; });
      this._chars = map;
      if (document.getElementById('panel-modal')) this._render();
    }).catch(() => {});
  }

  _json(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }

  _snapshot() {
    const TIER_ORDER = ['1S', '2S', '3S', '4S', '5S', '6S', '6SB', '7S', '7SL', '8S', '8SM', '9S', '9ST', '10SO'];
    const TIER_CAPS = { '1S': 20, '2S': 30, '3S': 40, '4S': 55, '5S': 70, '6S': 100, '6SB': 100, '7S': 100, '7SL': 100, '8S': 110, '8SM': 120, '9S': 125, '9ST': 130, '10SO': 150 };
    const capFor = (code) => (window.Progression?.levelCapForCode?.(code)) ?? TIER_CAPS[code] ?? 40;
    const minCodeOf = (c) => {
      if (!c) return null;
      if (TIER_ORDER.includes(c.starMinCode)) return c.starMinCode;
      const n = Number(c.starMin ?? c.rarity);
      if (!Number.isFinite(n)) return null;
      return n <= 3 ? '3S' : n === 4 ? '4S' : n === 5 ? '5S' : '6S';
    };

    const inst = (window.InventoryChar && typeof window.InventoryChar.allInstances === 'function')
      ? window.InventoryChar.allInstances()
      : (Array.isArray(this._json('blazing_inventory_v2', [])) ? this._json('blazing_inventory_v2', []) : []);
    const arena = Object.assign({ wins: 0 }, this._json('arena_record_v1', {}) || {});
    const prog = this._json('blazing_mission_progress_v1', {}) || {};
    let clears = 0;
    Object.values(prog).forEach(m => { if (m && typeof m === 'object') Object.values(m).forEach(d => { if (d && d.firstClear) clears++; }); });
    const daily = this._json('blazing_daily_progress_v1', {}) || {};
    const cal = this._json('dailyStreak', {}) || {};

    let rank = 1;
    try {
      if (window.NinjaRank && typeof window.NinjaRank.getRank === 'function') rank = Number(window.NinjaRank.getRank()) || 1;
      else rank = Number(localStorage.getItem('blazing_player_rank')) || 1;
    } catch (e) { /* ignore */ }

    let awakened = 0, maxed = 0, maxLevel = 0;
    inst.forEach(i => {
      if (!i) return;
      const lvl = Number(i.level) || 1;
      maxLevel = Math.max(maxLevel, lvl);
      const code = TIER_ORDER.includes(i.tierCode) ? i.tierCode : null;
      if (code && lvl >= capFor(code)) maxed++;
      const base = minCodeOf(this._chars?.[i.charId]);
      if (code && base && TIER_ORDER.indexOf(code) > TIER_ORDER.indexOf(base)) awakened++;
      else if (i.awakened || i.transformedFrom) awakened++;
    });

    return {
      battlesWon: clears + (Number(arena.wins) || 0),
      arenaWins: Number(arena.wins) || 0,
      maxLevel,
      distinct: new Set(inst.map(i => i && i.charId).filter(Boolean)).size,
      streak: Math.max(Number(daily.loginStreak) || 0, Number(cal.streak) || 0),
      awakened,
      rank,
      maxed,
      prog,
      plays: this._json(PLAY_KEY, {}) || {},
    };
  }

  getProgress(mission, snap) {
    const s = snap || this._snapshot();
    const t = mission.track || {};
    if (t.type === 'clear') {
      const done = !!(s.prog[t.mission] && s.prog[t.mission][t.rank] && s.prog[t.mission][t.rank].firstClear);
      return { cur: done ? 1 : 0, target: 1 };
    }
    if (t.type === 'plays') {
      const n = Number(s.plays.missions?.[t.mission]) || 0;
      return { cur: Math.min(n, t.count), target: t.count };
    }
    if (t.type === 'plays_cat') {
      const n = Object.entries(s.plays.cats || {}).reduce((a, [k, v]) => a + (k.startsWith(t.category) ? Number(v) || 0 : 0), 0);
      return { cur: Math.min(n, t.count), target: t.count };
    }
    if (t.type === 'stat') {
      const n = Number(s[t.key]) || 0;
      return { cur: Math.min(n, t.target), target: t.target };
    }
    return { cur: 0, target: 1 };
  }

  isMissionComplete(mission, snap) {
    const p = this.getProgress(mission, snap);
    return p.cur >= p.target;
  }

  _stateOf(mission, snap) {
    if (this.claimed[mission.id]) return 'claimed';
    return this.isMissionComplete(mission, snap) ? 'ready' : 'progress';
  }

  _panelState(panel) {
    const done = panel.missions.filter(m => this.claimed[m.id]).length;
    if (this.claimed['panel:' + panel.id]) return { done, state: 'claimed' };
    return { done, state: done >= panel.missions.length ? 'ready' : 'locked' };
  }

  /* ------------------------------------------------------------------
   * Claiming
   * ------------------------------------------------------------------ */
  _notice(title, msg) {
    if (window.DashboardMailbox && typeof window.DashboardMailbox.showCustomAlert === 'function') {
      window.DashboardMailbox.showCustomAlert(title, this._esc(msg), 'info');
    } else if (window.ModalManager) {
      window.ModalManager.showInfo(`${title}\n\n${msg}`);
    }
  }

  _reveal(items, title, note) {
    if (window.DashboardMailbox && typeof window.DashboardMailbox.showRewardReveal === 'function') {
      window.DashboardMailbox.showRewardReveal(items, { title, note });
    } else {
      this._notice(title, items.map(i => `${i.name} ×${i.qty}`).join('\n'));
    }
  }

  /** Claim every ready mission in ids; returns the reward items given. */
  _claim(ids, snap) {
    const items = [];
    ids.forEach(id => {
      const m = this.missions.find(x => x.id === id);
      if (!m || this._stateOf(m, snap) !== 'ready') return;
      this.claimed[m.id] = true;
      this.giveReward(m.reward);
      items.push(this._rewardItem(m.reward));
    });
    if (items.length) this.saveMissionProgress();
    return items;
  }

  completeMission(missionId) {
    const items = this._claim([missionId], this._snapshot());
    if (!items.length) return;
    this._closeDetails();
    this._render();
    this._reveal(items, 'Rewards Obtained', this.missions.find(m => m.id === missionId)?.title);
  }

  takeAll() {
    const panel = this.panels[this.page];
    if (!panel) return;
    const items = this._claim(panel.missions.map(m => m.id), this._snapshot());
    const ps = this._panelState(panel);
    if (ps.state === 'ready') {
      this.claimed['panel:' + panel.id] = true;
      this.giveReward(panel.reward);
      items.push(this._rewardItem(panel.reward));
      this.saveMissionProgress();
    }
    if (!items.length) { this._notice('Panel Mission', 'No rewards are ready to take yet.'); return; }
    this._render();
    this._reveal(items, 'Rewards Obtained', ps.state === 'ready' ? `${panel.name} complete!` : panel.name);
  }

  claimPanel() {
    const panel = this.panels[this.page];
    if (!panel || this._panelState(panel).state !== 'ready') return;
    this.claimed['panel:' + panel.id] = true;
    this.saveMissionProgress();
    this.giveReward(panel.reward);
    this._render();
    this._reveal([this._rewardItem(panel.reward)], 'Panel Complete!',
      panel.reward?.type === 'character' ? 'New ninja added to your Characters.' : panel.name);
  }

  giveReward(reward) {
    if (!reward) return;
    switch (reward.type) {
      case 'character':
        if (window.InventoryChar) {
          for (let i = 0; i < (reward.quantity || 1); i++) {
            window.InventoryChar.addCopy(reward.characterId, 1, reward.tierCode || '3S');
          }
        }
        break;
      case 'resource':
        if (window.Resources) {
          window.Resources.add(reward.resourceName.toLowerCase().replace(/\s+/g, '_'), reward.quantity);
        } else {
          console.error('[PanelMissions] Resources module not loaded; reward lost:', reward);
        }
        break;
    }
  }

  /* ------------------------------------------------------------------
   * Reward display
   * ------------------------------------------------------------------ */
  _esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _tierLabel(code) {
    const m = String(code || '').match(/^(\d+)/);
    return m ? `${m[1]}★` : '';
  }

  /** { icon, fallback, name, qty, kind, tier } */
  _rewardItem(reward) {
    reward = reward || {};
    if (reward.type === 'character') {
      const tier = reward.tierCode || '3S';
      const c = this._chars?.[reward.characterId];
      return {
        kind: 'character',
        icon: `assets/characters/${reward.characterId}/portrait_${tier}.webp`,
        fallback: 'assets/icons/characters_icon.png',
        name: c ? c.name : `${this._tierLabel(tier)} Ninja`,
        version: c ? c.version : '',
        tier: this._tierLabel(tier),
        qty: reward.quantity || 1,
      };
    }
    const n = String(reward.resourceName || '').toLowerCase();
    const icon = n.includes('pearl') ? 'assets/icons/currency/ninjapearl.png'
      : n.includes('ryo') ? 'assets/icons/currency/ryo.png'
      : n.includes('shinobite') ? 'assets/icons/currency/shinobite.png'
      : 'assets/icons/chestunopened.png';
    const name = n.includes('pearl') ? 'Ninja Pearl' : reward.resourceName;
    return { kind: 'resource', icon, name, qty: reward.quantity };
  }

  getRewardDisplayText(reward) {
    const it = this._rewardItem(reward);
    return it.kind === 'character' ? `${it.name} "${it.version}" (${it.tier})` : `${it.name} x${(it.qty || 0).toLocaleString()}`;
  }

  /* ------------------------------------------------------------------
   * UI
   * ------------------------------------------------------------------ */
  _ensureStyles() {
    if (document.querySelector('link[href*="css/panel-missions.css"]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/panel-missions.css?v=3';
    document.head.appendChild(l);
  }

  _bannerHTML(panel) {
    const it = this._rewardItem(panel.reward);
    const logo = Array.isArray(panel.logo) ? panel.logo : [panel.name];
    const prize = it.kind === 'character'
      ? `${this._esc(it.name)} "${this._esc(it.version)}" (★${this._esc(String(it.tier).replace('★', ''))})!`
      : `${this._esc(it.name)} ×${(it.qty || 0).toLocaleString()}!`;
    return `
      <div class="pmx-banner pmx-theme-${this._esc(panel.theme || 'fire')}">
        <div class="pmx-banner-art" style="background-image:url('${this._esc(panel.art)}')"></div>
        <div class="pmx-logo">
          <span class="pmx-logo-board"></span>
          <span class="pmx-logo-scroll" aria-hidden="true"></span>
          ${logo.map((w, i) => `<b class="pmx-logo-l${i}">${this._esc(w)}</b>`).join('')}
        </div>
        <div class="pmx-goal">
          <span class="pmx-goal-a">Complete ${panel.missions.length} Panel Missions to get</span>
          <span class="pmx-goal-b">${prize}</span>
        </div>
      </div>`;
  }

  _tileHTML(m, i, panel, snap) {
    const st = this._stateOf(m, snap);
    const r = Math.floor(i / 3), c = i % 3;
    if (st === 'claimed') {
      return `<div class="pmx-cell is-claimed" style="background-image:url('${this._esc(panel.art)}');background-position:${c * 50}% ${r * 50}%" title="${this._esc(m.title)}"></div>`;
    }
    const it = this._rewardItem(m.reward);
    const label = this.showRewards ? `${it.name} x${(it.qty || 0).toLocaleString()}` : m.title;
    return `
      <div class="pmx-cell is-${st}">
        <div class="pmx-slip">
          <i class="pmx-pin pmx-pin-l"></i><i class="pmx-pin pmx-pin-r"></i>
          <p class="pmx-text">${this._esc(label)}</p>
          <button type="button" class="pmx-btn" data-details="${this._esc(m.id)}">${st === 'ready' ? 'Claim' : 'Details'}</button>
        </div>
      </div>`;
  }

  _render() {
    const modal = document.getElementById('panel-modal');
    if (!modal) return;
    const panel = this.panels[this.page];
    if (!panel) return;
    const snap = this._snapshot();
    const ps = this._panelState(panel);
    const ready = panel.missions.filter(m => this._stateOf(m, snap) === 'ready').length + (ps.state === 'ready' ? 1 : 0);
    const it = this._rewardItem(panel.reward);

    modal.querySelector('#pmx-left').innerHTML = `
      ${this._bannerHTML(panel)}
      <div class="pmx-controls">
        <div class="pmx-prize is-${ps.state}">
          <span class="pmx-prize-icon${it.kind === 'character' ? ' is-char' : ''}"><img src="${this._esc(it.icon)}" alt="" draggable="false" onerror="this.onerror=null;this.src='${this._esc(it.fallback || 'assets/icons/chestunopened.png')}'"></span>
          <span class="pmx-prize-text"><small>Panel reward</small><b>${ps.done} / ${panel.missions.length}</b></span>
          ${ps.state === 'ready' ? '<button type="button" class="pmx-btn pmx-prize-claim" data-panel-claim>Claim</button>'
            : ps.state === 'claimed' ? '<span class="pmx-prize-done">Obtained</span>' : ''}
        </div>
        <button type="button" class="pmx-take${ready ? ' is-on' : ''}" data-take ${ready ? '' : 'disabled'}>Take All</button>
        <button type="button" class="pmx-swap${this.showRewards ? ' is-on' : ''}" data-swap aria-label="Show ${this.showRewards ? 'missions' : 'rewards'}" title="Show ${this.showRewards ? 'missions' : 'rewards'}"><span></span></button>
      </div>`;
    modal.querySelector('#pmx-board').innerHTML = panel.missions.map((m, i) => this._tileHTML(m, i, panel, snap)).join('');
    modal.querySelector('#pmx-board').classList.toggle('is-complete', ps.state !== 'locked');
    modal.querySelector('#pmx-dots').innerHTML = this.panels.map((p, i) =>
      `<button type="button" class="pmx-dot${i === this.page ? ' is-on' : ''}" data-page="${i}" aria-label="${this._esc(p.name)}"></button>`).join('');
    modal.querySelector('#pmx-hint').textContent = ready
      ? `${ready} reward${ready === 1 ? '' : 's'} ready. Tap Take All to collect.`
      : 'Tap a panel to see details.';
  }

  _details(id) {
    const m = this.missions.find(x => x.id === id);
    if (!m) return;
    const snap = this._snapshot();
    const st = this._stateOf(m, snap);
    const p = this.getProgress(m, snap);
    const it = this._rewardItem(m.reward);
    this._closeDetails();
    const html = `
      <div class="pmx-details" id="pmx-details" role="dialog" aria-label="Mission details">
        <div class="pmx-details-card">
          <i class="pmx-pin pmx-pin-l"></i><i class="pmx-pin pmx-pin-r"></i>
          <p class="pmx-details-title">${this._esc(m.title)}</p>
          <div class="pmx-details-prog"><span style="width:${Math.round(p.cur / p.target * 100)}%"></span><b>${p.cur.toLocaleString()} / ${p.target.toLocaleString()}</b></div>
          <div class="pmx-details-reward"><img src="${this._esc(it.icon)}" alt="" draggable="false"><span>${this._esc(it.name)} x${(it.qty || 0).toLocaleString()}</span></div>
          <div class="pmx-details-actions">
            ${st === 'ready' ? `<button type="button" class="pmx-btn" data-claim="${this._esc(m.id)}">Claim</button>` : ''}
            <button type="button" class="pmx-btn pmx-btn-dark" data-close-details>${st === 'ready' ? 'Later' : 'Close'}</button>
          </div>
        </div>
      </div>`;
    document.getElementById('panel-modal').insertAdjacentHTML('beforeend', html);
  }

  _closeDetails() { document.getElementById('pmx-details')?.remove(); }

  openPanelModal() {
    if (!this.panels.length) {
      this._notice('Panel Missions', 'No panel missions available.');
      return;
    }
    this._ensureStyles();
    this._loadCharacters();
    document.getElementById('panel-modal')?.remove();
    // open on the first panel that still has something to do
    const open = this.panels.findIndex(p => this._panelState(p).state !== 'claimed');
    this.page = open >= 0 ? open : 0;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="pmx-modal" id="panel-modal" role="dialog" aria-modal="true" aria-label="Panel Mission">
        <header class="pmx-head">
          <button type="button" class="pmx-back" data-close>Back</button>
          <h2 class="pmx-title">Panel Mission</h2>
        </header>
        <div class="pmx-body">
          <div class="pmx-left" id="pmx-left"></div>
          <div class="pmx-right">
            <button type="button" class="pmx-arrow pmx-arrow-l" data-step="-1" aria-label="Previous panel"></button>
            <div class="pmx-board" id="pmx-board"></div>
            <button type="button" class="pmx-arrow pmx-arrow-r" data-step="1" aria-label="Next panel"></button>
            <div class="pmx-dots" id="pmx-dots"></div>
          </div>
        </div>
        <footer class="pmx-hint" id="pmx-hint"></footer>
      </div>`);

    const modal = document.getElementById('panel-modal');
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-close]')) return this.closePanelModal();
      if (t.closest('[data-close-details]') || t.id === 'pmx-details') return this._closeDetails();
      const claim = t.closest('[data-claim]');
      if (claim) return this.completeMission(claim.getAttribute('data-claim'));
      const det = t.closest('[data-details]');
      if (det) {
        const id = det.getAttribute('data-details');
        const m = this.missions.find(x => x.id === id);
        return m && this._stateOf(m) === 'ready' ? this.completeMission(id) : this._details(id);
      }
      if (t.closest('[data-take]')) return this.takeAll();
      if (t.closest('[data-panel-claim]')) return this.claimPanel();
      if (t.closest('[data-swap]')) { this.showRewards = !this.showRewards; return this._render(); }
      const step = t.closest('[data-step]');
      if (step) { this.page = (this.page + Number(step.getAttribute('data-step')) + this.panels.length) % this.panels.length; return this._render(); }
      const pg = t.closest('[data-page]');
      if (pg) { this.page = Number(pg.getAttribute('data-page')); return this._render(); }
    });
    this._render();

    if (!this._escBound) {
      this._escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !document.getElementById('panel-modal')) return;
        if (document.getElementById('reward-reveal') || document.getElementById('custom-alert-modal')) return;
        if (document.getElementById('pmx-details')) return this._closeDetails();
        this.closePanelModal();
      });
    }
  }

  closePanelModal() {
    const modal = document.getElementById('panel-modal');
    if (!modal) return;
    modal.classList.add('is-leaving');
    setTimeout(() => modal.remove(), 160);
  }

  injectPanelStyles() { this._ensureStyles(); }
}

window.PanelMissions = new PanelMissions();
