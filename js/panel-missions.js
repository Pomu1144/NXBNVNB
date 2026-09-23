// js/panel-missions.js - Panel Mission System
// Data: data/panel.json   Claimed state: localStorage 'blazing_panel_mission_progress'
// UI styles: css/panel-missions.css (shared JJK theme: css/theme-jjk.css)
//
// A mission is claimable only once its condition is met. Conditions are read
// from existing saved game state (inventory, arena record, mission clears,
// login streak, ninja rank). The last mission in the list is the panel
// completion reward and unlocks once every other mission has been claimed.

class PanelMissions {
  constructor() {
    this.missions = [];
    this._chars = null;       // id -> character (for awakening / max level / names)
    this._escBound = false;
  }

  async init() {
    await this.loadMissions();
    this.loadMissionProgress();
    this._loadCharacters();
    console.log('✅ Panel Missions initialized');
  }

  async loadMissions() {
    try {
      const response = await fetch('data/panel.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.missions = data.missions || [];
      console.log(`Loaded ${this.missions.length} panel missions`);
    } catch (error) {
      console.error('Failed to load panel missions:', error);
      this.missions = [];
    }
  }

  loadMissionProgress() {
    try {
      const saved = localStorage.getItem('blazing_panel_mission_progress');
      if (saved) {
        const progress = JSON.parse(saved);
        this.missions.forEach(mission => {
          const savedMission = progress.find(m => m.id === mission.id);
          if (savedMission) {
            mission.completed = savedMission.completed || false;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load mission progress:', error);
    }
  }

  saveMissionProgress() {
    try {
      const progress = this.missions.map(m => ({
        id: m.id,
        completed: m.completed
      }));
      localStorage.setItem('blazing_panel_mission_progress', JSON.stringify(progress));
    } catch (error) {
      console.error('Failed to save mission progress:', error);
    }
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
      if (document.getElementById('panel-modal')) this._render(true);
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
      maxLevel,
      distinct: new Set(inst.map(i => i && i.charId).filter(Boolean)).size,
      streak: Math.max(Number(daily.loginStreak) || 0, Number(cal.streak) || 0),
      awakened,
      rank,
      maxed,
    };
  }

  // id -> [snapshot key, target]; the final mission is handled separately
  _tracker(mission) {
    if (Array.isArray(mission.track)) return mission.track;
    return ({
      mission_001: ['battlesWon', 5],
      mission_002: ['maxLevel', 10],
      mission_003: ['distinct', 3],
      mission_004: ['streak', 7],
      mission_005: ['awakened', 1],
      mission_006: ['rank', 10],
      mission_007: ['battlesWon', 20],
      mission_008: ['maxed', 1],
      mission_009: ['distinct', 10],
    })[mission.id] || null;
  }

  _finalMission() {
    return this.missions.length > 1 ? this.missions[this.missions.length - 1] : null;
  }

  _boardMissions() {
    const fin = this._finalMission();
    return fin ? this.missions.slice(0, -1) : this.missions.slice();
  }

  getProgress(mission, snap) {
    if (mission === this._finalMission()) {
      const others = this._boardMissions();
      return { cur: others.filter(m => m.completed).length, target: others.length, tracked: true };
    }
    const t = this._tracker(mission);
    if (!t) return { cur: mission.completed ? 1 : 0, target: 1, tracked: false };
    const s = snap || this._snapshot();
    const cur = Number(s[t[0]]) || 0;
    return { cur: Math.min(cur, t[1]), target: t[1], tracked: true };
  }

  isMissionComplete(mission, snap) {
    const p = this.getProgress(mission, snap);
    return p.tracked && p.cur >= p.target;
  }

  _stateOf(mission, snap) {
    if (mission.completed) return 'claimed';
    if (this.isMissionComplete(mission, snap)) return 'ready';
    if (mission === this._finalMission()) return 'locked';
    return 'progress';
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

  completeMission(missionId) {
    const mission = this.missions.find(m => m.id === missionId);
    if (!mission) return;
    if (mission.completed) {
      this._notice('Already Claimed', 'You have already claimed this reward.');
      return;
    }
    if (!this.isMissionComplete(mission)) {
      const p = this.getProgress(mission);
      this._notice('Not Yet Complete', `${mission.title}: ${p.cur} / ${p.target}. Complete the mission to claim its reward.`);
      return;
    }

    mission.completed = true;
    this.saveMissionProgress();
    this.giveReward(mission.reward);
    this._render(true);

    const item = this._rewardItem(mission.reward);
    if (window.DashboardMailbox && typeof window.DashboardMailbox.showRewardReveal === 'function') {
      window.DashboardMailbox.showRewardReveal([item], {
        title: 'Rewards Obtained',
        note: mission.reward?.type === 'character' ? 'New ninja added to your Characters.' : mission.title,
      });
    } else {
      this._notice('Mission Complete', `${mission.title}\nReward: ${this.getRewardDisplayText(mission.reward)}`);
    }
  }

  giveReward(reward) {
    switch (reward.type) {
      case 'character':
        if (window.InventoryChar) {
          for (let i = 0; i < reward.quantity; i++) {
            window.InventoryChar.addCopy(reward.characterId, 1, reward.tierCode || '3S');
          }
          console.log(`Gave character: ${reward.characterId} x${reward.quantity}`);
        }
        break;

      case 'resource':
        if (window.Resources) {
          const resourceKey = reward.resourceName.toLowerCase().replace(/\s+/g, '_');
          window.Resources.add(resourceKey, reward.quantity);
          console.log(`Gave resource: ${reward.resourceName} x${reward.quantity}`);
        } else {
          console.error('[PanelMissions] Resources module not loaded; reward lost:', reward);
        }
        break;

      case 'item':
        // TODO: Implement item system
        console.log(`Gave item: ${reward.itemId} x${reward.quantity}`);
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

  _charName(id) {
    const c = this._chars?.[id];
    if (c && c.name) return c.name;
    return 'Ninja';
  }

  /** { icon, fallback, name, qty, kind } */
  _rewardItem(reward) {
    reward = reward || {};
    if (reward.type === 'character') {
      const tier = reward.tierCode || '3S';
      const known = !!this._chars?.[reward.characterId];
      return {
        kind: 'character',
        icon: `assets/characters/${reward.characterId}/portrait_${tier}.png`,
        fallback: 'assets/icons/characters_icon.png',
        name: known ? this._charName(reward.characterId) : `${this._tierLabel(tier)} Ninja`,
        tier: this._tierLabel(tier),
        qty: reward.quantity || 1,
      };
    }
    if (reward.type === 'resource') {
      const n = String(reward.resourceName || '').toLowerCase();
      const icon = n.includes('pearl') ? 'assets/icons/currency/ninjapearl.png'
        : n.includes('ryo') ? 'assets/icons/currency/ryo.png'
        : n.includes('shinobite') ? 'assets/icons/currency/shinobite.png'
        : 'assets/icons/chestunopened.png';
      return { kind: 'resource', icon, name: reward.resourceName, qty: reward.quantity };
    }
    return { kind: 'item', icon: 'assets/icons/chestunopened.png', name: reward.itemId || 'Item', qty: reward.quantity || 1 };
  }

  getRewardDisplayText(reward) {
    switch (reward.type) {
      case 'character':
        return `${this._rewardItem(reward).name} x${reward.quantity}`;
      case 'resource':
        return `${reward.quantity} ${reward.resourceName}`;
      case 'item':
        return `${reward.quantity}x ${reward.itemId}`;
      default:
        return 'Unknown reward';
    }
  }

  getRewardIcon(reward) {
    const it = this._rewardItem(reward);
    return `<img src="${this._esc(it.icon)}" class="reward-icon-img" alt="" onerror="this.onerror=null;this.src='${it.fallback || 'assets/icons/chestunopened.png'}'">`;
  }

  /* ------------------------------------------------------------------
   * UI
   * ------------------------------------------------------------------ */
  _ensureStyles() {
    if (document.querySelector('link[href*="css/panel-missions.css"]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/panel-missions.css?v=2';
    document.head.appendChild(l);
  }

  _fmt(n) { return (Number(n) || 0).toLocaleString(); }

  _tileHTML(m, i, snap) {
    const st = this._stateOf(m, snap);
    const p = this.getProgress(m, snap);
    const it = this._rewardItem(m.reward);
    const pct = Math.round((p.cur / p.target) * 100);
    const fb = it.fallback || 'assets/icons/chestunopened.png';
    const stateLabel = { claimed: 'Claimed', ready: 'Complete', progress: 'In Progress' }[st];

    let action;
    if (st === 'ready') action = `<button class="jjk-btn pm-claim" data-claim="${this._esc(m.id)}">Claim</button>`;
    else if (st === 'claimed') action = `<img class="pm-stamp" src="assets/ui/jjk/stamp_claimed.webp" alt="Claimed" draggable="false">`;
    else action = `<span class="pm-count"><b>${this._fmt(p.cur)}</b>/${this._fmt(p.target)}</span>`;

    return `
      <article class="pm-tile is-${st}" style="--i:${i}" title="${this._esc(m.description)}">
        <div class="pm-tile-top">
          <span class="pm-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="pm-state">${stateLabel}</span>
        </div>
        <h3 class="pm-title">${this._esc(m.title)}</h3>
        <p class="pm-desc">${this._esc(m.description)}</p>
        <div class="pm-prog"><div class="jjk-progress"><i style="width:${pct}%"></i></div></div>
        <div class="pm-tile-foot">
          <span class="pm-reward${it.kind === 'character' ? ' is-char' : ''}">
            <img src="${this._esc(it.icon)}" alt="" draggable="false" onerror="this.onerror=null;this.src='${fb}'">
            <span>${it.kind === 'character' ? this._esc(it.tier || 'Ninja') : '&times;' + this._fmt(it.qty)}</span>
          </span>
          ${action}
        </div>
      </article>`;
  }

  _finalHTML(m, snap) {
    if (!m) return '';
    const st = this._stateOf(m, snap);
    const p = this.getProgress(m, snap);
    const it = this._rewardItem(m.reward);
    const fb = it.fallback || 'assets/icons/chestunopened.png';
    let action;
    if (st === 'ready') action = `<button class="jjk-btn pm-final-claim" data-claim="${this._esc(m.id)}">Claim</button>`;
    else if (st === 'claimed') action = `<div class="pm-final-done"><img src="assets/ui/jjk/stamp_claimed.webp" alt="" draggable="false"><span>Claimed</span></div>`;
    else action = `<button class="jjk-btn pm-final-claim" disabled>Claim</button>`;

    return `
      <aside class="pm-final is-${st}">
        <div class="pm-final-head">Panel Complete Reward</div>
        <div class="pm-final-socket${it.kind === 'character' ? ' is-char' : ''}">
          <img src="${this._esc(it.icon)}" alt="" draggable="false" onerror="this.onerror=null;this.src='${fb}'">
          <span class="pm-final-qty">${it.kind === 'character' ? this._esc(it.tier) : '&times;' + this._fmt(it.qty)}</span>
        </div>
        <div class="pm-final-name">${this._esc(it.name)}</div>
        <div class="pm-final-desc">${this._esc(m.description)}</div>
        ${st === 'locked' ? `<div class="pm-final-state"><span>Locked</span>${p.target - p.cur} mission${p.target - p.cur === 1 ? '' : 's'} left to claim</div>` : ''}
        ${st === 'ready' ? `<div class="pm-final-state is-ready"><span>Panel Clear</span>Reward ready</div>` : ''}
        <div class="pm-final-prog">
          <div class="jjk-progress"><i style="width:${Math.round(p.cur / p.target * 100)}%"></i></div>
          <span><b>${p.cur}</b> / ${p.target}</span>
        </div>
        ${action}
      </aside>`;
  }

  _render(keep) {
    const modal = document.getElementById('panel-modal');
    if (!modal) return;
    const snap = this._snapshot();
    const board = this._boardMissions();
    const fin = this._finalMission();
    const cleared = board.filter(m => m.completed).length;
    const ready = this.missions.filter(m => this._stateOf(m, snap) === 'ready').length;

    modal.querySelector('#pm-summary').innerHTML = `
      <div class="pm-summary-label"><span>Cleared</span><b>${cleared}</b><em>/ ${board.length}</em>
        ${ready ? `<span class="pm-ready-chip">${ready} ready</span>` : ''}</div>
      <div class="jjk-progress"><i style="width:${board.length ? Math.round(cleared / board.length * 100) : 0}%"></i></div>`;
    const grid = modal.querySelector('#pm-grid');
    grid.classList.toggle('no-anim', !!keep);
    grid.innerHTML = board.map((m, i) => this._tileHTML(m, i, snap)).join('');
    modal.querySelector('#pm-final-slot').innerHTML = this._finalHTML(fin, snap);
  }

  openPanelModal() {
    if (this.missions.length === 0) {
      this._notice('Panel Missions', 'No panel missions available.');
      return;
    }
    this._ensureStyles();
    this._loadCharacters();

    const existingModal = document.getElementById('panel-modal');
    if (existingModal) existingModal.remove();

    const modalHTML = `
      <div class="pm-modal" id="panel-modal" role="dialog" aria-modal="true" aria-label="Panel Missions">
        <div class="pm-backdrop" data-close></div>
        <section class="pm-shell">
          <header class="pm-head">
            <h2 class="jjk-title-plate pm-plate">Panel Missions</h2>
            <div class="pm-panel-name"><span>Panel 1</span><small>Basic Training</small></div>
            <div class="pm-summary" id="pm-summary"></div>
            <button class="jjk-icon-btn pm-close" data-close aria-label="Close"><span class="pm-x" aria-hidden="true"></span></button>
          </header>
          <div class="pm-body">
            <div class="pm-grid" id="pm-grid"></div>
            <div class="pm-final-slot" id="pm-final-slot"></div>
          </div>
        </section>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('panel-modal');
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return this.closePanelModal();
      const b = e.target.closest('[data-claim]');
      if (b && !b.disabled) this.completeMission(b.getAttribute('data-claim'));
    });
    this._render(false);

    if (!this._escBound) {
      this._escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !document.getElementById('panel-modal')) return;
        if (document.getElementById('reward-reveal') || document.getElementById('custom-alert-modal')) return;
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

  // Kept for backwards compatibility (styles now live in css/panel-missions.css)
  injectPanelStyles() { this._ensureStyles(); }
}

// Global instance
window.PanelMissions = new PanelMissions();

console.log('✅ Panel Missions module loaded');
