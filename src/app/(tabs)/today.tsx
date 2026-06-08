import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { Check, ChevronRight, Flame, ShieldCheck, Siren } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { localDateOf } from '@convex/model/streak';
import { LANDMARK_DAYS, recoveryFraction } from '@convex/model/plan';
import { toast } from 'sonner-native';
import { track, Ev } from '@/lib/analytics';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/StatTile';
import { Pill } from '@/components/ui/Pill';
import { RingGauge } from '@/components/ui/RingGauge';
import MilestoneCelebration from '@/components/MilestoneCelebration';
import RingBurst from '@/components/RingBurst';
import { RiseIn } from '@/components/motion';
import { colors } from '@/theme/colors';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * Today — the home dashboard (P1/P2), re-skinned to BOLD MOMENTUM.
 * The live clean-time counter is the star: a giant Anton numeral sitting inside
 * the electric-lime RingGauge, money + lung-recovery stat tiles, a next-health
 * milestone strip, a full-width lime CHECK IN CTA, a loud SOS button, and a
 * compact buddy-status row.
 *
 * Reactive: useQuery(api.users.todayState) is the single source of truth; the
 * only client-derived state is the 1s "now" tick that animates the counter and
 * the milestone countdown. todayState === null → not onboarded → redirect.
 */

