import { getSession, loginWithGoogle } from './auth.js';

/**
 * Shows a beautiful custom modal (replacement for confirm)
 */
export function showPremiumModal(title, message, actionText, onAction) {
  let modal = document.getElementById('premium-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'premium-modal';
  modal.innerHTML = `
    <div class="premium-modal-backdrop"></div>
    <div class="premium-modal-content">
      <button class="premium-modal-close" aria-label="Close">×</button>
      <h2>${title}</h2>
      <p>${message}</p>
      <div class="premium-actions">
        <button class="btn-ghost btn-cancel">Cancel</button>
        <button class="btn-primary btn-action">${actionText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #premium-modal { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
    .premium-modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); }
    .premium-modal-content { position: relative; background: #0a0a0a; border: 1px solid #333; padding: 32px; border-radius: 16px; width: 90%; max-width: 420px; color: #eee; font-family: sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,0.8); text-align: center; }
    .premium-modal-close { position: absolute; top: 16px; right: 16px; background: none; border: none; color: #666; font-size: 24px; cursor: pointer; transition: 0.2s; }
    .premium-modal-close:hover { color: #fff; transform: rotate(90deg); }
    .premium-modal-content h2 { margin-top: 0; margin-bottom: 12px; font-size: 24px; font-weight: 600; color: #fff; }
    .premium-modal-content p { color: #aaa; margin-bottom: 32px; line-height: 1.5; font-size: 15px; }
    .premium-actions { display: flex; gap: 12px; justify-content: center; }
    .premium-actions button { padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px; transition: 0.2s; border: none; }
    .btn-ghost { background: transparent; color: #999; border: 1px solid #333 !important; }
    .btn-ghost:hover { background: #222; color: #fff; }
    .btn-primary { background: linear-gradient(135deg, #0ea5e9, #8b5cf6); color: #fff; box-shadow: 0 4px 15px rgba(14, 165, 233, 0.4); }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(14, 165, 233, 0.6); }
  `;
  document.head.appendChild(style);

  const close = () => modal.remove();
  modal.querySelector('.premium-modal-close').addEventListener('click', close);
  modal.querySelector('.premium-modal-backdrop').addEventListener('click', close);
  modal.querySelector('.btn-cancel').addEventListener('click', close);
  
  modal.querySelector('.btn-action').addEventListener('click', () => {
    close();
    if (onAction) onAction();
  });
}

/**
 * Initiates the Razorpay checkout flow for a specific tier.
 * @param {string} tier - 'plus' or 'pro'
 */
export async function checkout(tier) {
  const session = await getSession();
  if (!session) {
    alert('Please log in first.');
    return;
  }

  try {
    // 1. Create order on server
    const res = await fetch('/api/subscription/create-order', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ tier })
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.error('Server error creating order:', errTxt);
      try {
        const errObj = JSON.parse(errTxt);
        throw new Error(errObj.error || errObj.details || 'Payment gateway configuration error.');
      } catch (e) {
        throw new Error(errTxt || 'Payment gateway error.');
      }
    }

    const { orderId, amount, currency, keyId, description } = await res.json();

    // 2. Open Razorpay Checkout
    const options = {
      key: keyId,
      amount,
      currency,
      name: 'Anatomy101',
      description,
      image: 'https://anatomy101.in/assets/icon.png',
      order_id: orderId,
      handler: async function (response) {
        // 3. Verify payment on server
        const verifyRes = await fetch('/api/subscription/verify', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            tier
          })
        });

        if (verifyRes.ok) {
          alert(`Successfully upgraded to ${tier.toUpperCase()}!`);
          window.location.reload();
        } else {
          alert('Payment verification failed. If money was deducted, please contact support.');
        }
      },
      theme: { color: '#0ea5e9' } // Anatomy101 primary blue
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      console.error(response.error);
      alert('Payment failed: ' + response.error.description);
    });
    rzp.open();

  } catch (err) {
    console.error('Checkout error:', err);
    alert('Checkout error: ' + (err.message || 'Please try again.'));
  }
}
