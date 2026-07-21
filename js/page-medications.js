import { renderChrome } from './chrome.js?v=1784616405415';
import { initTheme } from './theme.js?v=1784616405415';
import { MEDICATIONS, MED_GROUPS } from './data/medications.js?v=1784616405415';

import { initI18n } from './i18n.js?v=1784616405415';

async function init() {
  await initI18n();
  renderChrome('medications');
  initTheme();
}
init();

const grid    = document.getElementById('med-grid');
const countEl = document.getElementById('results-count');
const emptyEl = document.getElementById('empty-state');
const searchInput = document.getElementById('med-search');
const chipGroup = document.getElementById('chip-group');

let query = '';
let activeGroup = null;

function renderChips() {
  const groupCounts = new Map();
  MEDICATIONS.forEach(m => groupCounts.set(m.group, (groupCounts.get(m.group) || 0) + 1));
  const groups = MED_GROUPS.filter(g => groupCounts.has(g));

  chipGroup.innerHTML = groups.map(g => {
    const translatedGroup = typeof window.t === 'function' ? window.t(g) : g;
    return `
    <button class="chip${activeGroup === g ? ' active' : ''}" data-group="${g}" aria-pressed="${activeGroup === g}">
      ${translatedGroup} <span class="chip-count">${groupCounts.get(g)}</span>
    </button>
  `}).join('');

  chipGroup.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeGroup = activeGroup === btn.dataset.group ? null : btn.dataset.group;
      renderChips(); renderGrid();
    });
  });
}

function renderGrid() {
  const ql = query.toLowerCase();
  const list = MEDICATIONS.filter(m =>
    (!activeGroup || m.group === activeGroup) &&
    (!ql || m.name.toLowerCase().includes(ql) ||
     (m.class || '').toLowerCase().includes(ql))
  );

  countEl.textContent = `${list.length} of ${MEDICATIONS.length} medications`;
  emptyEl.style.display = list.length ? 'none' : 'block';

  grid.innerHTML = list.map(m => {
    const conds  = m.conditions || [];
    const organs = m.organs     || [];
    const cls    = m.class      || '';
    
    const translatedName = typeof window.t === 'function' ? window.t(m.name) : m.name;
    const translatedGroup = typeof window.t === 'function' ? window.t(m.group) : m.group;
    const translatedCls = typeof window.t === 'function' && cls ? window.t(cls) : cls;
    
    // We can also translate the hardcoded strings using t() if we add them to translations
    const actsOnText = typeof window.t === 'function' ? window.t('acts_on') || 'Acts on' : 'Acts on';
    const condText = typeof window.t === 'function' ? window.t('linked_conditions') || 'linked conditions' : 'linked conditions';
    
    return `
    <a class="card" style="--accent:#5b8cff;" href="index.html?med=${encodeURIComponent(m.name)}">
      <div class="card-badge" style="color:#5b8cff;border-color:#5b8cff55;">${translatedGroup}</div>
      <div class="card-title">${translatedName}</div>
      <div class="card-desc">${translatedCls}${translatedCls ? '. ' : ''}${actsOnText} ${organs.map(o => typeof window.t === 'function' ? window.t(o) : o).join(', ')}.</div>
      <div class="card-meta"><span>${conds.length} ${condText}</span></div>
    </a>
  `;
  }).join('');
}

searchInput.addEventListener('input', () => { query = searchInput.value; renderGrid(); });

renderChips();
renderGrid();

window.addEventListener('anatomy101-lang-changed', () => {
  renderChips();
  renderGrid();
});
window.addEventListener('anatomy101-i18n-ready', () => {
  renderChips();
  renderGrid();
});
