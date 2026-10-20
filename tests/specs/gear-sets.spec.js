// Gear sets (js/gear.js SETS): six themed sets with a 2-piece stat and a
// 4-piece battle effect, the Set Trials missions that farm them
// (data/missions.json, category "Set Trials", field gearSet) and the
// last-stage set drop (js/battle/battle-rewards.js awardStageChest).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, seedSave, invEntry, collectErrors, waitForLoader } = require('../helpers');

const SLOTS = ['helmet', 'weapon', 'armor', 'scroll', 'necklace', 'sandals'];
const SET_IDS = ['leaf', 'akatsuki', 'sand', 'sound', 'mist', 'hokage'];

function loadGear(store = {}) {
  const win = { dispatchEvent() {}, CustomEvent: function () {} };
  const ctx = {
    window: win, console, CustomEvent: function () {}, Math: Object.create(Math),
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/gear.js'), 'utf8'), ctx);
  return win.Gear;
}
const setPiece = (id, slot, set, rarity = 4) => ({ id, slot, rarity, level: 0, main: slot === 'weapon' ? 'atk' : 'hp', subs: [], set });
const wearing = (sets) => {
  const bag = {}, equip = { u: {} };
  sets.forEach((set, i) => { const slot = SLOTS[i]; bag['p' + i] = setPiece('p' + i, slot, set); equip.u[slot] = 'p' + i; });
  return { blazing_gear_v2: JSON.stringify({ seq: 9, starter: true, bag, equip }) };
};

test('sets: names, art for every piece, rolled pieces carry a set', () => {
  const G = loadGear();
  expect(G.SET_IDS).toEqual(SET_IDS);
  for (const set of SET_IDS) {
    for (const slot of SLOTS) {
      const art = G.artOf(slot, 3, set);
      expect(art).toBe(`assets/gear/sets/${set}_${slot}.webp`);
      expect(fs.existsSync(path.join(REPO_ROOT, art)), art).toBe(true);
    }
  }
  expect(G.nameOf('weapon', 4, 'akatsuki')).toBe('Akatsuki Greatsword');
  // Plain pieces keep the rarity art and names
  expect(G.artOf('helmet', 3)).toBe('assets/gear/art/orange_helmet.webp');
  expect(G.roll({ slot: 'helmet', set: 'mist' }).set).toBe('mist');
  expect(G.roll({ slot: 'helmet', set: null }).set).toBeFalsy();
  expect(SET_IDS).toContain(G.roll({ slot: 'helmet' }).set);
});

test('sets: 2 pieces add the set stat, 4 pieces turn on the effect', () => {
  const two = loadGear(wearing(['leaf', 'leaf', 'sand']));
  expect(two.setCounts('u')).toEqual({ leaf: 2, sand: 1 });
  expect(two.activeSets('u').map((b) => `${b.set}${b.pieces}`)).toEqual(['leaf2']);
  expect(two.bonusFor('u').hpPct).toBeGreaterThanOrEqual(12);

  const four = loadGear(wearing(['akatsuki', 'akatsuki', 'akatsuki', 'akatsuki', 'sand', 'sand']));
  expect(four.activeSets('u').map((b) => `${b.set}${b.pieces}`).sort()).toEqual(['akatsuki2', 'akatsuki4', 'sand2']);
  const stats = { hp: 100, maxHP: 100 };
  four.applyToStats(stats, { uid: 'u' });
  expect([...stats.gearSets4]).toEqual(['akatsuki']);

  // 4-piece effects in calculateDamage (js/battle/battle-combat.js)
  const full = (sets, extra = {}) => ({ stats: { hp: 100, maxHP: 100, gearSets4: sets }, ...extra });
  const low = (sets) => ({ stats: { hp: 30, maxHP: 100, gearSets4: sets } });
  const foe = full([]);
  expect(four.setDamageMod(full(['akatsuki']), foe, { kind: 'jutsu' })).toBeCloseTo(1.2);
  expect(four.setDamageMod(full(['akatsuki']), foe, { kind: 'attack' })).toBe(1);
  expect(four.setDamageMod(full(['akatsuki']), foe, null)).toBe(1); // basic attacks pass no ctx
  expect(four.setDamageMod(full(['leaf']), foe, {})).toBeCloseTo(1.18);
  expect(four.setDamageMod(low(['leaf']), foe, {})).toBe(1);
  expect(four.setDamageMod(low(['sound']), foe, {})).toBeCloseTo(1.25);
  expect(four.setDamageMod(full(['mist']), foe, {})).toBeCloseTo(1.2);
  expect(four.setDamageMod(full(['mist']), low([]), {})).toBe(1);
  expect(four.setDamageMod(full(['hokage']), full([], { isMissionBoss: true }), {})).toBeCloseTo(1.2);
  expect(four.setDamageMod(full([]), full(['sand']), {})).toBeCloseTo(0.85);
});

test('set trials: one piece of the set per run, two on featured days, rarer on harder ranks', () => {
  const G = loadGear();
  const day = new Date('2026-10-20T12:00:00Z');
  const feat = G.featuredSets(day);
  expect(feat).toHaveLength(2);
  expect(new Set(feat).size).toBe(2);
  const other = SET_IDS.find((s) => !feat.includes(s));
  expect(G.rollTrialDrop(feat[0], 'A', day)).toHaveLength(2);
  const one = G.rollTrialDrop(other, 'A', day);
  expect(one).toHaveLength(1);
  expect(one[0].set).toBe(other);
  // Every set is featured at some point in a week
  const seen = new Set();
  for (let d = 0; d < 7; d++) G.featuredSets(new Date(day.getTime() + d * 86400000)).forEach((s) => seen.add(s));
  expect([...seen].sort()).toEqual([...SET_IDS].sort());
  const avg = (rank) => { let s = 0; for (let i = 0; i < 2000; i++) s += G.rollTrialDrop(other, rank, day)[0].rarity; return s / 2000; };
  expect(avg('B')).toBeLessThan(avg('A'));
  expect(avg('A')).toBeLessThan(avg('S'));
  expect(avg('S')).toBeLessThan(avg('SS'));
});

test('set trials: six missions, one per set, valid enemies and art', () => {
  const missions = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/missions.json'), 'utf8'));
  const trials = missions.filter((m) => m.category === 'Set Trials');
  expect(trials.map((m) => m.gearSet).sort()).toEqual([...SET_IDS].sort());
  for (const m of trials) {
    expect(Object.keys(m.difficulties)).toEqual(['B', 'A', 'S', 'SS']);
    expect(fs.existsSync(path.join(REPO_ROOT, m.banner)), m.banner).toBe(true);
    for (const stages of Object.values(m.difficulties)) {
      expect(stages[stages.length - 1].boss).toBe(m.feature);
      for (const s of stages) {
        expect(fs.existsSync(path.join(REPO_ROOT, s.map)), s.map).toBe(true);
        s.waves.forEach((w) => w.enemies.forEach((e) => expect(m.cast[e.id], e.id).toBeTruthy()));
      }
    }
  }
});

test('set trials: the last stage chest drops pieces of the set', async () => {
  const G = loadGear();
  const win = { Gear: G };
  const ctx = { window: win, console: { log() {}, warn() {} }, document: { getElementById: () => ({}), createElement: () => ({}) }, Image: function () {} };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/battle/battle-rewards.js'), 'utf8'), ctx);
  const BR = win.BattleRewards || ctx.BattleRewards;
  BR.showChestOnMap = () => {};
  BR.delay = async () => {};
  const core = { difficulty: 'S', missionData: { gearSet: 'hokage', difficulties: { S: [{}, {}, {}] } } };
  await BR.awardStageChest({ rewards: { ryo: 10 } }, 2, core);
  const gear = BR.currentStageChest.rewards.gear;
  expect(gear.length).toBeGreaterThanOrEqual(1);
  gear.forEach((it) => expect(it.set).toBe('hokage'));
});

test('missions page: Set Trials tab, set chip, set drop block', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {});
  await page.goto('/missions.html');
  await waitForLoader(page);
  await page.locator('.mission-tabs .tab-btn[data-name="Set Trials"]').click();
  await expect(page.locator('.mission-card')).toHaveCount(6);
  await expect(page.locator('.mission-card .mc-trial')).toHaveCount(6);
  await expect(page.locator('.mission-card .mc-trial b')).toHaveCount(2); // two featured today
  await page.locator('.mission-card[data-mission-id="trial_akatsuki"]').click();
  const block = page.locator('.mission-modal .md-trial');
  await expect(block).toContainText('Akatsuki');
  await expect(block).toContainText('4 pc');
  await expect(block.locator('.md-odds-r').first()).toBeVisible();
  errors.assertClean('set trials');
});

