// tests/plans.test.js
//
// Sanity checks on the PLANS pricing table in api/subscription/create-order.js.
// PLANS is a private const (not exported), so we derive it from the source file.
// The amounts drive real Razorpay charges (LIVE mode), so a swapped/mispriced
// tier is a money bug — assert Plus is cheaper than Pro and both bill in INR.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATE_ORDER_PATH = join(__dirname, '..', 'api', 'subscription', 'create-order.js');

/** Extract the PLANS object literal from create-order.js and parse each tier. */
function derivePlans() {
  const src = readFileSync(CREATE_ORDER_PATH, 'utf8');
  const block = src.match(/const PLANS\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(block, 'could not locate PLANS object literal in create-order.js');
  const body = block[1];

  function parseTier(name) {
    const re = new RegExp(
      `${name}\\s*:\\s*\\{[^}]*?amount:\\s*(\\d+)[^}]*?currency:\\s*['"]([^'"]+)['"]`
    );
    const m = body.match(re);
    assert.ok(m, `could not parse tier "${name}" in PLANS`);
    return { amount: Number(m[1]), currency: m[2] };
  }

  return { plus: parseTier('plus'), pro: parseTier('pro') };
}

const PLANS = derivePlans();

test('PLANS defines plus and pro tiers with numeric amounts', () => {
  assert.equal(typeof PLANS.plus.amount, 'number');
  assert.equal(typeof PLANS.pro.amount, 'number');
  assert.ok(PLANS.plus.amount > 0, 'plus amount must be positive');
  assert.ok(PLANS.pro.amount > 0, 'pro amount must be positive');
});

test('plus is cheaper than pro', () => {
  assert.ok(
    PLANS.plus.amount < PLANS.pro.amount,
    `expected plus (${PLANS.plus.amount}) < pro (${PLANS.pro.amount})`
  );
});

test('both tiers are priced in INR', () => {
  assert.equal(PLANS.plus.currency, 'INR');
  assert.equal(PLANS.pro.currency, 'INR');
});
