// js/battle/battle-dev-panel.js - Mission battle developer panel
// Collapsible dev tools for the battle screen. Same gate as the Characters /
// Summon dev panels: only built when window.DEV_MODE is on (js/dev-mode.js,
// open any page with ?dev=1; ?dev=0 turns it off).
//
//   Turns   - "Set turn": tap any living unit (ally or enemy) to act now
//           - Skip turn: end the current unit's turn without acting
//           - End wave: kill every enemy (normal wave-complete flow runs)
//   Chakra  - Max one unit (CK button on its row) or every player unit
//           - Unlimited chakra (player units stay full)
//   HP      - Full heal (player units), God mode (player HP never drops)
//           - Set an enemy to 1 HP (1HP button on its row)
//   Skills  - Remove cooldowns now, or a persistent "No cooldowns" mode
//   Misc    - Cut-ins on/off, clear the saved (refresh-resume) battle
//
// Every hook is wrapped so a missing module never throws; with the panel
// closed and no mode switched on, normal play is untouched.
(() => {
  "use strict";

  const STORE_KEY = "battle_dev_panel_collapsed_v1";
  const NOCD_KEY = "battle_dev_nocd_v1";
  const INF_KEY = "battle_dev_infchakra_v1";
  const GOD_KEY = "battle_dev_god_v1";
  const SILHOUETTE = "assets/characters/common/silhouette.png";

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  const safe = (label, fn) => {
    try { return fn(); } catch (e) { console.warn(`[BattleDev] ${label} failed`, e); return undefined; }
  };
  const alive = u => !!u && Number(u.stats?.hp) > 0;

  const BattleDevPanel = {
    root: null,
    list: null,
    status: null,
    pending: null,      // unit chosen to act as soon as the current turn ends
    noCooldowns: false,
    infChakra: false,
    god: false,
    _timer: null,
    _modeTimer: null,
    _hooked: false,
    _guarded: new WeakSet(), // stats objects carrying the god-mode hp guard

    get core() { return window.BattleManager || null; },
    get turns() { return this.core?.turns || window.BattleTurns || null; },

    playerUnits() {
      const bm = this.core;
      return [...(bm?.activeTeam || []), ...(bm?.benchTeam || [])].filter(Boolean);
    },

    /* ===== HUD refresh ===== */

    refreshUnit(unit) {
      const bm = this.core;
      if (!bm || !unit) return;
      safe("chakra wheel", () => window.BattleChakraWheel?.updateChakraWheel?.(unit, bm));
      safe("holder chakra", () => bm.teamHolder?.updateUnitChakra?.(unit, bm));
      safe("holder hp", () => unit.isPlayer && bm.teamHolder?.updateUnitHP?.(unit));
      safe("chakra display", () => bm.chakra?.updateUnitChakraDisplay?.(unit, bm));
      safe("unit display", () => bm.units?.updateUnitDisplay?.(unit, bm));
      const T = this.turns;
      if (T && T.currentUnit === unit && unit.isPlayer && !T.autoMode) {
        safe("action panel", () => T.showActionPanel(unit, bm));
      }
    },

    /* ===== Chakra ===== */

    maxUnitChakra(unit, quiet) {
      if (!alive(unit)) return false;
      const max = Math.max(1, Number(unit.maxChakra) || 10);
      if (quiet && unit.chakra === max) return false;
      unit.chakra = max;
      this.refreshUnit(unit);
      return true;
    },

    maxAllChakra() {
      let n = 0;
      this.playerUnits().forEach(u => { if (this.maxUnitChakra(u)) n++; });
      this.flash(`Chakra maxed for ${n} unit${n === 1 ? "" : "s"}`);
      this.renderList();
      return n;
    },

    /* ===== Cooldowns ===== */

    // Zero the jutsu / ultimate cooldowns of every player unit (field + bench).
    clearCooldowns(silent) {
      let n = 0;
      this.playerUnits().forEach(u => {
        if ((u.jutsuCooldown || 0) > 0 || (u.ultimateCooldown || 0) > 0) {
          u.jutsuCooldown = 0;
          u.ultimateCooldown = 0;
          this.refreshUnit(u);
          n++;
        }
      });
      if (!silent) this.flash(n ? `Cooldowns cleared for ${n} unit${n === 1 ? "" : "s"}` : "No cooldowns to clear");
      return n;
    },

    /* ===== HP ===== */

    fullHeal() {
      const bm = this.core;
      let n = 0;
      this.playerUnits().forEach(u => {
        if (!alive(u)) return;
        const max = Number(u.stats.maxHP) || u.stats.hp;
        if (u.stats.hp < max) { u.stats.hp = max; this.refreshUnit(u); n++; }
      });
      safe("team hp", () => bm?.updateTeamHP?.());
      this.flash(n ? `Healed ${n} unit${n === 1 ? "" : "s"}` : "Team already at full HP");
      this.renderList();
    },

    // God mode: the player units' stats.hp becomes an accessor that ignores
    // any decrease while the mode is on. Damage is applied in many places
    // (combat, buffs, domains, bosses), so guarding the value itself covers
    // all of them without touching the damage code.
    guardUnit(u) {
      const s = u?.stats;
      if (!s || this._guarded.has(s)) return;
      let v = Number(s.hp) || 0;
      const self = this;
      Object.defineProperty(s, "hp", {
        configurable: true,
        enumerable: true,
        get() { return v; },
        set(n) {
          n = Number(n);
          if (self.god && n < v) return;
          v = n;
        },
      });
      this._guarded.add(s);
    },

    unguardUnit(u) {
      const s = u?.stats;
      if (!s || !this._guarded.has(s)) return;
      const v = s.hp;
      delete s.hp;
      s.hp = v;
      this._guarded.delete(s);
    },

    setGod(on) {
      this.god = !!on;
      store.set(GOD_KEY, on ? "1" : "0");
      this.playerUnits().forEach(u => (on ? this.guardUnit(u) : this.unguardUnit(u)));
      this.syncModeTimer();
    },

    setEnemyHP1(unit) {
      if (!unit || unit.isPlayer || !alive(unit)) return false;
      unit.stats.hp = 1;
      this.refreshUnit(unit);
      return true;
    },

    /* ===== Persistent modes ===== */

    setNoCooldowns(on) {
      this.noCooldowns = !!on;
      store.set(NOCD_KEY, on ? "1" : "0");
      if (on) this.clearCooldowns(true);
      this.syncModeTimer();
    },

    setInfChakra(on) {
      this.infChakra = !!on;
      store.set(INF_KEY, on ? "1" : "0");
      if (on) this.playerUnits().forEach(u => this.maxUnitChakra(u, true));
      this.syncModeTimer();
    },

    // One light interval keeps the on/off modes applied (new bench swaps,
    // chakra spent mid-turn, cooldowns set by a skill). Off when no mode is on.
    syncModeTimer() {
      const any = this.noCooldowns || this.infChakra || this.god;
      if (!any) { clearInterval(this._modeTimer); this._modeTimer = null; return; }
      if (this._modeTimer) return;
      this._modeTimer = setInterval(() => safe("mode tick", () => {
        if (!this.core) return;
        if (this.noCooldowns) this.clearCooldowns(true);
        if (this.infChakra) this.playerUnits().forEach(u => this.maxUnitChakra(u, true));
        if (this.god) this.playerUnits().forEach(u => this.guardUnit(u));
      }), 250);
    },

    /* ===== Turn control ===== */

    /**
     * Wrap BattleTurns once so a queued pick takes the next turn:
     *  - startTurn: whoever the speed bar picked yields to the queued unit
     *    (the yielding unit keeps its full gauge and acts right after).
     *  - endTurn: start the queued unit immediately instead of waiting for
     *    gauges to fill.
     * Also wraps BattleCombat.performAITurn so an AI turn skipped from the
     * panel before it began does not still attack.
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

      const C = window.BattleCombat;
      if (C && typeof C.performAITurn === "function") {
        const origAI = C.performAITurn;
        C.performAITurn = function (unit, core, onDone) {
          if (self._skippedAI && self._skippedAI === unit) {
            self._skippedAI = null;
            return undefined; // its turn was already ended by "Skip turn"
          }
          return origAI.call(this, unit, core, onDone);
        };
      }
    },

    takePending(core) {
      const p = this.pending;
      this.pending = null;
      if (!p || !core || !Array.isArray(core.combatants)) return null;
      if (!core.combatants.includes(p) || !alive(p)) return null;
      return p;
    },

    // Is the acting unit an idle player waiting for input?
    curIsIdlePlayer() {
      const bm = this.core, T = this.turns, cur = T?.currentUnit;
      if (!cur) return false;
      const IM = bm?.inputManager;
      return !(cur._actionBusy || !cur.isPlayer || T.autoMode
        || (IM && IM.currentState === IM.STATES?.DRAGGING));
    },

    // Drop the idle player's turn UI without running end-of-turn effects.
    releaseIdlePlayer() {
      const bm = this.core, T = this.turns, cur = T?.currentUnit;
      if (!bm || !T || !cur) return;
      safe("input reset", () => bm.inputManager?.resetState?.());
      safe("chakra mode", () => bm.chakra?.resetChakraMode?.(cur, bm));
      safe("hide panel", () => T.hideActionPanel(bm));
      bm.queuedAction = null;
      safe("overlay", () => bm.overlay?.clear?.());
      safe("highlights", () => T.clearEnemyHighlights(bm));
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
      if (!alive(unit) || !bm.combatants?.includes(unit)) {
        this.flash(`${unit.name} can't act`);
        return;
      }
      this.hookTurns();
      const cur = T.currentUnit;
      if (cur === unit) { this.flash(`${unit.name} is already acting`); return; }

      if (bm.isPaused || (cur && !this.curIsIdlePlayer())) {
        this.pending = unit;
        this.flash(cur ? `${unit.name} acts after ${cur.name}` : `${unit.name} acts next`);
        this.renderList();
        return;
      }

      if (cur) {
        this.releaseIdlePlayer();
        cur.speedGauge = bm.GAUGE_MAX;
        T.turnLocked = false;
        T.currentUnit = null;
      }
      this.pending = null;
      unit.speedGauge = bm.GAUGE_MAX;
      unit.isPaused = false;
      safe("start turn", () => T.startTurn(unit, bm));
      safe("gauge", () => T.updateSpeedGaugeDisplay(bm));
      this.flash(`${unit.name}'s turn`);
      this.renderList();
    },

    /**
     * End the current turn without acting (normal endTurn: cooldowns tick,
     * gauge resets). An attack already playing out is left to finish.
     */
    skipTurn() {
      const bm = this.core, T = this.turns, cur = T?.currentUnit;
      if (!bm || !T) return;
      if (!cur) { this.flash("No one is acting"); return; }
      if (cur._actionBusy) { this.flash(`${cur.name} is mid-attack, try again`); return; }
      this.hookTurns();
      if (cur.isPlayer && !T.autoMode) this.releaseIdlePlayer();
      else this._skippedAI = cur; // its delayed AI action must not fire
      safe("end turn", () => T.endTurn(bm));
      this.flash(`Skipped ${cur.name}'s turn`);
      this.renderList();
    },

    /**
     * Kill every enemy on the field. Runs the game's own wave-complete path
     * (core.checkBattleEnd -> BattleMissions.handleWaveComplete), so the next
     * wave / stage / victory screen follows exactly as in play.
     */
    killAllEnemies() {
      const bm = this.core, T = this.turns;
      if (!bm) return 0;
      const foes = (bm.enemyTeam || []).filter(alive);
      if (!foes.length) { this.flash("No enemies left"); return 0; }
      // An idle player turn would stay locked through the wave change.
      if (T?.currentUnit && this.curIsIdlePlayer()) {
        this.releaseIdlePlayer();
        safe("end turn", () => T.endTurn(bm));
      }
      this.pending = null;
      foes.forEach(u => {
        u.stats.hp = 0;
        this.refreshUnit(u);
      });
      safe("team hp", () => bm.updateTeamHP?.());
      safe("battle end", () => bm.checkBattleEnd?.());
      this.flash(`Defeated ${foes.length} enem${foes.length === 1 ? "y" : "ies"}`);
      this.renderList();
      return foes.length;
    },

    /* ===== UI ===== */

    build() {
      if (this.root) return;
      const root = document.createElement("aside");
      root.id = "battle-dev-panel";
      root.className = "bdev";
      root.innerHTML = `
        <button type="button" class="bdev-tab" id="bdev-tab" aria-controls="bdev-body" title="Dev tools">DEV</button>
        <div class="bdev-body" id="bdev-body" role="region" aria-label="Battle dev tools">
          <div class="bdev-head">
            <span class="bdev-title">Battle Dev</span>
            <button type="button" class="bdev-close" id="bdev-close" title="Close" aria-label="Close dev panel">&times;</button>
          </div>
          <div class="bdev-scroll">
            <div class="bdev-sec">Turn</div>
            <div class="bdev-grid">
              <button type="button" class="bdev-btn" id="bdev-skip">Skip turn</button>
              <button type="button" class="bdev-btn is-warn" id="bdev-killall" title="Kill every enemy (wave clear)">End wave</button>
            </div>
            <div class="bdev-sec">Chakra</div>
            <div class="bdev-grid">
              <button type="button" class="bdev-btn" id="bdev-maxall">Max all</button>
              <button type="button" class="bdev-btn bdev-tog" id="bdev-inf" aria-pressed="false">Unlimited</button>
            </div>
            <div class="bdev-sec">HP</div>
            <div class="bdev-grid">
              <button type="button" class="bdev-btn" id="bdev-heal">Full heal</button>
              <button type="button" class="bdev-btn bdev-tog" id="bdev-god" aria-pressed="false" title="Player units take no damage">God mode</button>
            </div>
            <div class="bdev-sec">Skills</div>
            <div class="bdev-grid">
              <button type="button" class="bdev-btn" id="bdev-clearcd">Clear CDs</button>
              <button type="button" class="bdev-btn bdev-tog" id="bdev-nocd" aria-pressed="false" title="Jutsu / ultimate always off cooldown">No CDs</button>
            </div>
            <div class="bdev-sec">Misc</div>
            <div class="bdev-grid">
              <button type="button" class="bdev-btn bdev-tog" id="bdev-cutins" aria-pressed="true">Cut-ins</button>
              <button type="button" class="bdev-btn bdev-tog" id="bdev-sharingan" aria-pressed="true" title="Sharingan flash over Uchiha units before a jutsu / ultimate">Sharingan</button>
              <button type="button" class="bdev-btn" id="bdev-clearsave" title="Delete the refresh-resume snapshot; reload to start this battle fresh">Clear save</button>
            </div>
            <div class="bdev-sec">Units <small>tap a row to give it the turn</small></div>
            <div class="bdev-list" id="bdev-list"></div>
          </div>
          <div class="bdev-status" id="bdev-status" aria-live="polite"></div>
        </div>`;
      document.body.appendChild(root);
      this.root = root;
      this.list = root.querySelector("#bdev-list");
      this.status = root.querySelector("#bdev-status");
      const $ = sel => root.querySelector(sel);
      const on = (sel, fn) => $(sel).addEventListener("click", () => safe(sel, fn));

      on("#bdev-tab", () => this.setCollapsed(false));
      on("#bdev-close", () => this.setCollapsed(true));
      on("#bdev-skip", () => this.skipTurn());
      on("#bdev-killall", () => this.killAllEnemies());
      on("#bdev-maxall", () => this.maxAllChakra());
      on("#bdev-heal", () => this.fullHeal());
      on("#bdev-clearcd", () => this.clearCooldowns());
      on("#bdev-clearsave", () => {
        if (!window.BattleSave?.clearSaved) { this.flash("Battle save not loaded"); return; }
        window.BattleSave.clearSaved("dev panel", true);
        this.flash("Saved battle cleared (reload starts fresh)");
      });

      const toggle = (sel, label, get, set) => {
        const btn = $(sel);
        const sync = () => btn.setAttribute("aria-pressed", String(!!get()));
        btn.addEventListener("click", () => safe(sel, () => {
          set(!get());
          sync();
          this.flash(`${label} ${get() ? "on" : "off"}`);
        }));
        sync();
      };
      toggle("#bdev-inf", "Unlimited chakra", () => this.infChakra, v => this.setInfChakra(v));
      toggle("#bdev-god", "God mode", () => this.god, v => this.setGod(v));
      toggle("#bdev-nocd", "No cooldowns", () => this.noCooldowns, v => this.setNoCooldowns(v));
      toggle("#bdev-cutins", "Skill cut-ins",
        () => window.BattleCutin?.isEnabled?.() !== false,
        v => window.BattleCutin?.setEnabled?.(v));
      toggle("#bdev-sharingan", "Sharingan flash",
        () => window.BattleCombat?.sharinganEnabled?.() !== false,
        v => window.BattleCombat?.setSharinganEnabled?.(v));

      this.list.addEventListener("click", e => safe("unit row", () => {
        const row = e.target.closest("[data-uid]");
        if (!row) return;
        const unit = this.findUnit(row.dataset.uid);
        if (!unit) return;
        if (e.target.closest(".bdev-ck")) {
          if (this.maxUnitChakra(unit)) this.flash(`${unit.name}: chakra maxed`);
          this.renderList();
        } else if (e.target.closest(".bdev-hp1")) {
          if (this.setEnemyHP1(unit)) this.flash(`${unit.name}: HP set to 1`);
          this.renderList();
        } else {
          this.setTurn(unit);
        }
      }));

      this.list.addEventListener("keydown", e => {
        if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-uid]")) {
          e.preventDefault();
          e.target.click();
        }
      });

      // Keep dev-panel taps from reaching battlefield handlers
      ["pointerdown", "mousedown", "touchstart"].forEach(t =>
        root.addEventListener(t, e => e.stopPropagation(), { passive: true }));
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !root.classList.contains("is-collapsed")) this.setCollapsed(true);
      });

      this.setCollapsed(store.get(STORE_KEY) !== "0", true);
    },

    setCollapsed(v, silent) {
      if (!this.root) return;
      this.root.classList.toggle("is-collapsed", !!v);
      this.root.querySelector("#bdev-tab").setAttribute("aria-expanded", String(!v));
      if (!silent) store.set(STORE_KEY, v ? "1" : "0");
      clearInterval(this._timer);
      this._timer = null;
      if (!v) {
        this.hookTurns();
        this.renderList();
        this._timer = setInterval(() => safe("render", () => this.renderList()), 400);
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
        const dead = !alive(u);
        const cls = ["bdev-unit", u.isPlayer ? "is-ally" : "is-enemy",
          u === cur ? "is-acting" : "", u === this.pending ? "is-pending" : "", dead ? "is-dead" : ""].join(" ");
        const tag = u === cur ? "ACTING" : u === this.pending ? "NEXT" : dead ? "KO" : "";
        const ck = `${Number(u.chakra) || 0}/${Number(u.maxChakra) || 10}`;
        const hpPct = Math.round(100 * Math.max(0, Number(u.stats?.hp) || 0) / Math.max(1, Number(u.stats?.maxHP) || 1));
        return `<div class="${cls}" data-uid="${esc(u.id)}" role="button" tabindex="0" title="Give ${esc(u.name)} the turn">
            <span class="bdev-face"><img src="${esc(u.portrait || SILHOUETTE)}" alt="" draggable="false"
              onerror="this.onerror=null;this.src='${SILHOUETTE}'"></span>
            <span class="bdev-meta"><b>${esc(u.name)}</b><small>${tag ? `<em>${tag}</em> · ` : ""}HP ${hpPct}% · CK ${ck}</small></span>
            ${u.isPlayer ? "" : `<button type="button" class="bdev-mini bdev-hp1" title="Set ${esc(u.name)} to 1 HP" aria-label="Set HP to 1">1HP</button>`}
            <button type="button" class="bdev-mini bdev-ck" title="Max ${esc(u.name)}'s chakra" aria-label="Max chakra">CK</button>
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
      this.status.classList.add("show");
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => this.status.classList.remove("show"), 2200);
    },

    init() {
      if (!window.DEV_MODE) return; // players never see it (js/dev-mode.js, ?dev=1)
      safe("build", () => this.build());
      // Restore the persistent modes (they apply once the battle is up).
      if (store.get(NOCD_KEY) === "1") this.noCooldowns = true;
      if (store.get(INF_KEY) === "1") this.infChakra = true;
      if (store.get(GOD_KEY) === "1") this.god = true;
      this.syncModeTimer();
      this.root?.querySelectorAll(".bdev-tog").forEach(b => {
        const map = { "bdev-inf": this.infChakra, "bdev-god": this.god, "bdev-nocd": this.noCooldowns };
        if (b.id in map) b.setAttribute("aria-pressed", String(!!map[b.id]));
      });
      // BattleTurns loads before this file; hook once the manager is wired.
      const tryHook = () => { if (this.turns) safe("hook", () => this.hookTurns()); else setTimeout(tryHook, 300); };
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
