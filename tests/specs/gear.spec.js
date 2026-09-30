// Gear (js/gear.js, js/tools-gear.js): the five fixed pieces on every shinobi,
// Ryo strengthening, the tier level cap, promotion with upgrade scrolls, the
// magatama fit rule per piece, and gear stats in battle.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

const SLOTS = ['helmet', 'weapon', 'armor', 'scroll', 'necklace'];
const gearSave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_gear_v1') || '{}'));
const wallet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));

// js/gear.js in a bare VM (no DOM): the numbers the tests check against
function loadGear() {
  const win = { dispatchEvent() {}, CustomEvent: function () {} };
  const ctx = { window: win, localStorage: { getItem: () => null, setItem() {} }, CustomEvent: function () {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/gear.js'), 'utf8'), ctx);
  return win.Gear;
}
const G = loadGear();

test('gear tables: tiers, caps, promotion costs, stat curve, icons', () => {
  expect(G.TIERS.map((t) => t.cap)).toEqual([20, 40, 60, 80, 100, 120]);
  expect(G.TIERS.map((t) => t.mult)).toEqual([1, 1.1, 1.2, 1.3, 1.4, 1.5]);
  expect(G.PROMOTE.map((p) => [p.scroll, p.count, p.ryo])).toEqual([
    ['gear_scroll_2', 3, 20000], ['gear_scroll_3', 3, 60000], ['gear_scroll_4', 3, 150000],
    ['gear_scroll_5', 3, 300000], ['gear_scroll_6', 3, 600000],
  ]);
  // Max gear is roughly +15% of a maxed 6-star (~74k HP, ~4.3k ATK)
  expect(G.statValue('helmet', 5, 120)).toBe(10800);
  expect(G.statValue('weapon', 5, 120)).toBe(630);
  expect(G.statValue('armor', 5, 120)).toBe(360);
  expect(G.statValue('scroll', 5, 120)).toBe(18);
  expect(G.statValue('necklace', 5, 120)).toBe(14.4);
  expect(G.levelCost(1)).toBe(Math.round((200 + 40) / 10) * 10);
  expect(G.levelCost(50)).toBeGreaterThan(G.levelCost(49));
  expect(G.nameOf('weapon', 1)).toBe('Chunin Kunai');
  expect(G.nameOf('necklace', 4)).toBe('Super Kage Prayer Beads');
  expect(G.nameOf('necklace', 5)).toBe('Super Kage Prayer Beads');
  for (const art of ['green', 'blue', 'purple', 'orange', 'red']) {
    for (const s of SLOTS) expect(fs.existsSync(path.join(REPO_ROOT, `assets/gear/${art}_${s}.webp`))).toBe(true);
  }
  expect(G.iconOf('helmet', 5)).toBe('assets/gear/red_helmet.webp');
});

test('default gear, strengthen, auto and the tier cap on the Tools page', async ({ page }) => {
  const errors = collectErrors(page);
  const ryo = 200000;
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S')],
    blazing_resources_v1: { ryo, ninja_pearls: 0, shinobites: 0, granny_coin: 0 },
    tools_ui_prefs_v1: { uid: 'g-naruto' },
    tools_ui_view_v1: 'gear',
  });
  await page.goto('/tools.html');
  await waitForLoader(page);

  // Every piece starts Green Lv1
  const pieces = page.locator('#gear-left .gp[data-slot], #gear-right .gp[data-slot]');
  await expect(pieces).toHaveCount(5);
  expect(await page.evaluate(() => window.Gear.unitGear('g-naruto'))).toEqual(
    Object.fromEntries(SLOTS.map((s) => [s, { tier: 0, level: 1 }])));
  for (const s of SLOTS) {
    await expect(page.locator(`.gp[data-slot="${s}"] .gp-lv`)).toHaveText('Lv1');
    await expect(page.locator(`.gp[data-slot="${s}"] img`)).toHaveAttribute('src', `assets/gear/green_${s}.webp`);
  }
  // Tools stat panel: HP bonus is the Green Lv1 helmet
  const hpBonus = async () => Number((await page.locator('#stats-display [data-stat="hp"] .tl-bonus').innerText()).replace(/[^\d]/g, ''));
  expect(await hpBonus()).toBe(G.statValue('helmet', 0, 1));

  // Strengthen the helmet once from its panel: Ryo deducted, level up
  await page.locator('.gp[data-slot="helmet"]').click();
  await expect(page.locator('#gp-modal')).toBeVisible();
  await page.locator('#gp-body [data-act="str"]').click();
  expect((await gearSave(page)).units['g-naruto'].helmet).toEqual({ tier: 0, level: 2 });
  expect((await wallet(page)).ryo).toBe(ryo - G.levelCost(1));
  expect(await hpBonus()).toBe(G.statValue('helmet', 0, 2));

  // Auto goes as far as the Green cap (Lv20) with plenty of Ryo, then stops
  await page.locator('#gp-body [data-act="auto"]').click();
  let spent = 0;
  for (let l = 1; l < 20; l++) spent += G.levelCost(l);
  expect((await gearSave(page)).units['g-naruto'].helmet).toEqual({ tier: 0, level: 20 });
  expect((await wallet(page)).ryo).toBe(ryo - spent);
  await expect(page.locator('#gp-body [data-act="str"]')).toHaveCount(0);
  await expect(page.locator('#gp-body [data-act="promote"]')).toBeDisabled(); // no scrolls yet
  await page.locator('#gp-close').click();

  // The cap blocks further level-ups
  const blocked = await page.evaluate(() => window.Gear.strengthen('g-naruto', 'helmet', 1));
  expect(blocked.ok).toBe(false);
  expect((await gearSave(page)).units['g-naruto'].helmet.level).toBe(20);

  // Strengthen view: capped row offers Upgrade, others Strengthen
  await page.locator('#view-str').click();
  await expect(page.locator('#str-app')).toBeVisible();
  await expect(page.locator('.gs-row')).toHaveCount(5);
  await expect(page.locator('.gs-row[data-slot="helmet"] [data-act="str"]')).toHaveCount(0);
  await expect(page.locator('.gs-row[data-slot="helmet"] [data-act="up"]')).toBeVisible();
  const before = (await wallet(page)).ryo;
  await page.locator('.gs-row[data-slot="weapon"] [data-act="str"]').click();
  expect((await gearSave(page)).units['g-naruto'].weapon).toEqual({ tier: 0, level: 2 });
  expect((await wallet(page)).ryo).toBe(before - G.levelCost(1));
  errors.assertClean('gear strengthen');
});

