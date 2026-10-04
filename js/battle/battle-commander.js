/* Commander: the off-field support unit, shown and cast from the battle.
 *
 * The commander sits in a banner at the bottom-left of the field: portrait,
 * element, the team aura it gives (BattleCore.calculateCommanderBuffs) and a
 * 16-pip gauge of the team's combined chakra. When the team holds 16 chakra
 * the banner turns ready; tapping it then CASTS the commander ultimate:
 * 16 chakra is taken from the team (from whoever holds the most first), a
 * cut-in plays, and the ultimate strikes through the regular damage pipeline
 * (BattleCombat.calculateDamage, so element, barrier, dodge and the skill's
 * own "ignores ..." flags all apply). Nothing fires on its own.
 * Tapping while not ready, or holding the banner, opens its details.
 *
 * Loads after battle-core.js and battle-combat.js; hooks BattleCore's
 * showCommanderUI / updateCollectiveChakraUI and turns its old automatic
 * trigger off.
 */
(() => {
  "use strict";

  const COST = 16;
  const FOLD_KEY = "blazing_commander_folded_v1";
  const readFolded = () => { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch (_) { return false; } };
  const saveFolded = v => { try { localStorage.setItem(FOLD_KEY, v ? "1" : "0"); } catch (_) { /* storage blocked */ } };
  const alive = u => !!(u && u.stats && u.stats.hp > 0);
  const safe = (label, fn) => { try { return fn(); } catch (e) { console.warn(`[Commander] ${label} failed`, e); return undefined; } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ELEMENT_COLOR = { body: "#a83a2c", bravery: "#b88a1e", wisdom: "#6b4fa8", heart: "#2f8a52", skill: "#2f6fae" };

  const BattleCommander = {
    core: null,
    el: null,
    wrap: null,
    queued: false,
    casting: false,

    /* ===== banner ===== */

    mount(core) {
      this.core = core;
      const c = core.commander;
      if (!c) return;
      document.getElementById("commander-display")?.classList.add("hidden");
      this.wrap?.remove();

      const art = safe("art", () => (core.units ? core.units.resolveTierArt(c.base, c.tier) : core.resolveTierArtFallback(c.base, c.tier))) || {};
      const aura = (core.commanderBuffs || []).map(b => `${esc(b.label)} +${esc(b.percent)}%`).join(" · ");
      const el = document.createElement("button");
      el.type = "button";
      el.className = "cmd-banner";
      el.innerHTML = `
        <span class="cmd-ink" aria-hidden="true"></span>
        <span class="cmd-seal" aria-hidden="true">発動</span>
        <span class="cmd-brushk" aria-hidden="true">指揮</span>
        <span class="cmd-body">
          <span class="cmd-row">
            <span class="cmd-portrait"><img src="${esc(art.portrait || "")}" alt="" draggable="false">
              <i class="cmd-el" style="background:${ELEMENT_COLOR[c.element] || "#555"}"></i></span>
            <span class="cmd-who"><span class="cmd-label">Commander</span><span class="cmd-name">${esc(c.name)}</span>${aura ? `<span class="cmd-aura">${aura}</span>` : ""}</span>
          </span>
          <span class="cmd-gauge">
            <span class="cmd-pips">${"<i></i>".repeat(COST)}</span>
            <b class="cmd-count">0<i>/${COST}</i></b>
          </span>
          <span class="cmd-go"><b>奥義</b><span>Unleash</span></span>
        </span>
        <span class="cmd-mini" aria-hidden="true"><span class="cmd-mini-count">0</span></span>`;
      // The banner and its fold tab sit side by side in one wrapper (a button
      // can't hold another button).
      const wrap = document.createElement("div");
      wrap.className = "cmd-wrap";
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "cmd-fold";
      fold.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7.5 1.5L2.5 7l5 5.5"/></svg>`;
      fold.addEventListener("click", e => { e.stopPropagation(); this.setFolded(!this.folded); });
      wrap.append(fold, el);
      (document.querySelector(".battle-container") || document.body).appendChild(wrap);
      this.el = el;
      this.wrap = wrap;
      this.fold = fold;
      this.wire(el);
      this.setFolded(readFolded(), false);
      this.update();
    },

    wire(el) {
      let hold = null, held = false;
      const clear = () => { clearTimeout(hold); hold = null; };
      el.addEventListener("pointerdown", () => { held = false; clear(); hold = setTimeout(() => { held = true; this.showDetails(); }, 450); });
      el.addEventListener("pointerup", clear);
      el.addEventListener("pointerleave", clear);
      el.addEventListener("pointercancel", clear);
      el.addEventListener("contextmenu", e => { e.preventDefault(); this.showDetails(); });
      el.addEventListener("click", e => {
        e.stopPropagation();
        if (held) { held = false; return; }
        if (this.ready()) this.cast();
        // full gauge but a unit is mid-action: queue it, it fires the moment the field is clear
        else if (this.teamChakra() >= COST && this.core?.commander?.ultimate && !this.casting) { this.queued = true; this.update(); }
        else this.showDetails();
      });
    },

    /** Collapse the banner to its portrait tile (or open it again); remembered between battles. */
    setFolded(on, remember = true) {
      this.folded = !!on;
      this.wrap?.classList.toggle("is-folded", this.folded);
      if (this.fold) {
        this.fold.setAttribute("aria-expanded", String(!this.folded));
        this.fold.setAttribute("aria-label", this.folded ? "Show commander panel" : "Collapse commander panel");
      }
      if (this.folded) document.querySelector(".cmd-details")?.remove();
      if (remember) saveFolded(this.folded);
    },

    teamChakra() {
      return (this.core?.activeTeam || []).filter(alive).reduce((s, u) => s + (Number(u.chakra) || 0), 0);
    },

    /** Not while an enemy (or any unit) is mid-action, a cast is running, or the battle is over. */
    canCastNow() {
      const core = this.core, T = core?.turns;
      if (!core?.commander?.ultimate || this.casting || core.battleEnded || core.isBattleOver) return false;
      if (T?.currentUnit && !T.currentUnit.isPlayer) return false;
      if ([...(core.activeTeam || []), ...(core.enemyTeam || [])].some(u => u?._actionBusy)) return false;
      return true;
    },

    ready() { return this.teamChakra() >= COST && this.canCastNow(); },

    update() {
      const el = this.el, core = this.core;
      if (!el || !core) return;
      const n = this.teamChakra();
      const shown = Math.min(COST, n);
      el.querySelector(".cmd-count").firstChild.nodeValue = String(shown);
      el.querySelector(".cmd-mini-count").textContent = String(shown);
      el.style.setProperty("--cmd-fill", String(shown / COST));
      el.querySelectorAll(".cmd-pips i").forEach((p, i) => p.classList.toggle("on", i < shown));
      const ready = n >= COST;
      el.classList.toggle("is-ready", ready);
      el.classList.toggle("is-blocked", ready && !this.canCastNow());
      if (this.queued && !ready) this.queued = false;
      el.classList.toggle("is-queued", !!this.queued);
      if (this.queued && ready && this.canCastNow()) { this.queued = false; this.cast(); }
      el.setAttribute("aria-label", ready
        ? `Unleash commander ultimate, ${core.commander.ultimate?.name || ""}`
        : `Commander ${core.commander.name}, team chakra ${shown} of ${COST}`);
    },

    /* ===== details ===== */

    showDetails() {
      const core = this.core, c = core?.commander;
      if (!c) return;
      document.querySelector(".cmd-details")?.remove();
      const u = c.ultimate;
      const aura = (core.commanderBuffs || []).map(b =>
        `<span class="cmd-dl"><span>${esc(b.label === "HP" ? "Max HP" : b.label)}</span><b>+${esc(b.percent)}%</b></span>`).join("")
        || `<span class="cmd-dl"><span>No aura</span><b>—</b></span>`;
      const box = document.createElement("section");
      box.className = "cmd-details";
      box.setAttribute("aria-label", "Commander details");
      box.innerHTML = `
        <button type="button" class="cmd-x" aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 1l10 10M11 1L1 11"/></svg></button>
        <div class="cmd-dh"><span class="cmd-k">指揮</span><b>${esc(c.name)}</b>
          <span class="cmd-sub">${esc(c.base?.version || "")}${c.base?.version ? " · " : ""}${esc((c.element || "").replace(/^./, m => m.toUpperCase()))} · ${c.stars}★</span></div>
        <div class="cmd-ds"><span class="cmd-dsh"><span>Team aura</span><i>always on</i></span>${aura}</div>
        ${u ? `<div class="cmd-ds"><span class="cmd-dsh"><span>Commander ultimate</span><i>costs ${COST} team chakra</i></span>
          <b class="cmd-un">${esc(u.name)}</b><p>${esc(u.description)}</p>
          <span class="cmd-note">Tap the banner when the gauge is full. The ${COST} chakra is taken from your team.</span></div>` : ""}`;
      (document.querySelector(".battle-container") || document.body).appendChild(box);
      const close = () => { box.remove(); document.removeEventListener("pointerdown", outside, true); };
      const outside = e => { if (!box.contains(e.target) && !this.el?.contains(e.target)) close(); };
      box.querySelector(".cmd-x").addEventListener("click", close);
      setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    },

    /* ===== cast ===== */

    /** Take `n` chakra from the team, one at a time from whoever holds the most. */
    drain(n) {
      const core = this.core;
      const team = (core.activeTeam || []).filter(alive);
      for (let k = 0; k < n; k++) {
        const u = team.reduce((a, b) => ((Number(b.chakra) || 0) > (Number(a?.chakra) || 0) ? b : a), null);
        if (!u || !(u.chakra > 0)) break;
        u.chakra -= 1;
      }
      team.forEach(u => {
        safe("chakra wheel", () => window.BattleChakraWheel?.updateChakraWheel?.(u, core));
        safe("holder chakra", () => core.teamHolder?.updateUnitChakra?.(u, core));
        safe("chakra display", () => core.chakra?.updateUnitChakraDisplay?.(u, core));
        safe("unit display", () => core.units?.updateUnitDisplay?.(u, core));
      });
      const T = core.turns;
      if (T?.currentUnit?.isPlayer && !T.autoMode) safe("action panel", () => T.showActionPanel(T.currentUnit, core));
    },

    /** The commander as an attacker: its own stats, element and skill. */
    attacker() {
      const core = this.core, c = core.commander;
      const st = safe("stats", () => (core.units ? core.units.computeStats(c.base, c.inst) : core.computeStatsFallback(c.base, c.inst))) || {};
      const atk = Number(st.atk) || (core.activeTeam || []).reduce((s, u) => s + (u?.stats?.atk || 0), 0) / Math.max(1, (core.activeTeam || []).length);
      return {
        id: "commander", name: c.name, charId: c.base?.id, element: c.element, isPlayer: true, isCommander: true,
        tierCode: c.tier, level: c.inst?.level, passives: {}, statusEffects: [], pos: { x: 6, y: 80 },
        stats: { ...st, atk, hp: Number(st.hp) || 1, maxHP: Number(st.maxHP || st.hp) || 1 },
      };
    },

    async cast() {
      const core = this.core, c = core?.commander, u = c?.ultimate;
      if (!u || !this.ready()) return false;
      this.casting = true;
      document.querySelector(".cmd-details")?.remove();
      const wasPaused = core.isPaused;
      core.isPaused = true; // speed gauges hold while the commander acts
      this.drain(COST);
      core.updateCollectiveChakra?.();
      this.el?.classList.add("is-casting");
      try {
        await this.cutIn();
        await this.strike();
      } catch (e) {
        console.error("[Commander] cast failed", e);
      } finally {
        this.el?.classList.remove("is-casting");
        core.isPaused = wasPaused;
        this.casting = false;
        this.update();
        safe("battle end", () => core.checkBattleEnd?.());
      }
      return true;
    },

    cutIn() {
      const core = this.core, c = core.commander, u = c.ultimate;
      const id = c.base?.id || "";
      const art = safe("art", () => (core.units ? core.units.resolveTierArt(c.base, c.tier) : core.resolveTierArtFallback(c.base, c.tier))) || {};
      const ov = document.createElement("div");
      ov.className = "cmd-cutin";
      ov.setAttribute("aria-hidden", "true");
      ov.innerHTML = `
        <div class="cmd-band"><div class="cmd-band-in">
          <div class="cmd-art"><img src="assets/characters/${esc(id)}/dossier/art.webp" alt="" draggable="false"></div>
        </div></div>
        <div class="cmd-title"><span class="cmd-k"><b>指揮奥義</b>Commander ultimate</span>
          <strong>${esc(u.name)}</strong><i></i><span class="cmd-by">${esc(c.name)}${c.base?.version ? ` · ${esc(c.base.version)}` : ""}</span></div>`;
      const img = ov.querySelector(".cmd-art img");
      img.addEventListener("error", () => { if (art.full && img.src.indexOf(art.full) < 0) img.src = art.full; }, { once: true });
      (document.querySelector(".battle-container") || document.body).appendChild(ov);
      requestAnimationFrame(() => ov.classList.add("in"));
      return wait(1500).then(() => { ov.classList.add("out"); return wait(260); }).then(() => ov.remove());
    },

    async strike() {
      const core = this.core, C = window.BattleCombat, S = window.BattleBuffs;
      const u = core.commander.ultimate;
      const data = { description: u.description, effects: u.effects };
      const att = this.attacker();
      const enemies = (core.enemyTeam || []).filter(alive);
      if (!enemies.length || !C) return;

      // Targets: as many as the skill says ("all enemies" = everyone), preferring
      // the element it hits hardest, then the weakest.
      const limit = C.skillTargetLimit ? C.skillTargetLimit(data) : 1;
      const desc = String(u.description || "");
      const favour = (desc.match(/toward\s+(body|bravery|wisdom|heart|skill)\s+elemental/i) || [])[1]?.toLowerCase();
      const pool = [...enemies].sort((a, b) =>
        ((favour && String(b.element).toLowerCase() === favour) - (favour && String(a.element).toLowerCase() === favour)) ||
        (a.stats.hp / (a.stats.maxHP || 1)) - (b.stats.hp / (b.stats.maxHP || 1)));
      const targets = limit ? pool.slice(0, limit) : pool;

      const fx = safe("fx", () => S?.skillFx?.(data));
      const ctx = safe("ctx", () => S?.attackCtx?.(att, fx, "ultimate")) || { kind: "ultimate" };
      const base = C.getSkillMultiplier ? C.getSkillMultiplier(data, 10) : 10;
      const elementMult = t => {
        // "20x attack toward Bravery elemental enemies. 18.2x attack toward all other"
        const m = desc.match(/([\d.]+)x attack toward (body|bravery|wisdom|heart|skill) elemental/i);
        if (m && String(t.element).toLowerCase() === m[2].toLowerCase()) return Number(m[1]);
        const o = desc.match(/([\d.]+)x attack toward all other/i);
        return o ? Number(o[1]) : base;
      };

      window.BattleAttackNames?.showAttackName?.(u.name, "ultimate");
      const hits = Math.max(1, Math.min(4, Number(u.hits) || 3));
      for (const t of targets) {
        const mult = C.getTargetMultiplier ? C.getTargetMultiplier(data, t, elementMult(t)) : elementMult(t);
        const r = C.calculateDamage(att, t, mult, ctx) || {};
        if (r.dodged) {
          safe("dodge", () => window.BattleAnimations?.showDamage(t, 0, false, core.dom, false, null));
          continue;
        }
        const slices = C.splitDamage ? C.splitDamage(r.damage || 0, hits) : [r.damage || 0];
        for (const d of slices) {
          t.stats.hp = Math.max(0, t.stats.hp - d);
          safe("damage number", () => window.BattleAnimations?.showDamage(t, d, r.isCritical, core.dom, false, r.breakdown));
          safe("hit react", () => window.BattlePhysics?.applyKnockback?.(t, att, 18, core));
          safe("display", () => (core.units ? core.units.updateUnitDisplay(t, core) : core.updateUnitDisplay?.(t)));
          await wait(140);
          if (!alive(t)) break;
        }
      }
      safe("effects", () => S?.postSkill?.(core, att, targets.filter(alive), fx, { kind: "ultimate" }));
      safe("team hp", () => core.updateTeamHP?.());
      await wait(300);
    },
  };

  window.BattleCommander = BattleCommander;

  /* ===== hooks into BattleCore ===== */
  const hook = () => {
    const core = window.BattleCore || window.BattleManager;
    if (!core || core._commanderHooked) return !!core;
    core._commanderHooked = true;
    const showUI = core.showCommanderUI;
    core.showCommanderUI = function () {
      if (!this.commander) return showUI?.call(this);
      BattleCommander.mount(this);
    };
    const updUI = core.updateCollectiveChakraUI;
    core.updateCollectiveChakraUI = function () {
      if (BattleCommander.el) BattleCommander.update();
      else updUI?.call(this);
    };
    // The commander ultimate is cast by the player now; never fire it automatically.
    core.updateCollectiveChakra = function () {
      this.collectiveChakra = (this.activeTeam || []).reduce((s, u) => s + (u?.chakra || 0), 0);
      this.updateCollectiveChakraUI();
      return this.collectiveChakra;
    };
    core.triggerCommanderUltimate = function () { return BattleCommander.cast(); };
    return true;
  };
  if (!hook()) document.addEventListener("DOMContentLoaded", hook, { once: true });

  // Chakra changes all through a turn (hits, regen, skills): keep the gauge live.
  setInterval(() => { if (BattleCommander.el && document.visibilityState === "visible") BattleCommander.update(); }, 400);
})();
