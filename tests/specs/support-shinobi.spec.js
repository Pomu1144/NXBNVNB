// Support shinobi (js/support-shinobi.js): pick a borrowed unit on the
// prebattle screen, it fights in front-4, earns no EXP, and the result screen
// offers a friend request and spends the pick.
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

const TEAM = [
  ['t-naruto', 'naruto_2115', '7S'],
  ['t-minato', 'minato_2101', '6S'],
  ['t-kakashi', 'kakashi_705', '6S'],
  ['t-sasuke', 'sasuke_2117', '7S'],
];
const { mission, rank } = pickPlainMission();

test.describe('support shinobi', () => {
  test.describe.configure({ timeout: 120_000 });

  test('pick a support, it fights in front-4, then add it as a friend', async ({ page }) => {
    const errors = collectErrors(page);
    const slots = {};
    TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
    await seedSave(page, {
      blazing_inventory_v2: TEAM.map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier)),
      blazing_teams_v1: { 1: slots },
      currentMissionId: mission.id,
      currentDifficulty: rank,
      blazing_story_seen_v1: allStorySeen(),
    });

    // Prebattle: the roster opens and a pick shows on the button.
    await page.goto('/teams.html?mode=prebattle');
    await waitForLoader(page);
    const btn = page.locator('#btn-support');
    await expect(btn).toBeVisible();
    await btn.click();
    const rows = page.locator('.ss-sheet .ss-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBe(6);
    const unitName = (await rows.first().locator('.ss-unit').textContent()).trim();
    await rows.first().click();
    await expect(page.locator('.ss-sheet')).toHaveCount(0);
    await expect(btn).toContainText(unitName);
    const pick = await page.evaluate(() => JSON.parse(localStorage.getItem('blazing_support_pick_v1')));
    expect(pick.missionId).toBe(String(mission.id));
    expect(pick.rank).toBe(rank);

    // Battle: the borrowed unit replaces front-4.
    await page.goto('/battle.html');
    await waitForLoader(page, 45_000);
    await page.waitForFunction(() => {
      const bm = window.BattleManager;
      return bm && bm.activeTeam && bm.activeTeam.length > 0 && bm.enemyTeam && bm.enemyTeam.length > 0;
    }, null, { timeout: 45_000 });
    const team = await page.evaluate(() => window.BattleManager.activeTeam.map((u) => ({ charId: u.charId, guest: !!u.isGuest, hp: u.stats.hp })));
    expect(team.length).toBe(4);
    expect(team.slice(0, 3).map((u) => u.charId)).toEqual(TEAM.slice(0, 3).map((t) => t[1]));
    expect(team[3].guest).toBe(true);
    expect(team[3].charId).toBe(pick.shinobi.unit.charId);
    expect(team[3].hp).toBeGreaterThan(0);

    // Win, then the result offers a friend request.
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await page.locator('#results-screen').count()) break;
      await page.evaluate(() => {
        const bm = window.BattleManager;
        (bm.enemyTeam || []).filter((e) => e.stats.hp > 0).forEach((e) => { e.stats.hp = 0; });
        bm.checkBattleEnd();
      });
      await page.waitForTimeout(500);
    }
    await expect(page.locator('#btn-support-friend')).toBeVisible({ timeout: 30_000 });
    // The guest never entered the inventory or got EXP.
    const inv = await page.evaluate(() => JSON.parse(localStorage.getItem('blazing_inventory_v2') || '[]'));
    expect(inv.some((u) => String(u.uid).startsWith('guest:'))).toBe(false);

    await page.locator('#btn-support-friend').click();
    await expect(page.locator('#support-friend-row')).toContainText('Friend added');
    const friends = await page.evaluate(() => JSON.parse(localStorage.getItem('blazing_friends_v1') || '[]'));
    expect(friends.map((f) => f.id)).toEqual([pick.shinobi.id]);

    await page.locator('#results-screen .mr-continue').click();
    await page.waitForURL(/missions\.html/);
    expect(await page.evaluate(() => localStorage.getItem('blazing_support_pick_v1'))).toBeNull();

    // Next time the friend heads the roster.
    await page.goto('/teams.html?mode=prebattle');
    await waitForLoader(page);
    await page.locator('#btn-support').click();
    await expect(page.locator('.ss-sheet .ss-row').first()).toContainText('Friend');

    errors.assertClean('support');
  });
});
