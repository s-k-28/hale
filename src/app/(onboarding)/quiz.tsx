import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { requestPushPermission } from '@/lib/onesignal';
import {
  projectedAnnualSavings,
  moneySaved,
  HEALTH_MILESTONES,
  type QuitProfile,
} from '@convex/model/plan';

/* ------------------------------------------------------------------------- *
 * O1 — Onboarding quiz → plan reveal → commitment.
 *
 * Grounded in the canonical "quiz → personalized plan" pattern used by Cal AI,
 * Headspace, Fabulous and the leading quit-nicotine apps (Smoke Free / QuitNow):
 *   • one question per full-screen step, large tappable cards, progress dots
 *   • a short "building your plan" beat (manufactured anticipation)
 *   • a celebratory PLAN REVEAL leading with the hero $ number + a health
 *     recovery timeline, with a "general guidance, not medical advice" note
 *   • a single-decision COMMITMENT screen, then a help-framed push opt-in
 *
 * Decision 2 (deferred sign-up): all answers live in LOCAL React state. We touch
 * the backend ONLY at commit — signIn('anonymous') THEN completeOnboarding.
 * ------------------------------------------------------------------------- */

type ProductType = 'vape' | 'pouch' | 'cig' | 'mixed';

type Answers = {
  productType: ProductType | null;
  baselinePerDay: number | null;
  unitCost: number | null;
  triggers: string[];
  hardestHour: number | null;
  motivation: string;
  name: string;
};

const INITIAL: Answers = {
  productType: null,
  baselinePerDay: null,
  unitCost: null,
  triggers: [],
  hardestHour: null,
  motivation: '',
  name: '',
};

/* ---- option sets (copy is per-product so the unit language stays honest) ---- */

const PRODUCTS: { value: ProductType; label: string; emoji: string; unit: string }[] = [
  { value: 'vape', label: 'Vape / e-cig', emoji: '💨', unit: 'pods' },
  { value: 'pouch', label: 'Nicotine pouches', emoji: '🟢', unit: 'pouches' },
  { value: 'cig', label: 'Cigarettes', emoji: '🚬', unit: 'cigarettes' },
  { value: 'mixed', label: 'A mix of things', emoji: '🔀', unit: 'units' },
];

const PER_DAY_CHOICES = [3, 6, 10, 15, 20, 30];
const UNIT_COST_CHOICES = [
  { value: 0.5, label: '$0.50' },
  { value: 1, label: '$1' },
  { value: 2, label: '$2' },
  { value: 5, label: '$5' },
  { value: 8, label: '$8' },
  { value: 12, label: '$12' },
];

const TRIGGER_CHOICES = [
  'Stress',
  'Boredom',
  'After meals',
  'Coffee',
  'Alcohol',
  'Driving',
  'Social settings',
  'Phone / scrolling',
  'Waking up',
  'Work breaks',
];

const HOUR_BANDS: { hour: number; label: string }[] = [
  { hour: 7, label: 'Early morning' },
  { hour: 10, label: 'Mid-morning' },
  { hour: 13, label: 'Midday' },
  { hour: 16, label: 'Afternoon' },
  { hour: 19, label: 'Evening' },
  { hour: 22, label: 'Late night' },
];

const MOTIVATIONS = [
  { value: 'health', label: 'My health', emoji: '❤️' },
  { value: 'money', label: 'Save money', emoji: '💰' },
  { value: 'family', label: 'My family / kids', emoji: '👨‍👩‍👧' },
  { value: 'freedom', label: 'Feel free of it', emoji: '🕊️' },
  { value: 'fitness', label: 'Fitness / breathing', emoji: '🫁' },
  { value: 'control', label: 'Take back control', emoji: '🧭' },
];

/* The ordered question steps that own a progress dot. */
type StepKey =
  | 'productType'
  | 'baselinePerDay'
  | 'unitCost'
  | 'triggers'
  | 'hardestHour'
  | 'motivation'
  | 'name';

const QUESTION_STEPS: StepKey[] = [
  'productType',
  'baselinePerDay',
  'unitCost',
  'triggers',
  'hardestHour',
  'motivation',
  'name',
];

type Phase = 'questions' | 'building' | 'reveal' | 'commit' | 'push';

/* ------------------------------------------------------------------------- */

