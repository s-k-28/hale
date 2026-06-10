import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

/**
 * Progress track (styles.css .track): 8pt pill trough (white 8%), accent fill,
 * 600ms eased width animation. `warm`/`coral` recolor for their lanes.
 */
export function Track({
  progress,
  tone = 'accent',
  className = '',
}: {
  /** 0..1 */
  progress: number;
  tone?: 'accent' | 'warm' | 'coral';
  className?: string;
}) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.min(1, Math.max(0, progress)), {
      duration: 600,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [progress, w]);
  const aStyle = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  const fill = tone === 'warm' ? 'bg-warm' : tone === 'coral' ? 'bg-coral' : 'bg-accent';
  return (
    <View className={`h-2 overflow-hidden rounded-pill bg-track ${className}`}>
      <Animated.View className={`h-full rounded-pill ${fill}`} style={aStyle} />
    </View>
  );
}
