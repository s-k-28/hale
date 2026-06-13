import { Pressable, type PressableProps, type GestureResponderEvent } from 'react-native';
import { haptics } from '@/lib/haptics';

/**
 * Circular icon button (styles.css .iconbtn): 44pt, surface-2 + hairline.
 * The standard back-chevron (top-left) and close-X (top-right) chrome.
 */
export function IconBtn({
  className = '',
  children,
  onPressIn,
  ...props
}: PressableProps & { className?: string }) {
  // Chrome controls feel like secondary actions → a Light tap. Chained so a
  // caller-passed onPressIn still runs.
  const handlePressIn = (e: GestureResponderEvent) => {
    haptics.tap();
    onPressIn?.(e);
  };
  return (
    <Pressable
      accessibilityRole="button"
      className={`h-11 w-11 items-center justify-center rounded-pill border border-stroke bg-surface-2 active:scale-[0.94] ${className}`}
      onPressIn={handlePressIn}
      {...props}
    >
      {children}
    </Pressable>
  );
}
