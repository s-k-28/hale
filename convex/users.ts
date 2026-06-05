import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import { moneySaved, nextHealthMilestone } from './model/plan';
import { trialEndsFrom, trialStatus } from './model/trial';

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
    if (existing?.currentAttemptId) return { attemptId: existing.currentAttemptId, userId };
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
      // Grant the app-managed 14-day full-access trial (§8). Paywall gates only
      // after this window closes (unless they subscribe first).
      trialStartedAt: now,
      trialEndsAt: trialEndsFrom(now),
      trialReminderSent: false,
    });
    return { attemptId, userId };
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
    const trial = trialStatus(now, user.trialEndsAt, user.premium ?? false);
    return {
      // The authed user's own _id — used client-side as the OneSignal external
      // id (Decision: external id == Convex user _id) and to gate push linking.
      userId,
      // Self-reported tough hour (0–23 local) — fed to OneSignal as a targeting
      // tag (usePushTags) and seeds the I3 proactive nudge.
      hardestHour: user.hardestHour ?? null,
      quitStart: attempt.startDate,
      currentMoneySaved: currentSaved,
      lifetimeMoneySaved: (user.lifetimeMoneySaved ?? 0) + currentSaved,
      currentStreak: user.currentStreak ?? 0,
      longestStreak: user.longestStreak ?? 0,
      freezesRemaining: user.freezesRemaining ?? 0,
      lastCheckInLocalDate: user.lastCheckInLocalDate ?? null,
      nextMilestone: nextHealthMilestone(attempt.startDate, now),
      premium: user.premium ?? false,
      // app-managed trial (§8) — UI shows countdown / gates after expiry
      trialEndsAt: trial.trialEndsAt,
      trialActive: trial.trialActive,
      trialDaysRemaining: trial.trialDaysRemaining,
      timezone: user.timezone ?? null,
    };
  },
});

/**
 * Persist the OneSignal link so server-side pushes can target this user.
 *
 * The client calls this right after OneSignal.login(externalId) succeeds, with
 * externalId == the Convex user _id (Decision: external id IS the user _id). The
 * push layer (pushes.getTarget / atRiskUsers / proactiveDueUsers) reads
 * `oneSignalExternalId` both to address the device AND as the "is this user
 * push-reachable?" flag — so it must only be written once the SDK has actually
 * logged the device in, never in scaffold mode.
 *
 * Idempotent: re-mounts re-call this, so we no-op when the value is unchanged.
 */
export const linkOneSignal = mutation({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Sign in before linking push notifications');
    const user = await ctx.db.get(userId);
    if (!user) return { linked: false, changed: false };
    if (user.oneSignalExternalId === externalId) return { linked: true, changed: false };
    await ctx.db.patch(userId, { oneSignalExternalId: externalId });
    return { linked: true, changed: true };
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
