import {
  Pressable,
  Text,
  ActivityIndicator,
  View,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '@/theme/colors';
import { PRESS_IN_SPRING, PRESS_OUT_SPRING } from '@/components/motion';

type Variant = 'primary' | 'ghost' | 'surface' | 'danger';

// Pressable driven by Reanimated so the press transform runs on the UI thread.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Bold Momentum button. Primary = electric lime block with near-black caps. */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}) {
  const box: Record<Variant, string> = {
    // Chunky "pressable key": a darker-volt bottom edge that shrinks 4->2px on
    // press while the face dims, so it reads as physically depressing. The
    // spring scale-down (below, Reanimated) owns the transform — NativeWind only
    // touches color + border here, so the two never fight over `transform`.
    primary: 'bg-volt border-b-4 border-volt-edge active:bg-volt-dim active:border-b-2',
    ghost: 'bg-transparent border border-line active:bg-coal',
    surface: 'bg-coal active:bg-card border border-line',
    danger: 'bg-sos border-b-4 border-sos-edge active:opacity-90 active:border-b-2',
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

  // Universal press physics: spring scale-down to 0.96 on press, spring back on
  // release. Runs on the UI thread; pass-through to any caller's press handlers.
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePressIn = (e: GestureResponderEvent) => {
    scale.value = withSpring(0.96, PRESS_IN_SPRING);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withSpring(1, PRESS_OUT_SPRING);
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      // Remount (not in-place update) across the disabled<->enabled boundary: the
      // NativeWind interop throws "navigation context" when it upgrades an already-
      // mounted Pressable from non-interactive (disabled, no active: variants) to
      // interactive in place. A keyed remount makes it a fresh mount, which works.
      key={off ? 'btn-off' : 'btn-on'}
      disabled={off}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-6 ${boxCls} ${className}`}
      style={typeof style === 'function' ? style : [lift, pressStyle, style]}
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
    </AnimatedPressable>
  );
}
