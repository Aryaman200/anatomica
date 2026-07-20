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
// Match <script type="module" src="js/...js" ...> with optional ?v
const SCRIPT_RE = /(<script[^>]*\ssrc=["'])(js\/[^"'?]+\.js)(\?v=\d+)?(["'][^>]*>)/g;

let changed = 0;
for (const f of walk(resolve(ROOT, 'js'))) {
  const src = readFileSync(f, 'utf8');
  const out = src.replace(IMPORT_RE, (_m, a, path, _v, q) => `${a}${path}?v=${V}${q}`);
  if (out !== src) { writeFileSync(f, out); changed++; }
}
const idx = resolve(ROOT, 'index.html');
const html = readFileSync(idx, 'utf8');
const newHtml = html.replace(SCRIPT_RE, (_m, a, path, _v, tail) => `${a}${path}?v=${V}${tail}`);
if (newHtml !== html) { writeFileSync(idx, newHtml); changed++; }

console.log(`bumped ${changed} files with ?v=${V}`);
