import { useCallback, useEffect, useRef, useState } from 'react'
import { Share, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation } from 'convex/react'
import { ChevronLeft } from 'lucide-react-native'
import { api } from '@convex/_generated/api'
import { track, Ev } from '@/lib/analytics'
import { referralLink, referralShareText, inviteShareParams } from '@/lib/links'
import { Screen, IconBtn, H1, Lead, Button, Card2, Eyebrow, Body, Display } from '@/ui'
import { clean } from '@/theme/clean'

/**
 * Send invite — the dedicated share surface (design net-new screen). Shows the
 * exact message + code a friend will receive, then hands to the native share
 * sheet. Same code/link source as ReferralCard (getOrCreateMyCode + links.ts);
 * back preserves the ?from param so the hub keeps its onboarding chrome.
 */
export default function ReferralShare() {
  const { from } = useLocalSearchParams<{ from?: string }>()
  const getOrCreateCode = useMutation(api.referrals.getOrCreateMyCode)
  const [code, setCode] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const codeRef = useRef<string | null>(null)

  // A failed fetch is NOT terminal: the share button stays enabled and retries
  // the fetch inline, so a network blip never leaves a dead button.
  const ensureCode = useCallback(async (): Promise<string | null> => {
    if (codeRef.current) return codeRef.current
    try {
      const r = await getOrCreateCode()
      codeRef.current = r.code
      setCode(r.code)
      setNotice(null)
      return r.code
    } catch {
      return null
    }
  }, [getOrCreateCode])

  useEffect(() => {
    void ensureCode()
  }, [ensureCode])

  const onShare = async () => {
    const c = await ensureCode()
    if (!c) {
      setNotice("Couldn't load your invite code. Check your connection and try again.")
      return
    }
    track(Ev.REFERRAL_LINK_SHARED, { surface: from === 'onboarding' ? 'share_onboarding' : 'share_screen' })
    try {
      await Share.share(inviteShareParams(referralShareText(c), referralLink(c)))
    } catch {
      // Share dismissed — no-op.
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-1">
        <IconBtn onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft color={clean.fg} size={22} strokeWidth={2.2} />
        </IconBtn>
      </View>

      <View className="flex-1 px-gutter pt-4">
        <H1>Send your invite</H1>
        <Lead className="mt-3">
          Here's exactly what your friend gets. Your link opens HALE if they have it, and the
          code works the moment they install.
        </Lead>

        <Card2 pad className="mt-7">
          <Eyebrow>The message</Eyebrow>
          <Body className="mt-2 leading-6 text-fg">
            {code ? referralShareText(code) : 'Getting your invite code ready…'}
          </Body>
        </Card2>

        <Card2 pad className="mt-3 items-center">
          <Eyebrow>Your invite code</Eyebrow>
          <Display className="mt-2 text-[34px] tracking-[8px] text-warm">
            {code ?? '······'}
          </Display>
        </Card2>
      </View>

      <View className="px-gutter pb-[30px] pt-4">
        {notice ? (
          <Body className="mb-3 text-center text-sm text-fg-2">{notice}</Body>
        ) : null}
        <Button variant="primary" label="Share invite" onPress={onShare} />
      </View>
    </Screen>
  )
}
