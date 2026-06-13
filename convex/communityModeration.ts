import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import {
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { moderationOutcome } from './model/communityRules';

/**
 * Community moderation — the Claude pipeline + report/mute (architecture §2.5).
 *
 *   createPost/createComment ──schedules──▶ classify (internalAction)
 *   classify ──runQuery──▶ getModerationTarget (loads the pending body)
 *   classify ──fetch────▶ api.anthropic.com /v1/messages (the ONLY network call)
 *   classify ──runMutation▶ applyOutcome (state machine via moderationOutcome)
 *
 * Mutations stay deterministic (no fetch); the network call lives in the action
 * (same shape as sage.generate). Fail-safe by design: on a missing key or any
 * fetch/parse failure the content STAYS 'pending' and we retry with backoff —
 * we NEVER auto-publish unmoderated content.
 *
 * SECURITY INVARIANT: no public return value here ever includes userId — see
 * hale-community-architecture.md.
 */

const MODERATION_MODEL = 'claude-opus-4-8'; // exact — no date suffix
const MODERATION_MAX_ATTEMPTS = 3; // attempt = 0,1,2
const MODERATION_RETRY_DELAYS_MS = [10_000, 60_000]; // after attempt 0, after attempt 1

// Structured-output schema: forces a valid {pii,crisis,glamorizing,harassment}
// JSON object so the parse step can't get prose back.
const MODERATION_SCHEMA = {
  type: 'object',
  properties: {
    pii: { type: 'boolean' },
    crisis: { type: 'boolean' },
    glamorizing: { type: 'boolean' },
    harassment: { type: 'boolean' },
  },
  required: ['pii', 'crisis', 'glamorizing', 'harassment'],
  additionalProperties: false,
} as const;

// The classifier prompt. Calibrated for a quit-nicotine peer-support space:
// venting, cravings, slips, and dark humor about the struggle are the NORM
// here — naming that explicitly is what keeps the classifier from overflagging
// ordinary recovery talk as crisis/glamorizing.
const MODERATION_SYSTEM = `You moderate an anonymous peer-support community for people quitting nicotine. Classify the post below. Return booleans only.
- pii: contains personally identifying info (full names, phone numbers, emails, addresses, social handles).
- crisis: expresses suicidal ideation, self-harm intent, or acute crisis.
- glamorizing: glamorizes or encourages nicotine/drug use, or pressures others to relapse.
- harassment: attacks, demeans, or targets another person.
Supportive venting, slips, relapses, and dark humor about cravings are NORMAL here and are NOT flags by themselves.`;

/**
 * Classify one pending post/comment with Claude and apply the outcome.
 * On ANY failure (no key, non-ok status, fetch throw, parse throw): leave the
 * content 'pending' and reschedule with backoff, up to MODERATION_MAX_ATTEMPTS
 * total tries — then log and give up (still pending; never published).
 */
export const classify = internalAction({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, { targetType, targetId, attempt }) => {
    const target = await ctx.runQuery(internal.communityModeration.getModerationTarget, {
      targetType,
      targetId,
    });
    // Deleted, or a retry raced an earlier success — nothing to do.
    if (!target || target.status !== 'pending') return;

    let failure = '';
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Deployment misconfig — surface it loudly; content stays pending.
      console.error('[moderation] ANTHROPIC_API_KEY unset');
      failure = 'ANTHROPIC_API_KEY unset';
    } else {
      try {
        // Raw fetch, no SDK (mirrors sage's fetch-to-Groq pattern). Do NOT send
        // temperature/top_p/top_k or thinking — removed on this model (they 400).
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: MODERATION_MODEL,
            max_tokens: 256,
            system: MODERATION_SYSTEM,
            messages: [{ role: 'user', content: target.body }],
            output_config: { format: { type: 'json_schema', schema: MODERATION_SCHEMA } },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const flags = JSON.parse(data.content[0].text);
          await ctx.runMutation(internal.communityModeration.applyOutcome, {
            targetType,
            targetId,
            flags,
          });
          return;
        }
        // Surface WHY classification failed — best-effort parse of Anthropic's
        // {error:{type,message}} envelope; status alone is the floor.
        let detail = '';
        try {
          const err = await res.json();
          detail = err?.error?.message ? `${err.error.type ?? 'error'}: ${err.error.message}` : '';
        } catch {
          // body wasn't JSON — the status code is the signal
        }
        failure = `claude non-ok ${res.status} ${detail}`;
      } catch (e) {
        // Network/parse failure — keep pending, record the reason.
        failure = e instanceof Error ? e.message : String(e);
      }
    }

    console.error(
      `[moderation] classify failed (attempt ${attempt + 1}/${MODERATION_MAX_ATTEMPTS}): ${failure}`,
    );
    if (attempt < MODERATION_MAX_ATTEMPTS - 1) {
      await ctx.scheduler.runAfter(
        MODERATION_RETRY_DELAYS_MS[attempt],
        internal.communityModeration.classify,
        { targetType, targetId, attempt: attempt + 1 },
      );
    } else {
      console.error('[moderation] giving up — stays pending');
    }
  },
});

