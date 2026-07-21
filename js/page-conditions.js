import { renderChrome } from './chrome.js?v=1784611432079';
import { initTheme } from './theme.js?v=1784611432079';
import { CONDITIONS, getFeaturedConditions, SEVERITY_LABEL, SEVERITY_COLOR, cleanDesc } from './data/conditions.js?v=1784611432079';

import { initI18n } from './i18n.js?v=1784611432079';

async function init() {
  await initI18n();
  renderChrome('conditions');
  initTheme();
}
init();

const grid    = document.getElementById('cond-grid');
const countEl = document.getElementById('results-count');
const emptyEl = document.getElementById('empty-state');
const searchInput = document.getElementById('cond-search');
const chipSeverity = document.getElementById('chip-severity');
const chipCategory = document.getElementById('chip-category');
const featuredSection = document.getElementById('featured');
const featuredRail = document.getElementById('featured-rail');

function cardHtml(c) {
  const color = SEVERITY_COLOR[c.severity];
  const translatedName = typeof window.t === 'function' ? window.t(c.name) : c.name;
  const translatedDesc = typeof window.t === 'function' ? window.t(c.desc) : c.desc;
  const translatedCategory = typeof window.t === 'function' ? window.t(c.category) : c.category;
  
  return `
    <a class="card" style="--accent:${color};" href="index.html?condition=${encodeURIComponent(c.name)}">
      <div class="card-badge" style="color:${color};border-color:${color}55;">${SEVERITY_LABEL[c.severity]}</div>
      <div class="card-title">${translatedName}</div>
      <div class="card-desc">${cleanDesc(translatedDesc, 140)}</div>
      <div class="card-meta"><span>${translatedCategory}</span><span>${c.parts.length} structure${c.parts.length === 1 ? '' : 's'}</span></div>
    </a>`;
}

function renderFeatured() {
  const featured = getFeaturedConditions();
  if (!featured.length || !featuredRail) return;
  featuredRail.innerHTML = featured.map(cardHtml).join('');
  featuredSection.hidden = false;
}

let query = '';
let activeSeverity = null;
let activeCategory = null;

function counts(getKey) {
  const m = new Map();
  CONDITIONS.forEach(c => { const k = getKey(c); m.set(k, (m.get(k) || 0) + 1); });
  return m;
}

function renderChips() {
  const sevCounts = counts(c => c.severity);
  chipSeverity.innerHTML = ['urgent', 'watch', 'info'].map(sev => {
    const label = SEVERITY_LABEL[sev];
    const translatedLabel = typeof window.t === 'function' ? window.t(label) : label;
    return `
    <button class="chip${activeSeverity === sev ? ' active' : ''}" data-sev="${sev}" aria-pressed="${activeSeverity === sev}">
      ${translatedLabel} <span class="chip-count">${sevCounts.get(sev) || 0}</span>
    </button>
  `}).join('');

  const catCounts = counts(c => c.category);
  const cats = [...catCounts.keys()].sort((a, b) => catCounts.get(b) - catCounts.get(a));
  chipCategory.innerHTML = cats.map(cat => {
    const translatedCat = typeof window.t === 'function' ? window.t(cat) : cat;
    return `
    <button class="chip${activeCategory === cat ? ' active' : ''}" data-cat="${cat}" aria-pressed="${activeCategory === cat}">
      ${translatedCat} <span class="chip-count">${catCounts.get(cat)}</span>
    </button>
  `}).join('');

  chipSeverity.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSeverity = activeSeverity === btn.dataset.sev ? null : btn.dataset.sev;
      renderChips(); renderGrid();
    });
  });
  chipCategory.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = activeCategory === btn.dataset.cat ? null : btn.dataset.cat;
      renderChips(); renderGrid();
    });
  });
}

function renderGrid() {
  const ql = query.toLowerCase();
  const list = CONDITIONS.filter(c =>
    (!activeSeverity || c.severity === activeSeverity) &&
    (!activeCategory || c.category === activeCategory) &&
    (!ql || c.name.toLowerCase().includes(ql) || c.desc.toLowerCase().includes(ql))
  );

  countEl.textContent = `${list.length} of ${CONDITIONS.length} conditions`;
  emptyEl.style.display = list.length ? 'none' : 'block';

  grid.innerHTML = list.map(cardHtml).join('');
}

searchInput.addEventListener('input', () => { query = searchInput.value; renderGrid(); });

renderFeatured();
renderChips();
renderGrid();

window.addEventListener('anatomy101-lang-changed', () => {
  renderFeatured();
  renderChips();
  renderGrid();
});
window.addEventListener('anatomy101-i18n-ready', () => {
  renderFeatured();
  renderChips();
  renderGrid();
});
