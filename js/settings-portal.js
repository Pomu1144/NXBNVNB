/* js/settings-portal.js — the Settings → Portal tab.
 * Shows the hub connection, imports the party the player arrived with,
 * sends up to 5 roster units to the vault, and moves units by Portal Code.
 * All roster and storage work goes through js/portal-port.js.
 */
(function () {
  'use strict';

  const SDK = window.PortalSDK;
  const Port = window.PortalPort;
  if (!SDK || !Port) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const picked = new Set(); // charIds
  let roster = [];          // [{ inst, def }] best instance per character
  let session = null;

  function msg(text, isError, where) {
    const el = $(where || 'portal-msg');
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
  }

  function describe(r) {
    const parts = [];
    if (r.added.length) parts.push('Joined: ' + r.added.join(', '));
    if (r.raised.length) parts.push('Level raised: ' + r.raised.join(', '));
    if (r.unchanged.length) parts.push('Already here: ' + r.unchanged.join(', '));
    if (r.skipped.length) parts.push('Could not import: ' + r.skipped.join(', '));
    return parts.join(' · ') || 'Nothing to import';
  }

  function tile(c, opts) {
    const o = opts || {};
    const img = c.portrait ? `<img src="${esc(c.portrait)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    const tag = o.button ? 'button' : 'div';
    return `<${tag} class="portal-tile el-${esc(String(c.element || '').toLowerCase())}${o.on ? ' is-on' : ''}"` +
      (o.button ? ` type="button" data-char="${esc(c.key)}" aria-pressed="${o.on ? 'true' : 'false'}"` : '') + `>
        <span class="portal-tile-art"><i>${esc((c.name || '?')[0])}</i>${img}</span>
        <span class="portal-tile-name">${esc(c.name)}</span>
        <span class="portal-tile-meta">${'★'.repeat(Math.max(1, Math.min(7, c.rarity || 1)))} · Lv ${c.level || 1}${c.guest ? ' · Guest' : ''}</span>
      </${tag}>`;
  }

  /* ---------- connection + party ---------- */

  function renderConnection() {
    const status = $('portal-status');
    if (session) {
      status.textContent = 'Connected';
      status.classList.add('is-on');
      $('portal-status-note').textContent = 'Playing inside the Portal as ' + session.player.name;
      $('portal-open').textContent = 'Back to Portal';
      $('portal-open').addEventListener('click', (e) => { e.preventDefault(); session.exit(); });
      $('portal-send').disabled = picked.size === 0;
    } else {
      status.textContent = 'Standalone';
      $('portal-status-note').textContent = 'Open the Portal to carry characters between games, or use Portal Codes below';
      $('portal-send').title = 'Open this game from the Portal to send to the vault';
    }
  }

  function renderParty() {
    const cards = session ? session.party.cards : [];
    $('portal-party-block').hidden = !cards.length;
    if (!cards.length) return;
    $('portal-party').innerHTML = cards.map((c) => tile({
      name: c.name, element: c.element, rarity: c.rarity, level: c.level,
      portrait: c.art.portrait, guest: c.sourceGame !== Port.GAME_ID,
    })).join('');
    const done = Port.partyImported(session.party.id);
    $('portal-party-note').textContent = done
      ? 'Already in your roster. Importing again only raises levels.'
      : cards.length + ' character' + (cards.length === 1 ? '' : 's') + ' from the Portal';
  }

  $('portal-party-import').addEventListener('click', async () => {
    if (!session) return;
    try {
      msg(describe(await Port.importCards(session.party.cards)));
      await loadRoster();
    } catch (err) {
      msg(err.message, true);
    }
  });

  /* ---------- roster picker ---------- */

  async function loadRoster() {
    const inv = window.InventoryChar;
    const defs = await Port.characters();
    const byId = new Map(defs.map((d) => [d.id, d]));
    const best = new Map();
    for (const inst of inv ? inv.allInstances() : []) {
      const def = byId.get(inst.charId);
      if (!def) continue;
      const have = best.get(inst.charId);
      if (!have || (inst.level || 1) > (have.inst.level || 1)) best.set(inst.charId, { inst, def });
    }
    roster = [...best.values()].sort((a, b) =>
      (b.def.rarity || 0) - (a.def.rarity || 0) || (b.inst.level || 1) - (a.inst.level || 1) || a.def.name.localeCompare(b.def.name));
    for (const id of [...picked]) if (!best.has(id)) picked.delete(id);
    renderRoster();
  }

  function renderRoster() {
    const q = $('portal-search').value.trim().toLowerCase();
    const list = roster.filter(({ def }) => !q || def.name.toLowerCase().includes(q) || String(def.version || '').toLowerCase().includes(q));
    const shown = list.slice(0, 120);
    $('portal-roster').innerHTML = shown.map(({ inst, def }) => {
      const tier = inst.tierCode || def.starMinCode;
      const art = (def.artByTier && def.artByTier[tier]) || {};
      return tile({
        key: def.id, name: def.name, element: def.element, level: inst.level,
        rarity: Number(String(inst.tierCode || '').charAt(0)) || def.rarity,
        portrait: art.portrait || def.portrait, guest: Port.isGuest(def),
      }, { button: true, on: picked.has(def.id) });
    }).join('') + (list.length > shown.length ? `<p class="portal-more">${list.length - shown.length} more — search to narrow down</p>` : '');
    if (!roster.length) $('portal-roster').innerHTML = '<p class="portal-more">No units in your roster yet.</p>';
    $('portal-picked').textContent = picked.size + ' / ' + SDK.MAX_PARTY;
    $('portal-make-code').disabled = picked.size === 0;
    $('portal-send').disabled = !session || picked.size === 0;
  }

  $('portal-search').addEventListener('input', renderRoster);

  $('portal-roster').addEventListener('click', (e) => {
    const b = e.target.closest('[data-char]');
    if (!b) return;
    const id = b.dataset.char;
    if (picked.has(id)) picked.delete(id);
    else if (picked.size < SDK.MAX_PARTY) picked.add(id);
    else { msg('You can send at most ' + SDK.MAX_PARTY + ' characters at a time.', true); return; }
    msg('');
    renderRoster();
  });

  async function pickedCards() {
    const out = [];
    for (const id of picked) {
      const r = roster.find((x) => x.def.id === id);
      const card = r && (await Port.cardFor(r.inst));
      if (card) out.push(card);
    }
    return out;
  }

  /* ---------- send ---------- */

  $('portal-send').addEventListener('click', async () => {
    if (!session) return;
    const cards = await pickedCards();
    let sent = 0;
    const refused = [];
    for (const card of cards) {
      // The hub only accepts characters that belong to this game; guests
      // are already in the vault under their own game.
      if (card.sourceGame !== Port.GAME_ID) { refused.push(card.name + ' (guest)'); continue; }
      try { await session.grant(card); sent++; } catch (err) { refused.push(card.name + ' (' + err.message + ')'); }
    }
    msg((sent ? 'Sent ' + sent + ' to the vault.' : '') + (refused.length ? ' Not sent: ' + refused.join(', ') : ''), !sent);
  });

  $('portal-make-code').addEventListener('click', async () => {
    try {
      const code = SDK.encodeCode(await pickedCards());
      $('portal-code-out').value = code;
      $('portal-code-out-row').hidden = false;
      msg('Portal Code ready for ' + picked.size + ' character' + (picked.size === 1 ? '' : 's') + '.');
    } catch (err) {
      msg(err.message, true);
    }
  });

  $('portal-copy-code').addEventListener('click', async () => {
    const field = $('portal-code-out');
    try {
      await navigator.clipboard.writeText(field.value);
      msg('Copied.');
    } catch (_) {
      field.select();
      msg('Select the code and copy it.');
    }
  });

  /* ---------- receive ---------- */

  $('portal-import-code').addEventListener('click', async () => {
    try {
      const cards = SDK.decodeCode($('portal-code-in').value);
      msg(describe(await Port.importCards(cards)));
      $('portal-code-in').value = '';
      await loadRoster();
    } catch (err) {
      msg(err.message, true);
    }
  });

  /* ---------- wallet ---------- */

  const fmt = (n) => Number(n || 0).toLocaleString();

  function renderWallet() {
    $('portal-bal-ryo').textContent = fmt(Port.balance('coins'));
    $('portal-bal-pearls').textContent = fmt(Port.balance('premium'));
    $('portal-bal-coins').textContent = session ? fmt(session.wallet.coins) : '—';
    $('portal-bal-premium').textContent = session ? fmt(session.wallet.premium) : '—';
    $('portal-deposit').disabled = !session;
    $('portal-withdraw').disabled = !session;
    const pending = Port.pendingTx().length;
    $('portal-wallet-note').textContent = !session
      ? 'Open the game from the Portal to move currency'
      : pending ? pending + ' transfer' + (pending === 1 ? '' : 's') + ' waiting for the Portal; retried automatically'
        : 'Send puts it in the Portal wallet; Receive takes it out into this game';
  }

  async function move(kind) {
    const currency = $('portal-currency').value;
    const amount = Math.floor(Number($('portal-amount').value));
    const name = Port.CURRENCY_NAMES[currency];
    $('portal-deposit').disabled = $('portal-withdraw').disabled = true;
    try {
      const r = await Port[kind](currency, amount);
      if (r.ok) {
        msg((kind === 'deposit' ? 'Sent ' : 'Received ') + fmt(amount) + ' ' + name + '.', false, 'portal-wallet-msg');
        $('portal-amount').value = '';
      } else {
        msg(r.error, !r.pending, 'portal-wallet-msg');
      }
    } catch (err) {
      msg(err.message, true, 'portal-wallet-msg');
    }
    renderWallet();
  }

  $('portal-deposit').addEventListener('click', () => move('deposit'));
  $('portal-withdraw').addEventListener('click', () => move('withdraw'));

  /* ---------- boot ---------- */

  Port.session.then((s) => {
    session = s;
    renderConnection();
    renderParty();
    renderWallet();
    // The automatic retry on connect may finish a little later.
    Port.retryPending().then(renderWallet);
  });

  // Build the roster when the tab is first opened (characters.json is large).
  let loaded = false;
  const tabBtn = document.querySelector('[data-tab="portal"]');
  const ensure = () => { if (!loaded) { loaded = true; loadRoster(); } };
  if (tabBtn) tabBtn.addEventListener('click', ensure);
  if ($('pane-portal').classList.contains('active')) ensure();
})();
