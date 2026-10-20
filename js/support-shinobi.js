// js/support-shinobi.js — Support shinobi: borrow another ninja's unit for a mission.
//
// The original game filled the fourth slot of a mission team with a unit
// borrowed from a friend or a random player. The game is offline, so the
// players are generated: each mission rank gets a daily roster of shinobi,
// each bringing one unit sized to that rank (5★ for D/C up to maxed 7★ for
// SS). Shinobi you borrowed from can be added as friends (FRIEND_CAP); friends
// head the roster every day with the unit they had when you added them.
//
// Flow: the prebattle screen (teams.html?mode=prebattle) shows the roster
// (openPicker) and stores the pick; battle-core reads it with current() and
// fields the unit in front-4 for that battle only (it never enters the
// inventory, earns no EXP and isn't saved to the team). The battle result
// clears the pick (finish) and offers a friend request for a non-friend.
//
//   SupportShinobi.roster(missionId, rank, chars)  -> [shinobi]
//   SupportShinobi.pick(missionId, rank, shinobi | null)
//   SupportShinobi.current(missionId, rank)        -> shinobi | null
//   SupportShinobi.finish() / friends() / addFriend(s) / removeFriend(id)
(function () {
  'use strict';

  const PICK_KEY = 'blazing_support_pick_v1';
  const FRIENDS_KEY = 'blazing_friends_v1';
  const FRIEND_CAP = 30;
  const ROSTER_SIZE = 6;
  const FRIENDS_SHOWN = 3;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Unit sizing per mission rank: which cards, at which tier, at what share
  // of that tier's level cap.
  const RANK_UNITS = {
    D:  { pools: ['5'], tier: '5S', level: [0.5, 0.8] },
    C:  { pools: ['5'], tier: '5S', level: [0.7, 1] },
    B:  { pools: ['5', '6'], tier: '6S', level: [0.6, 0.85] },
    A:  { pools: ['6'], tier: '6S', level: [0.85, 1] },
    S:  { pools: ['6', '6B'], tier: '6S', level: [1, 1] },
    SS: { pools: ['6B', '7'], tier: '7S', level: [1, 1] },
  };

  const NAMES = [
    'Kurogane', 'Hayate_09', 'MistWalker', 'Akatsuki_Ren', 'LeafShade', 'Tsubaki',
    'SandCoffin', 'Raijin77', 'Kazekiri', 'Hoshikage', 'Shinra', 'Yugao_Fan',
    'NineTailsNoah', 'Mokuton', 'Senju_Kai', 'Uzu_Mira', 'Kirigakure', 'Byakko',
    'Inkfang', 'Shuriken_Sue', 'Tobirama_X', 'Kumo_Raiga', 'Sakon', 'Hyuga_Rei',
    'PaperBomb', 'Amaterasu88', 'Dango', 'Rasen_Ko', 'Kitsune', 'Sabaku_Jun',
    'Tenten_Main', 'Kunai_Kid', 'Sage_Mode', 'Konoha_Hoshi', 'Ramen_Run', 'Shikotsu',
    'Moonlit', 'Iwagakure', 'Chidori_99', 'Kamui', 'Gale', 'Byakugou',
  ];

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function json(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ } }

  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const dayIndex = (now = Date.now()) => Math.floor(now / DAY_MS);

  function levelCap(tier) {
    const P = window.Progression;
    return (P && P.levelCapForCode && P.levelCapForCode(tier)) || 100;
  }

  const TIER_ORDER = ['1S', '2S', '3S', '4S', '5S', '6S', '6SB', '7S', '7SL', '8S'];
  const tierIdx = (t) => TIER_ORDER.indexOf(t);
  /** Clamp a tier into the card's own min..max tiers. */
  function tierFor(c, want) {
    const lo = tierIdx(c.starMinCode), hi = tierIdx(c.starMaxCode || c.starMinCode);
    const w = tierIdx(want);
    if (lo < 0 || w < 0) return c.starMinCode || want;
    return TIER_ORDER[Math.min(Math.max(w, lo), hi < 0 ? lo : hi)];
  }

  /** Cards a guest can bring, by pool: '5' 5★ cards, '6' 6★, '6B' Blazing 6★, '7' 7★. */
  function pools(chars) {
    const SP = window.SpritePlayer;
    const ok = (c) => !SP || !SP.has || SP.has(c.id); // only units with battle sprites
    const out = { '5': [], '6': [], '6B': [], '7': [] };
    for (const c of chars || []) {
      if (!c || !c.id || !ok(c)) continue;
      const r = Number(c.rarity), max = c.starMaxCode || c.starMinCode;
      if (r === 5) out['5'].push(c);
      else if (r === 6 && max === '6SB') out['6B'].push(c);
      else if (r === 6) out['6'].push(c);
      else if (r >= 7 || max === '7S') out['7'].push(c);
    }
    return out;
  }

  function makeUnit(c, rank, r) {
    const spec = RANK_UNITS[rank] || RANK_UNITS.C;
    let want = spec.tier;
    if (rank === 'S' && (c.starMaxCode === '6SB')) want = '6SB';
    if (rank === 'SS' && Number(c.rarity) < 7) want = '6SB';
    const tier = tierFor(c, want);
    const cap = levelCap(tier);
    const [lo, hi] = spec.level;
    const level = Math.max(1, Math.round(cap * (lo + (hi - lo) * r())));
    return { charId: c.id, name: c.name || c.id, version: c.version || '', tierCode: tier, level, cap,
      element: c.element || '', portrait: (c.artByTier && c.artByTier[tier] && c.artByTier[tier].portrait) || c.portrait || '' };
  }

  function friends() { return json(FRIENDS_KEY, []).filter(f => f && f.id && f.unit); }

  /** The day's support roster for a mission rank: friends first, then strangers. */
  function roster(missionId, rank, chars) {
    const day = dayIndex();
    const r = rng(hash32(`${day}|${missionId}|${rank}`));
    const byPool = pools(chars);
    const spec = RANK_UNITS[rank] || RANK_UNITS.C;
    const cards = spec.pools.flatMap(p => byPool[p] || []);
    const out = [];
    // Friends: a different few each day, with the unit they were added with
    const fr = friends().map(f => ({ f, k: rng(hash32(`${day}|${f.id}`))() })).sort((a, b) => a.k - b.k).slice(0, FRIENDS_SHOWN);
    fr.forEach(({ f }) => out.push({ ...f, isFriend: true }));
    const taken = new Set(out.map(s => s.name));
    const friendIds = new Set(friends().map(f => f.id));
    const usedCards = new Set(out.map(s => s.unit.charId));
    let guard = 0;
    while (out.length < ROSTER_SIZE && cards.length && guard++ < 200) {
      const c = cards[Math.floor(r() * cards.length)];
      const name = NAMES[Math.floor(r() * NAMES.length)];
      if (taken.has(name) || (usedCards.has(c.id) && usedCards.size < cards.length)) continue;
      taken.add(name);
      usedCards.add(c.id);
      const id = `sh_${hash32(name).toString(36)}`;
      if (friendIds.has(id)) continue; // a friend already listed or resting today
      const rankNo = Math.round(20 + r() * 60 + (['S', 'SS'].includes(rank) ? 120 : rank === 'A' ? 60 : 0));
      out.push({ id, name, playerRank: rankNo, unit: makeUnit(c, rank, r), isFriend: false });
    }
    return out;
  }

  function pick(missionId, rank, shinobi) {
    if (!shinobi) { localStorage.removeItem(PICK_KEY); return null; }
    const rec = { missionId: String(missionId), rank, at: Date.now(), shinobi };
    save(PICK_KEY, rec);
    return rec;
  }
  function stored() { return json(PICK_KEY, null); }

  /** The support picked for this mission rank, with a battle uid, or null. */
  function current(missionId, rank) {
    const p = stored();
    if (!p || !p.shinobi || !p.shinobi.unit) return null;
    if (String(p.missionId) !== String(missionId) || p.rank !== rank) return null;
    const s = p.shinobi;
    return { ...s, uid: `guest:${s.id}`, isFriend: friends().some(f => f.id === s.id) };
  }

  /** Battle over: the pick is spent; returns it for the result screen. */
  function finish() {
    const p = stored();
    localStorage.removeItem(PICK_KEY);
    return p && p.shinobi ? { ...p.shinobi, isFriend: friends().some(f => f.id === p.shinobi.id) } : null;
  }

  function addFriend(s) {
    if (!s || !s.id || !s.unit) return { ok: false, reason: 'invalid' };
    const list = friends();
    if (list.some(f => f.id === s.id)) return { ok: false, reason: 'already' };
    if (list.length >= FRIEND_CAP) return { ok: false, reason: 'full' };
    list.push({ id: s.id, name: s.name, playerRank: s.playerRank, unit: s.unit, since: Date.now() });
    save(FRIENDS_KEY, list);
    return { ok: true };
  }
  function removeFriend(id) {
    save(FRIENDS_KEY, friends().filter(f => f.id !== id));
  }

  /* ------------------------------------------------------------------
   * Picker (prebattle screen): a sheet listing the roster.
   * ------------------------------------------------------------------ */
  const ELEMENT_COLOR = { body: '#e05a3a', skill: '#3fae5a', bravery: '#e0b23a', wisdom: '#3a8fe0', heart: '#c25ae0' };
  const stars = (tier) => ({ '5S': 5, '6S': 6, '6SB': 6, '7S': 7 }[tier] || '');

  function injectCSS() {
    if (document.getElementById('support-shinobi-css')) return;
    const st = document.createElement('style');
    st.id = 'support-shinobi-css';
    st.textContent = `
      .ss-btn{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:4px 12px 4px 4px;border-radius:8px;
        border:1px solid rgba(255,215,120,.35);background:rgba(30,26,18,.9);color:#f1e3bf;font-family:inherit;font-weight:600;font-size:13px;line-height:1.2;cursor:pointer;text-align:left}
      .ss-btn img{width:32px;height:32px;border-radius:6px;object-fit:cover;background:#111}
      .ss-btn .ss-none{width:32px;height:32px;border-radius:6px;display:grid;place-items:center;border:1px dashed rgba(255,215,120,.4);color:#d9b362;font-size:18px}
      .ss-btn small{display:block;color:#b9a77d;font-weight:500;font-size:11px}
      .ss-sheet{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px}
      .ss-scrim{position:absolute;inset:0;background:rgba(0,0,0,.66)}
      .ss-panel{position:relative;width:min(560px,100%);max-height:min(86vh,640px);display:flex;flex-direction:column;
        background:#16130e;border:1px solid rgba(255,215,120,.3);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.6);color:#efe4c8}
      .ss-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:14px 16px 8px;border-bottom:1px solid rgba(255,215,120,.15)}
      .ss-head h2{margin:0;font-size:17px;color:#f3d48a}
      .ss-head span{font-size:12px;color:#b9a77d}
      .ss-list{overflow:auto;padding:8px;display:grid;gap:6px}
      .ss-row{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;padding:8px;border-radius:9px;
        background:rgba(255,255,255,.035);border:1px solid transparent;cursor:pointer;text-align:left;color:inherit;font:inherit}
      .ss-info > span{display:block}
      .ss-row:hover,.ss-row:focus-visible{border-color:rgba(255,215,120,.45);outline:none}
      .ss-row.is-picked{border-color:#f3d48a;background:rgba(243,212,138,.1)}
      .ss-row img{width:52px;height:52px;border-radius:8px;object-fit:cover;background:#111;border:2px solid var(--el,#555)}
      .ss-who{font-size:12px;color:#b9a77d}
      .ss-who b{color:#efe4c8}
      .ss-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:99px;font-size:10px;font-weight:700;background:#3a6e3a;color:#dff5d8;vertical-align:1px}
      .ss-unit{font-weight:700;font-size:14px;margin:1px 0}
      .ss-meta{font-size:12px;color:#d9b362;text-align:right;white-space:nowrap}
      .ss-foot{display:flex;justify-content:space-between;gap:8px;padding:10px 16px 14px;border-top:1px solid rgba(255,215,120,.15);font-size:12px;color:#b9a77d;align-items:center}
      .ss-foot button{min-height:36px;padding:0 14px;border-radius:8px;border:1px solid rgba(255,215,120,.35);background:transparent;color:#f1e3bf;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer}
      @media (max-width:480px){.ss-row{grid-template-columns:44px 1fr}.ss-row img{width:44px;height:44px}.ss-meta{grid-column:2;text-align:left}}
    `;
    document.head.appendChild(st);
  }

  function rowHTML(s, picked) {
    const u = s.unit;
    return `<button type="button" class="ss-row ${picked ? 'is-picked' : ''}" data-id="${esc(s.id)}" style="--el:${ELEMENT_COLOR[String(u.element).toLowerCase()] || '#555'}">
      <img src="${esc(u.portrait)}" alt="" onerror="this.style.visibility='hidden'">
      <span class="ss-info"><span class="ss-who"><b>${esc(s.name)}</b> · Rank ${esc(s.playerRank)}${s.isFriend ? '<span class="ss-tag">Friend</span>' : ''}</span>
        <span class="ss-unit">${esc(u.name)}</span>
        <span class="ss-who">${esc(u.version)}</span></span>
      <span class="ss-meta">${stars(u.tierCode)}★ ${esc(u.tierCode === '6SB' ? 'Blazing' : '')}<br>Lv ${esc(u.level)} / ${esc(u.cap)}</span>
    </button>`;
  }

  /**
   * Open the roster for a mission rank. onChange(shinobi|null) runs after a pick.
   */
  function openPicker({ missionId, rank, chars, onChange }) {
    injectCSS();
    const list = roster(missionId, rank, chars);
    const cur = current(missionId, rank);
    const el = document.createElement('div');
    el.className = 'ss-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'ss-title');
    el.innerHTML = `<div class="ss-scrim"></div><div class="ss-panel">
      <div class="ss-head"><h2 id="ss-title">Choose a Support</h2><span>Takes your 4th front slot this mission · Rank ${esc(rank)}</span></div>
      <div class="ss-list">${list.map(s => rowHTML(s, cur && cur.id === s.id)).join('') || '<p class="ss-who">No shinobi available.</p>'}</div>
      <div class="ss-foot"><span>Friends ${friends().length} / ${FRIEND_CAP}</span>
        <span><button type="button" data-none>No support</button> <button type="button" data-close>Close</button></span></div></div>`;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.querySelector('.ss-scrim').addEventListener('click', close);
    el.querySelector('[data-close]').addEventListener('click', close);
    el.querySelector('[data-none]').addEventListener('click', () => { pick(missionId, rank, null); close(); onChange && onChange(null); });
    el.querySelectorAll('.ss-row').forEach(b => b.addEventListener('click', () => {
      const s = list.find(x => x.id === b.dataset.id);
      pick(missionId, rank, s);
      close();
      onChange && onChange(s);
    }));
    document.body.appendChild(el);
    (el.querySelector('.ss-row.is-picked') || el.querySelector('.ss-row') || el.querySelector('[data-close]')).focus();
    return el;
  }

  /** Button contents for the current pick. */
  function buttonHTML(s) {
    if (!s) return '<span class="ss-none">+</span><span>Support<small>None — tap to choose</small></span>';
    return `<img src="${esc(s.unit.portrait)}" alt=""><span>${esc(s.unit.name)}<small>${esc(s.name)} · Lv ${esc(s.unit.level)}</small></span>`;
  }

  window.SupportShinobi = {
    FRIEND_CAP, RANK_UNITS, roster, pick, current, finish, friends, addFriend, removeFriend,
    openPicker, buttonHTML, injectCSS, _hash32: hash32, _dayIndex: dayIndex,
  };
})();
