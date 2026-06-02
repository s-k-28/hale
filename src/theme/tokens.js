// HALE — "Bold Momentum" design tokens · SINGLE SOURCE OF TRUTH.
//
// Every token value lives here and ONLY here. Consumed by:
//   • tailwind.config.js  → className tokens (bg-volt, text-display, px-gutter…)
//   • src/theme/colors.ts → typed runtime hexes (SVG / Skia / Rive / StatusBar)
//
// One source means the className system and the runtime palette can never drift
// (they did: `card` was #12161A in tailwind but #161B18 in colors.ts).
//
// CommonJS so tailwind.config.js (Node) can require() it. Types live in tokens.d.ts.

const palette = {
  void: '#0A0C0B', // app background (near-black)
  coal: '#12161A', // elevated surface
  card: '#12161A', // cards / surfaces
  surface2: '#161B18', // secondary / muted surface
  volt: '#C6FF3D', // electric lime accent
  voltDim: '#9FD22E', // pressed / dimmed lime
  voltInk: '#0A0C0B', // text + icon color on a lime surface
  chalk: '#F4F7F2', // primary text on dark
  ash: '#8A938C', // muted text
  line: '#1F2723', // hairline borders
  sos: '#FF5A4D', // craving / crisis red
  white: '#FFFFFF',
  inactive: '#1B201D', // solid disabled surface — NEVER lime-at-opacity (read as olive sludge)
  inactiveInk: '#5C635D', // disabled label / icon — muted but legible
};

const haleTeal = {
  50: '#e7f3ee',
  100: '#c5e3d6',
  400: '#39a37c',
  500: '#0f7a5a',
  600: '#0c624a',
  900: '#0a2f24',
};

// Tailwind / NativeWind color object (className tokens), derived from `palette`.
const tailwindColors = {
  void: palette.void,
  coal: palette.coal,
  card: palette.card,
  volt: { DEFAULT: palette.volt, dim: palette.voltDim, ink: palette.voltInk },
  chalk: palette.chalk,
  ash: palette.ash,
  line: palette.line,
  sos: palette.sos,
  inactive: { DEFAULT: palette.inactive, foreground: palette.inactiveInk },
  // shadcn / React Native Reusables semantic aliases → Bold Momentum
  background: palette.void,
  foreground: palette.chalk,
  'card-foreground': palette.chalk,
  popover: palette.coal,
  'popover-foreground': palette.chalk,
  primary: palette.volt,
  'primary-foreground': palette.voltInk,
  secondary: palette.surface2,
  'secondary-foreground': palette.chalk,
  muted: palette.surface2,
  'muted-foreground': palette.ash,
  accent: palette.line,
  'accent-foreground': palette.chalk,
  destructive: palette.sos,
  'destructive-foreground': palette.white,
  border: palette.line,
  input: palette.line,
  ring: palette.volt,
  // legacy teal kept so any un-reskinned surface stays readable during transition
  hale: haleTeal,
};

// Type ramp — [fontSize, { lineHeight }]. Six rungs + the previously-missing
// mid-tier (`title`). Anton rungs (display*) hold lineHeight ≥ ~1.12 so tall
// glyphs never clip and multi-line heroes stop cramping.
const fontSize = {
  'display-xl': ['56px', { lineHeight: '64px' }], // hero counter / "0 DAYS"
  display: ['40px', { lineHeight: '46px' }], // screen headlines (Anton)
  title: ['24px', { lineHeight: '30px' }], // NEW mid-tier (Archivo) — section titles
  heading: ['19px', { lineHeight: '26px' }], // sub-headlines
  'body-lg': ['17px', { lineHeight: '26px' }],
  body: ['15px', { lineHeight: '23px' }],
  caption: ['13px', { lineHeight: '18px' }],
  label: ['11px', { lineHeight: '14px' }], // micro-caps (tracking applied on the component)
};

// Rhythmic spacing — semantic aliases on the 4pt grid. Merged with Tailwind's
// default scale, so p-4 / gap-3 / etc. keep working.
const spacing = {
  gutter: '24px', // standard horizontal screen padding
  section: '32px', // gap between major sections
  stack: '16px', // gap within a group
  tight: '8px',
};

const radius = {
  pill: '999px',
  card: '24px',
  tile: '16px',
};

module.exports = { palette, tailwindColors, fontSize, spacing, radius, haleTeal };
