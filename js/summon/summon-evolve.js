// js/summon/summon-evolve.js
// Maps a character between its pre-evolved (base / lower-star) form and its
// awakened (evolved / higher-star) form using data/awakening-transforms.json.
//
// Used by:
//   • summon-ui.js  — so a summoned featured unit is granted at its BASE (e.g.
//     5★) form, letting the player awaken it themselves instead of handing over
//     the maxed 6★ immediately.
//   • summon-stage.js — to show both the 6★ and the 5★ art/stats as slides.

(function () {
  const state = { fwd: {}, rev: {}, byId: {}, ready: false };

  const ready = Promise.all([
    fetch('data/awakening-transforms.json').then(r => r.json()).catch(() => []),
    fetch('data/characters.json').then(r => r.json()).catch(() => ([]))
  ]).then(([transforms, chars]) => {
    const arr = Array.isArray(chars) ? chars : (chars.characters || Object.values(chars));
    for (const c of arr) if (c && c.id) state.byId[c.id] = c;
    for (const t of (transforms || [])) {
      if (!t || !t.fromId || !t.toId) continue;
      state.fwd[t.fromId] = t;   // base -> { toId, tier }
      state.rev[t.toId] = t;     // evolved -> { fromId, tier }
    }
    state.ready = true;
    return state;
  }).catch(() => state);

  // The pre-evolved base id for a character (unchanged if it has no reverse transform).
  function baseIdOf(id) {
    const seen = new Set();
    let cur = id;
    while (state.rev[cur] && !seen.has(cur)) { seen.add(cur); cur = state.rev[cur].fromId; }
    return cur;
  }

  // The awakened/evolved id for a character (unchanged if it has no forward transform).
  function evolvedIdOf(id) {
    const seen = new Set();
    let cur = id;
    while (state.fwd[cur] && !seen.has(cur)) { seen.add(cur); cur = state.fwd[cur].toId; }
    return cur;
  }

  // Returns { baseId, evolvedId, base, evolved, hasChain }.
  function forms(id) {
    const baseId = baseIdOf(id);
    const evolvedId = evolvedIdOf(id);
    return {
      baseId, evolvedId,
      base: state.byId[baseId] || null,
      evolved: state.byId[evolvedId] || null,
      hasChain: baseId !== evolvedId
    };
  }

  window.SummonEvolve = { ready, baseIdOf, evolvedIdOf, forms, byId: () => state.byId };
})();
