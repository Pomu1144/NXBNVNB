// Magatama: buy, combine/split, beset, one-click beset, and the stat bonus
// reaching the Tools stat panel and battle units (js/magatama.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, readJSON, seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

const TOOLS = ['a_thousand_years_of_death', 'a_hint_to_the_cipher', 'a_friends_outstretched_hand', '7th_hokages_flash_attack', 'a_difficult_problem'];
const equipped = () => ({
  jutsu1: null, jutsu2: null, jutsu3: null, ultimate: null,
  equipment1: TOOLS[0], equipment2: TOOLS[1], equipment3: TOOLS[2], equipment4: TOOLS[3], equipment5: TOOLS[4],
});
const DATA = readJSON('data/magatama.json');
const val = (type, lv) => DATA.types.find((t) => t.id === type).values[lv - 1];
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_magatama_v1') || '{}'));
const wallet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));

test('embedded magatama table matches data/magatama.json', () => {
  const win = { dispatchEvent() {}, CustomEvent: function () {} };
  const ctx = { window: win, localStorage: { getItem: () => null, setItem() {} }, fetch: () => Promise.reject(new Error('offline')), CustomEvent: function () {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/magatama.js'), 'utf8'), ctx);
  const d = win.Magatama.data();
  expect(d.types.map((t) => [t.id, t.stat, t.values])).toEqual(DATA.types.map((t) => [t.id, t.stat, t.values]));
  expect([d.socketsPerTool, d.combineCount, d.splitCount, d.maxLevel]).toEqual([DATA.socketsPerTool, DATA.combineCount, DATA.splitCount, DATA.maxLevel]);
  for (const t of DATA.types) {
    expect(t.values).toHaveLength(10);
    for (let lv = 1; lv <= 10; lv++) expect(fs.existsSync(path.join(REPO_ROOT, `assets/magatama/${t.id}_${lv}.webp`))).toBe(true);
  }
});

test('buy, combine, split, beset, one-click beset and stat bonus on the Tools page', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [{ ...invEntry('m-naruto', 'naruto_2115', 80, '7S'), equippedJutsu: equipped() }],
    blazing_resources_v1: { ryo: 100000, ninja_pearls: 0, shinobites: 0, granny_coin: 0 },
    tools_ui_prefs_v1: { uid: 'm-naruto' },
    tools_ui_view_v1: 'gear',
  });
  await page.goto('/tools.html');
  await waitForLoader(page);
  await expect(page.locator('#equipment-container .tl-slot.is-filled')).toHaveCount(5);
  const atkBonus = async () => Number((await page.locator('#stats-display [data-stat="atk"] .tl-bonus').innerText()).replace(/[^\d]/g, ''));
  const atkBefore = await atkBonus();

  await page.locator('#view-maga').click();
  await expect(page.locator('#maga-app')).toBeVisible();
  await expect(page.locator('#mg-tool-list .mg-tool')).toHaveCount(5);
  await expect(page.locator('#mg-sockets .mg-socket')).toHaveCount(5);

  // Buy 4 Attack Lv1
  await page.locator('#mg-buy').click();
  await expect(page.locator('#mg-shop')).toBeVisible();
  await page.locator('[data-stype="attack"]').click();
  for (let i = 0; i < 3; i++) await page.locator('#mg-shop [data-qty="1"]').click();
  await expect(page.locator('#mg-qty')).toHaveText('4');
  await page.locator('#mg-shop [data-buy="1"]').click();
  expect((await wallet(page)).ryo).toBe(100000 - DATA.shop.levels['1'] * 4);
  expect((await save(page)).bag).toEqual({ 'attack:1': 4 });
  await page.locator('#mg-shop-close').click();

  // Combine 4 x Lv1 -> 1 x Lv2, then split it back
  await page.locator('#mg-tab-bag').click();
  await page.locator('.mg-cell[data-key="attack:1"]').click();
  await page.locator('#mg-combine').click();
  expect((await save(page)).bag).toEqual({ 'attack:2': 1 });
  await page.locator('#mg-split').click();
  expect((await save(page)).bag).toEqual({ 'attack:1': 4 });

  // Beset one by tapping it in the Besetable grid (first tool is an Attack card)
  await page.locator('#mg-tab-fit').click();
  await page.locator('.mg-cell[data-key="attack:1"]').click();
  await expect(page.locator('#mg-sockets .mg-socket.is-filled')).toHaveCount(1);
  // One-click fills the rest from the bag (3 left)
  await page.locator('#mg-oneclick').click();
  await expect(page.locator('#mg-sockets .mg-socket.is-filled')).toHaveCount(4);
  let s = await save(page);
  expect(s.bag).toEqual({});
  expect(s.sockets[TOOLS[0]].filter(Boolean)).toHaveLength(4);
  await expect(page.locator('#mg-total [data-stat="atk"] dd')).toHaveText(`+${val('attack', 1) * 4}`);

  // Tap a filled socket to take it out
  await page.locator('#mg-sockets .mg-socket.is-filled').first().click();
  await expect(page.locator('#mg-sockets .mg-socket.is-filled')).toHaveCount(3);
  s = await save(page);
  expect(s.bag).toEqual({ 'attack:1': 1 });

  // The Gear stat panel includes the bonus
  await page.locator('#view-gear').click();
  await expect(page.locator('#tools-app')).toBeVisible();
  expect(await atkBonus()).toBe(atkBefore + val('attack', 1) * 3);

  // Survives a reload
  await page.reload();
  await waitForLoader(page);
  expect((await save(page)).sockets[TOOLS[0]].filter(Boolean)).toHaveLength(3);
  errors.assertClean('tools magatama');
});

