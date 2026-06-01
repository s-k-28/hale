import { forwardRef, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { track, Ev } from '@/lib/analytics';
import { colors } from '@/theme/colors';

/**
 * TransformationCard — the viral seed (P3). A beautiful, screenshot-able proof
 * card the user shares to social: "Day X nicotine-free", money saved, a recovery
 * indicator, and a subtle HALE wordmark.
 *
 * Bold Momentum re-skin: near-black surface, an electric-lime gradient glow, a
 * HUGE Anton (font-display) day number, "$X SAVED", a lime recovery bar, and a
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
};

// Capture-safe font families (mirror tailwind.config.js fontFamily entries).
const FONTS = {
  display: 'Anton_400Regular',
  heading: 'Archivo_800ExtraBold',
  body: 'HankenGrotesk_500Medium',
  bodyBold: 'HankenGrotesk_700Bold',
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
 * The visual card. We forward a ref to the OUTER capture surface so callers (or
 * the built-in shareCard helper) can snapshot exactly this node.
 */
const TransformationCard = forwardRef<RNView, TransformationCardProps>(
  function TransformationCard({ days, moneySaved, recoveryPct, name }, ref) {
    const wholeDays = Math.max(0, Math.floor(days));
    const pct = recoveryPct === undefined ? null : clampPct(recoveryPct);
    const firstName = name?.trim().split(/\s+/)[0] || null;

    return (
      <View
        ref={ref}
        collapsable={false}
        // 9:16-ish proof card; fixed aspect so the capture is share-ready.
        className="w-full overflow-hidden rounded-3xl bg-void"
        style={{ aspectRatio: 0.72, backgroundColor: colors.void }}
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
            colors={['rgba(198,255,61,0.42)', 'rgba(198,255,61,0.08)', 'rgba(198,255,61,0)']}
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
            colors={['rgba(198,255,61,0)', 'rgba(198,255,61,0.10)']}
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
                  className="mr-2.5 h-7 w-7 items-center justify-center rounded-lg bg-volt"
                  style={{ backgroundColor: colors.volt }}
                >
                  <Text
                    className="text-base text-volt-ink"
                    style={{ fontFamily: FONTS.heading, color: colors.void }}
                  >
                    H
                  </Text>
                </View>
                <Text
                  className="text-lg uppercase tracking-[4px] text-chalk"
                  style={{ fontFamily: FONTS.heading, color: colors.chalk }}
                >
                  HALE
                </Text>
              </View>
              {firstName ? (
                <Text
                  className="text-xs uppercase tracking-[2px] text-ash"
                  style={{ fontFamily: FONTS.bodyBold, color: colors.ash }}
                >
                  {firstName}
                </Text>
              ) : null}
            </View>

            {/* Hero: the day count — HUGE Anton numeral */}
            <View>
              <Text
                className="text-[11px] uppercase tracking-[5px] text-volt"
                style={{ fontFamily: FONTS.heading, color: colors.volt }}
              >
                Nicotine-free
              </Text>
              <View className="mt-1 flex-row items-end">
                <Text
                  className="text-volt-ink"
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 132,
                    lineHeight: 132,
                    color: colors.chalk,
                  }}
                >
                  {wholeDays}
                </Text>
                <Text
                  className="mb-4 ml-3 text-volt"
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 34,
                    lineHeight: 36,
                    color: colors.volt,
                  }}
                >
                  {wholeDays === 1 ? 'DAY' : 'DAYS'}
                </Text>
              </View>
              <Text
                className="-mt-1 text-base text-chalk"
                style={{ fontFamily: FONTS.body, color: colors.chalk }}
              >
                {wholeDays === 1 ? 'and counting.' : 'clean and counting.'}
              </Text>
            </View>

            {/* Stats: money + recovery */}
            <View>
              <View
                className="rounded-2xl border border-line bg-card p-5"
                style={{ backgroundColor: colors.card, borderColor: colors.line }}
              >
                <Text
                  className="text-[11px] uppercase tracking-[3px] text-ash"
                  style={{ fontFamily: FONTS.bodyBold, color: colors.ash }}
                >
                  Money saved
                </Text>
                <View className="mt-1 flex-row items-baseline">
                  <Text
                    className="text-volt"
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 54,
                      lineHeight: 58,
                      color: colors.volt,
                    }}
                  >
                    {fmtMoney(moneySaved)}
                  </Text>
                </View>

                {pct !== null ? (
                  <View className="mt-5">
                    <View className="flex-row items-center justify-between">
                      <Text
                        className="text-[11px] uppercase tracking-[3px] text-ash"
                        style={{ fontFamily: FONTS.bodyBold, color: colors.ash }}
                      >
                        Recovery
                      </Text>
                      <Text
                        className="text-sm text-chalk"
                        style={{ fontFamily: FONTS.bodyBold, color: colors.chalk }}
                      >
                        {pct}%
                      </Text>
                    </View>
                    <View
                      className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: '#1F2723' }}
                    >
                      <View
                        className="h-full rounded-full bg-volt"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: colors.volt,
                        }}
                      />
                    </View>
                  </View>
                ) : null}
              </View>

              <Text
                className="mt-4 text-center text-[11px] uppercase tracking-[3px] text-ash"
                style={{ fontFamily: FONTS.bodyBold, color: colors.ash }}
              >
                Quit nicotine with HALE
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
