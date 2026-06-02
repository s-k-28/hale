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
  // Monetization
  TRIAL_STARTED: 'trial_started',
  PAYWALL_VIEWED: 'paywall_viewed',
  PURCHASE_COMPLETED: 'purchase_completed',
  // Phase 2 (post-launch) — squads, leagues, rally, goals, analytics
  SQUAD_CREATED: 'squad_created',
  SQUAD_JOINED: 'squad_joined',
  SQUAD_INVITED: 'squad_invited',
  SQUAD_LEFT: 'squad_left',
  CHALLENGE_COMPLETED: 'challenge_completed',
  LEAGUE_OPTIN: 'league_optin',
  RALLY_SENT: 'rally_sent',
  SAVINGS_GOAL_SET: 'savings_goal_set',
  ANALYTICS_VIEWED: 'analytics_viewed',
} as const;

export type EventName = (typeof Ev)[keyof typeof Ev];

let client: PostHog | null = null;

export function initAnalytics(): PostHog | null {
  if (!has('posthogKey')) return null; // no key yet → no-op (scaffold mode)
  if (!client) {
    client = new PostHog(env.posthogKey, { host: env.posthogHost });
  }
  return client;
}

/** Cohort/wedge properties (has_buddy, coach_used, plan_type) attach here. */
export function identifyUser(userId: string, props?: Record<string, any>) {
  client?.identify(userId, props);
}

export function track(event: EventName, props?: Record<string, any>) {
  // Dev-observable: every event prints to the Metro log so firing is verifiable
  // even before EXPO_PUBLIC_POSTHOG_KEY is set (delivery to PostHog needs the key).
  if (__DEV__) console.log('[ev]', event, props ? JSON.stringify(props) : '');
  client?.capture(event, props);
}
