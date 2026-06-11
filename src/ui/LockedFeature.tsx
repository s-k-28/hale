import { useCallback } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Lock } from 'lucide-react-native';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { usePremium } from '@/hooks/usePremium';
import { presentPaywall } from '@/lib/paywall';
import { track, Ev } from '@/lib/analytics';
import { clean } from '@/theme/clean';
import { H2, Body } from './Text';
import { Button } from './Button';

/**
 * LockedFeature — the ONE reusable blurred-paywall treatment (Clean Dark v2,
 * the design's gate visual language applied to the inline blur — the
 * standalone gate screens in the prototype stayed unwired by its own flow map,
 * so gating keeps living in place over the real content).
 *
 * Entitled (or still resolving) → children render untouched. Locked → the real
 * premium content renders BLURRED and inert under a centered unlock CTA, so
 * free users see exactly what they're missing. Tapping fires
 * paywall_feature_tapped { feature } and presents the paywall.
 *
 * `variant`: 'overlay' fills its parent (whole-screen gates); 'inline' is a
 * self-sized rounded card (a gated section inside a screen).
 */
export function LockedFeature({
  feature,
  children,
  variant = 'inline',
  title = 'Unlock with HALE+',
  subtitle,
  blurIntensity = 22,
}: {
  /** Stable id for analytics + paywall surface tagging (e.g. 'analytics'). */
  feature: string;
  children: React.ReactNode;
  variant?: 'overlay' | 'inline';
  title?: string;
  subtitle?: string;
  blurIntensity?: number;
}) {
  const { hasHALEPlus, loading } = usePremium();

  const open = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track(Ev.PAYWALL_FEATURE_TAPPED, { feature });
    // presentPaywall already fires PAYWALL_VIEWED (tagged with the surface).
    const result = await presentPaywall(feature);
    // Scaffold / RC-unconfigured → fall back to the in-app paywall screen.
    if (result === PAYWALL_RESULT.NOT_PRESENTED) {
      router.push('/paywall');
    }
  }, [feature]);

  // Entitled (or still resolving — never flash a lock at a paying user): pass through.
  if (hasHALEPlus || loading) return <>{children}</>;

  const rounded = variant === 'inline' ? styles.inlineRadius : undefined;

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle ?? ''}`.trim()}
      className={variant === 'overlay' ? 'flex-1' : ''}
      style={[styles.container, rounded]}
    >
      {/* The real premium content, rendered but inert (blurred + untouchable). */}
      <View pointerEvents="none" style={styles.contentLayer}>
        {children}
      </View>

      {/* Gaussian blur over the content — "frosted glass" peek at what's locked. */}
      <BlurView
        intensity={blurIntensity}
        tint="dark"
        style={[StyleSheet.absoluteFill, rounded]}
        pointerEvents="none"
      />
      {/* Base-tinted scrim so the lock chrome reads on any underlying content. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, rounded]}
      />

      {/* Centered unlock CTA. */}
      <View pointerEvents="none" style={styles.cta}>
        <View style={styles.lockBadge}>
          <Lock size={20} color={clean.accentInk} strokeWidth={2.2} />
        </View>
        <H2 className="mt-4 text-center">{title}</H2>
        {subtitle ? (
          <Body className="mt-1.5 max-w-[260px] text-center">{subtitle}</Body>
        ) : null}
        {/* Visual affordance only; the whole surface is the tap target. */}
        <View className="mt-5 w-full max-w-[260px]">
          <Button variant="primary" label="Unlock HALE+" onPress={open} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 180,
  },
  inlineRadius: {
    borderRadius: 22,
  },
  contentLayer: {
    // Dim the underlying content a touch so the blur reads as "locked", not "loading".
    opacity: 0.6,
  },
  scrim: {
    backgroundColor: 'rgba(11,15,13,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.26)',
  },
  cta: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: clean.accent,
    shadowColor: clean.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
});
