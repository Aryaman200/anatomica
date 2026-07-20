import { authenticate, supabase } from '../middleware/auth.js';

export const config = { runtime: 'edge' };

const LIMITS = {
  free: { messages: 3, quizzes: 1 },
  plus: { messages: 20, quizzes: 2 },
  pro:  { messages: 99999, quizzes: 99999 } // effectively unlimited
};

// Helper to get start of week (Monday)
function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day == 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const user = await authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // 1. Get or create subscription
    let { data: sub } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('user_id', user.id)
      .single();

    if (!sub) {
      // First time user, create free subscription
      const { data: newSub, error } = await supabase
        .from('subscriptions')
        .insert({ user_id: user.id, tier: 'free' })
        .select('tier')
        .single();
      
      if (error) throw error;
      sub = newSub;
    }

    const tier = sub.tier;
    const limits = LIMITS[tier] || LIMITS.free;

    // 2. Get today's usage
    const today = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart();

    let { data: usage } = await supabase
      .from('usage')
      .select('messages_used, quizzes_used')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();

    if (!usage) {
      // Initialize usage for today
      const { data: newUsage, error } = await supabase
        .from('usage')
        .insert({ 
          user_id: user.id, 
          date: today, 
          week_start: weekStart 
        })
        .select('messages_used, quizzes_used')
        .single();
      
      if (error && error.code !== '23505') throw error; // ignore unique violation (race condition)
      usage = newUsage || { messages_used: 0, quizzes_used: 0 };
    }

    // 3. We also need to check weekly quiz usage, but for now we'll just check today's record.
    // To do weekly properly, we'd sum quizzes_used where week_start = weekStart.
    const { data: weeklyUsage } = await supabase
      .from('usage')
      .select('quizzes_used')
      .eq('user_id', user.id)
      .eq('week_start', weekStart);
      
    const totalQuizzesThisWeek = weeklyUsage ? weeklyUsage.reduce((acc, row) => acc + row.quizzes_used, 0) : 0;

    return new Response(JSON.stringify({
      tier,
      messagesUsed: usage.messages_used,
      messagesAllowed: limits.messages,
      messagesLeft: Math.max(0, limits.messages - usage.messages_used),
      quizzesUsedThisWeek: totalQuizzesThisWeek,
      quizzesAllowedThisWeek: limits.quizzes,
      quizzesLeftThisWeek: Math.max(0, limits.quizzes - totalQuizzesThisWeek)
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error('Error fetching user data:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
