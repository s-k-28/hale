import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { quitStage } from './model/cohort';
import { pairGate, pairKeyFor as pairKeyForIds } from './model/buddy';
import { completeReferralForPair } from './referrals';

/**
 * Buddies (S1/S2) — the social wedge. One symmetric buddyLink per pair,
 * keyed by a deterministic pairKey so invite/accept can't create duplicates
 * regardless of who taps first (Decision 1: symmetric-safe pairing).
 *
 * Flow: A taps "Invite" → invite() returns A's userId → app builds a deep link
 * hale://u/<A._id> → B opens it → pairWith({ inviterId: A._id }). track() fires
 * client-side (BUDDY_INVITED / BUDDY_PAIRED), so these handlers stay pure data.
 */

/** Deterministic key for an unordered pair — pure impl lives in model/buddy.ts. */
function pairKeyFor(a: Id<'users'>, b: Id<'users'>): string {
  return pairKeyForIds(a, b);
}

/** The buddy's id given a link and the viewer — the "other" side of the pair. */
function otherSide(link: Doc<'buddyLinks'>, me: Id<'users'>): Id<'users'> {
  return link.userA === me ? link.userB : link.userA;
}

/**
 * Expire a user's leftover 'waiting' matchmaking rows. Called when they pair
 * (any path): a waiting row that outlives its pairing would silently re-enter
 * them into the pool the moment they unpair — months later, with a stale
 * stageBucket, and without fresh consent.
 */
async function expireWaitingMatchRequests(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  const rows = await ctx.db
    .query('matchRequests')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  for (const r of rows) {
    if (r.status === 'waiting') await ctx.db.patch(r._id, { status: 'expired' });
  }
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
  args: {
    inviterId: v.id('users'),
    // HOW this pair formed — defaults to a squad/deep-link invite. The accepter
    // calls this, so the INVITER (inviterId) is the graph initiator (K-factor).
    pairingMethod: v.optional(
      v.union(v.literal('invite_onboard'), v.literal('invite_squad'), v.literal('matchmaking')),
    ),
  },
  handler: async (ctx, { inviterId, pairingMethod }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (inviterId === userId) throw new Error('Cannot pair with yourself');

    // Validate the inviter exists before we wire anything up.
    const inviter = await ctx.db.get(inviterId);
    if (!inviter) throw new Error('Inviter not found');

    const method = pairingMethod ?? 'invite_squad';
    const now = Date.now();
    const pairKey = pairKeyFor(userId, inviterId);
    const [userA, userB] = [userId, inviterId].sort() as [Id<'users'>, Id<'users'>];

    // ONE active buddy at a time, on BOTH sides (model/buddy.ts). Same-pair
    // re-calls fall through to the idempotent alreadyPaired branch below; a
    // rejected pair throws BEFORE any write, so referral completion only ever
    // runs for pairings that actually happened (the row stays 'attributed').
    const callerActive = await findActiveLink(ctx, userId);
    const inviterActive = await findActiveLink(ctx, inviterId);
    const gate = pairGate(
      callerActive?.pairKey ?? null,
      inviterActive?.pairKey ?? null,
      pairKey,
    );
    if (gate === 'caller_already_paired') {
      throw new Error('You already have a buddy — unpair first to switch.');
    }
    if (gate === 'inviter_already_paired') {
      throw new Error('They already have a buddy right now.');
    }

    const existing = await ctx.db
      .query('buddyLinks')
      .withIndex('by_pair', (q) => q.eq('pairKey', pairKey))
      .unique();

    let linkId: Id<'buddyLinks'>;
    let alreadyPaired: boolean;
    if (existing) {
      if (existing.status !== 'active') {
        // Re-pair after an 'ended' link — stamp a fresh WHEN/HOW/WHO for the new edge.
        await ctx.db.patch(existing._id, {
          status: 'active',
          pairedAt: now,
          pairingMethod: method,
          initiatorId: inviterId,
        });
      }
      linkId = existing._id;
      alreadyPaired = existing.status === 'active';
    } else {
      linkId = await ctx.db.insert('buddyLinks', {
        pairKey,
        userA,
        userB,
        status: 'active',
        sharedStreak: 0,
        pairedAt: now,
        pairingMethod: method,
        initiatorId: inviterId,
      });
      alreadyPaired = false;
    }

    // Referral completion (the SECOND half of the trigger): if the caller (the one
    // who opened the link) was attributed to this inviter at install, mark the
    // referral completed and grant the inviter's 7-day reward if it tips them to 3.
    // No-op for normal (non-referral) pairings. The invitee's client uses these
    // flags to fire the referral funnel events, tagged with the referrer's id.
    // Both sides just paired — their waiting matchmaking rows are now stale.
    await expireWaitingMatchRequests(ctx, userId);
    await expireWaitingMatchRequests(ctx, inviterId);

    // Referral completion (decision 2026-06-10): decoupled from WHO they paired
    // with. An attributed invitee's referral completes on their first successful
    // pairing with ANYONE — under one-buddy-at-a-time, requiring the referrer
    // specifically would dead-end every referral after the referrer's first pair.
    // Each side settles their own pending referral with their own referrer.
    const me = await ctx.db.get(userId);
    const referral = me?.referredBy
      ? await completeReferralForPair(ctx, me.referredBy, userId)
      : { referralCompleted: false, referrerReachedGoal: false, rewardGranted: false };
    if (inviter.referredBy) {
      // The inviter may themselves be someone's attributed invitee making their
      // first pair; their referrer's progress updates server-side (no client event).
      await completeReferralForPair(ctx, inviter.referredBy, inviterId);
    }

    return { linkId, alreadyPaired, referrerId: me?.referredBy ?? null, ...referral };
  },
});

