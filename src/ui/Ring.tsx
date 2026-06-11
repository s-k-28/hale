import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { clean } from '@/theme/clean';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Clean Dark progress ring (design StreakRing) — the emotional centerpiece.
 * Track circle on white 6%, the arc strokes an accentDeep→accent2 gradient
 * with a soft emerald drop glow. `progress` (0..1) springs to each new value;
 * incrementing `surge` fires one brightness/scale pop (the check-in beat).
 * Same API as the old RingGauge so call sites map 1:1.
 */
export function Ring({
  progress,
  size = 240,
  stroke = 9,
  surge = 0,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  /** Increment this (e.g. on check-in success) to fire one surge pop. */
  surge?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2 - 3;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0.001, progress));

  const p = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    p.value = withSpring(clamped, { damping: 18, stiffness: 80, mass: 0.9 });
  }, [clamped, p]);

  // One surge pop per increment: quick rise, gentle settle.
  useEffect(() => {
    if (surge > 0) {
      pop.value = withSequence(
        withTiming(1, { duration: 140 }),
        withDelay(120, withSpring(0, { damping: 14, stiffness: 120 })),
      );
    }
  }, [surge, pop]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circ * (1 - p.value),
  }));
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.03 }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, popStyle]}>
      <Svg
        width={size}
        height={size}
        style={{
          transform: [{ rotate: '-90deg' }],
          shadowColor: clean.accent,
          shadowOpacity: 0.22,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <Defs>
          <LinearGradient id="ringG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={clean.accentDeep} />
            <Stop offset="1" stopColor={clean.accent2} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringG)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          animatedProps={arcProps}
        />
      </Svg>
      <View
        style={{ position: 'absolute', inset: 0 }}
        className="items-center justify-center"
      >
        {children}
      </View>
    </Animated.View>
  );
}
