// js/skin-shop.js
// Shop › Skins tab: the cosmetic skins catalogue (js/skins.js) as cards with
// the skin art, unit, skin name and price in Ninja Pearls. Purchasing isn't
// live yet, so the buy button shows "Coming soon". When it ships, the buy
// handler spends the pearls and calls Skins.grant(id). Styles: css/skins.css

(function () {
  "use strict";

  const PEARL = { label: "Ninja Pearls", icon: "assets/icons/currency/ninjapearl.png" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function cardHTML(s) {
    const owned = window.Skins.isOwned(s.id);
    const tag = !owned ? "" : window.Skins.ALL_SKINS_UNLOCKED ? "Preview unlocked" : "Owned";
    return `
      <div class="skin-card-art"><img src="${esc(s.thumb)}" alt="" width="256" height="256" loading="lazy" decoding="async" hidden></div>
      ${tag ? `<span class="skin-card-tag">${tag}</span>` : ""}
      <p class="skin-card-unit">${esc(s.unit || "")}</p>
      <h3 class="skin-card-name">${esc(s.name)}</h3>
      <div class="skin-card-foot">
        <span class="skin-card-price" title="${PEARL.label}"><img src="${PEARL.icon}" alt="${PEARL.label}" width="18" height="18">${Number(s.price || 0).toLocaleString()}</span>
        <button type="button" class="lb-btn skin-card-buy" disabled aria-disabled="true">Coming soon</button>
      </div>`;
  }

  function render() {
    const grid = document.getElementById("skins-grid");
    if (!grid || !window.Skins) return;
    const skins = window.Skins.all();
    grid.innerHTML = "";
    for (const s of skins) {
      const card = document.createElement("article");
      card.className = "skin-card";
      card.dataset.skin = s.id;
      card.innerHTML = cardHTML(s);
      const img = card.querySelector(".skin-card-art img");
      img.onload = () => { img.hidden = false; };
      img.onerror = () => img.remove();
      // Art not on the server yet: grey the card out instead of a broken image
      window.Skins.probe(s).then(ok => {
        if (ok) return;
        card.classList.add("is-missing");
        img.remove();
        card.querySelector(".skin-card-art").insertAdjacentHTML("beforeend", '<span class="skin-card-soon">Art coming soon</span>');
      });
      grid.appendChild(card);
    }
    const empty = document.getElementById("skins-empty");
    if (empty) empty.hidden = skins.length > 0;
  }

  window.SkinShop = { render };
})();
