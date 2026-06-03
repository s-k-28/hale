import { Text as RNText, type TextProps } from 'react-native';

type Props = TextProps & { className?: string };

/** Bold Momentum type scale. Anton for loud hero numerals, Archivo for
 *  headings, Hanken Grotesk for body. Default color is chalk (light on dark). */

export function Display({ className = '', ...p }: Props) {
  // Huge condensed hero numbers ("14 DAYS FREE", the counter). Anton has very
  // tall caps/numerals, so a default `leading-tight` floor keeps bare usages
  // from clipping glyph tops. Callers must stay ≥ ~1.1x (leading-tight/snug) —
  // leading-none / leading-[0.9x] clips on Anton (see paywall/sos which use
  // leading-tight). A later leading-* in `className` overrides this default.
  // Small positive tracking so multi-word Anton headlines ("GO ALL IN", "THIS
  // PASSES") don't visually collide; negligible on the big numerals/counter.
  return <RNText className={`font-display text-chalk leading-tight tracking-[0.01em] ${className}`} {...p} />;
}

export function Heading({ className = '', ...p }: Props) {
  // Uppercase Archivo headings need POSITIVE tracking, not tight — negative
  // tracking made caps collide into one word ("AREYOU", "HEALSFAST"). Proportional
  // em keeps small sub-headings subtle while clearly separating big hero titles.
  return <RNText className={`font-heading uppercase tracking-[0.02em] text-chalk ${className}`} {...p} />;
}

export function Body({ className = '', ...p }: Props) {
  return <RNText className={`font-body text-chalk ${className}`} {...p} />;
}

export function Label({ className = '', ...p }: Props) {
  return (
    <RNText
      className={`font-body-semibold text-[11px] uppercase tracking-[0.18em] text-ash ${className}`}
      {...p}
    />
  );
}

/** Mid-tier between the giant Anton Display and Heading — the previously-missing
 *  rung. Archivo, sized via the `title` token (24/30). For section titles. */
export function Title({ className = '', ...p }: Props) {
  return <RNText className={`font-heading text-title text-chalk ${className}`} {...p} />;
}

/** Small supporting text. Hanken at the `caption` token (13/18), ash by default —
 *  a proper rung instead of ad-hoc text-xs so captions stop being inconsistent. */
export function Caption({ className = '', ...p }: Props) {
  return <RNText className={`font-body text-caption text-ash ${className}`} {...p} />;
}
