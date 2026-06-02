import { Pressable, Text, ActivityIndicator, View, type PressableProps } from 'react-native';

type Variant = 'primary' | 'ghost' | 'surface' | 'danger';

/** Bold Momentum button. Primary = electric lime block with near-black caps. */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  ...rest
}: PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}) {
  const box: Record<Variant, string> = {
    primary: 'bg-volt active:bg-volt-dim',
    ghost: 'bg-transparent border border-line active:bg-coal',
    surface: 'bg-coal active:bg-card border border-line',
    danger: 'bg-sos active:opacity-90',
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
  return (
    <Pressable
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-6 ${boxCls} ${className}`}
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
