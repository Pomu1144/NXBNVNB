// js/ink-dossier.js — Ink-only decoration for the unit dossier (#char-modal).
// The markup it fills (.ink-dossier-head / .ink-dossier-deco in
// characters.html) carries `hidden` and is only shown by css/ink/characters.css.
//  - the square back arrow forwards to the existing Close button;
//  - the vertical name mirrors #nameplate-name;
//  - an optional Japanese name + quote comes from data/unit-quotes.json
//    (unit id -> { ja, en, jaName }); units without an entry show none.
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
    MODAL.classList.toggle("ink-has-janame", !!(q && q.jaName));
    if (QUOTE) QUOTE.classList.toggle("is-empty", !(q && (q.ja || q.en)));
  }

  new MutationObserver(render).observe(MODAL, { attributes: true, attributeFilter: ["class", "data-current-uid"] });
  if (NAME) new MutationObserver(render).observe(NAME, { childList: true, characterData: true, subtree: true });
})();
