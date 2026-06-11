import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Button, H1, Lead, Muted } from '@/ui'
import { setDisclaimerAck } from '@/lib/disclaimer'

/**
 * Medical disclaimer (Guideline 1.4.1) — acknowledged once, right after the
 * 21+ gate and before any cessation content. Full claim-by-claim sources live
 * on the Disclaimers & Sources screen (always reachable from the You tab).
 */
export default function MedicalNotice() {
  const acknowledge = async () => {
    await setDisclaimerAck()
    router.replace('/(onboarding)/welcome')
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-gutter">
        <H1>
          A quick note{'\n'}before we start
        </H1>
        <Lead className="mt-4">
          HALE is a support tool, not a medical device, and it does not provide medical advice,
          diagnosis, or treatment.
        </Lead>
        <Lead className="mt-4">
          Recovery timelines in the app reflect commonly reported milestones from public health
          sources. Everyone's body is different. For medical questions about quitting nicotine,
          talk to a doctor, pharmacist, or quitline.
        </Lead>
        <Muted className="mt-4 text-[13px]">
          Sources for every health claim are listed in the app under You, then Disclaimers &
          sources.
        </Muted>
      </View>
      <View className="px-gutter pb-[30px] pt-4">
        <Button variant="primary" label="I understand" onPress={acknowledge} />
      </View>
    </Screen>
  )
}
