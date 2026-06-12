import { useEffect, useMemo, useRef } from 'react';
import { Dimensions, Modal, Pressable, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { X } from 'lucide-react-native';
import { LANDMARK_DAYS } from '@convex/model/plan';
import { track, Ev } from '@/lib/analytics';
import { Button, Eyebrow, Body, Muted } from '@/ui';
import { clean } from '@/theme/clean';
import TransformationCard, { shareCard } from './TransformationCard';

/**
 * MilestoneCelebration — full-screen celebration shown the moment a LANDMARK_DAYS
 * threshold is crossed (1/3/7/14/30/60/90/180/365). It is the emotional spike
 * that motivates the share: lime confetti rains, the TransformationCard presents,
 * and a single prominent Share CTA turns the moment into acquisition.
 *
 * Clean Dark v2: a near-black overlay, emerald confetti, the reskinned card
 * popped in, Sora type, and a "Share this moment"
 * lime CTA. Built to be screenshotted.
 *
 * Grounded in the milestone-celebration pattern (Duolingo streak freeze screens,
 * Strava trophy cards, I-Am-Sober chip ceremonies): brief, joyful, one hero
 * artifact, one share action, one quiet dismiss.
 *
 * Fires Ev.MILESTONE_REACHED { day } once per mount (the caller is responsible
 * for showing this only when a NEW landmark is genuinely reached).
 */

export type MilestoneCelebrationProps = {
  visible: boolean;
  /** The landmark day reached (should be one of LANDMARK_DAYS). */
  day: number;
  moneySaved: number;
  recoveryPct?: number;
  name?: string;
  onClose: () => void;
};

/** Headline copy tuned per landmark — rare moments deserve specific words. */
function celebrationCopy(day: number): { title: string; sub: string } {
  switch (day) {
    case 1:
      return { title: 'Day one. Done.', sub: 'The hardest day is behind you.' };
    case 3:
      return { title: 'Three days clean', sub: 'Nicotine is leaving your system for good.' };
    case 7:
      return { title: 'One week free', sub: 'Taste and smell are already sharpening.' };
    case 14:
      return { title: 'Two weeks strong', sub: 'Your circulation is measurably better.' };
    case 30:
      return { title: 'A full month', sub: 'Cravings are fading as your brain resets.' };
    case 60:
      return { title: 'Sixty days', sub: 'This is who you are now.' };
    case 90:
      return { title: 'Ninety days', sub: 'Lung function noticeably improved.' };
    case 180:
      return { title: 'Half a year', sub: 'Six months of proof you don’t need it.' };
    case 365:
      return { title: 'One year free', sub: 'Heart-disease risk roughly halved.' };
    default:
      return { title: `${day} days clean`, sub: 'Another landmark behind you.' };
  }
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function MilestoneCelebration({
  visible,
  day,
  moneySaved,
  recoveryPct,
  name,
  onClose,
}: MilestoneCelebrationProps) {
  const cardRef = useRef<RNView>(null);
  const copy = celebrationCopy(day);

  // Fire MILESTONE_REACHED exactly once per "open" (guarded by day so a re-show
  // for a different landmark re-fires correctly).
  const firedForRef = useRef<number | null>(null);
  useEffect(() => {
    if (visible && firedForRef.current !== day) {
      firedForRef.current = day;
      track(Ev.MILESTONE_REACHED, { day });
    }
    if (!visible) firedForRef.current = null;
  }, [visible, day]);

  const onShare = () => {
    void shareCard(cardRef, { day, source: 'milestone' });
  };

  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-bg" style={{ backgroundColor: clean.bg }}>
        {/* Explicit window insets: SafeAreaView inside a native Modal measures
            its own (un-inset) window and can race to zero — the X then lands
            under the status bar and "Keep going" in the home-indicator band
            (ui-audit D1). useSafeAreaInsets reads the provider's window values. */}
        <View className="flex-1" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="flex-1 px-6 pb-6">
            {/* Dismiss */}
            <View className="flex-row justify-end pt-2">
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="h-11 w-11 items-center justify-center rounded-pill border border-stroke bg-surface-2 active:opacity-80"
              >
                <X color={clean.fg} size={18} strokeWidth={2.2} />
              </Pressable>
            </View>

            {/* Title — demoted to a small overline so the card's huge "N DAYS"
                is the SINGLE hero (was a competing text-3xl headline). */}
            <View className="mt-1 items-center">
              <Eyebrow className="text-center text-accent">{copy.title} · Milestone reached</Eyebrow>
              <Body className="mt-2 text-center text-base">
                {copy.sub}
              </Body>
            </View>

            {/* The shareable artifact, popped in. */}
            <PoppedCard>
              {/* Float the shareable card on its own plane with a accent-glow halo
                  (the card's own surface is intentionally left untouched — it is
                  the share artifact). The glow + the demoted headline above make
                  the card's "30" the single hero. */}
              <View
                style={{
                  // Wider here (celebration-only) so the fixed-aspect card is tall
                  // enough to show its footer tagline — fixes the clipped
                  // "QUIT NICOTINE WITH HALE" without touching the shared artifact.
                  width: Math.min(330, SCREEN_W - 56),
                  shadowColor: clean.accent,
                  shadowOpacity: 0.2,
                  shadowRadius: 26,
                  shadowOffset: { width: 0, height: 14 },
                }}
              >
                <TransformationCard
                  ref={cardRef}
                  days={day}
                  moneySaved={moneySaved}
                  recoveryPct={recoveryPct}
                  name={name}
                  animate
                  fitContent
                />
              </View>
            </PoppedCard>

            {/* Share CTA */}
            <View className="mt-auto">
              <Button
                label="Share this moment"
                variant="primary"
                onPress={onShare}
              />
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                className="mt-3 items-center py-3"
              >
                <Eyebrow>Keep going</Eyebrow>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Custom Skia particle burst — lime + white flakes (rotated rects) and
            sparks (circles) erupt from behind the hero numeral, fan out with varied
            velocity/size/spin, then arc down under gravity and fade over ~2s. Fires
            once. Rendered ON TOP so the directed burst reads clearly; pointerEvents
            none (Fabric-reliable) so taps pass through to the CTA. */}
        <MilestoneParticles />
      </View>
    </Modal>
  );
}

