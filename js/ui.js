import * as THREE from 'three';
import { SYSTEMS, SYS_HEX } from './config.js?v=1784447089342';
import { SYSTEM_NAME } from './data/anatomy.js?v=1784447089342';
import { GROUP_BY_LABEL, groupsForStructure, isGroupLabel, isModelled } from './data/groups.js?v=1784447089342';
import { scene, camera, controls, renderer, requestRender } from './scene.js?v=1784447089342';
import { getGroups, searchIndex, getSearchIndex, bounds } from './loader.js?v=1784447089342';
import { applyStyleToMaterial } from './style.js?v=1784447089342';
import { getPartInfo } from './data/parts.js?v=1784447089342';
import { CONDITIONS, getConditionsForPart, SEVERITY_LABEL, SEVERITY_COLOR, cleanDesc } from './data/conditions.js?v=1784447089342';
import { getMedicationsForCondition, getMedicationsForOrgan } from './data/medications.js?v=1784447089342';
import { getHabitsForOrgan } from './data/habits.js?v=1784447089342';
import { startWalkthrough } from './walkthrough.js?v=1784447089342';

/* ── SIDEBAR SYSTEM LIST ── */
export const sysList   = document.getElementById('sys-list');
export const badgeEl   = document.getElementById('active-count');

function countActive() { return SYSTEMS.filter(s => s.active).length; }

export function updateBadge() {
  const n = countActive();
  if(badgeEl) {
    badgeEl.dataset.count = n;
    badgeEl.textContent   = n === 1 ? '1 active' : `${n} active`;
  }
}

