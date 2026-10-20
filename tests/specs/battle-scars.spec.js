// Battlefield marks (js/battle/battle-scars.js): techniques that land leave a
// mark under each unit they hit; the field is cleared when the next stage loads.
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, allStorySeen, collectErrors, waitForLoader } = require('../helpers');

const TEAM = [
  ['t-naruto', 'naruto_2115', '7S'],
  ['t-minato', 'minato_2101', '6S'],
  ['t-kakashi', 'kakashi_705', '6S'],
  ['t-sasuke', 'sasuke_2117', '7S'],
];

async function openBattle(page) {
  const slots = {};
  TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
  await seedSave(page, {
    blazing_inventory_v2: TEAM.map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier)),
    blazing_teams_v1: { 1: slots },
    currentMissionId: 'm_001',
    currentDifficulty: 'C',
    blazing_story_seen_v1: allStorySeen(),
  });
  await page.goto('/battle.html');
  await waitForLoader(page, 45_000);
  await page.waitForFunction(() => {
    const bm = window.BattleManager;
    return bm && bm.enemyTeam && bm.enemyTeam.length > 0 && window.BattleCombat && window.BattleCombat.__scars;
  }, null, { timeout: 45_000 });
}

test.describe('battlefield marks', () => {
  test.describe.configure({ timeout: 120_000 });

  test('techniques mark the field by nature; the next stage clears it', async ({ page }) => {
    const errors = collectErrors(page);
    await openBattle(page);

    const natures = await page.evaluate(() => {
      const n = (t) => window.BattleScars.natureOf(t, 'jutsu');
      return {
        fire: n('Fire Style: Great Fireball Technique'), lightning: n('Lightning Blade: Twin Lightning Shiver'),
        wind: n('Tailed Beast Planetary Rasen Shuriken'), wood: n('Wood Style: Deep Forest Emergence'),
        sand: n('Sand Coffin'), explosion: n('Tailed Beast Bomb'), plain: n('5x attack toward 1 enemy'),
      };
    });
    expect(natures).toEqual({ fire: 'fire', lightning: 'lightning', wind: 'wind', wood: 'wood', sand: 'sand', explosion: 'explosion', plain: 'cracks' });

    // Naruto's jutsu (Rasen Shuriken) marks every enemy it hits
    const marked = await page.evaluate(async () => {
      const bm = window.BattleManager, C = window.BattleCombat;
      const u = bm.activeTeam.find((x) => x.charId === 'naruto_2115');
      const t = bm.enemyTeam.find((e) => e.stats.hp > 0);
      u.chakra = 20;
      await new Promise((res) => { C.performJutsu(u, t, bm, res); setTimeout(res, 8000); });
      return [...document.querySelectorAll('#battle-scene .battle-scars .battle-scar')].map((e) => e.className);
    });
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every((c) => c.includes('is-wind'))).toBe(true);

    // Off: clears the field and stops new marks
    await page.evaluate(() => window.BattleScars.setEnabled(false));
    expect(await page.evaluate(() => window.BattleScars.count())).toBe(0);
    expect(await page.evaluate(() => window.BattleScars.stamp('fire', 50, 50))).toBeNull();
    await page.evaluate(() => window.BattleScars.setEnabled(true));

    // The next stage clears the field
    await page.evaluate(() => { window.BattleScars.stamp('fire', 40, 60); window.BattleScars.stamp('earth', 60, 60); });
    expect(await page.evaluate(() => window.BattleScars.count())).toBeGreaterThanOrEqual(2);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const stage = await page.evaluate(() => {
        const bm = window.BattleManager;
        if (bm.currentStageIndex > 0) return bm.currentStageIndex;
        (bm.enemyTeam || []).filter((e) => e.stats.hp > 0).forEach((e) => { e.stats.hp = 0; });
        bm.checkBattleEnd();
        return 0;
      });
      if (stage > 0) break;
      await page.waitForTimeout(500);
    }
    expect(await page.evaluate(() => window.BattleManager.currentStageIndex)).toBe(1);
    expect(await page.evaluate(() => window.BattleScars.count())).toBe(0);

    errors.assertClean('battle scars');
  });
});
