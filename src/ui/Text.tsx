import { Text as RNText, type TextProps } from 'react-native';
import { twMerge } from 'tailwind-merge';

/**
 * Clean Dark type ramp (design-system v2) — ONE ramp, Sora everywhere.
 * Mirrors styles.css: .hero .h1 .h2 .h3 .lead .body .eyebrow .muted.
 * Sizes/leading/tracking live in the fontSize tokens (tailwind.config.js);
 * these components only bind family + weight + color defaults.
 */

type P = TextProps & { className?: string };

const make = (base: string) => {
  // twMerge: NativeWind resolves conflicting classes by compiled insertion
  // order, NOT string position — a caller's text-accent-ink could silently
  // lose to a base text-fg-2 (ui-audit D3: unreadable gray-on-emerald chat
  // bubbles). Merging dedupes conflicts so the caller's override always wins.
  const T = ({ className = '', ...props }: P) => (
    <RNText {...props} className={twMerge(base, className)} />
  );
  T.displayName = 'Text';
  return T;
};

/** 88pt display numeral / wordmark moments. */
export const Hero = make('font-sora-bold text-hero text-fg');
/** Screen headline (30/700). */
export const H1 = make('font-sora-bold text-h1 text-fg');
/** Section headline (23/700). */
export const H2 = make('font-sora-bold text-h2 text-fg');
/** Card/row title (18/600). */
export const H3 = make('font-sora-semibold text-h3 text-fg');
/** Intro/sub copy under a headline (16/1.55, secondary). */
export const Lead = make('font-sora text-lead text-fg-2');
/** Default body copy (15/1.5, secondary). */
export const Body = make('font-sora text-body text-fg-2');
/** Small caps label (12/600, 0.13em). Pass text-accent for the lime variant. */
export const Eyebrow = make('font-sora-semibold text-eyebrow uppercase text-fg-3');
/** Muted helper text. */
export const Muted = make('font-sora text-body text-fg-3');
/** Big stat numerals — tabular, tight tracking; size set per call site. */
export const Display = make('font-sora-bold text-fg');
