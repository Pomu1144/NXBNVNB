// js/summon/summon-reveal.js - Face-down paper reveal for summon results
// After the summon video, every result lies face-down as a dossier paper,
// dealt onto a layered ink-and-cloud stage (far mist, drifting clouds, a light
// pool under the grid). Each paper has a soft contact shadow, a small 3D pose
// (the row curves gently toward the viewer, a hair of rotation each) and a
// slow idle float; the glossy tiers catch a moving glint. The paper's colour
// alone tells its star tier (7★ pearl · 6★ sapphire · 5★ gold · 4★ silver ·
// 3★ bronze · ≤2★ sage). Tapping a paper lifts it toward the camera as it
// flashes white, then it flips over to the result card; a unit the player
// has never owned first gets the full-screen NEW reveal. "Open All" opens the rest in order (NEW
// reveals still play; hidden on a single pull), "Skip" turns everything over
// at once. Once every paper is open the grid holds a beat, then the results
// header and the Continue ticket come up.
//
// Art: assets/ui/summon/scroll_{2..7}.webp, reveal_bg.webp, new_badge.webp.
// The six papers are fetched and decoded as soon as the page loads, and the
// grid is only dealt (the staggered fade-in) once every paper in it has
// decoded, so the first frame is always the full, even grid. Missing art
// falls back to plain coloured placeholders (see summon-reveal.css). The
// stage art (stage_far/mid/near.webp) is plain CSS backgrounds.
// Pointer parallax (fine pointers only, never under reduced motion) feeds
// --mx/--my (-1…1) on the modal; the CSS turns them into layer offsets.

