import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { internal } from './_generated/api';
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

    // RELAPSE RALLY (S5) — APPEND-ONLY. A relapse (never a lapse) is the moment a
    // buddy can do the most good. Resolve the authed user's ACTIVE buddyLink
    // (mirrors buddies.ts: by_userA then by_userB), emit a SANITIZED tough_moment
    // feedEvent into the pair's buddy scope, and reach the buddy with a push.
    // PRIVACY: the payload NEVER carries craving/relapse detail — just the signal
    // that their buddy needs support. Best-effort; failure here must not undo the
    // banked transaction above, so any missing buddy simply skips the rally.
    const asA = await ctx.db
      .query('buddyLinks')
      .withIndex('by_userA', (q) => q.eq('userA', userId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    const buddyLink =
      asA ??
      (await ctx.db
        .query('buddyLinks')
        .withIndex('by_userB', (q) => q.eq('userB', userId))
        .filter((q) => q.eq(q.field('status'), 'active'))
        .first());

    if (buddyLink) {
      const buddyUserId = buddyLink.userA === userId ? buddyLink.userB : buddyLink.userA;
      await ctx.db.insert('feedEvents', {
        scopeType: 'buddy',
        scopeId: String(buddyLink._id),
        actorId: userId,
        type: 'tough_moment',
        payload: {}, // SANITIZED — never any craving/relapse detail (privacy)
        ts: now,
      });
      await ctx.scheduler.runAfter(0, internal.pushes.notifyUser, {
        userId: buddyUserId,
        title: 'Your buddy is having a tough moment',
        body: 'Send them some strength',
        // Routing tag so a tapped push opens the buddy/squad screen.
        data: { kind: 'buddy_relapse' },
      });
    }

    return {
      kind,
      newAttemptId,
      lifetimeCleanDays: (user.lifetimeCleanDays ?? 0) + bankedDays,
      lifetimeMoneySaved: (user.lifetimeMoneySaved ?? 0) + bankedMoney,
      bestStreak: user.longestStreak ?? 0, // shown instead of a zero-void
    };
  },
});

/**
 * Attach the named trigger to the just-closed relapse attempt (I4). Called from
 * the recovery screen AFTER the comforting reflection ("what pulled you back?"),
 * once the attempt is already closed — separate from logRelapse because the
 * trigger is named post-recovery (anti-shame: comfort first, reflect second).
 */
export const noteRelapseTrigger = mutation({
  args: { trigger: v.string() },
  handler: async (ctx, { trigger }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const closed = await ctx.db
      .query('quitAttempts')
      .withIndex('by_user_active', (q) => q.eq('userId', userId).eq('active', false))
      .order('desc')
      .first();
    if (closed && closed.endReason === 'relapse') {
      await ctx.db.patch(closed._id, { endTrigger: trigger });
      return { ok: true };
    }
    return { ok: false };
  },
});