test('equipment tab: worn set bonuses and the piece set line', async ({ page }) => {
  const errors = collectErrors(page);
  const bag = {};
  const equip = { 'e-naruto': {} };
  SLOTS.slice(0, 4).forEach((slot, i) => { bag['m' + i] = setPiece('m' + i, slot, 'mist'); equip['e-naruto'][slot] = 'm' + i; });
  await seedSave(page, {
    blazing_inventory_v2: [invEntry('e-naruto', 'naruto_2115', 80, '7S')],
    blazing_gear_v2: { seq: 9, starter: true, bag, equip },
  });
  await page.goto('/characters.html');
  await waitForLoader(page);
  await page.locator('.char-grid .char-slot[data-uid="e-naruto"]').click();
  await page.locator('.char-tabs .tab-btn[data-tab="gear"]').click();
  await expect(page.locator('#tab-gear .eqp-setrow')).toHaveCount(2);
  await expect(page.locator('#tab-gear .eqp-sets')).toContainText('Hidden Mist 4 pc');
  await expect(page.locator('#tab-gear .eqp-piece[data-slot="helmet"] img')).toHaveAttribute('src', 'assets/gear/sets/mist_helmet.webp');
  await page.locator('#tab-gear .eqp-piece[data-slot="helmet"]').click();
  await expect(page.locator('#tab-gear .eqp-detail .eqp-set')).toContainText('4/4');
  await expect(page.locator('#tab-gear .eqp-detail .eqp-set-b.is-on')).toHaveCount(2);
  errors.assertClean('equipment sets');
});
