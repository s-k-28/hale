import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { localDateOf } from './model/streak';
import { moneySaved } from './model/plan';

/**
 * Decision 3 — the load-bearing anti-churn moment. ONE transactional mutation.
 *  • 'lapse'   = momentary slip → bounded grace; streak + counter PRESERVED.
 *  • 'relapse' = back on it → close attempt, BANK lifetime progress, open a new
 *    attempt, reset current counter to 0 (honest). Lifetime ledger is NEVER
 *    zeroed — the UI shows "you saved $X lifetime, best run N days" instead of a
 *    shaming void. Mutations are transactional so this can't half-apply.
 */
export const logRelapse = mutation({
  args: {
    kind: v.union(v.literal('lapse'), v.literal('relapse')),
    trigger: v.optional(v.string()),
  },
  handler: async (ctx, { kind }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user?.currentAttemptId || !user.timezone) throw new Error('No active quit');
    const attempt = await ctx.db.get(user.currentAttemptId);
    if (!attempt) throw new Error('No active attempt');

    const now = Date.now();
    const today = localDateOf(now, user.timezone);
    const profile = { baselinePerDay: user.baselinePerDay ?? 0, unitCost: user.unitCost ?? 0 };

    if (kind === 'lapse') {
      const grace = user.lapseGraceRemaining ?? 0;
      await ctx.db.insert('checkIns', {
        userId,
        attemptId: attempt._id,
        localDate: today,
        status: 'lapse',
        ts: now,
      });
      await ctx.db.patch(userId, { lapseGraceRemaining: Math.max(0, grace - 1) });
      return { kind, streakPreserved: true, graceRemaining: Math.max(0, grace - 1) };
    }

    // RELAPSE — bank lifetime, reset current
    const cleanMs = now - attempt.startDate;
    const bankedDays = Math.floor(cleanMs / 86_400_000);
    const bankedMoney = moneySaved(profile, cleanMs);

    await ctx.db.patch(attempt._id, { active: false, endDate: now, endReason: 'relapse' });
    await ctx.db.insert('checkIns', {
      userId,
      attemptId: attempt._id,
      localDate: today,
      status: 'relapse',
      ts: now,
    });
    const newAttemptId = await ctx.db.insert('quitAttempts', {
      userId,
      startDate: now,
      active: true,
    });
    await ctx.db.patch(userId, {
      currentAttemptId: newAttemptId,
      currentStreak: 0,
      lastCheckInLocalDate: undefined,
      freezesRemaining: 2,
      lapseGraceRemaining: 1,
      lifetimeCleanDays: (user.lifetimeCleanDays ?? 0) + bankedDays, // PRESERVED + grown
      lifetimeMoneySaved: (user.lifetimeMoneySaved ?? 0) + bankedMoney,
    });
    return {
      kind,
      newAttemptId,
      lifetimeCleanDays: (user.lifetimeCleanDays ?? 0) + bankedDays,
      lifetimeMoneySaved: (user.lifetimeMoneySaved ?? 0) + bankedMoney,
      bestStreak: user.longestStreak ?? 0, // shown instead of a zero-void
    };
  },
});
