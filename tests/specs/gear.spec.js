// Ninja tools (js/gear.js, js/character-gear-tab.js, js/tools-gear.js): the
// catalogue in data/ninja-tools.json, slot stats by stars, who can equip a
// tool, 8 slots per shinobi, the long-press tool card with its magatama
// sockets, the old generic gear refunded as Ryo, tool stats in battle and
// mission drops.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, readJSON, seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

const CATALOG = readJSON('data/ninja-tools.json').tools;
const toolSave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_tools_v1') || '{}'));
const wallet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));
const own = (id, toolId, stars, stats) => ({ id, toolId, stars, stats });
const EIGHT = (...ids) => Array.from({ length: 8 }, (_, i) => ids[i] || null);

// js/gear.js in a bare VM (no DOM), with the catalogue set by hand
function loadGear(store = {}) {
  const win = { dispatchEvent() {}, CustomEvent: function () {} };
  const ctx = {
    window: win, console, CustomEvent: function () {}, Math: Object.create(Math),
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/gear.js'), 'utf8'), ctx);
  win.Gear.setCatalog(CATALOG);
  return win.Gear;
}

test('catalogue: the 919 Drive tools, valid stars, icons on disk, unique ids, named shinobi only', () => {
  expect(CATALOG).toHaveLength(919);
  const byStars = {};
  for (const t of CATALOG) byStars[t.stars] = (byStars[t.stars] || 0) + 1;
  expect(byStars).toEqual({ 1: 33, 2: 5, 3: 91, 4: 171, 5: 377, 6: 201, 7: 41 });
  const chars = readJSON('data/characters.json');
  const prefixes = new Set((Array.isArray(chars) ? chars : chars.characters).map((c) => c.id.split('_')[0]));
  for (const t of CATALOG) for (const p of t.equip || []) expect(prefixes.has(p), `${t.id} equip ${p}`).toBe(true);
  expect(CATALOG.find((t) => t.id === 'anbu_mask_itachi_6').equip).toEqual(['itachi']);
  const ids = new Set();
  for (const t of CATALOG) {
    expect(ids.has(t.id)).toBe(false);
    ids.add(t.id);
    expect(t.stars).toBeGreaterThanOrEqual(1);
    expect(t.stars).toBeLessThanOrEqual(7);
    expect(fs.existsSync(path.join(REPO_ROOT, t.icon))).toBe(true);
  }
});

test('slot stats by stars: 6/7 six, 5 four, 4 three, 3 two, 2/1 one', () => {
  const G = loadGear();
  expect([1, 2, 3, 4, 5, 6, 7].map((s) => G.slotCount(s))).toEqual([1, 1, 2, 3, 4, 6, 6]);
  expect([1, 2, 3, 4, 5, 6, 7].map((s) => G.socketCount(s))).toEqual([1, 1, 1, 2, 2, 3, 3]);
  for (const t of CATALOG) {
    for (let n = 0; n < 10; n++) {
      const it = G.roll({ toolId: t.id });
      expect(it.stars).toBe(t.stars);
      expect(it.stats).toHaveLength(G.slotCount(t.stars));
      if (t.pool) for (const [k] of it.stats) if (!(t.slots || []).some((s) => s[0] === k)) expect(t.pool).toContain(k);
    }
  }
  // Fixed slots come straight from the catalogue entry; the rest roll
  G.setCatalog([{ id: 'fx', name: 'Fixed', stars: 5, slots: [['atkPct', 15], ['nin', 15]], pool: ['def'] }]);
  const fx = G.roll({ toolId: 'fx' });
  expect(fx.stats.slice(0, 2)).toEqual([['atkPct', 15], ['nin', 15]]);
  expect(fx.stats.slice(2).map((s) => s[0])).toEqual(['def', 'def']);
  G.setCatalog(CATALOG);
  // A random tool of a star level the catalogue lacks: the nearest level
  expect(G.roll({ stars: 7 }).stars).toBe(Math.max(...CATALOG.map((t) => t.stars)));
  expect(G.fmtValue('atkPct', 15)).toBe('15.00%');
});

test('new players get 8 low-star tools; the old generic gear is refunded in Ryo', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S')],
    blazing_resources_v1: { ryo: 0, ninja_pearls: 0, shinobites: 0, granny_coin: 0 },
    blazing_gear_v2: { seq: 1, starter: true, bag: { h: { id: 'h', slot: 'helmet', rarity: 1, level: 2, main: 'hp', subs: [] } }, equip: {} },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  await page.waitForFunction(() => window.Gear.catalog().length > 0);
  await expect.poll(async () => Object.keys((await toolSave(page)).bag || {}).length).toBe(8);
  const bag = Object.values((await toolSave(page)).bag);
  expect(new Set(bag.map((t) => t.toolId)).size).toBe(8);
  for (const t of bag) expect(t.stars).toBeLessThanOrEqual(2);
  // Blue piece: 800 salvage + levels 0→1 (2400) and 1→2 (4800)
  expect((await wallet(page)).ryo).toBe(800 + 2400 + 4800);
  errors.assertClean('starter tools');
});

