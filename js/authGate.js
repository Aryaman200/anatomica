/* authGate.js — fullscreen showcase + login-first gate, shared by every page.
 *
 * The gate <div id="auth-gate"> ships already-visible in each page's HTML (see
 * index.html / anatomy.html / conditions.html / medications.html / quiz.html),
 * so the default state — before any JS runs — is GATED. That's deliberate:
 * fail-closed with zero flash of unlocked content, and it works identically
 * for a first-time visit and a slow network.
 *
 * The underlying page markup is left untouched and still renders normally
 * beneath the gate (search-engine crawlers execute JS and see the real
 * content); only pointer interaction + assistive-tech focus are blocked for
 * human visitors until a session is confirmed.
 *
 * "Remember me": Supabase persists the session (refresh token) in
 * localStorage by default (see supabase-client.js) and auto-refreshes it, so
 * a returning signed-in user's getSession() below resolves from local storage
 * — no network round-trip, no re-login, no showcase replay.
 */
import { getSession, loginWithGoogle, onAuthStateChange } from './auth.js?v=1784613961254';

const SHOWCASE_SLIDES = [
  { file: 'home.png', caption: 'Six body systems, rendered simultaneously in real-time 3D' },
  { file: 'heart-highlight.png', caption: 'Search any organ — instant isolation, deep-linked conditions & meds' },
  { file: 'search.png', caption: 'One search bar, unified across anatomy, conditions, and medications' },
  { file: 'anatomy.png', caption: '1,466 named structures from the full Z-Anatomy taxonomy' },
  { file: 'conditions.png', caption: '2,587 clinical conditions sourced from NIH MedQuAD & GARD' },
  { file: 'medications.png', caption: '342 medications mapped to the organs they act on' },
  { file: 'quiz.png', caption: '3,000+ NEET practice questions with spaced-repetition review' },
];

const SLIDE_MS = 4200;

function buildShowcaseMarkup() {
  return SHOWCASE_SLIDES.map((s, i) => `
    <div class="gate-slide${i === 0 ? ' active' : ''}" data-caption="${s.caption}"
         style="background-image:url('assets/screenshots/${s.file}')"></div>
  `).join('');
}

function startShowcase(gate) {
  const showcase = gate.querySelector('.gate-showcase');
  const captionEl = gate.querySelector('#gate-caption');
  if (!showcase) return null;
  showcase.innerHTML = buildShowcaseMarkup();
  const slides = [...showcase.querySelectorAll('.gate-slide')];
  if (captionEl && slides[0]) captionEl.textContent = slides[0].dataset.caption;

  let i = 0;
  const timer = setInterval(() => {
    slides[i].classList.remove('active');
    i = (i + 1) % slides.length;
    slides[i].classList.add('active');
    if (captionEl) captionEl.textContent = slides[i].dataset.caption;
  }, SLIDE_MS);
  return timer;
}

/** inert on every direct body child except the gate. */
function setBackgroundInert(on) {
  // NOT aria-hidden: several existing overlays (e.g. #export-modal) already
  // use aria-hidden="true/false" as their OWN show/hide switch. Setting it
  // here as a blanket "hide from a11y tree" forced #export-modal open right
  // after login (aria-hidden="false" reads as "show" per its CSS), with no
  // click handlers wired since it was never opened through the real
  // exportNotes() flow. `inert` alone already removes an element from the
  // accessibility tree and blocks focus/pointer — no separate flag needed,
  // and every browser this site targets (WebGL2-capable) supports it.
  if (!('inert' in HTMLElement.prototype)) return;
  for (const el of document.body.children) {
    if (el.id === 'auth-gate') continue;
    if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }
}

export async function initAuthGate() {
  const gate = document.getElementById('auth-gate');
  if (!gate) return;

  setBackgroundInert(true); // fail-closed default, matches the gate's visible-by-default markup

  let showcaseTimer = null;
  let revealed = false;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    if (showcaseTimer) clearInterval(showcaseTimer);
    gate.classList.add('gate-hidden');
    setBackgroundInert(false);
    setTimeout(() => gate.remove(), 500); // matches the CSS opacity transition
  };

  const session = await getSession();
  if (session) { reveal(); return; }

  // Not signed in — stay gated, run the showcase, and wait for auth to land
  // (either via the gate's own button or the header's login button — both
  // funnel through Supabase, so onAuthStateChange catches either).
  showcaseTimer = startShowcase(gate);

  const loginBtn = gate.querySelector('.gate-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      loginBtn.disabled = true;
      const original = loginBtn.textContent;
      loginBtn.textContent = 'Signing in…';
      try {
        const session = await loginWithGoogle();
        if (session) reveal();
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = original;
      }
    });
  }

  onAuthStateChange((_event, session) => {
    if (session) reveal();
  });
}
