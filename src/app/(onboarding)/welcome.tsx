import { Link } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';

/** Welcome → quiz. (The quiz screen is built grounded in Mobbin references.) */
export default function Welcome() {
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 px-6">
        {/* Hero — huge loud wordmark, generous dark negative space */}
        <View className="flex-1 justify-center">
          <View className="mb-6">
            <Pill tone="volt">NO MORE NICOTINE</Pill>
          </View>

          <Display className="text-chalk text-8xl leading-none tracking-tight">HALE</Display>

          <Heading className="text-volt text-3xl leading-tight mt-5">
            Quit Nicotine.{'\n'}Together.
          </Heading>

          <Label className="text-ash mt-5 text-sm leading-relaxed normal-case tracking-normal max-w-[300px]">
            Build a quit plan that actually sticks — and beat the cravings with people who get it.
          </Label>
        </View>
      </View>

      {/* Primary CTA — the ONE loud lime moment */}
      <View className="px-6 pb-10">
        <Link href="/(onboarding)/quiz" asChild>
          <Button label="BUILD MY QUIT PLAN" variant="primary" />
        </Link>
        <Label className="text-ash/70 text-center mt-4 normal-case tracking-normal">
          Free to start · 60-second setup
        </Label>
      </View>
    </Screen>
  );
}
