// tests/model-allowlist.test.js
//
// api/chat.js interpolates the requested `model` straight into the upstream
// Google AI URL, so it guards with an ALLOWED_MODELS Set. That set is a private
// const (not exported), so we DERIVE it from the source file — this keeps the
// test honest: if someone edits the allowlist in chat.js, the test tracks it.
// We then assert the three known models pass and that unknown values and
// path/query-injection strings are rejected exactly as `ALLOWED_MODELS.has()`
// would reject them in the handler.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAT_PATH = join(__dirname, '..', 'api', 'chat.js');

/** Parse the `new Set([...])` literal assigned to ALLOWED_MODELS in chat.js. */
function deriveAllowedModels() {
  const src = readFileSync(CHAT_PATH, 'utf8');
  const m = src.match(/ALLOWED_MODELS\s*=\s*new Set\(\s*\[([\s\S]*?)\]\s*\)/);
  assert.ok(m, 'could not locate ALLOWED_MODELS Set literal in api/chat.js');
  const models = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  return new Set(models);
}

const ALLOWED_MODELS = deriveAllowedModels();

// The three known-good models (keep in sync with js/ai-config.js).
const KNOWN_MODELS = [
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
];

test('allowlist contains exactly the three known models', () => {
  assert.equal(ALLOWED_MODELS.size, 3);
  for (const model of KNOWN_MODELS) {
    assert.ok(ALLOWED_MODELS.has(model), `expected allowlist to include ${model}`);
  }
});

test('each known model passes the allowlist check', () => {
  for (const model of KNOWN_MODELS) {
    assert.equal(ALLOWED_MODELS.has(model), true);
  }
});

test('unknown models are rejected', () => {
  const rejects = [
    'gpt-4',
    'gemini-pro',
    'gemma-4-31b-it-EXTRA',
    'GEMINI-3.1-FLASH-LITE', // case-sensitive
    '',
    ' gemini-3.1-flash-lite', // leading space
  ];
  for (const model of rejects) {
    assert.equal(ALLOWED_MODELS.has(model), false, `should reject "${model}"`);
  }
});

test('path/query-injection strings are rejected', () => {
  const injections = [
    '../../v1/x',
    '../../../etc/passwd',
    'gemini-3.1-flash-lite/../../../secret',
    'gemini-3.1-flash-lite:streamGenerateContent?key=leak',
    'gemini-3.1-flash-lite?alt=sse',
    'models/gemini-3.1-flash-lite',
    'http://evil.example/x',
  ];
  for (const model of injections) {
    assert.equal(ALLOWED_MODELS.has(model), false, `should reject injection "${model}"`);
  }
});
