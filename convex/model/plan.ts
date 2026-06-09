/**
 * PURE plan math — no Convex, no RN imports. Runs client-side during onboarding
 * (Decision 2: the plan is computed before any account exists) AND server-side.
 * Single source of truth for $ saved + the health-recovery timeline.
 */
export type QuitProfile = {
  productType: 'vape' | 'pouch' | 'cig' | 'mixed';
  baselinePerDay: number; // units/day
  unitCost: number; // $ per unit
};

const MS_PER_DAY = 86_400_000;

/** Days/month used to convert the per-month onboarding answer into units/day.
 * Shared so the savings math and the data migration agree on one divisor. */
export const DAYS_PER_MONTH = 30;

/** Defensive ceiling on the daily spend rate the savings math will honor.
 * Even the heaviest real nicotine spend lands well under this; a rate above it
 * almost always means a *monthly* quantity leaked into the per-day field (the
 * units/month → units/day conversion in onboarding). Clamping here keeps one bad
 * record from rendering an absurd "$ saved" on every surface (today, goals,
 * relapse, sage) while a migration corrects the underlying data. */
export const MAX_DAILY_SPEND = 100; // $/day

/** Sanitized daily spend ($/day) — single choke point for the cap above. */
export function dailySpend(profile: Pick<QuitProfile, 'baselinePerDay' | 'unitCost'>) {
  return Math.min(MAX_DAILY_SPEND, Math.max(0, profile.baselinePerDay * profile.unitCost));
}

/** Money saved for a given clean duration (used for current attempt AND lifetime). */
export function moneySaved(profile: Pick<QuitProfile, 'baselinePerDay' | 'unitCost'>, ms: number) {
  const days = ms / MS_PER_DAY;
  return Math.max(0, days * dailySpend(profile));
}

/** Projected annual savings — the onboarding "wow" number. */
export function projectedAnnualSavings(profile: QuitProfile) {
  return dailySpend(profile) * 365;
}

/** Health-recovery milestones — "commonly reported" (NOT medical advice; disclaimed in UI). */
export const HEALTH_MILESTONES: { hours: number; label: string }[] = [
  { hours: 0.33, label: 'Heart rate begins to normalize' },
  { hours: 8, label: 'Blood oxygen returns toward normal' },
  { hours: 24, label: 'Carbon monoxide cleared from blood' },
  { hours: 48, label: 'Nicotine largely out of your system' },
  { hours: 72, label: 'Breathing eases; bronchial tubes relax' },
  { hours: 24 * 7, label: 'Taste & smell sharpen' },
  { hours: 24 * 14, label: 'Circulation improves' },
  { hours: 24 * 30, label: 'Cravings markedly reduced (receptors resetting)' },
  { hours: 24 * 90, label: 'Lung function noticeably improved' },
  { hours: 24 * 365, label: 'Heart-disease risk roughly halved vs. continuing' },
];

/** Landmark streak/day celebrations (gated — Decision: rare = powerful). */
export const LANDMARK_DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 365];

export function nextHealthMilestone(quitStart: number, now: number) {
  const elapsedH = (now - quitStart) / 3_600_000;
  return HEALTH_MILESTONES.find((m) => m.hours > elapsedH) ?? null;
}

export function reachedHealthMilestones(quitStart: number, now: number) {
  const elapsedH = (now - quitStart) / 3_600_000;
  return HEALTH_MILESTONES.filter((m) => m.hours <= elapsedH);
}

/**
 * Overall recovery toward full healing as a 0..1 fraction = health milestones
 * reached / total. Monotonic (never resets), unlike next-milestone progress
 * (cleanMs / nextMilestone.hours), which oscillates back toward 0 each time a
 * milestone is passed. This is the canonical "reached / total" definition already
 * surfaced by analytics.recoverySummary — use it anywhere a single recovery % is
 * shown so every surface agrees.
 */
export function recoveryFraction(quitStart: number, now: number): number {
  return reachedHealthMilestones(quitStart, now).length / HEALTH_MILESTONES.length;
}
