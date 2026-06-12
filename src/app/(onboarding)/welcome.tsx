import { KeyboardAvoidingView, Linking, Platform, Text } from 'react-native'
import { Link } from 'expo-router'
import { YStack } from 'tamagui'
import { Screen, Display, Heading, Label, Button, Pill } from '@/components/tama'
import { InviteCodeEntry } from '@/components/InviteCodeEntry'
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/constants/legal'

/** Welcome → quiz. Migrated to Tamagui (Bold Momentum primitives). */
export default function Welcome() {
  return (
    <Screen edges={['top', 'bottom']}>
      {/* Keyboard padding so the invite-code input (bottom of screen, autoFocus)
          isn't covered on iOS — same convention as the quiz inputs. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <YStack flex={1} paddingHorizontal={24}>
        {/* Hero — huge loud wordmark, generous dark negative space */}
        <YStack flex={1} justifyContent="center">
          <YStack marginBottom={24}>
            <Pill tone="volt">NO MORE NICOTINE</Pill>
          </YStack>

          <Display color="$chalk" fontSize={96} lineHeight={100} letterSpacing={1}>
            HALE
          </Display>

          <Heading color="$volt" fontWeight="900" fontSize={30} lineHeight={34} marginTop={20} letterSpacing={-0.5}>
            Quit Nicotine.{'\n'}Together.
          </Heading>

          <Label
            color="$ash"
            marginTop={20}
            fontSize={14}
            lineHeight={21}
            textTransform="none"
            letterSpacing={0}
            maxWidth={300}
          >
            Build a quit plan that actually sticks, and beat the cravings with people who get it.
          </Label>
        </YStack>
      </YStack>

      {/* Primary CTA — the ONE loud lime moment */}
      <YStack paddingHorizontal={24} paddingBottom={40}>
        <Link href="/(onboarding)/quiz" asChild>
          <Button label="BUILD MY QUIT PLAN" variant="primary" />
        </Link>
        <Label
          color="$ash"
          opacity={0.7}
          textAlign="center"
          marginTop={16}
          textTransform="none"
          letterSpacing={0}
        >
          Free to start · 60-second setup
        </Label>
        {/* Disclosure at the point of entry (5.1.1(i)/(ii)): continuing means
            the privacy policy + terms apply, incl. anonymous usage analytics
            (withdrawable in You ▸ Settings). */}
        <Label
          color="$ash"
          opacity={0.7}
          textAlign="center"
          marginTop={8}
          fontSize={11}
          lineHeight={16}
          textTransform="none"
          letterSpacing={0}
        >
          By continuing you agree to our{' '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
          >
            Terms
          </Text>
          {' '}and{' '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
          >
            Privacy Policy
          </Text>
          , including anonymous usage analytics you can turn off anytime.
        </Label>
        {/* Typed-code referral fallback — the deferred-attribution path for fresh
            installs (the share message carries the code; iOS can't pass it
            through the App Store). Feeds the same pendingBuddy stash a deep
            link does. */}
        <InviteCodeEntry />
      </YStack>
      </KeyboardAvoidingView>
    </Screen>
  )
}