test('promotion at the cap uses 3 upgrade scrolls and Ryo, keeping the level', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S')],
    blazing_resources_v1: { ryo: 50000, ninja_pearls: 0, shinobites: 0, granny_coin: 0, gear_scroll_2: 2 },
    blazing_gear_v1: { units: { 'g-naruto': { helmet: { tier: 0, level: 20 }, weapon: { tier: 0, level: 12 } } } },
    tools_ui_prefs_v1: { uid: 'g-naruto' },
    tools_ui_view_v1: 'up',
  });
  await page.goto('/tools.html');
  await waitForLoader(page);
  await expect(page.locator('#up-app')).toBeVisible();

  // Below the cap: Upgrade is off and says where the cap is
  await page.locator('.gu-item[data-slot="weapon"]').click();
  await expect(page.locator('#gu-upgrade')).toBeDisabled();
  await expect(page.locator('#gu-note')).toHaveText('Reach Lv 20');

  // At the cap with 2 of 3 scrolls: still off, counter shows 2/3
  await page.locator('.gu-item[data-slot="helmet"]').click();
  await expect(page.locator('#gu-mats .gx-mat').first().locator('em')).toHaveText('2/3');
  await expect(page.locator('#gu-upgrade')).toBeDisabled();

  // Third scroll arrives: promote Green -> Blue
  await page.evaluate(() => { window.Resources.add('gear_scroll_2', 1); window.ToolsGear.render(); });
  await expect(page.locator('#gu-upgrade')).toBeEnabled();
  await page.locator('#gu-upgrade').click();
  expect((await gearSave(page)).units['g-naruto'].helmet).toEqual({ tier: 1, level: 20 });
  const w = await wallet(page);
  expect(w.ryo).toBe(50000 - 20000);
  expect(w.gear_scroll_2).toBe(0);
  // Cap is now 40, and the Blue icon / name show
  await expect(page.locator('.gu-item[data-slot="helmet"] img')).toHaveAttribute('src', 'assets/gear/blue_helmet.webp');
  expect(await page.evaluate(() => window.Gear.info('g-naruto', 'helmet').cap)).toBe(40);
  expect(await page.evaluate(() => window.Gear.strengthen('g-naruto', 'helmet', 1).ok)).toBe(true);
  errors.assertClean('gear promote');
});

