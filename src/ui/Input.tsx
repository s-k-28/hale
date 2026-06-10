import { TextInput, View, type TextInputProps } from 'react-native';
import { clean } from '@/theme/clean';
import { RNText } from './internal';

/**
 * Clean Dark inputs. Two treatments from the design:
 *  • Input — the standard 56pt field (styles.css .input): surface-2, radius 16.
 *  • UnderlineInput — the quiz big-numeral entry (Q2/Q3): giant 56pt/700
 *    numerals over a 2px underline that turns accent when filled; optional
 *    leading prefix ('$') and trailing unit ('a day' / 'each').
 * No native input chrome anywhere (anti-AI rule: spinners/focus bars killed).
 */

export function Input({ className = '', ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      placeholderTextColor={clean.fg3}
      className={`h-14 rounded-tile border border-stroke bg-surface-2 px-[18px] font-sora text-[16px] text-fg ${className}`}
      {...props}
    />
  );
}

export function UnderlineInput({
  filled,
  prefix,
  suffix,
  className = '',
  ...props
}: TextInputProps & {
  filled: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <View
      className={`flex-row items-end gap-2 border-b-2 pb-3.5 ${filled ? 'border-accent' : 'border-stroke-2'} ${className}`}
    >
      {prefix ? (
        <RNText
          className={`pb-1 font-sora-bold text-[42px] ${filled ? 'text-fg' : 'text-fg-3'}`}
        >
          {prefix}
        </RNText>
      ) : null}
      <TextInput
        placeholderTextColor={clean.fg3}
        className="flex-1 p-0 font-sora-bold text-[56px] leading-[60px] tracking-[-1.68px] text-fg"
        {...props}
      />
      {suffix ? (
        <RNText className="pb-1.5 font-sora text-[18px] text-fg-3">{suffix}</RNText>
      ) : null}
    </View>
  );
}
