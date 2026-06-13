import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
// Clean Dark (v2) — Sora is the single type family.
import {
  Sora_300Light,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { PostHogProvider } from 'posthog-react-native';
import { env } from '@/lib/config';
import { initRevenueCat } from '@/lib/revenuecat';
import { initOneSignal } from '@/lib/onesignal';
import { initSentry } from '@/lib/sentry';
import { posthog, initAnalyticsConsent } from '@/lib/analytics';
import { Toaster } from 'sonner-native';

initSentry();
SplashScreen.preventAutoHideAsync();

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
  const [fontsLoaded] = useFonts({
    Sora_300Light,
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
  });

  useEffect(() => {
    initRevenueCat();
    initOneSignal();
    // Re-apply a stored analytics opt-out before any meaningful capture
    // (Guideline 5.1.1(ii): consent is withdrawable from You ▸ Settings).
    void initAnalyticsConsent();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  const tree = (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
        <StatusBar style="light" />
        {/* Global screen transition: content fades + slides up on enter
            (translateY + opacity), replacing the default right-push. Native
            preset = 60fps on the UI thread; modals below opt into their own
            slide-up presentation. */}
        <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
          {/* fullScreenModal (not pageSheet): SOS is a crisis surface and the
              paywall is a deliberate decision point — neither may show the
              screen behind through a top gap nor be drag-dismissed by the
              system gesture (ui-audit root cause #1). Both screens carry their
              own explicit dismiss affordances. */}
          <Stack.Screen name="sos" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal' }} />
        </Stack>
        {/* App-wide transient feedback (sonner-native). Sibling of the navigator so
            toasts overlay every screen; SafeArea/GestureHandler contexts come from
            expo-router's root. Short duration so a toast can't linger onto the next
            screen after navigation (e.g. a check-in toast bleeding onto Coach). */}
        <Toaster duration={2500} />
    </ConvexAuthProvider>
  );

  // PostHog wraps the tree only when configured. Pass the SHARED client (see
  // lib/analytics.ts) so usePostHog() and track() are the same instance.
  const app = posthog ? (
    <PostHogProvider client={posthog} autocapture={false}>
      {tree}
    </PostHogProvider>
  ) : (
    tree
  );

  // GestureHandlerRootView must wrap the whole app so react-native-gesture-handler
  // detectors work — sonner-native toasts (swipe-to-dismiss) and @gorhom/bottom-sheet
  // both require it. Nothing used a GestureDetector before, so it was never needed.
  return <GestureHandlerRootView style={{ flex: 1 }}>{app}</GestureHandlerRootView>;
}