test('each gear piece takes only its magatama type', async ({ page }) => {
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S')],
    blazing_magatama_v1: { bag: { 'life:2': 1, 'attack:2': 1, 'defense:2': 1, 'ninjutsu:2': 1, 'resistance:2': 1 } },
  });
  await page.goto('/tools.html');
  await waitForLoader(page);
  const res = await page.evaluate(() => {
    const M = window.Magatama;
    const out = {};
    for (const slot of window.Gear.SLOTS) {
      out[slot] = M.types().map((t) => t.id).filter((type) => {
        const r = M.beset('g-naruto', slot, `${type}:2`);
        if (r.ok) M.remove('g-naruto', slot, 0);
        return r.ok;
      });
    }
    return out;
  });
  expect(res).toEqual({ helmet: ['life'], weapon: ['attack'], armor: ['defense'], scroll: ['ninjutsu'], necklace: ['resistance'] });
});

test('gear stats apply in battle; the scroll raises jutsu damage', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const { mission, rank } = pickPlainMission();
  const TEAM = [['t-naruto', 'naruto_2115', '7S'], ['t-minato', 'minato_2101', '6S']];
  const slots = {};
  TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
  // A controllable Math.random for the damage comparison: battle-save.js keeps
  // the page's Math.random as its "native" RNG for previews.
  await page.addInitScript(() => {
    const real = Math.random;
    window.__fixedRandom = null;
    Math.random = function () { return window.__fixedRandom == null ? real() : window.__fixedRandom; };
  });
  await seedSave(page, {
    blazing_inventory_v2: TEAM.map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier)),
    blazing_teams_v1: { 1: slots },
    currentMissionId: mission.id,
    currentDifficulty: rank,
    blazing_story_seen_v1: allStorySeen(),
    blazing_gear_v1: { units: { 't-naruto': {
      helmet: { tier: 5, level: 120 }, weapon: { tier: 4, level: 100 }, armor: { tier: 3, level: 80 },
      scroll: { tier: 5, level: 120 }, necklace: { tier: 2, level: 60 },
    } } },
  });
  await page.goto('/battle.html');
  await waitForLoader(page, 45_000);
  await page.waitForFunction(() => window.BattleManager?.activeTeam?.length > 0 && window.BattleManager?.enemyTeam?.length > 0, null, { timeout: 45_000 });

  const r = await page.evaluate(() => {
    const bm = window.BattleManager;
    return bm.activeTeam.map((u) => {
      const base = bm.charactersData.find((c) => c.id === u.charId);
      const plain = bm.units._baseStats(base, window.InventoryChar.getByUid(u.id));
      return { gear: u.stats.gear, maga: u.stats.magatama, maxHP: u.stats.maxHP, atk: u.stats.atk, def: u.stats.def, plain };
    });
  });
  const want = {
    hp: G.statValue('helmet', 5, 120), atk: G.statValue('weapon', 4, 100), def: G.statValue('armor', 3, 80),
    nin: G.statValue('scroll', 5, 120), res: G.statValue('necklace', 2, 60),
  };
  expect(r[0].gear).toEqual(want);
  expect(r[0].maxHP).toBe(r[0].plain.maxHP + want.hp);
  expect(r[0].atk).toBe(r[0].plain.atk + want.atk);
  expect(r[0].def).toBe(r[0].plain.def + want.def);
  expect(r[0].maga.nin).toBe(want.nin);
  expect(r[0].maga.res).toBe(want.res);
  // The other unit has starting gear only
  expect(r[1].maxHP).toBe(r[1].plain.maxHP + G.statValue('helmet', 0, 1));

  // Jutsu damage with the scroll's +18% vs. without, same rolls
  const dmg = await page.evaluate(() => {
    const bm = window.BattleManager, C = window.BattleCombat;
    const a = bm.activeTeam[0], d = bm.enemyTeam[0];
    const hit = (nin) => {
      const keep = a.stats.magatama;
      a.stats.magatama = { ...keep, nin };
      window.__fixedRandom = 0.5;
      try {
        // previewDamage runs on the page RNG; route it through a jutsu ctx
        return C.previewDamage.call({ calculateDamage: (x, y, m) => C.calculateDamage(x, y, m, { kind: 'jutsu' }) }, a, d, 1).damage;
      } finally { window.__fixedRandom = null; a.stats.magatama = keep; }
    };
    return { with: hit(a.stats.magatama.nin), without: hit(0) };
  });
  expect(dmg.without).toBeGreaterThan(0);
  expect(dmg.with / dmg.without).toBeCloseTo(1 + want.nin / 100, 2);
  errors.assertClean('battle gear');
});
