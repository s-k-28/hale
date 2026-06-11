import { forwardRef, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { track, Ev } from '@/lib/analytics';
import { clean } from '@/theme/clean';

/**
 * TransformationCard — the viral seed (P3). A beautiful, screenshot-able proof
 * card the user shares to social: "Day X nicotine-free", money saved, a recovery
 * indicator, and a subtle HALE wordmark.
 *
 * Bold Momentum re-skin: near-black surface, an electric-lime gradient glow, a
 * HUGE Sora day number, "$X SAVED", an emerald recovery bar, and a
 * loud HALE wordmark. Built to be screenshotted on TikTok.
 *
 * Grounded in the share-card pattern proven by category leaders (Strava activity
 * cards, Duolingo streak cards, I-Am-Sober chips, Year-in-Review screens): a
 * single bold hero number, one supporting stat, a progress signal, and quiet
 * branding — built to read instantly in a feed thumbnail.
 *
 * NEVER gate this card. It is the acquisition loop; a premium wall here kills it.
 *
 * Rendering note: we deliberately avoid heavy GPU layers (Skia) inside the
 * capture target so react-native-view-shot reliably snapshots the node. The
 * gradient is an expo-linear-gradient (cheap, captures cleanly on iOS/Android).
 * Custom fonts get an explicit fontFamily alongside the NativeWind class so the
 * snapshot renders the loud type even off the main render tree.
 */

export type TransformationCardProps = {
  days: number;
  moneySaved: number;
  /** 0..100 recovery indicator. Optional; omit to hide the recovery row. */
  recoveryPct?: number;
  name?: string;
  /** When true, the hero numbers count up from 0 once on mount (celebration use).
   *  Default false → fully static, so the persistent profile card AND every share
   *  capture render the exact final values. */
  animate?: boolean;
  /** Celebration-only: drop the fixed 9:16 aspect ratio so the card sizes to its
   *  content and NOTHING clips. The share / profile usages keep the fixed aspect. */
  fitContent?: boolean;
};

// Capture-safe font families (mirror tailwind.config.js fontFamily entries).
const FONTS = {
  display: 'Sora_700Bold',
  heading: 'Sora_700Bold',
  body: 'Sora_500Medium',
  bodyBold: 'Sora_700Bold',
};

function fmtMoney(n: number) {
  const v = Math.max(0, n);
  // Whole-dollar on the card — it reads cleaner at thumbnail size than cents.
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

function clampPct(p: number) {
  return Math.min(100, Math.max(0, Math.round(p)));
}

/**
 * One-shot count-up 0 → target (easeOutCubic) on the JS thread, after a short
 * delay so it reads as "earning" the number once the card pops in. Settles to the
 * EXACT target, so a share capture (a deliberate, later tap) is always correct.
 * Inactive → returns the target immediately (fully static).
 */
function useCountUp(target: number, active: boolean, durationMs = 950, delayMs = 300) {
  const [value, setValue] = useState(active ? 0 : target);
  useEffect(() => {
    if (!active) {
      setValue(target);
      return;
    }
    let raf = 0;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setValue(target * eased);
        raf = requestAnimationFrame(tick);
      } else {
        setValue(target); // exact settle
      }
    };
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, active, durationMs, delayMs]);
  return value;
}

/**
 * The visual card. We forward a ref to the OUTER capture surface so callers (or
 * the built-in shareCard helper) can snapshot exactly this node.
 */
