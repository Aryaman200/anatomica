import { setLanguage, getCurrentLang } from './i18n.js?v=1784611432079';

export function initLangUI() {
  const toggle = document.getElementById('lang-toggle');
  const menu = document.getElementById('lang-menu');
  if (!toggle || !menu) return;

  const opts = menu.querySelectorAll('.lang-opt');

  function updateActive() {
    const lang = getCurrentLang();
    opts.forEach(o => {
      const isSelected = o.dataset.lang === lang;
      if (isSelected) o.classList.add('active');
      else o.classList.remove('active');
      o.setAttribute('aria-checked', isSelected);
    });
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', !isExpanded);
    if (!isExpanded) {
      menu.classList.add('open');
    } else {
      menu.classList.remove('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      toggle.setAttribute('aria-expanded', 'false');
      menu.classList.remove('open');
    }
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('.lang-opt');
    if (!opt) return;
    
    const lang = opt.dataset.lang;
    if (lang) {
      setLanguage(lang);
      updateActive();
      toggle.setAttribute('aria-expanded', 'false');
      menu.classList.remove('open');
    }
  });

  updateActive();
}
