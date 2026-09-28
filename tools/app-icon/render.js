// tools/app-icon/render.js — renders the home-screen / favicon PNGs in
// assets/icons/app/ from character art + the LEGENDS wordmark (Bebas Neue).
//
//   python3 -m http.server 8765        # from the repo root
//   node tools/app-icon/render.js      # needs playwright + chromium
//
// Variants:
//   full      apple-touch-icon (iOS rounds the corners itself), manifest "any"
//   maskable  Android adaptive icon: wordmark kept inside the 80% safe circle
//   face      favicon: art only (text is unreadable at 32px)
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const HOST = process.env.ICON_HOST || 'http://localhost:8765/';
const OUT = path.join(__dirname, '../../assets/icons/app/');
// Six Paths Sage Mode Naruto ("Endowed Power" 7★): face position in the 1200px art.
const ART = { src: 'assets/characters/naruto_2090/full_7S.webp', n: 1200, fx: 537, fy: 485 };

const FILES = [
  ['apple-touch-icon.png', 180, 'full'],
  ['icon-192.png', 192, 'full'],
  ['icon-512.png', 512, 'full'],
  ['icon-maskable-512.png', 512, 'maskable'],
  ['favicon-32.png', 32, 'face'],
];

function html(S, variant) {
  const span = variant === 'face' ? 300 : variant === 'maskable' ? 620 : 560; // art px across the icon
  const faceY = variant === 'face' ? 0.5 : variant === 'maskable' ? 0.38 : 0.36;
  const k = S / span, size = ART.n * k;
  const x = S / 2 - ART.fx * k, y = S * faceY - ART.fy * k;
  const m = variant === 'maskable';
  const word = variant === 'face' ? '' : `
    <div class="word" style="bottom:${S * (m ? 0.17 : 0.07)}px">
      <span class="k" style="font-size:${S * (m ? 0.068 : 0.085)}px">Ultimate Ninja</span>
      <span class="w" style="font-size:${S * (m ? 0.2 : 0.25)}px">LEGENDS</span>
    </div>`;
  return `<!doctype html><html><head><style>
    @font-face { font-family: Bebas; src: url('${HOST}assets/fonts/bebas-neue-400.woff2'); }
    html, body { margin: 0; }
    .ic { position: relative; width: ${S}px; height: ${S}px; overflow: hidden; background: #0a0606; }
    .art { position: absolute; inset: 0; background: url('${HOST}${ART.src}') no-repeat ${x}px ${y}px / ${size}px ${size}px; }
    .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) ${m ? 38 : 45}%, rgba(8,4,4,.85) ${m ? 70 : 78}%, rgba(8,4,4,.95)); }
    .word { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; line-height: .9; }
    .k { font-family: Bebas; letter-spacing: .2em; color: #f6e7b8; text-shadow: 0 1px 2px #000; }
    .w { font-family: Bebas; letter-spacing: .02em; background: linear-gradient(#fff4c4, #f1c65a 55%, #a8741e);
         -webkit-background-clip: text; background-clip: text; color: transparent;
         filter: drop-shadow(0 ${S * 0.008}px 0 #3a1a00) drop-shadow(0 0 ${S * 0.02}px rgba(0,0,0,.9)); }
  </style></head><body><div class="ic"><div class="art"></div>${variant === 'face' ? '' : '<div class="shade"></div>'}${word}</div></body></html>`;
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const [file, S, variant] of FILES) {
    const page = await browser.newPage({ viewport: { width: S, height: S } });
    await page.goto(HOST + 'manifest.json'); // same origin, so the web font loads
    await page.setContent(html(S, variant), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT + file });
    await page.close();
    console.log('wrote', file, `${S}x${S}`, variant);
  }
  await browser.close();
})();
