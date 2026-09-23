// js/dashboard-mailbox.js - Mailbox System

class DashboardMailbox {
  constructor() {
    this.messages = [];
    this.unreadCount = 0;
  }

  init() {
    this.loadMessages();
    this.updateUnreadCount();
    console.log('✅ Dashboard Mailbox initialized - Unread messages:', this.unreadCount);
  }

  loadMessages() {
    try {
      const saved = localStorage.getItem('mailboxMessages');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.messages = Array.isArray(parsed) ? parsed : [];
      } else {
        this.messages = [
          {
            id: 'welcome_001',
            title: 'Welcome to Naruto Blazing!',
            message: 'Thank you for playing! Here are some starter rewards to help you begin your ninja journey.',
            date: new Date().toISOString(),
            read: false,
            rewards: {
              'Ninja Pearls': 50,
              'Ryo': 10000,
              'Shinobites': 5
            }
          }
        ];
        this.saveMessages();
      }
    } catch (e) {
      console.error('[Mailbox] loadMessages error:', e);
      this.messages = [];
    }
  }

  saveMessages() {
    localStorage.setItem('mailboxMessages', JSON.stringify(this.messages));
  }

  updateUnreadCount() {
    this.unreadCount = this.messages.filter(msg => !msg.read).length;
  }

  getUnreadCount() {
    return this.unreadCount;
  }

  addMessage(message) {
    const newMessage = {
      id: `msg_${Date.now()}`,
      title: message.title || 'New Message',
      message: message.message || '',
      date: new Date().toISOString(),
      read: false,
      rewards: message.rewards || null
    };

    this.messages.unshift(newMessage);
    this.saveMessages();
    this.updateUnreadCount();
  }

  markAsRead(messageId) {
    const message = this.messages.find(msg => msg.id === messageId);
    if (message && !message.read) {
      message.read = true;
      this.saveMessages();
      this.updateUnreadCount();
    }
  }

  openMailbox() {
    this.loadMessages();
    this.updateUnreadCount();
    this.showMailboxModal();
  }

  /* ------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------ */
  _esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  _fmtQty(n) {
    const v = Number(n) || 0;
    return v.toLocaleString();
  }

  _relDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Icon URL for a resource / item name or id */
  _resourceIconUrl(nameOrId) {
    const n = String(nameOrId || '').toLowerCase();
    if (n.includes('pearl')) return 'assets/icons/currency/ninjapearl.png';
    if (n.includes('ryo')) return 'assets/icons/currency/ryo.png';
    if (n.includes('shinobite')) return 'assets/icons/currency/shinobite.png';
    if (window.RewardFormat) return window.RewardFormat.icon(nameOrId);
    return 'assets/icons/chestunopened.png';
  }

  _charName(id) {
    try {
      const list = window.CharacterData || window.CHARACTERS || null;
      if (Array.isArray(list)) {
        const c = list.find(x => x.id === id);
        if (c && c.name) return c.name;
      }
    } catch (e) { /* ignore */ }
    return String(id || 'Ninja')
      .replace(/_\d+$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  /**
   * Normalise every reward format (legacy flat map, {resources, characters})
   * into a flat list: { key, name, qty, icon, kind, claimed }
   */
  _collectRewards(msg) {
    const out = [];
    const r = msg && msg.rewards;
    if (!r || typeof r !== 'object') return out;
    const claimed = msg.claimed || [];

    (r.resources || []).forEach(res => {
      const key = `res_${res.resourceId || res.name}`;
      out.push({
        key, kind: 'resource',
        name: res.name || (window.RewardFormat ? window.RewardFormat.name(res.resourceId) : res.resourceId),
        qty: res.quantity,
        icon: this._resourceIconUrl(res.resourceId || res.name),
        claimed: claimed.includes(key)
      });
    });

    (r.characters || []).forEach(ch => {
      const key = `char_${ch.characterId}`;
      out.push({
        key, kind: 'character',
        name: this._charName(ch.characterId),
        qty: ch.quantity || 1,
        icon: `assets/characters/${ch.characterId}/portrait_${ch.tierCode || '3S'}.webp`,
        fallback: 'assets/icons/characters_icon.png',
        claimed: claimed.includes(key)
      });
    });

    Object.keys(r).filter(k => k !== 'characters' && k !== 'resources').forEach(name => {
      const key = `legacy_${name}`;
      out.push({
        key, kind: 'resource',
        name: window.RewardFormat ? window.RewardFormat.name(name) : name,
        qty: r[name],
        icon: this._resourceIconUrl(name),
        claimed: claimed.includes(key)
      });
    });
    return out;
  }

  _hasUnclaimed(msg) {
    return !msg.allClaimed && this._collectRewards(msg).some(x => !x.claimed);
  }

  _imgTag(item, cls) {
    const fb = item.fallback || 'assets/icons/chestunopened.png';
    return `<img class="${cls}" src="${this._esc(item.icon)}" alt="" draggable="false" onerror="this.onerror=null;this.src='${fb}'">`;
  }

  _ensureStyles() {
    if (!document.getElementById('present-box-css')) {
      const l = document.createElement('link');
      l.id = 'present-box-css';
      l.rel = 'stylesheet';
      l.href = 'css/present-box.css?v=2';
      document.head.appendChild(l);
    }
    if (!document.querySelector('link[href*="css/fonts.css"]')) {
      const f = document.createElement('link');
      f.rel = 'stylesheet';
      f.href = 'css/fonts.css';
      document.head.appendChild(f);
    }
  }

  _refreshBadge() {
    this.updateUnreadCount();
    try { window.dispatchEvent(new CustomEvent('mailboxUpdated', { detail: { unread: this.unreadCount } })); } catch (e) { /* ignore */ }
    if (typeof window.updateBottomBarBadges === 'function') {
      try { window.updateBottomBarBadges(); } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------------
   * Present Box list
   * ------------------------------------------------------------------ */
  _rowHTML(msg, index) {
    const rewards = this._collectRewards(msg);
    const unclaimed = this._hasUnclaimed(msg);
    const done = rewards.length > 0 && !unclaimed;
    const chips = rewards.slice(0, 4).map(it => `
      <span class="pb-chip${it.claimed ? ' is-claimed' : ''}">
        ${this._imgTag(it, 'pb-chip-icon')}<span class="pb-chip-qty">&times;${this._fmtQty(it.qty)}</span>
      </span>`).join('') + (rewards.length > 4 ? `<span class="pb-chip pb-chip-more">+${rewards.length - 4}</span>` : '');

    const iconSrc = rewards.length
      ? (done ? 'assets/icons/chestopened.png' : 'assets/icons/chestunopened.png')
      : 'assets/icons/notice_icon.png';

    let action;
    if (unclaimed) {
      action = `<button class="pb-btn pb-btn-gold pb-row-claim" onclick="event.stopPropagation();window.DashboardMailbox.claimRewards(${index})">Claim</button>`;
    } else if (done) {
      action = `<span class="pb-stamp"><img src="assets/ui/jjk/stamp_claimed.webp" alt="" draggable="false"><span>Claimed</span></span>`;
    } else {
      action = `<button class="pb-btn pb-btn-dark pb-row-view" onclick="event.stopPropagation();window.DashboardMailbox.viewMessage(${index})">View</button>`;
    }

    return `
      <div class="pb-row ${msg.read ? 'is-read' : 'is-unread'}${done ? ' is-done' : ''}" style="--i:${index}" onclick="window.DashboardMailbox.viewMessage(${index})">
        <div class="pb-row-icon"><img src="${iconSrc}" alt="" draggable="false" onerror="this.src='assets/icons/present_icon.png'"></div>
        <div class="pb-row-main">
          <div class="pb-row-top">
            ${!msg.read ? '<span class="pb-new">NEW</span>' : ''}
            <span class="pb-row-title">${this._esc(msg.title)}</span>
          </div>
          <div class="pb-row-text">${this._esc(msg.message)}</div>
          ${chips ? `<div class="pb-chips">${chips}</div>` : ''}
        </div>
        <div class="pb-row-side">
          <span class="pb-row-date">${this._relDate(msg.date)}</span>
          ${action}
        </div>
      </div>`;
  }

  showMailboxModal() {
    this._ensureStyles();
    const claimable = this.messages.filter(m => this._hasUnclaimed(m)).length;
    const listHTML = this.messages.length
      ? this.messages.map((m, i) => this._rowHTML(m, i)).join('')
      : `<div class="pb-empty">
           <img src="assets/icons/chestopened.png" alt="" draggable="false">
           <div class="pb-empty-title">No Presents</div>
           <div class="pb-empty-sub">Rewards from events, missions and gift codes will arrive here.</div>
         </div>`;

    const modalHTML = `
      <div class="mailbox-modal pb-modal" id="mailbox-modal" role="dialog" aria-modal="true" aria-label="Present Box">
        <div class="pb-backdrop" onclick="window.DashboardMailbox.closeMailbox()"></div>
        <div class="pb-frame">
          <button class="pb-close jjk-icon-btn" aria-label="Close" onclick="window.DashboardMailbox.closeMailbox()"></button>
          <div class="pb-inner">
            <div class="pb-head">
              <h2 class="pb-title jjk-title-plate">Present Box</h2>
              <div class="pb-counts">
                <span class="pb-count"><b>${this.messages.length}</b> Presents</span>
                ${this.unreadCount ? `<span class="pb-count pb-count-new"><b>${this.unreadCount}</b> New</span>` : ''}
              </div>
            </div>
            <div class="pb-list">${listHTML}</div>
            <div class="pb-foot">
              <span class="pb-foot-note">Presents are kept for 30 days.</span>
              <button class="pb-btn pb-btn-crimson pb-claim-all" ${claimable ? '' : 'disabled'} onclick="window.DashboardMailbox.claimAll()">
                Claim All${claimable ? ` <span class="pb-btn-badge">${claimable}</span>` : ''}
              </button>
            </div>
          </div>
        </div>
      </div>`;

    const existing = document.getElementById('mailbox-modal');
    const keepScroll = existing ? existing.querySelector('.pb-list')?.scrollTop : 0;
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('mailbox-modal');
    if (existing) {
      modal.classList.add('no-anim');
      const list = modal.querySelector('.pb-list');
      if (list) list.scrollTop = keepScroll || 0;
    }
    this._bindEsc();
  }

  _bindEsc() {
    if (this._escBound) return;
    this._escBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.getElementById('reward-reveal')) return this.closeRewardReveal();
      if (document.getElementById('message-view-modal')) return this.closeMessageView();
      if (document.getElementById('mailbox-modal')) this.closeMailbox();
    });
  }

  /* ------------------------------------------------------------------
   * Single present view
   * ------------------------------------------------------------------ */
  viewMessage(index) {
    const message = this.messages[index];
    if (!message) return;
    this._ensureStyles();
    this.markAsRead(message.id);
    this.closeMessageView();

    const rewards = this._collectRewards(message);
    const unclaimed = this._hasUnclaimed(message);
    const tiles = rewards.map(it => `
      <div class="pb-tile${it.claimed ? ' is-claimed' : ''}">
        <div class="pb-tile-socket">
          ${this._imgTag(it, 'pb-tile-icon')}
          <span class="pb-tile-qty">&times;${this._fmtQty(it.qty)}</span>
          ${it.claimed ? '<span class="pb-tile-check"></span>' : ''}
        </div>
        <div class="pb-tile-name">${this._esc(it.name)}</div>
      </div>`).join('');

    const date = new Date(message.date);
    const dateStr = isNaN(date) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const html = `
      <div class="message-view-modal pb-modal pb-modal--view" id="message-view-modal" role="dialog" aria-modal="true">
        <div class="pb-backdrop" onclick="window.DashboardMailbox.closeMessageView()"></div>
        <div class="pb-frame pb-frame--view">
          <button class="pb-close jjk-icon-btn" aria-label="Close" onclick="window.DashboardMailbox.closeMessageView()"></button>
          <div class="pb-inner">
            <div class="pb-head pb-head--view">
              <h3 class="pb-view-title">${this._esc(message.title)}</h3>
              <span class="pb-row-date">${dateStr}</span>
            </div>
            <div class="pb-view-body">
              <p class="pb-view-text">${this._esc(message.message)}</p>
              ${rewards.length ? `
                <div class="pb-view-label"><span>Contents</span></div>
                <div class="pb-tiles">${tiles}</div>` : ''}
            </div>
            <div class="pb-foot pb-foot--center">
              <button class="pb-btn pb-btn-dark" onclick="window.DashboardMailbox.closeMessageView()">Close</button>
              ${unclaimed ? `<button class="pb-btn pb-btn-gold" onclick="window.DashboardMailbox.claimRewards(${index})">Claim</button>` : ''}
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    this._bindEsc();
    this._refreshBadge();
    // Refresh the list behind so read state updates (no re-open animation)
    if (document.getElementById('mailbox-modal')) this.showMailboxModal();
  }

  /* ------------------------------------------------------------------
   * Small in-game notice (errors / info)
   * ------------------------------------------------------------------ */
  showCustomAlert(title, message, type = 'info') {
    this._ensureStyles();
    const el = document.getElementById('custom-alert-modal');
    if (el) el.remove();
    const html = `
      <div class="custom-alert-modal pb-modal pb-modal--alert ${type}" id="custom-alert-modal" role="alertdialog" aria-modal="true">
        <div class="pb-backdrop" onclick="document.getElementById('custom-alert-modal').remove()"></div>
        <div class="pb-alert">
          <div class="pb-alert-title">${this._esc(title)}</div>
          <div class="pb-alert-body">${message}</div>
          <button class="pb-btn pb-btn-gold" onclick="document.getElementById('custom-alert-modal').remove()">OK</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ------------------------------------------------------------------
   * Reward reveal (generic): items = [{ icon, name, qty, fallback? }]
   * ------------------------------------------------------------------ */
  showRewardReveal(items, opts = {}) {
    this._ensureStyles();
    this.closeRewardReveal(true);
    const list = (items || []).filter(Boolean);
    const title = opts.title || 'Rewards Obtained';
    const note = opts.note || '';
    const many = list.length > 5;

    const tiles = list.map((it, i) => `
      <div class="rr-tile" style="--d:${0.35 + i * 0.09}s">
        <div class="rr-tile-glow"></div>
        <div class="rr-socket">
          ${this._imgTag(it, 'rr-icon')}
          <span class="rr-qty${this._fmtQty(it.qty).length > 5 ? ' is-long' : ''}">&times;${this._fmtQty(it.qty)}</span>
        </div>
        <div class="rr-name">${this._esc(it.name)}</div>
      </div>`).join('');

    const html = `
      <div class="rr-modal" id="reward-reveal" role="dialog" aria-modal="true" aria-label="${this._esc(title)}">
        <div class="rr-backdrop"></div>
        <div class="rr-burst"><div class="rr-rays"></div><div class="rr-flare"></div></div>
        <div class="rr-card${many ? ' is-many' : ''}">
          <div class="rr-banner"><span>${this._esc(title)}</span></div>
          <div class="rr-grid">${tiles}</div>
          ${note ? `<div class="rr-note">${this._esc(note)}</div>` : ''}
          <button class="rr-ok" onclick="window.DashboardMailbox.closeRewardReveal()">OK</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    this._bindEsc();
    const ok = document.querySelector('#reward-reveal .rr-ok');
    if (ok) setTimeout(() => ok.focus({ preventScroll: true }), 50);
  }

  closeRewardReveal(immediate) {
    const el = document.getElementById('reward-reveal');
    if (!el) return;
    if (immediate) { el.remove(); return; }
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }

  /* ------------------------------------------------------------------
   * Claiming
   * ------------------------------------------------------------------ */
  /** Grants every unclaimed reward in a message. Returns the granted items. */
  _grant(message) {
    if (!message || !message.rewards || message.allClaimed) return [];
    if (!message.claimed) message.claimed = [];
    const granted = [];
    const r = message.rewards;

    (r.resources || []).forEach(res => {
      const key = `res_${res.resourceId || res.name}`;
      if (message.claimed.includes(key)) return;
      if (window.Resources) {
        const id = res.resourceId || this._resourceNameToId(res.name);
        if (id) window.Resources.add(id, res.quantity);
      }
      message.claimed.push(key);
    });

    (r.characters || []).forEach(ch => {
      const key = `char_${ch.characterId}`;
      if (message.claimed.includes(key)) return;
      if (window.InventoryChar) {
        for (let i = 0; i < ch.quantity; i++) {
          window.InventoryChar.addCopy(ch.characterId, 1, ch.tierCode || '3S');
        }
      }
      message.claimed.push(key);
    });

    Object.keys(r).filter(k => k !== 'characters' && k !== 'resources').forEach(name => {
      const key = `legacy_${name}`;
      if (message.claimed.includes(key)) return;
      const id = this._resourceNameToId(name);
      if (id && window.Resources) window.Resources.add(id, r[name]);
      message.claimed.push(key);
    });

    this._collectRewards(message).forEach(it => { if (it.claimed) granted.push(it); });
    if (this._collectRewards(message).every(it => it.claimed)) message.allClaimed = true;
    message.read = true;
    return granted;
  }

  claimRewards(index) {
    const message = this.messages[index];
    if (!message || !message.rewards) {
      this.showCustomAlert('No Rewards', 'This present has nothing to claim.', 'error');
      return;
    }
    const pending = this._collectRewards(message).filter(it => !it.claimed);
    if (message.allClaimed || pending.length === 0) {
      this.showCustomAlert('Already Claimed', 'You have already claimed this present.', 'error');
      return;
    }
    this._grant(message);
    this.saveMessages();
    this._refreshBadge();

    const hasChars = pending.some(it => it.kind === 'character');
    this.closeMessageView();
    if (document.getElementById('mailbox-modal')) this.showMailboxModal();
    this.showRewardReveal(pending, { note: hasChars ? 'New ninja added to your Characters.' : '' });
  }

  claimAll() {
    const totals = new Map();
    let hasChars = false;
    this.messages.forEach(msg => {
      const pending = this._collectRewards(msg).filter(it => !it.claimed);
      if (!pending.length || msg.allClaimed) return;
      this._grant(msg);
      pending.forEach(it => {
        if (it.kind === 'character') hasChars = true;
        const k = it.kind === 'character' ? it.key : (this._resourceNameToId(it.name) || it.name);
        const cur = totals.get(k);
        if (cur) cur.qty += Number(it.qty) || 0;
        else totals.set(k, { ...it, qty: Number(it.qty) || 0 });
      });
    });
    if (!totals.size) {
      this.showCustomAlert('Nothing to Claim', 'All presents have already been claimed.', 'info');
      return;
    }
    this.saveMessages();
    this._refreshBadge();
    if (document.getElementById('mailbox-modal')) this.showMailboxModal();
    this.showRewardReveal([...totals.values()], { note: hasChars ? 'New ninja added to your Characters.' : '' });
  }

  /** Map a display name → Resources key */
  _resourceNameToId(name) {
    if (!name) return null;
    const n = name.toLowerCase();
    if (n.includes('pearl') || n.includes('ninja_pearl')) return 'ninja_pearls';
    if (n.includes('ryo')) return 'ryo';
    if (n.includes('shinobite')) return 'shinobites';
    return null;
  }

  /** Return a small inline icon HTML for a resource */
  _resourceIcon(nameOrId) {
    if (!nameOrId) return '';
    const n = String(nameOrId).toLowerCase();
    if (n.includes('pearl') || n.includes('ninja_pearl')) {
      return '<img src="assets/icons/currency/ninjapearl.png" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
    }
    if (n.includes('ryo')) {
      return '<img src="assets/icons/currency/ryo.png" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
    }
    if (n.includes('shinobite')) {
      return '<img src="assets/icons/currency/shinobite.png" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
    }
    return '';
  }

  closeMessageView() {
    const modal = document.getElementById('message-view-modal');
    if (modal) modal.remove();
  }

  closeMailbox() {
    const modal = document.getElementById('mailbox-modal');
    if (!modal) return;
    modal.classList.add('is-leaving');
    setTimeout(() => modal.remove(), 180);
  }
}

// Global instance
window.DashboardMailbox = new DashboardMailbox();

console.log('✅ Dashboard Mailbox module loaded');
