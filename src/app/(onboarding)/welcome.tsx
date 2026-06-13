import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, View } from 'react-native'
import { Link, Redirect } from 'expo-router'
import { Screen, Button, Lead, Muted } from '@/ui'
import { RNText } from '@/ui/internal'
import { InviteCodeEntry } from '@/components/InviteCodeEntry'
import { getAgeConfirmed } from '@/lib/ageGate'
import { getDisclaimerAck } from '@/lib/disclaimer'
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/constants/legal'

/** HALE logo block (design HaleLogo): emerald rounded square + wordmark. */
function HaleLogo({ size = 50 }: { size?: number }) {
  return (
    <View className="flex-row items-center" style={{ gap: 10 }}>
      <View
        className="items-center justify-center bg-accent"
        style={{ width: size, height: size, borderRadius: size * 0.26 }}
      >
        <RNText
          className="font-sora-extrabold text-accent-ink"
          style={{ fontSize: size * 0.52 }}
        >
          H
        </RNText>
      </View>
      <RNText className="font-sora-bold text-[22px] tracking-[2px] text-fg">HALE</RNText>
    </View>
  )
}

/** Welcome → quiz. Clean Dark v2: logo block, mixed-case hero, one emerald CTA. */
export default function Welcome() {
  // Pre-content gates: 21+ confirmation (Guideline 2.18) then the medical
  // disclaimer acknowledgement (Guideline 1.4.1). null while the stored
  // answers load (blank beat, no flash of gated content).
  const [gate, setGate] = useState<'loading' | 'age' | 'notice' | 'ok'>('loading')
  useEffect(() => {
    Promise.all([getAgeConfirmed(), getDisclaimerAck()]).then(([age, ack]) =>
      setGate(!age ? 'age' : !ack ? 'notice' : 'ok'),
    )
  }, [])
  if (gate === 'loading') return <Screen edges={['top', 'bottom']}>{null}</Screen>
  if (gate === 'age') return <Redirect href="/(onboarding)/age" />
  if (gate === 'notice') return <Redirect href="/(onboarding)/notice" />

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Keyboard padding so the invite-code input (bottom of screen, autoFocus)
          isn't covered on iOS — same convention as the quiz inputs. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 justify-center px-gutter">
          <HaleLogo />
          <RNText className="mt-6 font-sora-bold text-[46px] leading-[50px] tracking-[-0.46px] text-fg">
            Quit{'\n'}nicotine.{'\n'}
            <RNText className="text-accent">Together.</RNText>
          </RNText>
          <Lead className="mt-[22px] max-w-[320px] text-[16.5px]">
            Build a quit plan that holds. Crush the cravings with people who get it.
          </Lead>
        </View>

        <View className="px-gutter pb-10">
          <Link href="/(onboarding)/quiz" asChild>
            <Button label="Build my quit plan" variant="primary" />
          </Link>
          <Muted className="mt-3.5 text-center text-[12px] uppercase tracking-[0.48px]">
            Free to start · 60-second setup
          </Muted>
          {/* Disclosure at the point of entry (5.1.1(i)/(ii)): continuing means
              the privacy policy + terms apply, incl. usage analytics linked to
              the account ID (withdrawable in You ▸ Settings). */}
          <Muted className="mt-2 text-center text-[11px] leading-4">
            By continuing you agree to our{' '}
            <Muted
              className="text-[11px] underline"
              onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            >
              Terms
            </Muted>{' '}
            and{' '}
            <Muted
              className="text-[11px] underline"
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
            >
              Privacy Policy
            </Muted>
            , including usage analytics linked to your account ID — turn it off
            anytime in You ▸ Settings.
          </Muted>
          {/* Typed-code referral fallback — the deferred-attribution path for fresh
              installs (the share message carries the code; iOS can't pass it
              through the App Store). Feeds the same pendingBuddy stash a deep
              link does. */}
          <InviteCodeEntry />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
