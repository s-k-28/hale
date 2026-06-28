import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, X, Bot, LineChart, Users } from 'lucide-react-native';
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
  H2 as Heading,
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
 * MUST be registered in src/app/_layout.tsx as:
 *   <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
 *
 * App Store safety (2.1 / 3.1.1): a visible Restore Purchases affordance and
 * a discreet 'Continue with the free version' dismiss — the wall is firm,
 * not un-dismissible, so a reviewer can always reach the app.
 *
 * Plans: annual $79.99/yr (default, highlighted) and monthly $12.99/mo, with
 * the 14-day StoreKit intro trial framed on the primary CTA. When offerings
 * can't load, a plain unavailable notice + retry — never blank, never a
 * browser link.
 */

type IconCmp = typeof Bot;

const BENEFITS: { title: string; detail: string; Icon: IconCmp }[] = [
  {
    title: 'Unlimited Sage',
    detail: 'Talk to your AI coach as much as you need, no daily caps, day or night.',
    Icon: Bot,
  },
  {
    title: 'Full health analytics',
    detail: 'Every recovery milestone, trigger pattern, and savings projection unlocked.',
    Icon: LineChart,
  },
  {
    title: 'Multiple squads',
    detail: 'Quit alongside more than one buddy and keep every group accountable.',
    Icon: Users,
  },
  // NOTE: do NOT list features that aren't in the binary (Guideline 2.1/3.1.2)
  // — home-screen widgets were removed here until the WidgetKit extension ships.
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
    // Offerings missing → retry the load (unavailable state), never a browser.
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
      // The StoreKit intro trial starts with the subscription.
      track(Ev.TRIAL_STARTED, { trial_days: 14, trial_type: 'storekit' });
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
      onFreeVersion={() => {
        haptics.tap();
        dismiss();
      }}
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
/* In-app fallback upsell (scaffold / RC-unconfigured)                 */
/* ------------------------------------------------------------------ */

function HalePlusUpsell({
  onFreeVersion,
  onStart,
  onRestore,
  plan,
  onPlan,
  offers,
  busy,
  notice,
}: {
  onFreeVersion: () => void;
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
  // Explicit insets: SafeAreaView can race to zero inside fullScreenModal
  // and put the header under the status bar (ui-audit D4).
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }}>
      {/* Close — top right, hairline surface chip */}
      <View className="px-gutter pt-3">
        <View className="flex-row items-center justify-end">
          <Pressable
            onPress={onFreeVersion}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-9 w-9 items-center justify-center rounded-full bg-surface border border-stroke active:opacity-70"
          >
            <X color={clean.fg2} size={18} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      {/* The whole value stack scrolls — it can never be clipped by the CTA. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-gutter pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — tightened (text-5xl, single line) so all four benefits sit above the fold */}
        <View className="mt-1">
          <Badge label="HALE+" tone="soft" />

          <Display className="mt-4 text-fg text-5xl leading-tight tracking-tight">
            Go all in.
          </Display>

          <Heading className="mt-3 text-accent text-xl leading-snug">
            Quitting sticks when you stop holding back.
          </Heading>

          <Body className="mt-2 text-fg-2 text-base leading-relaxed">
            Unlock the full toolkit, your coach, your data, and your people.
          </Body>
        </View>

        {/* Benefits — one tight group */}
        <View className="mt-7 gap-3">
          {BENEFITS.map((b, i) => (
            <Benefit key={b.title} title={b.title} detail={b.detail} Icon={b.Icon} elevated={i === 0} />
          ))}
        </View>

        {/* Reassurance */}
        <Caption className="mt-5 text-center leading-relaxed">
          14-day free trial, then your chosen plan auto-renews until cancelled. Cancel anytime in Apple Settings, at least 24h before renewal.
        </Caption>
      </ScrollView>

      {/* Pinned footer: price stays visible WITH the CTA, and it's slim enough
          that it never covers a benefit. Focal point = the lime START HALE+ action. */}
      <View
        className="border-t border-stroke bg-surface px-gutter pb-2 pt-4"
        style={{ shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: -8 } }}
      >
        {/* Plan selector — annual is the highlighted default. */}
        <View className="mb-3 flex-row gap-3">
          <PlanCard
            selected={plan === 'annual'}
            onPress={() => onPlan('annual')}
            title="Annual"
            price={priceFor('annual', '$79.99')}
            per="/yr · $6.67/mo"
            tag="Best value"
          />
          <PlanCard
            selected={plan === 'monthly'}
            onPress={() => onPlan('monthly')}
            title="Monthly"
            price={priceFor('monthly', '$12.99')}
            per="/mo"
          />
        </View>

        <SheenButton
          onPress={onStart}
          label={notice ? 'Try again' : 'Start my 14-day free trial'}
          busy={busy}
        />
        {notice ? (
          <Body className="mt-3 text-center text-[13px] leading-5 text-fg-2">{notice}</Body>
        ) : null}

        {/* Stacked, not side-by-side: the two labels + a gap overflow the row
            width on 402pt devices and RN collapses the gap (ui-audit root
            cause #2) — vertical guarantees a fit on every width. */}
        <View className="mt-1 items-center">
          <Pressable
            onPress={onRestore}
            accessibilityRole="button"
            className="items-center px-6 py-2.5 active:opacity-70"
          >
            <Caption className="text-fg-2">Restore purchases</Caption>
          </Pressable>
          <Pressable
            onPress={onFreeVersion}
            accessibilityRole="button"
            className="items-center px-6 py-2.5 active:opacity-70"
          >
            <Caption className="text-fg-3">Continue with the free version</Caption>
          </Pressable>
          {/* Subscription legal (Guideline 3.1.2): functional Privacy + Terms
              links on the purchase surface. Quiet by design. */}
          <View className="mt-0.5 flex-row items-center gap-6">
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
    </View>
  );
}

