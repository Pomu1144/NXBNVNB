// js/battle/battle-action-panel-toggle.js - Collapsible battle action panel
// A gold-rimmed tab on the right edge of #action-panel slides the panel off
// to the left. While collapsed only the tab stays on screen, showing the
// acting unit's portrait and chakra so it's clear whose turn it is. Units
// can still act through card taps, sprite taps and drags; tapping the tab
// expands the panel again.
// State: localStorage (per device class). Default: expanded on desktop,
// collapsed on mobile landscape (the button pad covers the formation there).
(() => {
  "use strict";

  const KEY = () => `battle_action_panel_collapsed_v1_${document.documentElement.classList.contains("is-mobile") ? "mobile" : "desktop"}`;

  function readCollapsed() {
    try {
      const v = localStorage.getItem(KEY());
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) { /* storage blocked */ }
    return document.documentElement.classList.contains("is-mobile");
  }
  function writeCollapsed(v) {
    try { localStorage.setItem(KEY(), v ? "1" : "0"); } catch (e) { /* storage blocked */ }
  }

  const ActionPanelToggle = {
    panel: null,
    handle: null,

    init() {
      const panel = document.getElementById("action-panel");
      if (!panel || this.panel) return;
      this.panel = panel;

      // A div (not <button>) so the panel's generic button skin doesn't apply.
      const h = document.createElement("div");
      h.className = "ap-handle";
      h.setAttribute("role", "button");
      h.tabIndex = 0;
      h.setAttribute("aria-controls", "action-panel");
      h.innerHTML = `
        <span class="ap-mini" aria-hidden="true">
          <img class="ap-mini-portrait" alt="" draggable="false">
          <b class="ap-mini-chakra"></b>
        </span>
        <svg class="ap-chev" viewBox="0 0 12 20" aria-hidden="true" focusable="false">
          <path d="M9 3 3 10l6 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      // Keep the tap from reaching the battlefield / drag systems.
      ["pointerdown", "mousedown", "touchstart"].forEach(ev =>
        h.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
      h.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        this.set(!panel.classList.contains("ap-collapsed"), true);
      });
      h.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); h.click(); }
      });
      panel.appendChild(h);
      this.handle = h;

      // Mirror the acting unit's portrait / chakra into the tab.
      const sync = () => this.syncMini();
      const mo = new MutationObserver(sync);
      ["action-portrait", "action-chakra", "action-name"].forEach(id => {
        const el = document.getElementById(id);
        if (el) mo.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
      });
      mo.observe(panel, { attributes: true, attributeFilter: ["class"] });

      this.set(readCollapsed(), false);
      sync();
    },

    set(collapsed, save) {
      const p = this.panel;
      if (!p) return;
      p.classList.toggle("ap-collapsed", !!collapsed);
      const h = this.handle;
      if (h) {
        h.setAttribute("aria-expanded", collapsed ? "false" : "true");
        const label = collapsed ? "Show action panel" : "Hide action panel";
        h.setAttribute("aria-label", label);
        h.title = label;
      }
      if (save) writeCollapsed(!!collapsed);
      // Expanding may cover the acting unit again: let it step clear.
      if (!collapsed) {
        const bm = window.BattleManager, u = bm?.turns?.currentUnit;
        if (u && u.isPlayer) setTimeout(() => bm.turns.keepUnitClearOfPanel?.(u, bm), 320);
      }
    },

    isCollapsed() { return !!this.panel?.classList.contains("ap-collapsed"); },

    syncMini() {
      const h = this.handle;
      if (!h) return;
      const src = document.getElementById("action-portrait")?.getAttribute("src") || "";
      const img = h.querySelector(".ap-mini-portrait");
      if (img && img.getAttribute("src") !== src) img.setAttribute("src", src);
      const u = window.BattleManager?.turns?.currentUnit;
      const txt = u ? `${u.chakra ?? 0}/${u.maxChakra ?? 10}` : "";
      const b = h.querySelector(".ap-mini-chakra");
      if (b && b.textContent !== txt) b.textContent = txt;
      if (u) h.dataset.unitName = u.name || "";
    }
  };

  window.BattleActionPanelToggle = ActionPanelToggle;
  const go = () => ActionPanelToggle.init();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  // Chakra changes don't touch #action-chakra outside showActionPanel.
  setInterval(() => { if (ActionPanelToggle.isCollapsed()) ActionPanelToggle.syncMini(); }, 400);
})();
