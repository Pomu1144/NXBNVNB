// js/character-gear-tab.js — Equipment tab of the Shinobi Record (characters.html).
//
// The six gear pieces (js/gear.js) sit on an orbit around a sigil (art in
// assets/ui/equip-cosmos, over a starfield; the character art is hidden on
// this tab so the orbit can use the whole panel): helmet,
// weapon, armor and sandals on the outer ring, scroll and necklace in the
// middle. Each medallion shows the piece's art in its tier colour with its
// level under it. Beside the orbit: what the gear and its magatama add in
// total, and the selected piece (name, tier, level, stat) with a link to
// strengthen it on the Tools page.
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
  const TOTALS = [
    ['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spd', 'SPD'],
    ['nin', 'Jutsu DMG', '%'], ['res', 'Jutsu RES', '%']
  ];

  const ui = { uid: null, slot: 'helmet' };
  const G = () => global.Gear;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = (v, unit) => unit ? `${Math.round((+v || 0) * 100) / 100}%` : Math.round(+v || 0).toLocaleString();

  function pieceHTML(i, pos) {
    const on = i.slot === ui.slot;
    return `<button type="button" class="eqp-piece eqp--${pos}${on ? ' is-on' : ''}${i.shiny ? ' is-shiny' : ''}"
        data-slot="${i.slot}" style="--tc:${i.tierInfo.color}" aria-pressed="${on}"
        aria-label="${esc(i.name)}, level ${i.level}">
        <span class="eqp-medal"><img src="${esc(i.art)}" alt="" draggable="false"></span>
        <span class="eqp-lv"><i aria-hidden="true"></i>Lv ${i.level}</span>
      </button>`;
  }

  function detailHTML(i) {
    const M = global.Magatama;
    const row = M && M.FIT && M.FIT[i.slot] ? M.socketsOf(i.uid, i.slot) : null;
    const pips = row ? `<div class="eqp-row"><span>Magatama</span><span class="eqp-pips">${row.map(k => k ? `<i style="--c:${M.info(k).color}"></i>` : '<i></i>').join('')}</span></div>` : '';
    const next = i.next != null ? `<em>&rarr; ${num(i.next, i.unit)}</em>` : '';
    const state = i.isMax ? 'Max tier' : i.atCap ? 'Ready to upgrade' : `Next Lv: ${i.cost.toLocaleString()} Ryo`;
    return `
      <div class="eqp-detail-head" style="--tc:${i.tierInfo.color}">
        <span class="eqp-detail-ic"><img src="${esc(i.art)}" alt="" draggable="false"></span>
        <span class="eqp-detail-nm">
          <b>${esc(i.name)}</b>
          <small>${esc(i.kind)} &middot; ${esc(i.tierInfo.label)}</small>
        </span>
      </div>
      <div class="eqp-row"><span>Level</span><b>${i.level} / ${i.cap}</b></div>
      <div class="eqp-row"><span>${esc(i.statLabel)}</span><b>+${num(i.value, i.unit)} ${next}</b></div>
      ${pips}
      <div class="eqp-state">${esc(state)}</div>
      <a class="eqp-go" href="tools.html?uid=${encodeURIComponent(i.uid)}&amp;view=gear">Strengthen</a>`;
  }

  function render(uid) {
    const box = global.document.getElementById('char-gear');
    if (!box) return;
    if (uid !== undefined) ui.uid = uid;
    if (!G() || !ui.uid) { box.innerHTML = ''; return; }
    if (!G().SLOTS.includes(ui.slot)) ui.slot = 'helmet';
    const pieces = ORBIT.filter(o => G().SLOTS.includes(o.slot)).map(o => ({ o, i: G().info(ui.uid, o.slot) }));
    const tot = G().totalFor(ui.uid);
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
            ${TOTALS.map(([k, label, unit]) => `<div class="eqp-row"><span>${label}</span><b>+${num(tot[k], unit)}</b></div>`).join('')}
          </div>
          <h4 class="cx-kicker">${esc(sel.i.kind)}</h4>
          <div class="eqp-detail">${detailHTML(sel.i)}</div>
        </div>
      </div>`;
  }

  function onClick(e) {
    const b = e.target.closest('.eqp-piece');
    if (!b) return;
    ui.slot = b.dataset.slot;
    render();
    const again = global.document.querySelector(`#char-gear .eqp-piece[data-slot="${ui.slot}"]`);
    if (again) again.focus();
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
    if (box) { box.classList.remove('is-intro'); void box.offsetWidth; box.classList.add('is-intro'); }
  }

  global.CharGearTab = { render, playIntro, select: (slot) => { ui.slot = slot; render(); } };
})(window);
