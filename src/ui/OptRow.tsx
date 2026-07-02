import { Pressable, View, type PressableProps, type GestureResponderEvent } from 'react-native';
import { clean } from '@/theme/clean';
import { haptics } from '@/lib/haptics';
import { RNText } from './internal';

/**
 * Selectable option row (styles.css .optrow): the quiz/single-select list
 * pattern. Surface row, optional 42pt icon chip, label, trailing radio.
 * Selected = accent-soft fill + accent ring; icon chip flips solid accent;
 * radio fills. The 2-col checkbox TILE variant for multi-select (Q4) lives
 * with the quiz screen — it's a one-screen pattern.
 */
export function OptRow({
  label,
  sub,
  on = false,
  icon,
  className = '',
  onPressIn,
  ...props
}: PressableProps & {
  label: string;
  sub?: string;
  on?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  // A quiz/single-select row is a selection → the selection tick. Chained.
  const handlePressIn = (e: GestureResponderEvent) => {
    haptics.select();
    onPressIn?.(e);
  };
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      className={`w-full flex-row items-center gap-4 rounded-tile px-[18px] py-[17px] active:scale-[0.99] ${
        on ? 'border-[1.5px] border-accent-edge bg-accent-soft' : 'border border-stroke bg-surface'
      } ${className}`}
      onPressIn={handlePressIn}
      {...props}
    >
      {icon ? (
        <View
          className={`h-[42px] w-[42px] items-center justify-center rounded-xl ${
            on ? 'bg-accent' : 'border border-stroke bg-surface-2'
          }`}
        >
          {icon}
        </View>
      ) : null}
      <View className="flex-1">
        <RNText className="font-sora-semibold text-[16px] text-fg">{label}</RNText>
        {sub ? <RNText className="mt-0.5 font-sora text-[13px] text-fg-2">{sub}</RNText> : null}
      </View>
      <View
        className="h-[23px] w-[23px] items-center justify-center rounded-pill border-2"
        style={{ borderColor: on ? clean.accent : clean.stroke2 }}
      >
        {on ? <View className="h-[11px] w-[11px] rounded-pill bg-accent" /> : null}
      </View>
    </Pressable>
  );
}
