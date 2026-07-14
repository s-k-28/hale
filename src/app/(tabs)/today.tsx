import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Check, ChevronRight, Flame, ShieldCheck, Siren } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { localDateOf } from '@convex/model/streak';
import { LANDMARK_DAYS, recoveryFraction } from '@convex/model/plan';
import { toast } from 'sonner-native';
import { track, Ev } from '@/lib/analytics';
import { moneySavedLabel } from '@/lib/money';
import { haleScore, haleScoreBand } from '@/lib/haleScore';
import { Screen, Button, Badge, Tile, Eyebrow, H1, H3, Body, Muted, Ring } from '@/ui';
import { RNText } from '@/ui/internal';
import MilestoneCelebration from '@/components/MilestoneCelebration';
import RingBurst from '@/components/RingBurst';
import { RiseIn } from '@/components/motion';
import { clean } from '@/theme/clean';
import { haptics } from '@/lib/haptics';
import { LinearGradient } from 'expo-linear-gradient';
// No reanimated here any more: Today's only motion is now event-driven (the Ring's
// check-in surge + the Skia burst). The idle breathing loop and the once-a-second
// counter bounce were removed — see HeroDays / CounterUnit.

/**
 * Today — the home dashboard (P1/P2), Clean Dark v2.
 * The live clean-time counter inside the emerald Ring is the screen's ONE
 * focal element (green discipline); everything else sits on quiet surfaces.
 * Buddy/nudge surfaces ride the warm lane; the SOS card is the coral lane.
 *
 * Reactive: useQuery(api.users.todayState) is the single source of truth; the
 * only client-derived state is the 1s "now" tick that animates the counter and
 * the milestone countdown. todayState === null → not onboarded → redirect.
 */

