/**
 * Central env access. Every integration reads from here and degrades
 * gracefully when a key is absent (scaffold-now, wire-as-keys-arrive).
 */
export const env = {
  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL ?? '',
  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  revenueCatEntitlement: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? 'HALE+',
  oneSignalAppId: process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
} as const;

export const has = (key: keyof typeof env) => env[key].length > 0;
