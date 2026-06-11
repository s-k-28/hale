import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { localDateOf } from './model/streak';
import { pairKeyFor } from './model/buddy';
import { weekKeyOf, weekLocalDates } from './leagues';

/**
 * TEMPORARY dev-only helper for verifying the animation work live. Targets the
 * most-recently-created user (the device's current session, since `convex run`
 * has no auth context).
 *
 * Fully reverses today's check-in so the CHECK IN button genuinely re-enables:
 *   1. DELETE today's row in `checkins` — this is what `checkins.checkIn` actually
 *      gates `alreadyCheckedIn` on (NOT `lastCheckInLocalDate`). Without this the
 *      mutation returns {alreadyCheckedIn:true} and the button is a silent no-op.
 *   2. Reset `lastCheckInLocalDate` to YESTERDAY *in the user's own timezone*
 *      (matching how checkIn computes "today") so the next check-in continues the
 *      streak cleanly instead of tripping break/freeze logic.
 *
 * ⚠️ REMOVE BEFORE LAUNCH.
 */
export const uncheckIn = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const latest = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!latest) throw new Error('no users');

    const tz = latest.timezone ?? 'America/Chicago';
    const now = Date.now();
    const today = localDateOf(now, tz);
    const yesterday = localDateOf(now - 86_400_000, tz);

    // 1. Delete today's checkins row (the real gate).
    // Brute-force: clear EVERY today-row across ALL users so a duplicate from
    // earlier testing can never make checkIn's unique() throw, regardless of which
    // user the device session maps to.
    const allRows = await ctx.db.query('checkIns').collect();
    let cleared = 0;
    for (const row of allRows) {
      if (row.localDate === today) {
        await ctx.db.delete(row._id);
        cleared++;
      }
    }

    // 2. Reset last-check-in marker to yesterday for ALL users (so the DEVICE user
    // re-enables even when a seeded peer is the most-recently-created user).
    for (const u of users) {
      await ctx.db.patch(u._id, { lastCheckInLocalDate: yesterday });
    }

    return {
      ok: true,
      userId: latest._id,
      tz,
      today,
      clearedToday: cleared,
      lastCheckInLocalDate: yesterday,
    };
  },
});

/**
 * Backdate the active quit attempt's start so the live counter / milestone math
 * sees the user as N whole days clean — used to trigger the MilestoneCelebration
 * overlay live (it fires when a landmark day is crossed). `days` may be fractional
 * (e.g. 30.5 lands cleanly inside "30 days clean").
 *
 * ⚠️ REMOVE BEFORE LAUNCH.
 */
export const backdateQuit = mutation({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const users = await ctx.db.query('users').collect();
    const latest = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!latest?.currentAttemptId) throw new Error('no active quit attempt');
    const startDate = Date.now() - days * 86_400_000;
    await ctx.db.patch(latest.currentAttemptId, { startDate });
    return { ok: true, userId: latest._id, attemptId: latest.currentAttemptId, days, startDate };
  },
});

/**
 * Seed a Coach (Sage) thread for the latest user so the "with reply" state can be
 * captured for screenshots. ⚠️ REMOVE BEFORE LAUNCH.
 */
export const seedCoach = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const latest = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!latest) throw new Error('no users');
    const now = Date.now();
    await ctx.db.insert('sageMessages', {
      userId: latest._id,
      role: 'user',
      content: 'Really craving right now — work stress is brutal.',
      ts: now - 4000,
    });
    await ctx.db.insert('sageMessages', {
      userId: latest._id,
      role: 'sage',
      content:
        "I'm here with you. Cravings peak and pass in just a few minutes — try a few slow breaths and ride this wave out. You've got this.",
      ts: now - 2000,
    });
    return { ok: true, userId: latest._id };
  },
});

/**
 * Pair the latest user with an existing named user so the Squad PAIRED state can
 * be captured for screenshots. ⚠️ REMOVE BEFORE LAUNCH.
 */
