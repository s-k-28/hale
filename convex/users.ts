import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import { moneySaved, nextHealthMilestone } from './model/plan';

/** Called right after anonymous sign-in at the commitment step (Decision 2). */
export const completeOnboarding = mutation({
  args: {
    timezone: v.string(),
    productType: v.union(v.literal('vape'), v.literal('pouch'), v.literal('cig'), v.literal('mixed')),
    baselinePerDay: v.number(),
    unitCost: v.number(),
    triggers: v.array(v.string()),
    hardestHour: v.number(),
    motivation: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Sign in anonymously before completing onboarding');
    // Idempotent: if onboarding already completed for this user (e.g. a client
    // retry after a network blip that actually succeeded server-side), return the
    // existing attempt instead of inserting a duplicate quitAttempt.
    const existing = await ctx.db.get(userId);
    if (existing?.currentAttemptId) return { attemptId: existing.currentAttemptId };
    const now = Date.now();
    const attemptId = await ctx.db.insert('quitAttempts', { userId, startDate: now, active: true });
    await ctx.db.patch(userId, {
      ...args,
      currentAttemptId: attemptId,
      currentStreak: 0,
      longestStreak: 0,
      freezesRemaining: 2,
      lapseGraceRemaining: 1,
      lifetimeCleanDays: 0,
      lifetimeMoneySaved: 0,
      premium: false,
    });
    return { attemptId };
  },
});

/** Reactive Today-screen state (P1/P2): counter inputs + streak + next milestone. */
export const todayState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.currentAttemptId) return null;
    const attempt = await ctx.db.get(user.currentAttemptId);
    if (!attempt) return null;
    const now = Date.now();
    const profile = { baselinePerDay: user.baselinePerDay ?? 0, unitCost: user.unitCost ?? 0 };
    const currentSaved = moneySaved(profile, now - attempt.startDate);
    return {
      quitStart: attempt.startDate,
      currentMoneySaved: currentSaved,
      lifetimeMoneySaved: (user.lifetimeMoneySaved ?? 0) + currentSaved,
      currentStreak: user.currentStreak ?? 0,
      longestStreak: user.longestStreak ?? 0,
      freezesRemaining: user.freezesRemaining ?? 0,
      lastCheckInLocalDate: user.lastCheckInLocalDate ?? null,
      nextMilestone: nextHealthMilestone(attempt.startDate, now),
      premium: user.premium ?? false,
      timezone: user.timezone ?? null,
    };
  },
});

/** RC webhook mirror (internal). externalId == Convex user _id. */
export const setPremiumByExternalId = internalMutation({
  args: { externalId: v.string(), premium: v.boolean() },
  handler: async (ctx, { externalId, premium }) => {
    const id = ctx.db.normalizeId('users', externalId);
    if (!id) return;
    const user = await ctx.db.get(id);
    if (user) await ctx.db.patch(id, { premium });
  },
});
