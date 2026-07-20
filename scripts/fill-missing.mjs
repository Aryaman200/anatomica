/**
 * fill-missing.mjs
 * One-shot: finds ALL vocab labels not in PART_INFO and fetches/generates them.
 * Usage: node scripts/fill-missing.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '..');

// Load current parts.js by actually importing the module
const { PART_INFO } = await import('../js/data/parts.js');
const existingKeys = new Set(Object.keys(PART_INFO));
console.log('Loaded PART_INFO keys:', existingKeys.size);

// Load all vocab
const anatomySrc = readFileSync(resolve(ROOT, 'js/data/anatomy.js'), 'utf8');
const groupsSrc  = readFileSync(resolve(ROOT, 'js/data/groups.js'), 'utf8');
const partsSrc   = readFileSync(resolve(ROOT, 'js/data/parts.js'), 'utf8');

const labelToSystem = new Map();
for (const m of anatomySrc.matchAll(/\{\s*label:\s*"([^"]+)",\s*system:\s*"([^"]+)"/g)) {
  if (!labelToSystem.has(m[1])) labelToSystem.set(m[1], m[2]);
}
const groupLabels = new Set();
for (const m of groupsSrc.matchAll(/label:\s*'([^']+)'/g)) groupLabels.add(m[1]);
for (const m of groupsSrc.matchAll(/label:\s*"([^"]+)"/g)) groupLabels.add(m[1]);

// Find truly missing
const missing = [];
for (const lbl of groupLabels) {
  if (!existingKeys.has(lbl)) missing.push({ label: lbl, system: null, isGroup: true });
}
for (const [lbl, sys] of labelToSystem) {
  if (!existingKeys.has(lbl) && !groupLabels.has(lbl)) missing.push({ label: lbl, system: sys, isGroup: false });
}

console.log('Truly missing:', missing.length);
if (missing.length === 0) { console.log('Nothing to do!'); process.exit(0); }
missing.forEach(x => console.log(' -', x.label));

// Template generator (same as fetch-part-info.mjs)
function templateDesc(label, system) {
  const l = label.toLowerCase();
  const ofM = label.match(/\s+of\s+(.+)$/i);
  const parent = ofM ? ofM[1].toLowerCase() : null;
  const ctx    = parent ? ` of the ${parent}` : '';
  if (/papillary muscle/.test(l)) return `A conical projection inside the heart${ctx} that anchors the valve leaflets via chordae tendineae, preventing regurgitation.`;
  if (/leaflet|cusp/.test(l) && /valve|pulmonary|aortic|mitral|tricuspid/.test(l)) return `A flap${ctx} that opens and closes with each heartbeat to keep blood flowing in one direction through the valve.`;
  if (/\bartery\b|\barterial\b/.test(l)) return parent ? `An artery${ctx} that delivers oxygenated blood to its target region.` : 'An artery forming part of the arterial vascular tree.';
  if (/\bvein\b|\bvenous\b|\bvenule\b/.test(l)) return parent ? `A vein${ctx} that returns deoxygenated blood toward the heart.` : 'A vein forming part of the venous drainage system.';
  if (/\bnerve\b|\bneural\b/.test(l)) return parent ? `A nerve branch${ctx} carrying sensory or motor signals.` : 'A peripheral nerve or nerve branch transmitting signals between the body and the central nervous system.';
  if (/\bmuscle\b|\bmuscular\b/.test(l)) return parent ? `A skeletal muscle${ctx} that contributes to movement or posture.` : 'A skeletal muscle that moves or stabilises part of the body.';
  if (/\btendon\b/.test(l)) return `A fibrous cord${ctx} that attaches muscle to bone, transmitting the force of contraction.`;
  if (/\bligament\b/.test(l)) return `A band of fibrous connective tissue${ctx} that connects bones and stabilises the joint.`;
  if (/\bfascia\b|\baponeurosis\b/.test(l)) return `A sheet of fibrous connective tissue${ctx} that encloses and separates muscles, transmitting mechanical force.`;
  if (/\bbone\b|\bossicle\b|\bprocess\b|\btuberosity\b|\bcondyle\b|\btrochanter\b|\bmalleolus\b/.test(l)) return `A bony structure${ctx} forming part of the skeletal framework.`;
  if (/\bcartilage\b|\bmeniscus\b/.test(l)) return `Flexible connective tissue${ctx} that cushions joints and provides structural support.`;
  if (/\bsinus\b/.test(l)) return `A hollow space or channel${ctx} within bone or soft tissue, often carrying blood or air.`;
  if (/\bforamen\b|\bcanal\b|\bmeatus\b/.test(l)) return `An opening or passageway${ctx} through which nerves, vessels, or other structures pass.`;
  if (/\bfossa\b|\bgroove\b|\bsulcus\b/.test(l)) return `A depression or groove${ctx} in bone or soft tissue.`;
  if (/\bgyrus\b/.test(l)) return `A ridge of cerebral cortex${ctx}, separated from adjacent ridges by sulci.`;
  if (/\blobe\b/.test(l)) return `A rounded division${ctx} of an organ, demarcated by fissures or structural boundaries.`;
  if (/\bplexus\b/.test(l)) return `A network of intersecting nerves or vessels${ctx}.`;
  if (/\bganglion\b/.test(l)) return `A cluster of nerve cell bodies${ctx} outside the central nervous system.`;
  if (/\bduct\b/.test(l)) return `A tube-like conduit${ctx} that carries secretions or fluids.`;
  if (/lymph node|lymphatic/.test(l)) return `A small lymphoid organ${ctx} that filters lymph and hosts immune cells.`;
  if (/\bvalve\b/.test(l)) return `A one-way structure${ctx} that controls the flow of fluid by opening and closing in response to pressure differences.`;
  if (system === 'cardiovascular') return `Part of the cardiovascular system${ctx}, contributing to the circulation of blood.`;
  if (system === 'muscular') return `A skeletal muscle${ctx} contributing to movement, posture, and stability.`;
  if (system === 'nervous') return `Part of the nervous system${ctx}, participating in the transmission or integration of neural signals.`;
  if (system === 'skeleton') return `A bony element${ctx} forming part of the skeletal framework.`;
  if (system === 'organs') return `A visceral structure${ctx} involved in organ-system functions.`;
  if (system === 'skin') return `A region of the body surface${ctx}, part of the integumentary system.`;
  return `An anatomy101l structure${ctx} of the human body.`;
}

// Wikipedia fetch (best-effort)
const REST    = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const HEADERS = { 'User-Agent': 'Anatomy101/1.0 (anatomy viewer; educational)' };

function trimSummary(extract, maxChars = 220) {
  if (!extract) return null;
  const text = extract.replace(/\s+/g, ' ').trim();
  const sentences = text.split(/(?<=[.!?])\s+/);
  const first = sentences[0] || '';
  let out = first.length <= maxChars ? first : first.slice(0, maxChars - 1).trimEnd() + '.';
  if (sentences.length > 1) { const c2 = out + ' ' + sentences[1]; if (c2.length <= maxChars) out = c2; }
  return out.trim() || null;
}

async function fetchWiki(label) {
  const clean = label.replace(/^\(|\)$/g, '').trim();
  try {
    const res = await fetch(REST + encodeURIComponent(clean.replace(/ /g, '_')), { headers: HEADERS });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.type === 'disambiguation' || !d.extract) return null;
    const desc = trimSummary(d.extract);
    if (!desc) return null;
    const titleWords = new Set((d.title||'').toLowerCase().split(/\W+/).filter(w=>w.length>3));
    const labelWords = new Set(label.toLowerCase().split(/\W+/).filter(w=>w.length>3&&!['left','right','deep','anterior','posterior'].includes(w)));
    const overlap = [...labelWords].filter(w=>titleWords.has(w)).length;
    if (labelWords.size > 0 && overlap / labelWords.size < 0.1) return null;
    return { desc, wiki: (d.title||'').replace(/ /g, '_') };
  } catch { return null; }
}

// Process missing labels
const newEntries = [];
for (const item of missing) {
  const wiki = await fetchWiki(item.label);
  if (wiki) {
    newEntries.push({ label: item.label, ...wiki });
  } else {
    const desc = templateDesc(item.label, item.system);
    newEntries.push({ label: item.label, desc, wiki: null });
  }
}

console.log('\nNew entries generated:', newEntries.length);

// Append to the generated block in parts.js
const entryText = newEntries.map(({ label, desc, wiki }) => {
  const safeLabel = label.replace(/'/g, '').trim();
  const safeDesc  = desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `  '${safeLabel}': {\n    desc: '${safeDesc}',\n    wiki: ${wiki ? `'${wiki}'` : 'null'},\n  },`;
}).join('\n');

// Inject before the closing `};` of the GENERATED block
const updated = partsSrc.replace(
  /(\n};)(\s*\nconst SYSTEM_FALLBACK)/,
  `\n${entryText}\n$1$2`
);

writeFileSync(resolve(ROOT, 'js/data/parts.js'), updated);
console.log('Done. Total PART_INFO keys now:', Object.keys(PART_INFO).length + newEntries.length);
