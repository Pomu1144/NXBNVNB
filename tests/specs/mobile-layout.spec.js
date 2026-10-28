// 7. Mobile layout guard (phone project): village.html in short landscape.
// The village and summon guards cover the Classic layout, which the game no
// longer offers (Ink only); they pin it with pinStyle.
const { test, expect } = require('@playwright/test');
const { seedSave, pinStyle, invEntry, collectErrors, waitForLoader, dismissLoginBonus } = require('../helpers');

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
      await pinStyle(page, 'classic');
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
      await pinStyle(page, 'classic');
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

// Character sheet on a landscape phone: quick taps must not double-tap zoom
// the page (iPhone Safari would push Close off screen), and the Ink Close /
// back keys near the top edge keep a 44px touch target.
test.describe('character sheet on landscape phones', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
  });

  for (const style of ['ink', 'classic']) {
    test(`${style}: no double-tap zoom in the sheet, Close is easy to hit`, async ({ page }) => {
      const errors = collectErrors(page);
      if (style !== 'ink') await pinStyle(page, style);
      await seedSave(page, {
        blazing_ui_theme_v1: style,
        blazing_inventory_v2: [invEntry('u1', 'naruto_2115', 80, '7S')],
      });
      await page.goto('/characters.html');
      await waitForLoader(page);
      await page.locator('.char-slot').first().tap();
      await expect(page.locator('#char-modal.open')).toBeVisible();

      // every element allows pan/pinch but not double-tap zoom
      const zoomable = await page.$$eval('#char-modal, #char-modal *', els =>
        els.filter(e => !['manipulation', 'none', 'pan-x', 'pan-y', 'pan-x pan-y'].includes(getComputedStyle(e).touchAction)).length);
      expect(zoomable, 'sheet elements still double-tap zoomable').toBe(0);

      // touch target height of a control: how far around its centre taps still land on it
      const tapHeight = (sel) => page.$eval(sel, e => {
        const r = e.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const on = (y) => { const t = document.elementFromPoint(cx, y); return !!t && (t === e || e.contains(t)); };
        let up = 0, dn = 0;
        while (up < 40 && on(cy - up - 1)) up++;
        while (dn < 40 && on(cy + dn + 1)) dn++;
        return up + dn + 1;
      });
      expect(await tapHeight('#char-modal-close')).toBeGreaterThanOrEqual(style === 'ink' ? 44 : 30);
      if (style === 'ink') expect(await tapHeight('.ink-dossier-back')).toBeGreaterThanOrEqual(44);

      await page.locator('#char-modal-close').tap();
      await expect(page.locator('#char-modal.open')).toHaveCount(0);
      errors.assertClean(`characters sheet (${style})`);
    });
  }
});
