/* The original game's brush-stroke number fonts (assets/ui/original/font, from
 * tools/sprites/ipa_rig/build_ui.py): white digits for damage, gold for the hit counter.
 *
 *   BattleDigits.make('1234', { font: 'white', height: 40 })  -> <span> of digit glyphs
 *   BattleDigits.image('critical', height)                     -> <img> text image
 *
 * Characters other than 0-9 fall back to plain text in the same span.
 */
(function () {
  "use strict";

  const BASE = 'assets/ui/original/';
  // glyph x ranges in the 460x64 textures (font/digits.json)
  const FONTS = {
    white: { src: BASE + 'font/digits_white.png', w: 460, h: 64,
      glyphs: [[5, 45], [56, 85], [94, 137], [140, 181], [185, 229], [236, 275], [281, 317], [326, 367], [373, 411], [418, 458]] },
    gold: { src: BASE + 'font/digits_gold.png', w: 460, h: 64,
      glyphs: [[4, 42], [56, 82], [95, 135], [143, 179], [185, 226], [236, 274], [281, 315], [327, 366], [373, 409], [418, 456]] },
  };
  const IMAGES = {
    critical: { src: BASE + 'text/critical_txt.png', w: 169, h: 87 },
    hits: { src: BASE + 'text/ani_Hits.png', w: 166, h: 62 },
  };
  // warm the cache so the first hit already has its glyphs
  [...Object.values(FONTS), ...Object.values(IMAGES)].forEach(f => { const i = new Image(); i.src = f.src; });

  window.BattleDigits = {
    make(text, { font = 'white', height = 40, overlap = 0.06 } = {}) {
      const f = FONTS[font] || FONTS.white;
      const s = height / f.h;
      const wrap = document.createElement('span');
      wrap.className = `battle-digits battle-digits--${font}`;
      Object.assign(wrap.style, { display: 'inline-flex', alignItems: 'center', lineHeight: '0', whiteSpace: 'nowrap' });
      for (const ch of String(text)) {
        const d = ch.charCodeAt(0) - 48;
        if (d < 0 || d > 9) {
          const t = document.createElement('span');
          t.textContent = ch;
          Object.assign(t.style, { lineHeight: '1', fontSize: `${height * 0.8}px` });
          wrap.appendChild(t);
          continue;
        }
        const [x0, x1] = f.glyphs[d];
        const g = document.createElement('span');
        Object.assign(g.style, {
          display: 'inline-block', width: `${(x1 - x0) * s}px`, height: `${height}px`,
          marginRight: `${-height * overlap}px`,
          backgroundImage: `url(${f.src})`, backgroundRepeat: 'no-repeat',
          backgroundSize: `${f.w * s}px ${height}px`, backgroundPosition: `${-x0 * s}px 0`,
        });
        wrap.appendChild(g);
      }
      return wrap;
    },

    image(name, height) {
      const m = IMAGES[name];
      const img = document.createElement('img');
      img.src = m.src;
      img.alt = '';
      Object.assign(img.style, { height: `${height}px`, width: `${(m.w / m.h) * height}px`, display: 'block' });
      return img;
    },
  };
})();
