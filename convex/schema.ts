import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

/**
 * HALE schema — embodies the three committed decisions (see PRD §8 + ultrathink):
 *  • Decision 1: quitAttempts splits CURRENT clean-time (resets, honest) from
 *    LIFETIME ledger (preserved, pride). Timezone + localDate keys. Explicit indexes.
 *  • Decision 2: users created via anonymous auth (authTables) — no email gate.
 *  • Decision 3: relapse is a transactional mutation over quitAttempts + checkIns.
 */
export default defineSchema({
  ...authTables, // authAccounts, authSessions, etc. — Convex Auth manages these

  // users — extends the auth users table with HALE's quit profile + state
  users: defineTable({
    // identity (auth)
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    // locale — REQUIRED for correct streak math (Decision 1: timezone)
    timezone: v.optional(v.string()), // IANA, e.g. "America/Chicago"
    // quit profile (from onboarding O1)
    productType: v.optional(
      v.union(v.literal('vape'), v.literal('pouch'), v.literal('cig'), v.literal('mixed')),
    ),
    baselinePerDay: v.optional(v.number()), // units/day (puffs, pods, cigs)
    unitCost: v.optional(v.number()), // $ per unit
    triggers: v.optional(v.array(v.string())),
    hardestHour: v.optional(v.number()), // 0-23 local — seeds I3 + routine push
    motivation: v.optional(v.string()),
    // current state (denormalized cache — written ONLY by checkIn/relapse mutations)
    currentAttemptId: v.optional(v.id('quitAttempts')),
    currentStreak: v.optional(v.number()),
    longestStreak: v.optional(v.number()),
    lastCheckInLocalDate: v.optional(v.string()), // "YYYY-MM-DD" user tz
    freezesRemaining: v.optional(v.number()), // bounded (default 2)
    lapseGraceRemaining: v.optional(v.number()), // bounded soft-lapse grace per attempt
    // lifetime ledger — the anti-shame numbers, NEVER reset (Decision 3)
    lifetimeCleanDays: v.optional(v.number()),
    lifetimeMoneySaved: v.optional(v.number()),
    // monetization mirror (RC SDK entitlement is runtime source of truth)
    premium: v.optional(v.boolean()),
    oneSignalExternalId: v.optional(v.string()),
  }).index('email', ['email']),

  // quitAttempts — THE fix for I4↔§8. One row per attempt; current = active.
  quitAttempts: defineTable({
    userId: v.id('users'),
    startDate: v.number(), // epoch ms — the quit moment
    endDate: v.optional(v.number()), // set on relapse
    endReason: v.optional(v.union(v.literal('relapse'), v.literal('restart'))),
    active: v.boolean(),
  }).index('by_user_active', ['userId', 'active']),

  checkIns: defineTable({
    userId: v.id('users'),
    attemptId: v.id('quitAttempts'),
    localDate: v.string(), // "YYYY-MM-DD" user tz — the dedup key
    status: v.union(v.literal('clean'), v.literal('lapse'), v.literal('relapse')),
    mood: v.optional(v.number()),
    ts: v.number(),
  }).index('by_user_date', ['userId', 'localDate']),

  cravings: defineTable({
    userId: v.id('users'),
    attemptId: v.id('quitAttempts'),
    ts: v.number(),
    localHour: v.number(), // 0-23 — feeds trigger intelligence (I3)
    intensity: v.number(), // 1-5
    trigger: v.optional(v.string()),
    context: v.optional(v.string()),
    outcome: v.union(v.literal('survived'), v.literal('lapsed'), v.literal('relapsed')),
    resolvedBy: v.optional(v.string()), // breathing | sage | buddy | timer
  }).index('by_user_ts', ['userId', 'ts']),

  // buddyLinks — symmetric-safe pairing (Decision 1). pairKey = sorted "idA_idB".
  buddyLinks: defineTable({
    pairKey: v.string(),
    userA: v.id('users'),
    userB: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active'), v.literal('ended')),
    sharedStreak: v.number(),
    lastSharedLocalDate: v.optional(v.string()),
  })
    .index('by_pair', ['pairKey'])
    .index('by_userA', ['userA'])
    .index('by_userB', ['userB']),

  nudges: defineTable({
    fromUser: v.id('users'),
    toUser: v.id('users'),
    type: v.union(v.literal('cheer'), v.literal('support'), v.literal('rally')),
    ts: v.number(),
    readAt: v.optional(v.number()),
  }).index('by_to', ['toUser']),

  sageMessages: defineTable({
    userId: v.id('users'),
    role: v.union(v.literal('user'), v.literal('sage')),
    content: v.string(),
    ts: v.number(),
  }).index('by_user_ts', ['userId', 'ts']),

  // feedEvents — typed scope (not polymorphic) + SANITIZED payload (privacy).
  feedEvents: defineTable({
    scopeType: v.union(v.literal('buddy'), v.literal('squad')),
    scopeId: v.string(),
    actorId: v.id('users'),
    type: v.string(), // checkin | milestone | tough_moment | cheer
    payload: v.any(), // sanitized — NEVER raw craving detail
    ts: v.number(),
  }).index('by_scope_ts', ['scopeType', 'scopeId', 'ts']),

  // ── Phase 2 (post-launch) ──────────────────────────────────────
  squads: defineTable({
    name: v.string(),
    ownerId: v.id('users'),
    isPublic: v.boolean(),
    inviteCode: v.string(),
    memberCount: v.number(),
    // 6-week "stay clean together" challenge (StickK: 6–8wk + weekly cadence)
    challengeStart: v.optional(v.number()),
    challengeEnd: v.optional(v.number()),
    challengeGoalDays: v.optional(v.number()),
  })
    .index('by_invite', ['inviteCode'])
    .index('by_public', ['isPublic']),

  squadMembers: defineTable({
    squadId: v.id('squads'),
    userId: v.id('users'),
    role: v.union(v.literal('owner'), v.literal('member')),
    joinedAt: v.number(),
  })
    .index('by_squad', ['squadId'])
    .index('by_user', ['userId']),

  // Opt-in weekly leagues — segmented by quit-stage; ranked by consistency.
  leagueMemberships: defineTable({
    userId: v.id('users'),
    weekKey: v.string(), // "YYYY-Www"
    stageBucket: v.union(
      v.literal('d0_7'),
      v.literal('d8_30'),
      v.literal('d31_90'),
      v.literal('d90plus'),
    ),
    optedIn: v.boolean(),
  })
    .index('by_week_bucket', ['weekKey', 'stageBucket'])
    .index('by_user_week', ['userId', 'weekKey']),

  // "Treat yourself" savings goals (P4) — tangible reward for $ saved.
  savingsGoals: defineTable({
    userId: v.id('users'),
    label: v.string(),
    targetAmount: v.number(),
    createdAt: v.number(),
    achievedAt: v.optional(v.number()),
  }).index('by_user', ['userId']),

  // DERIVED (no table): live counter, $ saved, milestone curve, craving analytics,
  // league scores (counted from checkIns at query time).
});