(function () {
  const ART = 'assets/ui/summon/';
  const FLASH_MS = 200;   // paper → white (matches srPaperFlash)
  const HOLD_MS = 850;    // all open: let the last card land before the panel
  const DEAL_WAIT_MS = 900; // longest the deal waits on a slow paper decode
  const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise(r => setTimeout(r, reduced() ? 0 : ms));
  const tierOf = (stars) => Math.max(2, Math.min(7, stars)); // 1★ shares the sage paper
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Decode the paper art (≈40KB each) and the NEW plate up front. The
  // elements are kept so the decoded bitmaps stay warm for the reveal.
  const paperSrc = (tier) => `${ART}scroll_${tier}.webp`;
  const warm = [2, 3, 4, 5, 6, 7].map(paperSrc).concat(`${ART}new_badge.webp`).map(src => {
    const img = new Image();
    img.src = src;
    img.decode?.().catch(() => {});
    return img;
  });

  // Resolves once the image is decoded (true) or has failed (false).
  function decoded(img) {
    if (!img) return Promise.resolve(false);
    const loaded = () => img.complete && img.naturalWidth > 0;
    if (img.decode) return img.decode().then(() => true, () => loaded());
    if (img.complete) return Promise.resolve(loaded());
    return new Promise(res => { img.onload = () => res(true); img.onerror = () => res(false); });
  }

  const state = {
    modal: null,
    grid: null,
    sealed: false,
    skipping: false,
    newChain: Promise.resolve(), // NEW reveals play one at a time
    closeNew: null,
    runId: 0,
    warm // held so the preloaded bitmaps are not collected
  };

  // Grid item: a face-down paper over the (hidden) result card, which the
  // caller appends. Character data rides on the element for the NEW reveal.
  function createSlot(character, stars, isNew, index) {
    const tier = tierOf(stars);
    const slot = document.createElement('div');
    slot.className = `sr-slot tier-${tier}` + (isNew ? ' is-new' : '');
    slot.style.setProperty('--i', index);
    // Pose jitter: a hair of rotation, and a float phase, per paper
    slot.style.setProperty('--rz', `${(((index * 37) % 7) - 3) * 0.5}deg`);
    slot.style.setProperty('--fd', `${-((index * 1.37) % 6).toFixed(2)}s`);
    slot._char = character;
    slot._stars = stars;
    slot.innerHTML = `
      <span class="sr-shadow" aria-hidden="true"></span>
      <button class="sr-paper" type="button" aria-label="Open ${stars}-star summon paper">
        <span class="sr-paper-body">
          <span class="sr-paper-ph" aria-hidden="true"></span>
          <img class="sr-paper-art" src="${paperSrc(tier)}" alt="" draggable="false">
          <span class="sr-paper-light" aria-hidden="true"></span>
          <span class="sr-paper-shine" aria-hidden="true"></span>
        </span>
      </button>`;
    const paper = slot.querySelector('.sr-paper');
    const img = paper.querySelector('.sr-paper-art');
    // The art only replaces the placeholder once it is decoded and paintable
    slot._ready = decoded(img).then(ok => {
      if (ok) paper.classList.add('has-art');
      else img.remove();
    });
    paper.addEventListener('click', () => {
      if (state.sealed && !state.skipping) openSlot(slot, true);
    });
    return slot;
  }

  function begin(modal, grid) {
    state.modal = modal;
    state.grid = grid;
    state.skipping = false;
    const slots = grid ? grid.querySelectorAll('.sr-slot') : [];
    if (!modal || !slots.length) return;

    state.sealed = true;
    bindParallax(modal);
    // The row curves toward the viewer: outer papers turn in to face the
    // centre (--ry), like sheets laid on a gently curved table.
    const cols = Math.min(5, slots.length);
    slots.forEach((s, i) => s.style.setProperty('--ry', `${(((cols - 1) / 2 - (i % cols)) * 3.5).toFixed(1)}deg`));
    modal.classList.add('sr-sealed');
    modal.classList.remove('sr-revealed', 'sr-done', 'sr-settling', 'sr-dealt');

    const openAll = document.getElementById('sr-open-all');
    const skip = document.getElementById('sr-skip');
    if (openAll) {
      openAll.onclick = () => openAllSlots();
      openAll.hidden = slots.length < 2; // a single paper: just tap it (or Skip)
    }
    if (skip) skip.onclick = () => skipAll();

    // Papers stay invisible until every one of them is decoded, then fade in
    // together in grid order (.sr-dealt starts the stagger).
    const run = state.runId;
    const ready = Promise.all([...slots].map(s => s._ready || Promise.resolve()));
    const timeout = new Promise(r => setTimeout(r, DEAL_WAIT_MS));
    Promise.race([ready, timeout]).then(() => {
      if (run !== state.runId) return;
      modal.classList.add('sr-dealt');
      if (state.sealed) slots[0].querySelector('.sr-paper')?.focus({ preventScroll: true });
    });
  }

  // Fine pointers only: the stage layers, the grid and the papers' turn
  // follow the pointer a little (--mx/--my on the modal, eased in CSS).
  function bindParallax(modal) {
    if (modal._srParallax) return;
    modal._srParallax = true;
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0, x = 0, y = 0;
    modal.addEventListener('pointermove', (e) => {
      if (reduced()) return;
      x = Math.max(-1, Math.min(1, e.clientX / innerWidth * 2 - 1));
      y = Math.max(-1, Math.min(1, e.clientY / innerHeight * 2 - 1));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        modal.style.setProperty('--mx', x.toFixed(3));
        modal.style.setProperty('--my', y.toFixed(3));
      });
    }, { passive: true });
  }

  // Lift + white flash → (NEW reveal) → the paper flips over to the card.
  async function openSlot(slot, cinematic) {
    if (!slot || slot.dataset.state) return;
    slot.dataset.state = 'opening';
    const run = state.runId;
    const paper = slot.querySelector('.sr-paper');
    if (paper) paper.disabled = true;

    if (!state.skipping) {
      slot.classList.add('is-flash');
      await wait(FLASH_MS);
      if (run !== state.runId || slot.dataset.state === 'open') return;
      if (cinematic && slot.classList.contains('is-new') && !state.skipping) {
        await queueNew(slot);
        if (run !== state.runId || slot.dataset.state === 'open') return;
      }
    }
    turnFaceUp(slot);
  }

  function turnFaceUp(slot) {
    slot.dataset.state = 'open';
    slot.classList.remove('is-flash');
    slot.classList.add('is-open');
    if (state.skipping) slot.classList.add('is-instant');
    checkDone();
  }

  async function openAllSlots() {
    if (!state.sealed || state.skipping) return;
    const run = state.runId;
    const slots = [...state.grid.querySelectorAll('.sr-slot')].filter(s => !s.dataset.state);
    for (const slot of slots) {
      if (run !== state.runId || state.skipping) return;
      if (slot.classList.contains('is-new')) await openSlot(slot, true);
      else { openSlot(slot, true); await wait(120); }
    }
  }

  function skipAll() {
    if (!state.sealed) return;
    state.skipping = true;
    if (state.closeNew) state.closeNew();
    state.grid.querySelectorAll('.sr-slot').forEach(slot => {
      if (slot.dataset.state !== 'open') turnFaceUp(slot);
    });
  }

  // Every paper open: hint + buttons step back, the opened grid holds a beat
  // on the clouds, then fades and the results panel comes up. Skip (and
  // reduced motion) go straight to the panel.
  function checkDone() {
    if (!state.sealed || !state.grid) return;
    const left = state.grid.querySelector('.sr-slot:not(.is-open)');
    if (left) return;
    state.sealed = false;
    const modal = state.modal;
    const run = state.runId;
    const finish = () => {
      if (run !== state.runId) return;
      modal.classList.remove('sr-sealed', 'sr-done', 'sr-settling');
      modal.classList.add('sr-revealed');
      setTimeout(() => document.getElementById('btn-continue')?.focus({ preventScroll: true }), 60);
    };
    if (state.skipping || reduced()) { finish(); return; }
    modal.classList.add('sr-done');
    setTimeout(() => {
      if (run !== state.runId) return;
      modal.classList.add('sr-settling');
      setTimeout(finish, 200);
    }, HOLD_MS);
  }

  function queueNew(slot) {
    const p = state.newChain.then(() => showNew(slot));
    state.newChain = p.catch(() => {});
    return p;
  }

  // Deterministic gold-dust layout per unit (same look every time it shows).
  function dustHTML(seedStr, n) {
    let seed = 11;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 2147483647;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let h = '';
    for (let i = 0; i < n; i++) {
      const d = 7 + rnd() * 7;
      h += `<i style="--x:${(4 + rnd() * 92).toFixed(1)}%;--y:${(18 + rnd() * 78).toFixed(1)}%;` +
           `--s:${(1.8 + rnd() * 3).toFixed(1)}px;--o:${(0.45 + rnd() * 0.5).toFixed(2)};` +
           `--d:${d.toFixed(1)}s;--dl:${(-rnd() * d).toFixed(2)}s;` +
           `--dx:${(10 + rnd() * 50).toFixed(0)}px;--dy:${(-(50 + rnd() * 110)).toFixed(0)}px"></i>`;
    }
    return h;
  }

  // Full-screen NEW reveal: the paper's flash carries onto the screen (the
  // overlay cuts in at full opacity under one white flash), the full art
  // slides in over a soft bloom, gold dust drifts, and the title block
  // settles in. Tap (or Enter/Space/Esc) returns to the grid.
  function showNew(slot) {
    return new Promise(resolve => {
      if (!state.modal || state.skipping) { resolve(); return; }
      const c = slot._char || {};
      const stars = slot._stars || 4;
      const tier = tierOf(stars);
      const art = c.full || c.portrait || 'assets/characters/common/silhouette.png';
      const fallback = c.portrait || 'assets/characters/common/silhouette.png';

      const el = document.createElement('div');
      el.className = `sr-new tier-${tier}`;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', `New shinobi: ${c.name || ''}`);
      el.tabIndex = -1;
      el.innerHTML = `
        <div class="sr-new-bloom" aria-hidden="true"></div>
        <div class="sr-new-art">
          <img src="${esc(art)}" alt="${esc(c.name)}" decoding="async"
               onerror="this.onerror=null;this.src='${esc(fallback)}'">
        </div>
        <div class="sr-new-dust" aria-hidden="true">${reduced() ? '' : dustHTML(String(c.id || c.name || 'x'), 24)}</div>
        <div class="sr-new-info">
          <div class="sr-new-title">
            <h2 class="sr-new-name">${esc(c.name)}</h2>
            <span class="sr-new-plate">
              <img src="${ART}new_badge.webp" alt="New" onload="this.parentNode.classList.add('has-art')" onerror="this.remove()">
              <b>New</b>
            </span>
          </div>
          <span class="sr-new-rule" aria-hidden="true"></span>
          ${c.version ? `<div class="sr-new-ver">${esc(c.version)}</div>` : ''}
          <div class="sr-new-stars" aria-label="${stars} stars">${'★'.repeat(stars)}</div>
        </div>
        <div class="sr-new-hint" aria-hidden="true">Tap to continue</div>
        <div class="sr-new-flash" aria-hidden="true"></div>`;

      const opened = performance.now();
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        state.closeNew = null;
        document.removeEventListener('keydown', onKey, true);
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), reduced() ? 0 : 280);
        resolve();
      };
      // Ignore the tap that opened the paper bleeding through
      const tryClose = () => { if (performance.now() - opened > 350) close(); };
      const onKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); tryClose(); }
      };
      el.addEventListener('click', tryClose);
      document.addEventListener('keydown', onKey, true);
      state.closeNew = close;

      state.modal.appendChild(el);
      el.focus({ preventScroll: true });
    });
  }

  function reset() {
    state.runId++;
    state.sealed = false;
    state.skipping = false;
    if (state.closeNew) state.closeNew();
    state.newChain = Promise.resolve();
    state.modal?.querySelectorAll('.sr-new').forEach(n => n.remove());
    state.modal?.classList.remove('sr-sealed', 'sr-revealed', 'sr-done', 'sr-settling', 'sr-dealt');
  }

  window.SummonReveal = {
    createSlot,
    begin,
    reset,
    openAll: openAllSlots,
    skip: skipAll,
    isSealed: () => state.sealed
  };
})();
