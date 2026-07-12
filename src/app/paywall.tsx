import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Minus, Unlock, Bell, BadgeCheck, ChevronRight, X, Star } from 'lucide-react-native';
import {
  loadPlanOffers,
  purchasePlan,
  restorePurchases,
  type HalePlan,
  type PlanOffer,
} from '@/lib/paywall';
import * as WebBrowser from 'expo-web-browser';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/links';
import { track, Ev } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { Button, Display, Body, Badge, Muted as Caption } from '@/ui';
import { clean } from '@/theme/clean';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * HALE+ paywall — one Clean Dark screen, two modes:
 *
 *  • HARD  (from = 'onboarding' | 'locked_out'): a non-dismissible decision
 *    wall. No close control, the Android hardware back is swallowed, and the
 *    route is gestureEnabled:false (src/app/_layout.tsx) so it can't be
 *    swipe/drag-dismissed. The only ways forward are starting the trial or
 *    restoring a purchase. This is the onboarding-peak wall and the entry-gate
 *    re-present for an onboarded-but-unentitled user (src/app/index.tsx).
 *
 *  • DISMISSIBLE (any in-app feature gate — LockedFeature / You / Coach): a
 *    quiet close (X) fades in so a browsing user is never trapped on a locked
 *    feature (Apple 3.1.1 / 2.1). Same screen, `hard=false`.
 *
 * Purchases go straight through StoreKit via Purchases.purchasePackage
 * (lib/paywall.ts) — never the RC-rendered sheet.
 *
 * Personalized when the caller passes the user's own numbers (onboarding):
 * name, projected annual savings, and product shape the header + price anchor.
 * The 3-day StoreKit intro trial is configured on the ANNUAL SKU in App Store
 * Connect, so the CTA never promises "free" on the monthly plan (a 2026 App
 * Review rejection trap).
 */

type TableRow = { label: string; free: boolean | string; plus: boolean | string };

// "Cold turkey vs HALE+" — the honest frame for the hard wall (there is no free
// tier to compare against, and the loss frame converts harder).
const COLD_TURKEY_ROWS: TableRow[] = [
  { label: 'A plan built around your triggers', free: false, plus: true },
  { label: 'Sage, your 24/7 quit coach', free: false, plus: true },
  { label: 'Craving SOS the moment it hits', free: false, plus: true },
  { label: 'Money saved + recovery tracking', free: false, plus: true },
  { label: 'A buddy and squad who get it', free: false, plus: true },
];

// "Free vs HALE+" — for the dismissible in-app gates, mapped to the real gates.
const FREE_VS_PLUS_ROWS: TableRow[] = [
  { label: 'Daily check-in & streak', free: true, plus: true },
  { label: 'Craving SOS', free: true, plus: true },
  { label: 'Sage AI coach', free: 'Limited', plus: 'Unlimited' },
  { label: 'Full recovery analytics', free: false, plus: true },
  { label: 'Advanced craving toolkit', free: false, plus: true },
  { label: 'Multiple squads', free: false, plus: true },
];

/**
 * Real App Store reviews ONLY. Leave empty until you paste genuine reviews
 * (App Store Connect → your app → Ratings & Reviews). The carousel auto-hides
 * while this is empty — HALE never ships fabricated social proof.
 */
const REVIEWS: { quote: string; name: string; sub: string }[] = [];

/**
 * The Blinkist de-risking timeline, built from the REAL trial length (read off
 * the store, never hardcoded). A 14-day trial reads Today / Day 13 / Day 14; a
 * 3-day trial reads Today / Day 2 / Day 3.
 */
function buildTimeline(
  trialDays: number,
  renewal: string,
): { Icon: typeof Unlock; day: string; detail: string; accent?: boolean }[] {
  const remindOn = Math.max(1, trialDays - 1);
  return [
    { Icon: Unlock, day: 'Today', detail: 'Everything unlocks. Your quit clock starts.', accent: true },
    { Icon: Bell, day: `Day ${remindOn}`, detail: 'We remind you before your trial ends.' },
    {
      Icon: BadgeCheck,
      day: `Day ${trialDays}`,
      detail: `Trial ends. ${renewal} unless you cancel.`,
    },
  ];
}

