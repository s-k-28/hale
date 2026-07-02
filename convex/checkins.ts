import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { localDateOf, computeStreakOnCheckIn } from './model/streak';
import { quitStage } from './model/cohort';
import { REFERRAL_ACTIVATION_STREAK } from './model/entitlement';
import { completeReferralOnActivation } from './referrals';

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

    // Anti-farm referral gate: if this user was referred and just reached the
    // activation streak, complete their (deferred) referral now — the invitee
    // has proven real engagement, so the referrer's reward can legitimately
    // count them. No-op unless referred + paired + activated.
    if (user.referredBy && upd.newStreak >= REFERRAL_ACTIVATION_STREAK) {
      await completeReferralOnActivation(ctx, userId);
    }

    // ── Activation instrumentation (P2) ──────────────────────────────────────
    // Detect the candidate activation events server-side (authoritative), write
    // them idempotently to activationEvents (the queryable moat for the q1 D30
    // retention-split), and RETURN flags so the client mirrors them to PostHog
    // (no server PostHog key needed).
    const attempt = await ctx.db.get(user.currentAttemptId);
    const stage = quitStage(attempt?.startDate ?? now, now);
    const linkA = await ctx.db
      .query('buddyLinks')
      .withIndex('by_userA', (q) => q.eq('userA', userId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    const link =
      linkA ??
      (await ctx.db
        .query('buddyLinks')
        .withIndex('by_userB', (q) => q.eq('userB', userId))
        .filter((q) => q.eq(q.field('status'), 'active'))
        .first());
    const pairedSolo: 'solo' | 'paired' = link ? 'paired' : 'solo';

    // first_check_in — idempotent via by_user_kind.
    let firstCheckIn = false;
    const existingFirst = await ctx.db
      .query('activationEvents')
      .withIndex('by_user_kind', (q) => q.eq('userId', userId).eq('kind', 'first_check_in'))
      .first();
    if (!existingFirst) {
      await ctx.db.insert('activationEvents', {
        userId,
        kind: 'first_check_in',
        ts: now,
        pairedSolo,
        pairingMethod: link?.pairingMethod,
        quitStage: stage,
      });
      firstCheckIn = true;
    }

    // activated_paired_quitter (NORTH-STAR activation) — checked in while paired
    // within 48h of the pairing edge. Idempotent.
    let activatedPairedQuitter = false;
    if (link?.pairedAt && now - link.pairedAt <= 48 * 3_600_000) {
      const existingAct = await ctx.db
        .query('activationEvents')
        .withIndex('by_user_kind', (q) =>
          q.eq('userId', userId).eq('kind', 'activated_paired_quitter'),
        )
        .first();
      if (!existingAct) {
        await ctx.db.insert('activationEvents', {
          userId,
          kind: 'activated_paired_quitter',
          ts: now,
          pairedSolo: 'paired',
          pairingMethod: link.pairingMethod,
          quitStage: stage,
        });
        activatedPairedQuitter = true;
      }
    }

    return {
      alreadyCheckedIn: false,
      streak: upd.newStreak,
      usedFreeze: upd.usedFreeze,
      // Activation signals — the client mirrors these to PostHog (q1 dataset).
      firstCheckIn,
      activatedPairedQuitter,
      pairedSolo,
      quitStage: stage,
      pairingMethod: link?.pairingMethod ?? null,
      hoursPairToCheckin: link?.pairedAt ? Math.round((now - link.pairedAt) / 3_600_000) : null,
    };
  },
});
