/**
 * Generates golden fixtures from the PURE convex/model TS functions so the Swift
 * port (apple/Hale/Model) can assert exact parity. Run: npx tsx scripts/gen-model-fixtures.ts
 * Output: apple/HaleTests/Fixtures/model-fixtures.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  dailySpend, moneySaved, projectedAnnualSavings, nextHealthMilestone,
  reachedHealthMilestones, recoveryFraction, type QuitProfile,
} from '../convex/model/plan';
import { localDateOf, localHourOf, dayDiff, computeStreakOnCheckIn } from '../convex/model/streak';
import { quitStage } from '../convex/model/cohort';
import { referralRewardStatus, resolveEntitlement } from '../convex/model/entitlement';

const H = 3_600_000, D = 86_400_000;
const BASE = 1_750_000_000_000; // fixed epoch base (no Date.now — keeps fixtures stable)

const profiles: QuitProfile[] = [
  { productType: 'vape',  baselinePerDay: 1,   unitCost: 8 },
  { productType: 'pouch', baselinePerDay: 10,  unitCost: 0.5 },
  { productType: 'cig',   baselinePerDay: 0.75, unitCost: 12 },
  { productType: 'mixed', baselinePerDay: 40,  unitCost: 5 },   // exceeds cap → clamps
  { productType: 'vape',  baselinePerDay: 0,   unitCost: 8 },
];

const durations = [0, H, 12 * H, D, 3 * D, 7 * D, 30 * D, 365 * D, 1000 * D];

// timezones incl. half-hour offset (Kolkata) + DST-transition instants (US spring/fall 2025)
const zones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Eucla'];
const instants = [
  BASE,
  Date.UTC(2025, 2, 9, 6, 30),   // ~US spring-forward (EST→EDT)
  Date.UTC(2025, 10, 2, 6, 30),  // ~US fall-back
  Date.UTC(2025, 0, 1, 4, 59),   // near midnight in western zones
  Date.UTC(2025, 6, 15, 18, 45),
];

const milestonePairs = [0.2 * H, H, 8 * H, 24 * H, 48 * H, 72 * H, 7 * D, 30 * D, 90 * D, 365 * D, 400 * D]
  .map((elapsed) => ({ quitStart: BASE, now: BASE + elapsed }));

const streakCases = [
  { last: undefined, today: '2025-06-10', currentStreak: 0, freezes: 2 },
  { last: '2025-06-10', today: '2025-06-10', currentStreak: 5, freezes: 2 },
  { last: '2025-06-10', today: '2025-06-11', currentStreak: 5, freezes: 2 },
  { last: '2025-06-10', today: '2025-06-12', currentStreak: 5, freezes: 2 }, // freeze
  { last: '2025-06-10', today: '2025-06-12', currentStreak: 5, freezes: 0 }, // reset
  { last: '2025-06-10', today: '2025-06-20', currentStreak: 5, freezes: 2 }, // reset
];

const entitlementCases = [
  { premium: true,  endsAt: undefined,          now: BASE },
  { premium: false, endsAt: BASE + 3 * D,       now: BASE },
  { premium: false, endsAt: BASE - 1 * D,       now: BASE },
  { premium: undefined, endsAt: undefined,      now: BASE },
  { premium: true,  endsAt: BASE + 5 * D,       now: BASE },
  { premium: false, endsAt: BASE + 1,           now: BASE },
];

const fixtures = {
  dailySpend: profiles.map((p) => ({ baselinePerDay: p.baselinePerDay, unitCost: p.unitCost, expected: dailySpend(p) })),
  moneySaved: profiles.flatMap((p) => durations.map((ms) => ({
    baselinePerDay: p.baselinePerDay, unitCost: p.unitCost, ms, expected: moneySaved(p, ms),
  }))),
  projectedAnnualSavings: profiles.map((p) => ({
    productType: p.productType, baselinePerDay: p.baselinePerDay, unitCost: p.unitCost, expected: projectedAnnualSavings(p),
  })),
  nextHealthMilestone: milestonePairs.map((c) => ({
    quitStart: c.quitStart, now: c.now, expectedHours: nextHealthMilestone(c.quitStart, c.now)?.hours ?? null,
  })),
  reachedCount: milestonePairs.map((c) => ({
    quitStart: c.quitStart, now: c.now, expected: reachedHealthMilestones(c.quitStart, c.now).length,
  })),
  recoveryFraction: milestonePairs.map((c) => ({
    quitStart: c.quitStart, now: c.now, expected: recoveryFraction(c.quitStart, c.now),
  })),
  localDateOf: zones.flatMap((tz) => instants.map((epochMs) => ({ epochMs, tz, expected: localDateOf(epochMs, tz) }))),
  localHourOf: zones.flatMap((tz) => instants.map((epochMs) => ({ epochMs, tz, expected: localHourOf(epochMs, tz) }))),
  dayDiff: [
    ['2025-06-10', '2025-06-11'], ['2025-06-10', '2025-06-10'], ['2025-06-10', '2025-06-20'],
    ['2025-02-28', '2025-03-01'], ['2024-02-28', '2024-03-01'], ['2025-06-20', '2025-06-10'],
  ].map(([from, to]) => ({ from, to, expected: dayDiff(from, to) })),
  computeStreak: streakCases.map((c) => {
    const r = computeStreakOnCheckIn({
      lastCheckInLocalDate: c.last, todayLocalDate: c.today, currentStreak: c.currentStreak, freezesRemaining: c.freezes,
    });
    return { ...c, last: c.last ?? null, expectedNew: r.newStreak, expectedUsedFreeze: r.usedFreeze, expectedFreezes: r.freezesRemaining };
  }),
  quitStage: [0, 5 * D, 8 * D, 30 * D, 31 * D, 90 * D, 200 * D].map((elapsed) => ({
    quitStart: BASE, now: BASE + elapsed, expected: quitStage(BASE, BASE + elapsed),
  })),
  referralReward: entitlementCases.map((c) => {
    const r = referralRewardStatus(c.now, c.endsAt);
    return { now: c.now, endsAt: c.endsAt ?? null, active: r.active, days: r.daysRemaining };
  }),
  entitlement: entitlementCases.map((c) => {
    const r = resolveEntitlement({ premium: c.premium, referralRewardEndsAt: c.endsAt }, c.now);
    return {
      premium: c.premium ?? null, endsAt: c.endsAt ?? null, now: c.now,
      has: r.hasHALEPlus, source: r.source, rewardActive: r.referralRewardActive, days: r.rewardDaysRemaining,
    };
  }),
};

const out = 'apple/HaleTests/Fixtures/model-fixtures.json';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fixtures, null, 2));
const total = Object.values(fixtures).reduce((n, a) => n + a.length, 0);
console.log(`wrote ${out} — ${total} cases across ${Object.keys(fixtures).length} functions`);
