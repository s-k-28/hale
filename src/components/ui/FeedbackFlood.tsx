import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/theme/colors';

/**
 * FeedbackFlood — the shared SEMANTIC color-flood for a meaningful moment. A brief
 * wash of volt (success) or coral (warning) over its parent zone, then it fades and
 * self-unmounts via onDone. One definition so "instant color-flooded feedback"
 * looks identical everywhere (Today check-in, Squad share, etc.).
 *
 * OBSERVE-ONLY: the parent mounts this (keyed/conditional) WHEN an existing state
 * transition fires — it never triggers, gates, or delays any mutation. pointerEvents
 * is set in `style` (the Fabric-reliable form), so it never swallows a tap.
 */
export function FeedbackFlood({
  tone = 'success',
  radius = 24,
  onDone,
}: {
  tone?: 'success' | 'warning';
  radius?: number;
  onDone?: () => void;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSequence(
      withTiming(1, { duration: 170, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 540, easing: Easing.in(Easing.quad) }),
    );
    const t = setTimeout(() => onDone?.(), 760);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: p.value * 0.22 }));

  return (
    <Animated.View
      style={[
        {
          pointerEvents: 'none',
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: radius,
          backgroundColor: tone === 'success' ? colors.volt : colors.sos,
        },
        style,
      ]}
    />
  );
}
