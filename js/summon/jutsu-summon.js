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
    const fill = document.getElementById("jutsu-progress-fill");
    if (fill && global.JutsuInventory && totalCards) fill.style.width = `${Math.min(100, (global.JutsuInventory.count() / totalCards) * 100)}%`;
    // Unaffordable pulls stay clickable (they explain why via toast) but read as dimmed
    const bal = shinobites();
    const single = document.getElementById("jutsu-draw-single");
    const multi = document.getElementById("jutsu-draw-multi");
    if (single) single.classList.toggle("is-short", bal < COST.single);
    if (multi) multi.classList.toggle("is-short", bal < COST.multi);
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

  // ---- Showcase: cycles high-rarity card art inside the gold-framed stage ----
  const showcase = { list: [], idx: 0, timer: null, front: 0 };

  function buildShowcaseList() {
    const hi = POOL.filter(c => rarityOf(c) >= 6 && c.fullArt && c.fullArt !== c.icon);
    const src = hi.length ? hi : POOL.filter(c => c.fullArt && c.fullArt !== c.icon);
    const copy = src.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    showcase.list = copy.slice(0, 24);
  }

  function showCard(step) {
    const panel = document.getElementById("jutsu-summon-panel");
    if (!panel || !showcase.list.length) return;
    const imgs = panel.querySelectorAll(".jutsu-show-img");
    if (imgs.length < 2) return;
    showcase.idx = (showcase.idx + step + showcase.list.length) % showcase.list.length;
    const card = showcase.list[showcase.idx];
    const art = resolveArt(card);
    const next = imgs[1 - showcase.front];
    const cur = imgs[showcase.front];
    next.onload = () => {
      next.classList.add("on");
      cur.classList.remove("on");
      showcase.front = 1 - showcase.front;
      const nm = panel.querySelector("#jutsu-show-name");
      const st = panel.querySelector("#jutsu-show-stars");
      const ty = panel.querySelector("#jutsu-show-type");
      if (nm) nm.textContent = card.name || card.jutsuName || "";
      if (st) st.textContent = "★".repeat(rarityOf(card));
      if (ty) ty.textContent = [card.cardType, card.element && card.element !== "neutral" ? card.element : ""].filter(Boolean).join(" · ");
    };
    // Missing art → skip ahead to the next card
    next.onerror = () => { showcase.list.splice(showcase.idx, 1); if (showcase.list.length) showCard(0); };
    next.src = art.main;
  }

  function startShowcase() {
    stopShowcase();
    if (!showcase.list.length) buildShowcaseList();
    showCard(0);
    showcase.timer = setInterval(() => showCard(1), 4800);
  }
  function stopShowcase() { if (showcase.timer) { clearInterval(showcase.timer); showcase.timer = null; } }

  function ratesHtml() {
    const byR = {};
    let total = 0;
    for (const c of POOL) { const r = rarityOf(c); const w = rarityWeight(c); byR[r] = (byR[r] || 0) + w; total += w; }
    if (!total) return "";
    return Object.keys(byR).sort((a, b) => b - a).map(r => {
      const pct = (byR[r] / total) * 100;
      const txt = pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1);
      return `<div class="jutsu-rate-row r${r}"><span class="jutsu-rate-star">${"★".repeat(+r)}</span><span class="jutsu-rate-pct">${txt}%</span></div>`;
    }).join("");
  }

  function switchTab(which) {
    const stage = document.querySelector(".gacha-stage");
    const panel = document.getElementById("jutsu-summon-panel");
    const legacy = document.querySelector(".banner-carousel-wrap");
    const tabs = document.querySelectorAll(".summon-tab");
    tabs.forEach(t => {
      const on = t.dataset.tab === which;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    const jutsu = which === "jutsu";
    const recipes = which === "recipes";
    const recipePanel = document.getElementById("recipe-summon-panel");
    if (stage) stage.style.display = (jutsu || recipes) ? "none" : "";
    if (panel) panel.style.display = jutsu ? "grid" : "none";
    if (recipePanel) recipePanel.style.display = recipes ? "" : "none";
    if (legacy && (jutsu || recipes)) legacy.style.display = "none";
    if (jutsu) { updateHud(); startShowcase(); } else stopShowcase();
    if (recipes) global.RecipeSummon?.onShow?.();
  }

  function injectUI() {
    const page = document.querySelector(".summon-page");
    const stage = document.querySelector(".gacha-stage");
    if (!page || !stage) { console.warn("[JutsuSummon] summon stage not found"); return; }

    // Segmented tab bar — lives in the top bar between Back and the currency HUD
    const tabBar = document.createElement("div");
    tabBar.className = "summon-tabs";
    tabBar.setAttribute("role", "tablist");
    tabBar.innerHTML = `
      <button class="summon-tab jjk-tab active" type="button" role="tab" aria-selected="true" data-tab="characters">Shinobi</button>
      <button class="summon-tab jjk-tab" type="button" role="tab" aria-selected="false" data-tab="jutsu">Jutsu Cards</button>
      <button class="summon-tab jjk-tab" type="button" role="tab" aria-selected="false" data-tab="recipes">Recipes</button>`;
    const topbar = page.querySelector(".summon-topbar");
    const hud = topbar && topbar.querySelector(".summon-currency-hud");
    if (topbar && hud) topbar.insertBefore(tabBar, hud);
    else page.insertBefore(tabBar, stage);
    tabBar.querySelectorAll(".summon-tab").forEach(btn =>
      btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

    // Jutsu panel — mirrors the Shinobi stage: rates rail | framed showcase | draw panel
    const panel = document.createElement("div");
    panel.id = "jutsu-summon-panel";
    panel.className = "jutsu-summon-panel";
    panel.style.display = "none";
    panel.innerHTML = `
      <aside class="jutsu-rail">
        <div class="rail-heading">Drop Rates</div>
        <div class="jutsu-rates">${ratesHtml()}</div>
        <div class="jutsu-rail-foot">
          <div class="jutsu-rail-label">Collection</div>
          <div class="jutsu-collection"><span id="jutsu-owned-count">0 / 0</span></div>
          <div class="jutsu-progress"><div class="jutsu-progress-fill" id="jutsu-progress-fill"></div></div>
        </div>
      </aside>

      <div class="jutsu-stage">
        <div class="jutsu-stage-glow"></div>
        <div class="jutsu-show-frame">
          <div class="jutsu-show-clip">
            <img class="jutsu-show-img on" alt="" draggable="false">
            <img class="jutsu-show-img" alt="" draggable="false">
          </div>
          <div class="jutsu-show-caption">
            <span class="jutsu-show-stars" id="jutsu-show-stars"></span>
            <span class="jutsu-show-name" id="jutsu-show-name"></span>
            <span class="jutsu-show-type" id="jutsu-show-type"></span>
          </div>
        </div>
        <button class="stage-arrow left" id="jutsu-show-prev" type="button" aria-label="Previous card"></button>
        <button class="stage-arrow right" id="jutsu-show-next" type="button" aria-label="Next card"></button>
      </div>

      <aside class="jutsu-draw-col">
        <div class="jutsu-banner">
          <div class="jutsu-banner-kicker">Jutsu Scroll Summon</div>
          <div class="jutsu-banner-title">Jutsu Cards</div>
          <div class="jutsu-banner-sub">Acquire jutsu cards to equip on your shinobi.</div>
        </div>
        <div class="jutsu-balance">
          <img src="assets/icons/currency/shinobite.png" alt="" onerror="this.style.display='none'">
          <span>Shinobites</span><b id="jutsu-shinobite-count">0</b>
        </div>
        <div class="summon-buttons jutsu-draw-row">
          <button class="jutsu-draw-btn tkt tkt-single" id="jutsu-draw-single" type="button" aria-label="Single jutsu summon, 1 pull">
            <span class="tkt-body" aria-hidden="true"></span>
            <span class="tkt-stub"><span class="tkt-count"><i>×</i>1</span><span class="tkt-unit">Pull</span></span>
            <span class="tkt-main">
              <span class="tkt-kicker">Jutsu</span>
              <span class="tkt-label">Summon</span>
              <span class="tkt-cost"><img src="assets/icons/currency/shinobite.png" alt="" onerror="this.style.display='none'"><span>${COST.single}</span></span>
            </span>
            <span class="tkt-seal" aria-hidden="true"><b>召</b></span>
          </button>
          <button class="jutsu-draw-btn multi tkt tkt-multi" id="jutsu-draw-multi" type="button" aria-label="Multi jutsu summon, ${COST.multiCount} pulls">
            <span class="tkt-body" aria-hidden="true"></span>
            <span class="tkt-stub"><span class="tkt-count"><i>×</i>${COST.multiCount}</span><span class="tkt-unit">Pulls</span></span>
            <span class="tkt-main">
              <span class="tkt-kicker">Jutsu</span>
              <span class="tkt-label">Summon</span>
              <span class="tkt-cost"><img src="assets/icons/currency/shinobite.png" alt="" onerror="this.style.display='none'"><span>${COST.multi}</span></span>
            </span>
            <span class="tkt-seal" aria-hidden="true"><b>召</b></span>
          </button>
        </div>
      </aside>`;
    stage.parentNode.insertBefore(panel, stage.nextSibling);

    panel.querySelector("#jutsu-draw-single").addEventListener("click", () => doPull("single"));
    panel.querySelector("#jutsu-draw-multi").addEventListener("click", () => doPull("multi"));
    panel.querySelector("#jutsu-show-prev").addEventListener("click", () => { startShowcaseAt(-1); });
    panel.querySelector("#jutsu-show-next").addEventListener("click", () => { startShowcaseAt(1); });
  }

  // Manual nav restarts the auto-advance timer so it doesn't jump right after a click
  function startShowcaseAt(step) {
    stopShowcase();
    showCard(step);
    showcase.timer = setInterval(() => showCard(1), 4800);
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

  global.JutsuSummon = { pull, loadPool, switchTab, _cost: COST };
})(window);
