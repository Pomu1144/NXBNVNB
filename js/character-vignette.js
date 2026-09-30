/* Village "home character": large 2.5D characters standing in the middle of
 * the village screen, like the lobby character in Ninja Voltage / Blazing.
 * Up to two can stand there at once (slot 1 in front, slot 2 beside them).
 *
 *   HomeCharacter.set('minato_2101')        // slot 1 (persists)
 *   HomeCharacter.set('kakashi_797', 1)     // slot 2
 *   HomeCharacter.clear(1)                  // empty slot 2
 *   HomeCharacter.openPicker()              // show the chooser
 *
 * Add a character by rendering a transparent image into
 * assets/home/<charId>_bust.webp (+ a small head-and-chest crop in
 * assets/home/thumbs/<charId>.webp for the picker) and listing it in ROSTER.
 * `ar` is the bust's width / height, used to fit two of them into the gap
 * between the featured banner and the menu panel.
 */
(function () {
  'use strict';

  const bust = (name, title, id, ar) => ({
    name, title, ar, bust: true,
    img: `assets/home/${id}_bust.webp`,
    thumb: `assets/home/thumbs/${id}.webp`,
  });

  const ROSTER = {
    minato_2101:    bust('Minato Namikaze', 'Raikosekka', 'minato_2101', 0.738),
    naruto_2133:    bust('Naruto Uzumaki', 'The Back of a Figure', 'naruto_2133', 0.893),
    sasuke_420:     bust('Sasuke Uchiha', 'Thunder of Retaliation', 'sasuke_420', 0.875),
    kakashi_797:    bust('Kakashi Hatake', 'Battle Tactician', 'kakashi_797', 0.842),
    itachi_211:     bust('Itachi Uchiha', 'Beyond the Sharingan', 'itachi_211', 0.737),
    sakura_2070:    bust('Sakura Haruno', 'Back to Back', 'sakura_2070', 0.777),
    hinata_2003:    bust('Hinata Hyuga', 'Redemptive Words', 'hinata_2003', 0.889),
    jiraiya_2077:   bust('Jiraiya', 'What Makes a Ninja', 'jiraiya_2077', 0.889),
    tsunade_2015:   bust('Tsunade', 'Protector of the Great Tree', 'tsunade_2015', 0.823),
    gaara_835:      bust('Gaara', 'Finally, Friendship', 'gaara_835', 0.705),
    madara_870:     bust('Madara Uchiha', 'Dreams of the Far Future', 'madara_870', 0.884),
    hashirama_2058: bust('Hashirama Senju', 'Resolve to Protect', 'hashirama_2058', 0.775),
    pain_452:       bust('Pain', 'Signal Flare of Revolution', 'pain_452', 0.889),
  };
  const DEFAULT_ID = 'minato_2101';
  // One id ("minato_2101", the old format) or a JSON pair ('["a","b"]').
  const STORE_KEY = 'blazing_home_character_v1';

  let container = null;
  let switchBtn = null;
  let slots = [DEFAULT_ID, null];
  let pickerSlot = 0;

  function savedSlots() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (_) { /* storage blocked */ }
    let ids = [raw];
    if (raw && raw.charAt(0) === '[') {
      try { ids = JSON.parse(raw); } catch (_) { ids = []; }
    }
    const a = ROSTER[ids[0]] ? ids[0] : DEFAULT_ID;
    const b = ROSTER[ids[1]] && ids[1] !== a ? ids[1] : null;
    return [a, b];
  }

  function save() {
    const value = slots[1] ? JSON.stringify(slots) : slots[0];
    try { localStorage.setItem(STORE_KEY, value); } catch (_) { /* storage blocked */ }
  }

  function makeChar(id, slot) {
    const entry = ROSTER[id];
    const el = document.createElement('div');
    el.className = 'home-char';
    el.dataset.charId = id;
    el.dataset.slot = String(slot);
    el.innerHTML = `
      <div class="home-char-glow" aria-hidden="true"></div>
      <div class="home-char-shadow" aria-hidden="true"></div>
      <div class="home-char-body">
        <img class="home-char-img" src="${entry.img}" alt="${entry.name}" draggable="false">
      </div>`;
    el.querySelector('.home-char-body').addEventListener('click', () => {
      // A little reaction when tapped.
      el.classList.remove('is-poked');
      void el.offsetWidth; // restart the animation
      el.classList.add('is-poked');
    });
    return el;
  }

  function render() {
    if (!container) return;
    const duo = !!slots[1];
    container.classList.toggle('is-duo', duo);
    container.classList.toggle('is-bust', slots.every(id => !id || ROSTER[id].bust));

    const live = [...container.querySelectorAll('.home-char:not(.is-leaving)')];
    slots.forEach((id, slot) => {
      const have = live.find(el => el.dataset.slot === String(slot));
      if (have && have.dataset.charId === id) return;
      if (have) {
        have.classList.add('is-leaving');
        setTimeout(() => have.remove(), 450);
      }
      if (!id) return;
      const el = makeChar(id, slot);
      // slot 1 always comes first in the row
      const second = container.querySelector('.home-char[data-slot="1"]:not(.is-leaving)');
      container.insertBefore(el, slot === 0 && second ? second : switchBtn);
    });

    const names = slots.filter(Boolean).map(id => ROSTER[id].name.split(' ')[0]);
    switchBtn.querySelector('.home-char-switch-name').textContent = duo ? names.join(' · ') : ROSTER[slots[0]].name;
    centerInGap();
  }

  function set(id, slot = 0) {
    if (!ROSTER[id] || (slot !== 0 && slot !== 1)) return false;
    const other = 1 - slot;
    if (slots[other] === id) {
      if (!slots[1]) return true;   // already the only one standing
      slots[other] = slots[slot];   // swap places
    }
    slots[slot] = id;
    if (!slots[0]) { slots[0] = slots[1]; slots[1] = null; }
    save();
    render();
    return true;
  }

  function clear(slot = 1) {
    if (slot === 0) {
      if (!slots[1]) return false; // slot 1 is never empty
      slots = [slots[1], null];
    } else {
      slots[1] = null;
    }
    save();
    render();
    return true;
  }

  function ownedIds() {
    try {
      return new Set((window.InventoryChar?.allInstances?.() || []).map(i => i.charId));
    } catch (_) {
      return new Set();
    }
  }

  function slotTab(slot) {
    const id = slots[slot];
    return `
      <div class="home-char-slot${slot === pickerSlot ? ' is-active' : ''}${id ? '' : ' is-empty'}">
        <button class="home-char-slot-pick" type="button" data-slot="${slot}" aria-pressed="${slot === pickerSlot}">
          <span class="home-char-slot-num">${slot + 1}</span>
          ${id ? `<img src="${ROSTER[id].thumb}" alt="">` : '<span class="home-char-slot-blank" aria-hidden="true"></span>'}
          <span class="home-char-slot-name">${id ? ROSTER[id].name : 'Empty'}</span>
        </button>
        ${slot === 1 && id ? '<button class="home-char-slot-clear" type="button" aria-label="Remove second character" title="Remove">✕</button>' : ''}
      </div>`;
  }

  function pickerBody() {
    const owned = ownedIds();
    return `
      <div class="home-char-slots">${slotTab(0)}${slotTab(1)}</div>
      <div class="home-char-picker-grid">
        ${Object.entries(ROSTER).map(([id, e]) => {
          const at = slots.indexOf(id);
          return `
          <button class="home-char-option${at === pickerSlot ? ' is-selected' : ''}${at >= 0 && at !== pickerSlot ? ' is-other' : ''}" type="button" data-id="${id}">
            <img src="${e.thumb}" alt="">
            <span class="home-char-option-name">${e.name}</span>
            ${at >= 0 ? `<span class="home-char-option-slot">${at + 1}</span>` : ''}
            ${owned.has(id) ? '<span class="home-char-option-tag">Owned</span>' : ''}
          </button>`;
        }).join('')}
      </div>`;
  }

  function refreshPicker(overlay) {
    const body = overlay.querySelector('.home-char-picker-body');
    const scroll = body.querySelector('.home-char-picker-grid')?.scrollTop || 0;
    body.innerHTML = pickerBody();
    body.querySelector('.home-char-picker-grid').scrollTop = scroll;
  }

  function openPicker(slot = 0) {
    closePicker();
    pickerSlot = slot === 1 ? 1 : 0;
    const overlay = document.createElement('div');
    overlay.className = 'home-char-picker';
    overlay.innerHTML = `
      <div class="home-char-picker-panel jjk-panel" role="dialog" aria-label="Choose home characters">
        <div class="home-char-picker-head">
          <h2 class="jjk-title-plate">Home Characters</h2>
          <button class="jjk-icon-btn home-char-picker-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="home-char-picker-body"></div>
      </div>`;
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.home-char-picker-close')) { closePicker(); return; }
      if (e.target.closest('.home-char-slot-clear')) {
        clear(1);
        pickerSlot = 1;
        refreshPicker(overlay);
        return;
      }
      const tab = e.target.closest('.home-char-slot-pick');
      if (tab) {
        pickerSlot = Number(tab.dataset.slot);
        refreshPicker(overlay);
        return;
      }
      const opt = e.target.closest('.home-char-option[data-id]');
      if (opt) {
        const id = opt.dataset.id;
        if (pickerSlot === 1 && slots[1] === id) clear(1); // tap again to remove
        else set(id, pickerSlot);
        refreshPicker(overlay);
      }
    });
    document.body.appendChild(overlay);
    refreshPicker(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  }

  function closePicker() {
    document.querySelectorAll('.home-char-picker').forEach(p => p.remove());
  }

  // Subtle 2.5D parallax: the characters lean a few degrees toward the pointer.
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

  /* Stand the characters in the open space between the featured banner and
   * the menu banners, never under the menu panel (on short phones the menu
   * grows and would cover them).
   *
   * A pair stands as a small group: slot 1 in front on the right, slot 2 a
   * step behind on the left, drawn a little smaller. The pair is sized to the
   * larger of two spaces: the gap between banner and menu, or the whole band
   * left of the menu with slot 2's head kept below the featured banner. */
  const DUO_BACK = 0.88;     // slot 2 height relative to slot 1
  const DUO_OVERLAP = 0.16;  // share of slot 2's width tucked behind slot 1
  const MARGIN = 4;
  const shown = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  function centerInGap() {
    if (!container) return;
    const lEl = document.querySelector('.summon-banner-frame');
    const rEl = document.querySelector('.right-banner-panel');
    const lr = shown(lEl) ? lEl.getBoundingClientRect() : null;
    const rr = shown(rEl) ? rEl.getBoundingClientRect() : null;
    const cr = container.getBoundingClientRect();
    const full = cr.height;
    const mid = (cr.left + cr.right) / 2;
    const px = v => `${Math.round(v)}px`;
    const duo = !!slots[1];
    const [a, b] = [ROSTER[slots[0]].ar, duo ? ROSTER[slots[1]].ar : 0];

    if (!lr || !rr || rr.left <= lr.right) {
      container.style.removeProperty('--hc-offset');
      if (duo) {
        const h = Math.min(full, (cr.width * 0.6) / (a + DUO_BACK * b * (1 - DUO_OVERLAP)));
        container.style.setProperty('--hc-duo-h', px(h));
        container.style.setProperty('--hc-overlap', px(h * DUO_BACK * b * DUO_OVERLAP));
      }
      return;
    }

    const rightEdge = rr.left - MARGIN;
    if (!duo) {
      container.style.removeProperty('--hc-duo-h');
      container.style.removeProperty('--hc-overlap');
      // centred in the gap, pulled left if he would reach under the menu
      const w = full * a;
      const centre = Math.min((lr.right + rr.left) / 2, rightEdge - w / 2);
      container.style.setProperty('--hc-offset', px(centre - mid));
      return;
    }

    const ratio = a + DUO_BACK * b * (1 - DUO_OVERLAP);
    // A: only the gap between the two panels
    const gapLeft = lr.right + MARGIN;
    const hGap = Math.min(full, (rightEdge - gapLeft) / ratio);
    // B: the band from the banner's left edge, heads below the banner
    const bandLeft = lr.left;
    const hBand = Math.min(full, (rightEdge - bandLeft) / ratio, (cr.bottom - lr.bottom + 6) / DUO_BACK);
    const useBand = hBand > hGap;
    const h = Math.max(0, useBand ? hBand : hGap);
    const left = useBand ? bandLeft : gapLeft;
    const rowW = h * ratio;
    // spare room goes mostly to the left: keep the pair near the menu
    const slack = Math.max(0, rightEdge - left - rowW);
    const centre = rightEdge - rowW / 2 - slack * 0.35;
    container.style.setProperty('--hc-offset', px(centre - mid));
    container.style.setProperty('--hc-duo-h', `${Math.floor(h)}px`);
    container.style.setProperty('--hc-overlap', px(h * DUO_BACK * b * DUO_OVERLAP));
  }

  function init() {
    container = document.querySelector('.character-vignette-container');
    if (!container) return;
    container.classList.add('home-char-stage');
    switchBtn = document.createElement('button');
    switchBtn.className = 'home-char-switch';
    switchBtn.type = 'button';
    switchBtn.title = 'Change characters';
    switchBtn.setAttribute('aria-label', 'Change home characters');
    switchBtn.innerHTML = '<span class="home-char-switch-icon" aria-hidden="true">⇄</span><span class="home-char-switch-name"></span>';
    switchBtn.addEventListener('click', e => { e.stopPropagation(); openPicker(0); });
    container.appendChild(switchBtn);

    slots = savedSlots();
    render();
    initParallax();
    window.addEventListener('resize', centerInGap);
    window.addEventListener('orientationchange', () => setTimeout(centerInGap, 250));
    window.addEventListener('load', centerInGap);
    // the banner and menu settle late (fonts, images, device classes)
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => centerInGap());
      ['.summon-banner-frame', '.right-banner-panel'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) ro.observe(el);
      });
      ro.observe(container);
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker(); });
  }

  window.HomeCharacter = {
    set, clear, openPicker, closePicker,
    get current() { return slots[0]; },
    get slots() { return slots.slice(); },
    roster: ROSTER,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
