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

export type CravingHour = { hour: number; count: number; avgIntensity: number };
export type CravingPatterns = {
  byHour: CravingHour[]; // 24 buckets, hour 0..23
  peakHour: number | null; // hour with the most cravings (null if none logged)
  topTrigger: string | null; // most-frequent named trigger (null if none)
  total: number; // cravings considered
};

/**
 * Advanced toolkit insight: cravings bucketed by local hour-of-day (the heatmap)
 * plus the peak hour and most-common trigger. Over the user's own craving log —
 * same "data is yours, value is in the visualization" contract as cravingTrend.
 */
export const cravingPatterns = query({
  args: {},
  handler: async (ctx): Promise<CravingPatterns> => {
    const empty: CravingPatterns = {
      byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, avgIntensity: 0 })),
      peakHour: null,
      topTrigger: null,
      total: 0,
    };
    const userId = await getAuthUserId(ctx);
    if (!userId) return empty;

    const rows = await ctx.db
      .query('cravings')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .collect();
    if (rows.length === 0) return empty;

    const buckets = Array.from({ length: 24 }, () => ({ count: 0, sum: 0 }));
    const triggers = new Map<string, number>();
    for (const c of rows) {
      const h = Math.min(23, Math.max(0, c.localHour));
      buckets[h].count += 1;
      buckets[h].sum += c.intensity;
      if (c.trigger) triggers.set(c.trigger, (triggers.get(c.trigger) ?? 0) + 1);
    }

    const byHour = buckets.map((b, hour) => ({
      hour,
      count: b.count,
      avgIntensity: b.count > 0 ? b.sum / b.count : 0,
    }));
    let peakHour: number | null = null;
    let peakCount = 0;
    for (const h of byHour) {
      if (h.count > peakCount) {
        peakCount = h.count;
        peakHour = h.hour;
      }
    }
    let topTrigger: string | null = null;
    let topCount = 0;
    for (const [trigger, count] of triggers) {
      if (count > topCount) {
        topCount = count;
        topTrigger = trigger;
      }
    }

    return { byHour, peakHour, topTrigger, total: rows.length };
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
