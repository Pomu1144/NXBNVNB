// 8. Teams drag & drop with a finger (phone project, Ink style).
// Press and hold a unit, carry it, release. Covers:
// - roster -> Commander: the Commander slot sits below the formation panel's
//   fold on phones, so holding at the panel's edge must scroll the panel (not
//   the page), and stop once the slot is in view so it can be dropped on
// - slot <-> slot swap, and slot -> roster removes
// - iOS Safari sends pointercancel once a held finger moves; a started drag
//   must keep following the finger (touch events) instead of being dropped
const { test, expect } = require('@playwright/test');
const { seedSave, invEntry, waitForLoader, collectErrors } = require('../helpers');

const UNITS = [
  ['u0', 'naruto_2115'], ['u1', 'sasuke_2117'], ['u2', 'itachi_2200'], ['u3', 'minato_2101'],
  ['u4', 'kakashi_855'], ['u5', 'naruto_001'], ['u6', 'sasuke_004'],
];
const SIZES = [[852, 393], [568, 320]];

async function open(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await seedSave(page, {
    blazing_ui_theme_v1: 'ink',
    blazing_inventory_v2: UNITS.map(([uid, charId]) => invEntry(uid, charId, 60, '6S')),
    blazing_teams_v1: { 1: { 'front-1': { uid: 'u0', charId: 'naruto_2115' }, 'front-2': { uid: 'u1', charId: 'sasuke_2117' } } },
  });
  await page.goto('/teams.html');
  await waitForLoader(page);
  await page.waitForTimeout(800);
  await page.evaluate(() => document.addEventListener('pointerdown', (e) => { window.__pid = e.pointerId; }, true));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // press and hold (a little finger jitter), optionally have the browser cancel
  // the pointer the way iOS does, then carry
  const pickUp = async (from, iosCancel) => {
    await touch('touchStart', from);
    for (let k = 0; k < 4; k++) { await page.waitForTimeout(60); await touch('touchMove', { x: from.x + (k % 2 ? 2 : -1), y: from.y + 1 }); }
    await page.waitForTimeout(120);
    if (iosCancel) await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.__pid, pointerType: 'touch', bubbles: true })));
  };
  const carry = async (from, to, steps = 12) => {
    for (let i = 1; i <= steps; i++) { await touch('touchMove', { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }); await page.waitForTimeout(16); }
  };
  const team = () => page.evaluate(() => JSON.parse(localStorage.getItem('blazing_teams_v1') || '{}')[1] || {});
  return { touch, center, pickUp, carry, team };
}

test.describe('teams: touch drag and drop', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'phone', 'touch only'); });
  test.describe.configure({ timeout: 90_000 });

  for (const [w, h] of SIZES) for (const iosCancel of [false, true]) {
    const tag = `${w}x${h}${iosCancel ? ' (iOS pointercancel)' : ''}`;

    test(`roster -> Commander below the fold, ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      const { touch, center, pickUp, carry, team } = await open(page, w, h);
      const card = page.locator('#team-char-grid .team-char-card:not(.assigned)').first();
      const uid = await card.getAttribute('data-uid');
      const from = await center(card);
      const slot = page.locator('.team-slot[data-slot="commander"]');
      const panel = await page.locator('.team-formation').boundingBox();
      const sb = await slot.boundingBox();
      expect(sb.y + sb.height / 2, 'Commander starts below the panel fold').toBeGreaterThan(panel.y + panel.height);

      await pickUp(from, iosCancel);
      const edge = { x: sb.x + sb.width / 2, y: panel.y + panel.height - 4 };
      await carry(from, edge);
      // hold at the edge: the panel scrolls until the slot is under the finger
      let over = false;
      for (let t = 0; t < 4000 && !over; t += 40) {
        await touch('touchMove', { x: edge.x, y: edge.y + (t % 80 ? 0.5 : 0) });
        await page.waitForTimeout(40);
        over = await page.evaluate(() => document.querySelector('.drag-over')?.dataset.slot === 'commander');
      }
      expect(over, 'Commander highlighted while held at the edge').toBe(true);
      await page.waitForTimeout(300); // it must stay put under the finger
      expect(await page.evaluate(() => document.querySelector('.drag-over')?.dataset.slot)).toBe('commander');
      await touch('touchEnd');
      await page.waitForTimeout(300);
      expect((await team()).commander?.uid).toBe(uid);
      expect(await page.locator('.drag-ghost').count()).toBe(0);
      errors.assertClean('teams touch drag');
    });

    test(`swap two slots, then drag one out to remove it, ${tag}`, async ({ page }) => {
      const { touch, center, pickUp, carry, team } = await open(page, w, h);
      const f1 = page.locator('.team-slot[data-slot="front-1"]');
      const f2 = page.locator('.team-slot[data-slot="front-2"]');
      let from = await center(f1);
      await pickUp(from, iosCancel);
      await carry(from, await center(f2));
      await touch('touchEnd'); await page.waitForTimeout(300);
      let t = await team();
      expect(t['front-1']?.uid).toBe('u1');
      expect(t['front-2']?.uid).toBe('u0');

      from = await center(f1);
      await pickUp(from, iosCancel);
      await carry(from, await center(page.locator('#team-char-grid')));
      await touch('touchEnd'); await page.waitForTimeout(300);
      t = await team();
      expect(t['front-1']).toBeFalsy();
      expect(t['front-2']?.uid).toBe('u0');
    });
  }

  test('a quick swipe on the roster scrolls it and does not pick a unit up', async ({ page }) => {
    const { touch, center, team } = await open(page, 852, 393);
    const grid = page.locator('#team-char-grid');
    const before = await team();
    const c = await center(grid);
    await touch('touchStart', c);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', { x: c.x, y: c.y - i * 12 }); await page.waitForTimeout(16); }
    await touch('touchEnd'); await page.waitForTimeout(300);
    expect(await page.locator('.drag-ghost').count()).toBe(0);
    expect(await team()).toEqual(before);
  });
});
