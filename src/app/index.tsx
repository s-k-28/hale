import { Redirect } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { View, ActivityIndicator } from 'react-native';
import { api } from '@convex/_generated/api';
import { clean } from '@/theme/clean';
import { usePremium } from '@/hooks/usePremium';
import { revenueCatConfigured } from '@/lib/paywall';
import { Flag, useFlag } from '@/lib/experiments';

/**
 * Entry gate. Three outcomes:
 *   1. Not signed in, or signed-in with no active quit → onboarding.
 *   2. Onboarded but NOT entitled → the hard paywall (re-presented). This closes
 *      the force-quit-during-onboarding bypass: an onboarded user can't reach the
 *      app without an active HALE+ (StoreKit trial/subscription or the referral
 *      reward). Enforced ONLY when RevenueCat is configured, so dev/scaffold
 *      builds (no keys) stay fully usable.
 *   3. Onboarded and entitled → Today.
 *
 * Deferred-signup (Decision 2): a user can be authenticated (anonymously) yet
 * have no quit until they finish the quiz.
 */
export default function Index() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const today = useQuery(api.users.todayState, isAuthenticated ? {} : 'skip');
  const { hasHALEPlus, loading: premiumLoading } = usePremium();
  // Posture is PostHog-controlled so the founder can soften the entry re-wall
  // to 'soft' instantly without a rebuild. Defaults to 'hard' (the product
  // direction). The onboarding wall is hard regardless of this flag.
  const posture = useFlag(Flag.PAYWALL_POSTURE, 'hard');

  if (isLoading || (isAuthenticated && today === undefined)) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={clean.accent} />
      </View>
    );
  }

  // Not signed in or not onboarded → onboarding.
  if (!isAuthenticated || today === null) return <Redirect href="/(onboarding)/welcome" />;

  // Hard paywall enforcement. `today` is resolved here, so usePremium's mirror
  // signal has resolved too (premiumLoading is already false); we still guard on
  // it so a genuinely-entitled user (RC runtime OR Convex mirror OR referral
  // reward) is never bounced. Only enforce when RevenueCat is live and posture
  // is 'hard'.
  if (posture === 'hard' && revenueCatConfigured() && !premiumLoading && !hasHALEPlus) {
    return <Redirect href={{ pathname: '/paywall', params: { from: 'locked_out' } }} />;
  }

  return <Redirect href="/(tabs)/today" />;
}
