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
import { LinearGradient } from 'expo-linear-gradient';
import { clean } from '@/theme/clean';
import { track, Ev } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { requestPushPermission } from '@/lib/onesignal';
import { identifyPurchaser } from '@/lib/revenuecat';
import { parseMoneyInput } from '@/lib/money';
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
 * The savings inputs are SPLIT (decision 2026-06-10): amount and cost are
 * separate questions, stored as baselinePerDay × unitCost ($/unit). Since
 * 2026-07-02 the QUESTIONS are product-shaped (vape frequency presets, pack
 * language + pack price for cigarettes, tin price for pouches, whole-day
 * spend for mixed) and normalize to that same stored pair — see PRODUCTS.
 * All money math is a pure function of their product (model/plan.ts, locked
 * by __tests__/plan.test.ts).
 *
 * Decision 2 (deferred sign-up): all answers live in LOCAL React state. We touch
 * the backend ONLY at commit — signIn('anonymous') THEN completeOnboarding.
 * ------------------------------------------------------------------------- */

type ProductType = 'vape' | 'pouch' | 'cig' | 'mixed';

type Answers = {
  productType: ProductType | null;
  perDay: number | null; // units/day — can be fractional (a vape every 3 days ≈ 0.33)
  unitCost: number | null; // $ as ENTERED (per vape / pack / tin / day) — normalized in `profile`
  /** Minutes from waking to first use: 5 | 30 | 60 | 999. Fagerström's single
   *  strongest dependence item. Client-side only (drives the score reveal); it
   *  is NOT sent to completeOnboarding, so the schema is untouched. */
  wakeUse: number | null;
  triggers: string[];
  hardestHour: number | null;
  motivation: string;
  name: string;
};

const INITIAL: Answers = {
  productType: null,
  perDay: null,
  unitCost: null,
  wakeUse: null,
  triggers: [],
  hardestHour: null,
  motivation: '',
  name: '',
};

/** Q: how soon after waking do you first reach for it? (Fagerström item 1) */
const WAKE_OPTIONS: { label: string; sub?: string; value: number }[] = [
  { label: 'Within 5 minutes', value: 5 },
  { label: '5 to 30 minutes', value: 30 },
  { label: '30 to 60 minutes', value: 60 },
  { label: 'More than an hour', value: 999 },
];

/**
 * Nicotine dependence score, 0-10, adapted from the Fagerström Test for Nicotine
 * Dependence. Pure, client-side, and NOT a diagnosis — the reveal copy carries
 * the same "typically / not medical advice" framing as HEALTH_MILESTONES
 * (Guideline 1.4.1).
 *
 *   time-to-first-use  0-3   (the strongest single predictor)
 *   amount vs product  0-2.5
 *   trigger breadth    0-2   (0.5 each, capped)
 * Raw max 7.5, rescaled to 10.
 */
function dependenceScore(a: Answers): number {
  // Fagerström item 1 — time to first use after waking. 0-3.
  const wake = a.wakeUse === 5 ? 3 : a.wakeUse === 30 ? 2 : a.wakeUse === 60 ? 1 : 0;

  // Amount, scaled CONTINUOUSLY against a heavy-use ceiling per product. This
  // used to be three coarse buckets where anything >= a pack a day scored full
  // marks — so a pack-a-day smoker and a three-pack-a-day smoker were identical,
  // and a completely ordinary profile (pack a day, smokes on waking, 4 triggers)
  // landed on a perfect 10.0/10. A maxed-out score reads as rigged. The top of
  // the scale is now reserved for genuinely extreme use.
  const n = Math.max(0, a.perDay ?? 0);
  const heavyCeiling =
    a.productType === 'cig'
      ? 30 // 1.5 packs/day
      : a.productType === 'pouch'
        ? 20
        : a.productType === 'vape'
          ? 1.5 // devices/day
          : 20; // mixed: times/day reaching for it
  const amount = 2.5 * Math.min(1, n / heavyCeiling);

  // Trigger breadth. Needs SIX to max, not four.
  const triggers = 2 * Math.min(1, a.triggers.length / 6);

  const raw = wake + amount + triggers; // 0 - 7.5
  return Math.round(raw * (10 / 7.5) * 10) / 10; // one decimal, 0 - 10
}

