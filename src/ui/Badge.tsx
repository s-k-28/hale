import { View, type ViewProps } from 'react-native';
import { RNText } from './internal';

/**
 * Status badge (styles.css .badge): 30pt pill, 12pt/600 caps.
 * Tones: accent-soft (default), solid accent, warm (buddy lane).
 * NOTE the anti-AI rule from the design chat: badges never sit ABOVE
 * headlines as decorative status pills — use only for inline state
 * (HALE+ marker, streak count, league rank).
 */
export function Badge({
  label,
  tone = 'soft',
  className = '',
  ...props
}: ViewProps & { label: string; tone?: 'soft' | 'solid' | 'warm'; className?: string }) {
  const box =
    tone === 'solid'
      ? 'bg-accent'
      : tone === 'warm'
        ? 'border border-warm-edge bg-warm-soft'
        : 'border border-accent-edge bg-accent-soft';
  const txt =
    tone === 'solid' ? 'text-accent-ink' : tone === 'warm' ? 'text-warm' : 'text-accent';
  return (
    <View
      className={`h-[30px] flex-row items-center justify-center self-start rounded-pill px-[13px] ${box} ${className}`}
      {...props}
    >
      <RNText className={`font-sora-semibold text-[12px] uppercase tracking-[0.72px] ${txt}`}>
        {label}
      </RNText>
    </View>
  );
}
