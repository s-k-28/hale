import { Pressable, type PressableProps } from 'react-native';
import { RNText } from './internal';

/**
 * Selectable pill chip (styles.css .chip): 44pt, pill radius, surface-2 +
 * hairline; selected = solid accent with ink text. Single OR multi-select —
 * selection state is the caller's.
 */
export function Chip({
  label,
  on = false,
  className = '',
  ...props
}: PressableProps & { label: string; on?: boolean; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`h-11 items-center justify-center rounded-pill px-[18px] active:scale-[0.96] ${
        on ? 'bg-accent' : 'border border-stroke bg-surface-2'
      } ${className}`}
      {...props}
    >
      <RNText
        className={`text-[15px] ${on ? 'font-sora-semibold text-accent-ink' : 'font-sora-medium text-fg'}`}
      >
        {label}
      </RNText>
    </Pressable>
  );
}
