/**
 * The HALE Score — the one metric HALE owns.
 *
 * "Hale" means whole, healthy. The brand IS the metric (the Oura Readiness /
 * Duolingo streak playbook): a single 0-100 number, surfaced daily, that becomes
 * identity and switching cost.
 *
 * THE POINT — it dents on a relapse, it NEVER zeroes.
 * A bare day-counter resetting to 0 is the #1 churn cliff in sobriety apps: you
 * slip once, the app says "0", and you delete it. So the score is deliberately
 * split into components that reset and components that DON'T:
 *
 *   resets on relapse        survives a relapse
 *   ----------------         ------------------
 *   body recovery (35)       best run     (20)  ← longestStreak
 *   streak momentum (25)     money banked (10)  ← lifetimeMoneySaved
 *                            showing up   (10)  ← base, for having an active quit
 *
 * So the worst a slip can do is knock you back to ~10-40, never to nothing:
 * "Your score dropped 29 points, not to zero. Your body keeps the progress you
 * gave it." That sentence is the retention feature.
 *
 * Everything here is PURE and computed from fields todayState already returns
 * (recovery fraction, currentStreak, longestStreak, lifetimeMoneySaved), so it
 * needs no schema change and no server round-trip. Locked by __tests__/haleScore.test.ts.
 */

export type HaleScoreInput = {
  /** Current attempt's body-recovery fraction, 0-1 (from HEALTH_MILESTONES). Resets on relapse. */
  recoveryFraction: number;
  /** Current clean streak in days. Resets on relapse. */
  currentStreak: number;
  /** Best-ever streak in days. SURVIVES a relapse. */
  longestStreak: number;
  /** Lifetime money not spent on nicotine. SURVIVES a relapse. */
  lifetimeMoneySaved: number;
};

export const SCORE_WEIGHTS = {
  /** Just for being in an active quit. The floor that stops a slip reading as "0". */
  showingUp: 10,
  bodyRecovery: 35,
  streakMomentum: 25,
  bestRun: 20,
  moneyBanked: 10,
} as const;

/** Days at which a streak component is considered "full marks". */
const STREAK_FULL_DAYS = 90;
/** Lifetime savings at which the money component is full marks. */
const MONEY_FULL = 500;

/**
 * Log curve: fast early growth, gentle tail. log10(1 + 9x) maps 0→0 and 1→1.
 * Early days feel rewarding (day 7 of 90 already returns ~0.23, not 0.08), which
 * is what keeps a new quitter opening the app.
 */
function curve(value: number, full: number): number {
  if (full <= 0) return 0;
  const x = Math.min(1, Math.max(0, value / full));
  return Math.log10(1 + 9 * x);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The HALE Score, 0-100 (integer). */
export function haleScore(i: HaleScoreInput): number {
  const recovery = clamp01(Number.isFinite(i.recoveryFraction) ? i.recoveryFraction : 0);
  const current = Math.max(0, i.currentStreak || 0);
  const longest = Math.max(0, i.longestStreak || 0, current); // best-ever is never below today
  const money = Math.max(0, i.lifetimeMoneySaved || 0);

  const total =
    SCORE_WEIGHTS.showingUp +
    SCORE_WEIGHTS.bodyRecovery * recovery +
    SCORE_WEIGHTS.streakMomentum * curve(current, STREAK_FULL_DAYS) +
    SCORE_WEIGHTS.bestRun * curve(longest, STREAK_FULL_DAYS) +
    SCORE_WEIGHTS.moneyBanked * curve(money, MONEY_FULL);

  return Math.max(0, Math.min(100, Math.round(total)));
}

/** The part of the score a relapse can never take away. Used for the recovery copy. */
export function protectedFloor(i: HaleScoreInput): number {
  const longest = Math.max(0, i.longestStreak || 0, i.currentStreak || 0);
  const money = Math.max(0, i.lifetimeMoneySaved || 0);
  return Math.round(
    SCORE_WEIGHTS.showingUp +
      SCORE_WEIGHTS.bestRun * curve(longest, STREAK_FULL_DAYS) +
      SCORE_WEIGHTS.moneyBanked * curve(money, MONEY_FULL),
  );
}

export type ScoreBand = 'Finding your feet' | 'Building' | 'Strong' | 'Unshakeable';

export function haleScoreBand(score: number): ScoreBand {
  if (score >= 85) return 'Unshakeable';
  if (score >= 60) return 'Strong';
  if (score >= 30) return 'Building';
  return 'Finding your feet';
}
