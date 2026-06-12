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
 * Layout model (why the CTA can't clip): the lock chrome renders in NORMAL
 * FLOW so the container grows to fit whichever is taller — the chrome or the
 * wrapped children — while the children render ABSOLUTELY behind it (layout
 * backing only, inert + dimmed + scrimmed). 'overlay' fills its parent (flex-1,
 * whole-screen gates); 'inline' is a self-sized rounded card with a minHeight
 * floor (a gated section inside a screen).
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

  const overlay = variant === 'overlay';
  const rounded = overlay ? undefined : styles.inlineRadius;

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
      className={overlay ? 'flex-1' : ''}
      style={[styles.container, overlay ? styles.overlayFloor : styles.inlineFloor, rounded]}
    >
      {/* The locked premium content: rendered ABSOLUTELY for layout backing
          (so 'overlay' gates keep the screen's height and the surface always
          has texture under the chrome) but inert and dimmed under an OPAQUE
          scrim. Because the chrome below drives the container's intrinsic
          height, the CTA can never be clipped — even when the chrome is taller
          than the children (the 'inline' widgets case). The gate must never
          depend on a native blur module — an unavailable BlurView used to throw
          'Unimplemented component' and leak legible premium content. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.contentLayer]}>
        {children}
      </View>

      {/* Near-opaque Clean Dark scrim: fully hides the content and gives the
          lock chrome a solid backing — intentional, no blur required. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, rounded]}
      />

      {/* DESIGNED backdrop (zero content leak — pure decoration). A soft radial
          accent bloom seats the lock group in light; a faint dot-grid texture
          and a couple of large blurred-feeling accent rings give the empty gate
          quiet-luxury depth instead of reading as a broken void. Scaled down for
          'inline'. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Large blurred-feeling rings (low-opacity strokes, big radius). */}
        <View
          style={[
            styles.ring,
            overlay ? styles.ringLgOverlay : styles.ringLgInline,
          ]}
        />
        <View
          style={[
            styles.ring,
            overlay ? styles.ringSmOverlay : styles.ringSmInline,
          ]}
        />
        {/* Faint dot-grid texture, centered behind the lock group. */}
        <View style={styles.dotGridWrap}>
          <DotGrid overlay={overlay} />
        </View>
        {/* Soft radial accent glow (stacked translucent discs → fake radial). */}
        <View style={styles.glowWrap} pointerEvents="none">
          <View style={[styles.glow, overlay ? styles.glowOverlay : styles.glowInline]} />
          <View style={[styles.glow, overlay ? styles.glowCoreOverlay : styles.glowCoreInline]} />
        </View>
      </View>

      {/* Centered unlock chrome — IN NORMAL FLOW so the container grows to fit
          it. The lock group sits in a clear focal hierarchy over the backdrop. */}
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

/**
 * A faint dot grid (decorative texture, zero content). Plain Views — no images,
 * no deps. Dimmer + denser on the full-screen overlay, smaller for inline.
 */
function DotGrid({ overlay }: { overlay: boolean }) {
  const cols = overlay ? 7 : 5;
  const rows = overlay ? 7 : 4;
  const gap = overlay ? 26 : 20;
  const dot = 3;
  return (
    <View style={{ width: cols * gap, height: rows * gap }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {Array.from({ length: cols }).map((__, c) => (
            <View
              key={c}
              style={{
                width: gap,
                height: gap,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  backgroundColor: 'rgba(52,211,153,0.10)',
                }}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  // 'inline' is self-sized; the floor keeps a small gate from collapsing, but
  // the chrome (in normal flow) drives the real height so it can never clip.
  inlineFloor: {
    minHeight: 180,
  },
  // 'overlay' fills its flex parent; the chrome centers inside that space.
  overlayFloor: {
    minHeight: 320,
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
  // --- Decorative backdrop (all pointer-events:none, zero content) ----------
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.06)',
    backgroundColor: 'rgba(52,211,153,0.015)',
  },
  ringLgOverlay: {
    width: 460,
    height: 460,
    borderRadius: 230,
    top: -150,
    right: -170,
  },
  ringSmOverlay: {
    width: 300,
    height: 300,
    borderRadius: 150,
    bottom: -120,
    left: -130,
  },
  ringLgInline: {
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -80,
    right: -80,
  },
  ringSmInline: {
    width: 150,
    height: 150,
    borderRadius: 75,
    bottom: -70,
    left: -70,
  },
  dotGridWrap: {
    position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
  glowWrap: {
    position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Stacked translucent discs approximate a soft radial accent bloom (no
  // gradient/shadow dependency, captures + composites cleanly).
  glow: {
    position: 'absolute',
  },
  glowOverlay: {
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(52,211,153,0.05)',
  },
  glowCoreOverlay: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(52,211,153,0.06)',
  },
  glowInline: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(52,211,153,0.05)',
  },
  glowCoreInline: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(52,211,153,0.06)',
  },
  // --- Lock chrome (normal flow → drives container height) ------------------
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    flexGrow: 1,
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
