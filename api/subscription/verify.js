import crypto from 'crypto';
import { authenticate, supabase } from '../../lib/auth.js';

// Node.js runtime — needed for crypto module
export const config = { runtime: 'nodejs' };

function verifyHmac(orderId, paymentId, signature, secret) {
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', (secret || '').trim())
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Note: any `tier` in the request body is intentionally ignored.
    const { orderId, paymentId, signature } = req.body || {};

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: 'Missing payment fields' });
    }

    const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!verifyHmac(orderId, paymentId, signature, secret)) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Look the order up server-side. Tier comes from THIS record, never from the
    // client — this is what stops "pay for Plus, claim Pro".
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('order_id, user_id, tier, status')
      .eq('order_id', orderId)
      .single();

    if (orderErr || !order) {
      return res.status(400).json({ error: 'Unknown order' });
    }
    // The order must belong to the caller.
    if (order.user_id !== user.id) {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }
    // Replay guard: an already-settled order is idempotent, not re-grantable.
    if (order.status === 'paid') {
      return res.status(200).json({ success: true, tier: order.tier });
    }

    const tier = order.tier; // server-side source of truth

    // Settle the order. The unique payment_id constraint means one Razorpay
    // payment can settle at most one order (blocks cross-order replay).
    const { error: markErr } = await supabase
      .from('orders')
      .update({ status: 'paid', payment_id: paymentId, updated_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('status', 'created');

    if (markErr) {
      console.error('Error settling order:', markErr.message);
      return res.status(400).json({ error: 'Payment could not be applied' });
    }

    // Grant the tier that was actually paid for.
    const { error: subErr } = await supabase
      .from('subscriptions')
      .update({
        tier,
        status: 'active',
        razorpay_sub_id: paymentId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (subErr) throw subErr;

    // Log the upgrade event
    await supabase.from('events').insert({
      user_id: user.id,
      event: 'upgrade',
      metadata: { tier, orderId, paymentId }
    });

    return res.status(200).json({ success: true, tier });

  } catch (err) {
    console.error('Error verifying payment:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
