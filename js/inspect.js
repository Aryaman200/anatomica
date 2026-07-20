import * as THREE from 'three';
import { scene, camera, renderer, controls, requestRender } from './scene.js?v=1784447089342';
import { getGroups, getSearchIndex } from './loader.js?v=1784447089342';
import { SYSTEMS } from './config.js?v=1784447089342';
import { openPartPanel, applyHighlight } from './ui.js?v=1784447089342';

const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let downPos = null;

function resolveTerm(mesh) {
  const candidates = getSearchIndex().filter(t => t.meshes.includes(mesh));
  if (!candidates.length) return null;
  // prefer the fine structure (e.g. 'Left ventricle') over its coarse group ('Heart')
  return candidates.find(t => t.kind === 'structure') || candidates[0];
}

function pick(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  ray.setFromCamera(mouse, camera);

  const targets = [];
  Object.values(getGroups()).forEach(g => { if (g.visible) targets.push(g); });

  const hits = ray.intersectObjects(targets, true).filter(h => h.object.isMesh && h.object.visible);
  if (!hits.length) return;

  // Prefer solid (non-fascia, non-skin) meshes — lets user click through
  // translucent fascia wrapping to the muscle or bone underneath.
  const solid = hits.filter(h => !h.object.material?._isFascia && !h.object.material?._isSkin);
  const best  = solid.length ? solid[0] : hits[0];
  const mesh  = best.object;
  const term = resolveTerm(mesh);
  const sysId = mesh.material?._sysId;
  const sys = SYSTEMS.find(s => s.id === sysId);

  const label = term ? term.label : (sys ? sys.name : 'Structure');
  applyHighlight(term ? term.label : label);
  openPartPanel(label, sysId);

  const dir = new THREE.Vector3().subVectors(best.point, camera.position).normalize();
  const dist = camera.position.distanceTo(best.point);
  controls.target.lerp(best.point, 0.5);
  camera.position.addScaledVector(dir, dist * 0.12);
  controls.update();
  requestRender();
}

export function initInspect() {
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    downPos = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', e => {
    if (e.button !== 0 || !downPos) return;
    const dx = e.clientX - downPos.x;
    const dy = e.clientY - downPos.y;
    downPos = null;
    if (Math.hypot(dx, dy) > 6) return; // was a drag/rotate, not a click
    pick(e.clientX, e.clientY);
  });
}
