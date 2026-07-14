import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

/**
 * Feed (S5 — relapse rally). feedEvents carry a TYPED scope (buddy | squad) and
 * a SANITIZED payload — never raw craving/relapse detail (privacy, enforced at
 * every write site, e.g. relapse.ts). This module is the read side for the
 * buddy scope plus the "send strength" rally response.
 *
 * buddyFeed (query)      — recent sanitized events in the viewer's buddy scope.
 * sendStrength (mutation)— the rally tap: writes a 'rally' nudge + a push.
 */

/**
 * Find the authed user's ACTIVE buddyLink, checking both sides of the pair
 * (mirrors buddies.ts / nudges.ts: by_userA then by_userB). Returns null when
 * the viewer has no active buddy.
 */
async function findActiveLink(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<Doc<'buddyLinks'> | null> {
  const asA = await ctx.db
    .query('buddyLinks')
    .withIndex('by_userA', (q) => q.eq('userA', userId))
    .filter((q) => q.eq(q.field('status'), 'active'))
    .first();
  if (asA) return asA;
  return await ctx.db
    .query('buddyLinks')
    .withIndex('by_userB', (q) => q.eq('userB', userId))
    .filter((q) => q.eq(q.field('status'), 'active'))
    .first();
}

/**
 * Recent events in the viewer's buddy scope (S5). The scopeId is the buddyLink
 * _id (stringified at write time), so both members read the same shared feed.
 * Events are already SANITIZED at the write site (payload carries no craving /
 * relapse detail) — we surface only the typed signal + timestamp + whether the
 * viewer was the actor, never the buddy's private user doc. Newest first,
 * capped. Degrades to [] when unauthenticated or unpaired.
 */
export const buddyFeed = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const link = await findActiveLink(ctx, userId);
    if (!link) return [];

    const events = await ctx.db
      .query('feedEvents')
      .withIndex('by_scope_ts', (q) =>
        q.eq('scopeType', 'buddy').eq('scopeId', String(link._id)),
      )
      .order('desc')
      .take(30);

    // Return a sanitized projection — type + ts + viewer-relative actor flag.
    // We never leak the buddy's user doc or any payload detail beyond what was
    // already sanitized at the write site.
    return events.map((e) => ({
      _id: e._id,
      type: e.type,
      ts: e.ts,
      payload: e.payload, // already sanitized at write time
      isMine: e.actorId === userId,
    }));
  },
});

/**
 * Send strength (S5) — the rally response to a buddy's tough moment. Writes a
 * 'rally' nudge (the in-app inbox entry) then schedules a friend-sourced push so
 * the recipient feels it even outside the app. fromUser is always the authed
 * caller. Out-of-app delivery degrades to a no-op when push keys / linkage are
 * missing (see pushes.notifyUser).
 */
export const sendStrength = mutation({
  args: {
    toUser: v.id('users'),
  },
  handler: async (ctx, { toUser }) => {
    const fromUser = await getAuthUserId(ctx);
    if (!fromUser) throw new Error('Not authenticated');

    // Only the caller's ACTIVE buddy can be the recipient — prevents an
    // authenticated client from rallying/push-spamming arbitrary users.
    const link = await findActiveLink(ctx, fromUser);
    const buddyId = link ? (link.userA === fromUser ? link.userB : link.userA) : null;
    if (!buddyId || buddyId !== toUser) return { sent: false };

    await ctx.db.insert('nudges', {
      fromUser,
      toUser,
      type: 'rally',
      ts: Date.now(),
    });

    const sender = await ctx.db.get(fromUser);
    const who = sender?.name?.trim() ? sender.name.trim() : 'Your buddy';

    await ctx.scheduler.runAfter(0, internal.pushes.notifyUser, {
      userId: toUser,
      title: `${who} is rallying with you`,
      body: `You're not alone in this. I'm right here with you. Let's go.`,
      data: { kind: 'rally', fromUser },
    });

    return { sent: true };
  },
});
