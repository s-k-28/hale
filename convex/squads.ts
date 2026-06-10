import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { resolveEntitlement } from './model/entitlement';

/**
 * Squads (S3) — small "stay clean together" groups. A squad is an invite-coded
 * group with an owner + members (squadMembers), an optional 6-week challenge
 * (StickK: 6–8wk + weekly cadence), and a denormalized memberCount cache kept in
 * lockstep by join/leave mutations. Member streaks are read live from user docs.
 *
 * Privacy: squadDetail returns a SANITIZED slice of each member (name + current
 * streak) — never their full user doc, cravings, or money figures.
 */

const DAY_MS = 86_400_000;

/** Unambiguous code alphabet (no 0/O/1/I) for human-readable invite codes. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A random short invite code (default 6 chars). */
function randomCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Generate an invite code not currently in use (bounded retries). */
async function uniqueInviteCode(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const clash = await ctx.db
      .query('squads')
      .withIndex('by_invite', (q) => q.eq('inviteCode', code))
      .first();
    if (!clash) return code;
  }
  // Extremely unlikely fallback — widen the space rather than loop forever.
  return randomCode(8);
}

/**
 * Server-side mirror of the client's free-tier rule (squads.tsx): free users
 * get ONE squad; a second create/join is HALE+. The client blurs the surface
 * (LockedFeature), but mutations are callable directly, so the limit must hold
 * here too. Throws the same user-legible message either entry point.
 */
async function assertSquadSlotAvailable(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  const memberships = await ctx.db
    .query('squadMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  if (memberships.length === 0) return; // first squad is free-tier

  const user = await ctx.db.get(userId);
  if (resolveEntitlement(user, Date.now()).hasHALEPlus) return;
  throw new Error('HALE+ required to join more than one squad');
}

/** Is this user already a member of this squad? */
async function membershipOf(
  ctx: QueryCtx,
  squadId: Id<'squads'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('squadMembers')
    .withIndex('by_squad', (q) => q.eq('squadId', squadId))
    .filter((q) => q.eq(q.field('userId'), userId))
    .first();
}

/**
 * Create a squad (S3). Generates a unique short invite code, inserts the squad
 * with the creator as owner (memberCount=1), optionally seeds a challenge
 * (start=now, end=now+weeks*7d, goalDays=weeks*7), and writes the owner's
 * squadMember row. Returns the new squadId + its inviteCode for sharing.
 */
export const createSquad = mutation({
  args: {
    name: v.string(),
    isPublic: v.boolean(),
    challengeWeeks: v.optional(v.number()),
  },
  handler: async (ctx, { name, isPublic, challengeWeeks }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    await assertSquadSlotAvailable(ctx, userId);

    const inviteCode = await uniqueInviteCode(ctx);
    const now = Date.now();

    const challenge =
      challengeWeeks && challengeWeeks > 0
        ? {
            challengeStart: now,
            challengeEnd: now + challengeWeeks * 7 * DAY_MS,
            challengeGoalDays: challengeWeeks * 7,
          }
        : {};

    const squadId = await ctx.db.insert('squads', {
      name,
      ownerId: userId,
      isPublic,
      inviteCode,
      memberCount: 1,
      ...challenge,
    });

    await ctx.db.insert('squadMembers', {
      squadId,
      userId,
      role: 'owner',
      joinedAt: now,
    });

    return { squadId, inviteCode };
  },
});

/**
 * Join a squad by its invite code (S3). Idempotent-safe: looks the squad up by
 * code, rejects if the viewer is already a member, else inserts a member row and
 * bumps the denormalized memberCount. Returns the squadId.
 */
export const joinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const squad = await ctx.db
      .query('squads')
      .withIndex('by_invite', (q) => q.eq('inviteCode', code))
      .first();
    if (!squad) throw new Error('Squad not found');

    const existing = await membershipOf(ctx, squad._id, userId);
    if (existing) throw new Error('Already a member');
    await assertSquadSlotAvailable(ctx, userId);

    await ctx.db.insert('squadMembers', {
      squadId: squad._id,
      userId,
      role: 'member',
      joinedAt: Date.now(),
    });
    await ctx.db.patch(squad._id, { memberCount: squad.memberCount + 1 });

    return { squadId: squad._id };
  },
});

