import { useEffect, type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Lime progress ring (react-native-svg + Reanimated 4). `progress` (0..1) drives a
 * REAL arc toward the next milestone — the hero element now encodes actual progress:
 *  - fills with a spring on mount and re-animates whenever `progress` changes,
 *  - carries a slow, barely-there shimmer along the lime stroke (alive at rest),
 *  - and surges once (a brightness flood + a gentle scale pop of the ring and the
 *    numeral inside it) each time `surge` increments — the check-in feedback beat.
 * All on the UI thread; observe-only (it watches props, drives nothing).
 */
export function RingGauge({
  progress,
  size = 240,
  stroke = 14,
  surge = 0,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  /** Increment this (e.g. on check-in success) to fire one surge. */
  surge?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));

  const p = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const surgeV = useSharedValue(0);

  // Fill on mount, then spring to every new progress value.
  useEffect(() => {
    p.value = withSpring(clamped, { damping: 18, stiffness: 80, mass: 0.9 });
  }, [clamped, p]);

  // Slow, barely-there shimmer travelling the stroke's brightness.
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1850, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [shimmer]);

  // Check-in surge: one satisfying brighten + pop, then settle.
  useEffect(() => {
    if (surge > 0) {
      surgeV.value = withSequence(
        withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      );
    }
  }, [surge, surgeV]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circ * (1 - p.value),
    // Resting shimmer 0.74..0.92; surge floods it to full.
    strokeOpacity: Math.min(1, 0.74 + shimmer.value * 0.18 + surgeV.value * 0.3),
  }));

  // Scale the whole ring (and the numeral it wraps) on surge — no SVG clipping,
  // unlike growing strokeWidth past the viewBox.
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + surgeV.value * 0.05 }],
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size }, containerStyle]}
      className="items-center justify-center"
    >
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.volt}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeLinecap="round"
          animatedProps={arcProps}
        />
      </Svg>
      {children}
    </Animated.View>
  );
}
