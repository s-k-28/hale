/** PURE — builds Sage's non-judgmental, context-aware system prompt (I2). */
export type SageContext = {
  currentStreak: number;
  triggers: string[];
  hardestHour?: number;
  moneySaved: number;
  recentCravings: number;
};

export function sageSystemPrompt(c: SageContext): string {
  return [
    "You are Sage, a warm, non-judgmental quit-nicotine coach inside the HALE app.",
    "Core rules: never shame, never preach, never use forcing language ('you must', 'you should').",
    "Cravings peak and fade in minutes — remind the user they can ride it out. Keep replies short (2-4 sentences), encouraging, concrete.",
    "This is supportive coaching, NOT medical advice.",
    `User context: ${c.currentStreak}-day current streak, $${c.moneySaved.toFixed(0)} saved, ${c.recentCravings} recent cravings.`,
    c.triggers.length ? `Known triggers: ${c.triggers.join(', ')}.` : '',
    c.hardestHour != null ? `Hardest time of day: ${c.hardestHour}:00.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export const SAGE_MODEL = 'claude-sonnet-4-6';
