import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
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
import {
  ChevronLeft,
  Heart,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Timer,
  Users,
  Wind,
  X,
} from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { Screen } from '@/components/ui/Screen';
import { Body, Display, Heading, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { RingGauge } from '@/components/ui/RingGauge';
import { colors } from '@/theme/colors';

/**
 * Craving SOS — I1 (ride-it-out / breathe / talk to Sage / ping buddy) + I4
 * (non-shaming relapse recovery). Full-screen Bold Momentum modal on the dark
 * void, with the sos-red used loudly and sparingly for urgency.
 *
 * Decision 3 (anti-shame) lives in the "I slipped" flow: we ask lapse vs relapse,
 * and on a true relapse the recovery screen surfaces LIFETIME saved + best streak
 * (returned by api.relapse.logRelapse) — NEVER a zero — in huge font-display
 * numerals, plus a Sage reflection.
 *
 * This screen is supportive, not medical advice (disclaimed in the footer).
 */

const RIDE_SECONDS = 5 * 60; // "it peaks then fades" — 5 minutes to ride it out

type View_ =
  | { kind: 'home' }
  | { kind: 'ride' }
  | { kind: 'breathe' }
  | { kind: 'log'; resolvedBy: 'timer' | 'breathing' } // post-resolution craving capture
  | { kind: 'slip-choose' } // lapse vs relapse
  | { kind: 'recover'; lifetimeMoneySaved: number; bestStreak: number }; // post-relapse, kind screen

/** Trigger / context chips — the user picks their REAL one (the logged value is
 *  their selection, never a default). Triggers mirror the onboarding set. */
const TRIGGER_CHIPS = [
  'Stress',
  'Boredom',
  'After a meal',
  'Coffee',
  'Alcohol',
  'Driving',
  'Social',
  'Phone',
  'Just woke up',
  'Work break',
] as const;
const CONTEXT_CHIPS = ['Alone', 'Around people', 'At home', 'At work', 'Out', 'Winding down'] as const;

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

  // Fire SOS-opened once on mount.
  useEffect(() => {
    track(Ev.CRAVING_SOS_OPENED);
  }, []);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  }, []);

  /**
   * Finish a survived craving from the post-resolution capture. `vals` carries the
   * user's REAL intensity/trigger/context (null when they skip). craving_survived
   * always fires (they made it); craving_logged + the Convex row only when they
   * gave us data — never a fabricated intensity.
   */
  const completeLog = useCallback(
    async (
      vals: { intensity: number; trigger?: string; context?: string } | null,
      resolvedBy: 'timer' | 'breathing',
    ) => {
      try {
        if (vals) {
          await logCraving({
            intensity: vals.intensity,
            trigger: vals.trigger,
            context: vals.context,
            outcome: 'survived',
            resolvedBy,
          });
          track(Ev.CRAVING_LOGGED, { outcome: 'survived', resolvedBy, intensity: vals.intensity });
        }
        track(Ev.CRAVING_SURVIVED, { resolvedBy });
      } catch {
        // Logging is best-effort; never trap the user in the SOS modal on a write error.
      }
      close();
    },
    [logCraving, close],
  );

  if (view.kind === 'ride') {
    return (
      <RideItOut
        onSurvived={() => setView({ kind: 'log', resolvedBy: 'timer' })}
        onBack={() => setView({ kind: 'home' })}
        onSlip={() => setView({ kind: 'slip-choose' })}
      />
    );
  }

  if (view.kind === 'breathe') {
    return (
      <BoxBreathing
        onSurvived={() => setView({ kind: 'log', resolvedBy: 'breathing' })}
        onBack={() => setView({ kind: 'home' })}
        onSlip={() => setView({ kind: 'slip-choose' })}
      />
    );
  }

  if (view.kind === 'log') {
    const resolvedBy = view.resolvedBy;
    return (
      <CravingLogCapture
        onSave={(vals) => completeLog(vals, resolvedBy)}
        onSkip={() => completeLog(null, resolvedBy)}
      />
    );
  }

  if (view.kind === 'slip-choose') {
    return (
      <SlipChoose
        onCancel={() => setView({ kind: 'home' })}
        onLapse={async () => {
          // 'lapse' preserves the streak (bounded grace). logRelapse is the source
          // of truth; we don't fabricate a craving row with a guessed intensity —
          // trigger naming lives on the recovery screen.
          try {
            await logRelapse({ kind: 'lapse' });
            track(Ev.RELAPSE_LOGGED, { kind: 'lapse' });
          } catch {
            /* best-effort */
          }
          close();
        }}
        onRelapse={async () => {
          try {
            const res = await logRelapse({ kind: 'relapse' });
            track(Ev.RELAPSE_LOGGED, { kind: 'relapse' });
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

  // HOME — the calm menu of options on the dark void.
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between pt-2">
          <View className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full bg-sos" />
            <Label className="text-sos">Craving SOS</Label>
          </View>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full border border-line bg-coal active:opacity-70"
          >
            <X color={colors.chalk} size={18} strokeWidth={2.5} />
          </Pressable>
        </View>

        <View className="mt-10">
          <Heading className="text-5xl leading-[0.95]">You're not{'\n'}in danger.</Heading>
          <Display className="mt-2 text-6xl leading-[0.9] text-sos">THIS PASSES.</Display>
          <Body className="mt-5 text-base leading-relaxed text-ash">
            A craving peaks in a few minutes, then fades — whether or not you act on it. Let's get
            you to the other side. Pick one:
          </Body>
        </View>

        <View className="mt-9 gap-3">
          <PrimaryOption
            icon={Timer}
            title="Ride it out"
            subtitle="A 5-minute timer. It peaks, then fades."
            onPress={() => setView({ kind: 'ride' })}
          />
          <Option
            icon={Wind}
            title="Breathe"
            subtitle="Box breathing — follow the circle, slow it all down."
            onPress={() => setView({ kind: 'breathe' })}
          />
          <Option
            icon={MessageCircle}
            title="Talk to Sage"
            subtitle="Your coach is here, right now, no judgment."
            onPress={() => {
              // The resolution happens in the conversation — don't log a premature
              // (fake) survival here; just hand off to the coach.
              close();
              router.push('/(tabs)/coach');
            }}
          />
          <Option
            icon={Users}
            title="Ping my buddy"
            subtitle="Send a quiet rally. (Coming soon)"
            disabled
            onPress={() => {}}
          />
        </View>

        <Pressable
          onPress={() => setView({ kind: 'slip-choose' })}
          accessibilityRole="button"
          className="mt-9 flex-row items-center justify-between rounded-2xl border border-line bg-coal px-5 py-4 active:opacity-70"
        >
          <View>
            <Body className="font-body-bold text-base text-chalk">I slipped</Body>
            <Body className="mt-0.5 text-xs text-ash">It's okay. Let's keep going.</Body>
          </View>
          <RotateCcw color={colors.ash} size={18} strokeWidth={2.5} />
        </Pressable>

        <Disclaimer full />
      </ScrollView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Post-resolution craving capture (I1) — real intensity/trigger/context */
/* ------------------------------------------------------------------ */

function CravingLogCapture({
  onSave,
  onSkip,
}: {
  onSave: (vals: { intensity: number; trigger?: string; context?: string }) => void;
  onSkip: () => void;
}) {
  const [intensity, setIntensity] = useState<number | null>(null);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-8">
          <Label className="text-volt">You made it</Label>
          <Heading className="mt-2 text-4xl leading-[0.95]">That craving{'\n'}just passed.</Heading>
          <Body className="mt-4 text-base leading-relaxed text-ash">
            Quick — naming it teaches HALE your triggers, so we get ahead of the next one.
          </Body>
        </View>

        {/* Intensity — user-selected, never defaulted */}
        <Label className="mt-9 text-ash">How strong was it?</Label>
        <View className="mt-3 flex-row gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = intensity === n;
            return (
              <Pressable
                key={n}
                onPress={() => setIntensity(n)}
                accessibilityRole="button"
                accessibilityLabel={`Intensity ${n}`}
                className={`flex-1 items-center rounded-2xl border py-3.5 active:opacity-80 ${
                  on ? 'border-volt bg-volt/15' : 'border-line bg-coal'
                }`}
              >
                <Display className={`text-2xl ${on ? 'text-volt' : 'text-chalk'}`}>{n}</Display>
              </Pressable>
            );
          })}
        </View>
        <View className="mt-1.5 flex-row justify-between px-1">
          <Body className="text-[11px] text-ash">Barely there</Body>
          <Body className="text-[11px] text-ash">Intense</Body>
        </View>

        {/* Trigger */}
        <Label className="mt-8 text-ash">What set it off?</Label>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {TRIGGER_CHIPS.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={trigger === t}
              onPress={() => setTrigger((cur) => (cur === t ? null : t))}
            />
          ))}
        </View>

        {/* Context */}
        <Label className="mt-8 text-ash">Where were you?</Label>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {CONTEXT_CHIPS.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={context === c}
              onPress={() => setContext((cur) => (cur === c ? null : c))}
            />
          ))}
        </View>

        <Button
          variant="primary"
          label="SAVE & FINISH"
          disabled={intensity === null}
          onPress={() =>
            intensity !== null &&
            onSave({ intensity, trigger: trigger ?? undefined, context: context ?? undefined })
          }
          className="mt-9"
        />
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          className="mt-4 items-center py-2 active:opacity-70"
        >
          <Body className="text-sm text-ash">Skip</Body>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`rounded-full border px-4 py-2 active:opacity-70 ${
        selected ? 'border-volt bg-volt/15' : 'border-line bg-coal'
      }`}
    >
      <Body className={`text-sm ${selected ? 'font-body-semibold text-volt' : 'text-chalk'}`}>
        {label}
      </Body>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Home option rows                                                    */