const MS = { sec: 1000, min: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

function useNow(intervalMs: number = MS.sec) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Today's tick, for everything that is NOT the live counter.
 *
 * This used to be 1s at the top of Today(), and the old comment above claimed it
 * "re-renders this subtree (not the whole screen)". That was simply false: the
 * hook was called in Today() itself, so ONCE A SECOND the entire screen
 * re-reconciled — header, NudgeInbox (a live Convex subscription), the Ring, the
 * milestone strip, both tiles, the check-in button, the SOS card and BuddyRow —
 * on the JS thread, for as long as the tab was open. That is a permanent 1Hz tax
 * on the most-visited screen in the app, and it lands as a dropped frame if it
 * hits during a scroll or a tap.
 *
 * Nothing up here actually needs second resolution: the milestone countdown
 * renders minutes ("7h 18m"), recovery moves on a log curve, the HALE score is a
 * rounded integer, and the local-date check is per-day. The live H:M:S counter is
 * the one thing that does, and it now owns its own 1s tick in <LiveCounter/>.
 */
const AMBIENT_TICK = 20 * MS.sec;

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

const money = moneySavedLabel;

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

/** Module-level mirror of the last-celebrated landmark: AsyncStorage writes are
 * fire-and-forget, so a remount could hydrate a stale value and re-fire the
 * celebration mid-session (ui-audit D1). Module scope survives remounts. */
let lastCelebratedMemory: number | null = null;

const MS_PER_DAY_CELEBRATION = 86_400_000;

/** AsyncStorage key — the last landmark we've already celebrated, so it fires once. */
const LAST_CELEBRATED_LANDMARK_KEY = 'hale:lastCelebratedLandmark';

export default function Today() {
  // Auth-gated query (white-screen fix, 2026-06-12): an ungated mount can
  // receive the query's first result before auth attaches -> null -> the
  // not-onboarded Redirect fires for an ONBOARDED user mid-navigation and
  // strands an empty tab scene. 'skip' until auth is confirmed, and treat
  // auth-loading as loading (same pattern as goals.tsx / usePremium).
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const state = useQuery(api.users.todayState, isAuthenticated ? {} : 'skip');
  const checkIn = useMutation(api.checkins.checkIn);
  const buddy = useQuery(api.buddies.myBuddy, {});

  const now = useNow(AMBIENT_TICK);
  const [checking, setChecking] = useState(false);
  // Increments on a successful check-in to fire one Ring pop + one Skia
  // RingBurst (the radial particle celebration emanating from the ring).
  const [ringSurge, setRingSurge] = useState(0);
  // RingBurst is a Skia Canvas. It exposes onDone precisely so the caller can
  // unmount it when the ~900ms burst ends — that was never wired, so after a
  // user's FIRST check-in one Canvas sat mounted (idle, but retained) for the
  // rest of the session.
  const [bursting, setBursting] = useState(false);

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
        const stored = Number.isFinite(parsed) ? parsed : null;
        // Whichever is newer wins: storage (cold launch) or the in-session memory.
        lastCelebratedRef.current = Math.max(stored ?? 0, lastCelebratedMemory ?? 0) || null;
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
    lastCelebratedMemory = day;
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
    // Press-in beat is owned by the check-in Button (primary → press); not here.
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
        // Reward beat: success haptic + particle burst from the ring.
        haptics.success();
        setRingSurge((n) => n + 1);
        setBursting(true);
        // No success toast here: the burst + the inline "Locked in for today"
        // confirmation already say it. (Error path keeps its toast — see catch.)
      }
    } catch {
      // Surface what was a silent failure — a failed tap shouldn't be a dead end.
      toast.error("Couldn't check in. Please try again");
    } finally {
      setChecking(false);
    }
  }, [checking, alreadyCheckedIn, checkIn]);

  // Loading — query in flight.
  if (authLoading || (isAuthenticated && state === undefined)) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={clean.accent} />
      </Screen>
    );
  }
  // Signed out or not onboarded → start the quiz (Decision 2: deferred sign-up).
  if (!isAuthenticated || state === null || state === undefined) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

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
  // Overall recovery, 0..1 — the honest log-time curve (convex/model/plan.ts), NOT
  // "milestones reached / total". Analytics shows the milestone COUNT (5 of 10);
  // this is the smooth curve. Two different numbers on purpose, labelled apart.
  const recovery = recoveryFraction(state.quitStart, now);
  const recoveryPct = Math.round(recovery * 100);

  // THE HALE SCORE — the one metric HALE owns (see lib/haleScore). It dents on a
  // relapse but never zeroes, which is the answer to the delete-the-app cliff.
  const score = haleScore({
    recoveryFraction: recovery,
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    lifetimeMoneySaved: state.lifetimeMoneySaved,
  });
  const band = haleScoreBand(score);

  // One line of "so what" under the number (the FA/Origin dashboard pattern):
  // never just a stat, always the next thing worth knowing. Rule-based, ordered
  // by signal strength so the most useful line wins.
  const hoursToMilestone = milestone ? Math.ceil(milestoneRemainingMs / MS.hour) : null;
  const insight = freshStart
    ? 'Day one is the whole game. Your score climbs from here.'
    : milestone && hoursToMilestone !== null && hoursToMilestone <= 24
      ? `You are ${hoursToMilestone}h from ${milestone.label.toLowerCase()}.`
      : landmark && landmark - streak === 1
        ? `One more day and you hit ${landmark} days.`
        : `${band}. Every clean day pushes this higher.`;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerClassName="px-5 pb-24 pt-3"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — quiet eyebrow + mixed-case title; inline HALE+ badge */}
        <View className="mb-7 flex-row items-end justify-between">
          <View>
            <Eyebrow>Nicotine-free</Eyebrow>
            <H1 className="mt-1">Today</H1>
          </View>
          {state.premium ? <Badge label="HALE+" tone="soft" /> : null}
        </View>

        {/* Friend-sourced nudge inbox (S2) — a buddy moment, so the warm lane. */}
        <NudgeInbox />

        {/* HERO — live clean-time counter inside the emerald Ring: the screen's
            ONE green focal element. */}
        <View className="mb-4 items-center">
          <View className="relative items-center justify-center">
            {/* The ring tracks the HALE SCORE, not milestone progress. Milestone
                progress visibly resets backward every time a milestone passes,
                so the user loses ground for making progress. The score only
                climbs. Milestone progress still has its own bar in the strip below. */}
            <Ring progress={score / 100} size={272} stroke={10} surge={ringSurge}>
              <LiveCounter quitStart={state.quitStart} />
            </Ring>
            {/* Skia radial particle burst on check-in, centered on the ring.
                Keyed on the surge counter so each check-in remounts + re-fires it. */}
            {bursting ? (
              <RingBurst key={ringSurge} onDone={() => setBursting(false)} />
            ) : null}
          </View>
        </View>

        {/* THE HALE SCORE + its "so what" line. The number is the identity ("my
            score is 62"); the line is what to do about it. */}
        <View className="mb-7 items-center">
          <View className="flex-row items-baseline" style={{ gap: 6 }}>
            <RNText className="font-sora-extrabold text-[26px] tracking-[-0.5px] text-fg">
              {score}
            </RNText>
            <Muted className="text-[12px] tracking-[0.4px]">/ 100 HALE SCORE</Muted>
          </View>
          <Body className="mt-1.5 px-6 text-center text-[13px] leading-[18px] text-fg-2">
            {insight}
          </Body>
        </View>

        {/* Next health milestone strip — quiet surface, fg countdown */}
        <RiseIn index={1}>
        {milestone ? (
          <View className="mb-3 rounded-panel border border-stroke bg-surface px-5 py-4">
            <View className="flex-row items-center justify-between">
              <Eyebrow>{freshStart ? 'First milestone' : 'Next milestone'}</Eyebrow>
              <RNText className="font-sora-bold text-[22px] tracking-[-0.44px] text-fg">
                {countdownLabel(milestoneRemainingMs)}
              </RNText>
            </View>
            <Body className="mt-1.5 font-sora-medium text-fg" numberOfLines={2}>
              {milestone.label}
            </Body>
            {freshStart ? (
              <Muted className="mt-1 text-[13px]">
                You've already started, your body is responding right now.
              </Muted>
            ) : null}
            <View className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-track">
              <View
                className="h-full rounded-pill bg-accent"
                style={{
                  width: `${Math.round(Math.max(milestoneProgress, freshStart ? 0.08 : 0) * 100)}%`,
                }}
              />
            </View>
          </View>
        ) : (
          <View className="mb-3 rounded-panel border border-stroke bg-surface px-5 py-4">
            <Eyebrow>Fully recovered</Eyebrow>
            <Body className="mt-1.5 font-sora-medium text-fg">
              Every milestone reached. Your body has come a long way.
            </Body>
          </View>
        )}
        </RiseIn>

        {/* Stat tiles — money saved + recovery */}
        <RiseIn index={2}>
        <View className="mb-3 flex-row gap-3">
          <Tile k="Money saved" v={money(state.currentMoneySaved)} className="flex-1" />
          {/* Soften the bare "0%" on day 0, frame it as the start, not a void. */}
          <Tile k="Typical recovery" v={recoveryPct === 0 ? 'Day 1' : `${recoveryPct}%`} className="flex-1" />
        </View>
        </RiseIn>
        {/* Lifetime line only when it ADDS info, i.e. there's history beyond this
            run (post-relapse). On a first run current == lifetime, so showing it
            just echoes the Money saved tile. */}
        {state.lifetimeMoneySaved > state.currentMoneySaved ? (
          <Muted className="mb-7 text-xs">
            {money(state.lifetimeMoneySaved)} kept in your pocket, all-time.
          </Muted>
        ) : (
          <View className="mb-7" />
        )}

        {/* Primary CTA — one-tap daily check-in (the screen's one green action). */}
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
            <Check color={clean.accent} size={14} strokeWidth={3} />
            <Body className="font-sora-semibold text-xs text-accent">Locked in for today</Body>
          </View>
        ) : null}
        {state.freezesRemaining > 0 ? (
          <View className="mb-5 flex-row items-center justify-center gap-1.5">
            <ShieldCheck color={clean.fg3} size={14} strokeWidth={2.2} />
            <Muted className="text-xs">
              {state.freezesRemaining} streak freeze
              {state.freezesRemaining === 1 ? '' : 's'} in reserve
            </Muted>
          </View>
        ) : (
          <View className="mb-5" />
        )}

        {/* SOS — the coral lane (danger only) */}
        <RiseIn index={3}>
        <Pressable
          onPress={() => {
            // The grounding "I've got you" thump — heavy, for the app's most
            // emotionally critical entry. (craving_sos_opened fires once, on the
            // SOS screen mount, to avoid a double-count.)
            haptics.heavy();
            router.push('/sos');
          }}
          className="mb-6 flex-row items-center gap-4 rounded-tile bg-coral px-6 py-5 active:opacity-90"
          style={{
            shadowColor: clean.coral,
            shadowOpacity: 0.3,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <Siren color={clean.coralInk} size={26} strokeWidth={2.2} />
          <View className="flex-1">
            <RNText className="font-sora-bold text-[18px] text-coral-ink">Craving SOS</RNText>
            <RNText className="mt-0.5 font-sora-medium text-xs text-coral-ink opacity-80">
              Tap for help, it passes in minutes
            </RNText>
          </View>
          <ChevronRight color={clean.coralInk} size={22} strokeWidth={2.2} />
        </Pressable>
        </RiseIn>

        {/* Buddy status row — the warm lane */}
        <RiseIn index={4}>
        <BuddyRow data={buddy} streak={streak} landmark={landmark} longestStreak={state.longestStreak} />
        </RiseIn>
      </ScrollView>

      {/* Bottom scrim — fades scrolling content into the base before the tab bar so
          the coral SOS card never peeks as a sliver behind it (layering fix). */}
      <LinearGradient
        colors={['transparent', clean.bg, clean.bg]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, pointerEvents: 'none' }}
      />

      {/* Milestone celebration overlay — fires once per landmark day reached. */}
      <MilestoneCelebration
        visible={celebrateDay !== null}
        day={celebrateDay ?? 0}
        // Money AT the landmark, not live money: a late-fired celebration
        // (e.g. storage wiped) otherwise shows "3 days" beside 7 days of
        // savings on one card (ui-audit D2). Same daily rate, scaled.
        moneySaved={
          now > state.quitStart
            ? state.currentMoneySaved * Math.min(1, ((celebrateDay ?? 0) * MS_PER_DAY_CELEBRATION) / (now - state.quitStart))
            : 0
        }
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
    // Light tap on this custom row (not a UI primitive, so it fires its own).
    haptics.tap();
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
      className="mb-5 rounded-tile border border-warm-edge bg-warm-soft px-5 py-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-2">
        <Flame color={clean.warm} size={18} strokeWidth={2.2} />
        <Body className="flex-1 font-sora-bold text-fg">{n.title}</Body>
      </View>
      <Body className="mt-1 text-sm leading-5">{n.body}</Body>
      <RNText className="mt-2 font-sora-medium text-xs text-warm">Tap to dismiss</RNText>
    </Pressable>
  );
}

