// 2. Data integrity — pure Node, no browser.
//
// Cross-references between data/*.json files and the ids the game code knows
// (js/resources.js material ids). Known, already-reported problems are listed
// in KNOWN_ISSUES and checked by `test.fail` tests: they stay green while the
// problem exists and turn red once it is fixed, so the entry gets removed.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, readJSON, KNOWN_MISSING_CODE } = require('../helpers');

const DATA_DIR = path.join(REPO_ROOT, 'data');

// ---------------------------------------------------------------------------
// Known issues (reported, not fixed here — tests must not change game data)
// ---------------------------------------------------------------------------
const KNOWN_ISSUES = {
  unparsableJson: [],
  // Fusion recipes whose required units are not in data/characters.json.
  fusionMissingUnits: ['shikamaru_legacy_step1:asuma_104', 'darui_legacy_step1:raikage_166'],
  shopUnknownItems: [],
};

// ---------------------------------------------------------------------------
// Id sets
// ---------------------------------------------------------------------------
const characters = readJSON('data/characters.json');
const charIds = new Set(characters.map((c) => c.id));
const enemies = readJSON('data/enemies.json');
const enemyIds = new Set(enemies.map((e) => e.id));
const bosses = readJSON('data/bosses.json');
const missions = readJSON('data/missions.json');

/** Evaluate a top-level `const NAME = { ... };` object literal from js/resources.js. */
function objectLiteral(src, name) {
  const start = src.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`${name} not found in js/resources.js`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') { // skip string literals
      const q = ch; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      // eslint-disable-next-line no-new-func
      return Function(`"use strict"; return (${src.slice(open, i + 1)});`)();
    }
  }
  throw new Error(`Unbalanced ${name}`);
}

const resourcesSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/resources.js'), 'utf8');
const MATERIAL_TYPES = objectLiteral(resourcesSrc, 'MATERIAL_TYPES');
const ID_ALIASES = objectLiteral(resourcesSrc, 'ID_ALIASES');
const LEGACY_CONVERT = objectLiteral(resourcesSrc, 'LEGACY_CONVERT');
const catalogIds = (readJSON('data/materials.json').materials || []).map((m) => m.id);
const lbCrystalIds = (readJSON('data/lb-crystals.json').crystals || []).flatMap((c) => [`${c.id}_blue`, `${c.id}_gold`]);
/** Every material id js/resources.js can store or convert. */
const knownResourceIds = new Set([
  ...Object.keys(MATERIAL_TYPES), ...Object.keys(ID_ALIASES), ...Object.keys(LEGACY_CONVERT),
  ...catalogIds, ...lbCrystalIds,
]);

// ---------------------------------------------------------------------------
test.describe('data files', () => {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));

  test('every data/*.json parses (except known issues)', () => {
    const bad = [];
    for (const f of files) {
      if (KNOWN_ISSUES.unparsableJson.includes(f)) continue;
      try { JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch (e) { bad.push(`${f}: ${e.message}`); }
    }
    expect(bad).toEqual([]);
  });

  for (const f of KNOWN_ISSUES.unparsableJson) {
    test(`known issue: data/${f} parses`, () => {
      test.fail(true, `data/${f} is not valid JSON (reported). Remove from KNOWN_ISSUES once fixed.`);
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    });
  }

  test('characters.json: unique ids, required fields', () => {
    const seen = new Set();
    const dupes = [];
    const missing = [];
    for (const c of characters) {
      if (seen.has(c.id)) dupes.push(c.id);
      seen.add(c.id);
      for (const k of ['id', 'name', 'rarity', 'starMinCode']) if (c[k] == null || c[k] === '') missing.push(`${c.id}.${k}`);
    }
    expect(dupes, 'duplicate character ids').toEqual([]);
    expect(missing, 'characters missing required fields').toEqual([]);
  });
});

