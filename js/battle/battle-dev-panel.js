// js/battle/battle-dev-panel.js - Mission battle developer panel
// Collapsible dev tools for the battle screen (same always-available pattern
// as the Characters / Summon dev panels):
//   - Max chakra for every player unit (field + bench) or a single unit
//   - "Set turn": pick any living unit (ally or enemy) to act right now
// Purely a dev tool; normal play is untouched unless it is used.
(() => {
  "use strict";

  const STORE_KEY = "battle_dev_panel_collapsed_v1";
  const SILHOUETTE = "assets/characters/common/silhouette.png";

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function readCollapsed() {
    try { return localStorage.getItem(STORE_KEY) !== "0"; } catch (e) { return true; }
  }
  function writeCollapsed(v) {
    try { localStorage.setItem(STORE_KEY, v ? "1" : "0"); } catch (e) { /* storage blocked */ }
  }

  const BattleDevPanel = {
    root: null,
    list: null,
    status: null,
    pending: null,      // unit chosen to act as soon as the current turn ends
    _timer: null,
    _hooked: false,

    get core() { return window.BattleManager || null; },
    get turns() { return this.core?.turns || window.BattleTurns || null; },

    /* ===== Chakra ===== */

    refreshChakra(unit) {
      const bm = this.core;
      if (!bm || !unit) return;
      window.BattleChakraWheel?.updateChakraWheel(unit, bm);
      bm.teamHolder?.updateUnitChakra?.(unit, bm);
      bm.chakra?.updateUnitChakraDisplay?.(unit, bm);
      bm.units?.updateUnitDisplay?.(unit, bm);
      const T = this.turns;
      if (T && T.currentUnit === unit && unit.isPlayer && !T.autoMode) {
        T.showActionPanel(unit, bm);
      }
    },

    maxUnitChakra(unit) {
      if (!unit || !unit.stats || unit.stats.hp <= 0) return false;
      unit.chakra = Math.max(1, Number(unit.maxChakra) || 10);
      this.refreshChakra(unit);
      return true;
    },

    maxAllChakra() {
      const bm = this.core;
      if (!bm) return 0;
      const units = [...(bm.activeTeam || []), ...(bm.benchTeam || [])].filter(Boolean);
      let n = 0;
      units.forEach(u => { if (this.maxUnitChakra(u)) n++; });
      this.flash(`Chakra maxed for ${n} unit${n === 1 ? "" : "s"}`);
      this.renderList();
      return n;
    },

    /* ===== Turn control ===== */

    /**
     * Wrap BattleTurns once so a queued pick takes the next turn:
     *  - startTurn: whoever the speed bar picked yields to the queued unit
     *    (the yielding unit keeps its full gauge and acts right after).
     *  - endTurn: start the queued unit immediately instead of waiting for
     *    gauges to fill.
     */
    hookTurns() {
      const T = this.turns;
      if (!T || this._hooked) return;
      this._hooked = true;
      const self = this;
      const origStart = T.startTurn;
      const origEnd = T.endTurn;

      T.startTurn = function (unit, core) {
        const p = self.takePending(core);
        if (p && p !== unit && !this.turnLocked && !core.isPaused) {
          p.speedGauge = core.GAUGE_MAX;
          return origStart.call(this, p, core);
        }
        return origStart.call(this, unit, core);
      };

      T.endTurn = function (core) {
        const r = origEnd.call(this, core);
        const p = self.takePending(core);
        if (p && !this.turnLocked && !core.isPaused) {
          p.speedGauge = core.GAUGE_MAX;
          origStart.call(this, p, core);
        } else if (p) {
          self.pending = p; // battle paused (wave change etc.): keep waiting
        }
        self.renderList();
        return r;
      };
    },

    takePending(core) {
      const p = this.pending;
      this.pending = null;
      if (!p || !core || !Array.isArray(core.combatants)) return null;
      if (!core.combatants.includes(p) || !(p.stats?.hp > 0)) return null;
      return p;
    },

    /**
     * Make `unit` the acting unit now. If the current actor is an idle
     * player waiting for input, its turn is handed over (it keeps its full
     * gauge and acts next). If an attack / AI turn is mid-resolution, the
     * pick is queued and starts the moment that turn ends.
     */
    setTurn(unit) {
      const bm = this.core, T = this.turns;
      if (!bm || !T || !unit) return;
      if (!(unit.stats?.hp > 0) || !bm.combatants?.includes(unit)) {
        this.flash(`${unit.name} can't act`);
        return;
      }
      this.hookTurns();
      const cur = T.currentUnit;
      if (cur === unit) { this.flash(`${unit.name} is already acting`); return; }

      const IM = bm.inputManager;
      const curBusy = cur && (cur._actionBusy || !cur.isPlayer || T.autoMode
        || (IM && IM.currentState === IM.STATES?.DRAGGING));
      if (bm.isPaused || curBusy) {
        this.pending = unit;
        this.flash(cur ? `${unit.name} acts after ${cur.name}` : `${unit.name} acts next`);
        this.renderList();
        return;
      }

      if (cur) {
        // Hand the idle player turn over without running end-of-turn effects.
        bm.inputManager?.resetState?.();
        bm.chakra?.resetChakraMode?.(cur, bm);
        T.hideActionPanel(bm);
        bm.queuedAction = null;
        bm.overlay?.clear?.();
        T.clearEnemyHighlights(bm);
        cur.speedGauge = bm.GAUGE_MAX;
        T.turnLocked = false;
        T.currentUnit = null;
      }
      this.pending = null;
      unit.speedGauge = bm.GAUGE_MAX;
      unit.isPaused = false;
      T.startTurn(unit, bm);
      T.updateSpeedGaugeDisplay(bm);
      this.flash(`${unit.name}'s turn`);
      this.renderList();
    },

    /* ===== UI ===== */

    build() {
      if (this.root) return;
      const root = document.createElement("aside");
      root.id = "battle-dev-panel";
      root.className = "bdev";
      root.innerHTML = `
        <button type="button" class="bdev-tab" id="bdev-tab" aria-controls="bdev-body" title="Dev tools">
          <span class="bdev-tab-ico" aria-hidden="true">🛠</span><span class="bdev-tab-txt">DEV</span>
        </button>
        <div class="bdev-body jjk-panel" id="bdev-body" role="region" aria-label="Battle dev tools">
          <div class="bdev-head">
            <span class="bdev-title">Dev Tools</span>
            <button type="button" class="bdev-close" id="bdev-close" title="Collapse" aria-label="Collapse dev panel">›</button>
          </div>
          <button type="button" class="jjk-btn is-primary bdev-maxall" id="bdev-maxall">Max chakra</button>
          <button type="button" class="jjk-btn bdev-maxall bdev-cutins" id="bdev-cutins" aria-pressed="true">Cut-ins: On</button>
          <div class="bdev-sub">Set turn <small>tap a unit to act now</small></div>
          <div class="bdev-list" id="bdev-list"></div>
          <div class="bdev-status" id="bdev-status" aria-live="polite"></div>
        </div>`;
      document.body.appendChild(root);
      this.root = root;
      this.list = root.querySelector("#bdev-list");
      this.status = root.querySelector("#bdev-status");

      root.querySelector("#bdev-tab").addEventListener("click", () => this.setCollapsed(false));
      root.querySelector("#bdev-close").addEventListener("click", () => this.setCollapsed(true));
      root.querySelector("#bdev-maxall").addEventListener("click", () => this.maxAllChakra());
      const cutBtn = root.querySelector("#bdev-cutins");
      const syncCut = () => {
        const on = window.BattleCutin?.isEnabled?.() !== false;
        cutBtn.textContent = `Cut-ins: ${on ? "On" : "Off"}`;
        cutBtn.setAttribute("aria-pressed", String(on));
      };
      cutBtn.addEventListener("click", () => {
        const C = window.BattleCutin;
        if (!C) return;
        C.setEnabled(!C.isEnabled());
        syncCut();
        this.flash(`Skill cut-ins ${C.isEnabled() ? "on" : "off"}`);
      });
      syncCut();

      this.list.addEventListener("click", e => {
        const row = e.target.closest("[data-uid]");
        if (!row) return;
        const unit = this.findUnit(row.dataset.uid);
        if (!unit) return;
        if (e.target.closest(".bdev-max1")) {
          if (this.maxUnitChakra(unit)) this.flash(`${unit.name}: chakra maxed`);
          this.renderList();
        } else {
          this.setTurn(unit);
        }
      });

      this.list.addEventListener("keydown", e => {
        if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-uid]")) {
          e.preventDefault();
          e.target.click();
        }
      });

      // Keep dev-panel taps from reaching battlefield handlers
      ["pointerdown", "mousedown", "touchstart"].forEach(t =>
        root.addEventListener(t, e => e.stopPropagation(), { passive: true }));

      this.setCollapsed(readCollapsed(), true);
    },

    setCollapsed(v, silent) {
      if (!this.root) return;
      this.root.classList.toggle("is-collapsed", !!v);
      this.root.querySelector("#bdev-tab").setAttribute("aria-expanded", String(!v));
      if (!silent) writeCollapsed(!!v);
      clearInterval(this._timer);
      this._timer = null;
      if (!v) {
        this.hookTurns();
        this.renderList();
        this._timer = setInterval(() => this.renderList(), 400);
      }
    },

    findUnit(id) {
      const bm = this.core;
      return [...(bm?.activeTeam || []), ...(bm?.benchTeam || []), ...(bm?.enemyTeam || [])]
        .find(u => u && String(u.id) === String(id)) || null;
    },

    renderList() {
      const bm = this.core;
      if (!this.list || !bm || this.root.classList.contains("is-collapsed")) return;
      const T = this.turns;
      const cur = T?.currentUnit;
      const players = (bm.activeTeam || []).filter(u => u && bm.combatants?.includes(u));
      const enemies = (bm.enemyTeam || []).filter(Boolean);
      const row = u => {
        const dead = !(u.stats?.hp > 0);
        const cls = ["bdev-unit", u.isPlayer ? "is-ally" : "is-enemy",
          u === cur ? "is-acting" : "", u === this.pending ? "is-pending" : "", dead ? "is-dead" : ""].join(" ");
        const tag = u === cur ? "ACTING" : u === this.pending ? "NEXT" : dead ? "KO" : "";
        const ck = `${Number(u.chakra) || 0}/${Number(u.maxChakra) || 10}`;
        return `<div class="${cls}" data-uid="${esc(u.id)}" role="button" tabindex="0" title="Make ${esc(u.name)} act now">
            <span class="bdev-face"><img src="${esc(u.portrait || SILHOUETTE)}" alt="" draggable="false"
              onerror="this.onerror=null;this.src='${SILHOUETTE}'"></span>
            <span class="bdev-meta"><b>${esc(u.name)}</b><small>CK ${ck}${tag ? ` · <em>${tag}</em>` : ""}</small></span>
            <button type="button" class="bdev-max1" title="Max ${esc(u.name)}'s chakra" aria-label="Max chakra">⚡</button>
          </div>`;
      };
      const html = `<div class="bdev-group">Allies</div>${players.map(row).join("")}`
        + `<div class="bdev-group is-enemy">Enemies</div>${enemies.map(row).join("")}`;
      if (html !== this._lastHTML) {
        this._lastHTML = html;
        this.list.innerHTML = html;
      }
    },

    flash(msg) {
      if (!this.status) return;
      this.status.textContent = msg;
      this.status.classList.remove("show");
      void this.status.offsetWidth;
      this.status.classList.add("show");
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => this.status.classList.remove("show"), 2200);
    },

    init() {
      this.build();
      // BattleTurns loads before this file; hook once the manager is wired.
      const tryHook = () => { if (this.turns) this.hookTurns(); else setTimeout(tryHook, 300); };
      tryHook();
      console.log("[BattleDev] Dev panel ready");
    }
  };

  window.BattleDevPanel = BattleDevPanel;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => BattleDevPanel.init());
  } else {
    BattleDevPanel.init();
  }
})();
