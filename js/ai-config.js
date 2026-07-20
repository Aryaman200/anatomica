// ============================================================================
//  ai-config.js — Google AI model cascade for the AI assistant.
//
//  The API key is stored in Vercel's GOOGLE_AI_KEY environment variable and
//  never shipped to the browser. All requests go through /api/chat (a Vercel
//  Edge Function) which appends the key server-side before forwarding to
//  Google AI. apiKey is intentionally blank here.
// ============================================================================

export const AI_CONFIG = {
  apiKey: '', // key lives in Vercel env var GOOGLE_AI_KEY, not here

  // Models tried in order — falls through on 429 / 5xx.
  // Ranked by RPD: gemini-3.1-flash-lite (500) → gemma-4-26b (14.4K) → gemma-4-31b (14.4K).
  provider: 'google',
  models: [
    'gemini-3.1-flash-lite',   // 500 RPD, 15 RPM, 250K TPM  — primary
    'gemma-4-26b-a4b-it',      // 14.4K RPD, 30 RPM, 16K TPM — fallback
    'gemma-4-31b-it',          // 14.4K RPD, 30 RPM, 16K TPM — last resort
  ],

  maxTokens: 700,
  temperature: 0.3,
};

