import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useQuery } from 'convex/react';
import { BarChart3, BookOpenCheck, Check, ChevronRight, Crown, Flame, Gift, Share2, ShieldCheck } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@convex/_generated/api';
import {
  HEALTH_MILESTONES,
  reachedHealthMilestones,
} from '@convex/model/plan';
import { track, Ev } from '@/lib/analytics';
import { PRIVACY_POLICY_URL } from '@/lib/links';
import TransformationCard, { shareCard } from '@/components/TransformationCard';
import {
  Screen,
  Button,
  Display,
  Body,
  Tile,
  Badge,
  H2 as Heading,
  Eyebrow as Label,
} from '@/ui';
import { LockedFeature } from '@/ui';
import { clean } from '@/theme/clean';

/**
 * You — the profile / pride screen (P3). Three jobs:
 *   1. Surface the shareable TransformationCard (the viral seed — never gated).
 *   2. Show the health-recovery history the user has unlocked so far.
 *   3. A lifetime pride line + an "Unlock HALE+" upsell into the paywall.
 *
 * Grounded in the profile/identity pattern (Strava "You", Duolingo profile,
 * I-Am-Sober milestones): one proud artifact up top, a chronological list of
 * earned milestones below, then account/upgrade actions.
 *
 * Reactive: useQuery(api.users.todayState) is the single source of truth. The
 * only client-derived value is `now` (current epoch ms), sampled once per mount
 * and refreshed on a slow tick so day-rollovers reflect without a manual reload.
 */

const MS_PER_DAY = 86_400_000;

/** Slow clock — the profile doesn't need a 1s tick; a minute keeps it fresh. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function money(n: number) {
  return `$${Math.max(0, n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Pretty "time after quit" for a reached milestone (e.g. "20 min", "3 days"). */
