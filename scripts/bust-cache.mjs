// scripts/bust-cache.mjs
// Adds/updates ?v=<timestamp> on every JS import path and on index.html's
// main.js script tag. Run after editing any module to force fresh browser fetch.
//   node scripts/bust-cache.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const V = String(Date.now());

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|mjs|html)$/.test(name)) acc.push(p);
  }
  return acc;
}

// Match `from './x.js'` or `from '../x.js'`, optionally with existing ?v=...
const IMPORT_RE = /(from\s+['"])(\.{1,2}\/[^'"?]+\.js)(\?v=\d+)?(['"])/g;
// Match DYNAMIC imports `import('./x.js')`. These have no `from`, so IMPORT_RE
// misses them — and an un-versioned dynamic import silently freezes a module at
// its first-cached version forever (this is how a stale notes.js kept pulling a
// second, unversioned i18n copy). Version them too.
const DYN_IMPORT_RE = /(import\(\s*['"])(\.{1,2}\/[^'"?]+\.js)(\?v=\d+)?(['"])/g;
// Match <script type="module" src="js/...js" ...> with optional ?v
const SCRIPT_RE = /(<script[^>]*\ssrc=["'])(js\/[^"'?]+\.js)(\?v=\d+)?(["'][^>]*>)/g;
// Match <link rel="stylesheet" href="css/...css" ...>, optional ?v. Same staleness
// risk as unversioned JS: a browser (or intermediate cache) holding an old
// css/styles.css never learns a redeploy happened, since the href never changes.
const LINK_RE = /(<link[^>]*\shref=["'])(css\/[^"'?]+\.css)(\?v=\d+)?(["'][^>]*>)/g;

const stamp = (_m, a, path, _v, tail) => `${a}${path}?v=${V}${tail}`;

let changed = 0;

// 1. Every ES module under js/ — version its static AND dynamic relative imports.
for (const f of walk(resolve(ROOT, 'js'))) {
  const src = readFileSync(f, 'utf8');
  const out = src.replace(IMPORT_RE, stamp).replace(DYN_IMPORT_RE, stamp);
  if (out !== src) { writeFileSync(f, out); changed++; }
}

// 2. Every HTML file at the repo root — version both <script src="js/…"> tags
//    AND inline `import … from './js/…'` statements. Versioning inline imports
//    matters: an unversioned inline import loads a SECOND copy of a module (its
//    own module-level state), which is how the i18n dictionary/window.t used to
//    desync. Same ?v everywhere ⇒ one shared instance per module.
for (const name of readdirSync(ROOT)) {
  if (!name.endsWith('.html')) continue;
  const f = join(ROOT, name);
  const src = readFileSync(f, 'utf8');
  const out = src
    .replace(SCRIPT_RE, stamp)
    .replace(LINK_RE, stamp)
    .replace(IMPORT_RE, stamp)
    .replace(DYN_IMPORT_RE, stamp);
  if (out !== src) { writeFileSync(f, out); changed++; }
}

console.log(`bumped ${changed} files with ?v=${V}`);
