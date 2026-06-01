import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { PostHogProvider } from 'posthog-react-native';
import { TamaguiProvider } from 'tamagui';
import tamaguiConfig from '../../tamagui.config';
import { env, has } from '@/lib/config';
import { initRevenueCat } from '@/lib/revenuecat';
import { initOneSignal } from '@/lib/onesignal';
import { initSentry } from '@/lib/sentry';

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
    Anton_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });

  useEffect(() => {
    initRevenueCat();
    initOneSignal();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  const tree = (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sos" options={{ presentation: 'modal' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        </Stack>
      </TamaguiProvider>
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