/**
 * End the caller's active buddy link. The missing half of the one-buddy model:
 * pairWith rejects a second concurrent buddy, so switching buddies (and a
 * referrer accepting their next referral pair) requires ending the current one.
 * pairWith's reactivation branch already handles re-pairing an 'ended' link.
 *
 * Referral semantics (design spec Decision #4): completed referrals STAY
 * counted and a granted 7-day reward runs its full window — no clawback. That
 * holds with zero code here: completion lives on the referrals row and the
 * reward on the user doc; ending the buddyLink touches neither.
 */
export const unpair = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const link = await findActiveLink(ctx, userId);
    if (!link) return { ended: false as const };
    await ctx.db.patch(link._id, { status: 'ended', endedAt: Date.now() });
    return { ended: true as const, linkId: link._id };
  },
});

/**
 * Matchmaking pool (P1). A solo onboarding user with no one to invite gets paired
 * with another WAITING quitter matched on product type + quit-stage + timezone.
 * If a waiting peer exists → pair immediately (pairingMethod 'matchmaking', both
 * matchRequests marked matched); else this user joins the pool as 'waiting' and we
 * return no-match (caller falls back to the solo bridge). Returns the outcome +
 * pool size so the client can fire matchmaking_matched / matchmaking_no_match.
 */
export const requestMatch = mutation({
  args: {},
  handler: async (ctx, _args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Already paired (e.g. redeemed an invite) → nothing to do.
    const active = await findActiveLink(ctx, userId);
    if (active) return { matched: true, alreadyPaired: true as const };

    const user = await ctx.db.get(userId);
    if (!user?.currentAttemptId || !user.timezone || !user.productType) {
      return { matched: false as const, poolSize: 0, reason: 'profile_incomplete' as const };
    }
    const attempt = await ctx.db.get(user.currentAttemptId);
    const stageBucket = quitStage(attempt?.startDate ?? Date.now(), Date.now());
    const productType = user.productType;
    const timezone = user.timezone;

    // Look for a waiting peer in the same bucket (excluding self + anyone now paired).
    const waiting = await ctx.db
      .query('matchRequests')
      .withIndex('by_status_match', (q) =>
        q
          .eq('status', 'waiting')
          .eq('productType', productType)
          .eq('stageBucket', stageBucket)
          .eq('timezone', timezone),
      )
      .collect();
    const poolSize = waiting.filter((r) => r.userId !== userId).length;

    for (const peer of waiting) {
      if (peer.userId === userId) continue;
      // Dangling row — peer's user doc is gone (dev reset / future account deletion).
      const peerDoc = await ctx.db.get(peer.userId);
      if (!peerDoc) {
        await ctx.db.patch(peer._id, { status: 'expired' });
        continue;
      }
      const peerActive = await findActiveLink(ctx, peer.userId);
      if (peerActive) continue; // stale waiting row — peer already paired elsewhere

      // Pair them (matchmaking path). Mirror pairWith's symmetric insert.
      const now = Date.now();
      const pairKey = pairKeyFor(userId, peer.userId);
      const [uA, uB] = [userId, peer.userId].sort() as [Id<'users'>, Id<'users'>];
      const existing = await ctx.db
        .query('buddyLinks')
        .withIndex('by_pair', (q) => q.eq('pairKey', pairKey))
        .unique();
      const linkId =
        existing?._id ??
        (await ctx.db.insert('buddyLinks', {
          pairKey,
          userA: uA,
          userB: uB,
          status: 'active',
          sharedStreak: 0,
          pairedAt: now,
          pairingMethod: 'matchmaking',
          initiatorId: userId,
        }));
      if (existing && existing.status !== 'active') {
        await ctx.db.patch(existing._id, {
          status: 'active',
          pairedAt: now,
          pairingMethod: 'matchmaking',
          initiatorId: userId,
        });
      }
      // Expire both sides' other waiting rows FIRST, then stamp the winning row
      // matched (order matters: the expire helper would overwrite it otherwise).
      await expireWaitingMatchRequests(ctx, peer.userId);
      await expireWaitingMatchRequests(ctx, userId);
      await ctx.db.patch(peer._id, { status: 'matched', matchedLinkId: linkId });
      // Record the requester's own (resolved) request for pool audit.
      await ctx.db.insert('matchRequests', {
        userId,
        productType,
        stageBucket,
        timezone,
        status: 'matched',
        matchedLinkId: linkId,
        createdAt: now,
      });

      // A matchmade pair is a real activation — settle each side's pending
      // referral with their own referrer (same any-pair rule as pairWith).
      const referral = user.referredBy
        ? await completeReferralForPair(ctx, user.referredBy, userId)
        : { referralCompleted: false, referrerReachedGoal: false, rewardGranted: false };
      if (peerDoc.referredBy) {
        await completeReferralForPair(ctx, peerDoc.referredBy, peer.userId);
      }

      return {
        matched: true as const,
        alreadyPaired: false as const,
        linkId,
        buddyUserId: peer.userId,
        poolSize,
        referrerId: user.referredBy ?? null,
        ...referral,
      };
    }

    // No peer → join the pool as waiting; caller shows the solo bridge.
    // Reuse an existing waiting row (refresh its bucket/timestamp) instead of
    // inserting a duplicate — duplicates inflate poolSize and linger forever.
    const myWaiting = await ctx.db
      .query('matchRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const reusable = myWaiting.find((r) => r.status === 'waiting');
    if (reusable) {
      await ctx.db.patch(reusable._id, { productType, stageBucket, timezone, createdAt: Date.now() });
    } else {
      await ctx.db.insert('matchRequests', {
        userId,
        productType,
        stageBucket,
        timezone,
        status: 'waiting',
        createdAt: Date.now(),
      });
    }
    return { matched: false as const, poolSize, stageBucket };
  },
});
