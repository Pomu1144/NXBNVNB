// In-battle check of a produced sprite unit.
//   python3 -m http.server 8765   (repo root)
//   node tools/sprites/produce/verify_battle.js <charId> [outDir]
// Adds the unit through the dev-panel button (#chardev-add-<charId>), puts it
// in front-1, then in battle: idle, run while dragged, normal attack, jutsu and
// ultimate through the action panel (counts damage numbers vs the sheet hits),
// hit reaction from an enemy attack and the KO stand-in. Screenshots go to outDir.
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const CID = process.argv[2];
const OUT = process.argv[3] || '.';
const TIER = process.argv[4] || '6S';
const URL = process.env.BASE_URL || 'http://localhost:8765';
const shot = (p, name, clip) => p.screenshot({ path: path.join(OUT, `vb_${CID}_${name}.png`), clip });

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const report = { charId: CID };

  await p.goto(`${URL}/characters.html`); await p.waitForTimeout(2500);
  await p.click('#chardev-fab'); await p.waitForTimeout(300);
  // dev-panel button when the id has one; other family ids: same helper, tier from argv[4]
  // NOMAX=1: plain Lv80 copy (maxing awakens e.g. 5★/6★ forms into the next id)
  if (process.env.NOMAX) await p.evaluate(([c, t]) => InventoryChar.addCopy(c, 80, t), [CID, TIER]);
  else if (await p.$(`#chardev-add-${CID}`)) await p.click(`#chardev-add-${CID}`);
  else await p.evaluate(([c, t]) => CharDevTools.addSpriteUnit(c, t, c), [CID, TIER]);
  await p.waitForTimeout(800);
  const inst = await p.evaluate(() => InventoryChar.allInstances().pop());
  report.added = { charId: inst.charId, tier: inst.tierCode, level: inst.level };
  await p.evaluate(([u, c]) => localStorage.setItem('blazing_teams_v1', JSON.stringify({ 1: { 'front-1': { uid: u, charId: c } } })), [inst.uid, inst.charId]);
  await p.goto(`${URL}/battle.html`); await p.waitForTimeout(5000);

  const unitId = await p.evaluate(cid => BattleManager.activeTeam.find(u => u && u.charId === cid)?.id, inst.charId);
  const anim = () => p.evaluate(id => { const u = BattleManager.combatants.find(x => x.id === id); return u?._sprite?.el.dataset.anim || null; }, unitId);
  const rect = () => p.evaluate(id => { const r = document.querySelector(`.battle-unit[data-unit-id="${id}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, unitId);
  const clip = async () => { const r = await rect(); return { x: Math.max(0, r.x + r.w / 2 - 220), y: Math.max(0, r.y + r.h - 330), width: 440, height: 380 }; };
  report.sprite = await p.evaluate(id => { const u = BattleManager.combatants.find(x => x.id === id); return { has: !!u?._sprite, path: SpritePlayer.pathFor(u.charId) }; }, unitId);
  report.idle = await anim();
  await shot(p, 'idle', await clip());

  // wait for our turn
  for (let i = 0; i < 100; i++) {
    const ok = await p.evaluate(id => { const c = BattleManager.turns.currentUnit; return !!(c && c.id === id && !c._actionBusy && !BattleManager.turns.isProcessing); }, unitId);
    if (ok) break; await p.waitForTimeout(250);
  }
  await p.evaluate(() => BattleManager.enemyTeam.forEach(e => { e.stats.maxHP = e.stats.hp = 1e7; }));

  // run while dragging
  const r0 = await rect();
  await p.mouse.move(r0.x + r0.w / 2, r0.y + r0.h / 2); await p.mouse.down();
  const seenDrag = new Set();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(r0.x + r0.w / 2 + i * 10, r0.y + r0.h / 2 + i * 3); await p.waitForTimeout(40); seenDrag.add(await anim()); if (i === 8) await shot(p, 'run', await clip()); }
  await p.mouse.up(); await p.waitForTimeout(600);
  report.drag = [...seenDrag];

  // skills through the action panel
  async function skill(kind) {
    for (let i = 0; i < 100; i++) {
      const ok = await p.evaluate(id => { const c = BattleManager.turns.currentUnit; return !!(c && c.id === id && !c._actionBusy && !BattleManager.turns.isProcessing); }, unitId);
      if (ok) break; await p.waitForTimeout(250);
    }
    const pre = await p.evaluate(([id, kind]) => {
      const bm = BattleManager, u = bm.turns.currentUnit;
      if (!u || u.id !== id) return { err: 'not our turn', cur: u && u.charId };
      u.chakra = 12; u.ultimateCooldown = 0; u.jutsuCooldown = 0;
      BattleChakraWheel.updateChakraWheel(u, bm); bm.turns.showActionPanel(u, bm);
      window.__hits = []; window.__ended = 0;
      if (!window.__wrapped) {
        window.__wrapped = 1;
        const o = BattleAnimations.showComboHit.bind(BattleAnimations);
        BattleAnimations.showComboHit = (t, a, ...r) => { window.__hits.push(bm.combatants.find(x => x.id === id)?._sprite?.el.dataset.anim); return o(t, a, ...r); };
        const oe = bm.turns.endTurn.bind(bm.turns);
        bm.turns.endTurn = (...a) => { window.__ended++; return oe(...a); };
      }
      const s = BattleCombat.getUnitSkills(u);
      if (kind === 'attack') return { dataHits: null, name: 'normal attack' };
      return { dataHits: s[kind]?.data?.hits ?? null, name: s[kind]?.meta?.name };
    }, [unitId, kind]);
    if (pre.err || !pre.name) return { kind, ...pre, skipped: !pre.name };
    const meta = await p.evaluate(([id, kind]) => BattleManager.combatants.find(x => x.id === id)._sprite.meta(kind).then(m => ({ hits: m.hits.length, frames: m.frames })).catch(() => null), [unitId, kind]);
    await p.click(`#btn-${kind}`); await p.waitForTimeout(300);
    const ec = await p.evaluate(() => { const e = BattleManager.enemyTeam.find(x => x.stats.hp > 0); const r = document.querySelector(`.battle-unit[data-unit-id="${e.id}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(ec.x, ec.y);
    const seen = new Set(); let shotDone = false;
    for (let i = 0; i < 90; i++) {
      await p.waitForTimeout(100);
      const a = await anim(); seen.add(a);
      const h = await p.evaluate(() => window.__hits.length);
      if (a === kind && h >= 2 && !shotDone) { shotDone = true; await shot(p, kind, await clip()); }
      if (await p.evaluate(() => window.__ended)) break;
    }
    await p.waitForTimeout(500);
    const hits = await p.evaluate(() => window.__hits);
    return { kind, name: pre.name, dataHits: pre.dataHits, sheetHits: meta?.hits, damageNumbers: hits.length, animsDuringHits: [...new Set(hits)], animsSeen: [...seen] };
  }
  report.attack = await skill('attack');
  report.jutsu = await skill('jutsu');
  report.ultimate = await skill('ultimate');

  // hit reaction + KO from an enemy
  await p.evaluate(() => { BattleManager.isPaused = true; });
  const E = await p.evaluate(() => BattleManager.enemyTeam.find(e => e.stats.hp > 0).id);
  await p.evaluate(([e, u]) => { const c = BattleManager; c.combatants.find(x => x.id === u).stats.hp = 1e6; BattleCombat.performAttack(c.combatants.find(x => x.id === e), c.combatants.find(x => x.id === u), c, () => {}); }, [E, unitId]);
  const hitSeen = new Set();
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(60); const a = await anim(); hitSeen.add(a); if (a === 'hit' && !report._hs) { report._hs = 1; await shot(p, 'hit', await clip()); } }
  report.hit = [...hitSeen];
  await p.waitForTimeout(1000);
  const kc = await clip();
  await p.evaluate(([e, u]) => { const c = BattleManager; c.combatants.find(x => x.id === u).stats.hp = 1; BattleCombat.performAttack(c.combatants.find(x => x.id === e), c.combatants.find(x => x.id === u), c, () => {}); }, [E, unitId]);
  const ko = [];
  for (let i = 0; i < 25; i++) { await p.waitForTimeout(80); ko.push(await p.evaluate(() => document.querySelector('.battle-unit-ko .sprite-player')?.dataset.anim || '-')); }
  await shot(p, 'ko', kc);
  report.ko = [...new Set(ko)];
  delete report._hs;
  report.errors = errors.slice(0, 5);
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