export const seedBuddy = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const latest = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!latest) throw new Error('no users');
    const buddy = users.find((u) => u._id !== latest._id && !!u.name);
    if (!buddy) throw new Error('no buddy candidate with a name');
    // Clear BOTH sides' links (one-active-buddy invariant — model/buddy.ts) and
    // seed with the same sorted pairKey production code computes, so the seeded
    // row is visible to by_pair lookups and re-pairable via pairWith.
    const links = await ctx.db.query('buddyLinks').collect();
    for (const l of links) {
      if (
        l.userA === latest._id ||
        l.userB === latest._id ||
        l.userA === buddy._id ||
        l.userB === buddy._id
      )
        await ctx.db.delete(l._id);
    }
    const [userA, userB] = [latest._id, buddy._id].sort() as [typeof latest._id, typeof buddy._id];
    await ctx.db.insert('buddyLinks', {
      pairKey: pairKeyFor(latest._id, buddy._id),
      sharedStreak: 5,
      status: 'active',
      userA,
      userB,
      pairedAt: Date.now(),
      pairingMethod: 'invite_squad',
    });
    return { ok: true, latest: latest._id, buddy: buddy._id, buddyName: buddy.name };
  },
});

/**
 * Animation-verification helpers for the Coach screen states. ⚠️ REMOVE BEFORE LAUNCH.
 */

/** Delete all of the latest user's Sage messages → Coach shows the (breathing) empty state. */
export const clearSage = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const u = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!u) throw new Error('no users');
    const rows = await ctx.db.query('sageMessages').collect();
    let n = 0;
    for (const r of rows) {
      if (r.userId === u._id) {
        await ctx.db.delete(r._id);
        n++;
      }
    }
    return { ok: true, deleted: n };
  },
});

/** Reset to a single USER turn (no Sage reply) → the typing indicator shows persistently. */
export const seedUserTurn = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const u = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!u) throw new Error('no users');
    const rows = await ctx.db.query('sageMessages').collect();
    for (const r of rows) if (r.userId === u._id) await ctx.db.delete(r._id);
    await ctx.db.insert('sageMessages', {
      userId: u._id,
      role: 'user',
      content: 'what helps when its late at night and i cant sleep',
      ts: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Wipe ALL app data + users for a clean pre-launch verification state. Pair with
 * `simctl keychain reset` so the next launch creates a brand-new anonymous user
 * and walks onboarding from scratch. ⚠️ REMOVE BEFORE LAUNCH (dev-only).
 */
export const resetAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      'users',
      'quitAttempts',
      'checkIns',
      'cravings',
      'buddyLinks',
      'nudges',
      'sageMessages',
      'feedEvents',
      'squads',
      'squadMembers',
      'leagueMemberships',
      'savingsGoals',
      'matchRequests', // else stale 'waiting' rows pair fresh users with deleted ghosts
      'referrals',
      'activationEvents',
    ] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const r of rows) await ctx.db.delete(r._id);
      counts[t] = rows.length;
    }
    return { ok: true, deleted: counts };
  },
});

/** Set a specific user's Sage daily count (to verify the cap → sage_cap_hit). ⚠️ REMOVE BEFORE LAUNCH. */
export const setSageCount = mutation({
  args: { userId: v.id('users'), count: v.number(), localDate: v.string() },
  handler: async (ctx, { userId, count, localDate }) => {
    await ctx.db.patch(userId, { sageMsgLocalDate: localDate, sageMsgCount: count });
    return { ok: true };
  },
});

/**
 * Seed a WAITING matchmaking peer (user + attempt + waiting matchRequest) in the
 * vape / d0_7 / America-Chicago bucket so the device user's "Find me a buddy" tap
 * matches + pairs — to verify the matchmaking pairing + buddy-graph capture live.
 * ⚠️ REMOVE BEFORE LAUNCH (dev-only).
 */
export const seedWaitingPeer = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const peerId = await ctx.db.insert('users', {
      name: 'Casey',
      productType: 'vape',
      timezone: 'America/Chicago',
      isAnonymous: true,
    });
    const attemptId = await ctx.db.insert('quitAttempts', { userId: peerId, startDate: now, active: true });
    await ctx.db.patch(peerId, { currentAttemptId: attemptId });
    const reqId = await ctx.db.insert('matchRequests', {
      userId: peerId,
      productType: 'vape',
      stageBucket: 'd0_7',
      timezone: 'America/Chicago',
      status: 'waiting',
      createdAt: now,
    });
    return { ok: true, peerId, matchRequestId: reqId };
  },
});

/** Append a Sage reply for the latest user → the reply bubble fade-rises in. */
export const seedSageReply = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const u = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!u) throw new Error('no users');
    await ctx.db.insert('sageMessages', {
      userId: u._id,
      role: 'sage',
      content:
        "Late nights are when cravings get loud. Try this: dim the lights, two minutes of slow breathing, and a glass of cold water. The urge peaks and fades — you don't have to act on it.",
      ts: Date.now(),
    });
    return { ok: true };
  },
});

