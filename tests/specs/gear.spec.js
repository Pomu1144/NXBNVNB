// Gear (js/gear.js, js/tools-gear.js, js/character-gear-tab.js): pieces that
// drop from missions with a rarity, a main stat and substats; levelling with
// Ryo; equipping / swapping / salvaging; the old level-per-slot save turning
// into pieces; the magatama fit rule per slot; and gear stats in battle.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

const SLOTS = ['helmet', 'weapon', 'armor', 'scroll', 'necklace', 'sandals'];
const gearSave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_gear_v2') || '{}'));
const wallet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));
const piece = (id, slot, rarity, level, main, subs = []) => ({ id, slot, rarity, level, main, subs });

// js/gear.js in a bare VM (no DOM): the numbers the tests check against
function loadGear(store = {}) {
  const win = { dispatchEvent() {}, CustomEvent: function () {} };
  const ctx = {
    window: win, console, CustomEvent: function () {}, Math: Object.create(Math),
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/gear.js'), 'utf8'), ctx);
  return win.Gear;
}
const G = loadGear();

test('gear tables: rarities, level caps, main stats, names, art', () => {
  expect(G.TIERS.map((t) => t.label)).toEqual(['Green', 'Blue', 'Purple', 'Orange', 'Red', 'Red Shiny']);
  expect(G.TIERS.map((t) => t.cap)).toEqual([3, 6, 9, 12, 15, 15]);
  // Main stats: helmet always HP, weapon always ATK; the rest roll from a list
  expect(G.PIECES.helmet.mains).toEqual(['hp']);
  expect(G.PIECES.weapon.mains).toEqual(['atk']);
  expect(G.PIECES.sandals.mains).toContain('spd');
  expect(G.PIECES.armor.mains).toEqual(expect.arrayContaining(['critRate', 'critDmg']));
  // A Red Shiny +15 main stat is the table value; lower rarity / level is less
  expect(G.mainValue('hp', 5, 15)).toBe(10000);
  expect(G.mainValue('atk', 5, 15)).toBe(600);
  expect(G.mainValue('spd', 5, 15)).toBe(14);
  expect(G.mainValue('hp', 4, 15)).toBeLessThan(G.mainValue('hp', 5, 15));
  expect(G.mainValue('hp', 5, 0)).toBeLessThan(G.mainValue('hp', 5, 15));
  expect(G.levelCost(1, 4)).toBeGreaterThan(G.levelCost(0, 4));
  expect(G.levelCost(0, 5)).toBeGreaterThan(G.levelCost(0, 0));
  expect(G.nameOf('weapon', 1)).toBe('Chunin Kunai');
  expect(G.nameOf('helmet', 3)).toBe('Kage Hat');
  expect(G.nameOf('necklace', 5)).toBe('Super Kage Prayer Beads');
  expect(G.nameOf('sandals', 0)).toBe('Genin Sandals');
  for (const art of ['green', 'blue', 'purple', 'orange', 'red']) {
    for (const s of SLOTS) {
      expect(fs.existsSync(path.join(REPO_ROOT, `assets/gear/${art}_${s}.webp`))).toBe(true);
      expect(fs.existsSync(path.join(REPO_ROOT, `assets/gear/art/${art}_${s}.webp`))).toBe(true);
    }
  }
  expect(G.artOf('sandals', 3)).toBe('assets/gear/art/orange_sandals.webp');
  expect(G.artOf('helmet', 5)).toBe('assets/gear/art/red_helmet.webp');
});

test('rolled pieces: substats by rarity, no repeats, growth every 3 levels', () => {
  for (let r = 0; r < 6; r++) {
    for (let n = 0; n < 40; n++) {
      const it = G.roll({ rarity: r });
      expect(SLOTS).toContain(it.slot);
      expect(G.PIECES[it.slot].mains).toContain(it.main);
      expect(it.subs.length).toBeGreaterThanOrEqual(G.TIERS[r].subs);
      expect(it.subs.length).toBeLessThanOrEqual(Math.min(4, G.TIERS[r].subs + 1));
      const keys = it.subs.map((s) => s[0]);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).not.toContain(it.main);
      it.subs.forEach(([, v]) => expect(v).toBeGreaterThan(0));
    }
  }
  // Every rank can drop gear, and harder ranks lean to higher rarity
  const avg = (rank) => {
    let sum = 0, n = 0;
    for (let i = 0; i < 3000; i++) G.rollDrop(rank).forEach((it) => { sum += it.rarity; n++; });
    return { n, mean: sum / n };
  };
  const c = avg('C'), ss = avg('SS');
  expect(c.n).toBeGreaterThan(0);
  expect(ss.n).toBeGreaterThan(c.n);
  expect(ss.mean).toBeGreaterThan(c.mean + 1.5);

});

