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
  return <RNText className={`font-display text-chalk leading-tight ${className}`} {...p} />;
}

export function Heading({ className = '', ...p }: Props) {
  return <RNText className={`font-heading uppercase tracking-tight text-chalk ${className}`} {...p} />;
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
