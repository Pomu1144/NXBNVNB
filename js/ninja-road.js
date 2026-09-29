// js/ninja-road.js - Ninja Road: a 10-floor gauntlet fought with up to three
// squads whose HP, chakra and cooldowns carry from floor to floor.
//
// State (STATE_KEY) holds the current run: the floors (generated once per
// run, so a reload shows the same road), the three squads (team number + a
// frozen member list + per-unit carried state), the next floor, the boss
// seal (ATK boost) and the milestones paid. A floor is fought on battle.html
// through js/battle/battle-ninja-road.js: this page writes the launch record,
// the battle writes back a result, and this page applies it (once per launch
// id) the next time it loads. Rewards go through window.Resources.
(function () {
  'use strict';

  const STATE_KEY = 'blazing_ninja_road_v1';
  const NR = window.BattleNinjaRoad;
  const FLOORS = 10;
  const BOSS_FLOORS = { 5: { giant: 'nine_tails', hp: 150000, atk: 2600 }, 10: { giant: 'susanoo_perfect', hp: 240000, atk: 3400 } };
  const CYCLE_MS = 14 * 24 * 60 * 60 * 1000;
  const CYCLE_EPOCH = Date.UTC(2026, 0, 5);
  const SEAL = { atk: 0.2, floors: 2 };
  const SLOT_ORDER = ['front-1', 'front-2', 'front-3', 'front-4', 'back-1', 'back-2', 'back-3', 'back-4'];
  const MILESTONES = [
    { floor: 3, label: 'Floor 3', reward: { ryo: 5000 } },
    { floor: 5, label: 'Floor 5', reward: { ninja_pearls: 5 } },
    { floor: 8, label: 'Floor 8', reward: { ryo: 15000 } },
    { floor: 10, label: 'Road cleared', reward: { acquisition_stone: 1 }, oncePerCycle: true, repeat: { ninja_pearls: 5 } }
  ];
  const REWARD_NAMES = { ryo: 'Ryo', ninja_pearls: 'Ninja Pearls', granny_coin: 'Granny Coins', acquisition_stone: 'Acquisition Stone' };
  const MAPS = [
    'bg_030101_kaido', 'bg_020101_mori', 'bg_040101_heigen', 'bg_050101_iwaba', 'bg_060101_kouya',
    'bg_070101_kawara', 'bg_090101_oohashi', 'bg_100101_shinomori', 'bg_120101_honsen', 'bg_130101_tanzaku',
    'bg_140101_syumatu', 'bg_150101_suna', 'bg_170101_tenti', 'bg_180101_oroti', 'bg_240101_tetu',
    'bg_260101_unrai', 'bg_290101_kaigan', 'bg_300101_sabaku', 'bg_370101_senjyou', 'bg_470101_hyouzan'
  ];
  const BOSS_MAPS = { 5: 'bg_220102_konoha_houkai', 10: 'bg_580101_syuumatunotani' };
  const SILHOUETTE = 'assets/characters/common/silhouette.png';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };
  const readJSON = (k, d) => { try { const v = JSON.parse(lsGet(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
  const cycleNow = () => Math.floor((Date.now() - CYCLE_EPOCH) / CYCLE_MS);
  const rid = () => Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);

  let chars = {};      // id -> character data
  let pool = [];       // playable units, by power
  let state = null;

  /* ===== State ===== */

  function blankSquad() { return { team: null, members: [], commander: null, units: {} }; }

  function newRun(prev) {
    const s = {
      v: 1,
      cycle: cycleNow(),
      runId: rid(),
      floor: 1,
      started: false,
      ended: null,           // 'cleared' | 'fallen'
      sel: 0,
      squads: [blankSquad(), blankSquad(), blankSquad()],
      floors: [],
      seal: null,            // { atk, floors }
      paid: [],              // milestone floors paid this run
      fullClearCycle: prev ? prev.fullClearCycle : null,
      pending: null          // { id, floor, squad }
    };
    // Keep the squads' team picks across runs (fresh HP)
    if (prev && Array.isArray(prev.squads)) {
      prev.squads.forEach((q, i) => { if (q && q.team) s.squads[i] = freezeSquad(q.team) || blankSquad(); });
    }
    return s;
  }

  function load() {
    let s = readJSON(STATE_KEY, null);
    if (!s || s.v !== 1 || !Array.isArray(s.squads)) s = newRun(null);
    if (s.cycle !== cycleNow()) s = newRun(s); // road resets each cycle
    state = s;
  }
  function save() { lsSet(STATE_KEY, JSON.stringify(state)); }

  /* ===== Teams / inventory ===== */

  function inventory() {
    const map = {};
    const arr = readJSON('blazing_inventory_v2', []);
    if (Array.isArray(arr)) arr.forEach(i => { if (i && i.uid) map[i.uid] = i; });
    return map;
  }
  function savedTeams() { return readJSON('blazing_teams_v1', {}) || {}; }

  /** Member list of a saved team (front first), frozen for the run. */
  function freezeSquad(teamNum) {
    const team = savedTeams()[teamNum] || {};
    const inv = inventory();
    const members = [];
    SLOT_ORDER.forEach(slot => {
      const e = team[slot];
      if (e && e.uid && inv[e.uid]) members.push({ uid: e.uid, charId: inv[e.uid].charId || e.charId });
    });
    if (!members.length) return null;
    const c = team.commander;
    return {
      team: Number(teamNum),
      members,
      commander: c && c.uid && inv[c.uid] ? { uid: c.uid, charId: inv[c.uid].charId || c.charId } : null,
      units: {}
    };
  }

  function teamUids(teamNum) {
    const team = savedTeams()[teamNum] || {};
    return SLOT_ORDER.concat('commander').map(s => team[s] && team[s].uid).filter(Boolean);
  }

  const unitHP = (q, uid) => { const u = q.units[uid]; return u && Number.isFinite(u.hp) ? u.hp : 1; };
  const alive = (q) => q.members.filter(m => unitHP(q, m.uid) > 0);
  const squadOut = (q) => !q.team || alive(q).length === 0;
  const squadHP = (q) => q.members.length ? q.members.reduce((a, m) => a + unitHP(q, m.uid), 0) / q.members.length : 0;

  function portraitOf(charId, uid) {
    const c = chars[charId];
    if (!c) return SILHOUETTE;
    const inst = uid ? inventory()[uid] : null;
    const tier = (inst && inst.tierCode) || c.starMaxCode || c.starMinCode || '3S';
    return (c.artByTier && c.artByTier[tier] && c.artByTier[tier].portrait) || c.portrait || SILHOUETTE;
  }

  /* ===== Floors ===== */

  function spritePool() {
    const SP = window.SpritePlayer;
    const anim = SP && typeof SP.has === 'function' ? pool.filter(c => SP.has(c.id)) : [];
    return anim.length >= 6 ? anim : pool;
  }

  function buildEnemy(c, mult) {
    const s = c.statsMax || c.statsBase || {};
    return {
      id: c.id, name: c.name, icon: portraitOf(c.id),
      hp: Math.round((s.hp || 5000) * mult),
      atk: Math.round((s.atk || 800) * mult),
      spd: s.speed || s.spd || 100,
      skills: c.skills || {}, element: c.element || null
    };
  }

  function shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }

  function squadFor(f, count, mult) {
    const animated = spritePool();
    const band = pool.length ? pool : animated;
    const center = Math.min(0.92, 0.18 + (f - 1) * 0.08);
    const lo = Math.max(0, Math.floor(band.length * (center - 0.12)));
    const hi = Math.min(band.length, Math.ceil(band.length * (center + 0.12)));
    const slice = band.slice(lo, Math.max(hi, lo + 6));
    const target = slice.reduce((a, c) => a + (Number(c.powerRank) || 0), 0) / Math.max(1, slice.length);
    const near = animated.slice().sort((a, b) => Math.abs(a.powerRank - target) - Math.abs(b.powerRank - target)).slice(0, 14);
    const seen = new Set();
    const picks = shuffle(near).filter(c => !seen.has(c.name) && seen.add(c.name)).slice(0, count);
    return picks.map(c => buildEnemy(c, mult * Math.min(1.2, Math.max(0.3, target / (Number(c.powerRank) || target)))));
  }

  function generateFloors() {
    const maps = shuffle(MAPS);
    const floors = [];
    let rares = 0;
    for (let f = 1; f <= FLOORS; f++) {
      const boss = BOSS_FLOORS[f];
      if (boss) {
        floors.push({ kind: 'boss', map: `assets/maps/${BOSS_MAPS[f]}.png`, waves: [[{ ...boss }]], coins: f === FLOORS ? 120 : 60 });
        continue;
      }
      const rare = f > 1 && rares < 2 && Math.random() < 0.2;
      if (rare) rares++;
      const mult = (0.55 + (f - 1) * 0.07) * (rare ? 0.85 : 1);
      const count = f <= 2 ? 3 : 4;
      const waves = [squadFor(f, count, mult)];
      if (f >= 7) waves.push(squadFor(f, 3, mult * 0.9));
      floors.push({ kind: rare ? 'rare' : 'normal', map: `assets/maps/${maps[f % maps.length]}.png`, waves, coins: (10 + f * 2) * (rare ? 3 : 1) });
    }
    return floors;
  }

  /* ===== Rewards ===== */

  function grant(reward) {
    if (!window.Resources) return;
    Object.entries(reward).forEach(([k, n]) => { if (n > 0) window.Resources.add(k, n); });
  }
  const rewardText = (reward) => Object.entries(reward).map(([k, n]) => `${Number(n).toLocaleString()} ${REWARD_NAMES[k] || k}`).join(' · ');

  function milestoneReward(m) {
    if (m.oncePerCycle && state.fullClearCycle === state.cycle) return m.repeat;
    return m.reward;
  }

  /** Pay a cleared floor: coins + ryo, plus any milestone. Returns the total. */
  function payFloor(f) {
    const fl = state.floors[f - 1] || {};
    const total = { granny_coin: fl.coins || 0, ryo: 1000 * f };
    const m = MILESTONES.find(x => x.floor === f);
    if (m && !state.paid.includes(f)) {
      const r = milestoneReward(m);
      Object.entries(r).forEach(([k, n]) => { total[k] = (total[k] || 0) + n; });
      state.paid.push(f);
      if (m.oncePerCycle) state.fullClearCycle = state.cycle;
    }
    grant(total);
    return total;
  }

  /* ===== Battle result ===== */

  function applyResult() {
    const p = state.pending;
    if (!p) return null;
    const res = readJSON(NR.RESULT_KEY, null);
    if (!res || res.id !== p.id) {
      // Floor left before it ended: nothing changes, the floor stays open.
      // Its mid-battle save can't be resumed without the launch, so drop it.
      state.pending = null;
      lsDel(NR.LAUNCH_KEY);
      const snap = readJSON('blazing_battle_resume_v1', null);
      if (snap && snap.isNinjaRoad) lsDel('blazing_battle_resume_v1');
      save();
      return null;
    }
    const q = state.squads[p.squad];
    Object.entries(res.units || {}).forEach(([uid, u]) => {
      if (q.members.some(m => m.uid === uid)) q.units[uid] = { hp: u.hp, chakra: u.chakra, jc: u.jc, uc: u.uc };
    });
    // Units that fell stay at 0 even if the battle lost track of them
    if (!res.victory) q.members.forEach(m => { q.units[m.uid] = { ...(q.units[m.uid] || {}), hp: 0 }; });

    let msg;
    if (res.victory) {
      const f = p.floor;
      if (state.seal && state.seal.floors > 0) {
        state.seal.floors--;
        if (state.seal.floors <= 0) state.seal = null;
      }
      if (state.floors[f - 1]?.kind === 'boss' && f < FLOORS) state.seal = { atk: SEAL.atk, floors: SEAL.floors };
      const paid = payFloor(f);
      state.floor = f + 1;
      if (f >= FLOORS) state.ended = 'cleared';
      msg = { title: f >= FLOORS ? 'Road cleared' : `Floor ${f} cleared`, sub: rewardText(paid) };
    } else {
      msg = { title: `Squad ${p.squad + 1} has fallen`, sub: `Floor ${p.floor}` };
    }
    if (state.squads.every(squadOut) && state.ended !== 'cleared') {
      state.ended = 'fallen';
      msg = { title: 'The road ends here', sub: `Reached floor ${state.floor}` };
    }
    // Next squad up: the chosen one if still standing, else the first that is
    if (squadOut(state.squads[state.sel])) {
      const next = state.squads.findIndex(x => !squadOut(x));
      if (next >= 0) state.sel = next;
    }
    state.pending = null;
    lsDel(NR.RESULT_KEY);
    lsDel(NR.LAUNCH_KEY);
    save();
    return msg;
  }

  /* ===== Launch ===== */

  function slotsFor(q) {
    const living = alive(q);
    const slots = {};
    living.slice(0, 4).forEach((m, i) => { slots[`front-${i + 1}`] = { uid: m.uid, charId: m.charId }; });
    living.slice(4, 8).forEach((m, i) => { slots[`back-${i + 1}`] = { uid: m.uid, charId: m.charId }; });
    if (q.commander) slots.commander = { uid: q.commander.uid, charId: q.commander.charId };
    return slots;
  }

  function enterFloor() {
    if (state.ended) { state = newRun(state); save(); render(); return; }
    const q = state.squads[state.sel];
    if (!q || squadOut(q)) return;
    if (!state.floors.length) state.floors = generateFloors();
    const f = state.floor;
    const fl = state.floors[f - 1];
    const carry = {};
    alive(q).forEach(m => { if (q.units[m.uid]) carry[m.uid] = q.units[m.uid]; });
    const launch = {
      id: `${state.runId}.${f}.${rid()}`,
      floor: f,
      map: fl.map,
      waves: fl.waves,
      slots: slotsFor(q),
      carry,
      atkBoost: state.seal ? state.seal.atk : 0
    };
    state.started = true;
    state.pending = { id: launch.id, floor: f, squad: state.sel };
    save();
    lsDel(NR.RESULT_KEY);
    lsSet(NR.LAUNCH_KEY, JSON.stringify(launch));
    lsSet(NR.FLAG_KEY, '1');
    window.location.href = 'battle.html';
  }

  /* ===== Render ===== */

  function renderRoad() {
    const nodes = [];
    for (let f = 1; f <= FLOORS; f++) {
      const fl = state.floors[f - 1];
      const kind = BOSS_FLOORS[f] ? 'boss' : (fl && fl.kind) || 'normal';
      const done = f < state.floor;
      const cur = f === state.floor && !state.ended;
      const label = kind === 'boss' ? 'Boss' : kind === 'rare' ? 'Rare' : '';
      const cls = ['nr-node', `is-${kind}`, done ? 'is-done' : '', cur ? 'is-current' : '', label ? 'has-tag' : ''].join(' ');
      nodes.push(`<li class="${cls}" aria-label="Floor ${f}${label ? ' ' + label : ''}${done ? ' cleared' : ''}">
        <span class="nr-node-mark">${done ? '<svg><use href="#i-check"/></svg>' : kind === 'boss' ? '<svg><use href="#i-skull"/></svg>' : f}</span>
        ${label ? `<span class="nr-node-tag">${label}</span>` : ''}
      </li>`);
    }
    $('nr-road').innerHTML = nodes.join('');
    const cur = $('nr-road').querySelector('.is-current');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function renderSquads() {
    const locked = state.started;
    $('nr-squads').innerHTML = state.squads.map((q, i) => {
      if (!q.team) {
        return `<button type="button" class="nr-squad is-empty" data-squad="${i}" ${locked ? 'disabled' : ''}>
          <span class="nr-squad-head"><span class="nr-kicker">Squad ${i + 1}</span></span>
          <span class="nr-squad-add">${locked ? '—' : '<svg><use href="#i-plus"/></svg>Assign team'}</span>
        </button>`;
      }
      const out = squadOut(q);
      const hp = Math.round(squadHP(q) * 100);
      const sel = i === state.sel && !out;
      const tiles = q.members.map(m => {
        const h = unitHP(q, m.uid);
        return `<span class="nr-unit ${h <= 0 ? 'is-down' : ''}" title="${esc(chars[m.charId]?.name || '')}">
          <img src="${esc(portraitOf(m.charId, m.uid))}" alt="" loading="lazy" onerror="this.src='${SILHOUETTE}'">
          <i class="nr-unit-hp"><b style="width:${Math.round(Math.max(0, h) * 100)}%"></b></i>
        </span>`;
      }).join('');
      return `<button type="button" class="nr-squad ${sel ? 'is-selected' : ''} ${out ? 'is-out' : ''}" data-squad="${i}" ${out && locked ? 'disabled' : ''}>
        <span class="nr-squad-head">
          <span class="nr-kicker">Squad ${i + 1}</span>
          <span class="nr-squad-team">Team ${q.team}</span>
          <span class="nr-squad-hp">${out ? 'Out' : hp + '%'}</span>
        </span>
        <span class="nr-units">${tiles}</span>
        <i class="nr-squad-bar"><b style="width:${hp}%"></b></i>
      </button>`;
    }).join('');
  }

  function renderFloor() {
    const el = $('nr-floor');
    if (state.ended) {
      el.innerHTML = `<span class="nr-kicker">${state.ended === 'cleared' ? 'Road cleared' : 'Road ended'}</span>
        <span class="nr-floor-name">${state.ended === 'cleared' ? 'All 10 floors' : `Floor ${state.floor}`}</span>`;
      return;
    }
    const f = state.floor;
    const fl = state.floors[f - 1];
    const kind = BOSS_FLOORS[f] ? 'boss' : fl ? fl.kind : 'normal';
    const foes = fl ? fl.waves.flat() : [];
    const faces = kind === 'boss'
      ? `<img class="is-boss" src="assets/sprites/bosses/${BOSS_FLOORS[f].giant}/thumb.webp" alt="" onerror="this.remove()">`
      : foes.slice(0, 5).map(e => `<img src="${esc(e.icon || SILHOUETTE)}" alt="" onerror="this.src='${SILHOUETTE}'">`).join('');
    const bossName = kind === 'boss' ? (BOSS_FLOORS[f].giant === 'nine_tails' ? 'Nine-Tailed Fox' : 'Perfect Susanoo') : '';
    const coins = fl ? fl.coins : (kind === 'boss' ? (f === FLOORS ? 120 : 60) : 10 + f * 2);
    el.innerHTML = `
      <span class="nr-floor-text">
        <span class="nr-kicker">Floor <b>${f}</b> / ${FLOORS}${kind !== 'normal' ? ` · <em class="is-${kind}">${kind === 'boss' ? 'Boss' : 'Rare'}</em>` : ''}</span>
        <span class="nr-floor-name">${kind === 'boss' ? esc(bossName) : fl ? (fl.waves.length > 1 ? `${fl.waves.length} waves` : 'Rival squad') : 'Unknown'}</span>
      </span>
      ${faces ? `<span class="nr-foes">${faces}</span>` : ''}
      <span class="nr-floor-loot"><i class="nr-coin" aria-hidden="true"></i>+${coins}</span>
      ${state.seal ? `<span class="nr-seal" title="Boss seal">ATK +${Math.round(state.seal.atk * 100)}% · ${state.seal.floors}</span>` : ''}`;
  }

  function renderCTA() {
    const btn = $('nr-start');
    const q = state.squads[state.sel];
    if (state.ended) {
      $('nr-start-label').innerHTML = '<i class="nr-diamond" aria-hidden="true"></i>New Run';
      $('nr-start-sub').textContent = '';
      $('nr-start-sub').hidden = true;
      btn.disabled = false;
      return;
    }
    $('nr-start-label').innerHTML = `<i class="nr-diamond" aria-hidden="true"></i>Enter Floor ${state.floor}`;
    const ok = q && !squadOut(q);
    $('nr-start-sub').textContent = ok ? `Squad ${state.sel + 1}` : 'Assign a team';
    $('nr-start-sub').hidden = false;
    btn.disabled = !ok || !pool.length;
  }

  function renderCoins() {
    const n = window.Resources ? window.Resources.get('granny_coin') : 0;
    $('nr-coins').textContent = Number(n).toLocaleString();
  }

  function render() {
    renderRoad();
    renderSquads();
    renderFloor();
    renderCTA();
    renderCoins();
  }

  /* ===== Sheets ===== */

  function closeSheet() { document.querySelector('.nr-sheet')?.remove(); }

  function sheet(title, body, extraClass) {
    closeSheet();
    const el = document.createElement('div');
    el.className = `nr-sheet ${extraClass || ''}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="nr-sheet-scrim"></div>
      <div class="nr-sheet-panel">
        <header class="nr-sheet-head">
          <h2 class="nr-sheet-title">${title}</h2>
          <button type="button" class="nr-icon-btn nr-sheet-close" aria-label="Close"><svg><use href="#i-close"/></svg></button>
        </header>
        <div class="nr-sheet-body">${body}</div>
      </div>`;
    el.querySelector('.nr-sheet-scrim').addEventListener('click', closeSheet);
    el.querySelector('.nr-sheet-close').addEventListener('click', closeSheet);
    document.body.appendChild(el);
    return el;
  }

  function openPicker(squadIdx) {
    const teams = savedTeams();
    const others = new Set();
    state.squads.forEach((q, i) => {
      if (i === squadIdx || !q.team) return;
      teamUids(q.team).forEach(u => others.add(u));
    });
    const inv = inventory();
    const cards = [];
    for (let n = 1; n <= 8; n++) {
      const uids = teamUids(n);
      const members = SLOT_ORDER.map(s => teams[n] && teams[n][s]).filter(e => e && e.uid && inv[e.uid]);
      const clash = uids.some(u => others.has(u));
      const current = state.squads[squadIdx].team === n;
      const reason = !members.length ? 'Empty' : clash ? 'In another squad' : '';
      const faces = members.slice(0, 8).map(e => `<img src="${esc(portraitOf(inv[e.uid].charId || e.charId, e.uid))}" alt="" onerror="this.src='${SILHOUETTE}'">`).join('');
      cards.push(`<button type="button" class="nr-pick ${current ? 'is-current' : ''}" data-team="${n}" ${reason ? 'disabled' : ''}>
        <span class="nr-pick-head"><span class="nr-kicker">Team <b>${n}</b></span>${reason ? `<span class="nr-pick-note">${reason}</span>` : current ? '<span class="nr-pick-note is-on">Current</span>' : `<span class="nr-pick-note">${members.length}</span>`}</span>
        <span class="nr-pick-faces">${faces}</span>
      </button>`);
    }
    const hasTeam = !!state.squads[squadIdx].team;
    const el = sheet(`Squad ${squadIdx + 1}`, `<div class="nr-picks">${cards.join('')}</div>
      <div class="nr-sheet-foot">
        <a class="nr-chip" href="teams.html"><span class="nr-chip-label">Edit Teams</span></a>
        ${hasTeam ? '<button type="button" class="nr-chip" id="nr-pick-clear"><span class="nr-chip-label">Remove</span></button>' : ''}
      </div>`, 'is-picker');
    el.querySelectorAll('.nr-pick').forEach(b => b.addEventListener('click', () => {
      const sq = freezeSquad(Number(b.dataset.team));
      if (!sq) return;
      state.squads[squadIdx] = sq;
      state.sel = squadIdx;
      save(); closeSheet(); render();
    }));
    el.querySelector('#nr-pick-clear')?.addEventListener('click', () => {
      state.squads[squadIdx] = blankSquad();
      if (state.sel === squadIdx) state.sel = Math.max(0, state.squads.findIndex(q => q.team));
      save(); closeSheet(); render();
    });
  }

  function openRewards() {
    const daysLeft = Math.max(1, Math.ceil((CYCLE_EPOCH + (state.cycle + 1) * CYCLE_MS - Date.now()) / 86400000));
    const rows = MILESTONES.map(m => {
      const got = state.paid.includes(m.floor);
      return `<li class="nr-ms ${got ? 'is-got' : ''}">
        <span class="nr-ms-floor">${esc(m.label)}</span>
        <span class="nr-ms-loot">${esc(rewardText(milestoneReward(m)))}</span>
        <span class="nr-ms-state">${got ? '<svg><use href="#i-check"/></svg>' : ''}</span>
      </li>`;
    }).join('');
    sheet('Rewards', `<ul class="nr-ms-list">${rows}</ul>
      <p class="nr-sheet-note"><span>Each floor: Granny Coins + Ryo</span><span>Resets in ${daysLeft}d</span></p>`, 'is-rewards');
  }

  function confirmReset() {
    const el = sheet('Reset the road?', `<div class="nr-confirm">
        <button type="button" class="nr-chip" id="nr-reset-no"><span class="nr-chip-label">Cancel</span></button>
        <button type="button" class="nr-chip is-danger" id="nr-reset-yes"><span class="nr-chip-label">Reset</span></button>
      </div>`, 'is-confirm');
    el.querySelector('#nr-reset-no').addEventListener('click', closeSheet);
    el.querySelector('#nr-reset-yes').addEventListener('click', () => {
      state = newRun(state);
      save(); closeSheet(); render();
    });
  }

  /* ===== Toast ===== */

  function toast(msg) {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = 'nr-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<i class="nr-diamond" aria-hidden="true"></i><span><b>${esc(msg.title)}</b>${msg.sub ? `<small>${esc(msg.sub)}</small>` : ''}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 400); }, 3200);
  }

  /* ===== Boot ===== */

  async function loadChars() {
    try {
      const r = await fetch('data/characters.json');
      const d = await r.json();
      const list = Array.isArray(d) ? d : Object.values(d);
      list.forEach(c => { if (c && c.id) chars[c.id] = c; });
      pool = list.filter(c => (Number(c.powerRank) || 0) > 0).sort((a, b) => a.powerRank - b.powerRank);
    } catch (e) {
      console.error('[NinjaRoad] characters failed to load', e);
    }
  }

  function wire() {
    $('nr-squads').addEventListener('click', (e) => {
      const b = e.target.closest('.nr-squad');
      if (!b || b.disabled) return;
      const i = Number(b.dataset.squad);
      const q = state.squads[i];
      if (!state.started) {
        if (!q.team || i === state.sel) { openPicker(i); return; }
      }
      if (q.team && !squadOut(q)) { state.sel = i; save(); render(); }
    });
    $('nr-start').addEventListener('click', enterFloor);
    $('nr-btn-rewards').addEventListener('click', openRewards);
    $('nr-btn-reset').addEventListener('click', confirmReset);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) { load(); toast(applyResult()); render(); } });
  }

  async function boot() {
    if (!NR) { console.error('[NinjaRoad] battle hook missing'); return; }
    load();
    const msg = applyResult();
    wire();
    render();
    await loadChars();
    // First visit: squad 1 defaults to team 1
    if (!state.started && !state.squads.some(q => q.team)) {
      const sq = freezeSquad(1);
      if (sq) { state.squads[0] = sq; state.sel = 0; }
    }
    if (!state.floors.length && pool.length) state.floors = generateFloors();
    save();
    render();
    toast(msg);
  }

  window.NinjaRoad = { get state() { return state; }, reset: () => { state = newRun(state); save(); render(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
