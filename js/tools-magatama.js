// js/tools-magatama.js — "Magatama" view of the Tools page.
// Left: the selected shinobi's tools. Centre: the tool on a tomoe ring with
// 5 sockets. Right: Besetable / Backpack grids. Logic lives in js/magatama.js.
(function () {
  'use strict';

  const M = () => window.Magatama;
  const T = () => window.CharacterTools;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
  const SLOT_NAME = { equipment1: 'T1', equipment2: 'T2', equipment3: 'T3', equipment4: 'T4', equipment5: 'T5' };
  const VIEW_KEY = 'tools_ui_view_v1';

  const ui = { view: 'gear', slot: null, socket: -1, tab: 'fit', sel: null, shopType: 'attack', shopQty: 1 };

  /* ───────── Helpers ───────── */
  function selected() { const s = T() && T().getSelectedCharacter(); return s || null; }
  function tools() {
    const s = selected();
    if (!s) return [];
    const eq = s.inst.equippedJutsu || {};
    return M().TOOL_SLOTS.map(slot => ({ slot, card: eq[slot] ? T().getCard(eq[slot]) : null })).filter(t => t.card);
  }
  function currentTool() {
    const list = tools();
    return list.find(t => t.slot === ui.slot) || list[0] || null;
  }
  const pct = v => String(Math.round(v * 10) / 10);
  function bonusText(b, sep = ' ') {
    const parts = [];
    if (b.hp) parts.push(`+${fmt(b.hp)} HP`);
    if (b.atk) parts.push(`+${fmt(b.atk)} ATK`);
    if (b.def) parts.push(`+${fmt(b.def)} DEF`);
    if (b.nin) parts.push(`+${pct(b.nin)}% Jutsu DMG`);
    if (b.res) parts.push(`+${pct(b.res)}% Jutsu RES`);
    return parts.join(sep);
  }
  function gem(k, extra = '') {
    const i = M().info(k);
    return `<img class="mg-gem" src="${i.icon}" alt="" draggable="false">${extra}<span class="mg-lv">${i.level}</span>`;
  }
  function toast(msg) { if (T() && T().toast) T().toast(msg); }
  function ryo() { return window.Resources ? window.Resources.get('ryo') : 0; }

  /* ───────── View switch ───────── */
  function setView(v) {
    ui.view = v === 'maga' ? 'maga' : 'gear';
    try { localStorage.setItem(VIEW_KEY, ui.view); } catch (e) { /* ignore */ }
    const maga = ui.view === 'maga';
    document.body.classList.toggle('is-maga', maga);
    $('tools-app').hidden = maga;
    $('maga-app').hidden = !maga;
    $('mg-ryo').hidden = !maga;
    document.querySelectorAll('.tl-view').forEach(b => {
      const on = b.dataset.view === ui.view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    if (maga) render(); else if (T()) T().refresh();
  }

  /* ───────── Render ───────── */
  function render() {
    if (ui.view !== 'maga' || !M()) return;
    $('mg-ryo-val').textContent = fmt(ryo());
    renderTools();
    renderStage();
    renderGrid();
    renderSel();
  }

  function renderTools() {
    const s = selected();
    $('mg-who').textContent = s ? (s.baseChar.name || '') : '';
    const list = tools();
    const box = $('mg-tool-list');
    if (!list.length) {
      box.innerHTML = `<div class="mg-none">No tools equipped<button type="button" class="jjk-btn tl-mini" data-goto="gear">Equip</button></div>`;
    } else {
      const cur = currentTool();
      box.innerHTML = list.map(t => {
        const row = M().socketsOf(t.card.id);
        const on = cur && cur.slot === t.slot;
        return `<button type="button" class="mg-tool${on ? ' is-active' : ''}" role="option" aria-selected="${on}" data-slot="${t.slot}">
          <span class="mg-tool-ic"><img src="${esc(T().cardPath(t.card.icon))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/placeholder.png'"></span>
          <span class="mg-tool-meta">
            <span class="mg-tool-nm">${esc(t.card.jutsuName || t.card.name)}</span>
            <span class="mg-pips">${row.map(k => k ? `<i style="--c:${M().info(k).color}"></i>` : '<i></i>').join('')}</span>
          </span>
          <span class="mg-tool-lv"><small>${SLOT_NAME[t.slot]}</small>Lv${T().cardLevel(t.card.id)}</span>
        </button>`;
      }).join('');
    }
    const s2 = selected();
    const b = s2 ? M().bonusForEquipped(s2.inst.equippedJutsu) : { hp: 0, atk: 0, def: 0, nin: 0, res: 0 };
    const LABEL = { hp: 'HP', atk: 'ATK', def: 'DEF', nin: 'NIN', res: 'RES' };
    $('mg-total').innerHTML = M().STATS.map(k =>
      `<div class="${b[k] ? 'has' : ''}" data-stat="${k}"><dt>${LABEL[k]}</dt><dd>+${k === 'nin' || k === 'res' ? pct(b[k]) + '%' : fmt(b[k])}</dd></div>`).join('');
  }

  function renderStage() {
    const t = currentTool();
    const core = $('mg-core'), sockets = $('mg-sockets');
    $('mg-oneclick').disabled = !t;
    if (!t) {
      $('mg-tool-name').textContent = '';
      $('mg-tool-bonus').textContent = '';
      core.innerHTML = '';
      sockets.innerHTML = '';
      return;
    }
    ui.slot = t.slot;
    $('mg-tool-name').textContent = t.card.jutsuName || t.card.name;
    const b = M().bonusForCard(t.card.id);
    $('mg-tool-bonus').textContent = bonusText(b) || M().fits(t.card).map(id => M().data().types.find(x => x.id === id).statLabel).join(' / ');
    core.innerHTML = `<img src="${esc(T().cardPath(t.card.icon))}" alt="" onerror="this.onerror=null;this.src='assets/placeholder.png'">`;
    const row = M().socketsOf(t.card.id);
    if (ui.socket >= 0 && row[ui.socket]) ui.socket = -1;
    sockets.innerHTML = row.map((k, i) => {
      const a = (-90 + i * 72) * Math.PI / 180;
      const x = 50 + 39 * Math.cos(a), y = 50 + 39 * Math.sin(a);
      const i2 = k && M().info(k);
      return `<button type="button" class="mg-socket${k ? ' is-filled' : ''}${ui.socket === i ? ' is-picked' : ''}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%${i2 ? `;--c:${i2.color}` : ''}" data-socket="${i}"
        aria-label="${k ? `${i2.name} Lv${i2.level}, ${i2.text}. Tap to remove` : 'Empty socket'}">${k ? gem(k) : ''}</button>`;
    }).join('');
  }

  function gridKeys() {
    const bag = M().get().bag;
    let keys = Object.keys(bag).filter(k => bag[k] > 0 && M().parse(k));
    if (ui.tab === 'fit') {
      const t = currentTool();
      const allowed = t ? M().fits(t.card) : [];
      keys = keys.filter(k => allowed.includes(M().parse(k).type));
    }
    const order = M().data().types.map(x => x.id);
    return keys.sort((a, b) => {
      const pa = M().parse(a), pb = M().parse(b);
      return pb.level - pa.level || order.indexOf(pa.type) - order.indexOf(pb.type);
    });
  }

  function renderGrid() {
    document.querySelectorAll('.mg-tab').forEach(b => {
      const on = b.dataset.tab === ui.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    const keys = gridKeys();
    const grid = $('mg-grid');
    if (ui.sel && !M().count(ui.sel)) ui.sel = null;
    if (!keys.length) {
      grid.innerHTML = `<div class="mg-empty">${ui.tab === 'fit' && Object.keys(M().get().bag).length ? 'Nothing fits this tool' : 'Empty'}<button type="button" class="jjk-btn tl-mini" data-open-shop>Buy</button></div>`;
      return;
    }
    grid.innerHTML = keys.map(k => {
      const i = M().info(k);
      return `<button type="button" class="mg-cell${ui.sel === k ? ' is-sel' : ''}" role="option" aria-selected="${ui.sel === k}" data-key="${k}" style="--c:${i.color}"
        title="${i.name} Lv${i.level} ${i.text}">${gem(k, `<span class="mg-n">&times;${M().count(k)}</span>`)}</button>`;
    }).join('');
  }

  function renderSel() {
    const box = $('mg-sel');
    const k = ui.sel;
    const i = k && M().info(k);
    const d = M().data();
    $('mg-split').disabled = !i || i.level <= 1;
    $('mg-combine').disabled = !i || i.level >= d.maxLevel || M().count(k) < d.combineCount;
    if (!i) {
      box.innerHTML = `<span class="mg-hint">${ui.tab === 'fit' ? 'Tap to beset' : 'Tap to select'}</span>`;
      return;
    }
    box.innerHTML = `<span class="mg-sel-ic" style="--c:${i.color}">${gem(k)}</span>
      <span class="mg-sel-meta"><b>${esc(i.name)} Lv${i.level}</b><em>${i.text}</em></span>
      <span class="mg-sel-n">&times;${M().count(k)}</span>`;
  }

  /* ───────── Actions ───────── */
  function report(res) { toast(res.msg); render(); if (res.ok && T()) T().refresh(); }

  function besetKey(k) {
    const t = currentTool();
    if (!t) return toast('Equip a tool first');
    const res = M().beset(t.card.id, k, ui.socket, t.card);
    if (res.ok) ui.socket = -1;
    report(res);
  }

  function onSocket(i) {
    const t = currentTool();
    if (!t) return;
    const row = M().socketsOf(t.card.id);
    if (row[i]) { ui.socket = -1; return report(M().remove(t.card.id, i)); }
    ui.socket = ui.socket === i ? -1 : i;
    renderStage();
  }

  /* ───────── Shop ───────── */
  function renderShop() {
    const d = M().data();
    const tabs = d.types.map(t => `<button type="button" class="jjk-tab mg-stype${ui.shopType === t.id ? ' active' : ''}" aria-selected="${ui.shopType === t.id}" data-stype="${t.id}"><img src="${M().iconFor(t.id, 1)}" alt="">${esc(t.name)}</button>`).join('');
    const levels = Object.keys(d.shop.levels).map(Number).sort((a, b) => a - b);
    const have = ryo();
    const rows = levels.map(lv => {
      const k = M().key(ui.shopType, lv);
      const i = M().info(k);
      const price = M().priceOf(lv) * ui.shopQty;
      return `<div class="mg-offer" style="--c:${i.color}">
        <span class="mg-offer-ic">${gem(k)}</span>
        <span class="mg-offer-meta"><b>${esc(i.name)} Lv${lv}</b><em>${i.text}</em><small>Owned ${M().count(k)}</small></span>
        <button type="button" class="jjk-btn tl-mini mg-offer-buy${have >= price ? ' is-primary' : ''}" data-buy="${lv}" ${have >= price ? '' : 'disabled'}>
          <img src="assets/icons/currency/ryo.png" alt="">${fmt(price)}</button>
      </div>`;
    }).join('');
    $('mg-shop-body').innerHTML = `
      <div class="mg-shop-tabs">${tabs}</div>
      <div class="mg-shop-bar">
        <span class="jjk-chip mg-ryo"><img src="assets/icons/currency/ryo.png" alt=""><b>${fmt(have)}</b></span>
        <span class="mg-qty"><button type="button" class="tl-dir" data-qty="-1" aria-label="Less">&minus;</button><b id="mg-qty">${ui.shopQty}</b><button type="button" class="tl-dir" data-qty="1" aria-label="More">+</button></span>
      </div>
      <div class="mg-offers">${rows}</div>`;
  }
  function openShop() {
    renderShop();
    const m = $('mg-shop');
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('is-open'));
  }
  function closeShop() {
    const m = $('mg-shop');
    m.classList.remove('is-open');
    m.hidden = true;
    render();
  }
  function onShopClick(e) {
    if (e.target === $('mg-shop')) return closeShop();
    const st = e.target.closest('[data-stype]');
    if (st) { ui.shopType = st.dataset.stype; return renderShop(); }
    const q = e.target.closest('[data-qty]');
    if (q) { ui.shopQty = Math.max(1, Math.min(99, ui.shopQty + Number(q.dataset.qty))); return renderShop(); }
    const b = e.target.closest('[data-buy]');
    if (b && !b.disabled) {
      const res = M().buy(ui.shopType, Number(b.dataset.buy), ui.shopQty);
      toast(res.msg);
      renderShop();
    }
  }

  /* ───────── Wiring ───────── */
  function wire() {
    document.querySelectorAll('.tl-view').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    $('mg-tool-list').addEventListener('click', e => {
      if (e.target.closest('[data-goto]')) return setView('gear');
      const row = e.target.closest('.mg-tool');
      if (!row) return;
      ui.slot = row.dataset.slot; ui.socket = -1;
      render();
    });
    $('mg-sockets').addEventListener('click', e => {
      const s = e.target.closest('.mg-socket');
      if (s) onSocket(Number(s.dataset.socket));
    });
    document.querySelectorAll('.mg-tab').forEach(b => b.addEventListener('click', () => { ui.tab = b.dataset.tab; renderGrid(); renderSel(); }));
    $('mg-grid').addEventListener('click', e => {
      if (e.target.closest('[data-open-shop]')) return openShop();
      const c = e.target.closest('.mg-cell');
      if (!c) return;
      const k = c.dataset.key;
      if (ui.tab === 'fit') { ui.sel = k; return besetKey(k); }
      ui.sel = ui.sel === k ? null : k;
      renderGrid(); renderSel();
    });
    $('mg-buy').addEventListener('click', openShop);
    $('mg-split').addEventListener('click', () => { if (ui.sel) { const k = ui.sel; const p = M().parse(k); const r = M().split(k); if (r.ok) ui.sel = M().count(k) ? k : M().key(p.type, p.level - 1); report(r); } });
    $('mg-combine').addEventListener('click', () => { if (ui.sel) { const k = ui.sel; const p = M().parse(k); const r = M().combine(k); if (r.ok && !M().count(k)) ui.sel = M().key(p.type, p.level + 1); report(r); } });
    $('mg-oneclick').addEventListener('click', () => { const t = currentTool(); if (t) { ui.socket = -1; report(M().oneClick(t.card.id, t.card)); } });

    $('mg-shop').addEventListener('click', onShopClick);
    $('mg-shop-close').addEventListener('click', closeShop);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('mg-shop').hidden) closeShop(); });

    // Another tab changed the save
    window.addEventListener('storage', e => { if (e.key === M().STORAGE_KEY) { M().reload(); render(); } });
    // The roster selection lives in the Gear view; follow it.
    document.getElementById('tools-roster-list').addEventListener('click', () => { ui.slot = null; ui.socket = -1; });
  }

  function start() {
    if (!M() || !T()) return;
    wire();
    let v = 'gear';
    try { v = localStorage.getItem(VIEW_KEY) || 'gear'; } catch (e) { /* ignore */ }
    if (/[?&]view=maga/.test(location.search)) v = 'maga';
    M().load().then(() => setView(v));
  }
  document.addEventListener('tools:ready', start, { once: true });

  window.ToolsMagatama = { setView, render, openShop };
})();
