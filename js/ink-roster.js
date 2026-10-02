// js/ink-roster.js — the Ink "Shinobi Archive" roster (characters.html).
// Ink-only chrome around the existing grid (css/ink/characters.css shows it
// only under html[data-skin="ink"]; other styles never see it):
//  - header: brush 忍録, "Shinobi Archive / Your roster", a quote;
//  - toolbar: All · Element · Stars · Level · Favourites, search, count;
//  - each tile gets its power-grade mark (assets/ui/ink/grade_*.webp);
//  - wide screens: a preview panel on the right. The first click on a tile
//    selects it and fills the panel; a second click (or Details) opens the
//    dossier. On phones a click opens the dossier straight away.
// Filters only hide tiles; the grid order and the game data are untouched.
// Favourites are a per-device list of unit uids in localStorage.
(function () {
  "use strict";
  const GRID = document.querySelector(".char-grid");
  const CONTENT = document.querySelector(".char-content");
  if (!GRID || !CONTENT) return;
  const isInk = () => document.documentElement.getAttribute("data-skin") === "ink";
  const WIDE = window.matchMedia("(min-width: 1000px) and (min-height: 560px)");
  const previewOn = () => isInk() && WIDE.matches;
  const FAV_KEY = "ink_roster_favs";
  const ELEMENTS = ["Heart", "Skill", "Body", "Bravery", "Wisdom"];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const num = (n) => Math.round(Number(n) || 0).toLocaleString();

  let favs = new Set();
  try { favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch (e) { /* private mode */ }
  const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (e) { /* ignore */ } };

  const state = { el: "", stars: "", lv: "", fav: false, q: "" };
  let picked = "", quotes = {};
  fetch("data/unit-quotes.json", { cache: "force-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((q) => { quotes = q || {}; if (picked) fill(picked); });

  /* ── markup ─────────────────────────────────────────────────────── */
  const head = document.createElement("div");
  head.className = "ink-roster-head";
  head.innerHTML = `
    <img class="ink-rh-title" src="assets/ui/ink/roster_title.webp" alt="忍録" draggable="false">
    <div class="ink-rh-cap"><b>Shinobi Archive</b><small>Your roster</small></div>
    <p class="ink-rh-quote">Those who inherit the Will of Fire shine across time.</p>`;

  const dd = (key, label, opts) => `
    <div class="ink-dd" data-dd="${key}">
      <button type="button" class="ink-rf-btn ink-dd-btn" aria-haspopup="true" aria-expanded="false"><span>${label}</span><i aria-hidden="true"></i></button>
      <div class="ink-dd-menu" role="menu">${opts.map(([v, t, icon]) =>
        `<button type="button" role="menuitemradio" data-v="${v}">${icon ? `<img src="${icon}" alt="" aria-hidden="true">` : ""}${t}</button>`).join("")}</div>
    </div>`;
  const bar = document.createElement("div");
  bar.className = "ink-roster-bar";
  bar.innerHTML = `
    <div class="ink-rf">
      <button type="button" class="ink-rf-btn is-on" data-all>All</button>
      ${dd("el", "Element", [["", "All elements"], ...ELEMENTS.map((e) => [e, e, `assets/ui/jjk/orb_${e.toLowerCase()}.webp`])])}
      ${dd("stars", "Stars", [["", "Any stars"], ["7", "7 ★ and up"], ["6", "6 ★"], ["5", "5 ★"], ["4", "4 ★ and below"]])}
      ${dd("lv", "Level", [["", "Any level"], ["max", "Max level"], ["up", "Can still level"]])}
      <button type="button" class="ink-rf-btn" data-fav aria-pressed="false">Favourites</button>
    </div>
    <label class="ink-rsearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input type="search" placeholder="Search shinobi…" aria-label="Search shinobi" autocomplete="off" spellcheck="false"></label>
    <span class="ink-rcount" aria-live="polite"><b>0</b> / 0</span>`;

  const empty = document.createElement("p");
  empty.className = "ink-rempty";
  empty.textContent = "No shinobi match these filters.";

  CONTENT.insertBefore(head, GRID);
  CONTENT.insertBefore(bar, GRID);
  CONTENT.insertBefore(empty, GRID.nextSibling);

  const pv = document.createElement("aside");
  pv.className = "ink-roster-preview";
  pv.setAttribute("aria-label", "Selected shinobi");
  pv.innerHTML = `
    <div class="ink-pv-art"><img alt="" draggable="false"></div>
    <div class="ink-pv-body">
      <button type="button" class="ink-pv-fav" aria-pressed="false" aria-label="Favourite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
      <h2 class="ink-pv-name"></h2>
      <p class="ink-pv-quote"></p>
      <div class="ink-pv-rank"><img class="ink-pv-grade" alt=""><span class="ink-pv-stars"></span></div>
      <div class="ink-pv-lv"><span></span><b>MAX</b></div>
      <div class="ink-pv-role"><img alt="" aria-hidden="true"><span><b></b><small></small></span></div>
      <dl class="ink-pv-stats">
        <div class="is-power"><dt>Power</dt><dd data-k="power"></dd></div>
        <div><dt>HP</dt><dd data-k="hp"></dd></div>
        <div><dt>ATK</dt><dd data-k="atk"></dd></div>
        <div><dt>SPD</dt><dd data-k="spd"></dd></div>
      </dl>
      <button type="button" class="ink-pv-go">Details <i aria-hidden="true">&rarr;</i></button>
      <p class="ink-pv-foot">A single light can illuminate a thousand paths.</p>
    </div>`;
  document.body.appendChild(pv);

  const kizuna = document.createElement("div");
  kizuna.className = "ink-roster-kizuna";
  kizuna.setAttribute("aria-hidden", "true");
  kizuna.innerHTML = `<span>絆</span><small>People connect and shape a brighter tomorrow</small>`;
  document.body.appendChild(kizuna);

  /* ── filters ────────────────────────────────────────────────────── */
  const SEARCH = bar.querySelector("input");
  const COUNT = bar.querySelector(".ink-rcount");
  function match(slot) {
    const d = slot.dataset;
    if (state.el && d.el !== state.el) return false;
    if (state.stars) {
      const s = Number(d.stars) || 0, f = Number(state.stars);
      if (f === 7 ? s < 7 : f === 4 ? s > 4 : s !== f) return false;
    }
    if (state.lv === "max" && d.max !== "1") return false;
    if (state.lv === "up" && d.max === "1") return false;
    if (state.fav && !favs.has(d.uid)) return false;
    if (state.q && !(d.q || "").includes(state.q)) return false;
    return true;
  }
  function apply() {
    const slots = GRID.querySelectorAll(".char-slot");
    let shown = 0;
    slots.forEach((s) => { const ok = match(s); s.classList.toggle("ink-filtered", !ok); if (ok) shown++; });
    COUNT.innerHTML = `<b>${shown}</b> / ${slots.length}`;
    empty.classList.toggle("is-on", slots.length > 0 && shown === 0);
    const any = state.el || state.stars || state.lv || state.fav || state.q;
    bar.querySelector("[data-all]").classList.toggle("is-on", !any);
    bar.querySelector("[data-fav]").classList.toggle("is-on", state.fav);
    bar.querySelector("[data-fav]").setAttribute("aria-pressed", String(state.fav));
    bar.querySelectorAll(".ink-dd").forEach((d) => {
      const k = d.dataset.dd, v = state[k];
      d.querySelector(".ink-dd-btn").classList.toggle("is-on", !!v);
      d.querySelector(".ink-dd-btn span").textContent = v ? d.querySelector(`[data-v="${v}"]`).textContent.trim() : { el: "Element", stars: "Stars", lv: "Level" }[k];
      d.querySelectorAll("[data-v]").forEach((o) => o.setAttribute("aria-checked", String(o.dataset.v === v)));
    });
  }
  function closeMenus(except) {
    bar.querySelectorAll(".ink-dd.is-open").forEach((d) => { if (d !== except) { d.classList.remove("is-open"); d.querySelector(".ink-dd-btn").setAttribute("aria-expanded", "false"); } });
  }
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const ddEl = b.closest(".ink-dd");
    if (b.hasAttribute("data-all")) { Object.assign(state, { el: "", stars: "", lv: "", fav: false, q: "" }); SEARCH.value = ""; closeMenus(); }
    else if (b.hasAttribute("data-fav")) { state.fav = !state.fav; closeMenus(); }
    else if (b.classList.contains("ink-dd-btn")) {
      const open = !ddEl.classList.contains("is-open");
      closeMenus(ddEl); ddEl.classList.toggle("is-open", open); b.setAttribute("aria-expanded", String(open));
      return;
    } else if (ddEl && b.hasAttribute("data-v")) { state[ddEl.dataset.dd] = b.dataset.v; closeMenus(); }
    apply();
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".ink-dd")) closeMenus(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
  let qT = 0;
  SEARCH.addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => { state.q = SEARCH.value.trim().toLowerCase(); apply(); }, 120); });

  /* ── tile grade marks (computed in small idle batches) ──────────── */
  const gradeSrc = (g) => `assets/ui/ink/grade_${String(g || "d").toLowerCase()}.webp`;
  let queue = [], working = false;
  function decorate() {
    if (!isInk() || !window.RosterInfo) return;
    queue = [...GRID.querySelectorAll(".char-slot:not(.ink-graded)")];
    if (!working) step();
  }
  function step() {
    working = true;
    const run = (deadline) => {
      let n = 0;
      while (queue.length && (n < 6 || (deadline && deadline.timeRemaining() > 4))) {
        const slot = queue.shift(); n++;
        const s = window.RosterInfo.summary(slot.dataset.uid);
        slot.classList.add("ink-graded");
        if (!s) continue;
        const foot = slot.querySelector(".char-card-level");
        if (foot && !foot.querySelector(".ink-tile-grade")) {
          const img = document.createElement("img");
          img.className = "ink-tile-grade"; img.alt = s.grade; img.src = gradeSrc(s.grade); img.loading = "lazy"; img.decoding = "async";
          foot.prepend(img);
        }
        slot.classList.toggle("ink-fav", favs.has(slot.dataset.uid));
      }
      if (queue.length) schedule(run); else working = false;
    };
    schedule(run);
  }
  const schedule = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 200 }) : setTimeout(() => fn(null), 16));

  /* ── preview panel ──────────────────────────────────────────────── */
  const $p = (s) => pv.querySelector(s);
  function fill(uid) {
    const s = window.RosterInfo && window.RosterInfo.summary(uid);
    if (!s) return;
    const q = quotes[s.inst.charId] || {};
    const c = s.c;
    const img = $p(".ink-pv-art img");
    const art = s.art.full || s.art.portrait || c.full || c.portrait;
    if (img.getAttribute("src") !== art) img.src = art;
    img.alt = `${c.name} art`;
    $p(".ink-pv-name").textContent = c.name || "";
    $p(".ink-pv-quote").textContent = q.en ? `“${q.en}”` : (c.version || "");
    const g = $p(".ink-pv-grade"); g.src = gradeSrc(s.grade); g.alt = `Grade ${s.grade}`;
    $p(".ink-pv-stars").innerHTML = window.renderStars ? window.renderStars(s.stars) : "★".repeat(s.stars);
    $p(".ink-pv-lv span").innerHTML = `Lv. <b>${s.level}</b> / ${s.cap}`;
    $p(".ink-pv-lv > b").hidden = !s.isMax;
    const el = c.element || "";
    const role = $p(".ink-pv-role");
    role.querySelector("img").src = el ? `assets/ui/jjk/orb_${el.toLowerCase()}.webp` : "";
    role.querySelector("img").hidden = !el;
    role.querySelector("b").textContent = c.version || "";
    role.querySelector("small").textContent = q.role || [el, c.range ? `${c.range} range` : ""].filter(Boolean).join(" / ");
    pv.querySelectorAll("[data-k]").forEach((d) => { d.textContent = num(s[d.dataset.k]); });
    const fav = favs.has(uid);
    $p(".ink-pv-fav").classList.toggle("is-on", fav);
    $p(".ink-pv-fav").setAttribute("aria-pressed", String(fav));
  }
  function pick(uid) {
    picked = uid;
    GRID.querySelectorAll(".char-slot.is-picked").forEach((s) => s.classList.remove("is-picked"));
    const slot = uid && GRID.querySelector(`.char-slot[data-uid="${CSS.escape(uid)}"]`);
    if (slot) slot.classList.add("is-picked");
    pv.classList.toggle("is-empty", !slot);
    if (slot) fill(uid);
  }
  function pickFirst() {
    if (!previewOn()) return;
    const cur = picked && GRID.querySelector(`.char-slot[data-uid="${CSS.escape(picked)}"]`);
    if (cur) { pick(picked); return; }
    const first = GRID.querySelector(".char-slot:not(.ink-filtered)");
    pick(first ? first.dataset.uid : "");
  }

  // first click selects (wide screens); a second click goes through and opens
  GRID.addEventListener("click", (e) => {
    if (!previewOn()) return;
    const slot = e.target.closest(".char-slot");
    if (!slot || slot.classList.contains("is-picked")) return;
    e.preventDefault();
    pick(slot.dataset.uid);
  }, true);
  $p(".ink-pv-go").addEventListener("click", () => { if (picked && window.RosterInfo) window.RosterInfo.open(picked); });
  $p(".ink-pv-fav").addEventListener("click", () => {
    if (!picked) return;
    if (favs.has(picked)) favs.delete(picked); else favs.add(picked);
    saveFavs(); fill(picked);
    const slot = GRID.querySelector(`.char-slot[data-uid="${CSS.escape(picked)}"]`);
    if (slot) slot.classList.toggle("ink-fav", favs.has(picked));
    if (state.fav) apply();
  });

  function refresh() {
    if (!isInk()) return;
    apply(); decorate(); pickFirst();
  }
  document.addEventListener("roster:rendered", refresh);
  (WIDE.addEventListener ? WIDE.addEventListener("change", pickFirst) : WIDE.addListener(pickFirst));
  if (GRID.querySelector(".char-slot")) refresh();
})();
