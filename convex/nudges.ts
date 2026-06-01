import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

/**
 * Nudges (S3) — the buddy tap. A nudge is a tiny, friend-sourced push: one
 * person taps "cheer / support / rally" and the other gets a notification that
 * reads as FROM their buddy (warmth, not a system alert). The row is the
 * in-app inbox; the scheduled push is the out-of-app reach.
 *
 * send (mutation)   — writes the nudge, then schedules the push.
 * myNudges (query)  — the recipient's recent UNREAD inbox.
 * markRead (mutation) — clears one nudge once seen.
 */

type NudgeType = 'cheer' | 'support' | 'rally';

/**
 * Friend-sourced push copy. Phrased as if it's coming straight from the buddy
 * (first person / direct address) — never "HALE says…". Falls back to a generic
 * "Your buddy" when we don't have a name to interpolate.
 */
function nudgeCopy(type: NudgeType, fromName: string | null): { title: string; body: string } {
  const who = fromName?.trim() ? fromName.trim() : 'Your buddy';
  switch (type) {
    case 'cheer':
      return { title: `${who} is cheering you on`, body: `Proud of you. Keep it going! 🎉` };
    case 'support':
      return { title: `${who} has your back`, body: `Thinking of you today — you've got this. 💪` };
    case 'rally':
      return { title: `${who} is rallying with you`, body: `Tough moment? I'm right here with you. Let's go.` };
  }
}

/**
 * Send a nudge to another user. fromUser is always the authed caller; we write
 * the nudge row (the inbox entry) then schedule a friend-sourced push so the
 * recipient feels it even outside the app. Out-of-app delivery degrades to a
 * no-op when push keys / linkage are missing (see pushes.notifyUser).
 */
export const send = mutation({
  args: {
    toUser: v.id('users'),
    type: v.union(v.literal('cheer'), v.literal('support'), v.literal('rally')),
  },
  handler: async (ctx, { toUser, type }) => {
    const fromUser = await getAuthUserId(ctx);
    if (!fromUser) throw new Error('Not authenticated');

    await ctx.db.insert('nudges', { fromUser, toUser, type, ts: Date.now() });

    const sender = await ctx.db.get(fromUser);
    const { title, body } = nudgeCopy(type, sender?.name ?? null);

    await ctx.scheduler.runAfter(0, internal.pushes.notifyUser, {
      userId: toUser,
      title,
      body,
      data: { kind: 'nudge', type, fromUser },
    });

    return { sent: true };
  },
});

/**
 * The authed user's recent UNREAD nudges (their inbox). Newest first, capped —
 * this drives the in-app "your buddy nudged you" badge/list.
 */
export const myNudges = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query('nudges')
      .withIndex('by_to', (q) => q.eq('toUser', userId))
      .order('desc')
      .filter((q) => q.eq(q.field('readAt'), undefined))
      .take(20);
  },
});

/**
 * Cheer your buddy (S2) — the one-tap "Send support" from the Squad screen.
 * Resolves the authed user's ACTIVE buddyLink (mirrors buddies.ts: by_userA
 * then by_userB), derives the OTHER side as the recipient, writes the nudge
 * row, then schedules a friend-sourced push. If there's no active buddy we
 * degrade to { sent: false } rather than throwing, so the optimistic Squad UI
 * never breaks on a fire-and-forget call.
 */
export const cheer = mutation({
  args: {
    type: v.union(v.literal('cheer'), v.literal('support')),
  },
  handler: async (ctx, { type }) => {
    const fromUser = await getAuthUserId(ctx);
    if (!fromUser) throw new Error('Not authenticated');

    const asA = await ctx.db
      .query('buddyLinks')
      .withIndex('by_userA', (q) => q.eq('userA', fromUser))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    const link =
      asA ??
      (await ctx.db
        .query('buddyLinks')
        .withIndex('by_userB', (q) => q.eq('userB', fromUser))
        .filter((q) => q.eq(q.field('status'), 'active'))
        .first());

    if (!link) return { sent: false };

    const toUser = link.userA === fromUser ? link.userB : link.userA;

    await ctx.db.insert('nudges', { fromUser, toUser, type, ts: Date.now() });

    await ctx.scheduler.runAfter(0, internal.pushes.notifyUser, {
      userId: toUser,
      title: 'Your buddy is cheering you on 💪',
      body: 'Keep your streak going — they’re counting on you.',
    });

    return { sent: true };
  },
});

/**
 * Mark one nudge read (clears it from the unread inbox). Scoped to the
 * recipient so a caller can only dismiss nudges addressed to them.
 */
export const markRead = mutation({
  args: { nudgeId: v.id('nudges') },
  handler: async (ctx, { nudgeId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const nudge = await ctx.db.get(nudgeId);
    if (!nudge || nudge.toUser !== (userId as Id<'users'>)) return { ok: false };
    if (!nudge.readAt) await ctx.db.patch(nudgeId, { readAt: Date.now() });
    return { ok: true };
  },
});
