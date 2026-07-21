export const config = { runtime: 'edge' };

import { authenticate, supabase } from '../lib/auth.js';

export default async function handler(req) {
  const user = await authenticate(req);
  if (!user) return new Response('Unauthorized', { status: 401 });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_bookmarks')
      .select('part_id, note, updated_at')
      .eq('user_id', user.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
    
    const { part_id, note } = body;
    if (!part_id) return new Response('part_id required', { status: 400 });

    if (note === null || note === undefined || note.trim() === '') {
      // Delete bookmark if note is empty
      const { error } = await supabase
        .from('user_bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('part_id', part_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ success: true, deleted: true }), { status: 200 });
    }

    // Upsert bookmark
    const { data, error } = await supabase
      .from('user_bookmarks')
      .upsert({ user_id: user.id, part_id, note, updated_at: new Date().toISOString() }, { onConflict: 'user_id, part_id' })
      .select('part_id, note')
      .single();

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Method not allowed', { status: 405 });
}
