import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';

/**
 * Craving SOS — I1 (ride-it-out / breathe / talk to Sage / ping buddy) + I4
 * (non-shaming relapse recovery). Full-screen modal on the sos #c0392b surface.
 *
 * Decision 3 (anti-shame) lives in the "I slipped" flow: we ask lapse vs relapse,
 * and on a true relapse the recovery screen surfaces LIFETIME saved + best streak
 * (returned by api.relapse.logRelapse) — NEVER a zero — plus a Sage reflection.
 *
 * This screen is supportive, not medical advice (disclaimed in the footer).
 */

const SOS = '#c0392b';
const RIDE_SECONDS = 5 * 60; // "it peaks then fades" — 5 minutes to ride it out

type View_ =
  | { kind: 'home' }
  | { kind: 'ride' }
  | { kind: 'breathe' }
  | { kind: 'slip-choose' } // lapse vs relapse
  | { kind: 'recover'; lifetimeMoneySaved: number; bestStreak: number }; // post-relapse, kind screen

function fmtClock(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtUsd(n: number) {
  return `$${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function CravingSos() {
  const logCraving = useMutation(api.cravings.logCraving);
  const logRelapse = useMutation(api.relapse.logRelapse);

  const [view, setView] = useState<View_>({ kind: 'home' });
  // best-effort intensity estimate for the craving log (the SOS surface itself
  // implies a strong urge; default high, the recovery screens never block on it).
  const intensityRef = useRef(4);

  // Fire SOS-opened once on mount.
  useEffect(() => {
    track(Ev.CRAVING_SOS_OPENED);
  }, []);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  }, []);

  /** Resolve the craving WITHOUT slipping → log survived + fire analytics, then close. */
  const resolveSurvived = useCallback(
    async (resolvedBy: 'timer' | 'breathing' | 'sage' | 'buddy') => {
      try {
        await logCraving({ intensity: intensityRef.current, outcome: 'survived', resolvedBy });
        track(Ev.CRAVING_LOGGED, { outcome: 'survived', resolvedBy });
        track(Ev.CRAVING_SURVIVED, { resolvedBy });
      } catch {
        // Logging is best-effort; never trap the user in the SOS modal on a write error.
      }
    },
    [logCraving],
  );

  if (view.kind === 'ride') {
    return (
      <RideItOut
        onSurvived={async () => {
          await resolveSurvived('timer');
          close();
        }}
        onBack={() => setView({ kind: 'home' })}
        onSlip={() => setView({ kind: 'slip-choose' })}
      />
    );
  }

  if (view.kind === 'breathe') {
    return (
      <BoxBreathing
        onSurvived={async () => {
          await resolveSurvived('breathing');
          close();
        }}
        onBack={() => setView({ kind: 'home' })}
        onSlip={() => setView({ kind: 'slip-choose' })}
      />
    );
  }

  if (view.kind === 'slip-choose') {
    return (
      <SlipChoose
        onCancel={() => setView({ kind: 'home' })}
        onLapse={async () => {
          // 'lapse' preserves the streak (bounded grace) — still log a craving with
          // a 'lapsed' outcome for trigger intelligence, then return to a kind home.
          try {
            await logRelapse({ kind: 'lapse' });
            track(Ev.RELAPSE_LOGGED, { kind: 'lapse' });
            await logCraving({ intensity: intensityRef.current, outcome: 'lapsed' });
            track(Ev.CRAVING_LOGGED, { outcome: 'lapsed' });
          } catch {
            /* best-effort */
          }
          close();
        }}
        onRelapse={async () => {
          try {
            const res = await logRelapse({ kind: 'relapse' });
            track(Ev.RELAPSE_LOGGED, { kind: 'relapse' });
            await logCraving({ intensity: intensityRef.current, outcome: 'relapsed' });
            track(Ev.CRAVING_LOGGED, { outcome: 'relapsed' });
            setView({
              kind: 'recover',
              lifetimeMoneySaved: res?.lifetimeMoneySaved ?? 0,
              bestStreak: res?.bestStreak ?? 0,
            });
          } catch {
            // If the write fails we still show a kind screen rather than a raw error.
            setView({ kind: 'recover', lifetimeMoneySaved: 0, bestStreak: 0 });
          }
        }}
      />
    );
  }

  if (view.kind === 'recover') {
    return (
      <RecoverKindly
        lifetimeMoneySaved={view.lifetimeMoneySaved}
        bestStreak={view.bestStreak}
        onTalkToSage={() => {
          close();
          router.push('/(tabs)/coach');
        }}
        onDone={close}
      />
    );
  }

  // HOME — the calm menu of options.
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: SOS }}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between pt-2">
          <Text className="text-sm font-semibold uppercase tracking-widest text-white/70">
            Craving SOS
          </Text>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
          >
            <Text className="text-lg leading-none text-white">×</Text>
          </Pressable>
        </View>

        <View className="mt-8">
          <Text className="text-3xl font-extrabold leading-tight text-white">
            You're not in danger.{'\n'}This will pass.
          </Text>
          <Text className="mt-3 text-base leading-relaxed text-white/80">
            A craving peaks in a few minutes, then fades — whether or not you act on it. Let's get
            you to the other side. Pick one:
          </Text>
        </View>

        <View className="mt-8">
          <PrimaryOption
            title="Ride it out"
            subtitle="A 5-minute timer. It peaks, then fades."
            onPress={() => setView({ kind: 'ride' })}
          />
          <Option
            title="Breathe"
            subtitle="Box breathing — follow the circle, slow it all down."
            onPress={() => setView({ kind: 'breathe' })}
          />
          <Option
            title="Talk to Sage"
            subtitle="Your coach is here, right now, no judgment."
            onPress={() => {
              // Opening the coach counts as resolving via Sage.
              void resolveSurvived('sage');
              close();
              router.push('/(tabs)/coach');
            }}
          />
          <Option
            title="Ping my buddy"
            subtitle="Send a quiet rally. (Coming soon)"
            disabled
            onPress={() => {}}
          />
        </View>

        <Pressable
          onPress={() => setView({ kind: 'slip-choose' })}
          accessibilityRole="button"
          className="mt-8 items-center rounded-2xl border border-white/30 py-4 active:opacity-70"
        >
          <Text className="text-base font-semibold text-white">I slipped</Text>
          <Text className="mt-0.5 text-xs text-white/60">It's okay. Let's keep going.</Text>
        </Pressable>

        <Text className="mt-8 text-center text-xs leading-relaxed text-white/55">
          HALE is supportive, not medical advice. If you're in crisis or thinking about harming
          yourself, please contact your local emergency services.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Home option rows                                                    */
/* ------------------------------------------------------------------ */

function PrimaryOption({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="mb-3 rounded-2xl bg-white px-5 py-5 active:opacity-80"
    >
      <Text className="text-lg font-bold" style={{ color: SOS }}>
        {title}
      </Text>
      <Text className="mt-1 text-sm text-hale-900/60">{subtitle}</Text>
    </Pressable>
  );
}

function Option({
  title,
  subtitle,
  onPress,
  disabled,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      className={`mb-3 rounded-2xl bg-white/12 px-5 py-5 ${disabled ? 'opacity-50' : 'active:opacity-80'}`}
    >
      <Text className="text-lg font-bold text-white">{title}</Text>
      <Text className="mt-1 text-sm text-white/70">{subtitle}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* (a) Ride it out — 5-minute countdown                                */
/* ------------------------------------------------------------------ */

function RideItOut({
  onSurvived,
  onBack,
  onSlip,
}: {
  onSurvived: () => void;
  onBack: () => void;
  onSlip: () => void;
}) {
  const [remaining, setRemaining] = useState(RIDE_SECONDS);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (remaining <= 0) {
      setDone(true);
      return;
    }
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const progress = 1 - remaining / RIDE_SECONDS;
  const reassurance = useMemo(() => {
    if (done) return "You rode it out. The urge passed — and you're still here.";
    if (progress < 0.25) return 'This is the peak. It feels loud, but it always crests.';
    if (progress < 0.6) return "It's already fading. Stay with the breath.";
    return "Almost through. You're proving you don't need it.";
  }, [progress, done]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: SOS }}>
      <View className="flex-1 px-6 pb-10">
        <Header title="Ride it out" onBack={onBack} />

        <View className="flex-1 items-center justify-center">
          <Text className="text-7xl font-extrabold tabular-nums text-white">
            {fmtClock(remaining)}
          </Text>
          <View className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-white/20">
            <View
              className="h-full rounded-full bg-white"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
          <Text className="mt-8 px-4 text-center text-lg leading-relaxed text-white/85">
            {reassurance}
          </Text>
        </View>

        {done ? (
          <Pressable
            onPress={onSurvived}
            accessibilityRole="button"
            className="items-center rounded-2xl bg-white py-4 active:opacity-80"
          >
            <Text className="text-base font-bold" style={{ color: SOS }}>
              I made it through
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onSurvived}
            accessibilityRole="button"
            className="items-center rounded-2xl bg-white/15 py-4 active:opacity-70"
          >
            <Text className="text-base font-semibold text-white">The craving passed — I'm good</Text>
          </Pressable>
        )}

        <Pressable onPress={onSlip} accessibilityRole="button" className="mt-3 items-center py-2">
          <Text className="text-sm text-white/60">I slipped</Text>
        </Pressable>

        <Disclaimer />
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* (b) Breathe — box breathing with an expanding circle                */
/* ------------------------------------------------------------------ */

const PHASES = [
  { label: 'Breathe in', ms: 4000 },
  { label: 'Hold', ms: 4000 },
  { label: 'Breathe out', ms: 4000 },
  { label: 'Hold', ms: 4000 },
] as const;
const CYCLE_MS = PHASES.reduce((s, p) => s + p.ms, 0);

function BoxBreathing({
  onSurvived,
  onBack,
  onSlip,
}: {
  onSurvived: () => void;
  onBack: () => void;
  onSlip: () => void;
}) {
  const [phase, setPhase] = useState(0);
  // scale drives the circle: small on inhale-start → big at hold → small after exhale.
  const scale = useSharedValue(0.55);

  useEffect(() => {
    // One continuous box-breathing loop: in (grow) → hold → out (shrink) → hold.
    scale.value = 0.55;
    scale.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(scale);
  }, [scale]);

  // Drive the phase label off a single JS interval. PHASES are equal-length, so
  // one tick per quarter-cycle keeps the label in step with the circle pulse.
  useEffect(() => {
    setPhase(0);
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % PHASES.length;
      setPhase(i);
    }, CYCLE_MS / PHASES.length);
    return () => clearInterval(interval);
  }, []);

  // Map a sawtooth scale (0.55→1 over a full cycle) into a true grow/hold/shrink/hold
  // visual by reshaping it per quarter — gives the box-breathing pulse.
  const circleStyle = useAnimatedStyle(() => {
    const q = (scale.value - 0.55) / (1 - 0.55); // 0..1 over the cycle
    // quarters: 0-.25 inhale (grow), .25-.5 hold (big), .5-.75 exhale (shrink), .75-1 hold (small)
    let s: number;
    if (q < 0.25) s = interpolate(q, [0, 0.25], [0.55, 1]);
    else if (q < 0.5) s = 1;
    else if (q < 0.75) s = interpolate(q, [0.5, 0.75], [1, 0.55]);
    else s = 0.55;
    return { transform: [{ scale: s }] };
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: SOS }}>
      <View className="flex-1 px-6 pb-10">
        <Header title="Breathe" onBack={onBack} />

        <View className="flex-1 items-center justify-center">
          <View className="h-64 w-64 items-center justify-center">
            <Animated.View
              className="absolute h-64 w-64 rounded-full bg-white/15"
              style={circleStyle}
            />
            <View className="h-28 w-28 items-center justify-center rounded-full bg-white/25">
              <Text className="text-center text-lg font-bold text-white">{PHASES[phase].label}</Text>
            </View>
          </View>
          <Text className="mt-10 px-6 text-center text-base leading-relaxed text-white/80">
            In for four, hold for four, out for four, hold for four. Let your shoulders drop.
          </Text>
        </View>

        <Pressable
          onPress={onSurvived}
          accessibilityRole="button"
          className="items-center rounded-2xl bg-white py-4 active:opacity-80"
        >
          <Text className="text-base font-bold" style={{ color: SOS }}>
            I feel steadier — I'm good
          </Text>
        </Pressable>

        <Pressable onPress={onSlip} accessibilityRole="button" className="mt-3 items-center py-2">
          <Text className="text-sm text-white/60">I slipped</Text>
        </Pressable>

        <Disclaimer />
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* (e) "I slipped" — lapse vs relapse (Decision 3)                     */
/* ------------------------------------------------------------------ */

function SlipChoose({
  onCancel,
  onLapse,
  onRelapse,
}: {
  onCancel: () => void;
  onLapse: () => void;
  onRelapse: () => void;
}) {
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: SOS }}>
      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <Header title="No shame here" onBack={onCancel} />

        <Text className="mt-2 text-2xl font-extrabold leading-tight text-white">
          Slips are part of quitting — not the end of it.
        </Text>
        <Text className="mt-3 text-base leading-relaxed text-white/80">
          Be honest with yourself; it's the only way the data helps you. Which one fits?
        </Text>

        <Pressable
          onPress={onLapse}
          accessibilityRole="button"
          className="mt-8 rounded-2xl bg-white px-5 py-5 active:opacity-80"
        >
          <Text className="text-lg font-bold" style={{ color: SOS }}>
            Just a slip
          </Text>
          <Text className="mt-1 text-sm text-hale-900/60">
            One moment, and I'm back on track. Your streak is protected.
          </Text>
        </Pressable>

        <Pressable
          onPress={onRelapse}
          accessibilityRole="button"
          className="mt-3 rounded-2xl bg-white/12 px-5 py-5 active:opacity-80"
        >
          <Text className="text-lg font-bold text-white">I'm back on it for now</Text>
          <Text className="mt-1 text-sm text-white/70">
            We'll start a fresh run — and keep everything you've already earned.
          </Text>
        </Pressable>

        <Pressable onPress={onCancel} accessibilityRole="button" className="mt-6 items-center py-2">
          <Text className="text-sm text-white/70">Actually, I'm okay — go back</Text>
        </Pressable>

        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* (I4) Kind recovery screen — surfaces lifetime, never a zero         */
/* ------------------------------------------------------------------ */

function RecoverKindly({
  lifetimeMoneySaved,
  bestStreak,
  onTalkToSage,
  onDone,
}: {
  lifetimeMoneySaved: number;
  bestStreak: number;
  onTalkToSage: () => void;
  onDone: () => void;
}) {
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: SOS }}>
      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <View className="pt-10">
          <Text className="text-3xl font-extrabold leading-tight text-white">
            This isn't a reset.{'\n'}It's a fresh run.
          </Text>
          <Text className="mt-3 text-base leading-relaxed text-white/85">
            Quitting nicotine almost never happens in one clean line. What you've built so far
            doesn't disappear — it's still yours.
          </Text>
        </View>

        <View className="mt-8 rounded-2xl bg-white px-5 py-6">
          <Text className="text-xs font-semibold uppercase tracking-widest text-hale-900/50">
            What you've already earned
          </Text>
          <View className="mt-4 flex-row">
            <View className="flex-1">
              <Text className="text-3xl font-extrabold text-hale-900">
                {fmtUsd(lifetimeMoneySaved)}
              </Text>
              <Text className="mt-1 text-sm text-hale-900/60">saved, lifetime</Text>
            </View>
            <View className="flex-1">
              <Text className="text-3xl font-extrabold text-hale-900">
                {bestStreak} {bestStreak === 1 ? 'day' : 'days'}
              </Text>
              <Text className="mt-1 text-sm text-hale-900/60">your best streak</Text>
            </View>
          </View>
          <Text className="mt-5 text-sm leading-relaxed text-hale-900/70">
            You already proved you can do this for {bestStreak > 0 ? `${bestStreak} ` : 'a '}
            {bestStreak === 1 ? 'day' : 'days'}. You can do it again — starting now.
          </Text>
        </View>

        <Pressable
          onPress={onTalkToSage}
          accessibilityRole="button"
          className="mt-8 items-center rounded-2xl bg-white py-4 active:opacity-80"
        >
          <Text className="text-base font-bold" style={{ color: SOS }}>
            Reflect with Sage
          </Text>
        </Pressable>
        <Text className="mt-2 text-center text-xs text-white/60">
          What pulled you back? Naming it is how the next run gets easier.
        </Text>

        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          className="mt-4 items-center rounded-2xl border border-white/30 py-4 active:opacity-70"
        >
          <Text className="text-base font-semibold text-white">Start my fresh run</Text>
        </Pressable>

        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center justify-between pt-2">
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
      >
        <Text className="text-lg leading-none text-white">‹</Text>
      </Pressable>
      <Text className="text-sm font-semibold uppercase tracking-widest text-white/70">{title}</Text>
      <View className="h-9 w-9" />
    </View>
  );
}

function Disclaimer() {
  return (
    <Text className="mt-6 text-center text-xs leading-relaxed text-white/55">
      Supportive, not medical advice.
    </Text>
  );
}
