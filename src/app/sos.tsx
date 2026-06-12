import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  Heart,
  Compass,
  MessageCircle,
  RotateCcw,
  Timer,
  Users,
  Wind,
  X,
} from 'lucide-react-native';
import { useMutation } from 'convex/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import {
  Screen,
  Button,
  Display,
  Body,
  SageNote,
  Card,
  Ring,
  H2 as Heading,
  Eyebrow as Label,
} from '@/ui';
import { Canvas, Circle, RadialGradient, vec } from '@shopify/react-native-skia';
import { clean } from '@/theme/clean';

/**
 * Craving SOS — I1 (ride-it-out / breathe / talk to Sage / ping buddy) + I4
 * (non-shaming relapse recovery). Full-screen Bold Momentum modal on the dark
 * void, with the sos-red used loudly and sparingly for urgency.
 *
 * Decision 3 (anti-shame) lives in the "I slipped" flow: we ask lapse vs relapse,
 * and on a true relapse the recovery screen surfaces LIFETIME saved + best streak
 * (returned by api.relapse.logRelapse) — NEVER a zero — in huge display type
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
  const noteRelapseTrigger = useMutation(api.relapse.noteRelapseTrigger);

  const [view, setView] = useState<View_>({ kind: 'home' });
  // Re-entry guard for the slip → lapse/relapse commit. logRelapse is re-entrant
  // (a second call would bank a ~0-day attempt and write a duplicate relapse row
  // + orphan an attempt), and the choice buttons stay mounted during the mutation
  // round-trip. One commit per SOS session; the ref resets when the modal remounts.
  const slipBusyRef = useRef(false);

  // Fire SOS-opened once on mount. Also emit first_sos ONCE per user (candidate
  // activation event for the q1 D30 retention-split), guarded by a device flag.
  useEffect(() => {
    // The grounding "I've got you" thump on the app's most emotionally critical
    // screen — once, on mount.
    haptics.heavy();
    track(Ev.CRAVING_SOS_OPENED);
    AsyncStorage.getItem('hale:firstSos').then((seen) => {
      if (!seen) {
        track(Ev.FIRST_SOS, {});
        AsyncStorage.setItem('hale:firstSos', '1').catch(() => {});
      }
    });
  }, []);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  }, []);

  /** Finish the I4 recovery flow: attach the named trigger to the just-closed
   *  relapse attempt (real data for I3 trigger intelligence) + fire the guardrail
   *  event. Trigger is optional — never block the user from moving on. */
  const completeRecovery = useCallback(
    (trigger: string | null) => {
      if (trigger) {
        noteRelapseTrigger({ trigger }).catch(() => {});
        // q4 relapse-prediction signal: the named trigger tied to the closed attempt.
        track(Ev.RELAPSE_TRIGGER_NAMED, { trigger });
      }
      track(Ev.RELAPSE_RECOVERED, trigger ? { trigger } : {});
      close();
    },
    [noteRelapseTrigger, close],
  );

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
          // The brave thing landed — they survived it AND logged it.
          haptics.success();
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
          if (slipBusyRef.current) return; // double-tap guard — never double-commit
          slipBusyRef.current = true;
          try {
            await logRelapse({ kind: 'lapse' });
            track(Ev.RELAPSE_LOGGED, { kind: 'lapse' });
          } catch {
            /* best-effort */
          }
          close();
        }}
        onRelapse={async () => {
          if (slipBusyRef.current) return; // double-tap guard — never double-commit a relapse
          slipBusyRef.current = true;
          try {
            const res = await logRelapse({ kind: 'relapse' });
            track(Ev.RELAPSE_LOGGED, {
              kind: 'relapse',
              streak_at_relapse: res?.streakAtRelapse,
              lapses_before_relapse: res?.lapsesBeforeRelapse,
            });
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
        onDone={completeRecovery}
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
            <View className="h-2.5 w-2.5 rounded-full bg-coral" />
            <Label className="text-coral">Craving SOS</Label>
          </View>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full border border-stroke bg-surface active:opacity-70"
          >
            <X color={clean.fg} size={18} strokeWidth={2.5} />
          </Pressable>
        </View>

        <View className="mt-10">
          <Heading className="text-5xl leading-[0.95]">You're not{'\n'}in danger.</Heading>
          <Display className="mt-2 text-6xl leading-tight text-coral">This passes.</Display>
          <Body className="mt-5 text-base leading-relaxed text-fg-2">
            A craving peaks in a few minutes, then fades, whether or not you act on it. Let's get
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
            subtitle="Box breathing, follow the circle, slow it all down."
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
            icon={Compass}
            title="Advanced toolkit"
            subtitle="Urge-surfing, your trigger patterns, and craving-time map."
            onPress={() => router.push('/toolkit')}
          />
          {/* "Ping my buddy" hidden until it ships — a disabled "(Coming soon)" row
              on the most emotionally critical screen read as unfinished. Restore
              this Option when buddy-ping is live. */}
        </View>

        <Pressable
          onPress={() => {
            // Custom row → light tap (neutral; the slip flow stays anti-shame).
            haptics.tap();
            setView({ kind: 'slip-choose' });
          }}
          accessibilityRole="button"
          className="mt-9 flex-row items-center justify-between rounded-2xl border border-stroke bg-surface px-5 py-4 active:opacity-70"
        >
          <View>
            <Body className="font-sora-bold text-base text-fg">I slipped</Body>
            <Body className="mt-0.5 text-xs text-fg-2">It's okay. Let's keep going.</Body>
          </View>
          <RotateCcw color={clean.fg2} size={18} strokeWidth={2.5} />
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
          <Label className="text-accent">You made it</Label>
          <Heading className="mt-2 text-4xl leading-[0.95]">That craving{'\n'}just passed.</Heading>
          <Body className="mt-4 text-base leading-relaxed text-fg-2">
            Quick, naming it teaches HALE your triggers, so we get ahead of the next one.
          </Body>
        </View>

        {/* Intensity — user-selected, never defaulted */}
        <Label className="mt-9 text-fg-2">How strong was it?</Label>
        <View className="mt-3 flex-row gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = intensity === n;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  // Custom selector cell → its own selection tick.
                  haptics.select();
                  setIntensity(n);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Intensity ${n}`}
                className={`flex-1 items-center rounded-2xl border py-3.5 active:opacity-80 ${
                  on ? 'border-accent-edge bg-accent/15' : 'border-stroke bg-surface'
                }`}
              >
                <Display className={`text-2xl ${on ? 'text-accent' : 'text-fg'}`}>{n}</Display>
              </Pressable>
            );
          })}
        </View>
        <View className="mt-1.5 flex-row justify-between px-1">
          <Body className="text-[11px] text-fg-2">Barely there</Body>
          <Body className="text-[11px] text-fg-2">Intense</Body>
        </View>

        {/* Trigger */}
        <Label className="mt-8 text-fg-2">What set it off?</Label>
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
        <Label className="mt-8 text-fg-2">Where were you?</Label>
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
          label="Save & finish"
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
          <Body className="text-sm text-fg-2">Skip</Body>
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
      onPress={() => {
        // LOCAL chip (not the src/ui Chip, which self-fires) → selection tick.
        // Used by both the craving-log capture and the kind-recovery trigger lists.
        haptics.select();
        onPress();
      }}
      accessibilityRole="button"
      className={`rounded-full border px-4 py-2 active:opacity-70 ${
        selected ? 'border-accent-edge bg-accent/15' : 'border-stroke bg-surface'
      }`}
    >
      <Body className={`text-sm ${selected ? 'font-sora-semibold text-accent' : 'text-fg'}`}>
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
      onPress={() => {
        // Custom row (not a UI primitive) → fire its own light tap.
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      className="flex-row items-center gap-4 rounded-3xl bg-coral px-5 py-5 active:opacity-90"
    >
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-black/15">
        <Icon color={clean.fg} size={24} strokeWidth={2.5} />
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
      onPress={() => {
        // Custom row (not a UI primitive) → fire its own light tap.
        haptics.tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      className={`flex-row items-center gap-4 rounded-3xl border border-stroke bg-surface px-5 py-5 ${
        disabled ? 'opacity-45' : 'active:opacity-80'
      }`}
    >
      <View className="h-12 w-12 items-center justify-center rounded-2xl border border-stroke bg-surface-2">
        <Icon color={disabled ? clean.fg2 : clean.accent} size={24} strokeWidth={2.5} />
      </View>
      <View className="flex-1">
        <Heading className="text-xl text-fg">{title}</Heading>
        <Body className="mt-1 text-sm text-fg-2">{subtitle}</Body>
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

  // Quiet "still here with you" pulse at each whole-minute boundary still left
  // (240/180/120/60). A Set guards each beat to fire exactly once as the second
  // ticks across it.
  const minuteBeatsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (remaining > 0 && remaining < RIDE_SECONDS && remaining % 60 === 0 && !minuteBeatsRef.current.has(remaining)) {
      minuteBeatsRef.current.add(remaining);
      haptics.soft();
    }
  }, [remaining]);

  // The reward when they ride the full timer out — fires once on the done flip.
  useEffect(() => {
    if (done) haptics.success();
  }, [done]);

  const progress = 1 - remaining / RIDE_SECONDS;
  const reassurance = useMemo(() => {
    if (done) return "You rode it out. The urge passed, and you're still here.";
    if (progress < 0.25) return 'This is the peak. It feels loud, but it always crests.';
    if (progress < 0.6) return "It's already fading. Stay with the breath.";
    return "Almost through. You're proving you don't need it.";
  }, [progress, done]);

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 px-5 pb-10">
        <Header title="Ride it out" onBack={onBack} />

        <View className="flex-1 items-center justify-center">
          <View className="items-center justify-center">
            {/* Slow ambient coral glow breathing behind the timer — the crisis
                accent, kept very subtle so it never competes with the countdown. */}
            <CoralGlow />
            <Ring progress={progress} size={264} stroke={12}>
              <View className="items-center">
                <Label className="text-accent">{done ? 'Made it' : 'It crests, then fades'}</Label>
                <Display className="mt-1 text-7xl leading-tight tabular-nums text-fg">
                  {fmtClock(remaining)}
                </Display>
              </View>
            </Ring>
          </View>
          <Body className="mt-10 px-4 text-center text-lg leading-relaxed text-fg-2">
            {reassurance}
          </Body>
        </View>

        {done ? (
          <Button label="I made it through" variant="primary" onPress={onSurvived} />
        ) : (
          <Button
            label="The craving passed, I'm good"
            variant="secondary"
            onPress={onSurvived}
          />
        )}

        <Pressable onPress={onSlip} accessibilityRole="button" className="mt-3 items-center py-2">
          <Body className="text-sm text-fg-2">I slipped</Body>
        </Pressable>

        <Disclaimer />
      </View>
    </Screen>
  );
}

/**
 * Ambient coral glow behind the ride-it-out timer. A soft Skia radial gradient
 * (coral → transparent, no hard edge) that slowly breathes (scale + opacity,
 * ~5s cycle). Deliberately faint — it warms the crisis screen without pulling
 * focus from the countdown. Overlay only, behind the ring.
 */
function CoralGlow() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.5 + p.value * 0.5,
    transform: [{ scale: 0.92 + p.value * 0.14 }],
  }));
  const S = 360;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: S, height: S }, style]}>
      <Canvas style={{ flex: 1 }}>
        <Circle cx={S / 2} cy={S / 2} r={S / 2}>
          <RadialGradient
            c={vec(S / 2, S / 2)}
            r={S / 2}
            colors={['rgba(255,107,92,0.22)', 'rgba(255,107,92,0.0)']}
          />
        </Circle>
      </Canvas>
    </Animated.View>
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

  // Haptic breath beats, in step with the label: a Soft pulse on the inhale
  // (phase 0), a Light pulse on the exhale (phase 2). The two holds (1, 3) are
  // silent BY DESIGN — stillness is the point. Firing on the first inhale (the
  // initial phase-0 render) is desirable; setPhase(0) above is a no-op when phase
  // is already 0, so this effect runs once per real phase change, never twice.
  useEffect(() => {
    if (phase === 0) haptics.breath('in');
    else if (phase === 2) haptics.breath('out');
  }, [phase]);

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
              className="absolute h-72 w-72 rounded-full border border-accent-edge/40 bg-accent/10"
              style={circleStyle}
            />
            <View className="h-32 w-32 items-center justify-center rounded-full border border-accent-edge/50 bg-accent/15">
              <Heading className="text-center text-lg text-accent">{PHASES[phase].label}</Heading>
            </View>
          </View>
          <Body className="mt-12 px-6 text-center text-base leading-relaxed text-fg-2">
            In for four, hold for four, out for four, hold for four. Let your shoulders drop.
          </Body>
        </View>

        <Button label="I feel steadier, I'm good" variant="primary" onPress={onSurvived} />

        <Pressable onPress={onSlip} accessibilityRole="button" className="mt-3 items-center py-2">
          <Body className="text-sm text-fg-2">I slipped</Body>
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
          <Heading className="text-4xl leading-[0.95]">Slips are part of quitting,</Heading>
          <Display className="mt-2 text-5xl leading-tight text-accent">Not the end.</Display>
        </View>
        <Body className="mt-5 text-base leading-relaxed text-fg-2">
          Be honest with yourself; it's the only way the data helps you. Which one fits?
        </Body>

        <Pressable
          onPress={() => {
            // NEUTRAL tap — anti-shame: a slip never gets warn()/error(), and no
            // outcome haptic fires on the relapse mutation itself.
            haptics.tap();
            onLapse();
          }}
          accessibilityRole="button"
          className="mt-9 rounded-3xl border border-accent-edge/40 bg-accent/10 px-5 py-5 active:opacity-80"
        >
          <View className="flex-row items-center gap-2">
            <Heading className="text-xl text-accent">Just a slip</Heading>
            <View className="rounded-full bg-accent/20 px-2.5 py-0.5">
              <Label className="text-accent">Streak safe</Label>
            </View>
          </View>
          <Body className="mt-2 text-sm leading-relaxed text-fg/80">
            One moment, and I'm back on track. Your streak is protected.
          </Body>
        </Pressable>

        <Pressable
          onPress={() => {
            // NEUTRAL tap — anti-shame: no warn()/error() here, and the relapse
            // mutation gets no outcome haptic. A fresh run is not a failure.
            haptics.tap();
            onRelapse();
          }}
          accessibilityRole="button"
          className="mt-3 rounded-3xl border border-stroke bg-surface px-5 py-5 active:opacity-80"
        >
          <Heading className="text-xl text-fg">I'm back on it for now</Heading>
          <Body className="mt-2 text-sm leading-relaxed text-fg-2">
            We'll start a fresh run, and keep everything you've already earned.
          </Body>
        </Pressable>

        <Pressable onPress={onCancel} accessibilityRole="button" className="mt-7 items-center py-2">
          <Body className="text-sm text-fg-2">Actually, I'm okay. Go back</Body>
        </Pressable>

        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* (I4) Kind recovery screen — surfaces lifetime, never a zero         */
/* ------------------------------------------------------------------ */

/**
 * Gentle warm entrance — fade in + a soft rise, staggered by `delay`. The motion
 * on the recovery screen must read as CALM and reassuring (the opposite of the
 * milestone confetti): slow, soft-eased, never bouncy. Additive only.
 */
function SoftRise({
  delay = 0,
  children,
}: {
  delay?: number;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withTiming(1, { duration: 640, easing: Easing.out(Easing.cubic) }),
    );
    return () => cancelAnimation(p);
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 16 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** A slow, warm heartbeat on the recovery Heart — reassurance made literal. */
function WarmHeart() {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1.09, { duration: 720, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 940, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(s);
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      className="mb-6 h-20 w-20 items-center justify-center self-center rounded-3xl border border-accent-edge/40 bg-accent/10"
      style={[
        style,
        { shadowColor: clean.accent, shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } },
      ]}
    >
      <Heart color={clean.accent} size={38} strokeWidth={2.5} />
    </Animated.View>
  );
}

function RecoverKindly({
  lifetimeMoneySaved,
  bestStreak,
  onTalkToSage,
  onDone,
}: {
  lifetimeMoneySaved: number;
  bestStreak: number;
  onTalkToSage: () => void;
  onDone: (trigger: string | null) => void;
}) {
  const [trigger, setTrigger] = useState<string | null>(null);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-14"
        showsVerticalScrollIndicator={false}
      >
        <SoftRise>
          <View className="items-center pt-12">
            <WarmHeart />
            <Heading className="text-center text-4xl leading-[0.95]">This isn't a reset.</Heading>
            <Display className="mt-2 text-center text-6xl leading-tight text-fg">Fresh run.</Display>
            <Body className="mt-5 text-center text-base leading-relaxed text-fg-2">
              Quitting nicotine almost never happens in one clean line. What you've built so far
              doesn't disappear, it's still yours.
            </Body>
          </View>
        </SoftRise>

        <SoftRise delay={140}>
        {/* What you've already earned — loud lifetime stats, NEVER a zero feel. */}
        <Card className="mt-9 overflow-hidden">
          <View className="border-b border-stroke px-5 pb-4 pt-5">
            <Label>What you've already earned</Label>
          </View>
          <View className="flex-row">
            <View className="flex-1 border-r border-stroke px-5 py-5">
              <Display className="text-5xl leading-tight text-fg">{fmtUsd(lifetimeMoneySaved)}</Display>
              <Label className="mt-2">Saved · lifetime</Label>
            </View>
            <View className="flex-1 px-5 py-5">
              <View className="flex-row items-baseline gap-1.5">
                <Display className="text-5xl leading-tight text-fg">{bestStreak}</Display>
                <Body className="font-sora-bold text-base text-fg-2">
                  {bestStreak === 1 ? 'day' : 'days'}
                </Body>
              </View>
              <Label className="mt-2">Best streak</Label>
            </View>
          </View>
          <View className="border-t border-stroke px-5 py-4">
            <SageNote chip={false}>
              You already proved you can do this for {bestStreak > 0 ? `${bestStreak} ` : 'a '}
              {bestStreak === 1 ? 'day' : 'days'}. You can do it again, starting now.
            </SageNote>
          </View>
        </Card>
        </SoftRise>

        <SoftRise delay={260}>
        {/* I4, name the trigger: therapeutic ("naming it") + real data for I3. */}
        <View className="mt-9">
          <View className="flex-row items-center gap-1.5">
            <MessageCircle color={clean.fg2} size={13} strokeWidth={2.2} />
            <Label className="text-fg-2">What pulled you back?</Label>
          </View>
          <Body className="mt-1.5 text-xs text-fg-2">Naming it is how the next run gets easier.</Body>
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
        </View>

        <View className="mt-8">
          <Button label="Reflect with Sage" variant="primary" onPress={onTalkToSage} />
        </View>

        <Pressable
          onPress={() => {
            // Warm success — a new beginning, not a failure. Custom Pressable, so
            // it fires its own outcome beat here.
            haptics.success();
            onDone(trigger);
          }}
          accessibilityRole="button"
          className="mt-4 h-14 items-center justify-center rounded-2xl border border-stroke active:bg-surface"
        >
          <Heading className="text-[15px] tracking-wide text-fg">Start my fresh run</Heading>
        </Pressable>
        </SoftRise>

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
        className="h-10 w-10 items-center justify-center rounded-full border border-stroke bg-surface active:opacity-70"
      >
        <ChevronLeft color={clean.fg} size={20} strokeWidth={2.5} />
      </Pressable>
      <Label className="text-fg-2">{title}</Label>
      <View className="h-10 w-10" />
    </View>
  );
}

function Disclaimer({ full = false }: { full?: boolean }) {
  return (
    <Body className="mt-7 text-center text-xs leading-relaxed text-fg-2/70">
      {full
        ? "HALE is supportive, not medical advice. If you're in crisis or thinking about harming yourself, please contact your local emergency services."
        : 'Supportive, not medical advice.'}
    </Body>
  );
}