export default function Quiz() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  const [phase, setPhase] = useState<Phase>('questions');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track(Ev.ONBOARDING_STARTED);
  }, []);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const step = QUESTION_STEPS[stepIndex];
  const product = PRODUCTS.find((p) => p.value === answers.productType);
  const unitWord = product?.unit ?? 'units';

  const canAdvance = useMemo(() => {
    switch (step) {
      case 'productType':
        return answers.productType !== null;
      case 'baselinePerDay':
        return answers.baselinePerDay !== null;
      case 'unitCost':
        return answers.unitCost !== null;
      case 'triggers':
        return answers.triggers.length > 0;
      case 'hardestHour':
        return answers.hardestHour !== null;
      case 'motivation':
        return answers.motivation.length > 0;
      case 'name':
        return true; // optional — first name only
      default:
        return false;
    }
  }, [step, answers]);

  const goNext = () => {
    if (stepIndex < QUESTION_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      // Last question answered → manufactured "building your plan" beat.
      setPhase('building');
    }
  };

  const goBack = () => {
    if (phase === 'questions' && stepIndex === 0) {
      router.back();
      return;
    }
    if (phase === 'questions') setStepIndex((i) => Math.max(0, i - 1));
  };

  /* "Building your plan" → reveal, then fire PLAN_VIEWED once. */
  useEffect(() => {
    if (phase !== 'building') return;
    const t = setTimeout(() => {
      setPhase('reveal');
      track(Ev.PLAN_VIEWED);
    }, 2400);
    return () => clearTimeout(t);
  }, [phase]);

  /* The "wow" numbers — PURE math, computed entirely client-side (Decision 2). */
  const profile: QuitProfile = {
    productType: (answers.productType ?? 'mixed') as ProductType,
    baselinePerDay: answers.baselinePerDay ?? 0,
    unitCost: answers.unitCost ?? 0,
  };
  const annual = Math.round(projectedAnnualSavings(profile));
  const monthly = Math.round(annual / 12);
  const firstMonth = Math.round(moneySaved(profile, 30 * 86_400_000));
  const previewMilestones = HEALTH_MILESTONES.slice(0, 5);

  /* Commit: anonymous sign-in THEN completeOnboarding (the only backend touch). */
  const commit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn('anonymous');
      await completeOnboarding({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        productType: profile.productType,
        baselinePerDay: profile.baselinePerDay,
        unitCost: profile.unitCost,
        triggers: answers.triggers,
        hardestHour: answers.hardestHour ?? 9,
        motivation: answers.motivation || undefined,
        name: answers.name.trim() || undefined,
      });
      track(Ev.QUIT_COMMITTED, {
        product_type: profile.productType,
        baseline_per_day: profile.baselinePerDay,
        projected_annual: annual,
      });
      setPhase('push'); // help-framed opt-in before we land on Today
    } catch (e) {
      setError('Something went wrong starting your plan. Please try again.');
      setSubmitting(false);
    }
  };

  const finishPushStep = (granted: boolean) => {
    if (granted) requestPushPermission(); // only after the explainer (Decision 2)
    router.replace('/(tabs)/today');
  };

  /* ----------------------------- render phases ---------------------------- */

  if (phase === 'building') return <BuildingPlan name={answers.name.trim()} />;

  if (phase === 'reveal') {
    return (
      <PlanReveal
        name={answers.name.trim()}
        annual={annual}
        monthly={monthly}
        firstMonth={firstMonth}
        milestones={previewMilestones}
        onContinue={() => setPhase('commit')}
      />
    );
  }

  if (phase === 'commit') {
    return (
      <CommitScreen
        name={answers.name.trim()}
        annual={annual}
        submitting={submitting}
        error={error}
        onCommit={commit}
      />
    );
  }

  if (phase === 'push') {
    return <PushOptIn onDecide={finishPushStep} />;
  }

  /* ----------------------------- question phase --------------------------- */

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* header: back + progress dots */}
        <View className="flex-row items-center px-5 pt-2">
          <Pressable
            onPress={goBack}
            hitSlop={12}
            className="h-9 w-9 items-center justify-center rounded-full"
          >
            <Text className="text-2xl text-hale-900">‹</Text>
          </Pressable>
          <View className="flex-1 flex-row items-center justify-center gap-1.5">
            {QUESTION_STEPS.map((_, i) => (
              <View
                key={i}
                className={
                  i === stepIndex
                    ? 'h-2 w-6 rounded-full bg-hale-500'
                    : i < stepIndex
                      ? 'h-2 w-2 rounded-full bg-hale-400'
                      : 'h-2 w-2 rounded-full bg-hale-100'
                }
              />
            ))}
          </View>
          <View className="h-9 w-9" />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pt-6 pb-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'productType' && (
            <Question
              title="What are you quitting?"
              subtitle="We tailor your plan to what you use."
            >
              {PRODUCTS.map((p) => (
                <ChoiceCard
                  key={p.value}
                  emoji={p.emoji}
                  label={p.label}
                  selected={answers.productType === p.value}
                  onPress={() => set('productType', p.value)}
                />
              ))}
            </Question>
          )}

          {step === 'baselinePerDay' && (
            <Question
              title={`How many ${unitWord} a day?`}
              subtitle="A rough average is perfect — we use it to size your savings."
            >
              <View className="flex-row flex-wrap gap-3">
                {PER_DAY_CHOICES.map((n) => (
                  <PillChoice
                    key={n}
                    label={String(n)}
                    selected={answers.baselinePerDay === n}
                    onPress={() => set('baselinePerDay', n)}
                  />
                ))}
              </View>
            </Question>
          )}

          {step === 'unitCost' && (
            <Question
              title={`What does one ${unitWord.replace(/s$/, '')} cost?`}
              subtitle="Roughly. This is what we'll turn into money back in your pocket."
            >
              <View className="flex-row flex-wrap gap-3">
                {UNIT_COST_CHOICES.map((c) => (
                  <PillChoice
                    key={c.value}
                    label={c.label}
                    selected={answers.unitCost === c.value}
                    onPress={() => set('unitCost', c.value)}
                  />
                ))}
              </View>
            </Question>
          )}

          {step === 'triggers' && (
            <Question
              title="When do cravings hit hardest?"
              subtitle="Pick all that apply — your plan will plan around these."
            >
              <View className="flex-row flex-wrap gap-3">
                {TRIGGER_CHOICES.map((t) => {
                  const selected = answers.triggers.includes(t);
                  return (
                    <PillChoice
                      key={t}
                      label={t}
                      selected={selected}
                      onPress={() =>
                        set(
                          'triggers',
                          selected
                            ? answers.triggers.filter((x) => x !== t)
                            : [...answers.triggers, t],
                        )
                      }
                    />
                  );
                })}
              </View>
            </Question>
          )}

          {step === 'hardestHour' && (
            <Question
              title="What's your toughest time of day?"
              subtitle="We'll check in with you right before it."
            >
              {HOUR_BANDS.map((b) => (
                <ChoiceCard
                  key={b.hour}
                  label={b.label}
                  selected={answers.hardestHour === b.hour}
                  onPress={() => set('hardestHour', b.hour)}
                />
              ))}
            </Question>
          )}

          {step === 'motivation' && (
            <Question
              title="What's pulling you forward?"
              subtitle="Your reason shows up when cravings do."
            >
              {MOTIVATIONS.map((m) => (
                <ChoiceCard
                  key={m.value}
                  emoji={m.emoji}
                  label={m.label}
                  selected={answers.motivation === m.value}
                  onPress={() => set('motivation', m.value)}
                />
              ))}
            </Question>
          )}

          {step === 'name' && (
            <Question
              title="What should we call you?"
              subtitle="Just a first name — so your plan feels like yours. Optional."
            >
              <TextInput
                value={answers.name}
                onChangeText={(t) => set('name', t)}
                placeholder="First name"
                placeholderTextColor="#9aa6a1"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
                className="rounded-2xl border border-hale-100 bg-hale-50 px-5 py-4 text-lg text-hale-900"
              />
            </Question>
          )}
        </ScrollView>

        {/* sticky CTA */}
        <View className="px-6 pb-2 pt-2">
          <Pressable
            disabled={!canAdvance}
            onPress={goNext}
            className={
              canAdvance
                ? 'rounded-full bg-hale-500 py-4 active:opacity-90'
                : 'rounded-full bg-hale-100 py-4'
            }
          >
            <Text
              className={
                canAdvance
                  ? 'text-center text-base font-semibold text-white'
                  : 'text-center text-base font-semibold text-hale-400'
              }
            >
              {stepIndex === QUESTION_STEPS.length - 1 ? 'Build my plan' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ========================================================================= *
 * Sub-screens
 * ========================================================================= */

/** "Building your plan" anticipation beat — sequential checklist reveal. */
function BuildingPlan({ name }: { name: string }) {
  const lines = [
    'Crunching your numbers',
    'Mapping your craving windows',
    'Building your recovery timeline',
    'Personalizing your plan',
  ];
  const [done, setDone] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDone((d) => Math.min(lines.length, d + 1)), 550);
    return () => clearInterval(id);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-hale-900">
      <View className="flex-1 items-center justify-center px-8">
        <ActivityIndicator color="#39a37c" size="large" />
        <Text className="mt-8 text-center text-2xl font-bold text-white">
          {name ? `Hang tight, ${name}…` : 'Hang tight…'}
        </Text>
        <Text className="mt-2 text-center text-base text-hale-100/80">
          Building your personalized quit plan
        </Text>
        <View className="mt-10 w-full gap-3">
          {lines.map((l, i) => (
            <View key={l} className="flex-row items-center gap-3">
              <View
                className={
                  i < done
                    ? 'h-6 w-6 items-center justify-center rounded-full bg-hale-500'
                    : 'h-6 w-6 items-center justify-center rounded-full border border-hale-400/40'
                }
              >
                {i < done ? <Text className="text-xs text-white">✓</Text> : null}
              </View>
              <Text
                className={i < done ? 'text-base text-white' : 'text-base text-hale-100/40'}
              >
                {l}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** PLAN REVEAL — hero $ number + health recovery timeline + medical disclaimer. */
function PlanReveal({
  name,
  annual,
  monthly,
  firstMonth,
  milestones,
  onContinue,
}: {
  name: string;
  annual: number;
  monthly: number;
  firstMonth: number;
  milestones: { hours: number; label: string }[];
  onContinue: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-hale-900" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-6 pb-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-base font-medium text-hale-100/80">
          {name ? `${name}, your plan is ready` : 'Your plan is ready'}
        </Text>
        <Text className="mt-1 text-3xl font-bold text-white">Here&apos;s what quitting gives back</Text>

        {/* hero savings card */}
        <View className="mt-6 rounded-3xl bg-hale-500 p-6">
          <Text className="text-sm font-medium uppercase tracking-wide text-white/80">
            Projected savings this year
          </Text>
          <Text className="mt-1 text-5xl font-extrabold text-white">
            ${annual.toLocaleString()}
          </Text>
          <View className="mt-4 flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white/15 p-3">
              <Text className="text-xs text-white/80">First month</Text>
              <Text className="text-lg font-bold text-white">${firstMonth.toLocaleString()}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/15 p-3">
              <Text className="text-xs text-white/80">Every month</Text>
              <Text className="text-lg font-bold text-white">${monthly.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* health recovery timeline */}
        <Text className="mt-8 text-xl font-bold text-white">Your body starts healing fast</Text>
        <View className="mt-4 gap-3">
          {milestones.map((m, i) => (
            <View
              key={m.label}
              className="flex-row items-start gap-3 rounded-2xl bg-white/5 p-4"
            >
              <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-hale-500/30">
                <Text className="text-xs font-bold text-hale-100">{i + 1}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium uppercase tracking-wide text-hale-100/70">
                  {formatHours(m.hours)}
                </Text>
                <Text className="text-base text-white">{m.label}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text className="mt-5 text-xs leading-5 text-hale-100/50">
          Recovery timelines reflect commonly reported milestones and are general guidance, not
          medical advice. Everyone&apos;s body is different — talk to a clinician about your health.
        </Text>
      </ScrollView>

      <View className="px-6 pb-2 pt-2">
        <Pressable onPress={onContinue} className="rounded-full bg-hale-500 py-4 active:opacity-90">
          <Text className="text-center text-base font-semibold text-white">Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** COMMITMENT — a single, deliberate decision. On commit we sign in + persist. */
function CommitScreen({
  name,
  annual,
  submitting,
  error,
  onCommit,
}: {
  name: string;
  annual: number;
  submitting: boolean;
  error: string | null;
  onCommit: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-hale-900" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-6xl">🌿</Text>
        <Text className="mt-6 text-center text-3xl font-bold text-white">
          {name ? `Ready, ${name}?` : 'Ready to start?'}
        </Text>
        <Text className="mt-3 text-center text-base leading-6 text-hale-100/80">
          Your quit clock starts the moment you commit. From here you&apos;ll see your clean time,
          your money saved, and you won&apos;t do it alone.
        </Text>

        <View className="mt-8 w-full rounded-2xl bg-white/5 p-4">
          <Text className="text-center text-sm text-hale-100/70">On track to save</Text>
          <Text className="text-center text-2xl font-bold text-white">
            ${annual.toLocaleString()} this year
          </Text>
        </View>

        {error ? (
          <Text className="mt-4 text-center text-sm text-sos">{error}</Text>
        ) : null}
      </View>

      <View className="px-6 pb-2 pt-2">
        <Pressable
          disabled={submitting}
          onPress={onCommit}
          className={
            submitting
              ? 'rounded-full bg-hale-600 py-4'
              : 'rounded-full bg-hale-500 py-4 active:opacity-90'
          }
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-center text-base font-semibold text-white">
              I&apos;m committing — start my quit
            </Text>
          )}
        </Pressable>
        <Text className="mt-3 text-center text-xs text-hale-100/50">
          No account needed. We&apos;ll keep your progress safe on this device.
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** Help-framed push opt-in — explainer FIRST, then the OS prompt (Decision 2). */
function PushOptIn({ onDecide }: { onDecide: (granted: boolean) => void }) {
  return (
    <SafeAreaView className="flex-1 bg-hale-900" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-6xl">🔔</Text>
        <Text className="mt-6 text-center text-2xl font-bold text-white">
          Want a nudge when it&apos;s hardest?
        </Text>
        <Text className="mt-3 text-center text-base leading-6 text-hale-100/80">
          The people who quit for good get a little support right before their toughest hour — a
          check-in, a craving tip, or a word from your buddy. No spam, ever.
        </Text>
      </View>

      <View className="px-6 pb-2 pt-2">
        <Pressable
          onPress={() => onDecide(true)}
          className="rounded-full bg-hale-500 py-4 active:opacity-90"
        >
          <Text className="text-center text-base font-semibold text-white">
            Yes, support me through it
          </Text>
        </Pressable>
        <Pressable onPress={() => onDecide(false)} className="py-4">
          <Text className="text-center text-sm text-hale-100/60">Maybe later</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/* ========================================================================= *
 * Reusable bits
 * ========================================================================= */

function Question({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="text-2xl font-bold text-hale-900">{title}</Text>
      {subtitle ? <Text className="mt-2 text-base text-hale-900/50">{subtitle}</Text> : null}
      <View className="mt-6 gap-3">{children}</View>
    </View>
  );
}

function ChoiceCard({
  emoji,
  label,
  selected,
  onPress,
}: {
  emoji?: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        selected
          ? 'flex-row items-center gap-3 rounded-2xl border-2 border-hale-500 bg-hale-50 px-5 py-4'
          : 'flex-row items-center gap-3 rounded-2xl border-2 border-hale-100 bg-white px-5 py-4 active:bg-hale-50'
      }
    >
      {emoji ? <Text className="text-2xl">{emoji}</Text> : null}
      <Text
        className={
          selected
            ? 'flex-1 text-base font-semibold text-hale-900'
            : 'flex-1 text-base font-medium text-hale-900'
        }
      >
        {label}
      </Text>
      <View
        className={
          selected
            ? 'h-6 w-6 items-center justify-center rounded-full bg-hale-500'
            : 'h-6 w-6 rounded-full border-2 border-hale-100'
        }
      >
        {selected ? <Text className="text-xs text-white">✓</Text> : null}
      </View>
    </Pressable>
  );
}

function PillChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        selected
          ? 'rounded-full border-2 border-hale-500 bg-hale-500 px-5 py-3'
          : 'rounded-full border-2 border-hale-100 bg-white px-5 py-3 active:bg-hale-50'
      }
    >
      <Text
        className={
          selected ? 'text-base font-semibold text-white' : 'text-base font-medium text-hale-900'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Human-friendly milestone time labels for the recovery timeline. */
function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours)} hr`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 30) return `${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? '' : 's'}`;
  if (days < 365) return `${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'}`;
  return '1 year';
}
