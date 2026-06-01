import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// The Sage companion mark — a calm "breathing" lime creature. Placeholder for a
// Rive .riv state machine (idle/encourage/celebrate) once the asset exists.
const sage = require('../../assets/images/sage.png');

export function SageMark({ size = 96 }: { size?: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.06, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.Image
      source={sage}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}
