import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { Check, X, Bot, LineChart, Users, LayoutGrid } from 'lucide-react-native';
import { presentPaywall } from '@/lib/paywall';
import { track, Ev } from '@/lib/analytics';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { colors } from '@/theme/colors';

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
    detail: 'Talk to your AI coach as much as you need — no daily caps, day or night.',
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
  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top', 'bottom']}>
      {/* Close — top right, hairline coal chip */}
      <View className="px-6 pt-3">
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

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Loud hero — lime badge, Anton wordmark, punchy promise */}
        <View className="mt-2">
          <Pill tone="volt">HALE+</Pill>

          <Display className="mt-5 text-chalk text-6xl leading-[0.95] tracking-tight">
            GO ALL{'\n'}IN.
          </Display>

          <Heading className="mt-4 text-volt text-xl leading-snug">
            Quitting sticks when you stop holding back.
          </Heading>

          <Body className="mt-3 text-ash text-base leading-relaxed">
            Unlock the full toolkit — your coach, your data, and your people.
          </Body>
        </View>

        {/* Benefits — sticker tiles on coal surfaces */}
        <View className="mt-8 gap-3">
          {BENEFITS.map((b) => (
            <Benefit key={b.title} title={b.title} detail={b.detail} Icon={b.Icon} />
          ))}
        </View>
      </ScrollView>

      {/* Price + CTA pinned to the bottom */}
      <View className="px-6 pb-2">
        <View className="rounded-3xl bg-card border border-line px-5 py-5">
          <View className="flex-row items-end justify-between">
            <View>
              <Display className="text-chalk text-5xl leading-none tracking-tight">$39.99</Display>
              <Label className="mt-2 text-ash normal-case tracking-normal">per year</Label>
            </View>
            <View className="items-end">
              <Display className="text-volt text-2xl leading-none tracking-tight">$0.77</Display>
              <Label className="mt-1 text-ash normal-case tracking-normal">a week</Label>
            </View>
          </View>
          <View className="mt-4 h-px bg-line" />
          <Body className="mt-4 text-ash text-xs leading-relaxed">
            Less than a single pack — billed annually, cancel anytime.
          </Body>
        </View>

        <View className="mt-4">
          <Button label="START HALE+" variant="primary" onPress={onMaybeLater} />
        </View>

        <Pressable
          onPress={onMaybeLater}
          accessibilityRole="button"
          className="mt-3 items-center py-3 active:opacity-70"
        >
          <Label className="text-ash normal-case tracking-normal">Maybe later</Label>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Benefit({ title, detail, Icon }: { title: string; detail: string; Icon: IconCmp }) {
  return (
    <View className="flex-row items-start rounded-2xl bg-coal border border-line px-4 py-4">
      <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl bg-volt">
        <Icon color={colors.void} size={20} strokeWidth={2.5} />
      </View>
      <View className="flex-1">
        <Body className="font-body-bold text-chalk text-base">{title}</Body>
        <Body className="mt-1 text-ash text-sm leading-relaxed">{detail}</Body>
      </View>
      <Check color={colors.volt} size={18} strokeWidth={3} className="mt-1" />
    </View>
  );
}
