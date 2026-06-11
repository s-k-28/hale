import { View, ActivityIndicator } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { Screen, Body } from '@/ui'
import { clean } from '@/theme/clean'

/**
 * Friendly referral deep link (hale://r/<code>). Resolves the human-readable
 * referral code to its referrer userId, then hands off to the canonical buddy
 * deep-link handler (u/[id]) so attribution + auto-pair + the referral trigger
 * all run through one code path. An unknown code just lands them in the app.
 */
export default function ReferralCode() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const resolved = useQuery(api.referrals.resolveCode, code ? { code } : 'skip')

  if (!code) return <Redirect href="/(tabs)/today" />
  if (resolved === undefined) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator color={clean.accent} />
          <Body className="mt-4 text-center">Opening your invite…</Body>
        </View>
      </Screen>
    )
  }
  if (resolved === null) return <Redirect href="/(tabs)/today" />
  return <Redirect href={`/u/${resolved.userId}`} />
}
