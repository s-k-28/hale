import { useEffect, useMemo, useRef } from 'react';
import { Dimensions, Modal, Pressable, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { LANDMARK_DAYS } from '@convex/model/plan';
import { track, Ev } from '@/lib/analytics';
import { Button } from '@/components/ui/Button';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import TransformationCard, { shareCard } from './TransformationCard';

/**
 * MilestoneCelebration — full-screen celebration shown the moment a LANDMARK_DAYS
 * threshold is crossed (1/3/7/14/30/60/90/180/365). It is the emotional spike
 * that motivates the share: lime confetti rains, the TransformationCard presents,
 * and a single prominent Share CTA turns the moment into acquisition.
 *
 * Bold Momentum re-skin: a near-black void overlay, electric-lime confetti, the
 * reskinned card popped in, loud Anton/Archivo type, and a "SHARE THIS MOMENT"
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
// Electric-lime confetti — the one loud accent, with chalk + dim sparks.
const CONFETTI_COLORS = ['#C6FF3D', '#C6FF3D', '#9FD22E', '#F4F7F2', '#8A938C'];
const CONFETTI_COUNT = 30;

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

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-void" style={{ backgroundColor: colors.void }}>
        {/* Confetti layer — sits behind the content, above the background. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
            <ConfettiPiece key={i} index={i} />
          ))}
        </View>

        <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
          <View className="flex-1 px-6 pb-6">
            {/* Dismiss */}
            <View className="flex-row justify-end pt-2">
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-coal active:bg-card"
              >
                <X color={colors.chalk} size={18} strokeWidth={2.5} />
              </Pressable>
            </View>

            {/* Title */}
            <View className="mt-1 items-center">
              <View className="rounded-full bg-volt px-3 py-1">
                <Label className="text-volt-ink" style={{ color: colors.void }}>
                  Milestone reached
                </Label>
              </View>
              <Heading className="mt-4 text-center text-3xl leading-[1.05] text-chalk">
                {copy.title}
              </Heading>
              <Body className="mt-2 text-center text-base text-ash">
                {copy.sub}
              </Body>
            </View>

            {/* The shareable artifact, popped in. */}
            <PoppedCard>
              {/* Float the shareable card on its own plane with a volt-glow halo
                  (the card's own surface is intentionally left untouched — it is
                  the share artifact). The glow + the demoted headline above make
                  the card's "30" the single hero. */}
              <View
                style={{
                  // Wider here (celebration-only) so the fixed-aspect card is tall
                  // enough to show its footer tagline — fixes the clipped
                  // "QUIT NICOTINE WITH HALE" without touching the shared artifact.
                  width: Math.min(330, SCREEN_W - 56),
                  shadowColor: colors.volt,
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
                <Label className="text-ash">Keep going</Label>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
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
 * A single confetti flake: falls from above the top edge to below the bottom,
 * drifting and spinning. Deterministic per-index pseudo-randomness keeps the
 * render cheap and avoids re-seeding on every frame.
 */
function ConfettiPiece({ index }: { index: number }) {
  // Stable pseudo-random params from the index (no Math.random in render path).
  const params = useMemo(() => {
    const seed = (n: number) => {
      const x = Math.sin((index + 1) * 9301 + n * 49297) * 233280;
      return x - Math.floor(x); // 0..1
    };
    return {
      startX: seed(1) * SCREEN_W,
      drift: (seed(2) - 0.5) * 120,
      size: 7 + seed(3) * 8,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      delay: seed(4) * 900,
      duration: 2600 + seed(5) * 1600,
      rounded: seed(6) > 0.5,
      spin: seed(7) > 0.5 ? 1 : -1,
    };
  }, [index]);

  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      params.delay,
      withRepeat(
        withTiming(1, { duration: params.duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(t);
  }, [t, params.delay, params.duration]);

  const style = useAnimatedStyle(() => {
    const y = -40 + t.value * (SCREEN_H + 80);
    const x = params.drift * Math.sin(t.value * Math.PI * 2);
    const rot = params.spin * t.value * 360 * 2;
    // Fade out near the very bottom so pieces don't pop off-screen.
    const opacity = t.value > 0.92 ? (1 - t.value) / 0.08 : 1;
    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rot}deg` },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: params.startX,
          top: 0,
          width: params.size,
          height: params.size,
          backgroundColor: params.color,
          borderRadius: params.rounded ? params.size / 2 : 2,
        },
        style,
      ]}
    />
  );
}

/** Helper for callers: is this day one of the celebrated landmarks? */
export function isLandmarkDay(day: number): boolean {
  return LANDMARK_DAYS.includes(day);
}
