// js/summon/summon-stage.js — JJK-style gacha stage controller.
// Center stage cycles through three swappable views:
//   1) "banner" — the composed banner art
//   2) "char6"  — the awakened 6★ form's art + maxed stats
//   3) "char5"  — the pre-evolved 5★ form's art + stats (the unit you receive)
// Left/right arrows and dots move between them. Selecting a banner in the left
// rail (summon.js buildPreviewStrip) refreshes all views via updateBannerInfo.

(function () {
  const state = { charMap: null, pending: null, banner: null, views: ['banner'] };

  // One shared characters.json request per page (js/character_inv.js)
  (window.loadCharactersData ? window.loadCharactersData() : fetch('data/characters.json').then(r => r.json()))
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
    if (ch && ch.full) return ch.full.replace(/\.gif$/i, '.webp'); // prefer the static image
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

    renderPickup(banner);
    renderBar(banner, f);

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

  // Banner view, after the original game's summon screen: an info bar under the art
  // (banner name, a scrolling rates line, the end date), "New" / "Can be Awakened
  // to ★N" lettering and a gold Multi Summon line along the art's bottom edge. Banners here never end, so the date is the
  // original's far-future convention for permanent banners.
  function renderBar(banner, f) {
    const name = $('sb-name'), until = $('sb-until'), tick = $('sb-ticker'), stick = $('sb-stickers');
    if (!name || !tick) return;
    const sd = window.summonData || {};
    const rates = sd.baseRates || { '7star': 0.33, '6star': 3, '5star': 12, '4star': 84.67 };
    const pool = new Set([...(banner.featured || []), ...(banner.characters || [])]);
    if (banner.includeStandardPool !== false) (sd.standardPool || []).forEach(id => pool.add(id));
    const rateLine = ['7', '6', '5', '4']
      .filter(k => rates[k + 'star'] != null)
      .map(k => `${k} stars ${rates[k + 'star']}%`).join(', ');
    const line = `${pool.size} characters can appear: ${rateLine}`;
    tick.innerHTML = `<span>${line}</span><span aria-hidden="true">${line}</span>`;
    name.textContent = banner.name || '';
    if (until) until.textContent = 'until 2099/12/31 10:59';
    const rib = $('sb-ribbon');
    if (rib) rib.innerHTML = '<i class="sb-coin" aria-hidden="true">★</i>The featured rate climbs with every Multi Summon!';

    if (stick) {
      const list = (sd.banners || []).filter(b => b.type !== 'standard');
      const isNew = list.slice(0, 3).some(b => b.id === banner.id);
      const tags = [];
      if (isNew) tags.push('<span class="sb-sticker sb-new">New</span>');
      if (f && f.twoTier) tags.push(`<span class="sb-sticker sb-awaken">Can be Awakened to ${starMark(f.maxStar)}</span>`);
      stick.innerHTML = tags.join('');
      placeStickers();
    }
  }

  // The in-game star mark: a yellow-to-pink star with a dark outline, then the
  // numeral (rainbow for 7 and up, gold below).
  function starMark(n) {
    const u = 'sbs' + n;
    const num = n >= 7
      ? `<stop offset="0" stop-color="#ff5fd2"/><stop offset=".3" stop-color="#ffe14a"/><stop offset=".55" stop-color="#5dff8a"/><stop offset=".8" stop-color="#4fd2ff"/><stop offset="1" stop-color="#b47dff"/>`
      : `<stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffe066"/><stop offset="1" stop-color="#ef9a12"/>`;
    return `<svg class="sb-star" viewBox="0 0 ${n >= 10 ? 74 : 56} 30" aria-label="${n} stars" role="img">
      <defs>
        <linearGradient id="${u}s" x1=".1" y1=".05" x2=".85" y2=".95"><stop offset="0" stop-color="#fff27a"/><stop offset=".36" stop-color="#ffd23f"/><stop offset=".62" stop-color="#ff5c86"/><stop offset="1" stop-color="#f0207a"/></linearGradient>
        <linearGradient id="${u}n" x1=".7" y1="0" x2=".3" y2="1">${num}</linearGradient>
      </defs>
      <path d="M15.0 2.0L19.1 10.0L27.9 11.4L21.6 17.7L23.0 26.6L15.0 22.5L7.0 26.6L8.4 17.7L2.1 11.4L10.9 10.0z"
        fill="url(#${u}s)" stroke="#2a0606" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"/>
      <text x="28" y="26" font-size="28" fill="url(#${u}n)" stroke="#2a0606" stroke-width="4.5" stroke-linejoin="round" paint-order="stroke">${n}</text>
    </svg>`;
  }

  // Pin the stickers and the ribbon line to the art's bottom edge (classic/glass
  // letterbox the art; ink fills the stage with it).
  function placeStickers() {
    const stick = $('sb-stickers'), img = $('stage-banner-img'), stage = $('featured-stage');
    if (!stick || !img || !stage) return;
    const r = img.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if (!r.width || !sr.width) return;
    const bottom = Math.max(0, sr.bottom - r.bottom) + 'px';
    stick.style.bottom = bottom;
    stick.style.right = Math.max(0, sr.right - r.right) + 'px';
    const rib = $('sb-ribbon');
    if (rib) { rib.style.bottom = bottom; rib.style.left = Math.max(0, r.left - sr.left) + 'px'; rib.style.width = r.width + 'px'; }
  }
  (function () {
    const img = $('stage-banner-img');
    if (img) img.addEventListener('load', () => requestAnimationFrame(placeStickers));
    window.addEventListener('resize', placeStickers);
  })();

  // Rate-up list in the draw panel: one row per featured unit (evolved form).
  // Clicking a row shows that unit's form on the stage.
  function renderPickup(banner) {
    const box = $('pickup'), list = $('pickup-list');
    if (!box || !list) return;
    const ids = (banner.featured || []).filter(id => state.charMap[id] || window.SummonEvolve);
    box.hidden = ids.length === 0;
    list.innerHTML = ids.slice(0, 3).map((id, i) => {
      const f = formsFor(id);
      const ch = f.evolved || f.base;
      if (!ch) return '';
      const stars = f.twoTier ? `★${f.minStar}<i>→</i>★${f.maxStar}` : `★${f.maxStar}`;
      const tag = i === 0 ? 'button' : 'div'; // the stage only shows the lead unit
      return `<${tag} class="pickup-unit"${i === 0 ? ` type="button" aria-label="View ${ch.name}"` : ''}>
          <span class="pickup-portrait"><img src="${ch.portrait || ''}" alt="" onerror="this.style.visibility='hidden'"></span>
          <span class="pickup-text">
            <span class="pickup-name">${ch.name || ''}</span>
            <span class="pickup-ver">${ch.version || ''}</span>
            <span class="pickup-stars">${stars}</span>
          </span>
        </${tag}>`;
    }).join('');
    list.querySelector('button.pickup-unit')?.addEventListener('click', () => setView('char6'));
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
