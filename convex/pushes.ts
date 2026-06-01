import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { localDateOf } from './model/streak';

/**
 * Push delivery layer (OneSignal). Follows the Sage pattern: actions hold the
 * external I/O, talk to the db only via ctx.runQuery / ctx.runMutation, and
 * degrade to a no-op when keys are missing so the app stays scaffold-safe.
 *
 * Targeting uses OneSignal External IDs (== Convex user _id), set client-side
 * via loginOneSignal(externalId). The REST key + app id live in the Convex
 * deployment env (process.env), never in the bundle.
 */

/**
 * Resolve a user's OneSignal external id (== their Convex user _id, stored on
 * the user doc once they've logged into OneSignal). Returns null when unknown.
 */
export const getTarget = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return { externalId: user?.oneSignalExternalId ?? null };
  },
});

/**
 * Send one push to a single user via the OneSignal REST API. Best-effort:
 *   • missing REST key / app id          → no-op (scaffold mode)
 *   • user has no OneSignal external id   → no-op (not opted in / not linked)
 *   • upstream/network error             → swallowed (never surfaces to caller)
 */
export const notifyUser = internalAction({
  args: {
    userId: v.id('users'),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, { userId, title, body, data }) => {
    const REST = process.env.ONESIGNAL_REST_API_KEY;
    const APP_ID = process.env.ONESIGNAL_APP_ID;
    if (!REST || !APP_ID) return; // scaffold mode — keys not configured

    const { externalId } = await ctx.runQuery(internal.pushes.getTarget, { userId });
    if (!externalId) return; // user not linked to OneSignal — nothing to target

    try {
      await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Key ' + REST,
        },
        body: JSON.stringify({
          app_id: APP_ID,
          target_channel: 'push',
          include_aliases: { external_id: [externalId] },
          headings: { en: title },
          contents: { en: body },
          data,
        }),
      });
    } catch {
      // Network/upstream failure — pushes are best-effort, never block the caller.
    }
  },
});

/**
 * Daily save-notification sweep (scheduled by crons.ts). Best-effort and
 * intentionally simple: scans active quitters and nudges anyone whose last
 * check-in isn't TODAY in their own timezone — the "one tap saves it" moment
 * that protects the streak. Each user is evaluated in their local day so the
 * single daily run is a reasonable approximation across zones.
 *
 * NOTE: a full table scan is fine at MVP scale. If the user base grows, add a
 * dedicated index (e.g. by lastCheckInLocalDate) and page through it instead.
 */
export const streakAtRisk = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds = await ctx.runQuery(internal.pushes.atRiskUsers, {});
    for (const userId of userIds) {
      await ctx.scheduler.runAfter(0, internal.pushes.notifyUser, {
        userId,
        title: 'Your streak is at risk',
        body: 'Your streak is at risk — one tap saves it.',
        data: { kind: 'streak_at_risk' },
      });
    }
  },
});

/**
 * Returns the ids of active quitters who have NOT checked in on their current
 * local date — i.e. their streak is exposed. Computed per-user against their
 * own timezone so the comparison is honest in every zone.
 */
export const atRiskUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query('users').collect();
    const atRisk: Array<typeof users[number]['_id']> = [];
    for (const user of users) {
      // Only people with an active quit + push linkage are eligible.
      if (!user.currentAttemptId || !user.timezone) continue;
      if (!user.oneSignalExternalId) continue;
      const today = localDateOf(now, user.timezone);
      if (user.lastCheckInLocalDate !== today) atRisk.push(user._id);
    }
    return atRisk;
  },
});
