// Equipment tab of the Shinobi Record (js/character-gear-tab.js): 8 ninja
// tool slots in two rows of 4, their totals and the selected slot. The Status
// tab no longer lists equipment; the jutsu slots stay on the Ninjutsu tab.
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, collectErrors, waitForLoader } = require('../helpers');

test('equipment tab: eight tool slots, totals and the selected tool', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('e-naruto', 'naruto_2115', 80, '7S')],
    blazing_tools_v1: { seq: 2, starter: true, bag: {
      h: { id: 'h', toolId: 'hokage_hat', stars: 6, stats: [['hp', 900], ['atkPct', 6], ['def', 40], ['res', 4], ['spd', 3], ['critRate', 5]] },
      s: { id: 's', toolId: 'shuriken', stars: 2, stats: [['spd', 1]] },
    }, equip: { 'e-naruto': ['h', null, null, null, null, null, null, 's'] } },
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
  // The art steps aside so the tools can use the whole panel
  await expect(page.locator('#char-modal')).toHaveClass(/is-gear-view/);
  await expect(page.locator('#char-modal .char-modal-art')).toBeHidden();
  await expect(page.locator('#tab-gear .ntl-title')).toHaveText(/Ninja Tool Equip/i);
  await expect(page.locator('#tab-gear .ntl-slot')).toHaveCount(8);
  await expect(page.locator('#tab-gear .ntl-slot.is-empty')).toHaveCount(6);
  await expect(page.locator('#tab-gear .ntl-slot[data-slot="0"] img')).toHaveAttribute('src', 'assets/gear/sets/hokage_helmet.webp');
  // two rows of four
  const tops = await page.locator('#tab-gear .ntl-slot').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops.slice(0, 4)).size).toBe(1);
  expect(new Set(tops.slice(4)).size).toBe(1);
  expect(tops[4]).toBeGreaterThan(tops[0]);

  // Totals include both tools' SPD
  const spd = await page.evaluate(() => window.Gear.totalFor('e-naruto').spd);
  expect(spd).toBe(4);
  await expect(page.locator('#tab-gear .eqp-totals')).toContainText('+4');

  // Selecting a tool shows its slot stats
  await page.locator('#tab-gear .ntl-slot[data-slot="0"]').click();
  await expect(page.locator('#tab-gear .ntl-slot[data-slot="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tab-gear .eqp-detail')).toContainText("Hokage's Hat");
  await expect(page.locator('#tab-gear .eqp-detail')).toContainText('6 slots');

  // Other tabs bring the art back
  await page.locator('.char-tabs .tab-btn[data-tab="status"]').click();
  await expect(page.locator('#char-modal')).not.toHaveClass(/is-gear-view/);
  await expect(page.locator('#char-modal .char-modal-art')).toBeVisible();

  errors.assertClean('equipment tab');
});
