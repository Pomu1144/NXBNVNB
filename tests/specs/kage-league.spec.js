// Kage League (js/kage-league.js, kage-league.html): a match from challenge to
// result, and season settlement (promotion, rewards, report).
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, collectErrors, waitForLoader } = require('../helpers');

const TEAM = [
  ['t-naruto', 'naruto_2115', '7S'],
  ['t-minato', 'minato_2101', '6S'],
  ['t-kakashi', 'kakashi_705', '6S'],
  ['t-sasuke', 'sasuke_2117', '7S'],
];
const DAY = 24 * 60 * 60 * 1000;
const seasonNow = () => Math.floor((Date.now() - Date.UTC(2026, 0, 5)) / (7 * DAY)) + 1;

function save(extra = {}) {
  const slots = {};
  TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
  return {
    blazing_inventory_v2: TEAM.map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier)),
    // Team 2 is the league team; team 1 holds a different unit
    blazing_teams_v1: { 1: { 'front-1': { uid: 't-naruto', charId: 'naruto_2115' } }, 2: slots },
    blazing_resources_v1: { ryo: 1000, ninja_pearls: 10, shinobites: 0, granny_coin: 0 },
    ...extra,
  };
}
const league = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_kage_league_v1') || 'null'));

test.describe('kage league', () => {
  test.describe.configure({ timeout: 120_000 });

  test('challenge a rival, win, gain LP and spend a ticket', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, save());
    await page.goto('/kage-league.html');
    await waitForLoader(page);

    // Pick team 2 as the league team
    await page.locator('#kl-team').click();
    await page.locator('.kl-team-card[data-team="2"]').click();
    await expect(page.locator('#kl-team')).toContainText('Team 2');

    const opps = page.locator('.kl-opp');
    await expect(opps).toHaveCount(3);
    await opps.first().locator('.kl-gem').click();
    await expect(page.locator('.kl-vs')).toBeVisible();
    await page.locator('[data-fight]').click();
    await page.waitForURL(/battle\.html/);
    await waitForLoader(page, 45_000);
    await page.waitForFunction(() => {
      const bm = window.BattleManager;
      return bm && bm.isKageLeague && bm.activeTeam && bm.activeTeam.length > 0 && bm.enemyTeam && bm.enemyTeam.length > 0;
    }, null, { timeout: 45_000 });
    // The league team (team 2), not team 1
    const ids = await page.evaluate(() => window.BattleManager.activeTeam.map((u) => u.charId));
    expect(ids).toEqual(TEAM.map((t) => t[1]));
    expect((await league(page)).tickets).toBe(4);

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (await page.locator('#battle-result:not(.hidden) #btn-continue-battle').count()) break;
      await page.evaluate(() => {
        const bm = window.BattleManager;
        (bm.enemyTeam || []).filter((e) => e.stats.hp > 0).forEach((e) => { e.stats.hp = 0; });
        bm.checkBattleEnd();
      });
      await page.waitForTimeout(500);
    }
    await expect(page.locator('#battle-result')).toContainText('League Points');
    const s = await league(page);
    expect(s.w).toBe(1);
    expect(s.lp).toBeGreaterThan(0);
    expect(s.log[0].win).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('kage_league_match'))).toBeNull();
    // Arena stars untouched
    expect(await page.evaluate(() => localStorage.getItem('arena_stars'))).toBeNull();

    await page.locator('#btn-continue-battle').click();
    await page.waitForURL(/kage-league\.html/);
    await expect(page.locator('#kl-lp')).toHaveText(String(s.lp));
    await expect(page.locator('#kl-w')).toHaveText('1');
    errors.assertClean('kage league match');
  });

  test('a finished season promotes, pays rewards and shows the report', async ({ page }) => {
    const errors = collectErrors(page);
    const last = seasonNow() - 1;
    await seedSave(page, save({
      blazing_kage_league_v1: { v: 1, season: last, floor: 1, lp: 5000, w: 60, l: 2, streak: 3, best: 9,
        tickets: 5, ticketAt: Date.now(), potions: 0, team: 2, scout: 0, history: [], log: [], applied: [], report: null, titles: [] },
    }));
    await page.goto('/kage-league.html');
    await waitForLoader(page);
    const report = page.locator('.kl-sheet.is-report');
    await expect(report).toBeVisible();
    await expect(report).toContainText(`Season ${last} Results`);
    await expect(report).toContainText('Promoted');
    const s = await league(page);
    expect(s.season).toBe(seasonNow());
    expect(s.floor).toBe(2);
    expect(s.lp).toBe(0);
    expect(s.history[0]).toMatchObject({ season: last, floor: 1, place: 1, move: 'promote', to: 2 });
    expect(s.potions).toBe(3);
    const wallet = await page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));
    expect(wallet.ninja_pearls).toBe(10 + 10);
    expect(wallet.ryo).toBe(1000 + 20000);
    // Shown once
    await page.reload();
    await waitForLoader(page);
    await expect(page.locator('.kl-sheet.is-report')).toHaveCount(0);
    await expect(page.locator('#kl-me-floor')).toContainText('Chunin Floor');
    errors.assertClean('kage league season');
  });
});
