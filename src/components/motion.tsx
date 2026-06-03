import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

/**
 * HALE motion primitives (Reanimated 4). Code-generated only — no Lottie/Rive.
 * Built once here and applied across screens so the app's motion language stays
 * consistent: content rises a few px while fading in, spring-eased.
 */

// Universal "press" spring used by the shared Button for the 0.96 scale-down.
// Snappy in, soft settle out. Exported so other custom pressables can match.
export const PRESS_IN_SPRING = { damping: 15, stiffness: 420, mass: 0.5 } as const;
export const PRESS_OUT_SPRING = { damping: 12, stiffness: 320, mass: 0.6 } as const;

// The shared "rise + fade" entrance spring (slight settle, no harsh overshoot).
const RISE_SPRING = { damping: 20, stiffness: 150, mass: 0.85 } as const;

type RiseInProps = {
  children: ReactNode;
  /** Stagger position in a list/section — each step delays 40ms. */
  index?: number;
  /** Extra delay (ms) on top of the index stagger. */
  delay?: number;
  /** Rise distance in px (spec default 12). */
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Fade-rises its children in on mount: opacity 0->1 + translateY {distance}->0.
 * Stagger a section by passing each row's index (40ms steps). Mount-driven
 * shared value (not an `entering=` layout animation) so it's deterministic on
 * Fabric and never fights expo-router's native screen transition.
 */
export function RiseIn({ children, index = 0, delay = 0, distance = 12, style }: RiseInProps) {
  const p = useSharedValue(0);
  useEffect(() => {
    const wait = index * 40 + delay;
    p.value = withDelay(wait, withSpring(1, RISE_SPRING));
  }, [p, index, delay]);

  const animStyle = useAnimatedStyle(() => ({
    // Spring can overshoot slightly past 1 — clamp opacity so there's no flicker.
    opacity: Math.min(1, p.value),
    transform: [{ translateY: (1 - p.value) * distance }],
  }));

  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}
