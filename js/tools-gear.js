// js/tools-gear.js — Gear on the Tools page (logic in js/gear.js).
//   Gear view      the 5 pieces around the character art; tap one for its
//                  quick panel (Strengthen / Auto, or promote at the cap).
//   Strengthen     all five rows: level, stat, Ryo cost, Auto, Strengthen.
//   Upgrade        piece list · current → next tier · scroll + Ryo · Upgrade.
//   Magatama       js/tools-magatama.js, beset into the selected piece.
// Also owns the view switch (tabs at the top right).
(function () {
  'use strict';

  const G = () => window.Gear;
  const T = () => window.CharacterTools;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
  const VIEW_KEY = 'tools_ui_view_v1';
  const VIEWS = ['gear', 'str', 'up', 'maga'];
  const APP = { gear: 'tools-app', str: 'str-app', up: 'up-app', maga: 'maga-app' };
  const RYO = 'assets/icons/currency/ryo.png';
  const ARROW = '<svg class="gx-arrow" viewBox="0 0 64 32" aria-hidden="true"><defs><linearGradient id="gxA" x1="0" x2="1"><stop offset="0" stop-color="#2d6b73"/><stop offset=".6" stop-color="#6fc3c9"/><stop offset="1" stop-color="#f1d98a"/></linearGradient></defs><path d="M4 20c8-14 22-14 30-6s18 8 22-2" fill="none" stroke="url(#gxA)" stroke-width="4" stroke-linecap="round"/><path d="M50 4l10 8-12 4z" fill="#f1d98a"/></svg>';

  const ui = { view: 'gear', slot: 'helmet', modal: null };

  /* ───────── Helpers ───────── */
  const uid = () => { const s = T() && T().getSelectedCharacter(); return s ? s.inst.uid : null; };
  const who = () => { const s = T() && T().getSelectedCharacter(); return s ? (s.baseChar.name || '') : ''; };
  const ryo = () => (window.Resources ? window.Resources.get('ryo') : 0);
  const toast = (m) => { if (T() && T().toast) T().toast(m); };
  const statTxt = (i, v) => `+${G().fmtStat(i.slot, v)}`;

  // Icon tile with the rarity frame (baked into the art); Red Shiny adds the
  // animated gold frame (css/gear.css .gx-tile.is-shiny).
  function tile(slot, tier, extra = '') {
    const t = G().TIERS[tier];
    return `<span class="gx-tile${t.shiny ? ' is-shiny' : ''}" style="--tc:${t.color}"><img src="${G().iconOf(slot, tier)}" alt="" draggable="false">${extra}</span>`;
  }
  function scrollIc(id) {
    const n = String(id).replace(/\D/g, '');
    return `<img src="${G().scrollIcon(id)}" alt="" draggable="false" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><b class="gx-fb" hidden>${n}&#9733;</b>`;
  }
  const scrollName = (id) => (window.Resources ? window.Resources.getMaterialInfo(id).name : id);
  function matCell(icon, have, need, name, isRyo) {
    const ok = have >= need;
    return `<div class="gx-mat${isRyo ? ' is-ryo' : ''}">
      <span class="gx-mat-ic">${icon}<em class="${ok ? 'is-ok' : 'is-short'}">${isRyo ? fmt(need) : `${fmt(have)}/${need}`}</em></span>
      <span class="gx-mat-nm">${esc(name)}</span>
    </div>`;
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
    else if (ui.view === 'str') renderStr();
    else if (ui.view === 'up') renderUp();
    else if (window.ToolsMagatama) window.ToolsMagatama.render();
    if (ui.modal) renderModal();
  }

  // After a change: stats, roster, the open view
  function changed(res) {
    toast(res.msg);
    if (res.ok && T()) T().refresh(); else render();
    if (res.ok && ui.view !== 'gear') render();
  }

  /* ───────── Gear view: pieces around the art ───────── */
  function pieceBtn(i) {
    const on = ui.modal === i.slot;
    return `<button type="button" class="gp${on ? ' is-active' : ''}" data-slot="${i.slot}" style="--tc:${i.tierInfo.color}"
      aria-label="${esc(i.name)}, ${i.tierInfo.label}, level ${i.level}">
      ${tile(i.slot, i.tier, `<span class="gp-lv">Lv${i.level}</span>${i.atCap && !i.isMax ? '<i class="gp-up" title="Ready to upgrade"></i>' : ''}`)}
      <span class="gp-nm">${esc(i.name)}</span>
    </button>`;
  }
  function renderOverview() {
    const id = uid();
    const L = $('gear-left'), Rt = $('gear-right');
    if (!id) { L.innerHTML = ''; Rt.innerHTML = ''; return; }
    const S = G().SLOTS;
    L.innerHTML = S.slice(0, 3).map(s => pieceBtn(G().info(id, s))).join('');
    Rt.innerHTML = S.slice(3).map(s => pieceBtn(G().info(id, s))).join('') +
      `<button type="button" class="gp gp--all" data-goto="str" aria-label="Strengthen all gear">
        <span class="gx-tile gp-all-ic"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4l3 7h-2v9h-2v-9h-2z"/><path d="M8 22h16v3H8zM10 26h12v2H10z"/></svg></span>
        <span class="gp-nm">Strengthen</span>
      </button>`;
  }

  /* ───────── Piece panel (modal) ───────── */
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
    if (!id || !ui.modal) return;
    const i = G().info(id, ui.modal);
    $('gp-title').textContent = i.kind;
    let body = `<div class="gp-hero">
        ${tile(i.slot, i.tier)}
        <div class="gp-hero-meta">
          <b>${esc(i.name)}</b>
          <span class="gp-tier" style="--tc:${i.tierInfo.color}">${esc(i.tierInfo.label)}</span>
          <span class="gp-lvl">Lv <b>${i.level}</b> / ${i.cap}</span>
        </div>
      </div>`;
    if (!i.atCap) {
      const pl = G().plan(id, i.slot);
      const can = ryo() >= i.cost;
      body += `<div class="gx-row"><span>${esc(i.statLabel)}</span><b>${statTxt(i, i.value)}</b><i>&#10148;</i><b class="is-up">${statTxt(i, i.next)}</b></div>
        <div class="gx-row"><span>Cost</span><b class="gx-ryo${can ? '' : ' is-short'}"><img src="${RYO}" alt="">${fmt(i.cost)}</b></div>
        <div class="gp-acts">
          <button type="button" class="jjk-btn gp-act" data-act="auto" ${pl.levels ? '' : 'disabled'}>Auto${pl.levels > 1 ? ` +${pl.levels}` : ''}</button>
          <button type="button" class="jjk-btn is-primary gp-act" data-act="str" ${can ? '' : 'disabled'}>Strengthen</button>
        </div>`;
    } else if (!i.isMax) {
      const p = i.promote;
      const ready = p.have >= p.count && ryo() >= p.ryo;
      body += `<div class="gp-promo">
          <span class="gp-next">${ARROW}${tile(i.slot, p.toTier)}<small>${esc(p.toName)}</small></span>
          ${matCell(scrollIc(p.scroll), p.have, p.count, scrollName(p.scroll))}
          ${matCell(`<img src="${RYO}" alt="">`, ryo(), p.ryo, 'Ryo', true)}
        </div>
        <div class="gx-row"><span>${esc(i.statLabel)}</span><b>${statTxt(i, i.value)}</b><i>&#10148;</i><b class="is-up">${statTxt(i, G().statValue(i.slot, p.toTier, i.level))}</b></div>
        <div class="gp-acts">
          <button type="button" class="jjk-btn is-primary gp-act" data-act="promote" ${ready ? '' : 'disabled'}>Upgrade</button>
        </div>`;
    } else {
      body += `<div class="gx-row"><span>${esc(i.statLabel)}</span><b>${statTxt(i, i.value)}</b></div><p class="gx-note">Max</p>`;
    }
    const M = window.Magatama;
    if (M) {
      const row = M.socketsOf(id, i.slot);
      body += `<div class="gp-maga">
          <span class="mg-pips">${row.map(k => k ? `<i style="--c:${M.info(k).color}"></i>` : '<i></i>').join('')}</span>
          <button type="button" class="jjk-btn tl-mini" data-act="maga">Magatama</button>
        </div>`;
    }
    $('gp-body').innerHTML = body;
  }
  function onModalClick(e) {
    if (e.target === $('gp-modal')) return closeModal();
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    const id = uid(), slot = ui.modal;
    const act = a.dataset.act;
    if (act === 'str') changed(G().strengthen(id, slot, 1));
    else if (act === 'auto') changed(G().auto(id, slot));
    else if (act === 'promote') changed(G().promote(id, slot));
    else if (act === 'maga') { closeModal(); ui.slot = slot; setView('maga'); }
  }

  /* ───────── Strengthen view ───────── */
  function renderStr() {
    const id = uid();
    $('gs-who').textContent = who();
    const rows = $('gs-rows');
    if (!id) { rows.innerHTML = '<p class="gx-note">Select a shinobi in Gear</p>'; return; }
    rows.innerHTML = G().SLOTS.map(slot => {
      const i = G().info(id, slot);
      const can = !i.atCap && ryo() >= i.cost;
      const pl = i.atCap ? { levels: 0 } : G().plan(id, slot);
      let tail;
      if (!i.atCap) {
        tail = `<span class="gs-cost${can ? '' : ' is-short'}"><img src="${RYO}" alt="">${fmt(i.cost)}</span>
          <span class="gs-acts">
            <button type="button" class="jjk-btn gs-btn" data-act="auto" ${pl.levels ? '' : 'disabled'}>Auto</button>
            <button type="button" class="jjk-btn is-primary gs-btn" data-act="str" ${can ? '' : 'disabled'}>Strengthen</button>
          </span>`;
      } else {
        tail = `<span class="gs-cost gs-cap">${i.isMax ? 'Max' : 'Cap'}</span>
          <span class="gs-acts">${i.isMax ? '' : '<button type="button" class="jjk-btn is-primary gs-btn" data-act="up">Upgrade</button>'}</span>`;
      }
      return `<div class="gs-row" data-slot="${slot}" style="--tc:${i.tierInfo.color}">
        <span class="gs-ic">${tile(slot, i.tier)}</span>
        <span class="gs-nm"><b>${esc(i.name)}</b><small>${esc(i.tierInfo.label)}</small></span>
        <span class="gs-lv">Lv ${i.level}${i.atCap ? `<small>/${i.cap}</small>` : `<i>&#10148;</i><em>${i.level + 1}</em>`}</span>
        <span class="gs-st"><small>${esc(i.statLabel)}</small>${statTxt(i, i.value)}${i.atCap ? '' : `<i>&#10148;</i><em>${statTxt(i, i.next)}</em>`}</span>
        ${tail}
      </div>`;
    }).join('');
    const b = G().bonusFor(id);
    $('gs-total').innerHTML = `<b>+${fmt(b.hp)}</b> HP <b>+${fmt(b.atk)}</b> ATK <b>+${fmt(b.def)}</b> DEF <b>+${Math.round(b.nin * 100) / 100}%</b> NIN <b>+${Math.round(b.res * 100) / 100}%</b> RES`;
    $('gs-auto-all').disabled = !G().SLOTS.some(s => { const i = G().info(id, s); return !i.atCap && ryo() >= i.cost; });
  }
  function onStrClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    const slot = a.closest('.gs-row').dataset.slot;
    const id = uid();
    if (a.dataset.act === 'str') changed(G().strengthen(id, slot, 1));
    else if (a.dataset.act === 'auto') changed(G().auto(id, slot));
    else if (a.dataset.act === 'up') { ui.slot = slot; setView('up'); }
  }

  /* ───────── Upgrade view ───────── */
  function renderUp() {
    const id = uid();
    $('gu-who').textContent = who();
    const list = $('gu-list');
    if (!id) { list.innerHTML = ''; $('gu-preview').innerHTML = '<p class="gx-note">Select a shinobi in Gear</p>'; $('gu-stat').innerHTML = ''; $('gu-mats').innerHTML = ''; $('gu-upgrade').disabled = true; $('gu-note').textContent = ''; return; }
    list.innerHTML = G().SLOTS.map(slot => {
      const i = G().info(id, slot);
      const on = slot === ui.slot;
      return `<button type="button" class="gu-item${on ? ' is-active' : ''}" role="option" aria-selected="${on}" data-slot="${slot}">
        ${tile(slot, i.tier, `<span class="gp-lv">Lv${i.level}</span>${i.atCap && !i.isMax ? '<i class="gp-up"></i>' : ''}`)}
        <span class="gu-item-nm">${esc(i.name)}</span>
      </button>`;
    }).join('');
    const i = G().info(id, ui.slot);
    const nextTier = i.tier >= G().TIERS.length - 1 ? null : i.tier + 1;
    $('gu-preview').innerHTML = nextTier == null
      ? `<figure class="gu-fig">${tile(i.slot, i.tier)}<figcaption>${esc(i.name)}</figcaption></figure>`
      : `<figure class="gu-fig">${tile(i.slot, i.tier)}<figcaption>${esc(i.name)} <small>Lv${i.level}</small></figcaption></figure>
         ${ARROW}
         <figure class="gu-fig">${tile(i.slot, nextTier)}<figcaption>${esc(G().nameOf(i.slot, nextTier))}</figcaption></figure>`;
    $('gu-stat').innerHTML = `<span class="gu-k">${esc(i.statLabel)}</span><span class="gu-v"></span><b>${statTxt(i, i.value)}</b>${nextTier == null ? '' : `<i>&#10148;</i><b class="is-up">${statTxt(i, G().statValue(i.slot, nextTier, i.level))}</b>`}`;
    const btn = $('gu-upgrade'), note = $('gu-note');
    if (nextTier == null) {
      $('gu-mats').innerHTML = '';
      btn.disabled = true; note.textContent = 'Max tier';
      return;
    }
    const need = G().PROMOTE[i.tier];
    const have = window.Resources ? window.Resources.get(need.scroll) : 0;
    const short = (ok) => (ok ? 'is-ok' : 'is-short');
    $('gu-mats').innerHTML =
      `<div class="gu-row"><span class="gu-k">Scroll</span><span class="gu-ic">${scrollIc(need.scroll)}</span>` +
        `<span class="gu-v">${esc(scrollName(need.scroll))}</span>` +
        `<b class="gu-n"><em class="${short(have >= need.count)}">${fmt(have)}</em> / ${need.count}</b></div>` +
      `<div class="gu-row"><span class="gu-k">Ryo</span><span class="gu-ic is-coin"><img src="${RYO}" alt="" draggable="false"></span>` +
        `<span class="gu-v"></span><b class="gu-n"><em class="${short(ryo() >= need.ryo)}">${fmt(need.ryo)}</em></b></div>`;
    const enough = have >= need.count && ryo() >= need.ryo;
    btn.disabled = !(i.atCap && enough);
    note.textContent = i.atCap ? '' : `Reach Lv ${i.cap}`;
  }
  function onUpList(e) {
    const b = e.target.closest('.gu-item');
    if (!b) return;
    ui.slot = b.dataset.slot;
    renderUp();
  }

  /* ───────── Wiring ───────── */
  function wire() {
    document.querySelectorAll('.tl-view').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    const onPiece = e => {
      const g = e.target.closest('[data-goto]');
      if (g) return setView(g.dataset.goto);
      const b = e.target.closest('.gp[data-slot]');
      if (b) openModal(b.dataset.slot);
    };
    $('gear-left').addEventListener('click', onPiece);
    $('gear-right').addEventListener('click', onPiece);
    $('gp-modal').addEventListener('click', onModalClick);
    $('gp-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.modal) closeModal(); });
    $('gs-rows').addEventListener('click', onStrClick);
    $('gs-auto-all').addEventListener('click', () => changed(G().autoAll(uid())));
    $('gu-list').addEventListener('click', onUpList);
    $('gu-upgrade').addEventListener('click', () => changed(G().promote(uid(), ui.slot)));
    window.addEventListener('storage', e => {
      if (e.key === 'blazing_resources_v1') render();
    });
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
