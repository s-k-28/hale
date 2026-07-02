import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import {
  REFERRALS_REQUIRED,
  REFERRAL_ACTIVATION_STREAK,
  rewardEndsFrom,
  referralRewardStatus,
} from './model/entitlement';

/**
 * Referral reward loop — earn 7 days of HALE+ by inviting buddies.
 *
 * The reward is deliberately tied to HALE's accountability core: a referral only
 * counts when an invited person INSTALLS via the link AND PAIRS UP as someone's
 * buddy. Install is the attribution step; the invitee's first successful pairing
 * (with the referrer, a matchmade peer, or anyone else) is the completion step.
 * Install alone never counts — this is far less gameable than raw installs and
 * makes the reward reinforce the buddy loop. Completion was decoupled from
 * pairing with the REFERRER specifically (decision 2026-06-10): under the
 * one-active-buddy rule, requiring the referrer would permanently block every
 * referral after the referrer's first pair. At 3 completed referrals the referrer
 * unlocks a one-time 7-day HALE+ window (app-managed in Convex, OR'd into the
 * single hasHALEPlus check by model/entitlement.ts; no auto-charge).
 *
 * The link itself is the existing buddy deep link hale://u/<referrerId>; the
 * human-friendly hale://r/<code> alias resolves to the same referrer. Attribution
 * (attributeInstall) runs at onboarding commit; completion runs inside
 * buddies.pairWith / requestMatch via completeReferralForPair (below).
 */

/** Unambiguous code alphabet (no 0/O/1/I) — mirrors squads' invite codes. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** A referral code not currently assigned to any user (bounded retries). */
async function uniqueReferralCode(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const clash = await ctx.db
      .query('users')
      .withIndex('by_referralCode', (q) => q.eq('referralCode', code))
      .first();
    if (!clash) return code;
  }
  return randomCode(8); // widen the space rather than loop forever
}

/**
 * Complete (inviteeId)'s referral for the referrer they were attributed to,
 * triggered by the invitee's first successful pairing with ANYONE, and grant
 * the 7-day reward if this tips the referrer to 3. Called from buddies.pairWith
 * and buddies.requestMatch with referrerId = invitee.referredBy. Idempotent: a
 * re-pair of an already-completed referral is a no-op and reports
 * referralCompleted=false. Grants the reward at most once
 * (referralRewardGrantedAt guard). Returns flags the invitee's client uses to
 * fire the funnel events (tagged with referrer_id).
 */
export async function completeReferralForPair(
  ctx: MutationCtx,
  referrerId: Id<'users'>,
  inviteeId: Id<'users'>,
): Promise<{ referralCompleted: boolean; referrerReachedGoal: boolean; rewardGranted: boolean }> {
  const none = { referralCompleted: false, referrerReachedGoal: false, rewardGranted: false };
  if (referrerId === inviteeId) return none;

  const invitee = await ctx.db.get(inviteeId);
  // Completion only applies to a genuine referral edge: the invitee must have been
  // attributed to THIS referrer at install. Otherwise it's just a normal pairing.
  if (!invitee || invitee.referredBy !== referrerId) return none;

  const now = Date.now();
  const row = await ctx.db
    .query('referrals')
    .withIndex('by_pair', (q) => q.eq('referrerId', referrerId).eq('inviteeId', inviteeId))
    .unique();

  // Record the PAIRING (pairedAt) — but the referral only COUNTS once the invitee
  // is activated (see inviteeActivated). This is the anti-farm gate: pairing is
  // trivial to fake with throwaway accounts, a multi-day streak is not. If the
  // invitee isn't activated yet, we leave the row pending and it completes later
  // via completeReferralOnActivation (from the check-in that tips their streak).
  const activated = inviteeActivated(invitee);
  const alreadyCompleted = row?.status === 'completed';
  if (row) {
    if (!alreadyCompleted) {
      await ctx.db.patch(row._id, {
        pairedAt: row.pairedAt ?? now,
        ...(activated ? { status: 'completed' as const, countedAt: now } : {}),
      });
    }
  } else {
    // Defensive: attribution row missing (shouldn't happen) — record it, paired.
    await ctx.db.insert('referrals', {
      referrerId,
      inviteeId,
      code: '',
      installedAt: now,
      pairedAt: now,
      status: activated ? ('completed' as const) : ('attributed' as const),
      ...(activated ? { countedAt: now } : {}),
    });
  }

  if (!activated || alreadyCompleted) {
    return { referralCompleted: false, referrerReachedGoal: false, rewardGranted: false };
  }
  const { referrerReachedGoal, rewardGranted } = await countAndMaybeReward(ctx, referrerId);
  return { referralCompleted: true, referrerReachedGoal, rewardGranted };
}

/**
 * Second completion trigger (the anti-farm counterpart to pairing): called from
 * the daily check-in when the invitee's streak advances. If the invitee was
 * referred, has already PAIRED, and has now reached the activation streak, the
 * (previously deferred) referral completes and the referrer is rewarded.
 * Idempotent + a no-op unless all three hold.
 */
