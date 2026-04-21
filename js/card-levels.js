// js/card-levels.js
// Card Leveling & Stats System
// - Loads card data from data/cards.json
// - Manages per-card levels in localStorage
// - Calculates stats at any level (linear from 10% at Lv1 to 100% at maxLevel)
// - Exposes power contribution from equipped cards
// Load BEFORE characters.js

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_card_levels_v1";

  let _levels = {};        // { cardId: currentLevel }
  let _cardsData = [];
  let _cardsLoaded = false;

  /* ---- Persistence ---- */
  function loadLevels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw);
      _levels = (parsed && typeof parsed === "object") ? parsed : {};
    } catch {
      _levels = {};
    }
  }

  function saveLevels() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_levels));
    } catch (e) {
      console.error("[CardSystem] Save failed:", e);
    }
  }

  /* ---- Card data ---- */
  async function loadCardsData() {
    try {
      const r = await fetch("data/cards.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      _cardsData = data.cards || [];
      _cardsLoaded = true;
      console.log(`[CardSystem] Loaded ${_cardsData.length} cards`);
    } catch (e) {
      console.error("[CardSystem] Failed to load cards.json:", e);
    }
  }

  function getCardById(cardId) {
    return _cardsData.find(c => c.id === cardId) || null;
  }

  function getAllCards() {
    return _cardsData;
  }

  /* ---- Path resolution ----
     cards.json stores: "assets/jutsu/cards/X_full.png"
     Actual images are: "assets/cardsandicons/X_full.png"         */
  function resolveCardPath(path) {
    if (!path) return "";
    const filename = path.split("/").pop();
    return `assets/cardsandicons/${filename}`;
  }

  /* ---- Level helpers ---- */
  function getCardLevel(cardId) {
    return _levels[cardId] || 1;
  }

  function getCardMaxLevel(card) {
    // Parse from "70/70" → 70
    const levelStr = card?.stats?.cardLevel;
    if (levelStr && typeof levelStr === "string") {
      const parts = levelStr.split("/");
      const max = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(max) && max > 0) return max;
    }
    return 70;
  }

  function setCardLevel(cardId, level) {
    _levels[cardId] = Math.max(1, level);
    saveLevels();
  }

  /* ---- Stat calculation ----
     At Lv 1 each stat is 10% of max (minimum 1).
     Stats grow linearly to 100% at maxLevel.              */
  function _statAtLevel(maxStat, level, maxLevel) {
    if (!maxStat || maxStat === 0) return 0;
    if (maxLevel <= 1) return maxStat;
    const base = Math.max(1, Math.round(maxStat * 0.1));
    const t = (level - 1) / (maxLevel - 1);
    return Math.round(base + (maxStat - base) * t);
  }

  function _parsePercent(val) {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val) || 0;
    return 0;
  }

  function getCardStatsAtLevel(card, level) {
    const maxLevel = getCardMaxLevel(card);
    const s = card.stats || {};
    const lv = Math.max(1, Math.min(level, maxLevel));

    const maxHp  = parseInt(s.hp,  10) || 0;
    const maxAtk = parseInt(s.atk, 10) || 0;
    const maxDef = parseInt(s.def, 10) || 0;
    const maxCp  = parseInt(s.cp,  10) || 0;
    const maxCri = _parsePercent(s.cri);
    const maxEva = _parsePercent(s.eva);

    return {
      level: lv,
      maxLevel,
      hp:  _statAtLevel(maxHp,  lv, maxLevel),
      atk: _statAtLevel(maxAtk, lv, maxLevel),
      def: _statAtLevel(maxDef, lv, maxLevel),
      cp:  _statAtLevel(maxCp,  lv, maxLevel),
      cri: (maxLevel > 0 ? (maxCri * lv / maxLevel) : maxCri).toFixed(2) + "%",
      eva: (maxLevel > 0 ? (maxEva * lv / maxLevel) : maxEva).toFixed(2) + "%",
    };
  }

  function getCardCurrentStats(card) {
    return getCardStatsAtLevel(card, getCardLevel(card.id));
  }

  /* ---- Level up ---- */
  function levelUpCard(cardId, amount) {
    amount = Math.max(1, parseInt(amount, 10) || 1);
    const card = getCardById(cardId);
    if (!card) return { ok: false, reason: "CARD_NOT_FOUND" };

    const maxLevel = getCardMaxLevel(card);
    const currentLevel = getCardLevel(cardId);
    if (currentLevel >= maxLevel) {
      return { ok: false, reason: "MAX_LEVEL", level: currentLevel, maxLevel };
    }

    const newLevel = Math.min(maxLevel, currentLevel + amount);
    setCardLevel(cardId, newLevel);
    return { ok: true, level: newLevel, maxLevel, prevLevel: currentLevel };
  }

  /* ---- Rarity parsing ----
     "7★" → 7,  "6★" → 6,  etc.                                       */
  function parseRarity(rarityStr) {
    if (!rarityStr) return 0;
    const m = String(rarityStr).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  /* ---- Full card contributions (HP, ATK, CRI, CRIT DMG, EVA) --------
     Applied multipliers (all stack multiplicatively):
       • Ultimate slot  : stats × 3.5  (+250% = original + 250% extra)
       • Card rarity ≥ 7: stats × 1.2  (+20%)
       • All equipped cards ≥ 7★: further × 1.3 set bonus (+30%)       */
  function getEquippedContributions(equippedJutsu) {
    const zero = { hp: 0, atk: 0, cri: 0, critDmg: 0, eva: 0, setBonus: false };
    if (!equippedJutsu) return zero;

    const slots = [
      "jutsu1", "jutsu2", "jutsu3", "ultimate",
      "equipment1", "equipment2", "equipment3", "equipment4", "equipment5"
    ];

    let totalHp = 0, totalAtk = 0, totalCri = 0, totalEva = 0;
    const equippedRarities = [];

    slots.forEach(slot => {
      const cardId = equippedJutsu[slot];
      if (!cardId) return;
      const card = getCardById(cardId);
      if (!card) return;

      const st = getCardCurrentStats(card);
      const isUltimate = (slot === "ultimate");
      const slotMult    = isUltimate ? 3.5 : 1.0;   // +250% for ultimate slot
      const rarity      = parseRarity(card.rarity);
      const rarityMult  = rarity >= 7 ? 1.2 : 1.0;  // +20% for 7★+
      const mult        = slotMult * rarityMult;

      const rawHp  = st.hp  || 0;
      const rawAtk = st.atk || 0;
      const rawCp  = st.cp  || 0;   // converted → eva addition (54  →  0.54%)
      const rawCri = _parsePercent(st.cri); // "45.00%" → 45.0
      const rawEva = _parsePercent(st.eva); // "1.10%"  →  1.1

      totalHp  += rawHp  * mult;
      totalAtk += rawAtk * mult;
      totalCri += rawCri * mult;
      totalEva += (rawEva + rawCp / 100) * mult;  // e.g. 1.10 + 0.54 = 1.64%

      equippedRarities.push(rarity);
    });

    // Set bonus: every filled slot must be 7★+
    const setBonus = equippedRarities.length > 0 && equippedRarities.every(r => r >= 7);
    if (setBonus) {
      totalHp  *= 1.3;
      totalAtk *= 1.3;
      totalCri *= 1.3;
      totalEva *= 1.3;
    }

    // Critical Damage = 1.5× Critical Rate
    const totalCritDmg = totalCri * 1.5;

    return {
      hp:      Math.round(totalHp),
      atk:     Math.round(totalAtk),
      cri:     totalCri,
      critDmg: totalCritDmg,
      eva:     totalEva,
      setBonus,
    };
  }

  /* ---- Power contribution — HP + ATK from cards → character POW ---- */
  function getEquippedCardsPowerContribution(equippedJutsu) {
    const c = getEquippedContributions(equippedJutsu);
    return c.hp + c.atk;
  }

  /* ---- Eligibility matching ----
     Compare only the first name segment:
       "naruto_uzumaki".split('_')[0] === "naruto_001".split('_')[0]  ✓  */
  function characterMatchesEligible(characterId, eligibleId) {
    if (!characterId || !eligibleId) return false;
    return characterId.split("_")[0].toLowerCase() ===
           eligibleId.split("_")[0].toLowerCase();
  }

  function filterCardsForCharacter(cards, characterId) {
    return cards.filter(card => {
      if (!card.eligibleCharacters || card.eligibleCharacters.length === 0) return true;
      return card.eligibleCharacters.some(eid => characterMatchesEligible(characterId, eid));
    });
  }

  /* ---- Init ---- */
  loadLevels();
  loadCardsData();

  /* ---- Public API ---- */
  global.CardSystem = {
    loadCardsData,
    getCardById,
    getAllCards,
    resolveCardPath,
    parseRarity,
    getCardLevel,
    getCardMaxLevel,
    getCardStatsAtLevel,
    getCardCurrentStats,
    levelUpCard,
    getEquippedContributions,
    getEquippedCardsPowerContribution,
    characterMatchesEligible,
    filterCardsForCharacter,
    isLoaded: () => _cardsLoaded,
  };

})(window);
