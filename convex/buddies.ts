import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

/**
 * Buddies (S1/S2) — the social wedge. One symmetric buddyLink per pair,
 * keyed by a deterministic pairKey so invite/accept can't create duplicates
 * regardless of who taps first (Decision 1: symmetric-safe pairing).
 *
 * Flow: A taps "Invite" → invite() returns A's userId → app builds a deep link
 * hale://u/<A._id> → B opens it → pairWith({ inviterId: A._id }). track() fires
 * client-side (BUDDY_INVITED / BUDDY_PAIRED), so these handlers stay pure data.
 */

/** Deterministic key for an unordered pair: sorted ids joined with "_". */
function pairKeyFor(a: Id<'users'>, b: Id<'users'>): string {
  return [a, b].sort().join('_');
}

/** The buddy's id given a link and the viewer — the "other" side of the pair. */
function otherSide(link: Doc<'buddyLinks'>, me: Id<'users'>): Id<'users'> {
  return link.userA === me ? link.userB : link.userA;
}

/** Find the viewer's active buddyLink, checking both sides of the pair. */
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
 * The authed user's active buddy, if any (S2). Returns the link plus a
 * SANITIZED slice of the buddy's profile (name + streak + last check-in date) —
 * never their full user doc, cravings, or money figures (privacy).
 */
export const myBuddy = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const link = await findActiveLink(ctx, userId);
    if (!link) return null;

    const buddy = await ctx.db.get(otherSide(link, userId));
    if (!buddy) return null;

    return {
      link,
      buddy: {
        name: buddy.name ?? null,
        currentStreak: buddy.currentStreak ?? 0,
        lastCheckInLocalDate: buddy.lastCheckInLocalDate ?? null,
      },
    };
  },
});

/**
 * Start an invite (S1). Returns the authed user's own _id so the app can build
 * a deep link (hale://u/<id>). No row is written here — the link materializes
 * only when the other person accepts via pairWith. track(BUDDY_INVITED) is
 * fired client-side.
 */
export const invite = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    return { userId };
  },
});

/**
 * Accept an invite (S2). Idempotent + symmetric: computes the deterministic
 * pairKey, reactivates an existing link if one exists (re-pair after an
 * 'ended' link, or a no-op if already active), else inserts a fresh active
 * link. Self-pairing is rejected. track(BUDDY_PAIRED) is fired client-side.
 */
export const pairWith = mutation({
  args: { inviterId: v.id('users') },
  handler: async (ctx, { inviterId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (inviterId === userId) throw new Error('Cannot pair with yourself');

    // Validate the inviter exists before we wire anything up.
    const inviter = await ctx.db.get(inviterId);
    if (!inviter) throw new Error('Inviter not found');

    const pairKey = pairKeyFor(userId, inviterId);
    const [userA, userB] = [userId, inviterId].sort() as [Id<'users'>, Id<'users'>];

    const existing = await ctx.db
      .query('buddyLinks')
      .withIndex('by_pair', (q) => q.eq('pairKey', pairKey))
      .unique();

    if (existing) {
      if (existing.status !== 'active') {
        await ctx.db.patch(existing._id, { status: 'active' });
      }
      return { linkId: existing._id, alreadyPaired: existing.status === 'active' };
    }

    const linkId = await ctx.db.insert('buddyLinks', {
      pairKey,
      userA,
      userB,
      status: 'active',
      sharedStreak: 0,
    });
    return { linkId, alreadyPaired: false };
  },
});
