import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { Check, ChevronRight, Flame, ShieldCheck, Siren } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { localDateOf } from '@convex/model/streak';
import { LANDMARK_DAYS } from '@convex/model/plan';
import { track, Ev } from '@/lib/analytics';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/StatTile';
import { Pill } from '@/components/ui/Pill';
import { RingGauge } from '@/components/ui/RingGauge';
import MilestoneCelebration from '@/components/MilestoneCelebration';
import { colors } from '@/theme/colors';

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
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.volt} />
      </Screen>
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

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerClassName="px-5 pb-14 pt-3"
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

        {/* HERO — live clean-time counter inside the lime RingGauge */}
        <View className="mb-6 items-center">
          <RingGauge progress={milestoneProgress} size={272} stroke={12}>
            <Label className="text-ash">Clean for</Label>
            <Display className="mt-1 text-8xl leading-tight text-chalk">{t.days}</Display>
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
        </View>

        {/* Next health milestone strip */}
        {milestone ? (
          <View className="mb-6 rounded-3xl border border-line bg-coal px-5 py-4">
            <View className="flex-row items-center justify-between">
              <Label>Next milestone</Label>
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
            <View className="mt-3 h-2 w-full overflow-hidden rounded-full bg-void">
              <View
                className="h-full rounded-full bg-volt"
                style={{ width: `${Math.round(milestoneProgress * 100)}%` }}
              />
            </View>
          </View>
        ) : (
          <View className="mb-6 rounded-3xl border border-line bg-coal px-5 py-4">
            <Label className="text-volt">Fully recovered</Label>
            <Body className="mt-1.5 font-body-medium text-[15px] text-chalk">
              Every milestone reached. Your body has come a long way.
            </Body>
          </View>
        )}

        {/* Stat tiles — money saved (lime accent) + lung recovery */}
        <View className="mb-3 flex-row gap-3">
          <StatTile label="Money saved" value={money(state.currentMoneySaved)} accent />
          <StatTile label="Lung recovery" value={`${Math.round(milestoneProgress * 100)}%`} />
        </View>
        <Body className="mb-6 font-body text-xs text-ash">
          {money(state.lifetimeMoneySaved)} kept in your pocket, all-time.
        </Body>

        {/* Primary CTA — one-tap daily check-in */}
        <Button
          label={alreadyCheckedIn ? 'Checked in — clean today' : 'Check in — clean today'}
          variant="primary"
          loading={checking}
          disabled={alreadyCheckedIn}
          onPress={onCheckIn}
          className="mb-3"
        />
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
        <Pressable
          onPress={() => {
            track(Ev.CRAVING_SOS_OPENED);
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
              Tap for help — it passes in minutes
            </Body>
          </View>
          <ChevronRight color="#ffffff" size={22} strokeWidth={2.5} />
        </Pressable>

        {/* Buddy status row */}
        <BuddyRow data={buddy} streak={streak} landmark={landmark} longestStreak={state.longestStreak} />
      </ScrollView>

      {/* Milestone celebration overlay — fires once per landmark day reached. */}
      <MilestoneCelebration
        visible={celebrateDay !== null}
        day={celebrateDay ?? 0}
        moneySaved={state.currentMoneySaved}
        recoveryPct={Math.round(milestoneProgress * 100)}
        onClose={onCelebrationClose}
      />
    </Screen>
  );
}

/** A small dim separator dot between time units in the hero. */
function Dot() {
  return <Display className="mx-2 -translate-y-1 text-2xl text-line">·</Display>;
}

/** One h/m/s unit under the hero day counter. */
function CounterUnit({ value, label }: { value: string; label: string }) {
  return (
    <View className="items-center">
      <Display className="text-3xl text-chalk">{value}</Display>
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
    : `Best yet — ${longestStreak} days clean`;

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