const MS = { sec: 1000, min: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

/** Live clock — re-renders this subtree (not the whole screen) every second. */
function useNow(intervalMs = MS.sec) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Break a clean duration into d / h / m / s for the hero counter. */
function breakdown(ms: number) {
  const clamped = Math.max(0, ms);
  return {
    days: Math.floor(clamped / MS.day),
    hours: Math.floor((clamped % MS.day) / MS.hour),
    minutes: Math.floor((clamped % MS.hour) / MS.min),
    seconds: Math.floor((clamped % MS.min) / MS.sec),
  };
}

function money(n: number) {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Humanized countdown to the next health milestone (e.g. "1d 4h" / "12m"). */
function countdownLabel(ms: number) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / MS.day);
  const h = Math.floor((ms % MS.day) / MS.hour);
  const m = Math.floor((ms % MS.hour) / MS.min);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor((ms % MS.min) / MS.sec)}s`;
}

/** Next celebrated landmark (1/3/7/14/30…) for streak framing. */
function nextLandmark(streak: number) {
  return LANDMARK_DAYS.find((d) => d > streak) ?? null;
}

/** Highest celebrated landmark the user has REACHED for a given whole-day count. */
function reachedLandmark(wholeDays: number): number | null {
  let reached: number | null = null;
  for (const d of LANDMARK_DAYS) {
    if (d <= wholeDays) reached = d;
    else break;
  }
  return reached;
}

/** AsyncStorage key — the last landmark we've already celebrated, so it fires once. */
const LAST_CELEBRATED_LANDMARK_KEY = 'hale:lastCelebratedLandmark';

export default function Today() {
  const state = useQuery(api.users.todayState, {});
  const checkIn = useMutation(api.checkins.checkIn);
  const buddy = useQuery(api.buddies.myBuddy, {});

  const now = useNow();
  const [checking, setChecking] = useState(false);
  // Increments on a successful check-in to fire one RingGauge flare + one Skia
  // RingBurst (the radial lime-particle celebration emanating from the ring).
  const [ringSurge, setRingSurge] = useState(0);

  // COUNTER_VIEWED — once, when the screen mounts with real data.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (state && !viewedRef.current) {
      viewedRef.current = true;
      track(Ev.COUNTER_VIEWED);
    }
  }, [state]);

  // Milestone celebration (P3): show the overlay the moment a NEW landmark day is
  // crossed. We persist the last-celebrated landmark in AsyncStorage so the spike
  // fires exactly once per landmark, across mounts/sessions.
  const [celebrateDay, setCelebrateDay] = useState<number | null>(null);
  const lastCelebratedRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate the stored landmark once, before we decide whether to celebrate.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LAST_CELEBRATED_LANDMARK_KEY)
      .then((raw) => {
        if (!active) return;
        const parsed = raw != null ? Number(raw) : NaN;
        lastCelebratedRef.current = Number.isFinite(parsed) ? parsed : null;
      })
      .catch(() => {
        // Storage read failures are non-fatal — treat as "nothing celebrated yet".
      })
      .finally(() => {
        if (active) hydratedRef.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  // Detect a reached-but-uncelebrated landmark once todayState resolves.
  useEffect(() => {
    if (!state || !hydratedRef.current || celebrateDay !== null) return;
    const wholeDays = Math.floor(Math.max(0, now - state.quitStart) / MS.day);
    const reached = reachedLandmark(wholeDays);
    if (reached !== null && reached > (lastCelebratedRef.current ?? 0)) {
      setCelebrateDay(reached);
    }
  }, [state, now, celebrateDay]);

  // Persist + dismiss — records the landmark so it never re-fires.
  const onCelebrationClose = useCallback(() => {
    const day = celebrateDay;
    setCelebrateDay(null);
    if (day == null) return;
    lastCelebratedRef.current = day;
    AsyncStorage.setItem(LAST_CELEBRATED_LANDMARK_KEY, String(day)).catch(() => {
      // Persisting failed; the in-memory ref still prevents a re-show this session.
    });
  }, [celebrateDay]);

  const todayLocalDate = useMemo(() => {
    if (!state?.timezone) return null;
    return localDateOf(now, state.timezone);
  }, [state?.timezone, now]);

  const alreadyCheckedIn =
    !!todayLocalDate && state?.lastCheckInLocalDate === todayLocalDate;

  const onCheckIn = useCallback(async () => {
    if (checking || alreadyCheckedIn) return;
    setChecking(true);
    // Tactile "press received" beat the instant the tap lands.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await checkIn({});
      if (!res.alreadyCheckedIn) {
        track(Ev.CHECKIN_COMPLETED, { streak: res.streak, usedFreeze: res.usedFreeze });
        // P2 exit-criteria event: only when a bounded freeze actually forgave a missed day.
        if (res.usedFreeze) track(Ev.STREAK_FREEZE_USED, { streak: res.streak });
        // Activation instrumentation (P2): mirror the server-detected candidate
        // activation events to PostHog (the authoritative copy is in activationEvents).
        if (res.firstCheckIn)
          track(Ev.FIRST_CHECK_IN, { pairing_method: res.pairingMethod ?? undefined });
        if (res.activatedPairedQuitter)
          track(Ev.ACTIVATED_PAIRED_QUITTER, {
            pairing_method: res.pairingMethod ?? undefined,
            hours_pair_to_checkin: res.hoursPairToCheckin ?? undefined,
          });
        // Reward beat: success haptic + flame/spark burst over the CTA.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setRingSurge((n) => n + 1);
        // No success toast here: the lime burst + the inline "Locked in for today"
        // confirmation already say it. A 3rd toast was redundant AND lingered onto
        // other tabs across navigation. (Error path keeps its toast — see catch.)
      }
    } catch {
      // Surface what was a silent failure — a failed tap shouldn't be a dead end.
      toast.error("Couldn't check in. Please try again");
    } finally {
      setChecking(false);
    }
  }, [checking, alreadyCheckedIn, checkIn]);

  // Loading — query in flight.
  if (state === undefined) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.volt} />
      </Screen>
    );
  }
  // Not onboarded → start the quiz (Decision 2: deferred sign-up).
  if (state === null) return <Redirect href="/(onboarding)/welcome" />;

  const cleanMs = now - state.quitStart;
  const t = breakdown(cleanMs);
  // Cold-start window (day 0): reframe the hero as a beginning, not a void —
  // encouraging ring floor, "first milestone" framing, softened bare zeros.
  const freshStart = t.days === 0;

  // Milestone progress: fraction of the way through the CURRENT health window.
  const milestone = state.nextMilestone;
  const milestoneTargetMs = milestone ? state.quitStart + milestone.hours * MS.hour : null;
  const milestoneRemainingMs = milestoneTargetMs ? milestoneTargetMs - now : 0;
  const milestoneProgress = milestone
    ? Math.min(1, Math.max(0, cleanMs / (milestone.hours * MS.hour)))
    : 1;

  const streak = state.currentStreak;
  const landmark = nextLandmark(streak);
  // Overall recovery = health milestones reached / total — monotonic, never resets.
  // (milestoneProgress, used by the ring + strip, is "progress to the NEXT milestone"
  // and correctly oscillates per-window; it must NOT be shown as overall recovery.)
  const recoveryPct = Math.round(recoveryFraction(state.quitStart, now) * 100);

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerClassName="px-5 pb-24 pt-3"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — loud uppercase, lime status flag */}
        <View className="mb-7 flex-row items-end justify-between">
          <View>
            <Label className="text-volt">Nicotine-free</Label>
            <Heading className="mt-1 text-3xl">Today</Heading>
          </View>
          {state.premium ? (
            <Pill tone="volt">HALE+</Pill>
          ) : null}
        </View>

        {/* Friend-sourced nudge inbox (S2) — shows when a buddy has reached out. */}
        <NudgeInbox />

        {/* HERO — live clean-time counter inside the lime RingGauge. A faint volt
            bloom behind it lifts the focal element onto its own plane (lime light =
            focus); it carries the most breathing room on the screen. */}
        <View className="mb-8 items-center">
          <View className="relative items-center justify-center">
            <View
              className="absolute -inset-4 rounded-full bg-volt/[0.05]"
              style={{ pointerEvents: 'none' }}
            />
            <RingGauge
              progress={freshStart ? Math.max(milestoneProgress, 0.08) : milestoneProgress}
              size={272}
              stroke={12}
              surge={ringSurge}
            >
              <Label className="text-ash">Clean for</Label>
              <HeroDays days={t.days} />
              <Label className="-mt-1 text-volt">
                {t.days === 1 ? 'Day' : 'Days'}
              </Label>
              <View className="mt-3 flex-row items-end">
                <CounterUnit value={pad(t.hours)} label="h" />
                <Dot />
                <CounterUnit value={pad(t.minutes)} label="m" />
                <Dot />
                <CounterUnit value={pad(t.seconds)} label="s" />
              </View>
            </RingGauge>
            {/* Skia radial lime-particle burst on check-in, centered on the ring.
                Keyed on the surge counter so each check-in remounts + re-fires it. */}
            {ringSurge > 0 ? <RingBurst key={ringSurge} /> : null}
          </View>
        </View>

        {/* Next health milestone strip */}
        <RiseIn index={1}>
        {milestone ? (
          <View
            className={`mb-3 rounded-3xl border px-5 py-4 ${
              freshStart ? 'border-volt/25 bg-volt/[0.06]' : 'border-line bg-coal'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Label className={freshStart ? 'text-volt' : undefined}>
                {freshStart ? 'First milestone' : 'Next milestone'}
              </Label>
              <Display className="text-2xl text-volt">
                {countdownLabel(milestoneRemainingMs)}
              </Display>
            </View>
            <Body
              className="mt-1.5 font-body-medium text-[15px] text-chalk"
              numberOfLines={2}
            >
              {milestone.label}
            </Body>
            {freshStart ? (
              <Body className="mt-1 font-body-medium text-[13px] text-volt">
                You've already started, your body is responding right now.
              </Body>
            ) : null}
            <View className="mt-3 h-2 w-full overflow-hidden rounded-full bg-void">
              <View
                className="h-full rounded-full bg-volt"
                style={{
                  width: `${Math.round(Math.max(milestoneProgress, freshStart ? 0.08 : 0) * 100)}%`,
                }}
              />
            </View>
          </View>
        ) : (
          <View className="mb-3 rounded-3xl border border-line bg-coal px-5 py-4">
            <Label className="text-volt">Fully recovered</Label>
            <Body className="mt-1.5 font-body-medium text-[15px] text-chalk">
              Every milestone reached. Your body has come a long way.
            </Body>
          </View>
        )}
        </RiseIn>

        {/* Stat tiles, money saved (lime accent) + lung recovery */}
        <RiseIn index={2}>
        <View className="mb-3 flex-row gap-3">
          <StatTile label="Money saved" value={money(state.currentMoneySaved)} />
          {/* Soften the bare "0%" on day 0, frame it as the start, not a void. */}
          <StatTile label="Recovery" value={recoveryPct === 0 ? 'Day 1' : `${recoveryPct}%`} />
        </View>
        </RiseIn>
        {/* Lifetime line only when it ADDS info, i.e. there's history beyond this
            run (post-relapse). On a first run current == lifetime, so showing it
            just echoes the Money saved tile. */}
        {state.lifetimeMoneySaved > state.currentMoneySaved ? (
          <Body className="mb-7 font-body text-xs text-ash">
            {money(state.lifetimeMoneySaved)} kept in your pocket, all-time.
          </Body>
        ) : (
          <View className="mb-7" />
        )}

        {/* Primary CTA — one-tap daily check-in. The celebratory burst now fires
            at the hero ring (RingBurst), where the streak lives, not over the CTA. */}
        <View className="mb-3">
          <Button
            label={alreadyCheckedIn ? 'Checked in, clean today' : 'Check in, clean today'}
            variant="primary"
            loading={checking}
            disabled={alreadyCheckedIn}
            onPress={onCheckIn}
          />
        </View>
        {alreadyCheckedIn ? (
          <View className="mb-3 flex-row items-center justify-center gap-1.5">
            <Check color={colors.volt} size={14} strokeWidth={3} />
            <Body className="font-body-semibold text-xs text-volt">
              Locked in for today
            </Body>
          </View>
        ) : null}
        {state.freezesRemaining > 0 ? (
          <View className="mb-5 flex-row items-center justify-center gap-1.5">
            <ShieldCheck color={colors.ash} size={14} strokeWidth={2.5} />
            <Body className="font-body text-xs text-ash">
              {state.freezesRemaining} streak freeze
              {state.freezesRemaining === 1 ? '' : 's'} in reserve
            </Body>
          </View>
        ) : (
          <View className="mb-5" />
        )}

        {/* SOS — loud red craving button */}
        <RiseIn index={3}>
        <Pressable
          onPress={() => {
            // craving_sos_opened fires once, on the SOS screen mount (avoids a double-count).
            router.push('/sos');
          }}
          className="mb-6 flex-row items-center gap-4 rounded-2xl bg-sos px-6 py-5 active:opacity-90"
          style={{
            shadowColor: colors.sos,
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <Siren color="#ffffff" size={26} strokeWidth={2.5} />
          <View className="flex-1">
            <Heading className="text-xl text-white">Craving SOS</Heading>
            <Body className="mt-0.5 font-body-medium text-xs text-white/85">
              Tap for help, it passes in minutes
            </Body>
          </View>
          <ChevronRight color="#ffffff" size={22} strokeWidth={2.5} />
        </Pressable>
        </RiseIn>

        {/* Buddy status row */}
        <RiseIn index={4}>
        <BuddyRow data={buddy} streak={streak} landmark={landmark} longestStreak={state.longestStreak} />
        </RiseIn>
      </ScrollView>

      {/* Bottom scrim — fades scrolling content into the void before the tab bar so
          the coral SOS card never peeks as a sliver behind it (layering fix). */}
      <LinearGradient
        colors={['transparent', colors.void, colors.void]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, pointerEvents: 'none' }}
      />

      {/* Milestone celebration overlay — fires once per landmark day reached. */}
      <MilestoneCelebration
        visible={celebrateDay !== null}
        day={celebrateDay ?? 0}
        moneySaved={state.currentMoneySaved}
        recoveryPct={recoveryPct}
        onClose={onCelebrationClose}
      />
    </Screen>
  );
}

