import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { generateHandle, generateAvatarSeed } from './model/anonHandles';

/**
 * Community groups + anonymous profiles. Exactly 6 seeded rows (5 real groups
 * plus the 'global' pseudo-group) — no user-created groups, ever.
 *
 * SECURITY INVARIANT: anonProfiles is the userId↔pseudonym mapping and is
 * SERVER-ONLY. No public return value here ever includes userId; every query
 * shapes fields explicitly. The only self-reference allowed is the caller's
 * OWN handle/avatarSeed (their pseudonym — they already know who they are).
 */

/** The 6 seeded groups. seedGroups inserts only what's missing — idempotent. */
const GROUP_SEEDS = [
  { slug: 'global',             name: 'Everyone',           isGlobal: true,  sortOrder: 0 },
  { slug: 'day-one-club',       name: 'Day One Club',       isGlobal: false, sortOrder: 1 },
  { slug: 'cravings-right-now', name: 'Cravings Right Now', isGlobal: false, sortOrder: 2 },
  { slug: 'milestones',         name: 'Milestones',         isGlobal: false, sortOrder: 3 },
  { slug: 'vaping-zyn',         name: 'Vaping & Zyn',       isGlobal: false, sortOrder: 4 },
  { slug: 'relapse-restart',    name: 'Relapse & Restart',  isGlobal: false, sortOrder: 5 },
] as const;

/** Shaped group row for the browse screen — no userId, no follower counts. */
type GroupCard = {
  groupId: Id<'communityGroups'>;
  slug: string;
  name: string;
  isGlobal: boolean;
  memberCount: number; // member-ish count is OK; NO follower counts
  joined: boolean; // does the caller have an anonProfile here
};

/**
 * Get-or-create the caller's pseudonym for a group (idempotent per
 * (userId, groupId)). Handle generation is collision-safe: generate, check the
 * per-group handle index, retry — the space is ~228k per group so 10 tries is
 * statistically unreachable. Bumps the group's denormalized memberCount on
 * first join. Plain async function (NOT a Convex function) so communityPosts
 * can share it via a plain import.
 */
export async function ensureAnonProfile(
  ctx: MutationCtx,
  userId: Id<'users'>,
  groupId: Id<'communityGroups'>,
): Promise<Doc<'anonProfiles'>> {
  const existing = await ctx.db
    .query('anonProfiles')
    .withIndex('by_user_group', (q) => q.eq('userId', userId).eq('groupId', groupId))
    .first();
  if (existing) return existing;

  const group = await ctx.db.get(groupId);
  if (!group) throw new Error('Group not found');

  for (let i = 0; i < 10; i++) {
    const handle = generateHandle(Math.random);
    const clash = await ctx.db
      .query('anonProfiles')
      .withIndex('by_group_handle', (q) => q.eq('groupId', groupId).eq('handle', handle))
      .first();
    if (clash) continue;

    const profileId = await ctx.db.insert('anonProfiles', {
      userId,
      groupId,
      handle,
      avatarSeed: generateAvatarSeed(Math.random),
      createdAt: Date.now(),
    });
    await ctx.db.patch(groupId, { memberCount: group.memberCount + 1 });
    return (await ctx.db.get(profileId))!;
  }
  throw new Error('Could not generate a handle');
}

/**
 * All 6 groups (global first) with the caller's joined state. Unauthenticated
 * → []. Returns nothing about other users — counts are aggregate-only.
 */
export const groups = query({
  args: {},
  handler: async (ctx): Promise<GroupCard[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const all = await ctx.db.query('communityGroups').collect();
    all.sort((a, b) => a.sortOrder - b.sortOrder);

    return await Promise.all(
      all.map(async (group) => {
        const profile = await ctx.db
          .query('anonProfiles')
          .withIndex('by_user_group', (q) => q.eq('userId', userId).eq('groupId', group._id))
          .first();
        return {
          groupId: group._id,
          slug: group.slug,
          name: group.name,
          isGlobal: group.isGlobal,
          memberCount: group.memberCount,
          joined: profile !== null,
        };
      }),
    );
  },
});

/**
 * Resolve a feed-screen route param to a group. groupKey is either the slug
 * 'global' or an Id<'communityGroups'> string. Bad/unknown ids → null (the
 * screen shows a friendly not-found). myHandle is the caller's OWN pseudonym
 * here, or null when they haven't joined.
 */
export const resolveGroup = query({
  args: { groupKey: v.string() },
  handler: async (
    ctx,
    { groupKey },
  ): Promise<(GroupCard & { myHandle: string | null }) | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    let group: Doc<'communityGroups'> | null = null;
    if (groupKey === 'global') {
      group = await ctx.db
        .query('communityGroups')
        .withIndex('by_slug', (q) => q.eq('slug', 'global'))
        .first();
    } else {
      try {
        group = await ctx.db.get(groupKey as Id<'communityGroups'>);
      } catch {
        return null; // malformed id string
      }
    }
    if (!group) return null;

    const profile = await ctx.db
      .query('anonProfiles')
      .withIndex('by_user_group', (q) => q.eq('userId', userId).eq('groupId', group._id))
      .first();

    return {
      groupId: group._id,
      slug: group.slug,
      name: group.name,
      isGlobal: group.isGlobal,
      memberCount: group.memberCount,
      joined: profile !== null,
      myHandle: profile?.handle ?? null,
    };
  },
});

/**
 * Explicit join (the browse screen's Join affordance — reveals the handle up
 * front; posting auto-joins anyway). Idempotent. Returns ONLY the caller's own
 * pseudonym — the allowed self-reference.
 */
export const joinGroup = mutation({
  args: { groupId: v.id('communityGroups') },
  handler: async (ctx, { groupId }): Promise<{ handle: string; avatarSeed: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const profile = await ensureAnonProfile(ctx, userId, groupId);
    return { handle: profile.handle, avatarSeed: profile.avatarSeed };
  },
});

/**
 * The caller's own pseudonyms across groups ("Joined as steady-otter-47").
 * Self-only by construction — never anyone else's profile.
 */
export const myProfiles = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    { groupId: Id<'communityGroups'>; groupSlug: string; handle: string; avatarSeed: string }[]
  > => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const profiles = await ctx.db
      .query('anonProfiles')
      .withIndex('by_user_group', (q) => q.eq('userId', userId))
      .collect();

    const shaped = await Promise.all(
      profiles.map(async (profile) => {
        const group = await ctx.db.get(profile.groupId);
        if (!group) return null;
        return {
          groupId: profile.groupId,
          groupSlug: group.slug,
          handle: profile.handle,
          avatarSeed: profile.avatarSeed,
        };
      }),
    );
    return shaped.filter((p) => p !== null);
  },
});

/**
 * Seed the 6 groups (5 real + 'global'). Idempotent — inserts only slugs that
 * don't exist yet; never deletes or renames. Run once by the integrator:
 * `npx convex run community:seedGroups '{}'`.
 */
export const seedGroups = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ created: number }> => {
    let created = 0;
    for (const seed of GROUP_SEEDS) {
      const existing = await ctx.db
        .query('communityGroups')
        .withIndex('by_slug', (q) => q.eq('slug', seed.slug))
        .first();
      if (existing) continue;
      await ctx.db.insert('communityGroups', {
        slug: seed.slug,
        name: seed.name,
        isGlobal: seed.isGlobal,
        sortOrder: seed.sortOrder,
        memberCount: 0,
      });
      created++;
    }
    return { created };
  },
});
