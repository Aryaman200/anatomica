import * as THREE from 'three';
import { camera, controls, requestRender } from './scene.js?v=1784611432079';
import { getSearchIndex } from './loader.js?v=1784611432079';
import { applyHighlight, setSidebarHidden, isSidebarHidden } from './ui.js?v=1784611432079';
import { SEVERITY_LABEL, SEVERITY_COLOR, cleanDesc } from './data/conditions.js?v=1784611432079';
import { isModelled } from './data/groups.js?v=1784611432079';

/* ── PULSE ANIMATION ── */
let pulseRafId = null;
let pulseMeshes = [];
let pulseOrigScales = [];
let pulseOrigEmissive = [];
let pulseStartTime = 0;

// bpm hint per anatomy label – 0 = default (slow ambient)
const PULSE_BPM = {
  'Heart': 72, 'Left ventricle': 72, 'Right ventricle': 72,
  'Aorta': 68, 'Arteries': 68, 'Veins': 55,
  'Lungs': 16, 'Diaphragm': 16,
  'Brain': 30, 'Nervous System': 30,
};
const DEFAULT_BPM = 48;

function stopPulse() {
  if (pulseRafId) { cancelAnimationFrame(pulseRafId); pulseRafId = null; }
  pulseMeshes.forEach((m, i) => {
    if (!m.material) return;
    const o = pulseOrigScales[i];
    if (o) m.scale.copy(o);
    if (m.material.emissive && pulseOrigEmissive[i]) {
      m.material.emissive.copy(pulseOrigEmissive[i]);
      m.material.emissiveIntensity = 1;
    }
  });
  pulseMeshes = []; pulseOrigScales = []; pulseOrigEmissive = [];
}

function startPulse(meshes, labelHint) {
  stopPulse();
  if (!meshes || !meshes.length) return;

  const bpm = PULSE_BPM[labelHint] || DEFAULT_BPM;
  const period = 60 / bpm;           // seconds per beat
  const amplitude = 0.015;           // max scale swell (1.5%)
  const glowPeak = 0.55;             // peak emissive intensity multiplier

  pulseMeshes = meshes.slice(0, 80); // cap to 80 meshes for perf
  pulseOrigScales = pulseMeshes.map(m => m.scale.clone()); // preserve non-uniform scale
  pulseOrigEmissive = pulseMeshes.map(m => m.material?.emissive?.clone() || null);
  pulseStartTime = performance.now() / 1000;

  function tick() {
    const t = performance.now() / 1000 - pulseStartTime;
    // Cardiac-style: fast systole, slow diastole (sin² shape)
    const phase = (t % period) / period;
    const beat = Math.pow(Math.sin(Math.PI * phase), 2);
    const mult = 1 + amplitude * beat;

    pulseMeshes.forEach((m, i) => {
      if (!m.material || !pulseOrigScales[i]) return;
      m.scale.copy(pulseOrigScales[i]).multiplyScalar(mult);
      if (m.material.emissive && pulseOrigEmissive[i]) {
        m.material.emissive.copy(pulseOrigEmissive[i]).multiplyScalar(1 + glowPeak * beat);
        m.material.emissiveIntensity = 1;
      }
    });
    requestRender();
    pulseRafId = requestAnimationFrame(tick);
  }
  pulseRafId = requestAnimationFrame(tick);
}

const AUTOPLAY_MS = 4200;

let steps  = [];
let idx    = 0;
let playing = false;
let timer  = null;
let onBack = null;
let cond   = null;
let _autoClosedSidebar = false;  // track if WE closed it so we can restore it

/* Is this a small screen where the sidebar overlaps the model? */
const isSmallScreen = () => window.innerWidth <= 900;


/* Build the ordered step list for a condition. */
function buildSteps(c) {
  const out = [];

  // Overview — include causes if available
  const overviewBody = c.causes
    ? `${cleanDesc(c.desc)}\n\n**Causes:** ${c.causes}`
    : cleanDesc(c.desc);
  const allModelledParts = c.parts.filter(p => isModelled(p));
  out.push({ kicker: 'Overview', title: `What ${c.name} is`, body: overviewBody, parts: allModelledParts.length ? allModelledParts : c.parts, pulseLabel: null });

  // One step per modelled structure only — skip Spleen/Lymph Nodes/etc. not in the GLB
  c.parts.filter(p => isModelled(p)).forEach(part => {
    const note = c.partNotes && c.partNotes[part];
    out.push({
      kicker: 'Where it acts',
      title: part,
      body: note || `${c.name} involves the ${part.toLowerCase()} — highlighting how this structure is affected.`,
      parts: [part],
      pulseLabel: part,
    });
  });

  // Signs & symptoms + prevention if available
  const prevNote = c.prevention ? `\n\n**Prevention:** ${c.prevention}` : '';
  out.push({
    kicker: 'Signs & prevention',
    title: 'Signs and symptoms',
    symptoms: c.symptoms,
    preventionNote: c.prevention || null,
    parts: allModelledParts.length ? allModelledParts : c.parts,
    pulseLabel: null,
  });

  // Final overview — all modelled parts together
  const modelledParts = c.parts.filter(p => isModelled(p));
  const unmodelledParts = c.parts.filter(p => !isModelled(p));
  const totalNote = unmodelledParts.length
    ? ` (${unmodelledParts.join(', ')} not individually modelled in this view)`
    : '';
  out.push({
    kicker: 'The whole picture',
    title: 'Everything it touches',
    body: `${c.name} involves ${modelledParts.length} modelled structure${modelledParts.length === 1 ? '' : 's'}${totalNote}.`,
    parts: modelledParts.length ? modelledParts : c.parts,
    pulseLabel: null,
  });
  return out;
}

