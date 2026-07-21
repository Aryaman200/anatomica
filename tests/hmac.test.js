// tests/hmac.test.js
//
// Mirrors verifyHmac() in api/subscription/verify.js. The real handler validates
// the Razorpay signature as HMAC-SHA256 of "orderId|paymentId" keyed by the
// account secret. These tests prove a genuine signature verifies and that any
// tamper (order, payment, or signature) is rejected — no network, pure crypto.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Exact copy of the verification logic in api/subscription/verify.js.
function verifyHmac(orderId, paymentId, signature, secret) {
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', (secret || '').trim())
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

// Helper: produce the signature Razorpay would send for a given order/payment.
function sign(orderId, paymentId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

const SECRET = 'test_razorpay_secret_key';
const ORDER = 'order_ABC123';
const PAYMENT = 'pay_XYZ789';

test('a correct signature verifies', () => {
  const good = sign(ORDER, PAYMENT, SECRET);
  assert.equal(verifyHmac(ORDER, PAYMENT, good, SECRET), true);
});

test('a tampered signature is rejected', () => {
  const good = sign(ORDER, PAYMENT, SECRET);
  const tampered = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
  assert.equal(verifyHmac(ORDER, PAYMENT, tampered, SECRET), false);
});

test('a signature for a different order is rejected (replay guard)', () => {
  const forOtherOrder = sign('order_OTHER', PAYMENT, SECRET);
  assert.equal(verifyHmac(ORDER, PAYMENT, forOtherOrder, SECRET), false);
});

test('a signature for a different payment id is rejected', () => {
  const forOtherPayment = sign(ORDER, 'pay_OTHER', SECRET);
  assert.equal(verifyHmac(ORDER, PAYMENT, forOtherPayment, SECRET), false);
});

test('a signature made with the wrong secret is rejected', () => {
  const wrongSecret = sign(ORDER, PAYMENT, 'attacker_secret');
  assert.equal(verifyHmac(ORDER, PAYMENT, wrongSecret, SECRET), false);
});

test('the secret is trimmed before use (matches handler behaviour)', () => {
  const good = sign(ORDER, PAYMENT, SECRET);
  // A secret with surrounding whitespace must still verify, since the handler
  // trims RAZORPAY_KEY_SECRET before hashing.
  assert.equal(verifyHmac(ORDER, PAYMENT, good, `  ${SECRET}  `), true);
});
