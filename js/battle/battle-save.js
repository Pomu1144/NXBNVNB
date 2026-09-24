// js/battle/battle-save.js - Battle resume (refresh-safe) + reward idempotency
//
// A refresh or accidental reload mid-battle resumes the same battle:
//   - A snapshot of the serializable battle state is written to localStorage
//     (KEY) at safe points only: when a wave has loaded, and at the very start
//     of every unit's turn (before turn-start effects run, i.e. after the
//     previous player / enemy action fully resolved). Never mid-animation.
//   - On load, if a snapshot matches this stage + team it is restored instead
//     of starting fresh, and the unit whose turn it was acts again.
//
// Anti-exploit:
//   - Combat rolls (damage variance, crits, evasion, status chance, AI target
//     and skill choice, cooldown rolls, wave formations, chest contents) come
//     from a seeded RNG keyed on (battle seed, turn number), so replaying the
//     same turn after a reload gives the same outcome for the same action.
//   - Snapshots only move forward (turnSeq never decreases for a battle id)
//     and carry a checksum; tampered / old / corrupt ones are discarded.
//   - Victory, defeat (and abandoning from the resume prompt) clear the
//     snapshot. Rewards are granted once per battle id (CLAIMS_KEY ledger),
//     up front, so reloading the results screen can never pay twice.
//
// Everything is wired by wrapping module methods from here, so the battle
// modules themselves (battle-combat.js etc.) need no edits.
(() => {
  "use strict";

  const KEY = "blazing_battle_resume_v1";
  const CLAIMS_KEY = "blazing_battle_claims_v1";
  const INTENT_KEY = "blazing_battle_resume_intent_v1";
  const VERSION = 1;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // older snapshots are dropped
  const MAX_CLAIMS = 40;
  const SALT = "blazing-resume:v1";

  const nativeRandom = Math.random;
  const log = (...a) => console.log("[BattleSave]", ...a);
  const warn = (...a) => console.warn("[BattleSave]", ...a);

  /* ===== Small utils ===== */

  function hash32(str) { // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { warn("storage write failed", e); return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }

  function navType() {
    try { return performance.getEntriesByType("navigation")[0]?.type || "navigate"; }
    catch (e) { return "navigate"; }
  }

  /* ===== Store ===== */

  const Store = {
    checksum(snap) {
      const { sum, ...rest } = snap;
      return hash32(SALT + JSON.stringify(rest)).toString(36);
    },

    /** Parsed + validated snapshot, or null (invalid ones are removed). */
    read() {
      const raw = lsGet(KEY);
      if (!raw) return null;
      let snap = null;
      try { snap = JSON.parse(raw); } catch (e) { snap = null; }
      const bad = reason => { warn(`discarding saved battle (${reason})`); lsDel(KEY); return null; };
      if (!snap || typeof snap !== "object") return bad("unreadable");
      if (snap.v !== VERSION) return bad(`version ${snap.v}`);
      if (typeof snap.battleId !== "string" || typeof snap.stageKey !== "string" || typeof snap.teamKey !== "string") return bad("missing ids");
      if (!(Date.now() - Number(snap.savedAt) < MAX_AGE_MS)) return bad("too old");
      if (snap.sum !== this.checksum(snap)) return bad("checksum mismatch");
      if (!snap.players || !Array.isArray(snap.players.active) || !Array.isArray(snap.players.bench) ||
          !snap.players.units || !Array.isArray(snap.enemies)) return bad("malformed");
      if (Claims.has(snap.battleId)) return bad("battle already finished");
      return snap;
    },

    /** Write, refusing to move an existing snapshot of the same battle backwards. */
    write(snap) {
      const prev = this.peekRaw();
      if (prev && prev.battleId === snap.battleId && Number(prev.turnSeq) > Number(snap.turnSeq)) {
        warn(`refusing to rewind snapshot (${prev.turnSeq} -> ${snap.turnSeq})`);
        return false;
      }
      snap.sum = this.checksum(snap);
      return lsSet(KEY, JSON.stringify(snap));
    },

    peekRaw() {
      try { return JSON.parse(lsGet(KEY) || "null"); } catch (e) { return null; }
    },

    clear(reason, battleId) {
      if (battleId) {
        const cur = this.peekRaw();
        if (cur && cur.battleId !== battleId) return; // someone else's snapshot
      }
      if (lsGet(KEY) != null) log(`saved battle cleared (${reason || "clear"})`);
      lsDel(KEY);
    }
  };

  /* ===== Claims ledger (reward idempotency) ===== */

  const Claims = {
    all() {
      try {
        const v = JSON.parse(lsGet(CLAIMS_KEY) || "{}");
        return v && typeof v === "object" && !Array.isArray(v) ? v : {};
      } catch (e) { return {}; }
    },
    has(id) { return !!(id && this.all()[id]); },
    /** Mark claimed; returns false if it already was. */
    claim(id, outcome) {
      if (!id) return true;
      const all = this.all();
      if (all[id]) return false;
      all[id] = { t: Date.now(), o: outcome };
      const keep = Object.entries(all).sort((a, b) => (b[1]?.t || 0) - (a[1]?.t || 0)).slice(0, MAX_CLAIMS);
      lsSet(CLAIMS_KEY, JSON.stringify(Object.fromEntries(keep)));
      return true;
    }
  };

  /* ===== Seeded RNG ===== */

  const Rng = {
    state: null,
    depth: 0,
    suspended: 0,
    next() { // mulberry32
      let t = (Rng.state = (Rng.state + 0x6D2B79F5) | 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    seedFor(seed, label) { return hash32(`${seed}:${label}`) | 0; },
    /** Run fn with Math.random drawing from the battle stream. */
    run(fn, self, args) {
      if (Rng.state == null || Rng.suspended) return fn.apply(self, args);
      if (Rng.depth++ === 0) Math.random = Rng.next;
      try { return fn.apply(self, args); }
      finally { if (--Rng.depth === 0) Math.random = nativeRandom; }
    },
    /** Run fn on its own labelled stream (wave formations, chest rolls). */
    runLabelled(seed, label, fn, self, args) {
      if (seed == null) return fn.apply(self, args);
      const saved = Rng.state;
      Rng.state = Rng.seedFor(seed, label);
      try { return Rng.run(fn, self, args); }
      finally { Rng.state = saved; }
    },
    /** Run fn with the native RNG (previews must not consume rolls). */
    native(fn, self, args) {
      Rng.suspended++;
      const prev = Math.random;
      Math.random = nativeRandom;
      try { return fn.apply(self, args); }
      finally { Rng.suspended--; Math.random = prev; }
    }
  };

  /* ===== Serialization ===== */

  // Transient / derived unit fields never saved (DOM, sprites, caches, refs)
  const SKIP_SAVE = new Set(["_ref", "_sprite", "_runToken", "_actionBusy", "_hitAt", "_koShown",
    "_statusProfile", "_noHitSheet", "isPaused", "clickCount"]);
  // Saved but rebuilt from game data on load instead of being overwritten
  const SKIP_RESTORE = new Set(["id", "name", "portrait", "charId", "passives", "passiveEffects", "isPlayer"]);

  function isPlain(v) {
    const p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  }

  function makeCleaner(refOf) {
    const clean = (v, depth) => {
      if (v == null) return v === null ? null : undefined;
      const t = typeof v;
      if (t === "number") return Number.isFinite(v) ? v : null;
      if (t === "string" || t === "boolean") return v;
      if (t !== "object" || depth > 8) return undefined;
      if (typeof Node !== "undefined" && v instanceof Node) return undefined;
      const ref = refOf(v);
      if (ref) return { __unitRef: ref };
      if (Array.isArray(v)) return v.map(x => { const c = clean(x, depth + 1); return c === undefined ? null : c; });
      if (!isPlain(v)) return undefined;
      const out = {};
      for (const k of Object.keys(v)) {
        const c = clean(v[k], depth + 1);
        if (c !== undefined) out[k] = c;
      }
      return out;
    };
    return clean;
  }

  function revive(v, unitOf) {
    if (Array.isArray(v)) return v.map(x => revive(x, unitOf));
    if (v && typeof v === "object") {
      if (typeof v.__unitRef === "string") return unitOf(v.__unitRef) || null;
      const out = {};
      for (const k of Object.keys(v)) out[k] = revive(v[k], unitOf);
      return out;
    }
    return v;
  }

  /* ===== Battle identity ===== */

  function teamKey() {
    let team = {};
    try {
      const t = JSON.parse(lsGet("blazing_teams_v1") || "{}");
      team = t[1] || t["1"] || {};
    } catch (e) { team = {}; }
    const slots = ["front-1", "front-2", "front-3", "front-4", "back-1", "back-2", "back-3", "back-4", "commander"];
    return slots.map(s => `${s}=${team[s]?.uid || ""}`).join("|");
  }

  function stageKey(bm) {
    if (bm.isArena) {
      return `arena:${hash32((lsGet("arena_enemies") || "") + "@" + (lsGet("arena_map") || "")).toString(36)}`;
    }
    const id = bm.missionData?.id;
    return id ? `mission:${id}:${bm.difficulty}` : null;
  }

  /* ===== BattleSave ===== */

  const BattleSave = {
    KEY, CLAIMS_KEY, INTENT_KEY,
    Store, Claims, Rng,

    bm: null,
    battleId: null,
    seed: null,
    createdAt: 0,
    turnSeq: 0,
    stageKey: null,
    teamKey: null,
    restoring: false,
    resumed: null,       // snapshot this page resumed from
    pendingResume: null, // state applied once the battle manager finishes init
    finished: false,
    claimOk: null,

    /** Snapshot for UI (resume prompt) - validated, or null. */
    peek() { return Store.read(); },

    /**
     * Remove any saved battle (dev panel / abandon). With stopSaving, this
     * page stops writing snapshots too, so a reload starts fresh.
     */
    clearSaved(reason, stopSaving) {
      Store.clear(reason || "manual");
      if (stopSaving) this.finished = true;
    },

    /* ----- lifecycle ----- */

    /** Called from BattleMissions.init: resume a matching snapshot or start fresh. */
    begin(M, bm, orig) {
      this.bm = bm;
      lsDel(INTENT_KEY);
      const sk = stageKey(bm);
      const tk = teamKey();
      if (!sk) return orig.call(M, bm); // unknown battle type: no saving

      this.stageKey = sk;
      this.teamKey = tk;

      let snap = Store.read();
      if (snap && (snap.stageKey !== sk || snap.teamKey !== tk)) {
        const teamChanged = snap.stageKey === sk && snap.teamKey !== tk;
        Store.clear(teamChanged ? "team changed" : "different battle");
        if (teamChanged) this.toast("Saved battle discarded", "Your team changed since it was saved");
        snap = null;
      }

      if (snap) {
        let mutated = false;
        try {
          const plan = this.validate(bm, snap);
          mutated = true;
          this.restore(M, bm, snap, plan);
          return;
        } catch (err) {
          warn("could not resume saved battle, starting fresh:", err?.message || err);
          Store.clear("corrupt");
          this.restoring = false;
          if (mutated) { location.reload(); return; }
        }
      }

      // Fresh battle
      this.battleId = `b${Date.now().toString(36)}${Math.floor(nativeRandom() * 1e9).toString(36)}`;
      this.seed = (nativeRandom() * 0x7fffffff) | 0;
      this.createdAt = Date.now();
      this.turnSeq = 0;
      Rng.state = Rng.seedFor(this.seed, "t0");
      log(`new battle ${this.battleId} (${sk})`);
      return orig.call(M, bm);
    },

    /** Check a snapshot against the loaded game data before touching anything. */
    validate(bm, snap) {
      if (snap.difficulty !== bm.difficulty) throw new Error("difficulty mismatch");
      const stages = bm.missionData?.difficulties?.[bm.difficulty];
      const stage = Array.isArray(stages) ? stages[snap.stageIndex] : null;
      const waves = stage?.waves;
      if (!Array.isArray(waves) || !waves[snap.waveIndex]) throw new Error("stage/wave out of range");
      if ((waves[snap.waveIndex].enemies || []).length !== snap.enemies.length) throw new Error("enemy count mismatch");

      const pool = new Map();
      [...(bm.activeTeam || []), ...(bm.benchTeam || [])].forEach(u => { if (u) pool.set(String(u.id), u); });
      const active = snap.players.active.map(id => pool.get(String(id)));
      const bench = snap.players.bench.map(id => pool.get(String(id)));
      if (active.some(u => !u) || bench.some(u => !u)) throw new Error("unit missing");
      if (new Set([...active, ...bench]).size !== pool.size || active.length + bench.length !== pool.size) {
        throw new Error("team size mismatch");
      }
      if (!active.length) throw new Error("no active units");
      for (const u of [...active, ...bench]) {
        const s = snap.players.units[String(u.id)];
        if (!s || !s.stats || !Number.isFinite(s.stats.hp) || !Number.isFinite(s.stats.maxHP)) throw new Error("unit state malformed");
      }
      for (const e of snap.enemies) {
        if (!e || !e.stats || !Number.isFinite(e.stats.hp)) throw new Error("enemy state malformed");
      }
      return { stage, waves, active, bench };
    },

    restore(M, bm, snap, plan) {
      this.restoring = true;
      this.battleId = snap.battleId;
      this.seed = snap.seed | 0;
      this.createdAt = snap.createdAt || Date.now();
      this.turnSeq = Number(snap.turnSeq) || 0;

      // Stage + wave (fresh enemy objects, then overlaid below)
      bm.currentStageIndex = snap.stageIndex;
      M.setSceneBackground?.(bm, plan.stage);
      M.loadWave(bm, plan.waves, snap.waveIndex);

      bm.activeTeam = plan.active;
      bm.benchTeam = plan.bench;

      const refMap = new Map();
      bm.activeTeam.concat(bm.benchTeam).forEach(u => refMap.set(`p:${u.id}`, u));
      bm.enemyTeam.forEach((u, i) => refMap.set(`e:${i}`, u));
      const unitOf = ref => refMap.get(ref) || null;

      const apply = (unit, saved) => {
        // Enemy ids are generated per load; keep the saved one so status
        // effects that name their caster (casterId) still point at it.
        if (!unit.isPlayer && typeof saved.id === "string" && saved.id) unit.id = saved.id;
        for (const k of Object.keys(saved)) {
          if (SKIP_RESTORE.has(k)) continue;
          if (k === "stats") { Object.assign(unit.stats, revive(saved.stats, unitOf)); continue; }
          unit[k] = revive(saved[k], unitOf);
        }
        if (saved.passiveEffects?.triggers && unit.passiveEffects) {
          unit.passiveEffects.triggers = revive(saved.passiveEffects.triggers, unitOf);
        }
        unit.isPaused = false;
      };
      bm.activeTeam.concat(bm.benchTeam).forEach(u => apply(u, snap.players.units[String(u.id)]));
      bm.enemyTeam.forEach((u, i) => apply(u, snap.enemies[i]));

      const c = snap.core || {};
      if (Number.isFinite(c.collectiveChakra)) bm.collectiveChakra = c.collectiveChakra;
      bm.commanderUltimateUsed = !!c.commanderUltimateUsed;
      if ([1, 2, 3].includes(c.speedMultiplier)) {
        bm.speedMultiplier = c.speedMultiplier;
        if (bm.dom?.btnSpeed) bm.dom.btnSpeed.textContent = `×${bm.speedMultiplier}`;
      }
      if (bm.turns) {
        bm.turns.autoMode = !!c.autoMode;
        bm.dom?.btnAuto?.classList.toggle("active", bm.turns.autoMode);
      }
      if (window.BattleBuffs && Number.isFinite(snap.buffs?.turnSerial)) {
        window.BattleBuffs.turnSerial = snap.buffs.turnSerial;
      }

      bm.updateCombatants();
      bm.updateTeamHP?.();
      bm.updateCollectiveChakraUI?.();
      bm.units?.renderBenchUnits?.(bm);

      // Dead units: loadWave rendered everyone; drop the fallen once drawn
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const grid = bm.dom?.grid;
        if (!grid) return;
        const els = Array.from(grid.querySelectorAll(".battle-unit"));
        bm.combatants.forEach(u => {
          if (u.stats.hp > 0) return;
          const el = els.find(e => e.dataset.unitId === String(u.id) && !e._bsGone);
          if (el) { el._bsGone = true; el.remove(); }
        });
      }));

      this.pendingResume = {
        acting: snap.acting ? unitOf(snap.acting) : null,
        lastStand: snap.lastStand || null,
        rewards: snap.rewards || null,
        stageIndex: snap.stageIndex,
        waveIndex: snap.waveIndex
      };
      this.resumed = snap;
      this.restoring = false;
      log(`resumed battle ${snap.battleId} at stage ${snap.stageIndex + 1} wave ${snap.waveIndex + 1}, turn ${snap.turnSeq}`);
    },

    /** Runs once the battle manager is fully initialised (tick loop running). */
    afterInit(bm) {
      const p = this.pendingResume;
      if (!p) return;
      this.pendingResume = null;

      const EU = window.BattleEquippedUltimate;
      if (EU && p.lastStand) {
        ["basicAttackCounts", "ultimatesUsed", "ultimateReady"].forEach(k => {
          if (p.lastStand[k] && typeof p.lastStand[k] === "object") EU[k] = { ...EU[k], ...p.lastStand[k] };
        });
        try { EU.updateButtonUI?.(); } catch (e) { /* cosmetic */ }
      }

      const T = bm.turns;
      const allDead = side => side.every(u => !(u?.stats?.hp > 0));
      if (allDead([...(bm.activeTeam || []), ...(bm.benchTeam || [])]) || allDead(bm.enemyTeam || [])) {
        bm.checkBattleEnd?.();
      } else if (p.acting && T && !T.turnLocked && !bm.isPaused && p.acting.stats.hp > 0 && bm.combatants.includes(p.acting)) {
        p.acting.speedGauge = bm.GAUGE_MAX;
        T.startTurn(p.acting, bm);
      }
      T?.updateSpeedGaugeDisplay?.(bm);
      this.toast("Battle resumed", `Stage ${p.stageIndex + 1} · Wave ${p.waveIndex + 1}`);
    },

    /* ----- snapshots ----- */

    canSave(bm) {
      return !!(this.battleId && bm && !this.finished && !this.restoring && bm === this.bm);
    },

    snapshot(bm, reason, acting) {
      if (!this.canSave(bm)) return false;
      const players = [...(bm.activeTeam || []), ...(bm.benchTeam || [])].filter(Boolean);
      const enemies = bm.enemyTeam || [];
      if (!players.some(u => u.stats?.hp > 0) || !enemies.some(u => u.stats?.hp > 0)) return false;

      const refs = new Map();
      players.forEach(u => refs.set(u, `p:${u.id}`));
      enemies.forEach((u, i) => refs.set(u, `e:${i}`));
      const clean = makeCleaner(v => refs.get(v) || null);
      const ser = u => {
        const out = {};
        for (const k of Object.keys(u)) {
          if (SKIP_SAVE.has(k)) continue;
          const c = clean(u[k], 0);
          if (c !== undefined) out[k] = c;
        }
        return out;
      };

      const units = {};
      players.forEach(u => { units[String(u.id)] = ser(u); });
      const EU = window.BattleEquippedUltimate;
      const R = window.BattleRewards;

      const snap = {
        v: VERSION,
        battleId: this.battleId,
        seed: this.seed,
        createdAt: this.createdAt,
        savedAt: Date.now(),
        reason,
        turnSeq: this.turnSeq,
        stageKey: this.stageKey,
        teamKey: this.teamKey,
        missionId: bm.missionData?.id || null,
        missionName: bm.missionData?.name || "",
        difficulty: bm.difficulty,
        isArena: !!bm.isArena,
        stageIndex: bm.currentStageIndex || 0,
        waveIndex: bm.currentWaveIndex || 0,
        acting: acting ? (refs.get(acting) || null) : null,
        players: {
          active: (bm.activeTeam || []).filter(Boolean).map(u => String(u.id)),
          bench: (bm.benchTeam || []).filter(Boolean).map(u => String(u.id)),
          units
        },
        enemies: enemies.map(ser),
        core: {
          collectiveChakra: bm.collectiveChakra || 0,
          commanderUltimateUsed: !!bm.commanderUltimateUsed,
          speedMultiplier: bm.speedMultiplier || 1,
          autoMode: !!bm.turns?.autoMode
        },
        buffs: { turnSerial: window.BattleBuffs?.turnSerial || 0 },
        lastStand: EU ? clean({
          basicAttackCounts: EU.basicAttackCounts,
          ultimatesUsed: EU.ultimatesUsed,
          ultimateReady: EU.ultimateReady
        }, 0) : null,
        rewards: R ? clean({ collectedChests: R.collectedChests, currentStageChest: R.currentStageChest }, 0) : null
      };
      return Store.write(snap);
    },

    /** Turn start (before any turn-start effect): save, then seed this turn's rolls. */
    onTurnStart(bm, unit) {
      if (this.battleId == null || bm !== this.bm) return;
      this.snapshot(bm, "turn", unit);
      this.turnSeq++;
      Rng.state = Rng.seedFor(this.seed, `t${this.turnSeq}`);
    },

    /**
     * Battle over (victory / defeat). Clears the snapshot and marks the battle
     * id claimed. Returns true only for the first finish of an unclaimed id,
     * i.e. whether rewards / arena results may be granted.
     */
    finish(bm, outcome) {
      if (!this.battleId || bm !== this.bm) return true;
      if (this.claimOk == null) {
        this.claimOk = Claims.claim(this.battleId, outcome);
        this.finished = true;
        Store.clear(outcome, this.battleId);
        if (!this.claimOk) warn(`battle ${this.battleId} was already claimed - no rewards granted again`);
      }
      return this.claimOk;
    },

    /* ----- UI ----- */

    toast(title, sub) {
      if (typeof document === "undefined" || !document.body) return;
      if (!document.getElementById("bsave-style")) {
        const st = document.createElement("style");
        st.id = "bsave-style";
        st.textContent = `
          .bsave-toast{position:fixed;left:50%;top:14%;z-index:100000;pointer-events:none;
            transform:translate(-50%,-8px);opacity:0;transition:opacity .28s ease,transform .28s ease;
            display:flex;align-items:center;gap:.6em;padding:.55em 1.15em .55em .8em;max-width:calc(100vw - 32px);
            background:linear-gradient(180deg,var(--jjk-ink-2,#0c2229),var(--jjk-ink,#071418));
            border:1px solid var(--jjk-gold,#c9a24e);border-radius:6px;
            box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 0 3px rgba(45,107,115,.55),0 10px 26px rgba(0,0,0,.55);
            color:var(--jjk-text,#ece6d6);font-family:var(--jjk-font,'Kaisei Tokumin',serif);}
          .bsave-toast.is-in{opacity:1;transform:translate(-50%,0);}
          .bsave-toast .bsave-mark{width:.7em;height:.7em;flex:0 0 auto;transform:rotate(45deg);
            background:var(--jjk-gold-hi,#f1d98a);box-shadow:0 0 8px rgba(241,217,138,.7);}
          .bsave-toast b{display:block;color:var(--jjk-gold-hi,#f1d98a);letter-spacing:.08em;font-size:.95rem;}
          .bsave-toast small{display:block;color:var(--jjk-muted,#93a3a3);font-size:.72rem;letter-spacing:.04em;}
        `;
        document.head.appendChild(st);
      }
      const el = document.createElement("div");
      el.className = "bsave-toast";
      el.setAttribute("role", "status");
      const esc = v => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
      el.innerHTML = `<span class="bsave-mark" aria-hidden="true"></span><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add("is-in"));
      setTimeout(() => { el.classList.remove("is-in"); setTimeout(() => el.remove(), 400); }, 2600);
    }
  };

  window.BattleSave = BattleSave;

  /* ===== Hooks (battle page only) ===== */

  function wrap(obj, name, make) {
    if (!obj || typeof obj[name] !== "function" || obj[name].__bsWrapped) return;
    const w = make(obj[name]);
    w.__bsWrapped = true;
    obj[name] = w;
  }

  function installHooks() {
    const M = window.BattleMissions;
    const T = window.BattleTurns;
    if (!M || !T) return false;
    const S = BattleSave;
    const C = window.BattleCombat;
    const B = window.BattleBuffs;
    const R = window.BattleRewards;
    const E = window.BattleEntrance;
    const MOD = window.BattleModifiers;

    // An arena battle's launch flag is consumed on load, so a reload would
    // otherwise start a normal mission. Re-arm it for a reload / resume.
    try {
      const snap = Store.read();
      if (snap?.isArena && lsGet("arena_battle_mode") !== "1") {
        const nt = navType();
        const intended = lsGet(INTENT_KEY) === snap.battleId;
        const arenaKey = `arena:${hash32((lsGet("arena_enemies") || "") + "@" + (lsGet("arena_map") || "")).toString(36)}`;
        if ((intended || nt === "reload" || nt === "back_forward") && arenaKey === snap.stageKey) {
          lsSet("arena_battle_mode", "1");
          log("re-armed arena battle for resume");
        }
      }
    } catch (e) { /* no resume */ }

    // --- battle start: resume or fresh
    wrap(M, "init", orig => function (bm) { return S.begin(this, bm, orig); });

    // --- wave loaded: deterministic formation, then a safe-point snapshot
    wrap(M, "loadWave", orig => function (bm, waves, waveIndex) {
      const r = Rng.runLabelled(S.seed, `w${bm.currentStageIndex}.${waveIndex}`, orig, this, arguments);
      if (!S.restoring) S.snapshot(bm, "wave", null);
      return r;
    });

    // --- turn start: snapshot + reseed (only when the turn will really start)
    wrap(T, "startTurn", orig => function (unit, core) {
      if (!(core.isPaused || !unit || this.turnLocked)) S.onTurnStart(core, unit);
      return orig.apply(this, arguments);
    });

    // --- resumed battle: finish restoring once the tick loop is up
    wrap(T, "startSpeedGaugeTick", orig => function (core) {
      const r = orig.apply(this, arguments);
      if (S.pendingResume) setTimeout(() => S.afterInit(core), 0);
      return r;
    });

    // --- seeded outcome rolls
    const seeded = (obj, names) => names.forEach(n => wrap(obj, n, orig => function () { return Rng.run(orig, this, arguments); }));
    seeded(C, ["calculateDamage", "splitDamage", "applySkillDebuff", "performAITurn", "applyDescriptionEffects"]);
    seeded(B, ["addStatus", "checkEvade"]);
    seeded(T, ["handleJutsuButton", "handleUltimateButton"]);
    wrap(C, "previewDamage", orig => function () { return Rng.native(orig, this, arguments); });
    wrap(R, "getDefaultStageRewards", orig => function (stageIndex) {
      return Rng.runLabelled(S.seed, `chest${stageIndex}`, orig, this, arguments);
    });

    // --- resumed battle: skip the entrance, keep saved chests / modifiers
    wrap(E, "playEntranceSequence", orig => function (core) {
      if (!S.pendingResume) return orig.apply(this, arguments);
      core.isPaused = false;
      (core.combatants || []).forEach(u => { u.isPaused = false; });
      return Promise.resolve();
    });
    wrap(R, "init", orig => function () {
      const r = orig.apply(this, arguments);
      const saved = S.pendingResume?.rewards;
      if (saved) {
        if (Array.isArray(saved.collectedChests)) this.collectedChests = saved.collectedChests;
        if (saved.currentStageChest) this.currentStageChest = saved.currentStageChest;
      }
      return r;
    });
    // Saved stats already include difficulty modifiers
    wrap(MOD, "applyModifiers", orig => function () {
      if (S.pendingResume) return;
      return orig.apply(this, arguments);
    });

    // --- end of battle: clear snapshot, grant rewards once per battle id
    wrap(M, "recordMissionComplete", orig => async function (bm) {
      if (bm.isArena || bm._missionCompletionRecorded) return orig.apply(this, arguments);
      if (!S.finish(bm, "victory")) {
        bm._missionCompletionRecorded = true;
        if (R) R._bsPrepaid = true;
        return;
      }
      // Pay stage chests now (the results screen only displays them), so a
      // reload during the results animation neither loses nor repeats them.
      if (R && R.__bsApplyRewards && Array.isArray(R.collectedChests)) {
        R.collectedChests.forEach(ch => { try { R.__bsApplyRewards.call(R, ch?.rewards); } catch (e) { warn("chest grant failed", e); } });
        R._bsPrepaid = true;
      }
      return orig.apply(this, arguments);
    });
    if (R && typeof R.applyRewardsToInventory === "function") {
      R.__bsApplyRewards = R.applyRewardsToInventory;
      wrap(R, "applyRewardsToInventory", orig => function () {
        if (this._bsPrepaid) return; // already granted at victory
        return orig.apply(this, arguments);
      });
    }
    wrap(M, "recordArenaResult", orig => function (bm, isVictory) {
      if (!bm.isArena || bm._arenaResultRecorded) return orig.apply(this, arguments);
      if (!S.finish(bm, isVictory ? "victory" : "defeat")) {
        bm._arenaResultRecorded = true;
        return bm._arenaOutcome || null;
      }
      return orig.apply(this, arguments);
    });
    wrap(M, "declareVictory", orig => function (bm) { S.finish(bm, "victory"); return orig.apply(this, arguments); });
    wrap(M, "declareDefeat", orig => function (bm) { S.finish(bm, "defeat"); return orig.apply(this, arguments); });

    log("hooks installed");
    return true;
  }

  installHooks();
})();
