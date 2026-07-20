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

import { authenticate, supabase } from './middleware/auth.js';

const LIMITS = {
  free: { messages: 3 },
  plus: { messages: 20 },
  pro:  { messages: 99999 }
};
const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

  // 2. Check tier limits
  const today = new Date().toISOString().split('T')[0];
  
  // Get tier
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', user.id)
    .single();
  
  const tier = sub?.tier || 'free';
  const limit = LIMITS[tier]?.messages || LIMITS.free.messages;

  // Get usage
  let { data: usage } = await supabase
    .from('usage')
    .select('messages_used')
    .eq('user_id', user.id)
    .eq('date', today)
    .single();
    
  const used = usage?.messages_used || 0;

  if (used >= limit) {
    return new Response(JSON.stringify({ 
      error: 'LIMIT_REACHED', 
      message: 'You have reached your daily message limit.',
      tier 
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { model, ...rest } = body;
  if (!model) {
    return new Response('Missing model field', { status: 400 });
  }

  const upstream = await fetch(
    `${GOOGLE_AI_BASE}/${model}:streamGenerateContent?alt=sse&key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    }
  );

  // 4. Log usage asynchronously (don't block the stream response)
  if (upstream.ok) {
    (async () => {
      // Increment messages_used using RPC or simple update if we rely on edge concurrency
      // For simplicity in edge, just read current and +1 (race condition possible but acceptable for quotas)
      const { data: cur } = await supabase.from('usage').select('messages_used').eq('user_id', user.id).eq('date', today).single();
      const newCount = (cur?.messages_used || 0) + 1;
      await supabase.from('usage').update({ messages_used: newCount }).eq('user_id', user.id).eq('date', today);
      
      // Log event
      await supabase.from('events').insert({
        user_id: user.id,
        event: 'chat_message',
        metadata: { model, tier }
      });
    })();
  }

  // Stream response straight back — preserve status and SSE content-type.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
