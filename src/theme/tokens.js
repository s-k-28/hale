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
  raised: '#1C232A', // RAISED/elevated plane — a clear step lighter than coal (focal/hero cards)
  volt: '#C6FF3D', // electric lime accent
  voltDim: '#9FD22E', // pressed / dimmed lime
  voltInk: '#0A0C0B', // text + icon color on a lime surface
  voltEdge: '#7B9E29', // darker-volt BOTTOM EDGE — the chunky "pressable key" depth
  chalk: '#F4F7F2', // primary text on dark
  ash: '#9AA39D', // muted text — bumped from #8A938C for legible secondary contrast
  line: '#2C332E', // hairline borders — bumped from #1F2723 so radios/checks/dividers read as intentional
  sos: '#FF5A4D', // craving / crisis red
  sosEdge: '#C7332A', // darker-coral bottom edge for danger buttons
  white: '#FFFFFF',
  inactive: '#21242A', // solid disabled surface — clean NEUTRAL dark grey (was #1B201D, read as olive sludge)
  inactiveInk: '#7C828A', // disabled label / icon — neutral + legible (was #5C635D)
};

const haleTeal = {
  50: '#e7f3ee',
  100: '#c5e3d6',
  400: '#39a37c',
  500: '#0f7a5a',
  600: '#0c624a',
  900: '#0a2f24',
};

// ─────────────────────────────────────────────────────────────────────────────
// "Clean Dark" (design-system v2, 2026-06-10) — the REPLACEMENT system.
// Source of truth: the approved design bundle's styles.css (:root). During the
// screen-by-screen migration these coexist with Bold Momentum above; the purge
// phase deletes the old palette, at which point these are the only tokens.
// Discipline (locked in the design chat): ONE emerald accent — one focal element
// + one primary CTA per screen; coral is SOS/danger ONLY; warm amber is
// buddy/"together"/referral ONLY.
// ─────────────────────────────────────────────────────────────────────────────
const cleanDark = {
  bg: '#0B0F0D', // app base — premium dark, never pure black
  bg2: '#0E1311',
  surface: '#151B18', // card
  surface2: '#1C2420', // elevated / input
  surface3: '#25302A', // pressed / hover
  stroke: 'rgba(255,255,255,0.07)', // hairline borders
  stroke2: 'rgba(255,255,255,0.13)',
  hi: 'rgba(255,255,255,0.04)', // top inner highlight on cards
  fg: '#EAF1EC', // primary text
  fg2: '#97A39B', // secondary
  fg3: '#616B64', // muted / labels
  fg4: '#424A45',
  accent: '#34D399', // THE focal emerald
  accent2: '#5EE3B0',
  accentDeep: '#1FA577',
  accentInk: '#052B1E', // text on accent
  accentSoft: 'rgba(52,211,153,0.12)',
  accentEdge: 'rgba(52,211,153,0.26)', // accent hairline ring
  accentGlow: 'rgba(52,211,153,0.35)',
  warm: '#F2B95C', // buddy / together / referral moments ONLY
  warmSoft: 'rgba(242,185,92,0.12)',
  warmEdge: 'rgba(242,185,92,0.28)',
  coral: '#FF6B5C', // SOS / relapse ONLY
  coralSoft: 'rgba(255,107,92,0.12)',
  coralEdge: 'rgba(255,107,92,0.30)',
  coralInk: '#2A0B07', // text on a coral button
  warmInk: '#2B1E07', // text on a warm button
  track: 'rgba(255,255,255,0.08)', // progress-bar trough
};

// Tailwind / NativeWind color object (className tokens), derived from `palette`.
const tailwindColors = {
  void: palette.void,
  coal: palette.coal,
  card: palette.card,
  raised: palette.raised,
  volt: { DEFAULT: palette.volt, dim: palette.voltDim, ink: palette.voltInk, edge: palette.voltEdge },
  chalk: palette.chalk,
  ash: palette.ash,
  line: palette.line,
  sos: { DEFAULT: palette.sos, edge: palette.sosEdge },
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

  // ── Clean Dark className tokens (v2) — all keys collision-free vs the old set ──
  bg: { DEFAULT: cleanDark.bg, 2: cleanDark.bg2 },
  surface: { DEFAULT: cleanDark.surface, 2: cleanDark.surface2, 3: cleanDark.surface3 },
  stroke: { DEFAULT: cleanDark.stroke, 2: cleanDark.stroke2 },
  hi: cleanDark.hi,
  fg: { DEFAULT: cleanDark.fg, 2: cleanDark.fg2, 3: cleanDark.fg3, 4: cleanDark.fg4 },
  accent: {
    DEFAULT: cleanDark.accent,
    2: cleanDark.accent2,
    deep: cleanDark.accentDeep,
    ink: cleanDark.accentInk,
    soft: cleanDark.accentSoft,
    edge: cleanDark.accentEdge,
    glow: cleanDark.accentGlow,
  },
  warm: { DEFAULT: cleanDark.warm, soft: cleanDark.warmSoft, edge: cleanDark.warmEdge, ink: cleanDark.warmInk },
  coral: { DEFAULT: cleanDark.coral, soft: cleanDark.coralSoft, edge: cleanDark.coralEdge, ink: cleanDark.coralInk },
  track: cleanDark.track,
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
  body: ['15px', { lineHeight: '23px' }], // SHARED: old body 15/23 == Clean Dark body 15/1.5
  caption: ['13px', { lineHeight: '18px' }],
  label: ['11px', { lineHeight: '14px' }], // micro-caps (tracking applied on the component)

  // ── Clean Dark type ramp (v2, from styles.css) — Sora everywhere ──
  hero: ['88px', { lineHeight: '81px', letterSpacing: '-2.6px' }], // 0.92lh, -0.03em
  h1: ['30px', { lineHeight: '33px', letterSpacing: '-0.75px' }],
  h2: ['23px', { lineHeight: '26px', letterSpacing: '-0.46px' }],
  h3: ['18px', { lineHeight: '23px', letterSpacing: '-0.18px' }],
  lead: ['16px', { lineHeight: '25px' }],
  eyebrow: ['12px', { lineHeight: '16px', letterSpacing: '1.56px' }], // 0.13em caps
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
  pill: '999px', // SHARED by both systems
  card: '24px', // OLD (Bold Momentum) — Clean Dark cards use `panel` (22)
  tile: '16px', // SHARED: old tile == Clean Dark r-lg (16)
  // ── Clean Dark radii (v2) ──
  panel: '22px', // r-card
  inset: '9px', // r-sm
  xl2: '26px', // r-xl (sheets)
  // 12px (r-md) == Tailwind's default `rounded-xl` — no custom key needed
};

module.exports = { palette, cleanDark, tailwindColors, fontSize, spacing, radius, haleTeal };
