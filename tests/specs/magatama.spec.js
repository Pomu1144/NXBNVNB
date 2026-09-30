// Magatama: buy, combine/split, beset into gear pieces, one-click beset, the
// one-type-per-piece fit rule, and the stat bonus reaching the Tools stat
// panel and battle units (js/magatama.js, js/gear.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, readJSON, seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

// Old saves had tool cards in equipment1..5; those slots are gear pieces now.
const TOOLS = ['a_thousand_years_of_death', 'a_hint_to_the_cipher', 'a_friends_outstretched_hand', '7th_hokages_flash_attack', 'a_difficult_problem'];
const equipped = () => ({
  jutsu1: null, jutsu2: null, jutsu3: null, ultimate: null,
  equipment1: TOOLS[0], equipment2: TOOLS[1], equipment3: TOOLS[2], equipment4: TOOLS[3], equipment5: TOOLS[4],
});
const DATA = readJSON('data/magatama.json');
const val = (type, lv) => DATA.types.find((t) => t.id === type).values[lv - 1];
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_magatama_v1') || '{}'));
const wallet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));

function loadMagatama(saved) {
  const win = { dispatchEvent() {}, CustomEvent: function () {} };
  const ctx = { window: win, localStorage: { getItem: () => (saved ? JSON.stringify(saved) : null), setItem() {} }, fetch: () => Promise.reject(new Error('offline')), CustomEvent: function () {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/magatama.js'), 'utf8'), ctx);
  return win.Magatama;
}

test('embedded magatama table matches data/magatama.json', () => {
  const d = loadMagatama().data();
  expect(d.types.map((t) => [t.id, t.stat, t.values])).toEqual(DATA.types.map((t) => [t.id, t.stat, t.values]));
  expect([d.socketsPerTool, d.combineCount, d.splitCount, d.maxLevel]).toEqual([DATA.socketsPerTool, DATA.combineCount, DATA.splitCount, DATA.maxLevel]);
  for (const t of DATA.types) {
    expect(t.values).toHaveLength(9);
    for (let lv = 1; lv <= 9; lv++) expect(fs.existsSync(path.join(REPO_ROOT, `assets/magatama/${t.id}_${lv}.webp`))).toBe(true);
  }
});

test('old saves: level-10 become level 9, per-card sockets go back to the bag', () => {
  const M = loadMagatama({
    bag: { 'attack:10': 2, 'attack:9': 1 },
    sockets: { card: ['life:10', 'defense:3', null, null, null] },
    gear: { u1: { helmet: ['life:10', 'attack:2', null, null, null] } },
  });
  const s = M.get();
  // 2 x Lv10 = 8 x Lv9, +1 Lv9; the card sockets and the misfit attack return to the bag
  expect(s.bag).toEqual({ 'attack:9': 9, 'life:9': 1, 'defense:3': 1, 'attack:2': 1 });
  expect(s.gear.u1.helmet).toEqual(['life:9', null, null, null, null]);
  expect(s.sockets).toBeUndefined();
});

test('each magatama type fits one gear piece', () => {
  const M = loadMagatama({ bag: { 'life:1': 1, 'attack:1': 1, 'defense:1': 1, 'ninjutsu:1': 1, 'resistance:1': 1 } });
  const FIT = { helmet: 'life', weapon: 'attack', armor: 'defense', scroll: 'ninjutsu', necklace: 'resistance' };
  for (const [slot, type] of Object.entries(FIT)) {
    expect(M.fits(slot)).toEqual([type]);
    for (const other of Object.values(FIT).filter((t) => t !== type)) {
      expect(M.beset('u1', slot, `${other}:1`).ok).toBe(false);
    }
    expect(M.beset('u1', slot, `${type}:1`).ok).toBe(true);
  }
  expect(M.bonusForUnit('u1')).toEqual({ hp: val('life', 1), atk: val('attack', 1), def: val('defense', 1), nin: val('ninjutsu', 1), res: val('resistance', 1) });
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
  // Tool cards left equipment1..5 (still owned); the five gear pieces took their place
  await expect(page.locator('#gear-left .gp[data-slot], #gear-right .gp[data-slot]')).toHaveCount(5);
  await expect(page.locator('#equipment-container .tl-slot')).toHaveCount(4);
  const eq = await page.evaluate(() => window.InventoryChar.getByUid('m-naruto').equippedJutsu);
  for (let i = 1; i <= 5; i++) expect(eq[`equipment${i}`]).toBeNull();

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

  // The helmet takes Life only: Attack is not besetable there
  await page.locator('#mg-tool-list .mg-tool[data-slot="helmet"]').click();
  await page.locator('#mg-tab-fit').click();
  await expect(page.locator('.mg-cell[data-key="attack:1"]')).toHaveCount(0);

  // The weapon takes Attack: beset one by tapping it in the Besetable grid
  await page.locator('#mg-tool-list .mg-tool[data-slot="weapon"]').click();
  await page.locator('.mg-cell[data-key="attack:1"]').click();
  await expect(page.locator('#mg-sockets .mg-socket.is-filled')).toHaveCount(1);
  // One-click fills the rest from the bag (3 left)
  await page.locator('#mg-oneclick').click();
  await expect(page.locator('#mg-sockets .mg-socket.is-filled')).toHaveCount(4);
  let s = await save(page);
  expect(s.bag).toEqual({});
  expect(s.gear['m-naruto'].weapon.filter(Boolean)).toHaveLength(4);
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
  expect((await save(page)).gear['m-naruto'].weapon.filter(Boolean)).toHaveLength(3);
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
    blazing_magatama_v1: { bag: {}, gear: { 't-naruto': {
      helmet: ['life:9', null, null, null, null],
      weapon: ['attack:9', 'attack:5', null, null, null],
      armor: ['defense:9', null, null, null, null],
      scroll: ['ninjutsu:9', null, null, null, null],
      necklace: ['resistance:8', null, null, null, null],
    } } },
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
      return { charId: u.charId, maga: u.stats.magatama || null, gear: window.Gear.bonusFor(u.id), maxHP: u.stats.maxHP, atk: u.stats.atk, def: u.stats.def, plain };
    });
  });
  const m = { hp: val('life', 9), atk: val('attack', 9) + val('attack', 5), def: val('defense', 9), nin: val('ninjutsu', 9), res: val('resistance', 8) };
  const g = r[0].gear; // starting gear (Green Lv1) adds a little of each
  const round2 = (n) => Math.round(n * 100) / 100;
  expect(r[0].maga).toEqual({ hp: g.hp + m.hp, atk: g.atk + m.atk, def: g.def + m.def, nin: round2(g.nin + m.nin), res: round2(g.res + m.res) });
  expect(r[0].maxHP).toBe(r[0].plain.maxHP + g.hp + m.hp);
  expect(r[0].def).toBe(r[0].plain.def + g.def + m.def);
  expect(r[0].atk).toBeGreaterThanOrEqual(r[0].plain.atk + g.atk + m.atk);
  // A unit without magatama only gets its gear
  expect(r[1].maga).toEqual(r[1].gear);
  errors.assertClean('battle magatama');
});
