/* portal-sdk.js — Portal protocol v1
 * ---------------------------------------------------------------------------
 * The one file every game includes to talk to the Portal hub
 * (github.com/Pomu1144/portal-container). Copy it into a game as-is; the hub
 * repo holds the canonical version.
 *
 * Model: the hub owns the character vault. When the player enters a game they
 * pick a PARTY of up to 5 characters; the game receives copies of those cards
 * and may report progress for them (level / rarity only ever go up) or grant
 * new characters into the vault. Characters are copied, never moved.
 *
 *   const portal = await PortalSDK.connect({ gameId: 'jjk-net0' });
 *   if (portal) {                       // null when not running inside the hub
 *     portal.player                     // { name }
 *     portal.party                      // { id, max, cards: [card, …] } (0–5 cards)
 *     await portal.update(cardId, { level: 42 });
 *     await portal.grant(card);         // add a character to the vault
 *     portal.exit();                    // ask the hub to close the game
 *   }
 *
 * Without the hub, characters can still travel as a Portal Code — a text
 * string holding up to 5 cards:
 *   PortalSDK.encodeCode(cards) → 'PRTL1.…'      PortalSDK.decodeCode(str) → cards
 *
 * Wire format (window.postMessage, every message has ns:'portal', v:1):
 *   game → hub  { type:'hello', gameId }
 *   hub  → game { type:'welcome', player, party }
 *   game → hub  { type:'update', reqId, partyId, cardId, patch }
 *   game → hub  { type:'grant',  reqId, card }
 *   hub  → game { type:'ack', reqId, ok, error? }
 *   game → hub  { type:'exit' }
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  const NS = 'portal';
  const VERSION = 1;
  const MAX_PARTY = 5;
  const CODE_PREFIX = 'PRTL1.';

  // Same five elements as NXBNVNB. Body > Skill > Heart > Body;
  // Bravery and Wisdom are strong against each other.
  const ELEMENTS = ['Body', 'Skill', 'Heart', 'Bravery', 'Wisdom'];

  // Raw stats are normalised to 0–1 against these caps so every game can map
  // a card onto its own stat scale.
  const STAT_CAPS = { hp: 75000, atk: 10000, speed: 550 };

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  function normalizeStats(raw) {
    const out = {};
    for (const k of Object.keys(STAT_CAPS)) {
      out[k] = Math.round(clamp((Number(raw && raw[k]) || 0) / STAT_CAPS[k], 0, 1) * 1000) / 1000;
    }
    return out;
  }

  function denormalizeStats(norm) {
    const out = {};
    for (const k of Object.keys(STAT_CAPS)) out[k] = Math.round(clamp(Number(norm && norm[k]) || 0, 0, 1) * STAT_CAPS[k]);
    return out;
  }

  // Art paths are made absolute so a card's images load from any game.
  function absUrl(path, base) {
    if (!path) return '';
    try {
      const u = new URL(path, base || global.location.href);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
    } catch (_) { return ''; }
  }

  /** Validate and normalise a card. Returns a clean copy or throws. */
  function validateCard(card) {
    if (!card || typeof card !== 'object') throw new Error('card must be an object');
    const sourceGame = str(card.sourceGame, 40).toLowerCase();
    const baseId = str(card.baseId, 80);
    if (!/^[a-z0-9-]+$/.test(sourceGame)) throw new Error('bad sourceGame');
    if (!/^[A-Za-z0-9_.-]+$/.test(baseId)) throw new Error('bad baseId');
    const name = str(card.name, 60);
    if (!name) throw new Error('card needs a name');
    const element = ELEMENTS.includes(card.element) ? card.element : 'Body';
    const rarity = clamp(Math.round(Number(card.rarity) || 1), 1, 7);
    const maxLevel = clamp(Math.round(Number(card.maxLevel) || 100), 1, 999);
    const level = clamp(Math.round(Number(card.level) || 1), 1, maxLevel);
    const stats = {};
    for (const k of Object.keys(STAT_CAPS)) stats[k] = clamp(Number(card.stats && card.stats[k]) || 0, 0, 1);
    return {
      schema: VERSION,
      id: sourceGame + ':' + baseId,
      sourceGame,
      baseId,
      name,
      title: str(card.title, 60),
      franchise: str(card.franchise, 30).toLowerCase(),
      element,
      rarity,
      level,
      maxLevel,
      stats,
      art: { portrait: absUrl(card.art && card.art.portrait), full: absUrl(card.art && card.art.full) },
    };
  }

  /* ---------- Portal Codes (manual transfer, no hub needed) ---------- */

  function b64encode(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64decode(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  function encodeCode(cards) {
    const list = (cards || []).slice(0, MAX_PARTY).map(validateCard);
    return CODE_PREFIX + b64encode(JSON.stringify(list));
  }

  function decodeCode(code) {
    const s = String(code || '').trim();
    if (!s.startsWith(CODE_PREFIX)) throw new Error('Not a Portal Code');
    let list;
    try { list = JSON.parse(b64decode(s.slice(CODE_PREFIX.length))); } catch (_) { throw new Error('Portal Code is damaged'); }
    if (!Array.isArray(list)) throw new Error('Portal Code is damaged');
    if (list.length > MAX_PARTY) throw new Error('A Portal Code holds at most ' + MAX_PARTY + ' characters');
    return list.map(validateCard);
  }

  /* ---------- Hub connection ---------- */

  /**
   * Connect to the hub. Resolves to a session, or null when the page is not
   * embedded in a trusted hub (standalone play).
   *   gameId        this game's id in the hub's games.json
   *   hubOrigins    origins allowed to act as the hub (default: this page's own origin)
   *   timeoutMs     how long to wait for the hub's welcome
   */
  function connect(opts) {
    const o = opts || {};
    const gameId = str(o.gameId, 40);
    const hubOrigins = Array.isArray(o.hubOrigins) && o.hubOrigins.length ? o.hubOrigins : [global.location.origin];
    const timeoutMs = Number(o.timeoutMs) || 1500;

    if (connect._p) return connect._p;
    if (global.parent === global) return (connect._p = Promise.resolve(null));

    connect._p = new Promise((resolve) => {
      let session = null;
      let reqSeq = 0;
      const pending = new Map();

      const send = (msg, origin) => global.parent.postMessage(Object.assign({ ns: NS, v: VERSION }, msg), origin);

      function request(msg) {
        if (!session) return Promise.reject(new Error('Not connected to the Portal'));
        const reqId = ++reqSeq;
        return new Promise((res, rej) => {
          pending.set(reqId, { res, rej });
          send(Object.assign({ reqId }, msg), session.hubOrigin);
          setTimeout(() => {
            if (pending.has(reqId)) { pending.delete(reqId); rej(new Error('Portal did not answer')); }
          }, 5000);
        });
      }

      global.addEventListener('message', (e) => {
        if (e.source !== global.parent || !hubOrigins.includes(e.origin)) return;
        const m = e.data;
        if (!m || m.ns !== NS || m.v !== VERSION) return;

        if (m.type === 'welcome' && !session) {
          let cards = [];
          try { cards = (m.party && Array.isArray(m.party.cards) ? m.party.cards : []).slice(0, MAX_PARTY).map(validateCard); } catch (_) { cards = []; }
          const party = { id: str(m.party && m.party.id, 64), max: MAX_PARTY, cards };
          session = {
            hubOrigin: e.origin,
            player: { name: str(m.player && m.player.name, 40) || 'Player' },
            party,
            update: (cardId, patch) => {
              if (!party.cards.some((c) => c.id === cardId)) return Promise.reject(new Error('Card is not in this party'));
              const p = {};
              if (patch && patch.level != null) p.level = Math.round(Number(patch.level) || 0);
              if (patch && patch.rarity != null) p.rarity = Math.round(Number(patch.rarity) || 0);
              return request({ type: 'update', partyId: party.id, cardId, patch: p });
            },
            grant: (card) => request({ type: 'grant', card: validateCard(card) }),
            exit: () => send({ type: 'exit' }, session.hubOrigin),
          };
          resolve(session);
        } else if (m.type === 'ack' && pending.has(m.reqId)) {
          const p = pending.get(m.reqId);
          pending.delete(m.reqId);
          m.ok ? p.res(true) : p.rej(new Error(str(m.error, 200) || 'Portal refused'));
        }
      });

      for (const origin of hubOrigins) send({ type: 'hello', gameId }, origin);
      setTimeout(() => { if (!session) resolve(null); }, timeoutMs);
    });
    return connect._p;
  }

  global.PortalSDK = {
    VERSION, MAX_PARTY, ELEMENTS, STAT_CAPS, NS,
    connect, validateCard, encodeCode, decodeCode,
    normalizeStats, denormalizeStats, absUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
