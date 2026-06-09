import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { ActivityIndicator } from 'react-native'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { track, Ev } from '@/lib/analytics'
import { setPendingBuddy } from '@/lib/pendingBuddy'
import { Screen } from '@/components/ui/Screen'
import { Heading, Body } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { colors } from '@/theme/colors'

/**
 * Buddy-invite deep-link handler (S1/S2). Reachable via hale://u/<inviterId>.
 *
 * - Authenticated + onboarded  → pair now, fire BUDDY_PAIRED, land on Squad.
 * - Not signed in / not onboarded → stash the inviter id and route through
 *   onboarding; the quiz commit redeems it (auto-pair on first open).
 */
export default function AcceptInvite() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const today = useQuery(api.users.todayState, isAuthenticated ? {} : 'skip')
  const pairWith = useMutation(api.buddies.pairWith)

  const ranRef = useRef(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (ranRef.current || isLoading || !id) return

    // Brand-new or not-yet-onboarded invitee → stash + send through onboarding.
    if (!isAuthenticated || today === null) {
      ranRef.current = true
      void setPendingBuddy(id)
      router.replace('/(onboarding)/welcome')
      return
    }

    // Authenticated but the gate query is still resolving — wait a tick.
    if (today === undefined) return

    // Authenticated + onboarded → pair immediately.
    ranRef.current = true
    ;(async () => {
      try {
        const referrerId = id as Id<'users'>
        const pair = await pairWith({ inviterId: referrerId, pairingMethod: 'invite_squad' })
        track(Ev.BUDDY_PAIRED, { via: 'deep_link', pairing_method: 'invite_squad' })
        // If this pairing completed a referral (the opener was attributed to this
        // referrer at install), surface the funnel events keyed on the referrer.
        if (pair?.referralCompleted) track(Ev.REFERRAL_BUDDY_PAIRED, { referrer_id: referrerId })
        if (pair?.referrerReachedGoal) track(Ev.REFERRAL_COMPLETED, { referrer_id: referrerId })
        if (pair?.rewardGranted) track(Ev.REWARD_GRANTED, { referrer_id: referrerId, reward_days: 7 })
        router.replace('/(tabs)/squad')
      } catch {
        setError(true)
      }
    })()
  }, [isLoading, isAuthenticated, today, id, pairWith])

  if (!id) return <Redirect href="/(tabs)/today" />

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        {error ? (
          <>
            <Heading className="text-center text-2xl">Couldn’t pair you up</Heading>
            <Body className="mt-3 text-center text-base leading-6 text-ash">
              That invite link looks invalid or expired. Ask your buddy to send a fresh one.
            </Body>
            <Button
              variant="primary"
              label="GO TO HALE"
              onPress={() => router.replace('/(tabs)/today')}
              className="mt-8 w-full"
            />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.volt} />
            <Heading className="mt-6 text-center text-2xl">Pairing you up…</Heading>
            <Body className="mt-2 text-center text-base text-ash">
              Linking your streaks so you don’t do this alone.
            </Body>
          </>
        )}
      </View>
    </Screen>
  )
}
