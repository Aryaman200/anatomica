/**
 * fetch-part-info.mjs
 *
 * Fetches Wikipedia summaries for anatomy structures not already covered
 * in js/data/parts.js. Falls back to a template-based description for
 * highly-specific sub-structures that lack Wikipedia articles.
 *
 * Usage:  node scripts/fetch-part-info.mjs
 *         node scripts/fetch-part-info.mjs --dry-run
 *
 * Requires Node 18+ (built-in fetch).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '..');
const DRY   = process.argv.includes('--dry-run');
const CONCURRENCY = 8;

// ── 1. Load existing PART_INFO keys ─────────────────────────────────────────
const partsSource = readFileSync(resolve(ROOT, 'js/data/parts.js'), 'utf8');

const existingKeys = new Set();
for (const m of partsSource.matchAll(/^\s+'([^']+)'\s*:/gm)) existingKeys.add(m[1]);
for (const m of partsSource.matchAll(/^\s+"([^"]+)"\s*:/gm)) existingKeys.add(m[1]);

console.log(`Existing curated entries: ${existingKeys.size}`);

// ── 2. Load all anatomy labels ───────────────────────────────────────────────
const anatomySource = readFileSync(resolve(ROOT, 'js/data/anatomy.js'), 'utf8');

const labelToSystem = new Map();
for (const m of anatomySource.matchAll(/\{\s*label:\s*"([^"]+)",\s*system:\s*"([^"]+)"/g)) {
  if (!labelToSystem.has(m[1])) labelToSystem.set(m[1], m[2]);
}

const groupsSource = readFileSync(resolve(ROOT, 'js/data/groups.js'), 'utf8');
const groupLabels  = new Set();
for (const m of groupsSource.matchAll(/label:\s*'([^']+)'/g)) groupLabels.add(m[1]);
for (const m of groupsSource.matchAll(/label:\s*"([^"]+)"/g)) groupLabels.add(m[1]);

const allLabels = [];
for (const lbl of groupLabels) {
  if (!existingKeys.has(lbl)) allLabels.push({ label: lbl, system: null, isGroup: true });
}
for (const [lbl, sys] of labelToSystem) {
  if (!existingKeys.has(lbl) && !groupLabels.has(lbl)) allLabels.push({ label: lbl, system: sys, isGroup: false });
}

console.log(`Labels to fetch: ${allLabels.length}`);

// ── 3. Template-based fallback ────────────────────────────────────────────────
// For sub-structures too specific for Wikipedia, synthesise a concise,
// medically accurate description from the label's anatomy101l type + context.
function templateDesc(label, system) {
  const l = label.toLowerCase();

  // Extract optional "of [parent]" suffix for context
  const ofM = label.match(/\s+of\s+(.+)$/i);
  const parent = ofM ? ofM[1].toLowerCase() : null;
  const ctx    = parent ? ` of the ${parent}` : '';

  // Papillary muscle (before generic muscle catch)
  if (/papillary muscle/.test(l))
    return `A conical projection inside the heart${ctx} that anchors the valve leaflets via chordae tendineae, preventing regurgitation.`;

  // Cardiac valve components
  if (/leaflet|cusp/.test(l) && /valve|pulmonary|aortic|mitral|tricuspid/.test(l))
    return `A flap${ctx} that opens and closes with each heartbeat to keep blood flowing in one direction through the valve.`;

  // Arterial structures
  if (/\bartery\b|\barterial\b/.test(l)) {
    if (parent) return `An artery${ctx} that delivers oxygenated blood to its target region.`;
    return 'An artery forming part of the arterial vascular tree.';
  }

  // Venous structures
  if (/\bvein\b|\bvenous\b|\bvenule\b/.test(l)) {
    if (parent) return `A vein${ctx} that returns deoxygenated blood toward the heart.`;
    return 'A vein forming part of the venous drainage system.';
  }

  // Nerve structures
  if (/\bnerve\b|\bneural\b|\bnervous\b/.test(l)) {
    if (parent) return `A nerve branch${ctx} carrying sensory or motor signals.`;
    return 'A peripheral nerve or nerve branch transmitting signals between the body and the central nervous system.';
  }

  // Muscle structures
  if (/\bmuscle\b|\bmuscular\b/.test(l)) {
    if (parent) return `A skeletal muscle${ctx} that contributes to movement or posture.`;
    return 'A skeletal muscle that moves or stabilises part of the body.';
  }

  // Tendon structures
  if (/\btendon\b/.test(l))
    return `A fibrous cord${ctx} that attaches muscle to bone, transmitting the force of contraction.`;

  // Ligament structures
  if (/\bligament\b/.test(l))
    return `A band of fibrous connective tissue${ctx} that connects bones and stabilises the joint.`;

  // Fascial structures
  if (/\bfascia\b|\baponeurosis\b/.test(l))
    return `A sheet of fibrous connective tissue${ctx} that encloses and separates muscles, transmitting mechanical force.`;

  // Bone / bony landmarks
  if (/\bbone\b|\bossicle\b|\bprocess\b|\btuberosity\b|\bcondyle\b|\bepicondyle\b|\btrochanter\b|\bmalleolus\b|\bspine\b|\bcrest\b|\bfacet\b/.test(l))
    return `A bony structure${ctx} forming part of the skeletal framework and providing attachment points for muscles and ligaments.`;

  // Cartilage
  if (/\bcartilage\b|\bmeniscus\b/.test(l))
    return `Flexible connective tissue${ctx} that cushions joints, reduces friction, and provides structural support without the rigidity of bone.`;

  // Sinus / canal / foramen
  if (/\bsinus\b/.test(l))
    return `A hollow space or channel${ctx} within bone or soft tissue, often carrying blood or air.`;
  if (/\bforamen\b|\bcanal\b|\bmeatus\b|\bhiatus\b/.test(l))
    return `An opening or passageway${ctx} through which nerves, vessels, or other structures pass.`;

  // Fossa / groove / sulcus
  if (/\bfossa\b|\bgroove\b|\bsulcus\b/.test(l))
    return `A depression or groove${ctx} in bone or soft tissue, often housing a vessel, nerve, or tendon.`;

  // Gyrus / cortical region
  if (/\bgyrus\b|\bgyre\b/.test(l))
    return `A ridge of cerebral cortex${ctx}, separated from adjacent ridges by sulci, and associated with specific cognitive or sensory functions.`;

  // Lobe
  if (/\blobe\b/.test(l))
    return `A rounded division${ctx} of an organ such as the lung or brain, demarcated by fissures or structural boundaries.`;

  // Plexus
  if (/\bplexus\b/.test(l))
    return `A network of intersecting nerves or vessels${ctx} that distributes signals or blood to multiple downstream regions.`;

  // Ganglion
  if (/\bganglion\b/.test(l))
    return `A cluster of nerve cell bodies${ctx} outside the central nervous system, serving as a relay station for neural signals.`;

  // Duct
  if (/\bduct\b/.test(l))
    return `A tube-like conduit${ctx} that carries secretions, fluids, or glandular products to their destination.`;

  // Lymph node / lymphatic
  if (/lymph node|lymphatic/.test(l))
    return `A small lymphoid organ${ctx} that filters lymph, traps pathogens, and hosts immune cells ready to mount a defence.`;

  // Bursa
  if (/\bbursa\b/.test(l))
    return `A small fluid-filled sac${ctx} that reduces friction between a tendon or muscle and adjacent bone.`;

  // Valve (non-cardiac)
  if (/\bvalve\b/.test(l))
    return `A one-way structure${ctx} that controls the flow of fluid by opening and closing in response to pressure differences.`;

  // Capsule
  if (/\bcapsule\b/.test(l))
    return `A fibrous envelope${ctx} that encloses and protects an organ or joint, maintaining structural integrity.`;

  // Membrane
  if (/\bmembrane\b/.test(l))
    return `A thin sheet of tissue${ctx} that lines, covers, or connects anatomy101l structures.`;

  // System-level fallback
  if (system === 'cardiovascular')
    return `Part of the cardiovascular system${ctx}, contributing to the circulation of blood through the body.`;
  if (system === 'muscular')
    return `A skeletal muscle${ctx} contributing to movement, posture, and stability.`;
  if (system === 'nervous')
    return `Part of the nervous system${ctx}, participating in the transmission or integration of neural signals.`;
  if (system === 'skeleton')
    return `A bony element${ctx} forming part of the skeletal framework that supports and protects the body.`;
  if (system === 'organs')
    return `A visceral structure${ctx} involved in metabolic, digestive, respiratory, or other organ-system functions.`;
  if (system === 'skin')
    return `A region of the body surface${ctx}, part of the integumentary system that covers and protects internal structures.`;

  return `An anatomy101l structure${ctx} of the human body.`;
}

// ── 4. Wikipedia helpers ─────────────────────────────────────────────────────
const REST    = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const SEARCH  = 'https://en.wikipedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'Anatomy101/1.0 (anatomy viewer; educational)' };

function trimSummary(extract, maxChars = 220) {
  if (!extract) return null;
  const text = extract.replace(/\s+/g, ' ').trim();
  const sentences = text.split(/(?<=[.!?])\s+/);
  const first = sentences[0] || '';
  let out = first.length <= maxChars ? first : first.slice(0, maxChars - 1).trimEnd() + '.';
  if (sentences.length > 1) {
    const candidate = out + ' ' + sentences[1];
    if (candidate.length <= maxChars) out = candidate;
  }
  return out.trim() || null;
}

// Stop words that are very common in Z-Anatomy labels and skew scoring
const STOP = new Set([
  'the','and','left','right','deep','superficial','anterior','posterior',
  'superior','inferior','medial','lateral','internal','external',
  'upper','lower','greater','lesser','small','large','long','short',
  'branch','branches','from','into','with','part','region','first',
  'second','third','fourth','fifth',
]);

function relevanceScore(label, wikiTitle) {
  const words = s => new Set(
    s.toLowerCase().replace(/[^a-z ]/g, '').split(' ')
      .filter(w => w.length > 2 && !STOP.has(w))
  );
  const labelWords = words(label);
  const titleWords = words(wikiTitle);
  if (labelWords.size === 0) return 0;
  let overlap = 0;
  for (const w of labelWords) if (titleWords.has(w)) overlap++;
  return overlap / labelWords.size;
}

/**
 * Generate multiple lookup candidates from a Z-Anatomy label,
 * ordered most-specific → most-general.
 */
