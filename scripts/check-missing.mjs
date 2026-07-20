import { readFileSync } from 'node:fs';
const anatomySrc = readFileSync('js/data/anatomy.js', 'utf8');
const groupsSrc  = readFileSync('js/data/groups.js', 'utf8');
const partsSrc   = readFileSync('js/data/parts.js', 'utf8');

const existingKeys = new Set();
for (const m of partsSrc.matchAll(/^\s+'([^']+)'\s*:/gm)) existingKeys.add(m[1]);

const anatomyLabels = new Set();
for (const m of anatomySrc.matchAll(/label:\s*"([^"]+)"/g)) anatomyLabels.add(m[1]);

const groupLabels = new Set();
for (const m of groupsSrc.matchAll(/label:\s*'([^']+)'/g)) groupLabels.add(m[1]);
for (const m of groupsSrc.matchAll(/label:\s*"([^"]+)"/g)) groupLabels.add(m[1]);

const checks = ['Wrist','Elbow','Knee','Eye','Ear','Larynx','Pituitary Gland','Hypothalamus','Gluteus maximus muscle'];
for (const c of checks) {
  const inAnatomy = anatomyLabels.has(c);
  const inGroups  = groupLabels.has(c);
  const inParts   = existingKeys.has(c);
  console.log(`${c}: anatomy=${inAnatomy} groups=${inGroups} parts=${inParts}`);
}
console.log('\nTotal anatomy labels:', anatomyLabels.size);
console.log('Total parts keys:', existingKeys.size);
