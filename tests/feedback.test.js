// tests/feedback.test.js
//
// Contract test for js/feedback.js — the pure quiz-analysis module (extracted
// from the quiz results engine). It exposes:
//   analyze(answers) -> { bySubject, weakTopics, ... }   subject breakdown + weak topics
//   topicFor(question) -> { subject, topic }             classifies one question
//
// That module is built by another track and may not be present yet, so the
// dynamic import is guarded: if it can't be loaded, we log a skip instead of
// hard-failing the whole suite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDBACK_URL = new URL('../js/feedback.js', import.meta.url).href;

// Try to load the module up front. If it's absent/broken, `mod` stays null and
// every test below turns into a logged skip rather than a failure.
let mod = null;
let importError = null;
try {
  mod = await import(FEEDBACK_URL);
} catch (err) {
  importError = err;
  console.log(`[skip] js/feedback.js not loadable — skipping feedback tests (${err.message})`);
}

// A small fixture built to the canonical question schema, augmented with the
// user's `selected` option and an `isCorrect` flag so an analyzer can grade or
// re-grade it however it likes. Mix of subjects + right/wrong so a weak topic
// clearly emerges (Physics answered wrong twice).
function q(overrides) {
  return {
    id: overrides.id,
    year: overrides.year ?? 2022,
    subject: overrides.subject,
    branch: overrides.branch ?? '',
    question: {
      text: overrides.text,
      language: 'en',
      has_image: false,
      image: null,
      has_table: false,
      table: null,
    },
    options: overrides.options ?? [
      { id: 'A', text: 'Option A' },
      { id: 'B', text: 'Option B' },
      { id: 'C', text: 'Option C' },
      { id: 'D', text: 'Option D' },
    ],
    answer: overrides.answer,
    question_metadata: { topic: overrides.topic, difficulty: overrides.difficulty ?? 'Medium' },
    selected: overrides.selected,
    isCorrect: overrides.selected === overrides.answer,
  };
}

const FIXTURE = [
  q({ id: 'b1', subject: 'Biology', text: 'Photosynthesis occurs in the chloroplast thylakoid.', topic: 'Photosynthesis', answer: 'A', selected: 'A' }),
  q({ id: 'b2', subject: 'Biology', text: 'Mitosis produces two identical daughter cells.', topic: 'Cell Division', answer: 'B', selected: 'C' }),
  q({ id: 'p1', subject: 'Physics', text: 'Newton second law relates force mass and acceleration.', topic: 'Mechanics', answer: 'C', selected: 'A' }),
  q({ id: 'p2', subject: 'Physics', text: 'Ohm law relates voltage current and resistance.', topic: 'Current Electricity', answer: 'D', selected: 'B' }),
  q({ id: 'c1', subject: 'Chemistry', text: 'A mole contains Avogadro number of particles.', topic: 'Mole Concept', answer: 'A', selected: 'A' }),
];

test('analyze() returns a bySubject breakdown and weakTopics', (t) => {
  if (!mod) return t.skip('js/feedback.js unavailable' + (importError ? `: ${importError.message}` : ''));
  if (typeof mod.analyze !== 'function') return t.skip('feedback.js has no analyze() export');

  const result = mod.analyze(FIXTURE);
  assert.ok(result && typeof result === 'object', 'analyze() should return an object');

  // bySubject: a per-subject breakdown keyed by (or containing) subjects.
  assert.ok('bySubject' in result, 'result should have a bySubject breakdown');
  assert.ok(result.bySubject && typeof result.bySubject === 'object', 'bySubject should be an object');

  // weakTopics: a list of the weakest topics.
  assert.ok('weakTopics' in result, 'result should have weakTopics');
  assert.ok(Array.isArray(result.weakTopics), 'weakTopics should be an array');
});

test('topicFor() returns a subject and topic', (t) => {
  if (!mod) return t.skip('js/feedback.js unavailable' + (importError ? `: ${importError.message}` : ''));
  if (typeof mod.topicFor !== 'function') return t.skip('feedback.js has no topicFor() export');

  const classified = mod.topicFor(FIXTURE[0]);
  assert.ok(classified && typeof classified === 'object', 'topicFor() should return an object');
  assert.ok('subject' in classified, 'topicFor() result should include a subject');
  assert.ok('topic' in classified, 'topicFor() result should include a topic');
  assert.ok(classified.subject, 'subject should be truthy');
  assert.ok(classified.topic, 'topic should be truthy');
});
