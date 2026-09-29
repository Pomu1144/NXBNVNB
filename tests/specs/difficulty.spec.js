// Mission difficulty (js/battle/battle-difficulty.js): enemies are sized to
// each mission rank's recommended power and must get harder through a
// mission, across ranks and along the story.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { REPO_ROOT, readJSON } = require('../helpers');

const D = require(path.join(REPO_ROOT, 'js/battle/battle-difficulty.js'));
const missions = readJSON('data/missions.json');
const RANK_ORDER = ['D', 'C', 'B', 'A', 'S', 'SS'];

const scaled = (m, rank, si, wi, e) => {
  const stages = m.difficulties[rank];
  const waves = stages[si].waves || [];
  const base = { id: e.id, stats: { hp: e.hp || 800, atk: e.atk || 80, def: e.def || 0 } };
  const t = D.targetStats(m, rank, base, e, { stageIndex: si, stageCount: stages.length, waveIndex: wi, waveCount: waves.length });
  return { ...t, hp: Math.max(base.stats.hp, t.hp), atk: Math.max(base.stats.atk, t.atk) };
};
const entries = (m, rank, si) => (m.difficulties[rank][si].waves || [])
  .flatMap((w, wi) => (w.enemies || []).filter((e) => e && typeof e === 'object' && !e.giant).map((e) => ({ e, wi })));

test.describe('mission difficulty', () => {
  test('every mission rank has a recommended power to scale from', () => {
    const missing = missions.flatMap((m) => Object.keys(m.difficulties || {})
      .filter((r) => !(m.power?.[r] > 0)).map((r) => `${m.id}:${r}`));
    expect(missing).toEqual([]);
  });

  test('enemies threaten the unit the rank was built for', () => {
    const weak = [];
    for (const m of missions) for (const rank of Object.keys(m.difficulties || {})) {
      const ref = D.referenceUnit(m.power[rank]);
      m.difficulties[rank].forEach((_, si) => entries(m, rank, si).forEach(({ e, wi }) => {
        const s = scaled(m, rank, si, wi, e);
        // a grunt must need no more than ~15 hits to KO the reference unit, a boss ~6
        if (ref.hp / s.atk > (s.boss ? 6 : 15)) weak.push(`${m.id}:${rank} s${si + 1} ${e.id}`);
      }));
    }
    expect(weak).toEqual([]);
  });

  test('enemies get stronger through a mission (later stages hit harder)', () => {
    const flat = [];
    for (const m of missions) for (const rank of Object.keys(m.difficulties || {})) {
      const stages = m.difficulties[rank];
      if (stages.length < 2) continue;
      const peak = (si) => Math.max(0, ...entries(m, rank, si).map(({ e, wi }) => scaled(m, rank, si, wi, e).atk));
      if (peak(stages.length - 1) < peak(0)) flat.push(`${m.id}:${rank}`);
    }
    expect(flat).toEqual([]);
  });

  test('bosses outclass the grunts of their mission rank', () => {
    const soft = [];
    for (const m of missions) for (const rank of Object.keys(m.difficulties || {})) {
      m.difficulties[rank].forEach((_, si) => {
        const all = entries(m, rank, si).map(({ e, wi }) => scaled(m, rank, si, wi, e));
        const bosses = all.filter((s) => s.boss), grunts = all.filter((s) => !s.boss);
        if (!bosses.length || !grunts.length) return;
        const g = Math.max(...grunts.map((s) => s.hp));
        if (bosses.some((b) => b.hp <= g)) soft.push(`${m.id}:${rank} s${si + 1}`);
      });
    }
    expect(soft).toEqual([]);
  });

  test('higher ranks of a mission are harder', () => {
    const wrong = [];
    for (const m of missions) {
      const ranks = RANK_ORDER.filter((r) => m.difficulties?.[r]?.length);
      const bossAtk = (r) => Math.max(0, ...m.difficulties[r].flatMap((_, si) =>
        entries(m, r, si).map(({ e, wi }) => scaled(m, r, si, wi, e).atk)));
      for (let i = 1; i < ranks.length; i++) {
        const lo = bossAtk(ranks[i - 1]), hi = bossAtk(ranks[i]);
        if (!lo || !hi) continue; // giant-only boss battles keep data/bosses.json sizing
        if (hi <= lo) wrong.push(`${m.id}: ${ranks[i - 1]} → ${ranks[i]}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('the story gets harder chapter by chapter', () => {
    const story = missions.filter((m) => /^Shinobi Chronicles/.test(m.category))
      .sort((a, b) => (/Part 1/.test(a.category) ? 0 : 1) - (/Part 1/.test(b.category) ? 0 : 1) || (a.sortOrder || 0) - (b.sortOrder || 0));
    const dips = [];
    for (const rank of ['C', 'B', 'A']) {
      for (let i = 1; i < story.length; i++) {
        if (story[i].power[rank] < story[i - 1].power[rank]) dips.push(`${story[i - 1].id} → ${story[i].id} (${rank})`);
      }
    }
    expect(dips).toEqual([]);
  });
});