/**
 * Loads the moderation target's body + status for the action. Internal-only —
 * the userId on the doc never leaves the server.
 */
export const getModerationTarget = internalQuery({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
  },
  handler: async (ctx, { targetType, targetId }) => {
    const doc =
      targetType === 'post'
        ? await ctx.db.get(targetId as Id<'communityPosts'>)
        : await ctx.db.get(targetId as Id<'communityComments'>);
    if (!doc) return null;
    return { body: doc.body, status: doc.status };
  },
});

/**
 * Applies the classifier's verdict via the moderationOutcome state machine:
 * shadow flags → 'shadowed' (author still sees it as published), else
 * 'published'. A crisis flag ALWAYS arms the author-facing crisis card
 * (crisisAcked: false) — even on a shadowed post. Idempotent: only a doc still
 * 'pending' is touched, so a duplicate retry can't re-flag acked content.
 */
export const applyOutcome = internalMutation({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
    flags: v.object({
      pii: v.boolean(),
      crisis: v.boolean(),
      glamorizing: v.boolean(),
      harassment: v.boolean(),
    }),
  },
  handler: async (ctx, { targetType, targetId, flags }) => {
    const doc =
      targetType === 'post'
        ? await ctx.db.get(targetId as Id<'communityPosts'>)
        : await ctx.db.get(targetId as Id<'communityComments'>);
    if (!doc || doc.status !== 'pending') return;
    const { status, crisis } = moderationOutcome(flags);
    await ctx.db.patch(doc._id, { status, flags, ...(crisis ? { crisisAcked: false } : {}) });
  },
});

// Requeue sweep tuning: content still 'pending' after this long has exhausted
// classify's in-line retries (~70s) — usually a missing/bad ANTHROPIC_API_KEY.
const REQUEUE_STALE_MS = 5 * 60_000;
const REQUEUE_BATCH = 50; // bound per-sweep work; the cron catches the rest next run

/**
 * Safety net for the fail-safe: classify gives up after 3 attempts, so content
 * authored while the API key is missing/broken would otherwise stay 'pending'
 * FOREVER — even after the key is fixed. This sweep (cron: moderation-requeue)
 * re-enqueues stale pending posts/comments, so the backlog drains on its own
 * the moment classification works again. Duplicate scheduling is harmless:
 * classify exits on any non-pending target and applyOutcome only patches
 * 'pending' docs.
 */
export const requeueStalePending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - REQUEUE_STALE_MS;
    let requeued = 0;
    for (const targetType of ['post', 'comment'] as const) {
      const table = targetType === 'post' ? 'communityPosts' : 'communityComments';
      const stale = await ctx.db
        .query(table)
        .withIndex('by_status_ts', (q) => q.eq('status', 'pending').lte('ts', cutoff))
        .take(REQUEUE_BATCH);
      for (const doc of stale) {
        await ctx.scheduler.runAfter(0, internal.communityModeration.classify, {
          targetType,
          targetId: doc._id,
          attempt: 0,
        });
        requeued++;
      }
    }
    if (requeued > 0) console.log(`[moderation] requeued ${requeued} stale pending item(s)`);
    return { requeued };
  },
});

/**
 * Report a post/comment — lands in the triage queue (openReports) and the
 * report-sla cron pages the team while it sits unresolved (Guideline 1.2:
 * concerns are acted on within 24 hours).
 * Idempotent UX: re-reporting the same target returns { ok: true } without a
 * duplicate row. The return never carries userId or the reporter's identity.
 */
export const reportContent = mutation({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment'), v.literal('squad')),
    targetId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { targetType, targetId, reason }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const existing = await ctx.db
      .query('communityReports')
      .withIndex('by_reporter_target', (q) =>
        q.eq('reporterUserId', userId).eq('targetType', targetType).eq('targetId', targetId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert('communityReports', {
        reporterUserId: userId,
        targetType,
        targetId,
        reason,
        ts: Date.now(),
      });
    }
    return { ok: true as const };
  },
});

