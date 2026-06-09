/**
 * PURE Sage helpers. The persona + knowledge prompt now lives in
 * convex/model/sage.prompt.ts (RAG-grounded); this file keeps the per-user
 * context line + the cost/cap/model config.
 */
export type SageContext = {
  currentStreak: number;
  triggers: string[];
  hardestHour?: number;
  moneySaved: number;
  recentCravings: number;
};

/**
 * VOLATILE per-user, per-turn context line, appended to the system prompt by
 * buildSageSystemPrompt (sage.prompt.ts).
 */
export function sageContextLine(c: SageContext): string {
  return [
    `User context: ${c.currentStreak}-day current streak, $${c.moneySaved.toFixed(0)} saved, ${c.recentCravings} recent cravings.`,
    c.triggers.length ? `Known triggers: ${c.triggers.join(', ')}.` : '',
    c.hardestHour != null ? `Hardest time of day: ${c.hardestHour}:00.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// Chat model (P3): Llama 3.3 70B on Groq — strong, fast, and cheap open model,
// served via Groq's OpenAI-compatible API. Good enough for short, empathetic
// coaching replies; a frontier model is NOT needed here.
export const SAGE_MODEL = 'llama-3.3-70b-versatile';

// Per-tier DAILY message cap (P3). Free is small (post-trial non-payers shouldn't
// run up LLM cost); trial is generous-but-bounded (let them feel Sage without an
// uncapped compute subsidy); paid is high. Tunable from real usage data.
export const SAGE_DAILY_CAP: Record<'free' | 'trial' | 'paid', number> = {
  free: 5,
  trial: 15,
  paid: 50,
};

// Cost-proxy rates ($ per token) — used to log a per-message cost estimate so
// real Sage cost-per-payer is MEASURABLE from data, not guessed.
// (Groq Llama 3.3 70B list price ~ $0.59 / 1M input, $0.79 / 1M output, 2026.)
export const SAGE_COST_PER_INPUT_TOKEN = 0.59 / 1_000_000;
export const SAGE_COST_PER_OUTPUT_TOKEN = 0.79 / 1_000_000;

// Cap the chat history sent each turn (sliding window) so a long thread can't
// bloat input tokens (the real margin driver for chat apps) unbounded.
export const SAGE_MAX_CONTEXT_TURNS = 12;
