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

export const SAGE_MODEL = 'claude-sonnet-4-6';
