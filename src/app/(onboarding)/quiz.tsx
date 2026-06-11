import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
  TrendingUp,
} from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { setPendingBuddy, takePendingBuddy } from '@/lib/pendingBuddy';
import {
  Screen,
  Button,
  IconBtn,
  Steps,
  OptRow,
  Input,
  UnderlineInput,
  Eyebrow,
  H1,
  H3,
  Lead,
  Body,
  Muted,
  Card2,
  CardHero,
} from '@/ui';
import { RNText } from '@/ui/internal';
import { RiseIn } from '@/components/motion';
import { clean } from '@/theme/clean';
import { track, Ev } from '@/lib/analytics';
import { requestPushPermission } from '@/lib/onesignal';
import { identifyPurchaser } from '@/lib/revenuecat';
import { presentPaywall } from '@/lib/paywall';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import {
  projectedAnnualSavings,
  moneySaved,
  HEALTH_MILESTONES,
  type QuitProfile,
} from '@convex/model/plan';

/* ------------------------------------------------------------------------- *
 * O1 — Onboarding quiz → plan reveal → commitment. (Clean Dark v2.)
 *
 * Seven questions (design): product → daily amount → unit cost → triggers →
 * toughest time → motivation → name; then building → plan reveal → commit →
 * push opt-in → invite-a-buddy (the design's tail order).
 *
 * The savings inputs are SPLIT (decision 2026-06-10): we ask units/day and
 * $ per unit separately — exactly what the backend schema stores
 * (baselinePerDay × unitCost). All money math is a pure function of their
 * product, so the numbers match the old single monthly-spend input whenever
 * perDay × cost == monthly / 30 (locked by __tests__/plan.test.ts).
 *
 * Decision 2 (deferred sign-up): all answers live in LOCAL React state. We touch
 * the backend ONLY at commit — signIn('anonymous') THEN completeOnboarding.
 * ------------------------------------------------------------------------- */

type ProductType = 'vape' | 'pouch' | 'cig' | 'mixed';

type Answers = {
  productType: ProductType | null;
  perDay: number | null; // units per day (pods / pouches / cigarettes)
  unitCost: number | null; // $ per unit
  triggers: string[];
  hardestHour: number | null;
  motivation: string;
  name: string;
};

const INITIAL: Answers = {
  productType: null,
  perDay: null,
  unitCost: null,
  triggers: [],
  hardestHour: null,
  motivation: '',
  name: '',
};

/* lucide glyph type for option rows */
type Glyph = (props: { color?: string; size?: number; strokeWidth?: number }) => ReactNode;

/* ---- option sets (copy is per-product so the unit language stays honest) ---- */

const PRODUCTS: {
  value: ProductType;
  label: string;
  Icon: Glyph;
  unit: string;
  unitPl: string;
}[] = [
  { value: 'vape', label: 'Vape / e-cig', Icon: Wind, unit: 'pod', unitPl: 'pods' },
  { value: 'pouch', label: 'Nicotine pouches', Icon: Package, unit: 'pouch', unitPl: 'pouches' },
  { value: 'cig', label: 'Cigarettes', Icon: Cigarette, unit: 'cigarette', unitPl: 'cigarettes' },
  { value: 'mixed', label: 'A mix of things', Icon: Shuffle, unit: 'unit', unitPl: 'units' },
];

// Trigger labels per the design (Q4 tile grid) — 'Social' and 'Scrolling'
// replace the older long-form labels.
const TRIGGER_CHOICES = [
  'Stress',
  'Boredom',
  'After meals',
  'Coffee',
  'Alcohol',
  'Driving',
  'Social',
  'Scrolling',
  'Waking up',
  'Work breaks',
];

/**
 * Parse a free-typed time into a 0-23 hour for hardestHour. Accepts "9am",
 * "2 pm", "14", "14:00", "9". Returns null if it can't make sense of it, so the
 * step stays un-advanceable rather than saving garbage.
 */
