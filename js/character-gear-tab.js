// js/character-gear-tab.js — Equipment tab of the Shinobi Record (characters.html).
//
// "Ninja Tool Equip": the shinobi's 8 tool slots (js/gear.js) in two rows of
// 4, each a round frame with the tool's icon in its star colour, or a "+".
// Beside them:
//   Tool Bonus   what the tools' slot stats and their magatama add
//   the slot     tap a slot: the tool in it (Change / Unequip / Details), or
//                the bag of tools this shinobi can wear; pick one to Equip
//                or Sell it
// Long-press a tool (in a slot or in the bag; right-click on desktop) for its
// card: name, stars, slot stats (count by stars), who can equip it, and its
// magatama sockets: tap "+" to beset one from the bag, a gem to take it off.
(function (global) {
  'use strict';

  // Tool Bonus rows: [stat, label]; flat and % of the same stat sit together
  const TOTALS = [
    ['hp', 'HP'], ['hpPct', 'HP%'], ['atk', 'ATK'], ['atkPct', 'ATK%'], ['def', 'DEF'], ['defPct', 'DEF%'],
    ['spd', 'SPD'], ['critRate', 'Crit Rate'], ['critDmg', 'Crit DMG'], ['nin', 'Jutsu DMG'], ['res', 'Jutsu RES']
  ];
  const HOLD_MS = 450;

  const ui = { uid: null, slot: 0, pick: null, pop: null, socket: -1 };
  const G = () => global.Gear;
  const M = () => global.Magatama;
  const doc = global.document;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const val = (stat, v) => G().fmtValue(stat, v);
  const stars = (n) => `<span class="ntl-stars" aria-label="${n} stars">${'&#9733;'.repeat(n)}</span>`;
  const charList = () => global.CharacterData || global.CHARACTERS || [];
  function ownerName(uid) {
    const inst = global.InventoryChar && global.InventoryChar.getByUid ? global.InventoryChar.getByUid(uid) : null;
    const list = charList();
    const c = inst && Array.isArray(list) ? list.find(x => x.id === inst.charId) : null;
    return (c && c.name) || 'another shinobi';
  }
  // "itachi" → "Itachi Uchiha" (first character with that id prefix)
  function prefixName(p) {
    const list = charList();
    const c = Array.isArray(list) ? list.find(x => String(x.id).startsWith(p + '_')) : null;
    return (c && c.name) || p.charAt(0).toUpperCase() + p.slice(1);
  }
  function toast(msg) {
    const box = doc.querySelector('#char-gear .eqp-toast');
    if (!box || !msg) return;
    box.textContent = msg;
    box.classList.remove('is-on'); void box.offsetWidth; box.classList.add('is-on');
  }

  /* ───────── Pieces ───────── */
  function frameHTML(i, extra = '') {
    return `<span class="ntl-frame" style="--sc:${i.color}"><img src="${esc(i.icon)}" alt="" draggable="false">${extra}</span>`;
  }
  function slotHTML(i) {
    const on = i.slot === ui.slot;
    if (i.empty) {
      return `<button type="button" class="ntl-slot is-empty${on ? ' is-on' : ''}" data-slot="${i.slot}" aria-pressed="${on}" aria-label="Tool slot ${i.slot + 1}: empty">
          <span class="ntl-frame"><span class="ntl-plus" aria-hidden="true">+</span></span>
        </button>`;
    }
    const n = M() ? M().socketsOf(i.id).filter(Boolean).length : 0;
    return `<button type="button" class="ntl-slot${on ? ' is-on' : ''}" data-slot="${i.slot}" data-id="${esc(i.id)}" aria-pressed="${on}"
        aria-label="Tool slot ${i.slot + 1}: ${esc(i.name)}, ${i.stars} stars. Hold for details">
        ${frameHTML(i, n ? `<span class="ntl-maga-n" aria-hidden="true">${n}</span>` : '')}
      </button>`;
  }

  // Short summary of one tool (side panel)
  function summaryHTML(i) {
    return `
      <div class="eqp-detail-head ntl-head" style="--tc:${i.color}">
        ${frameHTML(i)}
        <span class="eqp-detail-nm"><b>${esc(i.name)}</b><small>${i.slots} slot${i.slots > 1 ? 's' : ''}</small></span>
      </div>
      ${i.stats.map(s => `<div class="eqp-row"><span>${esc(s.label)}</span><b>${esc(s.text)}</b></div>`).join('')}`;
  }

  function sideHTML() {
    const i = G().info(ui.uid, ui.slot);
    if (!i.empty && !ui.pick) {
      return `${summaryHTML(i)}
        <div class="eqp-acts">
          <button type="button" class="eqp-go" data-act="pop" data-id="${esc(i.id)}">Details</button>
          <button type="button" class="eqp-go is-quiet" data-act="bag">Change</button>
          <button type="button" class="eqp-go is-quiet" data-act="off">Unequip</button>
        </div>`;
    }
    return bagHTML(i);
  }

  // Tools this shinobi can wear, best first; copies of one tool share a card
  // (×N), and the picked copy's pane steps through them
  function bagGroups() {
    const groups = [], at = {};
    G().bagList().forEach(it => {
      if (!G().canEquip(ui.uid, it.toolId)) return;
      if (at[it.toolId] == null) { at[it.toolId] = groups.length; groups.push({ toolId: it.toolId, ids: [] }); }
      groups[at[it.toolId]].ids.push(it.id);
    });
    // the copy a card shows: the picked one, else one this shinobi wears, else a free one
    groups.forEach(g => {
      g.show = g.ids.includes(ui.pick) ? ui.pick
        : g.ids.find(id => G().owner(id) === ui.uid) || g.ids.find(id => !G().owner(id)) || g.ids[0];
    });
    return groups;
  }
  function bagHTML(cur) {
    const groups = bagGroups();
    const total = groups.reduce((n, g) => n + g.ids.length, 0);
    const cards = groups.map(g => {
      const v = G().itemInfo(g.show);
      const own = v.owner;
      return `<button type="button" class="ntl-card${g.ids.includes(ui.pick) ? ' is-on' : ''}" data-id="${esc(g.show)}"
          aria-label="${esc(v.name)}, ${v.stars} stars${g.ids.length > 1 ? `, ${g.ids.length} copies` : ''}${own ? ', in use' : ''}. Hold for details">
          ${frameHTML(v).replace('<img ', '<img loading="lazy" ')}
          ${g.ids.length > 1 ? `<span class="ntl-card-n">&times;${g.ids.length}</span>` : ''}
          ${own ? `<span class="eqp-card-own${own === ui.uid ? ' is-mine' : ''}" aria-hidden="true">${own === ui.uid ? '&#10003;' : '&bull;'}</span>` : ''}
        </button>`;
    }).join('');
    let pickPane = '';
    const p = ui.pick && G().itemInfo(ui.pick);
    if (p) {
      const own = p.owner;
      const here = own === ui.uid;
      const g = groups.find(x => x.ids.includes(p.id));
      const k = g ? g.ids.indexOf(p.id) : 0, n = g ? g.ids.length : 1;
      pickPane = `<div class="eqp-pick">${summaryHTML(p)}
        ${n > 1 ? `<div class="ntl-copies"><button type="button" class="eqp-back" data-act="copy" data-step="-1" aria-label="Previous copy">&lsaquo;</button><span>Copy ${k + 1} / ${n}</span><button type="button" class="eqp-back" data-act="copy" data-step="1" aria-label="Next copy">&rsaquo;</button></div>` : ''}
        ${own && !here ? `<p class="eqp-note">Worn by ${esc(ownerName(own))}; equipping takes it.</p>` : ''}
        <div class="eqp-acts">
          <button type="button" class="eqp-go is-quiet" data-act="pop" data-id="${esc(p.id)}">Details</button>
          ${here ? '<span class="eqp-state">Equipped</span>' : '<button type="button" class="eqp-go" data-act="equip">Equip</button>'}
          ${own ? '' : '<button type="button" class="eqp-go is-quiet" data-act="sell">Sell</button>'}
        </div></div>`;
    }
    return `<div class="eqp-bag-head">${cur.empty ? '' : '<button type="button" class="eqp-back" data-act="back" aria-label="Back">&larr;</button>'}<span>Tool Bag &middot; ${total}</span></div>
      ${groups.length ? `<div class="eqp-cards ntl-cards" role="listbox" aria-label="Ninja tools">${cards}</div>` : '<p class="eqp-empty">No tools this shinobi can equip yet: clear missions to find ninja tools.</p>'}
      ${pickPane}`;
  }

  /* ───────── Tool card (long press) ───────── */
  function popHTML(id) {
    const i = G().itemInfo(id);
    if (!i) return '';
    const rows = i.stats.map(s => `<div class="ntl-stat"><b>${esc(s.text)}</b><span>${esc(s.label)}</span></div>`);
    const left = rows.filter((_, n) => n % 2 === 0), right = rows.filter((_, n) => n % 2 === 1);
    const who = i.equip && i.equip.length
      ? i.equip.map(p => `<span class="ntl-who">${esc(prefixName(p))}</span>`).join('')
      : '<span class="ntl-who is-any">Any shinobi</span>';
    const socks = M() ? M().socketsOf(id) : [];
    const sockHTML = socks.map((k, n) => {
      const m = k && M().info(k);
      return m
        ? `<button type="button" class="ntl-sock is-filled" data-sock="${n}" style="--c:${m.color}" aria-label="${esc(m.name)} Lv${m.level}, ${esc(m.text)}. Tap to remove"><img src="${esc(m.icon)}" alt="" draggable="false"><i>${m.level}</i></button>`
        : `<button type="button" class="ntl-sock${ui.socket === n ? ' is-picked' : ''}" data-sock="${n}" aria-label="Empty magatama socket. Tap to beset">+</button>`;
    }).join('');
    const mb = M() ? M().bonusForPiece(id) : {};
    const mText = ['hp', 'atk', 'def'].filter(k => mb[k]).map(k => `+${Math.round(mb[k]).toLocaleString()} ${k.toUpperCase()}`)
      .concat(['nin', 'res'].filter(k => mb[k]).map(k => `+${Math.round(mb[k] * 10) / 10}% ${k === 'nin' ? 'Jutsu DMG' : 'Jutsu RES'}`));
    let picker = '';
    if (ui.socket >= 0 && M()) {
      const bag = M().get().bag;
      const keys = Object.keys(bag).filter(k => bag[k] > 0 && M().parse(k))
        .sort((a, b) => M().parse(b).level - M().parse(a).level);
      picker = `<div class="ntl-mpick">
          ${keys.length ? keys.map(k => { const m = M().info(k); return `<button type="button" class="ntl-gem" data-key="${esc(k)}" style="--c:${m.color}" title="${esc(m.name)} Lv${m.level} ${esc(m.text)}"><img src="${esc(m.icon)}" alt="" draggable="false"><i>${m.level}</i><em>&times;${bag[k]}</em></button>`; }).join('')
            : '<p class="eqp-empty">No magatama: buy some on the Tools page.</p>'}
        </div>`;
    }
    return `<div class="ntl-pop-card" role="dialog" aria-modal="true" aria-label="${esc(i.name)}" style="--sc:${i.color}">
        <button type="button" class="ntl-x" data-act="close" aria-label="Close">&times;</button>
        <div class="ntl-pop-title"><b>${esc(i.name)}</b>${stars(i.stars)}</div>
        <div class="ntl-pop-body ntl-slots-${i.slots}">
          <div class="ntl-col">${left.join('')}</div>
          <div class="ntl-core">${frameHTML(i)}</div>
          <div class="ntl-col">${right.join('')}</div>
        </div>
        <div class="ntl-pop-row"><span class="ntl-lbl">Equippable By</span><div class="ntl-whos">${who}</div></div>
        <div class="ntl-pop-row"><span class="ntl-lbl">Magatama</span>
          <div class="ntl-socks">${sockHTML || '<span class="eqp-empty">No sockets</span>'}</div>
          <span class="ntl-mbonus">${esc(mText.join(' · '))}</span>
          ${socks.length ? `<button type="button" class="eqp-go is-quiet ntl-one" data-act="oneclick">Auto</button>` : ''}
        </div>
        ${picker}
      </div>`;
  }
  function openPop(id) {
    if (!G().item(id)) return;
    ui.pop = id; ui.socket = -1;
    renderPop();
  }
  function closePop() { ui.pop = null; ui.socket = -1; renderPop(); }
  // The card hangs off <body>: the Ink record's panels make their own
  // containing block, which would trap a fixed overlay inside the column
  function renderPop() {
    let el = doc.querySelector('body > .ntl-pop');
    if (!ui.pop || !G().item(ui.pop)) {
      ui.pop = null;
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = doc.createElement('div');
      el.className = 'ntl-pop';
      el.addEventListener('click', onPopClick);
      doc.body.appendChild(el);
    }
    el.innerHTML = popHTML(ui.pop);
  }

  /* ───────── Render ───────── */
  function render(uid) {
    const box = doc.getElementById('char-gear');
    if (!box) return;
    if (uid !== undefined && uid !== ui.uid) { ui.uid = uid; ui.slot = 0; ui.pick = null; ui.pop = null; }
    if (!G() || !ui.uid) { box.innerHTML = ''; return; }
    if (ui.pick && !G().item(ui.pick)) ui.pick = null;
    const tot = G().bonusFor(ui.uid);
    const m = M() && M().bonusForUnit ? M().bonusForUnit(ui.uid) : {};
    ['hp', 'atk', 'def', 'nin', 'res'].forEach(k => { tot[k] = (tot[k] || 0) + (m[k] || 0); });
    const rows = TOTALS.filter(([k]) => tot[k]);
    const slots = G().SLOTS.map(s => G().info(ui.uid, s));
    box.innerHTML = `
      <div class="eqp ntl">
        <div class="ntl-equip">
          <h4 class="cx-kicker ntl-title">Ninja Tool Equip</h4>
          <div class="ntl-grid" role="group" aria-label="Ninja tools">${slots.map(slotHTML).join('')}</div>
          <p class="ntl-hint">Tap a slot to equip &middot; hold a tool for details</p>
        </div>
        <div class="eqp-side">
          <h4 class="cx-kicker">Tool Bonus</h4>
          <div class="eqp-totals">
            ${rows.length ? rows.map(([k, label]) => `<div class="eqp-row"><span>${label}</span><b>+${val(k, tot[k])}</b></div>`).join('') : '<p class="eqp-empty">No tools equipped</p>'}
          </div>
          <h4 class="cx-kicker">Slot ${ui.slot + 1}</h4>
          <div class="eqp-detail">${sideHTML()}</div>
          <div class="eqp-toast" role="status" aria-live="polite"></div>
        </div>
      </div>`;
    renderPop();
  }

  function act(res) {
    if (res && res.msg) setTimeout(() => toast(res.msg), 0);
    render();
  }

  /* ───────── Input ───────── */
  // Long press: a held pointer on a tool opens its card; the click that
  // follows the release is swallowed.
  const hold = { t: 0, fired: false, x: 0, y: 0 };
  function holdTarget(e) {
    const el = e.target.closest('.ntl-slot[data-id], .ntl-card[data-id]');
    return el && !e.target.closest('.ntl-pop') ? el : null;
  }
  function onDown(e) {
    const el = holdTarget(e);
    hold.fired = false;
    clearTimeout(hold.t);
    if (!el || (e.button != null && e.button !== 0)) return;
    hold.x = e.clientX; hold.y = e.clientY;
    hold.t = setTimeout(() => { hold.fired = true; openPop(el.dataset.id); }, HOLD_MS);
  }
  function onMove(e) {
    if (Math.abs(e.clientX - hold.x) > 10 || Math.abs(e.clientY - hold.y) > 10) clearTimeout(hold.t);
  }
  const onUp = () => clearTimeout(hold.t);
  function onContext(e) {
    const el = holdTarget(e);
    if (!el) return;
    e.preventDefault();
    clearTimeout(hold.t);
    if (!hold.fired) openPop(el.dataset.id);
    hold.fired = true;
  }

  function onPopClick(e) {
    const pop = e.target.closest('.ntl-pop');
    if (e.target === pop || e.target.closest('[data-act="close"]')) return closePop();
    const id = ui.pop;
    const sock = e.target.closest('.ntl-sock');
    if (sock) {
      const n = Number(sock.dataset.sock);
      if (sock.classList.contains('is-filled')) { ui.socket = -1; return act(M().remove(id, n)); }
      ui.socket = ui.socket === n ? -1 : n;
      return renderPop();
    }
    const gem = e.target.closest('.ntl-gem');
    if (gem) { const r = M().beset(id, gem.dataset.key, ui.socket); ui.socket = -1; return act(r); }
    if (e.target.closest('[data-act="oneclick"]')) { ui.socket = -1; return act(M().oneClick(id)); }
  }

  function onClick(e) {
    if (hold.fired) { hold.fired = false; e.preventDefault(); return; }
    const slot = e.target.closest('.ntl-slot');
    if (slot) {
      const n = Number(slot.dataset.slot);
      ui.pick = n === ui.slot && !slot.dataset.id ? ui.pick : null;
      ui.slot = n;
      render();
      const again = doc.querySelector(`#char-gear .ntl-slot[data-slot="${n}"]`);
      if (again) again.focus({ preventScroll: true });
      // the slot's tool / bag sits below the grid: bring it into view
      const detail = doc.querySelector('#char-gear .eqp-detail');
      if (detail && detail.scrollIntoView) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const card = e.target.closest('.ntl-card');
    if (card) { ui.pick = card.dataset.id; render(); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    const G_ = G();
    switch (a.dataset.act) {
      case 'pop': openPop(a.dataset.id); break;
      case 'bag': ui.pick = (G_.bagList().find(it => !G_.owner(it.id) && G_.canEquip(ui.uid, it.toolId)) || {}).id || null; render(); break;
      case 'back': ui.pick = null; render(); break;
      case 'copy': {
        const g = bagGroups().find(x => x.ids.includes(ui.pick));
        if (g) ui.pick = g.ids[(g.ids.indexOf(ui.pick) + Number(a.dataset.step) + g.ids.length) % g.ids.length];
        render();
        break;
      }
      case 'off': act(G_.unequip(ui.uid, ui.slot)); break;
      case 'equip': { const r = G_.equip(ui.uid, ui.pick, ui.slot); if (r.ok) ui.pick = null; act(r); break; }
      case 'sell': { const r = G_.sell(ui.pick); ui.pick = null; act(r); break; }
    }
  }
  function onKey(e) { if (e.key === 'Escape' && ui.pop) { e.stopPropagation(); closePop(); } }

  function init() {
    const box = doc.getElementById('char-gear');
    if (box) {
      box.addEventListener('click', onClick);
      box.addEventListener('pointerdown', onDown);
      box.addEventListener('pointermove', onMove);
      box.addEventListener('pointerup', onUp);
      box.addEventListener('pointercancel', onUp);
      box.addEventListener('contextmenu', onContext);
      doc.addEventListener('keydown', onKey, true);
    }
    global.addEventListener('gear:change', () => render());
    global.addEventListener('magatama:change', () => render());
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // Entering the tab: the ink ground of the record dissolves into the night
  // sky (assets/ui/equip-cosmos/intro.mp4, ends on space_bg) behind the
  // tools, which fade in over it. Skipped for reduced motion.
  function playIntro(modal) {
    const panel = modal && modal.querySelector('.char-modal-panel');
    if (!panel || doc.documentElement.dataset.skin === 'ink') return;   // Ink keeps the record
    const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let v = panel.querySelector('.eqp-intro');
    if (reduce) { if (v) v.remove(); return; }
    if (!v) {
      v = doc.createElement('video');
      v.className = 'eqp-intro';
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('aria-hidden', 'true');
      v.innerHTML = '<source src="assets/ui/equip-cosmos/intro.webm" type="video/webm"><source src="assets/ui/equip-cosmos/intro.mp4" type="video/mp4">';
      v.addEventListener('ended', () => v.classList.add('is-done'));
      v.addEventListener('error', () => v.classList.add('is-done'), true);
      panel.insertBefore(v, panel.firstChild);
    }
    v.classList.remove('is-done');
    try { v.currentTime = 0; } catch (e) { /* not loaded yet */ }
    const p = v.play();
    if (p && p.catch) p.catch(() => v.classList.add('is-done'));
    const box = doc.getElementById('char-gear');
    if (box) {
      box.classList.remove('is-intro'); void box.offsetWidth; box.classList.add('is-intro');
      // Only the first paint fades in: re-renders (every click) must not replay it
      clearTimeout(playIntro.t);
      playIntro.t = global.setTimeout(() => box.classList.remove('is-intro'), 2100);
    }
  }

  global.CharGearTab = {
    render, playIntro, openDetails: openPop, close: closePop,
    select: (slot) => { ui.slot = slot; ui.pick = null; render(); }
  };
})(window);
