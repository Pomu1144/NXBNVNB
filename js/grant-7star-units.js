// grant-7star-units.js
// ---------------------------------------------------------------------------
// Dev helper: instantly grant the 7-star units Obito, Sakura and Minato at
// BOTH 6S and 7S tiers, plus the animated-art 7-star
// units Kaguya (kaguya_9003), Pain (pain_9004) and Jiraiya (jiraiya_9001)
// at 7S (their only tier),
// straight into your roster.
//
// HOW TO USE:
//   Option A (in-game): redeem the gift code  SEVENSTARS  (or  LEGENDS7  for
//                       Kaguya, Pain & Jiraiya) from the Settings / Gift Code screen,
//                       then claim the rewards in your mailbox.
//
//   Option B (console): open the Characters page, open the browser DevTools
//                       console, paste the snippet below (or just this whole
//                       file) and press Enter. The units appear immediately.
// ---------------------------------------------------------------------------
(function grantSevenStarUnits() {
  const UNITS = ["obito_2201", "sakura_2202", "minato_2204"];
  const TIERS = ["6S", "7S"];
  const UNITS_7S_ONLY = ["kaguya_9003", "pain_9004", "jiraiya_9001"];

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
  UNITS_7S_ONLY.forEach((charId) => {
    window.InventoryChar.addCopy(charId, 1, "7S");
    added++;
    console.log(`[grant] +1 ${charId} @ 7S`);
  });

  if (typeof window.refreshCharacterGrid === "function") {
    window.refreshCharacterGrid();
  }
  console.log(`[grant] Done — granted ${added} copies (${UNITS.length} units × ${TIERS.length} tiers + ${UNITS_7S_ONLY.length} at 7S).`);
})();
