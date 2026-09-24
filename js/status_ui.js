/* ============================================================
   js/status_ui.js — Blazing-style status effect bubbles
   ------------------------------------------------------------
   - Field: small round "thought bubble" icons floating above each
     affected unit (sprite units and portrait tiles), one per effect,
     white rim + effect colour, turn counter badge, gentle bob, laid
     out on a shallow arc (max 5 + "+n"). Hover / focus / tap → tooltip.
   - Team HUD card: compact row of mini icons for player units.
   - Speed bar markers: padlock for immobilized, seal for jutsu sealed.
   - Action panel (#action-status-effects): list for the acting unit.
   - Popups: "Jutsu Sealing!", "Dodge!", "Resisted", "Slip Damage" ...
   Reads unit.statusEffects through window.BattleBuffs; icons from
   window.StatusCatalog (assets/ui/status/*.png, Naruto Blazing wiki).
   ============================================================ */
(() => {
  "use strict";

  const MAX_VISIBLE = 5;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const Cat = () => window.StatusCatalog || {};
  const B = () => window.BattleBuffs || null;
  const core = () => window.BattleManager || null;
  const iconUrl = id => {
    const def = Cat().STATUS_EFFECT_BY_ID?.[id];
    if (def) return def.iconPath;
    const inst = Cat().INSTANT_ICONS?.[id];
    return inst ? (Cat().ICON_DIR || "assets/ui/status/") + inst + ".png" : null;
  };
  const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  function describe(se) {
    const def = Cat().STATUS_EFFECT_BY_ID?.[se.id] || {};
    const bits = [];
    const v = Number(se.value);
    switch (se.id) {
      case "attack_up": bits.push(`Attack +${v}%`); break;
      case "attack_down": bits.push(`Attack \u2212${v}%`); break;
      case "damage_reduction": bits.push(`Damage taken \u2212${v}%`); break;
      case "dodge_up": bits.push(`Dodge chance +${v}%`); break;
      case "crit_up": bits.push(`Critical rate +${v}%`); break;
      case "vulnerability": bits.push(`Damage taken +${v}%`); break;
      case "barrier": bits.push(`Blocks ${Number(se.barrierHP ?? v) || 0} more damage`); break;
      case "perfect_dodge": if (se.charges != null) bits.push(`${se.charges} dodge(s) left`); break;
      case "slip": case "damage_region": bits.push(`${se.dmg || v || 0} damage per turn`); break;
      case "regen": bits.push(`+${v} health per turn`); break;
      case "element_change": bits.push(`Element: ${se.element}`); break;
      case "range_up": bits.push(`Range: ${se.element}`); break;
      case "dmg_boost": bits.push(`+${v}% damage${se.element ? ` vs ${se.element}` : ""}`); break;
      default: if (/_res$/.test(se.id) && v) bits.push(`\u2212${v}% chance`);
    }
    return { name: def.name || se.name || se.id, desc: def.description || "", extra: bits.join(" · "), kind: def.kind || se.kind };
  }

  const turnsLabel = t => (t >= 99 ? "permanent" : `${t} turn${Number(t) === 1 ? "" : "s"} left`);

  const StatusEffectUI = {
    _timer: null,
    _tip: null,
    _pending: new Set(),
    _raf: 0,

    /* ---------- field bubbles ---------- */

    render(unit) {
      if (!unit) return;
      this._pending.add(unit);
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        const list = [...this._pending];
        this._pending.clear();
        list.forEach(u => { this.renderField(u); this.renderHud(u); this.renderMarker(u); });
        const cu = core()?.turns?.currentUnit;
        if (cu && list.includes(cu)) this.renderPanel(cu);
      });
    },

    statuses(unit) {
      const b = B();
      if (!b || !unit || !(unit.stats?.hp > 0)) return [];
      return b.list(unit).map(se => ({ ...se, id: se.id || Cat().resolveStatusId?.(se.type || se.tag) }))
        .filter(se => Cat().STATUS_EFFECT_BY_ID?.[se.id])
        // ailments first (like Blazing), then boosts
        .sort((a, b2) => (a.kind === b2.kind ? 0 : a.kind === "debuff" ? -1 : 1));
    },

    signature(list) {
      return list.map(se => `${se.id}:${se.turnsRemaining}:${se.charges ?? ""}:${se.value ?? ""}:${se.barrierHP ?? ""}`).join("|");
    },

    unitEl(unit) {
      return core()?.dom?.scene?.querySelector(`.battle-unit[data-unit-id="${CSS.escape(String(unit.id))}"]`) || null;
    },

    renderField(unit) {
      const el = this.unitEl(unit);
      if (!el) return;
      const list = this.statuses(unit);
      let box = el.querySelector(":scope > .st-bubbles");
      if (!list.length) { if (box) box.remove(); return; }
      if (!box) {
        box = document.createElement("div");
        box.className = "st-bubbles";
        box.setAttribute("aria-label", "Status effects");
        el.appendChild(box);
      }
      box.classList.toggle("st-bubbles--sprite", !!el.querySelector(".unit-sprite--anim"));
      box.classList.toggle("st-bubbles--enemy", !unit.isPlayer);
      // Too close to the top edge (speed bar): float the bubbles below instead
      const sc = core()?.dom?.scene?.getBoundingClientRect();
      const bar = document.getElementById("speed-gauge-track")?.getBoundingClientRect();
      const ceiling = Math.max(sc?.top || 0, bar?.bottom || 0) + 6;
      const room = el.getBoundingClientRect().top - (el.querySelector(".unit-sprite--anim") ? 70 : 44);
      box.classList.toggle("st-bubbles--below", room < ceiling);
      const sig = this.signature(list);
      if (box.dataset.sig === sig) return;
      const prevIds = new Set((box.dataset.ids || "").split(",").filter(Boolean));
      box.dataset.sig = sig;
      box.dataset.ids = list.map(s => s.id).join(",");
      const shown = list.slice(0, list.length > MAX_VISIBLE ? MAX_VISIBLE - 1 : MAX_VISIBLE);
      const n = shown.length + (list.length > shown.length ? 1 : 0);
      const mid = (n - 1) / 2;
      box.innerHTML = shown.map((se, i) => {
        const d = describe(se);
        const arc = Math.round(Math.pow(Math.abs(i - mid), 1.6) * 3); // shallow arc: ends droop
        const badge = se.id === "perfect_dodge" && se.charges != null ? `<b class="st-count">×${se.charges}</b>` : "";
        // No native `title`: it doubled up with the themed tooltip. The label
        // carries the same text for screen readers; the tip is linked with
        // aria-describedby while it is shown.
        return `<div class="st-bubble st-${d.kind}${prevIds.has(se.id) ? "" : " st-new"}" data-st-id="${esc(se.id)}"
            style="--st-c:${esc(se.color || "#888")};--arc:${arc}px;--i:${i}" tabindex="0" role="img"
            aria-label="${esc(`${d.name}, ${turnsLabel(se.turnsRemaining)}${d.extra ? `, ${d.extra}` : ""}`)}">
          <img src="${esc(iconUrl(se.id))}" alt="${esc(d.name)}" draggable="false">
          <b class="st-turns">${se.turnsRemaining >= 99 ? "∞" : esc(se.turnsRemaining)}</b>${badge}
        </div>`;
      }).join("") + (list.length > shown.length
        ? `<div class="st-bubble st-more" data-st-more="${shown.length}" style="--arc:${Math.round(Math.pow(Math.abs(n - 1 - mid), 1.6) * 3)}px;--i:${n - 1}" tabindex="0" role="img" aria-label="${esc(`${list.length - shown.length} more: ${list.slice(shown.length).map(s => describe(s).name).join(", ")}`)}">+${list.length - shown.length}</div>` : "")
        + `<i class="st-tail st-tail-a"></i><i class="st-tail st-tail-b"></i>`;
      box.querySelectorAll(".st-bubble").forEach(b => this.bindTip(b, unit));
    },

    /* ---------- team HUD card ---------- */

    renderHud(unit) {
      if (!unit?.isPlayer) return;
      const holder = core()?.dom?.teamHolder || document.getElementById("team-holder");
      const port = holder?.querySelector(`.active-portrait-container[data-unit-id="${CSS.escape(String(unit.id))}"]`);
      const card = port?.closest(".unit-card") || port;
      if (!card) return;
      const list = this.statuses(unit);
      let row = card.querySelector(":scope .st-hud");
      if (!list.length) { row?.remove(); return; }
      if (!row) {
        row = document.createElement("div");
        row.className = "st-hud";
        (card.querySelector(".uc-body") || card).appendChild(row);
      }
      const sig = this.signature(list);
      if (row.dataset.sig === sig) return;
      row.dataset.sig = sig;
      const shown = list.slice(0, 4);
      row.innerHTML = shown.map(se => {
        const d = describe(se);
        return `<span class="st-mini st-${d.kind}" style="--st-c:${esc(se.color)}" title="${esc(`${d.name} — ${se.turnsRemaining} turn(s)`)}">
          <img src="${esc(iconUrl(se.id))}" alt="" draggable="false"><b>${esc(se.turnsRemaining)}</b></span>`;
      }).join("") + (list.length > 4 ? `<span class="st-mini st-mini-more">+${list.length - 4}</span>` : "");
    },

    /* ---------- speed bar marker ---------- */

    renderMarker(unit) {
      const m = document.querySelector(`#speed-gauge-track .speed-marker[data-unit-id="${CSS.escape(String(unit.id))}"]`);
      if (!m) return;
      const b = B();
      const stun = !!b?.cannotAct(unit), seal = !!b?.isSealed(unit, "jutsu");
      m.classList.toggle("st-stunned", stun);
      m.classList.toggle("st-sealed", seal);
      let tag = m.querySelector(":scope > .sm-st");
      if (!stun && !seal) { tag?.remove(); return; }
      if (!tag) { tag = document.createElement("i"); tag.className = "sm-st"; m.appendChild(tag); }
      tag.style.backgroundImage = `url("${iconUrl(stun ? "immobilize" : "jutsu_seal")}")`;
    },

    /* ---------- action panel list ---------- */

    renderPanel(unit) {
      const box = document.getElementById("action-status-effects");
      if (!box) return;
      const list = this.statuses(unit);
      if (!list.length) { box.innerHTML = ""; box.classList.add("st-empty"); return; }
      box.classList.remove("st-empty");
      box.innerHTML = list.map(se => {
        const d = describe(se);
        return `<span class="st-chip st-${d.kind}" style="--st-c:${esc(se.color)}" title="${esc(d.desc)}">
          <img src="${esc(iconUrl(se.id))}" alt="" draggable="false">${esc(d.name)}<b>${esc(se.turnsRemaining)}T</b></span>`;
      }).join("");
    },

    /* ---------- tooltip ---------- */
    // Themed washi panel (css/status_effects.css .st-tip). Desktop: hover or
    // keyboard focus. Touch: tap (or long-press) shows it, auto-hides 1.6s
    // after release. Positioned inside the battle scene, above the bubble,
    // flipping below near the top and clamping sideways; the notch follows
    // the bubble.

    bindTip(el, unit) {
      const show = () => this.showTip(el, unit);
      el.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") show(); });
      el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") this.hideTip(); });
      el.addEventListener("focus", show);
      el.addEventListener("blur", () => this.hideTip());
      let lp = null;
      el.addEventListener("pointerdown", e => {
        e.stopPropagation(); // do not start a unit drag from a bubble
        if (e.pointerType !== "mouse") { clearTimeout(lp); lp = setTimeout(show, 280); }
      });
      el.addEventListener("pointerup", e => {
        clearTimeout(lp);
        if (e.pointerType !== "mouse") { clearTimeout(this._hideT); this._hideT = setTimeout(() => this.hideTip(), 1600); }
      });
      el.addEventListener("click", e => { e.stopPropagation(); show(); });
    },

    tipHtml(el, unit) {
      if (el.dataset.stMore != null) {
        const rest = this.statuses(unit).slice(Number(el.dataset.stMore) || 0);
        if (!rest.length) return null;
        return {
          kind: "more", color: "#2d6b73",
          html: `<div class="st-tip-head"><span class="st-tip-name">${rest.length} more effect${rest.length === 1 ? "" : "s"}</span></div>
            <ul class="st-tip-list">${rest.map(se => {
              const d = describe(se);
              return `<li class="st-${d.kind}"><img src="${esc(iconUrl(se.id))}" alt="">${esc(d.name)}<b>${se.turnsRemaining >= 99 ? "\u221e" : esc(se.turnsRemaining)}</b></li>`;
            }).join("")}</ul>`
        };
      }
      const id = el.dataset.stId;
      const se = this.statuses(unit).find(s => s.id === id);
      if (!se) return null;
      const d = describe(se);
      const kind = d.kind === "debuff" ? "debuff" : "buff";
      const t = Number(se.turnsRemaining);
      const turns = t >= 99
        ? `<span class="st-tip-turns st-tip-turns--perm">Permanent</span>`
        : `<span class="st-tip-turns"><b>${esc(t)}</b> turn${t === 1 ? "" : "s"}</span>`;
      return {
        kind, color: se.color,
        html: `<div class="st-tip-head">
            <span class="st-tip-ico"><img src="${esc(iconUrl(id))}" alt=""></span>
            <span class="st-tip-name">${esc(d.name)}</span>
            <em class="st-tip-stamp">${kind === "debuff" ? "Ailment" : "Boost"}</em>
          </div>
          <div class="st-tip-stats">${turns}${d.extra ? `<span class="st-tip-val">${esc(d.extra).replace(/\u2212/g, '<span class="st-tip-minus">\u2212</span>')}</span>` : ""}</div>
          ${d.desc ? `<p class="st-tip-desc">${esc(d.desc)}</p>` : ""}`
      };
    },

    showTip(el, unit) {
      const c = this.tipHtml(el, unit);
      if (!c) return;
      clearTimeout(this._hideT);
      if (!this._tip) {
        this._tip = document.createElement("div");
        this._tip.id = "st-tip";
        this._tip.className = "st-tip";
        this._tip.setAttribute("role", "tooltip");
        document.body.appendChild(this._tip);
      }
      const t = this._tip;
      if (this._anchor && this._anchor !== el) this._anchor.removeAttribute("aria-describedby");
      this._anchor = el;
      el.setAttribute("aria-describedby", "st-tip");
      t.className = `st-tip st-tip--${c.kind}`;
      t.style.setProperty("--st-c", c.color || "#888");
      t.innerHTML = `${c.html}<i class="st-tip-notch" aria-hidden="true"></i>`;
      t.style.left = "0px"; t.style.top = "0px";
      const r = el.getBoundingClientRect();
      const tw = t.offsetWidth, th = t.offsetHeight;
      // Bounds: the battle scene (fallback: the window), between the speed
      // bar on top and the team cards at the bottom, so the tip never sits
      // on (or under) the HUD.
      const sc = core()?.dom?.scene?.getBoundingClientRect();
      const bar = document.getElementById("speed-gauge-track")?.getBoundingClientRect();
      const holder = (core()?.dom?.teamHolder || document.getElementById("team-holder"))?.getBoundingClientRect();
      const W = window.innerWidth, H = window.innerHeight;
      const L = Math.max(0, sc?.left ?? 0) + 6, R = Math.min(W, sc?.right ?? W) - 6;
      const T = Math.max(0, sc?.top ?? 0, bar?.height ? bar.bottom : 0) + 6;
      const Bt = Math.min(H, sc?.bottom ?? H, holder?.height && holder.top > T + th ? holder.top : H) - 6;
      const gap = 9; // room for the notch
      const cx = r.left + r.width / 2;
      let x = Math.max(L, Math.min(R - tw, cx - tw / 2));
      let y = r.top - th - gap, below = false;
      if (y < T) { y = r.bottom + gap; below = true; }
      if (below && y + th > Bt) { y = Math.max(T, r.top - th - gap); below = false; } // no room either way: prefer above
      t.classList.toggle("st-tip--below", below);
      t.style.setProperty("--ax", `${Math.max(12, Math.min(tw - 12, cx - x))}px`);
      t.style.left = `${Math.round(x)}px`; t.style.top = `${Math.round(y)}px`;
      t.classList.add("show");
    },
    hideTip() {
      clearTimeout(this._hideT);
      this._tip?.classList.remove("show");
      this._anchor?.removeAttribute("aria-describedby");
      this._anchor = null;
    },

    /* ---------- popups ---------- */

    popup(unit, text, color = "#fff", iconId = null) {
      const c = core();
      const el = this.unitEl(unit);
      const layer = c?.dom?.damageLayer;
      const scene = c?.dom?.scene;
      if (!el || !scene) return;
      const r = el.getBoundingClientRect(), sr = scene.getBoundingClientRect();
      const p = document.createElement("div");
      p.className = "st-popup";
      const icon = iconId ? iconUrl(iconId) : null;
      p.innerHTML = `${icon ? `<img src="${esc(icon)}" alt="">` : ""}<span>${esc(text)}</span>`;
      p.style.setProperty("--st-c", color);
      // stack concurrent popups on the same unit
      const key = String(unit.id);
      const now = Date.now();
      this._stack = this._stack || {};
      const s = this._stack[key] && now - this._stack[key].t < 700 ? this._stack[key].n + 1 : 0;
      this._stack[key] = { t: now, n: s };
      const host = layer || scene;
      const hr = host.getBoundingClientRect();
      p.style.left = `${r.left - hr.left + r.width / 2}px`;
      p.style.top = `${r.top - hr.top - 18 - s * 24}px`;
      host.appendChild(p);
      setTimeout(() => p.remove(), reduceMotion() ? 1400 : 1700);
      void sr;
    },

    /** Floating number for status damage / healing (slip ticks, regen, heals). */
    number(unit, amount, type = "slip") {
      const c = core();
      const el = this.unitEl(unit);
      const host = c?.dom?.damageLayer || c?.dom?.scene;
      if (!el || !host) return;
      const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
      const n = document.createElement("div");
      n.className = `st-num st-num-${type}`;
      n.textContent = `${type === "heal" ? "+" : "-"}${Math.round(amount).toLocaleString()}`;
      n.style.left = `${r.left - hr.left + r.width / 2 + (Math.random() * 16 - 8)}px`;
      n.style.top = `${r.top - hr.top + r.height * 0.35}px`;
      host.appendChild(n);
      setTimeout(() => n.remove(), 1500);
    },

    /** A status just landed: popup with its icon + name. */
    announce(unit, rec) {
      const def = Cat().STATUS_EFFECT_BY_ID?.[rec.id];
      if (!def) return;
      const extra = rec.id === "perfect_dodge" && rec.charges ? ` ×${rec.charges}` : "";
      this.popup(unit, `${def.name}${extra}`, def.kind === "debuff" ? "#ffb3c7" : "#b8ffcf", rec.id);
      this.render(unit);
    },

    expired(unit, recs) {
      if (!recs?.length) return;
      const names = recs.map(r => Cat().STATUS_EFFECT_BY_ID?.[r.id]?.name || r.name).filter(Boolean);
      if (names.length) this.popup(unit, `${names.join(", ")} wore off`, "#dddddd", null);
      this.render(unit);
    },

    /* ---------- periodic sync (DOM re-renders, deaths, swaps) ---------- */

    sync() {
      const c = core();
      if (!c || !Array.isArray(c.combatants)) return;
      c.combatants.forEach(u => this.render(u));
      // Units that died / left: clear stale HUD rows
      document.querySelectorAll("#team-holder .st-hud").forEach(row => {
        const id = row.closest(".unit-card")?.querySelector(".active-portrait-container")?.dataset.unitId;
        const u = c.combatants.find(x => String(x.id) === id);
        if (!u || !this.statuses(u).length) row.remove();
      });
    },

    start() {
      if (this._timer) return;
      this._timer = setInterval(() => this.sync(), 500);
      document.addEventListener("scroll", () => this.hideTip(), true);
    },

    /* ---------- legacy badge API (teams page) ---------- */
    createBadge(effect) {
      const id = effect.id;
      return `<div class="status-effect ${effect.type || effect.kind || ""} active" data-effect="${esc(id)}" title="${esc(effect.description || "")}">
        <img class="status-icon" src="${esc(iconUrl(id) || "")}" alt=""><span class="status-duration">${esc(effect.turnsRemaining ?? effect.duration ?? "")}</span></div>`;
    },
    showEffectApplied(characterElement, effectId) {
      const def = Cat().STATUS_EFFECT_BY_ID?.[effectId];
      if (!def || !characterElement) return;
      const p = document.createElement("div");
      p.className = "st-popup";
      p.innerHTML = `<img src="${esc(def.iconPath)}" alt=""><span>${esc(def.name)}</span>`;
      p.style.left = "50%"; p.style.top = "-10px";
      characterElement.appendChild(p);
      setTimeout(() => p.remove(), 1700);
    }
  };

  window.StatusEffectUI = StatusEffectUI;
  if (typeof document !== "undefined" && /battle|arena/i.test(location.pathname)) {
    const go = () => StatusEffectUI.start();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  }
})();