const TransformationCard = forwardRef<RNView, TransformationCardProps>(
  function TransformationCard({ days, moneySaved, recoveryPct, name, animate, fitContent }, ref) {
    const wholeDays = Math.max(0, Math.floor(days));
    const pct = recoveryPct === undefined ? null : clampPct(recoveryPct);
    const firstName = name?.trim().split(/\s+/)[0] || null;

    // Count-up displays — animate only in the celebration; static elsewhere and
    // for share captures (settles exact). Hooks are called unconditionally.
    const animateNums = !!animate;
    const dispDays = Math.round(useCountUp(wholeDays, animateNums));
    const dispMoney = useCountUp(moneySaved, animateNums);
    const dispPct = clampPct(useCountUp(pct ?? 0, animateNums && pct !== null));

    return (
      <View
        ref={ref}
        collapsable={false}
        // 9:16-ish proof card; fixed aspect so the capture is share-ready. The
        // inner gradient is flex:1, so the card MUST keep a defined aspect ratio —
        // in the celebration we use a TALLER ratio (fitContent) so the content has
        // room to breathe and the footer tagline can never clip.
        className="w-full overflow-hidden rounded-3xl bg-bg"
        style={{ aspectRatio: fitContent ? 0.64 : 0.72, backgroundColor: clean.bg }}
      >
        {/* Base near-black wash with a faint lime-tinted floor. */}
        <LinearGradient
          colors={['#0A0C0B', '#0E120D', '#0A0C0B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        >
          {/* Electric-lime glow blooming from the top-left (capture-safe). */}
          <LinearGradient
            colors={['rgba(52,211,153,0.42)', 'rgba(52,211,153,0.08)', 'rgba(52,211,153,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.85, y: 0.9 }}
            style={{
              position: 'absolute',
              top: -120,
              left: -100,
              right: -40,
              height: 360,
            }}
          />
          {/* Secondary low glow to seat the stat block in lime light. */}
          <LinearGradient
            colors={['rgba(52,211,153,0)', 'rgba(52,211,153,0.10)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              left: -40,
              right: -40,
              bottom: -60,
              height: 240,
            }}
          />

          <View className="flex-1 justify-between p-7">
            {/* Top: loud wordmark + optional name */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View
                  className="mr-2.5 h-7 w-7 items-center justify-center rounded-lg bg-accent"
                  style={{ backgroundColor: clean.accent }}
                >
                  <Text
                    className="text-base text-accent-ink"
                    style={{ fontFamily: FONTS.heading, color: clean.bg }}
                  >
                    H
                  </Text>
                </View>
                <Text
                  className="text-lg uppercase tracking-[4px] text-fg"
                  style={{ fontFamily: FONTS.heading, color: clean.fg }}
                >
                  HALE
                </Text>
              </View>
              {firstName ? (
                <Text
                  className="text-xs uppercase tracking-[2px] text-fg-2"
                  style={{ fontFamily: FONTS.bodyBold, color: clean.fg2 }}
                >
                  {firstName}
                </Text>
              ) : null}
            </View>

            {/* Hero: the day count — HUGE Sora numeral */}
            <View>
              <Text
                className="text-[11px] uppercase tracking-[5px] text-accent"
                style={{ fontFamily: FONTS.heading, color: clean.accent }}
              >
                Nicotine-free
              </Text>
              <View className="mt-1 flex-row items-end">
                <Text
                  className="text-accent-ink"
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 132,
                    // Tall numerals clip when lineHeight == fontSize;
                    // ~1.14x gives the glyph tops room (the "0"→"U" clip fix).
                    lineHeight: 150,
                    color: clean.fg,
                  }}
                >
                  {dispDays}
                </Text>
                <Text
                  className="mb-4 ml-3 text-accent"
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 34,
                    lineHeight: 36,
                    color: clean.accent,
                  }}
                >
                  {wholeDays === 1 ? 'DAY' : 'DAYS'}
                </Text>
              </View>
              <Text
                className="-mt-1 text-base text-fg"
                style={{ fontFamily: FONTS.body, color: clean.fg }}
              >
                {wholeDays === 1 ? 'and counting.' : 'clean and counting.'}
              </Text>
            </View>

            {/* Stats: money + recovery */}
            <View>
              <View
                className="rounded-2xl border border-stroke bg-surface-2 p-5"
                style={{ backgroundColor: clean.surface, borderColor: clean.stroke }}
              >
                <Text
                  className="text-[11px] uppercase tracking-[3px] text-fg-2"
                  style={{ fontFamily: FONTS.bodyBold, color: clean.fg2 }}
                >
                  Money saved
                </Text>
                <View className="mt-1 flex-row items-baseline">
                  <Text
                    className="text-fg"
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 54,
                      lineHeight: 58,
                      color: clean.fg,
                    }}
                  >
                    {fmtMoney(dispMoney)}
                  </Text>
                </View>

                {pct !== null ? (
                  <View className="mt-5">
                    <View className="flex-row items-center justify-between">
                      <Text
                        className="text-[11px] uppercase tracking-[3px] text-fg-2"
                        style={{ fontFamily: FONTS.bodyBold, color: clean.fg2 }}
                      >
                        Recovery
                      </Text>
                      <Text
                        className="text-sm text-fg"
                        style={{ fontFamily: FONTS.bodyBold, color: clean.fg }}
                      >
                        {dispPct}%
                      </Text>
                    </View>
                    <View
                      className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
                    >
                      <View
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${dispPct}%`,
                          backgroundColor: clean.accent,
                        }}
                      />
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Brand attribution — this card is screenshotted + shared, so the
                  wordmark is the viral hook and must read clearly. Phrase in a
                  legible mid-tone, HALE itself in fg so the brand pops. */}
              <Text
                className="mt-4 text-center text-[12px] uppercase tracking-[3px]"
                style={{ fontFamily: FONTS.bodyBold, color: '#97A39B' }}
              >
                Quit nicotine with{' '}
                <Text style={{ color: clean.fg }}>HALE</Text>
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  },
);

export default TransformationCard;

/**
 * shareCard — snapshot a captured node and hand it to the native share sheet.
 * Fires Ev.CARD_SHARED on a successful share. Resolves `false` (never throws to
 * the UI) when sharing is unavailable or the user cancels mid-capture.
 *
 * Usage:
 *   const cardRef = useRef<View>(null);
 *   <TransformationCard ref={cardRef} ... />
 *   await shareCard(cardRef, { day });
 */
export async function shareCard(
  ref: React.RefObject<RNView | null>,
  meta?: Record<string, unknown>,
): Promise<boolean> {
  try {
    if (!ref.current) return false;
    if (!(await Sharing.isAvailableAsync())) return false;

    const uri = await captureRef(ref, {
      format: 'png',
      quality: 1,
      // Crisp output for retina + social compression headroom.
      result: 'tmpfile',
    });

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share your progress',
      // UTI helps iOS route the PNG to image-aware targets.
      UTI: Platform.OS === 'ios' ? 'public.png' : undefined,
    });

    track(Ev.CARD_SHARED, meta);
    return true;
  } catch {
    // User cancel / capture hiccup — swallow; the card is never blocking.
    return false;
  }
}

/**
 * useCardShare — tiny convenience hook bundling a ref + a bound share() call so
 * screens don't re-implement the wiring. The ref must be attached to a
 * <TransformationCard ref={...} />.
 */
export function useCardShare(meta?: Record<string, unknown>) {
  const ref = useRef<RNView>(null);
  const share = () => shareCard(ref, meta);
  return { ref, share };
}