test('equip rules: 8 slots, who can equip, one copy each, moves between shinobi, sell', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('u-itachi', 'itachi_088', 80, '6S'), invEntry('u-naruto', 'naruto_2115', 80, '7S')],
    blazing_resources_v1: { ryo: 0, ninja_pearls: 0, shinobites: 0, granny_coin: 0 },
    blazing_tools_v1: { seq: 4, starter: true, bag: {
      a: own('a', 'anbu_mask_itachi_6', 6, [['atkPct', 15]]),
      k1: own('k1', 'heart_pill', 2, [['atk', 20]]),
      k2: own('k2', 'heart_pill', 2, [['atk', 18]]),
      s: own('s', 'hokage_hat_replica', 2, [['spd', 1]]),
    }, equip: {} },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  const r = await page.evaluate(() => {
    const G = window.Gear;
    const out = {};
    out.naruto = G.equip('u-naruto', 'a').ok;                 // Itachi / Sasuke only
    out.itachi = G.equip('u-itachi', 'a', 3).ok;
    out.k1 = G.equip('u-itachi', 'k1').ok;                    // first empty slot (0)
    out.k2 = G.equip('u-itachi', 'k2').ok;                    // a second Kunai: no
    out.move = G.equip('u-naruto', 'k1', 7);                  // taken from Itachi
    out.row = { itachi: G.get().equip['u-itachi'], naruto: G.get().equip['u-naruto'] };
    out.sellWorn = G.sell('k1').ok;
    out.sell = G.sell('s').ok;
    return out;
  });
  expect(r.naruto).toBe(false);
  expect(r.itachi).toBe(true);
  expect(r.k1).toBe(true);
  expect(r.k2).toBe(false);
  expect(r.move.from).toBe('u-itachi');
  expect(r.row.itachi).toEqual([null, null, null, 'a', null, null, null, null]);
  expect(r.row.naruto).toEqual(EIGHT(null, null, null, null, null, null, null, 'k1'));
  expect(r.sellWorn).toBe(false);
  expect(r.sell).toBe(true);
  expect((await wallet(page)).ryo).toBe(400);
  errors.assertClean('equip rules');
});

test('equipment tab: 2 rows of 4, equip from the bag, long press opens the tool card, beset magatama', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('u-itachi', 'itachi_088', 80, '6S')],
    blazing_tools_v1: { seq: 3, starter: true, bag: {
      a: own('a', 'anbu_mask_itachi_6', 6, [['atkPct', 15], ['atkPct', 15], ['atkPct', 15], ['atkPct', 15], ['atkPct', 15], ['nin', 15]]),
      h: own('h', '3_point_shuriken_of_devotion', 5, [['hpPct', 4], ['atkPct', 4], ['nin', 3], ['res', 3]]),
    }, equip: { 'u-itachi': EIGHT('a') } },
    blazing_magatama_v1: { bag: { 'attack:5': 2 } },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  await page.locator('.char-grid .char-slot[data-uid="u-itachi"]').click();
  await page.locator('.char-tabs .tab-btn[data-tab="gear"]').click();
  await expect(page.locator('#tab-gear .ntl-slot')).toHaveCount(8);
  await expect(page.locator('#tab-gear .ntl-slot.is-empty')).toHaveCount(7);
  await expect(page.locator('#tab-gear .eqp-totals')).toContainText('+75.00%');

  // An empty slot shows the bag; equip the hat there
  await page.locator('#tab-gear .ntl-slot[data-slot="5"]').click();
  await page.locator('#tab-gear .ntl-card[data-id="h"]').click();
  await page.locator('#tab-gear [data-act="equip"]').click();
  expect((await toolSave(page)).equip['u-itachi']).toEqual(EIGHT('a', null, null, null, null, 'h'));

  // Long press: the tool card with 6 slot stats, who can equip it, 3 sockets
  await page.locator('#tab-gear .ntl-slot[data-slot="0"]').scrollIntoViewIfNeeded();
  const box = await page.locator('#tab-gear .ntl-slot[data-slot="0"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const pop = page.locator('#char-gear .ntl-pop');
  await expect(pop).toBeVisible();
  await expect(pop.locator('.ntl-stat')).toHaveCount(6);
  await expect(pop.locator('.ntl-who')).toHaveCount(1);
  await expect(pop.locator('.ntl-sock')).toHaveCount(3);
  // the click after the release does not change the selected slot
  await expect(page.locator('#tab-gear .ntl-slot[data-slot="5"]')).toHaveAttribute('aria-pressed', 'true');

  // Beset: "+" then a gem from the bag; tap the gem to take it off
  await pop.locator('.ntl-sock').first().click();
  await pop.locator('.ntl-gem[data-key="attack:5"]').click();
  await expect(pop.locator('.ntl-sock.is-filled')).toHaveCount(1);
  const maga = () => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_magatama_v1')));
  expect((await maga()).tools.a).toEqual(['attack:5', null, null]);
  await expect(page.locator('#tab-gear .eqp-totals')).toContainText('ATK');
  await pop.locator('.ntl-sock.is-filled').click();
  expect((await maga()).bag).toEqual({ 'attack:5': 2 });
  await pop.locator('[data-act="close"]').click();
  await expect(pop).toHaveCount(0);
  errors.assertClean('equipment tab tools');
});

