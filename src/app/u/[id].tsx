import { useEffect, useRef, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { track, Ev } from '@/lib/analytics'
import { setPendingBuddy } from '@/lib/pendingBuddy'
import { Screen, H2, Lead, Button } from '@/ui'
import { clean } from '@/theme/clean'

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
  // Gate rejections (one-buddy rule, model/buddy.ts) get honest copy — a fresh
  // link wouldn't help, so the generic invalid/expired text would misdirect.
  const [error, setError] = useState<null | 'caller_paired' | 'inviter_paired' | 'generic'>(null)

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
        // If this pairing completed a referral (the opener was attributed at
        // install), surface the funnel events keyed on the AUTHORITATIVE referrer
        // (pair.referrerId) — it may differ from this link's id.
        const refId = pair?.referrerId ?? referrerId
        if (pair?.referralCompleted) track(Ev.REFERRAL_BUDDY_PAIRED, { referrer_id: refId })
        if (pair?.referrerReachedGoal) track(Ev.REFERRAL_COMPLETED, { referrer_id: refId })
        if (pair?.rewardGranted) track(Ev.REWARD_GRANTED, { referrer_id: refId, reward_days: 7 })
        router.replace('/(tabs)/squad')
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        setError(
          msg.includes('You already have a buddy')
            ? 'caller_paired'
            : msg.includes('already have a buddy right now')
              ? 'inviter_paired'
              : 'generic',
        )
      }
    })()
  }, [isLoading, isAuthenticated, today, id, pairWith])

  if (!id) return <Redirect href="/(tabs)/today" />

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        {error ? (
          <>
            <H2 className="text-center">
              {error === 'caller_paired'
                ? 'You already have a buddy'
                : error === 'inviter_paired'
                  ? 'They’re already paired up'
                  : 'Couldn’t pair you up'}
            </H2>
            <Lead className="mt-3 text-center">
              {error === 'caller_paired'
                ? 'HALE pairs you with one buddy at a time, and you’re already paired.'
                : error === 'inviter_paired'
                  ? 'Your friend already has a buddy right now. You can still find your own in the Squad tab.'
                  : 'That invite link looks invalid or expired. Ask your buddy to send a fresh one.'}
            </Lead>
            <Button
              variant="primary"
              label={error === 'generic' ? 'Go to HALE' : 'Go to your Squad'}
              onPress={() =>
                router.replace(error === 'generic' ? '/(tabs)/today' : '/(tabs)/squad')
              }
              className="mt-8 w-full"
            />
          </>
        ) : (
          <>
            <ActivityIndicator color={clean.accent} />
            <H2 className="mt-6 text-center">Pairing you up…</H2>
            <Lead className="mt-2 text-center">
              Linking your streaks so you don’t do this alone.
            </Lead>
          </>
        )}
      </View>
    </Screen>
  )
}
