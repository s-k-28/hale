import { View, type ViewProps } from 'react-native';

type Level = 'raised' | 'flat' | 'recessed';

/**
 * Elevation primitive for HALE's near-black canvas. On a dark UI "closer to the
 * viewer" reads as a LIGHTER fill + a faint volt rim-light, not a heavy drop
 * shadow (shadows are nearly invisible on #0A0C0B). Three planes:
 *
 *   • raised   — the focal / hero plane: lighter `raised` fill, a soft shadow,
 *                and a 1px volt-tinted top rim so it visibly floats.
 *   • flat     — the default surface: coal + a hairline `line` border.
 *   • recessed — subordinate / secondary content: sinks toward the void, no
 *                border, so the eye reads it as behind the focal plane.
 *
 * Purely presentational. Compose freely — pass `className` for padding / radius
 * overrides (a later radius class wins over the default `rounded-card`).
 */
export function Surface({
  level = 'flat',
  rim = true,
  className = '',
  style,
  children,
  ...rest
}: ViewProps & { level?: Level; rim?: boolean; className?: string }) {
  const base: Record<Level, string> = {
    raised: 'bg-raised rounded-card',
    flat: 'bg-coal border border-line rounded-card',
    recessed: 'bg-coal/40 rounded-card',
  };
  const elev =
    level === 'raised'
      ? {
          shadowColor: '#000000',
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          ...(rim ? { borderTopWidth: 1, borderTopColor: 'rgba(198,255,61,0.16)' } : null),
        }
      : undefined;
  return (
    <View className={`${base[level]} ${className}`} style={[elev, style]} {...rest}>
      {children}
    </View>
  );
}
