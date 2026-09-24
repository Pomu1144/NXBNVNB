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

  function loadAnim(base, name) {
    const sh = SHARED[base];
    if (sh && !sh.own.includes(name)) base = sh.from;
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

  function create(container, base, opts = {}) {
    const el = document.createElement('div');
    el.className = 'sprite-player';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.imageRendering = 'auto';
    if (opts.flip) el.style.transform = 'scaleX(-1)';
    container.appendChild(el);

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
      const anim = await loadAnim(base, name);
      if (my !== token) return; // superseded by a newer play()

      const hs = Number(anim.heightScale) > 0 ? Number(anim.heightScale) : 1;
      const h = Math.round((opts.height ? opts.height * hs : anim.frameHeight));
      const s = h / anim.frameHeight;
      const w = Math.round(anim.frameWidth * s);
      const rows = Math.ceil(anim.frames / anim.columns);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.backgroundImage = `url("${anim.url}")`;
      el.style.backgroundSize = `${anim.columns * w}px ${rows * h}px`;
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
        const col = i % anim.columns;
        const row = Math.floor(i / anim.columns);
        el.style.backgroundPosition = `${-col * w}px ${-row * h}px`;
        applyAnchor(anim, w); // facing may have changed since the last frame
      };
      const oneShot = !anim.loop || !!then;

      return new Promise(resolve => {
        const tick = now => {
          if (my !== token) return resolve();
          let i = Math.floor((now - start) / frameMs);
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

    /* Switch to a looping animation only if it isn't already the current one,
     * so callers can request a state every frame (e.g. on pointermove)
     * without restarting the sheet from frame 0. */
    function setState(name, opts) {
      if (current === name) return Promise.resolve();
      return play(name, opts);
    }

    return {
      el, play, setState, stop, meta,
      get current() { return current; },
      destroy() { token++; current = null; stop(); el.remove(); },
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
    // <produce:registry> generated by tools/sprites/produce/produce.py register
    hidan_321: 'assets/sprites/hidan_321', // Hidan "Worshiping a Mad God" 5★
    hidan_322: 'assets/sprites/hidan_321', // Hidan "Worshiping a Mad God" 6★
    hinata_813: 'assets/sprites/hinata_813', // Hinata Hyuga "Beyond the Ceaseless" 6★
    hinata_811: 'assets/sprites/hinata_811', // Hinata Hyuga "Beyond the Ceaseless" 5★
    hinata_812: 'assets/sprites/hinata_811', // Hinata Hyuga "Beyond the Ceaseless" 6★
    itachi_2096: 'assets/sprites/itachi_2096', // Itachi Uchiha "Talent and Burden" 6★
    itachi_2199: 'assets/sprites/itachi_2096', // Itachi Uchiha "Talent and Burden" 7★
    itachi_2200: 'assets/sprites/itachi_2096', // Itachi Uchiha "Talent and Burden" 7★
    itachi_2094: 'assets/sprites/itachi_2094', // Itachi Uchiha "Talent and Burden" 5★
    itachi_2095: 'assets/sprites/itachi_2094', // Itachi Uchiha "Talent and Burden" 6★
    // </produce:registry>
  };

  // Variant folders that only carry some sheets of their own (e.g. a 5★ form
  // whose jutsu differs from the 6★ form's): every other sheet is read from
  // the family's main folder. { variantFolder: { from, own: [sheet names] } }
  const SHARED = {
    // <produce:shared> generated by tools/sprites/produce/produce.py register
    'assets/sprites/hinata_811': { from: 'assets/sprites/hinata_813', own: ["jutsu"] },
    'assets/sprites/itachi_2094': { from: 'assets/sprites/itachi_2096', own: ["jutsu"] },
    // </produce:shared>
  };

  window.SpritePlayer = {
    create,
    preload: loadAnim,
    has: charId => !!REGISTRY[charId],
    pathFor: charId => REGISTRY[charId] || null,
  };
})();
