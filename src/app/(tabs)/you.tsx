import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import type { View as RNView } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from 'sonner-native';
import {
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Crown,
  FileText,
  Gift,
  LifeBuoy,
  Lock,
  Share2,
  Sparkles,
  Trash2,
  UserX,
} from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  HEALTH_MILESTONES,
  reachedHealthMilestones,
} from '@convex/model/plan';
import {
  track,
  Ev,
  isAnalyticsEnabled,
  setAnalyticsEnabled,
  resetAnalyticsIdentity,
} from '@/lib/analytics';
import { logoutOneSignal } from '@/lib/onesignal';
import { logOutPurchaser } from '@/lib/revenuecat';
import TransformationCard, { shareCard } from '@/components/TransformationCard';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/StatTile';
import { Pill } from '@/components/ui/Pill';
import { colors } from '@/theme/colors';
import { UNMUTE_CONFIRMATION } from '@/constants/communityCopy';
import {
  APPLE_EULA_URL,
  MANAGE_SUBSCRIPTIONS_URL,
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
} from '@/constants/legal';

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
        <ActivityIndicator color={colors.volt} />
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
            <Label className="text-volt">Your freedom</Label>
            <Heading className="mt-1 text-5xl leading-[0.9]">YOU</Heading>
          </View>
          {state.premium ? (
            <Pill tone="volt" className="mb-1">
              <Crown color={colors.volt} size={13} strokeWidth={2.75} />
              <Label className="text-volt">HALE+</Label>
            </Pill>
          ) : null}
        </View>

        {/* Profile framing — distinguishes the persistent "your story" card here
            from the momentary milestone-celebration card (which leads with a
            'milestone reached' overline + confetti). Same share artifact, different
            context. */}
        <View className="mb-3 flex-row items-center gap-2">
          <Sparkles color={colors.volt} size={14} strokeWidth={2.75} />
          <Label className="text-volt">Your story so far</Label>
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
            <Share2 color={colors.volt} size={16} strokeWidth={2.75} />
            <Label className="text-volt">Built to be screenshotted</Label>
          </View>
          <Button
            label="Share your progress"
            variant="primary"
            onPress={onShare}
          />
        </View>

        {/* Lifetime pride — money loud in lime, streak in chalk. */}
        <Label className="mb-3">Lifetime pride</Label>
        <View className="mb-8 flex-row gap-3">
          <StatTile
            label="Saved, lifetime"
            value={money(state.lifetimeMoneySaved)}
            accent
          />
          <StatTile
            label="Best streak"
            value={`${state.longestStreak}d`}
          />
        </View>

        {/* Health-milestone history — dark list, lime check icons. */}
        <View className="mb-8">
          <View className="mb-3 flex-row items-center justify-between">
            <Label>Your recovery so far</Label>
            {reached.length > 0 ? (
              <Pill tone="volt">
                <Label className="text-volt">
                  {reached.length}/{HEALTH_MILESTONES.length}
                </Label>
              </Pill>
            ) : null}
          </View>

          {reached.length === 0 ? (
            <View className="rounded-3xl border border-line bg-coal p-6">
              <Sparkles color={colors.volt} size={22} strokeWidth={2.5} />
              <Body className="mt-3 text-base leading-relaxed text-ash">
                Your first recovery milestone unlocks within the hour. Your body
                starts healing the moment you stop.
              </Body>
            </View>
          ) : (
            <View className="overflow-hidden rounded-3xl border border-line bg-coal">
              {/* Most-recently reached first — the freshest win on top. */}
              {[...reached].reverse().map((m, i) => (
                <View
                  key={`${m.hours}`}
                  className={`flex-row items-center px-4 py-4 ${
                    i === 0 ? '' : 'border-t border-line'
                  }`}
                >
                  <View className="mr-4 h-9 w-9 items-center justify-center rounded-full bg-volt">
                    <Check color={colors.voltInk} size={18} strokeWidth={3} />
                  </View>
                  <Body className="flex-1 pr-3 font-body-semibold text-[15px] text-chalk">
                    {m.label}
                  </Body>
                  <Display className="text-lg text-ash">
                    {milestoneWhen(m.hours)}
                  </Display>
                </View>
              ))}
            </View>
          )}
          <Body className="mt-3 px-1 text-xs leading-relaxed text-ash">
            Typical recovery timeline as published by the US CDC, WHO, and US
            Surgeon General — population averages, not measurements of your
            body. Supportive, not medical advice.
          </Body>
        </View>

        {/* HALE+ upsell — hidden once premium. */}
        {!state.premium ? (
          <Pressable
            onPress={goPaywall}
            accessibilityRole="button"
            className="overflow-hidden rounded-3xl border border-line bg-coal active:opacity-90"
          >
            {/* Lime top rail so the upgrade reads as the one premium surface. */}
            <View className="h-1.5 bg-volt" />
            <View className="flex-row items-center px-5 py-5">
              <View className="mr-4 h-11 w-11 items-center justify-center rounded-2xl bg-volt">
                <Crown color={colors.voltInk} size={22} strokeWidth={2.5} />
              </View>
              <View className="flex-1 pr-3">
                <Heading className="text-xl">UNLOCK HALE+</Heading>
                <Body className="mt-1 text-[13px] leading-relaxed text-ash">
                  Deeper coaching, richer insights, and more ways to stay free.
                </Body>
              </View>
              <ChevronRight color={colors.volt} size={22} strokeWidth={2.5} />
            </View>
          </Pressable>
        ) : (
          <View className="overflow-hidden rounded-3xl border border-line bg-coal">
            <View className="h-1.5 bg-volt" />
            <View className="flex-row items-center px-5 py-5">
              <View className="mr-4 h-11 w-11 items-center justify-center rounded-2xl bg-volt">
                <Crown color={colors.voltInk} size={22} strokeWidth={2.5} />
              </View>
              <View className="flex-1">
                <Heading className="text-xl">YOU&apos;RE ON HALE+</Heading>
                <Body className="mt-1 text-[13px] text-ash">
                  Thank you for backing your own freedom.
                </Body>
              </View>
            </View>
          </View>
        )}

        {/* NOTE: the "Home-screen widgets" HALE+ preview was removed — no
            WidgetKit extension exists in the binary yet, and selling an
            unshipped feature is a Guideline 2.1/3.1.2 rejection. Re-add the
            block (and the paywall benefit row) when the extension ships. */}

        {/* Phase-2 entry points */}
        <View className="mt-4 gap-3">
          <YouLink
            icon={<Gift color={colors.volt} size={20} strokeWidth={2.5} />}
            title="Treat yourself"
            sub="Set a goal to spend your saved money on."
            onPress={() => router.push('/goals')}
          />
          <YouLink
            icon={<BarChart3 color={colors.volt} size={20} strokeWidth={2.5} />}
            title="Your insights"
            sub="Craving trends + recovery, HALE+."
            onPress={() => router.push('/analytics')}
          />
        </View>

        {/* Settings & support — the App Review surface: published contact
            (1.2), privacy policy + terms in-app (5.1.1(i)/3.1.2), block-list
            management (1.2), analytics withdrawal (5.1.1(ii)), and in-app
            account deletion (5.1.1(v)). */}
        <SettingsSection premium={state.premium} />
      </ScrollView>
    </Screen>
  );
}

