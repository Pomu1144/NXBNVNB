/* Ink home: idle motion for the hero cut-out (assets/ui/ink/hero.webp).
 *
 * A WebGL canvas takes the hero image's place and redraws it every frame
 * with a small per-pixel offset, so the art itself moves: the hair sways,
 * the headband tails and the cloak's hem ripple, and the figure breathes.
 * Which parts move, and how much, comes from hero_motion.png (quarter size):
 *   R hair, G headband tails, B cloak, A breathing (0 = still).
 * If WebGL or the mask is unavailable the still image simply stays.
 */
(function () {
  'use strict';

  const MASK = 'assets/ui/ink/hero_motion.png';
  const SRC_W = 1153, SRC_H = 1400; // hero.webp, the space the motion is tuned in

  const VS = `
    attribute vec2 p;
    varying vec2 uv;
    void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

  const FS = `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D hero, mask;
    uniform float t;
    const vec2 S = vec2(${SRC_W}.0, ${SRC_H}.0);
    void main() {
      vec4 m = texture2D(mask, uv);
      vec2 px = uv * S;
      vec2 o = vec2(0.0);
      // hair: a slow sideways sway, a beat later toward the tips
      float hp = t * 2.1 + uv.y * 7.0 + uv.x * 3.0;
      o += m.r * vec2(6.0 * sin(hp), 2.0 * sin(hp * 1.3 + 0.7));
      // headband tails: a wave running out from the knot
      float dk = distance(px, vec2(640.0, 180.0)) / 560.0;
      float tw = t * 2.6 - dk * 5.5;
      o += m.g * vec2(9.0 * sin(tw), 13.0 * sin(tw + 1.2));
      // cloak hem: a wave running down and out to the left
      float rc = ((800.0 - px.x) * 0.85 + (px.y - 560.0) * 0.55) / 600.0;
      float cw = t * 1.7 - rc * 4.0;
      o += m.b * vec2(8.0 * sin(cw), 5.0 * sin(cw + 0.8));
      // breathing: the figure lifts a little about the hips, once every ~4 s
      float br = 0.5 - 0.5 * cos(t * 1.55);
      o.y -= m.a * (1250.0 - px.y) * 0.006 * br;
      gl_FragColor = texture2D(hero, (px - o) / S);
    }`;

  function shader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }

  function texture(gl, unit, img, premultiply) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, premultiply ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    // non-power-of-two sizes: no mipmaps, clamp
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  const loaded = img => (img.complete && img.naturalWidth ? Promise.resolve(img)
    : new Promise((ok, fail) => { img.addEventListener('load', () => ok(img), { once: true }); img.addEventListener('error', fail, { once: true }); }));

  function start(img) {
    const mask = new Image();
    mask.src = MASK;
    // let the image's slide-in entrance finish before the canvas takes over
    const entered = Promise.all((img.getAnimations?.() || []).map(a => a.finished.catch(() => {})));
    Promise.all([loaded(img), loaded(mask), entered]).then(() => {
      const cv = document.createElement('canvas');
      cv.className = 'ink-l ink-l-hero ink-l-hero-gl';
      cv.setAttribute('aria-hidden', 'true');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) return;
      const prog = gl.createProgram();
      gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      texture(gl, 0, img, true);
      texture(gl, 1, mask, false);
      gl.uniform1i(gl.getUniformLocation(prog, 'hero'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'mask'), 1);
      const uT = gl.getUniformLocation(prog, 't');
      gl.clearColor(0, 0, 0, 0);

      const draw = t => {
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uT, t);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      draw(0);
      img.after(cv);
      img.style.visibility = 'hidden';

      // ~30 fps is plenty for this; skip frames while the home is hidden
      let last = 0;
      const t0 = performance.now();
      const tick = now => {
        if (!cv.isConnected) return;
        requestAnimationFrame(tick);
        if (now - last < 33 || document.hidden || !cv.getClientRects().length) return;
        last = now;
        draw((now - t0) / 1000);
      };
      requestAnimationFrame(tick);
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); cv.remove(); img.style.visibility = ''; });
    }).catch(err => { console.warn('[InkHero] idle motion unavailable, showing the still', err); img.style.visibility = ''; });
  }

  function init() {
    const img = document.querySelector('.ink-l-hero:not(.ink-l-hero-gl)');
    if (img) start(img);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
