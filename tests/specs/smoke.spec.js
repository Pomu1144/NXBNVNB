// 1. Smoke: every player-reachable page loads with zero page errors.
const { test, expect } = require('@playwright/test');
const { seedSave, collectErrors, waitForLoader, dismissLoginBonus } = require('../helpers');

const PAGES = [
  'village', 'missions', 'characters', 'summon', 'fusion', 'shop', 'arena',
  'ninja-road', 'teams', 'inventory', 'resources', 'tools', 'settings',
];

// index.html is the login screen: a fresh visitor stays there, a logged-in
// player is forwarded to the village.
test('index.html (fresh visitor) shows the login screen without errors', async ({ page }) => {
  const errors = collectErrors(page);
  const res = await page.goto('/index.html', { waitUntil: 'load' });
  expect(res && res.ok()).toBeTruthy();
  await waitForLoader(page);
  await page.waitForTimeout(1_000);
  expect(new URL(page.url()).pathname).toBe('/index.html');
  await expect(page.locator('#login-overlay')).toBeAttached();
  errors.assertClean('index.html');
});

test('index.html (logged in) forwards to the village without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await page.goto('/index.html');
  await page.waitForURL(/village\.html$/, { timeout: 20_000 });
  await dismissLoginBonus(page);
  errors.assertClean('index.html -> village.html');
});

// Developer / demo pages: loaded too, but failures there only annotate.
const DEV_PAGES = ['battle copy', 'chakra-holder-demo', 'sprites-preview'];

for (const name of PAGES) {
  test(`${name}.html loads without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page);
    const res = await page.goto(`/${name}.html`, { waitUntil: 'load' });
    expect(res && res.ok(), `HTTP status for ${name}.html`).toBeTruthy();
    await waitForLoader(page);
    if (name === 'village') await dismissLoginBonus(page);
    // Let async init (fetches, timers) settle.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1_000);
    // The session gate must not have bounced a logged-in player elsewhere.
    expect(new URL(page.url()).pathname).toBe(`/${name}.html`);
    errors.assertClean(`${name}.html`);
  });
}

test.describe('dev/demo pages (non-blocking)', () => {
  for (const name of DEV_PAGES) {
    test(`${name}.html (non-blocking)`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page);
      await page.goto(`/${encodeURIComponent(name)}.html`, { waitUntil: 'load' });
      await page.waitForTimeout(1_500);
      const problems = [...errors.pageErrors, ...errors.consoleErrors];
      if (problems.length) {
        test.info().annotations.push({ type: 'non-blocking', description: `${problems.length} error(s): ${problems.slice(0, 3).join(' | ')}` });
      }
    });
  }
});

// The error collector itself must catch what it is meant to catch.
test('error collector self-check', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await page.goto('/settings.html');
  await page.evaluate(() => {
    console.error('boom from console');
    setTimeout(() => { throw new Error('boom uncaught'); }, 0);
    fetch('data/__does_not_exist__.json').catch(() => {});
  });
  await page.waitForTimeout(500);
  expect(errors.pageErrors.join('\n')).toContain('boom uncaught');
  expect(errors.consoleErrors.join('\n')).toContain('boom from console');
  expect(errors.missingCode.join('\n')).toContain('__does_not_exist__.json');
});