/** Band label + the line that reframes the score into a reason to use HALE. */
function scoreBand(score: number): { label: string; line: string } {
  if (score >= 8.5)
    return {
      label: 'Severe',
      line: 'Nicotine has a deep hold here. This is not a willpower problem, and willpower alone rarely wins. A plan does.',
    };
  if (score >= 6.5)
    return {
      label: 'High',
      line: 'Your brain is asking for nicotine on a schedule. People at this level almost never quit on willpower alone.',
    };
  if (score >= 3.5)
    return {
      label: 'Moderate',
      line: 'The habit has roots, but they are not deep yet. This is the level where a real plan makes the biggest difference.',
    };
  return {
    label: 'Low',
    line: 'You are further from dependence than most. That is a head start, and it is exactly the moment to quit for good.',
  };
}

/* lucide glyph type for option rows */
type Glyph = (props: { color?: string; size?: number; strokeWidth?: number }) => ReactNode;

/* ---- option sets (copy is per-product so the unit language stays honest) ----
 *
 * Q2/Q3 ask what people ACTUALLY know about their own habit (decision
 * 2026-07-02 — "pods per day" was meaningless to most vapers and smokers):
 *   vape  → how often a device/pod runs out (presets, can be < 1/day) + $ per device
 *   cig   → cigarettes/day in pack language (a few … two packs+)      + $ per PACK
 *   pouch → pouches/day (users do know this)                          + $ per TIN
 *   mixed → times/day they reach for nicotine                         + $ per DAY total
 * Every path still normalizes to baselinePerDay × unitCost ($/unit) — the
 * backend schema and model/plan.ts money math are untouched (see `profile`).
 */

type AmountOption = { label: string; sub?: string; value: number }; // value = units/day

