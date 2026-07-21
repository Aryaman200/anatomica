import { renderChrome } from './chrome.js?v=1784613961254';
import { initTheme } from './theme.js?v=1784613961254';
import { SYSTEMS, SYS_HEX } from './config.js?v=1784613961254';
import { GROUPS } from './data/groups.js?v=1784613961254';
import { ANATOMY_STRUCTURES, SYSTEM_LIST, colourForStructure } from './data/anatomy.js?v=1784613961254';

import { initI18n } from './i18n.js?v=1784613961254';

async function init() {
  await initI18n();
  renderChrome('anatomy');
  initTheme();
}
init();

// ── System overview cards (top section) ─────────────────────────────────────
const systemGrid = document.getElementById('system-grid');
systemGrid.innerHTML = SYSTEM_LIST.map(sys => {
  const count = ANATOMY_STRUCTURES.filter(s => s.system === sys.id).length;
  const hex = SYS_HEX[sys.id] || '#888';
  return `
  <a class="system-card" href="index.html?system=${sys.id}" style="--accent:${hex};">
    <div class="sys-pip" style="background:${hex};"></div>
    <div class="card-title">${sys.name}</div>
    <div class="card-desc">${sys.desc}</div>
    <div class="card-meta">${count.toLocaleString()} structure${count === 1 ? '' : 's'}</div>
  </a>`;
}).join('');

// ── State ────────────────────────────────────────────────────────────────────
const partGrid    = document.getElementById('part-grid');
const countEl     = document.getElementById('results-count');
const emptyEl     = document.getElementById('empty-state');
const searchInput = document.getElementById('part-search');
const chipSystem  = document.getElementById('chip-system');

let query       = '';
let activeSystem = null;

// Virtual-render pagination — only mount visible slice to DOM
const PAGE_SIZE = 120;
let page = 0;
let currentList = [];
let sentinel    = null;

// ── Chips ────────────────────────────────────────────────────────────────────
function renderChips() {
  chipSystem.innerHTML = SYSTEM_LIST.map(s => {
    const count = ANATOMY_STRUCTURES.filter(st => st.system === s.id).length;
    const isActive = activeSystem === s.id;
    return `
    <button class="chip${isActive ? ' active' : ''}"
            data-sys="${s.id}"
            aria-pressed="${isActive}"
            style="${isActive ? `--chip-accent:${SYS_HEX[s.id] || '#5b8cff'};` : ''}">
      ${s.name} <span class="chip-count">${count.toLocaleString()}</span>
    </button>`;
  }).join('');

  chipSystem.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSystem = activeSystem === btn.dataset.sys ? null : btn.dataset.sys;
      renderChips();
      rebuildGrid();
    });
  });
}

// ── Card HTML ────────────────────────────────────────────────────────────────
function cardHTML(s) {
  const hex     = '#' + colourForStructure(s.label, s.system).toString(16).padStart(6, '0');
  const sysObj  = SYSTEM_LIST.find(x => x.id === s.system);
  const sysName = sysObj?.name || s.system;
  const sides   = s.sides?.length ? ` · ${s.sides.join(' & ')}` : '';
  const region  = s.region ? `<div class="card-desc" title="${s.region}">${s.region}${sides}</div>` : '';
  const meshBadge = s.meshes > 1 ? `<span class="card-unmodelled" style="color:${hex}88;border-color:${hex}33;">${s.meshes} meshes</span>` : '';
  return `
    <a class="card anatomy-card" style="--accent:${hex};" href="index.html?part=${encodeURIComponent(s.label)}">
      <div class="card-badge" style="color:${hex};border-color:${hex}44;">
        ${sysName} ${meshBadge}
      </div>
      <div class="card-title">${s.label}</div>
      ${region}
    </a>`;
}

// ── Grid build ───────────────────────────────────────────────────────────────
function buildList() {
  const ql = query.toLowerCase().trim();
  currentList = ANATOMY_STRUCTURES.filter(s =>
    (!activeSystem || s.system === activeSystem) &&
    (!ql || s.label.toLowerCase().includes(ql) ||
            (s.region || '').toLowerCase().includes(ql))
  );
}

function mountPage(reset) {
  if (reset) { page = 0; partGrid.innerHTML = ''; }

  const start = page * PAGE_SIZE;
  const slice = currentList.slice(start, start + PAGE_SIZE);

  const frag = document.createDocumentFragment();
  slice.forEach(s => {
    const div = document.createElement('div');
    div.innerHTML = cardHTML(s).trim();
    frag.appendChild(div.firstElementChild);
  });
  partGrid.appendChild(frag);

  page++;

  // Remove old sentinel
  if (sentinel) sentinel.disconnect();

  // Set up new sentinel if more pages remain
  const last = partGrid.lastElementChild;
  if (last && page * PAGE_SIZE < currentList.length) {
    sentinel = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) mountPage(false);
    }, { rootMargin: '200px' });
    sentinel.observe(last);
  }
}

function rebuildGrid() {
  buildList();
  countEl.textContent = `${currentList.length.toLocaleString()} of ${ANATOMY_STRUCTURES.length.toLocaleString()} structures`;
  emptyEl.style.display = currentList.length ? 'none' : 'block';
  mountPage(true);
}

// ── Events ───────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  query = searchInput.value;
  rebuildGrid();
});

// ── Init ─────────────────────────────────────────────────────────────────────
renderChips();
rebuildGrid();
