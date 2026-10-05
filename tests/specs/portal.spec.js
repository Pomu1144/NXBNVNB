// Portal: Portal Codes, guest units from other games, and guests in battle.
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

// A card as the JJK game would send it (no art: a portrait is drawn).
const FOREIGN = {
  sourceGame: 'jjk-net0', baseId: 'yuji_itadori', name: 'Yuji Itadori', title: 'Vessel',
  franchise: 'jjk', element: 'Body', rarity: 5, level: 40, maxLevel: 80,
  stats: { hp: 0.4, atk: 0.35, speed: 0.5 }, art: { portrait: '', full: '' },
};
const GUEST_ID = 'portal_jjk_net0_yuji_itadori';

test.describe('portal', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Portal Code round trip and guest import from settings', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { blazing_inventory_v2: [invEntry('p-minato', 'minato_2101', 60, '6S')] });
    await page.goto('/settings.html');
    await waitForLoader(page);
    await page.click('[data-tab="portal"]');
    await expect(page.locator('#portal-status')).toHaveText('Standalone');
    await expect(page.locator('#portal-roster [data-char]')).toHaveCount(1);

    // Own unit → code → decodes back to the same card.
    await page.locator('#portal-roster [data-char]').first().click();
    await page.click('#portal-make-code');
    const code = await page.inputValue('#portal-code-out');
    const back = await page.evaluate((c) => PortalSDK.decodeCode(c), code);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: 'nxbnvnb:minato_2101', element: 'Skill', rarity: 6, level: 60 });
    expect(back[0].art.portrait).toMatch(/^http.*minato_2101/);

    // A code with more than 5 characters is refused.
    expect(await page.evaluate((c) => {
      const six = btoa(JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ ...c, baseId: 'u' + i }))));
      try { PortalSDK.decodeCode('PRTL1.' + six); } catch (e) { return e.message; }
      return null;
    }, FOREIGN)).toMatch(/at most 5/);

    // Foreign card → guest unit.
    const foreignCode = await page.evaluate((c) => PortalSDK.encodeCode([c]), FOREIGN);
    await page.fill('#portal-code-in', foreignCode);
    await page.click('#portal-import-code');
    await expect(page.locator('#portal-msg')).toContainText('Joined: Yuji Itadori');
    const saved = await page.evaluate((id) => ({
      inv: JSON.parse(localStorage.getItem('blazing_inventory_v2')).filter((i) => i.charId === id),
      guest: PortalGuests.all().find((g) => g.id === id),
    }), GUEST_ID);
    expect(saved.inv).toHaveLength(1);
    expect(saved.inv[0].level).toBe(40);
    expect(saved.guest.element).toBe('Body');
    expect(saved.guest.statsMax.hp).toBe(30000);
    expect(saved.guest.portrait).toMatch(/^data:image\/svg\+xml,/);

    // Importing again with a lower level changes nothing.
    await page.fill('#portal-code-in', await page.evaluate((c) => PortalSDK.encodeCode([{ ...c, level: 10 }]), FOREIGN));
    await page.click('#portal-import-code');
    await expect(page.locator('#portal-msg')).toContainText('Already here: Yuji Itadori');

    // The guest is part of characters.json for every loader.
    const listed = await page.evaluate(async (id) => (await (await fetch('data/characters.json')).json()).some((c) => c.id === id), GUEST_ID);
    expect(listed).toBe(true);
    errors.assertClean('portal');
  });

  test('a guest unit fights in battle', async ({ page }) => {
    const errors = collectErrors(page);
    const { mission, rank } = pickPlainMission();
    // Seed the guest definition the way PortalPort.importCards stores it.
    await page.goto('/index.html');
    const guest = await page.evaluate(async (card) => {
      const list = await (await fetch('data/characters.json')).json();
      const tpl = list.find((c) => c.element === card.element && c.rarity === card.rarity && c.skills && c.statsMax);
      const def = JSON.parse(JSON.stringify(tpl));
      Object.assign(def, {
        id: 'portal_jjk_net0_yuji_itadori', name: card.name, element: card.element, rarity: card.rarity,
        starMinCode: '5S', starMaxCode: '5S', statsMax: { ...tpl.statsMax, hp: 30000, atk: 3500, speed: 275 },
        portalGuest: { sourceGame: card.sourceGame, cardId: 'jjk-net0:yuji_itadori', template: tpl.id, card },
      });
      return def;
    }, FOREIGN);

    await seedSave(page, {
      blazing_portal_guests_v1: [guest],
      blazing_inventory_v2: [invEntry('t-yuji', GUEST_ID, 40, '5S'), invEntry('t-minato', 'minato_2101', 80, '6S')],
      blazing_teams_v1: { 1: { 'front-1': { uid: 't-yuji', charId: GUEST_ID }, 'front-2': { uid: 't-minato', charId: 'minato_2101' } } },
      currentMissionId: mission.id,
      currentDifficulty: rank,
      blazing_story_seen_v1: allStorySeen(),
    });
    await page.goto('/battle.html');
    await waitForLoader(page, 45_000);
    await page.waitForFunction(() => {
      const bm = window.BattleManager;
      return bm && bm.activeTeam && bm.activeTeam.length > 0 && bm.enemyTeam && bm.enemyTeam.length > 0;
    }, null, { timeout: 45_000 });

    const yuji = await page.evaluate((id) => {
      const u = window.BattleManager.activeTeam.find((x) => x.charId === id);
      return u && { name: u.name, hp: u.stats.hp };
    }, GUEST_ID);
    expect(yuji).toBeTruthy();
    expect(yuji.name).toBe('Yuji Itadori');
    expect(yuji.hp).toBeGreaterThan(0);
    errors.assertClean('portal');
  });
});
