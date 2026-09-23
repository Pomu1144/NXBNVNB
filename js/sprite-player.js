/* Spritesheet player for character animations.
 *
 *   const p = SpritePlayer.create(containerEl, 'assets/sprites/naruto_666', { height: 180 });
 *   await p.play('idle');                 // loops
 *   await p.play('attack', { then: 'idle' }); // plays once, then returns to idle
 *
 * Each animation lives at <base>/<name>.webp + <name>.json, as produced by
 * tools/sprites/build_spritesheet.py. Frames are shown by moving the
 * background-position of one element, so there is a single decoded image per
 * animation and no per-frame DOM work.
 */
(function () {
  const metaCache = new Map();

  function loadAnim(base, name) {
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

    function stop() {
      if (timer) cancelAnimationFrame(timer);
      timer = null;
    }

    async function play(name, { then = null, speed = 1 } = {}) {
      const my = ++token;
      const anim = await loadAnim(base, name);
      if (my !== token) return; // superseded by a newer play() call

      const h = opts.height || anim.frameHeight;
      const s = h / anim.frameHeight;
      const w = Math.round(anim.frameWidth * s);
      const rows = Math.ceil(anim.frames / anim.columns);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.backgroundImage = `url("${anim.url}")`;
      el.style.backgroundSize = `${anim.columns * w}px ${rows * h}px`;

      stop();
      const frameMs = 1000 / (anim.fps * speed);
      const start = performance.now();
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      return new Promise(resolve => {
        const tick = now => {
          if (my !== token) return resolve();
          let i = Math.floor((now - start) / frameMs);
          if (i >= anim.frames) {
            if (anim.loop && !then) i %= anim.frames;
            else {
              stop();
              resolve();
              if (then) play(then);
              return;
            }
          }
          if (reduceMotion) i = 0;
          const col = i % anim.columns;
          const row = Math.floor(i / anim.columns);
          el.style.backgroundPosition = `${-col * w}px ${-row * h}px`;
          timer = requestAnimationFrame(tick);
        };
        timer = requestAnimationFrame(tick);
      });
    }

    return { el, play, stop, destroy() { token++; stop(); el.remove(); } };
  }

  // Characters that have animated battle spritesheets, keyed by character id.
  // Each folder holds idle.webp/.json and run.webp/.json.
  const REGISTRY = {
    minato_2101: 'assets/sprites/minato_2101',
  };

  window.SpritePlayer = {
    create,
    preload: loadAnim,
    has: charId => !!REGISTRY[charId],
    pathFor: charId => REGISTRY[charId] || null,
  };
})();