test.describe('missions & enemies', () => {
  test('enemies.json characterId references exist', () => {
    const bad = enemies.filter((e) => e.characterId && !charIds.has(e.characterId)).map((e) => `${e.id} -> ${e.characterId}`);
    expect(bad).toEqual([]);
  });

  test('mission ids are unique', () => {
    const ids = missions.map((m) => m.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  test('every mission enemy / boss / feature / cast reference resolves', () => {
    const bad = [];
    const resolves = (id) => charIds.has(id) || enemyIds.has(id);
    for (const m of missions) {
      if (m.feature && !charIds.has(m.feature)) bad.push(`${m.id}.feature ${m.feature}`);
      for (const id of Object.keys(m.cast || {})) {
        if (!resolves(id) && !bosses[id]) bad.push(`${m.id}.cast ${id}`);
      }
      if (m.requires && m.requires.mission && !missions.some((x) => x.id === m.requires.mission)) {
        bad.push(`${m.id}.requires ${m.requires.mission}`);
      }
      for (const [rank, stages] of Object.entries(m.difficulties || {})) {
        expect(Array.isArray(stages), `${m.id}/${rank} stages is an array`).toBe(true);
        stages.forEach((s, si) => {
          if (!Array.isArray(s.waves) || !s.waves.length) bad.push(`${m.id}/${rank}/stage${si + 1} has no waves`);
          (s.waves || []).forEach((w, wi) => {
            const where = `${m.id}/${rank}/stage${si + 1}/wave${wi + 1}`;
            if (!Array.isArray(w.enemies) || !w.enemies.length) bad.push(`${where} has no enemies`);
            for (const e of w.enemies || []) {
              if (e && typeof e === 'object' && e.giant) {
                if (!bosses[e.giant]) bad.push(`${where} giant ${e.giant}`);
                continue;
              }
              const id = typeof e === 'string' ? e : e && e.id;
              if (!resolves(id)) bad.push(`${where} enemy ${id}`);
              if (e && typeof e === 'object' && e.hp != null && !(Number(e.hp) > 0)) bad.push(`${where} enemy ${id} hp=${e.hp}`);
            }
          });
          if (s.boss && !resolves(s.boss) && !bosses[s.boss]) bad.push(`${m.id}/${rank}/stage${si + 1} boss ${s.boss}`);
        });
      }
    }
    expect(bad).toEqual([]);
  });

  test('mission rewards reference known resource ids / characters', () => {
    const bad = [];
    const check = (where, obj) => {
      for (const [k, v] of Object.entries(obj || {})) {
        if (k === 'characters') {
          for (const c of [].concat(v)) {
            const id = typeof c === 'string' ? c : c && (c.characterId || c.charId || c.id);
            if (!charIds.has(id)) bad.push(`${where} character ${id}`);
          }
        } else if (!knownResourceIds.has(k)) bad.push(`${where} ${k}`);
      }
    };
    for (const m of missions) {
      for (const [rank, cr] of Object.entries(m.clearRewards || {})) {
        check(`${m.id}/${rank}/firstTime`, cr.firstTime);
        check(`${m.id}/${rank}/completion`, cr.completion);
      }
      for (const [rank, stages] of Object.entries(m.difficulties || {})) {
        stages.forEach((s, i) => check(`${m.id}/${rank}/stage${i + 1}`, s.rewards));
      }
    }
    expect(bad).toEqual([]);
  });
});

test.describe('summon', () => {
  const summon = readJSON('data/summon.json');

  test('standard pool characters exist', () => {
    expect(summon.standardPool.filter((id) => !charIds.has(id))).toEqual([]);
  });

  test('visible banners only reference existing characters', () => {
    const bad = [];
    for (const p of summon.pools) {
      if (p.hidden) continue; // hidden banners are not offered (js/summon/summon-data.js)
      for (const id of [...(p.characters || []), ...(p.featured || [])]) if (!charIds.has(id)) bad.push(`${p.id}: ${id}`);
    }
    expect(bad).toEqual([]);
  });

  test('hidden banners with missing units are reported (non-blocking)', () => {
    const missing = summon.pools.filter((p) => p.hidden)
      .flatMap((p) => [...(p.characters || []), ...(p.featured || [])].filter((id) => !charIds.has(id)).map((id) => `${p.id}: ${id}`));
    if (missing.length) test.info().annotations.push({ type: 'info', description: `${missing.length} hidden banner unit(s) not in characters.json` });
  });

  test('base rates sum to 100%', () => {
    const sum = Object.values(summon.baseRates).reduce((a, b) => a + Number(b), 0);
    expect(sum).toBeCloseTo(100, 5);
  });
});

test.describe('fusions', () => {
  const { fusions } = readJSON('data/fusions.json');
  const refs = (f) => [f.requirements && f.requirements.unit1, f.requirements && f.requirements.unit2, f.result && f.result.characterId].filter(Boolean);

  test('fusion units exist (except known issues)', () => {
    const bad = fusions.flatMap((f) => refs(f).filter((id) => !charIds.has(id)).map((id) => `${f.id}:${id}`))
      .filter((x) => !KNOWN_ISSUES.fusionMissingUnits.includes(x));
    expect(bad).toEqual([]);
  });

  test('known issue: fusion recipes reference missing units', () => {
    test.fail(true, 'fusions reference units missing from characters.json (reported)');
    const bad = fusions.flatMap((f) => refs(f).filter((id) => !charIds.has(id)).map((id) => `${f.id}:${id}`));
    expect(bad).toEqual([]);
  });
});

test.describe('shop', () => {
  const { shop } = readJSON('data/shop.json');
  const currencyIds = ['ryo', 'ninja_pearls', 'pearls', 'shinobites', 'granny_coin'];

  const unknownItems = () => {
    const out = [];
    for (const [tab, items] of Object.entries(shop)) {
      for (const it of items) {
        if (it.recipe) continue; // recipe scrolls go to js/recipe-book.js, not Resources
        const ids = it.value ? Object.keys(it.value) : [it.id];
        for (const id of ids) if (!knownResourceIds.has(id)) out.push(`${tab}:${id}`);
      }
    }
    return out;
  };

  test('shop items grant known resource ids (except known issues)', () => {
    expect(unknownItems().filter((x) => !KNOWN_ISSUES.shopUnknownItems.includes(x))).toEqual([]);
  });

  test('shop costs use a supported currency with a positive price', () => {
    const bad = [];
    for (const [tab, items] of Object.entries(shop)) {
      for (const it of items) {
        const entries = Object.entries(it.cost || {});
        if (!entries.length) bad.push(`${tab}:${it.id} has no cost`);
        for (const [cur, n] of entries) {
          if (!(Number(n) > 0)) bad.push(`${tab}:${it.id} ${cur}=${n}`);
          if (!currencyIds.includes(cur) && !(it.recipe && cur === 'recipe_fragments')) bad.push(`${tab}:${it.id} unknown currency ${cur}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('shop ids are unique per tab', () => {
    const bad = [];
    for (const [tab, items] of Object.entries(shop)) {
      const ids = items.map((i) => i.id);
      ids.forEach((id, i) => { if (ids.indexOf(id) !== i) bad.push(`${tab}:${id}`); });
    }
    expect(bad).toEqual([]);
  });
});

test.describe('pages', () => {
  // Local <script src> / <link href> of every top-level page must exist.
  const pages = fs.readdirSync(REPO_ROOT).filter((f) => f.endsWith('.html'));
  const missingRefs = () => {
    const out = [];
    for (const f of pages) {
      const html = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
      const re = /<(?:script[^>]*\ssrc|link[^>]*\shref)=["']([^"'#]+)["']/gi;
      let m;
      while ((m = re.exec(html))) {
        const ref = m[1].split('?')[0];
        if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('data:')) continue;
        if (!fs.existsSync(path.join(REPO_ROOT, decodeURIComponent(ref)))) out.push(`${f}: ${ref}`);
      }
    }
    return out;
  };

  test('script and stylesheet references resolve (except known issues)', () => {
    const known = KNOWN_MISSING_CODE.map((p) => p.replace(/^\//, ''));
    expect(missingRefs().filter((x) => !known.some((k) => x.endsWith(`: ${k}`)))).toEqual([]);
  });
});