/**
 * The hero day count — breathes subtly (a slow ~4s scale cycle) so the live
 * counter reads as alive, not frozen. Scale-only (centered) → no layout shift.
 * Sized to the design's "numerals breathe" rule (66pt, not the banned 100+).
 */
/**
 * The hero day count. Deliberately STILL.
 *
 * This used to run an infinite withRepeat breathing scale (1 → 1.018 → 1, forever).
 * A hero number that never stops moving is not "alive", it is restless: there is no
 * event behind the motion, so the eye keeps being pulled back to a number that has
 * not changed. The Ring already carries the screen's ambient life, and the check-in
 * burst carries the celebration. The number itself should hold still.
 *
 * tabular-nums so 111 and 999 measure the same and the count never jitters.
 */
/**
 * The ONLY thing on Today that needs a 1-second tick, isolated into its own
 * memo'd leaf so the clock re-renders four <Text> nodes instead of the entire
 * screen. See the AMBIENT_TICK note at the top of this file for what this fixed.
 *
 * memo + a primitive `quitStart` prop is what makes the isolation real: the
 * parent's 20s tick produces a new render, but this subtree bails out unless the
 * quit actually restarted.
 */
const LiveCounter = memo(function LiveCounter({ quitStart }: { quitStart: number }) {
  const now = useNow(MS.sec);
  const t = breakdown(now - quitStart);
  return (
    <>
      <Eyebrow className="text-[10.5px] tracking-[1.9px]">Clean for</Eyebrow>
      <HeroDays days={t.days} />
      <Eyebrow className="text-accent text-[11.5px] tracking-[2.3px]">
        {t.days === 1 ? 'Day' : 'Days'}
      </Eyebrow>
      <View className="mt-3.5 flex-row items-end" style={{ gap: 16 }}>
        <CounterUnit value={pad(t.hours)} label="H" />
        <CounterUnit value={pad(t.minutes)} label="M" />
        <CounterUnit value={pad(t.seconds)} label="S" />
      </View>
    </>
  );
});

