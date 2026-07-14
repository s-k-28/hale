import { forwardRef, memo, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { track, Ev } from '@/lib/analytics';
import { moneySavedLabel } from '@/lib/money';
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

// Whole-dollar reads cleaner at thumbnail size, but ONLY once there are whole
// dollars to show: rounding rendered "$0" for a day-one quitter on the very
// artifact they share. moneySavedLabel keeps cents under $10 and drops them above.
const fmtMoney = moneySavedLabel;

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
 * The count-up runs on the JS thread (rAF + setState, ~57 frames). That is
 * deliberate and must stay: this card is the SHARE CAPTURE target
 * (react-native-view-shot, see shareCard), so the values have to live in the
 * React tree as real <Text>. Driving them from a Reanimated shared value into an
 * animated TextInput would move the work to the UI thread but risks the snapshot
 * catching a stale value — silently corrupting the one artifact users post.
 *
 * What WAS wrong: the three useCountUp hooks sat in TransformationCard itself, so
 * every one of those ~57 frames re-rendered the ENTIRE card — three
 * LinearGradients, the wordmark, the footer — while the Skia particle burst was
 * drawing 60 particles alongside it (MilestoneCelebration mounts both at once).
 *
 * Isolating each animating value into its own memo'd leaf keeps the exact same
 * capture-safe setState, but now a count-up frame re-renders one <Text> instead
 * of the whole card.
 */
const CountUpDays = memo(function CountUpDays({
  target,
  active,
}: {
  target: number;
  active: boolean;
}) {
  const days = Math.round(useCountUp(target, active));
  return (
    <>
      {days}
      <Text
        style={{
          fontFamily: FONTS.display,
          // Unit scaled ~0.26x; no lineHeight so it inherits the parent
          // run's baseline exactly.
          fontSize: 34,
          color: clean.accent,
          includeFontPadding: false,
        }}
      >
        {' '}
        {target === 1 ? 'DAY' : 'DAYS'}
      </Text>
    </>
  );
});

const CountUpMoney = memo(function CountUpMoney({
  target,
  active,
}: {
  target: number;
  active: boolean;
}) {
  return <>{fmtMoney(useCountUp(target, active))}</>;
});

const RecoveryRow = memo(function RecoveryRow({
  target,
  active,
}: {
  target: number;
  active: boolean;
}) {
  const dispPct = clampPct(useCountUp(target, active));
  return (
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
          style={{ width: `${dispPct}%`, backgroundColor: clean.accent }}
        />
      </View>
    </View>
  );
});

/**
 * The visual card. We forward a ref to the OUTER capture surface so callers (or
 * the built-in shareCard helper) can snapshot exactly this node.
 */
const TransformationCard = forwardRef<RNView, TransformationCardProps>(
  function TransformationCard({ days, moneySaved, recoveryPct, name, animate, fitContent }, ref) {
    const wholeDays = Math.max(0, Math.floor(days));
    const pct = recoveryPct === undefined ? null : clampPct(recoveryPct);
    const firstName = name?.trim().split(/\s+/)[0] || null;

    // Animate only in the celebration; static elsewhere and for share captures
    // (each leaf settles on the EXACT target). The count-up hooks now live in the
    // memo'd leaves above, so a frame re-renders one <Text>, not this whole card.
    const animateNums = !!animate;

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
          colors={['#0B0F0D', '#0E1311', '#0B0F0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        >
          {/* Electric-lime glow blooming from the top-left (capture-safe).
              `locations` is load-bearing, not decoration. The gradient axis runs
              DIAGONALLY, so the box's bottom edge is not a constant point on it:
              the lowest projection along that edge (its left corner) is t≈0.60.
              With evenly-spaced stops the glow was still ~6% opaque there when the
              360pt box hard-clipped, which drew a visible horizontal BAND straight
              across the card — on the artifact users post publicly. Landing the
              fully-transparent stop at 0.6 means every point on the bottom edge has
              already reached zero alpha before the clip. */}
          <LinearGradient
            colors={['rgba(52,211,153,0.42)', 'rgba(52,211,153,0.08)', 'rgba(52,211,153,0)']}
            locations={[0, 0.3, 0.6]}
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

            {/* Hero: the day count — HUGE Sora numeral. The unit is a NESTED Text
                run inside the numeral's Text, so the text engine itself lays both
                on ONE shared baseline ("DAYS" sits on the numeral's foot) — sibling
                flex `items-baseline` proved unreliable on iOS at mixed sizes.
                Robust at 1/2/3+ digits; caption hugs the lockup as one block. */}
            <View>
              <Text
                className="text-[11px] uppercase tracking-[5px] text-accent"
                style={{ fontFamily: FONTS.heading, color: clean.accent }}
              >
                Nicotine-free
              </Text>
              <Text
                className="mt-2 text-fg"
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 132,
                  // Tall numerals clip when lineHeight == fontSize; ~1.06x gives
                  // the glyph tops room without stranding the unit/caption.
                  lineHeight: 140,
                  color: clean.fg,
                  includeFontPadding: false,
                }}
              >
                <CountUpDays target={wholeDays} active={animateNums} />
              </Text>
              <Text
                className="mt-2 text-base text-fg"
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
                    <CountUpMoney target={moneySaved} active={animateNums} />
                  </Text>
                </View>

                {pct !== null ? (
                  <RecoveryRow target={pct} active={animateNums && pct !== null} />
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