export async function completeReferralOnActivation(
  ctx: MutationCtx,
  inviteeId: Id<'users'>,
): Promise<void> {
  const invitee = await ctx.db.get(inviteeId);
  if (!invitee || !invitee.referredBy || !inviteeActivated(invitee)) return;
  const referrerId = invitee.referredBy;
  const row = await ctx.db
    .query('referrals')
    .withIndex('by_pair', (q) => q.eq('referrerId', referrerId).eq('inviteeId', inviteeId))
    .unique();
  // Must have paired first (pairedAt set) and not already counted.
  if (!row || row.status === 'completed' || row.pairedAt == null) return;
  await ctx.db.patch(row._id, { status: 'completed', countedAt: Date.now() });
  await countAndMaybeReward(ctx, referrerId);
}

/** The anti-farm gate: an invitee "counts" only after real engagement — a clean
 *  streak a disposable account can't instantly manufacture. */
function inviteeActivated(invitee: Doc<'users'> | null): boolean {
  return !!invitee && (invitee.currentStreak ?? 0) >= REFERRAL_ACTIVATION_STREAK;
}

/**
 * Count a referrer's COMPLETED referrals and, if it tips them to REFERRALS_REQUIRED,
 * grant the one-time 7-day HALE+ window (guarded by referralRewardGrantedAt).
 * Shared by both completion triggers (pairing-when-already-active, and activation).
 */
async function countAndMaybeReward(
  ctx: MutationCtx,
  referrerId: Id<'users'>,
): Promise<{ referrerReachedGoal: boolean; rewardGranted: boolean }> {
  const completed = await ctx.db
    .query('referrals')
    .withIndex('by_referrer', (q) => q.eq('referrerId', referrerId))
    .filter((q) => q.eq(q.field('status'), 'completed'))
    .collect();
  const referrerReachedGoal = completed.length >= REFERRALS_REQUIRED;

  let rewardGranted = false;
  const referrer = await ctx.db.get(referrerId);
  if (referrerReachedGoal && referrer && referrer.referralRewardGrantedAt == null) {
    const now = Date.now();
    await ctx.db.patch(referrerId, {
      referralRewardGrantedAt: now,
      referralRewardEndsAt: rewardEndsFrom(now),
    });
    rewardGranted = true;
  }
  return { referrerReachedGoal, rewardGranted };
}

/** Idempotently materialize + return the authed user's own referral code. */
export const getOrCreateMyCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('No user');
    let code = user.referralCode;
    if (!code) {
      code = await uniqueReferralCode(ctx);
      await ctx.db.patch(userId, { referralCode: code });
    }
    return { code, userId };
  },
});

/** Resolve a friendly hale://r/<code> to its referrer userId (for deep links). */
export const resolveCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const norm = code.trim().toUpperCase();
    if (!norm) return null;
    const user = await ctx.db
      .query('users')
      .withIndex('by_referralCode', (q) => q.eq('referralCode', norm))
      .first();
    return user ? { userId: user._id } : null;
  },
});

/**
 * Install-time attribution (the FIRST half of the trigger). Called at onboarding
 * commit when the invitee arrived via a referral link. Sets referredBy exactly
 * once (self-referral blocked), and records an 'attributed' referral row. The
 * SECOND half (pairing) is completed by completeReferralForPair inside pairWith.
 */
export const attributeInstall = mutation({
  args: { referrerId: v.id('users') },
  handler: async (ctx, { referrerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    if (referrerId === userId) return { attributed: false as const, reason: 'self' as const };

    const me = await ctx.db.get(userId);
    if (!me) return { attributed: false as const, reason: 'no_user' as const };
    if (me.referredBy) return { attributed: false as const, reason: 'already' as const };

    const referrer = await ctx.db.get(referrerId);
    if (!referrer) return { attributed: false as const, reason: 'no_referrer' as const };

    const now = Date.now();
    await ctx.db.patch(userId, { referredBy: referrerId });

    const existing = await ctx.db
      .query('referrals')
      .withIndex('by_pair', (q) => q.eq('referrerId', referrerId).eq('inviteeId', userId))
      .unique();
    if (!existing) {
      await ctx.db.insert('referrals', {
        referrerId,
        inviteeId: userId,
        code: referrer.referralCode ?? '',
        installedAt: now,
        status: 'attributed',
      });
    }
    return { attributed: true as const, referrerId };
  },
});

/**
 * Reactive referral progress for the invite UI: "2 of 3 friends joined & paired",
 * reward window status, and a sanitized invitee list (name + status only).
 */
export const myProgress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const now = Date.now();

    const rows = await ctx.db
      .query('referrals')
      .withIndex('by_referrer', (q) => q.eq('referrerId', userId))
      .collect();
    const completedCount = rows.filter((r) => r.status === 'completed').length;
    const reward = referralRewardStatus(now, user.referralRewardEndsAt);

    const ordered = [...rows].sort((a, b) => b.installedAt - a.installedAt).slice(0, 20);
    const invitees = await Promise.all(
      ordered.map(async (r) => {
        const inv = await ctx.db.get(r.inviteeId);
        return { name: inv?.name ?? null, status: r.status, pairedAt: r.pairedAt ?? null };
      }),
    );

    return {
      code: user.referralCode ?? null,
      completedCount,
      target: REFERRALS_REQUIRED,
      rewardActive: reward.active,
      rewardDaysRemaining: reward.daysRemaining,
      rewardGranted: user.referralRewardGrantedAt != null,
      invitees,
    };
  },
});
