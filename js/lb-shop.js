// js/lb-shop.js
// Shop › Limit Break tab: every character Limit Break crystal from
// data/lb-crystals.json (js/lb-crystals.js), with live search, element chips,
// grade toggle and sort. Cards are built once; filtering only toggles `hidden`
// and sorting re-orders the existing nodes, so 200+ cards stay cheap.
// Images use loading="lazy" so only on-screen crystals are fetched.
// Purchases go through Shop.openPurchaseModal (js/shop.js).

(function () {
  "use strict";

  const ELEMENTS = ["Heart", "Skill", "Body", "Bravery", "Wisdom"];
  const CURRENCY = {
    ryo: { label: "Ryo", icon: "assets/icons/currency/ryo.png" },
    ninja_pearls: { label: "Ninja Pearls", icon: "assets/icons/currency/ninjapearl.png" },
    shinobites: { label: "Shinobites", icon: "assets/icons/currency/shinobite.png" }
  };

  const state = { q: "", variant: "all", elements: new Set(), sort: "name" };
  let cards = [];      // [{ el, item, key }]
  let built = false;
  let wired = false;

  const $ = (id) => document.getElementById(id);
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
  const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function priceOf(item) {
    const [cur, amt] = Object.entries(item.cost || {})[0] || ["ryo", 0];
    return { cur, amt: Number(amt) || 0 };
  }

  function owned(itemId) {
    return window.Resources ? window.Resources.get(itemId) : 0;
  }

  function cardHTML(item, doc) {
    const c = item.crystal;
    const siblings = doc.crystals.filter(x => x.character === c.character);
    const no = siblings.length > 1 ? `<small>#${siblings.indexOf(c) + 1}</small>` : "";
    const v = doc.variants[item.variant] || {};
    const { cur, amt } = priceOf(item);
    const curInfo = CURRENCY[cur] || { label: cur, icon: "" };
    const el = c.element;
    return `
      <div class="lb-art"><img src="${esc(item.icon)}" alt="" width="256" height="256" loading="lazy" decoding="async"></div>
      <span class="lb-grade">${esc(v.label || item.variant)} ★${esc(v.grade || "")}</span>
      <h3 class="lb-name" title="${esc(c.appliesTo.join(" / "))}">${esc(c.character)} ${no}</h3>
      <span class="lb-elem lb-elem-${el.toLowerCase()}"><img src="assets/ui/jjk/orb_${el.toLowerCase()}.webp" alt="" width="18" height="18">${esc(el)}</span>
      <div class="lb-foot">
        <span class="lb-price" title="${esc(curInfo.label)}">${curInfo.icon ? `<img src="${curInfo.icon}" alt="${esc(curInfo.label)}" width="18" height="18">` : ""}${amt.toLocaleString()}</span>
        <span class="lb-owned">Owned <b data-owned>${owned(item.itemId)}</b></span>
      </div>
      <div class="lb-buy">
        <button type="button" class="lb-btn is-primary" data-qty="1">Buy ×1</button>
        <button type="button" class="lb-btn" data-qty="10">×10</button>
      </div>`;
  }

  function build(doc) {
    const grid = $("limitbreak-grid");
    if (!grid) return;
    const items = window.LBCrystals.allItems();
    const frag = document.createDocumentFragment();
    cards = items.map((item, i) => {
      const el = document.createElement("article");
      el.className = `lb-card is-${item.variant}`;
      el.dataset.item = item.itemId;
      el.dataset.element = item.crystal.element;
      el.innerHTML = cardHTML(item, doc);
      frag.appendChild(el);
      return {
        el, item, order: i,
        key: norm([item.crystal.character, ...item.crystal.appliesTo].join(" ")),
        name: item.crystal.character.toLowerCase()
      };
    });
    grid.innerHTML = "";
    grid.appendChild(frag);
    grid.addEventListener("click", onGridClick);
    built = true;
  }

  function onGridClick(e) {
    const btn = e.target.closest(".lb-btn");
    if (!btn || btn.disabled) return;
    const card = btn.closest(".lb-card");
    const item = window.LBCrystals.getItem(card?.dataset.item);
    if (!item || !window.Shop) return;
    const qty = Number(btn.dataset.qty) || 1;
    const c = item.crystal;
    window.Shop.openPurchaseModal({
      id: item.itemId,
      name: item.name,
      icon: item.icon,
      description: `Limit Break material for ${c.appliesTo.join(" / ")} (any version). ` +
        `Works at tiers ${item.tiers.join(", ")}.`,
      cost: item.cost
    }, "limitbreak", qty);
  }

  function compare(a, b) {
    const byName = a.name.localeCompare(b.name) || a.order - b.order;
    switch (state.sort) {
      case "element":
        return ELEMENTS.indexOf(a.item.crystal.element) - ELEMENTS.indexOf(b.item.crystal.element) || byName;
      case "price":
        return priceOf(a.item).amt - priceOf(b.item).amt || byName;
      case "owned":
        return owned(b.item.itemId) - owned(a.item.itemId) || byName;
      default:
        return byName;
    }
  }

  function apply() {
    const grid = $("limitbreak-grid");
    if (!grid) return;
    const q = norm(state.q);
    let shown = 0;
    const chars = new Set();
    for (const c of cards) {
      const ok = (state.variant === "all" || c.item.variant === state.variant) &&
        (state.elements.size === 0 || state.elements.has(c.item.crystal.element)) &&
        (!q || c.key.includes(q));
      c.el.hidden = !ok;
      if (ok) { shown++; chars.add(c.item.crystal.character); }
    }
    const sorted = cards.slice().sort(compare);
    const frag = document.createDocumentFragment();
    sorted.forEach(c => frag.appendChild(c.el));
    grid.appendChild(frag);

    const count = $("lb-count");
    if (count) count.textContent = cards.length
      ? `${shown} of ${cards.length} crystals · ${chars.size} character${chars.size === 1 ? "" : "s"}`
      : "";

    const empty = $("lb-empty");
    if (empty) {
      empty.hidden = shown > 0;
      if (!cards.length) {
        $("lb-empty-title").textContent = "The crystal vault is empty";
        $("lb-empty-sub").textContent = "Limit Break crystals could not be loaded. Try again later.";
        $("lb-reset").hidden = true;
      } else if (!shown) {
        $("lb-empty-title").textContent = state.q ? `No crystals match “${state.q.trim()}”` : "No crystals match these filters";
        $("lb-empty-sub").textContent = "Try another name, grade or element.";
        $("lb-reset").hidden = false;
      }
    }
    grid.hidden = shown === 0;
  }

  function refreshOwned() {
    const R = window.Resources;
    for (const c of cards) {
      const b = c.el.querySelector("[data-owned]");
      if (b) b.textContent = owned(c.item.itemId);
      const { cur, amt } = priceOf(c.item);
      const have = R ? R.get(cur) : 0;
      c.el.querySelectorAll(".lb-btn").forEach(btn => {
        const need = amt * (Number(btn.dataset.qty) || 1);
        const short = have < need;
        btn.disabled = short;
        btn.title = short ? `Not enough ${(CURRENCY[cur] || {}).label || cur} (${need.toLocaleString()} needed)` : "";
      });
    }
    if (state.sort === "owned") apply();
  }

  function wire() {
    if (wired) return;
    wired = true;
    const search = $("lb-search");
    const clear = $("lb-search-clear");
    search?.addEventListener("input", () => {
      state.q = search.value;
      if (clear) clear.hidden = !search.value;
      apply();
    });
    clear?.addEventListener("click", () => {
      search.value = ""; state.q = ""; clear.hidden = true; apply(); search.focus();
    });
    $("lb-variant")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-variant]");
      if (!b) return;
      state.variant = b.dataset.variant;
      document.querySelectorAll("#lb-variant [data-variant]").forEach(x => {
        const on = x === b;
        x.classList.toggle("is-on", on);
        x.setAttribute("aria-pressed", String(on));
      });
      apply();
    });
    $("lb-elements")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-el]");
      if (!b) return;
      const el = b.dataset.el;
      if (state.elements.has(el)) state.elements.delete(el); else state.elements.add(el);
      b.setAttribute("aria-pressed", String(state.elements.has(el)));
      apply();
    });
    $("lb-sort")?.addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
    $("lb-reset")?.addEventListener("click", reset);
  }

  function reset() {
    state.q = ""; state.variant = "all"; state.elements.clear();
    const search = $("lb-search");
    if (search) search.value = "";
    const clear = $("lb-search-clear");
    if (clear) clear.hidden = true;
    document.querySelectorAll("#lb-elements [data-el]").forEach(x => x.setAttribute("aria-pressed", "false"));
    document.querySelectorAll("#lb-variant [data-variant]").forEach(x => {
      const on = x.dataset.variant === "all";
      x.classList.toggle("is-on", on);
      x.setAttribute("aria-pressed", String(on));
    });
    apply();
  }

  async function render() {
    wire();
    if (!window.LBCrystals) return;
    const doc = await window.LBCrystals.load();
    if (!built) build(doc);
    refreshOwned();
    apply();
  }

  window.LBShop = { render, refreshOwned, reset, get state() { return state; } };
})();
