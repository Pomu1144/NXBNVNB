// js/teams-dev-panel.js
// Developer panel for Team Formation (teams.html): builds teams out of units
// that have animated battle sprites, so new sprite sets can be seen in battle
// straight away.
//   - "Compose: new sprites"     the Naruto Online sets (see isNew below)
//   - "Compose: all sprite units" every registered sprite set, new ones first
//   - "Compose selected"          the units ticked in the list
//   - "Battle"                    opens battle.html, which fields Team 1
// Composing owns a top-tier copy of each unit (adds one when needed), equips
// skins for skin entries, and fills front-1..4 then back-1..4 of Team 1,
// moving on to Team 2, 3... when there are more units than one team holds.
// The commander slot is left alone (it never appears on the field).
// Purely a dev tool, shown only with ?dev=1 (js/dev-mode.js).
(function (global) {
  "use strict";

  const TEAMS_KEY = "blazing_teams_v1";
  const RESUME_KEY = "blazing_battle_resume_v1"; // js/battle/battle-save.js
  const COLLAPSE_KEY = "teams_dev_panel_collapsed_v1";
  const TEAM_COUNT = 8;
  const SLOTS = ["front-1", "front-2", "front-3", "front-4", "back-1", "back-2", "back-3", "back-4"];
  // "New" sprites: Naruto Online sets, by folder or skin id, so new ones are
  // picked up as they are registered.
  const ONLINE_FOLDER = /(^|\/)assets\/sprites\/online\//;
  const ONLINE_SKIN = /_online$/;

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let BYID = {};
  let entries = [];   // [{ key, charId, folder, skinId, label, sub, isNew }]
  let skipped = [];   // registry / skin charIds not in data/characters.json
  let root = null;

  /* ===== Data ===== */

  function loadScript(src) {
    return new Promise(res => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => res(true);
      s.onerror = () => res(false);
      document.head.appendChild(s);
    });
  }

  // teams.html doesn't ship the sprite registry for players: load it here.
  // skins.js first, so sprite-player.js registers the skin folders on load.
  async function ensureSpriteModules() {
    if (!global.Skins) await loadScript("js/skins.js");
    if (!global.SpritePlayer) await loadScript("js/sprite-player.js");
  }

  async function loadChars() {
    try {
      const data = global.loadCharactersData
        ? await global.loadCharactersData()
        : await (await fetch("data/characters.json")).json();
      (Array.isArray(data) ? data : data.characters || []).forEach(c => { BYID[c.id] = c; });
    } catch (e) {
      console.error("[TeamsDev] Failed to load characters.json", e);
    }
  }

  const isNewFolder = f => ONLINE_FOLDER.test(f || "");
  const charLabel = c => c ? `${c.name}${c.version ? ` · ${c.version}` : ""}` : "";

  /** One entry per sprite folder (several charIds of a family share one),
   *  plus one per Naruto Online skin. New entries first. */
  function buildEntries() {
    const SP = global.SpritePlayer;
    entries = [];
    skipped = [];
    if (!SP) return;
    const ids = typeof SP.registeredIds === "function" ? SP.registeredIds() : [];
    const byFolder = new Map();
    ids.forEach(id => {
      const folder = SP.basePathFor(id);
      if (!folder) return;
      if (!byFolder.has(folder)) byFolder.set(folder, []);
      byFolder.get(folder).push(id);
    });

    const unitEntries = [];
    byFolder.forEach((list, folder) => {
      const ok = list.filter(id => BYID[id]);
      list.filter(id => !BYID[id]).forEach(id => skipped.push(id));
      if (!ok.length) return;
      // The id the folder is named after, else the last (usually top) form.
      const base = folder.split("/").pop();
      const charId = ok.includes(base) ? base : ok[ok.length - 1];
      unitEntries.push({
        key: `u:${charId}`, charId, folder, skinId: null,
        label: charLabel(BYID[charId]), sub: charId + (ok.length > 1 ? ` +${ok.length - 1}` : ""),
        isNew: isNewFolder(folder),
      });
    });

    const skinEntries = [];
    const skins = global.Skins?.all?.() || [];
    skins.filter(s => ONLINE_SKIN.test(s.id)).forEach(s => {
      const charId = (s.charIds || []).find(id => BYID[id] && SP.has(id));
      if (!charId) { (s.charIds || []).forEach(id => { if (!BYID[id]) skipped.push(id); }); return; }
      skinEntries.push({
        key: `s:${s.id}`, charId, folder: s.folder, skinId: s.id,
        label: `${charLabel(BYID[charId])}`, sub: `${charId} · skin: ${s.name}`,
        isNew: true,
      });
    });

    entries = [
      ...unitEntries.filter(e => e.isNew),
      ...skinEntries,
      ...unitEntries.filter(e => !e.isNew),
    ];
    skipped = [...new Set(skipped)];
  }

  /* ===== Inventory ===== */

  /** Owned copy of charId at its top tier: the best existing copy if it is
   *  already there, else a new maxed copy. Returns the instance. */
  function ensureTopCopy(charId) {
    const IC = global.InventoryChar, P = global.Progression;
    const char = BYID[charId];
    if (!IC || !char) return null;
    const maxCode = P?.getTierBounds?.(char)?.maxCode || char.starMaxCode || char.starMinCode || null;
    const owned = IC.instancesOf ? IC.instancesOf(charId) : IC.allInstances().filter(i => i.charId === charId);
    const top = owned.find(i => i.tierCode === maxCode);
    if (top) return top;

    const inst = IC.addCopy(charId, 1, maxCode);
    let cap = P?.levelCapForCode ? P.levelCapForCode(maxCode) : 1;
    let lb = 0;
    if (global.LimitBreak) {
      lb = global.LimitBreak.getMaxLimitBreakLevel(maxCode) || 0;
      if (lb > 0) cap = global.LimitBreak.getExtendedLevelCap(maxCode, lb);
    }
    const nAb = Array.isArray(char.abilities) ? char.abilities.length : 0;
    // Maxed so the jutsu (Lv 20) and ultimate (Lv 50) are usable in battle.
    IC.updateInstance(inst.uid, {
      tierCode: maxCode, level: cap, limitBreakLevel: lb,
      unlockedAbilities: Array.from({ length: nAb }, (_, i) => i),
      dupeUnlocks: nAb, luck: 100, cost: 1,
    });
    return IC.getByUid(inst.uid) || inst;
  }

  /* ===== Teams ===== */

  function readTeams() {
    let t = {};
    try { t = JSON.parse(localStorage.getItem(TEAMS_KEY) || "{}") || {}; } catch (e) { t = {}; }
    const out = {};
    for (let i = 1; i <= TEAM_COUNT; i++) out[i] = t[i] || t[String(i)] || {};
    return out;
  }

  /** Put `list` (entries) into Team 1, 2, ... (8 field slots each). A team
   *  that gets units is cleared first, apart from its commander. One entry
   *  per charId: a team can't hold the same character twice and a skin is
   *  equipped per character, so a skin entry wins over the plain unit. */
  function compose(list) {
    if (!global.InventoryChar) { flash("Inventory not ready"); return null; }
    const seen = new Set();
    const picks = [];
    const dropped = [];
    list.forEach(e => {
      if (seen.has(e.charId)) { dropped.push(e); return; }
      seen.add(e.charId);
      picks.push(e);
    });
    if (!picks.length) { flash("Nothing to compose"); return null; }

    const max = TEAM_COUNT * SLOTS.length;
    const placed = picks.slice(0, max);
    const overflow = picks.length - placed.length;
    const teams = readTeams();
    const used = Math.ceil(placed.length / SLOTS.length);
    for (let t = 1; t <= used; t++) {
      const commander = teams[t].commander;
      teams[t] = commander && !seen.has(commander.charId) ? { commander } : {};
    }
    placed.forEach((e, i) => {
      const inst = ensureTopCopy(e.charId);
      if (!inst) return;
      // Skin entries wear their skin; plain entries keep whatever is equipped.
      if (e.skinId && global.Skins) global.Skins.equip(e.charId, e.skinId);
      const team = 1 + Math.floor(i / SLOTS.length);
      teams[team][SLOTS[i % SLOTS.length]] = { uid: inst.uid, charId: inst.charId };
    });
    try {
      localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
      global.dispatchEvent(new CustomEvent("blazing_teams_updated"));
    } catch (e) {
      flash("Saving teams failed");
      return null;
    }
    if (global.TeamManager?.reload) global.TeamManager.reload(1);
    else { location.reload(); return null; }

    const parts = [`${placed.length} unit${placed.length === 1 ? "" : "s"} in Team${used > 1 ? `s 1-${used}` : " 1"}`];
    if (dropped.length) parts.push(`${dropped.length} same-character duplicate${dropped.length === 1 ? "" : "s"} left out`);
    if (overflow > 0) parts.push(`${overflow} didn't fit (${max} slots)`);
    flash(parts.join(" · "));
    return { placed: placed.length, teams: used, overflow, dropped: dropped.length };
  }

  function composeNew() { return compose(entries.filter(e => e.isNew)); }
  function composeAll() { return compose(entries); }
  function composeSelected() {
    const keys = new Set([...root.querySelectorAll(".tdev-list input:checked")].map(i => i.value));
    return compose(entries.filter(e => keys.has(e.key)));
  }

  function battle() {
    const t = readTeams()[1];
    if (!SLOTS.slice(0, 4).some(s => t[s]?.uid)) { flash("Team 1 has no front-row unit"); return; }
    // A saved mid-fight battle would resume with its old team: start fresh.
    try { localStorage.removeItem(RESUME_KEY); } catch (e) { /* storage blocked */ }
    location.href = "battle.html?dev=1";
  }

  /* ===== UI ===== */

  function flash(msg) {
    const s = root?.querySelector("#tdev-status");
    if (!s) return;
    s.textContent = msg;
  }

  function renderList() {
    const box = root.querySelector("#tdev-list");
    const nNew = entries.filter(e => e.isNew).length;
    const row = e => `<label class="tdev-unit${e.isNew ? " is-new" : ""}">
        <input type="checkbox" value="${esc(e.key)}">
        <span class="tdev-meta"><b>${esc(e.label)}</b><small>${esc(e.sub)}</small></span>
        ${e.isNew ? '<span class="tdev-tag">NEW</span>' : ""}
      </label>`;
    box.innerHTML = entries.length ? entries.map(row).join("") : `<div class="tdev-note">No sprite registry loaded.</div>`;
    root.querySelector("#tdev-count").textContent = `${entries.length} sets · ${nNew} new`;
    const note = root.querySelector("#tdev-skipped");
    note.hidden = !skipped.length;
    note.textContent = skipped.length
      ? `Skipped (not in characters.json): ${skipped.join(", ")}` : "";
    syncSelected();
  }

  function syncSelected() {
    const n = root.querySelectorAll(".tdev-list input:checked").length;
    const b = root.querySelector("#tdev-selected");
    b.textContent = `Compose selected (${n})`;
    b.disabled = n === 0;
  }

  function setCollapsed(v, silent) {
    root.classList.toggle("is-collapsed", !!v);
    root.querySelector("#tdev-tab").setAttribute("aria-expanded", String(!v));
    if (!silent) { try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch (e) { /* storage blocked */ } }
  }

  function build() {
    root = document.createElement("aside");
    root.id = "teams-dev-panel";
    root.className = "tdev is-collapsed";
    root.innerHTML = `
      <button type="button" class="tdev-tab" id="tdev-tab" aria-controls="tdev-body" aria-expanded="false" title="Dev tools">DEV</button>
      <div class="tdev-body" id="tdev-body" role="region" aria-label="Team dev tools">
        <div class="tdev-head">
          <span class="tdev-title">Sprite teams</span>
          <button type="button" class="tdev-close" id="tdev-close" aria-label="Close dev panel">×</button>
        </div>
        <div class="tdev-actions">
          <button type="button" class="tdev-btn is-primary" id="tdev-new">Compose: new sprites</button>
          <button type="button" class="tdev-btn" id="tdev-all">Compose: all sprite units</button>
          <button type="button" class="tdev-btn" id="tdev-battle" title="Battle fields Team 1">Battle (Team 1)</button>
        </div>
        <div class="tdev-status" id="tdev-status" aria-live="polite"></div>
        <div class="tdev-sub">
          <span id="tdev-count"></span>
          <span class="tdev-links">
            <button type="button" class="tdev-link" id="tdev-pick-new">new</button>
            <button type="button" class="tdev-link" id="tdev-pick-none">none</button>
          </span>
        </div>
        <div class="tdev-list" id="tdev-list"></div>
        <button type="button" class="tdev-btn" id="tdev-selected" disabled>Compose selected (0)</button>
        <div class="tdev-note" id="tdev-skipped" hidden></div>
      </div>`;
    document.body.appendChild(root);

    const $ = sel => root.querySelector(sel);
    $("#tdev-tab").addEventListener("click", () => setCollapsed(false));
    $("#tdev-close").addEventListener("click", () => setCollapsed(true));
    $("#tdev-new").addEventListener("click", composeNew);
    $("#tdev-all").addEventListener("click", composeAll);
    $("#tdev-selected").addEventListener("click", composeSelected);
    $("#tdev-battle").addEventListener("click", battle);
    $("#tdev-list").addEventListener("change", syncSelected);
    $("#tdev-pick-new").addEventListener("click", () => {
      const nw = new Set(entries.filter(e => e.isNew).map(e => e.key));
      root.querySelectorAll(".tdev-list input").forEach(i => { i.checked = nw.has(i.value); });
      syncSelected();
    });
    $("#tdev-pick-none").addEventListener("click", () => {
      root.querySelectorAll(".tdev-list input").forEach(i => { i.checked = false; });
      syncSelected();
    });
    // Keep panel taps away from the team page's drag handling.
    ["pointerdown", "mousedown", "touchstart"].forEach(t =>
      root.addEventListener(t, e => e.stopPropagation(), { passive: true }));

    let collapsed = true;
    try { collapsed = localStorage.getItem(COLLAPSE_KEY) !== "0"; } catch (e) { /* storage blocked */ }
    setCollapsed(collapsed, true);
  }

  async function init() {
    if (!global.DEV_MODE) return; // players never see it (js/dev-mode.js, ?dev=1)
    build();
    await Promise.all([ensureSpriteModules(), loadChars()]);
    buildEntries();
    renderList();
    console.log(`[TeamsDev] Dev panel ready: ${entries.length} sprite sets, ${entries.filter(e => e.isNew).length} new`);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.TeamsDevPanel = {
    entries: () => entries.slice(), skipped: () => skipped.slice(),
    compose, composeNew, composeAll, battle,
  };
})(window);
