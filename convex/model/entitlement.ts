/**
 * HALE+ entitlement — the SINGLE source of truth (`hasHALEPlus`).
 *
 * Two independent grant paths resolve through here, so every server gate
 * (Sage caps, premium-only logic) and the client mirror (`usePremium`) read one
 * definition:
 *   • paid            — RC entitlement, mirrored onto users.premium by the webhook.
 *   • referral_reward — the 7-day window unlocked by 3 successful buddy referrals.
 *
 * There is deliberately NO app-managed trial floor (removed 2026-06-11, hard
 * paywall): the only free trial is the real StoreKit introductory offer, which
 * surfaces here as `paid` via the RC mirror once the subscription starts.
 *
 * Precedence (for the reported `source` only): paid > referral_reward. ANY
 * non-'none' source ⇒ hasHALEPlus = true. The referral-reward window is
 * reported (active + days remaining) regardless of source, so the UI can show
 * a "7 days of HALE+" countdown even alongside a subscription.
 *
 * This is a PURE module (no ctx) — same pattern as model/trial.ts — so it's unit
 * testable and usable from both queries and mutations.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Successful referrals (install + pair) required to unlock the reward. */
export const REFERRALS_REQUIRED = 3;
/** Length of the unlocked HALE+ reward window. */
export const REFERRAL_REWARD_DAYS = 7;

/** Reward end timestamp for a reward granted at `grantedAt` (epoch ms). */
export function rewardEndsFrom(grantedAt: number): number {
  return grantedAt + REFERRAL_REWARD_DAYS * DAY_MS;
}

export type RewardStatus = {
  active: boolean;
  daysRemaining: number;
  endsAt: number | null;
};

/** Reactive referral-reward window status. Days remaining is ceil'd (matches trial). */
export function referralRewardStatus(
  now: number,
  rewardEndsAt: number | null | undefined,
): RewardStatus {
  const ends = rewardEndsAt ?? null;
  if (ends == null) return { active: false, daysRemaining: 0, endsAt: null };
  const msLeft = ends - now;
  const active = msLeft > 0;
  return { active, daysRemaining: active ? Math.ceil(msLeft / DAY_MS) : 0, endsAt: ends };
}

export type EntitlementSource = 'paid' | 'referral_reward' | 'none';

export type Entitlement = {
  hasHALEPlus: boolean;
  source: EntitlementSource;
  referralRewardActive: boolean;
  rewardDaysRemaining: number;
};

/** The user fields this resolver reads (a structural slice of the users doc). */
export type EntitlementUser = {
  premium?: boolean;
  trialEndsAt?: number;
  referralRewardEndsAt?: number;
};

/**
 * Resolve a user's HALE+ access + why. The one function both the paid
 * subscription and the referral reward feed; the blurred features gate on
 * `hasHALEPlus`.
 */
export function resolveEntitlement(
  user: EntitlementUser | null | undefined,
  now: number,
): Entitlement {
  const reward = referralRewardStatus(now, user?.referralRewardEndsAt);

  if (user?.premium) {
    return {
      hasHALEPlus: true,
      source: 'paid',
      referralRewardActive: reward.active,
      rewardDaysRemaining: reward.daysRemaining,
    };
  }

  if (reward.active) {
    return {
      hasHALEPlus: true,
      source: 'referral_reward',
      referralRewardActive: true,
      rewardDaysRemaining: reward.daysRemaining,
    };
  }

  return { hasHALEPlus: false, source: 'none', referralRewardActive: false, rewardDaysRemaining: 0 };
}
