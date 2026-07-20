// ============================================================================
//  ai-config.example.js — template for js/ai-config.js (which is gitignored).
//
//  Copy this file to js/ai-config.js and paste your OpenRouter key.
//  Get one at https://openrouter.ai/keys
//
//  NOTE: Anatomy101 is a static site, so this key is shipped to the browser and
//  is readable by anyone who opens devtools. Only ever put a *free-tier-only*,
//  zero-credit, disposable OpenRouter key here. To keep it private you need a
//  server-side proxy — see the header comment in js/assistant.js.
// ============================================================================

export const AI_CONFIG = {
  apiKey: 'sk-or-v1-REPLACE-ME',

  // Small free models, tried in order — the next one is used if the previous
  // is rate-limited (429) or unavailable (5xx). Verified live against
  // https://openrouter.ai/api/v1/models (filter: id ends with ':free').
  models: [
    'nvidia/nemotron-nano-9b-v2:free',
    'openai/gpt-oss-20b:free',
    'google/gemma-4-26b-a4b-it:free',
  ],

  maxTokens: 700,
  temperature: 0.3,
};
