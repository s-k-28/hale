import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { localDateOf, dayDiff } from './model/streak';

/**
 * Opt-in weekly leagues (S4). Segmented by quit-STAGE (so a day-3 quitter never
 * competes with a day-200 veteran) and ranked by CONSISTENCY — the count of
 * clean check-ins this ISO week. Scores are DERIVED from checkIns at query time
 * (schema note: "league scores counted from checkIns"); leagueMemberships only
 * stores the opt-in + which bucket you joined for the week.
 *
 * Conventions mirrored from buddies.ts / checkins.ts: thin Convex wrappers,
 * getAuthUserId for identity, deterministic Date.now() inside the handler, and
 * the user's LOCAL day for all date math (Decision 1: timezone-aware).
 */

type StageBucket = 'd0_7' | 'd8_30' | 'd31_90' | 'd90plus';

/* ── Pure helpers (ISO week + stage bucket) ──────────────────────────── */

/**
 * ISO-8601 week key "YYYY-Www" derived from a local "YYYY-MM-DD" date string.
 * ISO weeks start Monday; week 1 is the week containing the year's first
 * Thursday — so the year in the key can differ from the calendar year near
 * Jan 1 / Dec 31 (correct, by design). UTC arithmetic on the already-localized
 * date keeps this tz-independent and deterministic.
 */
export function weekKeyOf(localDate: string): string {
  const d = new Date(localDate + 'T00:00:00Z');
  // ISO weekday: Mon=1..Sun=7. JS getUTCDay: Sun=0..Sat=6.
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // Shift to the Thursday of this week — its calendar year is the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** The seven local "YYYY-MM-DD" dates (Mon→Sun) of the ISO week a date falls in. */
export function weekLocalDates(localDate: string): string[] {
  const d = new Date(localDate + 'T00:00:00Z');
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // Step back to Monday.
  d.setUTCDate(d.getUTCDate() - (dayNum - 1));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/** Days-since-quit → stage bucket. <0 (future start) clamps to the d0_7 floor. */
export function bucketForDays(daysSinceStart: number): StageBucket {
  if (daysSinceStart <= 7) return 'd0_7';
  if (daysSinceStart <= 30) return 'd8_30';
  if (daysSinceStart <= 90) return 'd31_90';
  return 'd90plus';
}

/**
 * The viewer's quit-stage bucket, derived from days since the CURRENT attempt's
 * startDate measured in the user's local calendar. Returns null when there is no
 * active quit (can't place an unplaced user). Mirrors checkins.ts' guard.
 */
async function stageBucketFor(
  ctx: QueryCtx,
  user: Doc<'users'>,
  todayLocalDate: string,
): Promise<StageBucket | null> {
  if (!user.currentAttemptId || !user.timezone) return null;
  const attempt = await ctx.db.get(user.currentAttemptId);
  if (!attempt) return null;
  const startLocalDate = localDateOf(attempt.startDate, user.timezone);
  const days = dayDiff(startLocalDate, todayLocalDate);
  return bucketForDays(days);
}

/** Count of CLEAN check-ins for a user across an explicit set of local dates. */
async function cleanCountForWeek(
  ctx: QueryCtx,
  userId: Id<'users'>,
  weekDates: string[],
): Promise<number> {
  const dateSet = new Set(weekDates);
  let score = 0;
  // One narrow scan per date via by_user_date — bounded (7 lookups) and indexed.
  for (const date of dateSet) {
    const rows = await ctx.db
      .query('checkIns')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('localDate', date))
      .collect();
    if (rows.some((r) => r.status === 'clean')) score += 1;
  }
  return score;
}

/* ── Mutations ───────────────────────────────────────────────────────── */

/**
 * Opt IN to this week's league. Idempotent upsert keyed by (userId, weekKey):
 * re-snaps your stageBucket to your CURRENT stage and flips optedIn → true, so
 * re-opting after a leave (or after advancing a stage mid-week) just updates the
 * one row. track(league_optin) fires client-side. Requires an active quit.
 */
export const optIn = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user?.currentAttemptId || !user.timezone) throw new Error('No active quit');

    const today = localDateOf(Date.now(), user.timezone);
    const weekKey = weekKeyOf(today);
    const bucket = await stageBucketFor(ctx, user, today);
    if (!bucket) throw new Error('No active quit');

    const existing = await ctx.db
      .query('leagueMemberships')
      .withIndex('by_user_week', (q) => q.eq('userId', userId).eq('weekKey', weekKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { stageBucket: bucket, optedIn: true });
      return { weekKey, stageBucket: bucket, optedIn: true };
    }
    await ctx.db.insert('leagueMemberships', {
      userId,
      weekKey,
      stageBucket: bucket,
      optedIn: true,
    });
    return { weekKey, stageBucket: bucket, optedIn: true };
  },
});

