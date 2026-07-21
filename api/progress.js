export const config = { runtime: 'edge' };

import { authenticate, supabase } from '../lib/auth.js';

// Basic SM-2 algorithm variables
const MIN_EASE = 1.3;

export function calculateNextReview(topicData, isCorrect) {
  let { correct_count, total_attempts, interval_days, ease_factor } = topicData;
  total_attempts += 1;

  if (isCorrect) {
    correct_count += 1;
    if (correct_count === 1) {
      interval_days = 1;
    } else if (correct_count === 2) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
    // increase ease slightly on success
    ease_factor = Math.max(MIN_EASE, ease_factor + 0.1);
  } else {
    // reset correct streak on failure
    correct_count = 0;
    interval_days = 1;
    // heavily penalize ease on failure
    ease_factor = Math.max(MIN_EASE, ease_factor - 0.2);
  }

  const next_review_date = new Date();
  next_review_date.setDate(next_review_date.getDate() + interval_days);

  return {
    correct_count,
    total_attempts,
    interval_days,
    ease_factor,
    next_review_date: next_review_date.toISOString(),
  };
}

export default async function handler(req) {
  const user = await authenticate(req);
  if (!user) return new Response('Unauthorized', { status: 401 });

  if (req.method === 'GET') {
    // Fetch all topics that are due for review (or just fetch all and let client sort)
    // We fetch all so the client knows what the weak topics are.
    const { data, error } = await supabase
      .from('user_progress')
      .select('topic, correct_count, total_attempts, next_review_date')
      .eq('user_id', user.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
    
    // Expects an array of results: [{ topic: 'DNA', isCorrect: true }, ...]
    const { results } = body;
    if (!Array.isArray(results)) return new Response('results array required', { status: 400 });

    // Fetch existing records for these topics
    const topics = results.map(r => r.topic);
    const { data: existingData } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)
      .in('topic', topics);

    const existingMap = new Map();
    if (existingData) {
      existingData.forEach(row => existingMap.set(row.topic, row));
    }

    // Process updates
    const updates = results.map(res => {
      const current = existingMap.get(res.topic) || {
        correct_count: 0,
        total_attempts: 0,
        interval_days: 1.0,
        ease_factor: 2.5
      };
      
      const updated = calculateNextReview(current, res.isCorrect);
      
      return {
        user_id: user.id,
        topic: res.topic,
        ...updated,
        updated_at: new Date().toISOString()
      };
    });

    // Upsert all at once
    const { error } = await supabase
      .from('user_progress')
      .upsert(updates, { onConflict: 'user_id, topic' });

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ success: true, count: updates.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Method not allowed', { status: 405 });
}
