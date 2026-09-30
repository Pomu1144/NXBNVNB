// Shinobi Chronicles boss unit drop (js/mission-progress.js rollChronicleUnit):
// the hardest rank's first clear always gives the chapter's featured unit;
// lower first clears and harder replays only give a chance at it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, readJSON } = require('../helpers');

function load() {
  const added = [];
  const files = { 'data/missions.json': readJSON('data/missions.json'), 'data/characters.json': readJSON('data/characters.json') };
  const win = {
    InventoryChar: { addCopy: (id, n, tier) => added.push([id, tier]) },
  };
  const ctx = {
    window: win, console,
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async (url) => ({ ok: true, json: async () => files[url] }),
  };
  vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'js/mission-progress.js'), 'utf8'), ctx);
  return { MP: win.MissionProgress, added };
}

const chapter = (() => {
  const all = readJSON('data/missions.json');
  return (Array.isArray(all) ? all : all.missions).find((m) => /^Shinobi Chronicles/.test(m.category) && m.feature);
})();
const ranks = Object.keys(chapter.rankNames || chapter.power);
const hardest = ranks[ranks.length - 1];
const lower = ranks[0];

test('first clear of the hardest rank always gives the featured unit', async () => {
  const { MP, added } = load();
  const unit = await MP.rollChronicleUnit(chapter.id, hardest, true, () => 0.999);
  expect(unit).toMatchObject({ characterId: chapter.feature, guaranteed: true });
  expect(added).toEqual([[chapter.feature, unit.tierCode]]);
});

test('lower-rank first clears only give a chance', async () => {
  const { MP, added } = load();
  const p = MP.CHRONICLE_DROP.firstClear[lower];
  expect(p).toBeGreaterThan(0);
  expect(p).toBeLessThan(1);
  expect(await MP.rollChronicleUnit(chapter.id, lower, true, () => p + 0.01)).toBeNull();
  const hit = await MP.rollChronicleUnit(chapter.id, lower, true, () => p - 0.01);
  expect(hit).toMatchObject({ characterId: chapter.feature, guaranteed: false });
  expect(added.length).toBe(1);
});

test('replays give a chance only on the harder ranks', async () => {
  const { MP } = load();
  expect(await MP.rollChronicleUnit(chapter.id, lower, false, () => 0)).toBeNull();
  const unit = await MP.rollChronicleUnit(chapter.id, hardest, false, () => 0);
  expect(unit).toMatchObject({ characterId: chapter.feature, guaranteed: false });
  expect(await MP.rollChronicleUnit(chapter.id, hardest, false, () => 0.99)).toBeNull();
});

test('non-chronicle missions never drop a unit', async () => {
  const { MP } = load();
  const all = readJSON('data/missions.json');
  const other = (Array.isArray(all) ? all : all.missions).find((m) => !/^Shinobi Chronicles/.test(m.category));
  const r = Object.keys(other.power || { C: 1 });
  expect(await MP.rollChronicleUnit(other.id, r[r.length - 1], true, () => 0)).toBeNull();
});