/**
 * Leave this week's league. Flips optedIn → false (keeps the row so the bucket
 * snapshot survives a re-opt). No-op if there's no membership row this week.
 */
export const leaveLeague = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user?.timezone) return { optedIn: false };

    const weekKey = weekKeyOf(localDateOf(Date.now(), user.timezone));
    const existing = await ctx.db
      .query('leagueMemberships')
      .withIndex('by_user_week', (q) => q.eq('userId', userId).eq('weekKey', weekKey))
      .unique();
    if (existing && existing.optedIn) await ctx.db.patch(existing._id, { optedIn: false });
    return { optedIn: false };
  },
});

/* ── Query ───────────────────────────────────────────────────────────── */

type LeagueEntry = { name: string; score: number; isMe: boolean };

/**
 * The viewer's league for THIS week. If opted in, lists every opted-in member in
 * the same weekKey + stageBucket (by_week_bucket), computes each one's SCORE =
 * clean check-ins this week, ranks desc (ties broken by name for a stable order),
 * and returns the viewer's rank. If not opted in, returns the bucket they WOULD
 * join so the screen can preview their segment before they commit.
 */
export const myLeague = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { optedIn: false, bucket: null, rank: null, entries: [] as LeagueEntry[] };
    const user = await ctx.db.get(userId);
    if (!user?.timezone) {
      return { optedIn: false, bucket: null, rank: null, entries: [] as LeagueEntry[] };
    }

    const today = localDateOf(Date.now(), user.timezone);
    const weekKey = weekKeyOf(today);
    const weekDates = weekLocalDates(today);

    const myMembership = await ctx.db
      .query('leagueMemberships')
      .withIndex('by_user_week', (q) => q.eq('userId', userId).eq('weekKey', weekKey))
      .unique();

    // Not opted in → surface the bucket they'd land in (for the opt-in preview).
    if (!myMembership || !myMembership.optedIn) {
      const wouldBe = await stageBucketFor(ctx, user, today);
      return { optedIn: false, bucket: wouldBe, rank: null, entries: [] as LeagueEntry[] };
    }

    const bucket = myMembership.stageBucket;
    const members = await ctx.db
      .query('leagueMemberships')
      .withIndex('by_week_bucket', (q) => q.eq('weekKey', weekKey).eq('stageBucket', bucket))
      .collect();

    const opted = members.filter((m) => m.optedIn);
    const scored = await Promise.all(
      opted.map(async (m) => {
        const member = await ctx.db.get(m.userId);
        const name = member?.name?.trim() || 'Anonymous';
        const score = await cleanCountForWeek(ctx, m.userId, weekDates);
        return { name, score, isMe: m.userId === userId };
      }),
    );

    // Rank by score desc; stable tie-break by name so order doesn't jitter.
    scored.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
    const rank = scored.findIndex((e) => e.isMe) + 1; // 1-based; >0 since I'm opted in

    return {
      optedIn: true,
      bucket,
      rank: rank > 0 ? rank : null,
      entries: scored as LeagueEntry[],
    };
  },
});