function milestoneWhen(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours)} hr`;
  const d = Math.round(hours / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

export default function You() {
  const state = useQuery(api.users.todayState, {});
  const now = useNow();
  const cardRef = useRef<RNView>(null);

  // Loading — query in flight.
  if (state === undefined) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={clean.accent} />
      </Screen>
    );
  }
  // Not onboarded → start the quiz (consistent with Today).
  if (state === null) return <Redirect href="/(onboarding)/welcome" />;

  return <YouContent state={state} now={now} cardRef={cardRef} />;
}

type TodayState = NonNullable<ReturnType<typeof useQuery<typeof api.users.todayState>>>;

function YouContent({
  state,
  now,
  cardRef,
}: {
  state: TodayState;
  now: number;
  cardRef: React.RefObject<RNView | null>;
}) {
  const days = Math.max(0, (now - state.quitStart) / MS_PER_DAY);
  const wholeDays = Math.floor(days);

  // Health-recovery history: which milestones the body has reached so far.
  const reached = useMemo(
    () => reachedHealthMilestones(state.quitStart, now),
    [state.quitStart, now],
  );
  // Recovery indicator (0..100) for the card: share of milestones unlocked.
  const recoveryPct = useMemo(
    () =>
      HEALTH_MILESTONES.length === 0
        ? 0
        : Math.round((reached.length / HEALTH_MILESTONES.length) * 100),
    [reached.length],
  );

  const onShare = () => {
    void shareCard(cardRef, { day: wholeDays, source: 'profile' });
  };

  const goPaywall = () => {
    track(Ev.PAYWALL_VIEWED, { source: 'profile' });
    router.push('/paywall');
  };

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="px-5 pb-24 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — loud uppercase wordmark, HALE+ badge anchored right. */}
        <View className="mb-6 flex-row items-end justify-between">
          <View>
            <Label className="text-accent">Your freedom</Label>
            <Heading className="mt-1 text-5xl leading-[0.9]">You</Heading>
          </View>
          {state.premium ? (
            <Badge label="HALE+" tone="soft" className="mb-1" />
          ) : null}
        </View>

        {/* Profile framing — distinguishes the persistent "your story" card here
            from the momentary milestone-celebration card (which leads with a
            'milestone reached' overline + confetti). Same share artifact, different
            context. */}
        <View className="mb-3 flex-row items-center gap-2">
          <Flame color={clean.accent} size={14} strokeWidth={2.2} />
          <Label className="text-accent">Your story so far</Label>
        </View>

        {/* Shareable transformation card (NEVER gated) — the viral artifact. */}
        <View className="mb-4">
          <TransformationCard
            ref={cardRef}
            days={days}
            moneySaved={state.currentMoneySaved}
            recoveryPct={recoveryPct}
          />
        </View>

        {/* Primary CTA — the one loud lime block on the screen. The Button
            owns the share logic; an icon rail sits above it for the sticker
            energy without touching the Button's internals. */}
        <View className="mb-8">
          <View className="mb-2 flex-row items-center gap-2">
            <Share2 color={clean.accent} size={16} strokeWidth={2.75} />
            <Label className="text-accent">Built to be screenshotted</Label>
          </View>
          <Button
            label="Share your progress"
            variant="primary"
            onPress={onShare}
          />
        </View>

        {/* Lifetime pride — money loud in accent, streak in fg. */}
        <Label className="mb-3">Lifetime pride</Label>
        <View className="mb-8 flex-row gap-3">
          <Tile
            k="Saved, lifetime"
            v={money(state.lifetimeMoneySaved)}
            accent
            className="flex-1"
          />
          <Tile
            k="Best streak"
            v={`${state.longestStreak}d`}
            className="flex-1"
          />
        </View>

        {/* Health-milestone history — dark list, accent check icons. */}
        <View className="mb-8">
          <View className="mb-3 flex-row items-center justify-between">
            <Label>Your recovery so far</Label>
            {reached.length > 0 ? (
              <Badge
                label={`${reached.length}/${HEALTH_MILESTONES.length}`}
                tone="soft"
              />
            ) : null}
          </View>

          {reached.length === 0 ? (
            <View className="rounded-3xl border border-stroke bg-surface p-6">
              <Crown color={clean.accent} size={22} strokeWidth={2.2} />
              <Body className="mt-3 text-base leading-relaxed text-fg-2">
                Your first recovery milestone unlocks within the hour. Your body
                starts healing the moment you stop.
              </Body>
            </View>
          ) : (
            <View className="overflow-hidden rounded-3xl border border-stroke bg-surface">
              {/* Most-recently reached first — the freshest win on top. */}
              {[...reached].reverse().map((m, i) => (
                <View
                  key={`${m.hours}`}
                  className={`flex-row items-center px-4 py-4 ${
                    i === 0 ? '' : 'border-t border-stroke'
                  }`}
                >
                  <View className="mr-4 h-9 w-9 items-center justify-center rounded-full bg-accent">
                    <Check color={clean.accentInk} size={18} strokeWidth={3} />
                  </View>
                  <Body className="flex-1 pr-3 font-sora-semibold text-[15px] text-fg">
                    {m.label}
                  </Body>
                  <Display className="text-lg text-fg-2">
                    {milestoneWhen(m.hours)}
                  </Display>
                </View>
              ))}
            </View>
          )}
          <Body className="mt-3 px-1 text-xs leading-relaxed text-fg-2">
            Commonly reported recovery timeline, supportive, not medical advice.
          </Body>
        </View>

        {/* HALE+ upsell — hidden once premium. */}
        {!state.premium ? (
          <Pressable
            onPress={goPaywall}
            accessibilityRole="button"
            className="overflow-hidden rounded-3xl border border-stroke bg-surface active:opacity-90"
          >
            {/* Lime top rail so the upgrade reads as the one premium surface. */}
            <View className="h-1.5 bg-accent" />
            <View className="flex-row items-center px-5 py-5">
              <View className="mr-4 h-11 w-11 items-center justify-center rounded-2xl bg-accent">
                <Crown color={clean.accentInk} size={22} strokeWidth={2.5} />
              </View>
              <View className="flex-1 pr-3">
                <Heading className="text-xl">UNLOCK HALE+</Heading>
                <Body className="mt-1 text-[13px] leading-relaxed text-fg-2">
                  Deeper coaching, richer insights, and more ways to stay free.
                </Body>
              </View>
              <ChevronRight color={clean.accent} size={22} strokeWidth={2.5} />
            </View>
          </Pressable>
        ) : (
          <View className="overflow-hidden rounded-3xl border border-stroke bg-surface">
            <View className="h-1.5 bg-accent" />
            <View className="flex-row items-center px-5 py-5">
              <View className="mr-4 h-11 w-11 items-center justify-center rounded-2xl bg-accent">
                <Crown color={clean.accentInk} size={22} strokeWidth={2.5} />
              </View>
              <View className="flex-1">
                <Heading className="text-xl">You&apos;re on HALE+</Heading>
                <Body className="mt-1 text-[13px] text-fg-2">
                  Thank you for backing your own freedom.
                </Body>
              </View>
            </View>
          </View>
        )}

        {/* Home-screen widgets — blurred preview now; the real WidgetKit
            extension is a fast-follow. Free users see what HALE+ unlocks. */}
        <View className="mt-4">
          <Label className="mb-3 ml-1">Home-screen widgets</Label>
          <LockedFeature
            feature="widgets"
            variant="inline"
            title="Glanceable widgets"
            subtitle="Your clean-time and money saved on your home screen, unlocked with HALE+."
          >
            <View className="flex-row gap-3 p-1">
              <View className="flex-1 rounded-3xl bg-surface-2 px-4 py-5">
                <Label className="text-accent">Days free</Label>
                <Display className="mt-1 text-4xl text-fg">{Math.floor(days)}</Display>
                <Body className="mt-1 text-xs text-fg-2">HALE</Body>
              </View>
              <View className="flex-1 rounded-3xl bg-surface-2 px-4 py-5">
                <Label className="text-accent">Saved</Label>
                <Display className="mt-1 text-4xl text-fg">{money(state.currentMoneySaved)}</Display>
                <Body className="mt-1 text-xs text-fg-2">HALE</Body>
              </View>
            </View>
          </LockedFeature>
        </View>

        {/* Phase-2 entry points */}
        <View className="mt-4 gap-3">
          <YouLink
            icon={<Gift color={clean.accent} size={20} strokeWidth={2.5} />}
            title="Treat yourself"
            sub="Set a goal to spend your saved money on."
            onPress={() => router.push('/goals')}
          />
          <YouLink
            icon={<BarChart3 color={clean.accent} size={20} strokeWidth={2.5} />}
            title="Your insights"
            sub="Craving trends + recovery, HALE+."
            onPress={() => router.push('/analytics')}
          />
          <YouLink
            icon={<BookOpenCheck color={clean.accent} size={20} strokeWidth={2.2} />}
            title="Disclaimers & sources"
            sub="Health claims, cited. Not medical advice."
            onPress={() => router.push('/disclaimers')}
          />
          <YouLink
            icon={<ShieldCheck color={clean.accent} size={20} strokeWidth={2.2} />}
            title="Privacy policy"
            sub="What we store and why. No ads, no tracking."
            onPress={() => {
              void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL).catch(() => {
                // No browser available — nothing sensible to do silently here.
              });
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function YouLink({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center rounded-2xl border border-stroke bg-surface px-5 py-4 active:bg-surface-2"
    >
      {icon}
      <View className="ml-3 flex-1">
        <Body className="font-sora-semibold text-base text-fg">{title}</Body>
        <Body className="mt-0.5 text-sm text-fg-2">{sub}</Body>
      </View>
      <ChevronRight color={clean.fg2} size={20} />
    </Pressable>
  );
}
