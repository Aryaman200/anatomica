// tests/progress-sr.test.js
//
// Covers the SM-2 spaced-repetition scheduler in api/progress.js
// (calculateNextReview). This is the core of the quiz's "review due topics"
// feature: it decides how far into the future a topic is pushed after each
// attempt. Pure function, no network — we assert the interval/ease/streak
// transitions match the SM-2 rules the handler relies on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextReview } from '../api/progress.js';

// A fresh topic the user has never attempted (matches the handler's default row).
const fresh = () => ({ correct_count: 0, total_attempts: 0, interval_days: 1.0, ease_factor: 2.5 });

// Days between now and an ISO date string, rounded to the nearest whole day.
function daysUntil(iso) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

test('first correct answer schedules review 1 day out', () => {
  const r = calculateNextReview(fresh(), true);
  assert.equal(r.correct_count, 1);
  assert.equal(r.total_attempts, 1);
  assert.equal(r.interval_days, 1);
  assert.equal(daysUntil(r.next_review_date), 1);
});

test('second consecutive correct jumps to 6 days', () => {
  let r = calculateNextReview(fresh(), true);
  r = calculateNextReview(r, true);
  assert.equal(r.correct_count, 2);
  assert.equal(r.interval_days, 6);
  assert.equal(daysUntil(r.next_review_date), 6);
});

test('third+ correct multiplies interval by ease factor', () => {
  let r = calculateNextReview(fresh(), true); // 1 day, ease 2.6
  r = calculateNextReview(r, true);           // 6 days, ease 2.7
  const easeBefore = r.ease_factor;
  r = calculateNextReview(r, true);           // 6 * ease
  assert.equal(r.correct_count, 3);
  assert.equal(r.interval_days, Math.round(6 * easeBefore));
});

test('ease factor rises by 0.1 on each success', () => {
  const r = calculateNextReview(fresh(), true);
  assert.ok(Math.abs(r.ease_factor - 2.6) < 1e-9, `expected 2.6, got ${r.ease_factor}`);
});

test('a wrong answer resets the streak and interval to 1 day', () => {
  // Build up a strong streak first...
  let r = calculateNextReview(fresh(), true);
  r = calculateNextReview(r, true);
  r = calculateNextReview(r, true);
  assert.ok(r.interval_days > 6);
  // ...then miss it.
  r = calculateNextReview(r, false);
  assert.equal(r.correct_count, 0, 'streak resets to 0');
  assert.equal(r.interval_days, 1, 'interval resets to 1 day');
  assert.equal(daysUntil(r.next_review_date), 1);
});

test('a wrong answer penalises ease by 0.2 but never below the 1.3 floor', () => {
  // One miss from default 2.5 ease → 2.3.
  let r = calculateNextReview(fresh(), false);
  assert.ok(Math.abs(r.ease_factor - 2.3) < 1e-9, `expected 2.3, got ${r.ease_factor}`);

  // Many misses must clamp at the SM-2 minimum ease of 1.3, not go lower.
  for (let i = 0; i < 20; i++) r = calculateNextReview(r, false);
  assert.equal(r.ease_factor, 1.3);
});

test('total_attempts counts every attempt, right or wrong', () => {
  let r = calculateNextReview(fresh(), true);
  r = calculateNextReview(r, false);
  r = calculateNextReview(r, true);
  assert.equal(r.total_attempts, 3);
});

test('next_review_date is a valid future ISO timestamp', () => {
  const r = calculateNextReview(fresh(), true);
  const t = new Date(r.next_review_date).getTime();
  assert.ok(!Number.isNaN(t), 'parseable date');
  assert.ok(t > Date.now(), 'in the future');
});
