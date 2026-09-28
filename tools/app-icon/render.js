// tools/app-icon/render.js — renders the home-screen / favicon PNGs in
// assets/icons/app/ from character art (Naruto Blazing-style close-up).
//
//   python3 -m http.server 8765        # from the repo root
//   node tools/app-icon/render.js      # needs playwright + chromium
//
// Variants:
//   full      apple-touch-icon (iOS rounds the corners itself), manifest "any"
//   maskable  Android adaptive icon: zoomed out so face + hand sign stay
//             inside the 80% safe circle
//   face      favicon: tight crop on the face
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const HOST = process.env.ICON_HOST || 'http://localhost:8765/';
const OUT = path.join(__dirname, '../../assets/icons/app/');
// Naruto "Full-Out Battle" 7★ (the grin + hand sign from the Blazing icon).
// cx / cy: art pixel placed at the icon centre, in the 1200px art.
const ART = { src: 'assets/characters/naruto_2115/full_7S.webp', n: 1200, cx: 640, cy: 470 };
const VIEW = { // art px shown across the icon, and extra centre offset (art px)
  full: { span: 440, dx: 0, dy: 10 },
  maskable: { span: 600, dx: 0, dy: 0 },
  face: { span: 250, dx: -20, dy: -80 },
};

const FILES = [
  ['apple-touch-icon.png', 180, 'full'],
  ['icon-192.png', 192, 'full'],
  ['icon-512.png', 512, 'full'],
  ['icon-maskable-512.png', 512, 'maskable'],
  ['favicon-32.png', 32, 'face'],
];

function html(S, variant) {
  const v = VIEW[variant];
  const k = S / v.span, size = ART.n * k;
  const x = S / 2 - (ART.cx + v.dx) * k, y = S / 2 - (ART.cy + v.dy) * k;
  return `<!doctype html><html><head><style>
    html, body { margin: 0; }
    .ic { position: relative; width: ${S}px; height: ${S}px; overflow: hidden; background: #f3b21c; }
    .art { position: absolute; inset: 0; background: url('${HOST}${ART.src}') no-repeat ${x}px ${y}px / ${size}px ${size}px;
           filter: saturate(1.15) contrast(1.05); }
    /* warm gold burst at the edges (like the Blazing icon), face untouched */
    .glow { position: absolute; inset: 0; mix-blend-mode: screen;
            background: radial-gradient(circle at 40% 38%, rgba(255,190,40,0) 42%, rgba(255,190,40,.55) 78%, rgba(255,215,90,.85)); }
  </style></head><body><div class="ic"><div class="art"></div><div class="glow"></div></div></body></html>`;
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const [file, S, variant] of FILES) {
    const page = await browser.newPage({ viewport: { width: S, height: S } });
    await page.goto(HOST + 'manifest.json'); // same origin as the art
    await page.setContent(html(S, variant), { waitUntil: 'networkidle' });
    await page.screenshot({ path: OUT + file });
    await page.close();
    console.log('wrote', file, `${S}x${S}`, variant);
  }
  await browser.close();
})();
