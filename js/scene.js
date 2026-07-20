import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds } from './loader.js?v=1784447089342';

export const canvasWrap = document.getElementById('canvas-wrap');
export const canvas     = document.getElementById('three-canvas');

// ── RENDERER ──
export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  logarithmicDepthBuffer: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio * (window.devicePixelRatio < 1.5 ? 1.5 : 1), 2.5));
renderer.setSize(canvasWrap.clientWidth, canvasWrap.clientHeight);
renderer.setClearColor(0x090c11, 1);
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x090c11, 0.01);

export const camera = new THREE.PerspectiveCamera(42, canvasWrap.clientWidth / canvasWrap.clientHeight, 0.01, 100);
camera.position.set(0, 1.0, 4.0);

// ── CONTROLS ──
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.055;
controls.minDistance    = 0.15;
controls.maxDistance    = 14;
controls.enablePan      = true;
controls.panSpeed       = 0.8;
controls.screenSpacePanning = true;
controls.zoomToCursor   = false;
controls.target.set(0, 0.9, 0);

// ── OPTIMIZATION: Render-on-demand ──
let renderRequested = false;
export function requestRender() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(render);
  }
}

function render() {
  renderRequested = false;
  controls.update(); // only required if damping is enabled and user is interacting
  renderer.render(scene, camera);
}

// Add change listener to controls so they trigger a render when moved
controls.addEventListener('change', requestRender);

// ── CUSTOM ZOOM (Targeted raycast) ──
const _zRay = new THREE.Raycaster();
const _zMouse = new THREE.Vector2();
const _zSpeed = 0.12;

renderer.domElement.addEventListener('wheel', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  _zMouse.set(
    ((e.clientX - rect.left) / rect.width)  * 2 - 1,
    -((e.clientY - rect.top)  / rect.height) * 2 + 1
  );
  _zRay.setFromCamera(_zMouse, camera);

  // OPTIMIZATION: Only raycast against top-level visible groups, not every single mesh blindly
  // Three.js will automatically cull children if bounding boxes don't intersect
  const hitTargets = [];
  scene.children.forEach(child => {
    if (child.isGroup && child.visible) hitTargets.push(child);
  });

  const hits = _zRay.intersectObjects(hitTargets, true);
  if (hits.length) {
    const hit  = hits[0].point;
    const dir  = new THREE.Vector3().subVectors(hit, camera.position).normalize();
    const dist = camera.position.distanceTo(hit);
    const step = Math.sign(-e.deltaY) * dist * _zSpeed;
    
    camera.position.addScaledVector(dir, step);
    controls.target.lerp(hit, 0.18);
    controls.update(); // triggers change event which triggers requestRender
    e.preventDefault();
  }
}, { passive: false });

// ── LIGHTING ──
const hemi = new THREE.HemisphereLight(0xddeeff, 0x442211, 0.45);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff8f0, 1.6);
key.position.set(2, 5, 3);
scene.add(key);

const fill = new THREE.DirectionalLight(0xc8d8ff, 0.5);
fill.position.set(-3, 1.5, -1);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffeedd, 0.55);
rim.position.set(0, 3, -5);
scene.add(rim);

const under = new THREE.DirectionalLight(0xffd0a0, 0.2);
under.position.set(0, -3, 1);
scene.add(under);

// ── RESIZE ──
new ResizeObserver(() => {
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  requestRender();
}).observe(canvasWrap);
