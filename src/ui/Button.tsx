import { Pressable, ActivityIndicator, View, type PressableProps, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { clean } from '@/theme/clean';
import { haptics } from '@/lib/haptics';
import { RNText } from './internal';

/**
 * Clean Dark button (styles.css .btn) — 56pt, radius 16, weight 700.
 * Variants: primary (THE one emerald action per screen, soft glow),
 * secondary (surface-2 + hairline), ghost (transparent, 50pt),
 * coral (SOS/danger ONLY), warm (buddy/together ONLY). `sm` → 46pt/radius 12.
 * Press = scale .98 (design's transform), no chunky edge (that was Bold Momentum).
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'coral' | 'warm';

/** Press-in haptic. Defaults by variant (see HAPTIC); 'none' opts out. */
export type ButtonHaptic = 'press' | 'tap' | 'select' | 'none';

// Interactions are owned by the primitive (see lib/haptics ownership rules):
// the loud emerald/danger/buddy actions get a Medium press; quieter
// secondary/ghost actions get a Light tap.
const HAPTIC: Record<ButtonVariant, ButtonHaptic> = {
  primary: 'press',
  coral: 'press',
  warm: 'press',
  secondary: 'tap',
  ghost: 'tap',
};

const SURFACE: Record<ButtonVariant, string> = {
  primary: 'bg-accent',
  secondary: 'bg-surface-2 border border-stroke-2',
  ghost: 'bg-transparent',
  coral: 'bg-coral',
  warm: 'bg-warm',
};
const LABEL: Record<ButtonVariant, string> = {
  primary: 'text-accent-ink',
  secondary: 'text-fg',
  ghost: 'text-fg-2',
  coral: 'text-coral-ink',
  warm: 'text-warm-ink',
};
const SPINNER: Record<ButtonVariant, string> = {
  primary: clean.accentInk,
  secondary: clean.fg,
  ghost: clean.fg2,
  coral: clean.coralInk,
  warm: clean.warmInk,
};

export function Button({
  label,
  variant = 'primary',
  sm = false,
  loading = false,
  disabled,
  icon,
  haptic,
  className = '',
  onPressIn,
  ...props
}: PressableProps & {
  label: string;
  variant?: ButtonVariant;
  sm?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  haptic?: ButtonHaptic;
  className?: string;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const off = disabled || loading;
  const fb = haptic ?? HAPTIC[variant];

  // The scale spring, the variant haptic, and any caller-passed onPressIn all
  // run from this one handler. It MUST be destructured out of props above and
  // wired explicitly — the {...props} spread sits below and would otherwise
  // overwrite it (the caller's onPressIn would replace ours, killing the
  // spring + haptic). Off (disabled/loading) → no spring, no haptic.
  const handlePressIn = (e: GestureResponderEvent) => {
    if (!off) {
      scale.value = withSpring(0.98, { damping: 20, stiffness: 400 });
      if (fb !== 'none') haptics[fb]();
    }
    onPressIn?.(e);
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={off}
      onPressIn={handlePressIn}
      onPressOut={() => (scale.value = withSpring(1, { damping: 20, stiffness: 400 }))}
      style={[
        aStyle,
        variant === 'primary' && !off
          ? { shadowColor: clean.accent, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } }
          : null,
      ]}
      className={`flex-row items-center justify-center gap-2 ${sm ? 'h-[46px] rounded-xl' : variant === 'ghost' ? 'h-[50px] rounded-tile' : 'h-14 rounded-tile'} ${SURFACE[variant]} ${off ? 'opacity-40' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={SPINNER[variant]} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <RNText
            className={`font-sora-bold ${sm ? 'text-[14px]' : 'text-[16px]'} tracking-[-0.16px] ${LABEL[variant]}`}
          >
            {label}
          </RNText>
        </>
      )}
    </AnimatedPressable>
  );
}