/* Smoothly move the camera to frame a set of meshes.
 *
 * Uses manual bbox from geometry.boundingBox × matrixWorld so hidden meshes
 * still contribute (Box3.expandByObject skips visible=false). Distance =
 * size.length() * 1.6 with 0.35 floor — the same formula the pre-Phase-6
 * walkthrough used, which framed heart/arteries/organs correctly.
 */
const _tmpBox = new THREE.Box3();
function focusMeshes(meshes) {
  if (!meshes || !meshes.length) return;
  const box = new THREE.Box3();
  let has = false;
  for (const m of meshes) {
    if (!m || !m.geometry) continue;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.updateWorldMatrix(true, false);
    _tmpBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
    if (_tmpBox.isEmpty()) continue;
    box.union(_tmpBox);
    has = true;
  }
  if (!has || box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length() || 0.5;

  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
  const dist = Math.max(size * 1.6, 0.35);
  const destPos = new THREE.Vector3().copy(center).addScaledVector(dir, dist);

  animateCamera(destPos, center, 620);
}

let animId = null;
function animateCamera(destPos, destTarget, duration) {
  if (animId) cancelAnimationFrame(animId);
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  let t0 = null;
  const ease = x => 1 - Math.pow(1 - x, 3);

  function frame(ts) {
    if (t0 === null) t0 = ts;
    const p = Math.min((ts - t0) / duration, 1);
    const e = ease(p);
    camera.position.lerpVectors(startPos, destPos, e);
    controls.target.lerpVectors(startTarget, destTarget, e);
    controls.update();
    requestRender();
    if (p < 1) animId = requestAnimationFrame(frame);
    else animId = null;
  }
  animId = requestAnimationFrame(frame);
}

function meshesFor(labels) {
  const set = [];
  labels.forEach(l => {
    const term = getSearchIndex().find(t => t.label === l);
    if (term) set.push(...term.meshes);
  });
  return set;
}

function applyStep() {
  const step = steps[idx];
  applyHighlight(step.parts, cond.name);
  const targetMeshes = meshesFor(step.parts);
  focusMeshes(targetMeshes);
  // Pulse the focused meshes — single-part steps pulse that part; multi-part steps no pulse
  if (step.pulseLabel && step.parts.length === 1) {
    startPulse(targetMeshes, step.pulseLabel);
  } else {
    stopPulse();
  }
  // On mobile: briefly collapse panel so model is visible during camera animation
  autoCollapseForStep();
  renderPanel();
}

function renderPanel() {
  const dpScroll = document.getElementById('dp-scroll');
  const detailPanel = document.getElementById('detail-panel');
  if (!dpScroll || !detailPanel) return;
  const step = steps[idx];
  const color = SEVERITY_COLOR[cond.severity];

  const stepNav = steps.map((s, i) => `
    <button class="wt-dot${i === idx ? ' active' : ''}${i < idx ? ' done' : ''}" data-step="${i}" aria-label="Step ${i + 1}: ${s.title}">
      <span class="wt-dot-num">${i + 1}</span>
      <span class="wt-dot-label">${s.title}</span>
    </button>
  `).join('');

  let bodyHtml;
  if (step.symptoms) {
    const symsHtml = (step.symptoms && step.symptoms.length)
      ? `<ul class="dp-symptoms">${step.symptoms.map(s => `<li>${s}</li>`).join('')}</ul>`
      : `<p class="dp-desc wt-muted">No symptom list available for this condition.</p>`;
    const prevHtml = step.preventionNote
      ? `<div class="wt-extra-label">Prevention</div><p class="dp-prose">${step.preventionNote}</p>`
      : '';
    bodyHtml = symsHtml + prevHtml;
  } else {
    // Render **bold** markers from causes inline
    const formatted = (step.body || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '</p><p class="dp-desc">');
    bodyHtml = `<p class="dp-desc">${formatted}</p>`;
  }

  dpScroll.innerHTML = `
    <button class="wt-exit" id="wt-exit">‹ Back to ${cond.name}</button>
    <div class="dp-badge" style="color:${color};border-color:${color}55;">${SEVERITY_LABEL[cond.severity]}</div>
    <h2 class="dp-title">${cond.name}</h2>
    <nav class="wt-track" aria-label="Walkthrough steps">${stepNav}</nav>
    <div class="wt-stage">
      <div class="wt-kicker" style="color:${color};">${step.kicker}</div>
      <div class="wt-step-title">${step.title}</div>
      ${bodyHtml}
    </div>
    <div class="wt-controls">
      <button class="wt-btn" id="wt-prev" ${idx === 0 ? 'disabled' : ''} aria-label="Previous step">‹ Back</button>
      <button class="wt-btn wt-play" id="wt-play" aria-label="${playing ? 'Pause' : 'Play'} autoplay">${playIcon()}</button>
      <button class="wt-btn wt-next" id="wt-next" aria-label="${idx === steps.length - 1 ? 'Finish' : 'Next step'}">${idx === steps.length - 1 ? 'Finish' : 'Next ›'}</button>
    </div>
  `;

  dpScroll.querySelector('#wt-exit').addEventListener('click', exit);
  dpScroll.querySelector('#wt-prev').addEventListener('click', () => { stopAutoplay(); prev(); });
  dpScroll.querySelector('#wt-next').addEventListener('click', () => { stopAutoplay(); next(); });
  dpScroll.querySelector('#wt-play').addEventListener('click', toggleAutoplay);
  dpScroll.querySelectorAll('.wt-dot').forEach(btn => {
    btn.addEventListener('click', () => { stopAutoplay(); idx = Number(btn.dataset.step); applyStep(); });
  });
}

/* ── WALKTHROUGH PANEL COLLAPSE (mobile) ── */
let _wtCollapseTimer = null;
let _panelCollapsed  = false;

function _getPanel() { return document.getElementById('detail-panel'); }

function collapsePanel() {
  const p = _getPanel();
  if (!p) return;
  _panelCollapsed = true;
  p.classList.add('wt-collapsed');
}

function expandPanel() {
  const p = _getPanel();
  if (!p) return;
  _panelCollapsed = false;
  p.classList.remove('wt-collapsed');
}

function autoCollapseForStep() {
  if (window.innerWidth > 768) return; // only on mobile
  collapsePanel();
  if (_wtCollapseTimer) clearTimeout(_wtCollapseTimer);
  // Auto re-expand after camera finishes animating (~700ms camera + buffer)
  _wtCollapseTimer = setTimeout(() => { expandPanel(); }, 1300);
}

function attachPanelSwipe() {
  const p = _getPanel();
  if (!p || p._wtSwipeAttached) return;
  p._wtSwipeAttached = true;
  let _ty = 0;
  p.addEventListener('touchstart', e => { _ty = e.touches[0].clientY; }, { passive: true });
  p.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - _ty;
    if (dy > 40 && !_panelCollapsed) collapsePanel();
    if (dy < -40 && _panelCollapsed) expandPanel();
  }, { passive: true });
  // Tap on the collapsed pill to expand
  p.addEventListener('click', e => {
    if (_panelCollapsed) { e.stopPropagation(); expandPanel(); }
  });
}

