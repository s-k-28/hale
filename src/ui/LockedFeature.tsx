import { useCallback } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { usePremium } from '@/hooks/usePremium';
import { presentPaywall } from '@/lib/paywall';
import { track, Ev } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { clean } from '@/theme/clean';
import { H2, Body } from './Text';
import { Button } from './Button';

/**
 * LockedFeature — the ONE reusable lock-gate treatment (Clean Dark v2).
 *
 * Entitled (or still resolving) → children render untouched. Locked → the
 * premium content is rendered for layout only and FULLY HIDDEN behind a
 * near-opaque Clean Dark scrim with the lock chrome on top. No native blur
 * module is involved (a missing BlurView used to throw and leak content).
 * Tapping fires paywall_feature_tapped { feature } and presents the paywall.
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
}: {
  /** Stable id for analytics + paywall surface tagging (e.g. 'analytics'). */
  feature: string;
  children: React.ReactNode;
  variant?: 'overlay' | 'inline';
  title?: string;
  subtitle?: string;
}) {
  const { hasHALEPlus, loading } = usePremium();

  const open = useCallback(async () => {
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
      // Interaction haptic on the whole locked surface (press-in, the variant
      // default a primary Button would give). open() stays haptic-free, and the
      // inner "Unlock HALE+" Button auto-fires its own — so the two paths never
      // double-fire.
      onPressIn={() => haptics.press()}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle ?? ''}`.trim()}
      className={variant === 'overlay' ? 'flex-1' : ''}
      style={[styles.container, rounded]}
    >
      {/* The locked premium content: rendered for layout (so 'overlay' gates
          keep the screen's height) but inert and dimmed under an OPAQUE scrim.
          The gate must never depend on a native blur module — an unavailable
          BlurView used to throw 'Unimplemented component' and leak legible
          premium content under the overlay copy. */}
      <View pointerEvents="none" style={styles.contentLayer}>
        {children}
      </View>

      {/* Near-opaque Clean Dark scrim: fully hides the content and gives the
          lock chrome a solid backing — intentional, no blur required. */}
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
    // Belt and suspenders: even if the scrim ever failed to render, the
    // content underneath is too faint to read.
    opacity: 0.35,
  },
  scrim: {
    // Near-opaque base (#0B0F0D at 97%): premium content is NOT legible
    // through the gate, and the overlay copy sits on solid ground.
    backgroundColor: 'rgba(11,15,13,0.97)',
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
