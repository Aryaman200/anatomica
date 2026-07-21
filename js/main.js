import {
  buildSidebar, initSearchUI, initClippingUI, initDetailPanel,
  applyHighlight, openPartPanel, openConditionPanel, openMedicationPanel,
  hideAll, toggleSystem, initSidebarToggle,
} from './ui.js?v=1784613961254';
import { loadAll, getSearchIndex } from './loader.js?v=1784613961254';
import { requestRender, setCameraState } from './scene.js?v=1784613961254';
import { initInspect } from './inspect.js?v=1784613961254';
import { initStyleUI } from './style.js?v=1784613961254';
import { initTheme } from './theme.js?v=1784613961254';
import { CONDITIONS } from './data/conditions.js?v=1784613961254';
import { MEDICATIONS } from './data/medications.js?v=1784613961254';
import { ANATOMY_TERMS } from './config.js?v=1784613961254';
import { initLangUI } from './langUI.js?v=1784613961254';

function applyDeepLink() {
  const params = new URLSearchParams(location.search);

  const conditionName = params.get('condition');
  const medName        = params.get('med');
  const partLabel       = params.get('part');
  const systemId         = params.get('system');
  const cam              = params.get('cam');
  const layers           = params.get('layers');

  if (cam) {
    setCameraState(cam);
  }
  
  if (layers) {
    hideAll();
    layers.split(',').forEach(id => toggleSystem(id));
  }

  if (conditionName) {
    const cond = CONDITIONS.find(c => c.name === conditionName);
    if (cond) { openConditionPanel(cond); return; }
  }
  if (medName) {
    const med = MEDICATIONS.find(m => m.name === medName);
    if (med) { openMedicationPanel(med); return; }
  }
  if (partLabel) {
    const term = ANATOMY_TERMS.find(t => t.label === partLabel) || getSearchIndex().find(t => t.label === partLabel);
    if (term) { applyHighlight(partLabel); openPartPanel(partLabel, term.sys); return; }
  }
  if (systemId) {
    hideAll();
    toggleSystem(systemId);
  }
}

import { initI18n } from './i18n.js?v=1784613961254';

async function init() {
  await initI18n();
  // Build sidebar DOM
  buildSidebar();

  // Wire up search bar, clipping, detail panel, click-to-inspect, style + theme toggles
  initSearchUI();
  initClippingUI();
  initDetailPanel();
  initInspect();
  initStyleUI();
  initTheme();
  initSidebarToggle();
  initLangUI();

  import('./notes.js?v=1784613961254').then(m => {
    m.initNotesWidget();
    
    const fabAdd = document.getElementById('notes-fab-add');
    if (fabAdd) {
      fabAdd.addEventListener('click', (e) => {
        e.preventDefault();
        m.openNotesWidget('global');
      });
    }
    
    const fabExport = document.getElementById('notes-fab-export');
    if (fabExport) {
      fabExport.addEventListener('click', (e) => {
        e.preventDefault();
        m.exportNotes();
      });
    }
  });

  // Load GLTFs and start rendering
  loadAll(() => {
    // Initial render when loading is complete
    requestRender();
    applyDeepLink();
  });
}

init();
