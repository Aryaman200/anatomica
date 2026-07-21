import { authenticate, supabase } from '../../lib/auth.js';

export const config = { runtime: 'edge' };

const LIMITS = {
  free: { quizzes: 1 },
  plus: { quizzes: 2 },
  pro:  { quizzes: 99999 }
};
const FREE_MAX_QUESTIONS = 20;

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day == 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const user = await authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { difficulty, count } = await req.json();

    // Get tier
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('user_id', user.id)
      .single();

    const tier = sub?.tier || 'free';
    const limit = LIMITS[tier]?.quizzes || LIMITS.free.quizzes;

    if (tier === 'free') {
      // "all" mixes in Medium/Hard, so it's gated the same as picking them directly.
      if (difficulty !== 'Easy') {
        return new Response(JSON.stringify({ error: 'LIMIT_REACHED', message: 'Free tier is Easy-only. Upgrade to Plus or Pro for Medium, Hard, and mixed-difficulty quizzes.' }), { status: 429 });
      }
      if (typeof count === 'number' && count > FREE_MAX_QUESTIONS) {
        return new Response(JSON.stringify({ error: 'LIMIT_REACHED', message: `Free tier is capped at ${FREE_MAX_QUESTIONS} questions per quiz. Upgrade to Plus or Pro for longer quizzes.` }), { status: 429 });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart();

    // Atomically enforce the weekly quiz limit and count this quiz in one step
    // (race-safe — concurrent requests can't slip past the limit together).
    const { data: allowed, error: consumeErr } = await supabase.rpc('consume_quiz', {
      p_user: user.id, p_date: today, p_week: weekStart, p_limit: limit
    });
    if (consumeErr) {
      console.error('consume_quiz failed:', consumeErr.message);
      return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }
    if (!allowed) {
      return new Response(JSON.stringify({
        error: 'LIMIT_REACHED',
        message: 'You have reached your weekly quiz limit.',
        tier
      }), { status: 429 });
    }

    // Log event asynchronously
    supabase.from('events').insert({
      user_id: user.id,
      event: 'quiz_start',
      metadata: { difficulty, tier }
    }).then(); // don't await

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