/** Friend-sourced nudge inbox (S2). Newest unread nudge; tap to open → markRead
 *  + NUDGE_OPENED. Renders nothing when the inbox is empty (the common case). */
function NudgeInbox() {
  const nudges = useQuery(api.nudges.myNudges, {});
  const markRead = useMutation(api.nudges.markRead);
  if (!nudges || nudges.length === 0) return null;
  const n = nudges[0];
  const onOpen = () => {
    track(Ev.NUDGE_OPENED, { type: n.type });
    markRead({ nudgeId: n._id }).catch(() => {
      // Reactive query reflects truth; swallow transient mutation errors.
    });
  };
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Open buddy nudge"
      className="mb-5 rounded-2xl border border-volt/30 bg-volt/10 px-5 py-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-2">
        <Flame color={colors.volt} size={18} strokeWidth={2.5} />
        <Body className="flex-1 font-body-bold text-base text-chalk">{n.title}</Body>
      </View>
      <Body className="mt-1 text-sm leading-5 text-ash">{n.body}</Body>
      <Body className="mt-2 text-xs text-volt">Tap to dismiss</Body>
    </Pressable>
  );
}

/** A small dim separator dot between time units in the hero. */
function Dot() {
  return <Display className="mx-2 -translate-y-1 text-2xl text-line">·</Display>;
}