test('socketed magatama raise the unit stats in battle', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const { mission, rank } = pickPlainMission();
  const TEAM = [['t-naruto', 'naruto_2115', '7S'], ['t-minato', 'minato_2101', '6S']];
  const slots = {};
  TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
  const inv = TEAM.map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier));
  inv[0].equippedJutsu = equipped();
  await seedSave(page, {
    blazing_inventory_v2: inv,
    blazing_teams_v1: { 1: slots },
    currentMissionId: mission.id,
    currentDifficulty: rank,
    blazing_story_seen_v1: allStorySeen(),
    blazing_magatama_v1: { bag: {}, sockets: { [TOOLS[0]]: ['attack:10', 'life:10', 'attack:5', null, null], [TOOLS[1]]: ['defense:9', 'ninjutsu:10', 'resistance:8', null, null] } },
  });
  await page.goto('/battle.html');
  await waitForLoader(page, 45_000);
  await page.waitForFunction(() => window.BattleManager?.activeTeam?.length > 0 && window.BattleManager?.enemyTeam?.length > 0, null, { timeout: 45_000 });

  const r = await page.evaluate(() => {
    const bm = window.BattleManager;
    return bm.activeTeam.map((u) => {
      const base = bm.charactersData.find((c) => c.id === u.charId);
      const inst = window.InventoryChar.getByUid(u.id);
      const plain = bm.units._baseStats(base, inst);
      return { charId: u.charId, maga: u.stats.magatama || null, maxHP: u.stats.maxHP, atk: u.stats.atk, def: u.stats.def, plain };
    });
  });
  const expected = { hp: val('life', 10), atk: val('attack', 10) + val('attack', 5), def: val('defense', 9), nin: val('ninjutsu', 10), res: val('resistance', 8) };
  expect(r[0].maga).toEqual(expected);
  expect(r[0].maxHP).toBe(r[0].plain.maxHP + expected.hp);
  expect(r[0].def).toBe(r[0].plain.def + expected.def);
  expect(r[0].atk).toBeGreaterThanOrEqual(r[0].plain.atk + expected.atk);
  // A unit without those tools gets nothing
  expect(r[1].maga).toBeNull();
  errors.assertClean('battle magatama');
});
