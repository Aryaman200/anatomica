// api/chat.js — Vercel Edge Function proxy for Google AI.
//
// Sits between the browser and Google AI so real API keys never ship to the
// client. Keys live in Vercel env vars (GOOGLE_AI_KEY, GOOGLE_AI_KEY_2, etc.).
//
// KEY ROTATION — picks one of the available keys per request using a
// time-based bucket so quota is spread evenly across all projects.
// Each key is a separate Google Cloud project → separate free-tier quota.
//   4 keys × 500 RPD (gemini-3.1-flash-lite) = 2 000 RPD total
//   4 keys × 14.4K RPD (gemma-4-*) = 57.6K RPD total (fallback models)
//
// If a key returns 429, the client-side cascade in assistant.js falls through
// to the next model automatically.

export const config = { runtime: 'edge' };

import { authenticate, supabase } from '../lib/auth.js';

const LIMITS = {
  free: { messages: 3 },
  plus: { messages: 20 },
  pro:  { messages: 99999 }
};
const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Only these models may be requested. `model` is interpolated into the upstream
// URL, so an unvalidated value is a path/query-injection vector — reject anything
// not on this list. Keep in sync with js/ai-config.js.
const ALLOWED_MODELS = new Set([
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
]);

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

/** Pick an available key, rotating by minute so load spreads across projects. */
function pickKey() {
  const keys = [
    process.env.GOOGLE_AI_KEY,
    process.env.GOOGLE_AI_KEY_2,
    process.env.GOOGLE_AI_KEY_3,
    process.env.GOOGLE_AI_KEY_4,
  ].filter(Boolean); // drop any that aren't set

  if (keys.length === 0) return null;

  // Rotate by minute — each key serves for 1 minute before switching.
  const bucket = Math.floor(Date.now() / 60_000) % keys.length;
  return keys[bucket];
}

export default async function handler(req) {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const key = pickKey();
  if (!key) {
    return new Response('Server misconfiguration: no GOOGLE_AI_KEY vars set', { status: 500 });
  }

  // 1. Authenticate user
  const user = await authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Please log in.' }), { status: 401 });
  }

  // 2. Resolve tier
  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart();

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', user.id)
    .single();

  const tier = sub?.tier || 'free';
  const limit = LIMITS[tier]?.messages || LIMITS.free.messages;

  // 3. Validate the request body BEFORE consuming quota.
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { model, ...rest } = body;
  if (!model || !ALLOWED_MODELS.has(model)) {
    // Never interpolate an unvalidated model into the upstream URL.
    return new Response(JSON.stringify({ error: 'Invalid model' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. Atomically consume one message. -1 => daily limit reached (race-safe).
  const { data: newCount, error: consumeErr } = await supabase.rpc('consume_message', {
    p_user: user.id, p_date: today, p_week: weekStart, p_limit: limit
  });
  if (consumeErr) {
    console.error('consume_message failed:', consumeErr.message);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
  if (newCount === -1) {
    return new Response(JSON.stringify({
      error: 'LIMIT_REACHED',
      message: 'You have reached your daily message limit.',
      tier
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  // 5. Proxy to Google AI. `model` is from the allowlist, so the URL is safe.
  const upstream = await fetch(
    `${GOOGLE_AI_BASE}/${model}:streamGenerateContent?alt=sse&key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    }
  );

  if (!upstream.ok) {
    // A failed call shouldn't cost the user — refund the consumed message.
    (async () => { await supabase.rpc('refund_message', { p_user: user.id, p_date: today }); })();
  } else {
    // Log the event asynchronously (don't block the stream).
    (async () => {
      await supabase.from('events').insert({
        user_id: user.id, event: 'chat_message', metadata: { model, tier }
      });
    })();
  }

  // Stream response straight back — preserve status and SSE content-type.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
