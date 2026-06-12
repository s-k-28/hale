import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { Check, X, Bot, LineChart, Users, LayoutGrid } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { presentPaywall } from '@/lib/paywall';
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
  {
    title: 'Home-screen widgets',
    detail: 'Your clean-time counter and money saved, glanceable without opening the app.',
    Icon: LayoutGrid,
  },
];

export default function Paywall() {
  const [phase, setPhase] = useState<Phase>('presenting');
  // Retry state for the fallback (Guideline 3.1.1): when the native flow
  // can't load offerings, the Start CTA retries and we say so plainly —
  // never blank, never an infinite spinner, never a link out to a browser.
  const [retrying, setRetrying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
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

  // Tapping Start on the fallback retries the native purchase flow. If RC
  // still can't serve offerings, show the unavailable notice and keep the
  // retry available.
  const onStart = async () => {
    if (retrying) return;
    setRetrying(true);
    setUnavailable(false);
    const result = await presentPaywall('fallback_retry');
    setRetrying(false);
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      dismiss();
    } else if (result === PAYWALL_RESULT.NOT_PRESENTED) {
      // Subscriptions unavailable — the system can't serve the user right now.
      haptics.warn();
      setUnavailable(true);
    }
    // CANCELLED → user closed the native sheet; stay here quietly.
  };

  // While the native sheet is presenting (or we're closing), keep a calm,
  // on-brand backdrop underneath rather than a flash of empty space.
  if (phase !== 'fallback') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={clean.accent} />
      </SafeAreaView>
    );
  }

  return (
    <HalePlusUpsell
      onMaybeLater={dismiss}
      onStart={onStart}
      retrying={retrying}
      unavailable={unavailable}
    />
  );
}

/* ------------------------------------------------------------------ */
/* In-app fallback upsell (scaffold / RC-unconfigured)                 */
/* ------------------------------------------------------------------ */

function HalePlusUpsell({
  onMaybeLater,
  onStart,
  retrying,
  unavailable,
}: {
  onMaybeLater: () => void;
  onStart: () => void;
  retrying: boolean;
  unavailable: boolean;
}) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      {/* Close — top right, hairline surface chip */}
      <View className="px-gutter pt-3">
        <View className="flex-row items-center justify-end">
          <Pressable
            onPress={onMaybeLater}
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
            GO ALL IN.
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
          14-day free trial, then $79.99/yr. Auto-renews until cancelled in Settings.
        </Caption>
        {/* Subscription legal (Guideline 3.1.2): functional Privacy + Terms links
            reachable from the purchase surface. Quiet by design — never crowds the CTA. */}
        <View className="mt-2 flex-row items-center justify-center gap-6">
          <Pressable
            hitSlop={8}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL).catch(() => {})}
          >
            <Caption className="underline">Privacy</Caption>
          </Pressable>
          <Pressable
            hitSlop={8}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {})}
          >
            <Caption className="underline">Terms</Caption>
          </Pressable>
        </View>
      </ScrollView>

      {/* Pinned footer: price stays visible WITH the CTA, and it's slim enough
          that it never covers a benefit. Focal point = the lime START HALE+ action. */}
      <View
        className="border-t border-stroke bg-surface px-gutter pb-2 pt-4"
        style={{ shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: -8 } }}
      >
        {/* Price promoted to the ANTON value-hero so the conversion moment finally
            lands a massive numeral; the footer is a raised surface plane so the cards
            recede UNDER it (no more sliced 4th card). Price value unchanged. */}
        <View className="mb-3 flex-row items-baseline justify-center">
          <Display className="text-fg text-5xl leading-tight tracking-tight">$79.99</Display>
          <Body className="ml-2 text-fg-2 text-sm">/yr · $6.67/mo</Body>
        </View>

        <SheenButton onPress={onStart} label={unavailable ? 'Try again' : 'Start HALE+'} busy={retrying} />
        {unavailable ? (
          <Body className="mt-3 text-center text-[13px] leading-5 text-fg-2">
            Subscriptions aren't available right now. Check your connection and try again — your
            14-day full-access window keeps working in the meantime.
          </Body>
        ) : null}

        <Pressable
          onPress={onMaybeLater}
          accessibilityRole="button"
          className="mt-2 items-center py-3 active:opacity-70"
        >
          <Caption className="text-fg-2">Maybe later</Caption>
        </Pressable>
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
