import { View, type ViewProps } from 'react-native';
import { RNText } from './internal';

/**
 * Stat tile (styles.css .tile): surface, radius 16, uppercase 11.5pt key over
 * a 28pt/700 value. The Clean Dark replacement for Bold Momentum's StatTile.
 */
export function Tile({
  k,
  v,
  accent = false,
  className = '',
  children,
  ...props
}: ViewProps & { k: string; v?: string | number; accent?: boolean; className?: string }) {
  return (
    <View
      className={`rounded-tile border border-stroke bg-surface px-[18px] py-4 ${className}`}
      {...props}
    >
      <RNText className="font-sora-semibold text-[11.5px] uppercase tracking-[0.92px] text-fg-3">
        {k}
      </RNText>
      {v !== undefined ? (
        <RNText
          className={`mt-1.5 font-sora-bold text-[28px] tracking-[-0.56px] ${accent ? 'text-accent' : 'text-fg'}`}
        >
          {v}
        </RNText>
      ) : null}
      {children}
    </View>
  );
}
