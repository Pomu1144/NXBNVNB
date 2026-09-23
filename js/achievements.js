// js/achievements.js - Achievements System
// Data: data/achievements.json   State: localStorage 'blazing_achievements_v1'
// UI styles: css/achievements.css (shared JJK theme: css/theme-jjk.css)

(function(global) {
  'use strict';

  const STORAGE_KEY = 'blazing_achievements_v1';
  const ICON = {
    ryo: 'assets/icons/currency/ryo.png',
    ninja_pearls: 'assets/icons/currency/ninjapearl.png',
    shinobites: 'assets/icons/currency/shinobite.png',
  };
  const REWARD_NAME = { ryo: 'Ryo', ninja_pearls: 'Ninja Pearls', shinobites: 'Shinobites' };
  const ALL = 'All';

  let _allAchievements = [];
  let _unlocked = {};   // { achId: { unlockedAt, claimed } }
  let _loaded = false;
  let _activeCat = ALL;
  let _escBound = false;

  /* ── Persistence ─────────────────────────────────────────────────── */
  function _loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw);
      _unlocked = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      _unlocked = {};
    }
  }

  function _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_unlocked));
    } catch (e) {
      console.error('[Achievements] Save failed:', e);
    }
  }

  /* ── Load achievement definitions ───────────────────────────────── */
  async function loadAchievements() {
    try {
      const r = await fetch('data/achievements.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      _allAchievements = data.achievements || [];
      _loaded = true;
      evaluate();
      console.log(`[Achievements] Loaded ${_allAchievements.length} achievements`);
    } catch (e) {
      console.error('[Achievements] Failed to load achievements.json:', e);
    }
  }

  /* ── Progress tracking (read-only snapshot of existing game state) ──
   * Only achievements whose condition can be read from saved state get a
   * tracker; the rest stay locked until something calls unlock(id).     */
  function _json(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }

  function _snapshot() {
    const inst = (global.InventoryChar && typeof global.InventoryChar.allInstances === 'function')
      ? global.InventoryChar.allInstances()
      : (Array.isArray(_json('blazing_inventory_v2', [])) ? _json('blazing_inventory_v2', []) : []);
    const arena = Object.assign({ wins: 0, losses: 0, bestStreak: 0 }, _json('arena_record_v1', {}) || {});
    const prog = _json('blazing_mission_progress_v1', {}) || {};
    let clears = 0;
    Object.values(prog).forEach(m => { if (m && typeof m === 'object') Object.values(m).forEach(d => { if (d && d.firstClear) clears++; }); });
    const daily = _json('blazing_daily_progress_v1', {}) || {};
    const cal = _json('dailyStreak', {}) || {};
    const teams = _json('blazing_teams_v1', {}) || {};
    const teamCount = Object.values(teams).filter(t => t && typeof t === 'object' && Object.values(t).some(Boolean)).length;
    const codes = _json('blazing_redeemed_codes_v1', []);
    const res = (id) => {
      try { return global.Resources ? (Number(global.Resources.get(id)) || 0) : 0; } catch (e) { return 0; }
    };
    return {
      distinct: new Set(inst.map(i => i && i.charId).filter(Boolean)).size,
      total: inst.length,
      wins: (Number(arena.wins) || 0),
      arenaPlayed: (Number(arena.wins) || 0) + (Number(arena.losses) || 0),
      bestStreak: Number(arena.bestStreak) || 0,
      clears,
      battlesWon: clears + (Number(arena.wins) || 0),
      teams: teamCount,
      codes: Array.isArray(codes) ? codes.length : (codes && typeof codes === 'object' ? Object.keys(codes).length : 0),
      streak: Math.max(Number(daily.loginStreak) || 0, Number(cal.streak) || 0),
      dailyClaimed: daily.lastLogin ? 1 : 0,
      background: (localStorage.getItem('blazing_background') || localStorage.getItem('selected_background')) ? 1 : 0,
      ryo: res('ryo'), pearls: res('ninja_pearls'), shinobites: res('shinobites'),
    };
  }

  // id -> [snapshot key, target]
  const TRACKERS = {
    ach_001: ['one', 1],
    ach_002: ['distinct', 1], ach_018: ['distinct', 10], ach_019: ['distinct', 25],
    ach_020: ['distinct', 50], ach_021: ['distinct', 100], ach_022: ['distinct', 200],
    ach_087: ['total', 50], ach_088: ['total', 100], ach_089: ['total', 250],
    ach_004: ['battlesWon', 1], ach_051: ['battlesWon', 25], ach_052: ['battlesWon', 50], ach_053: ['battlesWon', 100],
    ach_005: ['teams', 1], ach_067: ['teams', 3], ach_068: ['teams', 5],
    ach_008: ['arenaPlayed', 1], ach_009: ['wins', 1], ach_010: ['wins', 5], ach_011: ['wins', 10],
    ach_082: ['bestStreak', 3], ach_083: ['bestStreak', 5], ach_084: ['bestStreak', 10],
    ach_029: ['clears', 5], ach_030: ['clears', 20], ach_031: ['clears', 50], ach_032: ['clears', 100],
    ach_039: ['ryo', 500000], ach_040: ['ryo', 1000000], ach_041: ['ryo', 5000000],
    ach_042: ['pearls', 50], ach_135: ['shinobites', 50], ach_136: ['shinobites', 200],
    ach_043: ['codes', 1],
    ach_063: ['streak', 7], ach_064: ['streak', 30],
    ach_090: ['background', 1], ach_092: ['dailyClaimed', 1],
    // meta achievements (evaluated after the others)
    ach_129: ['unlocked', 10], ach_130: ['unlocked', 25], ach_131: ['unlocked', 50],
    ach_100: ['unlocked', 100], ach_150: ['unlockedOthers', 149], ach_149: ['claimed', 140],
  };

  let _snap = null;
  function _progressOf(ach) {
    const t = TRACKERS[ach.id];
    if (!t) return null;
    const [key, target] = t;
    const s = _snap || (_snap = _snapshot());
    let cur;
    if (key === 'one') cur = 1;
    else if (key === 'unlocked') cur = getUnlockedCount();
    else if (key === 'unlockedOthers') cur = getUnlockedCount() - (isUnlocked(ach.id) ? 1 : 0);
    else if (key === 'claimed') cur = getClaimedCount();
    else cur = Number(s[key]) || 0;
    return { cur: Math.min(cur, target), target };
  }

  /** Unlock every tracked achievement whose condition is met. Returns # newly unlocked. */
  function evaluate() {
    _snap = _snapshot();
    let n = 0;
    for (let pass = 0; pass < 2; pass++) {       // 2nd pass settles the "earn N achievements" ones
      _allAchievements.forEach(a => {
        if (isUnlocked(a.id)) return;
        const p = _progressOf(a);
        if (p && p.cur >= p.target) {
          _unlocked[a.id] = { unlockedAt: new Date().toISOString(), claimed: false };
          n++;
        }
      });
    }
    if (n) _saveState();
    return n;
  }

  /* ── Public helpers ─────────────────────────────────────────────── */
  function unlock(achievementId) {
    if (_unlocked[achievementId]) return false; // already unlocked
    _unlocked[achievementId] = { unlockedAt: new Date().toISOString(), claimed: false };
    _saveState();
    return true;
  }

  function isUnlocked(achievementId) {
    return !!_unlocked[achievementId];
  }

  function isClaimed(achievementId) {
    return !!(_unlocked[achievementId]?.claimed);
  }

  function isClaimable(achievementId) {
    return isUnlocked(achievementId) && !isClaimed(achievementId);
  }

  function _grant(ach) {
    const rewards = ach.rewards || {};
    if (window.Resources) {
      Object.keys(rewards).forEach(k => {
        const v = Number(rewards[k]) || 0;
        if (v > 0) window.Resources.add(k, v);
      });
    }
    return rewards;
  }

  function claimReward(achievementId) {
    if (!_unlocked[achievementId]) return { ok: false, reason: 'NOT_UNLOCKED' };
    if (_unlocked[achievementId].claimed) return { ok: false, reason: 'ALREADY_CLAIMED' };

    const ach = _allAchievements.find(a => a.id === achievementId);
    if (!ach) return { ok: false, reason: 'NOT_FOUND' };

    const rewards = _grant(ach);
    _unlocked[achievementId].claimed = true;
    _saveState();
    return { ok: true, rewards };
  }

  function getUnlockedCount() {
    return Object.keys(_unlocked).length;
  }

  function getClaimedCount() {
    return Object.values(_unlocked).filter(u => u.claimed).length;
  }

  function getClaimableCount() {
    return _allAchievements.filter(a => isClaimable(a.id)).length;
  }

  /* ── UI helpers ─────────────────────────────────────────────────── */
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function _fmt(n) { return (Number(n) || 0).toLocaleString(); }
  function _short(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }

  function _tier(ach) {
    const p = Number(ach.rewards?.ninja_pearls) || 0;
    return p >= 7 ? 'gold' : p >= 3 ? 'silver' : 'bronze';
  }

  function _ensureStyles() {
    if (document.querySelector('link[href*="css/achievements.css"]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/achievements.css?v=2';
    document.head.appendChild(l);
  }

  function _categories() {
    return [...new Set(_allAchievements.map(a => a.category))];
  }

  function _state(ach) {
    if (isClaimed(ach.id)) return 'claimed';
    if (isUnlocked(ach.id)) return 'claimable';
    return 'locked';
  }

  function _sorted(list) {
    const rank = { claimable: 0, locked: 1, claimed: 2 };
    return list
      .map((a, i) => ({ a, i, s: _state(a), p: _progressOf(a) }))
      .sort((x, y) => {
        if (rank[x.s] !== rank[y.s]) return rank[x.s] - rank[y.s];
        if (x.s === 'locked') {
          const rx = x.p ? x.p.cur / x.p.target : -1;
          const ry = y.p ? y.p.cur / y.p.target : -1;
          if (rx !== ry) return ry - rx;
        }
        return x.i - y.i;
      });
  }

  function _rowHTML({ a, s, p }, idx) {
    const r = a.rewards || {};
    const chips = Object.keys(r).filter(k => Number(r[k]) > 0).map(k => `
      <span class="ach-chip" title="${_esc(REWARD_NAME[k] || k)}">
        <img src="${ICON[k] || 'assets/icons/chestunopened.png'}" alt="" draggable="false">${_fmt(r[k])}
      </span>`).join('');

    const prog = (p && s === 'locked') ? `
      <div class="ach-prog">
        <div class="jjk-progress"><i style="width:${Math.round(p.cur / p.target * 100)}%"></i></div>
      </div>` : '';

    let side;
    if (s === 'claimable') {
      side = `<button class="jjk-btn ach-claim" data-claim="${_esc(a.id)}">Claim</button>`;
    } else if (s === 'claimed') {
      side = `<img class="ach-stamp" src="assets/ui/jjk/stamp_claimed.webp" alt="Claimed" draggable="false"><span class="ach-side-label">Claimed</span>`;
    } else if (p) {
      side = `<span class="ach-side-state">In progress</span><span class="ach-side-count">${_short(p.cur)}<small>/${_short(p.target)}</small></span>`;
    } else {
      side = `<span class="ach-side-state is-muted">Locked</span>`;
    }

    const medal = s === 'locked' ? 'medal_locked.webp' : 'medal_gold.webp';
    return `
      <article class="ach-row is-${s}" style="--i:${Math.min(idx, 12)}">
        <div class="ach-row-main">
          <div class="ach-emblem tier-${_tier(a)}">
            <img src="assets/ui/jjk/${medal}" alt="" draggable="false">
          </div>
          <div class="ach-text">
            <div class="ach-title-line">
              <h3 class="ach-title">${_esc(a.title)}</h3>
              ${_activeCat === ALL ? `<span class="ach-cat-tag">${_esc(a.category)}</span>` : ''}
            </div>
            <p class="ach-desc">${_esc(a.description)}</p>
            <div class="ach-meta">${prog}<div class="ach-chips">${chips}</div></div>
          </div>
        </div>
        <div class="ach-row-side">${side}</div>
      </article>`;
  }

  function _railHTML() {
    const cats = [ALL, ..._categories()];
    return cats.map(cat => {
      const list = cat === ALL ? _allAchievements : _allAchievements.filter(a => a.category === cat);
      const done = list.filter(a => isUnlocked(a.id)).length;
      const claim = list.filter(a => isClaimable(a.id)).length;
      return `
        <button class="jjk-tab ach-cat${cat === _activeCat ? ' active' : ''}" data-cat="${_esc(cat)}" role="tab" aria-selected="${cat === _activeCat}">
          <span class="ach-cat-name">${_esc(cat)}</span>
          <span class="ach-cat-count">${done}/${list.length}</span>
          ${claim ? `<span class="ach-cat-dot" title="${claim} to claim">${claim}</span>` : ''}
        </button>`;
    }).join('');
  }

  function _listHTML() {
    const list = _activeCat === ALL ? _allAchievements : _allAchievements.filter(a => a.category === _activeCat);
    if (!list.length) return '<div class="ach-empty">No achievements in this category.</div>';
    return _sorted(list).map(_rowHTML).join('');
  }

  function _headStatsHTML() {
    const total = _allAchievements.length || 1;
    const un = getUnlockedCount();
    const claimable = getClaimableCount();
    return {
      overall: `
        <div class="ach-overall-label"><span>Unlocked</span><b>${un}</b><em>/ ${_allAchievements.length}</em></div>
        <div class="jjk-progress ach-overall-bar"><i style="width:${Math.min(100, un / total * 100).toFixed(1)}%"></i></div>`,
      claimAll: `Claim All${claimable ? `<span class="ach-btn-badge">${claimable}</span>` : ''}`,
      claimable,
    };
  }

  /* ── Modal ──────────────────────────────────────────────────────── */
  function openAchievementsModal() {
    _ensureStyles();
    _loadState();
    evaluate();
    const existing = document.getElementById('achievements-modal');
    if (existing) existing.remove();
    if (_activeCat !== ALL && !_categories().includes(_activeCat)) _activeCat = ALL;

    const h = _headStatsHTML();
    const modal = document.createElement('div');
    modal.id = 'achievements-modal';
    modal.className = 'ach-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Achievements');
    modal.innerHTML = `
      <div class="ach-backdrop" data-close></div>
      <section class="ach-shell">
        <header class="ach-head">
          <h2 class="jjk-title-plate ach-plate">Achievements</h2>
          <div class="ach-overall" id="ach-overall">${h.overall}</div>
          <button class="jjk-btn ach-claim-all" id="ach-claim-all" data-claim-all ${h.claimable ? '' : 'disabled'}>${h.claimAll}</button>
          <button class="jjk-icon-btn ach-close" data-close aria-label="Close"><span class="ach-x" aria-hidden="true"></span></button>
        </header>
        <div class="ach-body">
          <nav class="ach-rail" id="ach-tabs" role="tablist" aria-label="Categories">${_railHTML()}</nav>
          <div class="ach-list" id="ach-list">${_listHTML()}</div>
        </div>
      </section>`;

    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-close]')) return closeModal();
      const claimBtn = t.closest('[data-claim]');
      if (claimBtn) return claimAndRefresh(claimBtn.getAttribute('data-claim'));
      if (t.closest('[data-claim-all]')) return claimAll();
      const cat = t.closest('[data-cat]');
      if (cat) return _switchTab(cat.getAttribute('data-cat'));
    });

    document.body.appendChild(modal);
    const active = modal.querySelector('.ach-cat.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    if (!_escBound) {
      _escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('achievements-modal') && !document.getElementById('reward-reveal')) closeModal();
      });
    }
  }

  function _refresh(keepScroll) {
    const modal = document.getElementById('achievements-modal');
    if (!modal) return;
    const list = document.getElementById('ach-list');
    const top = keepScroll && list ? list.scrollTop : 0;
    const h = _headStatsHTML();
    document.getElementById('ach-overall').innerHTML = h.overall;
    const ca = document.getElementById('ach-claim-all');
    ca.innerHTML = h.claimAll;
    ca.disabled = !h.claimable;
    const rail = document.getElementById('ach-tabs');
    const railTop = rail.scrollTop, railLeft = rail.scrollLeft;
    rail.innerHTML = _railHTML();
    rail.scrollTop = railTop; rail.scrollLeft = railLeft;
    list.innerHTML = _listHTML();
    list.classList.toggle('no-anim', !!keepScroll);
    list.scrollTop = top;
  }

  function _switchTab(cat) {
    _activeCat = cat;
    _refresh(false);
  }

  function _revealItems(totals) {
    return Object.keys(totals).filter(k => totals[k] > 0).map(k => ({
      icon: ICON[k] || 'assets/icons/chestunopened.png', name: REWARD_NAME[k] || k, qty: totals[k],
    }));
  }

  function _afterClaim(title, totals) {
    if (typeof window.updateBottomBarBadges === 'function') { try { window.updateBottomBarBadges(); } catch (e) { /* ignore */ } }
    const items = _revealItems(totals);
    if (window.DashboardMailbox && typeof window.DashboardMailbox.showRewardReveal === 'function' && items.length) {
      window.DashboardMailbox.showRewardReveal(items, { title: 'Rewards Obtained', note: title });
    } else {
      _showClaimToast(title, items);
    }
  }

  function claimAndRefresh(achievementId) {
    const result = claimReward(achievementId);
    if (!result.ok) return;
    const ach = _allAchievements.find(a => a.id === achievementId);
    evaluate();               // claiming can complete "claim N" meta achievements
    _refresh(true);
    _afterClaim(ach ? ach.title : 'Achievement Claimed', Object.assign({}, result.rewards));
  }

  function claimAll() {
    const totals = {};
    let count = 0;
    // Loop: claiming may unlock meta achievements which are then claimed too
    for (let guard = 0; guard < 5; guard++) {
      const pending = _allAchievements.filter(a => isClaimable(a.id));
      if (!pending.length) break;
      pending.forEach(a => {
        const res = claimReward(a.id);
        if (!res.ok) return;
        count++;
        Object.keys(res.rewards || {}).forEach(k => { totals[k] = (totals[k] || 0) + (Number(res.rewards[k]) || 0); });
      });
      evaluate();
    }
    if (!count) return;
    _refresh(true);
    _afterClaim(`${count} achievement${count > 1 ? 's' : ''} claimed`, totals);
  }

  function _showClaimToast(title, items) {
    const existing = document.getElementById('ach-claim-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'ach-claim-toast';
    toast.className = 'ach-toast';
    toast.innerHTML = `
      <div class="ach-toast-head">Achievement Claimed</div>
      <div class="ach-toast-title">${_esc(title)}</div>
      <div class="ach-chips">${items.map(it => `<span class="ach-chip"><img src="${it.icon}" alt="">${_fmt(it.qty)}</span>`).join('')}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('is-leaving'); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function closeModal() {
    const modal = document.getElementById('achievements-modal');
    if (!modal) return;
    modal.classList.add('is-leaving');
    setTimeout(() => modal.remove(), 160);
  }

  /* ── Init ───────────────────────────────────────────────────────── */
  _loadState();
  loadAchievements();

  /* ── Public API ─────────────────────────────────────────────────── */
  global.Achievements = {
    loadAchievements,
    unlock,
    isUnlocked,
    isClaimed,
    isClaimable,
    claimReward,
    claimAndRefresh,
    claimAll,
    evaluate,
    getUnlockedCount,
    getClaimedCount,
    getClaimableCount,
    getProgress: (id) => { _snap = _snapshot(); const a = _allAchievements.find(x => x.id === id); return a ? _progressOf(a) : null; },
    openAchievementsModal,
    closeModal,
    _switchTab,
    isLoaded: () => _loaded,
    getAll: () => _allAchievements,
  };

})(window);
