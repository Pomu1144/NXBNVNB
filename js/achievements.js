// js/achievements.js - Achievements System

(function(global) {
  'use strict';

  const STORAGE_KEY = 'blazing_achievements_v1';

  let _allAchievements = [];
  let _unlocked = {};   // { achId: { unlockedAt, claimed } }
  let _loaded = false;

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
      console.log(`[Achievements] Loaded ${_allAchievements.length} achievements`);
    } catch (e) {
      console.error('[Achievements] Failed to load achievements.json:', e);
    }
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

  function claimReward(achievementId) {
    if (!_unlocked[achievementId]) return { ok: false, reason: 'NOT_UNLOCKED' };
    if (_unlocked[achievementId].claimed) return { ok: false, reason: 'ALREADY_CLAIMED' };

    const ach = _allAchievements.find(a => a.id === achievementId);
    if (!ach) return { ok: false, reason: 'NOT_FOUND' };

    // Grant rewards
    const rewards = ach.rewards || {};
    if (rewards.ryo && window.Resources) window.Resources.add('ryo', rewards.ryo);
    if (rewards.ninja_pearls && rewards.ninja_pearls > 0 && window.Resources) {
      window.Resources.add('ninja_pearls', rewards.ninja_pearls);
    }
    if (rewards.shinobites && rewards.shinobites > 0 && window.Resources) {
      window.Resources.add('shinobites', rewards.shinobites);
    }

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

  /* ── UI ─────────────────────────────────────────────────────────── */
  function openAchievementsModal() {
    const existing = document.getElementById('achievements-modal');
    if (existing) existing.remove();

    const categories = [...new Set(_allAchievements.map(a => a.category))];
    let activeCat = categories[0] || 'General';

    function renderContent(cat) {
      const filtered = _allAchievements.filter(a => a.category === cat);
      return filtered.map(ach => {
        const unlocked = isUnlocked(ach.id);
        const claimed  = isClaimed(ach.id);
        const pearls   = ach.rewards?.ninja_pearls || 0;
        const ryo      = ach.rewards?.ryo || 0;
        const pearlIcon = pearls > 0
          ? `<img src="assets/icons/currency/ninjapearl.png" style="width:14px;height:14px;vertical-align:middle;"> ×${pearls}`
          : '';
        const ryoIcon = `<img src="assets/icons/currency/ryo.png" style="width:14px;height:14px;vertical-align:middle;"> ${ryo.toLocaleString()}`;

        let statusBadge = '';
        let actionBtn = '';
        if (claimed) {
          statusBadge = '<span class="ach-badge ach-badge-claimed">Claimed</span>';
        } else if (unlocked) {
          statusBadge = '<span class="ach-badge ach-badge-unlocked">Unlocked!</span>';
          actionBtn = `<button class="ach-claim-btn" onclick="window.Achievements.claimAndRefresh('${ach.id}')">Claim</button>`;
        } else {
          statusBadge = '<span class="ach-badge ach-badge-locked">Locked</span>';
        }

        return `
          <div class="ach-item ${unlocked ? 'ach-unlocked' : 'ach-locked'} ${claimed ? 'ach-claimed' : ''}">
            <div class="ach-icon">${unlocked ? '🏆' : '🔒'}</div>
            <div class="ach-info">
              <div class="ach-title">${ach.title} ${statusBadge}</div>
              <div class="ach-desc">${ach.description}</div>
              <div class="ach-rewards">${ryoIcon} &nbsp; ${pearlIcon}</div>
            </div>
            <div class="ach-action">${actionBtn}</div>
          </div>`;
      }).join('');
    }

    function renderTabs() {
      return categories.map(cat => {
        const unclaimedInCat = _allAchievements
          .filter(a => a.category === cat && isUnlocked(a.id) && !isClaimed(a.id)).length;
        const dot = unclaimedInCat > 0 ? `<span class="ach-tab-dot">${unclaimedInCat}</span>` : '';
        return `<button class="ach-tab ${cat === activeCat ? 'ach-tab-active' : ''}"
          onclick="window.Achievements._switchTab('${cat}')">${cat}${dot}</button>`;
      }).join('');
    }

    const totalUnlocked = getUnlockedCount();
    const total = _allAchievements.length;

    const modal = document.createElement('div');
    modal.id = 'achievements-modal';
    modal.innerHTML = `
      <div class="ach-overlay" onclick="window.Achievements.closeModal()"></div>
      <div class="ach-panel">
        <div class="ach-header">
          <span class="ach-header-title">🏆 Achievements</span>
          <span class="ach-header-count">${totalUnlocked} / ${total}</span>
          <button class="ach-close-btn" onclick="window.Achievements.closeModal()">✕</button>
        </div>
        <div class="ach-progress-bar-wrap">
          <div class="ach-progress-bar" style="width:${Math.round(totalUnlocked/total*100)}%"></div>
        </div>
        <div class="ach-tabs" id="ach-tabs">${renderTabs()}</div>
        <div class="ach-list" id="ach-list">${renderContent(activeCat)}</div>
      </div>`;

    _injectStyles();
    document.body.appendChild(modal);

    // Store active category reference so _switchTab can update it
    modal._activeCat = activeCat;
    modal._renderContent = renderContent;
    modal._renderTabs = renderTabs;
  }

  function _switchTab(cat) {
    const modal = document.getElementById('achievements-modal');
    if (!modal) return;
    const list = document.getElementById('ach-list');
    const tabs = document.getElementById('ach-tabs');
    if (list) list.innerHTML = modal._renderContent(cat);

    // Re-render tabs with new active
    const categories = [...new Set(_allAchievements.map(a => a.category))];
    tabs.innerHTML = categories.map(c => {
      const unclaimedInCat = _allAchievements
        .filter(a => a.category === c && isUnlocked(a.id) && !isClaimed(a.id)).length;
      const dot = unclaimedInCat > 0 ? `<span class="ach-tab-dot">${unclaimedInCat}</span>` : '';
      return `<button class="ach-tab ${c === cat ? 'ach-tab-active' : ''}"
        onclick="window.Achievements._switchTab('${c}')">${c}${dot}</button>`;
    }).join('');
    modal._activeCat = cat;
  }

  function claimAndRefresh(achievementId) {
    const result = claimReward(achievementId);
    if (result.ok) {
      const ach = _allAchievements.find(a => a.id === achievementId);
      const rewards = result.rewards;
      const lines = [];
      if (rewards.ryo) lines.push(`<span style="color:#ffd700">🪙 +${rewards.ryo.toLocaleString()} Ryo</span>`);
      if (rewards.ninja_pearls) lines.push(`<span style="color:#a78bfa">💎 +${rewards.ninja_pearls} Ninja Pearls</span>`);
      _showClaimToast(ach?.title || achievementId, lines);
      openAchievementsModal();
    }
  }

  function _showClaimToast(title, rewardLines) {
    const existing = document.getElementById('ach-claim-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'ach-claim-toast';
    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="font-size:28px;line-height:1">🏆</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#d4af37;margin-bottom:4px">Achievement Claimed!</div>
          <div style="font-size:13px;color:#f0e6d1;margin-bottom:6px">${title}</div>
          ${rewardLines.length > 0 ? `<div style="font-size:13px;display:flex;flex-direction:column;gap:2px">${rewardLines.join('')}</div>` : ''}
        </div>
      </div>`;
    toast.style.cssText = `
      position:fixed;top:24px;right:24px;z-index:99999;
      background:linear-gradient(135deg,rgba(15,20,45,0.98),rgba(8,10,25,0.98));
      border:2px solid #d4af37;border-radius:14px;padding:16px 20px;
      box-shadow:0 8px 32px rgba(212,175,55,0.4);
      animation:achToastIn 0.3s ease;max-width:320px;
    `;
    if (!document.getElementById('ach-toast-style')) {
      const s = document.createElement('style');
      s.id = 'ach-toast-style';
      s.textContent = `@keyframes achToastIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
        @keyframes achToastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(40px)}}`;
      document.head.appendChild(s);
    }
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'achToastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function closeModal() {
    const modal = document.getElementById('achievements-modal');
    if (modal) modal.remove();
  }

  function _injectStyles() {
    if (document.getElementById('achievements-styles')) return;
    const style = document.createElement('style');
    style.id = 'achievements-styles';
    style.textContent = `
      #achievements-modal { position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center; }
      .ach-overlay { position:absolute;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px); }
      .ach-panel {
        position:relative;background:linear-gradient(135deg,rgba(15,20,45,0.98),rgba(8,10,25,0.98));
        border:3px solid #b8985f;border-radius:18px;width:min(720px,95vw);
        max-height:88vh;display:flex;flex-direction:column;
        box-shadow:0 0 60px rgba(184,152,95,0.4);overflow:hidden;
      }
      .ach-header {
        display:flex;align-items:center;gap:12px;padding:20px 24px 14px;
        border-bottom:2px solid rgba(184,152,95,0.3);
      }
      .ach-header-title { font-size:22px;font-weight:700;color:#d4af37;letter-spacing:2px;flex:1; }
      .ach-header-count { font-size:14px;color:#b8985f; }
      .ach-close-btn { background:rgba(220,53,69,0.2);border:2px solid rgba(220,53,69,0.5);color:#ff6b6b;font-size:18px;width:34px;height:34px;border-radius:50%;cursor:pointer;flex-shrink:0; }
      .ach-progress-bar-wrap { height:6px;background:rgba(255,255,255,0.1);margin:0 24px 0; }
      .ach-progress-bar { height:100%;background:linear-gradient(90deg,#b8985f,#d4af37);border-radius:3px;transition:width 0.5s; }
      .ach-tabs { display:flex;gap:6px;padding:12px 24px;flex-wrap:wrap;border-bottom:2px solid rgba(184,152,95,0.2); }
      .ach-tab {
        padding:6px 14px;font-size:12px;font-weight:600;border-radius:20px;cursor:pointer;
        background:rgba(255,255,255,0.06);border:1px solid rgba(184,152,95,0.3);color:#b8985f;
        transition:all 0.2s;position:relative;
      }
      .ach-tab:hover { background:rgba(184,152,95,0.15);color:#d4af37; }
      .ach-tab-active { background:rgba(212,175,55,0.2);border-color:#d4af37;color:#d4af37; }
      .ach-tab-dot {
        position:absolute;top:-6px;right:-4px;background:#ff4444;color:#fff;
        font-size:10px;font-weight:700;border-radius:50%;width:16px;height:16px;
        display:flex;align-items:center;justify-content:center;line-height:1;
      }
      .ach-list { flex:1;overflow-y:auto;padding:12px 24px 20px;display:flex;flex-direction:column;gap:10px; }
      .ach-item {
        display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;
        border:2px solid rgba(139,115,85,0.3);background:rgba(20,20,35,0.5);transition:all 0.2s;
      }
      .ach-item.ach-unlocked { border-color:rgba(212,175,55,0.5);background:rgba(212,175,55,0.05); }
      .ach-item.ach-claimed { opacity:0.6; }
      .ach-icon { font-size:28px;flex-shrink:0; }
      .ach-info { flex:1;min-width:0; }
      .ach-title { font-size:15px;font-weight:700;color:#d4af37;display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
      .ach-desc { font-size:13px;color:#b8a080;margin-top:3px;line-height:1.4; }
      .ach-rewards { font-size:12px;color:#6bcf7f;margin-top:6px;display:flex;align-items:center;gap:8px; }
      .ach-badge { font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase; }
      .ach-badge-claimed { background:rgba(107,207,127,0.2);color:#6bcf7f;border:1px solid #6bcf7f; }
      .ach-badge-unlocked { background:rgba(255,193,7,0.2);color:#ffc107;border:1px solid #ffc107; }
      .ach-badge-locked { background:rgba(255,255,255,0.06);color:#888;border:1px solid #555; }
      .ach-action { flex-shrink:0; }
      .ach-claim-btn {
        padding:8px 16px;font-size:13px;font-weight:700;border-radius:8px;cursor:pointer;
        background:linear-gradient(135deg,#b8985f,#d4af37);border:none;color:#1a1f3a;
        transition:all 0.2s;
      }
      .ach-claim-btn:hover { background:linear-gradient(135deg,#d4af37,#f0c040);transform:translateY(-1px); }
    `;
    document.head.appendChild(style);
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
    claimReward,
    claimAndRefresh,
    getUnlockedCount,
    getClaimedCount,
    openAchievementsModal,
    closeModal,
    _switchTab,
    isLoaded: () => _loaded,
    getAll: () => _allAchievements,
  };

})(window);
