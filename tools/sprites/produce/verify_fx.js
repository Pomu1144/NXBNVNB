// In-battle check of a two-layer technique (caster sheet + effect-only "fx" sheet).
//   python3 -m http.server 8765   (repo root)
//   node tools/sprites/produce/verify_fx.js <charId> <outDir> [kind=ultimate] [tier=6S]
// Puts the unit in front-1, waits for its turn, casts `kind` on an enemy and
// records: the caster never leaves its spot, the .technique-fx element appears
// centred over the targets (and under the top HUD), one damage number per fx
// hit, no page errors, idle afterwards. Frames (JPEG, ~14 fps) go to
// outDir/frames/ for a GIF; a JSON report is printed.
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const CID = process.argv[2];
const OUT = process.argv[3] || '.';
const KIND = process.argv[4] || 'ultimate';
const TIER = process.argv[5] || '6S';
const URL = process.env.BASE_URL || 'http://localhost:8765';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: +(process.env.VW || 1440), height: +(process.env.VH || 900) } })).newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const report = { charId: CID, kind: KIND };
  await p.goto(`${URL}/characters.html`); await p.waitForTimeout(2500);
  await p.click('#chardev-fab'); await p.waitForTimeout(300);
  if (await p.$(`#chardev-add-${CID}`)) await p.click(`#chardev-add-${CID}`);
  else await p.evaluate(([c, t]) => CharDevTools.addSpriteUnit(c, t, c), [CID, TIER]);
  await p.waitForTimeout(800);
  const inst = await p.evaluate(() => InventoryChar.allInstances().pop());
  await p.evaluate(([u, c]) => localStorage.setItem('blazing_teams_v1', JSON.stringify({ 1: { 'front-1': { uid: u, charId: c } } })), [inst.uid, inst.charId]);
  await p.goto(`${URL}/battle.html`); await p.waitForTimeout(5000);
  const unitId = await p.evaluate(cid => BattleManager.activeTeam.find(u => u && u.charId === cid)?.id, inst.charId);
  const state = () => p.evaluate(id => {
    const u = BattleManager.combatants.find(x => x.id === id);
    const el = document.querySelector(`.battle-unit[data-unit-id="${id}"]`);
    const r = el.getBoundingClientRect();
    const fx = document.querySelector('.technique-fx[data-at="targets"]');
    const fr = fx?.getBoundingClientRect();
    const cfx = document.querySelector('.technique-fx[data-at="caster"]');
    const cr = cfx?.getBoundingClientRect();
    const slot = el.querySelector('.unit-sprite')?.getBoundingClientRect();
    return { anim: u?._sprite?.el.dataset.anim || null, left: el.style.left, top: el.style.top, x: Math.round(r.left), y: Math.round(r.top),
      fx: fr ? { x: Math.round(fr.left), y: Math.round(fr.top), w: Math.round(fr.width), h: Math.round(fr.height) } : null,
      casterFx: cr ? { x: Math.round(cr.left), y: Math.round(cr.top), w: Math.round(cr.width), h: Math.round(cr.height), z: getComputedStyle(cfx).zIndex,
        centerVsCaster: Math.round(cr.left + cr.width / 2 - (slot.left + slot.width / 2)) } : null,
      hits: (window.__hits || []).length };
  }, unitId);
  for (let i = 0; i < 120; i++) {
    const ok = await p.evaluate(id => { const c = BattleManager.turns.currentUnit; return !!(c && c.id === id && !c._actionBusy && !BattleManager.turns.isProcessing); }, unitId);
    if (ok) break; await p.waitForTimeout(250);
  }
  const pre = await p.evaluate(([id, kind]) => {
    const bm = BattleManager, u = bm.turns.currentUnit;
    bm.enemyTeam.forEach(e => { e.stats.maxHP = e.stats.hp = 1e7; });
    u.chakra = 12; u.ultimateCooldown = 0; u.jutsuCooldown = 0;
    BattleChakraWheel.updateChakraWheel(u, bm); bm.turns.showActionPanel(u, bm);
    window.__hits = []; window.__ended = 0;
    const o = BattleAnimations.showComboHit.bind(BattleAnimations);
    BattleAnimations.showComboHit = (t, a, ...r) => { window.__hits.push(t.id); return o(t, a, ...r); };
    const oe = bm.turns.endTurn.bind(bm.turns);
    bm.turns.endTurn = (...a) => { window.__ended++; return oe(...a); };
    const s = BattleCombat.getUnitSkills(u);
    return { dataHits: s[kind]?.data?.hits ?? null, name: s[kind]?.meta?.name, pos: { ...u.pos } };
  }, [unitId, KIND]);
  Object.assign(report, pre);
  const before = await state();
  report.before = before;
  await p.click(`#btn-${KIND}`); await p.waitForTimeout(300);
  const tgt = await p.evaluate(() => { const e = BattleManager.enemyTeam.find(x => x.stats.hp > 0); const r = document.querySelector(`.battle-unit[data-unit-id="${e.id}"] .unit-sprite`).getBoundingClientRect(); return { id: e.id, x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom, cx: r.left + r.width / 2 }; });
  await p.mouse.click(tgt.x, tgt.y);
  const fdir = path.join(OUT, 'frames'); fs.mkdirSync(fdir, { recursive: true });
  for (const f of fs.readdirSync(fdir)) fs.unlinkSync(path.join(fdir, f));
  const t0 = Date.now(); const samples = []; let n = 0; let maxDrift = 0; let fxSeen = null; let casterFxSeen = null;
  // CDP screencast: frames arrive as the page paints (much faster than screenshots)
  const cdp = await p.context().newCDPSession(p);
  cdp.on('Page.screencastFrame', f => {
    fs.writeFileSync(path.join(fdir, `f${String(n++).padStart(4, '0')}_${Math.round(f.metadata.timestamp * 1000) - t0}.jpg`), Buffer.from(f.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  while (Date.now() - t0 < 9000) {
    await p.waitForTimeout(60);
    const s = await state();
    samples.push({ t: Date.now() - t0, anim: s.anim, fx: !!s.fx, cfx: !!s.casterFx, hits: s.hits });
    if (s.fx && !fxSeen) fxSeen = s.fx;
    if (s.fx && fxSeen && s.fx.h > fxSeen.h) fxSeen = s.fx;
    if (s.casterFx && !casterFxSeen) casterFxSeen = s.casterFx;
    maxDrift = Math.max(maxDrift, Math.abs(s.x - before.x), Math.abs(s.y - before.y));
    if (await p.evaluate(() => window.__ended) && Date.now() - t0 > 1000) break;
  }
  await p.waitForTimeout(800);
  await cdp.send('Page.stopScreencast').catch(() => {});
  const after = await state();
  const hud = await p.evaluate(() => Math.max(...['#speed-gauge-track', '#turn-icons'].map(s => document.querySelector(s)?.getBoundingClientRect().bottom || 0)));
  const unitH = await p.evaluate(id => document.querySelector(`.battle-unit[data-unit-id="${id}"] .unit-sprite`).getBoundingClientRect().height, tgt.id);
  Object.assign(report, {
    sheetHits: await p.evaluate(([id, kind]) => { const u = BattleManager.combatants.find(x => x.id === id); return u._sprite.meta(kind).then(async m => { if (!m.fx) return { caster: m.hits.length }; const L = Array.isArray(m.fx) ? m.fx : [m.fx]; const out = { caster: m.hits.length, layers: [] }; for (const l of L) { const f = await SpritePlayer.preload(l.base || SpritePlayer.pathFor(u.charId), l.sheet); out.layers.push({ sheet: l.sheet, at: l.at, startFrame: l.startFrame, hits: f.hits.length }); } out.fx = out.layers.reduce((a, l) => a + l.hits, 0); return out; }); }, [unitId, KIND]),
    damageNumbers: after.hits, fx: fxSeen, casterFx: casterFxSeen,
    fxCenterVsTarget: fxSeen ? Math.round(fxSeen.x + fxSeen.w / 2 - tgt.cx) : null,
    fxTopBelowHud: fxSeen ? fxSeen.y >= hud : null, fxHeightInUnits: fxSeen ? +(fxSeen.h / unitH).toFixed(2) : null,
    casterMaxDriftPx: maxDrift, after: { anim: after.anim, left: after.left, top: after.top, x: after.x, y: after.y },
    positionUnchanged: after.left === before.left && after.top === before.top, before: { left: before.left, top: before.top, x: before.x, y: before.y }, animsSeen: [...new Set(samples.map(s => s.anim))],
    frames: n, capturedMs: Date.now() - t0, errors: errors.slice(0, 5)
  });
  fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify(samples));
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
