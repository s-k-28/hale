import { Tabs } from 'expo-router';
import { House, Users, Sparkles, User } from 'lucide-react-native';
import { colors } from '@/theme/colors';

export default function TabsLayout() {
  return (
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
  );
}
