import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds } from './loader.js?v=1784613961254';

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

const initialAspect = (canvasWrap.clientWidth && canvasWrap.clientHeight) 
  ? (canvasWrap.clientWidth / canvasWrap.clientHeight) 
  : 1; // Fallback aspect to avoid NaN
export const camera = new THREE.PerspectiveCamera(42, initialAspect, 0.01, 100);
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

// Touch gesture scheme:
//   1 finger drag          → rotate (OrbitControls default)
//   pinch (2 fingers)      → zoom only (no incidental pan)
//   double-tap then drag   → pan (handled manually below)
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY };

// ── DOUBLE-TAP-DRAG PAN (touch) ──
// OrbitControls has no built-in "double-tap-drag = pan" gesture, so we detect it
// ourselves and translate camera + target across the screen-space plane. While a
// pan is active we disable OrbitControls so its single-finger rotate can't fight us.
{
  const el = renderer.domElement;
  const DOUBLE_TAP_MS = 300; // max gap between first tap release and second tap
  const TAP_MOVE_TOL  = 14;  // px — a "tap" must not travel further than this

  const _panL = new THREE.Vector3();
  const _panU = new THREE.Vector3();
  const _panV = new THREE.Vector3();

  let lastTapEnd = 0;
  let tapStartX = 0, tapStartY = 0, tapStartTime = 0;
  let panActive = false;
  let panPrevX = 0, panPrevY = 0;

  function panByPixels(deltaX, deltaY) {
    // Distance from camera to target, converted to world units per screen pixel.
    const dist = _panV.copy(camera.position).sub(controls.target).length();
    const worldPerPx = (2 * dist * Math.tan((camera.fov / 2) * Math.PI / 180)) / el.clientHeight;
    _panL.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * worldPerPx * controls.panSpeed);
    _panU.setFromMatrixColumn(camera.matrix, 1).multiplyScalar( deltaY * worldPerPx * controls.panSpeed);
    _panL.add(_panU);
    camera.position.add(_panL);
    controls.target.add(_panL);
    controls.update(); // fires 'change' → requestRender
  }

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { panActive = false; return; }
    const t = e.touches[0];
    const now = performance.now();
    if (now - lastTapEnd < DOUBLE_TAP_MS) {
      // Second tap landed quickly after the first → arm pan for the drag.
      panActive = true;
      controls.enabled = false; // stop OrbitControls rotating this same finger
      panPrevX = t.clientX;
      panPrevY = t.clientY;
      e.preventDefault();
    }
    tapStartX = t.clientX; tapStartY = t.clientY; tapStartTime = now;
  }, { passive: false });

  el.addEventListener('touchmove', (e) => {
    if (!panActive || e.touches.length !== 1) return;
    const t = e.touches[0];
    panByPixels(t.clientX - panPrevX, t.clientY - panPrevY);
    panPrevX = t.clientX; panPrevY = t.clientY;
    e.preventDefault();
  }, { passive: false });

  function endTouch(e) {
    const now = performance.now();
    if (panActive) {
      panActive = false;
      controls.enabled = true;
      lastTapEnd = 0; // consume the double-tap
      return;
    }
    // Record a clean, quick tap so the NEXT touchstart can pair with it.
    const ct = e.changedTouches[0];
    const moved = ct
      ? Math.abs(ct.clientX - tapStartX) > TAP_MOVE_TOL || Math.abs(ct.clientY - tapStartY) > TAP_MOVE_TOL
      : true;
    lastTapEnd = (!moved && now - tapStartTime < DOUBLE_TAP_MS) ? now : 0;
  }

  el.addEventListener('touchend', endTouch);
  el.addEventListener('touchcancel', () => { panActive = false; controls.enabled = true; });
}

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

export function getCameraState() {
  const p = camera.position;
  const t = controls.target;
  return `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)},${t.x.toFixed(3)},${t.y.toFixed(3)},${t.z.toFixed(3)}`;
}

export function setCameraState(stateStr) {
  if (!stateStr) return;
  const parts = stateStr.split(',').map(Number);
  if (parts.length !== 6 || parts.some(isNaN)) return;
  camera.position.set(parts[0], parts[1], parts[2]);
  controls.target.set(parts[3], parts[4], parts[5]);
  controls.update();
  requestRender();
}

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
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  requestRender();
}).observe(canvasWrap);
