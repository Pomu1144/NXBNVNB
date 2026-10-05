/* js/portal-port.js
 * ---------------------------------------------------------------------------
 * NXBNVNB's connection to the Portal hub (github.com/Pomu1144/portal-container).
 * Protocol and card format: js/portal-sdk.js (copied from the hub).
 *
 *   PortalPort.session              Promise<session|null> (null outside the hub)
 *   PortalPort.cardFor(inst)        portable card for an inventory instance
 *   PortalPort.importCards(cards)   copy up to 5 cards into the roster
 *   PortalPort.syncParty()          report level-ups of party cards to the hub
 *   PortalPort.deposit(cur, n)      move Ryo / Ninja Pearls into the Portal wallet
 *   PortalPort.withdraw(cur, n)     move them from the Portal wallet into this game
 *
 * Currency: 'coins' = Ryo and 'premium' = Ninja Pearls (js/resources.js).
 * The hub holds them as this game's currencies; its Exchange converts them
 * into other games' currencies. Money only moves while connected to the hub. Each transfer is saved as
 * pending under blazing_portal_tx_v1 before it is sent and retried with the
 * same txId if the hub's answer is lost, so it is applied exactly once.
 *
 * Importing is a copy. A card from this game adds the unit (or raises its
 * level). A card from another game becomes a guest unit: a full character
 * definition built from a template unit of the same element and rarity, with
 * the card's name, art and stats. Guests live in blazing_portal_guests_v1 and
 * reach every page through js/portal-guests.js.
 *
 * Load after js/portal-sdk.js and js/character_inv.js (when present).
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  const SDK = window.PortalSDK;
  if (!SDK) return;

  const GAME_ID = 'nxbnvnb';
  const GUESTS_KEY = 'blazing_portal_guests_v1';
  const PARTIES_KEY = 'blazing_portal_parties_v1';
  const HUB_URL = '../portal-container/index.html';
  const TX_KEY = 'blazing_portal_tx_v1';
  const CURRENCY = { coins: 'ryo', premium: 'ninja_pearls' };
  const CURRENCY_NAMES = { coins: 'Ryo', premium: 'Ninja Pearls' };

  /* ---------- storage (all Portal keys go through here) ---------- */

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[Portal] save failed', key, err);
      return false;
    }
  }

  /* ---------- character data ---------- */

  let _chars = null;
  function characters() {
    if (!_chars) {
      _chars = fetch('data/characters.json')
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => (Array.isArray(list) ? list : []))
        .catch(() => []);
    }
    return _chars;
  }

  const tierRarity = (code, fallback) => {
    const m = /^(\d)/.exec(code || '');
    return m ? Number(m[1]) : Number(fallback) || 1;
  };

  /* ---------- export: inventory instance → card ---------- */

  function cardFrom(inst, def) {
    if (def.portalGuest && def.portalGuest.card) {
      // A guest goes back out as the original card from its own game.
      return SDK.validateCard(Object.assign({}, def.portalGuest.card, { level: inst.level || 1 }));
    }
    const tier = inst.tierCode || def.starMaxCode || def.starMinCode;
    const art = (def.artByTier && def.artByTier[tier]) || {};
    return SDK.validateCard({
      sourceGame: GAME_ID,
      baseId: def.id,
      name: def.name,
      title: def.version || '',
      franchise: (def.affiliation || []).some((a) => /jujutsu|cursed/i.test(a)) ? 'jjk' : 'naruto',
      element: def.element,
      rarity: tierRarity(inst.tierCode, def.rarity),
      level: inst.level || 1,
      maxLevel: (def.metadata && def.metadata.maxLevel) || 100,
      stats: SDK.normalizeStats(def.statsMax || def.statsBase),
      art: { portrait: SDK.absUrl(art.portrait || def.portrait), full: SDK.absUrl(art.full || def.full) },
    });
  }

  async function cardFor(inst) {
    const def = (await characters()).find((c) => c.id === inst.charId);
    return def ? cardFrom(inst, def) : null;
  }

  /* ---------- import: card → roster ---------- */

  const guestId = (card) => ('portal_' + card.sourceGame + '_' + card.baseId).replace(/[^A-Za-z0-9_]/g, '_');

  function pickTemplate(list, card) {
    const usable = list.filter((c) => c.element === card.element && c.skills && !c.portalGuest && c.statsMax);
    if (!usable.length) return list.find((c) => c.skills && c.statsMax) || null;
    usable.sort((a, b) =>
      Math.abs((a.rarity || 0) - card.rarity) - Math.abs((b.rarity || 0) - card.rarity) || String(a.id).localeCompare(String(b.id)));
    return usable[0];
  }

  const ELEMENT_COLORS = { Body: '#d9574a', Skill: '#4fa35a', Heart: '#4c86d6', Bravery: '#d68a2e', Wisdom: '#c9b13c' };

  // Drawn portrait for a guest whose card has no art, so it never borrows
  // the template unit's face.
  function guestArt(card) {
    const color = ELEMENT_COLORS[card.element] || '#8a7a62';
    const initials = card.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0d0b0a"/></linearGradient></defs>` +
      `<rect width="256" height="256" fill="url(#g)"/>` +
      `<circle cx="128" cy="104" r="46" fill="rgba(0,0,0,.35)"/><path d="M48 236c8-52 40-80 80-80s72 28 80 80z" fill="rgba(0,0,0,.35)"/>` +
      `<text x="128" y="122" text-anchor="middle" font-family="serif" font-weight="900" font-size="56" fill="#fff" fill-opacity=".9">${initials}</text>` +
      `</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function buildGuest(card, template) {
    const def = JSON.parse(JSON.stringify(template));
    const code = card.rarity + 'S';
    const drawn = card.art.portrait && card.art.full ? '' : guestArt(card);
    const portrait = card.art.portrait || drawn;
    const full = card.art.full || card.art.portrait || drawn;
    const max = SDK.denormalizeStats(card.stats);
    const base = {};
    for (const k of Object.keys(max)) base[k] = Math.max(1, Math.round(max[k] / 2));
    Object.assign(def, {
      id: guestId(card),
      name: card.name,
      version: card.title || 'Portal Guest',
      element: card.element,
      rarity: card.rarity,
      starMinCode: code,
      starMaxCode: code,
      lbEligible: false,
      portrait,
      full,
      artByTier: { [code]: { portrait, full } },
      ultimateAnimation: null,
      secretAnimation: null,
      statsBase: Object.assign({}, template.statsBase, base),
      statsMax: Object.assign({}, template.statsMax, max),
      metadata: Object.assign({}, template.metadata, { maxLevel: card.maxLevel, cardNumber: null }),
      affiliation: ['Portal'],
      portalGuest: { sourceGame: card.sourceGame, cardId: card.id, template: template.id, card },
    });
    return def;
  }

  /** Copy up to 5 cards into the roster. Returns { added, raised, unchanged, skipped }. */
  async function importCards(cards) {
    const inv = window.InventoryChar;
    if (!inv) throw new Error('The roster is not available on this page');
    const list = (cards || []).map((c) => SDK.validateCard(c));
    if (list.length > SDK.MAX_PARTY) throw new Error('At most ' + SDK.MAX_PARTY + ' characters at a time');

    const all = await characters();
    const byId = new Map(all.map((c) => [c.id, c]));
    const guests = readJSON(GUESTS_KEY, []);
    const out = { added: [], raised: [], unchanged: [], skipped: [] };

    for (const card of list) {
      let charId;
      let tierCode = null;
      if (card.sourceGame === GAME_ID) {
        if (!byId.has(card.baseId)) { out.skipped.push(card.name); continue; }
        charId = card.baseId;
        tierCode = card.rarity + 'S';
      } else {
        charId = guestId(card);
        tierCode = card.rarity + 'S';
        const template = pickTemplate(all, card);
        if (!template) { out.skipped.push(card.name); continue; }
        const def = buildGuest(card, template);
        const i = guests.findIndex((g) => g.id === charId);
        if (i >= 0) guests[i] = def; else guests.push(def);
        byId.set(charId, def);
        _chars = Promise.resolve(all.filter((c) => c.id !== charId).concat(def));
      }

      const owned = inv.instancesOf(charId);
      if (!owned.length) {
        inv.addCopy(charId, card.level, tierCode);
        out.added.push(card.name);
      } else {
        const best = owned.reduce((a, b) => ((b.level || 1) > (a.level || 1) ? b : a));
        if (card.level > (best.level || 1)) {
          inv.updateInstance(best.uid, { level: card.level });
          out.raised.push(card.name);
        } else {
          out.unchanged.push(card.name);
        }
      }
    }
    writeJSON(GUESTS_KEY, guests);
    return out;
  }

  /* ---------- hub session ---------- */

  const session = SDK.connect({ gameId: GAME_ID });

  function charIdForCard(card) {
    return card.sourceGame === GAME_ID ? card.baseId : guestId(card);
  }

  /** Report levels earned here for the cards in the current party. */
  async function syncParty() {
    const s = await session;
    const inv = window.InventoryChar;
    if (!s || !inv) return 0;
    let sent = 0;
    for (const card of s.party.cards) {
      const owned = inv.instancesOf(charIdForCard(card));
      const lv = owned.reduce((m, x) => Math.max(m, x.level || 1), 0);
      if (lv > card.level) {
        try { await s.update(card.id, { level: lv }); card.level = lv; sent++; } catch (_) { /* hub refused */ }
      }
    }
    return sent;
  }

  /* ---------- currency ---------- */

  const pendingTx = () => readJSON(TX_KEY, []).filter((t) => t && t.txId);
  const dropTx = (txId) => writeJSON(TX_KEY, pendingTx().filter((t) => t.txId !== txId));

  function resources() {
    if (!window.Resources) throw new Error('Currency is not available on this page');
    return window.Resources;
  }

  function balance(currency) {
    return window.Resources ? window.Resources.get(CURRENCY[currency]) : 0;
  }

  // Send one saved transfer. The local side of a deposit was already taken.
  // A txId is never in flight twice: the hub would answer both, and a
  // withdrawal would be credited twice.
  const inFlight = new Set();
  async function runTx(s, tx) {
    const res = resources();
    if (inFlight.has(tx.txId)) return { ok: false, pending: true, error: 'Transfer already in progress' };
    inFlight.add(tx.txId);
    try {
      const wallet = await s[tx.type](tx.currency, tx.amount, tx.txId);
      if (tx.type === 'withdraw') res.add(CURRENCY[tx.currency], tx.amount);
      dropTx(tx.txId);
      return { ok: true, wallet };
    } catch (err) {
      if (!err.refused) return { ok: false, pending: true, error: 'No answer from the Portal yet; it will retry automatically' };
      if (tx.type === 'deposit') res.add(CURRENCY[tx.currency], tx.amount); // refund
      dropTx(tx.txId);
      return { ok: false, error: err.message };
    } finally {
      inFlight.delete(tx.txId);
    }
  }

  async function startTx(type, currency, amount) {
    const s = await session;
    if (!s) throw new Error('Open the game from the Portal to move currency');
    if (!CURRENCY[currency]) throw new Error('Unknown currency');
    amount = Math.floor(Number(amount));
    SDK.checkTransfer(currency, amount, 'tx_check');
    const res = resources();
    const tx = { txId: SDK.newTxId(), type, currency, amount, at: Date.now() };
    if (type === 'deposit') {
      if (res.get(CURRENCY[currency]) < amount) throw new Error('Not enough ' + CURRENCY_NAMES[currency]);
      res.subtract(CURRENCY[currency], amount);
    }
    writeJSON(TX_KEY, pendingTx().concat(tx));
    return runTx(s, tx);
  }

  /** Retry transfers whose answer was lost. Returns how many completed. */
  async function retryPending() {
    const s = await session;
    if (!s || !window.Resources) return 0;
    let done = 0;
    for (const tx of pendingTx()) if ((await runTx(s, tx)).ok) done++;
    return done;
  }

  function partyImported(id) {
    return readJSON(PARTIES_KEY, []).includes(id);
  }

  function markPartyImported(id) {
    const list = readJSON(PARTIES_KEY, []).filter((x) => x !== id).concat(id).slice(-20);
    writeJSON(PARTIES_KEY, list);
  }

  session.then(async (s) => {
    if (!s) return;
    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    retryPending();
    if (!window.InventoryChar) return;
    if (s.party.cards.length && !partyImported(s.party.id)) {
      try {
        await importCards(s.party.cards);
        markPartyImported(s.party.id);
      } catch (err) {
        console.warn('[Portal] party import failed', err);
      }
    }
    syncParty();
  });

  window.PortalPort = {
    GAME_ID,
    HUB_URL,
    session,
    characters,
    cardFor,
    importCards,
    syncParty,
    partyImported,
    isGuest: (def) => !!(def && def.portalGuest),
    CURRENCY_NAMES,
    balance,
    deposit: (currency, amount) => startTx('deposit', currency, amount),
    withdraw: (currency, amount) => startTx('withdraw', currency, amount),
    pendingTx,
    retryPending,
  };
})();
