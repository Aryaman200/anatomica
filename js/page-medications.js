import { renderChrome } from './chrome.js?v=1784447089342';
import { initTheme } from './theme.js?v=1784447089342';
import { MEDICATIONS, MED_GROUPS } from './data/medications.js?v=1784447089342';

renderChrome('medications');
initTheme();

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

  chipGroup.innerHTML = groups.map(g => `
    <button class="chip${activeGroup === g ? ' active' : ''}" data-group="${g}" aria-pressed="${activeGroup === g}">
      ${g} <span class="chip-count">${groupCounts.get(g)}</span>
    </button>
  `).join('');

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
    return `
    <a class="card" style="--accent:#5b8cff;" href="index.html?med=${encodeURIComponent(m.name)}">
      <div class="card-badge" style="color:#5b8cff;border-color:#5b8cff55;">${m.group}</div>
      <div class="card-title">${m.name}</div>
      <div class="card-desc">${cls}${cls ? '. ' : ''}Acts on ${organs.join(', ')}.</div>
      <div class="card-meta"><span>${conds.length} linked condition${conds.length === 1 ? '' : 's'}</span></div>
    </a>
  `;
  }).join('');
}

searchInput.addEventListener('input', () => { query = searchInput.value; renderGrid(); });

renderChips();
renderGrid();
