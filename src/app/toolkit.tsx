import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Crown, Sparkles, Waves, Clock, Activity } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label, Caption } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Surface } from '@/components/ui/Surface';
import { LockedFeature } from '@/components/ui/LockedFeature';
import { colors } from '@/theme/colors';

/**
 * Advanced craving toolkit (HALE+) — the gated "depth" beyond the free SOS
 * (ride-it-out + breathe). Three real-but-lightweight tools:
 *   1. Urge-surfing — a guided step-through that teaches riding a craving like a
 *      wave instead of fighting it.
 *   2. Trigger pattern — your most-common trigger + peak craving hour, from your
 *      own craving log.
 *   3. Craving-time map — a 24-hour heatmap of when cravings hit hardest.
 *
 * The whole screen is wrapped in the reusable LockedFeature: free users see the
 * real tools blurred under "Unlock with HALE+"; entitled users get them clean.
 */

function hourLabel(h: number): string {
  const am = h < 12;
  const base = h % 12 === 0 ? 12 : h % 12;
  return `${base}${am ? 'am' : 'pm'}`;
}

export default function Toolkit() {
  const { isAuthenticated } = useConvexAuth();
  const patterns = useQuery(api.analytics.cravingPatterns, isAuthenticated ? {} : 'skip');

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(Ev.ANALYTICS_VIEWED, { surface: 'advanced_toolkit' });
  }, []);

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="h-9 w-9 items-center justify-center rounded-full border border-line bg-coal active:opacity-70"
          >
            <ChevronLeft color={colors.ash} size={20} strokeWidth={2.5} />
          </Pressable>
          <View>
            <Label className="text-volt">Craving depth</Label>
            <Heading className="mt-0.5 text-3xl leading-[0.9]">TOOLKIT</Heading>
          </View>
        </View>
        <Pill tone="volt">
          <Crown color={colors.volt} size={13} strokeWidth={2.75} />
          <Label className="text-volt">HALE+</Label>
        </Pill>
      </View>

      <LockedFeature
        feature="advanced_toolkit"
        variant="overlay"
        title="Unlock the advanced toolkit"
        subtitle="Urge-surfing, your trigger patterns, and your craving-time map — with HALE+."
      >
        <ScrollView contentContainerClassName="px-5 pb-16 pt-2" showsVerticalScrollIndicator={false}>
          <UrgeSurf />
          <TriggerInsight patterns={patterns} />
          <CravingHeatmap patterns={patterns} />
        </ScrollView>
      </LockedFeature>
    </Screen>
  );
}

/* ── 1. Urge-surfing — guided step-through ───────────────────────── */

const SURF_STEPS = [
  {
    title: 'Notice the wave',
    body: 'Where do you feel the craving in your body? Name it. A craving is a wave — it rises, crests, and always falls.',
  },
  {
    title: 'Don’t fight it',
    body: 'You don’t have to push it away. Let it be there. Fighting a wave exhausts you; riding it carries you over.',
  },
  {
    title: 'Breathe into the peak',
    body: 'Slow breath in for 4, out for 6. The urge is climbing toward its peak right now. Stay with the breath, not the urge.',
  },
  {
    title: 'Ride it down',
    body: 'Feel it start to ease. It’s already fading. You didn’t act on it — you watched it pass. That’s the skill, and you just used it.',
  },
];

function UrgeSurf() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  const start = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track(Ev.CRAVING_SOS_OPENED, { tool: 'urge_surf' });
    setStep(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    void Haptics.selectionAsync();
    setStep((s) => {
      if (s + 1 >= SURF_STEPS.length) {
        track(Ev.CRAVING_SURVIVED, { resolved_by: 'urge_surf' });
        setActive(false);
        return 0;
      }
      return s + 1;
    });
  }, []);

  return (
    <View className="mb-8">
      <Label className="mb-3 ml-1">Urge surfing</Label>
      <Surface level="raised" className="overflow-hidden px-6 py-7">
        {!active ? (
          <>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-volt">
              <Waves color={colors.voltInk} size={26} strokeWidth={2.5} />
            </View>
            <Heading className="mt-5 text-2xl">RIDE THE WAVE</Heading>
            <Body className="mt-2 text-base leading-6 text-ash">
              A 4-step guided practice for riding a craving out instead of fighting it. Takes about
              a minute.
            </Body>
            <Button variant="primary" label="START URGE SURFING" onPress={start} className="mt-6" />
          </>
        ) : (
          <>
            <View className="flex-row gap-2">
              {SURF_STEPS.map((_, i) => (
                <View
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-volt' : 'bg-line'}`}
                />
              ))}
            </View>
            <Label className="mt-6 text-volt">
              Step {step + 1} of {SURF_STEPS.length}
            </Label>
            <Heading className="mt-2 text-2xl normal-case">{SURF_STEPS[step].title}</Heading>
            <Body className="mt-3 text-base leading-7 text-chalk">{SURF_STEPS[step].body}</Body>
            <Button
              variant="primary"
              label={step + 1 >= SURF_STEPS.length ? 'I RODE IT OUT' : 'NEXT'}
              onPress={next}
              className="mt-7"
            />
          </>
        )}
      </Surface>
    </View>
  );
}

