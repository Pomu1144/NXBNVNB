// Interface style (js/ui-theme.js): Ink is the default and the only style
// Settings offers; a saved Classic / Glass choice loads as Ink.
const { test, expect } = require('@playwright/test');
const { seedSave, collectErrors, waitForLoader } = require('../helpers');

const style = (page) => page.evaluate(() => [
  document.documentElement.dataset.style, document.documentElement.dataset.ui, document.documentElement.dataset.skin,
]);

test('ink by default; old classic / glass saves load as ink; settings offers ink only', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await page.goto('/settings.html');
  await waitForLoader(page);
  expect(await style(page)).toEqual(['ink', 'glass', 'ink']);
  await expect(page.locator('[data-ui-style]')).toHaveCount(1);
  await expect(page.locator('[data-ui-style="ink"]')).toHaveAttribute('aria-checked', 'true');

  for (const old of ['classic', 'glass']) {
    await page.evaluate((v) => localStorage.setItem('blazing_ui_theme_v1', v), old);
    await page.reload();
    await waitForLoader(page);
    expect(await style(page)).toEqual(['ink', 'glass', 'ink']);
    expect(await page.evaluate(() => { window.UITheme.set('classic'); return window.UITheme.get(); })).toBe('ink');
  }
  errors.assertClean('ui style');
});
