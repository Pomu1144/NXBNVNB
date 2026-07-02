// js/summon/summon-stage.js — JJK-style gacha stage controller.
// Center stage has two swappable views:
//   1) "banner" — the composed banner art
//   2) "char"   — the featured unit's full art alongside its stat card
// A right/left arrow toggles between them. Selecting a banner in the left rail
// (summon.js buildPreviewStrip) updates both views via SummonUI.updateBannerInfo.

(function () {
  const state = { charMap: null, pending: null };

  fetch('data/characters.json')
    .then(r => r.json())
    .then(d => {
      const arr = Array.isArray(d) ? d : (d.characters || Object.values(d));
      const m = {};
      for (const c of arr) if (c && c.id) m[c.id] = c;
      state.charMap = m;
      if (state.pending) { updateStage(state.pending); state.pending = null; }
    })
    .catch(() => {});

  const $ = id => document.getElementById(id);
  const num = n => (typeof n === 'number' ? n.toLocaleString() : (n || '—'));

  function artFor(ch, banner) {
    if (ch && ch.full) return ch.full.replace(/\.gif$/i, '.png'); // prefer static PNG
    if (ch && ch.portrait) return ch.portrait;
    return banner && banner.image ? banner.image : '';
  }

  function rankOf(ch) {
    const r = ch && (ch.starMaxCode ? parseInt(ch.starMaxCode) : ch.rarity);
    return '★' + (typeof r === 'number' && r >= 5 && r <= 7 ? r : 6);
  }

  function statsHtml(ch) {
    if (!ch) return '';
    const s = ch.statsMax || ch.statsBase || {};
    const blank = v => v == null || String(v).trim() === '' || v === '—';
    const rows = [
      ['Power', num(ch.powerRank), true],
      ['HP', num(s.hp)],
      ['ATK', num(s.atk)],
      ['Speed', num(s.speed)],
      ['Element', ch.element],
      ['Affiliation', ch.affiliation],
    ].filter(([, v]) => !blank(v));
    return `<div class="cs-head">${rankOf(ch)} &nbsp;STATS</div>` +
      rows.map(([l, v, g]) =>
        `<div class="cs-row"><span class="cs-label">${l}</span><span class="cs-val${g ? ' gold' : ''}">${v}</span></div>`
      ).join('');
  }

  function updateStage(banner) {
    if (!banner) return;
    const stage = $('featured-stage');
    if (!stage) return;
    if (!state.charMap) { state.pending = banner; return; }

    const id = (banner.featured && banner.featured[0]) || null;
    const ch = id ? state.charMap[id] : null;

    // View 1: banner art
    const bimg = $('stage-banner-img');
    if (bimg && banner.image) { bimg.style.visibility = 'visible'; bimg.src = banner.image; }

    // View 2: character art + stats
    const art = $('featured-art');
    if (art) { const src = artFor(ch, banner); if (src) { art.style.visibility = 'visible'; art.src = src; } }
    const stats = $('char-stats');
    if (stats) stats.innerHTML = statsHtml(ch);

    // caption
    const nm = $('featured-name'), ti = $('featured-title'), rk = $('featured-rank');
    if (nm) nm.textContent = ch ? ch.name : (banner.name || '');
    if (ti) ti.textContent = ch ? (ch.version || '') : (banner.description || '');
    if (rk) rk.textContent = rankOf(ch);

    // reset to banner view on banner change
    setView('banner');

    // highlight active rail item by banner image
    if (banner.image) {
      document.querySelectorAll('#banner-preview-scroll .preview-item').forEach(it => {
        const img = it.querySelector('img');
        it.classList.toggle('active', !!(img && img.getAttribute('src') === banner.image));
      });
    }
  }

  function setView(view) {
    const stage = $('featured-stage');
    if (!stage) return;
    stage.setAttribute('data-view', view);
    document.querySelectorAll('.stage-dot').forEach(d =>
      d.classList.toggle('active', d.dataset.view === view));
  }

  function toggleView(dir) {
    const stage = $('featured-stage');
    const cur = stage ? stage.getAttribute('data-view') : 'banner';
    setView(cur === 'banner' ? 'char' : 'banner');
  }

  function wireNav() {
    $('stage-next') && ($('stage-next').onclick = () => toggleView(1));
    $('stage-prev') && ($('stage-prev').onclick = () => toggleView(-1));
    document.querySelectorAll('.stage-dot').forEach(d =>
      d.addEventListener('click', () => setView(d.dataset.view)));
  }

  function installHook() {
    const ui = window.SummonUI;
    if (!ui || ui.__stageHooked) return false;
    const orig = ui.updateBannerInfo ? ui.updateBannerInfo.bind(ui) : null;
    ui.updateBannerInfo = function (banner) {
      if (orig) { try { orig(banner); } catch (e) {} }
      try { updateStage(banner); } catch (e) { console.warn('stage', e); }
    };
    ui.__stageHooked = true;
    return true;
  }

  wireNav();
  if (!installHook()) {
    let n = 0;
    const t = setInterval(() => { if (installHook() || ++n > 40) clearInterval(t); }, 100);
  }
  // wire nav again once DOM is fully ready (elements exist)
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', wireNav);

  console.log('✅ Summon stage controller loaded');
})();