/* ------------------------------------------------------------------ */

type IconType = typeof Timer;

function PrimaryOption({
  icon: Icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconType;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-4 rounded-3xl bg-sos px-5 py-5 active:opacity-90"
    >
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-black/15">
        <Icon color={colors.chalk} size={24} strokeWidth={2.5} />
      </View>
      <View className="flex-1">
        <Heading className="text-xl text-white">{title}</Heading>
        <Body className="mt-1 text-sm text-white/80">{subtitle}</Body>
      </View>
    </Pressable>
  );
}

function Option({
  icon: Icon,
  title,
  subtitle,
  onPress,
  disabled,
}: {
  icon: IconType;
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
      className={`flex-row items-center gap-4 rounded-3xl border border-line bg-coal px-5 py-5 ${
        disabled ? 'opacity-45' : 'active:opacity-80'
      }`}
    >
      <View className="h-12 w-12 items-center justify-center rounded-2xl border border-line bg-card">
        <Icon color={disabled ? colors.ash : colors.volt} size={24} strokeWidth={2.5} />
      </View>
      <View className="flex-1">
        <Heading className="text-xl text-chalk">{title}</Heading>
        <Body className="mt-1 text-sm text-ash">{subtitle}</Body>
      </View>
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
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 px-5 pb-10">
        <Header title="Ride it out" onBack={onBack} />

        <View className="flex-1 items-center justify-center">
          <RingGauge progress={progress} size={264} stroke={12}>
            <View className="items-center">
              <Label className="text-volt">{done ? 'Made it' : 'It crests, then fades'}</Label>
              <Display className="mt-1 text-7xl tabular-nums text-chalk">
                {fmtClock(remaining)}
              </Display>
            </View>
          </RingGauge>
          <Body className="mt-10 px-4 text-center text-lg leading-relaxed text-ash">
            {reassurance}
          </Body>
        </View>

        {done ? (
          <Button label="I made it through" variant="primary" onPress={onSurvived} />
        ) : (
          <Button
            label="The craving passed — I'm good"
            variant="surface"
            onPress={onSurvived}
          />
        )}

        <Pressable onPress={onSlip} accessibilityRole="button" className="mt-3 items-center py-2">
          <Body className="text-sm text-ash">I slipped</Body>
        </Pressable>

        <Disclaimer />
      </View>
    </Screen>
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
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 px-5 pb-10">
        <Header title="Breathe" onBack={onBack} />

        <View className="flex-1 items-center justify-center">
          <View className="h-72 w-72 items-center justify-center">
            <Animated.View
              className="absolute h-72 w-72 rounded-full border border-volt/40 bg-volt/10"
              style={circleStyle}
            />
            <View className="h-32 w-32 items-center justify-center rounded-full border border-volt/50 bg-volt/15">
              <Heading className="text-center text-lg text-volt">{PHASES[phase].label}</Heading>
            </View>
          </View>
          <Body className="mt-12 px-6 text-center text-base leading-relaxed text-ash">
            In for four, hold for four, out for four, hold for four. Let your shoulders drop.
          </Body>
        </View>

        <Button label="I feel steadier — I'm good" variant="primary" onPress={onSurvived} />

        <Pressable onPress={onSlip} accessibilityRole="button" className="mt-3 items-center py-2">
          <Body className="text-sm text-ash">I slipped</Body>
        </Pressable>

        <Disclaimer />
      </View>
    </Screen>
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
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <Header title="No shame here" onBack={onCancel} />

        <View className="mt-4">
          <Heading className="text-4xl leading-[0.95]">Slips are part of quitting —</Heading>
          <Display className="mt-2 text-5xl leading-[0.9] text-volt">NOT THE END.</Display>
        </View>
        <Body className="mt-5 text-base leading-relaxed text-ash">
          Be honest with yourself; it's the only way the data helps you. Which one fits?
        </Body>

        <Pressable
          onPress={onLapse}
          accessibilityRole="button"
          className="mt-9 rounded-3xl border border-volt/40 bg-volt/10 px-5 py-5 active:opacity-80"
        >
          <View className="flex-row items-center gap-2">
            <Heading className="text-xl text-volt">Just a slip</Heading>
            <View className="rounded-full bg-volt/20 px-2.5 py-0.5">
              <Label className="text-volt">Streak safe</Label>
            </View>
          </View>
          <Body className="mt-2 text-sm leading-relaxed text-chalk/80">
            One moment, and I'm back on track. Your streak is protected.
          </Body>
        </Pressable>

        <Pressable
          onPress={onRelapse}
          accessibilityRole="button"
          className="mt-3 rounded-3xl border border-line bg-coal px-5 py-5 active:opacity-80"
        >
          <Heading className="text-xl text-chalk">I'm back on it for now</Heading>
          <Body className="mt-2 text-sm leading-relaxed text-ash">
            We'll start a fresh run — and keep everything you've already earned.
          </Body>
        </Pressable>

        <Pressable onPress={onCancel} accessibilityRole="button" className="mt-7 items-center py-2">
          <Body className="text-sm text-ash">Actually, I'm okay — go back</Body>
        </Pressable>

        <Disclaimer />
      </ScrollView>
    </Screen>
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
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="pt-12">
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-volt/40 bg-volt/10">
            <Heart color={colors.volt} size={24} strokeWidth={2.5} />
          </View>
          <Heading className="text-4xl leading-[0.95]">This isn't a reset.</Heading>
          <Display className="mt-2 text-6xl leading-[0.9] text-volt">FRESH RUN.</Display>
          <Body className="mt-5 text-base leading-relaxed text-ash">
            Quitting nicotine almost never happens in one clean line. What you've built so far
            doesn't disappear — it's still yours.
          </Body>
        </View>

        {/* What you've already earned — loud lifetime stats, NEVER a zero feel. */}
        <View className="mt-9 overflow-hidden rounded-3xl border border-line bg-coal">
          <View className="border-b border-line px-5 pt-5">
            <Label>What you've already earned</Label>
          </View>
          <View className="flex-row">
            <View className="flex-1 border-r border-line px-5 py-5">
              <Display className="text-5xl text-volt">{fmtUsd(lifetimeMoneySaved)}</Display>
              <Body className="mt-1.5 text-sm text-ash">saved, lifetime</Body>
            </View>
            <View className="flex-1 px-5 py-5">
              <View className="flex-row items-baseline gap-1.5">
                <Display className="text-5xl text-chalk">{bestStreak}</Display>
                <Body className="font-body-bold text-base text-ash">
                  {bestStreak === 1 ? 'day' : 'days'}
                </Body>
              </View>
              <Body className="mt-1.5 text-sm text-ash">your best streak</Body>
            </View>
          </View>
          <View className="border-t border-line px-5 py-4">
            <Body className="text-sm leading-relaxed text-chalk/80">
              You already proved you can do this for {bestStreak > 0 ? `${bestStreak} ` : 'a '}
              {bestStreak === 1 ? 'day' : 'days'}. You can do it again — starting now.
            </Body>
          </View>
        </View>

        <View className="mt-9">
          <Button label="Reflect with Sage" variant="primary" onPress={onTalkToSage} />
          <View className="mt-2.5 flex-row items-center justify-center gap-1.5">
            <Sparkles color={colors.ash} size={13} strokeWidth={2.5} />
            <Body className="text-center text-xs text-ash">
              What pulled you back? Naming it is how the next run gets easier.
            </Body>
          </View>
        </View>

        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          className="mt-4 h-14 items-center justify-center rounded-2xl border border-line active:bg-coal"
        >
          <Heading className="text-[15px] tracking-wide text-chalk">Start my fresh run</Heading>
        </Pressable>

        <Disclaimer />
      </ScrollView>
    </Screen>
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
        className="h-10 w-10 items-center justify-center rounded-full border border-line bg-coal active:opacity-70"
      >
        <ChevronLeft color={colors.chalk} size={20} strokeWidth={2.5} />
      </Pressable>
      <Label className="text-ash">{title}</Label>
      <View className="h-10 w-10" />
    </View>
  );
}

function Disclaimer({ full = false }: { full?: boolean }) {
  return (
    <Body className="mt-7 text-center text-xs leading-relaxed text-ash/70">
      {full
        ? "HALE is supportive, not medical advice. If you're in crisis or thinking about harming yourself, please contact your local emergency services."
        : 'Supportive, not medical advice.'}
    </Body>
  );
}
