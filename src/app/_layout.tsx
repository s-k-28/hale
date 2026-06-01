import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { PostHogProvider } from 'posthog-react-native';
import { env, has } from '@/lib/config';
import { initRevenueCat } from '@/lib/revenuecat';
import { initOneSignal } from '@/lib/onesignal';
import { initSentry } from '@/lib/sentry';

initSentry();

const convex = new ConvexReactClient(env.convexUrl || 'https://placeholder.convex.cloud', {
  unsavedChangesWarning: false,
});

// Convex Auth stores its session in Expo SecureStore on device (Decision 2).
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: SecureStore.deleteItemAsync,
};

export default function RootLayout() {
  useEffect(() => {
    initRevenueCat();
    initOneSignal();
  }, []);

  const tree = (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sos" options={{ presentation: 'modal' }} />
      </Stack>
    </ConvexAuthProvider>
  );

  // PostHog wraps the tree only when a key is present (scaffold-safe).
  return has('posthogKey') ? (
    <PostHogProvider apiKey={env.posthogKey} options={{ host: env.posthogHost }} autocapture={false}>
      {tree}
    </PostHogProvider>
  ) : (
    tree
  );
}
