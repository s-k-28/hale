import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useConvexAuth, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  ChevronLeft,
  Check,
  Wind,
  Cigarette,
  Shuffle,
  Package,
  Heart,
  PiggyBank,
  Users,
  Bird,
  Wind as Lungs,
  Compass,
  Bell,
  Flame,
  TrendingUp,
} from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { takePendingBuddy } from '@/lib/pendingBuddy';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { RiseIn } from '@/components/motion';
import { colors } from '@/theme/colors';
import { track, Ev } from '@/lib/analytics';
import { requestPushPermission } from '@/lib/onesignal';
import {
  projectedAnnualSavings,
  moneySaved,
  HEALTH_MILESTONES,
  type QuitProfile,
} from '@convex/model/plan';

/* ------------------------------------------------------------------------- *
 * O1 — Onboarding quiz → plan reveal → commitment. (Bold Momentum re-skin.)
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

/* lucide glyph type for option rows */
type Glyph = (props: { color?: string; size?: number; strokeWidth?: number }) => ReactNode;

/* ---- option sets (copy is per-product so the unit language stays honest) ---- */

const PRODUCTS: { value: ProductType; label: string; Icon: Glyph; unit: string }[] = [
  { value: 'vape', label: 'Vape / e-cig', Icon: Wind, unit: 'pods' },
  { value: 'pouch', label: 'Nicotine pouches', Icon: Package, unit: 'pouches' },
  { value: 'cig', label: 'Cigarettes', Icon: Cigarette, unit: 'cigarettes' },
  { value: 'mixed', label: 'A mix of things', Icon: Shuffle, unit: 'units' },
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

const MOTIVATIONS: { value: string; label: string; Icon: Glyph }[] = [
  { value: 'health', label: 'My health', Icon: Heart },
  { value: 'money', label: 'Save money', Icon: PiggyBank },
  { value: 'family', label: 'My family / kids', Icon: Users },
  { value: 'freedom', label: 'Feel free of it', Icon: Bird },
  { value: 'fitness', label: 'Fitness / breathing', Icon: Lungs },
  { value: 'control', label: 'Take back control', Icon: Compass },
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

type Phase = 'questions' | 'building' | 'reveal' | 'commit' | 'invitebuddy' | 'push';

/* ------------------------------------------------------------------------- */

/**
 * Poll a boolean ref until it's true or the timeout elapses.
 *
 * Bridges reactive Convex auth state into the imperative commit() flow:
 * `signIn('anonymous')` resolves once tokens are acquired, but the
 * ConvexReactClient establishes its authenticated session a beat later. Firing
 * an authenticated mutation before that lands makes `getAuthUserId` return null
 * server-side ("Sign in anonymously before completing onboarding"). We gate on
 * `isAuthenticated` so the mutation never races ahead of auth propagation.
 */
async function waitForAuth(
  ref: { current: boolean },
  { timeoutMs = 12000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const start = Date.now();
  while (!ref.current) {
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return true;
}

export default function Quiz() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const pairWith = useMutation(api.buddies.pairWith);

  // Mirror reactive auth state into a ref so the imperative commit() handler can
  // await it without re-render churn (see waitForAuth above).
  const isAuthedRef = useRef(isAuthenticated);
  useEffect(() => {
    isAuthedRef.current = isAuthenticated;
  }, [isAuthenticated]);

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
      // Skip re-signing-in on a retry: a prior attempt may have already created an
      // anonymous session. Calling signIn('anonymous') again would orphan it behind
      // a brand-new anonymous user and strand the first one.
      if (!isAuthedRef.current) {
        await signIn('anonymous');
      }
      // signIn() resolving ≠ authenticated session established. useConvexAuth()'s
      // isAuthenticated only flips true once the BACKEND confirms the token
      // (ConvexAuthState sets it from setAuth's onChange), so gating on it
      // guarantees completeOnboarding's getAuthUserId() will resolve server-side.
      const ready = await waitForAuth(isAuthedRef);
      if (!ready) throw new Error('Convex auth session not ready after sign-in');
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
      // App-managed 14-day trial begins now (§8) — granted server-side in
      // completeOnboarding. Mark the activation→trial transition for funnel math.
      track(Ev.TRIAL_STARTED, { trial_days: 14 });
      // Redeem a pending buddy invite (S1: auto-pair on first open via deep link).
      let pairedInOnboarding = false;
      const pendingBuddy = await takePendingBuddy();
      if (pendingBuddy) {
        try {
          await pairWith({ inviterId: pendingBuddy as Id<'users'>, pairingMethod: 'invite_squad' });
          track(Ev.BUDDY_PAIRED, { via: 'invite_onboard', pairing_method: 'invite_squad' });
          pairedInOnboarding = true;
        } catch {
          // Best-effort; never block landing in the app.
        }
      }
      // Pairing is the ACTIVATION event: if they didn't already arrive paired (deep
      // link), route to the dedicated invite/matchmaking step so the default path
      // leads to a buddy in session one — then the push opt-in.
      setPhase(pairedInOnboarding ? 'push' : 'invitebuddy');
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

  if (phase === 'invitebuddy') {
    return <InviteBuddyStep onDone={() => setPhase('push')} />;
  }

  if (phase === 'push') {
    return <PushOptIn onDecide={finishPushStep} />;
  }

  /* ----------------------------- question phase --------------------------- */

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* header: back + progress dots */}
        <View className="flex-row items-center px-5 pt-1">
          <Pressable
            onPress={goBack}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full border border-line bg-coal active:bg-card"
          >
            <ChevronLeft color={colors.chalk} size={22} strokeWidth={2.5} />
          </Pressable>
          <View className="flex-1 flex-row items-center justify-center gap-1.5">
            {QUESTION_STEPS.map((_, i) => (
              <View
                key={i}
                className={
                  i === stepIndex
                    ? 'h-1.5 w-7 rounded-full bg-volt'
                    : i < stepIndex
                      ? 'h-1.5 w-3 rounded-full bg-volt/40'
                      : 'h-1.5 w-3 rounded-full bg-line'
                }
              />
            ))}
          </View>
          <View className="h-10 w-10" />
        </View>

        <ScrollView
          className="flex-1"
          // grow + justify-center = "center the question when it's short, scroll when
          // it's long." Kills the top-clustered chips + dead-space void on the
          // short questions (pods/day, cost, name) without clipping the tall ones.
          contentContainerClassName="grow px-gutter py-6 justify-center"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'productType' && (
            <Question
              index={stepIndex}
              title="What are you quitting?"
              subtitle="We tailor your plan to what you use."
            >
              {PRODUCTS.map((p) => (
                <ChoiceCard
                  key={p.value}
                  Icon={p.Icon}
                  label={p.label}
                  selected={answers.productType === p.value}
                  onPress={() => set('productType', p.value)}
                />
              ))}
            </Question>
          )}

          {step === 'baselinePerDay' && (
            <Question
              index={stepIndex}
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
              index={stepIndex}
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
              index={stepIndex}
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
              index={stepIndex}
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
              index={stepIndex}
              title="What's pulling you forward?"
              subtitle="Your reason shows up when cravings do."
            >
              {MOTIVATIONS.map((m) => (
                <ChoiceCard
                  key={m.value}
                  Icon={m.Icon}
                  label={m.label}
                  selected={answers.motivation === m.value}
                  onPress={() => set('motivation', m.value)}
                />
              ))}
            </Question>
          )}

          {step === 'name' && (
            <Question
              index={stepIndex}
              title="What should we call you?"
              subtitle="Just a first name — so your plan feels like yours. Optional."
            >
              <TextInput
                value={answers.name}
                onChangeText={(t) => set('name', t)}
                placeholder="First name"
                placeholderTextColor={colors.ash}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
                className="rounded-2xl border border-line bg-coal px-5 py-4 font-body-medium text-lg text-chalk"
              />
            </Question>
          )}
        </ScrollView>

        {/* sticky CTA */}
        <View className="px-6 pb-3 pt-2">
          <Button
            label={stepIndex === QUESTION_STEPS.length - 1 ? 'BUILD MY PLAN' : 'CONTINUE'}
            variant="primary"
            disabled={!canAdvance}
            onPress={goNext}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
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
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="mb-8 h-16 w-16 items-center justify-center rounded-2xl border border-line bg-coal">
          <Flame color={colors.volt} size={30} strokeWidth={2.5} />
        </View>
        <ActivityIndicator color={colors.volt} size="large" />
        <Heading className="mt-8 text-center text-3xl leading-tight">
          {name ? `HANG TIGHT,\n${name.toUpperCase()}` : 'HANG TIGHT'}
        </Heading>
        <Body className="mt-3 text-center font-body-medium text-base text-ash">
          Building your personalized quit plan
        </Body>

        <View className="mt-12 w-full gap-3">
          {lines.map((l, i) => (
            <View
              key={l}
              className={
                i < done
                  ? 'flex-row items-center gap-3 rounded-2xl border border-volt/30 bg-volt/10 px-4 py-3.5'
                  : 'flex-row items-center gap-3 rounded-2xl border border-line bg-coal px-4 py-3.5'
              }
            >
              <View
                className={
                  i < done
                    ? 'h-7 w-7 items-center justify-center rounded-full bg-volt'
                    : 'h-7 w-7 items-center justify-center rounded-full border border-line'
                }
              >
                {i < done ? <Check color={colors.voltInk} size={16} strokeWidth={3} /> : null}
              </View>
              <Body
                className={
                  i < done
                    ? 'flex-1 font-body-semibold text-base text-chalk'
                    : 'flex-1 font-body-medium text-base text-ash'
                }
              >
                {l}
              </Body>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

/** One-shot eased count-up from 0 → target (~1.1s) — the celebratory reveal of the $ number. */
function useCountUp(target: number, duration = 1100) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
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
  // Hero savings counts up on mount; the milestone rows stagger-rise below it.
  const animatedAnnual = useCountUp(annual);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-6 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-5">
          <Pill tone="volt">YOUR PLAN IS READY</Pill>
        </View>
        <Heading className="text-3xl leading-tight">
          {name ? `${name.toUpperCase()}, HERE'S WHAT` : "HERE'S WHAT"}
          {'\n'}QUITTING GIVES BACK
        </Heading>

        {/* hero savings card — the giant lime number */}
        <View className="mt-7 overflow-hidden rounded-3xl border border-volt/30 bg-volt/10 p-6">
          <Label className="text-volt/80">Projected savings this year</Label>
          <Display className="mt-1 text-7xl leading-tight text-volt">
            ${animatedAnnual.toLocaleString()}
          </Display>
          <View className="mt-5 flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-line bg-coal p-4">
              <Label>First month</Label>
              <Display className="mt-1 text-3xl text-chalk">
                ${firstMonth.toLocaleString()}
              </Display>
            </View>
            <View className="flex-1 rounded-2xl border border-line bg-coal p-4">
              <Label>Every month</Label>
              <Display className="mt-1 text-3xl text-chalk">
                ${monthly.toLocaleString()}
              </Display>
            </View>
          </View>
        </View>

        {/* health recovery timeline — clean dark list */}
        <View className="mt-9 flex-row items-center gap-2">
          <TrendingUp color={colors.volt} size={20} strokeWidth={2.5} />
          <Heading className="text-xl">Your body heals fast</Heading>
        </View>
        <View className="mt-4 gap-2.5">
          {milestones.map((m, i) => (
            // Rows fade-rise in sequence (40ms stagger) so the recovery timeline
            // reveals itself on mount — the body healing, step by step.
            <RiseIn key={m.label} index={i}>
              <View className="flex-row items-center gap-4 rounded-2xl border border-line bg-coal p-4">
                <View className="h-9 w-9 items-center justify-center rounded-full border border-line bg-card">
                  <Display className="text-lg leading-tight text-volt">{i + 1}</Display>
                </View>
                <View className="flex-1">
                  <Label className="text-ash">{formatHours(m.hours)}</Label>
                  <Body className="mt-0.5 font-body-semibold text-base text-chalk">{m.label}</Body>
                </View>
              </View>
            </RiseIn>
          ))}
        </View>

        <Body className="mt-6 font-body text-xs leading-5 text-ash">
          Recovery timelines reflect commonly reported milestones and are general guidance, not
          medical advice. Everyone&apos;s body is different — talk to a clinician about your health.
        </Body>
      </ScrollView>

      <View className="px-6 pb-3 pt-2">
        <Button label="CONTINUE" variant="primary" onPress={onContinue} />
      </View>
    </Screen>
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
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-7">
        <View className="mb-7 h-20 w-20 items-center justify-center rounded-3xl border border-volt/30 bg-volt/10">
          <Flame color={colors.volt} size={38} strokeWidth={2.5} />
        </View>

        <Heading className="text-5xl leading-none">
          {name ? `READY,\n${name.toUpperCase()}?` : 'READY TO\nSTART?'}
        </Heading>
        <Body className="mt-5 font-body-medium text-base leading-6 text-ash">
          Your quit clock starts the moment you commit. From here you&apos;ll see your clean time,
          your money saved — and you won&apos;t do it alone.
        </Body>

        <View className="mt-8 rounded-3xl border border-line bg-coal p-5">
          <Label>On track to save</Label>
          <Display className="mt-1 text-6xl leading-tight text-volt">
            ${annual.toLocaleString()}
          </Display>
          <Label className="mt-1 text-ash">this year</Label>
        </View>

        {error ? (
          <Body className="mt-5 font-body-semibold text-center text-sm text-sos">{error}</Body>
        ) : null}
      </View>

      <View className="px-6 pb-3 pt-2">
        <Button
          label="I'M COMMITTING — START MY QUIT"
          variant="primary"
          loading={submitting}
          disabled={submitting}
          onPress={onCommit}
        />
        <Label className="mt-4 text-center text-ash/70 normal-case tracking-normal">
          No account needed · we keep your progress safe on this device
        </Label>
      </View>
    </Screen>
  );
}

/** Help-framed push opt-in — explainer FIRST, then the OS prompt (Decision 2). */
/**
 * Buddy-pairing as the ACTIVATION event (P1). Shown right after commitment for
 * users who didn't arrive already paired via a deep link. The default path leads
 * to a buddy in session one — invite a friend (prefilled deep link) or matchmaking
 * (pair with a waiting quitter by product/stage/timezone); a solo bridge is allowed
 * but de-emphasized. Every path emits clean events (invite_offered, buddy_invited,
 * matchmaking_*, buddy_paired, solo_bridge_taken) so K-factor + the paired-vs-solo
 * wedge are measurable from the first cohort.
 */
function InviteBuddyStep({ onDone }: { onDone: () => void }) {
  const invite = useMutation(api.buddies.invite);
  const requestMatch = useMutation(api.buddies.requestMatch);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    track(Ev.INVITE_OFFERED, { invite_source: 'onboarding', is_default_path: true });
  }, []);

  const onInvite = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { userId } = await invite();
      const link = `hale://u/${userId}`;
      track(Ev.BUDDY_INVITED, { invite_source: 'onboarding', pairing_method: 'invite', link_id: userId });
      await Share.share({
        message: `I'm quitting nicotine with HALE — be my accountability buddy? We'll keep each other on streak. ${link}`,
        url: link,
      });
    } catch {
      // Share dismissed / invite failed — still land in the app (invite is pending).
    }
    setBusy(false);
    onDone();
  };

  const onMatch = async () => {
    if (busy) return;
    setBusy(true);
    track(Ev.MATCHMAKING_REQUESTED, {});
    try {
      const res = await requestMatch({});
      if (res?.matched) {
        track(Ev.MATCHMAKING_MATCHED, { pairing_method: 'matchmaking', pool_size: res.poolSize ?? 0 });
        track(Ev.BUDDY_PAIRED, { via: 'matchmaking', pairing_method: 'matchmaking' });
      } else {
        track(Ev.MATCHMAKING_NO_MATCH, { pool_size: res?.poolSize ?? 0 });
      }
    } catch {
      // best-effort; land in the app either way
    }
    setBusy(false);
    onDone();
  };

  const onSolo = () => {
    track(Ev.SOLO_BRIDGE_TAKEN, { reason: 'user_chose_solo' });
    onDone();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-7">
        <View className="mb-7 h-20 w-20 items-center justify-center rounded-3xl border border-volt/30 bg-volt/10">
          <Users color={colors.volt} size={38} strokeWidth={2.5} />
        </View>
        <Heading className="text-4xl leading-tight">QUIT WITH{'\n'}A BUDDY</Heading>
        <Body className="mt-5 font-body-medium text-base leading-6 text-ash">
          People with a buddy are far likelier to stay quit. Pair with someone who&apos;ll keep you
          honest — they only ever see your streak, never your slip-ups.
        </Body>

        <View className="mt-9 gap-3">
          <Button
            variant="primary"
            label="INVITE A BUDDY"
            loading={busy}
            onPress={onInvite}
            accessibilityLabel="Invite a buddy"
          />
          <Pressable
            onPress={onMatch}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Find me a buddy"
            className="h-14 flex-row items-center justify-center gap-2 rounded-2xl border border-line bg-coal px-6 active:opacity-80"
          >
            <Shuffle color={colors.chalk} size={18} strokeWidth={2.5} />
            <Heading className="text-sm text-chalk">FIND ME A BUDDY</Heading>
          </Pressable>
        </View>

        <Pressable
          onPress={onSolo}
          disabled={busy}
          accessibilityRole="button"
          className="mt-7 items-center py-2"
        >
          <Body className="text-sm text-ash">I&apos;ll start on my own</Body>
        </Pressable>
      </View>
    </Screen>
  );
}