function generateCandidates(raw) {
  let s = raw.replace(/^\(|\)$/g, '').trim();
  const seen = new Set();
  const cands = [];
  const add = c => { c = c.trim(); if (c.length > 2 && !seen.has(c)) { seen.add(c); cands.push(c); } };

  add(s);

  // Strip "of left/right/the [organ(s)]" qualifier at end
  add(s.replace(/\s+of\s+(left|right|the)\s+\w+(\s+\w+)?$/i, ''));
  add(s.replace(/\s+of\s+(left|right)\s+\w+/i, ''));

  const typeSufRe = /\s+(muscle|artery|vein|nerve|bone|gland|joint|tendon|ligament|fascia|duct|sinus|process|plexus|ganglion|foramen|fossa|sulcus|gyrus|lobe|leaflet|valve|node|tract|nucleus|cortex|body|canal|fissure|membrane|aponeurosis|capsule|ring|tube|vessel|trunk|cord|bulb|fold|space|arch|loop|band|plate|layer|branch)$/i;

  add(s.replace(typeSufRe, ''));

  // Strip qualifier then type suffix
  const withoutQual = s.replace(/\s+of\s+(left|right|the)\s+\w+(\s+\w+)?$/i, '');
  add(withoutQual.replace(typeSufRe, ''));

  // Everything before "of" clause
  const ofIdx = s.toLowerCase().indexOf(' of ');
  if (ofIdx > 5) add(s.slice(0, ofIdx));
  if (ofIdx > 5) add(s.slice(0, ofIdx).replace(typeSufRe, ''));

  // Drop ordinal prefix
  add(s.replace(/^(first|second|third|fourth|fifth)\s+/i, ''));

  return cands;
}

