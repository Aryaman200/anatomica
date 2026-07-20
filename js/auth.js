import { supabase } from './supabase-client.js';

// Google Client ID — safe to expose in browser (public identifier, like Supabase anon key)
const GOOGLE_CLIENT_ID = '458133157931-jn2vrkh1hf73pue337o4a1bg70hunl8o.apps.googleusercontent.com';

let _gisInitialized = false;
let _pendingCb = null; // Resolved after ID token is received from Google

/**
 * Initialize GIS once. Sets the credential callback that fires when
 * the user completes the Google sign-in.
 */
function _initGIS() {
  if (_gisInitialized) return;
  _gisInitialized = true;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      const cb = _pendingCb;
      _pendingCb = null;
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential, // Google ID token → Supabase session (no redirect)
      });
      if (error) {
        console.error('GIS sign-in error:', error.message);
        alert('Sign-in failed: ' + error.message);
      }
      if (cb) cb(error, data?.session ?? null);
    },
  });
}

/**
 * Fallback: when One Tap is suppressed (browser restrictions, previous dismissal),
 * render Google's official button inside a minimal dark modal.
 */
function _showFallbackModal() {
  document.getElementById('_gis_modal')?.remove();

  const modal = document.createElement('div');
  modal.id = '_gis_modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);
  `;
  modal.innerHTML = `
    <div style="
      background:#111;border:1px solid #2a2a2a;border-radius:16px;
      padding:32px 28px;text-align:center;max-width:320px;width:90%;
      font-family:'Outfit',sans-serif;
    ">
      <p style="color:#aaa;margin:0 0 24px;font-size:15px;line-height:1.5;">
        Sign in to continue with Anatomy101
      </p>
      <div id="_gis_btn" style="display:flex;justify-content:center;"></div>
      <button id="_gis_cancel" style="
        margin-top:16px;background:none;border:none;
        color:#555;cursor:pointer;font-size:13px;transition:color 0.2s;
      ">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);

  // Render Google's official "Sign in with Google" button
  google.accounts.id.renderButton(
    modal.querySelector('#_gis_btn'),
    { theme: 'filled_black', size: 'large', width: 240 }
  );

  const close = () => modal.remove();
  modal.querySelector('#_gis_cancel').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  // Wrap pending callback so modal closes on successful sign-in
  const prev = _pendingCb;
  _pendingCb = (err, session) => {
    close();
    if (prev) prev(err, session);
  };
}

/**
 * Initiates Google Sign-In via GIS (popup/One Tap).
 * No redirect through *.supabase.co — ID token passed directly to
 * supabase.auth.signInWithIdToken(). Works on free tier.
 */
export async function loginWithGoogle() {
  if (typeof google === 'undefined' || !google.accounts?.id) {
    alert('Google Sign-In not loaded yet. Please try again in a moment.');
    return;
  }

  _initGIS();

  return new Promise((resolve) => {
    _pendingCb = (err, session) => resolve(session);

    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap suppressed — use fallback modal with rendered Google button
        _showFallbackModal();
      }
    });
  });
}

/**
 * Signs the current user out.
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Logout error:', error.message);
  window.location.reload();
}

/**
 * Gets the current active session.
 * @returns {Promise<Object|null>} The session object or null if not logged in.
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Get session error:', error.message);
    return null;
  }
  return session;
}

/**
 * Listen for auth state changes (login, logout, token refresh).
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}
