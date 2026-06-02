import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Flame } from 'lucide-react-native';
import { colors } from '@/theme/colors';

/**
 * One-shot celebratory burst for the daily check-in — the most-repeated moment in
 * the app, so it has to feel earned every time. A flame ignites with a spring
 * overshoot, ringed by lime sparks flying outward and fading. Re-fires whenever
 * `trigger` increments. Purely additive overlay (pointerEvents none) — it draws
 * over the check-in button and never affects layout or interaction.
 *
 * Reanimated 4 (UI-thread springs). Grounded in Duolingo's lesson-complete /
 * streak-flame motion: brief, punchy, physical.
 */
const SPARK_COUNT = 10;
const SPARK_RADIUS = 84;

export default function CheckInBurst({ onDone }: { onDone?: () => void }) {
  const flameScale = useSharedValue(0);
  const flameOpacity = useSharedValue(0);
  const burst = useSharedValue(0);

  useEffect(() => {
    // The parent mounts this ONLY for the burst's lifetime, so it never overlays —
    // and can never block — the check-in button at rest. Animate on mount, then
    // signal completion so the parent unmounts it.
    flameOpacity.value = withSequence(
      withTiming(1, { duration: 90 }),
      withDelay(420, withTiming(0, { duration: 360 })),
    );
    flameScale.value = withSequence(
      withSpring(1.18, { damping: 7, stiffness: 180, mass: 0.6 }),
      withSpring(1, { damping: 12, stiffness: 160 }),
    );
    burst.value = withTiming(1, { duration: 720 });
    const t = setTimeout(() => onDone?.(), 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flameStyle = useAnimatedStyle(() => ({
    opacity: flameOpacity.value,
    transform: [{ scale: flameScale.value }],
  }));

  return (
    <View
      // pointerEvents MUST be in style under the New Architecture (Fabric) — the legacy
      // prop form is not reliably respected, and this overlay sits on top of the
      // check-in button, so a prop-only "none" silently swallows every tap.
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: SPARK_COUNT }).map((_, i) => (
        <Spark key={i} index={i} burst={burst} />
      ))}
      <Animated.View style={flameStyle}>
        <Flame color={colors.volt} fill={colors.volt} size={46} strokeWidth={2} />
      </Animated.View>
    </View>
  );
}

function Spark({ index, burst }: { index: number; burst: SharedValue<number> }) {
  // Even radial spread with a touch of jitter so it reads organic, not mechanical.
  const angle = (index / SPARK_COUNT) * Math.PI * 2 + (index % 2 ? 0.32 : -0.18);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const style = useAnimatedStyle(() => {
    const r = interpolate(burst.value, [0, 1], [10, SPARK_RADIUS], Extrapolation.CLAMP);
    const opacity = interpolate(burst.value, [0, 0.12, 0.7, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    const scale = interpolate(burst.value, [0, 0.25, 1], [0.2, 1, 0.35], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateX: dx * r }, { translateY: dy * r }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.volt },
        style,
      ]}
    />
  );
}
