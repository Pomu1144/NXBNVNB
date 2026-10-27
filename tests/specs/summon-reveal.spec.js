// 6. Summon reveal: a 10-pull deals face-down papers with their tier art
// (assets/ui/summon/scroll_{2..7}.webp), Skip turns them all over, and the
// results panel comes up. Screenshots of both stages ride on the report.
const { test, expect } = require('@playwright/test');
const { seedSave, collectErrors, waitForLoader } = require('../helpers');

test('multi summon shows the paper reveal and the results', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_resources_v1: { ryo: 0, ninja_pearls: 500, shinobites: 0, granny_coin: 0 },
    blazing_inventory_v2: [],
  });
  await page.goto('/summon.html');
  await waitForLoader(page);
  await page.waitForFunction(() => window.SummonUI && window.SummonUI.elements.multiBtn);
  await page.locator('#btn-multi').click();

  // Skip the summon video (js/summon/summon-animation.js)
  const skipVideo = page.locator('#summon-skip');
  await skipVideo.waitFor({ state: 'visible', timeout: 10_000 }).then(() => skipVideo.click(), () => {});

  // Face-down papers: all ten dealt, each showing its decoded tier art
  const slots = page.locator('#result-grid .sr-slot');
  await expect(slots).toHaveCount(10, { timeout: 15_000 });
  await expect(page.locator('.summon-modal.sr-dealt')).toBeAttached();
  await expect(page.locator('#result-grid .sr-paper.has-art')).toHaveCount(10);
  const art = await page.$$eval('#result-grid .sr-paper-art', imgs =>
    imgs.map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight })));
  for (const a of art) {
    expect(a.src).toMatch(/assets\/ui\/summon\/scroll_[2-7]\.webp$/);
    expect([a.w, a.h]).toEqual([600, 767]);
  }
  await page.waitForTimeout(1_200); // let the deal stagger finish
  await testInfo.attach('papers', { body: await page.screenshot(), contentType: 'image/png' });

  // Skip turns every paper over, then the results panel and Continue show
  await page.locator('#sr-skip').click();
  await expect(page.locator('#result-grid .sr-slot.is-open')).toHaveCount(10);
  await expect(page.locator('.summon-modal.sr-revealed')).toBeAttached({ timeout: 5_000 });
  await expect(page.locator('#result-grid .result-card')).toHaveCount(10);
  await expect(page.locator('#btn-continue')).toBeVisible();
  await page.waitForTimeout(1_500); // cards finish fading in
  await testInfo.attach('results', { body: await page.screenshot(), contentType: 'image/png' });

  errors.assertClean('summon reveal');
});

// One paper per star tier, 7★ down to 2★, dealt through the game's own
// displayResults, so every paper style can be compared side by side.
test('every paper tier deals with its own art', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await page.goto('/summon.html');
  await waitForLoader(page);
  await page.waitForFunction(() => window.SummonUI && window.SummonReveal && window.loadCharactersData);

  const tiers = await page.evaluate(async () => {
    const all = await window.loadCharactersData();
    const results = [7, 6, 5, 4, 3, 2].map(r => ({
      character: all.find(c => Number(c.rarity) === r),
      summonData: { rarity: 'gold', isFeatured: false },
      isNew: false,
    }));
    window.SummonUI.displayResults(results);
    return results.map(r => Number(r.character.rarity));
  });
  expect(tiers).toEqual([7, 6, 5, 4, 3, 2]);

  for (const t of tiers) {
    const img = page.locator(`#result-grid .sr-slot.tier-${t} .sr-paper.has-art .sr-paper-art`);
    await expect(img).toHaveAttribute('src', new RegExp(`scroll_${t}\\.webp$`));
  }
  await expect(page.locator('.summon-modal.sr-dealt')).toBeAttached();
  await page.waitForTimeout(1_200);
  await testInfo.attach('paper-tiers', { body: await page.screenshot(), contentType: 'image/png' });
  errors.assertClean('paper tiers');
});
