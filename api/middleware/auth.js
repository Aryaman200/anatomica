import { createClient } from '@supabase/supabase-js';

// Helper to get or create supabase client dynamically
let supabaseCache = null;
function getSupabase() {
  if (!supabaseCache) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    supabaseCache = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  return supabaseCache;
}

export const supabase = new Proxy({}, {
  get: (target, prop) => getSupabase()[prop]
});

/**
 * Extracts and verifies the JWT from the Authorization header.
 * @param {Request} req 
 * @returns {Promise<Object|null>} user object or null if unauthorized
 */
export async function authenticate(req) {
  // Support both Node.js runtime (plain object headers) and Edge runtime (Headers.get)
  const authHeader = typeof req.headers.get === 'function'
    ? req.headers.get('Authorization')
    : req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  
  // Use getUser instead of getSession on the server for security
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    console.error('Auth error:', error?.message);
    return null;
  }
  
  return user;
}
