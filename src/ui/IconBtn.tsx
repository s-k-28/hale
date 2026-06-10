import { Pressable, type PressableProps } from 'react-native';

/**
 * Circular icon button (styles.css .iconbtn): 44pt, surface-2 + hairline.
 * The standard back-chevron (top-left) and close-X (top-right) chrome.
 */
export function IconBtn({
  className = '',
  children,
  ...props
}: PressableProps & { className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`h-11 w-11 items-center justify-center rounded-pill border border-stroke bg-surface-2 active:scale-[0.94] ${className}`}
      {...props}
    >
      {children}
    </Pressable>
  );
}
