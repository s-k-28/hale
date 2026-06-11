import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Button, H1, Lead, Muted } from '@/ui'
import { setAgeConfirmed } from '@/lib/ageGate'

/**
 * 21+ age gate (Guideline 2.18) — the first screen of onboarding, before any
 * cessation content. Confirm once, never re-asked (src/lib/ageGate.ts).
 * Under-21 blocks to a respectful explanation.
 */
export default function AgeGate() {
  const [blocked, setBlocked] = useState(false)

  const confirm = async () => {
    await setAgeConfirmed()
    router.replace('/(onboarding)/welcome')
  }

  if (blocked) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View className="flex-1 justify-center px-gutter">
          <H1>
            HALE is for{'\n'}adults 21 and older
          </H1>
          <Lead className="mt-4">
            Nicotine cessation support in HALE is restricted to adults aged 21 or older. We're
            sorry we can't help here, and we hope you stay nicotine-free.
          </Lead>
          <Lead className="mt-4">
            If you're under 21 and using nicotine, free confidential help is available from your
            doctor, school counselor, or local quitline.
          </Lead>
        </View>
        <View className="px-gutter pb-[30px] pt-4">
          <Button
            variant="ghost"
            label="I selected this by mistake"
            onPress={() => setBlocked(false)}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-gutter">
        <H1>
          Are you 21{'\n'}or older?
        </H1>
        <Lead className="mt-4">
          HALE supports adults quitting nicotine. You must be 21 or older to use this app.
        </Lead>
      </View>
      <View className="gap-2 px-gutter pb-[30px] pt-4">
        <Button variant="primary" label="I am 21 or older" onPress={confirm} />
        <Button variant="ghost" label="I am under 21" onPress={() => setBlocked(true)} />
        <Muted className="mt-2 text-center text-[12px]">
          Asked once. Your answer stays on this device.
        </Muted>
      </View>
    </Screen>
  )
}