/**
 * Only used while offerings are still loading. Mirrors the CURRENT App Store
 * Connect config (annual = free first 2 weeks, monthly = free first 3 days).
 * The live values always win once the store responds.
 */
const FALLBACK_TRIAL_DAYS: Record<HalePlan, number | null> = { annual: 14, monthly: 3 };

function usd0(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}
function usd2(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parsePrice(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const PRODUCT_UNIT: Record<string, string> = { vape: 'pod', cig: 'pack', pouch: 'tin', mixed: 'day' };

export default function Paywall() {
  const params = useLocalSearchParams<{
    from?: string;
    name?: string;
    save?: string;
    product?: string;
  }>();
  const from = params.from;
  const hard = from === 'onboarding' || from === 'locked_out';
  const surface =
    from === 'onboarding' ? 'onboarding_peak' : from === 'locked_out' ? 'locked_out' : 'paywall_screen';

  const annualSave = params.save ? parseInt(params.save, 10) : null;
  const name = params.name?.trim() || null;
  const productUnit = params.product ? PRODUCT_UNIT[params.product] ?? null : null;

  const [offers, setOffers] = useState<PlanOffer[] | null | 'loading'>('loading');
  const [plan, setPlan] = useState<HalePlan>('annual');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showClose, setShowClose] = useState(false);
  const viewedRef = useRef(false);

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  };

  // Hard wall: swallow Android hardware back so there is no escape without a
  // decision. Dismissible gates keep the default back behaviour.
  useEffect(() => {
    if (!hard) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [hard]);

  // Dismissible gates: reveal the close after a beat (mild friction, still lets
  // a browsing user out of a locked feature).
  useEffect(() => {
    if (hard) return;
    const t = setTimeout(() => setShowClose(true), 1200);
    return () => clearTimeout(t);
  }, [hard]);

  useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      track(Ev.PAYWALL_VIEWED, { surface });
    }
    let active = true;
    loadPlanOffers().then((o) => {
      if (active) setOffers(o);
    });
    return () => {
      active = false;
    };
  }, [surface]);

  const onStart = async () => {
    if (busy) return;
    setNotice(null);
    if (offers === 'loading' || offers === null) {
      setBusy(true);
      const o = await loadPlanOffers();
      setBusy(false);
      setOffers(o);
      if (o === null) {
        haptics.warn();
        setNotice("Subscriptions aren't available right now. Check your connection and try again.");
      }
      return;
    }
    const offer = offers.find((o) => o.plan === plan) ?? offers[0];
    setBusy(true);
    const result = await purchasePlan(offer, surface);
    setBusy(false);
    if (result === 'purchased') {
      // Report the REAL trial length the store granted, not a hardcoded guess.
      if (offer.trialDays) {
        track(Ev.TRIAL_STARTED, { trial_days: offer.trialDays, trial_type: 'storekit' });
      }
      dismiss();
    } else if (result === 'failed') {
      haptics.error();
      setNotice("That didn't go through. You weren't charged. Try again.");
    }
    // cancelled → stay quietly.
  };

  const onRestore = async () => {
    if (busy) return;
    haptics.tap();
    setNotice(null);
    setBusy(true);
    const restored = await restorePurchases();
    setBusy(false);
    if (restored) {
      dismiss();
    } else {
      haptics.warn();
      setNotice('No previous purchases found for this Apple ID.');
    }
  };

  return (
    <HalePlusUpsell
      hard={hard}
      showClose={showClose}
      onClose={dismiss}
      onStart={onStart}
      onRestore={onRestore}
      plan={plan}
      onPlan={(p) => {
        haptics.select();
        setPlan(p);
      }}
      offers={offers}
      busy={busy}
      notice={notice}
      name={name}
      annualSave={annualSave}
      productUnit={productUnit}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

function HalePlusUpsell({
  hard,
  showClose,
  onClose,
  onStart,
  onRestore,
  plan,
  onPlan,
  offers,
  busy,
  notice,
  name,
  annualSave,
  productUnit,
}: {
  hard: boolean;
  showClose: boolean;
  onClose: () => void;
  onStart: () => void;
  onRestore: () => void;
  plan: HalePlan;
  onPlan: (p: HalePlan) => void;
  offers: PlanOffer[] | null | 'loading';
  busy: boolean;
  notice: string | null;
  name: string | null;
  annualSave: number | null;
  productUnit: string | null;
}) {
  const insets = useSafeAreaInsets();
  const priceFor = (p: HalePlan, fallback: string) => {
    if (offers === 'loading' || offers === null) return fallback;
    return offers.find((o) => o.plan === p)?.price ?? fallback;
  };
  const annualPrice = priceFor('annual', '$49.99');
  const monthlyPrice = priceFor('monthly', '$6.99');
  const annualNum = parsePrice(annualPrice) || 49.99;
  const weekly = usd2(annualNum / 52); // annual framed per-week ($0.96)

  const isAnnual = plan === 'annual';

  // Real trial lengths, straight from the store (see lib/paywall.ts). The
  // fallbacks only apply while offerings load.
  const trialFor = (p: HalePlan): number | null => {
    if (offers === 'loading' || offers === null) return FALLBACK_TRIAL_DAYS[p];
    const o = offers.find((x) => x.plan === p);
    return o ? o.trialDays : FALLBACK_TRIAL_DAYS[p];
  };
  const annualTrial = trialFor('annual');
  const monthlyTrial = trialFor('monthly');
  const trialDays = isAnnual ? annualTrial : monthlyTrial;
  const renewal = isAnnual ? `${annualPrice}/yr` : `${monthlyPrice}/mo`;

  const title = hard
    ? name
      ? `${name}, your plan is ready.`
      : 'Your plan is ready.'
    : 'Go all in.';
  const sub = annualSave
    ? `Put your ${usd0(annualSave)} a year back where it belongs.`
    : 'Everything that actually makes quitting stick, unlocked.';
  const anchor = annualSave
    ? `Your habit: about ${usd0(annualSave / 52)} a week. HALE+: ${weekly} a week.`
    : productUnit
      ? `Less than a single ${productUnit}. ${weekly} a week.`
      : `Less than you spend on nicotine in a week. ${weekly} a week.`;

  // Never promise "free" on a plan the store has no free trial for (a 2026 App
  // Review rejection trap), and never understate one it does.
  const ctaLabel = notice
    ? 'Try again'
    : trialDays
      ? `Start my ${trialDays}-day free trial`
      : `Unlock HALE+ · ${renewal}`;
  const footnote = trialDays
    ? `${trialDays} days free, then ${renewal}. Auto-renews until cancelled.`
    : `${renewal}. Auto-renews until cancelled.`;

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {/* Dismissible gates get a quiet close; the hard wall never does. */}
      {!hard && showClose ? (
        <Animated.View entering={FadeIn.duration(400)} className="absolute right-3 z-10" style={{ top: insets.top + 4 }}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-2 active:opacity-70"
          >
            <X color={clean.fg2} size={18} strokeWidth={2.5} />
          </Pressable>
        </Animated.View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-gutter pt-3 pb-4"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mt-1">
          <Badge label="HALE+" tone="soft" />
          <Display className="mt-3 text-fg text-4xl leading-tight tracking-tight">{title}</Display>
          <Body className="mt-2 text-fg-2 text-base leading-relaxed">{sub}</Body>
        </View>

        {/* The value frame: a comparison table (the hard wall's honest sell). */}
        <CompareTable
          rows={hard ? COLD_TURKEY_ROWS : FREE_VS_PLUS_ROWS}
          leftLabel={hard ? 'Cold turkey' : 'Free'}
        />

        {/* Social proof — real reviews only; auto-hidden while REVIEWS is empty. */}
        {REVIEWS.length > 0 ? <ReviewStrip /> : null}

        {/* How the free trial works — the Blinkist de-risking timeline. Hidden
            when the selected plan genuinely has no free trial. */}
        {trialDays ? <TrialCard trialDays={trialDays} renewal={renewal} /> : null}
      </ScrollView>

      {/* Pinned footer: plans + anchor + reassurance + CTA + legal */}
      <View
        className="border-t border-stroke bg-surface px-gutter pb-2 pt-4"
        style={{ shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: -8 } }}
      >
        {/* Plan selector — annual is the highlighted default */}
        <View className="gap-2.5">
          <PlanCard
            selected={isAnnual}
            onPress={() => onPlan('annual')}
            title="Annual"
            price={annualPrice}
            sub={`${weekly}/week${annualTrial ? ` · ${annualTrial} days free` : ''}`}
            badge="SAVE 40%"
          />
          <PlanCard
            selected={!isAnnual}
            onPress={() => onPlan('monthly')}
            title="Monthly"
            price={monthlyPrice}
            sub={`billed monthly${monthlyTrial ? ` · ${monthlyTrial} days free` : ' · no trial'}`}
          />
        </View>

        {/* Price anchor — their own habit spend vs the plan */}
        <Caption className="mt-2.5 text-center text-[12px] leading-4 text-fg-3">{anchor}</Caption>

        {/* Reassurance — honest per plan (monthly charges now, annual doesn't) */}
        <View className="mt-2 flex-row items-center justify-center gap-1.5">
          <Check color={clean.accent} size={14} strokeWidth={3} />
          <Caption className="text-accent font-sora-bold">
            {trialDays ? 'No payment due now · Cancel anytime' : 'Cancel anytime'}
          </Caption>
        </View>

        <View className="mt-2">
          <SheenButton onPress={onStart} label={ctaLabel} busy={busy} chevron={!notice} />
        </View>

        {notice ? (
          <Body className="mt-2 text-center text-[13px] leading-5 text-fg-2">{notice}</Body>
        ) : (
          <Caption className="mt-2 text-center leading-relaxed text-fg-3 text-[11px]">{footnote}</Caption>
        )}

        {/* Restore + legal (Guideline 3.1.2) — one quiet row */}
        <View className="mt-1.5 flex-row items-center justify-center gap-6">
          <Pressable onPress={onRestore} accessibilityRole="button" hitSlop={8} className="active:opacity-70">
            <Caption className="text-fg-2">Restore</Caption>
          </Pressable>
          <Pressable
            hitSlop={8}
            accessibilityRole="link"
            onPress={() => {
              haptics.select();
              void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL).catch(() => {});
            }}
          >
            <Caption className="text-fg-3 underline">Privacy</Caption>
          </Pressable>
          <Pressable
            hitSlop={8}
            accessibilityRole="link"
            onPress={() => {
              haptics.select();
              void WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {});
            }}
          >
            <Caption className="text-fg-3 underline">Terms</Caption>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Free/Cold-turkey vs HALE+ comparison — Jonathan's "what you're missing" table. */
function CompareTable({ rows, leftLabel }: { rows: TableRow[]; leftLabel: string }) {
  return (
    <View className="mt-6 overflow-hidden rounded-tile border border-stroke bg-surface/60">
      {/* Column header */}
      <View className="flex-row items-center border-b border-stroke px-4 py-2.5">
        <View className="flex-1" />
        <Caption className="w-16 text-center text-[10px] font-sora-bold tracking-wider text-fg-3">
          {leftLabel.toUpperCase()}
        </Caption>
        <Caption className="w-16 text-center text-[10px] font-sora-bold tracking-wider text-accent">
          HALE+
        </Caption>
      </View>
      {rows.map((r, i) => (
        <View
          key={r.label}
          className={`flex-row items-center px-4 py-3 ${i < rows.length - 1 ? 'border-b border-stroke' : ''}`}
        >
          <Body className="flex-1 pr-2 text-[13px] leading-5 text-fg-2">{r.label}</Body>
          <View className="w-16 items-center">
            <Cell value={r.free} muted />
          </View>
          <View className="w-16 items-center">
            <Cell value={r.plus} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Cell({ value, muted = false }: { value: boolean | string; muted?: boolean }) {
  if (typeof value === 'string') {
    return (
      <Caption className={`text-[11px] font-sora-bold ${muted ? 'text-fg-3' : 'text-accent'}`}>{value}</Caption>
    );
  }
  return value ? (
    <Check color={clean.accent} size={17} strokeWidth={3} />
  ) : (
    <Minus color={clean.fg3} size={16} strokeWidth={2.5} />
  );
}

/** Horizontally swipeable real-review cards (renders only when REVIEWS is set). */
function ReviewStrip() {
  return (
    <View className="mt-5">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-6">
        {REVIEWS.map((r) => (
          <View key={r.name} className="w-64 rounded-tile border border-stroke bg-surface px-4 py-3.5">
            <View className="flex-row gap-0.5">
              {[0, 1, 2, 3, 4].map((s) => (
                <Star key={s} color={clean.accent} fill={clean.accent} size={12} />
              ))}
            </View>
            <Body className="mt-2 text-[13px] leading-5 text-fg">{r.quote}</Body>
            <Caption className="mt-2 text-[11px] text-fg-3">
              {r.name} · {r.sub}
            </Caption>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** "How your free trial works" timeline, built from the store's real trial length. */
function TrialCard({ trialDays, renewal }: { trialDays: number; renewal: string }) {
  const timeline = buildTimeline(trialDays, renewal);
  return (
    <View className="mt-5 rounded-tile border border-stroke bg-surface/60 px-4 py-4">
      <Caption className="text-fg-3 text-[11px] tracking-wider font-sora-bold">
        {`HOW YOUR ${trialDays}-DAY FREE TRIAL WORKS`}
      </Caption>
      <View className="mt-2.5 gap-2.5">
        {timeline.map((t) => (
          <View key={t.day} className="flex-row items-center gap-3">
            <View className="w-6 items-center">
              <t.Icon color={t.accent ? clean.accent : clean.fg2} size={16} strokeWidth={2.5} />
            </View>
            <View className="flex-row flex-1 flex-wrap items-baseline gap-1.5">
              <Body className="font-sora-bold text-fg text-[13px]">{t.day}</Body>
              <Body className="text-fg-2 text-[13px]">{t.detail}</Body>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Selectable plan card — circle indicator + emerald ring when active. */
function PlanCard({
  selected,
  onPress,
  title,
  price,
  sub,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  sub: string;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-3 rounded-tile px-4 py-3.5 ${
        selected ? 'border-[1.5px] border-accent bg-accent-soft' : 'border border-stroke bg-surface-2'
      }`}
    >
      {selected ? (
        <View className="h-6 w-6 items-center justify-center rounded-full bg-accent">
          <Check color={clean.bg} size={14} strokeWidth={3.5} />
        </View>
      ) : (
        <View className="h-6 w-6 rounded-full border-[1.5px] border-stroke" />
      )}

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Body className="font-sora-bold text-fg text-base">{title}</Body>
          {badge ? (
            <View className="rounded-pill bg-accent px-1.5 py-0.5">
              <Caption className="text-[9px] font-sora-bold text-accent-ink">{badge}</Caption>
            </View>
          ) : null}
        </View>
        <Caption className={`mt-0.5 text-[12px] ${selected ? 'text-accent' : 'text-fg-3'}`}>{sub}</Caption>
      </View>

      <Display className="text-[20px] leading-6 text-fg">{price}</Display>
    </Pressable>
  );
}

/**
 * Primary CTA with a premium sheen sweep + an optional trailing chevron (the
 * winning-paywall affordance). The sheen is clipped to the button's rounded rect.
 */
function SheenButton({
  onPress,
  label = 'Start HALE+',
  busy = false,
  chevron = false,
}: {
  onPress: () => void;
  label?: string;
  busy?: boolean;
  chevron?: boolean;
}) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const BAND = 110;

  useEffect(() => {
    if (w === 0) return;
    x.value = 0;
    x.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 2600 }),
      ),
      -1,
      false,
    );
  }, [w, x]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [0, 1], [-BAND, w + BAND]) }, { skewX: '-18deg' }],
  }));

  return (
    <View className="relative" onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Button label={label} variant="primary" loading={busy} onPress={onPress} />
      {chevron && !busy ? (
        <View className="absolute inset-y-0 right-4 justify-center" style={{ pointerEvents: 'none' }}>
          <ChevronRight color={clean.accentInk} size={20} strokeWidth={3} />
        </View>
      ) : null}
      <View className="absolute inset-0 overflow-hidden rounded-2xl" style={{ pointerEvents: 'none' }}>
        {w > 0 ? (
          <Animated.View style={[{ position: 'absolute', top: -12, bottom: -12, width: BAND }, sheenStyle]}>
            <LinearGradient
              colors={[
                'rgba(255,255,255,0)',
                'rgba(255,255,255,0.35)',
                'rgba(255,255,255,0.85)',
                'rgba(255,255,255,0.35)',
                'rgba(255,255,255,0)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
