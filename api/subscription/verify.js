import crypto from 'crypto';
import { authenticate, supabase } from '../middleware/auth.js';

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
    const { orderId, paymentId, signature, tier } = req.body;

    if (!orderId || !paymentId || !signature || !tier) {
      return res.status(400).json({ error: 'Missing payment fields' });
    }

    const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    const isValid = verifyHmac(orderId, paymentId, signature, secret);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Update tier in database
    const { error } = await supabase
      .from('subscriptions')
      .update({
        tier,
        status: 'active',
        razorpay_sub_id: paymentId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (error) throw error;

    // Log the upgrade event
    await supabase.from('events').insert({
      user_id: user.id,
      event: 'upgrade',
      metadata: { tier, orderId, paymentId }
    });

    return res.status(200).json({ success: true, tier });

  } catch (err) {
    console.error('Error verifying payment:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