/* ─────────────────────────────────────────────────────────────────────────
 * Design-capture data-state seeders (screenshots). ⚠️ REMOVE BEFORE LAUNCH.
 * ───────────────────────────────────────────────────────────────────────── */

/** Toggle HALE+ on the latest (device) user → premium pill + unlocked analytics. */
export const setPremium = mutation({
  args: { premium: v.boolean() },
  handler: async (ctx, { premium }) => {
    const users = await ctx.db.query('users').collect();
    const u = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!u) throw new Error('no users');
    await ctx.db.patch(u._id, { premium });
    return { ok: true, userId: u._id, premium };
  },
});

/** Seed two savings goals → one in-progress card + one "Treat unlocked" card. */
export const seedGoals = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const u = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!u) throw new Error('no users');
    const existing = await ctx.db
      .query('savingsGoals')
      .withIndex('by_user', (q) => q.eq('userId', u._id))
      .collect();
    for (const g of existing) await ctx.db.delete(g._id);
    const now = Date.now();
    await ctx.db.insert('savingsGoals', { userId: u._id, label: 'New AirPods Max', targetAmount: 25, createdAt: now - 2000 });
    await ctx.db.insert('savingsGoals', { userId: u._id, label: 'Weekend in Austin', targetAmount: 90, createdAt: now - 1000 });
    return { ok: true, userId: u._id };
  },
});

/** Seed an owned public squad with a 6-week challenge → populated Squads hub. */
export const seedSquad = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const u = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!u) throw new Error('no users');
    const mine = await ctx.db
      .query('squadMembers')
      .withIndex('by_user', (q) => q.eq('userId', u._id))
      .collect();
    for (const m of mine) await ctx.db.delete(m._id);
    const now = Date.now();
    const squadId = await ctx.db.insert('squads', {
      name: 'Quit Crew',
      ownerId: u._id,
      isPublic: true,
      inviteCode: 'QUIT42',
      memberCount: 4,
      challengeStart: now - 9 * 86_400_000,
      challengeEnd: now + 33 * 86_400_000,
      challengeGoalDays: 42,
    });
    await ctx.db.insert('squadMembers', { squadId, userId: u._id, role: 'owner', joinedAt: now });
    return { ok: true, userId: u._id, squadId };
  },
});

/** Opt the user into this week's league + seed ranked peers → joined leaderboard. */
export const seedLeague = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const u = users.sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!u) throw new Error('no users');
    const tz = u.timezone ?? 'America/Chicago';
    const now = Date.now();
    const today = localDateOf(now, tz);
    const weekKey = weekKeyOf(today);
    const weekDates = weekLocalDates(today);
    const bucket = 'd0_7' as const;
    const existingMe = await ctx.db
      .query('leagueMemberships')
      .withIndex('by_user_week', (q) => q.eq('userId', u._id).eq('weekKey', weekKey))
      .unique();
    if (existingMe) await ctx.db.patch(existingMe._id, { optedIn: true, stageBucket: bucket });
    else await ctx.db.insert('leagueMemberships', { userId: u._id, weekKey, stageBucket: bucket, optedIn: true });
    if (u.currentAttemptId) {
      for (let i = 0; i < 4; i++)
        await ctx.db.insert('checkIns', { userId: u._id, attemptId: u.currentAttemptId, localDate: weekDates[i], status: 'clean', ts: now });
    }
    const peers: [string, number][] = [['Maya', 6], ['Devin', 5], ['Priya', 3], ['Sam', 2]];
    for (const [name, score] of peers) {
      const pid = await ctx.db.insert('users', { name, isAnonymous: true, timezone: tz });
      const pa = await ctx.db.insert('quitAttempts', { userId: pid, startDate: now - 4 * 86_400_000, active: true });
      await ctx.db.patch(pid, { currentAttemptId: pa });
      await ctx.db.insert('leagueMemberships', { userId: pid, weekKey, stageBucket: bucket, optedIn: true });
      for (let i = 0; i < score; i++)
        await ctx.db.insert('checkIns', { userId: pid, attemptId: pa, localDate: weekDates[i], status: 'clean', ts: now });
    }
    return { ok: true, userId: u._id, weekKey };
  },
});