test('new players get a Green starter set; old level-per-slot saves turn into pieces', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S'), invEntry('g-sakura', 'sakura_794', 80, '6S')],
    blazing_gear_v1: { units: { 'g-naruto': { helmet: { tier: 3, level: 70 }, sandals: { tier: 5, level: 120 } } } },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  const s = await page.evaluate(() => { window.Gear.reload(); return JSON.parse(localStorage.getItem('blazing_gear_v2')); });
  const items = Object.values(s.bag);
  // two converted pieces + six Green starters
  expect(items).toHaveLength(8);
  const helm = s.bag[s.equip['g-naruto'].helmet];
  expect(helm).toMatchObject({ slot: 'helmet', rarity: 3, main: 'hp', level: Math.round(70 / 80 * 12) });
  const boots = s.bag[s.equip['g-naruto'].sandals];
  expect(boots).toMatchObject({ slot: 'sandals', rarity: 5, main: 'spd', level: 15 });
  expect(boots.subs.length).toBe(4);
  expect(items.filter((it) => it.rarity === 0 && it.level === 0)).toHaveLength(6);
  expect(s.starter).toBe(true);
  errors.assertClean('gear migration');
});

test('equip, swap between shinobi, level with Ryo, salvage', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S'), invEntry('g-sakura', 'sakura_794', 80, '6S')],
    blazing_resources_v1: { ryo: 100000, ninja_pearls: 0, shinobites: 0, granny_coin: 0 },
    blazing_gear_v2: { seq: 3, starter: true, bag: {
      a: piece('a', 'weapon', 4, 0, 'atk', [['critRate', 2.4], ['critDmg', 4.8], ['hp', 280]]),
      b: piece('b', 'weapon', 0, 0, 'atk', [['def', 6]]),
    }, equip: {} },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  const r = await page.evaluate(() => {
    const G = window.Gear;
    const out = {};
    out.e1 = G.equip('g-naruto', 'a').ok;
    out.naruto = G.info('g-naruto', 'weapon').id;
    // equipping it on Sakura takes it off Naruto
    out.e2 = G.equip('g-sakura', 'a');
    out.naruto2 = G.info('g-naruto', 'weapon').empty;
    out.sakura = G.info('g-sakura', 'weapon').id;
    // level +0 → +3 adds a 4th substat (Red starts with 3)
    out.lv = G.strengthen('g-sakura', 'weapon', 3);
    out.subs = G.item('a').subs.length;
    out.level = G.item('a').level;
    // a piece in use can't be salvaged; a spare one can
    out.salvageWorn = G.salvage('a').ok;
    out.salvage = G.salvage('b');
    out.bag = Object.keys(G.get().bag);
    return out;
  });
  expect(r.e1).toBe(true);
  expect(r.naruto).toBe('a');
  expect(r.e2).toMatchObject({ ok: true, from: 'g-naruto' });
  expect(r.naruto2).toBe(true);
  expect(r.sakura).toBe('a');
  expect(r.lv.ok).toBe(true);
  expect(r.level).toBe(3);
  expect(r.subs).toBe(4);
  expect(r.salvageWorn).toBe(false);
  expect(r.salvage.ok).toBe(true);
  expect(r.bag).toEqual(['a']);
  const cost = [0, 1, 2].reduce((sum, l) => sum + G.levelCost(l, 4), 0);
  expect((await wallet(page)).ryo).toBe(100000 - cost + r.salvage.ryo);
  expect((await gearSave(page)).equip).toEqual({ 'g-sakura': { weapon: 'a' } });
  errors.assertClean('gear equip');
});

test('the Equipment tab: bag, equip from it, level up', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S')],
    blazing_resources_v1: { ryo: 100000, ninja_pearls: 0, shinobites: 0, granny_coin: 0 },
    blazing_gear_v2: { seq: 2, starter: true, bag: {
      h1: piece('h1', 'helmet', 2, 0, 'hp', [['atkPct', 2.1], ['spd', 1]]),
      h2: piece('h2', 'helmet', 5, 0, 'hp', [['critRate', 2.6], ['atkPct', 3.3], ['defPct', 4]]),
    }, equip: { 'g-naruto': { helmet: 'h1' } } },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  await page.locator('.char-grid .char-slot[data-uid="g-naruto"]').click();
  await page.locator('.char-tabs .tab-btn[data-tab="gear"]').click();
  const gear = page.locator('#tab-gear');
  await expect(gear.locator('.eqp-piece[data-slot="helmet"] .eqp-lv')).toHaveText('+0');
  await expect(gear.locator('.eqp-piece[data-slot="weapon"]')).toHaveClass(/is-empty/);
  await expect(gear.locator('.eqp-detail')).toContainText('Jonin ANBU Mask');
  await expect(gear.locator('.eqp-detail .eqp-sub')).toHaveCount(3);   // 2 substats + the locked line

  // Level up from the tab
  await gear.locator('[data-act="lv1"]').click();
  await expect(gear.locator('.eqp-piece[data-slot="helmet"] .eqp-lv')).toHaveText('+1');

  // Change → pick the Red Shiny piece → Equip
  await gear.locator('[data-act="bag"]').click();
  await expect(gear.locator('.eqp-card')).toHaveCount(2);
  await expect(gear.locator('.eqp-card').first()).toHaveAttribute('data-id', 'h2');   // best first
  await gear.locator('.eqp-card[data-id="h2"]').click();
  await gear.locator('[data-act="equip"]').click();
  await expect(gear.locator('.eqp-piece[data-slot="helmet"]')).toHaveClass(/is-shiny/);
  await expect(gear.locator('.eqp-detail')).toContainText('Super Kage Oni Mask');
  expect((await gearSave(page)).equip['g-naruto'].helmet).toBe('h2');
  errors.assertClean('equipment tab gear');
});

