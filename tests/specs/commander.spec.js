// Commander: the banner shows the team's chakra; at 16 it can be cast, which
// takes 16 chakra from the team and strikes the enemies. Never fires by itself.
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

const TEAM = [
  ['c-naruto', 'naruto_2115', '7S'],
  ['c-sasuke', 'sasuke_2117', '7S'],
  ['c-itachi', 'itachi_2200', '6S'],
  ['c-minato', 'minato_2101', '6S'],
];
const COMMANDER = ['c-kakashi', 'kakashi_855', '6S'];

async function openBattle(page) {
  const { mission, rank } = pickPlainMission();
  const slots = {};
  TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
  slots.commander = { uid: COMMANDER[0], charId: COMMANDER[1] };
  await seedSave(page, {
    blazing_inventory_v2: [...TEAM, COMMANDER].map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier)),
    blazing_teams_v1: { 1: slots },
    currentMissionId: mission.id,
    currentDifficulty: rank,
    blazing_story_seen_v1: allStorySeen(),
  });
  await page.goto('/battle.html');
  await waitForLoader(page, 45_000);
  await page.waitForFunction(() => {
    const bm = window.BattleManager;
    return bm && bm.commander && bm.activeTeam?.length && bm.enemyTeam?.length && document.querySelector('.cmd-banner');
  }, null, { timeout: 45_000 });
}

/** Freeze the turn order between actions so nothing else moves while we test. */
async function holdTurns(page) {
  await page.evaluate(() => { window.BattleManager.isPaused = true; });
  await page.waitForFunction(() => {
    const bm = window.BattleManager, T = bm.turns;
    return !(T?.currentUnit && !T.currentUnit.isPlayer) && ![...bm.activeTeam, ...bm.enemyTeam].some(u => u?._actionBusy);
  }, null, { timeout: 30_000 });
}

const setChakra = (page, each) => page.evaluate(n => {
  const bm = window.BattleManager;
  bm.activeTeam.forEach(u => { u.chakra = n; });
  bm.updateCollectiveChakra();
}, each);

test.describe('commander', () => {
  test.describe.configure({ timeout: 120_000 });

  test('fills, waits for the player, and casting takes 16 team chakra', async ({ page }) => {
    const errors = collectErrors(page);
    await openBattle(page);
    await holdTurns(page);
    const banner = page.locator('.cmd-banner');
    await expect(banner).toBeVisible();

    // Below 16: not ready; a tap opens the details instead of casting.
    await setChakra(page, 3);
    await expect(banner).not.toHaveClass(/is-ready/);
    await banner.click();
    await expect(page.locator('.cmd-details')).toBeVisible();
    await page.locator('.cmd-details .cmd-x').click();
    await expect(page.locator('.cmd-details')).toHaveCount(0);

    // 16 or more: ready, and it does NOT fire by itself.
    await setChakra(page, 5); // 20
    await expect(banner).toHaveClass(/is-ready/);
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => {
      const bm = window.BattleManager;
      return {
        chakra: bm.activeTeam.reduce((s, u) => s + u.chakra, 0),
        enemyHp: bm.enemyTeam.reduce((s, u) => s + u.stats.hp, 0),
      };
    });
    expect(before.chakra).toBe(20);

    // Cast: 16 chakra leaves the team, the cut-in plays, enemies take damage.
    await banner.click();
    await expect(page.locator('.cmd-cutin')).toHaveCount(1);
    await page.waitForFunction(() => !window.BattleCommander.casting, null, { timeout: 15_000 });
    const after = await page.evaluate(() => {
      const bm = window.BattleManager;
      return {
        chakra: bm.activeTeam.reduce((s, u) => s + u.chakra, 0),
        enemyHp: bm.enemyTeam.reduce((s, u) => s + u.stats.hp, 0),
      };
    });
    expect(after.chakra).toBe(4);
    expect(after.enemyHp).toBeLessThan(before.enemyHp);
    await expect(banner).not.toHaveClass(/is-ready/);
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });
});
