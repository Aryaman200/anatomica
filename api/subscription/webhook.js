import crypto from 'crypto';
import { supabase } from '../../lib/auth.js';

// Node.js runtime — needed for the crypto module and raw-stream access.
// bodyParser is disabled so we can read the EXACT bytes Razorpay signed;
// any re-serialisation would change whitespace/key-order and break the HMAC.
export const config = {
  runtime: 'nodejs',
  api: { bodyParser: false }
};

/**
 * Read the raw request body off the Node stream into a Buffer.
 * Must run before any JSON parsing — the signature is computed over these
 * exact bytes, so we cannot let Vercel/Express parse and re-stringify them.
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Constant-time comparison of the received signature against the expected
 * HMAC-SHA256 of the raw body. timingSafeEqual throws on length mismatch,
 * so guard the length first (a wrong-length signature is simply invalid).
 */
function verifySignature(rawBody, receivedSig, secret) {
  if (!receivedSig || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(receivedSig), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Webhook: failed to read raw body:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // --- Signature verification (must use the raw, unparsed bytes) ---
  const receivedSig = req.headers['x-razorpay-signature'];
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!verifySignature(rawBody, receivedSig, secret)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    let body;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const event = body?.event;
    // We only act on successful-payment events. Anything else is acknowledged
    // with 200 so Razorpay does not keep retrying an event we intentionally skip.
    if (event !== 'order.paid' && event !== 'payment.captured') {
      return res.status(200).json({ received: true, ignored: event || null });
    }

    const payment = body?.payload?.payment?.entity;
    const orderId = payment?.order_id;
    const paymentId = payment?.id;

    if (!orderId || !paymentId) {
      // Malformed payload for an event we expected to handle. Ack to stop
      // retries — retrying will not make the missing fields appear.
      console.error('Webhook: missing order_id/payment_id for event', event);
      return res.status(200).json({ received: true });
    }

    // Look the order up server-side. The tier is taken from THIS stored row,
    // never from the webhook payload — this is what stops a forged/altered
    // payload from granting a higher tier than was actually paid for.
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('order_id, user_id, tier, status')
      .eq('order_id', orderId)
      .single();

    // Unknown order, or already settled -> idempotent success. Returning 200
    // tells Razorpay to stop retrying (order.paid + payment.captured can both
    // fire for one order, so duplicates are expected and must be no-ops).
    if (orderErr || !order || order.status === 'paid') {
      return res.status(200).json({ received: true });
    }

    // Settle the order. The status guard makes the update a no-op if another
    // event/request already flipped it to 'paid' between our read and write.
    const { error: markErr } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_id: paymentId,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .eq('status', 'created');

    if (markErr) {
      console.error('Webhook: failed to settle order:', markErr.message);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Grant exactly the tier recorded on the stored order.
    const { error: subErr } = await supabase
      .from('subscriptions')
      .update({
        tier: order.tier,
        status: 'active',
        razorpay_sub_id: paymentId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', order.user_id);

    if (subErr) {
      console.error('Webhook: failed to grant tier:', subErr.message);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Audit trail. A failed insert here should not force a webhook retry —
    // the tier is already granted — so log and continue to a 200.
    const { error: evErr } = await supabase.from('events').insert({
      user_id: order.user_id,
      event: 'upgrade_webhook',
      metadata: { tier: order.tier, orderId, paymentId, event }
    });
    if (evErr) {
      console.error('Webhook: failed to log event:', evErr.message);
    }

    return res.status(200).json({ received: true, tier: order.tier });

  } catch (err) {
    console.error('Webhook: unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