function HeroDays({ days }: { days: number }) {
  return (
    <View className="mt-1">
      <RNText
        className="font-sora-bold tabular-nums text-fg"
        style={{
          fontSize: String(days).length > 2 ? 56 : 66,
          lineHeight: String(days).length > 2 ? 60 : 70,
          letterSpacing: -1.3,
        }}
      >
        {days}
      </RNText>
    </View>
  );
}

/**
 * One h/m/s unit under the hero day counter. Deliberately STILL.
 *
 * This used to spring translateY 6px + fade on EVERY value change. The seconds unit
 * changes once a second, so that meant the number physically bounced once a second,
 * forever — a permanent twitch masquerading as "feeling live". The digit changing IS
 * the liveness; it needs no help.
 *
 * tabular-nums + a fixed width so the digits never re-measure and the h/m/s row
 * cannot shuffle sideways as the clock ticks.
 */
function CounterUnit({ value, label }: { value: string; label: string }) {
  return (
    <View className="items-center" style={{ width: 30 }}>
      <RNText className="font-sora-semibold tabular-nums text-[16px] text-fg-2">{value}</RNText>
      <RNText className="mt-0.5 font-sora-semibold text-[9px] tracking-[0.9px] text-fg-4">
        {label}
      </RNText>
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
    return <View className="h-[72px] rounded-tile border border-stroke bg-surface" />;
  }

  const buddy = data?.buddy ?? null;

  // Streak framing line — your own progress, shown alongside the buddy row.
  // Dedupes the awkward "0 day streak" + "1 day to your 1-day mark" repetition:
  // a day-0 user gets a clean starting line; otherwise we lead with the streak and
  // append the next landmark (skipping the redundant "X-day to your X-day mark").
  let streakLine: string;
  if (streak === 0) {
    streakLine = 'Your streak starts at your first check-in';
  } else if (landmark) {
    const remaining = landmark - streak;
    streakLine = `${streak}-day streak · ${remaining} day${remaining === 1 ? '' : 's'} from your ${landmark}-day mark`;
  } else {
    streakLine = `${streak}-day streak · best yet, ${longestStreak} days clean`;
  }

  if (!buddy) {
    return (
      <View>
        <View className="mb-3 flex-row items-center gap-2">
          <Flame color={clean.fg3} size={16} strokeWidth={2.2} />
          <Eyebrow>{streakLine}</Eyebrow>
        </View>
        <Pressable
          onPress={() => {
            // Custom row → fire its own light tap.
            haptics.tap();
            router.push('/(tabs)/squad');
          }}
          className="flex-row items-center justify-between rounded-tile border border-dashed border-warm-edge bg-surface px-5 py-4 active:opacity-80"
        >
          <View className="flex-1 pr-3">
            <H3 className="text-[16px]">Quit with a buddy</H3>
            <Muted className="mt-1 text-xs">
              People paired with a buddy are far likelier to stay clean.
            </Muted>
          </View>
          <View className="rounded-pill bg-warm px-4 py-2">
            <RNText className="font-sora-bold text-xs text-warm-ink">Invite</RNText>
          </View>
        </Pressable>
      </View>
    );
  }

  const name = buddy.name?.trim() || 'Your buddy';
  return (
    <View>
      <View className="mb-3 flex-row items-center gap-2">
        <Flame color={clean.fg3} size={16} strokeWidth={2.2} />
        <Eyebrow>{streakLine}</Eyebrow>
      </View>
      <Pressable
        onPress={() => {
          // Custom row → fire its own light tap.
          haptics.tap();
          router.push('/(tabs)/squad');
        }}
        className="flex-row items-center rounded-tile border border-stroke bg-surface px-4 py-4 active:opacity-80"
      >
        <View className="mr-3 h-11 w-11 items-center justify-center rounded-pill bg-warm">
          <RNText className="font-sora-bold text-[16px] text-warm-ink">
            {name.charAt(0).toUpperCase()}
          </RNText>
        </View>
        <View className="flex-1">
          <H3 className="text-[16px]">{name}</H3>
          <Muted className="mt-0.5 text-xs">
            {buddy.currentStreak > 0
              ? `${buddy.currentStreak}-day streak · cheer them on`
              : 'Tap to check in on each other'}
          </Muted>
        </View>
        <ChevronRight color={clean.fg3} size={20} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