async function fetchByTitle(label) {
  const candidates = generateCandidates(label);
  for (const [i, title] of candidates.entries()) {
    try {
      const url = REST + encodeURIComponent(title.replace(/ /g, '_'));
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.type === 'disambiguation') continue;
      const desc = trimSummary(d.extract);
      if (!desc) continue;
      // Use lenient thresholds — later (more-stripped) candidates need lower bar
      const threshold = i === 0 ? 0.1 : 0.05;
      if (relevanceScore(label, d.title || '') < threshold) continue;
      return { desc, wiki: (d.title || '').replace(/ /g, '_') };
    } catch { /* skip */ }
  }
  return null;
}

async function fetchBySearch(label) {
  const queries = [label, ...generateCandidates(label).slice(1, 3)];
  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        action: 'query', list: 'search', srsearch: q,
        srlimit: '5', srnamespace: '0', format: 'json', origin: '*',
      });
      const res = await fetch(`${SEARCH}?${params}`, { headers: HEADERS });
      if (!res.ok) continue;
      const d = await res.json();
      const results = d?.query?.search || [];
      for (const hit of results) {
        if (relevanceScore(label, hit.title) < 0.12) continue;
        const summaryRes = await fetch(REST + encodeURIComponent(hit.title.replace(/ /g, '_')), { headers: HEADERS });
        if (!summaryRes.ok) continue;
        const sd = await summaryRes.json();
        if (sd.type === 'disambiguation') continue;
        const desc = trimSummary(sd.extract);
        if (desc) return { desc, wiki: (sd.title || '').replace(/ /g, '_') };
      }
    } catch { /* skip */ }
  }
  return null;
}

