/* Skins button + picker for the character info modal (characters.html).
 *
 *   SkinPicker.mount(artEl, { charId, name, portrait })  // on every modal open
 *   SkinPicker.mount(artEl, null)                         // hide the button
 *   SkinPicker.open() / SkinPicker.close()
 *
 * The button sits in the art frame's bottom-right corner and only shows for
 * units that have skins (js/skins.js), with a count badge. The picker lists
 * Default + each skin with its idle sprite playing, and equips one. Skins whose
 * art isn't on the server yet are greyed out. Styles: css/skins.css
 */
(() => {
  "use strict";

  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  // Robe on a hanger
  const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a1.6 1.6 0 0 1 1.6 1.6c0 .7-.5 1.1-1 1.4l-.6.4" /><path d="M12 6.6 4 10.2l2.3 3.1 1.6-.8V21h8.2v-8.5l1.6.8 2.3-3.1z" /><path d="M9.6 8.2 12 13l2.4-4.8" /></svg>`;

  let btn = null;      // the corner button (re-parented into the current art frame)
  let ctx = null;      // { charId, name, portrait }
  let overlay = null;
  let sprites = [];

  function ensureButton(host) {
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skin-btn';
      btn.innerHTML = `${ICON}<span class="skin-btn-label">Skins</span><span class="skin-btn-count"></span>`;
      btn.addEventListener('click', e => { e.stopPropagation(); open(); });
    }
    if (btn.parentElement !== host) host.appendChild(btn);
    return btn;
  }

  function refreshButton() {
    if (!btn || !ctx) return;
    const n = window.Skins.forChar(ctx.charId).length;
    const worn = window.Skins.equippedId(ctx.charId);
    btn.querySelector('.skin-btn-count').textContent = n;
    btn.classList.toggle('is-worn', !!worn);
    btn.setAttribute('aria-label', `Skins: ${n} available${worn ? ', one equipped' : ''}`);
    btn.title = worn ? `Skin: ${window.Skins.get(worn).name}` : 'Skins';
  }

  function mount(host, info) {
    ctx = info && info.charId ? info : null;
    close();
    const has = !!(ctx && host && window.Skins?.hasSkins(ctx.charId));
    if (!host) { if (btn) btn.hidden = true; return; }
    ensureButton(host).hidden = !has;
    if (has) refreshButton();
  }

  /* ---------- Picker ---------- */
  function optionHTML(opt) {
    return `
      <div class="skin-opt${opt.worn ? ' is-worn' : ''}" data-skin="${esc(opt.id || '')}" role="listitem">
        <div class="skin-opt-stage">${opt.thumb ? `<img class="skin-opt-thumb" src="${esc(opt.thumb)}" alt="" draggable="false">` : ''}</div>
        <div class="skin-opt-name">${esc(opt.name)}</div>
        <div class="skin-opt-note">${esc(opt.note || '')}</div>
        <button type="button" class="skin-opt-btn"${opt.worn ? ' disabled' : ''}>${opt.worn ? 'Equipped' : 'Equip'}</button>
      </div>`;
  }

  function stageHeight() {
    return document.documentElement.classList.contains('is-compact') ? 92 : 132;
  }

  function playIdle(stage, folder) {
    const SP = window.SpritePlayer;
    if (!SP || !folder) return Promise.resolve(false);
    return SP.preload(folder, 'idle').then(() => {
      if (!overlay || !stage.isConnected) return false;
      const p = SP.create(stage, folder, { height: stageHeight() });
      sprites.push(p);
      stage.classList.add('has-sprite');
      p.play('idle').catch(() => {});
      return true;
    }).catch(() => false);
  }

  function render() {
    if (!overlay || !ctx) return;
    const S = window.Skins, SP = window.SpritePlayer;
    sprites.forEach(p => p.destroy());
    sprites = [];
    const worn = S.equippedId(ctx.charId);
    const skins = S.forChar(ctx.charId);
    const opts = [{ id: '', name: 'Default', note: 'Original look', worn: !worn }]
      .concat(skins.map(s => ({ id: s.id, name: s.name, worn: worn === s.id, note: '', thumb: s.thumb })));
    const list = overlay.querySelector('.skin-list');
    list.innerHTML = opts.map(optionHTML).join('');

    // Default: the unit's own idle, else its portrait
    const defStage = list.querySelector('.skin-opt[data-skin=""] .skin-opt-stage');
    playIdle(defStage, SP?.basePathFor?.(ctx.charId)).then(ok => {
      if (!ok && ctx.portrait && defStage.isConnected) defStage.innerHTML = `<img class="skin-opt-thumb" src="${esc(ctx.portrait)}" alt="" draggable="false">`;
    });

    for (const s of skins) {
      const card = list.querySelector(`.skin-opt[data-skin="${CSS.escape(s.id)}"]`);
      const stage = card.querySelector('.skin-opt-stage');
      const note = card.querySelector('.skin-opt-note');
      const b = card.querySelector('.skin-opt-btn');
      const owned = S.isOwned(s.id);
      // Hide the thumb until we know it loads (no broken-image icons)
      const thumb = stage.querySelector('img');
      if (thumb) { thumb.hidden = true; thumb.onload = () => { thumb.hidden = false; }; thumb.onerror = () => thumb.remove(); }
      if (!owned) {
        card.classList.add('is-locked');
        note.textContent = 'Not owned';
        b.textContent = 'Shop';
        b.disabled = false;
        b.dataset.shop = '1';
      }
      card.classList.add('is-checking');
      b.disabled = true;
      S.probe(s).then(ok => {
        if (!card.isConnected) return;
        card.classList.remove('is-checking');
        if (!ok) {
          card.classList.add('is-missing');
          stage.innerHTML = '<span class="skin-opt-soon" aria-hidden="true"></span>';
          note.textContent = 'Art coming soon';
          b.textContent = 'Coming soon';
          b.disabled = true;
          return;
        }
        b.disabled = worn === s.id;
        playIdle(stage, s.folder).then(played => { if (played) thumb?.remove(); });
      });
    }
  }

  function onPick(e) {
    const b = e.target.closest('.skin-opt-btn');
    if (!b || b.disabled || !ctx) return;
    const id = b.closest('.skin-opt')?.dataset.skin || null;
    if (b.dataset.shop) { location.href = 'shop.html?tab=skins'; return; }
    // equip() fires 'skins:change', which re-renders the list and the button
    window.Skins.equip(ctx.charId, id || null);
  }

  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  function open() {
    if (!ctx || !window.Skins) return;
    close();
    overlay = document.createElement('div');
    overlay.className = 'skin-picker';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Skins for ${ctx.name || ctx.charId}`);
    overlay.innerHTML = `
      <div class="skin-picker-panel">
        <header class="skin-picker-head">
          <h2 class="skin-picker-title">Skins</h2>
          <span class="skin-picker-unit">${esc(ctx.name || '')}</span>
          <button type="button" class="skin-picker-close" aria-label="Close">&times;</button>
        </header>
        <div class="skin-list" role="list"></div>
        <p class="skin-picker-hint">Skins change how the unit looks in battle. Stats stay the same.</p>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.skin-picker-close').addEventListener('click', close);
    overlay.querySelector('.skin-list').addEventListener('click', onPick);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    render();
    overlay.querySelector('.skin-picker-close').focus({ preventScroll: true });
  }

  function close() {
    if (!overlay) return;
    sprites.forEach(p => p.destroy());
    sprites = [];
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    overlay = null;
    if (btn && !btn.hidden) btn.focus({ preventScroll: true });
  }

  window.addEventListener('skins:change', () => { refreshButton(); if (overlay) render(); });

  window.SkinPicker = { mount, open, close };
})();
