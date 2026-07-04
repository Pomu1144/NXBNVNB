// js/summon/jutsu-summon.js
// Adds a "Jutsu Cards" tab to the summon page. Rolls jutsu cards from
// cards.json (weighted by rarity for now; swaps to the EX/Normal/Limit-Break
// tier hierarchy once those tags land), spends Shinobites, and records what the
// player pulls in JutsuInventory so the equip screen can gate by ownership.
(function (global) {
  "use strict";

  const COST = { single: 5, multi: 45, multiCount: 10 };

  // Rarity → draw weight (higher rarity = rarer). Proxy until EX/Normal/LB tiers
  // are applied; the tier hierarchy plugs straight into rarityWeight().
  const RARITY_WEIGHT = { 3: 700, 4: 220, 5: 80, 6: 18, 7: 2 };

  let POOL = [];
  let totalCards = 0;

  function rarityOf(card) {
    const n = parseInt(String(card.rarity || "3"), 10);
    return Number.isFinite(n) ? Math.min(7, Math.max(3, n)) : 3;
  }
  function rarityWeight(card) { return RARITY_WEIGHT[rarityOf(card)] || 100; }

  async function loadPool() {
    if (global.CardSystem && typeof global.CardSystem.getAllCards === "function") {
      POOL = global.CardSystem.getAllCards() || [];
    }
    if (!POOL.length) {
      try {
        const r = await fetch("data/cards.json", { cache: "no-store" });
        POOL = (await r.json()).cards || [];
      } catch (e) { console.error("[JutsuSummon] pool load failed", e); }
    }
    totalCards = POOL.length;
  }

  function pickOne() {
    let total = 0;
    for (const c of POOL) total += rarityWeight(c);
    let roll = Math.random() * total;
    for (const c of POOL) { roll -= rarityWeight(c); if (roll <= 0) return c; }
    return POOL[POOL.length - 1];
  }

  function pull(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const card = pickOne();
      const isNew = global.JutsuInventory ? global.JutsuInventory.add(card.id) : true;
      out.push({ card, isNew });
    }
    return out;
  }

  function resolveArt(card) {
    const r = (global.CardSystem && global.CardSystem.resolveCardPath) || ((p) => p);
    const hasFull = !!card.fullArt && card.fullArt !== card.icon;
    return { main: r(hasFull ? card.fullArt : card.icon), icon: r(card.icon) };
  }

  function shinobites() { return (global.Resources && global.Resources.get("shinobites")) || 0; }

  function updateHud() {
    const el = document.getElementById("jutsu-shinobite-count");
    if (el) el.textContent = shinobites();
    const owned = document.getElementById("jutsu-owned-count");
    if (owned && global.JutsuInventory) owned.textContent = `${global.JutsuInventory.count()} / ${totalCards}`;
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "jutsu-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
  }

  function doPull(kind) {
    const cost = kind === "multi" ? COST.multi : COST.single;
    if (shinobites() < cost) { toast("Not enough Shinobites!"); return; }
    const n = kind === "multi" ? COST.multiCount : 1;
    const results = pull(n);
    global.Resources && global.Resources.subtract("shinobites", cost);
    global.DailyMissions && global.DailyMissions.incrementDaily && global.DailyMissions.incrementDaily("daily_summon");
    updateHud();
    showResults(results);
  }

  function showResults(results) {
    let modal = document.getElementById("jutsu-result-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "jutsu-result-modal";
      modal.className = "jutsu-result-modal";
      modal.innerHTML = `<div class="jutsu-result-box">
          <div class="jutsu-result-title">Jutsu Summon</div>
          <div class="jutsu-result-grid" id="jutsu-result-grid"></div>
          <button class="jutsu-result-close" id="jutsu-result-close">OK</button>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
      modal.querySelector("#jutsu-result-close").addEventListener("click", () => modal.classList.remove("open"));
    }
    const grid = modal.querySelector("#jutsu-result-grid");
    grid.innerHTML = results.map(({ card, isNew }) => {
      const art = resolveArt(card);
      const stars = "★".repeat(rarityOf(card));
      return `<div class="jutsu-result-card r${rarityOf(card)}">
          ${isNew ? `<span class="jutsu-new-badge">NEW</span>` : ""}
          <img src="${art.main}" alt="${card.name}" onerror="this.onerror=null;this.src='${art.icon}';">
          <div class="jutsu-result-rarity">${stars}</div>
          <div class="jutsu-result-name">${card.jutsuName || card.name}</div>
        </div>`;
    }).join("");
    modal.classList.add("open");
  }

  function switchTab(which) {
    const stage = document.querySelector(".gacha-stage");
    const panel = document.getElementById("jutsu-summon-panel");
    const legacy = document.querySelector(".banner-carousel-wrap");
    const tabs = document.querySelectorAll(".summon-tab");
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === which));
    const jutsu = which === "jutsu";
    if (stage) stage.style.display = jutsu ? "none" : "";
    if (panel) panel.style.display = jutsu ? "flex" : "none";
    if (legacy && jutsu) legacy.style.display = "none";
    if (jutsu) updateHud();
  }

  function injectUI() {
    const page = document.querySelector(".summon-page");
    const stage = document.querySelector(".gacha-stage");
    if (!page || !stage) { console.warn("[JutsuSummon] summon stage not found"); return; }

    // Tab bar
    const tabBar = document.createElement("div");
    tabBar.className = "summon-tabs";
    tabBar.innerHTML = `
      <button class="summon-tab active" data-tab="characters">Characters</button>
      <button class="summon-tab" data-tab="jutsu">Jutsu Cards</button>`;
    page.insertBefore(tabBar, stage);
    tabBar.querySelectorAll(".summon-tab").forEach(btn =>
      btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

    // Jutsu panel
    const panel = document.createElement("div");
    panel.id = "jutsu-summon-panel";
    panel.className = "jutsu-summon-panel";
    panel.style.display = "none";
    panel.innerHTML = `
      <div class="jutsu-banner">
        <div class="jutsu-banner-title">Jutsu Card Summon</div>
        <div class="jutsu-banner-sub">Acquire jutsu cards to equip on your shinobi.</div>
        <div class="jutsu-collection">Collection: <span id="jutsu-owned-count">0 / 0</span></div>
      </div>
      <div class="jutsu-draw-row">
        <button class="jutsu-draw-btn" id="jutsu-draw-single">
          <span class="jutsu-draw-label">Summon ×1</span>
          <span class="jutsu-draw-cost"><img src="assets/icons/currency/shinobite.png" onerror="this.style.display='none'">${COST.single}</span>
        </button>
        <button class="jutsu-draw-btn multi" id="jutsu-draw-multi">
          <span class="jutsu-draw-label">Summon ×${COST.multiCount}</span>
          <span class="jutsu-draw-cost"><img src="assets/icons/currency/shinobite.png" onerror="this.style.display='none'">${COST.multi}</span>
        </button>
      </div>
      <div class="jutsu-balance">Shinobites: <b id="jutsu-shinobite-count">0</b></div>`;
    stage.parentNode.insertBefore(panel, stage.nextSibling);

    panel.querySelector("#jutsu-draw-single").addEventListener("click", () => doPull("single"));
    panel.querySelector("#jutsu-draw-multi").addEventListener("click", () => doPull("multi"));
  }

  async function init() {
    await loadPool();
    injectUI();
    updateHud();
    console.log(`[JutsuSummon] ready — ${totalCards} cards in pool`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.JutsuSummon = { pull, loadPool, _cost: COST };
})(window);
