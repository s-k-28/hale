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
    lastProactiveNudgeLocalDate: v.optional(v.string()), // I3 — dedup proactive nudge to 1/local-day
    // push fatigue cap (§9) — at most N server pushes per user per local day
    pushSentLocalDate: v.optional(v.string()), // "YYYY-MM-DD" user tz the count below applies to
    pushSentCount: v.optional(v.number()), // pushes delivered on pushSentLocalDate
    // Sage daily cap + cost ledger (P3) — mirror the pushSent* pattern.
    sageMsgLocalDate: v.optional(v.string()), // "YYYY-MM-DD" user tz the count applies to
    sageMsgCount: v.optional(v.number()), // Sage messages sent on sageMsgLocalDate (cap check)
    sageCostMtdUsd: v.optional(v.number()), // month-to-date Sage cost proxy ($)
    freezesRemaining: v.optional(v.number()), // bounded (default 2)
    lapseGraceRemaining: v.optional(v.number()), // bounded soft-lapse grace per attempt
    // lifetime ledger — the anti-shame numbers, NEVER reset (Decision 3)
    lifetimeCleanDays: v.optional(v.number()),
    lifetimeMoneySaved: v.optional(v.number()),
    // monetization mirror (RC SDK entitlement is runtime source of truth)
    premium: v.optional(v.boolean()),
    // app-managed trial (§8) — granted at onboarding; paywall gates after expiry
    trialStartedAt: v.optional(v.number()), // epoch ms — when the 14-day window began
    trialEndsAt: v.optional(v.number()), // epoch ms — trialStartedAt + 14d
    trialReminderSent: v.optional(v.boolean()), // dedup the one trial-ending email
    // referral reward (HALE+ unlock for inviting buddies). A 3rd successful
    // referral (invitee INSTALLS via the link AND PAIRS as this user's buddy)
    // grants a 7-day HALE+ window — app-managed, exactly like the trial above, so
    // it works offline and needs no store round-trip. resolveEntitlement OR's this
    // into the single hasHALEPlus check alongside premium + trial. No auto-charge.
    referralCode: v.optional(v.string()), // this user's own shareable code (idempotent)
    referredBy: v.optional(v.id('users')), // attribution — set ONCE, self-ref blocked
    referralRewardEndsAt: v.optional(v.number()), // epoch ms — reward window end
    referralRewardGrantedAt: v.optional(v.number()), // grant-exactly-once marker
    oneSignalExternalId: v.optional(v.string()),
  })
    .index('email', ['email'])
    .index('by_referralCode', ['referralCode']),

  // quitAttempts — THE fix for I4↔§8. One row per attempt; current = active.
  quitAttempts: defineTable({
    userId: v.id('users'),
    startDate: v.number(), // epoch ms — the quit moment
    endDate: v.optional(v.number()), // set on relapse
    endReason: v.optional(v.union(v.literal('relapse'), v.literal('restart'))),
    endTrigger: v.optional(v.string()), // I4 — what pulled them back (trigger intelligence)
    // Relapse-prediction signal (q4): # of lapse check-ins this attempt accrued
    // before it ended in a relapse. Set in relapse.logRelapse on the closing attempt.
    lapseCountBeforeRelapse: v.optional(v.number()),
    active: v.boolean(),
  }).index('by_user_active', ['userId', 'active']),

  // activationEvents — the compounding data moat (P2). Makes activation a DISTINCT,
  // queryable Convex fact so a post-launch D30 retention-split can COMPARE the four
  // candidate activation events directly (q1), not reconstruct them. Written
  // idempotently server-side (one row per user per kind); the client mirrors each to
  // PostHog so the same fact is sliceable behaviorally too.
  activationEvents: defineTable({
    userId: v.id('users'),
    kind: v.union(
      v.literal('activated_paired_quitter'), // north-star activation
      v.literal('first_check_in'),
      v.literal('first_sos'),
      v.literal('first_sage_message'),
    ),
    ts: v.number(),
    pairedSolo: v.union(v.literal('solo'), v.literal('paired')),
    pairingMethod: v.optional(v.string()),
    quitStage: v.string(),
  })
    .index('by_user_kind', ['userId', 'kind']) // idempotent first-time guard
    .index('by_kind_ts', ['kind', 'ts']), // cohort / retention-split queries

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
  // pairedAt/pairingMethod/initiatorId capture the WHEN + HOW + WHO of the edge —
  // the buddy-graph data the brief flags as "hard to change after launch" and the
  // basis for K-factor (invite→accept timing) + the 48h activation window.
  buddyLinks: defineTable({
    pairKey: v.string(),
    userA: v.id('users'),
    userB: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active'), v.literal('ended')),
    sharedStreak: v.number(),
    lastSharedLocalDate: v.optional(v.string()),
    pairedAt: v.optional(v.number()), // epoch ms the link first went active (WHEN)
    endedAt: v.optional(v.number()), // epoch ms the link was unpaired (churn timing)
    pairingMethod: v.optional(
      v.union(
        v.literal('invite_onboard'),
        v.literal('invite_squad'),
        v.literal('matchmaking'),
      ),
    ), // HOW the pair formed (path)
    initiatorId: v.optional(v.id('users')), // WHO initiated (K-factor: invites→accepts)
  })
    .index('by_pair', ['pairKey'])
    .index('by_userA', ['userA'])
    .index('by_userB', ['userB']),

  // matchRequests — matchmaking pool + audit (P1). A solo onboarding user with no
  // invite gets matched to another waiting quitter by product type + quit-stage +
  // timezone. Persisted (not ephemeral) so pool dynamics + match paths are queryable.
  matchRequests: defineTable({
    userId: v.id('users'),
    productType: v.union(
      v.literal('vape'),
      v.literal('pouch'),
      v.literal('cig'),
      v.literal('mixed'),
    ),
    stageBucket: v.union(
      v.literal('d0_7'),
      v.literal('d8_30'),
      v.literal('d31_90'),
      v.literal('d90plus'),
    ),
    timezone: v.string(),
    status: v.union(
      v.literal('waiting'),
      v.literal('matched'),
      v.literal('unmatched'),
      v.literal('expired'),
    ),
    matchedLinkId: v.optional(v.id('buddyLinks')),
    createdAt: v.number(),
  })
    .index('by_status_match', ['status', 'productType', 'stageBucket', 'timezone'])
    .index('by_user', ['userId']),

  nudges: defineTable({
    fromUser: v.id('users'),
    toUser: v.id('users'),
    type: v.union(v.literal('cheer'), v.literal('support'), v.literal('rally')),
    ts: v.number(),
    readAt: v.optional(v.number()),
  }).index('by_to', ['toUser']),

  // referrals — one directed edge per (referrer, invitee). The referral reward
  // loop's source of truth. A row is 'attributed' when the invitee installs via
  // the referrer's link (set at onboarding commit), then 'completed' when that
  // invitee PAIRS as the referrer's buddy (the bar — install alone never counts).
  // The (referrerId, inviteeId) pair is the dedupe key: an invitee counts at most
  // once per referrer, and re-pairs are idempotent. Unpair after counting is a
  // no-op (completed stays completed; granted rewards run their full window — no
  // clawback).
  referrals: defineTable({
    referrerId: v.id('users'), // who shared the link
    inviteeId: v.id('users'), // who installed via it
    code: v.string(), // referrer's referralCode at attribution time
    installedAt: v.number(), // epoch ms — attribution (onboarding commit)
    pairedAt: v.optional(v.number()), // epoch ms — when invitee paired with referrer
    status: v.union(
      v.literal('attributed'), // installed via link, not yet paired
      v.literal('completed'), // installed AND paired — counts toward the 3
      v.literal('void'), // reserved (e.g. self-ref guard slip)
    ),
    countedAt: v.optional(v.number()), // epoch ms — when it counted (== pairedAt)
  })
    .index('by_referrer', ['referrerId'])
    .index('by_invitee', ['inviteeId'])
    .index('by_pair', ['referrerId', 'inviteeId']),

  sageMessages: defineTable({
    userId: v.id('users'),
    role: v.union(v.literal('user'), v.literal('sage')),
    content: v.string(),
    ts: v.number(),
    // Per-message token/cost ledger (P3) — set on the SAGE reply row so real
    // Sage cost-per-payer is queryable by tier (the brief: measure, don't guess).
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsdProxy: v.optional(v.number()),
    userTier: v.optional(v.union(v.literal('free'), v.literal('trial'), v.literal('paid'))),
    cacheHit: v.optional(v.boolean()),
    model: v.optional(v.string()),
  })
    .index('by_user_ts', ['userId', 'ts'])
    .index('by_user_tier_ts', ['userId', 'userTier', 'ts']),

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
