// js/battle/battle-domain.js - Domain Expansion (data-driven battlefield takeover)
(() => {
  "use strict";

  /**
   * BattleDomain
   *
   * A skill (normally an ultimate) can carry a `domain` block, either on the
   * skill (skills.ultimate.domain) or on its tier entry (byTier.7S.domain):
   *
   *   "domain": {
   *     "id": "unlimited_void",            state key (one domain at a time)
   *     "name": "Unlimited Void",           big title line + badge
   *     "kicker": "Domain Expansion",       small title line
   *     "map": "assets/battle/domains/unlimited_void.webp",
   *     "overlay": ".../unlimited_void_overlay.webp",   optional, animated on top
   *     "placeholder": "void",              CSS map used until `map` exists
   *     "color": "#9fe0ff", "color2": "#b28cff",        glow / accent
   *     "turns": 3,                         lasts for the caster's next N turns
   *     "stun": { "status": "immobilize", "turns": 1, "chance": 1, "bossChance": 0.5 },
   *     "casterAtkPct": 15,                 caster's attack +N% while it holds
   *     "sureHit": true,                    caster's attacks can't be evaded
   *     "tick": { "atkPct": 150, "hits": 4 },   optional: after each of the
   *                                         caster's turns (not the cast turn)
   *                                         the domain strikes every opponent
   *                                         on the field for atkPct% of the
   *                                         caster's attack (normal damage
   *                                         roll, split into `hits` numbers,
   *                                         always sure-hit), e.g. Malevolent
   *                                         Shrine's endless slashes
   *     "endOnCasterKO": true,              collapses when the caster falls
   *     "music": null                       optional AudioManager track while it holds
   *   }
   *
   * On cast (after the skill cut-in, before the hits; BattleCombat.runDomain):
   * title card → black → the domain map spreads from the caster in an
   * expanding sphere → opponents on the field get the `stun` status. While it
   * holds the map stays, a badge counts the caster's turns left and the
   * caster's attacks get casterAtkPct / sureHit. It ends after `turns` of the
   * caster's own turns (the cast turn itself doesn't count), or early when
   * the caster is KO'd / leaves the field; the map then shrinks back into the
   * caster. A second cast refreshes the timer; another unit's domain replaces
   * the current one with a short "Domain Clash" flash (the old domain stays
   * up under the clash and title cards, then the new one spreads over it).
   *
   * State lives on the caster (unit.domainState = { id, kind, turnsLeft,
   * fresh }), so js/battle/battle-save.js snapshots it with the unit and a
   * resumed battle shows the domain again without replaying the expansion.
   * The map sits in #battle-scene under the boss tint / ground layers and the
   * units; the scene's own map (and stage map changes) stay untouched below.
   *
   * Styles: css/battle-domain.css
   */
  const DEFAULTS = {
    kicker: "Domain Expansion",
    placeholder: "void",
    color: "#9fe0ff",
    color2: "#b28cff",
    turns: 3,
    stun: null,
    casterAtkPct: 0,
    sureHit: false,
    tick: null,
    endOnCasterKO: true,
    music: null
  };
  // Title card hold, black beat and sphere reveal (ms)
  const T_TITLE = 1500, T_BLACK = 380, T_REVEAL = 950, T_COLLAPSE = 750, T_CLASH = 1150;
  // Per-turn strike: gap between its hits (ms)
  const T_TICK_HIT = 140;

  const reducedMotion = () => {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const alive = u => !!(u && u.stats && u.stats.hp > 0);
  const log = (...a) => console.log("[Domain]", ...a);

  const BattleDomain = {
    caster: null,     // unit whose domain holds (its domainState has the timer)
    def: null,        // merged domain config
    dom: null,        // { layer, map, overlay, badge }
    _probes: new Map(),
    _seq: null,       // running expansion { skip }
    _music: null,     // track to go back to

    /* ===== Config ===== */

    /** Domain block of a skill entry ({ meta, data }) merged with defaults, or null. */
    defOf(skill) {
      const d = skill?.data?.domain || skill?.meta?.domain;
      if (!d || typeof d !== "object") return null;
      const tick = d.tick && typeof d.tick === "object" && Number(d.tick.atkPct) > 0
        ? { atkPct: Number(d.tick.atkPct), hits: Math.max(1, Math.min(8, Number(d.tick.hits) || 1)) }
        : null;
      return { ...DEFAULTS, ...d, stun: d.stun === undefined ? DEFAULTS.stun : d.stun, tick };
    },

    defFor(unit, kind) {
      const skills = window.BattleCombat?.getUnitSkills?.(unit);
      return skills ? this.defOf(skills[kind || "ultimate"]) : null;
    },

    isActive() { return !!(this.caster && this.caster.domainState); },

    /* ===== Art ===== */

    /** Resolves true when `src` loads (cached per url). */
    probe(src) {
      if (!src) return Promise.resolve(false);
      if (!this._probes.has(src)) {
        this._probes.set(src, new Promise(resolve => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = src;
        }));
      }
      return this._probes.get(src);
    },

    /** Build (once) the layer + badge inside #battle-scene. */
    ensureDom(core) {
      const scene = core?.dom?.scene || document.getElementById("battle-scene");
      if (!scene) return null;
      if (this.dom && this.dom.layer.isConnected && this.dom.badge.isConnected) return this.dom;
      this.dom?.layer.remove();
      this.dom?.badge.remove();
      const layer = document.createElement("div");
      layer.className = "domain-layer";
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = `<div class="domain-map"></div><div class="domain-overlay"></div><div class="domain-vignette"></div>`;
      scene.insertBefore(layer, scene.firstChild);
      const badge = document.createElement("div");
      badge.className = "domain-badge";
      badge.setAttribute("role", "status");
      badge.innerHTML = `<span class="db-ico" aria-hidden="true"></span><span class="db-text"><span class="db-kicker"></span><span class="db-name"></span></span><span class="db-turns"><b></b><i>turns</i></span>`;
      // In the top HUD row (centre slot, free outside commander battles),
      // clear of the gauge, the side action panel and a boss's HP bar.
      const hud = document.querySelector(".battle-hud .hud-center");
      if (hud) hud.appendChild(badge);
      else { badge.classList.add("is-floating"); scene.appendChild(badge); }
      this.dom = { scene, layer, map: layer.children[0], overlay: layer.children[1], badge };
      return this.dom;
    },

    /** Point the layer at this domain's art (placeholder until the map exists). */
    async paint(def) {
      const d = this.dom;
      if (!d) return;
      d.layer.dataset.domain = def.id || "";
      d.layer.style.setProperty("--dom-c1", def.color);
      d.layer.style.setProperty("--dom-c2", def.color2);
      d.badge.style.setProperty("--dom-c1", def.color);
      d.badge.style.setProperty("--dom-c2", def.color2);
      const ph = `dom-ph-${def.placeholder || "void"}`;
      d.map.className = `domain-map ${ph}`;
      d.map.style.backgroundImage = "";
      d.overlay.className = `domain-overlay dom-ov-${def.placeholder || "void"}`;
      d.overlay.style.backgroundImage = "";
      const [hasMap, hasOverlay] = await Promise.all([this.probe(def.map), this.probe(def.overlay)]);
      if (d.layer.dataset.domain !== (def.id || "")) return; // replaced meanwhile
      if (hasMap) {
        d.map.className = "domain-map has-art";
        d.map.style.backgroundImage = `url("${def.map}")`;
      }
      if (hasOverlay) {
        d.overlay.className = "domain-overlay has-art";
        d.overlay.style.backgroundImage = `url("${def.overlay}")`;
      }
    },

    /** Caster's centre in % of the scene (for the sphere origin). */
    originOf(unit, core) {
      const scene = this.dom?.scene;
      const el = unit && scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"] .unit-sprite`)
        || (unit && scene?.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`));
      if (!scene || !el) return { x: 50, y: 55 };
      const s = scene.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (!s.width || !s.height) return { x: 50, y: 55 };
      return {
        x: Math.max(0, Math.min(100, ((r.left + r.width / 2) - s.left) / s.width * 100)),
        y: Math.max(0, Math.min(100, ((r.top + r.height * 0.45) - s.top) / s.height * 100))
      };
    },

    setOrigin(pt) {
      const L = this.dom?.layer;
      if (!L) return;
      L.style.setProperty("--dom-x", `${pt.x.toFixed(2)}%`);
      L.style.setProperty("--dom-y", `${pt.y.toFixed(2)}%`);
    },

    renderBadge() {
      const d = this.dom, c = this.caster, st = c?.domainState;
      if (!d) return;
      if (!st || !this.def) { d.badge.classList.remove("is-on"); return; }
      d.badge.classList.add("is-on");
      d.badge.classList.toggle("is-enemy", !c.isPlayer);
      d.badge.classList.toggle("is-last", st.turnsLeft <= 1);
      d.badge.querySelector(".db-kicker").textContent = this.def.kicker || "Domain";
      d.badge.querySelector(".db-name").textContent = this.def.name || "Domain";
      d.badge.querySelector(".db-turns b").textContent = String(Math.max(0, st.turnsLeft));
      d.badge.querySelector(".db-turns i").textContent = st.turnsLeft === 1 ? "turn" : "turns";
      const perks = [];
      if (this.def.sureHit) perks.push("sure-hit");
      if (this.def.casterAtkPct) perks.push(`ATK +${this.def.casterAtkPct}%`);
      if (this.def.tick) perks.push("strikes every foe each turn");
      d.badge.title = `${this.def.kicker}: ${this.def.name} — ${c.name}${perks.length ? ` (${perks.join(", ")})` : ""}, ${st.turnsLeft} turn(s) left`;
      d.badge.setAttribute("aria-label", d.badge.title);
    },

    /* ===== Cast ===== */

    /**
     * Run the domain carried by `skill` (if any) for `caster`: resolves once
     * the domain is up and the opponents have been stunned. Never rejects.
     */
    expand(caster, kind, skill, core) {
      const def = this.defOf(skill);
      if (!def || !caster) return Promise.resolve(false);
      core = core || window.BattleManager;
      return this._expand(caster, kind || "ultimate", def, core).catch(e => {
        console.error("[Domain] expansion failed", e);
        this.showInstant(core);
        return true;
      });
    },

    async _expand(caster, kind, def, core) {
      const refresh = this.isActive() && this.caster === caster && this.caster.domainState.id === def.id;
      // Another caster's domain is up: Domain Clash. The old one gives way
      // (its timer is gone now) but stays on screen until the black beat.
      let clash = null;
      if (this.isActive() && !refresh && this.caster !== caster && this.dom?.layer.isConnected) {
        clash = { def: this.def, caster: this.caster };
        delete this.caster.domainState;
        this.caster = null;
        this.dom.badge.classList.remove("is-on");
        if (clash.def?.music) this.stopMusic();
        log(`Domain Clash: ${def.name} (${caster.name}) overwhelms ${clash.def?.name} (${clash.caster?.name})`);
      } else if (this.isActive() && !refresh) this.end("replaced", { quiet: true, instant: true });
      if (!this.ensureDom(core)) return false;

      // Timer: the cast turn doesn't count when cast on the caster's own turn
      // (a Link Ultimate follow-up happens on the partner's turn).
      caster.domainState = {
        id: def.id || "domain", kind, turnsLeft: Math.max(1, Number(def.turns) || 1),
        fresh: window.BattleTurns?.currentUnit === caster
      };
      this.caster = caster;
      this.def = def;
      const wasBusy = caster._actionBusy;
      caster._actionBusy = true; // turn watchdogs wait for the sequence
      log(`${caster.name}: ${def.kicker} — ${def.name}${refresh ? " (refreshed)" : ""}, ${caster.domainState.turnsLeft} turn(s)`);

      // In a clash the new art goes in under the black beat
      const painted = clash ? null : this.paint(def);
      this.setOrigin(this.originOf(caster, core));
      try {
        await this.playSequence(def, core, { refresh, painted, clash });
      } finally {
        caster._actionBusy = wasBusy || false;
      }
      if (!caster.domainState) return false; // ended meanwhile (battle over)
      this.applyStun(caster, def, core);
      this.renderBadge();
      window.BattleNarrator?.narrate?.(clash
        ? `Domain Clash! ${def.name} overwhelms ${clash.def?.name || "the domain"} and holds for ${caster.domainState.turnsLeft} of ${caster.name}'s turns.`
        : `${def.name} holds for ${caster.domainState.turnsLeft} of ${caster.name}'s turns.`, core);
      return true;
    },

    /**
     * [Domain Clash flash →] title card → black → sphere reveal (refresh:
     * title + pulse only). Tap skips to the end state. Reduced motion:
     * fades only.
     */
    async playSequence(def, core, { refresh, painted, clash }) {
      const d = this.dom, scene = d.scene;
      const rm = reducedMotion();
      const quick = document.hidden;
      const titles = !quick && window.BattleCutin?.isEnabled?.() !== false;
      const seq = { skipped: false };
      this._seq = seq;
      const hold = ms => seq.skipped ? Promise.resolve() : Promise.race([wait(ms), new Promise(r => { seq.wake = r; })]);

      const veil = document.createElement("div");
      veil.className = `domain-veil${rm ? " is-rm" : ""}`;
      const card = document.createElement("div");
      card.className = `domain-title${rm ? " is-rm" : ""}`;
      card.style.setProperty("--dom-c1", def.color);
      card.style.setProperty("--dom-c2", def.color2);
      card.innerHTML = `<div class="dt-band"><span class="dt-kicker"></span><span class="dt-name"></span><span class="dt-caster"></span></div><div class="dt-skip">Tap to skip</div>`;
      card.querySelector(".dt-kicker").textContent = def.kicker || "Domain Expansion";
      card.querySelector(".dt-name").textContent = def.name || "";
      card.querySelector(".dt-caster").textContent = this.caster?.name || "";
      const skip = e => { e.stopPropagation(); e.preventDefault?.(); seq.skipped = true; seq.wake?.(); };
      [veil, card].forEach(el => {
        el.addEventListener("pointerdown", skip);
        ["mousedown", "touchstart", "click", "mouseup", "touchend", "pointerup"]
          .forEach(t => el.addEventListener(t, e => e.stopPropagation(), { passive: t.startsWith("touch") }));
      });
      let clashEl = null;
      const cleanup = () => { veil.remove(); card.remove(); clashEl?.remove(); if (this._seq === seq) this._seq = null; };

      if (quick) { this.showInstant(core); cleanup(); return; }

      // 0. Domain Clash: both names collide over the old domain, white flash
      if (clash && titles) {
        clashEl = document.createElement("div");
        clashEl.className = `domain-clash${rm ? " is-rm" : ""}`;
        clashEl.style.setProperty("--dom-c1", def.color);
        clashEl.style.setProperty("--dom-old", clash.def?.color || "#9fe0ff");
        clashEl.innerHTML = `<div class="dc-side dc-old"><span></span></div><div class="dc-side dc-new"><span></span></div><div class="dc-flash"></div><div class="dc-title">Domain Clash</div>`;
        clashEl.querySelector(".dc-old span").textContent = clash.def?.name || "";
        clashEl.querySelector(".dc-new span").textContent = def.name || "";
        clashEl.addEventListener("pointerdown", skip);
        ["mousedown", "touchstart", "click", "mouseup", "touchend", "pointerup"]
          .forEach(t => clashEl.addEventListener(t, e => e.stopPropagation(), { passive: t.startsWith("touch") }));
        scene.appendChild(clashEl);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        clashEl.classList.add("is-in");
        this.duckMusic(rm ? 0.5 : 0.18);
        await hold(rm ? 700 : T_CLASH);
        clashEl.classList.add("is-out");
      }

      // 1. Title card over a darkening veil
      scene.appendChild(veil);
      if (titles) scene.appendChild(card);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      veil.classList.add("is-in");
      if (titles) card.classList.add("is-in");
      this.duckMusic(rm ? 0.5 : 0.18);
      await hold(titles ? (rm ? 1000 : T_TITLE) : 250);

      if (refresh) {
        // Already inside the domain: a pulse from the caster instead of a new reveal
        card.classList.remove("is-in"); card.classList.add("is-out");
        veil.classList.remove("is-in");
        d.layer.classList.remove("is-pulse"); void d.layer.offsetWidth;
        if (!rm) d.layer.classList.add("is-pulse");
        await hold(rm ? 200 : 500);
        this.restoreMusic();
        cleanup();
        return;
      }

      // 2. Black beat (map swapped under it)
      veil.classList.add("is-black");
      card.classList.remove("is-in"); card.classList.add("is-out");
      if (!painted) {
        // Clash: the old domain vanishes in the dark, the new art goes in
        await wait(rm ? 60 : 220);
        d.layer.classList.add("is-instant");
        d.layer.classList.remove("is-on", "is-pulse", "is-collapsing");
        scene.classList.remove("domain-on");
        void d.layer.offsetWidth;
        painted = this.paint(def);
      }
      await Promise.race([painted, wait(250)]);
      await hold(rm ? 150 : T_BLACK);
      this.startMusic(def);

      // 3. The domain spreads from the caster; the veil lifts
      d.layer.classList.remove("is-collapsing", "is-instant");
      d.layer.classList.toggle("is-rm", rm);
      void d.layer.offsetWidth;
      d.layer.classList.add("is-on");
      veil.classList.remove("is-black", "is-in");
      scene.classList.add("domain-on");
      let ring = null;
      if (!rm && !seq.skipped) {
        // Glowing shell of the sphere, growing with the clip-path reveal
        ring = document.createElement("div");
        ring.className = "domain-ring";
        ring.style.setProperty("--dom-c1", def.color);
        ring.style.left = d.layer.style.getPropertyValue("--dom-x");
        ring.style.top = d.layer.style.getPropertyValue("--dom-y");
        const r = scene.getBoundingClientRect();
        // circle(150%) of the layer = 1.5 x diagonal / sqrt(2) radius
        ring.style.setProperty("--dom-ring-d", `${Math.ceil(Math.hypot(r.width, r.height) * 1.5 * Math.SQRT2)}px`);
        scene.appendChild(ring);
        void ring.offsetWidth;
        ring.classList.add("is-go");
      }
      await hold(rm ? 350 : T_REVEAL);
      if (seq.skipped) this.showInstant(core);
      ring?.remove();
      this.restoreMusic();
      cleanup();
    },

    /** Domain shown at once (resume, hidden tab, skipped sequence). */
    showInstant(core) {
      const d = this.ensureDom(core);
      if (!d || !this.def) return;
      if (d.layer.dataset.domain !== (this.def.id || "")) this.paint(this.def);
      d.layer.classList.remove("is-collapsing");
      d.layer.classList.add("is-instant", "is-on");
      d.scene.classList.add("domain-on");
      this.renderBadge();
    },

    /** Stun every opponent on the field (bosses use bossChance). */
    applyStun(caster, def, core) {
      const s = def.stun;
      const B = window.BattleBuffs;
      if (!s || !B?.addStatus) return;
      const id = window.StatusCatalog?.resolveStatusId?.(s.status || "immobilize") || "immobilize";
      const foes = window.BattleCombat?.getOpponents?.(caster, core) || [];
      let landed = 0;
      foes.forEach((t, i) => {
        const chance = t.isBoss && s.bossChance != null ? Number(s.bossChance) : (s.chance == null ? 1 : Number(s.chance));
        const rec = B.addStatus(core, t, id, { turns: Math.max(1, Number(s.turns) || 1), chance, caster, source: "domain", value: s.value });
        if (rec) landed++;
        else if (t.isBoss) setTimeout(() => window.StatusEffectUI?.popup?.(t, "Resisted", "#cfe9ff", id), 120 + i * 60);
      });
      log(`stun: ${landed}/${foes.length} opponent(s) ${id}`);
    },

    /* ===== Timer / end ===== */

    /** After any unit's turn: tick the caster's timer, end on KO / expiry. */
    afterTurn(core, unit) {
      const c = this.caster, st = c?.domainState;
      if (!st) return;
      if (this.checkCaster(core)) return;
      if (unit !== c) return;
      if (st.fresh) { st.fresh = false; return; }
      if (this.def?.tick) {
        try { this.strike(core, c, this.def); } catch (e) { console.error("[Domain] strike failed", e); }
      }
      st.turnsLeft -= 1;
      log(`${this.def?.name}: ${st.turnsLeft} turn(s) left`);
      if (st.turnsLeft <= 0) this.end("expired");
      else this.renderBadge();
    },

    /**
     * The domain's per-turn strike (def.tick): every opponent on the field
     * takes atkPct% of the caster's attack (normal damage roll, never
     * evaded), shown as slash flashes + `hits` damage numbers. HP drops at
     * once (the next turn and a save see it); KOs show after the numbers.
     */
    strike(core, caster, def) {
      core = core || window.BattleManager;
      const C = window.BattleCombat, t = def?.tick;
      if (!C?.calculateDamage || !t || !alive(caster)) return 0;
      const foes = C.getOpponents?.(caster, core) || [];
      if (!foes.length) return 0;
      const hits = t.hits;
      const plans = [];
      let total = 0;
      this._striking = true; // sure-hit (checkEvade hook)
      try {
        foes.forEach(f => {
          const ctx = { ...(window.BattleBuffs?.attackCtx?.(caster, null, "domain") || {}), kind: "domain", ignoreSubstitution: true, ignorePerfectDodge: true };
          const r = C.calculateDamage(caster, f, t.atkPct / 100, ctx);
          const dmg = Math.max(0, Math.floor(r?.damage || 0));
          if (dmg <= 0 || r?.dodged) return;
          f.stats.hp = Math.max(0, f.stats.hp - dmg);
          if (f.stats.hp <= 0) f.diedAtTurn = core?.turns?.globalTurn ?? 0;
          total += dmg;
          plans.push({ unit: f, slices: C.splitDamage ? C.splitDamage(dmg, hits) : [dmg], crit: !!r.isCritical });
        });
      } finally {
        this._striking = false;
      }
      log(`${def.name} strikes ${plans.length} opponent(s) for ${total} (${t.atkPct}% ATK, ${hits} hit(s))`);
      if (!plans.length) return 0;
      window.BattleNarrator?.narrate?.(`${def.name} slashes every foe in range!`, core);

      // The domain flares, slashes land on each target with its numbers
      const d = this.dom, rm = reducedMotion(), hidden = document.hidden;
      if (d && !rm && !hidden) {
        d.layer.classList.remove("is-strike"); void d.layer.offsetWidth; d.layer.classList.add("is-strike");
        setTimeout(() => d.layer.classList.remove("is-strike"), 700);
      }
      const A = window.BattleAnimations;
      const refresh = u => { if (core?.units) core.units.updateUnitDisplay(u, core); else core?.updateUnitDisplay?.(u); };
      plans.forEach(p => {
        if (hidden) { refresh(p.unit); return; }
        const sel = `.battle-unit[data-unit-id="${p.unit.id}"]`;
        const el = core?.dom?.scene?.querySelector(`${sel} .unit-sprite`) || core?.dom?.scene?.querySelector(sel);
        p.slices.forEach((amt, k) => setTimeout(() => {
          if (el && !rm) this.slashAt(el, def, k);
          if (A?.showComboHit && core?.dom) A.showComboHit(p.unit, amt, p.crit && k === 0, core.dom, k, hits);
          else window.StatusEffectUI?.number?.(p.unit, amt, "region");
        }, k * T_TICK_HIT));
        // HP bar / KO once the numbers are out
        setTimeout(() => refresh(p.unit), hits * T_TICK_HIT + 120);
      });
      core?.updateTeamHP?.();
      if (plans.some(p => p.unit.stats.hp <= 0)) {
        setTimeout(() => core?.checkBattleEnd?.(), hidden ? 0 : hits * T_TICK_HIT + 200);
      }
      return total;
    },

    /** One slash flash across a unit's body (domain strike). */
    slashAt(el, def, k) {
      const scene = this.dom?.scene;
      if (!scene || !el?.isConnected) return;
      const s = scene.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const fx = document.createElement("div");
      fx.className = "domain-slash";
      const len = Math.max(60, Math.min(460, Math.hypot(r.width, r.height) * 1.15));
      const ang = (k % 2 ? 1 : -1) * (18 + Math.random() * 40) + (Math.random() < 0.25 ? 90 : 0);
      fx.style.setProperty("--dom-c1", def.color);
      fx.style.left = `${r.left - s.left + r.width * (0.3 + Math.random() * 0.4)}px`;
      fx.style.top = `${r.top - s.top + r.height * (0.3 + Math.random() * 0.4)}px`;
      fx.style.width = `${len}px`;
      fx.style.height = `${Math.max(3, Math.min(7, len / 80)).toFixed(1)}px`; // thicker across a giant
      fx.style.setProperty("--dom-rot", `${ang.toFixed(1)}deg`);
      scene.appendChild(fx);
      setTimeout(() => fx.remove(), 520);
    },

    /** Ends the domain if its caster is down or off the field. Returns true if it ended. */
    checkCaster(core) {
      const c = this.caster;
      if (!c?.domainState || this._seq) return false;
      core = core || window.BattleManager;
      const onField = !c.isBench && (!core?.combatants || core.combatants.includes(c));
      if (!alive(c) && this.def?.endOnCasterKO !== false) { this.end("ko"); return true; }
      if (!onField && alive(c)) { this.end("left"); return true; }
      return false;
    },

    /**
     * Collapse the domain back into the caster. opts.quiet: no narration,
     * opts.instant: no animation (a new domain replaces it / battle over).
     */
    end(reason, opts = {}) {
      const c = this.caster, def = this.def;
      if (c) delete c.domainState;
      this.caster = null;
      const d = this.dom;
      log(`${def?.name || "domain"} ended (${reason})`);
      if (!opts.quiet && def && c) {
        const why = reason === "ko" ? `${c.name} fell — ` : "";
        window.BattleNarrator?.narrate?.(`${why}${def.name} collapses.`, window.BattleManager);
      }
      if (def?.music) this.stopMusic();
      if (!d) { this.def = null; return; }
      d.badge.classList.remove("is-on");
      d.scene.classList.remove("domain-on");
      const rm = reducedMotion();
      if (opts.instant || document.hidden) {
        d.layer.classList.remove("is-on", "is-instant", "is-collapsing", "is-pulse");
        this.def = null;
        return;
      }
      if (c) this.setOrigin(this.originOf(c, window.BattleManager));
      d.layer.classList.toggle("is-rm", rm);
      d.layer.classList.remove("is-instant", "is-pulse");
      d.layer.classList.add("is-collapsing");
      const L = d.layer;
      requestAnimationFrame(() => L.classList.remove("is-on"));
      setTimeout(() => { if (!this.caster) L.classList.remove("is-collapsing"); }, (rm ? 350 : T_COLLAPSE) + 80);
      this.def = null;
    },

    /** Resumed battle (or a missed paint): show any domain held in unit state. */
    sync(core) {
      core = core || window.BattleManager;
      if (!core) return;
      const units = [...(core.activeTeam || []), ...(core.benchTeam || []), ...(core.enemyTeam || [])];
      const holder = units.find(u => u?.domainState && u.domainState.turnsLeft > 0);
      if (!holder) {
        if (this.caster && !this.caster.domainState) this.end("lost", { quiet: true, instant: true });
        return;
      }
      if (this.caster === holder && this.dom?.layer.classList.contains("is-on")) return;
      const def = this.defFor(holder, holder.domainState.kind);
      if (!def) { delete holder.domainState; return; }
      this.caster = holder;
      this.def = def;
      this.ensureDom(core);
      this.setOrigin(this.originOf(holder, core));
      this.showInstant(core);
      if (def.music) this.startMusic(def);
      log(`restored ${def.name} (${holder.domainState.turnsLeft} turn(s) left)`);
      this.checkCaster(core);
    },

    /* ===== Music ===== */

    duckMusic(level) {
      const A = window.AudioManager;
      try {
        if (!A?.musicBus || !A.ctx) return;
        const g = A.musicBus.gain, now = A.ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setTargetAtTime(A._musicLevel() * level, now, 0.12);
      } catch { /* audio optional */ }
    },
    restoreMusic() {
      try { window.AudioManager?._applyMusicVolume?.(); } catch { /* audio optional */ }
    },
    startMusic(def) {
      const A = window.AudioManager;
      if (!def?.music || !A?.playMusic) return;
      if (this._music == null) this._music = A.musicPlaying || null;
      A.playMusic(def.music);
    },
    stopMusic() {
      const A = window.AudioManager;
      if (this._music && A?.playMusic) A.playMusic(this._music);
      this._music = null;
    },

    /* ===== Hooks ===== */

    install() {
      const T = window.BattleTurns, B = window.BattleBuffs, M = window.BattleMissions;
      const self = this;
      const wrap = (obj, name, make) => {
        if (!obj || typeof obj[name] !== "function") return;
        obj[name] = make(obj[name]);
      };

      wrap(T, "endTurn", orig => function (core) {
        const unit = this.currentUnit;
        const r = orig.apply(this, arguments);
        try { if (unit) self.afterTurn(core, unit); } catch (e) { console.error("[Domain] turn tick failed", e); }
        return r;
      });
      wrap(T, "startTurn", orig => function (unit, core) {
        try { if (self.caster) self.checkCaster(core); else self.sync(core); } catch (e) { /* cosmetic */ }
        return orig.apply(this, arguments);
      });
      wrap(T, "startSpeedGaugeTick", orig => function (core) {
        const r = orig.apply(this, arguments);
        setTimeout(() => { try { self.sync(core); } catch (e) { console.error("[Domain] restore failed", e); } }, 60);
        return r;
      });

      // Caster perks while the domain holds
      wrap(B, "damageMods", orig => function (attacker, defender, ctx) {
        const out = orig.apply(this, arguments);
        if (attacker && attacker === self.caster && attacker.domainState && self.def?.casterAtkPct) {
          out.atkPct += Number(self.def.casterAtkPct) || 0;
        }
        return out;
      });
      wrap(B, "checkEvade", orig => function (attacker, defender) {
        if (self._striking) return null; // the domain's own strike always lands
        if (attacker && attacker === self.caster && attacker.domainState && self.def?.sureHit && defender && defender !== attacker) {
          return null;
        }
        return orig.apply(this, arguments);
      });

      // Battle over: the domain goes quietly
      ["declareVictory", "declareDefeat"].forEach(n => wrap(M, n, orig => function () {
        try { if (self.caster) self.end("battle over", { quiet: true }); } catch (e) { /* cosmetic */ }
        return orig.apply(this, arguments);
      }));

      // Preload a domain map while the battle loads (the loader waits for it).
      let tries = 0;
      const warm = setInterval(() => {
        const bm = window.BattleManager;
        const units = [...(bm?.activeTeam || []), ...(bm?.benchTeam || []), ...(bm?.enemyTeam || [])].filter(Boolean);
        if (!units.length) { if (++tries > 80) clearInterval(warm); return; }
        clearInterval(warm);
        const defs = [];
        units.forEach(u => ["ultimate", "jutsu", "secret"].forEach(k => { const d = self.defFor(u, k); if (d) defs.push(d); }));
        if (!defs.length) return;
        const all = Promise.all(defs.map(d => Promise.all([self.probe(d.map), self.probe(d.overlay)])));
        try { if (window.PageLoader && !window.PageLoader.revealed) window.PageLoader.wait(all, "domain map"); } catch { /* optional loader */ }
      }, 100);

      log("hooks installed");
    }
  };

  window.BattleDomain = BattleDomain;
  BattleDomain.install();
  console.log("[BattleDomain] Module loaded ✅");
})();
