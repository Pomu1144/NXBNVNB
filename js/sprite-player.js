/* Spritesheet player for character animations.
 *
 *   const p = SpritePlayer.create(containerEl, 'assets/sprites/naruto_666', { height: 180 });
 *   await p.play('idle');                 // loops
 *   await p.play('attack', { then: 'idle' }); // plays once, then returns to idle
 *   p.setState('run');                    // no-op if 'run' is already playing
 *
 * Each animation lives at <base>/<name>.webp + <name>.json, as produced by
 * tools/sprites/build_spritesheet.py. Frames are shown by moving the
 * background-position of one element, so there is a single decoded image per
 * animation and no per-frame DOM work.
 */
(function () {
  const metaCache = new Map();

  // Folder that actually holds sheet `name` for `base`: variant / skin folders
  // (SHARED) own only some sheets, the rest come from their family folder
  // (which can itself be a variant, so follow the chain).
  function sheetFolder(base, name) {
    for (let i = 0; i < 4; i++) {
      const sh = SHARED[base];
      if (!sh || sh.own.includes(name)) break;
      base = sh.from;
    }
    return base;
  }

  function loadAnim(base, name) {
    base = sheetFolder(base, name);
    const sh = SHARED[base];
    // An own sheet that isn't there (e.g. skin art not landed yet) is read
    // from the family folder instead, so a unit never loses its sprite.
    return sh ? loadSheet(base, name).catch(() => loadAnim(sh.from, name)) : loadSheet(base, name);
  }

  function loadSheet(base, name) {
    const key = `${base}/${name}`;
    if (!metaCache.has(key)) {
      const p = fetch(`${key}.json`)
        .then(r => { if (!r.ok) throw new Error(`missing ${key}.json`); return r.json(); })
        .then(meta => new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ ...meta, url: `${key}.webp` });
          img.onerror = () => reject(new Error(`missing ${key}.webp`));
          img.src = `${key}.webp`;
        }));
      metaCache.set(key, p);
    }
    return metaCache.get(key);
  }

  /* ----- canvas mode (opt-in: giant bosses) -----
   * A huge sheet set as a CSS background can paint as nothing for a moment
   * while the browser decodes it (first use, or after it dropped the decoded
   * copy), so the boss blinks out on a sheet switch. Canvas players draw from
   * ImageBitmaps decoded before the switch: the old frame stays up until the
   * new sheet can be drawn. Bitmaps are scaled to the drawn size (at most 2x)
   * and kept in a small LRU; evicted ones are closed to free their memory. */
  const BITMAP_KEEP = 3;
  const bitmaps = new Map(); // key -> { p: Promise<source>, bytes, used, wanted }
  const held = new Map();    // key -> number of canvas players showing / awaiting it
  let useTick = 0;
  let peakBytes = 0;
  const canvasDpr = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const hold = (key, d) => { const n = (held.get(key) || 0) + d; n > 0 ? held.set(key, n) : held.delete(key); };

  /* Keep at most BITMAP_KEEP sheets: drop the least recently used one that is
   * not held by a player (nor `keep`, the one just asked for), sparing sheets
   * warmed for an upcoming play if we can. */
  function trimBitmaps(keep) {
    while (bitmaps.size > BITMAP_KEEP) {
      const free = [...bitmaps].filter(([k]) => k !== keep && !held.has(k));
      const pool = free.some(([, b]) => !b.wanted) ? free.filter(([, b]) => !b.wanted) : free;
      const pick = pool.reduce((a, e) => (!a || e[1].used < a[1].used ? e : a), null);
      if (!pick) return;
      bitmaps.delete(pick[0]);
      pick[1].p.then(src => src && src.close && src.close(), () => {});
    }
  }

  /** Decoded sheet for frames drawn w x h css px: { key, p: Promise<ImageBitmap|img> }.
   * When the sheet is bigger than needed, each frame is decoded at exactly the
   * canvas size so drawing a frame is a 1:1 copy. */
  function sheetBitmap(anim, w, h, { wanted = false } = {}) {
    const rows = Math.ceil(anim.frames / anim.columns);
    const cw = Math.round(w * canvasDpr()), ch = Math.round(h * canvasDpr());
    const shrink = ch < anim.frameHeight && cw < anim.frameWidth;
    const rw = anim.columns * (shrink ? cw : anim.frameWidth);
    const rh = rows * (shrink ? ch : anim.frameHeight);
    const key = `${anim.url}@${rw}x${rh}`;
    let b = bitmaps.get(key);
    if (b) {
      b.used = ++useTick;
      b.wanted = b.wanted || wanted;
      return { key, p: b.p };
    }
    b = { used: ++useTick, wanted, bytes: rw * rh * 4 };
    b.p = fetch(anim.url)
      .then(r => { if (!r.ok) throw new Error(`missing ${anim.url}`); return r.blob(); })
      .then(blob => createImageBitmap(blob, shrink ? { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'high' } : {}))
      .catch(() => new Promise((resolve, reject) => {
        // no createImageBitmap (or it failed): draw from a decoded <img>
        const img = new Image();
        img.onload = () => Promise.resolve(img.decode?.()).catch(() => {}).then(() => resolve(img));
        img.onerror = () => reject(new Error(`missing ${anim.url}`));
        img.src = anim.url;
      }));
    b.p.catch(() => { if (bitmaps.get(key) === b) bitmaps.delete(key); });
    bitmaps.set(key, b);
    trimBitmaps(key);
    peakBytes = Math.max(peakBytes, [...bitmaps.values()].reduce((s, e) => s + e.bytes, 0));
    return { key, p: b.p };
  }

  /* Sheets asked for before the page is shown keep the page loader
   * (js/page-loader.js) up until they have arrived. */
  function track(p, label) {
    const PL = window.PageLoader;
    return PL && !PL.revealed ? PL.track(p, `sprite ${label}`) : p;
  }

  /* opts: { height, flip, canvas } - canvas: true draws into a <canvas> from
   * pre-decoded bitmaps (see "canvas mode" above) instead of a CSS background. */
  function create(container, base, opts = {}) {
    const useCanvas = !!opts.canvas;
    const el = document.createElement(useCanvas ? 'canvas' : 'div');
    el.className = 'sprite-player';
    if (useCanvas) el.style.display = 'block';
    else el.style.backgroundRepeat = 'no-repeat';
    el.style.imageRendering = 'auto';
    if (opts.flip) el.style.transform = 'scaleX(-1)';
    container.appendChild(el);
    // willReadFrequently keeps the canvas in CPU memory: only the drawn frame
    // goes to the GPU, not a texture copy of every decoded sheet
    const ctx = useCanvas ? el.getContext('2d', { willReadFrequently: true }) : null;
    let shownKey = null; // canvas mode: bitmap on screen
    let draw = null;     // canvas mode: draw(frameIndex) for the sheet on screen
    let drawn;
    const firstDraw = new Promise(res => { drawn = res; }); // resolves once a frame is on screen

    let timer = null;
    let token = 0;
    let current = null; // name of the animation currently playing/requested

    function stop() {
      if (timer) cancelAnimationFrame(timer);
      timer = null;
    }

    /* Keep the body on the unit's spot: sheets whose character isn't centred
     * in the frame carry anchorX (0..1). The flex slot centres the element, so
     * shift it by the anchor's distance from the centre, mirrored when the
     * sprite is flipped. Uses the CSS `translate` property so it composes with
     * the facing/lean `transform` set by the battle code. */
    function applyAnchor(anim, w) {
      const ax = Number(anim.anchorX);
      if (!Number.isFinite(ax) || Math.abs(ax - 0.5) < 1e-3) { el.style.translate = ''; return; }
      const flipped = /scaleX\(\s*-1/.test(el.style.transform || '');
      const dx = (ax - 0.5) * w * (flipped ? 1 : -1);
      el.style.translate = `${dx.toFixed(1)}px 0`;
    }

    /**
     * play(name, { then, speed, onFrame(i), onHit(hitIndex, frameIndex), onEnd() })
     *  - onFrame fires once for every frame index reached, in order.
     *  - onHit fires once for each frame listed in the sheet's `hits`, at the
     *    moment that frame is shown. If a slow tick skips frames, the skipped
     *    frames' callbacks are fired (in order) before the current one.
     *  - onEnd fires once when a non-looping sheet finishes (not when it is
     *    superseded by another play()).
     */
    async function play(name, { then = null, speed = 1, onFrame = null, onHit = null, onEnd = null } = {}) {
      const my = ++token;
      current = name;
      const anim = await track(loadAnim(base, name), `${base}/${name}`);
      if (my !== token) return; // superseded by a newer play()

      const hs = Number(anim.heightScale) > 0 ? Number(anim.heightScale) : 1;
      const h = Math.round((opts.height ? opts.height * hs : anim.frameHeight));
      const s = h / anim.frameHeight;
      const w = Math.round(anim.frameWidth * s);
      const rows = Math.ceil(anim.frames / anim.columns);
      if (useCanvas) {
        // keep the current frame up until the new sheet is decoded
        const bm = sheetBitmap(anim, w, h);
        hold(bm.key, 1); // not evicted while this play waits for it
        let src = null;
        try { src = await bm.p; } catch (e) { /* sheet failed: keep the old frame */ }
        if (my !== token || !src) {
          hold(bm.key, -1);
          if (!src && my === token) current = el.dataset.anim || null;
          return;
        }
        if (shownKey) hold(shownKey, -1);
        shownKey = bm.key;
        const entry = bitmaps.get(bm.key);
        if (entry) entry.wanted = false; // shown: an ordinary LRU entry from now on
        const dpr = canvasDpr();
        const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
        if (el.width !== cw || el.height !== ch) { el.width = cw; el.height = ch; }
        const sw = src.width / anim.columns, sh = src.height / rows;
        draw = i => {
          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(src, (i % anim.columns) * sw, Math.floor(i / anim.columns) * sh, sw, sh, 0, 0, cw, ch);
          el.dataset.frame = i;
        };
      } else {
        el.style.backgroundImage = `url("${anim.url}")`;
        el.style.backgroundSize = `${anim.columns * w}px ${rows * h}px`;
      }
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.dataset.anim = name;
      applyAnchor(anim, w);

      stop();
      const frameMs = 1000 / (anim.fps * speed);
      const start = performance.now();
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const hitIdx = new Map((Array.isArray(anim.hits) ? anim.hits : []).map((f, k) => [f, k]));
      let reached = -1; // last frame index whose callbacks have fired
      let lastShown = -1;
      const safe = (fn, ...a) => { try { fn(...a); } catch (e) { console.error('[SpritePlayer] callback error', e); } };
      const fireUpTo = upTo => {
        while (reached < upTo) {
          reached++;
          if (onFrame) safe(onFrame, reached);
          if (onHit && hitIdx.has(reached)) safe(onHit, hitIdx.get(reached), reached);
        }
      };
      const show = i => {
        if (i === lastShown) return;
        lastShown = i;
        if (useCanvas) draw(i);
        else el.style.backgroundPosition = `${-(i % anim.columns) * w}px ${-Math.floor(i / anim.columns) * h}px`;
        drawn();
        applyAnchor(anim, w); // facing may have changed since the last frame
      };
      const oneShot = !anim.loop || !!then;

      return new Promise(resolve => {
        const tick = now => {
          if (my !== token) return resolve();
          // rAF can pass a timestamp from just before `start`: never show frame -1 (blank)
          let i = Math.max(0, Math.floor((now - start) / frameMs));
          if (i >= anim.frames) {
            if (!oneShot) i %= anim.frames;
            else {
              fireUpTo(anim.frames - 1);
              stop();
              if (onEnd) safe(onEnd);
              resolve();
              if (then && my === token) play(then);
              return;
            }
          }
          show(reduceMotion ? 0 : i);
          if (oneShot) fireUpTo(i);
          else if (onFrame && i !== reached) { reached = i; safe(onFrame, i); }
          timer = requestAnimationFrame(tick);
        };
        show(0);
        if (oneShot) fireUpTo(0);
        timer = requestAnimationFrame(tick);
      });
    }

    /** Metadata (frames, fps, hits, ...) of an animation, loading it if needed. */
    function meta(name) { return loadAnim(base, name); }

    /* Show one frame of the sheet on screen and hold it (e.g. a KO's last frame). */
    function showFrame(i) {
      const name = el.dataset.anim;
      if (!name) return;
      loadAnim(base, name).then(anim => {
        if (el.dataset.anim !== name) return;
        const n = Math.max(0, Math.min(anim.frames - 1, i));
        if (useCanvas) { if (draw) draw(n); return; }
        const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
        el.style.backgroundPosition = `${-(n % anim.columns) * w}px ${-Math.floor(n / anim.columns) * h}px`;
      }).catch(() => {});
    }

    /* Canvas mode: decode a sheet ahead of its play() so the switch is
     * immediate. It is spared by the LRU until it has been shown. */
    function warm(name) {
      if (!useCanvas) return loadAnim(base, name).then(() => {});
      return loadAnim(base, name).then(anim => {
        const hs = Number(anim.heightScale) > 0 ? Number(anim.heightScale) : 1;
        const h = Math.round(opts.height ? opts.height * hs : anim.frameHeight);
        return sheetBitmap(anim, Math.round(anim.frameWidth * (h / anim.frameHeight)), h, { wanted: true }).p;
      }).then(() => {}, () => {});
    }

    /* Switch to a looping animation only if it isn't already the current one,
     * so callers can request a state every frame (e.g. on pointermove)
     * without restarting the sheet from frame 0. */
    function setState(name, opts) {
      if (current === name) return Promise.resolve();
      return play(name, opts);
    }

    return {
      el, play, setState, stop, meta, showFrame, warm, firstDraw,
      get current() { return current; },
      destroy() {
        token++; current = null; stop(); el.remove();
        if (useCanvas) {
          if (shownKey) hold(shownKey, -1); // plays still waiting release their own
          shownKey = draw = null;
          el.width = el.height = 0; // let the backing store go now
        }
      },
    };
  }

  // Characters that have animated battle spritesheets, keyed by character id.
  // Each folder holds idle.webp/.json and run.webp/.json, plus optional
  // one-shot attack sheets (jutsu / ultimate) whose JSON lists hit frames, and
  // one-shot reaction sheets: 'hit' (flinch, played by battle-hit-react.js)
  // and 'ko' (knocked down; its last frame is held).
  const REGISTRY = {
    minato_2101: 'assets/sprites/minato_2101',
    naruto_2115: 'assets/sprites/naruto_2115',
    kakashi_705: 'assets/sprites/kakashi_705',
    kakashi_706: 'assets/sprites/kakashi_705', // 6★ Blazing Burst form of the same unit (maxing awakens 705 into it)
    // Kakashi Hatake "Entrusted With Hope" (5★ / 6★ / 7★) share one sprite set.
    kakashi_508: 'assets/sprites/kakashi_2091',
    kakashi_509: 'assets/sprites/kakashi_2091',
    kakashi_2091: 'assets/sprites/kakashi_2091',
    // Sasuke Uchiha "Sole Friend" (6★ / 7★): the 6★ ultimate and the 7★ secret are both Chidori.
    sasuke_2116: 'assets/sprites/sasuke_2117',
    sasuke_2117: 'assets/sprites/sasuke_2117',
    // Sakura Haruno "Back to Back" (5★ / 6★).
    sakura_2069: 'assets/sprites/sakura_2070',
    sakura_2070: 'assets/sprites/sakura_2070',
    gaara_729: 'assets/sprites/gaara_730',
    gaara_730: 'assets/sprites/gaara_730',
    tsunade_898: 'assets/sprites/tsunade_898',
    orochimaru_600: 'assets/sprites/orochimaru_600',
    might_2039: 'assets/sprites/might_2039',
    rock_475: 'assets/sprites/rock_475',
    shikamaru_2107: 'assets/sprites/shikamaru_2107',
    deidara_885: 'assets/sprites/deidara_885',
    kisame_828: 'assets/sprites/kisame_828',
    tobirama_675: 'assets/sprites/tobirama_675',
    madara_523: 'assets/sprites/madara_523',
    madara_524: 'assets/sprites/madara_524',
    madara_525: 'assets/sprites/madara_2098',
    madara_2098: 'assets/sprites/madara_2098',
    obito_2201: 'assets/sprites/obito_2201',
    hashirama_417: 'assets/sprites/hashirama_418',
    hashirama_418: 'assets/sprites/hashirama_418',
    killer_2065: 'assets/sprites/killer_2065',
    kabuto_2099: 'assets/sprites/kabuto_2099',
    nagato_2076: 'assets/sprites/nagato_2076',
    shisui_2064: 'assets/sprites/shisui_2064',
    sasori_653: 'assets/sprites/sasori_653',
    konan_690: 'assets/sprites/konan_690',
    neji_2005: 'assets/sprites/neji_2005',
    zabuza_542: 'assets/sprites/zabuza_542',
    haku_539: 'assets/sprites/haku_539',
    kushina_839: 'assets/sprites/kushina_840', // 5★ form, same Gold Chain Bonding Jutsu
    kushina_840: 'assets/sprites/kushina_840',
    hiruzen_2124: 'assets/sprites/hiruzen_2124',
    temari_875: 'assets/sprites/temari_875',
    yamato_271: 'assets/sprites/yamato_272', // 5★ form, same Wood Style: Great Forest
    sai_500: 'assets/sprites/sai_501', // 5★ form, same Super Beast Scroll
    yamato_272: 'assets/sprites/yamato_272',
    sai_501: 'assets/sprites/sai_501',
    ino_561: 'assets/sprites/ino_561',
    kakuzu_693: 'assets/sprites/kakuzu_694', // 5★ form, same False Darkness
    kankuro_2055: 'assets/sprites/kankuro_2056', // 5★ form, same Whirlwind Blade
    kakuzu_694: 'assets/sprites/kakuzu_694',
    kankuro_2056: 'assets/sprites/kankuro_2056',
    asuma_849: 'assets/sprites/asuma_849',
    izuna_2026: 'assets/sprites/izuna_2027', // 5★ form, same Fire Dragon Blade
    izuna_2027: 'assets/sprites/izuna_2027',
    darui_2130: 'assets/sprites/darui_2130',
    rin_858: 'assets/sprites/rin_858',
    tenten_795: 'assets/sprites/tenten_796', // 5★ form, same Concealed Attack
    tenten_796: 'assets/sprites/tenten_796',
    kiba_566: 'assets/sprites/kiba_567', // 5★ form, same Man-Beast Combination
    kiba_567: 'assets/sprites/kiba_567',
    indra_2111: 'assets/sprites/indra_2112', // same outfit, same Great Snake Slayer / Death Blow
    indra_2112: 'assets/sprites/indra_2112',
    choji_2040: 'assets/sprites/choji_2041', // 5★ form, same Butterfly Bomb
    kimimaro_886: 'assets/sprites/kimimaro_887', // 5★ form, same Digital Shrapnel
    ashura_2109: 'assets/sprites/ashura_2110', // 5★ form, same Like a Whirlwind
    choji_2041: 'assets/sprites/choji_2041',
    kimimaro_887: 'assets/sprites/kimimaro_887',
    ashura_2110: 'assets/sprites/ashura_2110',
    roshi_896: 'assets/sprites/roshi_897', // 5★ form, same Scorching Rocks Jutsu
    roshi_897: 'assets/sprites/roshi_897',
    masked_2103: 'assets/sprites/masked_2103',
    kurenai_2104: 'assets/sprites/kurenai_2104',
    anko_682: 'assets/sprites/anko_683', // 5★ form, same Multiple Striking Shadow Snakes
    anko_683: 'assets/sprites/anko_683',
    shizune_712: 'assets/sprites/shizune_713', // 5★ form, same Palm Sage Jutsu
    shizune_713: 'assets/sprites/shizune_713',
    jirobo_227: 'assets/sprites/jirobo_228', // 5★ form, same Earth Style: Terra Shield
    kidomaru_233: 'assets/sprites/kidomaru_234', // 5★ form, same Spiral Web
    hayate_778: 'assets/sprites/hayate_779', // 5★ form, same Leaf Style: Crescent Moon Dance
    iruka_871: 'assets/sprites/iruka_872', // 5★ form, same Perimeter Barrier Triple Layer
    tayuya_753: 'assets/sprites/tayuya_753',
    jirobo_228: 'assets/sprites/jirobo_228',
    kidomaru_234: 'assets/sprites/kidomaru_234',
    hayate_779: 'assets/sprites/hayate_779',
    karin_701: 'assets/sprites/karin_701',
    iruka_872: 'assets/sprites/iruka_872',
    shino_536: 'assets/sprites/shino_536',
    suigetsu_621: 'assets/sprites/suigetsu_622', // 5★ form, same Tri-Water Dragon Jutsu
    suigetsu_622: 'assets/sprites/suigetsu_622',
    jugo_623: 'assets/sprites/jugo_624', // 5★ form, same Jet Fist
    jugo_624: 'assets/sprites/jugo_624',
    utakata_648: 'assets/sprites/utakata_649', // 5★ form, same Bubble Jutsu Wrap
    utakata_649: 'assets/sprites/utakata_649',
    yugito_608: 'assets/sprites/yugito_609', // 5★ form, same Tailed Beast Tail
    yugito_609: 'assets/sprites/yugito_609',
    hanzo_449: 'assets/sprites/hanzo_450', // 5★ form, same Summoning Jutsu: Ibuse
    hanzo_450: 'assets/sprites/hanzo_450',
    konohamaru_346: 'assets/sprites/konohamaru_347', // 5★ form, same Burning Ash / Rasengan
    konohamaru_347: 'assets/sprites/konohamaru_347',
    fourth_466: 'assets/sprites/fourth_467', // 5★ form, same Guillotine Drop
    fourth_467: 'assets/sprites/fourth_467',
    chojuro_564: 'assets/sprites/chojuro_565', // 5★ form, same Crushing Hammer
    chojuro_366: 'assets/sprites/chojuro_565', // same outfit, same Crushing Hammer
    chojuro_367: 'assets/sprites/chojuro_565', // same outfit, same Crushing Hammer / Fragmentation
    chojuro_565: 'assets/sprites/chojuro_565',
    danzo_2034: 'assets/sprites/danzo_2035', // same art, same Great Vacuum Bullets / Izanagi
    danzo_2035: 'assets/sprites/danzo_2035',
    yagura_606: 'assets/sprites/yagura_607', // 5★ form, same Water Mortar
    yagura_464: 'assets/sprites/yagura_607', // same outfit, same Water Mortar
    yagura_465: 'assets/sprites/yagura_607', // same outfit, same Water Mortar / Rough Sea Spume
    yagura_607: 'assets/sprites/yagura_607',
    // Naruto Online sprite sets (assets/sprites/online/, from RockNGame rips)
    // Itachi Uchiha "Brotherly Pledge" / "Talent and Burden" (forms without a chibi set;
    // itachi_2094 / 2096 keep theirs and get this one as a skin, see js/skins.js)
    itachi_699: 'assets/sprites/online/itachi',
    itachi_700: 'assets/sprites/online/itachi',
    itachi_2095: 'assets/sprites/online/itachi',
    itachi_2199: 'assets/sprites/online/itachi',
    itachi_2200: 'assets/sprites/online/itachi',
    // Sasuke Uchiha, Curse Mark Level 2: "Rain of Extinction", "Parting Wings"
    sasuke_2131: 'assets/sprites/online/sasuke_cm2_rain', // own jutsu: Phoenix Flower over the targets
    sasuke_2132: 'assets/sprites/online/sasuke_cm2_rain',
    sasuke_456: 'assets/sprites/online/sasuke_cm2',
    sasuke_457: 'assets/sprites/online/sasuke_cm2',
    sasuke_458: 'assets/sprites/online/sasuke_cm2',
    // Sasuke Uchiha, Akatsuki: "World Within a Kaleidoscope"
    sasuke_343: 'assets/sprites/online/sasuke_akatsuki',
    sasuke_344: 'assets/sprites/online/sasuke_akatsuki',
    // Sasuke Uchiha, Part 2: "Soul Shrouded in Sorrow"
    sasuke_244: 'assets/sprites/online/sasuke_p2',
    sasuke_245: 'assets/sprites/online/sasuke_p2',
    // Nagato "Reunion with Hope"
    nagato_534: 'assets/sprites/online/nagato',
    nagato_535: 'assets/sprites/online/nagato',
    // Naruto Uzumaki, Kurama Link: "Pervading Feelings", "Proof of Bonds"
    naruto_800: 'assets/sprites/online/naruto_kurama',
    naruto_801: 'assets/sprites/online/naruto_kurama',
    naruto_400: 'assets/sprites/online/naruto_kurama',
    naruto_401: 'assets/sprites/online/naruto_kurama_401', // own ultimate: thrown Rasenshuriken
    // Naruto Uzumaki, 1 Tailed Cloak: "Roaring Tears", "Power of Determination"
    naruto_2137: 'assets/sprites/online/naruto_v1',
    naruto_2138: 'assets/sprites/online/naruto_v1',
    naruto_453: 'assets/sprites/online/naruto_v1',
    naruto_454: 'assets/sprites/online/naruto_v1',
    naruto_455: 'assets/sprites/online/naruto_v1',
    // Kisame Hoshigaki "Body and Blade as One" (Samehada Fusion); 828 keeps its set, skin in js/skins.js
    kisame_826: 'assets/sprites/online/kisame',
    kisame_827: 'assets/sprites/online/kisame',
    // Shisui Uchiha, every version; shisui_2064 keeps its set, skin in js/skins.js
    shisui_218: 'assets/sprites/online/shisui',
    shisui_396: 'assets/sprites/online/shisui_phoenix', // jutsu: Phoenix Flower
    shisui_397: 'assets/sprites/online/shisui_phoenix', // jutsu: Phoenix Flower
    shisui_576: 'assets/sprites/online/shisui',
    shisui_577: 'assets/sprites/online/shisui',
    shisui_578: 'assets/sprites/online/shisui_phoenix', // jutsu: Phoenix Flower
    shisui_714: 'assets/sprites/online/shisui',
    shisui_715: 'assets/sprites/online/shisui',
    shisui_806: 'assets/sprites/online/shisui',
    shisui_2062: 'assets/sprites/online/shisui',
    shisui_2063: 'assets/sprites/online/shisui',
    // <produce:registry> generated by tools/sprites/produce/produce.py register
    hidan_321: 'assets/sprites/hidan_321', // Hidan "Worshiping a Mad God" 5★
    hidan_322: 'assets/sprites/hidan_321', // Hidan "Worshiping a Mad God" 6★
    hinata_813: 'assets/sprites/hinata_813', // Hinata Hyuga "Beyond the Ceaseless" 6★
    hinata_811: 'assets/sprites/hinata_811', // Hinata Hyuga "Beyond the Ceaseless" 5★
    hinata_812: 'assets/sprites/hinata_811', // Hinata Hyuga "Beyond the Ceaseless" 6★
    itachi_2031: 'assets/sprites/itachi_2031', // Itachi Uchiha "The Promised Day" 5★
    itachi_2032: 'assets/sprites/itachi_2031', // Itachi Uchiha "The Promised Day" 6★
    itachi_2096: 'assets/sprites/itachi_2096', // Itachi Uchiha "Talent and Burden" 6★
    itachi_2199: 'assets/sprites/itachi_2096', // Itachi Uchiha "Talent and Burden" 6★ Blazing Awakened
    itachi_2200: 'assets/sprites/itachi_2096', // Itachi Uchiha "Talent and Burden" 6★ Blazing Awakened
    itachi_2094: 'assets/sprites/itachi_2094', // Itachi Uchiha "Talent and Burden" 5★
    itachi_2095: 'assets/sprites/itachi_2094', // Itachi Uchiha "Talent and Burden" 6★
    jiraiya_9001: 'assets/sprites/jiraiya_9001', // Jiraiya "Gallant Sage of Mount Myoboku" 7★
    kaguya_9003: 'assets/sprites/kaguya_9003', // Kaguya Otsutsuki "Progenitor of All Chakra" 7★
    pain_9004: 'assets/sprites/pain_9004', // Pain "God of Amegakure" 7★
    gojo_9005: 'assets/sprites/gojo_9005', // Gojo Satoru "The Strongest" 7★
    sukuna_9006: 'assets/sprites/sukuna_9006', // Ryomen Sukuna "King of Curses" 7★
    sukuna_9007: 'assets/sprites/sukuna_9007', // Ryomen Sukuna "Heian Era" 7★
    // </produce:registry>
  };

  // Variant folders that only carry some sheets of their own (e.g. a 5★ form
  // whose jutsu differs from the 6★ form's): every other sheet is read from
  // the family's main folder. { variantFolder: { from, own: [sheet names] } }
  const SHARED = {
    'assets/sprites/online/sasuke_cm2_rain': { from: 'assets/sprites/online/sasuke_cm2', own: ["jutsu"] },
    'assets/sprites/online/naruto_kurama_401': { from: 'assets/sprites/online/naruto_kurama', own: ["ultimate", "ultimate_rsfly", "ultimate_rsboom"] },
    'assets/sprites/online/shisui_phoenix': { from: 'assets/sprites/online/shisui', own: ["jutsu"] },
    // <produce:shared> generated by tools/sprites/produce/produce.py register
    'assets/sprites/hinata_811': { from: 'assets/sprites/hinata_813', own: ["jutsu"] },
    'assets/sprites/itachi_2094': { from: 'assets/sprites/itachi_2096', own: ["jutsu"] },
    'assets/sprites/madara_524': { from: 'assets/sprites/madara_2098', own: ["jutsu", "jutsu_fx"] },
    'assets/sprites/madara_523': { from: 'assets/sprites/madara_2098', own: ["jutsu", "jutsu_fx"] },
    // </produce:shared>
  };

  window.SpritePlayer = {
    create,
    /* preload(base, name, { background: true }) warms a sheet without
     * holding the page loader (hit / ko / attack sheets fetched ahead). */
    preload: (base, name, { background = false } = {}) =>
      background ? loadAnim(base, name) : track(loadAnim(base, name), `${base}/${name}`),
    has: charId => !!REGISTRY[charId],
    /* Decoded canvas-mode sheets alive now (and the most there ever were). */
    bitmapStats: () => {
      const mb = n => Math.round(n / 1048576);
      return { count: bitmaps.size, mb: mb([...bitmaps.values()].reduce((s, e) => s + e.bytes, 0)), peakMb: mb(peakBytes),
        sheets: [...bitmaps.keys()].map(k => k.replace(/^.*\//, '')) };
    },
    /* Folder to animate a unit from: its equipped skin (js/skins.js) when it
     * has one, else its own folder. { skin: false } always gives the base
     * folder (e.g. enemy copies of a unit the player has skinned). */
    pathFor: (charId, { skin = true } = {}) => {
      const base = REGISTRY[charId] || null;
      if (!base || !skin) return base;
      try { return window.Skins?.folderFor?.(charId) || base; } catch (_) { return base; }
    },
    basePathFor: charId => REGISTRY[charId] || null,
    /* Every charId with a sprite set (read-only copy of REGISTRY's keys). */
    registeredIds: () => Object.keys(REGISTRY),
    /* Register a folder that carries only the sheets listed in `own`; every
     * other sheet (effect layers, extra jutsu parts...) is read from `from`.
     * Used by js/skins.js for skin folders. */
    registerShared(folder, from, own) {
      if (!folder || !from || folder === from) return;
      SHARED[folder] = { from, own: Array.isArray(own) ? own.slice() : [] };
    },
  };
  window.Skins?.attach?.(window.SpritePlayer); // js/skins.js loaded first
})();