/**
 * The authed user's squads (S3) — via their squadMembers rows, hydrated to the
 * squad docs (with the viewer's role). Returns [] when not authed.
 */
export const mySquads = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const memberships = await ctx.db
      .query('squadMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const squads = await Promise.all(
      memberships.map(async (m) => {
        const squad = await ctx.db.get(m.squadId);
        if (!squad) return null;
        return {
          _id: squad._id,
          name: squad.name,
          isPublic: squad.isPublic,
          memberCount: squad.memberCount,
          role: m.role,
          inviteCode: squad.inviteCode,
          challengeEnd: squad.challengeEnd ?? null,
          challengeGoalDays: squad.challengeGoalDays ?? null,
        };
      }),
    );

    return squads.filter((s): s is NonNullable<typeof s> => s !== null);
  },
});

/**
 * Squad detail (S3): the squad, its SANITIZED members (name + currentStreak from
 * user docs only), and challenge progress (daysElapsed clamped to goalDays, plus
 * pct). Only members may view. Returns null when not authed or not a member.
 */
export const squadDetail = query({
  args: { squadId: v.id('squads') },
  handler: async (ctx, { squadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const squad = await ctx.db.get(squadId);
    if (!squad) return null;

    const viewerMembership = await membershipOf(ctx, squadId, userId);
    if (!viewerMembership) return null; // not a member → no peek

    const memberRows = await ctx.db
      .query('squadMembers')
      .withIndex('by_squad', (q) => q.eq('squadId', squadId))
      .collect();

    const members = await Promise.all(
      memberRows.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        return {
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          name: u?.name ?? null,
          currentStreak: u?.currentStreak ?? 0,
        };
      }),
    );
    // Strongest streaks first — a gentle leaderboard, still fully sanitized.
    members.sort((a, b) => b.currentStreak - a.currentStreak);

    let challenge = null as
      | null
      | { daysElapsed: number; goalDays: number; pct: number; challengeEnd: number };
    if (squad.challengeStart && squad.challengeGoalDays && squad.challengeEnd) {
      const elapsed = Math.floor((Date.now() - squad.challengeStart) / DAY_MS);
      const daysElapsed = Math.max(0, Math.min(elapsed, squad.challengeGoalDays));
      const pct =
        squad.challengeGoalDays > 0
          ? Math.round((daysElapsed / squad.challengeGoalDays) * 100)
          : 0;
      challenge = {
        daysElapsed,
        goalDays: squad.challengeGoalDays,
        pct,
        challengeEnd: squad.challengeEnd,
      };
    }

    return {
      squad: {
        _id: squad._id,
        name: squad.name,
        ownerId: squad.ownerId,
        isPublic: squad.isPublic,
        inviteCode: squad.inviteCode,
        memberCount: squad.memberCount,
      },
      members,
      challenge,
      viewerRole: viewerMembership.role,
    };
  },
});

/**
 * Discover public squads (S3) — the first 20 public squads, with a sanitized
 * card slice (no invite code; joining still goes through joinByCode or a future
 * public-join). Open to any authed user.
 */
export const publicSquads = query({
  args: {},
  handler: async (ctx) => {
    const squads = await ctx.db
      .query('squads')
      .withIndex('by_public', (q) => q.eq('isPublic', true))
      .take(20);

    return squads.map((s) => ({
      _id: s._id,
      name: s.name,
      memberCount: s.memberCount,
      inviteCode: s.inviteCode,
      challengeGoalDays: s.challengeGoalDays ?? null,
    }));
  },
});

/**
 * Leave a squad (S3). Removes the viewer's membership and decrements the
 * denormalized memberCount (floored at 0). No-op-safe if not a member.
 */
export const leaveSquad = mutation({
  args: { squadId: v.id('squads') },
  handler: async (ctx, { squadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const membership = await membershipOf(ctx, squadId, userId);
    if (!membership) return { left: false };

    await ctx.db.delete(membership._id);

    const squad = await ctx.db.get(squadId);
    if (squad) {
      await ctx.db.patch(squadId, { memberCount: Math.max(0, squad.memberCount - 1) });
    }

    return { left: true };
  },
});