export function buildSidebar() {
  if(!sysList) return;
  SYSTEMS.forEach(sys => {
    const el = document.createElement('div');
    el.className   = 'sys-item' + (sys.active ? ' active' : '');
    el.id          = 'sys-' + sys.id;
    el.setAttribute('role', 'listitem');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${sys.name}: ${sys.active ? 'visible' : 'hidden'}`);

    el.innerHTML = `
      <div class="sys-pip" style="background:${sys.hex};--pip-color:${sys.hex};" aria-hidden="true"></div>
      <div class="sys-text">
        <div class="sys-name">${sys.name}</div>
        <div class="sys-desc">${sys.desc}</div>
      </div>
      <button class="sys-eye" tabindex="-1" aria-label="${sys.active ? 'Hide' : 'Show'} ${sys.name}">
        ${eyeIcon(sys.active)}
      </button>
    `;

    el.addEventListener('click', e => {
      if (e.target.closest('.sys-eye')) return; 
      toggleSystem(sys.id);
    });
    el.querySelector('.sys-eye').addEventListener('click', e => {
      e.stopPropagation();
      toggleSystem(sys.id);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSystem(sys.id); }
    });

    sysList.appendChild(el);
  });

  const btnAll = document.getElementById('btn-all');
  const btnNone = document.getElementById('btn-none');
  
  if(btnAll) btnAll.addEventListener('click', resetAll);
  if(btnNone) btnNone.addEventListener('click', hideAll);

  updateBadge();
}

export function resetAll() {
  SYSTEMS.forEach(s => { s.active = true; const g = getGroups()[s.id]; if (g) g.visible = true; });
  SYSTEMS.forEach(s => { const el = document.getElementById('sys-' + s.id); if (!el) return;
    el.className = 'sys-item active'; el.querySelector('.sys-eye').innerHTML = eyeIcon(true); });
  updateBadge();
  requestRender();
}

export function hideAll() {
  SYSTEMS.forEach(s => { s.active = false; const g = getGroups()[s.id]; if (g) g.visible = false; });
  SYSTEMS.forEach(s => { const el = document.getElementById('sys-' + s.id); if (!el) return;
    el.className = 'sys-item'; el.querySelector('.sys-eye').innerHTML = eyeIcon(false); });
  updateBadge();
  requestRender();
}

function eyeIcon(on) {
  return on
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

export function toggleSystem(id) {
  const sys = SYSTEMS.find(s => s.id === id);
  sys.active = !sys.active;
  const g = getGroups()[id];
  if (g) g.visible = sys.active;

  const el  = document.getElementById('sys-' + id);
  if(el) {
    el.className = 'sys-item' + (sys.active ? ' active' : '');
    el.setAttribute('aria-label', `${sys.name}: ${sys.active ? 'visible' : 'hidden'}`);
    const eye = el.querySelector('.sys-eye');
    eye.innerHTML = eyeIcon(sys.active);
    eye.setAttribute('aria-label', `${sys.active ? 'Hide' : 'Show'} ${sys.name}`);
  }
  updateBadge();
  requestRender();
}

/* ── SEARCH UI & LOGIC ── */
let highlightActive = null;

export function applyHighlight(termLabelOrLabels, displayLabel) {
  const labels = Array.isArray(termLabelOrLabels) ? termLabelOrLabels : [termLabelOrLabels];
  highlightActive = displayLabel || labels.join(', ');

  const idx = getSearchIndex();
  const terms = labels.map(l => idx.find(t => t.label === l)).filter(Boolean);
  const matchedMeshes = new Set(terms.flatMap(t => t.meshes));

  // Systems that actually own a matched mesh (cross-system groups like Ear/
  // Larynx span more than one) — keep exactly those visible.
  const matchedSystems = new Set();
  matchedMeshes.forEach(m => { const s = m.material?._sysId; if (s) matchedSystems.add(s); });

  // Labels referenced by data but absent from these models (spleen, uterus…).
  const notModelled = labels.filter(l => GROUP_BY_LABEL.has(l) && !isModelled(l));

  if (matchedMeshes.size === 0) {
    clearVisualHighlight(); // nothing to light — just show the note below
  } else {
    Object.entries(getGroups()).forEach(([sysId, g]) => { g.visible = matchedSystems.has(sysId); });
    scene.traverse(c => {
      if (!c.isMesh || !c.material) return;
      const mat = c.material;
      if (matchedMeshes.has(c)) {
        mat.color.setHex(mat._origColor);
        mat.opacity           = 1.0;
        mat.transparent       = false;
        mat.depthWrite        = true;
        mat.blending          = THREE.NormalBlending;
        mat.emissive.setHex(mat._origColor);
        mat.emissiveIntensity = 0.28;
        c.renderOrder         = 100;
      } else {
        mat.color.setHex(0x0a1428); // Ghost dark blue
        mat.opacity           = 0.16;
        mat.transparent       = true;
        mat.depthWrite        = false;
        mat.blending          = THREE.AdditiveBlending;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        c.renderOrder         = 0;
      }
      mat.needsUpdate = true;
    });
  }

  const hlBar = document.getElementById('highlight-bar');
  const hlBarLabel = document.getElementById('highlight-bar-label');
  if(hlBar && hlBarLabel) {
    hlBar.classList.add('visible');
    let txt = 'Viewing: ' + highlightActive;
    if (notModelled.length) txt += ' · ' + notModelled.join(', ') + ' not individually modelled';
    hlBarLabel.textContent = txt;
  }

  updateBadge();
  requestRender();
}

// Restore every mesh to the current render style + system visibility, WITHOUT
// touching the highlight bar / search field (shared by clear + empty-highlight).
function clearVisualHighlight() {
  SYSTEMS.forEach(sys => { const g = getGroups()[sys.id]; if (g) g.visible = sys.active; });
  scene.traverse(c => {
    if (!c.isMesh || !c.material) return;
    const mat = c.material;
    applyStyleToMaterial(mat);
    mat.blending          = THREE.NormalBlending;
    mat.emissive.setHex(mat._origEmissive);
    mat.emissiveIntensity = 1;
    c.renderOrder = (mat._origRenderOrder !== undefined) ? mat._origRenderOrder : 0;
    mat.needsUpdate = true;
  });
}

let currentSelection = null;
let focusedIdx = -1;

export function clearHighlight() {
  if (!highlightActive) return;
  highlightActive = null;

  clearVisualHighlight();

  const hlBar = document.getElementById('highlight-bar');
  const searchInput = document.getElementById('search-input');
  const searchXBtn = document.getElementById('search-x');
  const suggestions = document.getElementById('search-suggestions');

  if(hlBar) hlBar.classList.remove('visible');
  if(searchInput) searchInput.value = '';
  if(searchXBtn) searchXBtn.classList.remove('visible');
  if(suggestions) suggestions.classList.remove('open');

  currentSelection = null;
  requestRender();
}

export function initSearchUI() {
  const searchInput  = document.getElementById('search-input');
  const searchXBtn   = document.getElementById('search-x');
  const suggestions  = document.getElementById('search-suggestions');
  const hlBarClear   = document.getElementById('highlight-bar-clear');

  if(!searchInput) return;

  // Built lazily: the search index only exists after the models finish loading.
  let _searchable = [];
  function ensureSearchable() {
    if (_searchable.length) return _searchable;
    const partItems = getSearchIndex().map(t => ({ kind: 'part', label: t.label, sys: t.sys, isGroup: t.kind === 'group' }));
    const conds = CONDITIONS.map(c => ({ kind: 'condition', label: c.name, category: c.category, severity: c.severity }));
    _searchable = [...partItems, ...conds];
    return _searchable;
  }

  function filterTerms(q) {
    const S = ensureSearchable();
    if (!q) return S.filter(t => t.kind === 'part' && t.isGroup).slice(0, 8); // coarse organs by default
    const ql = q.toLowerCase();
    const hits = S.filter(t => t.label.toLowerCase().includes(ql));
    hits.sort((a, b) => {
      const as = a.label.toLowerCase().startsWith(ql) ? 0 : 1;
      const bs = b.label.toLowerCase().startsWith(ql) ? 0 : 1;
      if (as !== bs) return as - bs;                                  // prefix matches first
      const rank = t => t.isGroup ? 0 : t.kind === 'part' ? 1 : 2;  // groups > parts > conditions
      return rank(a) - rank(b);
    });
    return hits.slice(0, 14);
  }

  function renderSuggestions(items, query) {
    suggestions.innerHTML = '';
    focusedIdx = -1;
    if (!items.length) { suggestions.classList.remove('open'); return; }
    const ql = query.toLowerCase();
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'sg-item' + (item.label === currentSelection ? ' selected' : '');
      el.setAttribute('role', 'option');
      const lbl = item.label;
      const idx = lbl.toLowerCase().indexOf(ql);
      const hl  = (ql && idx >= 0)
        ? lbl.slice(0, idx) + '<span class="sg-match">' + lbl.slice(idx, idx + ql.length) + '</span>' + lbl.slice(idx + ql.length)
        : lbl;
      const pip = item.kind === 'condition' ? SEVERITY_COLOR[item.severity] : (SYS_HEX[item.sys] || '#888');
      const badge = item.kind === 'condition'
        ? 'CONDITION'
        : (SYSTEMS.find(s => s.id === item.sys)?.name || item.sys);
      el.innerHTML =
        '<div class="sg-pip" style="background:' + pip + '"></div>' +
        '<span class="sg-name">' + hl + '</span>' +
        '<span class="sg-system">' + badge + '</span>';
      el.addEventListener('mousedown', e => { e.preventDefault(); selectTerm(item); });
      suggestions.appendChild(el);
    });
    suggestions.classList.add('open');
  }

  function selectTerm(item) {
    currentSelection = item.label;
    searchInput.value = item.label;
    searchXBtn.classList.add('visible');
    suggestions.classList.remove('open');
    if (item.kind === 'condition') {
      const cond = CONDITIONS.find(c => c.name === item.label);
      applyHighlight(cond.parts, cond.name);
      openConditionPanel(cond);
    } else {
      applyHighlight(item.label);
      openPartPanel(item.label, item.sys);
    }
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value;
    searchXBtn.classList.toggle('visible', q.length > 0);
    if (!q) { clearHighlight(); suggestions.classList.remove('open'); return; }
    renderSuggestions(filterTerms(q), q);
  });

  searchInput.addEventListener('focus', () => {
    renderSuggestions(filterTerms(searchInput.value), searchInput.value);
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => suggestions.classList.remove('open'), 160);
  });

  searchInput.addEventListener('keydown', e => {
    const items = [...suggestions.querySelectorAll('.sg-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
      items.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx));
    } else if (e.key === 'Enter') {
      const targetItem = focusedIdx >= 0 ? items[focusedIdx] : items[0];
      if (targetItem) {
        const name = targetItem.querySelector('.sg-name').textContent;
        const item = ensureSearchable().find(t => t.label === name);
        if (item) selectTerm(item);
      }
    } else if (e.key === 'Escape') {
      clearHighlight(); searchInput.blur();
    }
  });

  searchXBtn.addEventListener('click', clearHighlight);
  hlBarClear.addEventListener('click', clearHighlight);
  hlBarClear.addEventListener('keydown', e => { if (e.key === 'Enter') clearHighlight(); });
}

/* ── CLIPPING UI ── */
export const clipPlane = new THREE.Plane();
let clipActive  = false;
let clipFlipped = false;
let clipAxis    = 'z';
let clipDepth   = 0.5;

export function applyClip() {
  if (!clipActive) { renderer.clippingPlanes = []; requestRender(); return; }

  const s = clipFlipped ? 1 : -1;
  const normal = clipAxis === 'z' ? new THREE.Vector3(0, 0, s)
               : clipAxis === 'x' ? new THREE.Vector3(s, 0, 0)
                                  : new THREE.Vector3(0, s, 0);

  const mn = bounds.min[clipAxis];
  const mx = bounds.max[clipAxis];
  const pos = mn + clipDepth * (mx - mn);
  const constant = clipFlipped ? -pos : pos;

  clipPlane.set(normal, constant);
  renderer.clippingPlanes = [clipPlane];
  requestRender();
}

export function initClippingUI() {
  const tabs        = document.querySelectorAll('.cut-tab');
  const cutControls = document.getElementById('cut-controls');
  const cutClear    = document.getElementById('cut-clear');
  const depthSlider = document.getElementById('depth-slider');
  const depthLabel  = document.getElementById('depth-pct-label');
  const flipBtn     = document.getElementById('flip-btn');

  if(!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const axis = tab.dataset.axis;
      if (clipAxis === axis && clipActive) {
        clipActive = false; applyClip();
        tab.classList.remove('active'); tab.setAttribute('aria-pressed', 'false');
        cutControls.classList.remove('visible');
        cutClear.style.display = 'none';
      } else {
        clipAxis = axis; clipActive = true; applyClip();
        tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-pressed', 'false'); });
        tab.classList.add('active'); tab.setAttribute('aria-pressed', 'true');
        cutControls.classList.add('visible');
        cutClear.style.display = '';
      }
    });
  });

  depthSlider.addEventListener('input', () => {
    const v = Number(depthSlider.value);
    clipDepth = v / 100;
    depthSlider.style.setProperty('--pct', v + '%');
    depthLabel.textContent = v + '%';
    applyClip();
  });
  depthSlider.style.setProperty('--pct', '50%');

  flipBtn.addEventListener('click', () => {
    clipFlipped = !clipFlipped;
    flipBtn.classList.toggle('on', clipFlipped);
    flipBtn.setAttribute('aria-pressed', clipFlipped ? 'true' : 'false');
    applyClip();
  });

  cutClear.addEventListener('click', () => {
    clipActive = false; clipFlipped = false;
    applyClip();
    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-pressed', 'false'); });
    cutControls.classList.remove('visible');
    cutClear.style.display = 'none';
    flipBtn.classList.remove('on'); flipBtn.setAttribute('aria-pressed', 'false');
    depthSlider.value = 50; depthSlider.style.setProperty('--pct', '50%'); depthLabel.textContent = '50%';
    clipDepth = 0.5;
  });
}

/* ── DETAIL PANEL (click-to-inspect) ── */
const detailPanel = document.getElementById('detail-panel');
const dpScroll     = document.getElementById('dp-scroll');
const detailClose  = document.getElementById('detail-close');

function pillList(items, groupId) {
  return items.map((it, i) =>
    `<button class="dp-pill" data-group="${groupId}" data-i="${i}">${it}</button>`
  ).join('');
}

function pillSection(title, items, groupId) {
  if (!items.length) return '';
  return `
    <div class="dp-conditions">
      <div class="sec-label">${title}</div>
      <div class="dp-pill-list">${pillList(items, groupId)}</div>
    </div>`;
}

export function openPartPanel(label, sysId) {
  if (!detailPanel || !dpScroll) return;
  const info = getPartInfo(label, sysId);
  const sysName = SYSTEM_NAME[sysId] || SYSTEMS.find(s => s.id === sysId)?.name || sysId || '';

  // A fine structure (e.g. 'Left ventricle') inherits its conditions/meds from
  // the coarse groups it belongs to ('Heart'). A coarse label maps to itself.
  const groupLabels = isGroupLabel(label) ? [label] : groupsForStructure(label);
  const lookup = groupLabels.length ? groupLabels : [label];
  const dedupe = (arr, key) => { const s = new Set(); return arr.filter(x => { const k = key(x); if (s.has(k)) return false; s.add(k); return true; }); };
  const conditions = dedupe(lookup.flatMap(g => getConditionsForPart(g)), c => c.name);
  const meds       = dedupe(lookup.flatMap(g => getMedicationsForOrgan(g)), m => m.name);
  const habits     = dedupe(lookup.flatMap(g => getHabitsForOrgan(g)), h => h.name);

  const partOf = (!isGroupLabel(label) && groupLabels.length) ? groupLabels.join(', ') : '';
  const unmodelled = isGroupLabel(label) && !isModelled(label);

  dpScroll.innerHTML = `
    <div class="dp-badge" style="color:${SYS_HEX[sysId] || '#888'};border-color:${SYS_HEX[sysId] || '#888'}55;">${sysName}</div>
    <h2 class="dp-title">${label}</h2>
    ${partOf ? `<div class="dp-category">Part of ${partOf}</div>` : ''}
    <p class="dp-desc">${info.desc}</p>
    ${unmodelled ? `<p class="dp-disclaimer">Not individually modelled in this 3D anatomy set.</p>` : ''}
    ${info.wiki ? `<a class="dp-wiki" href="https://en.wikipedia.org/wiki/${info.wiki}" target="_blank" rel="noopener">Read more on Wikipedia ↗</a>` : ''}
    ${pillSection(`Conditions affecting this part (${conditions.length})`, conditions.map(c => c.name), 'cond')}
    ${pillSection('Medications acting here', meds.map(m => m.name), 'med')}
    ${pillSection('What keeps it healthy', habits.map(h => h.name), 'habit')}
  `;

  dpScroll.querySelectorAll('[data-group="cond"]').forEach((btn, i) => {
    btn.addEventListener('click', () => openConditionPanel(conditions[i]));
  });
  dpScroll.querySelectorAll('[data-group="med"]').forEach((btn, i) => {
    btn.addEventListener('click', () => openMedicationPanel(meds[i]));
  });
  dpScroll.querySelectorAll('[data-group="habit"]').forEach((btn, i) => {
    btn.addEventListener('click', () => openHabitPanel(habits[i]));
  });

  detailPanel.classList.remove('wt-collapsed');
  detailPanel.classList.add('open');
  detailPanel.setAttribute('aria-hidden', 'false');
}

export function openConditionPanel(cond) {
  if (!detailPanel || !dpScroll) return;
  const color = SEVERITY_COLOR[cond.severity];
  const meds = getMedicationsForCondition(cond);

  const symptomsHtml = (cond.symptoms && cond.symptoms.length)
    ? `<div class="dp-section">
        <div class="sec-label">Signs &amp; symptoms</div>
        <ul class="dp-symptoms">${cond.symptoms.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>`
    : '';
  const causesHtml = cond.causes
    ? `<div class="dp-section">
        <div class="sec-label">Causes</div>
        <p class="dp-prose">${cond.causes}</p>
      </div>`
    : '';
  const preventionHtml = cond.prevention
    ? `<div class="dp-section">
        <div class="sec-label">Prevention</div>
        <p class="dp-prose">${cond.prevention}</p>
      </div>`
    : '';
  const sourceHtml = cond.source
    ? `<div class="dp-source">Source: ${cond.sourceUrl ? `<a href="${cond.sourceUrl}" target="_blank" rel="noopener">${cond.source}</a>` : cond.source}</div>`
    : '';

  dpScroll.innerHTML = `
    <div class="dp-badge" style="color:${color};border-color:${color}55;">${SEVERITY_LABEL[cond.severity]}</div>
    <h2 class="dp-title">${cond.name}</h2>
    <div class="dp-category">${cond.category}</div>
    <p class="dp-desc">${cleanDesc(cond.desc)}</p>
    <button class="dp-walk" id="dp-walk">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 4v16M13 4l6 4-6 4M7 8v12"/></svg>
      Walk through the body
    </button>
    ${pillSection('Lighting up in the body', cond.parts, 'part')}
    ${symptomsHtml}
    ${causesHtml}
    ${preventionHtml}
    ${pillSection('Medications acting here', meds.map(m => m.name), 'med')}
    ${sourceHtml}
    <p class="dp-disclaimer">Educational only. Anatomy101 is not a medical device and does not diagnose. For symptoms that worry you, contact a clinician.</p>
  `;

  dpScroll.querySelector('#dp-walk').addEventListener('click', () => {
    startWalkthrough(cond, () => openConditionPanel(cond));
  });
  dpScroll.querySelectorAll('[data-group="part"]').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const partLabel = cond.parts[i];
      const term = getSearchIndex().find(t => t.label === partLabel);
      openPartPanel(partLabel, term?.sys);
    });
  });
  dpScroll.querySelectorAll('[data-group="med"]').forEach((btn, i) => {
    btn.addEventListener('click', () => openMedicationPanel(meds[i]));
  });

  applyHighlight(cond.parts, cond.name);
  detailPanel.classList.remove('wt-collapsed');
  detailPanel.classList.add('open');
  detailPanel.setAttribute('aria-hidden', 'false');
}

export function openHabitPanel(habit) {
  if (!detailPanel || !dpScroll) return;

  dpScroll.innerHTML = `
    <div class="dp-badge" style="color:#3ecf8e;border-color:#3ecf8e55;">${habit.family.toUpperCase()}</div>
    <h2 class="dp-title">${habit.name}</h2>
    <p class="dp-desc">${habit.mechanism}</p>
    ${pillSection('Benefits these organs', habit.organs, 'part')}
    <div class="dp-conditions">
      <div class="sec-label">Sources</div>
      <ul class="dp-symptoms">${habit.sources.map(s => `<li>${s}</li>`).join('')}</ul>
    </div>
  `;

  dpScroll.querySelectorAll('[data-group="part"]').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const partLabel = habit.organs[i];
      const term = getSearchIndex().find(t => t.label === partLabel);
      openPartPanel(partLabel, term?.sys);
    });
  });

  detailPanel.classList.remove('wt-collapsed');
  detailPanel.classList.add('open');
  detailPanel.setAttribute('aria-hidden', 'false');
}

export function openMedicationPanel(med) {
  if (!detailPanel || !dpScroll) return;
  const group = med.group || 'Medication';
  const cls   = med.class || '';

  dpScroll.innerHTML = `
    <div class="dp-badge" style="color:#5b8cff;border-color:#5b8cff55;">${group}</div>
    <h2 class="dp-title">${med.name}</h2>
    ${cls ? `<div class="dp-category">${cls}</div>` : ''}
    ${pillSection('Acts on', med.organs || [], 'part')}
    ${pillSection('Linked conditions', med.conditions || [], 'cond')}
  `;

  dpScroll.querySelectorAll('[data-group="part"]').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const partLabel = med.organs[i];
      const term = getSearchIndex().find(t => t.label === partLabel);
      openPartPanel(partLabel, term?.sys);
    });
  });
  dpScroll.querySelectorAll('[data-group="cond"]').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const cond = CONDITIONS.find(c => c.name === med.conditions[i]);
      if (cond) openConditionPanel(cond);
    });
  });

  applyHighlight(med.organs, med.name);
  detailPanel.classList.remove('wt-collapsed');
  detailPanel.classList.add('open');
  detailPanel.setAttribute('aria-hidden', 'false');
}

export function closeDetailPanel() {
  if (!detailPanel) return;
  detailPanel.classList.remove('open', 'wt-collapsed');
  detailPanel.setAttribute('aria-hidden', 'true');
  clearHighlight();
}

export function initDetailPanel() {
  if (detailClose) detailClose.addEventListener('click', closeDetailPanel);

  // Mobile swipe: ONLY triggers from the top 48px drag-handle zone
  // Prevents scroll inside dp-scroll from accidentally triggering
  if (detailPanel) {
    let _dpTouchY = 0;
    let _dpFromHandle = false;

    detailPanel.addEventListener('touchstart', e => {
      const rect = detailPanel.getBoundingClientRect();
      const touchY = e.touches[0].clientY;
      _dpTouchY = touchY;
      // Arm swipe only from top 48px (drag strip zone)
      _dpFromHandle = (touchY - rect.top) < 48;
    }, { passive: true });

    detailPanel.addEventListener('touchend', e => {
      if (!_dpFromHandle) return;
      const dy = e.changedTouches[0].clientY - _dpTouchY;

      if (dy > 40) {
        if (detailPanel.classList.contains('wt-collapsed')) {
          // Already collapsed — second swipe-down fully closes
          closeDetailPanel();
        } else {
          // First swipe-down — collapse to pill (never fully close on first swipe)
          detailPanel.classList.add('wt-collapsed');
        }
      }

      // Swipe up: restore collapsed panel
      if (dy < -40 && detailPanel.classList.contains('wt-collapsed')) {
        detailPanel.classList.remove('wt-collapsed');
      }
    }, { passive: true });

    // Tap on collapsed panel to re-expand
    detailPanel.addEventListener('click', e => {
      if (detailPanel.classList.contains('wt-collapsed')) {
        e.stopPropagation();
        detailPanel.classList.remove('wt-collapsed');
      }
    });
  }
}

/* ── SIDEBAR TOGGLE ── */
let _sidebarHidden = false;
const _sidebarEl = () => document.getElementById('sidebar');
const _toggleBtn = () => document.getElementById('sidebar-toggle');

function _applyHidden(hidden) {
  _sidebarHidden = hidden;
  const sb  = _sidebarEl();
  const btn = _toggleBtn();
  if (!sb) return;
  sb.classList.toggle('hidden', hidden);
  if (btn) {
    btn.classList.toggle('collapsed', hidden);
    btn.setAttribute('aria-expanded', String(!hidden));
  }
}

export function setSidebarHidden(hidden) { _applyHidden(hidden); }
export function isSidebarHidden() { return _sidebarHidden; }

export function initSidebarToggle() {
  const btn     = _toggleBtn();
  const sidebar = _sidebarEl();
  if (!btn || !sidebar) return;

  // On mobile: sidebar starts hidden (it's a bottom sheet, user pulls up)
  if (window.innerWidth <= 768) {
    _applyHidden(true);
  }

  btn.addEventListener('click', () => _applyHidden(!_sidebarHidden));

  // Mobile: swipe-down anywhere on sidebar to close, swipe-up on toggle to open
  let touchStartY = 0;

  function onTouchStart(e) { touchStartY = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (dy >  40 && !_sidebarHidden) _applyHidden(true);   // swipe down → close
    if (dy < -40 &&  _sidebarHidden) _applyHidden(false);  // swipe up  → open
  }

  // Attach to sidebar body (drag anywhere on it) and the toggle pull-tab
  sidebar.addEventListener('touchstart', onTouchStart, { passive: true });
  sidebar.addEventListener('touchend',   onTouchEnd,   { passive: true });
  btn.addEventListener('touchstart', onTouchStart, { passive: true });
  btn.addEventListener('touchend',   onTouchEnd,   { passive: true });
}

