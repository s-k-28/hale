/** PURE — builds Sage's non-judgmental, context-aware system prompt (I2). */
export type SageContext = {
  currentStreak: number;
  triggers: string[];
  hardestHour?: number;
  moneySaved: number;
  recentCravings: number;
};

/**
 * STABLE persona + rules — identical for every user and every turn. Kept free
 * of any interpolated state so it can anchor a prompt-cache prefix
 * (cache_control) without being invalidated. Do NOT interpolate per-user or
 * per-turn data here — that belongs in sageContextLine (after the breakpoint).
 */
export const SAGE_PERSONA = [
  'You are Sage, a warm, non-judgmental quit-nicotine coach inside the HALE app.',
  "Core rules: never shame, never preach, never use forcing language ('you must', 'you should').",
  'Cravings peak and fade in minutes — remind the user they can ride it out. Keep replies short (2-4 sentences), encouraging, concrete.',
  'This is supportive coaching, NOT medical advice.',
].join(' ');

/**
 * VOLATILE per-user, per-turn context. Must sit AFTER the cached persona prefix
 * (never inside it) — these numbers change every turn (money saved grows,
 * craving count shifts), so embedding them in the cached block would bust the
 * cache on every request.
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

/** Back-compat convenience: full prompt as a single string (persona + context). */
export function sageSystemPrompt(c: SageContext): string {
  return `${SAGE_PERSONA} ${sageContextLine(c)}`;
}

// Cheap-tier model (P3): Haiku is the low-cost Anthropic tier — same API, ~5x
// cheaper than Sonnet — so Sage's empathetic coaching turns stay margin-safe. A
// frontier model is NOT needed for short supportive replies.
export const SAGE_MODEL = 'claude-haiku-4-5-20251001';

// Per-tier DAILY message cap (P3). Free is small (post-trial non-payers shouldn't
// run up LLM cost); trial is generous-but-bounded (let them feel Sage without an
// uncapped compute subsidy); paid is high. Tunable from real usage data.
export const SAGE_DAILY_CAP: Record<'free' | 'trial' | 'paid', number> = {
  free: 5,
  trial: 15,
  paid: 50,
};

// Cost-proxy rates ($ per token) for the cheap tier — used to log a per-message
// cost estimate so real Sage cost-per-payer is MEASURABLE from data, not guessed.
// (Haiku list price ~ $0.80 / 1M input, $4.00 / 1M output, 2026.)
export const SAGE_COST_PER_INPUT_TOKEN = 0.8 / 1_000_000;
export const SAGE_COST_PER_OUTPUT_TOKEN = 4.0 / 1_000_000;

// Cap the chat history sent each turn (sliding window) so a long thread can't
// bloat input tokens (the real margin driver for chat apps) unbounded.
export const SAGE_MAX_CONTEXT_TURNS = 12;
