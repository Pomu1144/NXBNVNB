// Equipment tab of the Shinobi Record (js/character-gear-tab.js): the six gear
// pieces on an orbit, their totals and the selected piece. The Status tab no
// longer lists equipment; the jutsu slots stay on the Ninjutsu tab.
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, collectErrors, waitForLoader } = require('../helpers');

const SLOTS = ['helmet', 'weapon', 'armor', 'scroll', 'necklace', 'sandals'];

test('equipment tab: six gear pieces, totals and the selected piece', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('e-naruto', 'naruto_2115', 80, '7S')],
    blazing_gear_v2: { seq: 2, starter: true, bag: {
      h: { id: 'h', slot: 'helmet', rarity: 3, level: 9, main: 'hp', subs: [['atkPct', 3]] },
      s: { id: 's', slot: 'sandals', rarity: 5, level: 15, main: 'spd', subs: [] },
    }, equip: { 'e-naruto': { helmet: 'h', sandals: 's' } } },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  await page.locator('.char-grid .char-slot[data-uid="e-naruto"]').click();
  await expect(page.locator('#char-modal')).toHaveClass(/open/);

  // Status: stats only
  await expect(page.locator('#tab-status .cx-stats')).toBeVisible();
  await expect(page.locator('#tab-status .cx-equip, #tab-status .jutsu-slot, #tab-status .cx-gear')).toHaveCount(0);

  // Tabs end with Equipment, after Passives
  await expect(page.locator('.char-tabs .tab-btn')).toHaveText(['Status', 'Awakening', 'Ninjutsu', 'Passives', 'Equipment']);

  // Ninjutsu keeps the jutsu / ultimate slots
  await page.locator('.char-tabs .tab-btn[data-tab="skills"]').click();
  await expect(page.locator('#tab-skills .jutsu-slot')).toHaveCount(3);
  await expect(page.locator('#tab-skills .ultimate-slot')).toBeVisible();

  await page.locator('.char-tabs .tab-btn[data-tab="gear"]').click();
  // The art steps aside so the orbit can use the whole panel
  await expect(page.locator('#char-modal')).toHaveClass(/is-gear-view/);
  await expect(page.locator('#char-modal .char-modal-art')).toBeHidden();
  await expect(page.locator('#tab-gear .eqp-ring')).toBeVisible();
  const pieces = page.locator('#tab-gear .eqp-piece');
  await expect(pieces).toHaveCount(6);
  for (const s of SLOTS) await expect(page.locator(`#tab-gear .eqp-piece[data-slot="${s}"]`)).toBeVisible();
  await expect(page.locator('#tab-gear .eqp-piece[data-slot="helmet"] .eqp-lv')).toHaveText('+9');
  await expect(page.locator('#tab-gear .eqp-piece[data-slot="weapon"] .eqp-lv')).toHaveText('Empty');
  await expect(page.locator('#tab-gear .eqp-piece[data-slot="helmet"] img')).toHaveAttribute('src', 'assets/gear/art/orange_helmet.webp');
  await expect(page.locator('#tab-gear .eqp-piece[data-slot="sandals"] img')).toHaveAttribute('src', 'assets/gear/art/red_sandals.webp');

  // Totals include the sandals' SPD
  const spd = await page.evaluate(() => window.Gear.totalFor('e-naruto').spd);
  expect(spd).toBe(14);
  await expect(page.locator('#tab-gear .eqp-totals')).toContainText('+14');

  // Selecting a piece shows its main stat and substats
  await page.locator('#tab-gear .eqp-piece[data-slot="sandals"]').click();
  await expect(page.locator('#tab-gear .eqp-piece[data-slot="sandals"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tab-gear .eqp-detail')).toContainText('Super Kage War Boots');
  await expect(page.locator('#tab-gear .eqp-detail')).toContainText('+15 / 15');
  await expect(page.locator('#tab-gear .eqp-detail .eqp-main')).toContainText('SPD');

  // Other tabs bring the art back
  await page.locator('.char-tabs .tab-btn[data-tab="status"]').click();
  await expect(page.locator('#char-modal')).not.toHaveClass(/is-gear-view/);
  await expect(page.locator('#char-modal .char-modal-art')).toBeVisible();

  errors.assertClean('equipment tab');
});
