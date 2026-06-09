import {
  DAYS_PER_MONTH,
  MAX_DAILY_SPEND,
  dailySpend,
  moneySaved,
  projectedAnnualSavings,
  nextHealthMilestone,
  reachedHealthMilestones,
  recoveryFraction,
  HEALTH_MILESTONES,
} from '../convex/model/plan';

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

// A realistic profile: the onboarding answer "$600/month on vapes" stored the
// per-day way the savings math expects — i.e. monthly units ÷ DAYS_PER_MONTH.
// 30 units/month ÷ 30 = 1 unit/day, at $20 each → $20/day → $600/month.
const monthlyUnits = 30;
const realistic = { baselinePerDay: monthlyUnits / DAYS_PER_MONTH, unitCost: 20 };
// Simpler exact profile for arithmetic checks: $20/day flat.
const flat = { baselinePerDay: 20, unitCost: 1 };

describe('dailySpend', () => {
  it('multiplies units/day by unit cost', () => {
    expect(dailySpend(flat)).toBe(20);
    expect(dailySpend({ baselinePerDay: 4, unitCost: 2.5 })).toBe(10);
  });

  it('never returns a negative rate', () => {
    expect(dailySpend({ baselinePerDay: -5, unitCost: 3 })).toBe(0);
    expect(dailySpend({ baselinePerDay: 5, unitCost: -3 })).toBe(0);
  });

  it('clamps an absurd rate to MAX_DAILY_SPEND (the monthly-leaked-into-daily bug)', () => {
    // The exact regression: a *monthly* figure (~$600) sitting in the per-day
    // field would imply ~$600/day. The clamp must cap it.
    const stale = { baselinePerDay: 600, unitCost: 1 }; // $600/day
    expect(dailySpend(stale)).toBe(MAX_DAILY_SPEND);
    expect(dailySpend(stale)).toBeLessThan(600);
  });

  it('does not clamp a realistic rate', () => {
    expect(dailySpend(realistic)).toBeCloseTo(20, 5);
    expect(dailySpend(realistic)).toBeLessThan(MAX_DAILY_SPEND);
  });
});

describe('moneySaved', () => {
  it('is zero at zero elapsed time', () => {
    expect(moneySaved(flat, 0)).toBe(0);
  });

  it('scales linearly with clean time ($20/day)', () => {
    expect(moneySaved(flat, MS_PER_DAY)).toBeCloseTo(20, 5);
    expect(moneySaved(flat, 7 * MS_PER_DAY)).toBeCloseTo(140, 5);
  });

  it('regression: ~15h on a correct $600/mo profile is ~$13, NOT ~$365', () => {
    const fifteenHours = 15 * MS_PER_HOUR;
    const saved = moneySaved(realistic, fifteenHours);
    expect(saved).toBeGreaterThan(11);
    expect(saved).toBeLessThan(15);
    // The old bug rendered ~$365 here — guard that it can never recur.
    expect(saved).toBeLessThan(50);
  });

  it('regression: stale monthly data is capped, not catastrophic', () => {
    // Even if a bad $600/day record sneaks in, 15h must not exceed the clamp's
    // implied ceiling ($100/day).
    const stale = { baselinePerDay: 600, unitCost: 1 };
    const saved = moneySaved(stale, 15 * MS_PER_HOUR);
    expect(saved).toBeLessThanOrEqual(MAX_DAILY_SPEND * (15 / 24) + 0.001);
  });

  it('never goes negative', () => {
    expect(moneySaved(flat, -MS_PER_DAY)).toBe(0);
  });
});

describe('projectedAnnualSavings', () => {
  it('is daily spend times 365', () => {
    const profile = { productType: 'vape' as const, baselinePerDay: 20, unitCost: 1 };
    expect(projectedAnnualSavings(profile)).toBe(20 * 365);
  });

  it('uses the clamped rate so a stale profile cannot project an absurd number', () => {
    const profile = { productType: 'vape' as const, baselinePerDay: 600, unitCost: 1 };
    expect(projectedAnnualSavings(profile)).toBe(MAX_DAILY_SPEND * 365);
  });

  // Mirrors the onboarding derivation: a $/month answer is stored as
  // baselinePerDay = monthlySpend / DAYS_PER_MONTH, unitCost = 1.
  it('regression: $50/month projects to ~$600/year, NOT ~$18,250', () => {
    const monthlySpend = 50;
    const profile = {
      productType: 'vape' as const,
      baselinePerDay: monthlySpend / DAYS_PER_MONTH,
      unitCost: 1,
    };
    const annual = projectedAnnualSavings(profile);
    expect(annual).toBeCloseTo(monthlySpend * (365 / DAYS_PER_MONTH), 5); // ~$608
    expect(annual).toBeGreaterThan(550);
    expect(annual).toBeLessThan(650);
    // The old units×cost trap rendered $18,250 here — guard it can't recur.
    expect(annual).toBeLessThan(1000);
  });
});

describe('health milestones', () => {
  it('returns the next un-passed milestone', () => {
    const start = 0;
    // 10h in: 0.33h and 8h are passed; next is the 24h carbon-monoxide one.
    const next = nextHealthMilestone(start, 10 * MS_PER_HOUR);
    expect(next?.hours).toBe(24);
  });

  it('returns null once every milestone is passed', () => {
    const start = 0;
    const wayPast = 400 * 24 * MS_PER_HOUR; // > 365 days
    expect(nextHealthMilestone(start, wayPast)).toBeNull();
  });

  it('reachedHealthMilestones grows monotonically with time', () => {
    const start = 0;
    const atOneDay = reachedHealthMilestones(start, MS_PER_DAY).length;
    const atOneWeek = reachedHealthMilestones(start, 7 * MS_PER_DAY).length;
    expect(atOneWeek).toBeGreaterThanOrEqual(atOneDay);
  });

  it('recoveryFraction is reached/total and ranges 0..1', () => {
    const start = 0;
    expect(recoveryFraction(start, 0)).toBe(0);
    expect(recoveryFraction(start, 500 * 24 * MS_PER_HOUR)).toBe(1);
    const mid = recoveryFraction(start, 3 * MS_PER_DAY);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(1);
    expect(mid).toBeCloseTo(reachedHealthMilestones(start, 3 * MS_PER_DAY).length / HEALTH_MILESTONES.length, 5);
  });
});
