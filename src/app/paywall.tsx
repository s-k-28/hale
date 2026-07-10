import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Unlock, Bell, BadgeCheck } from 'lucide-react-native';
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
import {
  Button,
  Display,
  Body,
  Badge,
  Muted as Caption,
} from '@/ui';
import { clean } from '@/theme/clean';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * HALE+ HARD paywall — modal screen, presented at onboarding peak intent and
 * from every LockedFeature gate. Always OUR Clean Dark screen, never the
 * RC-rendered sheet: purchases go straight through StoreKit via
 * Purchases.purchasePackage (lib/paywall.ts).
 *
 * Exact port of the SwiftUI PaywallView: value stack, social proof + 3-day
 * trial timeline (Today / Day 2 / Day 3), annual-default plan selector with a
 * SAVE 40% badge, one primary CTA. Plans + CTA stay pinned so the price is
 * always in view.
 *
 * Hard paywall: no dismiss control. The only ways forward are starting the
 * 3-day trial or restoring an existing purchase (Restore is Apple-required and
 * not a bypass). NOTE: a fully un-dismissible wall carries App Review 3.1.1/2.1
 * risk; ship reviewed with that in mind.
 *
 * Plans: annual $49.99/yr (default, highlighted) and monthly $6.99/mo, with
 * the 3-day StoreKit intro trial framed on the primary CTA. When offerings
 * can't load, the fallback prices render — never blank, never a browser link.
 */

const BENEFITS: { title: string; detail: string }[] = [
  { title: 'Unlimited Sage', detail: 'Your AI coach the second a craving hits.' },
  { title: 'Full health analytics', detail: 'Every pattern, trend, and recovery milestone.' },
  { title: 'Multiple squads', detail: 'Quit alongside more than one group.' },
];

const TIMELINE: { Icon: typeof Unlock; day: string; detail: string; accent?: boolean }[] = [
  { Icon: Unlock, day: 'Today', detail: 'Everything unlocks instantly.', accent: true },
  { Icon: Bell, day: 'Day 2', detail: 'A reminder before your trial ends.' },
  { Icon: BadgeCheck, day: 'Day 3', detail: 'Your plan starts. Cancel anytime before then.' },
];

export default function Paywall() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const surface = from === 'onboarding' ? 'onboarding_peak' : 'paywall_screen';

  const [offers, setOffers] = useState<PlanOffer[] | null | 'loading'>('loading');
  const [plan, setPlan] = useState<HalePlan>('annual');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const viewedRef = useRef(false);

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  };

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
        setNotice(
          "Subscriptions aren't available right now. Check your connection and try again.",
        );
      }
      return;
    }
    const offer = offers.find((o) => o.plan === plan) ?? offers[0];
    setBusy(true);
    const result = await purchasePlan(offer, surface);
    setBusy(false);
    if (result === 'purchased') {
      track(Ev.TRIAL_STARTED, { trial_days: 3, trial_type: 'storekit' });
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
    />
  );
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

