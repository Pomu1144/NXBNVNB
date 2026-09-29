// Shared helpers for the Playwright specs.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const REPO_ROOT = path.resolve(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));

// ---------------------------------------------------------------------------
// Save seeding
// ---------------------------------------------------------------------------

/** Keys the session gate (js/session-gate.js) and tutorial (js/tutorial.js) check. */
const SESSION_KEYS = {
  'blazing-login-complete': 'true',
  'blazing-login-username': 'TestNinja',
  'blazing_tutorial_v1': JSON.stringify({ status: 'done', updated: 0 }),
};

/**
 * Seed localStorage before any page script runs. Values are written only on
 * the first document load of the test (guarded by a marker key), so the game
 * can change them afterwards and those changes survive reloads/navigation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, any>} [extra] more keys; non-strings are JSON-encoded
 */
async function seedSave(page, extra = {}) {
  const entries = { ...SESSION_KEYS };
  for (const [k, v] of Object.entries(extra)) entries[k] = typeof v === 'string' ? v : JSON.stringify(v);
  await page.addInitScript((data) => {
    try {
      if (localStorage.getItem('__pw_seeded') === '1') return;
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
      localStorage.setItem('__pw_seeded', '1');
    } catch (_) { /* about:blank / opaque origin */ }
  }, entries);
}

/** A deterministic inventory entry as js/character_inv.js stores it. */
function invEntry(uid, charId, level = 80, tierCode = '6S') {
  return { uid, charId, level, tierCode, dupeUnlocks: 0, cost: 50, luck: 50 };
}

/** Mark every story scene as seen so js/story-dialogue.js never opens. */
function allStorySeen() {
  const ids = [];
  for (const m of readJSON('data/missions.json')) for (const p of ['before', 'boss', 'after']) ids.push(`${m.id}:${p}`);
  return ids;
}

// ---------------------------------------------------------------------------
// Error collection
// ---------------------------------------------------------------------------

/**
 * Console errors that are not bugs in the game code. Each entry documents why.
 * Keep this list short: anything added here can hide a real regression.
 */
const BENIGN_CONSOLE = [
  // Missing optional art/audio (the server 404s are reported separately by
  // the browser as "Failed to load resource"). Assets are large binaries that
  // are not all in the repo; broken images degrade to silhouettes by design.
  /Failed to load resource: the server responded with a status of 404/,
  // Headless Chromium has no audio output device / blocks autoplay.
  /AudioContext|autoplay|play\(\) failed|NotAllowedError|The play\(\) request was interrupted|howler/i,
  // Service workers are blocked in the test config on purpose.
  /ServiceWorker|service worker/i,
];

/**
 * Same-origin script/style/data 404s that are already reported. Checked
 * statically (and expected to fail) in specs/data-integrity.spec.js.
 *  - characters.html:322 loads js/character-evolution.js, which is not in the
 *    repo (nothing references a CharacterEvolution global either).
 *  - battle.html (and "battle copy.html") link css/battle-result-professional.css,
 *    which is not in the repo.
 */
const KNOWN_MISSING_CODE = ['/js/character-evolution.js', '/css/battle-result-professional.css'];

/**
 * Collect uncaught page errors and console.error calls for a page.
 * Call `assertClean()` at the end of a test.
 */
function collectErrors(page, { ignore = [] } = {}) {
  const pageErrors = [];
  const consoleErrors = [];
  const allow = [...BENIGN_CONSOLE, ...ignore];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}\n${(err.stack || '').split('\n').slice(1, 4).join('\n')}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (allow.some((re) => re.test(text))) {
      if (process.env.PW_LOG_IGNORED) console.log(`[ignored console.error] ${page.url()}: ${text}`);
      return;
    }
    const loc = msg.location();
    consoleErrors.push(`${text}${loc && loc.url ? `  (${loc.url.replace(/^https?:\/\/[^/]+\//, '')}:${loc.lineNumber})` : ''}`);
  });
  // Same-origin HTTP errors. A missing script/style/data file is a real bug;
  // a missing image/audio/video only degrades (silhouette fallback) and is
  // reported as an annotation instead.
  const missingCode = [];
  const missingMedia = [];
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const url = res.url();
    let u;
    try { u = new URL(url); } catch (_) { return; }
    const pageOrigin = (() => { try { return new URL(page.url()).origin; } catch (_) { return null; } })();
    if (pageOrigin && u.origin !== pageOrigin) return;
    const rel = decodeURIComponent(u.pathname);
    if (KNOWN_MISSING_CODE.includes(rel)) return;
    if (/\.(m?js|css|json|html)$/i.test(rel)) missingCode.push(`${res.status()} ${rel}`);
    else missingMedia.push(`${res.status()} ${rel}`);
  });
  return {
    pageErrors,
    consoleErrors,
    missingCode,
    missingMedia,
    assertClean(label = '') {
      if (missingMedia.length) {
        test.info().annotations.push({ type: 'missing media', description: [...new Set(missingMedia)].join(', ') });
      }
      expect(pageErrors, `${label} uncaught page errors`).toEqual([]);
      expect(consoleErrors, `${label} console errors`).toEqual([]);
      expect([...new Set(missingCode)], `${label} missing scripts/styles/data`).toEqual([]);
    },
  };
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** Wait until the page loader (js/page-loader.js) has lifted, if the page has one. */
async function waitForLoader(page, timeout = 30_000) {
  await page.waitForFunction(() => !window.PageLoader || window.PageLoader.revealed !== false, null, { timeout }).catch(() => {});
}

/**
 * Wait for village.html to finish its init (it sets body[data-login-bonus]
 * = "done" after processing the login bonus) and dismiss the daily
 * login-bonus reveal (js/dashboard-mailbox.js #reward-reveal, OK button)
 * if it is up.
 */
async function dismissLoginBonus(page) {
  await page.waitForFunction(() => document.body && document.body.dataset.loginBonus === 'done', null, { timeout: 30_000 });
  const ok = page.locator('#reward-reveal .rr-ok');
  if (await ok.count()) {
    await ok.click();
    await expect(page.locator('#reward-reveal')).toHaveCount(0);
  }
}

/** Pick a non-story, non-boss mission and one of its ranks. */
function pickPlainMission(preferred = ['m_001', 'm_031', 'growth_ryo']) {
  const missions = readJSON('data/missions.json');
  const ok = (m) => m && !/^Shinobi Chronicles/i.test(m.category || '') && !m.giant && !m.requires
    && m.difficulties && Object.keys(m.difficulties).length;
  const m = preferred.map((id) => missions.find((x) => x.id === id)).find(ok) || missions.find(ok);
  if (!m) throw new Error('No plain mission found in data/missions.json');
  const rank = Object.keys(m.difficulties)[0];
  return { mission: m, rank };
}

module.exports = {
  REPO_ROOT,
  readJSON,
  SESSION_KEYS,
  KNOWN_MISSING_CODE,
  seedSave,
  invEntry,
  allStorySeen,
  collectErrors,
  waitForLoader,
  dismissLoginBonus,
  pickPlainMission,
};
