import { paginationOptsValidator } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { ensureAnonProfile } from './community';
import {
  RATE_LIMIT_WINDOW_MS,
  canPostAgain,
  coarseTimeLabel,
  validatePostBody,
} from './model/communityRules';

/**
 * Community posts/comments/reactions (anonymous peer feed).
 *
 * SECURITY INVARIANT: anonProfiles is the userId↔pseudonym mapping and is
 * SERVER-ONLY. Every public return here is an explicitly shaped literal —
 * never a raw doc — so userId, raw ts, and moderation flags never reach a
 * client (the only self-reference is the server-computed `isMine`, plus the
 * only-if-mine `status`/`crisisFlagged` extras). Timestamps go out as coarse
 * labels only (coarseTimeLabel).
 *
 * Moderation: writes land as status 'pending' and a Claude classify action is
 * scheduled (internal.communityModeration.classify). 'shadowed' content stays
 * visible TO ITS AUTHOR as if published (shadow-ban) and is hidden from
 * everyone else.
 */

// ── Shared shaped types — defined HERE, imported everywhere else
//    (UI: `import type { CommunityFeedItem } from '@convex/communityPosts'`) ──

export type CommunityFeedItem = {
  postId: Id<'communityPosts'>;
  groupId: Id<'communityGroups'>;
  groupSlug: string; // origin group (global feed shows a tag)
  authorProfileId: Id<'anonProfiles'>; // pseudonym id — for mute/report only
  handle: string;
  avatarSeed: string;
  body: string;
  timeLabel: string; // server-computed coarse label — NEVER raw ts
  reactionCount: number;
  myReaction: boolean;
  commentCount: number; // visible (published or mine) comments
  isMine: boolean;
  status?: 'pending' | 'published'; // ONLY present when isMine. shadowed → reported as 'published' (shadow-ban).
  crisisFlagged?: boolean; // ONLY present when isMine: flags.crisis && !crisisAcked
};

export type CommunityCommentItem = {
  commentId: Id<'communityComments'>;
  postId: Id<'communityPosts'>;
  authorProfileId: Id<'anonProfiles'>;
  handle: string;
  avatarSeed: string;
  body: string;
  timeLabel: string;
  isMine: boolean;
  status?: 'pending' | 'published'; // same only-if-mine rule
  crisisFlagged?: boolean;
};

export type CrisisAlert = {
  targetType: 'post' | 'comment';
  targetId: string;
};

/**
 * The caller's mute set (Set of anonProfileIds), loaded once per execution via
 * a prefix scan on by_muter_profile. Muting hides a pseudonym's posts AND
 * comments for the muter only — never for anyone else.
 */
