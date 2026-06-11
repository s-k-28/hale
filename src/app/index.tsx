import { Redirect } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { View, ActivityIndicator } from 'react-native';
import { api } from '@convex/_generated/api';
import { clean } from '@/theme/clean';

/**
 * Entry gate. Not signed in (or signed-in but no active quit) → onboarding;
 * otherwise → Today. Deferred-signup (Decision 2): a user can be authenticated
 * (anonymously) yet have no quit until they finish the quiz.
 */
export default function Index() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const today = useQuery(api.users.todayState, isAuthenticated ? {} : 'skip');

  if (isLoading || (isAuthenticated && today === undefined)) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={clean.accent} />
      </View>
    );
  }
  if (!isAuthenticated || today === null) return <Redirect href="/(onboarding)/welcome" />;
  return <Redirect href="/(tabs)/today" />;
}
