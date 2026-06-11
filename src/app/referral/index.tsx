import { View, ScrollView } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { Screen, IconBtn, H1, Lead, Button } from '@/ui'
import { ReferralCard } from '@/components/ReferralCard'
import { clean } from '@/theme/clean'

/**
 * Referral hub — "Quit together, unlock HALE+ free" (design net-new screen).
 * Dual-entry (the design's late nav rewire): the onboarding buddy step pushes
 * it with ?from=onboarding (back returns to the quiz step, plus a ghost
 * "Skip for now" exit to Today); the You tab pushes it plain (back pops home).
 *
 * All referral data/actions live in ReferralCard (myProgress +
 * getOrCreateMyCode + the share flow) — this screen is chrome + framing, no
 * new backend logic.
 */
export default function ReferralHub() {
  const { from } = useLocalSearchParams<{ from?: string }>()
  const fromOb = from === 'onboarding'
  const progress = useQuery(api.referrals.myProgress)

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-1">
        <IconBtn onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft color={clean.fg} size={22} strokeWidth={2.2} />
        </IconBtn>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName={`px-gutter pt-4 ${fromOb ? 'pb-44' : 'pb-16'}`}
        showsVerticalScrollIndicator={false}
      >
        <H1>
          Quit together,{'\n'}unlock HALE+ free
        </H1>
        <Lead className="mt-3">
          Every friend you bring makes quitting stick, for both of you. Three friends who join
          and pair up unlock a free week of everything.
        </Lead>

        <ReferralCard surface={fromOb ? 'referral_hub_onboarding' : 'referral_hub'} />

        <Button
          variant="ghost"
          label="Preview the invite message"
          onPress={() => router.push({ pathname: '/referral/share', params: from ? { from } : {} })}
          className="mt-2"
        />
        {progress?.rewardActive ? (
          <Button
            variant="warm"
            label="See your unlocked reward"
            onPress={() => router.push('/referral/reward')}
            className="mt-2"
          />
        ) : null}
      </ScrollView>

      {fromOb ? (
        <View className="absolute bottom-0 left-0 right-0 bg-bg px-gutter pb-[30px] pt-2">
          <Button
            variant="ghost"
            label="Skip for now"
            onPress={() => router.replace('/(tabs)/today')}
          />
        </View>
      ) : null}
    </Screen>
  )
}