test('each gear slot takes only its magatama type; sandals take none', async ({ page }) => {
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
  expect(res).toEqual({ helmet: ['life'], weapon: ['attack'], armor: ['defense'], scroll: ['ninjutsu'], necklace: ['resistance'], sandals: [] });
});

test('gear stats apply in battle: flat, percent, speed, crit, and the scroll raises jutsu damage', async ({ page }) => {
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
    blazing_gear_v2: { seq: 5, starter: true, bag: {
      h: piece('h', 'helmet', 5, 15, 'hp', [['atkPct', 6]]),
      w: piece('w', 'weapon', 4, 12, 'atk', [['critRate', 5], ['critDmg', 10]]),
      a: piece('a', 'armor', 3, 6, 'hpPct', []),
      s: piece('s', 'scroll', 5, 15, 'nin', []),
      b: piece('b', 'sandals', 5, 15, 'spd', [['def', 20]]),
    }, equip: { 't-naruto': { helmet: 'h', weapon: 'w', armor: 'a', scroll: 's', sandals: 'b' } } },
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
      return { maga: s.magatama, maxHP: s.maxHP, atk: s.atk, def: s.def, speed: s.speed, critRate: s.critRate || 0, critDmg: s.critDmg || 0, plain };
    });
  });
  const hpFlat = G.mainValue('hp', 5, 15);
  const hpPct = G.mainValue('hpPct', 3, 6);
  const atkFlat = G.mainValue('atk', 4, 12);
  const nin = G.mainValue('nin', 5, 15);
  const p = r[0].plain;
  expect(r[0].maxHP).toBe(p.maxHP + hpFlat + Math.round(p.hp * hpPct / 100));
  expect(r[0].atk).toBe(p.atk + atkFlat + Math.round(p.atk * 6 / 100));
  expect(r[0].def).toBe(p.def + 20);
  expect(r[0].speed).toBeCloseTo(p.speed + G.mainValue('spd', 5, 15), 5);
  expect(r[0].critRate).toBe(5);
  expect(r[0].critDmg).toBe(10);
  expect(r[0].maga.nin).toBe(nin);
  // The other unit wears nothing
  expect(r[1].maxHP).toBe(r[1].plain.maxHP);

  // Jutsu damage with the scroll's +18% vs. without, same rolls
  const dmg = await page.evaluate(() => {
    const bm = window.BattleManager, C = window.BattleCombat;
    const a = bm.activeTeam[0], d = bm.enemyTeam[0];
    const hit = (n) => {
      const keep = a.stats.magatama;
      a.stats.magatama = { ...keep, nin: n };
      window.__fixedRandom = 0.5;
      try {
        // previewDamage runs on the page RNG; route it through a jutsu ctx
        return C.previewDamage.call({ calculateDamage: (x, y, m) => C.calculateDamage(x, y, m, { kind: 'jutsu' }) }, a, d, 1).damage;
      } finally { window.__fixedRandom = null; a.stats.magatama = keep; }
    };
    return { with: hit(a.stats.magatama.nin), without: hit(0) };
  });
  expect(dmg.without).toBeGreaterThan(0);
  expect(dmg.with / dmg.without).toBeCloseTo(1 + nin / 100, 2);
  errors.assertClean('battle gear');
});

test('missions drop gear into the bag', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { blazing_inventory_v2: [invEntry('g-naruto', 'naruto_2115', 80, '7S')] });
  await page.goto('/characters.html');
  await waitForLoader(page);
  const r = await page.evaluate(() => {
    const G = window.Gear;
    const before = G.bagCount();
    const drop = G.roll({ slot: 'necklace', rarity: 4, set: 'sound' });
    // what battle-rewards.js does with a chest's `gear` list
    const added = G.add(drop);
    const tiles = window.RewardFormat ? window.RewardFormat.items({ ryo: 100, gear: [drop] }) : null;
    return { before, after: G.bagCount(), added: !!added, tiles: tiles && tiles.map((t) => [t.kind, t.name]) };
  });
  expect(r.after).toBe(r.before + 1);
  expect(r.added).toBe(true);
  if (r.tiles) expect(r.tiles).toContainEqual(['gear', 'Hidden Sound Serpent Necklace']);
  errors.assertClean('gear drops');
});
