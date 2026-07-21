import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = 'https://macwmsnpioiktcgkisbs.supabase.co';
// The anon key is safe to expose in the browser. It allows the browser to 
// communicate with Supabase under Row Level Security (RLS) restrictions.
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hY3dtc25waW9pa3RjZ2tpc2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NDI2NzIsImV4cCI6MjEwMDExODY3Mn0.cccK73Fc9zRMhlK93VamxYbwA3003nFA_fqiZThCb1o';

// Explicit "remember me": persist the session (refresh token) in localStorage
// and auto-refresh it before it expires. This is what lets a returning user
// skip the login-gate showcase and land straight back in signed-in — the gate
// (js/authGate.js) just reads whatever session this restores.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
