// js/kage-league.js — Kage League: weekly ranked seasons on the floors of the Kage Tower.
//
// Modelled on the original game's League / PvP screens (SceneLeague in the
// IPA: seasons, matching points, floors with promotion, ranking rewards,
// league potions). Offline, the other players are generated:
//
// * A season lasts SEASON_MS. Every floor is a bracket of BRACKET shinobi:
//   the player and generated rivals. Rivals earn League Points (LP) through
//   the season on a fixed curve seeded by season + floor, so the standings
//   move while you play and are the same on every reload.
// * Matches are arena battles (battle.html with arena_battle_mode) against a
//   rival from your bracket. A match costs a ticket (TICKET_MAX, one back
//   every TICKET_MS); League Potions refill the tickets.
// * Wins gain LP (more against higher-ranked rivals and on a streak), losses
//   cost a little. At season end the top PROMOTE move up a floor, the bottom
//   RELEGATE move down, and rewards are paid by floor and place.
//
// This file is the model only (no DOM), so battle.html can load it to apply
// a match result: js/kage-league-page.js draws kage-league.html.
(function () {
  'use strict';

  const STATE_KEY = 'blazing_kage_league_v1';
  const MATCH_KEY = 'kage_league_match';
  const DAY = 24 * 60 * 60 * 1000;
  const SEASON_MS = 7 * DAY;
  const EPOCH = Date.UTC(2026, 0, 5); // a Monday
  const BRACKET = 20;
  const PROMOTE = 3;
  const RELEGATE = 4;
  const TICKET_MAX = 5;
  const TICKET_MS = 2 * 60 * 60 * 1000;
  const START_POTIONS = 2;
  const HISTORY_MAX = 20;
  const LOG_MAX = 15;

  const FLOORS = [
    { n: 1, name: 'Genin Floor', stat: 0.9 },
    { n: 2, name: 'Chunin Floor', stat: 1.0 },
    { n: 3, name: 'Jonin Floor', stat: 1.12 },
    { n: 4, name: 'ANBU Floor', stat: 1.25 },
    { n: 5, name: 'Sannin Floor', stat: 1.42 },
    { n: 6, name: 'Kage Floor', stat: 1.6 },
  ];
  const TOP = FLOORS.length;

  const NAMES = ['Renga', 'Daichi', 'Suien', 'Arashi', 'Homura', 'Ibuki', 'Raiga', 'Shizuku', 'Kagari',
    'Setsuna', 'Sanshiro', 'Amane', 'Kohaku', 'Yorito', 'Tsubaki', 'Hayase', 'Genzo', 'Mikazuki', 'Orin',
    'Takumi', 'Kurenai', 'Fuu', 'Jinpachi', 'Mangetsu', 'Natsu', 'Reiko', 'Shiden', 'Toki', 'Yukimaru', 'Zaku',
    'Akane', 'Benika', 'Chiyo', 'Doto', 'Ebisu', 'Fuguki', 'Gari', 'Hokuto', 'Isaribi', 'Jugo'];
  const EPITHETS = ['of the Crimson Gale', 'the Silent Blade', 'of the Burning Sand', 'the Mist Phantom',
    'of the Iron Cliff', 'the Storm Caller', 'of the White Serpent', 'the Ember Fox', 'of the Broken Seal',
    'the Wandering Blade', 'of the Falling Leaves', 'the Thunder Fang', 'of the Moonlit Marsh', 'the Stone Fist',
    'of the Whispering Pines', 'the Black Lotus', 'of the Seventh Gate', 'the Ash Crow', 'of the Frozen Lake', 'the Paper Tiger'];

  const MAPS = ['bg_030101_kaido', 'bg_020101_mori', 'bg_040101_heigen', 'bg_050101_iwaba', 'bg_060101_kouya',
    'bg_440101_shinjitu', 'bg_450101_kukan', 'bg_520101_ninkaibuto', 'bg_530101_jigokudani', 'bg_590101_hondou'];

  /* ---------- helpers ---------- */
  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const floorOf = (n) => FLOORS[clamp(n | 0, 1, TOP) - 1];

  /* ---------- seasons ---------- */
  const seasonOf = (now = Date.now()) => Math.floor((now - EPOCH) / SEASON_MS) + 1;
  const seasonStart = (season) => EPOCH + (season - 1) * SEASON_MS;
  const seasonEnd = (season) => seasonStart(season) + SEASON_MS;
  /** Share of the season gone, 0..1. */
  const progressOf = (season, now = Date.now()) => clamp((now - seasonStart(season)) / SEASON_MS, 0, 1);

  /* ---------- state ---------- */
  function fresh(season) {
    return { v: 1, season, floor: 1, lp: 0, w: 0, l: 0, streak: 0, best: 0,
      tickets: TICKET_MAX, ticketAt: Date.now(), potions: START_POTIONS, team: 1, scout: 0,
      history: [], log: [], applied: [], report: null, titles: [] };
  }
  function load(now = Date.now()) {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 1) s = fresh(seasonOf(now));
    return s;
  }
  function save(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* storage full */ } }

  /** Tickets regenerate one per TICKET_MS up to TICKET_MAX. */
  function regen(s, now = Date.now()) {
    if (s.tickets >= TICKET_MAX) { s.ticketAt = now; return s; }
    const n = Math.floor((now - (s.ticketAt || now)) / TICKET_MS);
    if (n > 0) {
      s.tickets = Math.min(TICKET_MAX, s.tickets + n);
      s.ticketAt = s.tickets >= TICKET_MAX ? now : s.ticketAt + n * TICKET_MS;
    }
    return s;
  }
  /** ms until the next ticket, or 0 when full. */
  function nextTicketIn(s, now = Date.now()) {
    if (s.tickets >= TICKET_MAX) return 0;
    return Math.max(0, (s.ticketAt || now) + TICKET_MS - now);
  }

  /* ---------- rivals ---------- */
  /** The bracket's generated rivals for a season and floor (BRACKET - 1 of them). */
  function rivals(season, floor) {
    const r = rng(hash32(`kl|${season}|${floor}`));
    const names = new Set();
    const out = [];
    for (let i = 0; i < BRACKET - 1; i++) {
      let name, guard = 0;
      do { name = NAMES[Math.floor(r() * NAMES.length)]; } while (names.has(name) && guard++ < 50);
      names.add(name);
      const skill = r();                                   // 0..1, sets final LP and team strength
      const finalLp = Math.round(150 + Math.pow(skill, 1.25) * (1250 + 90 * floor) + r() * 120);
      const pace = 0.75 + r() * 0.5;                       // early or late grinder
      out.push({ id: `r${season}_${floor}_${i}`, name, epithet: EPITHETS[Math.floor(r() * EPITHETS.length)],
        skill, finalLp, pace, seed: hash32(`${season}|${floor}|${i}|team`) });
    }
    return out;
  }
  const rivalLp = (rv, progress) => Math.round(rv.finalLp * Math.pow(clamp(progress, 0, 1), rv.pace));

  /** Standings for the player's bracket: [{ id, name, lp, isPlayer, place }], best first. */
  function standings(s, progress = progressOf(s.season)) {
    const rows = rivals(s.season, s.floor).map(rv => ({ id: rv.id, name: rv.name, epithet: rv.epithet, lp: rivalLp(rv, progress), rival: rv }));
    rows.push({ id: 'me', name: 'You', lp: s.lp, isPlayer: true });
    // the player ranks ahead of a rival on equal LP
    rows.sort((a, b) => (b.lp - a.lp) || ((b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0)));
    rows.forEach((row, i) => { row.place = i + 1; });
    return rows;
  }
  const zoneOf = (place, floor) => (place <= PROMOTE && floor < TOP) ? 'promote'
    : (place > BRACKET - RELEGATE && floor > 1) ? 'relegate' : 'stay';

  /* ---------- rewards ---------- */
  function rewardFor(floor, place) {
    const f = clamp(floor, 1, TOP);
    if (place === 1) return { ninja_pearls: 5 + 5 * f, ryo: 20000 * f, potions: 3 };
    if (place <= PROMOTE) return { ninja_pearls: 3 + 3 * f, ryo: 15000 * f, potions: 2 };
    if (place <= 10) return { ninja_pearls: 2 * f, ryo: 10000 * f, potions: 1 };
    return { ninja_pearls: f, ryo: 5000 * f };
  }
  /** Reward rows for the rewards sheet: [{ label, places, reward }] for a floor. */
  function rewardTable(floor) {
    return [
      { label: '1st', reward: rewardFor(floor, 1) },
      { label: '2nd – 3rd', reward: rewardFor(floor, 2) },
      { label: '4th – 10th', reward: rewardFor(floor, 4) },
      { label: `11th – ${BRACKET}th`, reward: rewardFor(floor, 11) },
    ];
  }
  function grant(reward, s) {
    const R = window.Resources;
    Object.entries(reward || {}).forEach(([k, v]) => {
      if (!(v > 0)) return;
      if (k === 'potions') s.potions += v;
      else if (R && R.add) R.add(k, v);
    });
  }

  /**
   * Close every season that has ended: place, promote / relegate, pay
   * rewards. The last closed season the player fought in is left in
   * s.report for the page to show once.
   */
  function settle(s, now = Date.now()) {
    const cur = seasonOf(now);
    let changed = false;
    while (s.season < cur) {
      const played = (s.w + s.l) > 0;
      if (played) {
        const rows = standings(s, 1);
        const place = rows.find(r => r.isPlayer).place;
        const zone = zoneOf(place, s.floor);
        const reward = rewardFor(s.floor, place);
        grant(reward, s);
        const to = zone === 'promote' ? s.floor + 1 : zone === 'relegate' ? s.floor - 1 : s.floor;
        const entry = { season: s.season, floor: s.floor, place, lp: s.lp, w: s.w, l: s.l, move: zone, to, reward };
        if (s.floor === TOP && place === 1) {
          entry.title = `Kage of Season ${s.season}`;
          s.titles = [entry.title, ...(s.titles || [])].slice(0, 10);
        }
        s.history = [entry, ...(s.history || [])].slice(0, HISTORY_MAX);
        s.report = entry;
        s.floor = to;
      }
      s.season += 1;
      s.lp = 0; s.w = 0; s.l = 0; s.streak = 0; s.scout = 0; s.log = []; s.applied = [];
      changed = true;
    }
    return changed;
  }

  /** Load, settle finished seasons and regenerate tickets; saves if anything changed. */
  function state(now = Date.now()) {
    const s = load(now);
    const before = JSON.stringify(s);
    settle(s, now);
    regen(s, now);
    if (JSON.stringify(s) !== before) save(s);
    return s;
  }

  /* ---------- opponents ---------- */
  /** Units a rival fields: four sprite-backed cards near the floor's power band. */
  function rivalTeam(rv, floor, chars) {
    const SP = window.SpritePlayer;
    const pool = (chars || []).filter(c => (Number(c.powerRank) || 0) > 0 && c.statsMax && (!SP || !SP.has || SP.has(c.id)))
      .sort((a, b) => (a.powerRank || 0) - (b.powerRank || 0));
    if (!pool.length) return [];
    const r = rng(rv.seed);
    const centre = clamp(0.25 + (floor - 1) * 0.13 + rv.skill * 0.12, 0, 0.97);
    const lo = Math.floor(pool.length * clamp(centre - 0.12, 0, 1));
    const hi = Math.max(lo + 8, Math.ceil(pool.length * clamp(centre + 0.12, 0, 1)));
    const band = pool.slice(lo, Math.min(pool.length, hi));
    const seen = new Set();
    const picks = [];
    for (let guard = 0; picks.length < 4 && guard < 80; guard++) {
      const c = band[Math.floor(r() * band.length)] || pool[Math.floor(r() * pool.length)];
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      picks.push(c);
    }
    const mult = floorOf(floor).stat * (0.9 + rv.skill * 0.3);
    return picks.map(c => {
      const tierCode = c.starMaxCode || c.starMinCode || '6S';
      return {
        id: c.id, name: c.name, version: c.version || '', rarity: c.rarity || 6,
        icon: (c.artByTier && c.artByTier[tierCode] && c.artByTier[tierCode].portrait) || c.portrait || '',
        hp: Math.round((c.statsMax.hp || 5000) * mult),
        atk: Math.round((c.statsMax.atk || 800) * mult),
        spd: c.statsMax.speed || c.statsMax.spd || 100,
        skills: c.skills || {}, element: c.element || null,
      };
    });
  }
  const teamPower = (units) => units.reduce((n, u) => n + u.hp + u.atk * 5, 0);

  /** LP for beating / losing to a rival with `oppLp`, given the player's state. */
  function lpSwing(s, oppLp) {
    const diff = oppLp - s.lp;
    const win = clamp(40 + Math.round(diff / 25), 25, 70) + Math.min(s.streak, 4) * 5;
    const loss = clamp(15 - Math.round(diff / 40), 8, 25);
    return { win, loss };
  }

  /**
   * Three challengers from the bracket: one above the player, one close, one
   * below. Changes after every match and on rescout (s.scout).
   */
  function opponents(s, chars, now = Date.now()) {
    const rows = standings(s, progressOf(s.season, now));
    const me = rows.findIndex(r => r.isPlayer);
    const others = rows.filter(r => !r.isPlayer);
    const r = rng(hash32(`${s.season}|${s.floor}|${s.w + s.l}|${s.scout}`));
    const pickIn = (from, to) => {
      const span = others.filter(o => o.place >= from && o.place <= to && !chosen.has(o.id));
      return span.length ? span[Math.floor(r() * span.length)] : null;
    };
    const chosen = new Set();
    const out = [];
    const myPlace = me + 1;
    for (const [from, to] of [[myPlace - 6, myPlace - 1], [myPlace - 2, myPlace + 2], [myPlace + 1, myPlace + 7]]) {
      const o = pickIn(Math.max(1, from), Math.min(BRACKET, to)) || others.find(x => !chosen.has(x.id));
      if (!o) continue;
      chosen.add(o.id);
      out.push(o);
    }
    return out.map(o => {
      const units = rivalTeam(o.rival, s.floor, chars);
      return { id: o.id, name: o.name, epithet: o.epithet, lp: o.lp, place: o.place, units,
        power: teamPower(units), swing: lpSwing(s, o.lp) };
    }).sort((a, b) => a.place - b.place);
  }

  /* ---------- matches ---------- */
  function teamSlots(teamNum) {
    try {
      const t = JSON.parse(localStorage.getItem('blazing_teams_v1') || '{}');
      return t[teamNum] || t[String(teamNum)] || {};
    } catch (e) { return {}; }
  }
  const hasUnits = (slots) => Object.values(slots || {}).some(x => x && x.uid);

  /**
   * Spend a ticket and hand the match to battle.html (arena battle mode).
   * Returns { ok, reason }.
   */
  function launch(s, opp, { now = Date.now() } = {}) {
    regen(s, now);
    if (s.tickets <= 0) return { ok: false, reason: 'tickets' };
    const slots = teamSlots(s.team);
    if (!hasUnits(slots)) return { ok: false, reason: 'team' };
    if (!opp || !opp.units || !opp.units.length) return { ok: false, reason: 'opponent' };
    if (s.tickets >= TICKET_MAX) s.ticketAt = now;
    s.tickets -= 1;
    const launchId = `${s.season}-${now.toString(36)}`;
    const map = `assets/maps/${MAPS[hash32(launchId) % MAPS.length]}.png`;
    const match = { launchId, season: s.season, floor: s.floor, team: s.team, slots,
      opponent: { id: opp.id, name: opp.name, epithet: opp.epithet, lp: opp.lp, place: opp.place } };
    save(s);
    localStorage.setItem(MATCH_KEY, JSON.stringify(match));
    localStorage.setItem('arena_battle_mode', '1');
    localStorage.setItem('arena_enemies', JSON.stringify(opp.units));
    localStorage.setItem('arena_map', map);
    localStorage.removeItem('arena_opponent');
    return { ok: true, match };
  }

  /** The match battle.html is fighting, or null (not consumed: a resume reads it again). */
  function activeMatch() {
    try { return JSON.parse(localStorage.getItem(MATCH_KEY) || 'null'); } catch (e) { return null; }
  }

  /**
   * Apply a match result once (by launchId). A result from a season that has
   * since ended is dropped (its standings are already settled).
   * Returns { lpGained, lpAfter, placeBefore, placeAfter, opponent, streak }.
   */
  function applyResult(match, isVictory, now = Date.now()) {
    localStorage.removeItem(MATCH_KEY);
    if (!match) return null;
    const s = load(now);
    settle(s, now);
    const before = standings(s, progressOf(s.season, now)).find(r => r.isPlayer).place;
    const out = { opponent: match.opponent && match.opponent.name, lpGained: 0, lpAfter: s.lp,
      placeBefore: before, placeAfter: before, streak: s.streak, floor: s.floor, stale: false };
    if (match.season !== s.season || (s.applied || []).includes(match.launchId)) {
      out.stale = match.season !== s.season;
      save(s);
      return out;
    }
    const swing = lpSwing(s, (match.opponent && match.opponent.lp) || s.lp);
    let gained;
    if (isVictory) {
      s.w += 1; s.streak += 1; s.best = Math.max(s.best, s.streak);
      gained = swing.win;
    } else {
      s.l += 1; s.streak = 0;
      gained = -Math.min(s.lp, swing.loss);
    }
    s.lp += gained;
    s.applied = [...(s.applied || []), match.launchId].slice(-30);
    s.log = [{ at: now, win: !!isVictory, opponent: match.opponent ? match.opponent.name : '?', lp: gained }, ...(s.log || [])].slice(0, LOG_MAX);
    save(s);
    out.lpGained = gained;
    out.lpAfter = s.lp;
    out.streak = s.streak;
    out.placeAfter = standings(s, progressOf(s.season, now)).find(r => r.isPlayer).place;
    return out;
  }

  /** Spend a League Potion to refill the tickets. */
  function usePotion(s, now = Date.now()) {
    regen(s, now);
    if (s.potions <= 0) return { ok: false, reason: 'none' };
    if (s.tickets >= TICKET_MAX) return { ok: false, reason: 'full' };
    s.potions -= 1;
    s.tickets = TICKET_MAX;
    s.ticketAt = now;
    save(s);
    return { ok: true };
  }

  function setTeam(s, n) { s.team = clamp(n | 0, 1, 8); save(s); }
  function rescout(s) { s.scout = (s.scout || 0) + 1; save(s); }
  function clearReport(s) { s.report = null; save(s); }

  window.KageLeague = {
    STATE_KEY, MATCH_KEY, SEASON_MS, BRACKET, PROMOTE, RELEGATE, TICKET_MAX, TICKET_MS, FLOORS, TOP,
    seasonOf, seasonStart, seasonEnd, progressOf, floorOf, zoneOf,
    load, save, state, settle, regen, nextTicketIn,
    rivals, rivalLp, standings, opponents, rivalTeam, lpSwing,
    rewardFor, rewardTable, launch, activeMatch, applyResult, usePotion, setTeam, rescout, clearReport,
    teamSlots, hasUnits, _hash32: hash32,
  };
})();
