import { authenticate, supabase } from '../middleware/auth.js';

export const config = { runtime: 'edge' };

const LIMITS = {
  free: { quizzes: 1 },
  plus: { quizzes: 2 },
  pro:  { quizzes: 99999 }
};

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
    const { difficulty } = await req.json();

    // Get tier
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('user_id', user.id)
      .single();
    
    const tier = sub?.tier || 'free';
    const limit = LIMITS[tier]?.quizzes || LIMITS.free.quizzes;

    if (tier === 'free' && difficulty !== 'Easy' && difficulty !== 'all') {
       return new Response(JSON.stringify({ error: 'LIMIT_REACHED', message: 'Free tier is limited to Easy quizzes.' }), { status: 429 });
    }

    const today = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart();

    // Check weekly usage
    const { data: usageLogs } = await supabase
      .from('usage')
      .select('id, quizzes_used, date')
      .eq('user_id', user.id)
      .eq('week_start', weekStart);

    const totalQuizzesThisWeek = usageLogs ? usageLogs.reduce((acc, row) => acc + row.quizzes_used, 0) : 0;

    if (totalQuizzesThisWeek >= limit) {
      return new Response(JSON.stringify({ 
        error: 'LIMIT_REACHED', 
        message: 'You have reached your weekly quiz limit.',
        tier 
      }), { status: 429 });
    }

    // Allowed! Increment today's quiz count
    let todayRecord = usageLogs?.find(row => row.date === today);
    
    if (todayRecord) {
      await supabase.from('usage').update({ quizzes_used: todayRecord.quizzes_used + 1 }).eq('id', todayRecord.id);
    } else {
      await supabase.from('usage').insert({
        user_id: user.id,
        date: today,
        week_start: weekStart,
        quizzes_used: 1,
        messages_used: 0
      });
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
