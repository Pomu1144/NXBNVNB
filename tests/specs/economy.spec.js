// 5. Economy: shop purchase and summon spend the right currency and grant items.
const { test, expect } = require('@playwright/test');
const { seedSave, collectErrors, waitForLoader, readJSON } = require('../helpers');

const wallet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));
const inventory = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_inventory_v2') || '[]'));

const ramen = readJSON('data/shop.json').shop.ramen;
// ID_ALIASES in js/resources.js: legacy ramen_<n>star ids are heart ramen.
const canonical = (id) => ({ pearls: 'ninja_pearls' }[id] || id.replace(/^ramen_(\d)star$/, 'ramen_heart_$1star'));

test.describe('shop', () => {
  // One ryo-priced and one pearl-priced ramen (legacy "pearls" cost key).
  const cases = [ramen.find((r) => r.cost.ryo), ramen.find((r) => r.cost.pearls || r.cost.ninja_pearls)].filter(Boolean);

  for (const item of cases) {
    test(`buying ${item.id} deducts ${Object.keys(item.cost)[0]} and adds the ramen`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, {
        blazing_resources_v1: { ryo: 100000, ninja_pearls: 100, shinobites: 0, granny_coin: 0, ramen_heart_1star: 0, ramen_heart_5star: 0 },
      });
      await page.goto('/shop.html');
      await waitForLoader(page);
      const before = await wallet(page);

      const card = page.locator('#ramen-grid .shop-item').filter({ hasText: item.name });
      await expect(card).toHaveCount(1);
      await card.locator('.btn-buy').click();
      await expect(page.locator('#purchase-modal')).not.toHaveClass(/hidden/);
      await page.locator('#qty-plus').click(); // buy 2
      await page.locator('#btn-confirm-purchase').click();
      await expect(page.locator('#success-modal')).not.toHaveClass(/hidden/);

      const after = await wallet(page);
      const [costKey, price] = Object.entries(item.cost)[0];
      const cur = canonical(costKey);
      expect(after[cur]).toBe(before[cur] - price * 2);
      const got = canonical(item.id);
      expect(after[got]).toBe((before[got] || 0) + 2);
      // Legacy id never lands in the save.
      if (got !== item.id) expect(after[item.id]).toBeUndefined();

      // Not enough money: purchase refused, nothing changes.
      await page.locator('#btn-close-success').click();
      await page.evaluate(([c]) => window.Resources.set(c, 0), [cur]);
      page.once('dialog', (d) => d.accept());
      await card.locator('.btn-buy').click();
      await page.locator('#btn-confirm-purchase').click();
      await page.waitForTimeout(300);
      const broke = await wallet(page);
      expect(broke[cur]).toBe(0);
      expect(broke[got]).toBe(after[got]);

      errors.assertClean('shop');
    });
  }
});

test.describe('summon', () => {
  const charIds = new Set(readJSON('data/characters.json').map((c) => c.id));

  for (const kind of ['single', 'multi']) {
    test(`${kind} summon deducts pearls and adds characters`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, {
        blazing_resources_v1: { ryo: 0, ninja_pearls: 500, shinobites: 0, granny_coin: 0 },
        blazing_inventory_v2: [],
      });
      await page.goto('/summon.html');
      await waitForLoader(page);
      await page.waitForFunction(() => window.SummonUI && window.SummonUI.elements.singleBtn && window.FibonacciSummonEngine);
      const cost = await page.evaluate((k) => window.SummonUI.costs[k], kind);
      expect(cost).toBeGreaterThan(0);
      const before = await wallet(page);
      const invBefore = await inventory(page);

      await page.locator(kind === 'single' ? '#btn-single' : '#btn-multi').click();

      const expected = kind === 'single' ? 1 : 10;
      await expect.poll(async () => (await inventory(page)).length, { timeout: 20_000 }).toBe(invBefore.length + expected);
      const after = await wallet(page);
      expect(after.ninja_pearls).toBe(before.ninja_pearls - cost);
      const added = (await inventory(page)).slice(invBefore.length);
      for (const inst of added) {
        expect(charIds.has(inst.charId), `summoned ${inst.charId} exists in characters.json`).toBe(true);
        expect(inst.uid).toBeTruthy();
      }
      // Skip the summon video (js/summon/summon-animation.js), then the reveal shows.
      const skip = page.locator('#summon-skip');
      if (await skip.isVisible()) await skip.click();
      await expect(page.locator('#result-grid .result-card')).toHaveCount(expected, { timeout: 15_000 });

      errors.assertClean(`summon ${kind}`);
    });
  }

  test('summon without enough pearls does nothing', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { blazing_resources_v1: { ryo: 0, ninja_pearls: 0, shinobites: 0, granny_coin: 0 }, blazing_inventory_v2: [] });
    await page.goto('/summon.html');
    await waitForLoader(page);
    await page.waitForFunction(() => window.SummonUI && window.SummonUI.elements.singleBtn);
    // The buttons are disabled when the player can't pay (summon-ui.js).
    await expect(page.locator('#btn-single')).toBeDisabled();
    await expect(page.locator('#btn-multi')).toBeDisabled();
    // Even a forced call is refused.
    await page.evaluate(() => window.SummonUI.handleSingleSummon());
    await page.waitForTimeout(300);
    expect((await inventory(page)).length).toBe(0);
    expect((await wallet(page)).ninja_pearls).toBe(0);
    errors.assertClean('summon broke');
  });
});
