import { supabase } from './supabase-client.js';

/**
 * Initiates Google OAuth login flow.
 * Redirects the user to Google.
 */
export async function loginWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redirect back to the current page after login
      redirectTo: window.location.origin + window.location.pathname
    }
  });
  
  if (error) {
    console.error('Login error:', error.message);
    alert('Failed to login: ' + error.message);
  }
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
