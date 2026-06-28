import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { localHourOf } from './model/streak';

/**
 * Craving log (I3 trigger intelligence). Each craving is bound to the active
 * attempt and stamped with the USER's local hour (Decision 1: timezone-aware),
 * so we can surface when/why cravings hit and what resolved them.
 */
export const logCraving = mutation({
  args: {
    intensity: v.number(), // 1-5
    trigger: v.optional(v.string()),
    context: v.optional(v.string()),
    outcome: v.union(v.literal('survived'), v.literal('lapsed'), v.literal('relapsed')),
    resolvedBy: v.optional(v.string()), // breathing | sage | buddy | timer
  },
  handler: async (ctx, { intensity, trigger, context, outcome, resolvedBy }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user?.currentAttemptId || !user.timezone) throw new Error('No active quit');

    const now = Date.now();
    const cravingId = await ctx.db.insert('cravings', {
      userId,
      attemptId: user.currentAttemptId,
      ts: now,
      localHour: localHourOf(now, user.timezone),
      intensity,
      // Cap free-text fields so an authenticated client can't bloat storage.
      trigger: trigger?.slice(0, 200),
      context: context?.slice(0, 500),
      outcome,
      resolvedBy: resolvedBy?.slice(0, 50),
    });
    return { cravingId };
  },
});

/** The authed user's most recent cravings (newest first) for the I3 surface. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query('cravings')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .order('desc')
      .take(20);
  },
});
