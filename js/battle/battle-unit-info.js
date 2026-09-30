// js/battle/battle-unit-info.js - Long-press unit information panel
(() => {
  "use strict";

  /**
   * BattleUnitInfo Module
   * Long-press (HOLD_MS, touch or mouse) or right-click a team-holder card
   * or a unit on the field (ally or enemy) → info panel: portrait, element,
   * stars, level, name / epithet, Health / Strength / Range with status
   * deltas, equipment, ninjutsu / ultimate / secret, field / buddy skill
   * and the unit's active status effects. The battle is paused
   * (core.isPaused) while it is open.
   *
   * The existing tap / drag handlers are left alone: listeners here run in
   * the capture phase, and when a hold turns into a long press the press
   * is "defused" (a pending sprite drag is torn down, an input-manager
   * targeting drag goes back to armed) and the click that follows the
   * release is swallowed. A quick tap or drag never reaches HOLD_MS, or
   * moves past MOVE_TOL first, so it behaves exactly as before.
   */
  const HOLD_MS = 450;
  const CUE_DELAY = 140;   // ms before the hold ring appears (quick taps never see it)
  const MOVE_TOL = 10;     // px of travel that turns a hold into a drag

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const core = () => window.BattleManager || null;
  const alive = u => u && u.stats && u.stats.hp > 0;

  // Line glyphs for the stat rows (currentColor)
  // Stat icons (assets/ui/stats, same set as the Shinobi screen); Range keeps its glyph.
  const statImg = (n) => `<img class="bui-stat-ic" src="assets/ui/stats/${n}.webp" alt="" aria-hidden="true" draggable="false">`;
  const ICONS = {
    hp: statImg('health'),
    atk: statImg('attack'),
    spd: statImg('speed'),
    range: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 0v3.5M8 12.5V16M0 8h3.5M12.5 8H16" stroke="currentColor" stroke-width="1.6"/></svg>',
  };

  const BattleUnitInfo = {
    press: null,        // pending hold { id, x, y, target, timer, cueTimer }
    fired: null,        // pointerId of a press that became a long press
    swallowUntil: 0,    // swallow clicks until this time (ms)
    overlay: null,
    unit: null,
    prevPaused: null,

    init() {
      if (this._wired) return;
      this._wired = true;
      const cap = { capture: true };
      window.addEventListener("pointerdown", e => this.onDown(e), cap);
      window.addEventListener("pointermove", e => this.onMove(e), { capture: true, passive: true });
      window.addEventListener("pointerup", e => this.onUp(e), cap);
      window.addEventListener("pointercancel", e => this.onUp(e), cap);
      window.addEventListener("dragstart", () => this.cancelPress(), cap);
      window.addEventListener("click", e => this.onClick(e), cap);
      window.addEventListener("contextmenu", e => this.onContextMenu(e), cap);
      window.addEventListener("keydown", e => { if (e.key === "Escape" && this.overlay) { e.preventDefault(); this.close(); } }, cap);
    },

    /* ===== Press targets ===== */

    /** The unit under a pointer target, or null (not a unit / a status bubble). */
    unitAt(target) {
      const bm = core();
      if (!bm || !(target instanceof Element) || this.overlay) return null;
      if (target.closest(".st-bubble, .st-tip, button")) return null;
      const el = target.closest(".team-holder [data-unit-id], .battle-unit[data-unit-id]");
      if (!el) return null;
      const id = el.dataset.unitId;
      const all = [...(bm.activeTeam || []), ...(bm.benchTeam || []), ...(bm.enemyTeam || [])];
      const unit = all.find(u => u && String(u.id) === id) || null;
      return unit && alive(unit) ? unit : null;
    },

    onDown(e) {
      if (this.overlay) return;
      const unit = this.unitAt(e.target);
      if (!unit) return;
      if (e.pointerType === "mouse" && e.button !== 0) {
        // Right-click opens the panel (contextmenu); keep the press away from
        // the targeting / drag handlers so it can't fire an attack.
        if (e.button === 2) e.stopImmediatePropagation();
        return;
      }
      if (!e.isPrimary) { this.cancelPress(); return; }
      this.cancelPress();
      const p = this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, unit };
      p.cueTimer = setTimeout(() => this.showCue(p), CUE_DELAY);
      p.timer = setTimeout(() => this.fire(p), HOLD_MS);
    },

    onMove(e) {
      const p = this.press;
      if (!p || e.pointerId !== p.id) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOL) this.cancelPress();
    },

    onUp(e) {
      if (this.press && e.pointerId === this.press.id) this.cancelPress();
      if (this.fired != null && e.pointerId === this.fired) {
        this.fired = null;
        this.swallowUntil = performance.now() + 450;
      }
    },

    onClick(e) {
      if (this.fired != null || performance.now() < this.swallowUntil) {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.swallowUntil = 0;
      }
    },

    onContextMenu(e) {
      if (this.overlay || this.fired != null) { e.preventDefault(); return; }
      const unit = this.unitAt(e.target);
      if (!unit) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.cancelPress();
      this.open(unit);
    },

    cancelPress() {
      const p = this.press;
      if (!p) return;
      this.press = null;
      clearTimeout(p.timer);
      clearTimeout(p.cueTimer);
      p.cue?.remove();
    },

    showCue(p) {
      if (this.press !== p) return;
      const cue = p.cue = document.createElement("div");
      cue.className = "bui-hold";
      cue.style.left = `${p.x}px`;
      cue.style.top = `${p.y}px`;
      cue.style.setProperty("--bui-hold-ms", `${HOLD_MS - CUE_DELAY}ms`);
      cue.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="bui-hold-track" cx="20" cy="20" r="16"/><circle class="bui-hold-fill" cx="20" cy="20" r="16" pathLength="100"/></svg>';
      document.body.appendChild(cue);
    },

    /** The hold completed: defuse the in-flight press, then open. */
    fire(p) {
      if (this.press !== p) return;
      // A sprite drag that already started moving the unit wins
      const drag = core()?.drag || window.BattleDrag;
      if (drag?.spriteDrag?.active || drag?.isDragging) { this.cancelPress(); return; }
      this.cancelPress();
      this.fired = p.id;
      this.defuse(drag);
      navigator.vibrate?.(12);
      this.open(p.unit);
    },

    defuse(drag) {
      // Pending (not yet moved) sprite drag: drop it without a restore
      if (drag?.spriteDrag && !drag.spriteDrag.active) drag.spriteDragCancel?.();
      // Input manager began targeting on this press: back to "armed"
      const im = window.BattleInputManager;
      if (im && im.currentState === im.STATES?.DRAGGING) {
        im.currentState = im.STATES.READY_TO_DRAG;
        im.dragStartPos = null;
        im.currentTarget = null;
        document.getElementById("targeting-overlay")?.remove();
        core()?.dom?.scene?.querySelectorAll(".target-highlight").forEach(h => h.remove());
      }
    },

    /* ===== Panel ===== */

    open(unit) {
      const bm = core();
      if (!bm || !unit || this.overlay) return;
      this.unit = unit;
      this.prevPaused = !!bm.isPaused;
      bm.isPaused = true;
      this._focusBack = document.activeElement;

      const ov = this.overlay = document.createElement("div");
      ov.className = "bui-overlay";
      ov.innerHTML = this.html(unit);
      document.body.appendChild(ov);
      document.body.classList.add("bui-open");

      ov.addEventListener("click", e => {
        if (this.fired != null) return; // the long press's own release
        const tab = e.target.closest(".bui-tab[data-tab]");
        if (tab) { this.selectTab(tab); return; }
        if (e.target.closest(".bui-close") || !e.target.closest(".bui-panel")) this.close();
      });
      ov.addEventListener("contextmenu", e => e.preventDefault());
      ov.querySelector(".bui-close")?.focus({ preventScroll: true });
    },

    close() {
      const ov = this.overlay;
      if (!ov) return;
      this.overlay = null;
      this.fired = null;
      ov.remove();
      document.body.classList.remove("bui-open");
      const bm = core();
      // Resume unless the battle ended meanwhile (results keep it paused)
      if (bm) {
        const over = !(bm.activeTeam || []).some(alive) || !(bm.enemyTeam || []).some(alive);
        if (!over) bm.isPaused = this.prevPaused;
      }
      this.unit = null;
      try { this._focusBack?.focus?.({ preventScroll: true }); } catch (_) { /* ignore */ }
    },

    selectTab(tab) {
      const group = tab.closest(".bui-tabs");
      group.querySelectorAll(".bui-tab").forEach(t => {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      group.querySelectorAll(".bui-pane").forEach(p => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
    },

    /* ===== Data ===== */

    /** Full character record (enemies built from enemies.json carry only a stub). */
    charOf(unit) {
      const base = unit._ref?.base || {};
      if (base.version) return base;
      const cid = base.characterId || unit.charId || base.id;
      return (core()?.charactersData || []).find(c => c.id === cid) || base;
    },

    tierOf(unit, ch) {
      return unit._ref?.inst?.tierCode || unit._ref?.base?.tier || ch.starMinCode || null;
    },

    stats(unit, ch) {
      const B = window.BattleBuffs;
      const P = window.BattlePassives;
      const baseAtk = Math.max(0, Number(unit.stats.atk) || 0);
      const buf = B?.aggregateBuffModifiers?.(unit) || { atkFlat: 0 };
      const pas = P?.getActiveModifiers?.(unit) || { atkFlat: 0 };
      const pct = (B?.sum?.(unit, "attack_up") || 0) - (B?.sum?.(unit, "attack_down") || 0);
      // Same formula the damage calc uses (battle-combat.js)
      const effAtk = (baseAtk + (buf.atkFlat || 0) + (pas.atkFlat || 0)) * Math.max(0.1, 1 + pct / 100);
      const rangeUp = B?.get?.(unit, "range_up");
      const range = ch.range || unit._ref?.base?.range || "";
      return {
        hp: Math.max(0, Math.round(unit.stats.hp)),
        maxHP: Math.round(unit.stats.maxHP || unit.stats.hp),
        atk: Math.round(effAtk),
        atkDelta: Math.round(effAtk - baseAtk),
        speed: Math.round(Number(unit.stats.speed) || 0),
        range: rangeUp?.element || range || "—",
        rangeBoosted: !!(rangeUp?.element && rangeUp.element !== range),
      };
    },

    techniques(unit) {
      const C = window.BattleCombat;
      const s = C?.getUnitSkills?.(unit) || {};
      const lockOf = {
        jutsu: () => C?.isJutsuUnlocked && !C.isJutsuUnlocked(unit) ? "Unlocks at Lv 20" : "",
        ultimate: () => C?.isUltimateUnlocked && !C.isUltimateUnlocked(unit) ? "Unlocks at Lv 50" : "",
        secret: () => C?.isSecretUnlocked && !C.isSecretUnlocked(unit) ? "Unlocks at 6★" : "",
      };
      return [["jutsu", "Ninjutsu"], ["ultimate", "Ultimate"], ["secret", "Secret"]]
        .filter(([k]) => s[k])
        .map(([k, label]) => {
          const d = s[k].data || {};
          const cost = C?.getSkillChakraCost ? C.getSkillChakraCost(unit, s[k]) : d.chakraCost;
          return {
            key: k, label, name: s[k].meta?.name || label, desc: d.description || "",
            cost: Number(cost) > 0 ? cost : null, range: d.range || "", hits: d.hits || null, lock: lockOf[k](),
          };
        });
    },

    equipment(unit) {
      try {
        const u = window.BattleEquippedUltimate?.getEquippedUltimateData?.(unit);
        return u ? [{ name: u.name, desc: u.description || "", tag: "Last Stand" }] : [];
      } catch (_) { return []; }
    },

    /* ===== Markup ===== */

    html(unit) {
      const ch = this.charOf(unit);
      const st = this.stats(unit, ch);
      const lvl = unit._ref?.inst?.level ?? unit._ref?.base?.level ?? null;
      const title = ch.version || "";
      const side = unit.isPlayer ? "Ally" : "Enemy";
      const delta = (n) => `<span class="bui-delta${n > 0 ? " is-up" : n < 0 ? " is-down" : ""}">(${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString()})</span>`;
      const techs = this.techniques(unit);
      const skills = ch.skills || {};
      const fb = [["field", "Field Skill", skills.fieldSkill], ["buddy", "Buddy Skill", skills.buddySkill]]
        .filter(([, , s]) => s && s.description)
        .map(([key, label, s]) => ({ key, label, desc: s.description }));
      const equip = this.equipment(unit);

      const techPane = t => `
        <div class="bui-skill-name"><span>${esc(t.name)}</span>${t.cost != null ? `<b class="bui-cost" title="Chakra cost">${esc(t.cost)}<small>CK</small></b>` : ""}</div>
        ${t.range || t.hits ? `<div class="bui-skill-meta">${t.range ? `<span>Range: ${esc(t.range)}</span>` : ""}${t.hits ? `<span>${esc(t.hits)} hits</span>` : ""}${t.lock ? `<span class="bui-lock">${esc(t.lock)}</span>` : ""}</div>` : (t.lock ? `<div class="bui-skill-meta"><span class="bui-lock">${esc(t.lock)}</span></div>` : "")}
        <p class="bui-desc">${t.desc ? esc(t.desc) : '<span class="bui-none">No description</span>'}</p>`;

      const statusHTML = this.statusHTML(unit);

      return `
        <div class="bui-panel" role="dialog" aria-modal="true" aria-labelledby="bui-name">
          <i class="bui-crest" aria-hidden="true"></i>
          <button type="button" class="bui-close" aria-label="Close">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          </button>
          <div class="bui-body">
            <header class="bui-head">
              <div class="bui-face bui-side-${side.toLowerCase()}">
                <div class="bui-portrait"><img src="${esc(unit.portrait)}" alt="" draggable="false"
                  onerror="this.onerror=null;this.src='assets/characters/common/silhouette.png'"></div>
                ${lvl != null ? `<span class="bui-lv">Lv ${esc(lvl)}</span>` : ""}
              </div>
              <div class="bui-id">
                <div class="bui-side">${side}</div>
                <h2 class="bui-name" id="bui-name">${esc(unit.name)}</h2>
                ${title ? `<div class="bui-title">${esc(title)}</div>` : ""}
                <dl class="bui-stats">
                  <div class="bui-stat bui-stat-hp"><dt>${ICONS.hp}Health</dt><dd><b>${st.hp.toLocaleString()}</b><small>/${st.maxHP.toLocaleString()}</small>${delta(0)}</dd></div>
                  <div class="bui-stat bui-stat-atk"><dt>${ICONS.atk}Strength</dt><dd><b>${st.atk.toLocaleString()}</b>${delta(st.atkDelta)}</dd></div>
                  <div class="bui-stat bui-stat-spd"><dt>${ICONS.spd}Speed</dt><dd><b>${st.speed.toLocaleString()}</b></dd></div>
                  <div class="bui-stat bui-stat-range"><dt>${ICONS.range}Range</dt><dd><b class="${st.rangeBoosted ? "is-up" : ""}">${esc(st.range)}</b></dd></div>
                </dl>
              </div>
            </header>
            ${equip.length ? `<div class="bui-equip">${equip.map(it => `<span class="bui-item" title="${esc(it.desc)}"><em>${esc(it.tag)}</em>${esc(it.name)}</span>`).join("")}</div>` : ""}
            ${this.tabsHTML("tech", techs.length ? techs : [{ key: "jutsu", label: "Ninjutsu", none: true }], techPane)}
            ${this.tabsHTML("skill", fb.length ? fb : [{ key: "field", label: "Field Skill", none: true }], s => `<p class="bui-desc">${esc(s.desc)}</p>`)}
            <section class="bui-sec bui-status-sec">
              <h3 class="bui-plate">Status Effect</h3>
              <div class="bui-card bui-status">${statusHTML}</div>
            </section>
          </div>
        </div>`;
    },

    /** One tab plate per entry (a lone entry is a plain plate header). */
    tabsHTML(group, items, paneFn) {
      const one = items.length === 1;
      const tabs = items.map((it, i) => one
        ? `<h3 class="bui-plate">${esc(it.label)}</h3>`
        : `<button type="button" class="bui-plate bui-tab${i === 0 ? " is-active" : ""}" role="tab" data-tab="${esc(it.key)}"
             aria-selected="${i === 0}">${esc(it.label)}</button>`).join("");
      const panes = items.map((it, i) =>
        `<div class="bui-pane" data-pane="${esc(it.key)}"${i === 0 ? "" : " hidden"}>${it.none ? '<p class="bui-desc bui-none">None</p>' : paneFn(it)}</div>`).join("");
      return `<section class="bui-sec bui-tabs bui-${group}"><div class="bui-tabrow"${one ? "" : ' role="tablist"'}>${tabs}</div><div class="bui-card">${panes}</div></section>`;
    },

    statusHTML(unit) {
      const UI = window.StatusEffectUI;
      const list = UI?.statuses?.(unit) || [];
      if (!list.length) return '<p class="bui-desc bui-none">None</p>';
      return `<ul class="bui-st-list">${list.map(se => {
        const d = UI.describe ? UI.describe(se) : { name: se.name || se.id, extra: "", kind: se.kind };
        const t = Number(se.turnsRemaining);
        const icon = UI.iconUrl?.(se.id);
        return `<li class="bui-st bui-st-${d.kind === "debuff" ? "debuff" : "buff"}" style="--st-c:${esc(se.color || "#888")}">
            ${icon ? `<img src="${esc(icon)}" alt="" draggable="false">` : "<i></i>"}
            <span class="bui-st-name">${esc(d.name)}${d.extra ? `<small>${esc(d.extra)}</small>` : ""}</span>
            <b class="bui-st-turns">${t >= 99 ? "∞" : `${esc(t)}T`}</b></li>`;
      }).join("")}</ul>`;
    },
  };

  window.BattleUnitInfo = BattleUnitInfo;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => BattleUnitInfo.init());
  else BattleUnitInfo.init();
})();
