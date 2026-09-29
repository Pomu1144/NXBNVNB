// Copies the web game (the repo root, one folder up) into app/www for
// Capacitor. The web game is never modified: this only reads from it.
//
//   node scripts/copy-web.mjs
//
// Left out: dev tooling, docs, backups, the app folder itself and the
// service worker (the app ships its files, so there is nothing to cache and
// a stale worker could serve an old build after an app update).
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '..');
const WEB = resolve(APP, '..');
const OUT = join(APP, 'www');

const SKIP_DIRS = new Set(['.git', '.github', '.claude', 'app', 'tools', 'docs', 'node_modules']);
const SKIP_FILE = name =>
  name === 'sw.js' ||
  / copy(\.|$)/i.test(name) ||           // "battle copy.html", "… copy.zip"
  /\.(bak|backup|zip|md|py|pyc|psd)$/i.test(name) ||
  name.startsWith('.');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let files = 0, bytes = 0;
for (const name of readdirSync(WEB)) {
  const src = join(WEB, name);
  const st = statSync(src);
  if (st.isDirectory() ? SKIP_DIRS.has(name) : SKIP_FILE(name)) continue;
  cpSync(src, join(OUT, name), {
    recursive: true,
    filter: p => {
      const s = statSync(p);
      if (s.isDirectory()) return !SKIP_DIRS.has(basename(p));
      if (SKIP_FILE(basename(p))) return false;
      files++; bytes += s.size;
      return true;
    },
  });
}
console.log(`copied ${files} files (${(bytes / 1048576).toFixed(0)} MB) into www/`);
