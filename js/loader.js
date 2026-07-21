import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/meshopt_decoder.module.js';

import { scene, requestRender } from './scene.js?v=1784613961254';
import { SYSTEMS } from './config.js?v=1784613961254';
import { cleanLabel, colourForStructure, ANATOMY_STRUCTURES, labelFingerprint } from './data/anatomy.js?v=1784613961254';
import { GROUPS } from './data/groups.js?v=1784613961254';

// Fingerprint → pretty taxonomy label. Recovers the space-separated names
// after THREE's GLTFLoader has sanitized GLB node names to underscore blobs.
const FP_TO_PRETTY = new Map();
for (const s of ANATOMY_STRUCTURES) {
  const fp = labelFingerprint(s.label);
  if (fp && !FP_TO_PRETTY.has(fp)) FP_TO_PRETTY.set(fp, s.label);
}


const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

export const groups = {};
export function getGroups() { return groups; }
export const bounds = {
  min: new THREE.Vector3(-1, 0, -0.4),
  max: new THREE.Vector3( 1, 2.0, 0.4),
};
export let searchIndex = [];
export function getSearchIndex() { return searchIndex; }

let boundsInit = false;
let loadedCount = 0;
const total = SYSTEMS.length;

const ldBar    = document.getElementById('ld-bar');
const ldDetail = document.getElementById('ld-detail');
const loaderEl = document.getElementById('loader');

function loadOne(sys) {
  return new Promise((resolve, reject) => {
    loader.load(sys.file, gltf => {
      const box = new THREE.Box3().setFromObject(gltf.scene);

      if (!boundsInit) {
        bounds.min.copy(box.min); bounds.max.copy(box.max);
        boundsInit = true;
      } else {
        bounds.min.min(box.min); bounds.max.max(box.max);
      }

      let ro = 0;
      if (sys.id === 'organs')         ro = 0;
      if (sys.id === 'skeleton')       ro = 1;
      if (sys.id === 'nervous')        ro = 2;
      if (sys.id === 'cardiovascular') ro = 3;
      if (sys.id === 'muscular')       ro = 4;
      if (sys.id === 'skin')           ro = 5;

      gltf.scene.traverse(c => {
        if (!c.isMesh) return;
        c.frustumCulled = false;

        // Attribute this mesh to its nearest named ancestor — the Z-Anatomy
        // structure name (e.g. 'Left ventricle', 'Femur.r') — then clean and
        // colour it individually. This is what makes every bone/vessel/organ
        // substructure addressable for highlight + click, and gives each its
        // own colour instead of a crude per-system keyword group.
        let named = c;
        while (named && (!named.name || /^rootnode$/i.test(named.name))) named = named.parent;
        const rawName = (named && named.name) ? named.name : sys.name;
        // Prefer the pretty taxonomy label ('Angular artery') to the sanitized
        // runtime name ('Angular_arteryr'); fall back to raw-cleaned if unmatched.
        const fp        = labelFingerprint(rawName);
        const label     = FP_TO_PRETTY.get(fp) || cleanLabel(rawName);
        const meshColor = colourForStructure(label, sys.id);

        const isSkin      = sys.id === 'skin';
        const nlow        = label.toLowerCase();
        const isFascia    = (sys.id === 'muscular') && /tendon|aponeuros|fascia|ligament|galea|retinacul/.test(nlow);
        const translucent = isSkin || isFascia;

        // Default look is SOLID/opaque so the depth buffer resolves occlusion
        // cleanly — this is what stops meshes popping in/out while rotating.
        // Only the skin shell and thin fasciae stay translucent, drawn last.
        const fullOpacity = isSkin ? 0.13 : (isFascia ? 0.16 : 1.0);
        const meshRO      = isSkin ? 12 : (isFascia ? 6 : 0);
        c.renderOrder = meshRO;

        const mat = new THREE.MeshPhysicalMaterial({
          color:            meshColor,
          roughness:        sys.roughness,
          metalness:        sys.metalness,
          transparent:      translucent,
          opacity:          fullOpacity,
          depthWrite:       !translucent,
          side:             sys.side,
          clearcoat:        0.06,
          clearcoatRoughness: 0.5,
          emissive:         new THREE.Color(meshColor).multiplyScalar(0.03),
          envMapIntensity:  0.3,
        });
        c.material = mat;

        mat._label           = label;
        mat._sysId           = sys.id;
        mat._isFascia        = isFascia;
        mat._isSkin          = isSkin;
        mat._origColor       = meshColor;
        mat._fullOpacity     = fullOpacity;      // opaque solid ('full'/'white')
        mat._xrayOpacity     = sys.opacity;      // translucent glass ('xray')
        mat._origOpacity     = fullOpacity;      // legacy field read elsewhere
        mat._origEmissive    = new THREE.Color(meshColor).multiplyScalar(0.03).getHex();
        mat._origRenderOrder = meshRO;
        mat._origDepthWrite  = !translucent;

        c.castShadow    = false;
        c.receiveShadow = false;
      });

      const g = new THREE.Group();
      g.name        = sys.id;
      g.renderOrder = ro;
      g.add(gltf.scene);
      g.visible = sys.active;
      scene.add(g);
      groups[sys.id] = g;

      loadedCount++;
      const pct = Math.round((loadedCount / total) * 100);
      if(ldBar) ldBar.style.width = pct + '%';
      if(ldDetail) ldDetail.textContent = `${sys.name} ready (${loadedCount}/${total})`;
      requestRender();
      resolve();
    }, undefined, reject);
  });
}

