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
