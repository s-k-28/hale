import { mutation } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

/**
 * Account deletion (Guideline 5.1.1(v)) — hard-deletes the authed user and ALL
 * their user-generated content in one transaction, then their auth rows, then
 * the user doc itself. The client follows up with RevenueCat logOut + signOut
 * (deleting the App Store subscription is Apple's domain — never attempted).
 *
 * Locked product decisions (2026-06-11):
 *  • Referrals: completed rows are KEPT on both sides — nobody's progress
 *    toward the 3-referral reward ever decrements, and granted rewards keep
 *    running (grant-exactly-once code untouched). Only the deleting user's OWN
 *    referrer-side rows that never counted ('attributed'/'void') are removed.
 *    Surviving readers render a deleted counterpart null-safely
 *    (referrals.myProgress: `inv?.name ?? null`; completion hook: `referrer &&`).
 *  • Owned squads: DISSOLVED — squad doc, every membership, and the squad's
 *    feed scope are deleted. No ownership transfer.
 *  • Buddy links: deleted from both sides. The survivor's myBuddy finds no
 *    active link and resolves null → the normal unpaired state, no crash.
 *
 * Small-table scans (nudges sent, feedEvents, squads-by-owner, authVerifiers)
 * have no covering index; at launch scale they are cheap. If these tables grow
 * large, move this to a scheduled batch deletion instead of widening indexes.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // 0. Provider-side purge (OneSignal / PostHog / RevenueCat) — capture the
    //    external ids BEFORE the rows vanish; the action runs after commit and
    //    is best-effort (skips per-provider when env keys are absent).
    const me = await ctx.db.get(userId);
    await ctx.scheduler.runAfter(0, internal.users.purgeExternalAccounts, {
      externalId: String(userId),
      oneSignalExternalId: me?.oneSignalExternalId ?? String(userId),
    });

    // 1. Quit history + self-logged content (all indexed by userId).
    for (const row of await ctx.db
      .query('quitAttempts')
      .withIndex('by_user_active', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('activationEvents')
      .withIndex('by_user_kind', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('checkIns')
      .withIndex('by_user_date', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('cravings')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('sageMessages')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('savingsGoals')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('leagueMemberships')
      .withIndex('by_user_week', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('matchRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }

    // 2. Nudges, both directions. Received are indexed (by_to); sent have no
    //    index → small-table scan (see header note).
    for (const row of await ctx.db
      .query('nudges')
      .withIndex('by_to', (q) => q.eq('toUser', userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query('nudges')
      .filter((q) => q.eq(q.field('fromUser'), userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }

    // 3. Buddy links, both sides — detach is deletion (survivor reads unpaired).
    //    Track the dead scope ids so the shared feed goes with them.
    const deadScopeIds = new Set<string>();
    for (const indexName of ['by_userA', 'by_userB'] as const) {
      const field = indexName === 'by_userA' ? 'userA' : 'userB';
      for (const link of await ctx.db
        .query('buddyLinks')
        .withIndex(indexName, (q) => q.eq(field, userId))
        .collect()) {
        deadScopeIds.add(String(link._id));
        await ctx.db.delete(link._id);
      }
    }

    // 4. Owned squads: dissolve (locked decision). Owned = squads.ownerId
    //    (no index → small-table scan). Deletes the squad, every member row,
    //    and marks its feed scope dead. Memberships in OTHER squads: row delete.
    const ownedSquadIds: Id<'squads'>[] = [];
    for (const squad of await ctx.db
      .query('squads')
      .filter((q) => q.eq(q.field('ownerId'), userId))
      .collect()) {
      ownedSquadIds.push(squad._id);
      deadScopeIds.add(String(squad._id));
    }
    for (const squadId of ownedSquadIds) {
      for (const member of await ctx.db
        .query('squadMembers')
        .withIndex('by_squad', (q) => q.eq('squadId', squadId))
        .collect()) {
        await ctx.db.delete(member._id);
      }
      await ctx.db.delete(squadId);
    }
    for (const membership of await ctx.db
      .query('squadMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()) {
      // Squads merely JOINED survive — keep their denormalized count honest.
      const squad = await ctx.db.get(membership.squadId);
      if (squad)
        await ctx.db.patch(squad._id, { memberCount: Math.max(0, squad.memberCount - 1) });
      await ctx.db.delete(membership._id);
    }

    // 4b. Community (anonymous peer feed): the user's posts go with their
    //     whole thread (comments/reactions would be unreachable orphans),
    //     then their comments on others' posts, reactions (with count
    //     decrements), reports they filed, blocks in both directions, and
    //     their pseudonyms (decrementing each group's member-ish count).
    for (const post of await ctx.db
      .query('communityPosts')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .collect()) {
      for (const c of await ctx.db
        .query('communityComments')
        .withIndex('by_post_ts', (q) => q.eq('postId', post._id))
        .collect()) {
        await ctx.db.delete(c._id);
      }
      for (const r of await ctx.db
        .query('communityReactions')
        .withIndex('by_post_user', (q) => q.eq('postId', post._id))
        .collect()) {
        await ctx.db.delete(r._id);
      }
      await ctx.db.delete(post._id);
    }
    for (const c of await ctx.db
      .query('communityComments')
      .withIndex('by_user_ts', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete(c._id);
    }
    for (const r of await ctx.db.query('communityReactions').collect()) {
      if (r.userId !== userId) continue;
      const post = await ctx.db.get(r.postId);
      if (post)
        await ctx.db.patch(post._id, { reactionCount: Math.max(0, post.reactionCount - 1) });
      await ctx.db.delete(r._id);
    }
    for (const report of await ctx.db
      .query('communityReports')
      .withIndex('by_reporter_target', (q) => q.eq('reporterUserId', userId))
      .collect()) {
      await ctx.db.delete(report._id);
    }
    for (const muteRow of await ctx.db
      .query('communityMutes')
      .withIndex('by_muter_profile', (q) => q.eq('muterUserId', userId))
      .collect()) {
      await ctx.db.delete(muteRow._id);
    }
    for (const muteRow of await ctx.db
      .query('communityMutes')
      .withIndex('by_muted_user', (q) => q.eq('mutedUserId', userId))
      .collect()) {
      await ctx.db.delete(muteRow._id);
    }
    for (const profile of await ctx.db
      .query('anonProfiles')
      .withIndex('by_user_group', (q) => q.eq('userId', userId))
      .collect()) {
      const group = await ctx.db.get(profile.groupId);
      if (group)
        await ctx.db.patch(group._id, { memberCount: Math.max(0, group.memberCount - 1) });
      await ctx.db.delete(profile._id);
    }

    // 5. Feed events: everything the user authored anywhere, plus every event
    //    in a now-dead buddy/squad scope (no index covers either → one scan).
    for (const event of await ctx.db.query('feedEvents').collect()) {
      if (event.actorId === userId || deadScopeIds.has(event.scopeId)) {
        await ctx.db.delete(event._id);
      }
    }

    // 6. Referrals (locked decision): keep every 'completed' row on both sides
    //    so no surviving referrer's progress decrements; delete only the
    //    deleting user's own referrer-side rows that never counted.
    for (const row of await ctx.db
      .query('referrals')
      .withIndex('by_referrer', (q) => q.eq('referrerId', userId))
      .collect()) {
      if (row.status !== 'completed') {
        await ctx.db.delete(row._id);
      }
    }

    // 7. Auth rows: sessions (+ their refresh tokens + verifiers), then
    //    accounts (+ their verification codes). The CURRENT session dies here
    //    too — this mutation already authenticated, and the client's signOut
    //    tolerates the missing session (it clears local tokens regardless).
    const sessionIds = new Set<string>();
    for (const session of await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect()) {
      sessionIds.add(String(session._id));
      for (const token of await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .collect()) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
    }
    for (const verifier of await ctx.db.query('authVerifiers').collect()) {
      if (verifier.sessionId && sessionIds.has(String(verifier.sessionId))) {
        await ctx.db.delete(verifier._id);
      }
    }
    for (const account of await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect()) {
      for (const code of await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .collect()) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
    }

    // 8. The user doc itself, last.
    await ctx.db.delete(userId);

    return { deleted: true };
  },
});
