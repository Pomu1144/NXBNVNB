// js/recipe-scroll.js — Recipe scroll card (opened makimono) + reveal overlay.
// Needs js/recipe-book.js and css/recipe-scroll.css.
//   RecipeScroll.html(fusion, data, { button, cls })   → card markup
//   RecipeScroll.reveal(results, data, { title })      → unroll overlay; results = [{ fusion, isNew }]
(function (global) {
  "use strict";

  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const starOf = code => parseInt(String(code || ""), 10) || 0;
  const SILHOUETTE = "assets/characters/common/silhouette.png";

  function portrait(ch, tier) {
    if (!ch) return SILHOUETTE;
    return ch.artByTier?.[tier]?.portrait || ch.artByTier?.[ch.starMinCode]?.portrait || ch.portrait || SILHOUETTE;
  }
  // fusions.json sometimes carries a placeholder result tier ("1S"); fall back to the unit's base tier.
  function resultTier(fusion, ch) {
    const t = fusion.result?.tier;
    return ch?.artByTier?.[t] ? t : (ch?.starMinCode || t);
  }
  // Tier a required unit must reach (matches FusionSystem.reqTopTier when Progression is loaded)
  function topTier(ch) {
    if (!ch) return "";
    return global.Progression?.statTopTier?.(ch) || ch.starMaxCode || ch.starMinCode || "";
  }
  function tierText(code) {
    const n = starOf(code);
    if (!n) return "";
    return `★${n}${/B$/i.test(String(code)) ? " Blazing" : ""}`;
  }
  function pathLabel(fusion) {
    if (!fusion.fusionPath) return "Fusion Recipe";
    const who = fusion.fusionPath.split("_")[0];
    return `${who.charAt(0).toUpperCase() + who.slice(1)}'s Legacy`;
  }

  function html(fusion, data, opts = {}) {
    const chars = data.chars || {};
    const req = fusion.requirements || {};
    const c1 = chars[req.unit1], c2 = chars[req.unit2], r = chars[fusion.result?.characterId];
    const rt = resultTier(fusion, r);
    const max = data.paths?.[fusion.fusionPath]?.maxSteps;
    const step = fusion.stepNumber ? `Step ${fusion.stepNumber}${max ? ` / ${max}` : ""}` : "";
    const g = global.RecipeBook.gradeOf(fusion);
    const unit = ch => `
      <div class="rs-unit">
        <img class="rs-portrait" src="${portrait(ch, ch?.starMinCode)}" alt="" draggable="false" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="rs-unit-txt">
          <b>${esc(ch?.name || "Unknown")}</b>
          <i>${esc(ch?.version || "")}</i>
          <span class="rs-min">${tierText(topTier(ch))}<em> · fully awakened</em></span>
        </div>
      </div>`;
    const ryo = req.materials?.ryo;
    const tag = opts.button ? `role="button" tabindex="0" aria-label="${esc(fusion.name)} recipe"` : "";
    return `
      <article class="rscroll${opts.cls ? " " + opts.cls : ""}" data-grade="${g.key}" data-fusion-id="${esc(fusion.id)}" ${tag}>
        <div class="rs-paper">
          <header class="rs-head">
            <span class="rs-kicker">${esc(pathLabel(fusion))}${step ? ` · ${step}` : ""}</span>
            <h3 class="rs-title">${esc(fusion.name || "Fusion")}</h3>
            <span class="rs-grade"><i class="rs-cord"></i>${g.label}</span>
          </header>
          <div class="rs-mats">
            ${unit(c1)}
            <span class="rs-plus" aria-hidden="true">+</span>
            ${unit(c2)}
          </div>
          <p class="rs-req">
            <span class="rs-req-mark" aria-hidden="true">要</span>
            <span>Level ${req.minLevel || 1}</span>
            ${ryo ? `<span class="rs-dot">·</span><span class="rs-ryo"><img src="assets/icons/currency/ryo.png" alt="">${Number(ryo).toLocaleString()} Ryo</span>` : ""}
          </p>
          <div class="rs-result" title="Result: ${esc(r?.name)}">
            <span class="rs-result-cap"><em>Yields</em><b>${esc(r?.name || "?")}</b><small>★${starOf(rt)}</small></span>
            <span class="rs-seal"><span class="rs-seal-in"><img src="${portrait(r, rt)}" alt="${esc(r?.name)}" draggable="false" loading="lazy"></span></span>
          </div>
        </div>
      </article>`;
  }

  /** Small seal (result portrait in a red hanko frame) — used by lists and the x10 grid. */
  function seal(fusion, data, cls = "rc-seal-sm") {
    const r = data.chars?.[fusion.result?.characterId];
    return `<span class="${cls}"><img src="${portrait(r, resultTier(fusion, r))}" alt="" loading="lazy"></span>`;
  }

  function reveal(results, data, opts = {}) {
    document.getElementById("rc-reveal")?.remove();
    const ov = document.createElement("div");
    ov.id = "rc-reveal";
    ov.className = "rc-reveal" + (results.length > 1 ? " is-multi" : "");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    const firstNew = results.find(x => x.isNew) || results[0];
    const actions = `
      <div class="rc-reveal-actions">
        <button class="jjk-btn" type="button" data-act="close">Continue</button>
        <a class="jjk-btn is-primary" href="fusion.html?recipe=${encodeURIComponent(firstNew?.fusion?.id || "")}" data-act="fusion">Open in Fusion</a>
      </div>`;
    if (results.length === 1) {
      const x = results[0];
      ov.innerHTML = `
        <div class="rc-reveal-glow"></div>
        <div class="rc-reveal-inner">
          <div class="rc-reveal-kicker">${opts.title || (x.isNew ? "New Recipe Unsealed" : "Duplicate · +1 Recipe Fragment")}</div>
          <div class="rc-unroll">
            <img class="rc-closed" src="assets/ui/recipes/scroll_closed.webp" alt="">
            ${html(x.fusion, data, { cls: "rc-open" })}
          </div>
          <div class="rc-reveal-note">${x.isNew ? "Added to <b>Fusion › Recipes</b>" : `Already owned — Recipe Fragments: <b>${global.RecipeBook.fragments()}</b>`}</div>
          ${actions}
        </div>`;
    } else {
      ov.innerHTML = `
        <div class="rc-reveal-glow"></div>
        <div class="rc-reveal-inner">
          <div class="rc-reveal-kicker">${opts.title || `${results.length} Scrolls Unsealed`}</div>
          <div class="rc-multi-grid">
            ${results.map((x, i) => `
              <div class="rc-mini" data-grade="${global.RecipeBook.gradeOf(x.fusion).key}" style="--i:${i}">
                <span class="rc-mini-art">
                  <img class="rc-mini-scroll" src="assets/ui/recipes/scroll_closed.webp" alt="">
                  ${seal(x.fusion, data, "rc-mini-seal")}
                </span>
                <b>${esc(x.fusion.name)}</b>
                <small>${x.isNew ? '<em class="rc-new">New</em>' : "+1 Fragment"} · ${global.RecipeBook.gradeOf(x.fusion).label}</small>
              </div>`).join("")}
          </div>
          <div class="rc-reveal-note">Recipe Fragments: <b>${global.RecipeBook.fragments()}</b></div>
          ${actions}
        </div>`;
    }
    document.body.appendChild(ov);
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add("play")));
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); opts.onClose && opts.onClose(); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", e => {
      if (e.target.closest('[data-act="close"]')) close();
    });
    ov.querySelector('[data-act="close"]')?.focus({ preventScroll: true });
    return ov;
  }

  global.RecipeScroll = { html, seal, reveal, portrait, resultTier, esc };
})(window);
