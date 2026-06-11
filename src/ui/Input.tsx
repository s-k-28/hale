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

export function Input({
  className = '',
  placeholder,
  value,
  ...props
}: TextInputProps & { className?: string }) {
  return (
    <View className={`relative ${className}`}>
      <TextInput
        // Typed text centers via explicit height + zero native padding + an
        // explicit line box (Sora's oversized ascender bottom-pins it otherwise).
        value={value}
        style={{ height: 56, paddingVertical: 0 }}
        className="rounded-tile border border-stroke bg-surface-2 px-[18px] font-sora text-[16px] leading-[20px] text-fg"
        {...props}
      />
      {/* iOS draws NATIVE placeholders with the raw font metrics, ignoring the
          line box — Sora's ascent sinks them to the bottom edge. So the
          placeholder is ours: an overlay Text that obeys the same line box.
          (Controlled-value callers only; all current call sites are.) */}
      {!value && placeholder ? (
        <View pointerEvents="none" className="absolute inset-0 justify-center px-[18px]">
          <RNText className="font-sora text-[16px] leading-[20px] text-fg-3">{placeholder}</RNText>
        </View>
      ) : null}
    </View>
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
        // 56pt Sora needs ≥62pt of line box or descender-adjacent glyphs clip.
        style={{ paddingVertical: 0, textAlignVertical: 'center', height: 64 }}
        className="flex-1 p-0 font-sora-bold text-[56px] leading-[62px] tracking-[-1.68px] text-fg"
        {...props}
      />
      {suffix ? (
        <RNText className="pb-1.5 font-sora text-[18px] text-fg-3">{suffix}</RNText>
      ) : null}
    </View>
  );
}