/** Spring-ish pop for the card (scale + fade in). */
function PoppedCard({ children }: { children: React.ReactNode }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      120,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.4)) }),
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.86 + progress.value * 0.14 }],
  }));

  return (
    <Animated.View
      className="flex-1 items-center justify-center py-4"
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Custom Skia particle system for the milestone celebration. A DIRECTED burst
 * launches from behind the hero numeral (the floating card's centre), fans outward
 * decelerating, then arcs down under gravity and fades over ~2s — a premium pop
 * converged on the hero, NOT a uniform sprinkle. Lime + white flakes (rotated
 * rects) and sparks (circles) with varied velocity / size / spin. Every particle
 * is drawn in ONE Skia Picture (a single UI-thread worklet redraws the whole field
 * per frame), driven by one linear `elapsed` clock, so it stays cheap. Fires once.
 */
const BURST_ORIGIN_X = SCREEN_W / 2;
const BURST_ORIGIN_Y = SCREEN_H * 0.46; // ≈ the floating card's centre
const PARTICLE_COUNT = 60;
const BURST_TOTAL_MS = 2200; // max delay (~180) + max lifetime (~2000)
// Emerald is the focal accent; accent-2 + white + a dim grey give depth.
const PARTICLE_PALETTE: Array<[number, number, number]> = [
  [52, 211, 153], // accent
  [52, 211, 153], // accent (weighted)
  [94, 227, 176], // accent-2
  [234, 241, 236], // fg/white spark
  [97, 163, 155], // dim
];

function MilestoneParticles() {
  const recorder = useMemo(() => Skia.PictureRecorder(), []);
  const paint = useMemo(() => Skia.Paint(), []);
  // Precompute every particle's physics ONCE (deterministic per-index pseudo-random
  // → cheap + stable). Varied angle/speed/size/spin/gravity reads organic.
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const seed = (n: number) => {
          const x = Math.sin((i + 1) * 9301 + n * 49297) * 233280;
          return x - Math.floor(x); // 0..1
        };
        const angle = seed(1) * Math.PI * 2; // full-circle emission
        const c = PARTICLE_PALETTE[Math.floor(seed(9) * PARTICLE_PALETTE.length) % PARTICLE_PALETTE.length];
        return {
          cos: Math.cos(angle),
          sin: Math.sin(angle),
          speed: 170 + seed(2) * 300, // outward reach
          size: 7 + seed(3) * 11,
          r: c[0],
          g: c[1],
          b: c[2],
          delay: seed(4) * 180, // tight stagger → one pop, not a drizzle
          duration: 1500 + seed(5) * 650,
          circle: seed(6) > 0.62, // ~38% sparks, rest flakes
          spin: (seed(7) > 0.5 ? 1 : -1) * (1.5 + seed(10) * 2), // rad/s-ish factor
          gravity: 340 + seed(8) * 300,
        };
      }),
    [],
  );

  const elapsed = useSharedValue(0);
  useEffect(() => {
    elapsed.value = withTiming(BURST_TOTAL_MS, {
      duration: BURST_TOTAL_MS,
      easing: Easing.linear,
    });
    return () => cancelAnimation(elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picture = useDerivedValue(() => {
    'worklet';
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, SCREEN_W, SCREEN_H));
    const e = elapsed.value;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const pa = particles[i];
      const local = e - pa.delay;
      if (local <= 0) continue;
      let p = local / pa.duration;
      if (p > 1) p = 1;
      // Eased outward reach (decelerating fan) + gravity arc on the vertical.
      const ep = 1 - Math.pow(1 - p, 3);
      const reach = pa.speed * ep;
      const x = BURST_ORIGIN_X + pa.cos * reach;
      const y = BURST_ORIGIN_Y + pa.sin * reach + pa.gravity * p * p;
      // Pop in fast, hold, fade out over the back ~28%.
      const op = p < 0.08 ? p / 0.08 : p > 0.72 ? (1 - p) / 0.28 : 1;
      const a = Math.max(0, Math.min(1, op));
      if (a <= 0) continue;
      paint.setColor(Skia.Color(`rgba(${pa.r}, ${pa.g}, ${pa.b}, ${a})`));
      if (pa.circle) {
        canvas.drawCircle(x, y, pa.size * 0.42, paint);
      } else {
        // Rotated rectangular flake (varied spin) for physical, non-uniform motion.
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(pa.spin * p * 320, 0, 0);
        canvas.drawRect(Skia.XYWHRect(-pa.size / 2, -pa.size * 0.32, pa.size, pa.size * 0.64), paint);
        canvas.restore();
      }
    }
    return recorder.finishRecordingAsPicture();
  });

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      <Canvas style={{ flex: 1 }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

/** Helper for callers: is this day one of the celebrated landmarks? */
export function isLandmarkDay(day: number): boolean {
  return LANDMARK_DAYS.includes(day);
}
