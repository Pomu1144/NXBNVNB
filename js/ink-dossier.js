// js/ink-dossier.js — Ink-only decoration for the unit dossier (#char-modal).
// The markup it fills (.ink-dossier-head / .ink-dossier-deco in
// characters.html) carries `hidden` and is only shown by css/ink/characters.css.
//  - the square back arrow forwards to the existing Close button;
//  - the vertical name mirrors #nameplate-name;
//  - an optional Japanese name + quote comes from data/unit-quotes.json
//    (unit id -> { ja, en, jaName }); units without an entry show none.
//  - the same entry may carry the unit's own dossier art and lettering
//    ({ art, nameImg, quoteImg }); those images replace the card art and the
//    typeset name / quote when present. `art` is a full-frame 16:9 painting:
//    the left column shows its left part, the record panel the rest, dimmed.
//  - optional `motto` (English line, top-right of the record) and `role`
//    (e.g. "Lightning Style / Tactical Support", under the version).
// It never touches game state and never delays opening the modal: the quote
// file is fetched once in the background and applied when it arrives.
(function () {
  "use strict";
  const MODAL = document.getElementById("char-modal");
  if (!MODAL) return;
  const $ = (s) => MODAL.querySelector(s);
  const NAME = document.getElementById("nameplate-name");
  const VJA = $(".ink-vname-ja"), VEN = $(".ink-vname-en");
  const QUOTE = $(".ink-dossier-quote"), QJA = $(".ink-quote-ja"), QEN = $(".ink-quote-en");
  const ART = $(".ink-dossier-art"), VIMG = $(".ink-vname-img"), QIMG = $(".ink-quote-img");
  const MOTTO = $(".ink-motto"), ROLE = $(".ink-role");

  // set an optional image; the modal class says whether it is in use
  function setImg(img, src, cls) {
    const on = !!src;
    if (img && on && img.getAttribute("src") !== src) img.src = src;
    if (img && !on) img.removeAttribute("src");
    MODAL.classList.toggle(cls, on);
  }

  $(".ink-dossier-back")?.addEventListener("click", () => document.getElementById("char-modal-close")?.click());

  const isInk = () => document.documentElement.getAttribute("data-skin") === "ink";
  let quotes = null, loading = false;
  function loadQuotes() {
    if (quotes || loading) return;
    loading = true;
    fetch("data/unit-quotes.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((q) => { quotes = q && typeof q === "object" ? q : {}; loading = false; render(); });
  }

  function currentCharId() {
    const uid = MODAL.dataset.currentUid;
    const inst = uid && window.InventoryChar?.getByUid?.(uid);
    return inst ? inst.charId : "";
  }

  function render() {
    if (!MODAL.classList.contains("open") || !isInk()) return;
    if (VEN) VEN.textContent = NAME ? NAME.textContent.trim() : "";
    if (!quotes) { loadQuotes(); }
    const q = (quotes && quotes[currentCharId()]) || null;
    if (VJA) VJA.textContent = (q && q.jaName) || "";
    // display-only line break after the first comma (text itself unchanged)
    if (QJA) QJA.textContent = ((q && q.ja) || "").replace("、", "、\n");
    if (QEN) QEN.textContent = (q && q.en) || "";
    MODAL.classList.toggle("ink-has-janame", !!(q && (q.jaName || q.nameImg)));
    setImg(ART, q && q.art, "ink-has-art");
    // the same full-frame art also runs behind the record panel
    if (q && q.art) MODAL.style.setProperty("--ink-art", `url("${q.art}")`);
    else MODAL.style.removeProperty("--ink-art");
    if (MOTTO) { MOTTO.textContent = (q && q.motto) || ""; MOTTO.hidden = !(q && q.motto); }
    if (ROLE) { ROLE.textContent = (q && q.role) || ""; ROLE.hidden = !(q && q.role); }
    setImg(VIMG, q && q.nameImg, "ink-has-nameimg");
    setImg(QIMG, q && q.quoteImg, "ink-has-quoteimg");
    if (QUOTE) QUOTE.classList.toggle("is-empty", !(q && (q.ja || q.en || q.quoteImg)));
  }

  new MutationObserver(render).observe(MODAL, { attributes: true, attributeFilter: ["class", "data-current-uid"] });
  if (NAME) new MutationObserver(render).observe(NAME, { childList: true, characterData: true, subtree: true });
})();