async function fetchSummary(item) {
  // 1. Try Wikipedia (preferred — richer prose)
  const wiki = await fetchByTitle(item.label);
  if (wiki) return { ...wiki, source: 'wiki' };

  const wikiSearch = await fetchBySearch(item.label);
  if (wikiSearch) return { ...wikiSearch, source: 'wiki' };

  // 2. Fallback: synthesise from label anatomy
  const desc = templateDesc(item.label, item.system);
  return { desc, wiki: null, source: 'template' };
}

// ── 5. Concurrent fetch pool ─────────────────────────────────────────────────
async function runPool(items, fn, concurrency) {
  const results = new Map();
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      if (i % 100 === 0) console.log(`  ${i}/${items.length}…`);
      try { results.set(items[i].label, await fn(items[i])); }
      catch { results.set(items[i].label, null); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`  ${items.length}/${items.length} done.`);
  return results;
}

// ── 6. Run ───────────────────────────────────────────────────────────────────
console.log('\nFetching Wikipedia summaries (with template fallback)…');
const fetched = await runPool(allLabels, fetchSummary, CONCURRENCY);

const wikiHits     = [...fetched.values()].filter(r => r?.source === 'wiki').length;
const templateHits = [...fetched.values()].filter(r => r?.source === 'template').length;
const misses       = [...fetched.values()].filter(r => !r).length;
console.log(`wiki hits: ${wikiHits}  template hits: ${templateHits}  misses: ${misses}`);
console.log(`total coverage: ${wikiHits + templateHits}/${allLabels.length}`);

// ── 7. Build output ──────────────────────────────────────────────────────────
const groups = allLabels.filter(x => x.isGroup  && fetched.get(x.label)).sort((a, b) => a.label.localeCompare(b.label));
const fine   = allLabels.filter(x => !x.isGroup && fetched.get(x.label)).sort((a, b) => a.label.localeCompare(b.label));

function entryLines(items) {
  return items.map(({ label }) => {
    const r = fetched.get(label);
    // Sanitize label key — strip stray quotes/apostrophes from raw Z-Anatomy node names
    const safeLabel = label.replace(/'/g, '').trim();
    const desc = r.desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `  '${safeLabel}': {\n    desc: '${desc}',\n    wiki: ${r.wiki ? `'${r.wiki}'` : 'null'},\n  },`;
  }).join('\n');
}

const newBlock = [
  groups.length ? `  /* ── groups ── */\n${entryLines(groups)}`         : '',
  fine.length   ? `  /* ── fine structures ── */\n${entryLines(fine)}`  : '',
].filter(Boolean).join('\n\n');

// Replace the generated block in parts.js
const genMarker = /\/\* ── GENERATED \([^)]+\) ── \*\/[\s\S]*?(?=\n};)/;
const newMarker = `/* ── GENERATED (${new Date().toISOString().slice(0, 10)}) ── */\n${newBlock}\n`;

let newSource;
if (genMarker.test(partsSource)) {
  newSource = partsSource.replace(genMarker, newMarker);
} else {
  newSource = partsSource.replace(/(\n};)(\s*\nconst SYSTEM_FALLBACK)/, `\n  ${newMarker}$1$2`);
}

// ── 8. Write ─────────────────────────────────────────────────────────────────
if (DRY) {
  console.log('\n── dry run: last 3000 chars ──');
  console.log(newSource.slice(-3000));
} else {
  writeFileSync(resolve(ROOT, 'js/data/parts.js'), newSource);
  const total = existingKeys.size + wikiHits + templateHits;
  console.log(`\nWrote js/data/parts.js — ${total} total entries (+${wikiHits + templateHits} new)`);
  console.log(`  ${wikiHits} from Wikipedia, ${templateHits} from template`);
}
