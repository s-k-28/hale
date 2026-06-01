import { Link } from 'expo-router'
import { YStack } from 'tamagui'
import { Screen, Display, Heading, Label, Button, Pill } from '@/components/tama'

/** Welcome → quiz. Migrated to Tamagui (Bold Momentum primitives). */
export default function Welcome() {
  return (
    <Screen edges={['top', 'bottom']}>
      <YStack flex={1} paddingHorizontal={24}>
        {/* Hero — huge loud wordmark, generous dark negative space */}
        <YStack flex={1} justifyContent="center">
          <YStack marginBottom={24}>
            <Pill tone="volt">NO MORE NICOTINE</Pill>
          </YStack>

          <Display color="$chalk" fontSize={96} lineHeight={100} letterSpacing={-4}>
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
            Build a quit plan that actually sticks — and beat the cravings with people who get it.
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
      </YStack>
    </Screen>
  )
}
