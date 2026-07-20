// Extract the anatomy101l taxonomy from the Z-Anatomy GLB files.
//   node scripts/extract-taxonomy.mjs   (run from repo root)
// Reads models/*.glb, walks each mesh-bearing node up to its nearest named
// ancestor, merges left/right, and writes docs/anatomy-taxonomy.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const SYS = [
  ['skin', 'z-skin'], ['muscular', 'z-muscular'], ['skeleton', 'z-skeleton'],
  ['cardiovascular', 'z-cardiovascular'], ['nervous', 'z-nervous'], ['organs', 'z-organs'],
];

function parseGLB(buf) {
  let off = 12, json = null;
  while (off < buf.length) {
    const clen = buf.readUInt32LE(off), ctype = buf.readUInt32LE(off + 4);
    if (ctype === 0x4E4F534A) { json = JSON.parse(buf.subarray(off + 8, off + 8 + clen).toString('utf8')); break; }
    off += 8 + clen;
  }
  return json;
}
const sideOf = raw => { const m = raw.match(/\.\.?([rl])$/i); return m ? (m[1].toLowerCase() === 'r' ? 'right' : 'left') : null; };
const isGroup = raw => /\.g$/i.test(raw);
const baseLabel = raw => raw.replace(/\.\.?[rlg]$/i, '').replace(/\s+/g, ' ').trim();

const perSystem = {}, master = new Map();
let totalMeshNodes = 0;

for (const [sysId, file] of SYS) {
  const g = parseGLB(readFileSync(resolve(ROOT, 'models', file + '.glb')));
  const nodes = g.nodes || [];
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach(ci => { parent[ci] = i; }));
  const nearestNamed = i => { let c = i; while (c !== -1) { if (nodes[c].name && !/^rootnode$/i.test(nodes[c].name)) return c; c = parent[c]; } return -1; };
  const nearestRegion = i => { let c = i; while (c !== -1) { if (nodes[c].name && isGroup(nodes[c].name)) return baseLabel(nodes[c].name); c = parent[c]; } return null; };

  const struct = new Map();
  nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    totalMeshNodes++;
    const ni = nearestNamed(i);
    if (ni === -1) return;
    const raw = nodes[ni].name, label = baseLabel(raw);
    if (!label) return;
    const side = sideOf(raw) || sideOf(n.name || '');
    const region = nearestRegion(ni) || nearestRegion(i);
    for (const map of [struct, master]) {
      const key = label.toLowerCase();
      if (!map.has(key)) map.set(key, { label, system: sysId, region, sides: new Set(), meshCount: 0 });
      const e = map.get(key); if (side) e.sides.add(side); e.meshCount++;
    }
  });
  perSystem[sysId] = [...struct.values()].map(e => ({ ...e, sides: [...e.sides] })).sort((a, b) => a.label.localeCompare(b.label));
}
const masterArr = [...master.values()].map(e => ({ ...e, sides: [...e.sides] })).sort((a, b) => a.label.localeCompare(b.label));
writeFileSync(resolve(ROOT, 'docs/anatomy-taxonomy.json'), JSON.stringify({ perSystem, master: masterArr }, null, 2));
console.log('mesh nodes:', totalMeshNodes, '| unique structures:', masterArr.length);
for (const [s] of SYS) console.log(`  ${s}: ${perSystem[s].length}`);
