import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { BarChart3, BookOpenCheck, Bot, Check, ChevronRight, Crown, FileText, Flame, Gift, LifeBuoy, Share2, ShieldCheck, Trash2, UserX, Vibrate } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { toast } from 'sonner-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  HEALTH_MILESTONES,
  reachedHealthMilestones,
} from '@convex/model/plan';
import { track, Ev, isAnalyticsEnabled, setAnalyticsEnabled } from '@/lib/analytics';
import { haptics, getHapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/links';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/constants/legal';
import { UNMUTE_CONFIRMATION } from '@/constants/communityCopy';
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
  // Auth-gated query (white-screen fix, 2026-06-12): an ungated mount can
  // receive the query's first result before auth attaches -> null -> the
  // not-onboarded Redirect fires for an ONBOARDED user mid-navigation and
  // strands an empty tab scene. Same pattern as goals.tsx / usePremium.
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const state = useQuery(api.users.todayState, isAuthenticated ? {} : 'skip');
  const now = useNow();
  const cardRef = useRef<RNView>(null);

  // Loading — auth resolving or query in flight.
  if (authLoading || (isAuthenticated && state === undefined)) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={clean.accent} />
      </Screen>
    );
  }
  // Signed out or not onboarded → start the quiz (consistent with Today).
  if (!isAuthenticated || state === null || state === undefined) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

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

  const [hapticsOn, setHapticsOn] = useState(() => getHapticsEnabled());

  const onToggleHaptics = (value: boolean) => {
    setHapticsEnabled(value);
    setHapticsOn(value);
    // Fire a confirmation beat AFTER enabling so the user feels what they turned on.
    if (value) haptics.select();
  };

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
            // The premium upsell surface mirrors LockedFeature's gate → a Medium
            // press (a primary, deliberate action), fired here since this is a
            // custom Pressable, not a UI primitive.
            onPressIn={() => haptics.press()}
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

        {/* NOTE: the "Home-screen widgets" HALE+ preview was removed — no
            WidgetKit extension exists in the binary yet, and selling an
            unshipped feature is a Guideline 2.1/3.1.2 rejection. Re-add the
            block (and any paywall benefit row) when the extension ships. */}

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
          {/* Published support contact (Guideline 1.2) + Terms (3.1.2). */}
          <YouLink
            icon={<LifeBuoy color={clean.accent} size={20} strokeWidth={2.2} />}
            title="Contact support"
            sub={SUPPORT_EMAIL}
            onPress={() =>
              Linking.openURL(SUPPORT_MAILTO).catch(() => toast(`Email us: ${SUPPORT_EMAIL}`))
            }
          />
          <YouLink
            icon={<FileText color={clean.accent} size={20} strokeWidth={2.2} />}
            title="Terms of service"
            sub="Subscriptions, referrals, and the ground rules."
            onPress={() => {
              void WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {
                // No browser available — nothing sensible to do silently here.
              });
            }}
          />
          {/* Haptic feedback toggle — Switch inline with the YouLink row pattern. */}
          <View className="flex-row items-center rounded-2xl border border-stroke bg-surface px-5 py-4">
            <Vibrate color={clean.accent} size={20} strokeWidth={2.2} />
            <View className="ml-3 flex-1">
              <Body className="font-sora-semibold text-base text-fg">Haptic feedback</Body>
              <Body className="mt-0.5 text-sm text-fg-2">Feel taps and milestones</Body>
            </View>
            <Switch
              value={hapticsOn}
              onValueChange={onToggleHaptics}
              trackColor={{ false: clean.stroke, true: clean.accent }}
              thumbColor={clean.fg}
              ios_backgroundColor={clean.stroke}
            />
          </View>

          {/* Blocked members (1.2: manage the account-level block list). */}
          <BlockedMembers />

          {/* Consent withdrawals (5.1.1(ii)) — both apply immediately. */}
          <AnalyticsToggle />
          <AiConsentToggle />


          {/* Destructive lane (coral) — Guideline 5.1.1(v): in-app account deletion,
              visible in Settings, not buried. */}
          <YouLink
            icon={<Trash2 color={clean.coral} size={20} strokeWidth={2.2} />}
            title="Delete account"
            sub="Permanently erase your account and data."
            onPress={() => router.push('/delete-account')}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Manage the account-level block list (Guideline 1.2) — expandable row. */
