// js/tools-gear.js — Ninja tools on the Tools page (logic in js/gear.js).
//   Tools view     the 8 equipped tools around the character art (4 a side);
//                  tap one for its card (stars, slot stats, magatama).
//   Magatama       js/tools-magatama.js, beset into the selected tool.
// Tools are equipped and swapped on the Shinobi Record's Equipment tab.
// Also owns the view switch (tabs at the top right).
(function () {
  'use strict';

  const G = () => window.Gear;
  const T = () => window.CharacterTools;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
  const VIEW_KEY = 'tools_ui_view_v1';
  const VIEWS = ['gear', 'maga'];
  const APP = { gear: 'tools-app', maga: 'maga-app' };

  const ui = { view: 'gear', slot: 0, modal: null };

  /* ───────── Helpers ───────── */
  const uid = () => { const s = T() && T().getSelectedCharacter(); return s ? s.inst.uid : null; };
  const ryo = () => (window.Resources ? window.Resources.get('ryo') : 0);

  // Round icon tile of a tool in its star colour (css/gear.css .gx-tile)
  function tile(i, extra = '') {
    if (!i || i.empty) return `<span class="gx-tile is-empty"><b class="gx-plus">+</b>${extra}</span>`;
    return `<span class="gx-tile" style="--tc:${i.color}"><img src="${esc(i.icon)}" alt="" draggable="false">${extra}</span>`;
  }

  /* ───────── View switch ───────── */
  function setView(v) {
    ui.view = VIEWS.includes(v) ? v : 'gear';
    try { localStorage.setItem(VIEW_KEY, ui.view); } catch (e) { /* ignore */ }
    VIEWS.forEach(k => { const el = $(APP[k]); if (el) el.hidden = k !== ui.view; });
    document.body.classList.toggle('is-maga', ui.view === 'maga');
    document.body.dataset.toolsView = ui.view;
    $('mg-ryo').hidden = ui.view === 'gear';
    document.querySelectorAll('.tl-view').forEach(b => {
      const on = b.dataset.view === ui.view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    if (ui.view === 'gear' && T()) T().refresh(); else render();
  }

  function render() {
    if (!G()) return;
    $('mg-ryo-val').textContent = fmt(ryo());
    if (ui.view === 'gear') renderOverview();
    else if (window.ToolsMagatama) window.ToolsMagatama.render();
    if (ui.modal != null) renderModal();
  }

  /* ───────── Tools view: 4 tools a side of the art ───────── */
  function pieceBtn(i) {
    const on = ui.modal === i.slot;
    return `<button type="button" class="gp${on ? ' is-active' : ''}" data-slot="${i.slot}"
      aria-label="${i.empty ? `Tool slot ${i.slot + 1}: empty` : `${esc(i.name)}, ${i.stars} stars`}">
      ${tile(i)}
      <span class="gp-nm">${i.empty ? 'Empty' : esc(i.name)}</span>
    </button>`;
  }
  function renderOverview() {
    const id = uid();
    const L = $('gear-left'), Rt = $('gear-right');
    if (!id) { L.innerHTML = ''; Rt.innerHTML = ''; return; }
    const all = G().SLOTS.map(s => G().info(id, s));
    L.innerHTML = all.slice(0, 4).map(pieceBtn).join('');
    Rt.innerHTML = all.slice(4).map(pieceBtn).join('');
  }

  /* ───────── Tool card (modal) ───────── */
  function openModal(slot) {
    ui.modal = slot; ui.slot = slot;
    renderModal();
    const m = $('gp-modal');
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('is-open'));
    renderOverview();
  }
  function closeModal() {
    const m = $('gp-modal');
    m.classList.remove('is-open');
    m.hidden = true;
    const slot = ui.modal;
    ui.modal = null;
    renderOverview();
    const b = document.querySelector(`#gear-left .gp[data-slot="${slot}"], #gear-right .gp[data-slot="${slot}"]`);
    if (b) b.focus();
  }
  function renderModal() {
    const id = uid();
    if (!id || ui.modal == null) return;
    const i = G().info(id, ui.modal);
    $('gp-title').textContent = i.empty ? `Tool Slot ${ui.modal + 1}` : i.name;
    if (i.empty) {
      $('gp-body').innerHTML = `<p class="gx-note">Equip a ninja tool on the Shinobi Record's Equipment tab.</p>`;
      return;
    }
    const M = window.Magatama;
    const socks = M ? M.socketsOf(i.id) : [];
    $('gp-body').innerHTML = `<div class="gp-hero">
        ${tile(i)}
        <div class="gp-hero-meta">
          <b>${esc(i.name)}</b>
          <span class="gp-tier" style="--tc:${i.color}">${'&#9733;'.repeat(i.stars)}</span>
          <span class="gp-lvl">${i.slots} slot stat${i.slots > 1 ? 's' : ''} &middot; ${socks.length} magatama socket${socks.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      ${i.stats.map(s => `<div class="gx-row gx-sub"><span>${esc(s.label)}</span><b>${esc(s.text)}</b></div>`).join('')}
      <div class="gx-row"><span>Magatama</span><b>${socks.map(k => k ? esc(M.info(k).text) : '&mdash;').join(' &middot; ') || 'None'}</b></div>
      <div class="gp-acts"><button type="button" class="jjk-btn tl-act" data-goto="maga">Magatama</button></div>`;
  }
  function onModalClick(e) {
    if (e.target === $('gp-modal')) return closeModal();
    const go = e.target.closest('[data-goto]');
    if (go) { closeModal(); setView(go.dataset.goto); }
  }
  function onPiece(e) {
    const b = e.target.closest('.gp[data-slot]');
    if (b) openModal(Number(b.dataset.slot));
  }

  /* ───────── Wiring ───────── */
  function wire() {
    document.querySelectorAll('.tl-view').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('gear-left').addEventListener('click', onPiece);
    $('gear-right').addEventListener('click', onPiece);
    $('gp-modal').addEventListener('click', onModalClick);
    $('gp-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.modal != null) closeModal(); });
    window.addEventListener('storage', e => {
      if (e.key === G().STORAGE_KEY) { G().reload(); render(); }
    });
    window.addEventListener('gear:change', () => render());
  }

  function start() {
    if (!G() || !T()) return;
    wire();
    let v = 'gear';
    try { v = localStorage.getItem(VIEW_KEY) || 'gear'; } catch (e) { /* ignore */ }
    const q = /[?&]view=(\w+)/.exec(location.search);
    if (q && VIEWS.includes(q[1])) v = q[1];
    setView(v);
    // Magatama numbers refresh from data/magatama.json; redraw once they are in
    const ready = window.Magatama && window.Magatama.load ? window.Magatama.load() : null;
    if (ready) ready.then(() => render());
  }
  document.addEventListener('tools:ready', start, { once: true });

  window.ToolsGear = {
    setView, render, openModal,
    slot: () => ui.slot,
    setSlot: (s) => { if (G() && G().SLOTS.includes(s)) ui.slot = s; },
    tile, view: () => ui.view
  };
})();
