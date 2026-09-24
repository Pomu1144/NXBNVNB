// js/summon/recipe-summon.js
// "Recipes" tab on the summon page: pulls fusion recipe scrolls.
//   Banners: data/summon.json → recipeBanners[] (type "recipe", pool, featured)
//   Cost:    Ninja Pearls — 5 for ×1, 45 for ×10 (same currency as the Shinobi tab)
//   Rates:   Scroll (Step 1–2) 70% · Rare (Step 3–4 / stand-alone) 25% · Secret (Step 5–6) 5%,
//            featured recipes count double inside their grade, ×10 guarantees one Rare or better.
//   Dupes:   +1 Recipe Fragment (js/recipe-book.js)
// The tab button itself lives in the tab bar built by jutsu-summon.js, which
// shows/hides #recipe-summon-panel.
(function (global) {
  "use strict";

  const COST = { single: 5, multi: 45, multiCount: 10 };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const state = { data: null, banners: [], index: 0 };

  function pearls() { return (global.Resources && global.Resources.get("ninja_pearls")) || 0; }

  function poolFor(banner) {
    const all = state.data?.fusions || [];
    const p = banner?.pool;
    if (!p || p === "all") return all.slice();
    const paths = new Set(p.paths || []), ids = new Set(p.ids || []);
    return all.filter(f => paths.has(f.fusionPath) || ids.has(f.id));
  }
  const byId = id => (state.data?.fusions || []).find(f => f.id === id);
  const banner = () => state.banners[state.index];

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "jutsu-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
  }

  function updateHud() {
    const bal = pearls();
    const el = document.getElementById("currency-ninja-pearls");
    if (el) el.textContent = bal.toLocaleString();
    document.getElementById("rc-draw-single")?.classList.toggle("is-short", bal < COST.single);
    document.getElementById("rc-draw-multi")?.classList.toggle("is-short", bal < COST.multi);
    const owned = document.getElementById("rc-owned");
    if (owned && global.RecipeBook) owned.textContent = `${global.RecipeBook.count()} / ${state.data?.fusions.length || 0}`;
    const frag = document.getElementById("rc-fragments");
    if (frag && global.RecipeBook) frag.textContent = global.RecipeBook.fragments();
  }

  // ---------------------------------------------------------------- pulls
  /** Roll + pay + grant. Returns [{ fusion, isNew }] or null when unaffordable. */
  function pull(n) {
    const cost = n > 1 ? COST.multi : COST.single;
    if (pearls() < cost) { toast("Not enough Ninja Pearls!"); return null; }
    const b = banner();
    const rolled = global.RecipeBook.roll(poolFor(b), b?.featured || [], n);
    if (!rolled.length) return null;
    global.Resources.subtract("ninja_pearls", cost);
    const results = rolled.map(f => ({ fusion: f, ...global.RecipeBook.grant(f.id, "summon") }));
    global.DailyMissions?.incrementDaily?.("daily_summon");
    updateHud();
    return results;
  }

  function doPull(n) {
    const results = pull(n);
    if (!results) return;
    global.RecipeScroll.reveal(results, state.data, { onClose: updateHud });
  }

  // ---------------------------------------------------------------- view
  function renderBanner() {
    const b = banner();
    if (!b) return;
    const panel = document.getElementById("recipe-summon-panel");
    panel.querySelectorAll(".rc-rail-item").forEach((it, i) => it.classList.toggle("active", i === state.index));
    const img = panel.querySelector(".rc-banner img");
    img.src = b.image || "assets/ui/recipes/recipe_banner.webp";
    img.style.objectPosition = b.imagePosition || "50% 50%";
    panel.querySelector(".rc-banner-title").textContent = b.name;
    panel.querySelector(".rc-banner-sub").textContent = b.subtitle || "";
    panel.querySelector(".rc-name").textContent = b.name;
    panel.querySelector(".rc-desc").textContent = b.description || "";
    const list = panel.querySelector(".rc-pickup-list");
    const feat = (b.featured || []).map(byId).filter(Boolean).slice(0, 3);
    panel.querySelector(".pickup").hidden = !feat.length;
    list.innerHTML = feat.map(f => {
      const r = state.data.chars[f.result?.characterId];
      return `<div class="pickup-unit rc-pick">
          <span class="rc-pick-scroll"><img src="assets/ui/recipes/scroll_closed.webp" alt=""></span>
          <span class="pickup-text">
            <span class="pickup-name">${esc(f.name)}</span>
            <span class="pickup-ver">Yields ${esc(r?.name || "?")} · ${global.RecipeBook.gradeOf(f).label}${global.RecipeBook.has(f.id) ? " · Owned" : ""}</span>
          </span>
          ${global.RecipeScroll.seal(f, state.data, "rc-seal-sm rc-pick-seal")}
        </div>`;
    }).join("");
    updateHud();
  }

  function openInfo(kind) {
    const modal = document.getElementById("summon-info-modal");
    const title = document.getElementById("sim-modal-title");
    const body = document.getElementById("sim-modal-body");
    if (!modal || !title || !body) return;
    const b = banner(), pool = poolFor(b), feat = new Set(b.featured || []);
    if (kind === "rates") {
      title.textContent = "Recipe Rates";
      const rows = global.RecipeBook.gradeRates(pool).map(r =>
        `<div class="sim-rate-row"><span class="sim-rate-label">${r.grade.label} <small>(${r.count} recipes)</small></span><span class="sim-rate-value">${r.pct.toFixed(r.pct % 1 ? 1 : 0)}%</span></div>`).join("");
      body.innerHTML = `${rows}
        <div class="sim-section-label">Rules</div>
        <p>Scroll = path Steps 1–2 · Rare = Steps 3–4 and stand-alone recipes · Secret = Steps 5–6.</p>
        <p>Featured recipes are twice as likely within their grade. Every ×${COST.multiCount} includes at least one Rare or Secret scroll.</p>
        <p>A recipe you already own becomes +1 Recipe Fragment. Trade ${global.RecipeBook.FRAGMENTS_PER_CHOICE} fragments for any recipe in the Shop.</p>`;
    } else {
      const list = kind === "featured" ? pool.filter(f => feat.has(f.id)) : pool;
      title.textContent = kind === "featured" ? "Featured Recipes" : `Contents · ${pool.length} recipes`;
      body.innerHTML = `<div class="rc-info-list">${list.map(f => {
        const r = state.data.chars[f.result?.characterId];
        return `<div class="rc-info-row">
            ${global.RecipeScroll.seal(f, state.data)}
            <span class="rc-info-text"><b>${esc(f.name)}</b><small>${esc(r?.name || "?")} · ${global.RecipeBook.gradeOf(f).label}${feat.has(f.id) ? " · Rate up" : ""}</small></span>
            <span class="rc-info-owned">${global.RecipeBook.has(f.id) ? "Owned" : ""}</span>
          </div>`;
      }).join("")}</div>`;
    }
    modal.style.display = "";
  }

  const ticket = (kind, n, cost) => `
    <button class="summon-btn tkt tkt-${kind} rc-draw" id="rc-draw-${kind}" type="button" aria-label="Recipe summon, ${n} pull${n > 1 ? "s" : ""}, ${cost} Ninja Pearls">
      <span class="tkt-body" aria-hidden="true"></span>
      <span class="tkt-stub"><span class="tkt-count"><i>×</i>${n}</span><span class="tkt-unit">${n > 1 ? "Pulls" : "Pull"}</span></span>
      <span class="tkt-main">
        <span class="tkt-kicker">Recipe</span>
        <span class="tkt-label summon-btn-label">Unseal</span>
        <span class="tkt-cost summon-btn-cost"><img src="assets/icons/currency/ninjapearl.png" alt="" class="btn-cost-icon" onerror="this.style.display='none'"><span>${cost}</span></span>
      </span>
      <span class="tkt-seal" aria-hidden="true"><b>巻</b></span>
    </button>`;

  function injectPanel() {
    const stage = document.querySelector(".gacha-stage");
    if (!stage || document.getElementById("recipe-summon-panel")) return;
    const panel = document.createElement("div");
    panel.id = "recipe-summon-panel";
    panel.className = "gacha-stage rc-stage";
    panel.style.display = "none";
    panel.innerHTML = `
      <aside class="banner-rail-col">
        <div class="rail-heading">Scrolls</div>
        <div class="rc-rail">
          ${state.banners.map((b, i) => `
            <button class="rc-rail-item" type="button" data-index="${i}" aria-label="${esc(b.name)}">
              <img src="${esc(b.image || "assets/ui/recipes/recipe_banner.webp")}" alt="" style="object-position:${esc(b.imagePosition || "50% 50%")}" draggable="false">
              <span>${esc(b.name)}</span>
            </button>`).join("")}
        </div>
        <div class="rc-rail-foot">
          <div><span>Recipes</span><b id="rc-owned">0 / 0</b></div>
          <div><span>Fragments</span><b id="rc-fragments">0</b></div>
        </div>
      </aside>

      <div class="featured-stage rc-hero" data-view="banner">
        <div class="featured-glow"></div>
        <div class="stage-view stage-view-banner">
          <figure class="rc-banner">
            <img src="" alt="" draggable="false">
            <figcaption>
              <span class="rc-banner-kicker">Recipe Summon</span>
              <span class="rc-banner-title"></span>
              <span class="rc-banner-sub"></span>
            </figcaption>
          </figure>
        </div>
      </div>

      <aside class="draw-col">
        <div class="banner-info-section">
          <div class="banner-kicker">Recipe Summon</div>
          <div class="rc-name"></div>
          <div class="rc-desc"></div>
        </div>
        <section class="pickup">
          <div class="pickup-head"><span>Rate Up</span></div>
          <div class="pickup-list rc-pickup-list"></div>
        </section>
        <div class="summon-buttons">${ticket("single", 1, COST.single)}${ticket("multi", COST.multiCount, COST.multi)}</div>
        <div class="summon-info-buttons">
          <button class="summon-info-btn" type="button" data-info="rates">Rates</button>
          <button class="summon-info-btn" type="button" data-info="featured">Featured</button>
          <button class="summon-info-btn" type="button" data-info="contents">Contents</button>
        </div>
      </aside>`;
    // after the jutsu panel if present, else after the Shinobi stage
    const after = document.getElementById("jutsu-summon-panel") || stage;
    after.parentNode.insertBefore(panel, after.nextSibling);

    panel.querySelectorAll(".rc-rail-item").forEach(it =>
      it.addEventListener("click", () => { state.index = +it.dataset.index; renderBanner(); }));
    panel.querySelector("#rc-draw-single").addEventListener("click", () => doPull(1));
    panel.querySelector("#rc-draw-multi").addEventListener("click", () => doPull(COST.multiCount));
    panel.querySelectorAll("[data-info]").forEach(btn => btn.addEventListener("click", () => openInfo(btn.dataset.info)));
    renderBanner();
  }

  async function init() {
    if (!global.RecipeBook || !global.RecipeScroll) { console.warn("[RecipeSummon] recipe-book/recipe-scroll missing"); return; }
    try {
      const [data, summon] = await Promise.all([
        global.RecipeBook.loadData(),
        fetch("data/summon.json").then(r => r.json()),
      ]);
      state.data = data;
      state.banners = (summon.recipeBanners || []).filter(b => b.type === "recipe" && poolFor(b).length);
    } catch (e) {
      console.error("[RecipeSummon] data load failed", e);
      return;
    }
    if (!state.banners.length) return;
    injectPanel();
    global.addEventListener("recipebook:change", () => { renderBanner(); });
    global.addEventListener("storage", e => { if (e.key === "blazing_resources_v1" || e.key === global.RecipeBook.STORAGE_KEY) updateHud(); });
    // Deep link: summon.html?tab=recipes (tab bar may still be building)
    if (new URLSearchParams(location.search).get("tab") === "recipes") {
      const t0 = Date.now();
      const tick = setInterval(() => {
        if (global.JutsuSummon?.switchTab && document.querySelector('.summon-tab[data-tab="recipes"]')) {
          clearInterval(tick); global.JutsuSummon.switchTab("recipes");
        } else if (Date.now() - t0 > 8000) clearInterval(tick);
      }, 100);
    }
    console.log(`[RecipeSummon] ready — ${state.banners.length} banners`);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.RecipeSummon = { pull, poolFor, onShow: updateHud, _cost: COST, _state: state };
})(window);