test('tool stats apply in battle: flat, percent, speed, crit, jutsu damage', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const { mission, rank } = pickPlainMission();
  const TEAM = [['t-naruto', 'naruto_2115', '7S'], ['t-minato', 'minato_2101', '6S']];
  const slots = {};
  TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
  await seedSave(page, {
    blazing_inventory_v2: TEAM.map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier)),
    blazing_teams_v1: { 1: slots },
    currentMissionId: mission.id,
    currentDifficulty: rank,
    blazing_story_seen_v1: allStorySeen(),
    blazing_tools_v1: { seq: 3, starter: true, bag: {
      a: own('a', 'a_mark_made_by_two_naruto_6', 6, [['hp', 900], ['hpPct', 6], ['atk', 60], ['atkPct', 6], ['nin', 5], ['def', 20]]),
      b: own('b', 'heart_pill', 2, [['critRate', 5]]),
      c: own('c', 'hokage_hat_replica', 2, [['spd', 3]]),
    }, equip: { 't-naruto': EIGHT('a', 'b', 'c') } },
  });
  await page.goto('/battle.html');
  await waitForLoader(page, 45_000);
  await page.waitForFunction(() => window.BattleManager?.activeTeam?.length > 0 && window.BattleManager?.enemyTeam?.length > 0, null, { timeout: 45_000 });
  const r = await page.evaluate(() => {
    const bm = window.BattleManager;
    return bm.activeTeam.map((u) => {
      const base = bm.charactersData.find((c) => c.id === u.charId);
      const plain = bm.units._baseStats(base, window.InventoryChar.getByUid(u.id));
      const s = u.stats;
      return { maga: s.magatama, maxHP: s.maxHP, atk: s.atk, def: s.def, speed: s.speed, critRate: s.critRate || 0, plain };
    });
  });
  const p = r[0].plain;
  expect(r[0].maxHP).toBe(p.maxHP + 900 + Math.round(p.hp * 6 / 100));
  expect(r[0].atk).toBe(p.atk + 60 + Math.round(p.atk * 6 / 100));
  expect(r[0].def).toBe(p.def + 20);
  expect(r[0].speed).toBeCloseTo(p.speed + 3, 5);
  expect(r[0].critRate).toBe(5);
  expect(r[0].maga.nin).toBe(5);
  expect(r[1].maxHP).toBe(r[1].plain.maxHP);
  errors.assertClean('battle tools');
});

test('missions drop ninja tools into the bag', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S')] });
  await page.goto('/characters.html');
  await waitForLoader(page);
  await page.waitForFunction(() => window.Gear.catalog().length > 0);
  const r = await page.evaluate(() => {
    const G = window.Gear;
    const before = G.bagCount();
    const drop = G.roll({ toolId: 'gaaras_gourd_5th_kazekage' });
    const added = G.add(drop);
    const tiles = window.RewardFormat ? window.RewardFormat.items({ ryo: 100, gear: [drop] }) : null;
    return { before, after: G.bagCount(), added: !!added, tiles: tiles && tiles.map((t) => [t.kind, t.name]) };
  });
  expect(r.after).toBe(r.before + 1);
  expect(r.added).toBe(true);
  if (r.tiles) expect(r.tiles).toContainEqual(['gear', "Gaara's Gourd (5th Kazekage) 5★"]);
  errors.assertClean('tool drops');
});

test('tools no longer in the catalogue are sold back and their magatama return', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('u-naruto', 'naruto_2115', 80, '7S')],
    blazing_resources_v1: { ryo: 0, ninja_pearls: 0, shinobites: 0, granny_coin: 0 },
    blazing_tools_v1: { seq: 2, starter: true, bag: {
      old: own('old', 'kunai', 2, [['atk', 20]]),
      keep: own('keep', 'heart_pill', 2, [['hp', 300]]),
    }, equip: { 'u-naruto': EIGHT('old', 'keep') } },
    blazing_magatama_v1: { bag: {}, tools: { old: ['attack:3'] } },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  await expect.poll(async () => Object.keys((await toolSave(page)).bag)).toEqual(['keep']);
  expect((await toolSave(page)).equip['u-naruto']).toEqual(EIGHT(null, 'keep'));
  expect((await wallet(page)).ryo).toBe(400);
  const maga = await page.evaluate(() => JSON.parse(localStorage.getItem('blazing_magatama_v1')));
  expect(maga.bag).toEqual({ 'attack:3': 1 });
  expect(maga.tools.old).toBeUndefined();
  errors.assertClean('retired tools');
});
