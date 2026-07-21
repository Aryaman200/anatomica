import { scene, requestRender } from './scene.js?v=1784616405415';

// Default is SOLID ('full'). Opaque, depth-written geometry means the depth
// buffer resolves what's in front — which is what stops parts flickering in and
// out while the camera rotates/pans. 'xray' is the optional translucent look.
export let styleMode = 'full'; // 'full' | 'xray' | 'white'

export function applyStyleToMaterial(mat) {
  if (!mat) return;
  const translucent = mat._isSkin || mat._isFascia;
  if (styleMode === 'full') {
    mat.color.setHex(mat._origColor);
    mat.opacity     = mat._fullOpacity !== undefined ? mat._fullOpacity : (translucent ? 0.15 : 1);
    mat.transparent = translucent;
    mat.depthWrite  = !translucent;
  } else if (styleMode === 'xray') {
    mat.color.setHex(mat._origColor);
    mat.opacity     = mat._xrayOpacity !== undefined ? mat._xrayOpacity : 0.5;
    mat.transparent = true;
    mat.depthWrite  = false;
  } else if (styleMode === 'white') {
    mat.color.setHex(0xf1ece0);
    mat.opacity     = translucent ? (mat._isSkin ? 0.13 : 0.16) : 1;
    mat.transparent = translucent;
    mat.depthWrite  = !translucent;
  }
  mat.needsUpdate = true;
}

export function setStyleMode(mode) {
  styleMode = mode;
  scene.traverse(c => { if (c.isMesh && c.material) applyStyleToMaterial(c.material); });
  requestRender();
}

export function initStyleUI() {
  const toggle = document.getElementById('style-toggle');
  const menu   = document.getElementById('style-menu');
  const opts   = document.querySelectorAll('.style-opt');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });

  opts.forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      opts.forEach(o => { o.classList.remove('active'); o.setAttribute('aria-checked', 'false'); });
      opt.classList.add('active');
      opt.setAttribute('aria-checked', 'true');
      setStyleMode(opt.dataset.style);
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}