function playIcon() {
  return playing
    ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
}

function next() {
  if (idx < steps.length - 1) { idx++; applyStep(); }
  else exit();
}
function prev() { if (idx > 0) { idx--; applyStep(); } }

function toggleAutoplay() {
  if (playing) stopAutoplay();
  else startAutoplay();
  renderPanel();
}
function startAutoplay() {
  playing = true;
  timer = setInterval(() => {
    if (idx < steps.length - 1) { idx++; applyStep(); }
    else stopAutoplay();
  }, AUTOPLAY_MS);
}
function stopAutoplay() {
  playing = false;
  if (timer) { clearInterval(timer); timer = null; }
}

function exit() {
  stopAutoplay();
  stopPulse();
  // Clean up collapse state
  if (_wtCollapseTimer) { clearTimeout(_wtCollapseTimer); _wtCollapseTimer = null; }
  expandPanel();
  _panelCollapsed = false;
  // Restore sidebar if we auto-closed it
  if (_autoClosedSidebar) {
    setSidebarHidden(false);
    _autoClosedSidebar = false;
  }
  if (onBack) onBack();
}


export function startWalkthrough(condition, backFn) {
  cond   = condition;
  onBack = backFn;
  steps  = buildSteps(condition);
  idx    = 0;
  stopAutoplay();
  _panelCollapsed = false;

  // On small screens: auto-close sidebar so the model fills the space
  if (isSmallScreen() && !isSidebarHidden()) {
    setSidebarHidden(true);
    _autoClosedSidebar = true;
  } else {
    _autoClosedSidebar = false;
  }

  // Wire up panel swipe gesture (idempotent)
  attachPanelSwipe();
  applyStep();
}

export function isWalkthroughActive() { return playing; }

