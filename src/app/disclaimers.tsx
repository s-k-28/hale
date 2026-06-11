import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { Screen, IconBtn, H1, H3, Lead, Body, Muted, Eyebrow, Card2 } from '@/ui'
import { clean } from '@/theme/clean'

/**
 * Disclaimers & Sources (Guideline 1.4.1) — every specific health-recovery
 * claim shown in the app, with its named public-health source. Claims framed
 * as "commonly reported" in the UI are listed as such here. Reachable from
 * the You tab at all times.
 */

const CLAIMS: { claim: string; source: string }[] = [
  {
    claim: 'Within about 20 minutes of quitting, heart rate begins to drop toward normal.',
    source: 'U.S. CDC, "Benefits of Quitting"; U.S. Surgeon General’s Report on Smoking Cessation (2020)',
  },
  {
    claim: 'Within 8–12 hours, blood oxygen and carbon monoxide levels move back toward normal.',
    source: 'U.S. CDC, "Benefits of Quitting"; NHS, "Quit smoking" timeline',
  },
  {
    claim: 'Within about 24–48 hours, carbon monoxide is largely cleared from the blood.',
    source: 'NHS, "Quit smoking" timeline',
  },
  {
    claim: 'Within about 48 hours, nicotine is largely out of your system.',
    source: 'NHS; commonly reported — clearance varies by product and person',
  },
  {
    claim: 'Within about 72 hours, breathing often eases as bronchial tubes relax.',
    source: 'NHS, "Quit smoking" timeline; commonly reported',
  },
  {
    claim: 'Within days to weeks, taste and smell often sharpen.',
    source: 'American Cancer Society, "Health Benefits of Quitting Smoking Over Time"; commonly reported',
  },
  {
    claim: 'Within 2 weeks to 3 months, circulation improves.',
    source: 'U.S. CDC; American Cancer Society',
  },
  {
    claim: 'Over the first month, many people report cravings becoming less frequent and less intense.',
    source: 'Commonly reported — individual experience varies',
  },
  {
    claim: 'Within 1–12 months, lung function and cilia recovery improve.',
    source: 'U.S. CDC; American Cancer Society',
  },
  {
    claim: 'After about 1 year, the added risk of coronary heart disease is roughly half that of someone who still smokes.',
    source: 'U.S. CDC, "Benefits of Quitting" (established for cigarette smoking)',
  },
  {
    claim: 'Money-saved figures are arithmetic projections from the usage and cost you enter, not a guarantee.',
    source: 'Your own inputs (units per day × cost per unit)',
  },
]

export default function Disclaimers() {
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-1">
        <IconBtn onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft color={clean.fg} size={22} strokeWidth={2.2} />
        </IconBtn>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-gutter pt-4 pb-16"
        showsVerticalScrollIndicator={false}
      >
        <H1>Disclaimers{'\n'}& sources</H1>

        <H3 className="mt-7">Not medical advice</H3>
        <Body className="mt-2 leading-6">
          HALE is a self-help support tool. It is not a medical device and does not provide
          medical advice, diagnosis, or treatment. Sage, the in-app coach, offers general
          support only. For medical questions about quitting nicotine, talk to a doctor,
          pharmacist, or a quitline such as 1-800-QUIT-NOW (US).
        </Body>

        <H3 className="mt-7">Recovery timeline claims</H3>
        <Body className="mt-2 leading-6">
          Timelines shown in HALE reflect milestones reported by public health bodies, largely
          established for cigarette smoking. They are general guidance: bodies differ, and
          vaping or pouch recovery may differ. Each claim and its source:
        </Body>

        <View className="mt-4" style={{ gap: 10 }}>
          {CLAIMS.map((c, i) => (
            <Card2 pad key={i}>
              <Body className="font-sora-medium leading-6 text-fg">{c.claim}</Body>
              <Eyebrow className="mt-2 text-[10.5px]">Source</Eyebrow>
              <Muted className="mt-0.5 text-[13px] leading-5">{c.source}</Muted>
            </Card2>
          ))}
        </View>

        <Muted className="mt-6 text-[12px] leading-5">
          If you are in crisis, call or text 988 (Suicide & Crisis Lifeline, US).
        </Muted>
      </ScrollView>
    </Screen>
  )
}
