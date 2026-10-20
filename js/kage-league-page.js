// js/kage-league-page.js — draws kage-league.html from the model in js/kage-league.js.
//
// Layout follows the original game's PvP screens (art cut from the IPA's
// PvPAtlas into assets/ui/kage-league/): the scroll title banner, the tower
// of floors, kunai rank markers for the top three, purple gem buttons, and
// the VS bar on the lineup screen before a match.
(function () {
  'use strict';

  const K = window.KageLeague;
  if (!K) return;
  const ART = 'assets/ui/kage-league/';
  const KUNAI = { 1: 'kunai_gold', 2: 'kunai_silver', 3: 'kunai_bronze' };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (Number(n) || 0).toLocaleString();
  const ord = (n) => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'); };
  const REWARD_NAMES = { ninja_pearls: 'Ninja Pearls', ryo: 'Ryo', potions: 'League Potions' };
  const REWARD_ICONS = { ninja_pearls: 'assets/icons/currency/ninjapearl.png', ryo: 'assets/icons/currency/ryo.png', potions: ART + 'orb_glow.webp' };

  let chars = [];
  let byId = new Map();
  let S = K.state();
  let opps = [];

  function duration(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
  }
  function rewardChips(reward) {
    return Object.entries(reward || {}).filter(([, v]) => v > 0).map(([k, v]) =>
      `<span class="kl-rw"><img src="${REWARD_ICONS[k] || ''}" alt="">${fmt(v)}<small>${esc(REWARD_NAMES[k] || k)}</small></span>`).join('');
  }

  /** LP lost on a defeat (never below 0 LP). */
  function lossText(o) {
    const n = Math.min(S.lp, o.swing.loss);
    return n > 0 ? `<b class="down">−${n} LP</b>` : '<b>no LP lost</b>';
  }

  /* ---------- team ---------- */
  function portraitFor(uid, charId) {
    const inv = window.InventoryChar && window.InventoryChar.getByUid ? window.InventoryChar.getByUid(uid) : null;
    const c = byId.get(charId || (inv && inv.charId));
    if (!c) return '';
    const tier = (inv && inv.tierCode) || c.starMinCode;
    return (c.artByTier && c.artByTier[tier] && c.artByTier[tier].portrait) || c.portrait || '';
  }
  function teamMembers(n) {
    const slots = K.teamSlots(n);
    return ['front-1', 'front-2', 'front-3', 'front-4'].map(k => slots[k]).filter(x => x && x.uid)
      .map(x => ({ portrait: portraitFor(x.uid, x.charId), name: (byId.get(x.charId) || {}).name || '' }));
  }
  function teamName(n) {
    try { const names = JSON.parse(localStorage.getItem('blazing_team_names') || '{}'); return names[n] || `Team ${n}`; } catch (e) { return `Team ${n}`; }
  }

  /* ---------- render ---------- */
  function renderHead() {
    const end = K.seasonEnd(S.season);
    $('kl-season').textContent = `Season ${S.season} · ends in ${duration(end - Date.now())}`;
    $('kl-tickets').innerHTML = Array.from({ length: K.TICKET_MAX }, (_, i) => `<i class="${i < S.tickets ? 'is-on' : ''}"></i>`).join('');
    $('kl-tickets').setAttribute('aria-label', `${S.tickets} of ${K.TICKET_MAX} tickets`);
    const next = K.nextTicketIn(S);
    $('kl-ticket-next').textContent = next ? `+1 in ${duration(next)}` : 'Full';
    $('kl-potions').textContent = S.potions;
  }

  function renderTower(place) {
    const zone = K.zoneOf(place, S.floor);
    $('kl-floors').innerHTML = K.FLOORS.slice().reverse().map(f => {
      const cur = f.n === S.floor;
      const arrow = cur && zone === 'promote' ? '<span class="kl-fl-arrow is-up" aria-label="Promotion zone">▲</span>'
        : cur && zone === 'relegate' ? '<span class="kl-fl-arrow is-down" aria-label="Relegation zone">▼</span>' : '';
      return `<li class="kl-fl ${cur ? 'is-current' : ''} ${f.n < S.floor ? 'is-below' : ''}" ${cur ? 'aria-current="true"' : ''}>
        <span class="kl-fl-n">${f.n}F</span><span class="kl-fl-name">${esc(f.name)}</span>${arrow}</li>`;
    }).join('');
  }

  function renderMe() {
    const rows = K.standings(S);
    const me = rows.find(r => r.isPlayer);
    const zone = K.zoneOf(me.place, S.floor);
    $('kl-me-floor').innerHTML = `<span>${S.floor}F</span> ${esc(K.floorOf(S.floor).name)}`;
    $('kl-me-place').textContent = ord(me.place);
    $('kl-bracket').textContent = K.BRACKET;
    const kunai = $('kl-me-kunai');
    if (KUNAI[me.place]) { kunai.src = ART + KUNAI[me.place] + '.webp'; kunai.hidden = false; } else kunai.hidden = true;
    const played = S.w + S.l > 0;
    $('kl-zone').className = `kl-zone is-${zone}`;
    $('kl-zone').textContent = !played ? 'Fight a match to enter this season'
      : zone === 'promote' ? `Promotion zone · top ${K.PROMOTE} move up`
      : zone === 'relegate' ? `Relegation zone · bottom ${K.RELEGATE} drop a floor`
      : S.floor === K.TOP && me.place <= K.PROMOTE ? 'Top floor' : 'Safe';
    $('kl-lp').textContent = fmt(S.lp);
    $('kl-w').textContent = S.w;
    $('kl-l').textContent = S.l;
    $('kl-streak').textContent = S.streak;
    $('kl-preview').innerHTML = `<small>${played ? `If the season ended now (${ord(me.place)})` : 'Season rewards start at'}</small>
      <div class="kl-rws">${rewardChips(K.rewardFor(S.floor, played ? me.place : K.BRACKET))}</div>`;
    const members = teamMembers(S.team);
    $('kl-team').innerHTML = `<span class="kl-team-label">League team<b>${esc(teamName(S.team))}</b></span>
      <span class="kl-team-faces">${members.length ? members.map(m => `<img src="${esc(m.portrait)}" alt="${esc(m.name)}">`).join('') : '<em>Empty — choose a team</em>'}</span>`;
    renderTower(me.place);
  }

  function renderOpps() {
    opps = K.opponents(S, chars);
    const noTickets = S.tickets <= 0;
    $('kl-opps').innerHTML = opps.map((o, i) => `
      <li class="kl-opp">
        <div class="kl-opp-who">
          <span class="kl-opp-place">${KUNAI[o.place] ? `<img src="${ART}${KUNAI[o.place]}.webp" alt="">` : ''}${ord(o.place)}</span>
          <span class="kl-opp-name">${esc(o.name)} <small>${esc(o.epithet)}</small></span>
          <span class="kl-opp-lp">${fmt(o.lp)} LP</span>
        </div>
        <div class="kl-opp-team">${o.units.map(u => `<img src="${esc(u.icon)}" alt="${esc(u.name)}" title="${esc(u.name)}">`).join('')}</div>
        <div class="kl-opp-foot">
          <span class="kl-opp-power">Power <b>${fmt(Math.round(o.power / 100) * 100)}</b></span>
          <span class="kl-opp-swing"><b class="up">+${o.swing.win}</b> / ${lossText(o)}</span>
          <button type="button" class="kl-gem" data-opp="${i}" ${noTickets ? 'disabled' : ''}><span>${noTickets ? 'No tickets' : 'Challenge'}</span></button>
        </div>
      </li>`).join('') || '<li class="kl-empty">No challengers right now.</li>';
    $('kl-opps').querySelectorAll('[data-opp]').forEach(b => b.addEventListener('click', () => openLineup(opps[Number(b.dataset.opp)])));
  }

  function render() {
    S = K.state();
    renderHead();
    renderMe();
    renderOpps();
  }

  /* ---------- sheets ---------- */
  function sheet(title, body, { kicker = '', cls = '', foot = '' } = {}) {
    const el = document.createElement('div');
    el.className = `kl-sheet ${cls}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', title);
    el.innerHTML = `<div class="kl-sheet-scrim" data-close></div>
      <div class="kl-sheet-panel">
        <div class="kl-sheet-head"><div><small>${esc(kicker)}</small><h2>${esc(title)}</h2></div>
          <button type="button" class="kl-icon-btn" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div>
        <div class="kl-sheet-body">${body}</div>
        ${foot ? `<div class="kl-sheet-foot">${foot}</div>` : ''}
      </div>`;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    document.body.appendChild(el);
    el.querySelector('.kl-sheet-panel button')?.focus({ preventScroll: true });
    el.close = close;
    return el;
  }

  function openStandings() {
    const rows = K.standings(S);
    const body = `<table class="kl-table"><thead><tr><th>#</th><th>Shinobi</th><th>LP</th></tr></thead><tbody>${rows.map(r => {
      const zone = K.zoneOf(r.place, S.floor);
      return `<tr class="z-${zone} ${r.isPlayer ? 'is-me' : ''}">
        <td class="kl-t-place">${KUNAI[r.place] ? `<img src="${ART}${KUNAI[r.place]}.webp" alt="">` : ''}<span>${r.place}</span></td>
        <td>${esc(r.name)}${r.epithet ? ` <small>${esc(r.epithet)}</small>` : ''}</td>
        <td class="kl-t-lp">${fmt(r.lp)}</td></tr>`;
    }).join('')}</tbody></table>
      <p class="kl-note">${S.floor < K.TOP ? `<i class="kl-key z-promote"></i>Promotion (top ${K.PROMOTE}) ` : ''}${S.floor > 1 ? `<i class="kl-key z-relegate"></i>Relegation (bottom ${K.RELEGATE})` : ''}</p>`;
    sheet('Standings', body, { kicker: `${K.floorOf(S.floor).name} · Season ${S.season}` });
  }

  function openRewards() {
    const rows = K.rewardTable(S.floor).map(r => `<tr><td>${esc(r.label)}</td><td class="kl-rws">${rewardChips(r.reward)}</td></tr>`).join('');
    const top = S.floor === K.TOP ? '<p class="kl-note">1st on the Kage Floor also earns the title <b>Kage of the Season</b>.</p>' : '';
    sheet('Season Rewards', `<table class="kl-table kl-rw-table"><tbody>${rows}</tbody></table>
      <p class="kl-note">Paid when the season ends, by your final place on the ${esc(K.floorOf(S.floor).name)}. You must fight at least one match.</p>${top}`,
      { kicker: `${K.floorOf(S.floor).name} · Season ${S.season}` });
  }

  function openRecords() {
    const hist = (S.history || []).map(h => `<tr>
      <td>S${h.season}</td><td>${h.floor}F</td><td>${ord(h.place)}</td><td>${fmt(h.lp)}</td><td>${h.w}–${h.l}</td>
      <td class="m-${h.move}">${h.move === 'promote' ? `▲ ${h.to}F` : h.move === 'relegate' ? `▼ ${h.to}F` : '—'}</td></tr>`).join('');
    const log = (S.log || []).map(m => `<tr><td class="${m.win ? 'win' : 'loss'}">${m.win ? 'Win' : 'Loss'}</td><td>${esc(m.opponent)}</td>
      <td class="${m.lp >= 0 ? 'win' : 'loss'}">${m.lp > 0 ? '+' : ''}${m.lp} LP</td></tr>`).join('');
    const titles = (S.titles || []).length ? `<p class="kl-note">Titles: ${S.titles.map(esc).join(', ')}</p>` : '';
    sheet('Records', `
      <h3 class="kl-h3">Past seasons</h3>
      ${hist ? `<table class="kl-table"><thead><tr><th>Season</th><th>Floor</th><th>Place</th><th>LP</th><th>W–L</th><th>Move</th></tr></thead><tbody>${hist}</tbody></table>` : '<p class="kl-note">No finished seasons yet.</p>'}
      ${titles}
      <h3 class="kl-h3">This season</h3>
      ${log ? `<table class="kl-table"><tbody>${log}</tbody></table>` : '<p class="kl-note">No matches yet.</p>'}`, { kicker: `Best streak ${S.best || 0}` });
  }

  function openTeamPicker() {
    const cards = Array.from({ length: 8 }, (_, i) => i + 1).map(n => {
      const m = teamMembers(n);
      return `<button type="button" class="kl-team-card ${n === S.team ? 'is-picked' : ''}" data-team="${n}" ${m.length ? '' : 'disabled'}>
        <span class="kl-team-label"><b>${esc(teamName(n))}</b>${m.length ? `${m.length} units` : 'Empty'}</span>
        <span class="kl-team-faces">${m.map(x => `<img src="${esc(x.portrait)}" alt="${esc(x.name)}">`).join('')}</span></button>`;
    }).join('');
    const el = sheet('League Team', `<div class="kl-team-grid">${cards}</div>
      <p class="kl-note">Matches use the front row of this team. Edit teams in Teams.</p>`, { kicker: 'Choose a team' });
    el.querySelectorAll('[data-team]').forEach(b => b.addEventListener('click', () => {
      K.setTeam(S, Number(b.dataset.team));
      el.close();
      render();
    }));
  }

  function openLineup(opp) {
    if (!opp) return;
    const me = teamMembers(S.team);
    const side = (list) => list.map(u => `<img src="${esc(u.portrait || u.icon)}" alt="${esc(u.name)}" title="${esc(u.name)}">`).join('');
    const el = sheet('Confirm Lineup', `
      <div class="kl-vs">
        <div class="kl-vs-side"><small>You · ${ord(K.standings(S).find(r => r.isPlayer).place)}</small><div class="kl-vs-faces">${me.length ? side(me) : '<em>No team</em>'}</div></div>
        <div class="kl-vs-bar" aria-label="versus"></div>
        <div class="kl-vs-side is-opp"><small>${esc(opp.name)} · ${ord(opp.place)}</small><div class="kl-vs-faces">${side(opp.units)}</div></div>
      </div>
      <p class="kl-note">Win <b class="up">+${opp.swing.win} LP</b> · Lose ${lossText(opp)} · Costs 1 ticket (${S.tickets} left)</p>`,
      { cls: 'is-lineup', kicker: K.floorOf(S.floor).name, foot: `<button type="button" class="kl-gem kl-gem-lg" data-fight><span>Fight</span></button>` });
    el.querySelector('[data-fight]').addEventListener('click', () => {
      const r = K.launch(S, opp);
      if (!r.ok) {
        const msg = r.reason === 'tickets' ? 'You are out of tickets. Use a League Potion or wait for one to come back.'
          : r.reason === 'team' ? 'Your league team is empty. Choose a team with units first.' : 'This challenger can’t be fought right now.';
        el.querySelector('.kl-sheet-body').insertAdjacentHTML('beforeend', `<p class="kl-note kl-warn">${esc(msg)}</p>`);
        return;
      }
      document.body.classList.add('is-leaving');
      setTimeout(() => { window.location.href = 'battle.html'; }, 200);
    });
  }

  function showReport() {
    const r = S.report;
    if (!r) return;
    const move = r.move === 'promote' ? `Promoted to ${esc(K.floorOf(r.to).name)}!`
      : r.move === 'relegate' ? `Dropped to ${esc(K.floorOf(r.to).name)}.` : `You stay on the ${esc(K.floorOf(r.to).name)}.`;
    sheet(`Season ${r.season} Results`, `
      <div class="kl-report is-${r.move}">
        ${KUNAI[r.place] ? `<img class="kl-report-kunai" src="${ART}${KUNAI[r.place]}.webp" alt="">` : ''}
        <div class="kl-report-place">${ord(r.place)}<small>on the ${esc(K.floorOf(r.floor).name)}</small></div>
        <div class="kl-report-move">${move}</div>
        ${r.title ? `<div class="kl-report-title">Title earned: <b>${esc(r.title)}</b></div>` : ''}
        <div class="kl-report-stats">${fmt(r.lp)} LP · ${r.w}–${r.l}</div>
        <div class="kl-rws">${rewardChips(r.reward)}</div>
      </div>`, { kicker: 'Season over', cls: 'is-report' });
    K.clearReport(S);
  }

  /* ---------- wiring ---------- */
  $('kl-btn-standings').addEventListener('click', openStandings);
  $('kl-btn-rewards').addEventListener('click', openRewards);
  $('kl-btn-records').addEventListener('click', openRecords);
  $('kl-team').addEventListener('click', openTeamPicker);
  $('kl-rescout').addEventListener('click', () => { K.rescout(S); renderOpps(); });
  $('kl-potion').addEventListener('click', () => {
    const r = K.usePotion(S);
    if (!r.ok) {
      const t = $('kl-potion');
      t.classList.remove('is-nope'); void t.offsetWidth; t.classList.add('is-nope');
      t.title = r.reason === 'full' ? 'Tickets are already full' : 'No League Potions';
      return;
    }
    render();
  });

  async function boot() {
    try {
      const d = await (await fetch('data/characters.json')).json();
      chars = Array.isArray(d) ? d : (d.characters || Object.values(d));
    } catch (e) { chars = []; }
    byId = new Map(chars.map(c => [c.id, c]));
    render();
    showReport();
    setInterval(() => { S = K.state(); renderHead(); }, 30000);
    window.AudioManager?.playMusic?.('arena');
  }
  boot();
})();