/* ── 2. Trigger pattern insight ──────────────────────────────────── */

type Patterns = NonNullable<ReturnType<typeof useQuery<typeof api.analytics.cravingPatterns>>>;

function TriggerInsight({ patterns }: { patterns: Patterns | undefined }) {
  if (patterns === undefined) {
    return (
      <View className="mb-8 items-center rounded-3xl border border-line bg-coal py-8">
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  const { peakHour, topTrigger, total } = patterns;

  return (
    <View className="mb-8">
      <Label className="mb-3 ml-1">Your patterns</Label>
      <View className="rounded-3xl border border-line bg-coal p-5">
        <View className="flex-row items-center">
          <Activity color={colors.volt} size={18} strokeWidth={2.75} />
          <Heading className="ml-2 text-lg normal-case">What sets you off</Heading>
        </View>
        {total === 0 ? (
          <Body className="mt-3 text-[15px] leading-relaxed text-ash">
            Log a few cravings (from the SOS screen) and your personal patterns will appear here —
            your hardest hour and most common trigger.
          </Body>
        ) : (
          <View className="mt-4 gap-3">
            <View className="rounded-2xl bg-void px-4 py-3">
              <Label>Most common trigger</Label>
              <Body className="mt-1 font-body-semibold text-lg text-chalk">
                {topTrigger ? topTrigger : 'Not enough data yet'}
              </Body>
            </View>
            <View className="rounded-2xl bg-void px-4 py-3">
              <Label>Hardest hour</Label>
              <Body className="mt-1 font-body-semibold text-lg text-chalk">
                {peakHour != null ? `Around ${hourLabel(peakHour)}` : '—'}
              </Body>
            </View>
            <Caption className="text-ash">
              Based on {total} logged {total === 1 ? 'craving' : 'cravings'}. Knowing the when and
              why is half the battle.
            </Caption>
          </View>
        )}
      </View>
    </View>
  );
}

/* ── 3. Craving-time heatmap (24h) ───────────────────────────────── */

function CravingHeatmap({ patterns }: { patterns: Patterns | undefined }) {
  const maxCount = useMemo(() => {
    if (!patterns) return 0;
    return patterns.byHour.reduce((m, h) => Math.max(m, h.count), 0);
  }, [patterns]);

  if (patterns === undefined) return null;

  return (
    <View className="mb-8">
      <Label className="mb-3 ml-1">Craving-time map</Label>
      <View className="rounded-3xl border border-line bg-coal p-5">
        <View className="flex-row items-center">
          <Clock color={colors.volt} size={18} strokeWidth={2.75} />
          <Heading className="ml-2 text-lg normal-case">When cravings hit</Heading>
        </View>

        {patterns.total === 0 ? (
          <Body className="mt-3 text-[15px] leading-relaxed text-ash">
            Your 24-hour craving map fills in as you log cravings — so you can see your danger hours
            coming and plan around them.
          </Body>
        ) : (
          <>
            {/* 24 cells, 6 per row, opacity by relative frequency. */}
            <View className="mt-4 flex-row flex-wrap gap-1.5">
              {patterns.byHour.map((h) => {
                const intensity = maxCount > 0 ? h.count / maxCount : 0;
                const opacity = h.count === 0 ? 0.08 : 0.25 + intensity * 0.75;
                return (
                  <View key={h.hour} style={{ width: '15%' }} className="items-center">
                    <View
                      className="h-9 w-full rounded-lg"
                      style={{ backgroundColor: colors.volt, opacity }}
                    />
                    <Caption className="mt-1 text-[10px] text-ash">{hourLabel(h.hour)}</Caption>
                  </View>
                );
              })}
            </View>
            <View className="mt-4 flex-row items-center justify-between">
              <Caption className="text-ash">Quiet</Caption>
              <Caption className="text-ash">Peak</Caption>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
