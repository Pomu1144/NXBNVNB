// 6. Save compatibility: an "old" save converts on load without errors.
const { test, expect } = require('@playwright/test');
const { seedSave, collectErrors, waitForLoader, dismissLoginBonus } = require('../helpers');

const OLD_RESOURCES = {
  ryo: 1234,
  pearls: 7,                 // ID_ALIASES -> ninja_pearls
  ramen_5star: 3,            // ID_ALIASES -> ramen_heart_5star
  ramen_heart_5star: 1,
  ramen_1star: 2,            // -> ramen_heart_1star
  scroll_basic: 10,          // LEGACY_CONVERT -> book_<el>_1, split over 5 elements
  awakening_stone_3: 5,      // LEGACY_CONVERT -> book_<el>_2
  scroll_4star: 5,           // alias -> awakening_stone_4 -> book_<el>_3
};

// Pre-tierCode inventory entries ("stars") without dupeUnlocks.
const OLD_INVENTORY = [
  { uid: 'old-1', charId: 'naruto_001', level: 10, stars: 3 },
  { uid: 'old-2', charId: 'kakashi_705', level: 50, stars: 6 },
];

for (const pageName of ['inventory', 'characters', 'village']) {
  test(`old save loads and converts on ${pageName}.html`, async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, {
      blazing_resources_v1: OLD_RESOURCES,
      blazing_inventory_v2: OLD_INVENTORY,
      blazing_teams_v1: { 1: { 'front-1': { uid: 'old-2', charId: 'kakashi_705' } } },
    });
    await page.goto(`/${pageName}.html`);
    await waitForLoader(page);
    await page.waitForFunction(() => window.Resources);
    // inventory.html has no character inventory (js/character_inv.js); the
    // migration then runs on the next page that has it.
    const hasChars = await page.evaluate(() => !!window.InventoryChar);

    const save = await page.evaluate(() => ({
      res: JSON.parse(localStorage.getItem('blazing_resources_v1')),
      inv: JSON.parse(localStorage.getItem('blazing_inventory_v2')),
      api: {
        ramen5: window.Resources.get('ramen_5star'),
        ramenHeart5: window.Resources.get('ramen_heart_5star'),
        pearls: window.Resources.get('ninja_pearls'),
      },
    }));

    // Aliases credited to the canonical id and removed.
    for (const legacy of ['pearls', 'ramen_5star', 'ramen_1star', 'scroll_4star', 'scroll_basic', 'awakening_stone_3', 'awakening_stone_4']) {
      expect(save.res, `legacy key ${legacy} removed`).not.toHaveProperty(legacy);
    }
    expect(save.res.ramen_heart_5star).toBeGreaterThanOrEqual(4);
    expect(save.res.ramen_heart_1star).toBeGreaterThanOrEqual(2);
    if (pageName !== 'village') {
      expect(save.res.ramen_heart_5star).toBe(4);
      expect(save.res.ramen_heart_1star).toBe(2);
    }
    if (pageName === 'village') expect(save.res.ninja_pearls).toBeGreaterThanOrEqual(7);
    else expect(save.res.ninja_pearls).toBe(7);
    // village.html may pay today's login bonus on top.
    if (pageName === 'village') expect(save.res.ryo).toBeGreaterThanOrEqual(1234);
    else expect(save.res.ryo).toBe(1234);
    // Reading through the legacy id still works (normalizeId).
    expect(save.api.ramen5).toBe(save.res.ramen_heart_5star);
    expect(save.api.ramenHeart5).toBe(save.res.ramen_heart_5star);
    expect(save.api.pearls).toBe(save.res.ninja_pearls);

    // Retired materials split evenly over the five elements.
    const sum = (rarity) => ['heart', 'skill', 'body', 'bravery', 'wisdom'].reduce((n, el) => n + (save.res[`book_${el}_${rarity}`] || 0), 0);
    // (village.html may add today's login-bonus items on top, hence >= there.)
    const atLeast = pageName === 'village';
    for (const [rarity, n] of [[1, 10], [2, 5], [3, 5]]) {
      if (atLeast) expect(sum(rarity), `book ★${rarity} total`).toBeGreaterThanOrEqual(n);
      else expect(sum(rarity), `book ★${rarity} total`).toBe(n);
    }

    // Inventory migration: stars -> tierCode, dupeUnlocks added.
    if (hasChars) {
      const byUid = Object.fromEntries(save.inv.map((i) => [i.uid, i]));
      expect(byUid['old-1']).toMatchObject({ charId: 'naruto_001', tierCode: '3S', dupeUnlocks: 0 });
      expect(byUid['old-2']).toMatchObject({ charId: 'kakashi_705', tierCode: '6S', dupeUnlocks: 0 });
    }

    if (pageName === 'village') await dismissLoginBonus(page);
    await page.waitForTimeout(500);
    errors.assertClean(`${pageName} (old save)`);
  });
}
