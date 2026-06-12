import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { toast } from 'sonner-native';
import { Check, X, Bot, LineChart, Users } from 'lucide-react-native';
import { presentPaywall, revenueCatConfigured } from '@/lib/paywall';
import { APPLE_EULA_URL, PRIVACY_POLICY_URL } from '@/constants/legal';
import { track, Ev } from '@/lib/analytics';
import { Display, Heading, Body, Caption } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { colors } from '@/theme/colors';
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
 * HALE+ paywall — modal screen (Phase-1 step 8).
 *
 * MUST be registered in src/app/_layout.tsx as:
 *   <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
 *
 * Behavior:
 *   - On mount, ask RevenueCat to present its native paywall (gated on the HALE+
 *     entitlement). presentPaywall() fires PAYWALL_VIEWED + PURCHASE_COMPLETED.
 *   - When RC is configured, the native sheet covers this screen; once it
 *     resolves (purchased / cancelled / restored) we simply dismiss the modal —
 *     the premium mirror (usePremium / todayState) updates the rest of the app.
 *   - When RC is UNCONFIGURED (scaffold), presentPaywall() returns NOT_PRESENTED
 *     without firing any event; we then render a tasteful in-app HALE+ upsell and
 *     fire PAYWALL_VIEWED ourselves so the funnel stays wired even pre-keys.
 *
 * Upsell copy is grounded in category-leader subscription paywalls (Smoke Free,
 * QuitNow, I Am Sober, Streaks, Calm): a tight value-prop list, an anchored
 * annual price reframed as a tiny weekly number, and a low-friction
 * "Maybe later" dismiss. (Mobbin is paid-gated/unavailable, so these are the
 * known patterns from those quit/wellness apps.)
 */

