// Character Tools System — equip jutsu cards / tools onto owned shinobi.
//
// Data model (shared with characters.html, unchanged):
//   • inst.equippedJutsu = { jutsu1..3, ultimate, equipment1..5 } on each
//     InventoryChar instance, persisted by InventoryChar.updateInstance()
//     (localStorage "blazing_inventory_v2").
//   • character_power_<uid>  → { uid, power, health, attack, speed, lastUpdated }
//   • character_equipment    → { [uid]: equippedJutsu } legacy mirror
//   • Card ownership / levels come from JutsuInventory + CardSystem.
(function () {
  'use strict';

  const SLOT_KEYS = ['jutsu1', 'jutsu2', 'jutsu3', 'ultimate',
                     'equipment1', 'equipment2', 'equipment3', 'equipment4', 'equipment5'];
  const SLOT_LABEL = {
    jutsu1: 'Jutsu I', jutsu2: 'Jutsu II', jutsu3: 'Jutsu III', ultimate: 'Ultimate',
    equipment1: 'Tool 1', equipment2: 'Tool 2', equipment3: 'Tool 3', equipment4: 'Tool 4', equipment5: 'Tool 5'
  };
  const CARD_TYPES = ['All', 'Attack', 'Defense', 'Skill', 'Utility', 'Assist'];
  const STAR_BY_TIER = { "1S":1,"2S":2,"3S":3,"4S":4,"5S":5,"6S":6,"6SB":6,"7S":7,"7SL":7,"8S":8,"8SM":8,"9S":9,"9ST":9,"10SO":10 };
  const PREFS_KEY = 'tools_ui_prefs_v1';

  let selectedCharacter = null;   // { inst, baseChar }
  let characterEquipment = {};    // legacy mirror { uid: equippedJutsu }
  let charactersData = [];
  let charactersById = {};
  let cardsData = [];
  let cardsById = {};
  const prefs = { sort: 'stars', dir: 'desc', filter: 'all', uid: null };
  const picker = { slot: null, type: 'All', term: '' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

  /* ───────────── Data loading ───────────── */
  async function loadCharactersData() {
    try {
      const res = await fetch('data/characters.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      charactersData = Array.isArray(json) ? json : (Array.isArray(json.characters) ? json.characters : []);
      charactersById = charactersData.reduce((acc, c) => (acc[c.id] = c, acc), {});
      window.CharacterInventory = {
        getCharacterById: (id) => charactersById[id] || null,
        getAllCharacters: () => charactersData.slice()
      };
    } catch (err) {
      console.error('[Tools] Failed to load characters.json:', err);
    }
  }

  async function loadCardsData() {
    try {
      if (window.CardSystem) {
        if (!window.CardSystem.isLoaded()) await window.CardSystem.loadCardsData();
        cardsData = window.CardSystem.getAllCards() || [];
      }
      if (!cardsData.length) {
        const r = await fetch('data/cards.json');
        cardsData = ((await r.json()).cards) || [];
      }
    } catch (e) {
      console.error('[Tools] Failed to load cards:', e);
    }
    cardsById = cardsData.reduce((acc, c) => (acc[c.id] = c, acc), {});
    if (!window.getJutsuCardById) window.getJutsuCardById = (id) => cardsById[id];
  }

  function loadEquipmentData() {
    try { characterEquipment = JSON.parse(localStorage.getItem('character_equipment') || '{}') || {}; }
    catch (e) { characterEquipment = {}; }
  }
  function loadPrefs() {
    try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) {}
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  /* ───────────── Helpers ───────────── */
  const getBase = (charId) => charactersById[charId] || null;
  const minTier = (c) => (c && c.starMinCode) || `${(c && c.rarity) || 3}S`;
  const tierOf = (inst, c) => (inst && inst.tierCode) || minTier(c);
  function starCountFor(inst, baseChar) {
    return STAR_BY_TIER[tierOf(inst, baseChar)] || (baseChar && baseChar.rarity) || 5;
  }
  function artFor(c, tier) {
    const map = (c && c.artByTier) || {};
    const t = map[tier] || {};
    const portrait = t.portrait || c.portrait || c.card || c.icon || 'assets/placeholder.png';
    const full = (t.full || c.full || c.card || portrait).replace(/\.gif$/i, '.webp');
    return { portrait, full };
  }
  function levelCap(inst, c) {
    const P = window.Progression;
    const tier = tierOf(inst, c);
    if (window.LimitBreak && inst.limitBreakLevel > 0) return window.LimitBreak.getExtendedLevelCap(tier, inst.limitBreakLevel);
    return P && P.levelCapForCode ? P.levelCapForCode(tier) : null;
  }
  // SS→D letter grade from a unit's power rank (matches team/character screens).
  function gradeOf(baseChar) {
    const p = Number(baseChar && baseChar.powerRank) || 0;
    if (p >= 10000) return 'SS';
    if (p >= 8000)  return 'S';
    if (p >= 6000)  return 'A';
    if (p >= 4000)  return 'B';
    if (p >= 2000)  return 'C';
    return 'D';
  }
  const cardPath = (p) => (window.CardSystem ? window.CardSystem.resolveCardPath(p) : p);
  const cardLevel = (id) => (window.CardSystem ? window.CardSystem.getCardLevel(id) : 1);
  const cardMax = (card) => (window.CardSystem ? window.CardSystem.getCardMaxLevel(card) : 70);
  const cardRarity = (card) => (window.CardSystem ? window.CardSystem.parseRarity(card.rarity) : parseInt(card.rarity, 10) || 0);

  function getEquipped(inst) {
    const eq = Object.assign({}, inst.equippedJutsu || {});
    SLOT_KEYS.forEach(k => { if (!(k in eq)) eq[k] = null; });
    return eq;
  }
  function saveEquipped(inst, eq) {
    inst.equippedJutsu = eq;
    if (window.InventoryChar) window.InventoryChar.updateInstance(inst.uid, { equippedJutsu: eq });
    characterEquipment[inst.uid] = eq;
    try { localStorage.setItem('character_equipment', JSON.stringify(characterEquipment)); } catch (e) {}
  }
  const equippedCount = (inst) => SLOT_KEYS.filter(k => inst.equippedJutsu && inst.equippedJutsu[k]).length;

  /* Stat math — mirrors characters.js (renderStatusTab + getEquippedCardBonuses)
     so the power saved here matches the Shinobi screen. */
  function baseStats(inst, c) {
    const P = window.Progression;
    let stats;
    if (P && P.computeEffectiveStatsLoreTier) {
      let extendedCap = null;
      if (window.LimitBreak && inst.limitBreakLevel > 0) extendedCap = window.LimitBreak.getExtendedLevelCap(tierOf(inst, c), inst.limitBreakLevel);
      stats = (P.computeEffectiveStatsLoreTier(c, Number(inst.level) || 1, tierOf(inst, c), { normalize: true, extendedCap }) || {}).stats || {};
      if (window.LimitBreak && inst.limitBreakLevel > 0) stats = window.LimitBreak.applyLimitBreakToStats(stats, inst.limitBreakLevel);
    } else {
      const s = c.statsBase || {};
      stats = { hp: s.hp || 0, atk: s.atk || 0, def: s.def || 0, speed: s.speed || 0 };
    }
    return { hp: stats.hp || 0, atk: stats.atk || 0, def: stats.def || 0, speed: stats.speed || 0 };
  }
  function cardBonuses(inst) {
    const out = { hp: 0, atk: 0, def: 0, spd: 0, critRate: 0, evaRate: 0 };
    const eq = inst.equippedJutsu || {};
    SLOT_KEYS.forEach(k => {
      const card = eq[k] && cardsById[eq[k]];
      if (!card || !card.stats) return;
      const st = card.stats;
      out.hp  += Number(st.hp_bonus  ?? st.hp)  || 0;
      out.atk += Number(st.atk_bonus ?? st.atk) || 0;
      out.def += Number(st.def_bonus ?? st.def) || 0;
      out.spd += Number(st.spd_bonus ?? st.spd) || 0;
      out.critRate += parseFloat(st.crit_rate_bonus ?? st.cri ?? 0) || 0;
      out.evaRate  += parseFloat(st.eva_rate_bonus  ?? st.eva ?? 0) || 0;
    });
    return out;
  }
  function computeAll(inst, c) {
    const b = baseStats(inst, c);
    const x = cardBonuses(inst);
    const hp = b.hp + x.hp, atk = b.atk + x.atk, spd = b.speed + x.spd;
    return { base: b, bonus: x, hp, atk, spd, def: b.def + x.def, power: hp + atk + spd };
  }
  const powerCache = {};
  function powerOf(inst) {
    const c = getBase(inst.charId);
    if (!c) return 0;
    const key = inst.uid + '|' + inst.level + '|' + inst.tierCode + '|' + JSON.stringify(inst.equippedJutsu || {});
    if (!powerCache[key]) powerCache[key] = computeAll(inst, c).power;
    return powerCache[key];
  }

  /* ───────────── Roster ───────────── */
  function instances() {
    return (window.InventoryChar ? window.InventoryChar.allInstances() : []).filter(i => getBase(i.charId));
  }

  function renderRoster() {
    const list = $('tools-roster-list');
    if (!list) return;
    if (!window.InventoryChar) {
      list.innerHTML = '<div class="tl-roster-empty">Inventory not loaded.</div>';
      return;
    }
    const all = instances();
    const term = ($('tools-search').value || '').trim().toLowerCase();
    let rows = all.filter(inst => {
      const c = getBase(inst.charId);
      if (term && !`${c.name} ${c.version || ''}`.toLowerCase().includes(term)) return false;
      const stars = starCountFor(inst, c);
      switch (prefs.filter) {
        case '7': return stars >= 7;
        case '6': return stars === 6;
        case '5': return stars === 5;
        case '4': return stars <= 4;
        case 'geared': return equippedCount(inst) > 0;
        case 'empty': return equippedCount(inst) === 0;
        default: return true;
      }
    });
    const dir = prefs.dir === 'asc' ? 1 : -1;
    const key = {
      stars: (i) => starCountFor(i, getBase(i.charId)) * 1000 + (Number(i.level) || 1),
      level: (i) => (Number(i.level) || 1) * 100 + starCountFor(i, getBase(i.charId)),
      power: (i) => powerOf(i),
      equipped: (i) => equippedCount(i) * 100 + starCountFor(i, getBase(i.charId)),
    }[prefs.sort];
    rows.sort((a, b) => {
      if (!key) return dir * getBase(a.charId).name.localeCompare(getBase(b.charId).name);
      return dir * (key(a) - key(b)) || getBase(a.charId).name.localeCompare(getBase(b.charId).name);
    });

    $('tools-roster-count').textContent = rows.length === all.length ? `${all.length}` : `${rows.length}/${all.length}`;

    if (!all.length) {
      list.innerHTML = '<div class="tl-roster-empty">No shinobi owned yet.<br><a href="summon.html">Summon some first</a></div>';
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<div class="tl-roster-empty">No shinobi match.</div>';
      return;
    }
    const selUid = selectedCharacter && selectedCharacter.inst.uid;
    list.innerHTML = rows.map(inst => {
      const c = getBase(inst.charId);
      const stars = Math.min(10, starCountFor(inst, c));
      const art = artFor(c, tierOf(inst, c));
      const gear = equippedCount(inst);
      return `<button type="button" class="tl-row${inst.uid === selUid ? ' is-active' : ''}" role="option" aria-selected="${inst.uid === selUid}" data-uid="${esc(inst.uid)}">
        <span class="tl-row-port"><img src="${esc(art.portrait)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/placeholder.png'"></span>
        <span class="tl-row-meta">
          <span class="tl-row-name">${esc(c.name || 'Unknown')}</span>
          <span class="tl-row-ver">${esc(c.version || '')}</span>
          <span class="tl-row-stars" aria-label="${stars} stars"><i class="tl-star"></i><b>${stars}</b>${gear ? `<span class="tl-row-gear" title="${gear} equipped">&#9670; ${gear}</span>` : ''}</span>
        </span>
        <span class="tl-row-lv"><small>Lv</small>${Number(inst.level) || 1}</span>
      </button>`;
    }).join('');
  }

  function onRosterClick(e) {
    const row = e.target.closest('.tl-row');
    if (!row) return;
    const inst = window.InventoryChar.getByUid(row.dataset.uid);
    if (!inst) return;
    selectCharacter(inst, getBase(inst.charId));
    $('tools-roster-list').querySelectorAll('.tl-row').forEach(r => {
      const on = r === row;
      r.classList.toggle('is-active', on);
      r.setAttribute('aria-selected', on);
    });
  }

  function onRosterKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...$('tools-roster-list').querySelectorAll('.tl-row')];
    const i = rows.indexOf(document.activeElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) { e.preventDefault(); next.focus(); next.click(); }
  }

  /* ───────────── Selected character ───────────── */
  function selectCharacter(inst, baseChar) {
    if (!inst || !baseChar) return;
    selectedCharacter = { inst, baseChar };
    prefs.uid = inst.uid; savePrefs();

    const tier = tierOf(inst, baseChar);
    const art = artFor(baseChar, tier);
    const img = $('character-full-image');
    img.hidden = false;
    img.alt = baseChar.name || '';
    img.onerror = () => { img.onerror = null; img.src = art.portrait; };
    img.src = art.full;
    $('tools-empty-hint').hidden = true;

    $('selected-character-info').hidden = false;
    $('character-name').textContent = baseChar.name || 'Unknown';
    $('character-version').textContent = baseChar.version || '';
    const n = Math.min(10, starCountFor(inst, baseChar));
    $('tools-star-row').innerHTML = new Array(n).fill('<i class="tl-star"></i>').join('');

    const cap = levelCap(inst, baseChar);
    const lv = $('tools-level-chip');
    lv.hidden = false;
    lv.textContent = `Lv ${Number(inst.level) || 1}${cap ? ' / ' + cap : ''}`;

    $('tools-power-badge').hidden = false;
    $('equipment-container').hidden = false;
    refreshSelected();
  }

  // Re-read the instance from storage and redraw slots, stats, list.
  function refreshSelected() {
    if (!selectedCharacter) return;
    const fresh = window.InventoryChar.getByUid(selectedCharacter.inst.uid);
    if (fresh) selectedCharacter.inst = fresh;
    renderSlots();
    calculatePower();
    renderEquippedList();
  }

  function renderSlots() {
    const { inst } = selectedCharacter;
    const eq = getEquipped(inst);
    document.querySelectorAll('#equipment-container .tl-slot').forEach(btn => {
      const key = btn.dataset.slot;
      const card = eq[key] && cardsById[eq[key]];
      btn.classList.toggle('is-filled', !!card);
      if (card) {
        const r = cardRarity(card);
        btn.innerHTML = `<img src="${esc(cardPath(card.icon))}" alt="" onerror="this.onerror=null;this.src='${esc(card.icon)}'">
          <span class="tl-slot-lv">Lv${cardLevel(card.id)}</span>
          ${r >= 7 ? '<span class="tl-slot-r7">7&#9733;</span>' : ''}`;
        btn.title = `${SLOT_LABEL[key]}: ${card.jutsuName || card.name}`;
        btn.setAttribute('aria-label', `${SLOT_LABEL[key]}: ${card.jutsuName || card.name}. Change or unequip`);
      } else {
        btn.innerHTML = `<span class="tl-slot-plus" aria-hidden="true">+</span><span class="tl-slot-name">${key === 'ultimate' ? 'ULT' : SLOT_LABEL[key].replace('Jutsu ', '').replace('Tool ', 'T')}</span>`;
        btn.title = `Equip ${SLOT_LABEL[key]}`;
        btn.setAttribute('aria-label', `Empty ${SLOT_LABEL[key]} slot. Equip a card`);
      }
    });
  }

  function calculatePower() {
    if (!selectedCharacter) return;
    const { inst, baseChar } = selectedCharacter;
    const s = computeAll(inst, baseChar);
    const x = s.bonus;

    $('power-value').textContent = fmt(s.power);
    const g = gradeOf(baseChar);
    const gEl = $('tools-grade');
    gEl.textContent = g; gEl.dataset.grade = g;

    const contrib = window.CardSystem ? window.CardSystem.getEquippedContributions(inst.equippedJutsu) : null;
    $('tools-set-bonus').hidden = !(contrib && contrib.setBonus);

    const rows = [
      ['HP', s.base.hp, x.hp, 'hp'],
      ['ATK', s.base.atk, x.atk, 'atk'],
      ['SPD', s.base.speed, x.spd, 'spd'],
      ['DEF', s.base.def, x.def, 'def'],
      ['CRIT', null, x.critRate, 'cri', '%'],
      ['EVA', null, x.evaRate, 'eva', '%'],
    ];
    const maxBar = Math.max(1, s.hp);
    $('stats-display').innerHTML = rows.filter(r => r[3] !== 'def' || (r[1] + r[2]) > 0).map(([label, base, bonus, k, pct]) => {
      const total = (base || 0) + bonus;
      const has = bonus > 0;
      const val = pct ? `${total.toFixed(1)}%` : fmt(total);
      const bar = pct ? Math.min(100, total) : Math.min(100, (total / (k === 'hp' ? maxBar : Math.max(s.atk * 1.6, s.def, 1))) * 100);
      return `<div class="tl-stat${has ? ' has-bonus' : ''}" data-stat="${k}">
        <dt>${label}</dt>
        <dd><b>${val}</b>${has ? `<span class="tl-bonus">+${pct ? bonus.toFixed(1) + '%' : fmt(bonus)}</span>` : ''}</dd>
        <div class="jjk-progress tl-bar"><i style="width:${Math.max(2, bar).toFixed(1)}%"></i></div>
      </div>`;
    }).join('') + `<div class="tl-stat tl-stat--power"><dt>Power</dt><dd><b>${fmt(s.power)}</b>${(x.hp + x.atk + x.spd) > 0 ? `<span class="tl-bonus">+${fmt(x.hp + x.atk + x.spd)}</span>` : ''}</dd></div>`;

    savePowerData(s);
  }

  function savePowerData(s) {
    if (!selectedCharacter) return;
    const { inst, baseChar } = selectedCharacter;
    s = s || computeAll(inst, baseChar);
    try {
      localStorage.setItem(`character_power_${inst.uid}`, JSON.stringify({
        uid: inst.uid, power: s.power, health: s.hp, attack: s.atk, speed: s.spd, lastUpdated: Date.now()
      }));
    } catch (e) {}
  }

  function renderEquippedList() {
    const { inst } = selectedCharacter;
    const eq = getEquipped(inst);
    const filled = SLOT_KEYS.filter(k => eq[k] && cardsById[eq[k]]);
    $('tools-equip-count').textContent = `${filled.length}/${SLOT_KEYS.length}`;
    $('tools-clear').disabled = !filled.length;
    const ul = $('tools-equipped-list');
    if (!filled.length) {
      ul.innerHTML = '<li class="tl-equipped-empty">Nothing equipped. Tap a slot to equip a card.</li>';
      return;
    }
    ul.innerHTML = filled.map(k => {
      const card = cardsById[eq[k]];
      const st = card.stats || {};
      return `<li class="tl-eq">
        <button type="button" class="tl-eq-main" data-open="${k}" title="Change ${SLOT_LABEL[k]}">
          <img src="${esc(cardPath(card.icon))}" alt="" onerror="this.onerror=null;this.src='${esc(card.icon)}'">
          <span class="tl-eq-meta">
            <span class="tl-eq-name">${esc(card.jutsuName || card.name)}</span>
            <span class="tl-eq-sub">${SLOT_LABEL[k]} &middot; Lv${cardLevel(card.id)} &middot; <em>+${fmt(st.hp)} HP +${fmt(st.atk)} ATK</em></span>
          </span>
        </button>
        <button type="button" class="tl-eq-x" data-unequip="${k}" aria-label="Unequip ${esc(card.jutsuName || card.name)}" title="Unequip">&times;</button>
      </li>`;
    }).join('');
  }

  /* ───────────── Equip / unequip ───────────── */
  function equip(slot, cardId) {
    if (!selectedCharacter) return;
    const { inst } = selectedCharacter;
    const eq = getEquipped(inst);
    // A card can only occupy one slot on the same unit.
    SLOT_KEYS.forEach(k => { if (k !== slot && eq[k] === cardId) eq[k] = null; });
    eq[slot] = cardId;
    saveEquipped(inst, eq);
    afterChange();
  }
  function unequip(slot) {
    if (!selectedCharacter) return;
    const { inst } = selectedCharacter;
    const eq = getEquipped(inst);
    const card = eq[slot] && cardsById[eq[slot]];
    eq[slot] = null;
    saveEquipped(inst, eq);
    afterChange();
    if (card) toast(`Unequipped ${card.jutsuName || card.name}`);
  }
  function afterChange() {
    refreshSelected();
    renderRoster();
  }

  function eligibleOwnedCards(inst) {
    let list = window.CardSystem
      ? window.CardSystem.filterCardsForCharacter(cardsData, inst.charId)
      : cardsData.filter(card => (card.eligibleCharacters || []).some(e => e.split('_')[0].toLowerCase() === inst.charId.split('_')[0].toLowerCase()));
    if (window.JutsuInventory) list = list.filter(card => window.JutsuInventory.has(card.id));
    return list;
  }
  const rawBonus = (card) => { const st = card.stats || {}; return { hp: Number(st.hp_bonus ?? st.hp) || 0, atk: Number(st.atk_bonus ?? st.atk) || 0, def: Number(st.def_bonus ?? st.def) || 0 }; };
  const cardScore = (card) => { const st = rawBonus(card); return (st.hp || 0) + (st.atk || 0) + cardRarity(card) * 50; };

  function autoEquip() {
    if (!selectedCharacter) return;
    const { inst } = selectedCharacter;
    const eq = getEquipped(inst);
    const used = new Set(Object.values(eq).filter(Boolean));
    const pool = eligibleOwnedCards(inst).filter(c => !used.has(c.id)).sort((a, b) => cardScore(b) - cardScore(a));
    // Fill the ultimate slot first (x3.5 multiplier), then the rest.
    const order = ['ultimate', 'jutsu1', 'jutsu2', 'jutsu3', 'equipment1', 'equipment2', 'equipment3', 'equipment4', 'equipment5'];
    let added = 0;
    order.forEach(k => { if (!eq[k] && pool.length) { eq[k] = pool.shift().id; added++; } });
    if (!added) {
      toast(eligibleOwnedCards(inst).length ? 'All slots already filled' : 'No owned cards for this shinobi');
      return;
    }
    saveEquipped(inst, eq);
    afterChange();
    toast(`Equipped ${added} card${added > 1 ? 's' : ''}`);
  }
  function clearAll() {
    if (!selectedCharacter) return;
    const { inst } = selectedCharacter;
    const eq = getEquipped(inst);
    SLOT_KEYS.forEach(k => { eq[k] = null; });
    saveEquipped(inst, eq);
    afterChange();
    toast('All slots cleared');
  }

  /* ───────────── Picker modal ───────────── */
  function openPicker(slot) {
    if (!selectedCharacter) return;
    picker.slot = slot;
    picker.term = '';
    $('tools-picker-search').value = '';
    $('tools-picker-title').textContent = `Equip — ${SLOT_LABEL[slot]}`;
    renderPickerTabs();
    renderPicker();
    const m = $('tools-picker');
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('is-open'));
    setTimeout(() => { const f = m.querySelector('.tl-current button, .tl-card:not(:disabled), .tl-x'); if (f) f.focus(); }, 30);
  }
  function closePicker() {
    const m = $('tools-picker');
    m.classList.remove('is-open');
    m.hidden = true;
    const slotBtn = document.querySelector(`.tl-slot[data-slot="${picker.slot}"]`);
    picker.slot = null;
    if (slotBtn) slotBtn.focus();
  }
  function renderPickerTabs() {
    $('tools-picker-tabs').innerHTML = CARD_TYPES.map(t =>
      `<button type="button" class="jjk-tab tl-ptab${t === picker.type ? ' active' : ''}" role="tab" aria-selected="${t === picker.type}" data-type="${t}">${t}</button>`).join('');
  }
  function renderPicker() {
    const { inst } = selectedCharacter;
    const eq = getEquipped(inst);
    const slot = picker.slot;
    const cur = eq[slot] && cardsById[eq[slot]];

    const curBox = $('tools-picker-current');
    if (cur) {
      const st = rawBonus(cur);
      const lv = cardLevel(cur.id), mx = cardMax(cur);
      curBox.hidden = false;
      curBox.innerHTML = `
        <img src="${esc(cardPath(cur.fullArt || cur.icon))}" alt="" onerror="this.onerror=null;this.src='${esc(cardPath(cur.icon))}'">
        <div class="tl-current-meta">
          <small>Currently equipped</small>
          <b>${esc(cur.jutsuName || cur.name)}</b>
          <span>${esc(cur.name)} &middot; ${esc(cur.rarity || '')} &middot; Lv ${lv}/${mx}</span>
          <span class="tl-current-stats">+${fmt(st.hp)} HP &middot; +${fmt(st.atk)} ATK &middot; +${fmt(st.def)} DEF</span>
        </div>
        <div class="tl-current-actions">
          <button type="button" class="jjk-btn tl-mini" data-act="lvup" ${lv >= mx ? 'disabled' : ''}>${lv >= mx ? 'Max Lv' : 'Level +1'}</button>
          <button type="button" class="jjk-btn tl-mini tl-act--ghost" data-act="unequip">Unequip</button>
        </div>`;
    } else {
      curBox.hidden = true;
      curBox.innerHTML = '';
    }

    const grid = $('tools-picker-grid');
    let cards = eligibleOwnedCards(inst);
    const ownedTotal = cards.length;
    if (picker.type !== 'All') cards = cards.filter(c => c.cardType === picker.type);
    if (picker.term) cards = cards.filter(c => `${c.name} ${c.jutsuName || ''}`.toLowerCase().includes(picker.term));
    cards.sort((a, b) => cardScore(b) - cardScore(a));

    if (!cards.length) {
      grid.innerHTML = ownedTotal
        ? '<div class="tl-grid-empty">No cards match this filter.</div>'
        : `<div class="tl-grid-empty">You own no jutsu cards usable by ${esc(selectedCharacter.baseChar.name)}.<br><a class="jjk-btn tl-mini" href="summon.html">Go to Summon</a></div>`;
      return;
    }
    grid.innerHTML = cards.map(card => {
      const inSlot = SLOT_KEYS.find(k => eq[k] === card.id);
      const isHere = inSlot === slot;
      const st = rawBonus(card);
      const r = cardRarity(card);
      return `<button type="button" class="tl-card${isHere ? ' is-here' : ''}${r >= 7 ? ' is-r7' : ''}" data-card="${esc(card.id)}" ${isHere ? 'disabled' : ''}>
        <span class="tl-card-art">${card.fullArt && card.fullArt !== card.icon
          ? `<img src="${esc(cardPath(card.fullArt))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(cardPath(card.icon))}'"><img class="tl-card-icon" src="${esc(cardPath(card.icon))}" alt="" loading="lazy">`
          : `<img class="is-icon" src="${esc(cardPath(card.icon))}" alt="" loading="lazy">`}</span>
        <span class="tl-card-name">${esc(card.jutsuName || card.name)}</span>
        <span class="tl-card-sub">${esc(card.rarity || '')} &middot; ${esc(card.cardType || '')} &middot; Lv${cardLevel(card.id)}</span>
        <span class="tl-card-stats">+${fmt(st.hp)} HP &nbsp;+${fmt(st.atk)} ATK</span>
        ${inSlot ? `<span class="tl-card-tag">${isHere ? 'In this slot' : 'Move from ' + SLOT_LABEL[inSlot]}</span>` : ''}
      </button>`;
    }).join('');
  }
  function onPickerClick(e) {
    if (e.target === $('tools-picker')) return closePicker();
    const tab = e.target.closest('.tl-ptab');
    if (tab) { picker.type = tab.dataset.type; renderPickerTabs(); renderPicker(); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'unequip') { unequip(picker.slot); closePicker(); }
      if (act.dataset.act === 'lvup' && window.CardSystem) {
        const eq = getEquipped(selectedCharacter.inst);
        const res = window.CardSystem.levelUpCard(eq[picker.slot], 1);
        if (res && res.ok) { afterChange(); renderPicker(); toast('Card levelled up'); }
        else toast('Card is at max level');
      }
      return;
    }
    const card = e.target.closest('.tl-card');
    if (card && !card.disabled) {
      const c = cardsById[card.dataset.card];
      equip(picker.slot, card.dataset.card);
      toast(`Equipped ${c ? (c.jutsuName || c.name) : 'card'} to ${SLOT_LABEL[picker.slot]}`);
      closePicker();
    }
  }

  /* ───────────── Toast ───────────── */
  let toastT = null;
  function toast(msg) {
    const t = $('tools-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('is-on'), 1800);
  }

  /* ───────────── Layout: measure real dock height ───────────── */
  function syncDock() {
    const bar = document.querySelector('.bottom-bar');
    const h = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    if (h > 0) document.documentElement.style.setProperty('--tl-dock', h + 'px');
  }

  /* ───────────── Wiring ───────────── */
  function setupEventListeners() {
    $('tools-search').addEventListener('input', renderRoster);
    const sort = $('tools-sort'), filter = $('tools-filter'), dirBtn = $('tools-sort-dir');
    sort.value = prefs.sort; filter.value = prefs.filter;
    const setDir = () => { dirBtn.innerHTML = prefs.dir === 'asc' ? '&#9650;' : '&#9660;'; dirBtn.setAttribute('aria-pressed', prefs.dir === 'asc'); };
    setDir();
    sort.addEventListener('change', () => { prefs.sort = sort.value; prefs.dir = sort.value === 'name' ? 'asc' : 'desc'; setDir(); savePrefs(); renderRoster(); });
    filter.addEventListener('change', () => { prefs.filter = filter.value; savePrefs(); renderRoster(); });
    dirBtn.addEventListener('click', () => { prefs.dir = prefs.dir === 'asc' ? 'desc' : 'asc'; setDir(); savePrefs(); renderRoster(); });

    const list = $('tools-roster-list');
    list.addEventListener('click', onRosterClick);
    list.addEventListener('keydown', onRosterKey);

    $('equipment-container').addEventListener('click', e => {
      const slot = e.target.closest('.tl-slot');
      if (slot) openPicker(slot.dataset.slot);
    });
    $('tools-equipped-list').addEventListener('click', e => {
      const x = e.target.closest('[data-unequip]');
      if (x) return unequip(x.dataset.unequip);
      const o = e.target.closest('[data-open]');
      if (o) openPicker(o.dataset.open);
    });
    $('tools-auto').addEventListener('click', autoEquip);
    $('tools-clear').addEventListener('click', clearAll);

    $('tools-picker').addEventListener('click', onPickerClick);
    $('tools-picker-close').addEventListener('click', closePicker);
    $('tools-picker-search').addEventListener('input', e => { picker.term = e.target.value.trim().toLowerCase(); renderPicker(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && picker.slot) closePicker(); });

    window.addEventListener('resize', syncDock);
    // Another tab (e.g. characters.html) changed the inventory.
    window.addEventListener('storage', e => {
      if (e.key === 'blazing_inventory_v2' || e.key === 'blazing_card_levels_v1') location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    syncDock();
    loadPrefs();
    await Promise.all([loadCharactersData(), loadCardsData()]);
    loadEquipmentData();
    setupEventListeners();
    renderRoster();

    // Restore last selection, else pick the first row.
    const saved = prefs.uid && window.InventoryChar && window.InventoryChar.getByUid(prefs.uid);
    if (saved && getBase(saved.charId)) {
      selectCharacter(saved, getBase(saved.charId));
      renderRoster();
      const row = document.querySelector(`.tl-row[data-uid="${CSS.escape(saved.uid)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    } else {
      const first = document.querySelector('.tl-row');
      if (first) first.click();
    }
    syncDock();
    setTimeout(syncDock, 400);
  });

  // Public API (kept from the previous version)
  window.CharacterTools = {
    getSelectedCharacter: () => selectedCharacter,
    calculatePower: calculatePower,
    getPowerData: (uid) => {
      const saved = localStorage.getItem(`character_power_${uid}`);
      return saved ? JSON.parse(saved) : null;
    },
    equip, unequip, openPicker
  };
})();