function SettingsSection({ premium }: { premium: boolean }) {
  const { signOut } = useAuthActions();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const unmuteProfile = useMutation(api.communityModeration.unmuteProfile);
  const mutes = useQuery(api.communityModeration.myMutes, {});

  const [blockedOpen, setBlockedOpen] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    isAnalyticsEnabled().then(setAnalyticsOn);
  }, []);

  const onToggleAnalytics = (enabled: boolean) => {
    setAnalyticsOn(enabled);
    void setAnalyticsEnabled(enabled);
  };

  const onUnblock = async (profileId: Id<'anonProfiles'>, handle: string) => {
    try {
      await unmuteProfile({ profileId });
      toast(UNMUTE_CONFIRMATION(handle));
    } catch {
      /* reactive list simply stays as-is */
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount({});
    } catch {
      setDeleting(false);
      toast.error("Couldn't delete your account. Please try again or email " + SUPPORT_EMAIL);
      return;
    }
    // Server data is gone — best-effort local/provider cleanup, then out.
    resetAnalyticsIdentity();
    logoutOneSignal();
    await logOutPurchaser();
    await AsyncStorage.clear().catch(() => {});
    await signOut().catch(() => {
      /* server session already cascaded away — local state is what matters */
    });
    router.replace('/(onboarding)/welcome');
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently erases your quit history, chats, community posts, and profile. It cannot be undone.' +
        (premium
          ? '\n\nDeleting your account does NOT cancel your App Store subscription — manage that with Apple.'
          : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        ...(premium
          ? [
              {
                text: 'Manage subscription',
                onPress: () => Linking.openURL(MANAGE_SUBSCRIPTIONS_URL).catch(() => {}),
              },
            ]
          : []),
        { text: 'Delete forever', style: 'destructive', onPress: () => void doDelete() },
      ],
    );
  };

  return (
    <View className="mt-8">
      <Label className="mb-3 ml-1">Settings &amp; support</Label>
      <View className="gap-3">
        <YouLink
          icon={<LifeBuoy color={colors.volt} size={20} strokeWidth={2.5} />}
          title="Contact support"
          sub={SUPPORT_EMAIL}
          onPress={() =>
            // No mail client configured (common on fresh devices/simulators):
            // still surface the address instead of failing silently.
            Linking.openURL(SUPPORT_MAILTO).catch(() => toast(`Email us: ${SUPPORT_EMAIL}`))
          }
        />
        <YouLink
          icon={<Lock color={colors.volt} size={20} strokeWidth={2.5} />}
          title="Privacy policy"
          sub="What we collect and why."
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
        />
        <YouLink
          icon={<FileText color={colors.volt} size={20} strokeWidth={2.5} />}
          title="Terms of use"
          sub="The agreement behind HALE+."
          onPress={() => Linking.openURL(APPLE_EULA_URL).catch(() => {})}
        />

        {/* Blocked members — manage the account-level block list. */}
        <View className="rounded-2xl border border-line bg-coal">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Blocked members"
            accessibilityState={{ expanded: blockedOpen }}
            onPress={() => setBlockedOpen((open) => !open)}
            className="flex-row items-center px-5 py-4 active:bg-card"
          >
            <UserX color={colors.volt} size={20} strokeWidth={2.5} />
            <View className="ml-3 flex-1">
              <Body className="font-body-semibold text-base text-chalk">Blocked members</Body>
              <Body className="mt-0.5 text-sm text-ash">
                {mutes && mutes.length > 0
                  ? `${mutes.length} blocked`
                  : "No one blocked — you'd never see their posts again."}
              </Body>
            </View>
            <ChevronRight
              color={colors.ash}
              size={20}
              style={{ transform: [{ rotate: blockedOpen ? '90deg' : '0deg' }] }}
            />
          </Pressable>
          {blockedOpen &&
            (mutes ?? []).map((m) => (
              <View
                key={m.profileId}
                className="flex-row items-center border-t border-line px-5 py-3"
              >
                <Body className="flex-1 text-sm text-chalk">{m.handle}</Body>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock ${m.handle}`}
                  onPress={() => void onUnblock(m.profileId, m.handle)}
                  className="rounded-full border border-line px-3 py-1.5 active:opacity-70"
                >
                  <Label>Unblock</Label>
                </Pressable>
              </View>
            ))}
        </View>

        {/* Analytics consent withdrawal (5.1.1(ii)) — applies immediately.
            Copy says "linked to your account", never "anonymous": events are
            identified via posthog.identify(userId) (2.3.1 accuracy). */}
        <View className="flex-row items-center rounded-2xl border border-line bg-coal px-5 py-4">
          <BarChart3 color={colors.volt} size={20} strokeWidth={2.5} />
          <View className="ml-3 flex-1 pr-3">
            <Body className="font-body-semibold text-base text-chalk">Share usage analytics</Body>
            <Body className="mt-0.5 text-sm text-ash">
              Usage data linked to your account ID that helps us improve HALE.
              Never sold, never for ads.
            </Body>
          </View>
          <Switch
            value={analyticsOn}
            onValueChange={onToggleAnalytics}
            trackColor={{ true: colors.volt, false: colors.line }}
            accessibilityLabel="Share usage analytics"
          />
        </View>

        {/* AI-consent withdrawal (5.1.1(ii)): consent to share chat data with
            third-party AI must be revocable, not one-way. Turning it off
            re-locks the Sage composer (server re-gates in sage.send). */}
        <AiConsentRow />

        {/* Account deletion (5.1.1(v)) — in-app, full erasure. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          onPress={onDeleteAccount}
          disabled={deleting}
          className="flex-row items-center rounded-2xl border border-sos/40 bg-coal px-5 py-4 active:bg-card"
        >
          {deleting ? (
            <ActivityIndicator color={colors.sos} />
          ) : (
            <Trash2 color={colors.sos} size={20} strokeWidth={2.5} />
          )}
          <View className="ml-3 flex-1">
            <Body className="font-body-semibold text-base text-sos">
              {deleting ? 'Deleting everything…' : 'Delete account'}
            </Body>
            <Body className="mt-0.5 text-sm text-ash">
              Permanently erase your account and all your data.
            </Body>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * "AI coach data sharing" toggle — the withdrawal half of the 5.1.2(i)
 * consent. Off = Sage's composer re-locks (users.revokeAiConsent unsets the
 * flag; convex/sage.ts refuses sends until re-consented).
 */
function AiConsentRow() {
  const status = useQuery(api.users.aiConsentStatus, {});
  const setAiConsent = useMutation(api.users.setAiConsent);
  const revokeAiConsent = useMutation(api.users.revokeAiConsent);

  const onToggle = (enabled: boolean) => {
    void (enabled ? setAiConsent({}) : revokeAiConsent({})).catch(() => {});
  };

  return (
    <View className="flex-row items-center rounded-2xl border border-line bg-coal px-5 py-4">
      <Bot color={colors.volt} size={20} strokeWidth={2.5} />
      <View className="ml-3 flex-1 pr-3">
        <Body className="font-body-semibold text-base text-chalk">AI coach data sharing</Body>
        <Body className="mt-0.5 text-sm text-ash">
          Lets Sage work by sharing your chats and quit stats with our AI
          providers. Off pauses the coach.
        </Body>
      </View>
      <Switch
        value={status?.consented === true}
        disabled={status === undefined}
        onValueChange={onToggle}
        trackColor={{ true: colors.volt, false: colors.line }}
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
      onPress={onPress}
      className="flex-row items-center rounded-2xl border border-line bg-coal px-5 py-4 active:bg-card"
    >
      {icon}
      <View className="ml-3 flex-1">
        <Body className="font-body-semibold text-base text-chalk">{title}</Body>
        <Body className="mt-0.5 text-sm text-ash">{sub}</Body>
      </View>
      <ChevronRight color={colors.ash} size={20} />
    </Pressable>
  );
}
