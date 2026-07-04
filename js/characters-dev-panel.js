// js/characters-dev-panel.js
// Developer panel for the Character list.
// Adds a "Max-Out Mode": while enabled, clicking a character card fully maxes
// that instance — auto-evolves it, awakens to the top tier, unlocks every dupe
// ability, and limit-breaks it to the extended level cap (150). Also a
// "Max ALL Owned" button. Purely a dev tool; no effect on normal play.
(function (global) {
  "use strict";

  let BYID = {};
  let maxMode = false;

  async function loadChars() {
    try {
      const res = await fetch("data/characters.json", { cache: "no-store" });
      const data = await res.json();
      (Array.isArray(data) ? data : data.characters || []).forEach(c => { BYID[c.id] = c; });
    } catch (e) {
      console.error("[CharDev] Failed to load characters.json", e);
    }
  }

  // Fully max a single owned instance by uid.
  function maxOutInstance(uid) {
    const IC = global.InventoryChar, P = global.Progression;
    if (!IC || !P) { console.warn("[CharDev] Inventory/Progression not ready"); return false; }
    let inst = IC.getByUid(uid);
    if (!inst) return false;

    // 1. Auto-evolve: follow the evolution chain to the final form.
    if (global.SummonEvolve) {
      let guard = 0;
      while (guard++ < 10) {
        const evo = global.SummonEvolve.evolvedIdOf(inst.charId);
        if (!evo || evo === inst.charId || !BYID[evo]) break;
        IC.updateInstance(uid, { charId: evo, tierCode: null });
        inst = IC.getByUid(uid);
      }
    }

    const char = BYID[inst.charId];
    if (!char) return false;

    // 2. Awaken to the top tier for this (final-form) character.
    const bounds = P.getTierBounds(char) || {};
    const maxCode = bounds.maxCode || inst.tierCode;

    // 3. Limit break to the max + level to the extended cap (e.g. 150).
    let maxLB = 0, cap = P.levelCapForCode(maxCode);
    if (global.LimitBreak) {
      maxLB = global.LimitBreak.getMaxLimitBreakLevel(maxCode) || 0;
      if (maxLB > 0) cap = global.LimitBreak.getExtendedLevelCap(maxCode, maxLB);
    }

    // 4. Unlock every dupe ability.
    const nAb = Array.isArray(char.abilities) ? char.abilities.length : 0;

    IC.updateInstance(uid, {
      tierCode: maxCode,
      level: cap,
      limitBreakLevel: maxLB,
      unlockedAbilities: Array.from({ length: nAb }, (_, i) => i),
      dupeUnlocks: nAb,
      luck: 100,
      cost: 1,
    });
    return true;
  }

  function maxAllOwned() {
    const IC = global.InventoryChar;
    if (!IC) return 0;
    const uids = IC.allInstances().map(i => i.uid);
    let n = 0;
    uids.forEach(uid => { if (maxOutInstance(uid)) n++; });
    return n;
  }

  function refreshGrid() {
    if (typeof global.refreshCharacterGrid === "function") global.refreshCharacterGrid();
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "chardev-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
  }

  // Intercept card clicks while Max-Out Mode is on (capture phase, before the
  // normal detail-modal handler).
  function onGridClickCapture(e) {
    if (!maxMode) return;
    const slot = e.target.closest(".char-slot[data-uid]");
    if (!slot) return;
    e.preventDefault();
    e.stopPropagation();
    const uid = slot.getAttribute("data-uid");
    if (maxOutInstance(uid)) {
      refreshGrid();
      const inst = global.InventoryChar.getByUid(uid);
      const c = inst && BYID[inst.charId];
      toast(`Maxed out ${c ? c.name : "character"} ✓`);
    }
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.className = "chardev-panel";
    panel.id = "chardev-panel";
    panel.innerHTML = `
      <div class="chardev-header">
        <span class="chardev-title">🛠 Dev Tools</span>
        <button class="chardev-close" id="chardev-close" title="Hide">×</button>
      </div>
      <div class="chardev-body">
        <label class="chardev-row">
          <input type="checkbox" id="chardev-maxmode">
          <span>Max-Out Mode <small>(click a character to max it)</small></span>
        </label>
        <button class="chardev-btn" id="chardev-maxall">Max ALL Owned</button>
        <div class="chardev-note">Maxes evolution, awakening, dupes &amp; limit break (Lv 150).</div>
      </div>`;
    document.body.appendChild(panel);

    const fab = document.createElement("button");
    fab.className = "chardev-fab";
    fab.id = "chardev-fab";
    fab.title = "Dev Tools";
    fab.textContent = "🛠";
    document.body.appendChild(fab);

    fab.addEventListener("click", () => panel.classList.toggle("open"));
    panel.querySelector("#chardev-close").addEventListener("click", () => panel.classList.remove("open"));

    const chk = panel.querySelector("#chardev-maxmode");
    chk.addEventListener("change", () => {
      maxMode = chk.checked;
      document.body.classList.toggle("chardev-maxmode-on", maxMode);
    });

    panel.querySelector("#chardev-maxall").addEventListener("click", () => {
      const n = maxAllOwned();
      refreshGrid();
      toast(`Maxed out ${n} character${n === 1 ? "" : "s"} ✓`);
    });
  }

  async function init() {
    await loadChars();
    buildPanel();
    // Capture-phase so we run before the grid's own click -> detail modal.
    document.addEventListener("click", onGridClickCapture, true);
    console.log("[CharDev] Dev panel ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.CharDevTools = { maxOutInstance, maxAllOwned };
})(window);
