/**
 * test-parts.mjs
 * Verifies that js/data/parts.js was correctly populated by the ingestion pipeline.
 * Usage: node scripts/test-parts.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '..');

// ── 1. Load parts.js ────────────────────────────────────────────────────────
const partsSource = readFileSync(resolve(ROOT, 'js/data/parts.js'), 'utf8');

// Extract all keys in PART_INFO
const keys = new Set();
for (const m of partsSource.matchAll(/^\s+'([^']+)'\s*:/gm)) keys.add(m[1]);
for (const m of partsSource.matchAll(/^\s+"([^"]+)"\s*:/gm)) keys.add(m[1]);

// Remove known non-part keys that are nested object fields
const SKIP = new Set(['desc', 'wiki']);
for (const k of SKIP) keys.delete(k);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  parts.js CONTENT TEST`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
console.log(`Total PART_INFO keys: ${keys.size}`);

// ── 2. Load anatomy.js labels ────────────────────────────────────────────────
const anatomySource = readFileSync(resolve(ROOT, 'js/data/anatomy.js'), 'utf8');
const anatomyLabels = new Set();
for (const m of anatomySource.matchAll(/label:\s*"([^"]+)"/g)) anatomyLabels.add(m[1]);
console.log(`Total anatomy labels: ${anatomyLabels.size}`);

// ── 3. Load groups.js labels ─────────────────────────────────────────────────
const groupsSource = readFileSync(resolve(ROOT, 'js/data/groups.js'), 'utf8');
const groupLabels = new Set();
for (const m of groupsSource.matchAll(/label:\s*'([^']+)'/g)) groupLabels.add(m[1]);
for (const m of groupsSource.matchAll(/label:\s*"([^"]+)"/g)) groupLabels.add(m[1]);
console.log(`Total group labels:   ${groupLabels.size}`);

const allVocab = new Set([...anatomyLabels, ...groupLabels]);
console.log(`Total vocab (union):  ${allVocab.size}`);

// ── 4. Coverage analysis ─────────────────────────────────────────────────────
const covered   = [...allVocab].filter(l => keys.has(l));
const uncovered = [...allVocab].filter(l => !keys.has(l));
const pct = ((covered.length / allVocab.size) * 100).toFixed(1);

console.log(`\nCoverage: ${covered.length}/${allVocab.size} (${pct}%)`);
console.log(`Missing:  ${uncovered.length}\n`);

// ── 5. Validate each PART_INFO entry ────────────────────────────────────────
let badDesc = 0, badWiki = 0;
const descRe  = /desc:\s*'((?:[^'\\]|\\.)*)'/;
const wikiRe  = /wiki:\s*(?:'([^']*)'|null)/;

// Parse entries by splitting on the key pattern
const entries = [...partsSource.matchAll(/^\s+'([^']+)':\s*\{([^}]+)\}/gm)];
for (const [, label, body] of entries) {
  if (SKIP.has(label)) continue;
  const desc = descRe.exec(body)?.[1];
  const wikiM = wikiRe.exec(body);
  const wiki  = wikiM ? (wikiM[1] || null) : undefined;
  if (!desc || desc.trim().length < 10) {
    console.log(`  ✗ SHORT/MISSING desc — "${label}"`);
    badDesc++;
  }
  if (wiki === undefined) {
    console.log(`  ✗ MISSING wiki field — "${label}"`);
    badWiki++;
  }
}

console.log(`Validation:`);
console.log(`  Bad/missing desc:  ${badDesc}`);
console.log(`  Missing wiki key:  ${badWiki}`);

// ── 6. Sample 10 covered + 10 uncovered ─────────────────────────────────────
console.log(`\nSample covered entries (first 10):`);
covered.slice(0, 10).forEach(l => console.log(`  ✓ "${l}"`));

console.log(`\nSample UNCOVERED labels (first 30):`);
uncovered.slice(0, 30).forEach(l => console.log(`  ✗ "${l}"`));

// ── 7. Check for GENERATED block ────────────────────────────────────────────
const hasGenerated = /\/\* ── GENERATED \([^)]+\) ── \*\//.test(partsSource);
console.log(`\nHas GENERATED block: ${hasGenerated ? '✓ YES' : '✗ NO'}`);

// ── 8. Low hit rate diagnosis ────────────────────────────────────────────────
console.log(`\n━━━━ HIT RATE ANALYSIS ━━━━`);
console.log(`Only ${keys.size - 46} new entries were added from the last run.`);
console.log(`This suggests the Wikipedia relevance filter is too strict.`);
console.log(`\nSample uncovered (complex anatomy names that likely failed relevance check):`);
const complex = uncovered.filter(l => l.split(' ').length > 2).slice(0, 20);
complex.forEach(l => console.log(`  "${l}"`));

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  DONE`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