async function loadMutedProfileIds(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<Set<Id<'anonProfiles'>>> {
  const mutes = await ctx.db
    .query('communityMutes')
    .withIndex('by_muter_profile', (q) => q.eq('muterUserId', userId))
    .collect();
  return new Set(mutes.map((m) => m.mutedProfileId));
}

/**
 * Create a post (auto-joins the group via ensureAnonProfile). Validation and
 * rate-limit failures return `{ ok: false, reason }` instead of throwing so
 * the composer can show friendly copy and keep the draft.
 *
 * Inserted as 'pending', then the moderation action is scheduled — the feed
 * shows pending posts to their author only.
 */
export const createPost = mutation({
  args: {
    groupId: v.id('communityGroups'),
    body: v.string(),
  },
  handler: async (ctx, { groupId, body }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const trimmed = body.trim();
    const check = validatePostBody(trimmed);
    if (!check.ok) return { ok: false as const, reason: check.reason as 'empty' | 'too_long' };

    const profile = await ensureAnonProfile(ctx, userId, groupId);

    // Rolling-hour rate limit, per anonProfile (per-group buckets): 3/hour.
    const now = Date.now();
    const recent = await ctx.db
      .query('communityPosts')
      .withIndex('by_profile_ts', (q) =>
        q.eq('anonProfileId', profile._id).gt('ts', now - RATE_LIMIT_WINDOW_MS),
      )
      .collect();
    const limit = canPostAgain(
      recent.map((p) => p.ts),
      now,
    );
    if (!limit.allowed)
      return { ok: false as const, reason: 'rate_limited' as const, retryAtMs: limit.retryAtMs! };

    const postId = await ctx.db.insert('communityPosts', {
      groupId,
      userId,
      anonProfileId: profile._id,
      body: trimmed,
      status: 'pending',
      reactionCount: 0,
      ts: now,
    });

    await ctx.scheduler.runAfter(0, internal.communityModeration.classify, {
      targetType: 'post',
      targetId: postId,
      attempt: 0,
    });

    return { ok: true as const, postId };
  },
});

/**
 * Paginated feed. groupKey is 'global' (ALL posts across ALL groups, newest
 * first) or an Id<'communityGroups'> string (that group only).
 *
 * Visibility per post: published-or-mine (shadow-ban: my shadowed/pending
 * posts interleave at their true position, masquerading as published) and
 * not-muted-unless-mine. Status is post-filtered on the page — pending/
 * shadowed rows are a tiny fraction, and usePaginatedQuery tolerates short
 * pages (see the index design note in hale-community-architecture.md).
 */
export const feed = query({
  args: {
    groupKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { groupKey, paginationOpts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [] as CommunityFeedItem[], isDone: true, continueCursor: '' };

    const result =
      groupKey === 'global'
        ? // ts ≈ _creationTime (set in the same mutation) — default order works.
          await ctx.db.query('communityPosts').order('desc').paginate(paginationOpts)
        : await ctx.db
            .query('communityPosts')
            .withIndex('by_group_ts', (q) =>
              q.eq('groupId', groupKey as Id<'communityGroups'>),
            )
            .order('desc')
            .paginate(paginationOpts);

    // Per-execution context: the caller's mute set + groupId → slug map (the
    // global feed tags each post with its origin group).
    const muted = await loadMutedProfileIds(ctx, userId);
    const groups = await ctx.db.query('communityGroups').collect();
    const slugByGroup = new Map(groups.map((g) => [g._id, g.slug]));

    const now = Date.now();
    const visible = result.page.filter(
      (post) =>
        (post.status === 'published' || post.userId === userId) &&
        (post.userId === userId || !muted.has(post.anonProfileId)),
    );

    const page: CommunityFeedItem[] = await Promise.all(
      visible.map(async (post) => {
        const profile = await ctx.db.get(post.anonProfileId);
        const reaction = await ctx.db
          .query('communityReactions')
          .withIndex('by_post_user', (q) => q.eq('postId', post._id).eq('userId', userId))
          .first();
        const comments = await ctx.db
          .query('communityComments')
          .withIndex('by_post_ts', (q) => q.eq('postId', post._id))
          .collect();
        const commentCount = comments.filter(
          (c) =>
            (c.status === 'published' || c.userId === userId) &&
            (c.userId === userId || !muted.has(c.anonProfileId)),
        ).length;

        const isMine = post.userId === userId;
        return {
          postId: post._id,
          groupId: post.groupId,
          groupSlug: slugByGroup.get(post.groupId) ?? 'global',
          authorProfileId: post.anonProfileId,
          handle: profile?.handle ?? 'anonymous',
          avatarSeed: profile?.avatarSeed ?? '000000',
          body: post.body,
          timeLabel: coarseTimeLabel(post.ts, now),
          reactionCount: post.reactionCount,
          myReaction: reaction !== null,
          commentCount,
          isMine,
          // Only-if-mine extras: shadowed masquerades as published (shadow-ban).
          ...(isMine
            ? {
                status: (post.status === 'pending' ? 'pending' : 'published') as
                  | 'pending'
                  | 'published',
                crisisFlagged: post.flags?.crisis === true && post.crisisAcked !== true,
              }
            : {}),
        };
      }),
    );

    return { ...result, page };
  },
});

/**
 * Comment on a post — same moderation pipeline as posts (pending → classify →
 * published/shadowed). Comments are NOT rate-limited in v1. The anonProfile is
 * resolved against the POST's group, so the commenter speaks under the same
 * pseudonym they'd post with there.
 */
export const createComment = mutation({
  args: {
    postId: v.id('communityPosts'),
    body: v.string(),
  },
  handler: async (ctx, { postId, body }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const trimmed = body.trim();
    const check = validatePostBody(trimmed);
    if (!check.ok) return { ok: false as const, reason: check.reason as 'empty' | 'too_long' };

    const post = await ctx.db.get(postId);
    if (!post) throw new Error('Post not found');

    const profile = await ensureAnonProfile(ctx, userId, post.groupId);

    const commentId = await ctx.db.insert('communityComments', {
      postId,
      groupId: post.groupId,
      userId,
      anonProfileId: profile._id,
      body: trimmed,
      status: 'pending',
      ts: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.communityModeration.classify, {
      targetType: 'comment',
      targetId: commentId,
      attempt: 0,
    });

    return { ok: true as const, commentId };
  },
});

/**
 * A post's comments, oldest first (text-only and low volume — no pagination
 * in v1). Same visibility rules as the feed: published-or-mine, not-muted-
 * unless-mine; shaped explicitly (no userId, no raw ts, no flags).
 */
export const comments = query({
  args: {
    postId: v.id('communityPosts'),
  },
  handler: async (ctx, { postId }): Promise<CommunityCommentItem[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query('communityComments')
      .withIndex('by_post_ts', (q) => q.eq('postId', postId))
      .collect();
    const muted = await loadMutedProfileIds(ctx, userId);
    const now = Date.now();

    const visible = rows.filter(
      (c) =>
        (c.status === 'published' || c.userId === userId) &&
        (c.userId === userId || !muted.has(c.anonProfileId)),
    );

    return await Promise.all(
      visible.map(async (c) => {
        const profile = await ctx.db.get(c.anonProfileId);
        const isMine = c.userId === userId;
        return {
          commentId: c._id,
          postId: c.postId,
          authorProfileId: c.anonProfileId,
          handle: profile?.handle ?? 'anonymous',
          avatarSeed: profile?.avatarSeed ?? '000000',
          body: c.body,
          timeLabel: coarseTimeLabel(c.ts, now),
          isMine,
          ...(isMine
            ? {
                status: (c.status === 'pending' ? 'pending' : 'published') as
                  | 'pending'
                  | 'published',
                crisisFlagged: c.flags?.crisis === true && c.crisisAcked !== true,
              }
            : {}),
        };
      }),
    );
  },
});

/**
 * Toggle the single "With you" reaction (one per user per post). The count is
 * denormalized onto the post — nothing is ever aggregated per profile, and we
 * never expose WHO reacted.
 */
export const toggleReaction = mutation({
  args: {
    postId: v.id('communityPosts'),
  },
  handler: async (ctx, { postId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const post = await ctx.db.get(postId);
    if (!post) throw new Error('Post not found');

    const existing = await ctx.db
      .query('communityReactions')
      .withIndex('by_post_user', (q) => q.eq('postId', postId).eq('userId', userId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      const reactionCount = Math.max(0, post.reactionCount - 1);
      await ctx.db.patch(postId, { reactionCount });
      return { reacted: false, reactionCount };
    }

    await ctx.db.insert('communityReactions', { postId, userId, ts: Date.now() });
    const reactionCount = post.reactionCount + 1;
    await ctx.db.patch(postId, { reactionCount });
    return { reacted: true, reactionCount };
  },
});

/**
 * The author-only crisis surface: recent own posts/comments where moderation
 * set flags.crisis and the author hasn't dismissed the card yet. Feed items
 * also carry `crisisFlagged`, but alerts survive scrolling/screens — the feed
 * screen pins a CrisisCard while any alert is live.
 */
export const myCrisisAlerts = query({
  args: {},
  handler: async (ctx): Promise<CrisisAlert[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const posts = await ctx.db
      .query('communityPosts')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .order('desc')
      .take(20);
    const comments = await ctx.db
      .query('communityComments')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .order('desc')
      .take(20);

    const alerts: CrisisAlert[] = [];
    for (const p of posts)
      if (p.flags?.crisis === true && p.crisisAcked !== true)
        alerts.push({ targetType: 'post', targetId: String(p._id) });
    for (const c of comments)
      if (c.flags?.crisis === true && c.crisisAcked !== true)
        alerts.push({ targetType: 'comment', targetId: String(c._id) });
    return alerts;
  },
});

/**
 * Dismiss the crisis card for one of the caller's OWN posts/comments. Quietly
 * returns { ok: false } on anything else (bad id, not found, not the author) —
 * never throws, so existence of other users' content can't be probed.
 */
export const ackCrisisCard = mutation({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
  },
  handler: async (ctx, { targetType, targetId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    if (targetType === 'post') {
      const id = ctx.db.normalizeId('communityPosts', targetId);
      const doc = id ? await ctx.db.get(id) : null;
      if (!doc || doc.userId !== userId) return { ok: false };
      await ctx.db.patch(doc._id, { crisisAcked: true });
      return { ok: true };
    }

    const id = ctx.db.normalizeId('communityComments', targetId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.userId !== userId) return { ok: false };
    await ctx.db.patch(doc._id, { crisisAcked: true });
    return { ok: true };
  },
});
