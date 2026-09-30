// 8. Village home characters (js/character-vignette.js): one or two busts
// standing between the featured banner and the menu panel.
const { test, expect } = require('@playwright/test');
const { seedSave, collectErrors, waitForLoader, dismissLoginBonus } = require('../helpers');

const KEY = 'blazing_home_character_v1';

async function openVillage(page, saved) {
  await seedSave(page, saved === undefined ? {} : { [KEY]: saved });
  await page.goto('/village.html');
  await waitForLoader(page);
  await dismissLoginBonus(page);
  await page.waitForTimeout(500); // late layout (fonts, images)
}

const rect = (loc) => loc.evaluate((e) => e.getBoundingClientRect().toJSON());

/** Both busts stand left of the menu panel and show well above the bottom bar. */
async function expectPairClear(page) {
  const imgs = page.locator('.home-char:not(.is-leaving) .home-char-img');
  await expect(imgs).toHaveCount(2);
  const panel = await rect(page.locator('.right-banner-panel').first());
  const bar = await rect(page.locator('.bottom-icon-bar').first());
  for (let i = 0; i < 2; i++) {
    const r = await rect(imgs.nth(i));
    expect(r.right, `bust ${i} clear of the menu panel`).toBeLessThanOrEqual(panel.left + 1);
    expect(r.left, `bust ${i} on screen`).toBeGreaterThanOrEqual(-1);
    // head and chest above the bar (the waist sinks behind it by design)
    expect(bar.top - r.top, `bust ${i} shows above the bottom bar`).toBeGreaterThan(Math.min(140, r.height * 0.45));
  }
}

test('old single-id save still loads one character', async ({ page }) => {
  const errors = collectErrors(page);
  await openVillage(page, 'kakashi_797');
  await expect(page.locator('.home-char:not(.is-leaving)')).toHaveCount(1);
  await expect(page.locator('.home-char[data-slot="0"]')).toHaveAttribute('data-char-id', 'kakashi_797');
  await expect(page.locator('.character-vignette-container')).not.toHaveClass(/is-duo/);
  errors.assertClean();
});

test('pick a second character, tap both, clear slot 2; the choice persists', async ({ page }) => {
  const errors = collectErrors(page);
  await openVillage(page);
  await expect(page.locator('.home-char:not(.is-leaving)')).toHaveCount(1);

  await page.locator('.home-char-switch').click();
  const picker = page.locator('.home-char-picker');
  await expect(picker).toBeVisible();
  await picker.locator('.home-char-slot-pick[data-slot="1"]').click();
  await picker.locator('.home-char-option[data-id="itachi_211"]').click();
  await expect(picker.locator('.home-char-slot-pick[data-slot="1"]')).toContainText('Itachi');
  await picker.locator('.home-char-slot-pick[data-slot="0"]').click();
  await picker.locator('.home-char-option[data-id="naruto_2133"]').click();
  await picker.locator('.home-char-picker-close').click();
  await expect(picker).toHaveCount(0);

  await expect(page.locator('.character-vignette-container')).toHaveClass(/is-duo/);
  await expect(page.locator('.home-char[data-slot="0"]:not(.is-leaving)')).toHaveAttribute('data-char-id', 'naruto_2133');
  await expect(page.locator('.home-char[data-slot="1"]:not(.is-leaving)')).toHaveAttribute('data-char-id', 'itachi_211');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('["naruto_2133","itachi_211"]');
  await page.waitForTimeout(500);
  await expectPairClear(page);

  // taps react on both characters
  for (const slot of ['0', '1']) {
    const ch = page.locator(`.home-char[data-slot="${slot}"]:not(.is-leaving)`);
    await ch.locator('.home-char-body').click({ force: true });
    await expect(ch).toHaveClass(/is-poked/);
  }

  // survives a reload
  await page.reload();
  await waitForLoader(page);
  await expect(page.locator('.home-char[data-slot="1"]:not(.is-leaving)')).toHaveAttribute('data-char-id', 'itachi_211');

  // clear slot 2
  await page.locator('.home-char-switch').click();
  await page.locator('.home-char-slot-clear').click();
  await expect(page.locator('.home-char-slot-pick[data-slot="1"]')).toContainText('Empty');
  await page.locator('.home-char-picker-close').click();
  await expect(page.locator('.character-vignette-container')).not.toHaveClass(/is-duo/);
  await expect(page.locator('.home-char:not(.is-leaving)')).toHaveCount(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('naruto_2133');
  errors.assertClean();
});

test.describe('two characters on landscape phones', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
  });
  for (const [width, height] of [[932, 375], [932, 340], [932, 430], [844, 390]]) {
    test(`${width}x${height}: both busts clear of the menu panel and the bottom bar`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width, height });
      await openVillage(page, '["minato_2101","jiraiya_2077"]');
      await expectPairClear(page);
      errors.assertClean();
    });
  }
});