/** Selectable plan card — emerald ring when active (the single accent). */
function PlanCard({
  selected,
  onPress,
  title,
  price,
  per,
  tag,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  per: string;
  tag?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-1 rounded-tile px-4 py-3 ${
        selected ? 'border-[1.5px] border-accent bg-accent-soft' : 'border border-stroke bg-surface-2'
      }`}
    >
      {/* Tag below the title, never beside it: side-by-side, the pill collided
          with "Annual" on 402pt widths (ui-audit D7). */}
      <Caption className={selected ? 'text-accent' : 'text-fg-3'}>{title}</Caption>
      {tag ? (
        <View className="mt-1 self-start rounded-pill bg-accent px-1.5 py-0.5">
          <Caption className="text-[9px] font-sora-bold text-accent-ink">{tag}</Caption>
        </View>
      ) : null}
      <Display className="mt-1 text-[22px] leading-7 text-fg">{price}</Display>
      <Caption className="text-[11px] text-fg-3">{per}</Caption>
    </Pressable>
  );
}

/**
 * START HALE+ with a premium sheen: a soft, skewed white highlight sweeps across
 * the lime button every few seconds (Reanimated translateX over a clipped
 * LinearGradient), then pauses. Light-touch — draws the eye to the conversion CTA
 * without nagging. The sheen is clipped to the button's rounded rect; the Button's
 * own press physics + lift shadow are untouched (the clip only wraps the highlight).
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
        // Sweep across (~1s), then hold off-screen right for a calm few-second pause.
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
      {/* Clip the sheen to the button's rounded rect; pointerEvents none so the
          highlight never eats a tap. Inset clip only — the Button's lift shadow,
          which lives on the Button itself, is not clipped. */}
      <View className="absolute inset-0 overflow-hidden rounded-2xl" style={{ pointerEvents: 'none' }}>
        {w > 0 ? (
          <Animated.View style={[{ position: 'absolute', top: -12, bottom: -12, width: BAND }, sheenStyle]}>
            <LinearGradient
              // Bright near-white core — the lime button is already light, so the
              // streak has to push toward white to read as a premium shine.
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

function Benefit({
  title,
  detail,
  Icon,
  elevated = false,
}: {
  title: string;
  detail: string;
  Icon: IconCmp;
  elevated?: boolean;
}) {
  // The first benefit (the Sage coach — HALE's identity hook) is elevated onto the
  // raised plane so the value stack has a leader; the rest recede. Checkmarks drop
  // to fg-2 so the peak accent is reserved for the CTA. Order/labels unchanged.
  return (
    <View
      className={`flex-row items-start rounded-2xl px-4 py-4 ${
        elevated ? 'border border-accent-edge/25 bg-surface-2' : 'bg-surface/50'
      }`}
      style={
        elevated
          ? { shadowColor: clean.accent, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
          : undefined
      }
    >
      <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl bg-accent">
        <Icon color={clean.bg} size={20} strokeWidth={2.5} />
      </View>
      <View className="flex-1">
        <Body className="font-sora-bold text-fg text-base">{title}</Body>
        <Body className="mt-1 text-fg-2 text-sm leading-relaxed">{detail}</Body>
      </View>
      <Check color={clean.fg2} size={18} strokeWidth={3} className="mt-1" />
    </View>
  );
}