type Phase = 'presenting' | 'fallback' | 'dismissing';

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
  const [phase, setPhase] = useState<Phase>('presenting');
  const ranRef = useRef(false);

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  };

  useEffect(() => {
    // Guard against double-invoke (StrictMode / fast refresh).
    if (ranRef.current) return;
    ranRef.current = true;

    let active = true;
    (async () => {
      const result = await presentPaywall();
      if (!active) return;

      if (result === PAYWALL_RESULT.NOT_PRESENTED) {
        // RC unconfigured (scaffold) OR already-premium. Show the in-app upsell
        // and fire PAYWALL_VIEWED here (presentPaywall did not, since it bailed).
        track(Ev.PAYWALL_VIEWED, { surface: 'fallback' });
        setPhase('fallback');
      } else {
        // Native paywall handled everything (purchase/restore/cancel) → close.
        setPhase('dismissing');
        dismiss();
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // While the native sheet is presenting (or we're closing), keep a calm,
  // on-brand backdrop underneath rather than a flash of empty space.
  if (phase !== 'fallback') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-void">
        <ActivityIndicator color={colors.volt} />
      </SafeAreaView>
    );
  }

  return <HalePlusUpsell onMaybeLater={dismiss} />;
}

/* ------------------------------------------------------------------ */
/* In-app fallback upsell (scaffold / RC-unconfigured)                 */
/* ------------------------------------------------------------------ */

function HalePlusUpsell({ onMaybeLater }: { onMaybeLater: () => void }) {
  // Real purchase path (Guideline 3.1.1/2.1): this fallback is reachable in
  // production whenever the native RC sheet errors, so its CTA must actually
  // sell — and at the STORE's localized price, never a hardcoded USD string.
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!revenueCatConfigured()) return; // scaffold — CTA degrades to dismiss
    Purchases.getOfferings()
      .then((offerings) => {
        const current = offerings.current;
        setPkg(current?.annual ?? current?.availablePackages[0] ?? null);
      })
      .catch(() => {});
  }, []);

  const priceString = pkg?.product.priceString ?? null;

  const onStart = async () => {
    if (buying) return;
    if (!pkg) {
      // Nothing purchasable (RC unconfigured/offering empty) — honest dismiss.
      onMaybeLater();
      return;
    }
    setBuying(true);
    try {
      await Purchases.purchasePackage(pkg);
      track(Ev.PURCHASE_COMPLETED, { surface: 'fallback' });
      onMaybeLater(); // entitlement mirror updates the rest of the app
    } catch (e) {
      const cancelled = (e as { userCancelled?: boolean })?.userCancelled === true;
      if (!cancelled) toast.error("Purchase didn't go through. Please try again.");
    } finally {
      setBuying(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top', 'bottom']}>
      {/* Close — top right, hairline coal chip */}
      <View className="px-gutter pt-3">
        <View className="flex-row items-center justify-end">
          <Pressable
            onPress={onMaybeLater}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-9 w-9 items-center justify-center rounded-full bg-coal border border-line active:opacity-70"
          >
            <X color={colors.ash} size={18} strokeWidth={2.5} />
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
          <Pill tone="volt">HALE+</Pill>

          <Display className="mt-4 text-chalk text-5xl leading-tight tracking-tight">
            GO ALL IN.
          </Display>

          <Heading className="mt-3 text-volt text-xl leading-snug">
            Quitting sticks when you stop holding back.
          </Heading>

          <Body className="mt-2 text-ash text-base leading-relaxed">
            Unlock the full toolkit, your coach, your data, and your people.
          </Body>
        </View>

        {/* Benefits — one tight group */}
        <View className="mt-7 gap-3">
          {BENEFITS.map((b, i) => (
            <Benefit key={b.title} title={b.title} detail={b.detail} Icon={b.Icon} elevated={i === 0} />
          ))}
        </View>

        {/* Reassurance — full auto-renewal disclosure (3.1.2): price, period,
            and renewal mechanics stated on the purchase surface itself, at the
            store's localized price. */}
        <Caption className="mt-5 text-center leading-relaxed">
          {priceString
            ? `14-day free trial, then ${priceString}/year. `
            : '14-day free trial, then billed yearly. '}
          Auto-renews until cancelled — cancel anytime in your App Store
          settings, at least 24h before renewal.
        </Caption>
      </ScrollView>

      {/* Pinned footer: price stays visible WITH the CTA, and it's slim enough
          that it never covers a benefit. Focal point = the lime START HALE+ action. */}
      <View
        className="border-t border-line bg-coal px-gutter pb-2 pt-4"
        style={{ shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: -8 } }}
      >
        {/* Price promoted to the ANTON value-hero so the conversion moment finally
            lands a massive numeral; the footer is a raised coal plane so the cards
            recede UNDER it (no more sliced 4th card). Price value unchanged. */}
        {/* Localized store price only (3.1.2) — no hardcoded USD on non-US
            storefronts. Until the offering loads, lead with the trial. */}
        <View className="mb-3 flex-row items-baseline justify-center">
          <Display className="text-chalk text-5xl leading-tight tracking-tight">
            {priceString ?? '14 days free'}
          </Display>
          {priceString ? <Body className="ml-2 text-ash text-sm">/yr</Body> : null}
        </View>

        <SheenButton onPress={onStart} disabled={buying} />

        <Pressable
          onPress={onMaybeLater}
          accessibilityRole="button"
          className="mt-2 items-center py-3 active:opacity-70"
        >
          <Caption className="text-ash">Maybe later</Caption>
        </Pressable>

        {/* Subscription compliance rail (3.1.2): restore + Terms (Apple EULA)
            + privacy policy must be reachable from the purchase surface. */}
        <View className="flex-row items-center justify-center gap-2 pb-1">
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              try {
                const info = await Purchases.restorePurchases();
                const active = Object.keys(info.entitlements.active).length > 0;
                toast(active ? 'Purchases restored.' : 'No previous purchases found.');
              } catch {
                toast.error("Couldn't restore. Check your App Store account.");
              }
            }}
            className="py-2 active:opacity-70"
          >
            <Caption className="text-ash">Restore purchases</Caption>
          </Pressable>
          <Caption className="text-ash">·</Caption>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(APPLE_EULA_URL).catch(() => {})}
            className="py-2 active:opacity-70"
          >
            <Caption className="text-ash">Terms of Use</Caption>
          </Pressable>
          <Caption className="text-ash">·</Caption>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
            className="py-2 active:opacity-70"
          >
            <Caption className="text-ash">Privacy</Caption>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * START HALE+ with a premium sheen: a soft, skewed white highlight sweeps across
 * the lime button every few seconds (Reanimated translateX over a clipped
 * LinearGradient), then pauses. Light-touch — draws the eye to the conversion CTA
 * without nagging. The sheen is clipped to the button's rounded rect; the Button's
 * own press physics + lift shadow are untouched (the clip only wraps the highlight).
 */
function SheenButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
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
      <Button label={disabled ? 'STARTING…' : 'START HALE+'} variant="primary" onPress={onPress} disabled={disabled} />
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
  // to ash so peak volt is reserved for the CTA. Order/labels unchanged.
  return (
    <View
      className={`flex-row items-start rounded-2xl px-4 py-4 ${
        elevated ? 'border border-volt/25 bg-raised' : 'bg-coal/50'
      }`}
      style={
        elevated
          ? { shadowColor: colors.volt, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
          : undefined
      }
    >
      <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl bg-volt">
        <Icon color={colors.void} size={20} strokeWidth={2.5} />
      </View>
      <View className="flex-1">
        <Body className="font-body-bold text-chalk text-base">{title}</Body>
        <Body className="mt-1 text-ash text-sm leading-relaxed">{detail}</Body>
      </View>
      <Check color={colors.ash} size={18} strokeWidth={3} className="mt-1" />
    </View>
  );
}
