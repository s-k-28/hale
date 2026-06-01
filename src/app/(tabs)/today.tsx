import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { localDateOf } from '@convex/model/streak';
import { LANDMARK_DAYS } from '@convex/model/plan';
import { track, Ev } from '@/lib/analytics';

/**
 * Today — the home dashboard (P1/P2). Grounded in the canonical quit-smoking /
 * habit-dashboard pattern (QuitNow, Smoke Free, I Am Sober, Streaks): a hero
 * LIVE clean-time counter at the top, a progress ring, money + streak stat
 * cards, a next-health-milestone strip with countdown, a primary one-tap
 * check-in CTA, a large red SOS button, and a compact buddy-status row.
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

export default function Today() {
  const state = useQuery(api.users.todayState, {});
  const checkIn = useMutation(api.checkins.checkIn);
  const buddy = useQuery(api.buddies.myBuddy, {});

  const now = useNow();
  const [checking, setChecking] = useState(false);

  // COUNTER_VIEWED — once, when the screen mounts with real data.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (state && !viewedRef.current) {
      viewedRef.current = true;
      track(Ev.COUNTER_VIEWED);
    }
  }, [state]);

  const todayLocalDate = useMemo(() => {
    if (!state?.timezone) return null;
    return localDateOf(now, state.timezone);
  }, [state?.timezone, now]);

  const alreadyCheckedIn =
    !!todayLocalDate && state?.lastCheckInLocalDate === todayLocalDate;

  const onCheckIn = useCallback(async () => {
    if (checking || alreadyCheckedIn) return;
    setChecking(true);
    try {
      const res = await checkIn({});
      if (!res.alreadyCheckedIn) {
        track(Ev.CHECKIN_COMPLETED, { streak: res.streak, usedFreeze: res.usedFreeze });
      }
    } catch {
      // Reactive query will reflect truth; swallow transient mutation errors.
    } finally {
      setChecking(false);
    }
  }, [checking, alreadyCheckedIn, checkIn]);

  // Loading — query in flight.
  if (state === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-hale-50">
        <ActivityIndicator color="#0f7a5a" />
      </SafeAreaView>
    );
  }
  // Not onboarded → start the quiz (Decision 2: deferred sign-up).
  if (state === null) return <Redirect href="/(onboarding)/welcome" />;

  const cleanMs = now - state.quitStart;
  const t = breakdown(cleanMs);

  // Milestone progress: fraction of the way through the CURRENT health window.
  const milestone = state.nextMilestone;
  const milestoneTargetMs = milestone ? state.quitStart + milestone.hours * MS.hour : null;
  const milestoneRemainingMs = milestoneTargetMs ? milestoneTargetMs - now : 0;
  const milestoneProgress = milestone
    ? Math.min(1, Math.max(0, cleanMs / (milestone.hours * MS.hour)))
    : 1;

  const streak = state.currentStreak;
  const landmark = nextLandmark(streak);
  const landmarkProgress = landmark ? Math.min(1, streak / landmark) : 1;

  return (
    <SafeAreaView className="flex-1 bg-hale-50" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-5 pb-12 pt-2"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-medium text-hale-600">Nicotine-free</Text>
            <Text className="text-2xl font-bold text-hale-900">Today</Text>
          </View>
          {state.premium ? (
            <View className="rounded-full bg-hale-500/10 px-3 py-1">
              <Text className="text-xs font-semibold text-hale-600">HALE+</Text>
            </View>
          ) : null}
        </View>

        {/* HERO — live clean-time counter inside a progress ring */}
        <View className="mb-5 items-center rounded-3xl bg-hale-900 px-6 py-8">
          <ProgressRing progress={milestoneProgress} size={224} stroke={10}>
            <Text className="text-xs font-semibold uppercase tracking-widest text-hale-100/70">
              Clean for
            </Text>
            <View className="mt-2 flex-row items-end">
              <CounterUnit value={t.days} label="d" big />
              <CounterUnit value={t.hours} label="h" />
              <CounterUnit value={t.minutes} label="m" />
              <CounterUnit value={t.seconds} label="s" />
            </View>
          </ProgressRing>

          {/* Next health milestone strip */}
          {milestone ? (
            <View className="mt-7 w-full">
              <View className="flex-row items-center justify-between">
                <Text
                  className="mr-3 flex-1 text-sm font-medium text-hale-100/90"
                  numberOfLines={2}
                >
                  Next: {milestone.label}
                </Text>
                <Text className="text-sm font-bold text-white">
                  {countdownLabel(milestoneRemainingMs)}
                </Text>
              </View>
              <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <View
                  className="h-full rounded-full bg-hale-400"
                  style={{ width: `${Math.round(milestoneProgress * 100)}%` }}
                />
              </View>
            </View>
          ) : (
            <Text className="mt-7 text-center text-sm font-medium text-hale-100/90">
              Every milestone reached. Your body has come a long way.
            </Text>
          )}
        </View>

        {/* Stat cards — money saved + streak */}
        <View className="mb-5 flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-xs font-medium uppercase tracking-wide text-hale-900/40">
              Money saved
            </Text>
            <Text className="mt-1 text-2xl font-bold text-hale-600">
              {money(state.currentMoneySaved)}
            </Text>
            <Text className="mt-1 text-xs text-hale-900/40">
              {money(state.lifetimeMoneySaved)} lifetime
            </Text>
          </View>

          <View className="flex-1 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="text-xs font-medium uppercase tracking-wide text-hale-900/40">
              Streak
            </Text>
            <View className="mt-1 flex-row items-baseline">
              <Text className="text-2xl font-bold text-hale-900">{streak}</Text>
              <Text className="ml-1 text-sm font-medium text-hale-900/50">
                day{streak === 1 ? '' : 's'}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-hale-900/40">
              {landmark
                ? `${landmark - streak} to your ${landmark}-day mark`
                : `Best yet — ${state.longestStreak} days`}
            </Text>
            {landmark ? (
              <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hale-100">
                <View
                  className="h-full rounded-full bg-hale-500"
                  style={{ width: `${Math.round(landmarkProgress * 100)}%` }}
                />
              </View>
            ) : null}
          </View>
        </View>

        {/* Primary CTA — one-tap daily check-in */}
        <Pressable
          onPress={onCheckIn}
          disabled={alreadyCheckedIn || checking}
          className={`mb-3 flex-row items-center justify-center rounded-2xl px-6 py-4 ${
            alreadyCheckedIn ? 'bg-hale-100' : 'bg-hale-500 active:bg-hale-600'
          }`}
        >
          {checking ? (
            <ActivityIndicator color={alreadyCheckedIn ? '#0c624a' : '#ffffff'} />
          ) : (
            <Text
              className={`text-base font-bold ${
                alreadyCheckedIn ? 'text-hale-600' : 'text-white'
              }`}
            >
              {alreadyCheckedIn ? '✓ Checked in — clean today' : 'Check in — clean today'}
            </Text>
          )}
        </Pressable>
        {state.freezesRemaining > 0 ? (
          <Text className="mb-4 text-center text-xs text-hale-900/40">
            {state.freezesRemaining} streak freeze{state.freezesRemaining === 1 ? '' : 's'} in reserve
          </Text>
        ) : (
          <View className="mb-4" />
        )}

        {/* SOS — large red craving button */}
        <Pressable
          onPress={() => {
            track(Ev.CRAVING_SOS_OPENED);
            router.push('/sos');
          }}
          className="mb-5 items-center rounded-2xl bg-sos px-6 py-5 active:opacity-90"
          style={{ shadowColor: '#c0392b', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
        >
          <Text className="text-lg font-extrabold uppercase tracking-wide text-white">
            Craving?
          </Text>
          <Text className="mt-0.5 text-xs font-medium text-white/85">
            Tap for help — it passes in minutes
          </Text>
        </Pressable>

        {/* Buddy status row */}
        <BuddyRow data={buddy} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** One d/h/m/s unit in the hero counter. */
function CounterUnit({ value, label, big }: { value: number; label: string; big?: boolean }) {
  return (
    <View className="mx-1 items-center">
      <Text className={`font-bold text-white ${big ? 'text-5xl' : 'text-4xl'}`}>
        {big ? value : pad(value)}
      </Text>
      <Text className="text-xs font-medium text-hale-100/60">{label}</Text>
    </View>
  );
}

/**
 * Dependency-free progress ring. We render a full track circle, then a centered
 * content area. Without react-native-svg we approximate the "filled arc" with a
 * conic-style two-tone border via stacked rotated half-rings — but to stay
 * robust across iOS/Android we use a clean track ring + an accent cap whose
 * angle reflects progress. Content (the live counter) sits centered on top.
 */
function ProgressRing({
  progress,
  size,
  stroke,
  children,
}: {
  progress: number;
  size: number;
  stroke: number;
  children: React.ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      {/* Track */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: 'rgba(255,255,255,0.12)',
        }}
      />
      {/* Progress arc (left + right halves rotate to sweep the accent color) */}
      <RingHalf side="right" size={size} stroke={stroke} progress={clamped} />
      <RingHalf side="left" size={size} stroke={stroke} progress={clamped} />
      <View className="items-center justify-center">{children}</View>
    </View>
  );
}

/**
 * Half-circle clipping technique: each half exposes 180° of sweep. The right
 * half covers 0–50% progress, the left half covers 50–100%. A colored "fill"
 * View is rotated within a half-width clip to reveal the arc segment.
 */
function RingHalf({
  side,
  size,
  stroke,
  progress,
}: {
  side: 'left' | 'right';
  size: number;
  stroke: number;
  progress: number;
}) {
  const half = size / 2;
  const isRight = side === 'right';
  // Each half is responsible for 50% of the sweep.
  const localProgress = isRight
    ? Math.min(0.5, progress) / 0.5 // 0..1 across the right half
    : Math.max(0, progress - 0.5) / 0.5; // 0..1 across the left half
  const deg = localProgress * 180;
  const rotate = isRight ? deg : 180 + deg;

  return (
    <View
      style={{
        position: 'absolute',
        width: half,
        height: size,
        left: isRight ? half : 0,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          left: isRight ? -half : 0,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: '#39a37c',
          // Reveal only the swept portion of this half.
          transform: [{ rotate: `${rotate}deg` }],
          // Hide the trailing half of the border so the arc has a clean cap.
          borderRightColor: isRight ? '#39a37c' : 'transparent',
          borderTopColor: '#39a37c',
          borderLeftColor: 'transparent',
          borderBottomColor: 'transparent',
          opacity: localProgress > 0 ? 1 : 0,
        }}
      />
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

function BuddyRow({ data }: { data: BuddyData }) {
  // Loading the buddy query shouldn't block the screen — render a quiet skeleton.
  if (data === undefined) {
    return <View className="h-16 rounded-2xl bg-white/60" />;
  }

  const buddy = data?.buddy ?? null;
  if (!buddy) {
    return (
      <Pressable
        onPress={() => router.push('/(tabs)/squad')}
        className="flex-row items-center justify-between rounded-2xl border border-dashed border-hale-400/40 bg-white px-4 py-4 active:opacity-80"
      >
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-hale-900">Quit with a buddy</Text>
          <Text className="mt-0.5 text-xs text-hale-900/50">
            People paired with a buddy are far likelier to stay clean.
          </Text>
        </View>
        <View className="rounded-full bg-hale-500 px-4 py-2">
          <Text className="text-xs font-bold text-white">Invite</Text>
        </View>
      </Pressable>
    );
  }

  const name = buddy.name?.trim() || 'Your buddy';
  return (
    <Pressable
      onPress={() => router.push('/(tabs)/squad')}
      className="flex-row items-center rounded-2xl bg-white px-4 py-4 active:opacity-80"
    >
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-hale-100">
        <Text className="text-base font-bold text-hale-600">
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-hale-900">{name}</Text>
        <Text className="mt-0.5 text-xs text-hale-900/50">
          {buddy.currentStreak > 0
            ? `${buddy.currentStreak}-day streak · cheer them on`
            : 'Tap to check in on each other'}
        </Text>
      </View>
      <Text className="text-lg text-hale-400">›</Text>
    </Pressable>
  );
}