/**
 * The hero day count — breathes subtly (a slow ~4s scale cycle) so the live
 * counter reads as alive, not frozen. Scale-only (centered) → no layout shift.
 */
function HeroDays({ days }: { days: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.018, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View className="mt-1" style={style}>
      <Display className="text-8xl leading-tight text-chalk">{days}</Display>
    </Animated.View>
  );
}

/**
 * One h/m/s unit under the hero day counter. On every value change the digits
 * roll up with a small spring (a slight overshoot) — the "satisfying tick" that
 * makes the seconds feel live and minute/hour rollovers read cleanly.
 */
function CounterUnit({ value, label }: { value: string; label: string }) {
  const anim = useSharedValue(1);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    anim.value = 0;
    anim.value = withSpring(1, { damping: 15, stiffness: 240, mass: 0.5 });
  }, [value, anim]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.72 + anim.value * 0.28,
    transform: [{ translateY: (1 - anim.value) * 6 }],
  }));
  return (
    <View className="items-center">
      <Animated.View style={style}>
        <Display className="text-xl text-ash">{value}</Display>
      </Animated.View>
      <Label className="mt-0.5 text-ash">{label}</Label>
    </View>
  );
}

/** Compact buddy-status row; placeholder invite CTA when unpaired. */
type BuddyData =
  | {
      buddy: {
        name: string | null;
        currentStreak: number;
        lastCheckInLocalDate: string | null;
      };
    }
  | null
  | undefined;

