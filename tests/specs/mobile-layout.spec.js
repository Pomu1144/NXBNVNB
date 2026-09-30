// 7. Mobile layout guard (phone project): village.html in short landscape.
const { test, expect } = require('@playwright/test');
const { seedSave, collectErrors, waitForLoader, dismissLoginBonus } = require('../helpers');

// Safari with and without its bars (932x375 / 932x340) and full-screen
// home-screen apps on 430- and 390-tall iPhones.
const SIZES = [[932, 375], [932, 340], [932, 430], [844, 390]];

test.describe('village layout on landscape phones', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
  });

  for (const [width, height] of SIZES) {
    test(`${width}x${height}: right banner panel and bottom icon bar fit and do not overlap`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width, height });
      await seedSave(page);
      await page.goto('/village.html');
      await waitForLoader(page);
      await dismissLoginBonus(page);
      await page.waitForTimeout(500); // late layout (fonts, images)

      const vp = { width, height };
      const box = async (sel) => {
        const loc = page.locator(sel).first();
        await expect(loc, `${sel} visible`).toBeVisible();
        return loc.boundingBox();
      };
      const inside = (b, name) => {
        const eps = 0.5;
        expect(b.x, `${name} left edge`).toBeGreaterThanOrEqual(-eps);
        expect(b.y, `${name} top edge`).toBeGreaterThanOrEqual(-eps);
        expect(b.x + b.width, `${name} right edge`).toBeLessThanOrEqual(vp.width + eps);
        expect(b.y + b.height, `${name} bottom edge`).toBeLessThanOrEqual(vp.height + eps);
      };
      const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

      const panel = await box('.right-banner-panel');
      const bar = await box('.bottom-icon-bar');
      inside(panel, 'right banner panel');
      inside(bar, 'bottom icon bar');

      // Every banner button and every bottom icon is on screen too.
      const buttons = await page.locator('.right-banner-panel .banner-button').evaluateAll((els) => els
        .filter((e) => getComputedStyle(e).display !== 'none')
        .map((e) => { const r = e.getBoundingClientRect(); return { name: e.className, x: r.x, y: r.y, width: r.width, height: r.height }; }));
      const icons = await page.locator('.bottom-icon-bar .bottom-icon').evaluateAll((els) => els
        .filter((e) => getComputedStyle(e).display !== 'none')
        .map((e) => { const r = e.getBoundingClientRect(); return { name: e.dataset.action, x: r.x, y: r.y, width: r.width, height: r.height }; }));
      expect(buttons.length).toBeGreaterThan(0);
      expect(icons.length).toBeGreaterThan(0);
      for (const b of buttons) inside(b, `banner ${b.name}`);
      for (const i of icons) inside(i, `icon ${i.name}`);

      // No banner button sits on top of a bottom icon.
      const clashes = [];
      for (const b of buttons) for (const i of icons) if (overlap(b, i) > 1) clashes.push(`${b.name} x ${i.name}`);
      expect(clashes).toEqual([]);
      // The containers themselves do not overlap.
      expect(overlap(panel, bar), 'panel/bar overlap area (px²)').toBeLessThanOrEqual(1);

      // No horizontal page scroll.
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollW).toBeLessThanOrEqual(vp.width + 1);

      errors.assertClean(`village ${height}`);
    });
  }
});

test.describe('summon page on landscape phones', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
  });

  for (const [width, height] of SIZES) {
    test(`${width}x${height}: title, tabs and banner list are clear of each other and the bottom bar`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width, height });
      await seedSave(page);
      await page.goto('/summon.html');
      await waitForLoader(page);
      await page.waitForTimeout(500);
      const rect = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().toJSON());
      const title = await rect('.summon-title');
      const tabs = await rect('.summon-tabs');
      expect(tabs.left, 'tabs start after the title plate').toBeGreaterThanOrEqual(title.right - 1);
      const rail = await rect('.banner-rail-col');
      const bar = await rect('.bottom-bar');
      expect(rail.height, 'banner list visible').toBeGreaterThan(80);
      expect(rail.bottom, 'banner list above the bottom bar').toBeLessThanOrEqual(bar.top + 1);
      errors.assertClean();
    });
  }
});
