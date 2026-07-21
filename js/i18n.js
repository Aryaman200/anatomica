let currentLang = localStorage.getItem('anatomy101_lang') || 'en';
let currentDict = {};
let fallbackDict = {};

export async function initI18n() {
  try {
    const v = Date.now();
    const enRes = await fetch(`/locales/en.json?v=${v}`);
    fallbackDict = await enRes.json();
    
    if (currentLang !== 'en') {
      const res = await fetch(`/locales/${currentLang}.json?v=${v}`);
      if (res.ok) {
        currentDict = await res.json();
      } else {
        currentDict = fallbackDict;
      }
    } else {
      currentDict = fallbackDict;
    }
  } catch (err) {
    console.error('Failed to load locales', err);
    currentDict = fallbackDict;
  }
  
  applyTranslations();

  document.documentElement.lang = currentLang;

  // Authoritative: bind the global to THIS (now-populated) instance. If a second
  // i18n module copy loaded (e.g. an unversioned inline import), its empty
  // top-level binding must not win over the instance that actually loaded a dict.
  window.t = t;

  // Dispatch event for other scripts
  window._i18nReady = true;
  window.dispatchEvent(new Event('anatomy101-i18n-ready'));
}

export function t(key) {
  return currentDict[key] || fallbackDict[key] || key;
}

// Early best-effort binding — only if nothing has claimed it yet. initI18n()
// overrides this with the populated instance once a dictionary is loaded.
if (typeof window.t !== 'function') window.t = t;

function translateDOM() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  
  const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
  placeholders.forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
}

export function applyTranslations(root = document) {
  const elements = root.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  
  const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
  placeholders.forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
}

export async function setLanguage(lang) {
  if (lang === currentLang) return;
  
  try {
    let newDict = fallbackDict;
    if (lang !== 'en') {
      const v = Date.now();
      const res = await fetch(`/locales/${lang}.json?v=${v}`);
      if (res.ok) {
        newDict = await res.json();
      }
    }
    
    currentDict = newDict;
    currentLang = lang;
    localStorage.setItem('anatomy101_lang', lang);
    document.documentElement.lang = lang;
    
    applyTranslations();
    window.t = t; // keep the global pointed at the instance holding the live dict

    // Also dispatch an event so other components (like quiz) can re-fetch
    window.dispatchEvent(new CustomEvent('anatomy101-lang-changed', { detail: { lang } }));
  } catch (e) {
    console.error('Failed to switch language', e);
  }
}

export function getCurrentLang() {
  return currentLang;
}

// Make t globally available (best-effort; initI18n/setLanguage are authoritative)
if (typeof window.t !== 'function') window.t = t;
