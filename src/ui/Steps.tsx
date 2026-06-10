import { View } from 'react-native';

/**
 * Quiz progress steps (styles.css .steps): 5pt segments — done = deep accent,
 * current = 32pt wide solid accent, upcoming = track. Replaces progress dots.
 */
export function Steps({ total, current, className = '' }: { total: number; current: number; className?: string }) {
  return (
    <View
      className={`flex-row items-center gap-[5px] ${className}`}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={`h-[5px] rounded-pill ${
            i < current ? 'w-4 bg-accent-deep' : i === current ? 'w-8 bg-accent' : 'w-4 bg-track'
          }`}
        />
      ))}
    </View>
  );
}
