// js/summon/summon-stage.js — JJK-style gacha stage controller.
// Center stage cycles through three swappable views:
//   1) "banner" — the composed banner art
//   2) "char6"  — the awakened 6★ form's art + maxed stats
//   3) "char5"  — the pre-evolved 5★ form's art + stats (the unit you receive)
// Left/right arrows and dots move between them. Selecting a banner in the left
// rail (summon.js buildPreviewStrip) refreshes all views via updateBannerInfo.

(function () {
  const state = { charMap: null, pending: null, banner: null, views: ['banner'] };

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

  function rankNum(code, fallback) {
    const n = code ? parseInt(code, 10) : NaN;
    return (Number.isFinite(n) && n >= 1 && n <= 10) ? n : fallback;
  }

  // Resolve the base (lower-star) and evolved (higher-star) forms + tiers.
  function formsFor(id) {
    let base, evolved;
    if (window.SummonEvolve) {
      const f = window.SummonEvolve.forms(id);
      base = f.base || (state.charMap && state.charMap[id]);
      evolved = f.evolved || (state.charMap && state.charMap[id]);
    } else {
      base = evolved = state.charMap && state.charMap[id];
    }
    const minStar = rankNum(base && base.starMinCode, base && base.rarity ? base.rarity : 5);
    const maxStar = rankNum(evolved && evolved.starMaxCode, evolved && evolved.rarity ? evolved.rarity : 6);
    return { base, evolved, minStar, maxStar, twoTier: !!(base && evolved && maxStar > minStar) };
  }

  function statsHtml(ch, stats, rankNum) {
    if (!ch) return '';
    const s = stats || ch.statsMax || ch.statsBase || {};
    const blank = v => v == null || String(v).trim() === '' || v === '—';
    const rows = [
      ['Power', num(ch.powerRank), true],
      ['HP', num(s.hp)],
      ['ATK', num(s.atk)],
      ['Speed', num(s.speed)],
      ['Element', ch.element],
      ['Affiliation', Array.isArray(ch.affiliation) ? ch.affiliation[0] : ch.affiliation],
    ].filter(([, v]) => !blank(v));
    return `<div class="cs-head">★${rankNum} &nbsp;STATS</div>` +
      rows.map(([l, v, g]) =>
        `<div class="cs-row"><span class="cs-label">${l}</span><span class="cs-val${g ? ' gold' : ''}">${v}</span></div>`
      ).join('');
  }

  // Fill the character slide for a given tier ('top' = evolved, 'base' = 5★).
  function renderCharView(which) {
    if (!state.banner) return;
    const id = (state.banner.featured && state.banner.featured[0]) || null;
    const art = $('featured-art'), stats = $('char-stats'), badge = $('stage-tier-badge');
    if (!id) { if (stats) stats.innerHTML = ''; return; }

    const f = formsFor(id);
    const top = which !== 'base';
    const ch = top ? f.evolved : f.base;
    if (!ch) return;

    const statObj = top ? (ch.statsMax || ch.statsBase) : (ch.statsBase || ch.statsMax);
    const rk = top ? f.maxStar : f.minStar;

    if (art) { const src = artFor(ch, state.banner); if (src) { art.style.visibility = 'visible'; art.src = src; } }
    if (stats) stats.innerHTML = statsHtml(ch, statObj, rk);
    if (badge) badge.textContent = `★${rk} FORM`;

    // caption
    const nm = $('featured-name'), ti = $('featured-title'), rke = $('featured-rank');
    if (nm) nm.textContent = ch.name || (state.banner.name || '');
    if (ti) ti.textContent = ch.version || '';
    if (rke) rke.textContent = '★' + rk;
  }

  function updateStage(banner) {
    if (!banner) return;
    const stage = $('featured-stage');
    if (!stage) return;
    if (!state.charMap) { state.pending = banner; return; }
    state.banner = banner;

    // View 1: banner art
    const bimg = $('stage-banner-img');
    if (bimg && banner.image) { bimg.style.visibility = 'visible'; bimg.src = banner.image; }

    // Decide which character slides this banner supports.
    const id = (banner.featured && banner.featured[0]) || null;
    const f = id ? formsFor(id) : null;
    state.views = ['banner'];
    if (f && f.evolved) state.views.push('char6');
    if (f && f.twoTier) state.views.push('char5');
    // The 5★ dot only makes sense when the unit spans two tiers.
    const dot5 = document.querySelector('.stage-dot[data-view="char5"]');
    if (dot5) dot5.style.display = (f && f.twoTier) ? '' : 'none';

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
    if (!state.views.includes(view)) view = 'banner';
    stage.setAttribute('data-view', view);
    if (view === 'char6') renderCharView('top');
    else if (view === 'char5') renderCharView('base');
    document.querySelectorAll('.stage-dot').forEach(d =>
      d.classList.toggle('active', d.dataset.view === view));
  }

  function step(dir) {
    const stage = $('featured-stage');
    const cur = stage ? stage.getAttribute('data-view') : 'banner';
    const views = state.views.length ? state.views : ['banner'];
    let i = views.indexOf(cur);
    if (i < 0) i = 0;
    i = (i + dir + views.length) % views.length;
    setView(views[i]);
  }

  function wireNav() {
    $('stage-next') && ($('stage-next').onclick = () => step(1));
    $('stage-prev') && ($('stage-prev').onclick = () => step(-1));
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
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', wireNav);

  console.log('✅ Summon stage controller loaded (3-view: banner / 6★ / 5★)');
})();
