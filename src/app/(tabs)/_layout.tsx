import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { House, Users, MessageCircle, User } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { usePushTags } from '@/hooks/usePushTags';
import { identifyUser, setCohortSnapshot } from '@/lib/analytics';
import { identifyPurchaser } from '@/lib/revenuecat';
import { quitStage } from '@convex/model/cohort';
import { clean } from '@/theme/clean';

/**
 * Whole-app session sync for authed users. Lives in the tab layout so it stays
 * mounted across tabs (not just Today) and fires once todayState resolves the
 * user's id. Renders nothing. Each piece degrades to a no-op when its service
 * is unconfigured, so it's always safe to mount:
 *   - identifyUser → attributes PostHog events to the Convex user id (== the
 *     OneSignal/RevenueCat external id), so the funnel is per-user.
 *   - usePushTags → links the OneSignal device + mirrors behavior-targeting tags.
 */
function PushSync() {
  // Auth-gated (consistency with the tab screens): avoids anonymous-context
  // snapshots while auth attaches on a fresh mount.
  const { isAuthenticated } = useConvexAuth();
  const today = useQuery(api.users.todayState, isAuthenticated ? {} : 'skip');
  const buddy = useQuery(api.buddies.myBuddy, isAuthenticated ? {} : 'skip');
  const uid = today?.userId ?? null;
  const hasBuddy = !!buddy?.buddy;
  // Live cohort dims for the EVENT-level snapshot (immune to person-on-events drift).
  const pairedSolo: 'solo' | 'paired' = hasBuddy ? 'paired' : 'solo';
  const tier: 'free' | 'trial' | 'paid' = today?.premium
    ? 'paid'
    : today?.trialActive
      ? 'trial'
      : 'free';
  const stage = today?.quitStart ? quitStage(today.quitStart, Date.now()) : undefined;
  const tz = today?.timezone ?? undefined;

  // Attribute events to the Convex user id AND refresh the live cohort snapshot
  // (paired/solo + tier + quit_stage + timezone) merged into every event by
  // track() — so the wedge retention/LTV split is captured at the event level,
  // never lost to ingest-time person-property drift. Person props enriched too
  // for person-level filters. Re-runs when buddy/tier/stage resolve or change.
  useEffect(() => {
    setCohortSnapshot({
      paired_solo_status: pairedSolo,
      tier,
      quit_stage: stage,
      timezone: tz,
    });
    if (uid) identifyUser(uid, { has_buddy: hasBuddy, paired_solo_status: pairedSolo, tier, quit_stage: stage });
  }, [uid, hasBuddy, pairedSolo, tier, stage, tz]);

  // RevenueCat: app_user_id == Convex user _id so the /revenuecat/webhook
  // entitlement→users.premium mirror can match. Idempotent + scaffold-safe.
  useEffect(() => {
    if (uid) identifyPurchaser(uid);
  }, [uid]);

  usePushTags(uid, today, hasBuddy);
  return null;
}

export default function TabsLayout() {
  return (
    <>
      <PushSync />
      <Tabs
      screenOptions={{
        headerShown: false,
        // Cross-fade between tabs instead of an instant cut — the per-tab screen
        // transition. Pairs with each screen's content RiseIn (translateY+opacity)
        // so switching tabs feels like the new screen settling in, not snapping.
        animation: 'fade',
        tabBarActiveTintColor: clean.accent,
        tabBarInactiveTintColor: clean.fg3,
        tabBarStyle: {
          backgroundColor: clean.bg,
          borderTopColor: clean.stroke,
          borderTopWidth: 1,
          height: 86,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: 'Sora_600SemiBold', fontSize: 10.5, letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="squad"
        options={{
          title: 'Squad',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={2} />,
        }}
      />
      </Tabs>
    </>
  );
}
