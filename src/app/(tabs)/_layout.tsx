import { Tabs } from 'expo-router';
import { useQuery } from 'convex/react';
import { House, Users, Sparkles, User } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { usePushTags } from '@/hooks/usePushTags';
import { colors } from '@/theme/colors';

/**
 * Mounts the OneSignal link + behavior-tag sync for the whole authed app. Lives
 * in the tab layout so it stays mounted across tabs (not just Today) and fires
 * once todayState resolves the user's id. Renders nothing. Degrades to a no-op
 * when OneSignal is unconfigured (the lib helpers short-circuit on a missing
 * app id), so it's always safe to mount.
 */
function PushSync() {
  const today = useQuery(api.users.todayState, {});
  const buddy = useQuery(api.buddies.myBuddy, {});
  usePushTags(today?.userId ?? null, today, !!buddy?.buddy);
  return null;
}

export default function TabsLayout() {
  return (
    <>
      <PushSync />
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.volt,
        tabBarInactiveTintColor: colors.ash,
        tabBarStyle: {
          backgroundColor: colors.coal,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: 'HankenGrotesk_600SemiBold', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="squad"
        options={{
          title: 'Squad',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={2.5} />,
        }}
      />
      </Tabs>
    </>
  );
}
