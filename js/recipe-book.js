// js/recipe-book.js — Fusion recipe ownership + recipe-scroll rolling.
//
// Players must own a recipe scroll before they can perform that fusion.
// Scrolls come from the Summon page (Recipes tab) and the Shop. Everyone starts
// with none; fusions already performed are not affected (their results stay owned).
//
// Storage: localStorage 'blazing_recipes_v1'
//   { owned: { <fusionId>: { at: <ms>, copies: <int> } }, fragments: <int> }
// A duplicate pull adds a copy and +1 Recipe Fragment (5 fragments = any recipe in the Shop).
//
// Emits window 'recipebook:change' (detail = { reason, id? }) after every write;
// other tabs pick changes up through the native 'storage' event.
(function (global) {
  "use strict";

  const KEY = "blazing_recipes_v1";
  const FRAGMENTS_PER_CHOICE = 5;

  // ---------------------------------------------------------------- storage
  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (v && typeof v === "object") return { owned: v.owned || {}, fragments: Math.max(0, v.fragments | 0) };
    } catch (e) {}
    return { owned: {}, fragments: 0 };
  }
  function write(v, detail) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent("recipebook:change", { detail: detail || {} })); } catch (e) {}
  }

  const RecipeBook = {
    STORAGE_KEY: KEY,
    FRAGMENTS_PER_CHOICE,

    has(id) { return !!read().owned[id]; },
    ids() { return Object.keys(read().owned); },
    count() { return this.ids().length; },
    copies(id) { return read().owned[id]?.copies || 0; },
    fragments() { return read().fragments; },

    /** Grant one scroll. Returns { id, isNew, fragments }. A duplicate becomes +1 fragment. */
    grant(id, source) {
      if (!id) return null;
      const s = read();
      let isNew = true;
      if (s.owned[id]) {
        isNew = false;
        s.owned[id].copies = (s.owned[id].copies || 1) + 1;
        s.fragments += 1;
      } else {
        s.owned[id] = { at: Date.now(), copies: 1 };
      }
      write(s, { reason: "grant", id, isNew, source: source || null });
      return { id, isNew, fragments: s.fragments };
    },

    /** Spend fragments; false (and no change) when short. */
    spendFragments(n) {
      const s = read();
      if (s.fragments < n) return false;
      s.fragments -= n;
      write(s, { reason: "spend-fragments", n });
      return true;
    },
    addFragments(n) {
      const s = read();
      s.fragments = Math.max(0, s.fragments + (n | 0));
      write(s, { reason: "add-fragments", n });
    },

    /** Dev/testing helpers */
    grantAll(ids) {
      const s = read();
      (ids || []).forEach(id => { if (!s.owned[id]) s.owned[id] = { at: Date.now(), copies: 1 }; });
      write(s, { reason: "grant-all" });
    },
    clear() { write({ owned: {}, fragments: 0 }, { reason: "clear" }); },
  };

  // ---------------------------------------------------------------- shared data
  let _data = null;
  RecipeBook.loadData = function () {
    if (_data) return _data;
    _data = Promise.all([
      fetch("data/fusions.json").then(r => r.json()).catch(() => ({ fusions: [] })),
      fetch("data/characters.json").then(r => r.json()).catch(() => []),
    ]).then(([f, c]) => {
      const list = Array.isArray(c) ? c : (c.characters || []);
      const chars = {};
      list.forEach(ch => { chars[ch.id] = ch; });
      return { fusions: f.fusions || [], paths: f.fusionPaths || {}, chars };
    });
    return _data;
  };

  // ---------------------------------------------------------------- grades & rolling
  // Scroll grade from the path step. Stand-alone recipes (no path) count as Rare.
  const GRADES = {
    common: { key: "common", label: "Scroll", rate: 70 },
    rare:   { key: "rare",   label: "Rare Scroll", rate: 25 },
    secret: { key: "secret", label: "Secret Scroll", rate: 5 },
  };
  function gradeOf(fusion) {
    const s = fusion && fusion.stepNumber;
    if (!s) return GRADES.rare;
    return s <= 2 ? GRADES.common : s <= 4 ? GRADES.rare : GRADES.secret;
  }
  RecipeBook.GRADES = GRADES;
  RecipeBook.gradeOf = gradeOf;

  /**
   * Pick one recipe. Grade first (70/25/5, renormalised over the grades the pool
   * actually has), then a recipe inside that grade — featured ones count double.
   * opts.minGrade = 'rare' restricts to Rare-or-better (used by the x10 guarantee).
   */
  function rollOne(pool, featured, opts = {}, rng = Math.random) {
    const feat = new Set(featured || []);
    const byGrade = {};
    pool.forEach(f => { const g = gradeOf(f).key; (byGrade[g] = byGrade[g] || []).push(f); });
    let keys = Object.keys(byGrade);
    if (opts.minGrade === "rare") {
      const hi = keys.filter(k => k !== "common");
      if (hi.length) keys = hi;
    }
    const total = keys.reduce((a, k) => a + GRADES[k].rate, 0);
    let r = rng() * total, gk = keys[keys.length - 1];
    for (const k of keys) { r -= GRADES[k].rate; if (r < 0) { gk = k; break; } }
    const list = byGrade[gk];
    const wsum = list.reduce((a, f) => a + (feat.has(f.id) ? 2 : 1), 0);
    let t = rng() * wsum;
    for (const f of list) { t -= feat.has(f.id) ? 2 : 1; if (t < 0) return f; }
    return list[list.length - 1];
  }

  /** Roll n recipes. n >= 10 guarantees at least one Rare-or-better. */
  function roll(pool, featured, n, rng = Math.random) {
    if (!pool || !pool.length) return [];
    const out = [];
    for (let i = 0; i < n; i++) out.push(rollOne(pool, featured, {}, rng));
    if (n >= 10 && !out.some(f => gradeOf(f).key !== "common")) {
      out[out.length - 1] = rollOne(pool, featured, { minGrade: "rare" }, rng);
    }
    return out;
  }
  RecipeBook.roll = roll;

  /** Effective per-grade rates (%) for a pool, for the Rates dialog. */
  RecipeBook.gradeRates = function (pool) {
    const keys = [...new Set(pool.map(f => gradeOf(f).key))];
    const total = keys.reduce((a, k) => a + GRADES[k].rate, 0) || 1;
    return ["secret", "rare", "common"].filter(k => keys.includes(k))
      .map(k => ({ grade: GRADES[k], pct: (GRADES[k].rate / total) * 100, count: pool.filter(f => gradeOf(f).key === k).length }));
  };

  global.RecipeBook = RecipeBook;
})(window);
