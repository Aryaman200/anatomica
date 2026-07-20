import {
  buildSidebar, initSearchUI, initClippingUI, initDetailPanel,
  applyHighlight, openPartPanel, openConditionPanel, openMedicationPanel,
  hideAll, toggleSystem, initSidebarToggle,
} from './ui.js?v=1784447089342';
import { loadAll, getSearchIndex } from './loader.js?v=1784447089342';
import { requestRender } from './scene.js?v=1784447089342';
import { initInspect } from './inspect.js?v=1784447089342';
import { initStyleUI } from './style.js?v=1784447089342';
import { initTheme } from './theme.js?v=1784447089342';
import { CONDITIONS } from './data/conditions.js?v=1784447089342';
import { MEDICATIONS } from './data/medications.js?v=1784447089342';
import { ANATOMY_TERMS } from './config.js?v=1784447089342';

function applyDeepLink() {
  const params = new URLSearchParams(location.search);

  const conditionName = params.get('condition');
  const medName        = params.get('med');
  const partLabel       = params.get('part');
  const systemId         = params.get('system');

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

function init() {
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

  // Load GLTFs and start rendering
  loadAll(() => {
    // Initial render when loading is complete
    requestRender();
    applyDeepLink();
  });
}

init();