function HalePlusUpsell({
  onStart,
  onRestore,
  plan,
  onPlan,
  offers,
  busy,
  notice,
}: {
  onStart: () => void;
  onRestore: () => void;
  plan: HalePlan;
  onPlan: (p: HalePlan) => void;
  offers: PlanOffer[] | null | 'loading';
  busy: boolean;
  notice: string | null;
}) {
  const insets = useSafeAreaInsets();
  const priceFor = (p: HalePlan, fallback: string) => {
    if (offers === 'loading' || offers === null) return fallback;
    return offers.find((o) => o.plan === p)?.price ?? fallback;
  };
  const annualPrice = priceFor('annual', '$49.99');
  const monthlyPrice = priceFor('monthly', '$6.99');
  const selectedRenewal = plan === 'annual' ? `${annualPrice}/yr` : `${monthlyPrice}/mo`;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }}>
      {/* Hard paywall: no close control. Value stack scrolls; the plans + CTA
          below are pinned so the price is never scrolled off. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-gutter pt-3 pb-4"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mt-1">
          <Badge label="HALE+" tone="soft" />
          <Display className="mt-3 text-fg text-5xl leading-tight tracking-tight">
            Go all in.
          </Display>
          <Body className="mt-2 text-fg-2 text-base leading-relaxed">
            Your coach, your data, your people. No limits.
          </Body>
        </View>

        {/* Value stack — title over detail, never squished */}
        <View className="mt-6 gap-3">
          {BENEFITS.map((b) => (
            <Benefit key={b.title} title={b.title} detail={b.detail} />
          ))}
        </View>

        {/* Social proof + trial timeline */}
        <TrialCard />
      </ScrollView>

      {/* Pinned footer: plans + reassurance + CTA + legal */}
      <View
        className="border-t border-stroke bg-surface px-gutter pb-2 pt-4"
        style={{ shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: -8 } }}
      >
        {/* Plan selector — annual is the highlighted default */}
        <View className="gap-2.5">
          <PlanCard
            selected={plan === 'annual'}
            onPress={() => onPlan('annual')}
            title="Annual"
            price={annualPrice}
            sub="$4.17/mo · billed yearly"
            badge="SAVE 40%"
          />
          <PlanCard
            selected={plan === 'monthly'}
            onPress={() => onPlan('monthly')}
            title="Monthly"
            price={monthlyPrice}
            sub="billed monthly"
          />
        </View>

        {/* Reassurance */}
        <View className="mt-3 flex-row items-center justify-center gap-1.5">
          <Check color={clean.accent} size={14} strokeWidth={3} />
          <Caption className="text-accent font-sora-bold">No payment due now</Caption>
        </View>

        <View className="mt-2">
          <SheenButton
            onPress={onStart}
            label={notice ? 'Try again' : 'Start my 3-day free trial'}
            busy={busy}
          />
        </View>

        {notice ? (
          <Body className="mt-2 text-center text-[13px] leading-5 text-fg-2">{notice}</Body>
        ) : (
          <Caption className="mt-2 text-center leading-relaxed text-fg-3 text-[11px]">
            3-day free trial, then {selectedRenewal}. Auto-renews until cancelled.
          </Caption>
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

/* Social proof headline + "how your free trial works" timeline. */
function TrialCard() {
  return (
    <View className="mt-5 rounded-tile border border-stroke bg-surface/60 px-4 py-4">
      <Body className="font-sora-bold text-fg text-[15px]">Join a community quitting together.</Body>
      <Caption className="mt-3 text-fg-3 text-[11px] tracking-wider font-sora-bold">
        HOW YOUR FREE TRIAL WORKS
      </Caption>
      <View className="mt-2.5 gap-2.5">
        {TIMELINE.map((t) => (
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
      {/* Selection indicator: filled check when on, empty ring when off */}
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
 * START HALE+ with a premium sheen: a soft, skewed white highlight sweeps across
 * the lime button every few seconds, then pauses. Light-touch, draws the eye to
 * the conversion CTA. The sheen is clipped to the button's rounded rect.
 */
function SheenButton({
  onPress,
  label = 'Start HALE+',
  busy = false,
}: {
  onPress: () => void;
  label?: string;
  busy?: boolean;
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
    transform: [
      { translateX: interpolate(x.value, [0, 1], [-BAND, w + BAND]) },
      { skewX: '-18deg' },
    ],
  }));

  return (
    <View className="relative" onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Button label={label} variant="primary" loading={busy} onPress={onPress} />
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

function Benefit({ title, detail }: { title: string; detail: string }) {
  // Title over detail so the copy never looks squished (matches SwiftUI).
  return (
    <View className="flex-row items-start gap-3">
      <Check color={clean.accent} size={19} strokeWidth={3} className="mt-0.5" />
      <View className="flex-1">
        <Body className="font-sora-bold text-fg text-[15px]">{title}</Body>
        <Body className="mt-0.5 text-fg-2 text-[13px] leading-relaxed">{detail}</Body>
      </View>
    </View>
  );
}
