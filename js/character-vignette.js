/* Village "home character": a large 2.5D character standing in the middle of
 * the village screen, like the lobby character in Ninja Voltage / Blazing.
 * The player can switch which character stands there.
 *
 *   HomeCharacter.set('minato_2101')   // switch (persists)
 *   HomeCharacter.openPicker()         // show the chooser
 *
 * Add a character by rendering a transparent full-body image into
 * assets/home/<charId>.webp and listing it in ROSTER below.
 */
(function () {
  'use strict';

  const ROSTER = {
    minato_2101: { name: 'Minato Namikaze', title: 'Raikosekka', img: 'assets/home/minato_2101.webp' },
  };
  const DEFAULT_ID = 'minato_2101';
  const STORE_KEY = 'blazing_home_character_v1';

  let container = null;
  let current = null;

  function savedId() {
    try {
      const id = localStorage.getItem(STORE_KEY);
      return ROSTER[id] ? id : DEFAULT_ID;
    } catch (_) {
      return DEFAULT_ID;
    }
  }

  function render(id) {
    const entry = ROSTER[id];
    if (!entry || !container) return;
    current = id;

    const prev = container.querySelector('.home-char');
    const el = document.createElement('div');
    el.className = 'home-char';
    el.dataset.charId = id;
    el.innerHTML = `
      <div class="home-char-glow" aria-hidden="true"></div>
      <div class="home-char-shadow" aria-hidden="true"></div>
      <div class="home-char-body">
        <img class="home-char-img" src="${entry.img}" alt="${entry.name}" draggable="false">
      </div>
      <button class="home-char-switch" type="button" aria-label="Change home character" title="Change character">
        <span class="home-char-switch-icon" aria-hidden="true">⇄</span>
        <span class="home-char-switch-name">${entry.name}</span>
      </button>`;

    el.querySelector('.home-char-switch').addEventListener('click', e => {
      e.stopPropagation();
      openPicker();
    });
    el.querySelector('.home-char-body').addEventListener('click', () => {
      // A little reaction when tapped.
      el.classList.remove('is-poked');
      void el.offsetWidth; // restart the animation
      el.classList.add('is-poked');
    });

    container.appendChild(el);
    if (prev) {
      prev.classList.add('is-leaving');
      setTimeout(() => prev.remove(), 450);
    }
  }

  function set(id) {
    if (!ROSTER[id]) return false;
    try { localStorage.setItem(STORE_KEY, id); } catch (_) { /* storage blocked */ }
    if (id !== current) render(id);
    return true;
  }

  function ownedIds() {
    try {
      return new Set((window.InventoryChar?.allInstances?.() || []).map(i => i.charId));
    } catch (_) {
      return new Set();
    }
  }

  function openPicker() {
    closePicker();
    const owned = ownedIds();
    const overlay = document.createElement('div');
    overlay.className = 'home-char-picker';
    overlay.innerHTML = `
      <div class="home-char-picker-panel jjk-panel" role="dialog" aria-label="Choose home character">
        <div class="home-char-picker-head">
          <h2 class="jjk-title-plate">Home Character</h2>
          <button class="jjk-icon-btn home-char-picker-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="home-char-picker-grid">
          ${Object.entries(ROSTER).map(([id, e]) => `
            <button class="home-char-option${id === current ? ' is-selected' : ''}" type="button" data-id="${id}">
              <img src="${e.img}" alt="">
              <span class="home-char-option-name">${e.name}</span>
              ${owned.has(id) ? '<span class="home-char-option-tag">Owned</span>' : ''}
            </button>`).join('')}
          <div class="home-char-option is-soon" aria-hidden="true">
            <span class="home-char-option-name">More coming soon</span>
          </div>
        </div>
      </div>`;
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.home-char-picker-close')) closePicker();
      const opt = e.target.closest('.home-char-option[data-id]');
      if (opt) { set(opt.dataset.id); closePicker(); }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  }

  function closePicker() {
    document.querySelectorAll('.home-char-picker').forEach(p => p.remove());
  }

  // Subtle 2.5D parallax: the character leans a few degrees toward the pointer.
  function initParallax() {
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, tx = 0, ty = 0;
    window.addEventListener('pointermove', e => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        container?.style.setProperty('--hc-rx', `${(-ty * 2).toFixed(2)}deg`);
        container?.style.setProperty('--hc-ry', `${(tx * 5).toFixed(2)}deg`);
        container?.style.setProperty('--hc-shift', `${(tx * -8).toFixed(1)}px`);
      });
    }, { passive: true });
  }

  function init() {
    container = document.querySelector('.character-vignette-container');
    if (!container) return;
    container.classList.add('home-char-stage');
    render(savedId());
    initParallax();
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker(); });
  }

  window.HomeCharacter = { set, openPicker, closePicker, get current() { return current; }, roster: ROSTER };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