function PushOptIn({ onDecide }: { onDecide: (granted: boolean) => void }) {
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-7">
        <View className="mb-7 h-20 w-20 items-center justify-center rounded-3xl border border-volt/30 bg-volt/10">
          <Bell color={colors.volt} size={38} strokeWidth={2.5} />
        </View>

        <Heading className="text-4xl leading-tight">
          WANT A NUDGE{'\n'}WHEN IT&apos;S{'\n'}HARDEST?
        </Heading>
        <Body className="mt-5 font-body-medium text-base leading-6 text-ash">
          The people who quit for good get a little support right before their toughest hour — a
          check-in, a craving tip, or a word from your buddy. No spam, ever.
        </Body>
      </View>

      <View className="gap-3 px-6 pb-3 pt-2">
        <Button
          label="YES, SUPPORT ME THROUGH IT"
          variant="primary"
          onPress={() => onDecide(true)}
        />
        <Pressable onPress={() => onDecide(false)} className="py-3">
          <Label className="text-center text-ash normal-case tracking-normal">Maybe later</Label>
        </Pressable>
      </View>
    </Screen>
  );
}

/* ========================================================================= *
 * Reusable bits
 * ========================================================================= */

function Question({
  index,
  title,
  subtitle,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      {/* Sage frames every question (HALE's mascot-warmth equivalent) as a flat
          typographic eyebrow — never a bubble/face — with the step folded in so
          the prompt reads as the coach asking it. The title is the screen hero. */}
      <Label className="text-volt">Sage · {index + 1}/{QUESTION_STEPS.length}</Label>
      <Heading className="mt-2 text-5xl leading-[0.98]">{title}</Heading>
      {subtitle ? (
        <Body className="mt-3 font-body-medium text-sm leading-6 text-ash">{subtitle}</Body>
      ) : null}
      <View className="mt-8 gap-3">{children}</View>
    </View>
  );
}

