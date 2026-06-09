import {
  resolveEntitlement,
  referralRewardStatus,
  rewardEndsFrom,
  REFERRAL_REWARD_DAYS,
  REFERRALS_REQUIRED,
} from '../convex/model/entitlement';

const MS_PER_DAY = 86_400_000;
const NOW = 1_700_000_000_000; // fixed reference instant

describe('constants', () => {
  it('locks the reward shape: 3 referrals → 7 days', () => {
    expect(REFERRALS_REQUIRED).toBe(3);
    expect(REFERRAL_REWARD_DAYS).toBe(7);
  });
});

describe('rewardEndsFrom', () => {
  it('adds exactly 7 days to the grant instant', () => {
    expect(rewardEndsFrom(NOW)).toBe(NOW + 7 * MS_PER_DAY);
  });
});

describe('referralRewardStatus', () => {
  it('is inactive when no reward has been granted', () => {
    expect(referralRewardStatus(NOW, undefined)).toEqual({
      active: false,
      daysRemaining: 0,
      endsAt: null,
    });
  });

  it('is active with ceil-ed days remaining inside the window', () => {
    const endsAt = NOW + 2.2 * MS_PER_DAY;
    const s = referralRewardStatus(NOW, endsAt);
    expect(s.active).toBe(true);
    expect(s.daysRemaining).toBe(3); // 2.2 days left ceils to 3 ("less than a day" still reads ≥1)
    expect(s.endsAt).toBe(endsAt);
  });

  it('is inactive once the window has passed', () => {
    const s = referralRewardStatus(NOW, NOW - 1);
    expect(s.active).toBe(false);
    expect(s.daysRemaining).toBe(0);
  });
});

describe('resolveEntitlement — single hasHALEPlus, three grant paths', () => {
  it('returns none for a free user past trial with no reward', () => {
    const e = resolveEntitlement({ premium: false, trialEndsAt: NOW - MS_PER_DAY }, NOW);
    expect(e.hasHALEPlus).toBe(false);
    expect(e.source).toBe('none');
    expect(e.referralRewardActive).toBe(false);
  });

  it('grants via an active trial', () => {
    const e = resolveEntitlement({ premium: false, trialEndsAt: NOW + 3 * MS_PER_DAY }, NOW);
    expect(e.hasHALEPlus).toBe(true);
    expect(e.source).toBe('trial');
  });

  it('grants via the referral reward when trial is over', () => {
    const e = resolveEntitlement(
      { premium: false, trialEndsAt: NOW - MS_PER_DAY, referralRewardEndsAt: NOW + 4 * MS_PER_DAY },
      NOW,
    );
    expect(e.hasHALEPlus).toBe(true);
    expect(e.source).toBe('referral_reward');
    expect(e.referralRewardActive).toBe(true);
    expect(e.rewardDaysRemaining).toBe(4);
  });

  it('paid wins precedence over both trial and reward', () => {
    const e = resolveEntitlement(
      {
        premium: true,
        trialEndsAt: NOW + 3 * MS_PER_DAY,
        referralRewardEndsAt: NOW + 5 * MS_PER_DAY,
      },
      NOW,
    );
    expect(e.source).toBe('paid');
    expect(e.hasHALEPlus).toBe(true);
    // The reward window is still REPORTED even when paid takes precedence, so the
    // UI can show the countdown alongside a subscription.
    expect(e.referralRewardActive).toBe(true);
    expect(e.rewardDaysRemaining).toBe(5);
  });

  it('reports the reward window even while a trial takes precedence', () => {
    const e = resolveEntitlement(
      { premium: false, trialEndsAt: NOW + 6 * MS_PER_DAY, referralRewardEndsAt: NOW + 2 * MS_PER_DAY },
      NOW,
    );
    expect(e.source).toBe('trial');
    expect(e.referralRewardActive).toBe(true);
    expect(e.rewardDaysRemaining).toBe(2);
  });

  it('handles a null/empty user as no access', () => {
    expect(resolveEntitlement(null, NOW).hasHALEPlus).toBe(false);
    expect(resolveEntitlement(undefined, NOW).source).toBe('none');
  });

  it('an expired reward grants nothing', () => {
    const e = resolveEntitlement(
      { premium: false, trialEndsAt: NOW - MS_PER_DAY, referralRewardEndsAt: NOW - 1 },
      NOW,
    );
    expect(e.hasHALEPlus).toBe(false);
    expect(e.source).toBe('none');
  });
});