function parseHourInput(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mer = m[3];
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return h;
}

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

/* The ordered question steps that own a progress segment. */
type StepKey =
  | 'productType'
  | 'perDay'
  | 'unitCost'
  | 'triggers'
  | 'hardestHour'
  | 'motivation'
  | 'name';

const QUESTION_STEPS: StepKey[] = [
  'productType',
  'perDay',
  'unitCost',
  'triggers',
  'hardestHour',
  'motivation',
  'name',
];

type Phase = 'questions' | 'building' | 'reveal' | 'commit' | 'push' | 'invitebuddy';

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
  const attributeInstall = useMutation(api.referrals.attributeInstall);

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
  // Whether the deep-link redemption already paired this user at commit —
  // decides where the push step exits to (design tail: commit → push → invite).
  const [pairedInOnboarding, setPairedInOnboarding] = useState(false);
  // Raw text for each step's "enter your own" input. Empty = using a preset;
  // non-empty = a custom value (presets read deselected while it's filled).
  const [customTrigger, setCustomTrigger] = useState('');
  const [customHour, setCustomHour] = useState('');
  const [customMotivation, setCustomMotivation] = useState('');
  // Raw text for the two numeric entries (Q2/Q3) so partial input ("0.", "12.")
  // doesn't fight the parsed value.
  const [perDayText, setPerDayText] = useState('');
  const [unitCostText, setUnitCostText] = useState('');

  useEffect(() => {
    track(Ev.ONBOARDING_STARTED);
  }, []);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const step = QUESTION_STEPS[stepIndex];
  const product = PRODUCTS.find((p) => p.value === answers.productType) ?? PRODUCTS[3];

  const canAdvance = useMemo(() => {
    switch (step) {
      case 'productType':
        return answers.productType !== null;
      case 'perDay':
        return answers.perDay !== null && answers.perDay > 0;
      case 'unitCost':
        return answers.unitCost !== null && answers.unitCost > 0;
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

  /* The "wow" numbers — PURE math, computed entirely client-side (Decision 2).
     Split inputs (decision 2026-06-10): baselinePerDay and unitCost are stored
     exactly as asked; every downstream number is their product (model/plan.ts). */
  const profile: QuitProfile = {
    productType: (answers.productType ?? 'mixed') as ProductType,
    baselinePerDay: answers.perDay ?? 0,
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
      const { userId } = await completeOnboarding({
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
      // App-managed 14-day full-access floor begins now (§8) — granted server-side
      // in completeOnboarding. This is the soft floor for anyone who dismisses the
      // paywall below; it is NOT the StoreKit subscription trial.
      track(Ev.TRIAL_STARTED, { trial_days: 14, trial_type: 'app_managed' });

      // Peak-intent paywall — monetize right after the personalized plan reveal,
      // at maximum motivation (the data-backed conversion moment). Onboarding runs
      // BEFORE the tabs layer that normally identifies the purchaser, so we log the
      // RC user in here first — otherwise a purchase would attribute to an
      // anonymous RC id. Dismissible: whatever the result, we fall through to the
      // buddy step so the invite loop (HALE's #1 asset) is never blocked.
      await identifyPurchaser(userId);
      const pwResult = await presentPaywall('onboarding_peak');
      if (pwResult === PAYWALL_RESULT.PURCHASED || pwResult === PAYWALL_RESULT.RESTORED) {
        // StoreKit 14-day (2-week) intro trial (or direct purchase) started via the paywall.
        track(Ev.TRIAL_STARTED, { trial_days: 14, trial_type: 'storekit' });
      }

      // Redeem a pending buddy invite (S1: auto-pair on first open via deep link).
      // This is ALSO the referral trigger: attribution (install via link) then
      // completion (buddy-pair). Install alone never counts — pairing is the bar.
      let paired = false;
      const pendingBuddy = await takePendingBuddy();
      if (pendingBuddy) {
        const referrerId = pendingBuddy as Id<'users'>;
        // 1) INSTALL attribution — set-once, self-ref blocked server-side.
        let attributionDurable = false;
        try {
          const attr = await attributeInstall({ referrerId });
          attributionDurable = true; // server answered — referredBy settled either way
          if (attr?.attributed) {
            track(Ev.REFERRAL_INSTALL_ATTRIBUTED, { referrer_id: referrerId });
          }
        } catch {
          // Non-fatal: pairing below still works without attribution. The stash
          // is re-set below if NOTHING durable happened, so a transient network
          // blip at commit doesn't permanently destroy the referral.
        }
        // 2) COMPLETION — pairing fires the server-side referral completion hook.
        try {
          const pair = await pairWith({ inviterId: referrerId, pairingMethod: 'invite_onboard' });
          track(Ev.BUDDY_PAIRED, { via: 'invite_onboard', pairing_method: 'invite_onboard' });
          paired = true;
          // Funnel events keyed on the referrer (fired from the invitee's device).
          // pair.referrerId is the server's authoritative attribution — it can
          // differ from the link's referrerId if this user was attributed earlier.
          const refId = pair?.referrerId ?? referrerId;
          if (pair?.referralCompleted) {
            track(Ev.REFERRAL_BUDDY_PAIRED, { referrer_id: refId });
          }
          if (pair?.referrerReachedGoal) {
            track(Ev.REFERRAL_COMPLETED, { referrer_id: refId });
          }
          if (pair?.rewardGranted) {
            track(Ev.REWARD_GRANTED, { referrer_id: refId, reward_days: 7 });
          }
        } catch {
          // Best-effort; never block landing in the app.
        }
        // Nothing durable happened (attribution never reached the server AND no
        // pair landed) → put the invite back so it isn't lost to one bad moment.
        if (!attributionDurable && !paired) {
          void setPendingBuddy(referrerId);
        }
      }
      // Design tail order: commit → push opt-in → buddy step. The push step's
      // exit uses pairedInOnboarding to skip the buddy step for users who
      // already arrived paired via a deep link.
      setPairedInOnboarding(paired);
      setPhase('push');
    } catch (e) {
      setError('Something went wrong starting your plan. Please try again.');
      setSubmitting(false);
    }
  };

  const finishPushStep = (granted: boolean) => {
    if (granted) requestPushPermission(); // only after the explainer (Decision 2)
    // Already paired via deep link → straight into the app; else the buddy step
    // (pairing is the activation event — the default path leads to a buddy).
    if (pairedInOnboarding) {
      router.replace('/(tabs)/today');
    } else {
      setPhase('invitebuddy');
    }
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

  if (phase === 'invitebuddy') {
    return <InviteBuddyStep onDone={() => router.replace('/(tabs)/today')} />;
  }

  /* ----------------------------- question phase --------------------------- */

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* header: back + progress steps (design .steps segments) */}
        <View className="flex-row items-center justify-between px-5 pt-1">
          <IconBtn onPress={goBack} hitSlop={12} accessibilityLabel="Back">
            <ChevronLeft color={clean.fg} size={22} strokeWidth={2.5} />
          </IconBtn>
          <Steps total={QUESTION_STEPS.length} current={stepIndex} />
          <View className="h-11 w-11" />
        </View>

        <ScrollView
          className="flex-1"
          // grow + justify-center = "center the question when it's short, scroll when
          // it's long" (design 'oblist'). No gray dead-space at the bottom.
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
                <OptRow
                  key={p.value}
                  label={p.label}
                  on={answers.productType === p.value}
                  onPress={() => set('productType', p.value)}
                  icon={
                    <p.Icon
                      color={answers.productType === p.value ? clean.accentInk : clean.fg2}
                      size={22}
                      strokeWidth={2.2}
                    />
                  }
                />
              ))}
            </Question>
          )}

          {step === 'perDay' && (
            <Question
              index={stepIndex}
              title={`How many ${product.unitPl} a day?`}
              subtitle="Ballpark is fine. We use it to size your savings."
            >
              <Eyebrow className="mb-3">{product.unitPl} per day</Eyebrow>
              <UnderlineInput
                filled={answers.perDay !== null && answers.perDay > 0}
                value={perDayText}
                onChangeText={(t) => {
                  const digits = t.replace(/[^0-9]/g, '');
                  setPerDayText(digits);
                  const n = digits ? parseInt(digits, 10) : 0;
                  set('perDay', n > 0 ? n : null);
                }}
                placeholder="0"
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
                suffix="a day"
                accessibilityLabel={`${product.unitPl} per day`}
              />
            </Question>
          )}

          {step === 'unitCost' && (
            <Question
              index={stepIndex}
              title={`What does one ${product.unit} cost?`}
              subtitle="Roughly. This is what we'll turn into money back in your pocket."
            >
              <Eyebrow className="mb-3">Cost per {product.unit}</Eyebrow>
              <UnderlineInput
                filled={answers.unitCost !== null && answers.unitCost > 0}
                value={unitCostText}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9.]/g, '');
                  setUnitCostText(cleaned);
                  const n = parseFloat(cleaned);
                  set('unitCost', Number.isFinite(n) && n > 0 ? n : null);
                }}
                placeholder="0.00"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
                prefix="$"
                suffix="each"
                accessibilityLabel={`Cost per ${product.unit}`}
              />
            </Question>
          )}

          {step === 'triggers' && (
            <Question
              index={stepIndex}
              title="When do cravings hit hardest?"
              subtitle="Pick all that hit. Your plan works around them."
            >
              {/* Design Q4: 2-column grid of checkbox tiles (multi-select reads
                  as checkboxes, distinct from the single-select radios). */}
              <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                {[...TRIGGER_CHOICES, ...answers.triggers.filter((t) => !TRIGGER_CHOICES.includes(t))].map(
                  (t) => {
                    const selected = answers.triggers.includes(t);
                    return (
                      <Pressable
                        key={t}
                        onPress={() =>
                          set(
                            'triggers',
                            selected
                              ? answers.triggers.filter((x) => x !== t)
                              : [...answers.triggers, t],
                          )
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        className={`h-[62px] flex-row items-center gap-3 rounded-tile px-4 active:scale-[0.98] ${
                          selected
                            ? 'border-[1.5px] border-accent-edge bg-accent-soft'
                            : 'border border-stroke bg-surface'
                        }`}
                        style={{ width: '48%', flexGrow: 1 }}
                      >
                        <View
                          className={`h-[23px] w-[23px] items-center justify-center rounded-md ${
                            selected ? 'bg-accent' : 'border border-stroke-2'
                          }`}
                        >
                          {selected ? (
                            <Check color={clean.accentInk} size={15} strokeWidth={3} />
                          ) : null}
                        </View>
                        <RNText
                          className="flex-1 font-sora-semibold text-[15px] text-fg"
                          numberOfLines={1}
                        >
                          {t}
                        </RNText>
                      </Pressable>
                    );
                  },
                )}
              </View>
              <Input
                value={customTrigger}
                onChangeText={setCustomTrigger}
                placeholder="Add your own, type and press return"
                autoCapitalize="sentences"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const t = customTrigger.trim();
                  if (t && !answers.triggers.includes(t)) {
                    set('triggers', [...answers.triggers, t]);
                  }
                  setCustomTrigger('');
                }}
                className="mt-4"
              />
            </Question>
          )}

          {step === 'hardestHour' && (
            <Question
              index={stepIndex}
              title="What's your toughest time of day?"
              subtitle="We'll check in with you right before it."
            >
              {HOUR_BANDS.map((b) => (
                <OptRow
                  key={b.hour}
                  label={b.label}
                  // A typed custom time deselects the bands.
                  on={customHour === '' && answers.hardestHour === b.hour}
                  onPress={() => {
                    setCustomHour('');
                    set('hardestHour', b.hour);
                  }}
                />
              ))}
              <Input
                value={customHour}
                onChangeText={(t) => {
                  setCustomHour(t);
                  set('hardestHour', parseHourInput(t));
                }}
                placeholder="Or enter a time, e.g. 9am, 2pm, 14:00"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
                className="mt-1"
              />
            </Question>
          )}

          {step === 'motivation' && (
            <Question
              index={stepIndex}
              title="What's pulling you forward?"
              subtitle="Your reason shows up when cravings do."
            >
              {MOTIVATIONS.map((m) => (
                <OptRow
                  key={m.value}
                  label={m.label}
                  on={customMotivation === '' && answers.motivation === m.value}
                  onPress={() => {
                    setCustomMotivation('');
                    set('motivation', m.value);
                  }}
                  icon={
                    <m.Icon
                      color={
                        customMotivation === '' && answers.motivation === m.value
                          ? clean.accentInk
                          : clean.fg2
                      }
                      size={22}
                      strokeWidth={2.2}
                    />
                  }
                />
              ))}
              <Input
                value={customMotivation}
                onChangeText={(t) => {
                  setCustomMotivation(t);
                  set('motivation', t.trim());
                }}
                placeholder="Or write your own reason"
                autoCapitalize="sentences"
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
                className="mt-1"
              />
            </Question>
          )}

          {step === 'name' && (
            <Question
              index={stepIndex}
              title="What should we call you?"
              subtitle="Just a first name, so your plan feels like yours. Optional."
            >
              <Input
                value={answers.name}
                onChangeText={(t) => set('name', t)}
                placeholder="First name"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
              />
            </Question>
          )}
        </ScrollView>

        {/* in-flow CTA, pinned to the bottom (design ObChrome cta slot) */}
        <View className="px-gutter pb-[30px] pt-4">
          <Button
            label={stepIndex === QUESTION_STEPS.length - 1 ? 'Build my plan' : 'Continue'}
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
        <ActivityIndicator color={clean.accent} size="large" />
        <H1 className="mt-8 text-center">
          {name ? `Hang tight, ${name}` : 'Hang tight'}
        </H1>
        <Lead className="mt-3 text-center">Building your personalized quit plan</Lead>

        <View className="mt-12 w-full" style={{ gap: 10 }}>
          {lines.map((l, i) => (
            <View
              key={l}
              className={`flex-row items-center gap-3 rounded-tile px-4 py-3.5 ${
                i < done
                  ? 'border border-accent-edge bg-accent-soft'
                  : 'border border-stroke bg-surface'
              }`}
            >
              <View
                className={`h-7 w-7 items-center justify-center rounded-pill ${
                  i < done ? 'bg-accent' : 'border border-stroke-2'
                }`}
              >
                {i < done ? <Check color={clean.accentInk} size={16} strokeWidth={3} /> : null}
              </View>
              <Body className={`flex-1 ${i < done ? 'font-sora-semibold text-fg' : 'text-fg-3'}`}>
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
  // No status badge above the headline (anti-AI rule from the design chat).
  const animatedAnnual = useCountUp(annual);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-gutter pt-7 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <H1>
          {name ? `${name}, here's what` : "Here's what"}
          {'\n'}quitting gives back
        </H1>

        {/* hero savings card — the screen's ONE emerald focal element */}
        <CardHero pad className="mt-7">
          <Eyebrow className="text-accent">Projected savings this year</Eyebrow>
          <RNText className="mt-2 font-sora-bold text-[56px] leading-[60px] tracking-[-1.68px] text-accent">
            ${animatedAnnual.toLocaleString()}
          </RNText>
          <View className="mt-5 flex-row gap-3">
            <Card2 pad className="flex-1">
              <Eyebrow>First month</Eyebrow>
              <RNText className="mt-1.5 font-sora-bold text-[28px] tracking-[-0.56px] text-fg">
                ${firstMonth.toLocaleString()}
              </RNText>
            </Card2>
            <Card2 pad className="flex-1">
              <Eyebrow>Every month</Eyebrow>
              <RNText className="mt-1.5 font-sora-bold text-[28px] tracking-[-0.56px] text-fg">
                ${monthly.toLocaleString()}
              </RNText>
            </Card2>
          </View>
        </CardHero>

        {/* health recovery timeline */}
        <View className="mt-9 flex-row items-center gap-2">
          <TrendingUp color={clean.fg2} size={20} strokeWidth={2.2} />
          <H3>Your body heals fast</H3>
        </View>
        <View className="mt-4" style={{ gap: 10 }}>
          {milestones.map((m, i) => (
            // Rows fade-rise in sequence (40ms stagger) so the recovery timeline
            // reveals itself on mount — the body healing, step by step.
            <RiseIn key={m.label} index={i}>
              <View className="flex-row items-center gap-4 rounded-tile border border-stroke bg-surface p-4">
                <View className="h-9 w-9 items-center justify-center rounded-pill border border-stroke bg-surface-2">
                  <RNText className="font-sora-bold text-[15px] text-fg-2">{i + 1}</RNText>
                </View>
                <View className="flex-1">
                  <Eyebrow>{formatHours(m.hours)}</Eyebrow>
                  <Body className="mt-0.5 font-sora-semibold text-fg">{m.label}</Body>
                </View>
              </View>
            </RiseIn>
          ))}
        </View>

        <Muted className="mt-6 text-[12px] leading-5">
          Recovery timelines reflect commonly reported milestones and are general guidance, not
          medical advice. Everyone&apos;s body is different, talk to a clinician about your health.
        </Muted>
      </ScrollView>

      <View className="px-gutter pb-[30px] pt-4">
        <Button label="Continue" variant="primary" onPress={onContinue} />
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
      <View className="flex-1 justify-center px-gutter">
        <H1 className="text-[38px] leading-[42px]">
          {name ? `Ready,\n${name}?` : 'Ready to\nstart?'}
        </H1>
        <Lead className="mt-5">
          Your quit clock starts the moment you commit. From here you&apos;ll see your clean time,
          your money saved, and you won&apos;t do it alone.
        </Lead>

        {/* the screen's ONE emerald focal element */}
        <CardHero pad className="mt-8">
          <Eyebrow>On track to save</Eyebrow>
          <RNText className="mt-1 font-sora-bold text-[56px] leading-[60px] tracking-[-1.68px] text-accent">
            ${annual.toLocaleString()}
          </RNText>
          <Eyebrow className="mt-1">this year</Eyebrow>
        </CardHero>

        {error ? (
          <Body className="mt-5 text-center font-sora-semibold text-sm text-coral">{error}</Body>
        ) : null}
      </View>

      <View className="px-gutter pb-[30px] pt-4">
        <Button
          label="I'm committing. Start my quit"
          variant="primary"
          loading={submitting}
          disabled={submitting}
          onPress={onCommit}
        />
        <Muted className="mt-4 text-center text-[12px]">
          No account needed · we keep your progress safe on this device
        </Muted>
      </View>
    </Screen>
  );
}

/** Help-framed push opt-in — explainer FIRST, then the OS prompt (Decision 2). */
function PushOptIn({ onDecide }: { onDecide: (granted: boolean) => void }) {
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-gutter">
        <View className="mb-7 h-[58px] w-[58px] items-center justify-center rounded-xl border border-accent-edge bg-accent-soft">
          <Bell color={clean.accent} size={26} strokeWidth={2.2} />
        </View>

        <H1 className="text-[34px] leading-[38px]">
          Want a nudge{'\n'}when it&apos;s hardest?
        </H1>
        <Lead className="mt-5">
          The people who quit for good get a little support right before their toughest hour, a
          check-in, a craving tip, or a word from your buddy. No spam, ever.
        </Lead>
      </View>

      <View className="gap-2 px-gutter pb-[30px] pt-4">
        <Button label="Yes, support me through it" variant="primary" onPress={() => onDecide(true)} />
        <Button label="Maybe later" variant="ghost" onPress={() => onDecide(false)} />
      </View>
    </Screen>
  );
}

