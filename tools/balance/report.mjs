// Balance report for mission enemies (js/battle/battle-difficulty.js).
//
//   node tools/balance/report.mjs [missionIdPrefix]
//
// For every mission rank: the recommended power, the reference unit it
// implies, and for the first and last stage the grunt / boss stats before
// (data) and after scaling, with how many reference-unit hits each takes and
// how many hits it needs to KO the reference unit.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../../js/battle/battle-difficulty.js');
const missions = JSON.parse(readFileSync(new URL('../../data/missions.json', import.meta.url)));
const filter = process.argv[2] || '';

const f = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
for (const m of missions) {
  if (!m.id.startsWith(filter) || !m.difficulties) continue;
  for (const [rank, stages] of Object.entries(m.difficulties)) {
    const power = m.power?.[rank];
    if (!(power > 0) || !stages?.length) continue;
    const ref = D.referenceUnit(power);
    const rows = [];
    for (const si of [0, stages.length - 1]) {
      const waves = stages[si].waves || [];
      waves.forEach((w, wi) => (w.enemies || []).forEach(e => {
        if (!e || typeof e !== 'object' || e.giant) return;
        const base = { id: e.id, stats: { hp: e.hp || 800, atk: e.atk || 80, def: e.def || 0 } };
        const ctx = { stageIndex: si, stageCount: stages.length, waveIndex: wi, waveCount: waves.length };
        const t = D.targetStats(m, rank, base, e, ctx);
        const hp = Math.max(base.stats.hp, t.hp), atk = Math.max(base.stats.atk, t.atk);
        rows.push(`  s${si + 1}w${wi + 1} ${t.boss ? 'BOSS ' : 'grunt'} ${e.id.padEnd(16)} hp ${f(e.hp || 0).padStart(6)}→${f(hp).padStart(6)} (${(hp / ref.atk).toFixed(1)} hits)  atk ${f(e.atk || 0).padStart(5)}→${f(atk).padStart(6)} (KO in ${(ref.hp / atk).toFixed(1)})`);
      }));
    }
    console.log(`${m.id} ${rank}  power ${f(power)}  ref unit hp ${f(ref.hp)} atk ${f(ref.atk)}`);
    console.log([...new Set(rows)].join('\n'));
  }
}
