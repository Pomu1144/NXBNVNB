// js/rank-frame.js
// Higher-tier awakening frames (8★ / 9★ / 10★) applied as a runtime OVERLAY on
// top of a unit's existing portrait, so the new frame's thick border + badges
// cover the old baked-in frame — no regenerated art, no overlapping frames.
//
// One frame per rank for now (element-specific badges are a drop-in later:
// extend FRAMES[rank] to an element map).

(function () {
  const FRAMES = {
    8:  'assets/ui/frames/rank_8.webp',   // gold
    9:  'assets/ui/frames/rank_9.webp',   // holographic
    10: 'assets/ui/frames/rank_10.webp',  // black + gold sakura
  };
  // Tier codes that count as an 8★+ awakened rank.
  const STAR_BY_TIER = { '8S': 8, '8SM': 8, '9S': 9, '9ST': 9, '10SO': 10 };

  // Optional dramatic energy aura rendered BEHIND a unit's card (original
  // abstract art — not baked onto the character). Keyed by character id.
  const AURAS = {
    naruto_427: 'assets/ui/frames/aura_light.webp',
    naruto_428: 'assets/ui/frames/aura_light.webp',
  };
  function auraFor(charId) { return AURAS[charId] || null; }

  function starOf(tierCode) { return STAR_BY_TIER[tierCode] || 0; }

  // Frame URL for a tier code, or null for anything below 8★.
  function url(tierCode) {
    const n = starOf(tierCode);
    return n >= 8 ? (FRAMES[n] || null) : null;
  }

  // Toggle the rank frame on a `.rank-card` square (art img + overlay img).
  // Pass the card element (position:relative, overflow:hidden), the overlay
  // <img>, and the tier code. Returns true if a frame is shown.
  function apply(cardEl, overlayImg, tierCode) {
    const src = url(tierCode);
    if (!cardEl || !overlayImg) return false;
    if (src) {
      overlayImg.src = src;
      overlayImg.style.display = '';
      cardEl.classList.add('has-rank-frame');
      return true;
    }
    overlayImg.style.display = 'none';
    cardEl.classList.remove('has-rank-frame');
    return false;
  }

  // Toggle a unit's dramatic aura layer (element behind the card).
  function applyAura(auraEl, charId) {
    if (!auraEl) return false;
    const src = auraFor(charId);
    if (src) { auraEl.style.backgroundImage = `url('${src}')`; auraEl.style.display = ''; return true; }
    auraEl.style.display = 'none';
    return false;
  }

  window.RankFrame = { url, starOf, apply, auraFor, applyAura, FRAMES };
})();
