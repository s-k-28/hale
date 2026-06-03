import { Pressable, Text, ActivityIndicator, View, type PressableProps } from 'react-native';
import { colors } from '@/theme/colors';

type Variant = 'primary' | 'ghost' | 'surface' | 'danger';

/** Bold Momentum button. Primary = electric lime block with near-black caps. */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  style,
  ...rest
}: PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}) {
  const box: Record<Variant, string> = {
    // Chunky "pressable key": a darker-volt bottom edge + (below) an accent-tinted
    // lift. On press the face drops 2px and the edge shrinks 4->2px so the bottom
    // stays put and it reads as physically depressing. RN borders sit INSIDE the
    // box, so total height is unchanged — no layout jump.
    primary: 'bg-volt border-b-4 border-volt-edge active:bg-volt-dim active:border-b-2 active:translate-y-0.5',
    ghost: 'bg-transparent border border-line active:bg-coal',
    surface: 'bg-coal active:bg-card border border-line',
    danger: 'bg-sos border-b-4 border-sos-edge active:opacity-90 active:border-b-2 active:translate-y-0.5',
  };
  const txt: Record<Variant, string> = {
    primary: 'text-volt-ink',
    ghost: 'text-chalk',
    surface: 'text-chalk',
    danger: 'text-white',
  };
  const off = disabled || loading;
  // Disabled = a solid inactive surface, never lime-at-opacity (that read as olive
  // sludge). Loading keeps the variant color + a spinner so it still looks active-and-busy.
  const showDisabled = disabled && !loading;
  const boxCls = showDisabled ? 'bg-inactive border border-line' : box[variant];
  const txtCls = showDisabled ? 'text-inactive-foreground' : txt[variant];
  // Soft accent-tinted lift so the enabled chunky key floats above the dark
  // canvas. Disabled stays flat (recessed), reinforcing active-vs-inactive depth.
  const lift =
    !off && (variant === 'primary' || variant === 'danger')
      ? {
          shadowColor: variant === 'primary' ? colors.volt : colors.sos,
          shadowOpacity: 0.22,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }
      : undefined;
  return (
    <Pressable
      // Remount (not in-place update) across the disabled<->enabled boundary: the
      // NativeWind interop throws "navigation context" when it upgrades an already-
      // mounted Pressable from non-interactive (disabled, no active: variants) to
      // interactive in place. A keyed remount makes it a fresh mount, which works.
      key={off ? 'btn-off' : 'btn-on'}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-6 ${boxCls} ${className}`}
      style={typeof style === 'function' ? style : [lift, style]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0A0C0B' : '#C6FF3D'} />
      ) : (
        <View>
          <Text className={`font-heading text-[15px] uppercase tracking-wide ${txtCls}`}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