function BuddyRow({
  data,
  streak,
  landmark,
  longestStreak,
}: {
  data: BuddyData;
  streak: number;
  landmark: number | null;
  longestStreak: number;
}) {
  // Loading the buddy query shouldn't block the screen — render a quiet skeleton.
  if (data === undefined) {
    return <View className="h-[72px] rounded-2xl border border-line bg-coal" />;
  }

  const buddy = data?.buddy ?? null;

  // Streak framing line — your own progress, shown alongside the buddy row.
  const streakLine = landmark
    ? `${landmark - streak} day${landmark - streak === 1 ? '' : 's'} to your ${landmark}-day mark`
    : `Best yet, ${longestStreak} days clean`;

  if (!buddy) {
    return (
      <View>
        <View className="mb-3 flex-row items-center gap-2">
          <Flame color={colors.volt} size={16} strokeWidth={2.5} />
          <Label>
            {streak} day streak · {streakLine}
          </Label>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/squad')}
          className="flex-row items-center justify-between rounded-2xl border border-dashed border-volt/30 bg-coal px-5 py-4 active:opacity-80"
        >
          <View className="flex-1 pr-3">
            <Heading className="text-base">Quit with a buddy</Heading>
            <Body className="mt-1 font-body text-xs text-ash">
              People paired with a buddy are far likelier to stay clean.
            </Body>
          </View>
          <View className="rounded-full bg-volt px-4 py-2">
            <Heading className="text-xs text-volt-ink">Invite</Heading>
          </View>
        </Pressable>
      </View>
    );
  }

  const name = buddy.name?.trim() || 'Your buddy';
  return (
    <View>
      <View className="mb-3 flex-row items-center gap-2">
        <Flame color={colors.volt} size={16} strokeWidth={2.5} />
        <Label>
          {streak} day streak · {streakLine}
        </Label>
      </View>
      <Pressable
        onPress={() => router.push('/(tabs)/squad')}
        className="flex-row items-center rounded-2xl border border-line bg-coal px-4 py-4 active:opacity-80"
      >
        <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-volt">
          <Heading className="text-base text-volt-ink">
            {name.charAt(0).toUpperCase()}
          </Heading>
        </View>
        <View className="flex-1">
          <Heading className="text-base">{name}</Heading>
          <Body className="mt-0.5 font-body text-xs text-ash">
            {buddy.currentStreak > 0
              ? `${buddy.currentStreak}-day streak · cheer them on`
              : 'Tap to check in on each other'}
          </Body>
        </View>
        <ChevronRight color={colors.ash} size={20} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}
