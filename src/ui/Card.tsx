import { View, type ViewProps } from 'react-native';

/**
 * Clean Dark card treatments (styles.css .card / .card-2 / .card-hero / .card-ink).
 * One language: surface fill, hairline ring, top inner highlight via border-t.
 * RN can't do inset box-shadows; the ring is a real 1px border and the top
 * highlight is approximated by the slightly lighter border color — visually
 * equivalent at hairline widths on dark surfaces.
 */

type P = ViewProps & { className?: string; pad?: boolean };

/** Primary card: surface, radius 22, hairline ring. `pad` → 20px padding. */
export function Card({ className = '', pad = false, ...props }: P) {
  return (
    <View
      className={`rounded-panel border border-stroke bg-surface ${pad ? 'p-5' : ''} ${className}`}
      {...props}
    />
  );
}

/** Secondary/elevated card: surface-2, radius 16. */
export function Card2({ className = '', pad = false, ...props }: P) {
  return (
    <View
      className={`rounded-tile border border-stroke bg-surface-2 ${pad ? 'p-4' : ''} ${className}`}
      {...props}
    />
  );
}

/** Focal hero card: accent hairline ring (the screen's ONE emerald element). */
export function CardHero({ className = '', pad = false, ...props }: P) {
  return (
    <View
      className={`overflow-hidden rounded-panel border border-accent-edge bg-surface ${pad ? 'p-5' : ''} ${className}`}
      {...props}
    />
  );
}

/** Ink card: darker bg-2 fill (posters, share frames). */
export function CardInk({ className = '', pad = false, ...props }: P) {
  return (
    <View
      className={`rounded-panel border border-stroke bg-bg-2 ${pad ? 'p-5' : ''} ${className}`}
      {...props}
    />
  );
}