/**
 * Buddy-pairing as the ACTIVATION event (P1). Shown after the push opt-in for
 * users who didn't arrive already paired via a deep link (design tail order).
 * The default path leads to a buddy in session one — invite a friend (via the
 * referral hub) or matchmaking (pair with a waiting quitter by product/stage/
 * timezone); a solo bridge is allowed but de-emphasized. Every path emits clean
 * events (invite_offered, buddy_invited, matchmaking_*, buddy_paired,
 * solo_bridge_taken) so K-factor + the paired-vs-solo wedge are measurable.
 */
function InviteBuddyStep({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const requestMatch = useMutation(api.buddies.requestMatch);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    track(Ev.INVITE_OFFERED, { invite_source: 'onboarding', is_default_path: true });
  }, []);

  // The design's late nav rewire: "Invite a buddy" opens the referral hub
  // (invite + referral are ONE loop — the hub's share carries the typed-code
  // fallback and counts toward the 7-day reward). BUDDY_INVITED still fires so
  // the K-factor funnel keeps its anchor event.
  const onInvite = () => {
    if (busy) return;
    track(Ev.BUDDY_INVITED, { invite_source: 'onboarding', pairing_method: 'invite' });
    router.push({ pathname: '/referral', params: { from: 'onboarding' } });
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
        // A matchmade pair can complete this user's pending referral (any-pair
        // rule) — mirror the same funnel events the deep-link path fires.
        if (!res.alreadyPaired) {
          if (res.referralCompleted && res.referrerId) {
            track(Ev.REFERRAL_BUDDY_PAIRED, { referrer_id: res.referrerId });
          }
          if (res.referrerReachedGoal && res.referrerId) {
            track(Ev.REFERRAL_COMPLETED, { referrer_id: res.referrerId });
          }
          if (res.rewardGranted && res.referrerId) {
            track(Ev.REWARD_GRANTED, { referrer_id: res.referrerId, reward_days: 7 });
          }
        }
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
      <View className="flex-1 justify-center px-gutter">
        {/* warm = the buddy/together lane */}
        <View className="mb-7 h-[58px] w-[58px] items-center justify-center rounded-xl border border-warm-edge bg-warm-soft">
          <Users color={clean.warm} size={26} strokeWidth={2.2} />
        </View>
        <H1 className="text-[34px] leading-[38px]">Quit with{'\n'}a buddy</H1>
        <Lead className="mt-5">
          People with a buddy are far likelier to stay quit. Pair with someone who&apos;ll keep you
          honest, they only ever see your streak, never your slip-ups.
        </Lead>

        <View className="mt-9 gap-3">
          <Button
            variant="primary"
            label="Invite a buddy"
            onPress={onInvite}
            accessibilityLabel="Invite a buddy"
          />
          <Button
            variant="secondary"
            label="Find me a buddy"
            disabled={busy}
            onPress={onMatch}
            icon={<Shuffle color={clean.fg} size={18} strokeWidth={2.2} />}
            accessibilityLabel="Find me a buddy"
          />
        </View>

        <Button
          variant="ghost"
          label="I'll start on my own"
          disabled={busy}
          onPress={onSolo}
          className="mt-4"
        />
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
      <Eyebrow className="text-accent">
        Sage · {index + 1}/{QUESTION_STEPS.length}
      </Eyebrow>
      <H1 className="mt-3 max-w-[320px] text-[34px] leading-[38px]">{title}</H1>
      {subtitle ? <Lead className="mt-3.5">{subtitle}</Lead> : null}
      <View className="mt-7" style={{ gap: 12 }}>
        {children}
      </View>
    </View>
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
