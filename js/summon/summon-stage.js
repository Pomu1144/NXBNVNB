// js/summon/summon-stage.js — JJK-style gacha stage controller.
// Drives the center "featured character" splash: whenever a banner is selected
// (summon.js -> SummonUI.updateBannerInfo), swap the middle art to the featured
// unit's full card art and highlight the active banner in the left rail.
// The left rail itself is the existing #banner-preview-scroll that summon.js
// populates; we only restyle it (CSS) and keep its click handlers.

(function () {
  const state = { charMap: null, pending: null };

  // Build id -> {full, portrait, name, version} from characters.json
  fetch('data/characters.json')
    .then(r => r.json())
    .then(d => {
      const arr = Array.isArray(d) ? d : (d.characters || Object.values(d));
      const m = {};
      for (const c of arr) if (c && c.id) m[c.id] = c;
      state.charMap = m;
      if (state.pending) { updateStage(state.pending); state.pending = null; }
    })
    .catch(() => { /* stage will fall back to banner art */ });

  function artFor(ch, banner) {
    if (ch && ch.full) return ch.full;
    if (ch && ch.portrait) return ch.portrait;
    return banner && banner.image ? banner.image : '';
  }

  function updateStage(banner) {
    if (!banner) return;
    const art = document.getElementById('featured-art');
    const nameEl = document.getElementById('featured-name');
    const titleEl = document.getElementById('featured-title');
    const rankEl = document.getElementById('featured-rank');
    if (!art) return;

    if (!state.charMap) { state.pending = banner; return; }

    const id = (banner.featured && banner.featured[0]) || null;
    const ch = id ? state.charMap[id] : null;

    const src = artFor(ch, banner);
    if (src) { art.style.visibility = 'visible'; art.src = src; }
    if (nameEl) nameEl.textContent = ch ? ch.name : (banner.name || '');
    if (titleEl) titleEl.textContent = ch ? (ch.version || '') : (banner.description || '');
    if (rankEl) {
      const r = ch && (ch.starMaxCode || ch.rarity);
      rankEl.textContent = '★' + (typeof r === 'number' && r >= 5 && r <= 7 ? r : 6);
    }

    // restart the entrance animation
    art.style.animation = 'none'; void art.offsetWidth; art.style.animation = '';

    // Highlight the matching rail item (match by banner image src)
    if (banner.image) {
      document.querySelectorAll('#banner-preview-scroll .preview-item').forEach(it => {
        const img = it.querySelector('img');
        const on = img && img.getAttribute('src') === banner.image;
        it.classList.toggle('active', !!on);
      });
    }
  }

  // Wrap SummonUI.updateBannerInfo so every banner change updates the stage.
  function installHook() {
    const ui = window.SummonUI;
    if (!ui || ui.__stageHooked) return false;
    const orig = ui.updateBannerInfo ? ui.updateBannerInfo.bind(ui) : null;
    ui.updateBannerInfo = function (banner) {
      if (orig) { try { orig(banner); } catch (e) { console.warn('updateBannerInfo', e); } }
      try { updateStage(banner); } catch (e) { console.warn('stage', e); }
    };
    ui.__stageHooked = true;
    return true;
  }

  // SummonUI exists at script load; hook immediately, retry briefly as a safety net.
  if (!installHook()) {
    let tries = 0;
    const t = setInterval(() => { if (installHook() || ++tries > 40) clearInterval(t); }, 100);
  }

  console.log('✅ Summon stage controller loaded');
})();
