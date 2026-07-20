import { authenticate } from '../middleware/auth.js';
import Razorpay from 'razorpay';

// Node.js runtime — gives full network access, no Edge fetch restrictions
export const config = { runtime: 'nodejs' };

const PLANS = {
  plus: { amount: 5000, currency: 'INR', description: 'Anatomy101 Plus (Lifetime)' },
  pro:  { amount: 15000, currency: 'INR', description: 'Anatomy101 Pro (Lifetime)' }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { tier } = req.body;
    const plan = PLANS[tier];

    if (!plan) {
      return res.status(400).json({ error: 'Invalid tier specified' });
    }

    const rzp = new Razorpay({
      key_id: (process.env.RAZORPAY_KEY_ID || '').trim(),
      key_secret: (process.env.RAZORPAY_KEY_SECRET || '').trim()
    });

    const order = await rzp.orders.create({
      amount: plan.amount,
      currency: plan.currency,
      receipt: `rcpt_${user.id.substring(0, 8)}_${Date.now()}`
    });

    return res.status(200).json({
      orderId: order.id,
      amount: plan.amount,
      currency: plan.currency,
      keyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
      description: plan.description
    });

  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
