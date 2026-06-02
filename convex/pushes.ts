import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { localDateOf, localHourOf } from './model/streak';

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

/**
 * Proactive hardest-hour nudge (I3). Active quitters whose CURRENT local hour ==
 * their onboarding hardestHour, who are push-linked, and who haven't been
 * proactively nudged yet today. "Start simple: the hardest_hour seed" (PRD I3) —
 * per-user timezone so an hourly cron lands each user at THEIR tough hour.
 */
export const proactiveDueUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query('users').collect();
    const due: Array<{ userId: typeof users[number]['_id']; hardestHour: number; localDate: string }> = [];
    for (const user of users) {
      if (!user.currentAttemptId || !user.timezone) continue;
      if (user.hardestHour == null) continue;
      if (!user.oneSignalExternalId) continue; // not push-linked → can't reach them
      if (localHourOf(now, user.timezone) !== user.hardestHour) continue;
      const today = localDateOf(now, user.timezone);
      if (user.lastProactiveNudgeLocalDate === today) continue; // once per local day
      due.push({ userId: user._id, hardestHour: user.hardestHour, localDate: today });
    }
    return due;
  },
});

/** Stamp that we proactively nudged this user today (dedup, per local day). */
export const markProactiveNudged = internalMutation({
  args: { userId: v.id('users'), localDate: v.string() },
  handler: async (ctx, { userId, localDate }) => {
    await ctx.db.patch(userId, { lastProactiveNudgeLocalDate: localDate });
  },
});

/**
 * Hourly proactive sweep (crons.ts). For each user at their hardest hour: send a
 * just-in-time "ride it out with Sage" push, stamp the dedup date, and record
 * proactive_nudge_sent. The push no-ops without OneSignal keys; the event is a
 * server-side signal (Convex log — PostHog server capture is a follow-up, same
 * gap as client PostHog delivery).
 */
export const proactiveNudgeSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ nudged: number }> => {
    const due: Array<{ userId: Id<'users'>; hardestHour: number; localDate: string }> =
      await ctx.runQuery(internal.pushes.proactiveDueUsers, {});
    for (const { userId, hardestHour, localDate } of due) {
      const h12 = hardestHour % 12 === 0 ? 12 : hardestHour % 12;
      const ampm = hardestHour < 12 ? 'am' : 'pm';
      await ctx.scheduler.runAfter(0, internal.pushes.notifyUser, {
        userId,
        title: `${h12}${ampm} is usually your tough hour`,
        body: 'Get ahead of it — 60 seconds with Sage now beats a craving later.',
        data: { kind: 'proactive', hardestHour },
      });
      await ctx.runMutation(internal.pushes.markProactiveNudged, { userId, localDate });
      // proactive_nudge_sent (I3 north-star). Server-side signal until PostHog
      // server capture is wired (needs the key).
      console.log('[ev:server] proactive_nudge_sent', JSON.stringify({ userId, hardestHour }));
    }
    return { nudged: due.length };
  },
});
