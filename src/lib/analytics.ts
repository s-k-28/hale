import PostHog from 'posthog-react-native';
import { env, has } from './config';

/**
 * The §9 event map — single source of truth. Every Phase-1 feature MUST
 * fire its events from this enum so the 4 north-star metrics stay wired:
 *   1. Activation funnel   2. Social density   3. Wedge (paired vs solo)
 *   4. Coach efficacy      (+ guardrail: relapse recovery, + virality)
 */
export const Ev = {
  // Onboarding / activation funnel (O1)
  ONBOARDING_STARTED: 'onboarding_started',
  PLAN_VIEWED: 'plan_viewed',
  QUIT_COMMITTED: 'quit_committed',
  // Progress (P1/P2/P3)
  COUNTER_VIEWED: 'counter_viewed',
  CHECKIN_COMPLETED: 'checkin_completed',
  STREAK_FREEZE_USED: 'streak_freeze_used',
  MILESTONE_REACHED: 'milestone_reached',
  CARD_SHARED: 'card_shared',
  // Social (S1/S2)
  BUDDY_INVITED: 'buddy_invited',
  BUDDY_PAIRED: 'buddy_paired',
  NUDGE_SENT: 'nudge_sent',
  NUDGE_OPENED: 'nudge_opened',
  // Intelligence (I1/I2/I3/I4)
  CRAVING_SOS_OPENED: 'craving_sos_opened',
  CRAVING_LOGGED: 'craving_logged',
  CRAVING_SURVIVED: 'craving_survived',
  COACH_MESSAGE_SENT: 'coach_message_sent',
  COACH_SESSION: 'coach_session',
  PROACTIVE_NUDGE_SENT: 'proactive_nudge_sent',
  RELAPSE_LOGGED: 'relapse_logged',
  RELAPSE_RECOVERED: 'relapse_recovered',
  // Notifications (#9)
  PUSH_OPENED: 'push_opened',
  // Monetization
  TRIAL_STARTED: 'trial_started',
  PAYWALL_VIEWED: 'paywall_viewed',
  PURCHASE_COMPLETED: 'purchase_completed',
  // Buddy-activation (P1) — pairing as the activation event + matchmaking + nudge
  INVITE_OFFERED: 'invite_offered',
  SOLO_BRIDGE_TAKEN: 'solo_bridge_taken',
  MATCHMAKING_REQUESTED: 'matchmaking_requested',
  MATCHMAKING_MATCHED: 'matchmaking_matched',
  MATCHMAKING_NO_MATCH: 'matchmaking_no_match',
  UNPAIRED_NUDGE_SENT: 'unpaired_nudge_sent',
  UNPAIRED_NUDGE_OPENED: 'unpaired_nudge_opened',
  // Activation instrumentation (P2) — north-star + candidate activation events
  ACTIVATED_PAIRED_QUITTER: 'activated_paired_quitter',
  FIRST_CHECK_IN: 'first_check_in',
  FIRST_SOS: 'first_sos',
  FIRST_SAGE_MESSAGE: 'first_sage_message',
  // Sage cost controls (P3)
  SAGE_MESSAGE_COMPLETED: 'sage_message_completed',
  SAGE_CAP_HIT: 'sage_cap_hit',
  // Relapse signal (P2 — relapse-prediction dataset)
  RELAPSE_TRIGGER_NAMED: 'relapse_trigger_named',
  // Phase 2 (post-launch) — squads, leagues, rally. Several of these are
  // intentionally NOT fired in Phase 1 (the squads/leagues/rally surfaces are
  // built but gated off); they're defined here so the taxonomy is stable when
  // Phase 2 lights them up. SAVINGS_GOAL_SET/GOAL_DELETED + ANALYTICS_VIEWED ARE
  // fired today (goals + insights screens ship in Phase 1).
  SQUAD_CREATED: 'squad_created',
  SQUAD_JOINED: 'squad_joined',
  SQUAD_INVITED: 'squad_invited',
  SQUAD_LEFT: 'squad_left',
  CHALLENGE_COMPLETED: 'challenge_completed',
  LEAGUE_OPTIN: 'league_optin',
  RALLY_SENT: 'rally_sent',
  SAVINGS_GOAL_SET: 'savings_goal_set',
  GOAL_DELETED: 'goal_deleted',
  ANALYTICS_VIEWED: 'analytics_viewed',
} as const;

export type EventName = (typeof Ev)[keyof typeof Ev];

/**
 * Single shared PostHog client, created eagerly (at import) when a key is present.
 * BOTH track()/identifyUser() here AND `<PostHogProvider client={posthog}>`
 * (src/app/_layout.tsx) use this SAME instance — two PostHog instances sharing one
 * key clash on on-device persistence (distinct_id + event queue), so there must be
 * exactly one. Null in scaffold mode (no key) → every call below is a safe no-op.
 *
 * Previously `track()` used a lazily-initialized client that was NEVER initialized
 * (initAnalytics had no callers), so every capture() silently dropped. This is the fix.
 */
export const posthog: PostHog | null = has('posthogKey')
  ? new PostHog(env.posthogKey, { host: env.posthogHost })
  : null;

/** Back-compat: the client is now an eager singleton (see `posthog` above). */
export function initAnalytics(): PostHog | null {
  return posthog;
}

/** Cohort/wedge properties (has_buddy, coach_used, plan_type) attach here. */
export function identifyUser(userId: string, props?: Record<string, any>) {
  posthog?.identify(userId, props);
}

/**
 * Event-level cohort snapshot. PostHog runs in person-on-events mode here, so a
 * person-property (e.g. has_buddy) is stamped at INGEST time — a check-in fired
 * before pairing is permanently "solo", making the paired-vs-solo retention/LTV
 * split (the wedge north-star) lossy and unrecoverable. To protect that forever,
 * we merge a LIVE cohort snapshot into every event. setCohortSnapshot() is called
 * from the always-mounted PushSync effect whenever todayState / buddy resolve, so
 * cohort lives at the EVENT level and is immune to person-property drift.
 *
 * Only the always-relevant dims live here (paired_solo_status / tier / quit_stage /
 * timezone). Event-specific dims (invite_source, pairing_method) are passed
 * explicitly by the buddy events and override the snapshot.
 */
export type CohortSnapshot = {
  paired_solo_status?: 'solo' | 'paired';
  tier?: 'free' | 'trial' | 'paid';
  quit_stage?: string;
  timezone?: string;
};
let _cohort: CohortSnapshot = {};
export function setCohortSnapshot(snapshot: CohortSnapshot) {
  _cohort = { ..._cohort, ...snapshot };
}
export function cohortProps(): CohortSnapshot {
  return _cohort;
}

export function track(event: EventName, props?: Record<string, any>) {
  // Merge the live cohort snapshot so every event carries paired/solo + tier +
  // quit_stage at the EVENT level; explicit props win over the snapshot defaults.
  const merged = { ..._cohort, ...(props ?? {}) };
  // Dev-observable: every event prints to the Metro log so firing is verifiable.
  if (__DEV__) console.log('[ev]', event, JSON.stringify(merged));
  posthog?.capture(event, merged);
}
