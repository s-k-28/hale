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

/**
 * Health-recovery milestones — population-TYPICAL timeline (Guideline 1.4.1:
 * phrased as what typically happens after quitting, never as a measurement of
 * this user's body). Timepoints follow the published CDC / WHO / US Surgeon
 * General benefits-of-quitting timelines; the You tab cites them next to the
 * list. NOT medical advice; disclaimed in UI.
 */
export const HEALTH_MILESTONES: { hours: number; label: string }[] = [
  { hours: 0.33, label: 'Heart rate typically starts to settle' },
  { hours: 8, label: 'Blood oxygen typically returns toward normal' },
  { hours: 24, label: 'Carbon monoxide typically cleared from blood' },
  { hours: 48, label: 'Nicotine largely out of the system for most people' },
  { hours: 72, label: 'Breathing typically eases as airways relax' },
  { hours: 24 * 7, label: 'Taste & smell typically sharpen' },
  { hours: 24 * 14, label: 'Circulation typically improving' },
  { hours: 24 * 30, label: 'Cravings typically ease (receptors resetting)' },
  { hours: 24 * 90, label: 'Lung function typically improves noticeably' },
  { hours: 24 * 365, label: 'Excess heart-disease risk typically about halved' },
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

/** The last milestone (1 year) is "fully recovered" for the purposes of the %. */
const FULL_RECOVERY_HOURS = HEALTH_MILESTONES[HEALTH_MILESTONES.length - 1].hours; // 8760

/** Tunes how front-loaded the curve is. 24h ⇒ day 1 lands ~12%, day 30 ~58%. */
const RECOVERY_SCALE_HOURS = 24;

/**
 * Overall recovery toward full healing, 0..1. Monotonic and smooth.
 *
 * WAS: `milestonesReached / totalMilestones`. That was badly wrong. The milestones
 * are LOG-spaced (20 minutes … 1 year), so counting them equally told a user they
 * were "10% recovered" after 20 minutes, "50% recovered" after THREE DAYS, and
 * "80% recovered" at one month. It also only ever moved in 10-point steps. Beyond
 * looking broken, "your body is 50% recovered" after 3 days is a health claim we
 * cannot make (Guideline 1.4.1).
 *
 * NOW: a log-time curve over the same 20min → 1yr span. Recovery genuinely IS
 * front-loaded, so the curve is too, but honestly:
 *   day 1 ≈ 12%  ·  day 3 ≈ 23%  ·  day 7 ≈ 35%  ·  day 30 ≈ 58%  ·  day 90 ≈ 76%
 *   1 year = 100%
 * Smooth (moves every day, never jumps), monotonic, and clamped to 0..1.
 *
 * Use this anywhere a single recovery % is shown so every surface agrees. The
 * milestone LIST is still driven by reachedHealthMilestones() — unchanged.
 */
export function recoveryFraction(quitStart: number, now: number): number {
  const elapsedH = Math.max(0, (now - quitStart) / 3_600_000);
  const p =
    Math.log1p(elapsedH / RECOVERY_SCALE_HOURS) /
    Math.log1p(FULL_RECOVERY_HOURS / RECOVERY_SCALE_HOURS);
  return Math.min(1, Math.max(0, p));
}
