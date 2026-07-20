import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const tax = JSON.parse(readFileSync(resolve(ROOT, 'docs/anatomy-taxonomy.json'), 'utf8'));

// Order + display metadata for the 6 systems (pure data, no THREE).
const SYSTEM_LIST = [
  { id: 'skeleton',       name: 'Skeleton',           desc: 'Every named bone, cartilage and tooth.' },
  { id: 'muscular',       name: 'Muscles',            desc: 'Skeletal muscles and fasciae.' },
  { id: 'cardiovascular', name: 'Cardiovascular',     desc: 'The heart and the full arterial and venous tree.' },
  { id: 'nervous',        name: 'Nervous System',     desc: 'Brain, cord, nerves and the sense organs.' },
  { id: 'organs',         name: 'Organs',             desc: 'The viscera — digestive, respiratory, urinary and more.' },
  { id: 'skin',           name: 'Skin',               desc: 'The body surface and its regions.' },
];

// Flatten master taxonomy → structures, keep system + region + sides + meshCount.
const structures = tax.master
  .map(s => ({ label: s.label, system: s.system, region: s.region || null, sides: s.sides || [], meshes: s.meshCount || 0 }))
  .sort((a, b) => (a.system.localeCompare(b.system)) || a.label.localeCompare(b.label));

const q = s => JSON.stringify(s);
const serStruct = s =>
  `  { label: ${q(s.label)}, system: ${q(s.system)}, region: ${s.region ? q(s.region) : 'null'}, sides: [${s.sides.map(q).join(', ')}], meshes: ${s.meshes} }`;