const PRODUCTS: {
  value: ProductType;
  label: string;
  Icon: Glyph;
  /* Q2 — amount. Presets when the honest answer isn't a daily count. */
  q2Title: string;
  q2Options?: AmountOption[];
  q2Eyebrow?: string; // free-number mode
  q2Suffix?: string;
  /* Q3 — cost, asked in the price people actually pay at the counter. */
  q3Title: string;
  q3Subtitle: string;
  q3Eyebrow: string;
  /* Normalizes the entered price to $/unit: divisor ('perDay' = the entered
     value is a whole-day spend, divide by Q2's answer). */
  costDivisor: number | 'perDay';
}[] = [
  {
    value: 'vape',
    label: 'Vape / e-cig',
    Icon: Wind,
    q2Title: 'How often do you go through a vape or pod?',
    q2Options: [
      { label: 'More than one a day', value: 1.5 },
      { label: 'About one a day', value: 1 },
      { label: 'One every 2–3 days', value: 0.4 },
      { label: 'One or two a week', value: 0.2 },
      { label: 'A few a month', value: 0.1 },
    ],
    q3Title: 'What does one usually cost you?',
    q3Subtitle: 'Whatever you pay per vape or pod. Disposables often run $15 to $25. Roughly is fine.',
    q3Eyebrow: 'Cost per vape / pod',
    costDivisor: 1,
  },
  {
    value: 'pouch',
    label: 'Nicotine pouches',
    Icon: Package,
    q2Title: 'How many pouches a day?',
    q2Eyebrow: 'pouches per day',
    q2Suffix: 'a day',
    q3Title: 'What does a tin cost?',
    q3Subtitle: 'Most tins hold about 15 pouches. Roughly is fine.',
    q3Eyebrow: 'Cost per tin',
    costDivisor: 15,
  },
  {
    value: 'cig',
    label: 'Cigarettes',
    Icon: Cigarette,
    q2Title: 'How much do you smoke a day?',
    q2Options: [
      { label: 'A few a day', sub: '1–5 cigarettes', value: 4 },
      { label: 'Around half a pack', sub: 'about 10 a day', value: 10 },
      { label: 'About a pack a day', sub: 'about 20', value: 20 },
      { label: 'Around two packs', sub: 'about 40', value: 40 },
      { label: 'More than two packs', sub: 'it adds up fast, and that changes now', value: 60 },
    ],
    q3Title: 'What does a pack cost where you live?',
    q3Subtitle: 'Prices swing a lot by state and brand. Ballpark is fine.',
    q3Eyebrow: 'Cost per pack',
    costDivisor: 20, // 20 cigarettes per pack
  },
  {
    value: 'mixed',
    label: 'A mix of things',
    Icon: Shuffle,
    q2Title: 'How many times a day do you reach for nicotine?',
    q2Eyebrow: 'times per day',
    q2Suffix: 'times a day',
    q3Title: 'About how much do you spend on nicotine a day?',
    q3Subtitle: "Across everything you use. This is what we'll turn into money back in your pocket.",
    q3Eyebrow: 'Spend per day',
    costDivisor: 'perDay',
  },
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
  | 'wakeUse'
  | 'triggers'
  | 'hardestHour'
  | 'motivation'
  | 'name';

const QUESTION_STEPS: StepKey[] = [
  'productType',
  'perDay',
  'unitCost',
  'wakeUse',
  'triggers',
  'hardestHour',
  'motivation',
  'name',
];

// 'score' sits between the building beat and the plan reveal: name the problem
// (dependence score), THEN show the way out (the plan). That order is what makes
// the paywall land at peak intent.
type Phase = 'questions' | 'building' | 'score' | 'reveal' | 'commit' | 'push' | 'invitebuddy';

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
/**
 * Reject if a promise has not settled in `ms`. Used to bound network calls that
 * ship no timeout of their own (Convex `signIn`, `completeOnboarding`), so an
 * unreachable backend fails loudly instead of hanging the UI on a dead spinner.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

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
  // Offline/slow networks: the commit can sit in a silent spinner for ~12s
  // before erroring (ui-audit D9) — surface an honest hint after 5s.
  const [slowHint, setSlowHint] = useState(false);
  useEffect(() => {
    if (!submitting) {
      setSlowHint(false);
      return;
    }
    const t = setTimeout(() => setSlowHint(true), 5000);
    return () => clearTimeout(t);
  }, [submitting]);
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
      case 'wakeUse':
        return answers.wakeUse !== null;
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

  /* "Building your plan" → dependence score. The plan reveal follows the score. */
  useEffect(() => {
    if (phase !== 'building') return;
    const t = setTimeout(() => {
      setPhase('score');
      // The score landing is a weighty moment — name the problem, then solve it.
      haptics.success();
    }, 2400);
    return () => clearTimeout(t);
  }, [phase]);

  /* The "wow" numbers — PURE math, computed entirely client-side (Decision 2).
     The stored pair stays baselinePerDay × unitCost ($/unit) exactly as the
     schema and model/plan.ts expect; only the QUESTIONS changed (2026-07-02).
     The entered price is normalized here: pack → /20, tin → /15, whole-day
     spend (mixed) → /perDay. Semantics of existing user rows are unchanged. */
  const perDayAnswer = answers.perDay ?? 0;
  const enteredCost = answers.unitCost ?? 0;
  const profile: QuitProfile = {
    productType: (answers.productType ?? 'mixed') as ProductType,
    baselinePerDay: perDayAnswer,
    unitCost:
      product.costDivisor === 'perDay'
        ? perDayAnswer > 0
          ? enteredCost / perDayAnswer
          : 0
        : enteredCost / product.costDivisor,
  };
  const annual = Math.round(projectedAnnualSavings(profile));
  const firstMonth = Math.round(moneySaved(profile, 30 * 86_400_000));
  // NOT "every month": that is annual/12, which is the same number as firstMonth,
  // so the two tiles rendered identical values and read like a bug. Five years is
  // a genuinely different (and far more motivating) figure.
  const fiveYear = annual * 5;
  const previewMilestones = HEALTH_MILESTONES.slice(0, 5);
  // Peak-intent reveal extras (client-side, honest framing).
  //  • Life regained — cigarettes only. UCL 2024 (Addiction): ~20 min of life
  //    expectancy per cigarette. days/yr = perDay × 20 × 365 / 1440.
  //  • Freedom date — quit + 90 days, where cravings typically fade to
  //    occasional (anchored to HEALTH_MILESTONES). Framed as general guidance.
  const lifeDaysPerYear =
    profile.productType === 'cig'
      ? Math.round((profile.baselinePerDay * 20 * 365) / 1440)
      : null;
  const freedomDate = new Date(Date.now() + 90 * 86_400_000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  // Dependence score — names the problem right before the plan names the way out.
  const score = dependenceScore(answers);
  const band = scoreBand(score);

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
        // signIn() has NO timeout of its own. If Convex is unreachable (backend
        // down, captive wifi, plane mode) it never settles, so the commit button
        // spins FOREVER: no error, no retry, no way out — the single worst place
        // in the app to strand someone, because they have just committed to
        // quitting. Race it so an unreachable backend surfaces as a real error.
        await withTimeout(signIn('anonymous'), 15_000, 'sign-in timed out');
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
      // The single most meaningful moment in the app: they committed to quitting.
      // Heavy impact — weighty and deliberate, nothing else in onboarding uses it.
      haptics.heavy();
      // Identify the purchaser BEFORE the paywall (onboarding runs before the
      // tabs layer that normally does this) — otherwise a purchase would
      // attribute to an anonymous RC id.
      await identifyPurchaser(userId);

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
          // Pending-buddy redemption succeeded — the pairing landed.
          haptics.success();
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
      // HARD paywall at peak intent: a non-dismissible Clean Dark wall pushed
      // OVER the push step (real StoreKit purchase inside). It can't be left
      // without a decision (route gestureEnabled:false + Android back swallowed
      // + no close), so a non-purchase can't fall through into the app. On
      // purchase it pops back here to finish onboarding (push opt-in → buddy).
      // Personalized with the user's own numbers for peak-intent conversion.
      router.push({
        pathname: '/paywall',
        params: {
          from: 'onboarding',
          save: String(annual),
          product: profile.productType,
          ...(answers.name.trim() ? { name: answers.name.trim() } : {}),
        },
      });
    } catch (e) {
      // System failure — the backend couldn't start the plan.
      haptics.error();
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

  if (phase === 'score') {
    return (
      <ScoreReveal
        score={score}
        bandLabel={band.label}
        bandLine={band.line}
        onContinue={() => {
          setPhase('reveal');
          haptics.success();
          track(Ev.PLAN_VIEWED);
        }}
      />
    );
  }

  if (phase === 'reveal') {
    return (
      <PlanReveal
        name={answers.name.trim()}
        annual={annual}
        fiveYear={fiveYear}
        firstMonth={firstMonth}
        milestones={previewMilestones}
        lifeDaysPerYear={lifeDaysPerYear}
        freedomDate={freedomDate}
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
        slowHint={slowHint}
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
          contentContainerClassName="grow px-gutter pt-6 pb-28 justify-center"
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
                  onPress={() => {
                    // Q2/Q3 answers are product-shaped (a "one a week" preset or a
                    // pack price makes no sense after switching products) — reset
                    // them when the product changes so stale values can't leak in.
                    if (answers.productType !== p.value) {
                      setPerDayText('');
                      setUnitCostText('');
                      setAnswers((a) => ({ ...a, productType: p.value, perDay: null, unitCost: null }));
                    }
                  }}
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
              title={product.q2Title}
              subtitle="Ballpark is fine. We use it to size your savings."
            >
              {product.q2Options ? (
                /* Preset frequencies/amounts — the honest way to ask when the
                   real answer isn't a neat daily count (vapes, cigarettes). */
                <View style={{ gap: 10 }}>
                  {product.q2Options.map((o) => (
                    <OptRow
                      key={o.label}
                      label={o.label}
                      sub={o.sub}
                      on={answers.perDay === o.value}
                      onPress={() => set('perDay', o.value)}
                    />
                  ))}
                </View>
              ) : (
                <>
                  <Eyebrow className="mb-3">{product.q2Eyebrow}</Eyebrow>
                  <UnderlineInput
                    autoFocus
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
                    suffix={product.q2Suffix}
                    accessibilityLabel={product.q2Eyebrow}
                  />
                </>
              )}
            </Question>
          )}

          {step === 'unitCost' && (
            <Question index={stepIndex} title={product.q3Title} subtitle={product.q3Subtitle}>
              <Eyebrow className="mb-3">{product.q3Eyebrow}</Eyebrow>
              <UnderlineInput
                autoFocus
                filled={answers.unitCost !== null && answers.unitCost > 0}
                value={unitCostText}
                onChangeText={(t) => {
                  // Keep the comma: iOS renders decimal-pad with the LOCALE's
                  // decimal separator, and most of Europe / Latin America uses a
                  // comma. Stripping it turned "12,22" into 1222 — a 100x error
                  // that then clamped to the $100/day ceiling and told the user
                  // they'd save $36,500 a year. See src/lib/money.ts.
                  const cleaned = t.replace(/[^0-9.,]/g, '');
                  setUnitCostText(cleaned);
                  const n = parseMoneyInput(cleaned);
                  set('unitCost', n !== null && n > 0 ? n : null);
                }}
                placeholder="0.00"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => canAdvance && goNext()}
                prefix="$"
                accessibilityLabel={product.q3Eyebrow}
              />
            </Question>
          )}

          {step === 'wakeUse' && (
            <Question
              index={stepIndex}
              title="How soon after waking do you first reach for it?"
              subtitle="This says more about dependence than how much you use."
            >
              {WAKE_OPTIONS.map((o) => (
                <OptRow
                  key={o.value}
                  label={o.label}
                  on={answers.wakeUse === o.value}
                  onPress={() => set('wakeUse', o.value)}
                />
              ))}
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
                        onPress={() => {
                          // Custom checkbox tile — not an OptRow, so we own the
                          // interaction haptic here (selection tick on toggle).
                          haptics.select();
                          set(
                            'triggers',
                            selected
                              ? answers.triggers.filter((x) => x !== t)
                              : [...answers.triggers, t],
                          );
                        }}
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

        {/* in-flow CTA, pinned to the bottom (design ObChrome cta slot).
            Fade cap above it (same treatment as CtaDock): without it, scroll
            content slices mid-glyph against the dock's hard edge at the fold
            (ui-audit D6). pointerEvents none — purely visual. */}
        <LinearGradient
          colors={['rgba(11,15,13,0)', clean.bg]}
          style={{ height: 22, marginTop: -22 }}
          pointerEvents="none"
        />
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

/**
 * DEPENDENCE SCORE — name the problem. The plan reveal (next) names the way out.
 * Fagerström-adapted and computed client-side (see dependenceScore). Framed as
 * general guidance, never a diagnosis (Guideline 1.4.1). The colour ramps from
 * emerald (low) through warm to coral (severe): the danger lane, earned.
 */
function ScoreReveal({
  score,
  bandLabel,
  bandLine,
  onContinue,
}: {
  score: number;
  bandLabel: string;
  bandLine: string;
  onContinue: () => void;
}) {
  // Count up in tenths so the number lands on one decimal.
  const tenths = useCountUp(Math.round(score * 10));
  const shown = (tenths / 10).toFixed(1);
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const tone = score >= 6.5 ? clean.coral : score >= 3.5 ? clean.warm : clean.accent;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-gutter pt-8 pb-8 justify-center"
        showsVerticalScrollIndicator={false}
      >
        <Eyebrow>Your nicotine dependence score</Eyebrow>

        <View className="mt-4 flex-row items-baseline">
          <RNText
            className="font-sora-extrabold text-[88px] leading-[92px] tracking-[-2.6px]"
            style={{ color: tone }}
          >
            {shown}
          </RNText>
          <RNText className="ml-1.5 font-sora-bold text-[22px] text-fg-3">/ 10</RNText>
        </View>

        <View className="mt-3 flex-row">
          <View
            className="rounded-pill px-3 py-1.5"
            style={{ backgroundColor: `${tone}1F`, borderWidth: 1, borderColor: `${tone}44` }}
          >
            <RNText className="font-sora-bold text-[12px] tracking-[0.5px]" style={{ color: tone }}>
              {`${bandLabel.toUpperCase()} DEPENDENCE`}
            </RNText>
          </View>
        </View>

        <View
          className="mt-6 h-2 overflow-hidden rounded-pill"
          style={{ backgroundColor: clean.track }}
        >
          <View className="h-full rounded-pill" style={{ width: `${pct}%`, backgroundColor: tone }} />
        </View>
        <View className="mt-2 flex-row justify-between">
          <Muted className="text-[11px]">Low</Muted>
          <Muted className="text-[11px]">Severe</Muted>
        </View>

        <Lead className="mt-7">{bandLine}</Lead>

        <Muted className="mt-6 text-[12px] leading-5">
          Based on Fagerstrom-style dependence indicators, the same signals clinicians use. This is
          general guidance, not a diagnosis or medical advice.
        </Muted>
      </ScrollView>

      <View className="px-gutter pb-[30px] pt-4">
        <Button label="Show me the way out" variant="primary" onPress={onContinue} />
      </View>
    </Screen>
  );
}

/** PLAN REVEAL — hero $ number + health recovery timeline + medical disclaimer. */
function PlanReveal({
  name,
  annual,
  fiveYear,
  firstMonth,
  milestones,
  lifeDaysPerYear,
  freedomDate,
  onContinue,
}: {
  name: string;
  annual: number;
  fiveYear: number;
  firstMonth: number;
  milestones: { hours: number; label: string }[];
  lifeDaysPerYear: number | null;
  freedomDate: string;
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
              <Eyebrow>In 5 years</Eyebrow>
              <RNText className="mt-1.5 font-sora-bold text-[28px] tracking-[-0.56px] text-fg">
                ${fiveYear.toLocaleString()}
              </RNText>
            </Card2>
          </View>
        </CardHero>

        {/* The outcome, not just the money: a freedom date, plus life regained
            for cigarette smokers (UCL 2024 ~20 min/cig, general guidance). */}
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-tile border border-stroke bg-surface p-4">
            <Eyebrow>Freedom date</Eyebrow>
            <RNText className="mt-1.5 font-sora-bold text-[24px] tracking-[-0.4px] text-fg">
              {freedomDate}
            </RNText>
            <Body className="mt-1 text-[12px] leading-4 text-fg-3">
              Cravings typically ease to occasional
            </Body>
          </View>
          {lifeDaysPerYear ? (
            <View className="flex-1 rounded-tile border border-stroke bg-surface p-4">
              <Eyebrow>Life regained</Eyebrow>
              {/* One line — "~101 days/yr" wrapped and made the two cards uneven. */}
              <RNText
                numberOfLines={1}
                className="mt-1.5 font-sora-bold text-[24px] tracking-[-0.4px] text-fg"
              >
                {lifeDaysPerYear} days
              </RNText>
              <Body className="mt-1 text-[12px] leading-4 text-fg-3">
                of life back, every year you stay quit
              </Body>
            </View>
          ) : null}
        </View>

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
  slowHint,
  error,
  onCommit,
}: {
  name: string;
  annual: number;
  submitting: boolean;
  slowHint: boolean;
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

        {!error && submitting && slowHint ? (
          <Body className="mt-5 text-center text-sm text-fg-2">
            Still working. A weak connection can slow this down.
          </Body>
        ) : null}
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
          check-in, a craving tip, or a word from your buddy. We&apos;ll also remind you before your
          trial ends. No spam, ever.
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
        // Buddy found — a positive outcome worth celebrating.
        haptics.success();
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