// Build the search/highlight index from the meshes actually loaded.
//  - one 'structure' entry per fine label (e.g. 'Left ventricle') → its meshes
//  - one 'group' entry per modelled coarse label (e.g. 'Heart') → the union of
//    its member structures' meshes (js/data/groups.js)
// A group label wins over a fine label of the same name (e.g. 'Femur').
function buildSearchIndex() {
  searchIndex.length = 0;

  const fine = new Map(); // label -> { label, sys, meshes, kind }
  Object.entries(groups).forEach(([sysId, g]) => {
    g.traverse(c => {
      if (!c.isMesh || !c.material) return;
      const label = c.material._label;
      if (!label) return;
      if (!fine.has(label)) fine.set(label, { label, sys: sysId, meshes: [], kind: 'structure' });
      fine.get(label).meshes.push(c);
    });
  });
  // Expose for browser debugging.
  try { window.__anatomy101 = { fine, groups, searchIndex }; } catch(e) {}

  const claimed = new Set();
  for (const gr of GROUPS) {
    if (!gr.modelled) continue;
    const meshes = [];
    let sys = gr.system;
    for (const member of gr.members) {
      const f = fine.get(member);
      if (f) { meshes.push(...f.meshes); if (!sys) sys = f.sys; }
    }
    if (meshes.length) { searchIndex.push({ label: gr.label, sys, meshes, kind: 'group' }); claimed.add(gr.label); }
  }
  for (const e of fine.values()) if (!claimed.has(e.label)) searchIndex.push(e);
}

export async function loadAll(onComplete) {
  if(ldDetail) ldDetail.textContent = 'Fetching models…';
  const order = [...SYSTEMS].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));
  
  for (const sys of order) {
    try { await loadOne(sys); }
    catch (e) {
      console.error('Failed:', sys.id, e);
      loadedCount++;
      if(ldBar) ldBar.style.width = Math.round((loadedCount / total) * 100) + '%';
    }
  }
  
  setTimeout(() => { 
    if(loaderEl) {
      loaderEl.classList.add('hidden'); 
      window.dispatchEvent(new Event('anatomy101-loaded'));
    }
  }, 350);
  setTimeout(() => { 
    const hint = document.getElementById('hint');
    if(hint) hint.classList.add('gone'); 
  }, 5500);

  buildSearchIndex(); // GUARANTEE IT RUNS ONCE ALL MODELS ARE DONE

  if(onComplete) onComplete();
}
