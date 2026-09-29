// 4. Battle: seeded team of animated units on a non-story mission.
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, allStorySeen, collectErrors, pickPlainMission, waitForLoader } = require('../helpers');

// Four units that have battle spritesheets (js/sprite-player.js REGISTRY).
const TEAM = [
  ['t-naruto', 'naruto_2115', '7S'],
  ['t-minato', 'minato_2101', '6S'],
  ['t-kakashi', 'kakashi_705', '6S'],
  ['t-sasuke', 'sasuke_2117', '7S'],
];

const { mission, rank } = pickPlainMission();

async function openBattle(page, extra = {}) {
  const slots = {};
  TEAM.forEach(([uid, charId], i) => { slots[`front-${i + 1}`] = { uid, charId }; });
  await seedSave(page, {
    blazing_inventory_v2: TEAM.map(([uid, charId, tier]) => invEntry(uid, charId, 80, tier)),
    blazing_teams_v1: { 1: slots },
    currentMissionId: mission.id,
    currentDifficulty: rank,
    blazing_story_seen_v1: allStorySeen(),
    // A known wallet so reward deltas are easy to read.
    blazing_resources_v1: { ryo: 1000, ninja_pearls: 10, shinobites: 0, granny_coin: 0 },
    ...extra,
  });
  await page.goto('/battle.html');
  await waitForLoader(page, 45_000);
  // Field is up: both teams built and the speed gauge ticking.
  await page.waitForFunction(() => {
    const bm = window.BattleManager;
    return bm && bm.missionData && bm.activeTeam && bm.activeTeam.length > 0 && bm.enemyTeam && bm.enemyTeam.length > 0;
  }, null, { timeout: 45_000 });
}

const readWallet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_resources_v1') || '{}'));

