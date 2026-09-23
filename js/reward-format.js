// js/reward-format.js
// Shared reward formatter: turns raw reward maps ({ ryo: 25000, ninja_pearls: 1,
// scroll_body: 2 }) into display items with a readable name, a real icon and a
// quantity. Used by the battle Mission Rewards screen, the village login bonus
// and the Present Box. Items whose art is not shipped yet get a small inline
// SVG emblem (scroll / crystal / stone / book) tinted by element, so no tile
// ever shows a broken image or a raw key.
(function (global) {
  'use strict';

  const ELEMENT_COLORS = {
    body: '#d8503f',
    skill: '#46b15e',
    bravery: '#e2b53c',
    wisdom: '#3f86d8',
    heart: '#d964ad',
    neutral: '#c9a24e'
  };

  const ALIASES = {
    pearls: 'ninja_pearls',
    gems: 'ninja_pearls',
    ramen_1star: 'ramen_heart_1star',
    ramen_2star: 'ramen_heart_2star',
    ramen_3star: 'ramen_heart_3star',
    ramen_4star: 'ramen_heart_4star',
    ramen_5star: 'ramen_heart_5star',
    scroll_3star: 'awakening_stone_3',
    scroll_4star: 'awakening_stone_4',
    scroll_5star: 'awakening_stone_5'
  };

  // Names that read better than (or are missing from) Resources.MATERIAL_TYPES
  const NAMES = {
    ryo: 'Ryo',
    ninja_pearls: 'Ninja Pearls',
    shinobites: 'Shinobites',
    exp: 'Player EXP',
    ramen_1star: '1★ Ramen',
    ramen_2star: '2★ Ramen',
    ramen_3star: '3★ Ramen',
    ramen_4star: '4★ Ramen',
    ramen_5star: '5★ Ramen',
    scroll_3star: '3★ Awakening Stone',
    scroll_4star: '4★ Awakening Stone',
    scroll_5star: '5★ Awakening Stone',
    limit_break_crystal: 'Limit Break Crystal'
  };

  // Icons that exist on disk
  const ICONS = {
    ryo: 'assets/icons/currency/ryo.png',
    ninja_pearls: 'assets/icons/currency/ninjapearl.png',
    shinobites: 'assets/icons/currency/shinobite.png',
    exp: 'assets/ui/jjk/star_gold.webp',
    limit_break_crystal: 'assets/items/limitbreakcrystal_portrait.webp'
  };

  const CHEST = 'assets/icons/chestunopened.png';

  function canonical(key) {
    const k = String(key || '').trim();
    return ALIASES[k] || k;
  }

  function info(key) {
    try {
      const types = global.Resources && global.Resources.MATERIAL_TYPES;
      return (types && types[canonical(key)]) || null;
    } catch (e) { return null; }
  }

  function titleCase(key) {
    return String(key || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  function elementOf(key) {
    const k = String(key || '').toLowerCase();
    const i = info(k);
    if (i && i.element) return i.element;
    const m = k.match(/(body|skill|bravery|wisdom|heart)/);
    return m ? m[1] : 'neutral';
  }

  /** Readable display name for a raw reward key. */
  function name(key) {
    const raw = String(key || '');
    if (NAMES[raw]) return NAMES[raw];
    const c = canonical(raw);
    if (NAMES[c]) return NAMES[c];
    const i = info(c);
    if (i && i.name && i.name !== c) {
      // Drop flavour subtitles like 'Awakening Charm "Talisman of Legends"'
      return i.name.replace(/\s*"[^"]*"\s*$/, '').replace(/\s+Ichiraku Ramen$/, ' Ramen');
    }
    // Loose matches for free-form names
    const n = raw.toLowerCase();
    if (n.includes('pearl')) return 'Ninja Pearls';
    if (n === 'ryo' || n.includes('ryo')) return 'Ryo';
    if (n.includes('shinobite')) return 'Shinobites';
    // ramen_1star / scroll_body style keys
    const star = raw.match(/^(.*?)_?(\d)_?star$/i);
    if (star) return `${star[2]}★ ${titleCase(star[1])}`;
    const trail = raw.match(/^(.*?)_(\d)$/);
    if (trail) return `${trail[2]}★ ${titleCase(trail[1])}`;
    return titleCase(raw);
  }

  // ---------- inline SVG emblems ----------
  function svgUri(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function shade(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function scrollSvg(c) {
    const d = shade(c, -70), l = shade(c, 50);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4e7c4"/><stop offset="1" stop-color="#cdb57e"/></linearGradient>
      <linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${d}"/><stop offset=".5" stop-color="${l}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>
      <g transform="rotate(-18 32 32)">
        <rect x="14" y="14" width="36" height="36" rx="2" fill="url(#p)" stroke="#5b4520" stroke-width="1.5"/>
        <path d="M20 24h24M20 30h24M20 36h16" stroke="#8a6f3c" stroke-width="2" stroke-linecap="round" opacity=".7"/>
        <rect x="10" y="9" width="44" height="8" rx="4" fill="url(#r)" stroke="#2a1d0c" stroke-width="1.5"/>
        <rect x="10" y="47" width="44" height="8" rx="4" fill="url(#r)" stroke="#2a1d0c" stroke-width="1.5"/>
        <circle cx="44" cy="40" r="6" fill="${c}" stroke="#2a1d0c" stroke-width="1.5"/>
      </g></svg>`;
  }

  function crystalSvg(c) {
    const d = shade(c, -80), l = shade(c, 80);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path d="M32 4 50 22 32 60 14 22Z" fill="${c}" stroke="#101a1c" stroke-width="2" stroke-linejoin="round"/>
      <path d="M32 4 40 22 32 60 24 22Z" fill="${l}" opacity=".55"/>
      <path d="M14 22h36L32 60Z" fill="${d}" opacity=".45"/>
      <path d="M32 4 50 22H14Z" fill="${l}" opacity=".35"/>
      <path d="M22 14 26 12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/></svg>`;
  }

  function stoneSvg(c, stars) {
    const d = shade(c, -70), l = shade(c, 70);
    const label = stars ? `<text x="32" y="40" text-anchor="middle" font-family="serif" font-weight="700" font-size="18" fill="#fff8e0" stroke="#1a1206" stroke-width="3" paint-order="stroke">${stars}★</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs><radialGradient id="g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${l}"/><stop offset=".6" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></radialGradient></defs>
      <path d="M32 5 55 18v28L32 59 9 46V18Z" fill="url(#g)" stroke="#1a1206" stroke-width="2" stroke-linejoin="round"/>
      <path d="M32 5 55 18 32 30 9 18Z" fill="#fff" opacity=".18"/>${label}</svg>`;
  }

  function bookSvg(c, stars) {
    const d = shade(c, -70);
    const label = stars ? `<text x="34" y="41" text-anchor="middle" font-family="serif" font-weight="700" font-size="15" fill="#fff8e0" stroke="#1a1206" stroke-width="3" paint-order="stroke">${stars}★</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect x="14" y="8" width="40" height="50" rx="3" fill="#efe2bd" stroke="#2a1d0c" stroke-width="1.5"/>
      <rect x="10" y="6" width="40" height="50" rx="3" fill="${c}" stroke="#2a1d0c" stroke-width="2"/>
      <rect x="10" y="6" width="7" height="50" fill="${d}"/>
      <rect x="21" y="16" width="24" height="30" rx="2" fill="none" stroke="#f1d98a" stroke-width="1.5" opacity=".8"/>${label}</svg>`;
  }

  function charmSvg(c) {
    const l = shade(c, 70);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="24" fill="${c}" stroke="#1a1206" stroke-width="2"/>
      <circle cx="32" cy="32" r="17" fill="none" stroke="${l}" stroke-width="2"/>
      <path d="M32 19l3.8 8.3 9 .9-6.8 6 2 8.9L32 38.5l-8 4.6 2-8.9-6.8-6 9-.9Z" fill="#fff4cf" stroke="#1a1206" stroke-width="1"/></svg>`;
  }

  /** Icon URL for a raw reward key (always returns something renderable). */
  function icon(key) {
    const raw = String(key || '');
    const c = canonical(raw);
    if (ICONS[raw]) return ICONS[raw];
    if (ICONS[c]) return ICONS[c];
    const n = c.toLowerCase();
    if (n.includes('pearl')) return ICONS.ninja_pearls;
    if (n.includes('shinobite')) return ICONS.shinobites;
    if (n.includes('ryo')) return ICONS.ryo;

    const i = info(c);
    // Ramen icons are real portraits
    if (i && i.icon && /^assets\/characters\//.test(i.icon)) return i.icon;

    const col = ELEMENT_COLORS[elementOf(c)] || ELEMENT_COLORS.neutral;
    const stars = (n.match(/(\d)(?:_?star)?$/) || [])[1] || '';
    if (n.startsWith('scroll_basic')) return svgUri(scrollSvg('#7f9aa0'));
    if (n.startsWith('scroll_advanced')) return svgUri(scrollSvg('#8a5cc8'));
    if (n.startsWith('scroll')) return svgUri(scrollSvg(col));
    if (n.includes('crystal')) return svgUri(crystalSvg(n.includes('dupe') ? '#9a7bd8' : n.includes('limit') ? '#5ec8e0' : col));
    if (n.startsWith('book')) return svgUri(bookSvg(n.includes('victor') ? '#b0342c' : col, stars));
    if (n.includes('stone')) return svgUri(stoneSvg(n.includes('character') ? '#c9a24e' : '#6fa7b8', stars));
    if (n.includes('charm') || n.includes('coin') || n.includes('boost')) return svgUri(charmSvg(col));
    return CHEST;
  }

  /**
   * Normalise a reward map (or list) into display items:
   * [{ key, name, qty, icon, fallback, kind }]. `characters` arrays become
   * character items with portraits.
   */
  function items(rewards) {
    const out = [];
    if (!rewards) return out;
    const push = (key, qty) => {
      const q = Number(qty);
      if (!key || !isFinite(q) || q <= 0) return;
      out.push({ key, kind: 'resource', name: name(key), qty: q, icon: icon(key), fallback: CHEST });
    };
    if (Array.isArray(rewards)) {
      rewards.forEach(r => r && push(r.key || r.resourceId || r.id || r.name, r.qty ?? r.quantity ?? r.amount));
      return out;
    }
    Object.entries(rewards).forEach(([k, v]) => {
      if (k === 'characters') {
        (Array.isArray(v) ? v : []).forEach(ch => {
          if (!ch || !ch.characterId) return;
          out.push({
            key: 'char_' + ch.characterId,
            kind: 'character',
            name: charName(ch.characterId),
            qty: ch.quantity || 1,
            icon: `assets/characters/${ch.characterId}/portrait_${ch.tierCode || '6S'}.png`,
            fallback: 'assets/icons/characters_icon.png',
            tier: ch.tierCode || ''
          });
        });
        return;
      }
      push(k, v);
    });
    return out;
  }

  /** Merge several reward maps, summing quantities. */
  function merge(...maps) {
    const total = {};
    maps.forEach(m => {
      if (!m || typeof m !== 'object') return;
      Object.entries(m).forEach(([k, v]) => {
        if (k === 'characters') {
          total.characters = (total.characters || []).concat(Array.isArray(v) ? v : []);
        } else if (typeof v === 'number') {
          total[k] = (total[k] || 0) + v;
        }
      });
    });
    return total;
  }

  function charName(id) {
    try {
      const list = global.CharacterData || global.CHARACTERS || null;
      if (Array.isArray(list)) {
        const c = list.find(x => x.id === id);
        if (c && c.name) return c.name;
      }
    } catch (e) { /* ignore */ }
    return titleCase(String(id || 'Ninja').replace(/_\d+$/, ''));
  }

  function fmtQty(n) {
    return (Number(n) || 0).toLocaleString();
  }

  global.RewardFormat = { name, icon, items, merge, fmtQty, canonical, elementOf, CHEST };
})(window);