// ── Admin triage (Guideline 1.2: timely response — remove + eject within 24h) ──
// Internal-only: run from the back office via `npx convex run`, e.g.
//   npx convex run communityModeration:openReports
//   npx convex run communityModeration:removeContent '{"targetType":"post","targetId":"..."}'
//   npx convex run communityModeration:banUser '{"userId":"..."}'
//   npx convex run communityModeration:resolveReport '{"reportId":"...","resolution":"removed"}'

/**
 * The open report queue, oldest first — each entry joined to its target's
 * current body/status and the author's account id so one read is enough to
 * decide remove/ban/dismiss.
 */
export const openReports = internalQuery({
  args: {},
  handler: async (ctx) => {
    const reports = await ctx.db.query('communityReports').order('asc').collect();
    const open = reports.filter((r) => r.resolvedAt === undefined);
    return await Promise.all(
      open.map(async (r) => {
        // Squad reports target the NAME (the only stranger-visible text).
        if (r.targetType === 'squad') {
          const squad = await ctx.db.get(r.targetId as Id<'squads'>);
          const owner = squad ? await ctx.db.get(squad.ownerId) : null;
          return {
            reportId: r._id,
            reportedAt: r.ts,
            ageHours: Math.round((Date.now() - r.ts) / 3_600_000),
            reason: r.reason ?? null,
            targetType: r.targetType,
            targetId: r.targetId,
            body: squad?.name ?? '(deleted)',
            status: squad ? ('published' as const) : null,
            authorUserId: squad?.ownerId ?? null,
            authorBanned: owner?.bannedAt !== undefined,
          };
        }
        const doc =
          r.targetType === 'post'
            ? await ctx.db.get(r.targetId as Id<'communityPosts'>)
            : await ctx.db.get(r.targetId as Id<'communityComments'>);
        const author = doc ? await ctx.db.get(doc.userId) : null;
        return {
          reportId: r._id,
          reportedAt: r.ts,
          ageHours: Math.round((Date.now() - r.ts) / 3_600_000),
          reason: r.reason ?? null,
          targetType: r.targetType,
          targetId: r.targetId,
          body: doc?.body ?? '(deleted)',
          status: doc?.status ?? null,
          authorUserId: doc?.userId ?? null,
          authorBanned: author?.bannedAt !== undefined,
        };
      }),
    );
  },
});

/** Take down a post/comment — hidden from everyone, author included. */
export const removeContent = internalMutation({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment'), v.literal('squad')),
    targetId: v.string(),
  },
  handler: async (ctx, { targetType, targetId }) => {
    // A squad's offending NAME is neutralized in place so the group itself
    // survives for its members; posts/comments flip to 'removed'.
    if (targetType === 'squad') {
      const squad = await ctx.db.get(targetId as Id<'squads'>);
      if (!squad) return { ok: false as const, reason: 'not_found' as const };
      await ctx.db.patch(squad._id, { name: 'Quit squad' });
      return { ok: true as const };
    }
    const doc =
      targetType === 'post'
        ? await ctx.db.get(targetId as Id<'communityPosts'>)
        : await ctx.db.get(targetId as Id<'communityComments'>);
    if (!doc) return { ok: false as const, reason: 'not_found' as const };
    await ctx.db.patch(doc._id, { status: 'removed' as const });
    return { ok: true as const };
  },
});

/**
 * Eject a user from the community: createPost/createComment/toggleReaction
 * reject while bannedAt is set. Their existing content stays subject to
 * removeContent (ban + sweep separately so each action is auditable).
 */
export const banUser = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return { ok: false as const, reason: 'not_found' as const };
    if (user.bannedAt === undefined) await ctx.db.patch(userId, { bannedAt: Date.now() });
    return { ok: true as const };
  },
});

/** Lift a ban (appeal path). */
export const unbanUser = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return { ok: false as const, reason: 'not_found' as const };
    await ctx.db.patch(userId, { bannedAt: undefined });
    return { ok: true as const };
  },
});

