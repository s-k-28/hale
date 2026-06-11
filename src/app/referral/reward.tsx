import { View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from 'convex/react'
import { Gift } from 'lucide-react-native'
import { api } from '@convex/_generated/api'
import { Screen, H1, Lead, Button, Badge } from '@/ui'
import { clean } from '@/theme/clean'

/**
 * Reward unlocked — the 7-day HALE+ celebration (design net-new screen).
 * Pure presentation over referrals.myProgress: the reward was already granted
 * server-side (exactly-once, at the 3rd completed referral) and REWARD_GRANTED
 * already fired from the pairing flow — no new grant logic, no new events.
 * Reached from the referral hub once the reward window is active.
 */
export default function RewardUnlocked() {
  const progress = useQuery(api.referrals.myProgress)
  const days = progress?.rewardDaysRemaining ?? 7

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-gutter">
        {/* warm = the together/referral lane */}
        <View className="h-[58px] w-[58px] items-center justify-center rounded-xl bg-warm">
          <Gift color={clean.warmInk} size={26} strokeWidth={2.2} />
        </View>
        <Badge label="Reward unlocked" tone="warm" className="mt-7" />
        <H1 className="mt-3">
          {days} {days === 1 ? 'day' : 'days'} of HALE+,{'\n'}on your friends
        </H1>
        <Lead className="mt-4">
          Full analytics, unlimited Sage, every tool, free because you brought your people
          with you. No card, nothing auto-charges.
        </Lead>
      </View>

      <View className="gap-2 px-gutter pb-[30px] pt-4">
        <Button
          variant="primary"
          label="Start using HALE+"
          onPress={() => router.replace('/(tabs)/today')}
        />
        <Button variant="ghost" label="Invite more friends" onPress={() => router.back()} />
      </View>
    </Screen>
  )
}
