// js/character-gear-tab.js — Equipment tab of the Shinobi Record (characters.html).
//
// The six gear slots (js/gear.js) sit on an orbit around a sigil (art in
// assets/ui/equip-cosmos, over a starfield; the character art is hidden on
// this tab so the orbit can use the whole panel): helmet, weapon, armor and
// sandals on the outer ring, scroll and necklace in the middle. Each disc
// shows the equipped piece in its rarity colour with its +level, or an empty
// slot. Beside the orbit:
//   Gear Bonus   what the pieces (main + substats) and magatama add
//   the slot     the equipped piece: main stat, substats, level up with Ryo,
//                Change / Unequip
//   the bag      (Change) every piece for that slot that has dropped, best
//                first; pick one to see it, then Equip or Salvage it
(function (global) {
  'use strict';

  const ORBIT = [
    { slot: 'helmet',   pos: 'tl' },
    { slot: 'weapon',   pos: 'tr' },
    { slot: 'armor',    pos: 'bl' },
    { slot: 'sandals',  pos: 'br' },
    { slot: 'scroll',   pos: 'il' },
    { slot: 'necklace', pos: 'ir' }
  ];
  // Decorative glints on the orbit: [art, x %, y %, width %, twinkle delay s]
  const SPARKS = [
    ['spark_cross', 6, 44, 7, 0], ['sparks', 88, 52, 8, 1.3], ['spark_big', 52, 3, 5, 2.1],
    ['streak', 12, 88, 10, 0.7], ['orb', 92, 8, 5, 1.8], ['dust', 70, 92, 11, 2.6]
  ];
  // Gear Bonus rows: [stat, label]; flat and % of the same stat sit together
  const TOTALS = [
    ['hp', 'HP'], ['hpPct', 'HP%'], ['atk', 'ATK'], ['atkPct', 'ATK%'], ['def', 'DEF'], ['defPct', 'DEF%'],
    ['spd', 'SPD'], ['critRate', 'Crit Rate'], ['critDmg', 'Crit DMG'], ['nin', 'Jutsu DMG'], ['res', 'Jutsu RES']
  ];
  const RYO = 'assets/icons/currency/ryo.png';

  const ui = { uid: null, slot: 'helmet', bag: false, pick: null };
  const G = () => global.Gear;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
  const ryo = () => (global.Resources ? global.Resources.get('ryo') : 0);
  const val = (stat, v) => G().fmtValue(stat, v);
  function ownerName(uid) {
    const inst = global.InventoryChar && global.InventoryChar.getByUid ? global.InventoryChar.getByUid(uid) : null;
    const list = global.CharacterData || global.CHARACTERS || [];
    const c = inst && Array.isArray(list) ? list.find(x => x.id === inst.charId) : null;
    return (c && c.name) || 'another shinobi';
  }
  function toast(msg) {
    const box = global.document.querySelector('#char-gear .eqp-toast');
    if (!box || !msg) return;
    box.textContent = msg;
    box.classList.remove('is-on'); void box.offsetWidth; box.classList.add('is-on');
  }

  function pieceHTML(i, pos) {
    const on = i.slot === ui.slot;
    return `<button type="button" class="eqp-piece eqp--${pos}${on ? ' is-on' : ''}${i.shiny ? ' is-shiny' : ''}${i.empty ? ' is-empty' : ''}"
        data-slot="${i.slot}" style="--tc:${i.empty ? 'rgba(200,210,255,.35)' : i.tierInfo.color}" aria-pressed="${on}"
        aria-label="${esc(i.kind)}: ${i.empty ? 'empty' : `${esc(i.name)}, +${i.level}`}">
        <span class="eqp-medal"><img src="${esc(i.art)}" alt="" draggable="false"></span>
        <span class="eqp-lv"><i aria-hidden="true"></i>${i.empty ? 'Empty' : `+${i.level}`}</span>
      </button>`;
  }

  // Name, rarity, main stat and substats of one piece
  function statsHTML(i) {
    const next = i.next != null ? `<em>&rarr; ${val(i.stat, i.next)}</em>` : '';
    return `
      <div class="eqp-detail-head" style="--tc:${i.tierInfo.color}">
        <span class="eqp-detail-ic${i.shiny ? ' is-shiny' : ''}"><img src="${esc(i.art)}" alt="" draggable="false"></span>
        <span class="eqp-detail-nm">
          <b>${esc(i.name)}</b>
          <small>${esc(i.tierInfo.label)} &middot; +${i.level} / ${i.cap}</small>
        </span>
      </div>
      <div class="eqp-row eqp-main"><span>${esc(i.statLabel)}</span><b>+${val(i.stat, i.value)} ${next}</b></div>
      ${i.subs.map(s => `<div class="eqp-row eqp-sub"><span>${esc(s.label)}</span><b>+${esc(s.text)}</b></div>`).join('')}
      ${i.subs.length < 4 ? `<div class="eqp-row eqp-sub is-locked"><span>New substat at +${Math.ceil((i.level + 1) / 3) * 3}</span><b></b></div>` : ''}
      ${setLineHTML(i.set)}`;
  }

  // A piece's set: its two bonuses, lit when this shinobi wears enough pieces
  function setLineHTML(set) {
    const d = set && G().SETS[set];
    if (!d) return '';
    const n = G().setCounts(ui.uid)[set] || 0;
    return `<div class="eqp-set" style="--set:${d.color}">
        <span class="eqp-set-nm">${esc(d.name)} Set <i>${Math.min(n, 4)}/4</i></span>
        <span class="eqp-set-b${n >= 2 ? ' is-on' : ''}"><b>2 pc</b>${esc(G().setTwoText(set))}</span>
        <span class="eqp-set-b${n >= 4 ? ' is-on' : ''}"><b>4 pc</b>${esc(d.four)}</span>
      </div>`;
  }

  // Sets this shinobi wears 2+ pieces of
  function setBonusHTML() {
    const act = G().activeSets(ui.uid);
    if (!act.length) return '';
    return `<div class="eqp-sets">${act.map(b => {
      const d = G().SETS[b.set];
      return `<div class="eqp-row eqp-setrow" style="--set:${d.color}"><span>${esc(d.name)} ${b.pieces} pc</span><b>${esc(b.text)}</b></div>`;
    }).join('')}</div>`;
  }

  function slotHTML(i) {
    if (i.empty) {
      const n = G().bagFor(i.slot).length;
      return `<p class="eqp-empty">No ${esc(i.kind.toLowerCase())} equipped.</p>
        <div class="eqp-acts"><button type="button" class="eqp-go" data-act="bag" ${n ? '' : 'disabled'}>${n ? `Choose (${n})` : 'None yet: clear missions'}</button></div>`;
    }
    const M = global.Magatama;
    const row = M && M.FIT && M.FIT[i.slot] ? M.socketsOf(i.uid, i.slot) : null;
    const pips = row ? `<div class="eqp-row"><span>Magatama</span><span class="eqp-pips">${row.map(k => k ? `<i style="--c:${M.info(k).color}"></i>` : '<i></i>').join('')}</span></div>` : '';
    let lvl;
    if (i.atCap) lvl = '<div class="eqp-state">Max level</div>';
    else {
      const pl = G().plan(i.uid, i.slot);
      lvl = `<div class="eqp-state">Next level <img src="${RYO}" alt="">${fmt(i.cost)}</div>
        <div class="eqp-acts">
          <button type="button" class="eqp-go" data-act="lv1" ${ryo() >= i.cost ? '' : 'disabled'}>Level Up</button>
          <button type="button" class="eqp-go" data-act="lvmax" ${pl.levels ? '' : 'disabled'}>${pl.levels > 1 ? `+${pl.levels} Levels` : 'Auto'}</button>
        </div>`;
    }
    return `${statsHTML(i)}${pips}${lvl}
      <div class="eqp-acts">
        <button type="button" class="eqp-go is-quiet" data-act="bag">Change</button>
        <button type="button" class="eqp-go is-quiet" data-act="off">Unequip</button>
      </div>`;
  }

  function bagHTML(slot) {
    const list = G().bagFor(slot);
    const kind = G().PIECES[slot].kind;
    const cards = list.map(it => {
      const t = G().TIERS[it.rarity];
      const own = G().owner(it.id);
      return `<button type="button" class="eqp-card${it.id === ui.pick ? ' is-on' : ''}${t.shiny ? ' is-shiny' : ''}" data-id="${esc(it.id)}" style="--tc:${t.color}"
          aria-label="${esc(G().nameOf(it.slot, it.rarity, it.set))}${G().SETS[it.set] ? `, ${esc(G().SETS[it.set].name)} set` : ''}, +${it.level}${own ? ', in use' : ''}">
          <img src="${esc(G().artOf(it.slot, it.rarity, it.set))}" alt="" draggable="false">
          <span class="eqp-card-lv">+${it.level}</span>
          ${own ? `<span class="eqp-card-own${own === ui.uid ? ' is-mine' : ''}" aria-hidden="true">${own === ui.uid ? '&#10003;' : '&bull;'}</span>` : ''}
          <span class="eqp-card-main">${esc(G().STAT[it.main].label)}</span>
          ${G().SETS[it.set] ? `<span class="eqp-card-set" style="--set:${G().SETS[it.set].color}" title="${esc(G().SETS[it.set].name)}" aria-hidden="true"></span>` : ''}
        </button>`;
    }).join('');
    let pickPane = '';
    const p = ui.pick && G().itemInfo(ui.pick);
    if (p) {
      const own = p.owner;
      pickPane = `<div class="eqp-pick">${statsHTML(p)}
        ${own && own !== ui.uid ? `<p class="eqp-note">Worn by ${esc(ownerName(own))}; equipping takes it.</p>` : ''}
        <div class="eqp-acts">
          ${own === ui.uid ? '<span class="eqp-state">Equipped</span>' : '<button type="button" class="eqp-go" data-act="equip">Equip</button>'}
          ${own ? '' : '<button type="button" class="eqp-go is-quiet" data-act="salvage">Salvage</button>'}
        </div></div>`;
    }
    return `<div class="eqp-bag-head"><button type="button" class="eqp-back" data-act="back" aria-label="Back">&larr;</button><span>${esc(kind)} &middot; ${list.length}</span></div>
      ${list.length ? `<div class="eqp-cards" role="listbox" aria-label="${esc(kind)} pieces">${cards}</div>` : '<p class="eqp-empty">None yet: clear missions to find gear.</p>'}
      ${pickPane}`;
  }

  function render(uid) {
    const box = global.document.getElementById('char-gear');
    if (!box) return;
    if (uid !== undefined && uid !== ui.uid) { ui.uid = uid; ui.bag = false; ui.pick = null; }
    if (!G() || !ui.uid) { box.innerHTML = ''; return; }
    if (!G().SLOTS.includes(ui.slot)) ui.slot = 'helmet';
    if (ui.pick && !G().item(ui.pick)) ui.pick = null;
    const pieces = ORBIT.filter(o => G().SLOTS.includes(o.slot)).map(o => ({ o, i: G().info(ui.uid, o.slot) }));
    const tot = G().bonusFor(ui.uid);
    const m = global.Magatama && global.Magatama.bonusForUnit ? global.Magatama.bonusForUnit(ui.uid) : {};
    ['hp', 'atk', 'def', 'nin', 'res'].forEach(k => { tot[k] = (tot[k] || 0) + (m[k] || 0); });
    const rows = TOTALS.filter(([k]) => tot[k]);
    const sel = pieces.find(p => p.i.slot === ui.slot) || pieces[0];
    box.innerHTML = `
      <div class="eqp">
        <div class="eqp-orbit" role="group" aria-label="Gear">
          <span class="eqp-ring" aria-hidden="true"></span>
          <span class="eqp-ticks" aria-hidden="true"></span>
          <span class="eqp-sigil" aria-hidden="true"></span>
          ${SPARKS.map(([k, x, y, w, d]) => `<span class="eqp-spark eqp-spark--${k}" style="left:${x}%;top:${y}%;width:${w}%;animation-delay:${d}s" aria-hidden="true"></span>`).join('')}
          ${pieces.map(p => pieceHTML(p.i, p.o.pos)).join('')}
        </div>
        <div class="eqp-side">
          <h4 class="cx-kicker">Gear Bonus</h4>
          <div class="eqp-totals">
            ${rows.length ? rows.map(([k, label]) => `<div class="eqp-row"><span>${label}</span><b>+${val(k, tot[k])}</b></div>`).join('') : '<p class="eqp-empty">No gear equipped</p>'}
          </div>
          ${setBonusHTML()}
          <h4 class="cx-kicker">${esc(sel.i.kind)}</h4>
          <div class="eqp-detail">${ui.bag ? bagHTML(ui.slot) : slotHTML(sel.i)}</div>
          <div class="eqp-toast" role="status" aria-live="polite"></div>
        </div>
      </div>`;
  }

  function act(res) {
    if (res && res.msg) setTimeout(() => toast(res.msg), 0);
    render();
  }
  function onClick(e) {
    const piece = e.target.closest('.eqp-piece');
    if (piece) {
      if (piece.dataset.slot !== ui.slot) { ui.bag = false; ui.pick = null; }
      ui.slot = piece.dataset.slot;
      render();
      const again = global.document.querySelector(`#char-gear .eqp-piece[data-slot="${ui.slot}"]`);
      if (again) again.focus();
      return;
    }
    const card = e.target.closest('.eqp-card');
    if (card) { ui.pick = card.dataset.id; render(); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    const G_ = G();
    switch (a.dataset.act) {
      case 'bag': ui.bag = true; ui.pick = G_.equippedId(ui.uid, ui.slot) || (G_.bagFor(ui.slot)[0] || {}).id || null; render(); break;
      case 'back': ui.bag = false; ui.pick = null; render(); break;
      case 'lv1': act(G_.strengthen(ui.uid, ui.slot, 1)); break;
      case 'lvmax': act(G_.auto(ui.uid, ui.slot)); break;
      case 'off': act(G_.unequip(ui.uid, ui.slot)); break;
      case 'equip': { const r = G_.equip(ui.uid, ui.pick); ui.bag = false; ui.pick = null; act(r); break; }
      case 'salvage': { const r = G_.salvage(ui.pick); ui.pick = null; act(r); break; }
    }
  }

  function init() {
    const box = global.document.getElementById('char-gear');
    if (box) box.addEventListener('click', onClick);
    global.addEventListener('gear:change', () => render());
    global.addEventListener('magatama:change', () => render());
  }
  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // Entering the tab: the ink ground of the record dissolves into the night
  // sky (assets/ui/equip-cosmos/intro.mp4, ends on space_bg) behind the gear,
  // which fades in over it. Skipped for reduced motion.
  function playIntro(modal) {
    const panel = modal && modal.querySelector('.char-modal-panel');
    if (!panel) return;
    const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let v = panel.querySelector('.eqp-intro');
    if (reduce) { if (v) v.remove(); return; }
    if (!v) {
      v = global.document.createElement('video');
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
    const box = global.document.getElementById('char-gear');
    if (box) {
      box.classList.remove('is-intro'); void box.offsetWidth; box.classList.add('is-intro');
      // Only the first paint fades in: re-renders (every click) must not replay it
      clearTimeout(playIntro.t);
      playIntro.t = global.setTimeout(() => box.classList.remove('is-intro'), 2100);
    }
  }

  global.CharGearTab = { render, playIntro, select: (slot) => { ui.slot = slot; ui.bag = false; ui.pick = null; render(); } };
})(window);