/** Close a report with its outcome — clears it from openReports + the SLA cron. */
export const resolveReport = internalMutation({
  args: {
    reportId: v.id('communityReports'),
    resolution: v.union(v.literal('removed'), v.literal('banned'), v.literal('dismissed')),
  },
  handler: async (ctx, { reportId, resolution }) => {
    const report = await ctx.db.get(reportId);
    if (!report) return { ok: false as const, reason: 'not_found' as const };
    await ctx.db.patch(reportId, { resolvedAt: Date.now(), resolution });
    return { ok: true as const };
  },
});

// Page well inside the 24h window so there's time to actually act.
const REPORT_SLA_PAGE_AFTER_MS = 12 * 3_600_000;

/**
 * SLA watchdog (cron: report-sla). Any report open longer than 12h logs an
 * error (visible in the Convex dashboard) and, when MODERATION_ALERT_EMAIL is
 * set, emails the team via email.sendEmail (itself a no-op without
 * RESEND_API_KEY — safe before keys land).
 */
export const alertStaleReports = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - REPORT_SLA_PAGE_AFTER_MS;
    const reports = await ctx.db.query('communityReports').order('asc').collect();
    const stale = reports.filter((r) => r.resolvedAt === undefined && r.ts <= cutoff);
    if (stale.length === 0) return { stale: 0 };
    const oldestHours = Math.round((Date.now() - stale[0].ts) / 3_600_000);
    console.error(
      `[moderation] REPORT SLA: ${stale.length} open report(s), oldest ${oldestHours}h — act within 24h (Guideline 1.2)`,
    );
    const to = process.env.MODERATION_ALERT_EMAIL;
    if (to) {
      await ctx.scheduler.runAfter(0, internal.email.sendEmail, {
        to,
        subject: `[HALE] ${stale.length} community report(s) need action (oldest ${oldestHours}h)`,
        html: `<p>There are <strong>${stale.length}</strong> unresolved community reports; the oldest has been open <strong>${oldestHours} hours</strong>. Apple requires action within 24 hours of a report.</p>
<p>Triage:</p>
<pre>npx convex run communityModeration:openReports
npx convex run communityModeration:removeContent '{"targetType":"post","targetId":"..."}'
npx convex run communityModeration:banUser '{"userId":"..."}'
npx convex run communityModeration:resolveReport '{"reportId":"...","resolution":"removed"}'</pre>`,
      });
    }
    return { stale: stale.length };
  },
});

/**
 * Block a member — hides the ACCOUNT behind the pseudonym everywhere: all
 * their pseudonyms, posts, and comments across every group, for the caller
 * only (the feed/comments queries filter against the caller's blocked-user
 * set). Blocking your own profile is a silent no-op: we return { ok: true }
 * without revealing that the profile is yours.
 */
export const muteProfile = mutation({
  args: { profileId: v.id('anonProfiles') },
  handler: async (ctx, { profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const profile = await ctx.db.get(profileId);
    // Missing or self — reveal nothing either way.
    if (!profile || profile.userId === userId) return { ok: true as const };
    const existing = await ctx.db
      .query('communityMutes')
      .withIndex('by_muter_profile', (q) =>
        q.eq('muterUserId', userId).eq('mutedProfileId', profileId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert('communityMutes', {
        muterUserId: userId,
        mutedProfileId: profileId,
        mutedUserId: profile.userId,
        ts: Date.now(),
      });
    } else if (existing.mutedUserId === undefined) {
      // Pre-migration row — backfill the account key so the block follows the user.
      await ctx.db.patch(existing._id, { mutedUserId: profile.userId });
    }
    return { ok: true as const };
  },
});

/** Undo a mute — deletes the caller's mute row if present. Idempotent. */
export const unmuteProfile = mutation({
  args: { profileId: v.id('anonProfiles') },
  handler: async (ctx, { profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const existing = await ctx.db
      .query('communityMutes')
      .withIndex('by_muter_profile', (q) =>
        q.eq('muterUserId', userId).eq('mutedProfileId', profileId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true as const };
  },
});

/**
 * The caller's mute list for a settings surface. Shaped explicitly: pseudonym
 * id + handle only — a handle is public, the userId behind it never leaves
 * the server.
 */
export const myMutes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const mutes = await ctx.db
      .query('communityMutes')
      .withIndex('by_muter_profile', (q) => q.eq('muterUserId', userId))
      .collect();
    const items: { profileId: Id<'anonProfiles'>; handle: string }[] = [];
    for (const mute of mutes) {
      const profile = await ctx.db.get(mute.mutedProfileId);
      if (profile) items.push({ profileId: profile._id, handle: profile.handle });
    }
    return items;
  },
});