function BlockedMembers() {
  const mutes = useQuery(api.communityModeration.myMutes, {});
  const unmuteProfile = useMutation(api.communityModeration.unmuteProfile);
  const [open, setOpen] = useState(false);

  const onUnblock = async (profileId: Id<'anonProfiles'>, handle: string) => {
    try {
      await unmuteProfile({ profileId });
      toast(UNMUTE_CONFIRMATION(handle));
    } catch {
      /* reactive list simply stays as-is */
    }
  };

  return (
    <View className="rounded-2xl border border-stroke bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Blocked members"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center px-5 py-4 active:bg-surface-2"
      >
        <UserX color={clean.accent} size={20} strokeWidth={2.2} />
        <View className="ml-3 flex-1">
          <Body className="font-sora-semibold text-base text-fg">Blocked members</Body>
          <Body className="mt-0.5 text-sm text-fg-2">
            {mutes && mutes.length > 0
              ? `${mutes.length} blocked`
              : "No one blocked — you'd never see their posts again."}
          </Body>
        </View>
        <ChevronRight
          color={clean.fg2}
          size={20}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Pressable>
      {open &&
        (mutes ?? []).map((m) => (
          <View key={m.profileId} className="flex-row items-center border-t border-stroke px-5 py-3">
            <Body className="flex-1 text-sm text-fg">{m.handle}</Body>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${m.handle}`}
              onPress={() => void onUnblock(m.profileId, m.handle)}
              className="rounded-full border border-stroke px-3 py-1.5 active:opacity-70"
            >
              <Label>Unblock</Label>
            </Pressable>
          </View>
        ))}
    </View>
  );
}

/** Usage-analytics consent withdrawal (5.1.1(ii)) — applies immediately.
 *  Copy says "linked to your account ID", never "anonymous": events are
 *  identified via posthog.identify(userId) (2.3.1 accuracy). */
function AnalyticsToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    isAnalyticsEnabled().then(setOn);
  }, []);
  return (
    <View className="flex-row items-center rounded-2xl border border-stroke bg-surface px-5 py-4">
      <BarChart3 color={clean.accent} size={20} strokeWidth={2.2} />
      <View className="ml-3 flex-1 pr-3">
        <Body className="font-sora-semibold text-base text-fg">Share usage analytics</Body>
        <Body className="mt-0.5 text-sm text-fg-2">
          Usage data linked to your account ID that helps us improve HALE. Never
          sold, never for ads.
        </Body>
      </View>
      <Switch
        value={on}
        onValueChange={(enabled) => {
          setOn(enabled);
          void setAnalyticsEnabled(enabled);
        }}
        trackColor={{ true: clean.accent, false: clean.surface3 }}
        accessibilityLabel="Share usage analytics"
      />
    </View>
  );
}

/** AI-consent withdrawal (5.1.2(i)/5.1.1(ii)): off re-locks the Sage composer
 *  (users.revokeAiConsent unsets the flag; convex/sage.ts refuses sends). */
function AiConsentToggle() {
  const status = useQuery(api.users.aiConsentStatus, {});
  const setAiConsent = useMutation(api.users.setAiConsent);
  const revokeAiConsent = useMutation(api.users.revokeAiConsent);
  return (
    <View className="flex-row items-center rounded-2xl border border-stroke bg-surface px-5 py-4">
      <Bot color={clean.accent} size={20} strokeWidth={2.2} />
      <View className="ml-3 flex-1 pr-3">
        <Body className="font-sora-semibold text-base text-fg">AI coach data sharing</Body>
        <Body className="mt-0.5 text-sm text-fg-2">
          Lets Sage work by sharing your chats and quit stats with our AI
          providers. Off pauses the coach.
        </Body>
      </View>
      <Switch
        value={status?.consented === true}
        disabled={status === undefined}
        onValueChange={(enabled) => {
          void (enabled ? setAiConsent({}) : revokeAiConsent({})).catch(() => {});
        }}
        trackColor={{ true: clean.accent, false: clean.surface3 }}
        accessibilityLabel="AI coach data sharing"
      />
    </View>
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
      onPress={() => {
        // Custom settings/navigation row (not a UI primitive) → light tap.
        haptics.tap();
        onPress();
      }}
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
