// grant-7star-units.js
// ---------------------------------------------------------------------------
// Dev helper: instantly grant the four new 7-star units — Obito, Sakura,
// Itachi and Minato — at BOTH 6S and 7S tiers, straight into your roster.
//
// HOW TO USE:
//   Option A (in-game): redeem the gift code  SEVENSTARS  from the Settings /
//                       Gift Code screen, then claim the rewards in your mailbox.
//
//   Option B (console): open the Characters page, open the browser DevTools
//                       console, paste the snippet below (or just this whole
//                       file) and press Enter. The units appear immediately.
// ---------------------------------------------------------------------------
(function grantSevenStarUnits() {
  const UNITS = ["obito_2201", "sakura_2202", "itachi_2203", "minato_2204"];
  const TIERS = ["6S", "7S"];

  if (!window.InventoryChar || typeof window.InventoryChar.addCopy !== "function") {
    console.error("[grant] InventoryChar not available — run this on the Characters page.");
    return;
  }

  let added = 0;
  UNITS.forEach((charId) => {
    TIERS.forEach((tier) => {
      window.InventoryChar.addCopy(charId, 1, tier);
      added++;
      console.log(`[grant] +1 ${charId} @ ${tier}`);
    });
  });

  if (typeof window.refreshCharacterGrid === "function") {
    window.refreshCharacterGrid();
  }
  console.log(`[grant] Done — granted ${added} copies (${UNITS.length} units × ${TIERS.length} tiers).`);
})();