function ChoiceCard({
  Icon,
  label,
  selected,
  onPress,
}: {
  Icon?: Glyph;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        selected
          ? 'flex-row items-center gap-4 rounded-2xl border border-volt bg-raised px-5 py-4'
          : 'flex-row items-center gap-4 rounded-2xl border border-line bg-coal px-5 py-4 active:bg-card'
      }
      // Selected answer rises onto the raised plane with a volt lift — depth
      // carries the choice, not just a hue tint.
      style={
        selected
          ? { shadowColor: colors.volt, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } }
          : undefined
      }
    >
      {Icon ? (
        <View
          className={
            selected
              ? 'h-10 w-10 items-center justify-center rounded-xl bg-volt'
              : 'h-10 w-10 items-center justify-center rounded-xl border border-line bg-card'
          }
        >
          <Icon color={selected ? colors.voltInk : colors.ash} size={20} strokeWidth={2.5} />
        </View>
      ) : null}
      <Body
        className={
          selected
            ? 'flex-1 font-body-bold text-base text-chalk'
            : 'flex-1 font-body-medium text-base text-chalk'
        }
      >
        {label}
      </Body>
      <View
        className={
          selected
            ? 'h-7 w-7 items-center justify-center rounded-full bg-volt'
            : 'h-7 w-7 rounded-full border border-line'
        }
      >
        {selected ? <Check color={colors.voltInk} size={16} strokeWidth={3} /> : null}
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
          ? 'rounded-full border border-volt bg-volt px-5 py-3'
          : 'rounded-full border border-line bg-coal px-5 py-3 active:bg-card'
      }
    >
      <Body
        className={
          selected
            ? 'font-body-bold text-base text-volt-ink'
            : 'font-body-medium text-base text-chalk'
        }
      >
        {label}
      </Body>
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
