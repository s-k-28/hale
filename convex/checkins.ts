import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { localDateOf, computeStreakOnCheckIn } from './model/streak';

/**
 * Daily check-in (P2). Transactional: dedups by local date, advances the streak
 * (with bounded freeze forgiveness), and writes both the checkIn row and the
 * denormalized cache in ONE mutation (Decision 1: checkIns is source of truth,
 * users.currentStreak is a cache updated only here).
 */
export const checkIn = mutation({
  args: { mood: v.optional(v.number()) },
  handler: async (ctx, { mood }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user?.currentAttemptId || !user.timezone) throw new Error('No active quit');

    const now = Date.now();
    const today = localDateOf(now, user.timezone);

    // Multiple checkIns rows per (userId, localDate) are LEGITIMATE: logRelapse writes
    // a 'lapse'/'relapse' status row for today, and a relapse opens a NEW attempt that
    // can still check in on the same calendar day. So we must NOT use .unique() here
    // (it throws "Expected 0 or 1, got N" on 2+ rows — the real cause of the spurious
    // "Couldn't check in" failures). Gate "already checked in" on a CLEAN row for the
    // CURRENT attempt instead, via .collect().
    const todayRows = await ctx.db
      .query('checkIns')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('localDate', today))
      .collect();
    const alreadyCleanToday = todayRows.some(
      (r) => r.status === 'clean' && r.attemptId === user.currentAttemptId,
    );
    if (alreadyCleanToday)
      return { alreadyCheckedIn: true, streak: user.currentStreak ?? 0, usedFreeze: false };

    const upd = computeStreakOnCheckIn({
      lastCheckInLocalDate: user.lastCheckInLocalDate,
      todayLocalDate: today,
      currentStreak: user.currentStreak ?? 0,
      freezesRemaining: user.freezesRemaining ?? 0,
    });

    await ctx.db.insert('checkIns', {
      userId,
      attemptId: user.currentAttemptId,
      localDate: today,
      status: 'clean',
      mood,
      ts: now,
    });
    await ctx.db.patch(userId, {
      currentStreak: upd.newStreak,
      longestStreak: Math.max(user.longestStreak ?? 0, upd.newStreak),
      lastCheckInLocalDate: today,
      freezesRemaining: upd.freezesRemaining,
    });
    return { alreadyCheckedIn: false, streak: upd.newStreak, usedFreeze: upd.usedFreeze };
  },
});
