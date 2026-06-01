import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import { localDateOf } from './model/streak';
import { HEALTH_MILESTONES, nextHealthMilestone, reachedHealthMilestones } from './model/plan';

/**
 * I5 — craving-trend & recovery analytics (HALE+ surface). Both are thin {}
 * queries over data the user already owns; the screen gates on usePremium, so
 * these stay open (no entitlement check server-side — the data is the user's own
 * and the value lives in the visualization).
 *
 * cravingTrend  → last 30 LOCAL days of cravings, bucketed by the user's local
 *                 date, with per-day count + average intensity. Zero-filled so
 *                 the chart always renders a continuous 30-day window.
 * recoverySummary → reached / total HEALTH_MILESTONES for the ACTIVE attempt +
 *                 the next label still ahead (or null once fully recovered).
 */

const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 30;

export type CravingDay = { date: string; count: number; avgIntensity: number };

/** Last 30 local days of cravings bucketed by localDate (oldest → newest). */
export const cravingTrend = query({
  args: {},
  handler: async (ctx): Promise<CravingDay[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];
    const tz = user.timezone ?? 'UTC';

    const now = Date.now();
    // Inclusive 30-day window: today back through 29 days ago.
    const since = now - (WINDOW_DAYS - 1) * MS_PER_DAY;

    // by_user_ts is ordered by ts asc; bound the lower edge for an efficient scan.
    const rows = await ctx.db
      .query('cravings')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId).gte('ts', since))
      .collect();

    // Build a zero-filled skeleton of the 30 local-date keys so gaps render flat.
    const buckets = new Map<string, { count: number; sum: number }>();
    const order: string[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      const key = localDateOf(now - i * MS_PER_DAY, tz);
      if (!buckets.has(key)) {
        buckets.set(key, { count: 0, sum: 0 });
        order.push(key);
      }
    }

    for (const c of rows) {
      const key = localDateOf(c.ts, tz);
      const b = buckets.get(key);
      // Guard against an off-by-one at the window edge (tz rounding).
      if (!b) continue;
      b.count += 1;
      b.sum += c.intensity;
    }

    return order.map((date) => {
      const b = buckets.get(date)!;
      return {
        date,
        count: b.count,
        avgIntensity: b.count > 0 ? b.sum / b.count : 0,
      };
    });
  },
});

export type RecoverySummary = {
  reached: number;
  total: number;
  nextLabel: string | null;
};

/** Recovery progress for the active attempt: reached / total milestones + next. */
export const recoverySummary = query({
  args: {},
  handler: async (ctx): Promise<RecoverySummary> => {
    const total = HEALTH_MILESTONES.length;
    const userId = await getAuthUserId(ctx);
    if (!userId) return { reached: 0, total, nextLabel: null };
    const user = await ctx.db.get(userId);
    if (!user?.currentAttemptId) return { reached: 0, total, nextLabel: null };
    const attempt = await ctx.db.get(user.currentAttemptId);
    if (!attempt) return { reached: 0, total, nextLabel: null };

    const now = Date.now();
    const reached = reachedHealthMilestones(attempt.startDate, now).length;
    const next = nextHealthMilestone(attempt.startDate, now);
    return { reached, total, nextLabel: next?.label ?? null };
  },
});
