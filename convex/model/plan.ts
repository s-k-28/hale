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

/** Money saved for a given clean duration (used for current attempt AND lifetime). */
export function moneySaved(profile: Pick<QuitProfile, 'baselinePerDay' | 'unitCost'>, ms: number) {
  const days = ms / MS_PER_DAY;
  return Math.max(0, days * profile.baselinePerDay * profile.unitCost);
}

/** Projected annual savings — the onboarding "wow" number. */
export function projectedAnnualSavings(profile: QuitProfile) {
  return profile.baselinePerDay * profile.unitCost * 365;
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
