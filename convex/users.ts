import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query, internalMutation, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { moneySaved, nextHealthMilestone } from './model/plan';
import { trialStatus } from './model/trial';
import { resolveEntitlement } from './model/entitlement';

/** True if `tz` is a real IANA zone the runtime recognizes. */
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
    // Guard the client-supplied timezone: a bogus/rotating tz string would make
    // local-date math (streaks, the Sage daily cap) inconsistent. Coerce an
    // invalid zone to UTC rather than rejecting a legitimate onboarding.
    const timezone = isValidTimeZone(args.timezone) ? args.timezone : 'UTC';
    const attemptId = await ctx.db.insert('quitAttempts', { userId, startDate: now, active: true });
    await ctx.db.patch(userId, {
      ...args,
      timezone,
      currentAttemptId: attemptId,
      currentStreak: 0,
      longestStreak: 0,
      freezesRemaining: 2,
      lapseGraceRemaining: 1,
      lifetimeCleanDays: 0,
      lifetimeMoneySaved: 0,
      premium: false,
      // No app-managed trial is granted (hard paywall, 2026-06-11): access is
      // paid (StoreKit, incl. its intro trial) or the referral reward, only.
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
    // Unified HALE+ entitlement (single source of truth): paid OR trial OR the
    // 7-day referral reward. usePremium OR's these client-side too; exposing the
    // reward window here keeps the client mirror reactive (no extra round-trip).
    const entitlement = resolveEntitlement(user, now);
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
      // referral reward window (7-day HALE+) + the unified gate the UI reads.
      hasHALEPlus: entitlement.hasHALEPlus,
      entitlementSource: entitlement.source,
      referralRewardActive: entitlement.referralRewardActive,
      rewardDaysRemaining: entitlement.rewardDaysRemaining,
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

/**
 * Affirmative acceptance of the zero-tolerance community rules (Guideline
 * 1.2). communityPosts.createPost/createComment are server-gated on this —
 * the client interstitial alone is not the enforcement point. Idempotent.
 */
export const acceptCommunityRules = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (user && user.communityRulesAcceptedAt === undefined)
      await ctx.db.patch(userId, { communityRulesAcceptedAt: Date.now() });
    return { ok: true as const };
  },
});

/**
 * Explicit consent to share chat data with third-party AI providers
 * (Guideline 5.1.2(i)): Groq generates Sage's replies, Google embeds messages
 * for knowledge search. sage.send is server-gated on this. Idempotent.
 */
export const setAiConsent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (user && user.aiConsentAt === undefined)
      await ctx.db.patch(userId, { aiConsentAt: Date.now() });
    return { ok: true as const };
  },
});

/**
 * Withdraw AI-consent (5.1.1(ii): consent must be revocable). Unsetting the
 * flag re-locks sage.send server-side; the coach UI re-shows the consent card.
 */
export const revokeAiConsent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (user && user.aiConsentAt !== undefined)
      await ctx.db.patch(userId, { aiConsentAt: undefined });
    return { ok: true as const };
  },
});

/** Whether the caller has consented to AI data sharing (gates the coach UI). */
export const aiConsentStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { consented: false };
    const user = await ctx.db.get(userId);
    return { consented: user?.aiConsentAt !== undefined };
  },
});

/** Whether the caller has accepted the community rules (gates the feed UI). */
export const communityRulesStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { accepted: false };
    const user = await ctx.db.get(userId);
    return { accepted: user?.communityRulesAcceptedAt !== undefined };
  },
});

// NOTE: account deletion lives in convex/account.ts (the canonical cascade,
// incl. community/feed/referral product decisions). It schedules the
// purgeExternalAccounts action below.

/**
 * Provider-side purge after deleteAccount — best-effort with loud logs.
 * Each provider is independent and skipped (with a log) when its env keys are
 * absent, mirroring the email scaffold pattern, so a missing key can never
 * block in-app deletion. Designed so a future Sign in with Apple token
 * revocation drops in as one more step.
 */
export const purgeExternalAccounts = internalAction({
  args: { externalId: v.string(), oneSignalExternalId: v.string() },
  handler: async (_ctx, { externalId, oneSignalExternalId }) => {
    const results: Record<string, string> = {};

    // OneSignal — delete the user (device aliases + tags) by external id.
    const osAppId = process.env.ONESIGNAL_APP_ID;
    const osKey = process.env.ONESIGNAL_REST_API_KEY;
    if (osAppId && osKey) {
      try {
        const res = await fetch(
          `https://api.onesignal.com/apps/${osAppId}/users/by/external_id/${encodeURIComponent(oneSignalExternalId)}`,
          { method: 'DELETE', headers: { Authorization: `Key ${osKey}` } },
        );
        results.onesignal = res.ok || res.status === 404 ? 'ok' : `status ${res.status}`;
      } catch (e) {
        results.onesignal = e instanceof Error ? e.message : String(e);
      }
    } else {
      results.onesignal = 'skipped (ONESIGNAL_APP_ID/ONESIGNAL_REST_API_KEY unset)';
    }

    // PostHog — delete the person (and their events) by distinct id.
    const phProject = process.env.POSTHOG_PROJECT_ID;
    const phKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const phHost = process.env.POSTHOG_HOST ?? 'https://us.posthog.com';
    if (phProject && phKey) {
      try {
        const lookup = await fetch(
          `${phHost}/api/projects/${phProject}/persons/?distinct_id=${encodeURIComponent(externalId)}`,
          { headers: { Authorization: `Bearer ${phKey}` } },
        );
        const data = lookup.ok ? await lookup.json() : null;
        const personId = data?.results?.[0]?.id;
        if (personId) {
          const res = await fetch(
            `${phHost}/api/projects/${phProject}/persons/${personId}/?delete_events=true`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${phKey}` } },
          );
          results.posthog = res.ok ? 'ok' : `status ${res.status}`;
        } else {
          results.posthog = lookup.ok ? 'no person found' : `lookup status ${lookup.status}`;
        }
      } catch (e) {
        results.posthog = e instanceof Error ? e.message : String(e);
      }
    } else {
      results.posthog = 'skipped (POSTHOG_PROJECT_ID/POSTHOG_PERSONAL_API_KEY unset)';
    }

    // RevenueCat — delete the subscriber record (does NOT cancel App Store
    // billing; the client warns and links to manage-subscriptions).
    const rcKey = process.env.REVENUECAT_SECRET_API_KEY;
    if (rcKey) {
      try {
        const res = await fetch(
          `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(externalId)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${rcKey}` } },
        );
        results.revenuecat = res.ok || res.status === 404 ? 'ok' : `status ${res.status}`;
      } catch (e) {
        results.revenuecat = e instanceof Error ? e.message : String(e);
      }
    } else {
      results.revenuecat = 'skipped (REVENUECAT_SECRET_API_KEY unset)';
    }

    const failed = Object.entries(results).filter(
      ([, r]) => r !== 'ok' && !r.startsWith('skipped') && r !== 'no person found',
    );
    if (failed.length > 0)
      console.error(`[deletion] external purge incomplete for ${externalId}:`, results);
    else console.log(`[deletion] external purge for ${externalId}:`, results);
    return results;
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