const HEADER = `// ============================================================================
//  anatomy.js — the anatomy101l vocabulary of Anatomy101.
//
//  AUTO-GENERATED from the Z-Anatomy GLB node names (see docs/anatomy-taxonomy.json,
//  scripts/gen-anatomy). ${structures.length} structures across ${SYSTEM_LIST.length} systems,
//  left/right merged into one base label.
//
//  PURE data + pure functions only — no 'three' import — so directory pages and
//  the model loader can both use it. The loader attributes each mesh to its
//  nearest named ancestor, cleans it with cleanLabel(), and colours it with
//  colourForStructure(); highlight/search match on the cleaned label.
// ============================================================================

export const SYSTEM_LIST = ${JSON.stringify(SYSTEM_LIST, null, 2).replace(/\n/g, '\n')};

export const SYSTEM_NAME = Object.fromEntries(SYSTEM_LIST.map(s => [s.id, s.name]));

// Strip the Z-Anatomy side/group suffix (.r / .l / .g, incl. the ..r typo)
// and normalise whitespace, so 'Kidney.l' and 'Kidney.r' → 'Kidney'.
export function cleanLabel(raw) {
  return String(raw || '').replace(/\\.\\.?[rlg]$/i, '').replace(/\\s+/g, ' ').trim();
}
export function sideOf(raw) {
  const m = String(raw || '').match(/\\.\\.?([rl])$/i);
  return m ? (m[1].toLowerCase() === 'r' ? 'right' : 'left') : null;
}

// ---- deterministic per-structure colour --------------------------------
// Each structure gets its OWN colour (no keyword grouping) but stays inside a
// coherent per-system palette: a system/sub-family base hue, then a small
// hash-driven jitter so neighbouring parts read as distinct.
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const to = v => Math.round((v + m) * 255);
  return (to(r) << 16) | (to(g) << 8) | to(b);
}
function organBase(l) {
  if (/liver|hepatic/.test(l)) return { h: 8, s: 55, l: 32 };
  if (/lung|pulmon|bronch|pleura|alveol/.test(l)) return { h: 350, s: 40, l: 66 };
  if (/heart|cardiac|ventric|atri|myocard/.test(l)) return { h: 353, s: 60, l: 42 };
  if (/stomach|gastric/.test(l)) return { h: 28, s: 45, l: 62 };
  if (/colon|caec|rectum|sigmoid|taenia|append/.test(l)) return { h: 32, s: 42, l: 56 };
  if (/intestin|ileum|jejun|duoden|bowel/.test(l)) return { h: 34, s: 48, l: 68 };
  if (/kidney|renal|nephr/.test(l)) return { h: 12, s: 52, l: 40 };
  if (/spleen|splenic/.test(l)) return { h: 330, s: 40, l: 38 };
  if (/pancrea/.test(l)) return { h: 40, s: 55, l: 58 };
  if (/gall|bile|biliary/.test(l)) return { h: 96, s: 45, l: 40 };
  if (/bladder|ureter|urethra|vesic/.test(l)) return { h: 52, s: 55, l: 62 };
  if (/oesophag|esophag|pharynx|larynx|trachea/.test(l)) return { h: 18, s: 45, l: 62 };
  if (/thyroid|parathyroid|thymus|adrenal|suprarenal|pituitary|hypophysis|pineal|gland/.test(l)) return { h: 36, s: 60, l: 58 };
  if (/prostate|testis|epididymis|penis|seminal|ductus|ovar|uter|vagina/.test(l)) return { h: 320, s: 35, l: 55 };
  if (/tongue|palate|gingiva|salivary|parotid|sublingual|submandibular|uvula/.test(l)) return { h: 355, s: 42, l: 58 };
  if (/nose|nasal|sinus/.test(l)) return { h: 20, s: 40, l: 64 };
  return { h: 20, s: 40, l: 58 };
}
export function colourForStructure(label, system) {
  const l = String(label || '').toLowerCase();
  let base;
  if (system === 'cardiovascular') {
    base = /vein|venous|vena|cava|jugular|venule|sinus of|dural sinus/.test(l) ? { h: 262, s: 52, l: 52 } : { h: 2, s: 68, l: 48 };
  } else if (system === 'nervous') {
    if (/eye|cornea|retina|sclera|lens|vitreous|iris|pupil|conjunctiva|choroid|ciliary/.test(l)) base = { h: 205, s: 14, l: 85 };
    else if (/brain|cerebr|cerebell|pons|medulla|thalam|hippocamp|cortex|gyrus|lobe|ventricle of/.test(l)) base = { h: 26, s: 28, l: 74 };
    else base = { h: 47, s: 42, l: 74 };
  } else if (system === 'organs') {
    base = organBase(l);
  } else if (system === 'skeleton') {
    base = /cartilage|disc|meniscus|tooth|incisor|canine|molar|premolar/.test(l) ? { h: 190, s: 12, l: 84 } : { h: 40, s: 22, l: 80 };
  } else if (system === 'muscular') {
    base = /tendon|fascia|aponeuros|ligament|galea|retinacul/.test(l) ? { h: 44, s: 18, l: 82 } : { h: 2, s: 50, l: 46 };
  } else { // skin
    base = { h: 26, s: 40, l: 66 };
  }
  const hsh = hashStr(label || '');
  const dh = (hsh % 16) - 8;
  const ds = ((hsh >> 4) % 12) - 6;
  const dl = ((hsh >> 9) % 14) - 7;
  return hslToHex(base.h + dh, clamp(base.s + ds, 6, 92), clamp(base.l + dl, 20, 90));
}

// ---- the vocabulary -----------------------------------------------------
export const ANATOMY_STRUCTURES = [
${structures.map(serStruct).join(',\n')},
];

export const STRUCTURE_BY_LABEL = new Map(ANATOMY_STRUCTURES.map(s => [s.label.toLowerCase(), s]));
export function structuresForSystem(sysId) { return ANATOMY_STRUCTURES.filter(s => s.system === sysId); }
`;

writeFileSync(resolve(ROOT, 'js/data/anatomy.js'), HEADER);
console.log('wrote js/data/anatomy.js —', structures.length, 'structures');
console.log('per system:', SYSTEM_LIST.map(s => `${s.id}:${structures.filter(x => x.system === s.id).length}`).join(' '));
