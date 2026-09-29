// 3. Sprite registry — pure Node, no browser.
//
// Reads REGISTRY / SHARED from js/sprite-player.js and checks that every sheet
// the battle can ask for is on disk, resolving SHARED variant folders the same
// way SpritePlayer.sheetFolder() does.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { REPO_ROOT, readJSON } = require('../helpers');

const SRC = fs.readFileSync(path.join(REPO_ROOT, 'js/sprite-player.js'), 'utf8');

/** Evaluate `const NAME = { ... };` (object literal of plain data) from the source. */
function literal(name) {
  const m = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`).exec(SRC);
  if (!m) throw new Error(`${name} not found in js/sprite-player.js`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${m[1]});`)();
}

const REGISTRY = literal('REGISTRY');
const SHARED = literal('SHARED');

// Mirrors sheetFolder() in js/sprite-player.js.
function sheetFolder(base, name) {
  for (let i = 0; i < 4; i++) {
    const sh = SHARED[base];
    if (!sh || sh.own.includes(name)) break;
    base = sh.from;
  }
  return base;
}

const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));
const sheetsIn = (folder) => {
  const dir = path.join(REPO_ROOT, folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
};

const REQUIRED = ['idle', 'run', 'attack', 'hit', 'ko'];
const folders = [...new Set(Object.values(REGISTRY))].sort();

test('registry parsed', () => {
  expect(Object.keys(REGISTRY).length).toBeGreaterThan(10);
  for (const [folder, sh] of Object.entries(SHARED)) {
    expect(typeof sh.from, `${folder}.from`).toBe('string');
    expect(Array.isArray(sh.own), `${folder}.own`).toBe(true);
  }
});

test('every registered character id exists in data/characters.json', () => {
  const ids = new Set(readJSON('data/characters.json').map((c) => c.id));
  expect(Object.keys(REGISTRY).filter((id) => !ids.has(id))).toEqual([]);
});

test('every registered folder resolves idle/run/attack/hit/ko (.json + .webp)', () => {
  const missing = [];
  for (const base of folders) {
    for (const name of REQUIRED) {
      const folder = sheetFolder(base, name);
      for (const ext of ['json', 'webp']) if (!exists(`${folder}/${name}.${ext}`)) missing.push(`${base} -> ${folder}/${name}.${ext}`);
    }
  }
  expect(missing).toEqual([]);
});

test('SHARED variant folders hold their own sheets and point at a real family folder', () => {
  const bad = [];
  for (const [folder, sh] of Object.entries(SHARED)) {
    if (!exists(sh.from)) bad.push(`${folder}.from ${sh.from} missing`);
    for (const name of sh.own) {
      for (const ext of ['json', 'webp']) if (!exists(`${folder}/${name}.${ext}`)) bad.push(`${folder}/${name}.${ext}`);
    }
  }
  expect(bad).toEqual([]);
});

test('every sheet json is well-formed and has a matching .webp', () => {
  const bad = [];
  const all = new Set([...folders, ...Object.keys(SHARED), ...Object.values(SHARED).map((s) => s.from)]);
  for (const folder of all) {
    for (const name of sheetsIn(folder)) {
      const rel = `${folder}/${name}`;
      let meta;
      try { meta = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, `${rel}.json`), 'utf8')); } catch (e) { bad.push(`${rel}.json: ${e.message}`); continue; }
      for (const k of ['frames', 'frameWidth', 'frameHeight']) {
        if (!(Number(meta[k]) > 0)) bad.push(`${rel}.json ${k}=${meta[k]}`);
      }
      if (meta.columns != null && !(Number(meta.columns) > 0)) bad.push(`${rel}.json columns=${meta.columns}`);
      if (Array.isArray(meta.hits) && meta.hits.some((h) => !(h >= 0 && h < meta.frames))) bad.push(`${rel}.json hits out of range`);
      if (!exists(`${rel}.webp`)) bad.push(`${rel}.webp missing`);
    }
  }
  expect(bad).toEqual([]);
});

test('jutsu / ultimate sheets present in a family resolve for each of its variants', () => {
  // If the family folder has e.g. jutsu.json, every folder routed to it must
  // resolve that sheet too (either its own copy or via SHARED).
  const missing = [];
  for (const base of folders) {
    const family = SHARED[base] ? SHARED[base].from : base;
    const optional = sheetsIn(family).filter((n) => /^(jutsu|ultimate|secret)$/.test(n));
    for (const name of optional) {
      const folder = sheetFolder(base, name);
      if (!exists(`${folder}/${name}.json`) || !exists(`${folder}/${name}.webp`)) missing.push(`${base}: ${name}`);
    }
  }
  expect(missing).toEqual([]);
});
