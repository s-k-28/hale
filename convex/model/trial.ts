/**
 * App-managed free trial (Phase-1 §8).
 *
 * HALE grants every new quitter a 14-day FULL-ACCESS window at onboarding. The
 * paywall gates features only AFTER the trial expires (and the user hasn't
 * subscribed) — RevenueCat/StoreKit owns the actual paid subscription, but the
 * trial window itself is owned here in Convex so it works offline, survives
 * reinstalls, and needs no store round-trip.
 *
 * Effective access = premium (RC entitlement) OR trialActive. premium always
 * wins — a subscriber is never shown a trial countdown.
 */

export const TRIAL_LENGTH_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How close to trial-end we send the single "your trial is ending" email. */
export const TRIAL_REMINDER_WINDOW_MS = 2 * DAY_MS; // ≤ 2 days remaining

/** Trial end timestamp for a trial that started at `startedAt` (epoch ms). */
export function trialEndsFrom(startedAt: number): number {
  return startedAt + TRIAL_LENGTH_DAYS * DAY_MS;
}

export type TrialStatus = {
  trialEndsAt: number | null;
  trialActive: boolean;
  trialDaysRemaining: number;
};

/**
 * Reactive trial status for UI + gating. A premium user is never "in trial"
 * (their access comes from the entitlement), so we report trialActive=false and
 * let the caller OR premium back in. Days remaining is ceil'd so "less than a
 * day left" still reads as "1 day".
 */
export function trialStatus(
  now: number,
  trialEndsAt: number | null | undefined,
  premium: boolean,
): TrialStatus {
  const ends = trialEndsAt ?? null;
  if (premium || ends == null) {
    return { trialEndsAt: ends, trialActive: false, trialDaysRemaining: 0 };
  }
  const msLeft = ends - now;
  const trialActive = msLeft > 0;
  return {
    trialEndsAt: ends,
    trialActive,
    trialDaysRemaining: trialActive ? Math.ceil(msLeft / DAY_MS) : 0,
  };
}