test.describe(`battle on ${mission.id} (${rank})`, () => {
  test.describe.configure({ timeout: 120_000 });

  test('team and enemies render; forced win grants rewards', async ({ page }) => {
    const errors = collectErrors(page);
    await openBattle(page);

    const info = await page.evaluate(() => {
      const bm = window.BattleManager;
      return {
        mission: bm.missionData.id,
        players: bm.activeTeam.map((u) => ({ id: u.id, charId: u.charId, hp: u.stats.hp, sprite: !!u._sprite })),
        enemies: bm.enemyTeam.length,
      };
    });
    expect(info.mission).toBe(mission.id);
    // Every seeded unit made it onto the field (no fallback team).
    expect(info.players.map((p) => p.charId)).toEqual(TEAM.map((t) => t[1]));
    for (const p of info.players) expect(p.hp, `${p.charId} hp`).toBeGreaterThan(0);

    // Units are in the DOM and visible.
    const playerEls = page.locator('#battle-scene .battle-unit');
    await expect(playerEls.first()).toBeVisible();
    expect(await playerEls.count()).toBeGreaterThanOrEqual(TEAM.length + info.enemies);
    // Animated units got a sprite player.
    await page.waitForFunction(() => window.BattleManager.activeTeam.every((u) => u._sprite), null, { timeout: 30_000 });
    await expect(page.locator('#battle-scene .battle-unit .sprite-player').first()).toBeVisible();

    const before = await readWallet(page);

    // Force a win wave by wave until the results screen shows.
    const deadline = Date.now() + 90_000;
    let waves = 0;
    while (Date.now() < deadline) {
      if (await page.locator('#results-screen, #battle-result:not(.hidden)').count()) break;
      const killed = await page.evaluate(() => {
        const bm = window.BattleManager;
        const alive = (bm.enemyTeam || []).filter((e) => e.stats.hp > 0);
        if (!alive.length) return false;
        alive.forEach((e) => { e.stats.hp = 0; });
        bm.checkBattleEnd();
        return true;
      });
      if (killed) waves++;
      await page.waitForTimeout(500);
    }
    await expect(page.locator('#results-screen')).toBeVisible({ timeout: 15_000 });
    const totalWaves = (mission.difficulties[rank] || []).reduce((n, s) => n + (s.waves || []).length, 0);
    expect(waves).toBe(totalWaves);

    // Rewards were granted and persisted.
    await expect.poll(async () => (await readWallet(page)).ryo || 0).toBeGreaterThan(before.ryo);
    const after = await readWallet(page);
    const firstTime = (mission.clearRewards && mission.clearRewards[rank] && mission.clearRewards[rank].firstTime) || {};
    for (const [id, n] of Object.entries(firstTime)) {
      if (!(Number(n) > 0)) continue;
      const key = id === 'pearls' ? 'ninja_pearls' : id;
      expect(after[key] || 0, `first-clear reward ${id}`).toBeGreaterThanOrEqual((before[key] || 0) + Number(n));
    }
    // Mission marked complete.
    const progress = await page.evaluate(() => Object.keys(localStorage).filter((k) => /mission/i.test(k)).map((k) => localStorage.getItem(k)).join('\n'));
    expect(progress).toContain(mission.id);

    errors.assertClean('battle');
  });

  test('a real player drag attack damages an enemy', async ({ page }) => {
    const errors = collectErrors(page);
    // Collapse the action panel (js/battle/battle-action-panel-toggle.js):
    // expanded, it can cover a unit of the random formation on the left.
    await openBattle(page, {
      battle_action_panel_collapsed_v1_desktop: '1',
      battle_action_panel_collapsed_v1_mobile: '1',
    });

    // Wait for a player unit's turn (speed gauge), then drop it next to an enemy.
    await page.waitForFunction(() => {
      const bm = window.BattleManager;
      const u = bm.turns && bm.turns.currentUnit;
      return u && u.isPlayer && bm.turns.isPlayerTurn && !bm.isPaused;
    }, null, { timeout: 60_000 });

    // Where to drop: ask the game's own range prediction (battle-drag.js
    // predictRange, the same call dropAt() uses) for a point that hits.
    const plan = await page.evaluate(() => {
      const bm = window.BattleManager;
      const drag = window.BattleDrag;
      const unit = bm.turns.currentUnit;
      const scene = bm.dom.scene.getBoundingClientRect();
      const el = bm.dom.scene.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      const r = el.getBoundingClientRect();
      // A press point that really lands on the unit (nothing on top of it).
      let from = null;
      for (let fy = 0.5; fy <= 0.9 && !from; fy += 0.1) {
        for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (hit && el.contains(hit)) { from = { x, y }; break; }
        }
      }
      const prev = drag.draggingUnit;
      drag.draggingUnit = unit;
      let drop = null;
      try {
        for (const e of bm.enemyTeam.filter((x) => x.stats.hp > 0)) {
          const g = drag.groundPoint(e, bm, scene);
          if (!g) continue;
          for (let dx = -40; dx >= -220 && !drop; dx -= 10) {
            for (const dy of [0, -20, -40, -60, -80, 20]) {
              const x = scene.left + g.x + dx;
              const y = scene.top + g.y + dy;
              const pred = drag.predictRange('move', x, y, bm);
              if (pred.action === 'attack' && pred.main.length) { drop = { x, y }; break; }
            }
          }
          if (drop) break;
        }
      } finally { drag.draggingUnit = prev; }
      window.__hpBefore = bm.enemyTeam.map((e) => e.stats.hp);
      return { unit: unit.name, from, drop, sprite: !!unit._sprite };
    });
    expect(plan.from, `${plan.unit} is uncovered and can be pressed`).toBeTruthy();
    expect(plan.drop, `drop point for ${plan.unit}`).toBeTruthy();
    expect(plan.sprite, `${plan.unit} is an animated unit`).toBe(true);

    // Pointer drag through the game's own handlers (battle-units.js
    // pointerdown -> BattleDrag.handleSpritePointerDown / spriteDragMove /
    // spriteDragUp -> dropAt). The events are dispatched in one task: with
    // page.mouse a busy main thread (software GL on CI) can delay the first
    // move past the 450 ms long-press of battle-unit-info.js, which then
    // opens the unit panel instead of dragging.
    const dragged = await page.evaluate(({ from, drop }) => {
      const bm = window.BattleManager;
      const unit = bm.turns.currentUnit;
      const el = bm.dom.scene.querySelector(`.battle-unit[data-unit-id="${unit.id}"]`);
      const target = document.elementFromPoint(from.x, from.y);
      const opts = (x, y, type) => ({
        bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
        button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
      });
      target.dispatchEvent(new PointerEvent('pointerdown', opts(from.x, from.y, 'pointerdown')));
      if (!window.BattleDrag.spriteDrag) return 'pointerdown did not start a sprite drag';
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((drop.x - from.x) * i) / steps;
        const y = from.y + ((drop.y - from.y) * i) / steps;
        el.dispatchEvent(new PointerEvent('pointermove', opts(x, y, 'pointermove')));
      }
      el.dispatchEvent(new PointerEvent('pointerup', opts(drop.x, drop.y, 'pointerup')));
      return null;
    }, plan);
    expect(dragged).toBeNull();

    const handle = await page.waitForFunction(() => {
      const bm = window.BattleManager;
      const hit = bm.enemyTeam.map((e, i) => ({ name: e.name, from: window.__hpBefore[i], to: e.stats.hp })).filter((d) => d.to < d.from);
      return hit.length ? hit : null;
    }, null, { timeout: 20_000 });
    const result = { damaged: await handle.jsonValue() };

    expect(result.damaged.length).toBeGreaterThan(0);
    for (const d of result.damaged) expect(d.to).toBeLessThan(d.from);

    errors.assertClean('battle drag');
  });
});
